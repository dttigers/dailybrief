---
phase: 88-date-window-helper-rollover
plan: "02"
subsystem: backend-api
tags: [backend, api, thoughts, rollover, datetime, timezone, tdd]

requires:
  - 88-01 (getCurrentWeekWindow utility)

provides:
  - GET /thoughts with default Wed-Wed week window in user tz
  - Three bypass rules: ?q= (search), ?after=/?before= (explicit range), ?window=all
  - shouldBypassWindow() exported pure function for unit testing
  - thoughts.test.ts with RO-01..08 (RO-08 chat safety sentinel passing)

affects:
  - All GET /thoughts callers (window default applied server-side)
  - 88-03 (caller audit — any callers needing ?window=all identified)

tech-stack:
  added: []
  patterns:
    - "Inline tz lookup from appSettings per-request (no cache; mirrors settings.ts pattern)"
    - "shouldBypassWindow() extracted as exported pure function for testability"
    - "Degraded test harness: RO-08 + predicate unit tests; seed-and-query tests skipped pending test-DB"

key-files:
  created:
    - vigil-core/src/routes/thoughts.test.ts
  modified:
    - vigil-core/src/routes/thoughts.ts

key-decisions:
  - "Degraded test harness chosen: no shared test-DB infrastructure exists; RO-01..05 skipped with test.skip, compensated by curl probes in RESEARCH"
  - "shouldBypassWindow extracted as exported pure function rather than inlined predicate — makes bypass logic directly unit-testable without HTTP harness"
  - "bypassWindow calls shouldBypassWindow(…) rather than repeating the inline expression — single source of truth for bypass logic"
  - "tz read fresh on every request (no cache) per D-15"

requirements-completed:
  - ROLLOVER-01
  - ROLLOVER-02
  - ROLLOVER-03

duration: ~3min
completed: 2026-04-16
---

# Phase 88 Plan 02: Apply Week Window to GET /thoughts Summary

**GET /thoughts now defaults to current Wed-Wed window in user tz; three bypass rules preserve search, explicit date ranges, and ?window=all; RO-08 sentinel locks Chat's direct-Drizzle path as a regression test**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-16T00:03:43Z
- **Completed:** 2026-04-16T00:06:40Z
- **Tasks:** 2
- **Files modified:** 2 (1 created)

## Accomplishments

- Modified `GET /thoughts` to apply `getCurrentWeekWindow(tz)` by default — thoughts from outside the current Wed-Wed window are filtered unless a bypass is triggered
- Implemented all three bypass rules (D-07): `?q=` for full-text search, `?after=`/`?before=` for explicit date ranges, `?window=all` for explicit all-time access
- End bound correctly uses `lt` (strict less than) — `[start, end)` exclusive semantics from Plan 88-01 preserved
- Inline tz lookup from `appSettings` reads `user_timezone` key with `"America/New_York"` default (mirrors settings.ts pattern per D-03)
- Extracted `shouldBypassWindow()` as an exported pure function — bypass logic testable without a DB or HTTP server
- Created `thoughts.test.ts` with full RO-01..08 suite; RO-08 (chat safety sentinel) confirms chat.ts uses direct Drizzle, not the HTTP /thoughts route
- Full vigil-core test suite: 170 pass, 0 fail, 5 skipped (all intentional RO-01..05)

## Task Commits

1. **Task 1: Add week-window default + three bypasses** — `85995d3` (feat)
2. **Task 2: Integration tests + shouldBypassWindow extraction** — `07fa9dd` (feat)

## Files Created/Modified

- `vigil-core/src/routes/thoughts.ts` — Added `lt`, `appSettings`, `getCurrentWeekWindow` imports; added `windowParam` query param; exported `shouldBypassWindow()` pure function; injected window default after existing filters; end bound uses `lt` not `lte`. 20 net insertions.
- `vigil-core/src/routes/thoughts.test.ts` — RO-01..08 test suite using `node:test` + `node:assert/strict`. RO-01..05 `test.skip`, RO-06/07 unit tests of `shouldBypassWindow`, RO-08 file-contents sentinel for Chat safety. 123 lines.

## Test Harness Approach

**Degraded path chosen.** No shared test-DB infrastructure exists in `vigil-core`. The settings router uses dependency injection (`createSettingsRouter({ dbGetFn, dbUpsertFn })`), which makes it easily unit-testable. The thoughts router uses the global `db` singleton directly — wiring a test-DB would require ~60+ lines of boilerplate (mock DB, Hono test app, seed/teardown). Per plan instructions, degraded gracefully:

| Test | Approach | Status |
|------|----------|--------|
| RO-01 | Seed-and-query (requires test DB) | `test.skip` |
| RO-02 | Seed-and-query (requires test DB) | `test.skip` |
| RO-03 | Seed-and-query (requires test DB) | `test.skip` |
| RO-04 | Seed-and-query (requires test DB) | `test.skip` |
| RO-05 | Seed-and-query (requires test DB) | `test.skip` |
| RO-06 | Unit test of `shouldBypassWindow()` | PASS |
| RO-07 | Unit test of `shouldBypassWindow()` (×4) | PASS |
| RO-08 | File-contents sentinel (zero deps) | PASS |

**Manual verification for RO-01..05** (from RESEARCH §"ROLLOVER-01 route-level verification"):
```bash
curl -s "$VIGIL_URL/v1/thoughts" -H "Authorization: Bearer $KEY" | jq '.total'              # small (week only)
curl -s "$VIGIL_URL/v1/thoughts?window=all" -H "Authorization: Bearer $KEY" | jq '.total'   # larger (all time)
curl -s "$VIGIL_URL/v1/thoughts?q=anything" -H "Authorization: Bearer $KEY" | jq '.total'   # any matches, all time
```

## ROLLOVER-03 Audit (Chat Safety)

Read `vigil-core/src/routes/chat.ts` (lines 61-73): Chat injects context via `db.select().from(thoughtsTable).orderBy(desc(thoughtsTable.createdAt)).limit(contextLimit)` — a direct Drizzle query, not the HTTP `/thoughts` route. No code change was needed. RO-08 locks this in as an automated regression test.

## Per-Task Verification Map (for 88-VALIDATION.md)

| Test ID | Case | Result |
|---------|------|--------|
| RO-01 | Bare GET returns only current-week thoughts | SKIP (no test DB) |
| RO-02 | ?q= bypasses window — both old and new returned | SKIP (no test DB) |
| RO-03 | ?after= bypasses window | SKIP (no test DB) |
| RO-04 | ?before= bypasses window | SKIP (no test DB) |
| RO-05 | ?window=all bypasses window | SKIP (no test DB) |
| RO-06 | Invalid ?window does NOT bypass (case-sensitive, "all" only) | PASS |
| RO-07 | Each bypass trigger (?q, ?after, ?before, ?window=all) independently activates | PASS |
| RO-08 | chat.ts does not contain getCurrentWeekWindow or window=all | PASS |

## Deviations from Plan

### Auto-refactor (improvement)

**1. [Plan suggestion — applied] Extracted shouldBypassWindow() as exported pure function**
- **Found during:** Task 2
- **Issue:** Plan suggested extracting the bypass predicate to a small pure function for unit testing. Applied as specified.
- **Fix:** Added `export function shouldBypassWindow(params)` above the Hono router. Updated the inline `bypassWindow` assignment to call `shouldBypassWindow({ q, after, before, window: windowParam })`.
- **Files modified:** `vigil-core/src/routes/thoughts.ts`
- **Commit:** `07fa9dd`

## Known Stubs

None — no placeholder data or hardcoded values. The window default is live logic reading from the DB.

## Threat Surface Scan

No new network endpoints introduced. `shouldBypassWindow` is a pure function with no network or DB access. T-88-04 through T-88-08 from the plan's threat model are all addressed:

- T-88-05 (invalid tz): `getCurrentWeekWindow` throws `RangeError` on invalid tz, surfaces as 500 via existing try/catch — no silent fallback to UTC.
- T-88-06 (DoS via window=all): existing `limit` cap (max 200) is untouched.

---
*Phase: 88-date-window-helper-rollover*
*Completed: 2026-04-16*
