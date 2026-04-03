---
phase: 14-launchagent-folder-cleanup
plan: 02
subsystem: services, ui
tags: [swift, folder-watching, file-cleanup, settings]

requires:
  - phase: 09-folder-watching
    provides: FolderWatcherService, FolderWatchingConfig, folder watching Settings UI
provides:
  - Auto-delete of watched folder files after successful processing
  - Settings toggle for auto-delete behavior
affects: []

tech-stack:
  added: []
  patterns: [opt-in destructive config with safe default]

key-files:
  created: []
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift
    - Sources/JarvisCore/Services/FolderWatcherService.swift
    - Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift
    - Sources/DailyBriefMonitor/Settings/SettingsView.swift

key-decisions:
  - "Auto-delete defaults to false (opt-in) for safety"
  - "Processed files manifest preserved after deletion to prevent re-processing of same-named files"
  - "Deletion failures are logged but non-fatal since the thought was already captured"

patterns-established:
  - "Opt-in destructive config: dangerous operations default to off and require explicit user enablement"

duration: 4min
completed: 2026-04-03
---

# Phase 14, Plan 02: Auto-Delete Watched Folder Files Summary

**FolderWatcherService auto-deletes audio/image files after successful processing, controlled by opt-in Settings toggle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- FolderWatchingConfig gained `autoDeleteAfterProcessing` property (default false, backward compatible)
- FolderWatcherService conditionally deletes source files after successful transcription/description
- Settings UI exposes toggle with explanatory text in the Folders tab

## Task Commits

Each task was committed atomically:

1. **Task 1: Add auto-delete config and implement cleanup in FolderWatcherService** - `f05dffd` (feat)
2. **Task 2: Add auto-delete toggle to folder watching Settings UI** - `98839d8` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Config/AppConfig.swift` - Added autoDeleteAfterProcessing to FolderWatchingConfig
- `Sources/JarvisCore/Services/FolderWatcherService.swift` - Auto-delete logic after successful processing
- `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift` - Load/save autoDeleteAfterProcessing
- `Sources/DailyBriefMonitor/Settings/SettingsView.swift` - Toggle and helper text in Folders tab

## Decisions Made
- Auto-delete defaults to false for safety (opt-in, not opt-out)
- Manifest entries preserved after file deletion to prevent re-processing
- Deletion failures logged but non-fatal

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auto-delete feature complete and ready for use
- No blockers for subsequent plans

---
*Phase: 14-launchagent-folder-cleanup*
*Completed: 2026-04-03*
