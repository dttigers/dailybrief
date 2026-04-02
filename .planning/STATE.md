# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 7 — Google Calendar Integration (in progress)

## Current Position

Phase: 7 of 7 (Google Calendar) — IN PROGRESS
Plan: 03 complete (of 3)
Status: Calendar events wired into PDF and dashboard. End-to-end integration complete.
Last activity: 2026-04-02 — Plan 07-03 completed

Progress: ██████████ 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 5.0 min
- Total execution time: 0.8 hours

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
- 06-01: Graceful degradation for DatabaseManager init in DailyBrief Generate (empty thought arrays on failure)
- 06-01: Conditional Page 3 in PDF — only renders when thoughts exist (backward compatible)
- 06-01: Unprocessed = fetchAll then filter category==nil; recent = last 24h categorized non-task
- 06-02: Thought summaries truncated to 50 chars, max 5 in affirmation prompt (token budget control)
- 06-02: Thought fetching moved before async let block (local DB reads fast, enables passing to affirmation)
- 06-02: Daily affirmation cache unchanged — contextual affirmation generated once per morning
- 05-01: nonisolated(unsafe) for WhisperKit property (not Sendable but manages internal thread safety)
- 05-01: @preconcurrency import AVFoundation for Swift 6 AVAudioPCMBuffer Sendable compliance
- 05-01: AVAudioConverter for 16kHz mono Float32 format conversion from hardware format
- 05-01: CaptureService.capture(_:source:) added; captureText() delegates to it
- 05-03: CaptureMode enum with segmented picker for text/voice/image mode switching
- 05-03: Voice/image closures on CaptureView (onStartRecording, onStopRecording, onImageCapture) keep orchestration in AppDelegate
- 05-03: Voice triage result returned via Thought.category/confidence (avoids second triage overlay callback)
- 05-03: Image capture with no API key gracefully falls back to filename-only capture
- 05-03: CapturePanel text-only; audio/image import via dashboard toolbar (floating panel + NSOpenPanel incompatible)
- 05-03: SFSpeechRecognizer over WhisperKit (Intel Mac CoreML crash, no model downloads needed)
- 05-03: Auto-compress images >5MB via progressive JPEG quality + 50% downscale fallback
- 05-03: FilePicker replaces ImagePicker (shared pickFile with type-specific convenience methods)
- 05-03: WhisperKit dependency removed from Package.swift
- 07-01: Custom init(from:) on AppConfig with decodeIfPresent for backward-compatible googleCalendar config
- 07-01: CalendarTokens uses secondsSince1970 date encoding for token expiry persistence
- 07-01: ISO8601 parsing with fractional seconds fallback (matches SportsService pattern)
- 07-01: GoogleCalendarError.notAuthorized thrown when no tokens exist — callers skip gracefully
- 07-02: @unchecked Sendable on ContinuationGuard (thread safety managed manually via NSLock)
- 07-02: @preconcurrency import Dispatch for DispatchWorkItem Sendable compliance in Swift 6
- 07-02: Public access on GoogleCalendarError.errorDescription for cross-module protocol conformance
- 07-02: Settings window bumped to 700x460 to accommodate 7th Calendar tab
- 07-02: GoogleCalendarService moved to JarvisCore for cross-target access (DailyBriefMonitor needs it)
- 07-03: GoogleCalendarService moved from DailyBrief/Services to JarvisCore/Services for cross-target access
- 07-03: Calendar schedule section after To Do, before Notes in PDF Page 1 (max 8, all-day first)
- 07-03: Dashboard calendar section only visible when events exist (graceful degradation)
- 07-03: SendableBox wrapper for DispatchWorkItem in GoogleCalendarAuth (Swift 6 fix)

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-02
Stopped at: Phase 07 plan 03 complete — all plans done
Resume file: .planning/phases/07-google-calendar/07-03-SUMMARY.md
