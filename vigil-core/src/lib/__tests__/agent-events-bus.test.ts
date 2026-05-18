// Phase 124 Plan 02 — agent-events-bus tests.
// Mirrors vigil-core/src/routes/agent-events.test.ts:1-15 scaffold.

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";

// Lazy import after env setup (mirrors agent-events.test.ts pattern).
const { bus } = await import("../agent-events-bus.js");
import type { DrizzleAgentEvent } from "../../db/types.js";

// Listener parameter type matches the bus's public API contract
// (bus.on / bus.off declare `(row: DrizzleAgentEvent) => void`). Using
// `never` was rejected by `tsc --noEmit` strict — `never` parameters are
// contravariantly incompatible with the bus's accepted type. Using
// DrizzleAgentEvent is type-honest and round-trips through the on/off
// signatures cleanly. (Rule 3 deviation from plan-spec verbatim source —
// strict-TS compliance, no runtime semantics change.)
type Row = DrizzleAgentEvent;

// Tests do NOT depend on the DrizzleAgentEvent shape — only the type's name.
// `as Row` casts a minimal payload through the type without populating fields
// the bus never reads.
const fakeRow = (id: number, userId: number): Row => ({ id, userId } as unknown as Row);

test("emit with no subscribers is a no-op (does not create an emitter)", () => {
  // Use a userId unlikely to collide with other tests' state
  bus.emit(9001, fakeRow(1, 9001));
  assert.equal(bus._size(), 0, "no emitter created on emit-without-subscriber");
});

test("subscribe creates emitter; unsubscribe deletes Map entry when listenerCount hits 0", () => {
  const listener = (_row: Row) => {};
  bus.on(9002, listener);
  assert.equal(bus._listenerCount(9002), 1, "listener registered");
  assert.ok(bus._size() >= 1, "emitter exists after subscribe");

  bus.off(9002, listener);
  assert.equal(bus._listenerCount(9002), 0, "listener removed");
  assert.equal(bus._size(), 0, "Map entry deleted when listenerCount hits 0");
});

test("cross-userId isolation: listener for userA never fires for userB emit", () => {
  const seenA: Row[] = [];
  const listenerA = (row: Row) => { seenA.push(row); };
  bus.on(101, listenerA);
  try {
    bus.emit(102, fakeRow(99, 102));
    assert.deepEqual(seenA, [], "userA listener saw zero events from userB emits");
    // Sanity: listenerA DOES fire for userA emit
    bus.emit(101, fakeRow(1, 101));
    assert.equal(seenA.length, 1, "userA listener fires for userA emit");
  } finally {
    bus.off(101, listenerA);
  }
});

test("100 reconnect cycles do not leak listeners (RESEARCH Pitfall 3)", () => {
  for (let i = 0; i < 100; i++) {
    const listener = (_row: Row) => {};
    bus.on(7, listener);
    bus.off(7, listener);
  }
  assert.equal(bus._size(), 0, "no leaked emitters after 100 subscribe/unsubscribe cycles");
  assert.equal(bus._listenerCount(7), 0, "no leaked listeners");
});

test("multiple listeners on same userId all receive emit (within-user fan-out)", () => {
  const seen1: Row[] = [];
  const seen2: Row[] = [];
  const l1 = (row: Row) => { seen1.push(row); };
  const l2 = (row: Row) => { seen2.push(row); };
  bus.on(200, l1);
  bus.on(200, l2);
  try {
    bus.emit(200, fakeRow(7, 200));
    assert.equal(seen1.length, 1, "listener 1 fired");
    assert.equal(seen2.length, 1, "listener 2 fired");
  } finally {
    bus.off(200, l1);
    bus.off(200, l2);
  }
});

test("setMaxListeners(50) prevents warning under 11+ listeners on same userId", () => {
  const warnings: string[] = [];
  const onWarning = (w: Error & { name?: string }) => {
    if (w.name === "MaxListenersExceededWarning") {
      warnings.push(String(w.message ?? w));
    }
  };
  process.on("warning", onWarning);
  try {
    const listeners: Array<(row: Row) => void> = [];
    for (let i = 0; i < 15; i++) {
      const l = (_row: Row) => {};
      listeners.push(l);
      bus.on(300, l);
    }
    // Warnings are emitted asynchronously; force a microtask drain
    // (no MaxListenersExceededWarning should ever fire for ≤50 listeners).
    for (const l of listeners) bus.off(300, l);
    assert.equal(warnings.length, 0, "no MaxListenersExceededWarning at 15 listeners (cap 50)");
  } finally {
    process.off("warning", onWarning);
  }
});

// ── Phase 125 Wave 0 (AGENT-HUD-03 / D-02 / T-125-01) ───────────────
// quiet_mode_changed fan-out additions. Plan 03 turns these green by
// replacing { skip: PLAN_03_BUS } with the asserted bodies, after
// extending AgentEventBus with emitQuiet / onQuiet / offQuiet.
// (`test` and `assert` already imported above — no re-import needed.)

type QuietPayload = { enabled: boolean; since: string | null };

test("bus.emitQuiet(userId, payload) fires onQuiet listeners for that userId only (T-125-01)", () => {
  const seen: QuietPayload[] = [];
  const listener = (p: QuietPayload) => { seen.push(p); };
  bus.onQuiet(8001, listener);
  try {
    const payload: QuietPayload = { enabled: true, since: "2026-05-10T12:00:00Z" };
    bus.emitQuiet(8001, payload);
    assert.equal(seen.length, 1, "onQuiet listener invoked exactly once");
    assert.deepEqual(seen[0], payload, "listener received the exact payload");
  } finally {
    bus.offQuiet(8001, listener);
  }
});

test("bus.emitQuiet(userId) does NOT fire onQuiet listeners for other userIds (cross-user isolation)", () => {
  const seenA: QuietPayload[] = [];
  const seenB: QuietPayload[] = [];
  const listenerA = (p: QuietPayload) => { seenA.push(p); };
  const listenerB = (p: QuietPayload) => { seenB.push(p); };
  bus.onQuiet(8101, listenerA);
  bus.onQuiet(8102, listenerB);
  try {
    bus.emitQuiet(8101, { enabled: true, since: null });
    assert.equal(seenA.length, 1, "userA listener fired for userA emit");
    assert.equal(seenB.length, 0, "userB listener did NOT fire for userA emit (T-125-01)");
  } finally {
    bus.offQuiet(8101, listenerA);
    bus.offQuiet(8102, listenerB);
  }
});

test("bus.offQuiet removes the listener; subsequent emitQuiet does not fire", () => {
  const seen: QuietPayload[] = [];
  const listener = (p: QuietPayload) => { seen.push(p); };
  bus.onQuiet(8201, listener);
  bus.offQuiet(8201, listener);
  bus.emitQuiet(8201, { enabled: false, since: null });
  assert.equal(seen.length, 0, "listener never fired after offQuiet");
});

test("emitter Map entry is deleted when both EVENT_NAME and QUIET_NAME listenerCount=0", () => {
  const eventL = (_row: Row) => {};
  const quietL = (_p: QuietPayload) => {};
  const baselineSize = bus._size();
  bus.on(8301, eventL);
  bus.onQuiet(8301, quietL);
  assert.equal(
    bus._size(),
    baselineSize + 1,
    "single emitter created for both listener types",
  );

  bus.off(8301, eventL);
  assert.equal(
    bus._size(),
    baselineSize + 1,
    "Map entry STILL present — quietL is still registered (cleanup gate joint)",
  );

  bus.offQuiet(8301, quietL);
  assert.equal(
    bus._size(),
    baselineSize,
    "Map entry deleted only after BOTH listeners removed (T-125-W3-01 regression guard)",
  );
});

test("offQuiet without prior onQuiet is safe no-op (no emitter exists)", () => {
  const listener = (_p: QuietPayload) => {};
  // Should not throw and should leave Map size unchanged.
  const before = bus._size();
  bus.offQuiet(9999, listener);
  assert.equal(bus._size(), before, "offQuiet on non-existent emitter is no-op");
});

test("emitQuiet without subscribers is no-op (does not create emitter)", () => {
  const before = bus._size();
  bus.emitQuiet(9998, { enabled: true, since: null });
  assert.equal(bus._size(), before, "emitQuiet does not allocate emitter without subscribers");
});

// ── Phase 130 Plan 03 (VOICE-06 / T-130-03-I, T-130-03-R) ───────────────
// thought-created channel — promoting Plan 02 SHIM (emit-only) to full
// emit/on/off triple with three-channel joint cleanup gate. Plan 03 turns
// these tests GREEN by adding `onThoughtCreated` + `offThoughtCreated` and
// extending the existing `off` / `offQuiet` cleanup gates to ALSO require
// `listenerCount(THOUGHT_CREATED_NAME) === 0` (PATTERNS.md §"CRITICAL"
// lines 536-537). Until that, these tests are RED because the methods do
// not exist.

type ThoughtCreatedPayload = { thoughtId: number; content: string };

test("bus.emitThoughtCreated(userId, payload) fires onThoughtCreated listeners for that userId (T-130-03)", () => {
  const seen: ThoughtCreatedPayload[] = [];
  const listener = (p: ThoughtCreatedPayload) => { seen.push(p); };
  bus.onThoughtCreated(8501, listener);
  try {
    const payload: ThoughtCreatedPayload = { thoughtId: 42, content: "hello world" };
    bus.emitThoughtCreated(8501, payload);
    assert.equal(seen.length, 1, "onThoughtCreated listener invoked exactly once");
    assert.deepEqual(seen[0], payload, "listener received the exact payload");
  } finally {
    bus.offThoughtCreated(8501, listener);
  }
});

test("bus.emitThoughtCreated(userId1) does NOT fire onThoughtCreated listeners for userId2 (cross-user isolation, T-130-03-I)", () => {
  const seenA: ThoughtCreatedPayload[] = [];
  const seenB: ThoughtCreatedPayload[] = [];
  const listenerA = (p: ThoughtCreatedPayload) => { seenA.push(p); };
  const listenerB = (p: ThoughtCreatedPayload) => { seenB.push(p); };
  bus.onThoughtCreated(8601, listenerA);
  bus.onThoughtCreated(8602, listenerB);
  try {
    bus.emitThoughtCreated(8601, { thoughtId: 1, content: "userA thought" });
    assert.equal(seenA.length, 1, "userA listener fired for userA emit");
    assert.equal(seenB.length, 0, "userB listener did NOT fire for userA emit (cross-user isolation invariant)");
  } finally {
    bus.offThoughtCreated(8601, listenerA);
    bus.offThoughtCreated(8602, listenerB);
  }
});

test("multiple onThoughtCreated listeners on same userId all receive emissions (within-user fan-out preserved)", () => {
  const seen1: ThoughtCreatedPayload[] = [];
  const seen2: ThoughtCreatedPayload[] = [];
  const l1 = (p: ThoughtCreatedPayload) => { seen1.push(p); };
  const l2 = (p: ThoughtCreatedPayload) => { seen2.push(p); };
  bus.onThoughtCreated(8701, l1);
  bus.onThoughtCreated(8701, l2);
  try {
    bus.emitThoughtCreated(8701, { thoughtId: 7, content: "fan-out" });
    assert.equal(seen1.length, 1, "listener 1 fired");
    assert.equal(seen2.length, 1, "listener 2 fired");
  } finally {
    bus.offThoughtCreated(8701, l1);
    bus.offThoughtCreated(8701, l2);
  }
});

test("three-channel joint cleanup gate: Map entry deleted only after off+offQuiet+offThoughtCreated all run (T-130-03-R)", () => {
  const eventL = (_row: Row) => {};
  const quietL = (_p: QuietPayload) => {};
  const thoughtL = (_p: ThoughtCreatedPayload) => {};

  const baseline = bus._size();

  // Subscribe all three channels for the same userId.
  bus.on(8801, eventL);
  bus.onQuiet(8801, quietL);
  bus.onThoughtCreated(8801, thoughtL);
  assert.equal(bus._size(), baseline + 1, "single emitter created for all three listener types");

  // Remove the EVENT_NAME listener. Map entry must STILL exist — both QUIET
  // and THOUGHT_CREATED listeners remain.
  bus.off(8801, eventL);
  assert.equal(
    bus._size(),
    baseline + 1,
    "Map entry STILL present after off() — quiet + thought-created listeners block cleanup",
  );

  // Remove the QUIET_NAME listener. Map entry must STILL exist because
  // thought-created listener is alive. This is the CRITICAL three-channel
  // gate — the existing two-channel offQuiet cleanup gate (Phase 125) must
  // be extended to also check THOUGHT_CREATED_NAME, otherwise this would
  // incorrectly delete the entry and orphan the thoughtL listener.
  bus.offQuiet(8801, quietL);
  assert.equal(
    bus._size(),
    baseline + 1,
    "Map entry STILL present after offQuiet() — thought-created listener still blocks cleanup (three-channel gate)",
  );

  // Remove the THOUGHT_CREATED_NAME listener. NOW the Map entry deletes.
  bus.offThoughtCreated(8801, thoughtL);
  assert.equal(
    bus._size(),
    baseline,
    "Map entry deleted only after ALL THREE listeners removed (T-130-03-R regression guard)",
  );
});

test("offThoughtCreated without prior onThoughtCreated is safe no-op (no emitter exists)", () => {
  const listener = (_p: ThoughtCreatedPayload) => {};
  const before = bus._size();
  bus.offThoughtCreated(9997, listener);
  assert.equal(bus._size(), before, "offThoughtCreated on non-existent emitter is no-op");
});

test("emitThoughtCreated without subscribers is no-op (does not create emitter)", () => {
  const before = bus._size();
  bus.emitThoughtCreated(9996, { thoughtId: 1, content: "x" });
  assert.equal(bus._size(), before, "emitThoughtCreated does not allocate emitter without subscribers");
});
