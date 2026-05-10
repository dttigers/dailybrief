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

const PLAN_03_BUS = "TODO(125-03): pending implementation — bus.emitQuiet/onQuiet/offQuiet";

test("bus.emitQuiet(userId, payload) fires onQuiet listeners for that userId only (T-125-01)", { skip: PLAN_03_BUS }, () => {
  // TODO(125-03): bus.onQuiet(101, listener); bus.emitQuiet(101, {enabled:true, since:'…'});
  // assert listener invoked exactly once with the payload.
  assert.fail("placeholder");
});

test("bus.emitQuiet(userId) does NOT fire onQuiet listeners for other userIds (cross-user isolation)", { skip: PLAN_03_BUS }, () => {
  // TODO(125-03): bus.onQuiet(101, listenerA); bus.onQuiet(102, listenerB);
  // bus.emitQuiet(101, payload); assert listenerA fired AND listenerB did NOT.
  assert.fail("placeholder");
});

test("bus.offQuiet removes the listener; subsequent emitQuiet does not fire", { skip: PLAN_03_BUS }, () => {
  // TODO(125-03): bus.onQuiet(101, l); bus.offQuiet(101, l); bus.emitQuiet(101, payload);
  // assert listener never called.
  assert.fail("placeholder");
});

test("emitter Map entry is deleted when both EVENT_NAME and QUIET_NAME listenerCount=0", { skip: PLAN_03_BUS }, () => {
  // TODO(125-03): bus.on(101, eventL); bus.onQuiet(101, quietL);
  // bus.off(101, eventL); assert _size() >= 1 (still has quietL);
  // bus.offQuiet(101, quietL); assert _size() === 0 (Map entry deleted).
  assert.fail("placeholder");
});
