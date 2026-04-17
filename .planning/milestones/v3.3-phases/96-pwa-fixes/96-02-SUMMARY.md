---
phase: 96-pwa-fixes
plan: 02
subsystem: api
tags: [hono, drizzle-orm, react, typescript, filtering]

# Dependency graph
requires: []
provides:
  - Server-side excludeDone query parameter on GET /v1/thoughts (defaults true)
  - Client-side getThoughts API accepts excludeDone and taskStatus params
  - useThoughts hook passes correct overrides for Tasks tab Done/All filters
affects: [thoughts-views, tasks-tab, search]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-side-default-filter, fail-safe-parameter-design]

key-files:
  created: []
  modified:
    - vigil-core/src/routes/thoughts.ts
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/hooks/useThoughts.ts

key-decisions:
  - "Filter applied server-side by default (excludeDone defaults to true); callers opt out with excludeDone=false — fail-safe design"
  - "Tasks tab Done filter uses taskStatus=done (bypasses excludeDone); All filter uses excludeDone=false"
  - "Non-task thoughts (taskStatus IS NULL) always included via isNull() OR condition"
  - "Client-side done filtering in useThoughts removed entirely — server owns this responsibility"

patterns-established:
  - "Fail-safe query params: absent or any non-false value defaults to the secure/clean state"
  - "Server-side default filtering: views get clean data without client needing to request it"

requirements-completed: [FIX-02]

# Metrics
duration: 15min
completed: 2026-04-16
---

# Phase 96 Plan 02: Hide Done Tasks Summary

**Server-side excludeDone filter on GET /v1/thoughts hides done tasks from all views by default, with Tasks tab Done/All overrides preserved**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-16T22:00:00Z
- **Completed:** 2026-04-16T22:20:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `excludeDone` query param to GET /v1/thoughts — defaults to excluding done tasks from all views
- Updated `getThoughts` client API to accept and forward `excludeDone` and `taskStatus` params
- Replaced client-side done filtering in `useThoughts` with server-side param overrides for Tasks tab
- Human verification confirmed: All Thoughts, category views, and search hide done tasks; Tasks tab Open/Done/All filters work correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: Add server-side excludeDone filter and update client** - `105693c` (feat)
2. **Task 2: Verify done-task hiding across all views** - human-verify checkpoint (approved)

## Files Created/Modified
- `vigil-core/src/routes/thoughts.ts` - Added excludeDone query param; added isNull/or/ne condition to exclude done tasks by default; updated drizzle-orm imports
- `vigil-pwa/src/api/client.ts` - Added excludeDone and taskStatus params to getThoughts interface and URLSearchParams construction
- `vigil-pwa/src/hooks/useThoughts.ts` - Removed client-side done filtering; added taskStatusParam and excludeDoneParam logic for Tasks tab overrides

## Decisions Made
- Applied fail-safe parameter design: `excludeDone !== "false"` means any absent or truthy value defaults to hiding done tasks
- Non-task thoughts (where taskStatus IS NULL) must be explicitly preserved with `isNull(thoughtsTable.taskStatus) OR ne(thoughtsTable.taskStatus, 'done')` to avoid accidentally hiding regular thoughts
- Tasks tab "Done" filter passes `taskStatus=done` which bypasses excludeDone entirely (explicit status wins)
- Tasks tab "All" filter passes `excludeDone=false` to opt out of the default

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- FIX-02 complete: done tasks no longer leak into All Thoughts, category views, or search
- Phase 96 plans 01 and 02 both complete — phase is ready to close
- Remaining PWA fixes (if any) can be tracked in the next phase or milestone

---
*Phase: 96-pwa-fixes*
*Completed: 2026-04-16*
