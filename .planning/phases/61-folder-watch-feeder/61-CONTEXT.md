# Phase 61: Folder Watch Feeder - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

DailyBriefMonitor (the always-on menu bar app) watches user-configured local directories for new image and audio files via DispatchSource and feeds them to Vigil Core headlessly — no preview, no user interaction during processing. Images flow through the Smart Photo Upload pipeline (`POST /v1/process-photo` without `?preview=true`), audio flows through the existing local `TranscriptionService` (Apple SFSpeechRecognizer) → `CaptureService.capture(text, source: .voice)` → `POST /v1/thoughts`. Successfully processed files are moved out of the watched directory; failures leave the source file untouched and surface a visible error state in the menu bar.

Requirements closed by this phase: **WATCH-01** (DispatchSource watcher), **WATCH-02** (image → process-photo pipeline), **WATCH-03** (audio → voice-capture path), **WATCH-04** (post-processing move/delete), **WATCH-06** (failure visibility + safe retry).

**In scope:**
- New `FolderWatcherService` (or similar) in DailyBriefMonitor that uses DispatchSource to monitor directories from `FolderWatchingConfig`
- Image processing: read file → ImageConversion normalize → base64 → `POST /v1/process-photo` (no preview param, headless commit)
- Audio processing: read file → local `TranscriptionService.transcribe(audioURL:)` → `CaptureService.capture(text, source: .voice)`
- Post-processing: move successful files to `done/` subfolder (or delete per `autoDeleteAfterProcessing` config)
- Error state: menu bar icon change + failed file list in dropdown
- Debounce: wait-for-stable before processing newly detected files
- Wire watcher startup/shutdown into DailyBriefMonitor's app lifecycle

**Out of scope:**
- **Settings UI for watched directories (Phase 62).** This phase uses the existing `FolderWatchingConfig` defaults (`~/Jarvis/Audio`, `~/Jarvis/Images`). Phase 62 builds the UI to add/remove/edit directories.
- **Preview flow.** The watcher is headless — no `?preview=true`, no user override. Backend auto-coercion (Phase 59 D-04: unknown/low-confidence → "lined") is the safety net.
- **macOS notifications.** Error visibility is through the menu bar icon, not UserNotifications.
- **Vigil Core server-side audio transcription.** Audio transcription stays local via SFSpeechRecognizer.
- **Retry logic / automatic retry.** Failed files stay in place; user retries by moving the file out and back in (success criterion #5).

</domain>

<decisions>
## Implementation Decisions

### Error Visibility
- **D-01:** Failed uploads surface via a **menu bar icon state change** (e.g., exclamation badge or tint on the existing `doc.text` icon). No macOS UserNotifications — menu bar icon is the sole error channel.
- **D-02:** The menu bar dropdown shows a **count + list of failed filenames** with short error reasons (e.g., "photo.jpg: Network timeout", "scan.heic: Claude couldn't read photo"). Gives enough diagnostic info without cluttering the menu.
- **D-03:** Error state **auto-clears** when no failed files remain in the watched directory. If the user moves/deletes the failed file or retries it successfully, the error count drops and the icon returns to normal. No manual dismiss button needed.

### Post-Processing
- **D-04:** Successfully processed files are **moved to a `done/` subfolder** inside the watched directory (e.g., `~/Jarvis/Images/done/photo.jpg`). The watcher ignores the `done/` subfolder. When `autoDeleteAfterProcessing` is `true`, the file is deleted instead of moved.
- **D-05:** Moved files keep their **original filename**. On name collision in `done/`, append a counter (e.g., `photo-2.jpg`). No timestamp prefix.

### File Handling
- **D-06:** The watcher uses a **wait-for-stable debounce** — after detecting a new file, wait until the file size stops changing for ~1-2 seconds before processing. Handles AirDrop, drag-and-drop, and copy operations gracefully.
- **D-07:** Accepted file types **match the dashboard file pickers**: images = jpg, jpeg, png, heic, tiff, bmp; audio = wav, m4a, mp3, caf. All other file types are ignored silently (no error, no move).
- **D-08:** Multiple files landing at once are processed **sequentially** (FIFO). Matches the dashboard's `processFiles()` pattern. Predictable API load, no concurrency complexity.

### Carried Forward
- **D-09 (from Phase 60 D-01):** Images hit `POST /v1/process-photo` WITHOUT `?preview=true` — the headless commit path. Backend creates thought records and returns them.
- **D-10 (from Phase 59 D-04):** Backend auto-coerces unknown/low-confidence paper types to "lined" server-side. This is the headless watcher's safety net — no user override available.
- **D-11 (from Phase 60):** Audio transcription uses local `TranscriptionService` (Apple SFSpeechRecognizer) → `CaptureService.capture(text, source: .voice)` — same path as the dashboard's audio import.

### Claude's Discretion
- Watcher architecture (new service vs. integration into existing code, actor vs class, lifecycle management)
- DispatchSource configuration details (which events to monitor, queue choices)
- Internal error tracking data structure (in-memory set of failed files, persistence across app restarts)
- Whether to log processing activity to os_log / unified logging for diagnostics

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 59-60 context (what we're building on)
- `.planning/phases/59-smart-photo-upload-backend/59-CONTEXT.md` — D-01..D-09: process-photo endpoint contract, paper-type detection, backend auto-coercion
- `.planning/phases/60-smart-photo-upload-dashboard-ux/60-CONTEXT.md` — D-01: preview vs headless paths, D-07: dashboard photo flow replacement, D-08: error mappings

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — WATCH-01, WATCH-02, WATCH-03, WATCH-04, WATCH-06
- `.planning/ROADMAP.md` — Phase 61 success criteria (5 items), Phase 62 dependency

### Existing config
- `Sources/JarvisCore/Config/AppConfig.swift` (lines 399-416) — `FolderWatchingConfig` struct: `enabled`, `audioFolderPath`, `imageFolderPath`, `autoDeleteAfterProcessing`

### Menu bar app lifecycle
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` — `MenuBarExtra` with dynamic icon states (lines 36-47), app lifecycle entry point
- `Sources/DailyBriefMonitor/MenuBarView.swift` — menu bar dropdown content, pattern for adding new sections
- `Sources/DailyBriefMonitor/AppDelegate.swift` — app delegate with service initialization

### Image/audio processing
- `Sources/JarvisCore/Utilities/ImageConversion.swift` — HEIC/TIFF/BMP → JPEG normalization utility
- `Sources/JarvisCore/Services/APIAIServices.swift` — `processPhoto(imageData:mediaType:preview:forcePaperType:)` method
- `Sources/JarvisCore/Services/TranscriptionService.swift` — local SFSpeechRecognizer audio transcription
- `Sources/JarvisCore/Services/CaptureService.swift` — `capture(_:source:)` for persisting thoughts via API

### Dashboard batch processing (pattern reference)
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` (lines 730-800) — `processFiles()` sequential batch loop, `processPhotoFile()` photo handling, audio transcription path, error collection pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`FolderWatchingConfig`** (`AppConfig.swift:399`): Config struct already exists with `enabled`, paths, and `autoDeleteAfterProcessing`. No new config fields needed for Phase 61.
- **`ImageConversion`** (`ImageConversion.swift`): Handles HEIC/TIFF/BMP → JPEG. Already used by the dashboard's `processPhotoFile()` — same normalization needed for watched files.
- **`APIImageDescriptionService.processPhoto()`** (`APIAIServices.swift`): The same method the dashboard uses. Watcher calls with `preview: false` for headless commit.
- **`TranscriptionService`** (`TranscriptionService.swift`): Apple SFSpeechRecognizer actor. Dashboard's audio import path uses this — watcher does the same.
- **`CaptureService.capture(_:source:)`** (`CaptureService.swift`): Posts to `/v1/thoughts`. Used after audio transcription.
- **Menu bar icon pattern** (`DailyBriefMonitorApp.swift:36-47`): Dynamic `HStack` with conditional `Image(systemName:)` for running/success/error states. New watcher-error state follows this pattern.

### Established Patterns
- **Sequential batch processing**: `processFiles()` iterates URLs sequentially with progress tracking. Watcher mirrors this FIFO approach.
- **Error collection**: Dashboard collects `importErrors: [String]` during batch processing and surfaces them post-batch. Watcher accumulates similarly but surfaces via menu bar instead of dashboard banner.
- **Service injection**: Dashboard receives `transcriptionService`, `captureService`, `photoAPI` via init. Watcher needs the same services.

### Integration Points
- **App lifecycle**: Watcher starts when DailyBriefMonitor launches (if `folderWatching.enabled`), stops on termination. Wire into `AppDelegate` or `DailyBriefMonitorApp`.
- **Menu bar icon**: `DailyBriefMonitorApp.swift` label view needs a new conditional for watcher-error state.
- **Menu bar dropdown**: `MenuBarView.swift` needs a new section showing watcher error count/list when errors exist.
- **Config read**: Watcher reads `AppConfig.shared.folderWatching` for paths and post-processing preference.

</code_context>

<specifics>
## Specific Ideas

- **Menu bar icon for errors**: Follows the existing pattern at lines 36-47 of `DailyBriefMonitorApp.swift` — add a new conditional branch for "watcher has failures" showing an appropriate SF Symbol (e.g., `exclamationmark.triangle.fill`).
- **`done/` subfolder convention**: The watcher creates `done/` inside each watched directory on first successful processing. The `done/` subfolder is excluded from DispatchSource monitoring to prevent re-triggering.
- **Retry = move out + move back**: Success criterion #5 says moving a previously-failed file out of and back into the watched directory re-triggers upload. The wait-for-stable debounce naturally handles this — the file "appears" as new.
- **Phase 62 dependency**: Phase 62 will build the Settings UI to configure watched directories, post-processing action, and default paper type. Phase 61 hardcodes to `FolderWatchingConfig` defaults and the `folderWatching.enabled` toggle.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 61-folder-watch-feeder*
*Context gathered: 2026-04-10*
