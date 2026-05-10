// Phase 125 Plan 03 — GREEN tests for AGENT-HUD-03 suppression queue.
//
// Pinned interface from 125-03-PLAN.md + RESEARCH §Pattern 3 + CONTEXT D-04.
// Replaces Wave-0 RED placeholders (Plan 01) with asserted bodies.

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const { suppressionQueue } = await import("./quiet-mode-suppression.js");
import type { DrizzleAgentEvent } from "../db/types.js";

// Construct a minimal DrizzleAgentEvent for tests; only the fields the
// suppressionQueue reads (userId, sessionId, event, eventTimestamp) need
// realistic values. Other required fields are filled with safe defaults.
function makeRow(overrides: Partial<DrizzleAgentEvent> = {}): DrizzleAgentEvent {
  const base: DrizzleAgentEvent = {
    id: 1,
    userId: 1,
    sessionId: "sess-A",
    event: "task_complete",
    message: null,
    label: "test-label",
    host: "test-host",
    exitCode: null,
    eventTimestamp: new Date("2026-05-10T12:00:00Z"),
    receivedAt: new Date("2026-05-10T12:00:00Z"),
    clientEventId: null,
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  suppressionQueue._clearAll();
});

test("shouldSuppress returns false when isQuiet=false (passthrough)", () => {
  const row = makeRow({ userId: 1, event: "task_complete" });
  const result = suppressionQueue.shouldSuppress(1, false, row);
  assert.equal(result, false, "passthrough when isQuiet=false");
  assert.equal(suppressionQueue._size(1), 0, "nothing stored when not quiet");
});

test("shouldSuppress returns false for allowlist event types (needs_input, task_failed) even when isQuiet=true", () => {
  for (const event of ["needs_input", "task_failed"] as const) {
    const row = makeRow({ userId: 2, event });
    const result = suppressionQueue.shouldSuppress(2, true, row);
    assert.equal(result, false, `allowlist passthrough for event=${event}`);
  }
  assert.equal(suppressionQueue._size(2), 0, "allowlist events never stored");
});

test("shouldSuppress returns true and stores row for non-allowlist event when isQuiet=true", () => {
  const events = ["heartbeat", "milestone", "task_complete"];
  for (let i = 0; i < events.length; i++) {
    const row = makeRow({
      userId: 3,
      sessionId: `sess-${i}`,
      event: events[i]!,
    });
    const result = suppressionQueue.shouldSuppress(3, true, row);
    assert.equal(result, true, `suppressed for event=${events[i]}`);
  }
  assert.equal(
    suppressionQueue._size(3),
    3,
    "three distinct (sessionId, event) entries stored",
  );
});

test("Map keyed (userId, sessionId, eventType) — last-of-each-kind via overwrite", () => {
  const first = makeRow({
    userId: 4,
    sessionId: "sess-X",
    event: "heartbeat",
    message: "first-beat",
  });
  const second = makeRow({
    userId: 4,
    sessionId: "sess-X",
    event: "heartbeat",
    message: "second-beat",
  });
  suppressionQueue.shouldSuppress(4, true, first);
  suppressionQueue.shouldSuppress(4, true, second);
  assert.equal(suppressionQueue._size(4), 1, "single bucket — overwrite");
  const flushed = suppressionQueue.flush(4);
  assert.equal(flushed.length, 1, "exactly one row after flush");
  assert.equal(
    flushed[0]!.message,
    "second-beat",
    "flush returns the SECOND (latest) row only",
  );
});

test("flush(userId) returns held rows in ascending event_timestamp order (Pitfall 4)", () => {
  // Insertion order intentionally non-monotonic: T+10s → T+0s → T+20s
  const t0 = new Date("2026-05-10T12:00:00Z");
  const tPlus10 = new Date(t0.getTime() + 10_000);
  const tPlus20 = new Date(t0.getTime() + 20_000);
  // Use distinct (sessionId, event) so all 3 are retained (no overwrite).
  suppressionQueue.shouldSuppress(
    5,
    true,
    makeRow({ userId: 5, sessionId: "s-A", event: "heartbeat", eventTimestamp: tPlus10 }),
  );
  suppressionQueue.shouldSuppress(
    5,
    true,
    makeRow({ userId: 5, sessionId: "s-B", event: "heartbeat", eventTimestamp: t0 }),
  );
  suppressionQueue.shouldSuppress(
    5,
    true,
    makeRow({ userId: 5, sessionId: "s-C", event: "heartbeat", eventTimestamp: tPlus20 }),
  );
  const flushed = suppressionQueue.flush(5);
  assert.equal(flushed.length, 3, "all 3 rows retained");
  assert.equal(flushed[0]!.eventTimestamp.getTime(), t0.getTime(), "first = T+0");
  assert.equal(
    flushed[1]!.eventTimestamp.getTime(),
    tPlus10.getTime(),
    "second = T+10",
  );
  assert.equal(
    flushed[2]!.eventTimestamp.getTime(),
    tPlus20.getTime(),
    "third = T+20",
  );
});

test("flush(userId) clears the user's bucket; subsequent shouldSuppress on different event creates fresh entry", () => {
  suppressionQueue.shouldSuppress(
    6,
    true,
    makeRow({ userId: 6, sessionId: "s-1", event: "heartbeat" }),
  );
  assert.equal(suppressionQueue._size(6), 1);
  const flushed = suppressionQueue.flush(6);
  assert.equal(flushed.length, 1, "flush returns the held row");
  assert.equal(suppressionQueue._size(6), 0, "bucket cleared after flush");

  suppressionQueue.shouldSuppress(
    6,
    true,
    makeRow({ userId: 6, sessionId: "s-2", event: "milestone" }),
  );
  assert.equal(
    suppressionQueue._size(6),
    1,
    "fresh bucket allocated for new entry",
  );
});

test("Cross-user isolation: flush(userA) does NOT affect userB's held rows (T-125-01)", () => {
  suppressionQueue.shouldSuppress(
    100,
    true,
    makeRow({ userId: 100, sessionId: "s-A", event: "heartbeat" }),
  );
  suppressionQueue.shouldSuppress(
    200,
    true,
    makeRow({ userId: 200, sessionId: "s-B", event: "heartbeat" }),
  );
  assert.equal(suppressionQueue._size(100), 1, "userA has 1 row");
  assert.equal(suppressionQueue._size(200), 1, "userB has 1 row");

  const flushedA = suppressionQueue.flush(100);
  assert.equal(flushedA.length, 1, "userA flush returns userA's row");
  assert.equal(flushedA[0]!.userId, 100, "userA flush row belongs to userA");
  assert.equal(suppressionQueue._size(100), 0, "userA bucket cleared");
  assert.equal(suppressionQueue._size(200), 1, "userB bucket UNAFFECTED (T-125-01)");

  const flushedB = suppressionQueue.flush(200);
  assert.equal(flushedB.length, 1, "userB flush returns userB's row");
  assert.equal(flushedB[0]!.userId, 200, "userB row belongs to userB");
});

test("Replay-storm DoS bounded: same (sessionId, eventType) emitted 100x stores exactly 1 row (T-125-03)", () => {
  for (let i = 0; i < 100; i++) {
    suppressionQueue.shouldSuppress(
      7,
      true,
      makeRow({
        userId: 7,
        sessionId: "s-storm",
        event: "heartbeat",
        message: `beat-${i}`,
        eventTimestamp: new Date(Date.now() + i),
      }),
    );
  }
  assert.equal(
    suppressionQueue._size(7),
    1,
    "100 identical-key emits stored as 1 row (Map.set overwrite)",
  );
  const flushed = suppressionQueue.flush(7);
  assert.equal(flushed.length, 1, "flush returns 1 row");
  assert.equal(
    flushed[0]!.message,
    "beat-99",
    "the LAST (99th) emit is the retained row",
  );
});
