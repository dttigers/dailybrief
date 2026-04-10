---
phase: 61-folder-watch-feeder
reviewed: 2026-04-10T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - Sources/DailyBriefMonitor/FolderWatcherService.swift
  - Sources/DailyBriefMonitor/AppDelegate.swift
  - Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift
  - Sources/DailyBriefMonitor/MenuBarView.swift
  - Sources/DailyBriefMonitor/Settings/SettingsView.swift
  - Tests/DailyBriefMonitorTests/FolderWatcherServiceTests.swift
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-04-10
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 61 introduces `FolderWatcherService`, an actor-isolated DispatchSource-based file watcher that routes dropped images and audio files through the existing Vigil Core pipeline. The implementation is generally well-structured with good actor isolation, symlink protection, stability debouncing, and FIFO sequential processing.

Three issues need attention before shipping: a crash risk from a force-unwrap on a potentially-nil thought ID (critical), a cross-folder deduplication logic bug that silently drops files when both watch folders contain identically-named files (warning), and a deadlock risk in the termination path (warning). Two UI copy mismatches in `SettingsView` will mislead users about which file formats are actually supported.

---

## Critical Issues

### CR-01: Force-unwrap on thought ID will crash if capture returns nil ID

**File:** `Sources/DailyBriefMonitor/FolderWatcherService.swift:324`
**Issue:** After `captureService.capture(text, source: .voice)` succeeds, the code immediately force-unwraps `thought.id!` to pass to `triageThought`. The `Thought` model's `id` field is optional (`Int64?`). If the repository returns a thought with a nil ID (e.g., a server-side anomaly, a transient partial response, or any `ThoughtRepository` implementation that does not populate `id`), the process will crash with a fatal error rather than falling through to the failure path. The catch block immediately below cannot catch a force-unwrap crash.

**Fix:**
```swift
// Replace:
let thought = try await captureService.capture(text, source: .voice)
await triageThought(id: thought.id!, content: text)

// With:
let thought = try await captureService.capture(text, source: .voice)
if let thoughtId = thought.id {
    await triageThought(id: thoughtId, content: text)
} else {
    NSLog("FolderWatcherService: captured thought has no ID, skipping triage")
}
```

---

## Warnings

### WR-01: Cross-folder filename collision silently drops files

**File:** `Sources/DailyBriefMonitor/FolderWatcherService.swift:47, 224-226`
**Issue:** `knownFiles` is a single `Set<String>` that stores `lastPathComponent` (filename only) for both the audio folder and the image folder. Since both directories are watched by the same service instance and share the same `knownFiles` set, dropping a file named `recording.m4a` into the audio folder marks `"recording.m4a"` as known. If the user later drops a different `recording.m4a` into the image folder (or vice versa), `scanForNewFiles` returns it as "already known" and it is silently skipped with no error, no failure entry, and no log. This is especially likely when a user re-drops a previously processed file with the same name into the other folder.

**Fix:** Key `knownFiles` by a compound value that includes the parent directory, so identical filenames in different folders are treated independently:
```swift
// Change the type:
private var knownFiles: Set<String> = []

// Use a stable key that includes the parent path:
private func knownFileKey(_ url: URL) -> String {
    url.deletingLastPathComponent().path + "/" + url.lastPathComponent
}

// In handleDirectoryChange and processFile, replace url.lastPathComponent
// with knownFileKey(url) for all knownFiles insertions/removals.
```

### WR-02: Deadlock risk in applicationWillTerminate semaphore pattern

**File:** `Sources/DailyBriefMonitor/AppDelegate.swift:161-167`
**Issue:** `applicationWillTerminate` is called on the main thread. The code blocks the main thread with `semaphore.wait(timeout: .now() + 2)` while dispatching a `Task { await watcher.stop() }`. `FolderWatcherService.stop()` is an actor-isolated method, so it will execute on the actor's internal executor. However, any `processingTask` that is currently suspended inside `processFile` — specifically inside the `await waitForStable` sleep — will be cooperatively cancelled. Cancellation of `Task.sleep` resumes the task, which then returns from `processFile`, which then allows the actor's `stop()` to complete. In most cases this works. However, if the Swift concurrency runtime ever needs to hop back through the main actor (e.g., for a `@MainActor`-isolated continuation inside the processing pipeline), blocking the main thread will deadlock for the full 2-second timeout. The pattern is fragile.

**Fix:** If a clean shutdown matters, prefer the async-safe approach using `NotificationCenter` or a dedicated `Task` that is awaited from a background context. For a menu bar app where macOS forces termination after a short grace period, the simpler fix is to just call `cancel()` synchronously without the semaphore:
```swift
func applicationWillTerminate(_ notification: Notification) {
    // stop() cancels DispatchSources synchronously; in-flight Tasks are cancelled cooperatively.
    Task { await folderWatcher?.stop() }
    globalHotKey?.unregister()
}
```

### WR-03: Processing loop not restarted after a directory change arrives while the loop is running

**File:** `Sources/DailyBriefMonitor/FolderWatcherService.swift:229-232`
**Issue:** `handleDirectoryChange` only starts a new processing loop when `newFiles.isEmpty` is false AND the current `processingTask` is nil or cancelled. If a new file arrives while the processing loop is actively running (task is non-nil and not cancelled), `pendingQueue.append(url)` adds it to the queue but `startProcessingLoop()` is not called. This is intentional by design — the running loop drains the queue at line 240. However, there is a race: the loop checks `pendingQueue.isEmpty` at line 240 before setting `processingTask = nil` at line 244. If `handleDirectoryChange` appends to the queue after the loop's final `isEmpty` check but before `processingTask = nil`, the file is queued and `processingTask` is still non-nil, so `startProcessingLoop` is not called. The file sits in `pendingQueue` indefinitely until the next VNODE event fires.

**Fix:** Re-check the queue after `processingTask = nil` is set:
```swift
processingTask = Task {
    while !self.pendingQueue.isEmpty {
        let url = self.pendingQueue.removeFirst()
        await self.processFile(url)
    }
    self.processingTask = nil
    // Re-drain in case items arrived during the last processFile await.
    if !self.pendingQueue.isEmpty {
        self.startProcessingLoop()
    }
}
```

### WR-04: Main-thread polling fetches two actor properties in separate awaits — stale interleave

**File:** `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift:36-44, 49-58`
**Issue:** The timer and `onAppear` handlers fetch `watcher.failedFiles` and `watcher.hasFailures` as two separate `await` calls. Between the two awaits the actor may process new failures, making `watcherFailedFiles` and `watcherHasFailures` inconsistent (e.g., `hasFailures == false` but `failedFiles` is non-empty, or vice versa). In practice the polling interval is 60 seconds so the window is tiny, but the inconsistency can cause the menu bar badge icon to disagree with the failure list shown in the dropdown.

**Fix:** Expose a single snapshot property on the actor that returns both values atomically:
```swift
// In FolderWatcherService:
public var failureSnapshot: (files: [(url: URL, reason: String)], hasFailures: Bool) {
    (_failedFiles, !_failedFiles.isEmpty)
}

// In DailyBriefMonitorApp:
Task {
    if let watcher = appDelegate.folderWatcher {
        let snapshot = await watcher.failureSnapshot
        await MainActor.run {
            watcherFailedFiles = snapshot.files
            watcherHasFailures = snapshot.hasFailures
        }
    }
}
```

---

## Info

### IN-01: Settings UI lists file formats not supported by FolderWatcherService

**File:** `Sources/DailyBriefMonitor/Settings/SettingsView.swift:463, 479`
**Issue:** The Folders settings pane shows two help strings that list file formats that do not match the accepted extensions in `FolderWatcherService`:

- Audio help text (line 463) includes `.aiff` — not in `FolderWatcherService.audioExtensions` (`wav`, `m4a`, `mp3`, `caf`).
- Image help text (line 479) includes `.gif` and `.webp` — neither is in `FolderWatcherService.imageExtensions` (`jpg`, `jpeg`, `png`, `heic`, `tiff`, `bmp`).

A user who drops a `.aiff`, `.gif`, or `.webp` file will see it silently ignored with no feedback, because unrecognised extensions are filtered out by `classify()`. The UI copy is the source of truth users read.

**Fix:** Update the help strings to match the actual accepted extensions:
```swift
// Audio:
Text("Drop audio files here (.wav, .mp3, .m4a, .caf) for auto-transcription")

// Image:
Text("Drop images here (.jpg, .jpeg, .png, .heic, .tiff, .bmp) for AI description")
```
Alternatively, derive the help text dynamically from `FolderWatcherService.audioExtensions` / `imageExtensions` to keep them in sync automatically.

### IN-02: waitForStable requires 3 reads to confirm stability, comment says 2

**File:** `Sources/DailyBriefMonitor/FolderWatcherService.swift:251-276`
**Issue:** The doc comment on `waitForStable` says "two consecutive reads return the same non-zero size." The implementation actually requires 3 reads to confirm (one to set `previousSize`, then two matching reads to increment `stableCount` to 2). This means a minimum 3-second wait per file regardless of size. The behavior is safe and conservative, but the comment is wrong and could mislead future maintainers.

**Fix:** Update either the implementation or the comment. The simplest fix is to update the comment:
```swift
/// Polls the file size at 1-second intervals until it stabilises (three
/// consecutive reads return the same non-zero size — the first read
/// establishes the baseline, two matches confirm stability).
/// Returns `true` if the file is ready to process, `false` if it disappeared.
/// Times out after 30 seconds to avoid an infinite wait on large files.
```
Or reduce the threshold to match the comment (`stableCount >= 1` instead of `>= 2`), which gives a 2-second minimum wait.

---

_Reviewed: 2026-04-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
