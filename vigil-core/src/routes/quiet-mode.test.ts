// Phase 125 Wave 0 — RED placeholder for AGENT-HUD-03 endpoint contract.
//
// Pinned by Plan 05 (vigil-core/src/routes/quiet-mode.ts implementation).
// Pattern reference: vigil-core/src/routes/calendar.ts (CAL-01) factory
// + 125-RESEARCH.md §Pattern 2 (lines 295-374). Each test below is the
// shape Plan 05 will turn green by replacing { skip } with a real body.

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";

const PLAN_05 = "TODO(125-05): pending implementation — vigil-core/src/routes/quiet-mode.ts";

test("GET /v1/quiet-mode returns {enabled, since} for authenticated user", { skip: PLAN_05 }, () => {
  // TODO(125-05): createQuietModeRouter with stub dbGet → c.get('userId') →
  // returns {enabled: boolean, since: ISO|null}. Mirror calendar.test.ts
  // factory-deps style: pass a stub dbGet that returns {enabled: true, since: new Date(...)}.
  assert.fail("placeholder");
});

test("GET /v1/quiet-mode returns 503 when dbAvailable=false", { skip: PLAN_05 }, () => {
  // TODO(125-05): construct router with dbAvailable=false; expect 503 + {error: 'db_unavailable'}.
  assert.fail("placeholder");
});

test("PUT /v1/quiet-mode {enabled: true} writes column + emits bus.emitQuiet + sets quietModeSince", { skip: PLAN_05 }, () => {
  // TODO(125-05): stub dbSet captures (userId, enabled, since); stub bus.emitQuiet
  // captures emitted payload. Assert dbSet called with (userId, true, Date(non-null))
  // and emitQuiet called with payload {enabled: true, since: ISO}.
  assert.fail("placeholder");
});

test("PUT /v1/quiet-mode {enabled: false} flushes suppressionQueue + emits each held row via bus.emit", { skip: PLAN_05 }, () => {
  // TODO(125-05): seed suppressionQueue with 2 held rows for userId; PUT {enabled: false};
  // assert suppressionQueue.flush(userId) called once AND bus.emit called twice
  // (one per held row) AND held rows arrive in chronological order.
  assert.fail("placeholder");
});

test("PUT /v1/quiet-mode rejects non-boolean enabled with 400 invalid_payload", { skip: PLAN_05 }, () => {
  // TODO(125-05): PUT {enabled: "true"} → 400 + {error: 'invalid_payload'}.
  assert.fail("placeholder");
});

test("PUT /v1/quiet-mode rejects malformed JSON with 400 invalid_json", { skip: PLAN_05 }, () => {
  // TODO(125-05): PUT body "not-json{" → 400 + {error: 'invalid_json'}.
  assert.fail("placeholder");
});

test("Cross-user isolation: userA cannot read or write userB's quiet_mode (T-125-01)", { skip: PLAN_05 }, () => {
  // TODO(125-05): mount router with userId=1 middleware; PUT/GET only mutates user 1
  // (stub dbGet/dbSet capture userId arg). Verify GET as user 1 + GET as user 2
  // produce independent state surfaces; userA's emitQuiet does not fire userB listeners.
  assert.fail("placeholder");
});
