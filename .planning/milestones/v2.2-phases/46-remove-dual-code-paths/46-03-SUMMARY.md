---
phase: 46-remove-dual-code-paths
plan: 03
subsystem: infra, ui
tags: [swift, appdelegate, api-only, cleanup]

# Dependency graph
requires:
  - phase: 46-01
    provides: Deleted local storage files (DatabaseManager, ThoughtStore, SyncService, CloudKitManager, FolderWatcherService)
  - phase: 46-02
    provides: Deleted local AI services, promoted API config fields to top-level AppConfig
provides:
  - AppDelegate with clean API-only initialization (no dual-path branching)
  - Removed folder watcher, CloudKit sync, sync timer from monitor app
affects: [46-04-cli-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [api-only-startup, linear-initialization]

key-files:
  created: []
  modified:
    - Sources/DailyBriefMonitor/AppDelegate.swift

key-decisions:
  - "No changes needed beyond AppDelegate — Plan 04 (parallel) already added shared type definitions to AIServiceProtocols.swift"

patterns-established:
  - "API-only startup: single VigilAPIClient instance, no conditional backend selection"

# Metrics
duration: 3min
completed: 2026-04-05
---

# Plan 46-03: Simplify AppDelegate to API-Only Initialization Summary

**Collapsed AppDelegate from 347 to 243 lines by removing all dual-path backend branching, folder watcher, and CloudKit sync**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-05
- **Completed:** 2026-04-05
- **Tasks:** 2 (1 code change, 1 verification-only)
- **Files modified:** 1

## Accomplishments
- Removed all dual-path branching between local GRDB and API backends in AppDelegate
- Deleted folder watcher initialization block, CloudKit sync setup, sync timer, and sync callbacks
- Removed 7 dead properties: localThoughtStore, folderWatcher, syncService, syncTimer, concreteTriageService, concreteImageDescService, concreteTherapyClassService
- AppDelegate now creates a single VigilAPIClient and wires all services through it in ~20 lines

## Task Commits

Each task was committed atomically:

1. **Task 1: Simplify AppDelegate to API-only initialization** - `46aba48` (refactor)
2. **Task 2: Verify AppDelegate compiles** - No commit needed (0 errors, Plan 04 already fixed shared types)

## Files Created/Modified
- `Sources/DailyBriefMonitor/AppDelegate.swift` - Removed 122 lines of dual-path branching, folder watcher, and sync code

## Decisions Made
- No additional file changes needed for compilation — Plan 04 (executed in parallel) had already added the missing shared type definitions (TriageResult, ImageMediaType, error enums) to AIServiceProtocols.swift

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AppDelegate is fully API-only with clean linear startup
- DailyBriefMonitor target compiles cleanly
- Plan 04 (CLI migration) already complete from parallel execution

---
*Phase: 46-remove-dual-code-paths*
*Completed: 2026-04-05*
