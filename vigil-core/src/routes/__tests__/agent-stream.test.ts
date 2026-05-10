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
// Phase 125: suppressionQueue is module-scope state inside agent-stream.ts;
// we reset it in each Phase 125 test to keep state isolated.
const { suppressionQueue } = await import("../../lib/quiet-mode-suppression.js");

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

type QuietPayload = { enabled: boolean; since: string | null };

function makeFakeBus() {
  const listeners = new Map<number, Set<(row: Row) => void>>();
  const quietListeners = new Map<number, Set<(p: QuietPayload) => void>>();
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
    // Phase 125 (AGENT-HUD-03 / D-02): quiet_mode_changed fan-out.
    onQuiet(userId: number, fn: (p: QuietPayload) => void) {
      const s = quietListeners.get(userId) ?? new Set();
      s.add(fn);
      quietListeners.set(userId, s);
    },
    offQuiet(userId: number, fn: (p: QuietPayload) => void) {
      quietListeners.get(userId)?.delete(fn);
      if (quietListeners.get(userId)?.size === 0)
        quietListeners.delete(userId);
    },
    emitQuiet(userId: number, p: QuietPayload) {
      quietListeners.get(userId)?.forEach((fn) => fn(p));
    },
    quietListenerCount(userId: number) {
      return quietListeners.get(userId)?.size ?? 0;
    },
  };
}

type FakeBus = ReturnType<typeof makeFakeBus>;

function makeApp(opts: {
  userId: number;
  bus: FakeBus;
  replay?: Row[];
  captureReplay?: (args: { userId: number; afterId: number; cutoff: Date }) => void;
  // Phase 125: optional quiet-mode state for Phase 0 frame. Defaults to
  // {enabled:false, since:null} so existing tests (T1-T7) continue to pass
  // — Phase 0 always emits a frame, but with enabled=false the listener
  // path still treats events as non-suppressed (existing tests unchanged).
  quietState?: { enabled: boolean; since: Date | null };
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
      dbGetQuietMode: async () =>
        opts.quietState ?? { enabled: false, since: null },
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
  // Phase 125: Phase 0 always emits a quiet_mode_changed frame first, so
  // we read 2 frames and filter to find the 1 agent-event row.
  const frames = await readFrames(res, 2, 300);
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
  // Phase 125: Phase 0 emits a quiet_mode_changed frame BEFORE the 2 replay
  // rows, so we read 3 frames and filter to the 2 agent-event rows.
  const frames = await readFrames(res, 3, 500);
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
  // Read both streams. Phase 125: each stream emits a Phase 0
  // quiet_mode_changed frame first, so read 2 frames per stream and filter
  // to the agent-event subset.
  const framesA = await readFrames(resA, 2, 200);
  const framesB = await readFrames(resB, 2, 200);
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
  // Phase 125: Phase 0 emits a quiet_mode_changed frame before Phase 1
  // replay. Read 1 frame (the Phase 0 frame) so the handler reaches Phase 1
  // and invokes dbReplayMissed before we cancel the stream.
  await readFrames(res, 1, 200);
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

// ── Phase 125 Plan 05 (AGENT-HUD-03 / D-03 / D-04 / T-125-04) — GREEN ──
// Phase 0 synthetic frame ordering + suppression filter on replay +
// live-attach quietListener wiring. Replaces the Wave-0 RED placeholders.
// agent-stream.ts deps extended with dbGetQuietMode; suppressionQueue +
// bus.onQuiet are wired per RESEARCH §Example C lines 688-743.

test("Phase 0 synthetic quiet_mode_changed frame is emitted FIRST after auth, BEFORE Phase 1 replay (Pitfall 1)", async () => {
  suppressionQueue._clearAll();
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    // isQuiet=false here so replay rows are NOT suppressed; we only assert
    // ORDERING — quiet_mode_changed BEFORE agent-event frames.
    quietState: { enabled: false, since: null },
    replay: [
      makeRow({ id: 6, event: "heartbeat" }),
      makeRow({ id: 7, event: "milestone" }),
    ],
  });
  const res = await app.request("/agent-stream", {
    headers: { "Last-Event-ID": "5", Accept: "text/event-stream" },
  });
  // Read 3 frames: Phase 0 quiet_mode_changed + 2 replay rows.
  const frames = await readFrames(res, 3, 500);
  assert.ok(frames.length >= 3, `expected >=3 frames, got ${frames.length}`);
  const parsed = frames.map(parseFrame);
  // Phase 0 frame MUST be first (Pitfall 1).
  assert.equal(
    parsed[0]!.event,
    "quiet_mode_changed",
    "first frame is the Phase 0 synthetic quiet_mode_changed frame",
  );
  assert.equal(
    parsed[1]!.event,
    "agent-event",
    "second frame is the first agent-event replay row",
  );
  assert.equal(parsed[1]!.id, "6");
  assert.equal(parsed[2]!.event, "agent-event");
  assert.equal(parsed[2]!.id, "7");
});

test("Phase 1 Last-Event-ID replay loop filters through suppressionQueue.shouldSuppress when isQuiet=true (T-125-04)", async () => {
  suppressionQueue._clearAll();
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    quietState: { enabled: true, since: new Date("2026-05-10T10:00:00Z") },
    replay: [
      // heartbeat: non-allowlist → suppressed
      makeRow({ id: 10, event: "heartbeat" }),
      // needs_input: allowlist → passes through even when isQuiet=true
      makeRow({ id: 11, event: "needs_input" }),
      // milestone: non-allowlist → suppressed
      makeRow({ id: 12, event: "milestone" }),
    ],
  });
  const res = await app.request("/agent-stream", {
    headers: { "Last-Event-ID": "5", Accept: "text/event-stream" },
  });
  // Read up to 4 frames (Phase 0 + at most 3 agent-event rows) within 300ms.
  // Only Phase 0 + needs_input (id=11) should appear; heartbeat + milestone
  // are suppressed.
  const frames = await readFrames(res, 4, 300);
  const parsed = frames.map(parseFrame);
  const events = parsed.filter((f) => f.event === "agent-event");
  assert.equal(events.length, 1, "only the allowlist needs_input row passes");
  assert.equal(events[0]!.id, "11");
  // Heartbeat + milestone were stored in the suppression queue (one row each
  // per (session, event), so 2 rows for userId=1).
  assert.equal(suppressionQueue._size(1), 2, "2 non-allowlist rows held");
});

// Phase 125 helper: a stateful reader that holds the lock for the lifetime
// of a single test (multiple readFrames calls on the same stream would
// otherwise fail with ERR_INVALID_STATE because readFrames cancels the
// reader in its finally block, but reacquiring res.body.getReader() after
// cancel fails — the stream is locked/closed).
function makeStreamReader(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const collected: string[] = [];
  let buf = "";
  let cancelled = false;
  async function readUpTo(targetCount: number, timeoutMs: number): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    while (collected.length < targetCount && Date.now() < deadline) {
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
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        collected.push(buf.slice(0, idx));
        buf = buf.slice(idx + 2);
      }
    }
    return collected.slice();
  }
  async function cancel() {
    if (cancelled) return;
    cancelled = true;
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
  return { readUpTo, cancel };
}

test("Phase 2 live attach: bus.on listener invokes suppressionQueue.shouldSuppress before stream.writeSSE", async () => {
  suppressionQueue._clearAll();
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    quietState: { enabled: true, since: new Date("2026-05-10T10:00:00Z") },
  });
  const res = await app.request("/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  const r = makeStreamReader(res);
  try {
    // Drain Phase 0 frame so eventListener + quietListener attach.
    await r.readUpTo(1, 200);
    // Microtask drain to ensure listeners attached.
    await new Promise((s) => setTimeout(s, 30));
    // Emit a non-allowlist heartbeat row + an allowlist needs_input row.
    bus.emit(1, makeRow({ id: 50, event: "heartbeat", sessionId: "s-live" }));
    bus.emit(1, makeRow({ id: 51, event: "needs_input", sessionId: "s-live" }));
    // Read up to 2 more frames (target=3 total: Phase 0 + needs_input).
    const all = await r.readUpTo(3, 300);
    const events = all.map(parseFrame).filter((f) => f.event === "agent-event");
    assert.equal(events.length, 1, "only allowlist row written to stream");
    assert.equal(events[0]!.id, "51");
    // The heartbeat row was stored in the suppression queue.
    assert.equal(suppressionQueue._size(1), 1, "heartbeat held in queue");
  } finally {
    await r.cancel();
  }
});

test("bus.onQuiet listener writes a quiet_mode_changed SSE frame and updates local isQuiet ref", async () => {
  suppressionQueue._clearAll();
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    // Start NOT quiet so a non-allowlist row would normally pass through.
    quietState: { enabled: false, since: null },
  });
  const res = await app.request("/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  const r = makeStreamReader(res);
  try {
    // Drain Phase 0 frame so listeners attach.
    await r.readUpTo(1, 200);
    await new Promise((s) => setTimeout(s, 30));
    assert.equal(bus.quietListenerCount(1), 1, "quietListener attached");

    // Toggle quiet ON via the bus — the handler's quietListener should write
    // a quiet_mode_changed frame AND flip the local isQuiet ref to true.
    bus.emitQuiet(1, { enabled: true, since: "2026-05-10T11:00:00Z" });
    // Now emit a non-allowlist row — it MUST be suppressed (proves isQuiet flipped).
    bus.emit(1, makeRow({ id: 60, event: "heartbeat", sessionId: "s-flip" }));

    // Read up to 3 frames total (Phase 0 + quiet_mode_changed; heartbeat suppressed).
    const all = await r.readUpTo(3, 300);
    const parsed = all.map(parseFrame);
    const quietFrames = parsed.filter((f) => f.event === "quiet_mode_changed");
    const eventFrames = parsed.filter((f) => f.event === "agent-event");
    // Two quiet frames: Phase 0 (enabled=false) + the bus.emitQuiet result (enabled=true).
    assert.equal(quietFrames.length, 2, "Phase 0 + quietListener frames");
    // The SECOND quiet frame is the bus.emitQuiet payload — must echo the args.
    const payload = JSON.parse(quietFrames[1]!.data!) as {
      enabled: boolean;
      since: string | null;
    };
    assert.deepEqual(payload, { enabled: true, since: "2026-05-10T11:00:00Z" });
    assert.equal(
      eventFrames.length,
      0,
      "heartbeat suppressed after isQuiet flipped to true",
    );
    // Suppression queue captured the heartbeat row.
    assert.equal(suppressionQueue._size(1), 1, "heartbeat held in queue after toggle");
  } finally {
    await r.cancel();
  }
});

test("stream.onAbort cleanup calls bus.off AND bus.offQuiet (no listener leak)", async () => {
  suppressionQueue._clearAll();
  const bus = makeFakeBus();
  const app = makeApp({
    userId: 1,
    bus,
    quietState: { enabled: false, since: null },
  });
  const res = await app.request("/agent-stream", {
    headers: { Accept: "text/event-stream" },
  });
  const r = makeStreamReader(res);
  // Drain Phase 0 frame so listeners attach.
  await r.readUpTo(1, 200);
  await new Promise((s) => setTimeout(s, 30));
  assert.equal(bus.listenerCount(1), 1, "eventListener attached");
  assert.equal(bus.quietListenerCount(1), 1, "quietListener attached");

  // Cancel the stream — this triggers stream.onAbort on the server side.
  await r.cancel();
  // Microtask drain so onAbort handler runs.
  await new Promise((s) => setTimeout(s, 80));

  assert.equal(bus.listenerCount(1), 0, "bus.off called on abort");
  assert.equal(bus.quietListenerCount(1), 0, "bus.offQuiet called on abort");
});
