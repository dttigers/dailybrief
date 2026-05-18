// ── Phase 130 Plan 03 (VOICE-06 / D8 round-trip) ──────────────────────────
// Wave 0 RED. End-to-end integration test that proves the full SSE fan-out
// path from POST /v1/voice/transcribe → bus.emitThoughtCreated →
// /v1/agent-stream multiplexes a `thought-created` SSE frame within 500 ms.
//
// Until Plan 03 ships the on/off triple on agent-events-bus.ts and extends
// agent-stream.ts with a `thoughtCreatedListener`, the test is RED because:
//   - bus.onThoughtCreated / bus.offThoughtCreated do not exist (Map entry
//     cleanup gate is also still two-channel)
//   - agent-stream.ts does NOT subscribe to the THOUGHT_CREATED_NAME channel
//     → no SSE frame written; the 500 ms timeout fires.
//
// Mocks:
//   - OpenAI transcribeWavFn returns { text: "hello world", durationMs: 1000 }
//   - db is the same in-memory mock as voice-transcribe.test.ts
//   - bus is the REAL `agent-events-bus` singleton (cross-route fan-out is
//     load-bearing — a fake-bus per route would defeat the integration test)
//
// Pattern source: agent-stream.test.ts:118-156 (readFrames + parseFrame).
//
// CRITICAL HARNESS DETAIL: we MUST cancel the SSE reader after asserting on
// the thought-created frame, otherwise the streamSSE handler's hold-open
// Promise (agent-stream.ts:191-194) never resolves and node:test hangs.

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

const { createVoiceTranscribeRoute } = await import("../voice-transcribe.js");
const { createAgentStreamRoute } = await import("../agent-stream.js");
const { bus } = await import("../../lib/agent-events-bus.js");

// ── SSE frame helpers (mirror agent-stream.test.ts) ───────────────────────

async function readFrames(
  res: Response,
  n: number,
  timeoutMs = 1000,
): Promise<string[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const frames: string[] = [];
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (frames.length < n && Date.now() < deadline) {
      const remaining = Math.max(0, deadline - Date.now());
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((r) =>
          setTimeout(() => r({ done: true, value: undefined }), remaining),
        ),
      ]);
      if (result.done) break;
      buf += decoder.decode(result.value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0 && frames.length < n) {
        frames.push(buf.slice(0, idx));
        buf = buf.slice(idx + 2);
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
  return frames;
}

function parseFrame(raw: string): { event?: string; data?: string; id?: string } {
  const out: { event?: string; data?: string; id?: string } = {};
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) out.event = line.slice(6).trim();
    else if (line.startsWith("data:")) out.data = (out.data ?? "") + line.slice(5).trim();
    else if (line.startsWith("id:")) out.id = line.slice(3).trim();
  }
  return out;
}

// ── Mock db (mirrors voice-transcribe.test.ts shape) ──────────────────────

interface MockCaptures {
  insertThoughtValues: Record<string, unknown> | null;
  insertVoiceCaptureValues: Record<string, unknown> | null;
  thoughtRowId: number | null;
}

function makeMockDb(captures: MockCaptures, insertedThoughtId: number): unknown {
  let selectCallCount = 0;
  return {
    select: () => ({
      from: (_table: unknown) => {
        selectCallCount++;
        return {
          where: (_w: unknown) => ({
            limit: (_n: number) => {
              // First select = voice_captures dedup (empty); subsequent =
              // thoughts lookup on dedup hit (also empty in this test).
              void selectCallCount;
              return Promise.resolve([]);
            },
          }),
        };
      },
    }),
    insert: (_table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if ("clientCaptureId" in vals && "thoughtId" in vals) {
          captures.insertVoiceCaptureValues = vals;
          return Promise.resolve();
        }
        captures.insertThoughtValues = vals;
        captures.thoughtRowId = insertedThoughtId;
        return {
          returning: () =>
            Promise.resolve([
              {
                id: insertedThoughtId,
                content: vals.content as string,
                source: vals.source as string,
                userId: vals.userId as number,
              },
            ]),
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (_v: unknown) => ({
        where: (_w: unknown) => Promise.resolve(),
      }),
    }),
  };
}

// Build the combined app with BOTH routes mounted on the same Hono instance,
// sharing the real `bus` singleton. Mirrors production index.ts mount shape.
function makeApp(userId: number, captures: MockCaptures, insertedThoughtId: number): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  // Mount agent-stream — uses real `bus` for fan-out, mock db for replay.
  app.route(
    "/v1",
    createAgentStreamRoute({
      dbAvailable: true,
      bus,
      dbReplayMissed: async () => [],
      dbGetQuietMode: async () => ({ enabled: false, since: null }),
    }),
  );
  // Mount voice-transcribe — uses real `bus`, mock db, mock transcribeWav.
  app.route(
    "/v1",
    createVoiceTranscribeRoute({
      db: makeMockDb(captures, insertedThoughtId) as never,
      dbAvailable: true,
      requireAiBudgetFn: async () => {},
      transcribeWavFn: async () => ({
        text: "hello world",
        durationMs: 1000,
      }),
      runTriageFn: () => {},
      bus,
    }),
  );
  return app;
}

// ── D8 ROUND-TRIP TEST ─────────────────────────────────────────────────────

test("D8/SSE-1: POST /v1/voice/transcribe → bus.emitThoughtCreated → /v1/agent-stream emits thought-created SSE frame within 500 ms", async () => {
  const userId = 7777;
  const insertedThoughtId = 12345;
  const captures: MockCaptures = {
    insertThoughtValues: null,
    insertVoiceCaptureValues: null,
    thoughtRowId: null,
  };
  const app = makeApp(userId, captures, insertedThoughtId);

  // 1. Open SSE stream for this userId.
  const sseRes = await app.request("/v1/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  assert.equal(sseRes.status, 200, "SSE response opens with 200");

  // 2. Microtask drain so the agent-stream listeners attach to bus BEFORE
  //    voice-transcribe fires the emit. Without this, the emit lands before
  //    onThoughtCreated registers and the frame is lost.
  await new Promise((r) => setTimeout(r, 30));

  // 3. POST voice transcribe (kicks off emitThoughtCreated after db inserts).
  const t0 = Date.now();
  const postRes = await app.request("/v1/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: Buffer.from("RIFFxxxxWAVEfmt placeholder-pcm-bytes-for-1s").toString("base64"),
      clientCaptureId: "d8-round-trip-test-uuid",
    }),
  });

  // 4. Assert HTTP 201 with expected body.
  assert.equal(postRes.status, 201, "POST returns 201 Created");
  const postBody = (await postRes.json()) as { thoughtId: number; content: string };
  assert.equal(postBody.thoughtId, insertedThoughtId);
  assert.equal(postBody.content, "hello world");

  // 5. Read SSE frames within 500 ms. Phase 0 always emits a
  //    quiet_mode_changed frame first; we read 2 frames total and filter to
  //    find the thought-created one.
  const frames = await readFrames(sseRes, 2, 500);
  const t1 = Date.now();
  const elapsed = t1 - t0;

  const parsed = frames.map(parseFrame);
  const thoughtFrame = parsed.find((f) => f.event === "thought-created");

  assert.ok(
    thoughtFrame,
    `expected thought-created SSE frame within 500 ms; got frames: ${JSON.stringify(parsed)}`,
  );
  assert.ok(elapsed < 500, `round-trip elapsed ${elapsed} ms (must be < 500 ms)`);

  // 6. Assert frame data shape — { thoughtId, content }.
  assert.ok(thoughtFrame.data, "thought-created frame has data payload");
  const payload = JSON.parse(thoughtFrame.data!) as { thoughtId: number; content: string };
  assert.equal(payload.thoughtId, insertedThoughtId);
  assert.equal(payload.content, "hello world");

  // 7. Assert DB inserts happened with correct shape.
  assert.ok(captures.insertThoughtValues, "thoughts INSERT VALUES captured");
  assert.equal(captures.insertThoughtValues!.source, "g2_voice");
  assert.equal(captures.insertThoughtValues!.userId, userId);
  assert.equal(captures.insertThoughtValues!.content, "hello world");

  assert.ok(captures.insertVoiceCaptureValues, "voice_captures INSERT VALUES captured");
  assert.equal(captures.insertVoiceCaptureValues!.userId, userId);
  assert.equal(captures.insertVoiceCaptureValues!.clientCaptureId, "d8-round-trip-test-uuid");
  assert.equal(captures.insertVoiceCaptureValues!.thoughtId, insertedThoughtId);
});

test("D8/SSE-2: cross-user isolation — userA's voice transcribe does NOT fire userB's SSE thought-created frame", async () => {
  const userIdA = 7001;
  const userIdB = 7002;
  const insertedThoughtId = 999;
  const captures: MockCaptures = {
    insertThoughtValues: null,
    insertVoiceCaptureValues: null,
    thoughtRowId: null,
  };

  // Build TWO separate Hono apps with two userIds. Both share the same
  // singleton `bus` — per-userId isolation is enforced by the emitter Map.
  function makeAppForUser(userId: number): Hono {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("userId", userId);
      await next();
    });
    app.route(
      "/v1",
      createAgentStreamRoute({
        dbAvailable: true,
        bus,
        dbReplayMissed: async () => [],
        dbGetQuietMode: async () => ({ enabled: false, since: null }),
      }),
    );
    app.route(
      "/v1",
      createVoiceTranscribeRoute({
        db: makeMockDb(captures, insertedThoughtId) as never,
        dbAvailable: true,
        requireAiBudgetFn: async () => {},
        transcribeWavFn: async () => ({ text: "isolation-test", durationMs: 500 }),
        runTriageFn: () => {},
        bus,
      }),
    );
    return app;
  }

  const appA = makeAppForUser(userIdA);
  const appB = makeAppForUser(userIdB);

  // Open SSE streams for both users.
  const resA = await appA.request("/v1/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  const resB = await appB.request("/v1/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  // Drain to let both listeners attach.
  await new Promise((r) => setTimeout(r, 30));

  // POST voice transcribe ONLY for userB.
  await appB.request("/v1/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: Buffer.from("RIFFxxxxWAVEfmt iso-test").toString("base64"),
      clientCaptureId: "iso-test-userB",
    }),
  });

  // Read frames for both streams. UserA must NOT see thought-created;
  // userB must.
  const framesA = await readFrames(resA, 2, 400);
  const framesB = await readFrames(resB, 2, 400);

  const thoughtA = framesA.map(parseFrame).find((f) => f.event === "thought-created");
  const thoughtB = framesB.map(parseFrame).find((f) => f.event === "thought-created");

  assert.equal(
    thoughtA,
    undefined,
    "userA SSE stream received ZERO thought-created frames from userB emit (cross-user isolation)",
  );
  assert.ok(thoughtB, "userB SSE stream received the thought-created frame");
});
