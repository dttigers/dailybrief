// Phase 124 / Plan 03 — agent-stream.ts integration tests.
//
// JWT_SECRET preamble — defensive even though agent-stream.ts has no JWT
// imports. Mirrors agent-events.test.ts:1-5 self-contained copy-paste safety.
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import type { DrizzleAgentEvent } from "../../db/types.js";

// Lazy import after env is set.
const { createAgentStreamRoute } = await import("../agent-stream.js");

// ── Helpers ────────────────────────────────────────────────────────────────

type Row = DrizzleAgentEvent;

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    userId: 1,
    sessionId: "claude-test-001",
    event: "heartbeat",
    message: "test",
    label: "test-label",
    host: "test-host",
    exitCode: null,
    eventTimestamp: new Date("2026-05-09T12:00:00Z"),
    receivedAt: new Date("2026-05-09T12:00:01Z"),
    clientEventId: "uuid-test-001",
    ...overrides,
  };
}

function makeFakeBus() {
  const listeners = new Map<number, Set<(row: Row) => void>>();
  return {
    on(userId: number, fn: (r: Row) => void) {
      const s = listeners.get(userId) ?? new Set();
      s.add(fn);
      listeners.set(userId, s);
    },
    off(userId: number, fn: (r: Row) => void) {
      listeners.get(userId)?.delete(fn);
      if (listeners.get(userId)?.size === 0) listeners.delete(userId);
    },
    emit(userId: number, row: Row) {
      listeners.get(userId)?.forEach((fn) => fn(row));
    },
    listenerCount(userId: number) {
      return listeners.get(userId)?.size ?? 0;
    },
  };
}

type FakeBus = ReturnType<typeof makeFakeBus>;

function makeApp(opts: {
  userId: number;
  bus: FakeBus;
  replay?: Row[];
  captureReplay?: (args: { userId: number; afterId: number; cutoff: Date }) => void;
}): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", opts.userId);
    await next();
  });
  app.route(
    "/",
    createAgentStreamRoute({
      dbAvailable: true,
      bus: opts.bus,
      dbReplayMissed: async (uid, afterId, cutoff) => {
        opts.captureReplay?.({ userId: uid, afterId, cutoff });
        return opts.replay ?? [];
      },
    }),
  );
  return app;
}

// Read up to N "agent-event"/"ping" frames OR until timeout. Always cancels
// the reader before returning — load-bearing: without this the streamSSE
// handler's `await new Promise(r => stream.onAbort(r))` never resolves and
// node:test hangs.
async function readFrames(
  res: Response,
  n: number,
  timeoutMs = 500,
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
    // CRITICAL: cancel the reader to trigger stream.onAbort on the server
    // side; otherwise the handler's hold-open Promise never resolves and
    // the test hangs.
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

// ── Tests ──────────────────────────────────────────────────────────────────

test("T1: no Last-Event-ID → no replay; live frame delivered on emit", async () => {
  let replayCalled = 0;
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    replay: [makeRow({ id: 99 })],
    captureReplay: () => {
      replayCalled++;
    },
  });
  // Issue request (returns immediately with streaming Response body).
  const res = await app.request("/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  // Microtask drain so listener attaches before emit.
  await new Promise((r) => setTimeout(r, 20));
  bus.emit(1, makeRow({ id: 100, message: "live-1" }));
  const frames = await readFrames(res, 1, 300);
  const parsed = frames.map(parseFrame).filter((f) => f.event === "agent-event");
  assert.equal(parsed.length, 1, "exactly 1 live agent-event frame");
  assert.equal(parsed[0]!.id, "100");
  assert.equal(replayCalled, 0, "dbReplayMissed NOT called when no Last-Event-ID");
  // Sanity: id 99 (replay candidate) should NOT have been emitted.
  assert.notEqual(parsed[0]!.id, "99");
});

test("T2: Last-Event-ID: 5 → dbReplayMissed called with (1, 5, cutoff); rows replayed in id ASC", async () => {
  let captured: { userId: number; afterId: number; cutoff: Date } | null = null;
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    replay: [
      makeRow({ id: 6, event: "heartbeat" }),
      makeRow({ id: 7, event: "milestone" }),
    ],
    captureReplay: (args) => {
      captured = args;
    },
  });
  const res = await app.request("/agent-stream", {
    headers: { "Last-Event-ID": "5", Accept: "text/event-stream" },
  });
  const frames = await readFrames(res, 2, 500);
  const parsed = frames.map(parseFrame).filter((f) => f.event === "agent-event");
  assert.deepEqual(
    parsed.map((f) => f.id),
    ["6", "7"],
    "replay frames in id ASC order",
  );
  assert.ok(captured, "dbReplayMissed was called");
  // TS narrows `captured` to `never` inside the assert.ok branch because the
  // assignment happens inside an async closure it can't see — explicit cast.
  const cap = captured as { userId: number; afterId: number; cutoff: Date };
  assert.equal(cap.userId, 1);
  assert.equal(cap.afterId, 5);
});

test("T3: Last-Event-ID: -1 → dbReplayMissed NOT called (defensive parse)", async () => {
  let called = 0;
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    replay: [makeRow({ id: 1 })],
    captureReplay: () => {
      called++;
    },
  });
  const res = await app.request("/agent-stream", {
    headers: { "Last-Event-ID": "-1", Accept: "text/event-stream" },
  });
  // Drain a tick so the handler's replay phase (if it ran) would have fired.
  await readFrames(res, 0, 100);
  assert.equal(called, 0, "negative Last-Event-ID does not trigger replay");
});

test("T4: Last-Event-ID: garbage → dbReplayMissed NOT called (defensive parse)", async () => {
  let called = 0;
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    replay: [makeRow({ id: 1 })],
    captureReplay: () => {
      called++;
    },
  });
  const res = await app.request("/agent-stream", {
    headers: { "Last-Event-ID": "foo", Accept: "text/event-stream" },
  });
  await readFrames(res, 0, 100);
  assert.equal(called, 0, "garbage Last-Event-ID does not trigger replay");
});

test("T5: cross-user isolation — userA stream never sees userB emit", async () => {
  const bus = makeFakeBus();
  const appA = makeApp({ userId: 1, bus });
  const appB = makeApp({ userId: 2, bus });
  const resA = await appA.request("/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  const resB = await appB.request("/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  // Allow both listeners to attach.
  await new Promise((r) => setTimeout(r, 20));
  // Emit ONLY for userB.
  bus.emit(2, makeRow({ id: 10, userId: 2, event: "needs_input" }));
  // Read both streams — userA expects 0 agent-event frames; userB expects 1.
  const framesA = await readFrames(resA, 1, 200);
  const framesB = await readFrames(resB, 1, 200);
  const eventA = framesA.map(parseFrame).filter((f) => f.event === "agent-event");
  const eventB = framesB.map(parseFrame).filter((f) => f.event === "agent-event");
  assert.equal(eventA.length, 0, "userA received zero agent-event frames");
  assert.equal(eventB.length, 1, "userB received the emit");
  assert.equal(eventB[0]!.id, "10");
});

test("T6: stream abort cleanup — bus listener count returns to 0", async () => {
  const bus = makeFakeBus();
  const app = makeApp({ userId: 1, bus });
  const res = await app.request("/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  // Wait for the listener to attach.
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(bus.listenerCount(1), 1, "listener attached on connect");
  // Trigger abort — readFrames cancels the reader in finally{}.
  await readFrames(res, 0, 50);
  // Allow microtasks for onAbort handler to fire.
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(bus.listenerCount(1), 0, "listener removed after abort");
});

test("T7: replay 24h cutoff — dbReplayMissed receives cutoff ~24h before now", async () => {
  let captured: Date | null = null;
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    replay: [],
    captureReplay: ({ cutoff }) => {
      captured = cutoff;
    },
  });
  const before = Date.now();
  const res = await app.request("/agent-stream", {
    headers: { "Last-Event-ID": "1", Accept: "text/event-stream" },
  });
  await readFrames(res, 0, 100);
  const after = Date.now();
  const expectedMin = before - 24 * 60 * 60 * 1000 - 200; // 200ms slack
  const expectedMax = after - 24 * 60 * 60 * 1000 + 200;
  assert.ok(captured !== null, "cutoff captured");
  const ts = (captured as unknown as Date).getTime();
  assert.ok(
    ts >= expectedMin && ts <= expectedMax,
    `cutoff (${(captured as unknown as Date).toISOString()}) is within ~24h of now ±200ms`,
  );
});
