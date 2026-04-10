---
phase: 61-folder-watch-feeder
plan: 02
subsystem: DailyBriefMonitor
tags: [folder-watch, menu-bar, app-delegate, lifecycle, error-visibility]
dependency_graph:
  requires:
    - FolderWatcherService actor (Phase 61 Plan 01)
    - APIImageDescriptionService (JarvisCore)
    - TranscriptionService (JarvisCore)
    - CaptureService (JarvisCore)
    - AppConfig.FolderWatchingConfig (JarvisCore)
  provides:
    - FolderWatcherService lifecycle (start on launch, stop on terminate)
    - Menu bar orange exclamation triangle icon on watcher failures
    - Menu bar dropdown failure count + filename:reason list
  affects:
    - AppDelegate.swift (lifecycle wiring)
    - DailyBriefMonitorApp.swift (icon state + polling)
    - MenuBarView.swift (failure list section)
tech_stack:
  added: []
  patterns:
    - DispatchSemaphore bridge for async actor shutdown in synchronous applicationWillTerminate
    - Timer-based polling (60s) + onAppear immediate poll for actor-isolated state
    - MainActor.run to write async actor reads back to @State
key_files:
  created: []
  modified:
    - Sources/DailyBriefMonitor/AppDelegate.swift
    - Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift
    - Sources/DailyBriefMonitor/MenuBarView.swift
decisions:
  - FolderWatcherService init receives config: AppConfig.FolderWatchingConfig from AppDelegate (consistent with plan 01 deviation — no singleton)
  - watcher error icon is lowest-priority state in HStack (shows only when checker and updater are both idle/not-running)
  - polling interval matches existing 60s timer rather than adding a second timer
metrics:
  duration_minutes: 15
  completed_date: "2026-04-10"
  tasks_completed: 1
  tasks_total: 2
  files_created: 0
  files_modified: 3
  lines_added: 60
---

# Phase 61 Plan 02: AppDelegate Wiring + Menu Bar Integration Summary

**One-liner:** FolderWatcherService wired into AppDelegate lifecycle with orange exclamation triangle icon and filename:reason failure list in menu bar dropdown.

## What Was Built

Wired `FolderWatcherService` from Plan 01 into the running DailyBriefMonitor app:

**AppDelegate.swift:**
- Added `private(set) var folderWatcher: FolderWatcherService?` property (readable by DailyBriefMonitorApp for polling)
- In `applicationDidFinishLaunching`: casts `imageDescriptionService` to `APIImageDescriptionService`, constructs `FolderWatcherService` with all injected dependencies + config, starts it via `Task { await watcher.start() }`
- In `applicationWillTerminate`: bridges the async `watcher.stop()` call through a `DispatchSemaphore` with a 2-second timeout to ensure DispatchSources are cancelled and file descriptors closed before process exit

**DailyBriefMonitorApp.swift:**
- Added `@State private var watcherHasFailures` and `watcherFailedFiles` state properties
- In the label HStack: added `else if watcherHasFailures` branch showing `exclamationmark.triangle.fill` in `.orange` (lowest priority — only shows when checker and updater have no active state)
- Passes `watcherFailedFiles` to `MenuBarView`
- Polls watcher actor state on the existing 60s timer tick and on `.onAppear` (menu open), bridging actor isolation via `await` + `MainActor.run`

**MenuBarView.swift:**
- Added `var watcherFailedFiles: [(url: URL, reason: String)] = []` property
- Failure section between schedule info and Actions divider: shows count header, up to 5 entries as `filename: reason` in monospaced red, and overflow count if more than 5

## Deviations from Plan

None. Plan executed exactly as written. The only implementation detail not in the plan was passing `config: config.folderWatching` to `FolderWatcherService.init` — this was already established as the correct pattern in Plan 01's deviation doc and used consistently here.

## Task 2: Checkpoint Pending Human Verification

Task 2 is a `checkpoint:human-verify` gate. It requires manual end-to-end testing:

1. **Image processing (WATCH-02):** Drop a photo into `~/Jarvis/Images/` — expect thought created + file moved to `done/`
2. **Audio processing (WATCH-03):** Drop an audio file into `~/Jarvis/Audio/` — expect transcribed thought + file moved to `done/`
3. **Unsupported file ignored (D-07):** Drop `.txt` into `~/Jarvis/Images/` — expect no processing, no error
4. **Error visibility (WATCH-06):** Kill Vigil Core, drop photo — expect file stays, menu bar shows orange triangle + "Watcher: 1 failed" with filename:reason
5. **Retry by move-out-and-back:** Restart Vigil Core, move failed file back — expect successful processing

Prerequisites:
- `folderWatching.enabled: true` in `~/.config/dailybrief/config.json`
- Rebuild and relaunch DailyBriefMonitor
- Vigil Core running (`:3001` or `api.vigilhub.io`)

**Status: checkpoint: pending human verification**

## Known Stubs

None.

## Threat Flags

No new threat surface beyond the plan's STRIDE register (T-61-06, T-61-07, T-61-08 all accepted).

## Self-Check

- `Sources/DailyBriefMonitor/AppDelegate.swift` — modified (contains `private(set) var folderWatcher`, `FolderWatcherService(`, `await watcher.start()`, `await watcher.stop()`)
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` — modified (contains `watcherHasFailures`, `exclamationmark.triangle.fill`, `watcherFailedFiles`)
- `Sources/DailyBriefMonitor/MenuBarView.swift` — modified (contains `watcherFailedFiles`, `Watcher:`, `lastPathComponent`, `failure.reason`)
- Commit bc59a81 — FOUND
- `swift build` — Build complete

## Self-Check: PASSED
