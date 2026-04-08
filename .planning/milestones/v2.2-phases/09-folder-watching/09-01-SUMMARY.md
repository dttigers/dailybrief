---
phase: 09-folder-watching
plan: 01
subsystem: infra
tags: [DispatchSource, file-monitoring, audio-transcription, image-description, actor]

# Dependency graph
requires:
  - phase: 05-voice-image-capture
    provides: TranscriptionService, ImageDescriptionService, CaptureService with source parameter
  - phase: 03-ai-triage
    provides: TriageService for auto-categorization
provides:
  - FolderWatchingConfig in AppConfig with enabled/audioFolderPath/imageFolderPath
  - FolderWatcherService actor with DispatchSource-based directory monitoring
  - Processed file deduplication via JSON manifest
affects: [09-folder-watching]

# Tech tracking
tech-stack:
  added: []
  patterns: [DispatchSource file system monitoring, JSON manifest deduplication, debounced event handling]

key-files:
  created: [Sources/JarvisCore/Services/FolderWatcherService.swift]
  modified: [Sources/JarvisCore/Config/AppConfig.swift]

key-decisions:
  - "Used DispatchSource.makeFileSystemObjectSource for native macOS folder monitoring — no third-party dependencies"
  - "Track processed files by filename only (not full path) — sufficient for dedicated watched folders"
  - "Manifest stored at ~/Library/Application Support/Jarvis/processed-files.json"
  - "Used existing CaptureService.capture(_:source:) method — no changes needed to CaptureService"

patterns-established:
  - "Folder watching pattern: DispatchSource + debounce + actor isolation for thread safety"
  - "Manifest-based deduplication: JSON array of processed filenames, saved atomically"

# Metrics
duration: 6min
completed: 2026-04-02
---

# Phase 9, Plan 01: Folder Watching Summary

**FolderWatchingConfig and FolderWatcherService with DispatchSource-based directory monitoring for passive audio/image capture**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-02
- **Completed:** 2026-04-02
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- FolderWatchingConfig added to AppConfig with backward-compatible decoding (defaults disabled, ~/Jarvis/Audio, ~/Jarvis/Images)
- FolderWatcherService actor created with full processing pipeline: DispatchSource monitoring, audio transcription, image description, thought capture, and optional triage
- Processed file manifest prevents duplicate ingestion across restarts

## Task Commits

Each task was committed atomically:

1. **Task 1: Add FolderWatchingConfig to AppConfig** - `26d284f` (feat)
2. **Task 2: Create FolderWatcherService** - `532a175` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Config/AppConfig.swift` - Added FolderWatchingConfig struct and property with backward-compat decoding
- `Sources/JarvisCore/Services/FolderWatcherService.swift` - New actor with DispatchSource monitoring, audio/image processing pipeline, manifest deduplication

## Decisions Made
- Used existing `CaptureService.capture(_:source:)` — no modifications needed to CaptureService
- DispatchSource with O_EVTONLY for native macOS folder monitoring (no FSEvents or third-party deps)
- Debounce delay of 0.5s to handle files still being written
- Per-file error isolation: one file failing doesn't stop processing of others

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FolderWatcherService ready to be wired into AppDelegate in next plan
- Config defaults to disabled — user must enable in config.json and optionally customize paths

---
*Phase: 09-folder-watching*
*Completed: 2026-04-02*
