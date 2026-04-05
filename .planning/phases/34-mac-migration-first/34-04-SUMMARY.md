---
phase: 34-mac-migration-first
plan: 04
subsystem: api, config
tags: [swift, protocol, dependency-injection, vigil-api, config-toggle]

requires:
  - phase: 34-03
    provides: APIThoughtStore actor implementing ThoughtRepository via REST API
  - phase: 34-02
    provides: ThoughtRepository protocol, VigilAPIClient HTTP client
provides:
  - Config toggle (vigil.useAPI) to switch between local GRDB and Vigil API backends
  - AppDelegate conditional store initialization
  - DashboardViewModel and CaptureService use ThoughtRepository protocol
  - ThoughtRepository default parameter extensions for ergonomic usage
affects: [35-glasses-plugin, 34-05, vigil-core]

tech-stack:
  added: []
  patterns: [protocol-based DI, config-driven backend selection, default parameter extensions]

key-files:
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift
    - Sources/JarvisCore/Storage/ThoughtRepository.swift
    - Sources/DailyBriefMonitor/AppDelegate.swift
    - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
    - Sources/JarvisCore/Services/CaptureService.swift

key-decisions:
  - "VigilConfig is optional on AppConfig for backward compatibility with existing configs"
  - "SyncService and FolderWatcher only activate in local GRDB mode (not API mode)"
  - "ThoughtRepository gets extension with default parameter values to match ThoughtStore convenience"
  - "CaptureService uses saveThought() instead of save(&inout) for actor-boundary safety"

patterns-established:
  - "Config toggle pattern: optional config section, default to disabled, conditional initialization"
  - "Protocol consumer pattern: any ThoughtRepository with default parameter extensions"

duration: 8min
completed: 2026-04-04
---

# Plan 04: Config Toggle and Protocol Wiring Summary

**Config toggle (vigil.useAPI) switches Mac app between local GRDB and Vigil Core API backends with zero regression for default local mode**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added VigilConfig struct (useAPI, apiBaseURL) to AppConfig with backward-compatible optional decoding
- AppDelegate conditionally creates APIThoughtStore or local ThoughtStore based on config toggle
- DashboardViewModel and CaptureService migrated to `any ThoughtRepository` protocol
- ThoughtRepository extended with default parameter values matching ThoughtStore convenience signatures
- SyncService and FolderWatcher disabled in API mode (sync handled by Vigil Core)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add config toggle and update AppDelegate** - `70797f7` (feat)
2. **Task 2: Update consumers to use ThoughtRepository protocol** - `b117dc2` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Config/AppConfig.swift` - Added VigilConfig struct and vigil property
- `Sources/JarvisCore/Storage/ThoughtRepository.swift` - Added default parameter extensions
- `Sources/DailyBriefMonitor/AppDelegate.swift` - Conditional store initialization, local-only sync/watcher
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` - Store type changed to any ThoughtRepository
- `Sources/JarvisCore/Services/CaptureService.swift` - Store type changed to any ThoughtRepository, uses saveThought()

## Decisions Made
- VigilConfig is optional (`var vigil: VigilConfig?`) so existing configs without the field still parse correctly
- SyncService and FolderWatcher require concrete ThoughtStore, so they only activate when `useVigilAPI == false`
- Added `localThoughtStore` property on AppDelegate to hold concrete reference for sync-only operations
- CaptureService switched from `save(&thought)` to `saveThought(thought)` for actor-boundary safety with `any` existential

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - default behavior (local GRDB) unchanged. To enable API mode, add to `~/.config/dailybrief/config.json`:
```json
"vigil": { "use_api": true, "api_base_url": "http://localhost:3001/v1" }
```

## Next Phase Readiness
- Mac app fully wired for protocol-based data access
- Ready for end-to-end testing with Vigil Core running
- FolderWatcherService and other services remain on concrete ThoughtStore (Phase 35 candidates)

---
*Phase: 34-mac-migration-first*
*Completed: 2026-04-04*
