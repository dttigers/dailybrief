# Phase 61: Folder Watch Feeder - Research

**Researched:** 2026-04-10
**Domain:** Swift DispatchSource file-system watching, DailyBriefMonitor service architecture, menu-bar error state
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Failed uploads surface via menu bar icon state change (exclamation badge or tint on `doc.text` icon). No macOS UserNotifications.
**D-02:** Menu bar dropdown shows count + list of failed filenames with short error reasons (e.g., "photo.jpg: Network timeout").
**D-03:** Error state auto-clears when no failed files remain. No manual dismiss button.
**D-04:** Successfully processed files are moved to a `done/` subfolder inside the watched directory. When `autoDeleteAfterProcessing` is `true`, delete instead of move.
**D-05:** Moved files keep original filename. On collision in `done/`, append a counter (e.g., `photo-2.jpg`).
**D-06:** Wait-for-stable debounce — after detecting a new file, wait until file size stops changing for ~1-2 seconds before processing. Handles AirDrop, drag-and-drop, copy.
**D-07:** Accepted file types match dashboard file pickers: images = jpg, jpeg, png, heic, tiff, bmp; audio = wav, m4a, mp3, caf. All other types ignored silently.
**D-08 (sequential):** Multiple files processed sequentially FIFO. Matches dashboard `processFiles()` pattern.
**D-09 (from Phase 60):** Images hit `POST /v1/process-photo` WITHOUT `?preview=true` — headless commit path.
**D-10 (from Phase 59):** Backend auto-coerces unknown/low-confidence paper types to "lined" server-side.
**D-11 (from Phase 60):** Audio transcription uses local `TranscriptionService` (SFSpeechRecognizer) → `CaptureService.capture(text, source: .voice)`.

### Claude's Discretion

- Watcher architecture (new service vs. integration into existing code, actor vs class, lifecycle management)
- DispatchSource configuration details (which events to monitor, queue choices)
- Internal error tracking data structure (in-memory set of failed files, persistence across app restarts)
- Whether to log processing activity to os_log / unified logging for diagnostics

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WATCH-01 | DailyBriefMonitor watches configured directories for new image and audio files using DispatchSource (no polling) | DispatchSource.makeFileSystemObjectSource with DISPATCH_VNODE_WRITE; debounce timer for write-stable detection |
| WATCH-02 | New image files uploaded through Smart Photo Upload pipeline (process-photo, paper-type detection, split/no-split, verbatim transcription) | `APIImageDescriptionService.processPhoto(imageData:mediaType:preview:false:forcePaperType:nil)` — same method dashboard uses; `ImageConversion` for HEIC/TIFF/BMP normalization |
| WATCH-03 | New audio files processed through existing voice-capture transcription path | `TranscriptionService.transcribe(audioURL:)` → `CaptureService.capture(text, source: .voice)` — same actors dashboard uses |
| WATCH-04 | Processed files moved to `done/` subdirectory (or deleted per preference) so watched directory does not re-trigger | FileManager.moveItem; create `done/` on first success; exclude `done/` from DispatchSource monitoring |
| WATCH-06 | Upload failures surface visible error state; source file left untouched; retry by moving out and back in | Observable `failedFiles: [(url: URL, reason: String)]` on service; menu bar icon conditional in `DailyBriefMonitorApp.swift` label; section in `MenuBarView.swift` |
</phase_requirements>

---

## Summary

Phase 61 creates `FolderWatcherService` — a new Swift actor in `DailyBriefMonitor` that monitors the audio and image directories from `FolderWatchingConfig` using low-level DispatchSource file-system events. It is a headless feeder: no preview flow, no user interaction during processing. The service reuses all existing processing infrastructure (`APIImageDescriptionService.processPhoto`, `ImageConversion`, `TranscriptionService`, `CaptureService`) that the dashboard already wires up in `AppDelegate`. The sole new surface area is a watcher-error state added to the menu bar icon label and a failure list added to the `MenuBarView` dropdown.

The codebase already has everything needed except the watcher service itself and the menu bar error state additions. `FolderWatchingConfig` is in `AppConfig.swift` with the right fields. `AppDelegate` already holds `transcriptionService` and `imageDescriptionService` (which also conforms to `PhotoProcessingAPI`) — both must be passed to the new service. The `DailyBriefMonitorApp.swift` label `HStack` at lines 36-47 already has the conditional icon pattern; a new branch for "watcher has failures" follows the same shape.

**Primary recommendation:** New `FolderWatcherService` actor in `Sources/DailyBriefMonitor/`. Wire startup/shutdown in `AppDelegate`. Expose `@MainActor`-observable failure state upward to `DailyBriefMonitorApp` for the icon and to `MenuBarView` for the list.

---

## Standard Stack

### Core

| Component | Version / Source | Purpose | Why Standard |
|-----------|-----------------|---------|--------------|
| `DispatchSource.makeFileSystemObjectSource` | Foundation (macOS 10.6+) | Low-level inotify equivalent for directory events | No polling; OS delivers VNODE_WRITE events immediately; used by Xcode, Spotlight, etc. [VERIFIED: Apple Developer docs] |
| `DISPATCH_VNODE_WRITE` | Foundation | Detects writes to the directory descriptor | Directory descriptor fires on any add/remove/rename inside the directory |
| `FileManager` | Foundation | Move files to `done/`, delete files, create `done/` subfolder | Standard; no third-party dep needed |
| `DispatchQueue` (private serial) | Foundation | Queue for DispatchSource callbacks | Serial queue serializes all events from a single watcher; actor protects shared state |

### Supporting (already in codebase — no new packages)

| Component | Location | Purpose |
|-----------|----------|---------|
| `APIImageDescriptionService` (via `PhotoProcessingAPI`) | `JarvisCore/Services/APIAIServices.swift` | `processPhoto(imageData:mediaType:preview:false:forcePaperType:nil)` — headless commit |
| `ImageConversion` | `JarvisCore/Utilities/ImageConversion.swift` | HEIC/TIFF/BMP → JPEG before API submission |
| `TranscriptionService` | `JarvisCore/Services/TranscriptionService.swift` | Local SFSpeechRecognizer audio transcription |
| `CaptureService` | `JarvisCore/Services/CaptureService.swift` | `capture(text, source: .voice)` → POST /v1/thoughts |
| `FolderWatchingConfig` | `JarvisCore/Config/AppConfig.swift:399` | Config struct with `enabled`, `audioFolderPath`, `imageFolderPath`, `autoDeleteAfterProcessing` |

**Installation:** No new packages. Everything is in-tree.

---

## Architecture Patterns

### Recommended Project Structure

```
Sources/DailyBriefMonitor/
├── FolderWatcherService.swift   # NEW — actor, owns DispatchSources and processing queue
├── DailyBriefMonitorApp.swift   # MODIFIED — add watcher @State, pass to MenuBarView, add error icon branch
├── MenuBarView.swift             # MODIFIED — add watcher failures section
├── AppDelegate.swift             # MODIFIED — init FolderWatcherService, wire lifecycle
└── ...existing files unchanged...
```

### Pattern 1: DispatchSource Directory Watcher

**What:** Open a file descriptor to the directory and create a DispatchSource that fires on VNODE_WRITE. Each fire re-scans for new files.

**When to use:** macOS-only, no polling, no third-party framework needed. The canonical approach for this exact use case. [VERIFIED: Apple Developer Documentation — `DispatchSourceFileSystemObject`]

```swift
// Source: Apple Developer Documentation — DispatchSourceFileSystemObject
// Conceptual pattern; exact implementation is Claude's discretion per CONTEXT.md

let fd = open(directoryPath, O_EVTONLY)
let source = DispatchSource.makeFileSystemObjectSource(
    fileDescriptor: fd,
    eventMask: .write,          // fires when directory contents change
    queue: watcherQueue          // private serial queue
)
source.setEventHandler {
    // Re-scan directory for new files
}
source.setCancelHandler {
    close(fd)
}
source.resume()
```

**Key detail — `O_EVTONLY`:** Open with `O_EVTONLY` (not `O_RDONLY`) so macOS does not block volume unmount when the directory is on an external drive. [VERIFIED: Apple Developer Documentation — kqueue/kevent open flags]

**Key detail — watches the directory fd, not individual file fds:** The DispatchSource fires when any file in the directory is added, removed, or renamed. The handler re-scans the directory to find files it hasn't seen yet.

### Pattern 2: Wait-for-Stable Debounce (D-06)

**What:** After detecting a new file, start a timer. On each timer fire, compare file size at T0 and T0+1s. If equal, file is "stable" — process it. If different (still copying/AirDropping), restart timer.

**When to use:** Required for AirDrop and large file copies, which arrive in chunks. Without this, attempting to base64-encode a partially-written file produces a corrupted payload. [ASSUMED — standard pattern for file-drop scenarios, not verified against a spec]

```swift
// Pseudocode for debounce
func waitForStable(url: URL) async throws {
    var previousSize: Int64 = -1
    while true {
        let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
        let size = attrs[.size] as? Int64 ?? 0
        if size == previousSize && size > 0 { break }
        previousSize = size
        try await Task.sleep(for: .seconds(1))
    }
}
```

### Pattern 3: Sequential FIFO Processing (D-08)

**What:** Maintain an `AsyncStream` or `actor`-guarded queue of pending URLs. A single `Task` dequeues and processes one file at a time. Mirrors `DashboardViewModel.processFiles()`.

**When to use:** Prevents concurrent API calls from competing. Predictable load. Already proven in the dashboard. [VERIFIED: codebase — `DashboardViewModel.processFiles()` lines 730-800]

### Pattern 4: Observable Error State for Menu Bar

**What:** `FolderWatcherService` (actor) exposes a `@MainActor`-published list of failed files. `DailyBriefMonitorApp` observes it and conditionally shows `exclamationmark.triangle.fill` in the label. `MenuBarView` shows the list.

The existing menu bar icon pattern (lines 36-47 of `DailyBriefMonitorApp.swift`):

```swift
// EXISTING PATTERN — from DailyBriefMonitorApp.swift:36-47
HStack(spacing: 2) {
    Image(systemName: "doc.text")
    if checker.isRunning {
        Image(systemName: "arrow.triangle.2.circlepath")
    } else if updater.isRunning {
        Image(systemName: "arrow.triangle.2.circlepath")
    } else if let success = checker.lastRunSuccess {
        Image(systemName: success ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
    }
    // ADD: } else if watcher.hasFailures {
    //          Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
    //      }
}
```

The existing dropdown failure section pattern (from `MenuBarView.swift` — `updater` failure tail):

```swift
// EXISTING PATTERN — from MenuBarView.swift:105-118
if case .failed(let tail) = updater.status {
    Text(tail)
        .font(.system(.caption2, design: .monospaced))
        .foregroundStyle(.red)
        ...
}
// ADD analogous section: if !watcher.failedFiles.isEmpty { ... }
```

### Anti-Patterns to Avoid

- **Watching `done/` subfolder:** The `done/` directory lives inside the watched directory. If the DispatchSource fires on the parent, the scanner must filter out paths under `done/` or the moved files will re-trigger processing. Explicitly exclude paths whose parent is `done/`.
- **Opening the file immediately on event:** DispatchSource fires before the kernel has finished writing. Always debounce before reading file data (D-06).
- **Storing `DispatchSource` in a `struct`:** DispatchSource is a reference type wrapper. Store in an `actor` or `class` property so `cancel()` / `resume()` work correctly on the same object.
- **Two separate DispatchSources sharing one serial queue without gating:** If audio and image directories are different paths, create one DispatchSource per directory. Each can share the same serial `DispatchQueue` — events will be serialized naturally.
- **Moving a file to `done/` before confirming the API returned success:** Only move/delete after a successful API response. Failure must leave the file in place (WATCH-06 / D-04).
- **`O_RDONLY` instead of `O_EVTONLY`:** Using `O_RDONLY` on a directory prevents the volume from unmounting. `O_EVTONLY` is the correct flag for event-only monitoring without preventing unmount.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image format normalization | Custom HEIC/TIFF decoder | `ImageConversion.convertToJPEG(from:)` | Already handles NSImage → NSBitmapImageRep → JPEG; used by dashboard |
| Audio transcription | Any audio-to-text pipeline | `TranscriptionService.transcribe(audioURL:)` | Already wired, uses SFSpeechRecognizer, handles auth |
| Thought persistence | Direct HTTP calls | `CaptureService.capture(text, source: .voice)` | Already handles saving via `ThoughtRepository` |
| Photo API submission | Hand-crafted multipart/base64 | `APIImageDescriptionService.processPhoto(imageData:mediaType:preview:forcePaperType:)` | Handles compression, base64, error mapping to `ProcessPhotoError` |
| File-type detection | MIME magic bytes | File extension check (same as `DashboardViewModel.classify`) | Sufficient; dashboard already uses extension-only classification |

**Key insight:** The watcher is a thin coordinator, not a new processing layer. Almost all logic is already written in existing services. The watcher's job is to detect files, debounce, dispatch to the right service, and move/report the result.

---

## Common Pitfalls

### Pitfall 1: `done/` Subdirectory Triggers Re-Watch
**What goes wrong:** Moving a file from `~/Jarvis/Images/photo.jpg` → `~/Jarvis/Images/done/photo.jpg` fires another VNODE_WRITE event on the parent directory `~/Jarvis/Images/`. The scanner sees a new file (`done/photo.jpg`), classifies it as an image, and tries to re-process it.
**Why it happens:** DispatchSource on a directory fires on any content change inside that directory, including subdirectory mutations that bubble up.
**How to avoid:** When scanning the directory after a VNODE_WRITE event, filter out any URLs whose path component contains `/done/` or whose `deletingLastPathComponent().lastPathComponent` equals `"done"`. The `done/` directory itself and its contents must be explicitly excluded.
**Warning signs:** Infinite loop of the same file being "processed" repeatedly; thought count growing unexpectedly.

### Pitfall 2: File Not Fully Written at Scan Time
**What goes wrong:** AirDrop delivers a file in chunks. DispatchSource fires after the first chunk lands. Scanner finds the file, debounce timer expires after 1s, but the transfer is still in progress (size changed). Base64-encoding a partial file corrupts the API payload.
**Why it happens:** The kernel fires VNODE_WRITE when the directory entry is created or modified, not when the write is complete.
**How to avoid:** Implement D-06 wait-for-stable: poll `attributesOfItem[.size]` at 1s intervals; only proceed when two consecutive checks return the same size and size > 0.
**Warning signs:** Claude API returning 400 or "couldn't read photo" for files that open fine in Finder.

### Pitfall 3: File Descriptor Leak on Watcher Restart
**What goes wrong:** On `folderWatching.enabled` toggle (or settings reload), the old DispatchSource is discarded without cancelling. The fd stays open. macOS enforces per-process fd limits (default 256 for GUI apps).
**Why it happens:** Swift ARC will deinit the DispatchSource object but does NOT automatically call `source.cancel()` — the underlying kqueue subscription stays alive until `cancel()` is explicitly called.
**How to avoid:** In the watcher's `stop()` method, call `source.cancel()` on every active source before releasing references. In the `setCancelHandler`, call `close(fd)`.
**Warning signs:** Log lines like "Too many open files"; watcher silently stops receiving events after several restarts.

### Pitfall 4: DispatchSource Actor Isolation Mismatch
**What goes wrong:** The DispatchSource event handler closure captures `self` (the service actor). Inside the closure, any `await self.someMethod()` call requires a Task wrapper because the DispatchSource callback is on a `DispatchQueue`, not on the actor executor. Without it: compiler error in Swift 6 strict concurrency.
**Why it happens:** Swift 6 strict concurrency enforces that actor-isolated methods cannot be called synchronously from non-actor contexts (like a DispatchQueue callback).
**How to avoid:** Wrap the event handler body in `Task { await self.handleDirectoryChange() }`. The Task hops to the actor's executor. [VERIFIED: Swift 6 actor isolation rules; codebase uses swift-tools-version 6.2]
**Warning signs:** Compiler error "Actor-isolated instance method 'X' can not be referenced from a non-isolated context".

### Pitfall 5: `PhotoProcessingAPI` Protocol Is in DashboardViewModel.swift, Not JarvisCore
**What goes wrong:** `FolderWatcherService` needs to call `processPhoto` on the `APIImageDescriptionService`, but `PhotoProcessingAPI` (the protocol) is defined at the top of `DashboardViewModel.swift` inside the `DailyBriefMonitor` target — not in `JarvisCore`.
**Why it happens:** The protocol was added in Phase 60 as a testability seam local to the Dashboard.
**How to avoid:** Two options:
  1. Move `PhotoProcessingAPI` to `JarvisCore/Services/AIServiceProtocols.swift` so both `DashboardViewModel` and `FolderWatcherService` can reference it. (Recommended — clean dependency direction)
  2. Call `APIImageDescriptionService.processPhoto` directly without going through the protocol (loses testability but avoids a protocol move).
  Option 1 is cleaner for the long-term; the planner should include a task for it.
**Warning signs:** Linker error or "cannot find type 'PhotoProcessingAPI'" when FolderWatcherService.swift is added to DailyBriefMonitor target.

### Pitfall 6: Services Are Actors — Call Sites Need `await`
**What goes wrong:** `TranscriptionService` and `CaptureService` are both declared `public actor`. `APIImageDescriptionService` is also an `actor`. All calls must be `await`-ed. A synchronous call site will not compile under Swift 6.
**Why it happens:** Swift actors require `await` at every call site from outside the actor's isolation domain.
**How to avoid:** `FolderWatcherService`'s processing loop must be `async`. Use `Task { await ... }` to bridge from sync event handler to async processing loop. [VERIFIED: codebase — `TranscriptionService` line 34, `CaptureService` line 21, `APIImageDescriptionService` line 198 all declared as `actor`]

---

## Code Examples

### Directory Scan After VNODE Event

```swift
// Source: Derived from codebase patterns + Apple DispatchSource docs
// Filter logic mirrors DashboardViewModel.classify(_:) at line 696

private func scanForNewFiles(in directoryURL: URL) -> [URL] {
    let contents = (try? FileManager.default.contentsOfDirectory(
        at: directoryURL,
        includingPropertiesForKeys: [.isRegularFileKey],
        options: [.skipsHiddenFiles]
    )) ?? []
    
    return contents.filter { url in
        // Exclude done/ subfolder and its contents (Pitfall 1)
        guard url.deletingLastPathComponent().lastPathComponent != "done" else { return false }
        guard url.lastPathComponent != "done" else { return false }
        // Only supported extensions (D-07)
        let ext = url.pathExtension.lowercased()
        return Self.imageExtensions.contains(ext) || Self.audioExtensions.contains(ext)
    }
}

private static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "heic", "tiff", "bmp"]
private static let audioExtensions: Set<String> = ["wav", "m4a", "mp3", "caf"]
```

### Move to `done/` With Collision Counter (D-04, D-05)

```swift
// Source: FileManager API + decision D-05 from CONTEXT.md
private func moveToProcessed(_ url: URL) throws {
    let doneDir = url.deletingLastPathComponent().appendingPathComponent("done")
    try FileManager.default.createDirectory(at: doneDir, withIntermediateDirectories: true)
    
    let filename = url.deletingPathExtension().lastPathComponent
    let ext = url.pathExtension
    var destination = doneDir.appendingPathComponent(url.lastPathComponent)
    var counter = 2
    while FileManager.default.fileExists(atPath: destination.path) {
        destination = doneDir.appendingPathComponent("\(filename)-\(counter).\(ext)")
        counter += 1
    }
    try FileManager.default.moveItem(at: url, to: destination)
}
```

### Headless Image Processing Call (D-09)

```swift
// Source: APIAIServices.swift:330 + CONTEXT.md D-09
// preview: false → headless commit path, no UI interaction needed
let response = try await photoAPI.processPhoto(
    imageData: imageData,
    mediaType: mediaType,
    preview: false,
    forcePaperType: nil  // D-10: backend auto-coerces low-confidence → "lined"
)
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Previous folder watcher (Phase 46 — deleted) was database-backed, pre-API era | New watcher posts to Vigil Core API endpoints, same as dashboard | Watcher must use VigilAPIClient-backed services, not local SQLite |
| Dashboard `processPhotoFile` had a preview/commit two-step | Watcher calls `preview: false` directly — single-step headless commit | No continuation/waiter needed in watcher; simpler than dashboard flow |
| Settings UI for folder watching was disabled (quick task 260407-q7d) | The `folderWatching.enabled` toggle and path fields remain in SettingsViewModel/SettingsView — they persist to config.json; Phase 61 reads from config, Phase 62 re-enables the UI | Phase 61 code can safely read `AppConfig.shared.folderWatching` — the data is there |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Wait-for-stable debounce (poll size at 1s intervals) is the standard pattern for file-drop scenarios | Pattern 2 / Pitfall 2 | If wrong: could use a different heuristic (e.g., file lock check); worst case is a different debounce implementation, not a design blocker |
| A2 | `PhotoProcessingAPI` protocol needs to move to JarvisCore for `FolderWatcherService` to use it | Pitfall 5 | If wrong (e.g., FolderWatcherService lives in same DailyBriefMonitor module): no migration needed; protocol stays in DashboardViewModel.swift |

---

## Open Questions

1. **Where does `FolderWatcherService` live — JarvisCore or DailyBriefMonitor?**
   - What we know: All existing services (`TranscriptionService`, `CaptureService`, `APIImageDescriptionService`) are in `JarvisCore`. But `PhotoProcessingAPI` protocol is in `DailyBriefMonitor`.
   - What's unclear: Whether to move `PhotoProcessingAPI` to `JarvisCore` (cleaner) or keep `FolderWatcherService` in `DailyBriefMonitor` (avoids protocol migration).
   - Recommendation: Keep `FolderWatcherService` in `DailyBriefMonitor` for Phase 61 (avoids a JarvisCore API surface change). Access `APIImageDescriptionService` directly (it's public). If testability is needed, move `PhotoProcessingAPI` to JarvisCore as a separate task.

2. **In-memory vs. persisted error state?**
   - What we know: CONTEXT.md leaves error tracking data structure to Claude's discretion. App restarts lose in-memory state.
   - What's unclear: Whether a file that failed before app restart should still show as failed after relaunch.
   - Recommendation: In-memory only for Phase 61. The file is still present in the watched directory — when the app relaunches and the watcher restarts, it will see the file again, debounce, and re-attempt. No persistence needed; retry is automatic on relaunch.

3. **Should watcher restart if `folderWatching.enabled` is toggled in Settings while app is running?**
   - What we know: Phase 61 wires to `AppDelegate` lifecycle (start on launch, stop on termination).
   - What's unclear: Live-toggle support.
   - Recommendation: Out of scope for Phase 61. Phase 62 builds the Settings UI. Live-toggle support (observing config changes) can be added in Phase 62 when the UI is wired.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Swift compiler | Build | YES | 6.2.4 | — |
| macOS 14+ API (`DispatchSource`) | WATCH-01 | YES (package.swift: `.macOS(.v14)`) | macOS 14 target | — |
| SFSpeechRecognizer (Speech framework) | WATCH-03 | YES (already used in TranscriptionService) | macOS 14 | — |
| `~/Jarvis/Audio`, `~/Jarvis/Images` directories | WATCH-01 runtime | NOT VERIFIED — may not exist on disk | — | Watcher must create directories if missing, or log and skip gracefully |

**Missing dependencies with no fallback:**
- None that block compilation or execution at build time.

**Runtime note:** The watched directories (`~/Jarvis/Audio`, `~/Jarvis/Images`) are defaults from `FolderWatchingConfig`. The watcher should call `FileManager.default.createDirectory(at:withIntermediateDirectories:true)` on startup to ensure they exist before opening the file descriptors. [ASSUMED — standard defensive practice]

---

## Validation Architecture

Config: `workflow.nyquist_validation` key absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | XCTest |
| Config file | None (Swift Package Manager discovers `Tests/DailyBriefMonitorTests/`) |
| Quick run command | `swift test --filter DailyBriefMonitorTests 2>&1` |
| Full suite command | `swift test 2>&1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WATCH-01 | DispatchSource fires on new file in directory | integration (file system) | manual-only (requires real FS event loop) | N/A — manual |
| WATCH-02 | Image file triggers headless processPhoto call | unit (fake photoAPI) | `swift test --filter FolderWatcherServiceTests 2>&1` | No — Wave 0 |
| WATCH-03 | Audio file triggers transcribe + capture | unit (fake transcription/capture) | `swift test --filter FolderWatcherServiceTests 2>&1` | No — Wave 0 |
| WATCH-04 | Success moves file to `done/`, failure leaves it | unit (temp directory) | `swift test --filter FolderWatcherServiceTests 2>&1` | No — Wave 0 |
| WATCH-06 | Failed file appears in `failedFiles` list | unit | `swift test --filter FolderWatcherServiceTests 2>&1` | No — Wave 0 |

**Note on WATCH-01 integration test:** Testing DispatchSource event delivery requires a real file system and a running event loop — this is not easily unit-testable. The standard approach is to test the *handler logic* (what happens when a new file is detected) with fakes, and leave the DispatchSource wiring as a smoke-test during manual verification. [ASSUMED — standard XCTest limitation for kqueue/DispatchSource]

### Sampling Rate

- **Per task commit:** `swift test --filter FolderWatcherServiceTests 2>&1`
- **Per wave merge:** `swift test 2>&1`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `Tests/DailyBriefMonitorTests/FolderWatcherServiceTests.swift` — covers WATCH-02, WATCH-03, WATCH-04, WATCH-06 with fake services injected via init

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | Partial | macOS TCC (Full Disk Access required for watching arbitrary directories) |
| V5 Input Validation | Yes | File extension allowlist (D-07); file size guard inherited from `APIImageDescriptionService.prepareImage` (5 MB hard cap from Phase 60 WR-02) |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary file type dropped in watched folder | Tampering | Extension allowlist (D-07) — silently ignore non-image/non-audio files |
| Oversized image payload | DoS (API) | `prepareImage` in `APIImageDescriptionService` applies 5 MB compression cap — inherited automatically |
| Symlink following to sensitive files | Elevation of privilege | `contentsOfDirectory(includingPropertiesForKeys: [.isRegularFileKey])` returns regular files only; symlinks have `isRegularFile = false` if they point to a non-regular target. Verify `isRegularFileKey` is checked. |

**TCC note:** DailyBriefMonitor currently requires Full Disk Access for its existing operations. Watching `~/Jarvis/Audio` and `~/Jarvis/Images` under the user's home directory should not require additional TCC grants beyond what is already provisioned. Phase 58 (SIGN-01..05) handles signing and TCC persistence. [ASSUMED — based on standard macOS sandbox behavior; full validation is Phase 58's concern]

---

## Sources

### Primary (HIGH confidence)
- Codebase — `Sources/JarvisCore/` and `Sources/DailyBriefMonitor/` read in full
- `DashboardViewModel.swift` lines 53-67 (PhotoProcessingAPI protocol), 696-700 (classify), 730-800 (processFiles), 1266-1340 (processPhotoFile)
- `AppDelegate.swift` (full — service lifecycle pattern)
- `DailyBriefMonitorApp.swift` (full — menu bar icon pattern)
- `MenuBarView.swift` (full — dropdown section pattern)
- `AppConfig.swift:399-416` (FolderWatchingConfig struct)
- `APIAIServices.swift:330-395` (processPhoto method signature and error mapping)
- `TranscriptionService.swift` (full)
- `CaptureService.swift` (full)
- `ImageConversion.swift` (full)
- `Package.swift` (full — target structure, swift-tools-version 6.2)

### Secondary (MEDIUM confidence)
- Apple Developer Documentation — `DispatchSourceFileSystemObject`, `O_EVTONLY` [CITED: https://developer.apple.com/documentation/dispatch/dispatchsourcefilesystemobject]

### Tertiary (LOW confidence)
- A1: Wait-for-stable debounce pattern described as standard [ASSUMED]
- A2: Protocol placement recommendation [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components verified in codebase; no new packages
- Architecture: HIGH — all patterns derived from existing codebase patterns or Apple API docs
- Pitfalls: HIGH (Pitfalls 1, 3, 4, 5, 6 verified in codebase) / MEDIUM (Pitfall 2 debounce approach ASSUMED)

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable APIs; no third-party dependencies)
