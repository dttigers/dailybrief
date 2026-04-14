---
phase: 76-brief-assembly-endpoint
plan: 01
subsystem: api
tags: [promise-allsettled, pdf, orchestration, tdd, di-factory]

# Dependency graph
requires:
  - phase: 73-sports-proxy
    provides: createSportsService().fetchAllLeagues() returning SportsResponse
  - phase: 74-google-calendar-server-side
    provides: createCalendarService().fetchTodaysEvents() returning CalendarEventsResponse
  - phase: 75-pdf-generation-engine
    provides: createPdfRenderer().renderBrief(data, config) returning Buffer
provides:
  - createBriefAssemblyService() DI factory with assembleAndRender(dateStr) orchestration
  - mapSports, mapCalendarEvents, mapWorkOrders, mapThoughts mapper functions
  - Promise.allSettled concurrent data source fetching with per-source timeouts
  - Filesystem PDF persistence at configurable BRIEFS_DIR
affects: [76-02-brief-generate-route, brief-history, pwa-brief-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [promise-allsettled-orchestration, per-source-timeout, filesystem-cache-reuse, di-factory-with-injectable-deps]

key-files:
  created:
    - vigil-core/src/services/brief-assembly-service.ts
    - vigil-core/src/services/brief-assembly-service.test.ts
  modified: []

key-decisions:
  - "Used _cacheDir dep override for test isolation of filesystem cache"
  - "Therapy patterns and therapy prep skipped in v1 to bound assembly latency"
  - "Insights generated only when recentThoughts >= 3 and AI client available"
  - "Affirmation cache uses same ~/.cache/dailybrief/ path as affirmation.ts route for cache hits"

patterns-established:
  - "Promise.allSettled orchestration with per-source Promise.race timeout wrapper"
  - "Mapper functions exported separately from factory for independent unit testing"
  - "Test fixtures using makeBaseDeps() with spread overrides for DI mock injection"

requirements-completed: [BRIEF-01, BRIEF-02]

# Metrics
duration: 7min
completed: 2026-04-13
---

# Phase 76 Plan 01: Brief Assembly Service Summary

**Promise.allSettled orchestration service with per-source timeouts, data mappers for sports/calendar/work orders/thoughts, filesystem PDF persistence, and affirmation/prioritization caching**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-13T12:49:02Z
- **Completed:** 2026-04-13T12:56:06Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Brief assembly service orchestrates 5 data sources (sports, calendar, thoughts, work orders, affirmation) concurrently via Promise.allSettled
- Partial failures produce empty fields; total failure produces valid empty brief with fallback affirmation (D-03)
- Each source wrapped in Promise.race with 10-second timeout to prevent single slow source from blocking (T-76-02)
- 15 tests covering happy path, partial failure, total failure, timeout, filesystem write, and prioritization

## Task Commits

Each task was committed atomically:

1. **Task 1: Brief assembly mapper functions with TDD** - `4a185ba` (test)
2. **Task 2: Brief assembly orchestration with TDD** - `8ce1432` (feat)

## Files Created/Modified
- `vigil-core/src/services/brief-assembly-service.ts` - DI factory with assembleAndRender orchestration, mapper functions for all data sources, affirmation/prioritization cache, insights generation
- `vigil-core/src/services/brief-assembly-service.test.ts` - 15 tests: 7 orchestration (happy path, sports fail, calendar needs_reauth, all fail, timeout, filesystem write, prioritization) + 8 mapper tests

## Decisions Made
- Used `_cacheDir` injectable dep to isolate filesystem cache in tests (previous tests were polluting each other via shared `~/.cache/dailybrief/` directory)
- Skipped therapyPatterns and therapyPrep in v1 to keep assembly latency bounded (empty arrays) — these are Page 3 content, least time-critical
- Insights generated only when recentThoughts >= 3 and AI client available, matching existing threshold from insights.ts route
- Work order prioritization included when work orders exist and AI available, reusing same MD5-keyed cache pattern as prioritize.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test isolation for filesystem affirmation cache**
- **Found during:** Task 2 (orchestration GREEN phase)
- **Issue:** Test 4 (all sources fail) was reading a cached affirmation written by Test 1 (happy path) because both used the global `~/.cache/dailybrief/` directory with the same date key
- **Fix:** Added `_cacheDir` injectable dep to BriefAssemblyDeps; tests pass `tmpDir` as cache dir for isolation
- **Files modified:** vigil-core/src/services/brief-assembly-service.ts, vigil-core/src/services/brief-assembly-service.test.ts
- **Verification:** All 15 tests pass consistently regardless of execution order
- **Committed in:** 8ce1432 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Assembly service is complete and tested, ready for Plan 02 (brief-generate route + brief/:date retrieval)
- Route handler will call `createBriefAssemblyService().assembleAndRender(dateStr)` and return the PDF buffer with appropriate headers
- Briefs table upsert needed in the route handler (not in the assembly service)

## Self-Check: PASSED

---
*Phase: 76-brief-assembly-endpoint*
*Completed: 2026-04-13*
