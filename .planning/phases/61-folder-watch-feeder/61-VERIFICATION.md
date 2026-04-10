---
phase: 61-folder-watch-feeder
verified: 2026-04-10T16:13:00Z
status: gaps_found
score: 4/5 success criteria verified
overrides_applied: 0
gaps:
  - truth: "Moving a previously-failed file out of and back into the watched directory re-triggers the upload cleanly"
    status: failed
    reason: "On processing failure, the filename is appended to _failedFiles but NOT removed from knownFiles. When the user moves the file out, handleDirectoryChange clears the _failedFiles entry (D-03 auto-clear fires because the file no longer exists). When the user drops it back in, scanForNewFiles excludes it because its lastPathComponent is still in knownFiles — the retry never fires."
    artifacts:
      - path: "Sources/DailyBriefMonitor/FolderWatcherService.swift"
        issue: "processFile catch block (lines 341-350) appends to _failedFiles but never calls knownFiles.remove(url.lastPathComponent). The file stays invisible to future scans."
    missing:
      - "In the catch block of processFile, add: knownFiles.remove(url.lastPathComponent) so the filename is evicted from knownFiles on failure, allowing a move-out-and-back-in retry to be detected as a new file."
human_verification:
  - test: "Drop an image file into the watched directory and observe it is processed and moved to done/"
    expected: "File disappears from watched directory, appears in done/, and a thought appears in the Vigil dashboard"
    why_human: "Requires a running DailyBriefMonitor + live Vigil Core API; cannot verify filesystem side-effects or thought creation programmatically without executing the app"
  - test: "Drop an audio file (.m4a or .wav) into the watched audio directory"
    expected: "File moves to done/, a transcribed thought with source=voice appears in the dashboard"
    why_human: "Requires SFSpeechRecognizer authorization and a running Vigil Core instance"
  - test: "Drop an unsupported file (.txt or .pdf) into the watched directory"
    expected: "File remains in place, no error appears in menu bar, no thought created"
    why_human: "Requires running app to confirm no spurious error state is set"
  - test: "Kill Vigil Core, drop a photo — observe menu bar icon and dropdown"
    expected: "File stays in watched directory, menu bar shows orange exclamation triangle, dropdown shows 'Watcher: 1 failed' with filename:reason"
    why_human: "Requires running app and intentional service kill; cannot observe menu bar state programmatically"
---

# Phase 61: Folder Watch Feeder Verification Report

**Phase Goal:** DailyBriefMonitor watches configured local directories and feeds new image and audio files to Vigil Core through the same endpoints the dashboard uses — images flow through the Smart Photo Upload pipeline, audio through the voice transcription path — with safe error handling so nothing is lost on failure.
**Verified:** 2026-04-10T16:13:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dropping a new image file into a watched directory causes it to be processed by the Smart Photo Upload pipeline via DispatchSource (no polling) | VERIFIED | `DispatchSource.makeFileSystemObjectSource` with `O_EVTONLY` and `eventMask: .write` at FolderWatcherService.swift:130-132; `processPhoto(imageURL:preview:false:forcePaperType:nil)` at line 314-318 |
| 2 | Dropping a new audio file into a watched directory causes it to be transcribed through the voice-capture path | VERIFIED | `transcriptionService.transcribe(audioURL:url)` then `captureService.capture(text, source:.voice)` at lines 324-325 |
| 3 | After a successful upload the source file is moved to a "done" subdirectory (or deleted, per user preference) so it is not re-processed | VERIFIED | `postProcess(_:)` calls `moveToProcessed(_:autoDelete:config.autoDeleteAfterProcessing)` at line 394; `done/` subdirectory created upfront at start(); `scanForNewFiles` excludes `url.pathComponents.contains("done")` at line 198 |
| 4 | On upload failure the source file is left exactly where it is and DailyBriefMonitor surfaces a visible error state | VERIFIED | catch block (lines 341-349) appends `_failedFiles` without touching the file; menu bar reads `hasFailures`/`failedFiles` via 60s timer and `.onAppear` polling; `exclamationmark.triangle.fill` icon in DailyBriefMonitorApp.swift:71-72; failure list in MenuBarView.swift:61-83 |
| 5 | Moving a previously-failed file out of and back into the watched directory re-triggers the upload cleanly | FAILED | catch block does NOT call `knownFiles.remove(url.lastPathComponent)`; filename stays in `knownFiles` set; subsequent `scanForNewFiles` excludes the re-dropped file as already-known |

**Score:** 4/5 success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Sources/DailyBriefMonitor/FolderWatcherService.swift` | Actor with DispatchSource watching, file processing, error tracking (min 150 lines) | VERIFIED | 455 lines; contains actor, DispatchSource, processPhoto, transcribe+capture, moveToProcessed, failedFiles |
| `Tests/DailyBriefMonitorTests/FolderWatcherServiceTests.swift` | Unit tests for classification, post-processing, error tracking (min 80 lines) | VERIFIED | 309 lines; 15 tests, all passing |
| `Sources/DailyBriefMonitor/AppDelegate.swift` | FolderWatcherService lifecycle wiring | VERIFIED | Contains `private(set) var folderWatcher: FolderWatcherService?`, constructor call, `await watcher.start()`, `await watcher.stop()` |
| `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` | Watcher error state in menu bar icon | VERIFIED | Contains `watcherHasFailures`, `exclamationmark.triangle.fill`, `.foregroundStyle(.orange)`, passes `watcherFailedFiles` to MenuBarView |
| `Sources/DailyBriefMonitor/MenuBarView.swift` | Watcher failures section in dropdown | VERIFIED | Contains `watcherFailedFiles` property, "Watcher: N failed" header, `failure.url.lastPathComponent`, `failure.reason` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| FolderWatcherService | APIImageDescriptionService.processPhoto | `processPhoto(imageURL:preview:false:forcePaperType:nil)` | WIRED | Line 314-318; URL-based overload handles compression internally |
| FolderWatcherService | TranscriptionService + CaptureService | `transcribe(audioURL:)` then `capture(_:source:.voice)` | WIRED | Lines 324-325 |
| FolderWatcherService | FileManager (done/ move or delete) | `moveItem` / `removeItem` per `autoDeleteAfterProcessing` | WIRED | `moveToProcessed` at lines 358-391; `postProcess` at line 393-395 |
| AppDelegate | FolderWatcherService.start() | `applicationDidFinishLaunching` | WIRED | `Task { await watcher.start() }` at line 84 |
| AppDelegate | FolderWatcherService.stop() | `applicationWillTerminate` | WIRED | DispatchSemaphore bridge, `await watcher.stop()` at line 163 |
| DailyBriefMonitorApp label | FolderWatcherService.hasFailures | `else if watcherHasFailures` in HStack | WIRED | Line 70 of DailyBriefMonitorApp.swift |
| MenuBarView | FolderWatcherService.failedFiles | failure list section | WIRED | Lines 61-83 of MenuBarView.swift |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| MenuBarView failure list | `watcherFailedFiles` | `watcher.failedFiles` polled from actor via `await` in DailyBriefMonitorApp | Yes — actor `_failedFiles` is populated by real processing failures | FLOWING |
| DailyBriefMonitorApp icon | `watcherHasFailures` | `watcher.hasFailures` polled same way | Yes — derived from `_failedFiles.isEmpty` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `swift build` succeeds | `swift build` | `Build complete! (0.19s)` | PASS |
| All 15 FolderWatcherService tests pass | `swift test --filter FolderWatcherServiceTests` | `Executed 15 tests, with 0 failures` | PASS |
| FolderWatcherService exports correct symbols | static `classify`, `scanForNewFiles`, `moveToProcessed` are `internal` accessible to tests | Test file calls all three directly with `@testable import` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WATCH-01 | 61-01, 61-02 | DispatchSource directory watcher, no polling | SATISFIED | `DispatchSource.makeFileSystemObjectSource` with `O_EVTONLY`; AppDelegate wires lifecycle |
| WATCH-02 | 61-01 | Image files processed through Smart Photo Upload pipeline | SATISFIED | `processPhoto(imageURL:preview:false:forcePaperType:nil)` routes to same backend endpoint as dashboard |
| WATCH-03 | 61-01 | Audio files transcribed through voice-capture path | SATISFIED | `transcribe(audioURL:)` + `capture(_:source:.voice)` |
| WATCH-04 | 61-01 | Processed files moved to done/ or deleted | SATISFIED | `moveToProcessed` with collision counter, `autoDeleteAfterProcessing` toggle |
| WATCH-05 | Phase 62 | Settings UI for watched dirs (deferred) | DEFERRED | REQUIREMENTS.md maps WATCH-05 to Phase 62; Phase 62 roadmap entry confirms "Folder Watch Settings UI" |
| WATCH-06 | 61-01, 61-02 | Failures surface visible error state, source file untouched | PARTIAL | File is correctly left in place on failure; menu bar icon and dropdown wired. Retry path broken (SC #5 gap). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| FolderWatcherService.swift | 349 | `_failedFiles.append(...)` in catch block — no `knownFiles.remove(url.lastPathComponent)` | Blocker | Failed files can never be retried by move-out-and-back-in; they are permanently invisible to `scanForNewFiles` |

### Human Verification Required

**1. Image processing end-to-end**

**Test:** Enable `folderWatching.enabled: true` in `~/.config/dailybrief/config.json`. Rebuild and relaunch DailyBriefMonitor. Drop a photo of handwritten notes into `~/Jarvis/Images/`.
**Expected:** File disappears from `~/Jarvis/Images/` within 2-3 seconds and appears in `~/Jarvis/Images/done/`. A new thought with handwriting content appears in the Vigil dashboard.
**Why human:** Requires a running app + live Vigil Core API + filesystem I/O that can't be triggered without app execution.

**2. Audio processing end-to-end**

**Test:** Drop an `.m4a` or `.wav` recording into `~/Jarvis/Audio/`.
**Expected:** File moves to `~/Jarvis/Audio/done/`. A new thought with `source=voice` and transcribed text appears in the dashboard.
**Why human:** Requires SFSpeechRecognizer authorization and a running Vigil Core instance.

**3. Unsupported file type ignored**

**Test:** Drop a `.txt` or `.pdf` file into `~/Jarvis/Images/`.
**Expected:** File remains untouched in the directory. No error appears in menu bar. No thought is created.
**Why human:** Requires running app to confirm no error state is spuriously set.

**4. Failure visibility (WATCH-06)**

**Test:** Kill Vigil Core. Drop a photo into `~/Jarvis/Images/`. Wait 2-3 seconds.
**Expected:** File stays in `~/Jarvis/Images/` (not moved). Menu bar icon shows orange exclamation triangle. Clicking menu shows "Watcher: 1 failed" with filename and reason like "Network error".
**Why human:** Requires running app and intentional service kill; menu bar icon state cannot be observed programmatically.

### Gaps Summary

**1 blocker gap preventing full goal achievement:**

SC #5 ("Moving a previously-failed file out of and back into the watched directory re-triggers the upload cleanly") is broken. When `processFile` fails, it appends to `_failedFiles` but does NOT remove the filename from `knownFiles`. The `handleDirectoryChange` D-03 auto-clear removes the `_failedFiles` entry when the file disappears from disk, but `knownFiles` is never cleared. When the user drops the same-named file back in, `scanForNewFiles` excludes it as already-known — the retry never fires.

**Fix is surgical:** In the `catch` block of `processFile` (around line 349), add:
```swift
knownFiles.remove(url.lastPathComponent)
```
This ensures failed files are evicted from `knownFiles`, making them visible to the next scan when re-dropped.

The 4 end-to-end human verification tests (SC #1–#4) cannot be confirmed without running the app, but the code paths are fully wired and substantive based on static analysis.

---

_Verified: 2026-04-10T16:13:00Z_
_Verifier: Claude (gsd-verifier)_
