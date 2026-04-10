---
phase: 61-folder-watch-feeder
plan: 01
subsystem: DailyBriefMonitor
tags: [folder-watch, dispatch-source, image-processing, audio-transcription, swift-actor]
dependency_graph:
  requires:
    - APIImageDescriptionService.processPhoto (JarvisCore, Phase 60)
    - TranscriptionService.transcribe (JarvisCore)
    - CaptureService.capture (JarvisCore)
    - AppConfig.FolderWatchingConfig (JarvisCore)
  provides:
    - FolderWatcherService actor (DailyBriefMonitor)
    - failedFiles / hasFailures / failureCount public interface for menu bar
  affects:
    - AppDelegate (will inject FolderWatcherService in plan 02)
    - MenuBarView (will read failedFiles for badge in plan 02)
tech_stack:
  added: []
  patterns:
    - Swift actor for DispatchSource-backed directory watching
    - O_EVTONLY file descriptor (prevents volume unmount block)
    - FIFO pendingQueue with sequential Task drain (no concurrent API calls)
    - wait-for-stable debounce (1s poll, 30s max) before processing
    - done/ subfolder move with collision counter suffix (-2, -3, ...)
key_files:
  created:
    - Sources/DailyBriefMonitor/FolderWatcherService.swift
    - Tests/DailyBriefMonitorTests/FolderWatcherServiceTests.swift
  modified: []
decisions:
  - Inject AppConfig.FolderWatchingConfig at init rather than calling a nonexistent AppConfig.shared singleton — AppDelegate owns config loading via ConfigLoader.load()
  - Use strong capture of self in DispatchSource event handler (actors are Sendable reference types; weak capture caused Swift 6 data-race error)
  - Simplified startProcessingLoop to Task { } with implicit actor isolation instead of [weak self] guard let dance
metrics:
  duration_minutes: 25
  completed_date: "2026-04-10"
  tasks_completed: 1
  tasks_total: 1
  files_created: 2
  files_modified: 0
  lines_added: 715
---

# Phase 61 Plan 01: FolderWatcherService Actor Summary

**One-liner:** DispatchSource directory watcher actor that routes images through processPhoto(preview:false) and audio through transcribe+capture with FIFO queuing, debounce, done/ move, and failure tracking.

## What Was Built

Created `FolderWatcherService` — the core engine for Phase 61's folder-watch-feeder. The actor monitors two directories (audio + image) using `DispatchSource.makeFileSystemObjectSource` with `O_EVTONLY` file descriptors, debounces writes with a 1-second stability poll, processes files sequentially through existing Vigil Core pipeline endpoints, and tracks failures for the menu bar to surface.

### Key implementation details

- **DispatchSource watching** — `O_EVTONLY` (not `O_RDONLY`) prevents blocking volume unmount; `setCancelHandler { close(fd) }` prevents fd leak on stop.
- **File classification (D-07)** — `imageExtensions: Set<String> = ["jpg","jpeg","png","heic","tiff","bmp"]` and `audioExtensions: Set<String> = ["wav","m4a","mp3","caf"]` as static sets; unrecognised extensions silently ignored.
- **done/ exclusion** — `scanForNewFiles` checks `url.pathComponents.contains("done")` to prevent re-processing moved files.
- **Symlink guard (T-61-03)** — `resourceValues(forKeys: [.isSymbolicLinkKey])` filters symlinks before processing.
- **Sequential FIFO (D-08)** — `pendingQueue: [URL]` drained one at a time via a single `Task`; no concurrent API calls.
- **Wait-for-stable (D-06)** — polls `attributesOfItem[.size]` at 1s intervals; two consecutive identical non-zero sizes = stable; 30-iteration cap.
- **Image path (WATCH-02, D-09)** — `processPhoto(imageURL:preview:false:forcePaperType:nil)` convenience overload handles Data reading + mediaType detection + compression internally.
- **Audio path (WATCH-03, D-11)** — `transcribe(audioURL:)` then `capture(_:source:.voice)`.
- **Post-processing (D-04, D-05)** — `moveToProcessed(_:autoDelete:)` either removes the file or moves it to `done/` with `filename-N.ext` counter on collision.
- **Failure tracking (WATCH-06)** — failed files append to `_failedFiles`; D-03 auto-clears entries whose URL no longer exists on disk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AppConfig has no shared singleton**
- **Found during:** Task 1 — first build attempt
- **Issue:** Plan referenced `AppConfig.shared.folderWatching` but `AppConfig` is a plain `Codable` struct with no static instance. `ConfigLoader.load()` is the project's config access pattern.
- **Fix:** Added `config: AppConfig.FolderWatchingConfig` parameter to `FolderWatcherService.init`; callers (AppDelegate) pass the config they loaded. `postProcess` reads `self.config.autoDeleteAfterProcessing`.
- **Files modified:** `FolderWatcherService.swift`, `FolderWatcherServiceTests.swift`
- **Commit:** c63e28d

**2. [Rule 1 - Bug] Swift 6 data-race error on weak self capture in DispatchSource event handler**
- **Found during:** Task 1 — second build attempt
- **Issue:** `source.setEventHandler { [weak self] in Task { await self?.handleDirectoryChange(dirURL) } }` triggered Swift 6 strict concurrency error: "passing closure as a 'sending' parameter risks causing data races" because the closure captured a mutable var `self` reference.
- **Fix:** Captured `self` strongly as `let capturedSelf = self` before the closure (actors are `Sendable` reference types; `weak` was unnecessary and caused the concurrency error). Also removed stale `await` from `handleDirectoryChange` call in initial scan (method is synchronous).
- **Files modified:** `FolderWatcherService.swift`
- **Commit:** c63e28d

**3. [Rule 3 - Blocking] NullThoughtRepository in tests did not match actual ThoughtRepository protocol**
- **Found during:** Task 1 — test run
- **Issue:** The stub `NullThoughtRepository` implemented methods from an older version of `ThoughtRepository` that no longer exists (`fetchThoughts`, `fetchAllThoughts`, etc.). The actual protocol (v2.x) has ~30 required methods across CRUD, therapy, tags, favorites, links, and bulk ops. Also, `ThoughtRepository: Actor` requires the conforming type to be an `actor`, not a `class`.
- **Fix:** Rewrote `NullThoughtRepository` as an `actor` implementing all current protocol methods with no-op stub returns.
- **Files modified:** `FolderWatcherServiceTests.swift`
- **Commit:** c63e28d

## Test Results

```
Test Suite 'FolderWatcherServiceTests' passed
Executed 15 tests, with 0 failures in 0.026 seconds
```

Tests cover:
- File classification (jpg, jpeg, heic, png, wav, m4a, txt, pdf)
- done/ directory exclusion in scanForNewFiles
- Known-file deduplication in scanForNewFiles
- Unsupported extension filtering in scanForNewFiles
- moveToProcessed: creates done/ subfolder
- moveToProcessed: appends -2 counter on first collision
- moveToProcessed: increments to -3 on second collision
- moveToProcessed: autoDelete removes file

## Known Stubs

None. All file processing routes to real service calls. The service requires `AppDelegate` to inject real `APIImageDescriptionService`, `TranscriptionService`, and `CaptureService` — wired in plan 02.

## Threat Flags

No new threat surface beyond what was modeled in the plan's STRIDE register. Symlink guard (T-61-03) implemented as specified.

## Self-Check: PASSED

- `Sources/DailyBriefMonitor/FolderWatcherService.swift` — FOUND (406 lines)
- `Tests/DailyBriefMonitorTests/FolderWatcherServiceTests.swift` — FOUND (309 lines)
- Commit c63e28d — FOUND
