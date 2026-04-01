# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 5 — Voice & Image Capture (in progress)

## Current Position

Phase: 5 of 7 (Voice & Image Capture) — IN PROGRESS
Plan: 01 complete (VoiceCaptureService + TranscriptionService + CaptureService extension)
Status: Plan 05-01 done — voice recording and on-device transcription pipeline shipped
Last activity: 2026-04-01 — Plan 05-01 executed (2 tasks, 2 commits)

Progress: ███████░░░ ~70%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 4.6 min
- Total execution time: 0.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 10 min | 3.3 min |
| 02-text-capture | 2 | 10 min | 5.0 min |
| 03-ai-triage | 2 | 13 min | 6.5 min |

**Recent Trend:**
- Last 5 plans: 01-03 (2 min), 02-01 (5 min), 02-02 (5 min), 03-01 (5 min), 03-02 (8 min)
- Trend: stable

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 01-01: Used `.target` for JarvisCore (library, not executable)
- 01-01: GRDB resolved to 7.10.0 (latest stable 7.x)
- 01-02: DatabaseManager write/reader are nonisolated (DatabaseQueue is thread-safe)
- 01-02: FTS5 uses content-sync with unicode61 tokenizer
- 01-02: FTS5Pattern(matchingAllTokensIn:) for safe user input handling
- 01-03: Explicit public init on all JarvisCore structs (synthesized memberwise inits become internal when type is public)
- 01-03: ConfigError made public with public errorDescription for cross-module error handling
- 02-01: CaptureView takes closures (not service directly) for testability
- 02-01: AppDelegate handles DB init failure gracefully (logs, doesn't crash)
- 02-01: @MainActor on toggleCapture() for Swift 6 actor isolation compliance
- 02-02: Carbon RegisterEventHotKey over NSEvent.addGlobalMonitorForEvents (no Accessibility permissions)
- 02-02: Direct panel capture in hotkey closure (avoids Swift 6 Sendable data race errors)
- 02-02: Task { @MainActor } bridge for calling UI from Carbon callback
- 03-01: ThoughtStore.update() without inout for cross-actor updates (Swift 6 prohibits inout across actor boundaries)
- 03-01: Triage is fire-and-forget from capture — user gets immediate feedback, background Task handles triage
- 03-01: ConfigLoader.load() failure silently disables triage (graceful degradation)
- 03-02: onTriage callback awaited by CaptureView (changed from fire-and-forget to display result)
- 03-02: Category pill colors: task=blue, therapy=purple, idea=orange, reflection=green, project=indigo
- 03-02: User override sets confidence to 1.0 (explicit user choice = highest confidence)
- 03-02: Auto-dismiss timer pauses while category picker is open (bumped to 2.5s)
- 04-01: DashboardViewModel uses @Observable + @MainActor with Task-based debounce for search
- 04-01: NavigationSplitView for sidebar + detail layout with .searchable modifier
- 04-01: Dashboard window managed as NSWindow property on AppDelegate (reused if visible)
- 04-01: ThoughtCategory displayColor/displayName extension reused from CaptureView.swift (same target)
- 04-01: CategoryFilter enum wraps optional ThoughtCategory for SwiftUI List selection (nil tag not selectable)
- 04-01: NSApp.setActivationPolicy(.regular) when opening dashboard for keyboard focus in MenuBarExtra apps
- 04-02: ConfigLoader.save() uses .convertToSnakeCase to match load()'s .convertFromSnakeCase
- 04-02: Settings window .titled + .closable only (not resizable) — fixed 600x420 for settings
- 04-02: Replaced "Open Config" (text editor) with "Settings" (SwiftUI window) in menu bar
- 04-02: Widened settings window from 500x400 to 600x420 to fit all 6 tabs
- 05-02: Followed TriageService URLSession+JSONSerialization pattern for ImageDescriptionService
- 05-02: ImageMediaType enum with mimeType computed property for type-safe media types
- 05-02: 20MB size validation before base64 encoding (fail fast)
- 05-02: ImagePicker as enum with static method (project convention for stateless utilities)
- 05-01: nonisolated(unsafe) for WhisperKit property (not Sendable but manages internal thread safety)
- 05-01: @preconcurrency import AVFoundation for Swift 6 AVAudioPCMBuffer Sendable compliance
- 05-01: AVAudioConverter for 16kHz mono Float32 format conversion from hardware format
- 05-01: CaptureService.capture(_:source:) added; captureText() delegates to it

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-01
Stopped at: Plan 05-01 complete (voice capture + transcription pipeline)
Resume file: .planning/phases/05-voice-image-capture/05-01-SUMMARY.md
