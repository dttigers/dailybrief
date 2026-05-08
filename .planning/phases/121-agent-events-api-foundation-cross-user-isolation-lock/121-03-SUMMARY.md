---
phase: 121-agent-events-api-foundation-cross-user-isolation-lock
plan: 03
subsystem: testing
tags: [test, route, hono, agent-events, validation, idempotency, drift-detector, node-test]

# Dependency graph
requires:
  - phase: 121-plan-02
    provides: createAgentEventsRoute factory DI seam, VALID_EVENTS const, AgentEventsDeps/AgentSessionRow interfaces
  - phase: 121-plan-01
    provides: 0018_add_agent_events.sql migration with CHECK constraint + partial unique index (drift detector target)
provides:
  - vigil-core/src/routes/agent-events.test.ts with 24 passing tests (16 POST + 6 GET + 2 drift detectors)
  - DRIFT/T1: locks VALID_EVENTS const in agent-events.ts to exactly 5 values in correct order
  - DRIFT/T2: locks CHECK constraint verbatim + partial unique index predicate in 0018_add_agent_events.sql
affects:
  - 121-04 (cross-user isolation integration tests — complements route-tier tests)
  - future route changes to agent-events.ts (drift detectors will catch silent regressions)
  - future migration edits to 0018_add_agent_events.sql (DRIFT/T2 will fail on value drift)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-unit route tests via factory DI seam (createAgentEventsRoute) + userId-stub middleware — no live DB required"
    - "Table-driven test loop for 5 valid event values (collapsed T4-T8 into for-of over as const array)"
    - "Drift-detector pair: one test locks source TS file, one locks migration SQL — same pattern as forgot-password.test.ts:421-446"
    - "Lazy dynamic import after process.env setup — prevents transitive jwt module boot failure"

key-files:
  created:
    - vigil-core/src/routes/agent-events.test.ts
  modified: []

key-decisions:
  - "validBody() helper omits exit_code entirely (absent from JSON.stringify output) — tests optional field absence without undefined pollution"
  - "T12 mass-assignment test asserts 400 unknown_field AND captured===null — both conditions required to fully lock the defense"
  - "DRIFT/T2 regex requires both CHECK constraint verbatim AND partial unique index predicate — two invariants in one test"
  - "Table-driven loop for T4-T8 uses as const on the array literal to satisfy TypeScript discriminated union narrowing"

patterns-established:
  - "Test naming convention AGENT-API-01/T1 style (structured REQ/T# format) — enables traceability grep for requirement coverage audits"
  - "drift-detector test pattern: fs.readFileSync + regex match + import.meta.url-relative path resolution — self-contained, works without DATABASE_URL"

requirements-completed: [AGENT-API-01, AGENT-API-02]

# Metrics
duration: ~2min
completed: 2026-05-08
---

# Phase 121 Plan 03: Route Test Suite — agent-events.test.ts Summary

**24-test pure-unit suite covering all POST validation branches, idempotency contract, GET semantics, mass-assignment defense, and 2 drift detectors locking 5 event values across route source + migration SQL**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-08T19:35:05Z
- **Completed:** 2026-05-08T19:37:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `vigil-core/src/routes/agent-events.test.ts` created with 24 tests, all passing — 16 POST tests + 6 GET tests + 2 drift detectors
- POST validation branches covered: happy path (201), missing `client_event_id` (400), idempotency 201→200, 5 valid event values (table-driven), invalid event (400), malformed timestamp (400), unknown field (400), mass-assignment body.userId rejected (400), missing label (400), non-integer exit_code (400), db_unavailable (503), malformed JSON (400)
- GET semantics covered: happy path, ?since ISO override with captured Date arg verification, malformed ?since (400), hard cap 100 via captured limit arg, empty result { data: [] }, userId scoping wiring via captured uid arg
- DRIFT/T1 locks VALID_EVENTS to exactly 5 entries in source + in-memory const order match
- DRIFT/T2 locks CHECK constraint verbatim AND partial unique index `(user_id, client_event_id) WHERE client_event_id IS NOT NULL` in migration SQL

## Task Commits

1. **Task 1: Create agent-events.test.ts** - `5e31598` (test)

## Files Created/Modified

- `vigil-core/src/routes/agent-events.test.ts` — 472 lines; 24 tests covering all POST + GET branches + 2 drift detectors; pure-unit via factory DI seam

## Decisions Made

1. **validBody() omits exit_code entirely** — Using `undefined` in a validBody override would be serialized as absent by `JSON.stringify`, which is the correct wire behavior for an optional field. The helper was simplified to not include exit_code at all in the default body, keeping test intent clear.

2. **T12 asserts both 400 status AND captured===null** — Testing just the status code would not verify that the dep was never called. Both conditions are required to fully lock the mass-assignment defense: the route must reject before calling dbInsertOrGet.

3. **Table-driven loop for T4-T8 with as const** — The `for...of` over a `const` array literal with `as const` satisfies TypeScript's type narrowing for the AgentEventType discriminated union without requiring an explicit cast in validBody.

## Deviations from Plan

None — plan executed exactly as written. The test file structure from the plan's `<action>` block was followed verbatim with two minor adaptations: (1) the validBody helper was simplified to omit exit_code from the default body (rather than setting it to undefined) since JSON.stringify drops undefined keys; (2) the db_unavailable guard check in agent-events.ts comes before body parsing, so T15 correctly receives the 503 without needing a valid body — no code change needed.

## Issues Encountered

None — all 24 tests passed on the first run with no adjustments required.

## Known Stubs

None — pure-unit test file; no data flow or UI rendering stubs.

## Threat Flags

None — test file does not introduce new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The drift detectors access local filesystem paths (resolved relative to import.meta.url) in a read-only manner — no threat surface introduced.

## Self-Check

Files created:
- `vigil-core/src/routes/agent-events.test.ts` — FOUND

Commits:
- `5e31598` — FOUND

Test results:
- `cd vigil-core && npx tsx --test src/routes/agent-events.test.ts` exits 0 — VERIFIED (24 pass, 0 fail)

## Self-Check: PASSED

## Next Phase Readiness

- Plan 04 (cross-user isolation integration tests, live DB) is now the remaining unit of work for Phase 121
- Route-tier per-branch tests are complete; Plan 04 adds the structural guarantee via `cross-user-isolation.test.ts` integration blocks
- Plans 04 can reference `agent-events.test.ts` T12 as the unit-tier analog when documenting the mass-assignment defense it will verify at the integration tier

---
*Phase: 121-agent-events-api-foundation-cross-user-isolation-lock*
*Completed: 2026-05-08*
