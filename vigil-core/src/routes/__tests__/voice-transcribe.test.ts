// ── Phase 130 Plan 02 (VOICE-05) — voice-transcribe route tests ───────────
// Unit tests for POST /v1/voice/transcribe. Uses node:test runner (vigil-core
// convention; matches captures-screenshot.test.ts). Mock-db captures the
// fluent chain (select/from/where/limit, insert/values/returning) and a mock
// transcribeWav override exercises the three error branches without touching
// the OpenAI SDK.
//
// Wave 0: tests RED before Task 2/3 ship production code. The imports of
// `voice-transcribe`, `voice-errors`, and `voiceCaptures` schema export
// intentionally fail until those modules land.

// JWT_SECRET BEFORE importing — utils/jwt.ts exits at import time without it
// (per index.ts:73-76 and the captures-screenshot.test.ts pattern at line 11).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Lazy imports after env is set (safety net for transitive jwt imports).
const { createVoiceTranscribeRoute } = await import("../voice-transcribe.js");
const {
  VoiceTranscribeTimeoutError,
  VoiceTranscribeProviderDownError,
  VoiceTranscribeQuotaError,
} = await import("../voice-errors.js");
const { DailyBudgetExceededError } = await import("../../lib/ai-budget.js");
const { AudioSessionTooLongError, MAX_AUDIO_B64_CHARS_60S } = await import(
  "../../lib/audio-cap.js"
);

// ── Fixtures ───────────────────────────────────────────────────────────────

const VALID_CAPTURE_ID = "voice-capture-uuid-001";
// 32 bytes — well under the 60s cap. Real WAV would have a 44-byte header but
// the route operates on the base64 string, then the buffer is handed off to
// the mock transcribeWav, which doesn't care about the bytes.
const VALID_BASE64_WAV = Buffer.from("RIFFxxxxWAVEfmt placeholder-pcm-bytes").toString(
  "base64",
);

interface MockCaptures {
  selectVoiceCalls: number;
  selectThoughtCalls: number;
  insertThoughtValues: Record<string, unknown> | null;
  insertVoiceCaptureValues: Record<string, unknown> | null;
  transcribeCalls: number;
  thoughtRowId: number | null;
}

interface MockDbOpts {
  voiceCaptureRows?: Array<Record<string, unknown>>;
  thoughtRowsForLookup?: Array<Record<string, unknown>>;
  insertedThoughtId?: number;
}

function makeCaptures(): MockCaptures {
  return {
    selectVoiceCalls: 0,
    selectThoughtCalls: 0,
    insertThoughtValues: null,
    insertVoiceCaptureValues: null,
    transcribeCalls: 0,
    thoughtRowId: null,
  };
}

function makeMockDb(opts: MockDbOpts, captures: MockCaptures): unknown {
  let selectCallCount = 0;
  const insertedThoughtId = opts.insertedThoughtId ?? 42;
  return {
    select: () => ({
      from: (table: unknown) => {
        // First .select() in route is voiceCaptures dedup check; second
        // .select() is the thoughts row lookup on a dedup hit.
        selectCallCount++;
        const isVoiceQuery = selectCallCount === 1;
        if (isVoiceQuery) captures.selectVoiceCalls++;
        else captures.selectThoughtCalls++;
        void table;
        return {
          where: (_w: unknown) => ({
            limit: (_n: number) => {
              if (isVoiceQuery) {
                return Promise.resolve(opts.voiceCaptureRows ?? []);
              }
              return Promise.resolve(opts.thoughtRowsForLookup ?? []);
            },
          }),
        };
      },
    }),
    insert: (_table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        // Distinguish inserts by columns present.
        if ("clientCaptureId" in vals && "thoughtId" in vals) {
          captures.insertVoiceCaptureValues = vals;
          return Promise.resolve();
        }
        // thoughts insert
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

// Mock bus — accepts emitThoughtCreated call site without listener wiring
// (Plan 03 wires the listener triple).
function makeMockBus(): {
  emitThoughtCreatedCalls: Array<{ userId: number; payload: unknown }>;
  emitThoughtCreated: (userId: number, payload: unknown) => void;
} {
  const calls: Array<{ userId: number; payload: unknown }> = [];
  return {
    emitThoughtCreatedCalls: calls,
    emitThoughtCreated(userId: number, payload: unknown) {
      calls.push({ userId, payload });
    },
  };
}

// Build a Hono app that injects userId via middleware (mirrors bearerAuth
// dispatcher in production) before routing to the factory router.
function makeApp(
  deps: Parameters<typeof createVoiceTranscribeRoute>[0],
  userId: number = 1,
): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/v1", createVoiceTranscribeRoute(deps));
  // Mirror production app.onError translation table (index.ts).
  app.onError((err, c) => {
    if (err instanceof DailyBudgetExceededError) {
      return c.json(
        { error: err.message, code: err.code },
        429,
      );
    }
    if (err instanceof AudioSessionTooLongError) {
      return c.json({ error: err.message, code: err.code }, 413);
    }
    if (err instanceof VoiceTranscribeTimeoutError) {
      return c.json({ error: err.message, code: err.code }, 504);
    }
    if (err instanceof VoiceTranscribeProviderDownError) {
      return c.json({ error: err.message, code: err.code }, 502);
    }
    if (err instanceof VoiceTranscribeQuotaError) {
      return c.json({ error: err.message, code: err.code }, 503);
    }
    return c.json({ error: "Internal error" }, 500);
  });
  return app;
}

async function postTranscribe(app: Hono, body: unknown): Promise<Response> {
  return app.request("/v1/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("VOICE-05/T1 (happy path): POST with valid base64 WAV + clientCaptureId → 201 with thoughtId + content; thought + voice_captures inserted", async () => {
  const captures = makeCaptures();
  const bus = makeMockBus();

  const app = makeApp({
    db: makeMockDb({ voiceCaptureRows: [], insertedThoughtId: 100 }, captures) as never,
    dbAvailable: true,
    requireAiBudgetFn: async () => {},
    transcribeWavFn: async (wav: Buffer) => {
      captures.transcribeCalls++;
      void wav;
      return { text: "this is a transcribed thought", durationMs: 2000 };
    },
    runTriageFn: () => {},
    bus: bus as never,
  });

  const res = await postTranscribe(app, {
    audio: VALID_BASE64_WAV,
    clientCaptureId: VALID_CAPTURE_ID,
  });

  assert.equal(res.status, 201);
  const body = (await res.json()) as { thoughtId: number; content: string };
  assert.equal(body.thoughtId, 100);
  assert.equal(body.content, "this is a transcribed thought");

  // Assert thought row inserted with source = 'g2_voice'
  assert.ok(captures.insertThoughtValues, "thoughts INSERT VALUES captured");
  assert.equal(captures.insertThoughtValues!.source, "g2_voice");
  assert.equal(captures.insertThoughtValues!.userId, 1, "userId from middleware, not body");
  assert.equal(captures.insertThoughtValues!.content, "this is a transcribed thought");

  // Assert voice_captures row inserted
  assert.ok(captures.insertVoiceCaptureValues, "voice_captures INSERT VALUES captured");
  assert.equal(captures.insertVoiceCaptureValues!.userId, 1);
  assert.equal(captures.insertVoiceCaptureValues!.clientCaptureId, VALID_CAPTURE_ID);
  assert.equal(captures.insertVoiceCaptureValues!.thoughtId, 100);

  // Transcribe was called exactly once
  assert.equal(captures.transcribeCalls, 1, "transcribeWav called exactly once");

  // Bus emit fired AFTER DB commit (Pitfall 6)
  assert.equal(bus.emitThoughtCreatedCalls.length, 1);
  assert.deepEqual(bus.emitThoughtCreatedCalls[0]!.payload, {
    thoughtId: 100,
    content: "this is a transcribed thought",
  });
});

test("VOICE-05/T2 (dedup hit): second POST with same clientCaptureId → 200 with same thoughtId; OpenAI mock called only ONCE total", async () => {
  const captures = makeCaptures();
  const bus = makeMockBus();

  // Mock returns an existing voice_captures row for the dedup query, plus a
  // thoughts row for the lookup.
  const existingVoiceCaptureRow = {
    id: 7,
    userId: 1,
    thoughtId: 55,
    clientCaptureId: VALID_CAPTURE_ID,
  };
  const existingThoughtRow = {
    id: 55,
    content: "previously transcribed thought",
    userId: 1,
    source: "g2_voice",
  };

  const app = makeApp({
    db: makeMockDb(
      {
        voiceCaptureRows: [existingVoiceCaptureRow],
        thoughtRowsForLookup: [existingThoughtRow],
      },
      captures,
    ) as never,
    dbAvailable: true,
    requireAiBudgetFn: async () => {},
    transcribeWavFn: async () => {
      captures.transcribeCalls++;
      throw new Error("should not be called on dedup hit");
    },
    runTriageFn: () => {},
    bus: bus as never,
  });

  const res = await postTranscribe(app, {
    audio: VALID_BASE64_WAV,
    clientCaptureId: VALID_CAPTURE_ID,
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { thoughtId: number; content: string };
  assert.equal(body.thoughtId, 55, "same thoughtId returned");
  assert.equal(body.content, "previously transcribed thought");

  assert.equal(captures.transcribeCalls, 0, "OpenAI NOT called on dedup hit");
  assert.equal(captures.insertThoughtValues, null, "thoughts INSERT NOT called on dedup hit");
  assert.equal(
    captures.insertVoiceCaptureValues,
    null,
    "voice_captures INSERT NOT called on dedup hit",
  );
});

test("VOICE-05/T3 (OpenAI timeout): transcribeWav throws VoiceTranscribeTimeoutError → 504 with code", async () => {
  const captures = makeCaptures();
  const bus = makeMockBus();

  const app = makeApp({
    db: makeMockDb({ voiceCaptureRows: [] }, captures) as never,
    dbAvailable: true,
    requireAiBudgetFn: async () => {},
    transcribeWavFn: async () => {
      captures.transcribeCalls++;
      throw new VoiceTranscribeTimeoutError();
    },
    runTriageFn: () => {},
    bus: bus as never,
  });

  const res = await postTranscribe(app, {
    audio: VALID_BASE64_WAV,
    clientCaptureId: VALID_CAPTURE_ID,
  });

  assert.equal(res.status, 504);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VOICE_TRANSCRIBE_TIMEOUT");
  assert.equal(captures.insertThoughtValues, null, "no thought inserted on timeout");
});

test("VOICE-05/T4 (OpenAI provider down): transcribeWav throws VoiceTranscribeProviderDownError → 502 with code", async () => {
  const captures = makeCaptures();
  const bus = makeMockBus();

  const app = makeApp({
    db: makeMockDb({ voiceCaptureRows: [] }, captures) as never,
    dbAvailable: true,
    requireAiBudgetFn: async () => {},
    transcribeWavFn: async () => {
      captures.transcribeCalls++;
      throw new VoiceTranscribeProviderDownError();
    },
    runTriageFn: () => {},
    bus: bus as never,
  });

  const res = await postTranscribe(app, {
    audio: VALID_BASE64_WAV,
    clientCaptureId: VALID_CAPTURE_ID,
  });

  assert.equal(res.status, 502);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VOICE_TRANSCRIBE_PROVIDER_DOWN");
  assert.equal(captures.insertThoughtValues, null);
});

test("VOICE-05/T5 (OpenAI quota): transcribeWav throws VoiceTranscribeQuotaError → 503 with code", async () => {
  const captures = makeCaptures();
  const bus = makeMockBus();

  const app = makeApp({
    db: makeMockDb({ voiceCaptureRows: [] }, captures) as never,
    dbAvailable: true,
    requireAiBudgetFn: async () => {},
    transcribeWavFn: async () => {
      captures.transcribeCalls++;
      throw new VoiceTranscribeQuotaError();
    },
    runTriageFn: () => {},
    bus: bus as never,
  });

  const res = await postTranscribe(app, {
    audio: VALID_BASE64_WAV,
    clientCaptureId: VALID_CAPTURE_ID,
  });

  assert.equal(res.status, 503);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VOICE_TRANSCRIBE_QUOTA");
  assert.equal(captures.insertThoughtValues, null);
});

test("VOICE-05/T6 (daily AI budget exceeded): requireAiBudget throws DailyBudgetExceededError → 429; OpenAI NEVER called", async () => {
  const captures = makeCaptures();
  const bus = makeMockBus();

  const app = makeApp({
    db: makeMockDb({ voiceCaptureRows: [] }, captures) as never,
    dbAvailable: true,
    requireAiBudgetFn: async (userId: number) => {
      throw new DailyBudgetExceededError(userId, 0.55);
    },
    transcribeWavFn: async () => {
      captures.transcribeCalls++;
      throw new Error("should not be called when budget exceeded");
    },
    runTriageFn: () => {},
    bus: bus as never,
  });

  const res = await postTranscribe(app, {
    audio: VALID_BASE64_WAV,
    clientCaptureId: VALID_CAPTURE_ID,
  });

  assert.equal(res.status, 429);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "DAILY_AI_BUDGET_EXCEEDED");
  assert.equal(captures.transcribeCalls, 0, "OpenAI NEVER called when budget exceeded");
});

test("VOICE-05/T7 (audio session too long): body.audio exceeds MAX_AUDIO_B64_CHARS_60S → 413; OpenAI NEVER called", async () => {
  const captures = makeCaptures();
  const bus = makeMockBus();

  const app = makeApp({
    db: makeMockDb({ voiceCaptureRows: [] }, captures) as never,
    dbAvailable: true,
    requireAiBudgetFn: async () => {},
    transcribeWavFn: async () => {
      captures.transcribeCalls++;
      throw new Error("should not be called when audio too long");
    },
    runTriageFn: () => {},
    bus: bus as never,
  });

  // One byte over the cap
  const oversize = "A".repeat(MAX_AUDIO_B64_CHARS_60S + 1);
  const res = await postTranscribe(app, {
    audio: oversize,
    clientCaptureId: VALID_CAPTURE_ID,
  });

  assert.equal(res.status, 413);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "AUDIO_SESSION_TOO_LONG");
  assert.equal(captures.transcribeCalls, 0, "OpenAI NEVER called when audio too long");
});

test("VOICE-05/T8 (missing clientCaptureId): POST without clientCaptureId → 400", async () => {
  const captures = makeCaptures();
  const bus = makeMockBus();

  const app = makeApp({
    db: makeMockDb({ voiceCaptureRows: [] }, captures) as never,
    dbAvailable: true,
    requireAiBudgetFn: async () => {},
    transcribeWavFn: async () => {
      throw new Error("should not be called");
    },
    runTriageFn: () => {},
    bus: bus as never,
  });

  const res = await postTranscribe(app, { audio: VALID_BASE64_WAV });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /audio and clientCaptureId are required|clientCaptureId/);
});

test("VOICE-05/T9 (no bearer / middleware not setting userId): middleware-driven — emulate by NOT setting userId; expect handler to read undefined and not crash", async () => {
  // Production: bearerAuth middleware sets userId; without it, c.get("userId")
  // is undefined. Verify the route does NOT crash with a 5xx when userId is
  // undefined — instead, the production middleware would have rejected
  // before reaching the route. Here we directly test that, when the test
  // harness omits the middleware injection, the route still returns a
  // structured response (not an uncaught exception 500).
  const captures = makeCaptures();
  const bus = makeMockBus();

  const app = new Hono();
  // Note: NO middleware injecting userId
  app.route(
    "/v1",
    createVoiceTranscribeRoute({
      db: makeMockDb({ voiceCaptureRows: [] }, captures) as never,
      dbAvailable: true,
      requireAiBudgetFn: async () => {},
      transcribeWavFn: async () => ({
        text: "x",
        durationMs: 1000,
      }),
      runTriageFn: () => {},
      bus: bus as never,
    }),
  );

  const res = await app.request("/v1/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: VALID_BASE64_WAV,
      clientCaptureId: VALID_CAPTURE_ID,
    }),
  });

  // In production, bearerAuth would have returned 401 BEFORE this route
  // executes. With the middleware bypassed in tests, the route may proceed
  // with userId === undefined and either: (a) return 401-style guard, or
  // (b) reach AI budget which throws / drops through. Accept ANY non-5xx
  // structured response as proof the route did not crash with an unhandled
  // exception. Specifically: the response code MUST be 4xx (handler-level
  // validation) — not 5xx (server error).
  assert.ok(
    res.status >= 400 && res.status < 500,
    `expected 4xx (auth/validation) when userId missing; got ${res.status}`,
  );
});
