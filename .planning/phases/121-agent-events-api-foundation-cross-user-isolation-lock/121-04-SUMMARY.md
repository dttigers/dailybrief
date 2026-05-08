---
phase: 121-agent-events-api-foundation-cross-user-isolation-lock
plan: 04
subsystem: testing
tags: [test, integration, cross-user-isolation, lock-test, agent-events, node-test]

# Dependency graph
requires:
  - phase: 121-plan-02
    provides: POST /v1/agent-events + GET /v1/agent-sessions live routes with KNOWN_FIELDS guard
  - phase: 121-plan-01
    provides: agent_events table + composite partial unique index (user_id, client_event_id)
provides:
  - 3 D-D2 integration lock blocks in vigil-core/src/integration/cross-user-isolation.test.ts
  - D-D2.1: POST hostile-userId rejection + clean-POST userId-from-bearer verification
  - D-D2.2: GET session scoping — userB's sessions never appear in userA's response
  - D-D2.3: Composite-unique scope — shared client_event_id allowed across users
affects:
  - 121-05 (smoke test plan — lock blocks establish baseline integration confidence)
  - all future phases that extend agent_events (single grep target for isolation audit)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy import per-test for new tables (agentEvents) — minimal blast-radius on stale DBs"
    - "finally-cleanup by clientEventId — composite-unique within a user catches all test rows"
    - "drizzle-orm lazy import per block (eq, and) — mirrors existing file pattern, avoids eager module load ordering issues"

key-files:
  created: []
  modified:
    - vigil-core/src/integration/cross-user-isolation.test.ts

key-decisions:
  - "Block 1 asserts both 400 status (front-door KNOWN_FIELDS guard) AND DB cross-check (no row with userB.id) — two-layer defense lock; if guard regresses without route-level fix, DB check catches it"
  - "Block 2 uses direct DB insert to seed userB's event — bypasses route entirely, pins GET-side filtering independently of POST-side guards"
  - "Block 3 uses same client_event_id for both users — the only test that can detect a regression from composite partial unique to single-column unique index"
  - "Pre-existing TypeScript errors in agent-events.test.ts (lines 128, 353) are out-of-scope — logged to deferred items, not introduced by Plan 04"

requirements-completed: [AGENT-API-01, AGENT-API-02]

# Metrics
duration: ~5min
completed: 2026-05-08
---

# Phase 121 Plan 04: Cross-User Isolation Lock — 3 D-D2 it() blocks in cross-user-isolation.test.ts Summary

**Three structural lock blocks added to the canonical cross-user-isolation.test.ts file, mirroring Phase 108's W-01/W-02 pattern — pins POST userId-from-bearer invariant, GET per-user scoping, and composite dedupe scope**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T19:39:31Z
- **Completed:** 2026-05-08T19:44:24Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `vigil-core/src/integration/cross-user-isolation.test.ts` extended with 224 lines (3 `it()` blocks) inside the existing `describe("cross-user isolation (AUTH-05)")` wrapper
- Block 1 (D-D2.1): hostile body.userId → 400 unknown_field + DB SELECT confirms no userB row persisted; clean POST → response.userId === userA.id + DB row has user_id = userA.id
- Block 2 (D-D2.2): direct DB insert seeds one event per user; GET as userA must not contain userB's sessionId or message text — two-field defense
- Block 3 (D-D2.3): both users POST with identical client_event_id → both 201; DB SELECT confirms 2 distinct rows scoped by userId, distinct serial PKs
- All 3 blocks: lazy import for agentEvents + drizzle-orm helpers, skip gracefully when DATABASE_URL is unset, cleanup in finally by clientEventId
- All assertion failures use "LEAK:" or "LEAK CRITICAL:" prefix per file convention (8 LEAK assertions in the new section)
- Test suite exits 0 with all 3 new blocks skipping cleanly when DATABASE_URL is absent (expected behavior — hermetic design)

## Task Commits

1. **Task 1: Add 3 D-D2 isolation lock blocks** - `71a051a` (test)

## Files Created/Modified

- `vigil-core/src/integration/cross-user-isolation.test.ts` — +224 lines; 3 new it() blocks inside existing describe() wrapper

## Decisions Made

1. **Two-layer defense in Block 1** — The KNOWN_FIELDS guard (400 unknown_field) is the front-door defense; the DB SELECT is the second layer. If a future plan removes the guard but route-level attribution still works, only the first assertion fails. If both regress, the DB SELECT fails with "LEAK CRITICAL:". Documents the regression-detection chain explicitly.

2. **Direct DB insert for Block 2 seed** — Using the POST route to seed userB's event for the GET test would conflate POST-side and GET-side correctness. Direct insert via the drizzle client pins GET-side filtering independently, matching the chat-sessions block pattern (line 285).

3. **Same client_event_id for Block 3** — The only way to test composite-uniqueness is to attempt a collision that would fail on single-column unique but succeed on composite. `sharedCid = iso-shared-cid-${Date.now()}` ensures uniqueness across test runs while the two users share the exact same value within the run.

## Deviations from Plan

None — plan executed exactly as written. The verbatim code block from the plan spec was inserted without modification. The pre-existing TypeScript errors in `agent-events.test.ts` (lines 128 and 353) were discovered as pre-existing (verified by git stash test) and are out of scope per deviation rules.

## Deferred Items

Pre-existing TypeScript errors in `vigil-core/src/routes/agent-events.test.ts`:
- Line 128: `Property 'userId' does not exist on type 'never'`
- Line 132-135: Similar `never` type inference errors on row destructuring
- Line 353: `instanceof` expression left-hand side type error
- Line 354: `Property 'toISOString' does not exist on type 'never'`

These are pre-existing from Plan 03 commit `5e31598`. They do not affect test runtime behavior (tsx + node:test runs successfully) but would need to be fixed for strict `tsc --noEmit` compliance. Logged for a future cleanup plan.

## Known Stubs

None — integration test file; no UI rendering or data flow stubs.

## Threat Flags

None — test file only reads/writes its own isolated rows (scoped by unique clientEventId + userId). No new endpoints, auth paths, or schema changes introduced. The test rows are fully cleaned up in finally blocks.

## Self-Check

Files modified:
- `vigil-core/src/integration/cross-user-isolation.test.ts` — FOUND

Commits:
- `71a051a` — FOUND

Test results:
- All 3 new blocks present (grep count = 1 each for all 3 verbatim titles) — VERIFIED
- All 3 blocks skip gracefully without DATABASE_URL (output shows `# DATABASE_URL required` for each) — VERIFIED
- File structure: blocks are INSIDE the existing `describe()` wrapper — VERIFIED
- Lazy imports: 9 total `await import("../db/schema.js")` calls (was 6 before, +3) — VERIFIED
- LEAK assertions: 8 in the new section — VERIFIED
- delete(agentEvents) cleanup calls: 5 in the new section (Block 1: 2, Block 2: 2, Block 3: 1) — VERIFIED

## Self-Check: PASSED

## Next Phase Readiness

- Plan 05 (smoke/integration gate) is the last plan in Phase 121 — all route, unit-test, and isolation-lock work is complete
- All 5 acceptance criteria from Plan 04 met: block titles, lazy imports, LEAK assertions, finally cleanup, skip pattern
- The canonical `cross-user-isolation.test.ts` now has agent_events coverage alongside work-orders, chat-sessions, briefs, projects, thoughts — single grep target confirmed

---
*Phase: 121-agent-events-api-foundation-cross-user-isolation-lock*
*Completed: 2026-05-08*
