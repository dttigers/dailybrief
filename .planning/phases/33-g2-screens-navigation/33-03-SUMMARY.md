---
phase: 33-g2-screens-navigation
plan: 03
subsystem: ui
tags: [even-g2, sdk, api-integration, auto-refresh, lifecycle]

requires:
  - phase: 33-g2-screens-navigation plan 02
    provides: Work orders and affirmation screen builders, navigation with live API data
provides:
  - Home screen accepts real API data (no more mock data)
  - 60-second auto-refresh cycle for all screens
  - Foreground enter triggers immediate refresh
  - Timer pauses on background exit
affects: [34-g2-voice-capture]

tech-stack:
  added: []
  patterns: [setInterval refresh with foreground lifecycle pause/resume]

key-files:
  created: []
  modified: [vigil-g2-plugin/src/screens/home.ts, vigil-g2-plugin/src/main.ts, vigil-g2-plugin/src/navigation.ts]

key-decisions:
  - "Extracted buildHomeContainers() shared helper for both CreateStartUpPageContainer and RebuildPageContainer variants"
  - "Timer type uses Awaited<ReturnType<typeof waitForEvenAppBridge>> for bridge param — avoids importing EvenAppBridge in main.ts"

patterns-established:
  - "Refresh pattern: refreshCurrentScreen() delegates to navigateTo(currentScreen) — single code path for all refresh triggers"
  - "Lifecycle pattern: stop timer on FOREGROUND_EXIT, start timer + immediate refresh on FOREGROUND_ENTER"

duration: 4min
completed: 2026-04-04
---

# Phase 33 Plan 03: Live API Data + Auto-Refresh Summary

**Home screen uses real Vigil Core API data, 60s auto-refresh cycle with foreground lifecycle management**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Home screen refactored to accept VigilSummary and VigilAffirmation as parameters — mock data fully removed
- All 3 screens (home, work orders, affirmation) now fetch live data from Vigil Core API
- 60-second auto-refresh timer keeps display current
- Foreground enter triggers immediate refresh + timer restart; background exit pauses timer

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor home screen to accept real API data** - `f214c49` (feat)
2. **Task 2: Add 60-second auto-refresh and foreground refresh** - `c3c07b6` (feat)

**Plan metadata:** `docs commit below` (docs: complete plan)

## Files Created/Modified
- `vigil-g2-plugin/src/screens/home.ts` - Removed mock data, accepts API params, added rebuildHomeScreen() variant
- `vigil-g2-plugin/src/main.ts` - Fetches real data on startup, 60s refresh timer, foreground lifecycle handling
- `vigil-g2-plugin/src/navigation.ts` - HOME case fetches live data, added refreshCurrentScreen() export

## Decisions Made
- Extracted `buildHomeContainers()` as shared helper to avoid duplicating layout logic between `buildHomeScreen` (startup) and `rebuildHomeScreen` (navigation)
- Used `Awaited<ReturnType<typeof waitForEvenAppBridge>>` for bridge type in timer functions to avoid extra import

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 G2 screens use live Vigil Core API data
- Auto-refresh running, lifecycle-aware
- Phase 33 (G2 Screens + Navigation) is complete
- Ready for Phase 34 (G2 Voice Capture)

---
*Phase: 33-g2-screens-navigation*
*Completed: 2026-04-04*
