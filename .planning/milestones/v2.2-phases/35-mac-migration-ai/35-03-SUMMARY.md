---
phase: 35-mac-migration-ai
plan: 03
subsystem: ai
tags: [swift, protocols, dependency-injection, vigil-api]

# Dependency graph
requires:
  - phase: 35-mac-migration-ai (plan 01)
    provides: AI service protocols and API implementations
  - phase: 34
    provides: ThoughtRepository protocol pattern, VigilAPIClient, config toggle
provides:
  - All Mac app AI consumers use protocol types
  - Config-driven backend selection for AI services in AppDelegate
  - DashboardViewModel and FolderWatcherService accept any AI backend
affects: [35-mac-migration-ai]

# Tech tracking
tech-stack:
  added: []
  patterns: [existential protocol types for AI service DI]

key-files:
  modified:
    - Sources/DailyBriefMonitor/AppDelegate.swift
    - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
    - Sources/JarvisCore/Services/FolderWatcherService.swift

key-decisions:
  - "FolderWatcherService uses protocol types for consistency even though it only runs in local mode"
  - "Concrete service variables retained in AppDelegate for FolderWatcher which needs concrete ImageDescriptionService/TriageService/TherapyClassificationService — but stored as protocol types on self"

patterns-established:
  - "Protocol-typed AI services: all consumers accept (any ProtocolName)? instead of ConcreteService?"

# Metrics
duration: 5min
completed: 2026-04-04
---

# Phase 35, Plan 03: Wire AI Service Consumers to Protocols Summary

**AppDelegate, DashboardViewModel, and FolderWatcherService migrated to protocol-typed AI services with config-driven Vigil API / local Claude backend selection**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-04
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- AppDelegate stored properties changed from 6 concrete AI service types to protocol types
- AppDelegate conditionally creates API-backed (VigilAPIClient) or local Claude AI services based on vigil.useAPI config
- DashboardViewModel init and stored properties accept protocol types transparently
- FolderWatcherService updated to protocol types for consistency

## Task Commits

Each task was committed atomically:

1. **Task 1: Update AppDelegate to conditionally create API-backed AI services** - `9b5a24a` (feat)
2. **Task 2: Update DashboardViewModel and FolderWatcherService to use protocol types** - `1a32a5e` (feat)

**Plan metadata:** (included in this summary commit)

## Files Created/Modified
- `Sources/DailyBriefMonitor/AppDelegate.swift` - Protocol-typed AI service properties, config-driven backend selection
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` - Protocol-typed init parameters and stored properties
- `Sources/JarvisCore/Services/FolderWatcherService.swift` - Protocol-typed AI service properties and init parameters

## Decisions Made
- FolderWatcherService gets protocol types for consistency, even though it only runs in local mode (receives concrete instances at runtime)
- AppDelegate retains concrete local variables for FolderWatcher construction, while storing protocol types on self for Dashboard use

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Mac app AI service consumers now use protocol types
- Phase 35 migration is functionally complete — local mode unchanged, API mode creates Vigil Core-backed services
- Ready for any remaining plans in phase 35

---
*Phase: 35-mac-migration-ai*
*Completed: 2026-04-04*
