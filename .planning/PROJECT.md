# Jarvis — Personal AI Life Assistant

## What This Is

A native macOS app that acts as a central nervous system for capturing, organizing, and surfacing thoughts, tasks, and life data. Features frictionless text/voice/image capture via a global hotkey, Claude AI auto-triage into 5 categories, a SwiftUI dashboard with full-text search, Google Calendar integration, and a daily printed PDF brief with captured thoughts and contextual affirmations. Runs as an always-on background assistant with LaunchAgent auto-start, passive folder watching, AI-powered insights, and CloudKit sync across multiple Macs — all designed for an ADHD brain that needs zero-friction capture and automatic organization.

## Core Value

Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

## Requirements

### Validated

- ✓ Daily PDF brief generation with work orders, todos, sports, affirmation — existing
- ✓ Gmail/ServiceNow work order extraction via IMAP — existing
- ✓ MLB game scores, standings, upcoming schedule — existing
- ✓ Apple Reminders integration — existing
- ✓ Claude AI affirmation generation — existing
- ✓ System printing via lpr — existing
- ✓ Menu bar monitor app — existing
- ✓ LaunchAgent scheduling — existing
- ✓ Work order completion tracking — existing
- ✓ Central macOS dashboard app (SwiftUI) — v1.0
- ✓ Frictionless thought capture (text, voice, image) — v1.0
- ✓ AI triage layer — Claude categorizes thoughts with confidence scores — v1.0
- ✓ Thought review and organization — category sidebar, FTS5 search — v1.0
- ✓ Google Calendar integration — OAuth2, events in brief and dashboard — v1.0
- ✓ Configurable data sources — tabbed settings UI replacing hand-edited JSON — v1.0
- ✓ Evolved daily brief — captured thoughts page + contextual affirmations — v1.0
- ✓ Search across everything — FTS5 full-text search across all captured thoughts — v1.0
- ✓ Always-on background assistant — LaunchAgent auto-start, BriefScheduler — v1.1
- ✓ Passive folder watching — DispatchSource monitoring for audio/image auto-ingest — v1.1
- ✓ Sports UX overhaul — MLB team name picker, config-driven PDF sports section — v1.1
- ✓ AI-powered insights — InsightService with pattern/connection/action/trend analysis — v1.1
- ✓ CloudKit sync — bidirectional push/pull across multiple Macs — v1.1
- ✓ Image format support — HEIC/TIFF/BMP conversion via CoreGraphics — v1.1
- ✓ Configurable IMAP email — host/port/TLS fields replacing hardcoded Gmail — v1.2
- ✓ Task status workflow — open/in-progress/done for thoughts and work orders — v1.2
- ✓ Multi-sport support — MLB, NFL, NBA, NHL with team pickers and ESPN API — v1.2
- ✓ Multi-file upload — batch photo/audio import from dashboard toolbar — v1.2
- ✓ LaunchAgent reliability — fixed exit code -4, auto-delete processed files — v1.2

### Active

- [ ] Pattern recognition — surface recurring themes, especially for therapy prep
- [ ] Undo/redo for thought editing
- [ ] Thought tagging and manual organization beyond AI categories
- [ ] Brief history — browse and reprint past daily briefs
- [ ] CKSubscription push notifications — upgrade from polling-based sync

### Out of Scope

- iOS/mobile app — pocket voice recorder handles mobile capture; revisit later
- Real-time voice assistant — this is capture-and-review, not conversational
- Replacing the physical notebook — digital complements the traveler's notebook, doesn't replace it
- Multi-user support — this is a personal tool for one person
- Offline mode — local-first architecture already works offline except for API calls

## Context

Shipped v1.2 Daily Driver with ~8,900 LOC Swift across 58 files in 7 days total (v1.0 + v1.1 + v1.2).
Tech stack: Swift 6.2, SwiftUI, SPM, GRDB/SQLite with FTS5, CloudKit, Claude API (SwiftAnthropic), Google Calendar REST API with OAuth2, ESPN REST API.
10 major services: CaptureService, TriageService, VoiceCaptureService, ImageDescriptionService, GoogleCalendarService, BriefScheduler, FolderWatcherService, InsightService, SyncService, ESPNSportsService.
3 UI surfaces: floating capture panel (Cmd+Shift+J), central dashboard with settings (850px wide), daily PDF brief (3 pages).
Always-on via LaunchAgent with auto-start at login. CloudKit sync across multiple Macs with last-write-wins conflict resolution.
v1.2 additions: configurable IMAP email, task status workflow, multi-sport (MLB/NFL/NBA/NHL), multi-file upload, shared image conversion utility.

## Constraints

- **Platform**: macOS 14+ (Sonoma), Swift 6.2, SwiftUI
- **AI Provider**: Anthropic Claude API (already integrated)
- **Build System**: Swift Package Manager (existing setup)
- **Data Storage**: Local GRDB/SQLite with FTS5 search (no cloud dependency)
- **Voice Capture**: SFSpeechRecognizer for on-device transcription; external pocket recorder for mobile
- **Physical Output**: Daily PDF must remain printable and glueable into traveler's notebook

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Native macOS app (not web) | User is all-Apple; deeper system integration; DailyBrief already Swift/SwiftUI | ✓ Good |
| Pocket voice recorder for mobile capture | Phone is too much friction while driving; one-button press solves ADHD capture barrier | ✓ Good |
| Claude for AI categorization | Already integrated for affirmations; natural language understanding for thought triage | ✓ Good |
| Local-first data storage (GRDB/SQLite) | Privacy (therapy notes, personal thoughts); no cloud dependency; simplicity | ✓ Good |
| Keep Apple Reminders integration | May eventually be replaced by internal task system, but keep for now | — Pending |
| Carbon API for global hotkey | No Accessibility permissions required; reliable system-wide capture | ✓ Good |
| SFSpeechRecognizer over WhisperKit | WhisperKit crashes on Intel Macs (CoreML MLMultiArray segfault); SFSpeech needs no model downloads | ✓ Good |
| Fire-and-forget triage | Instant capture UX; background categorization doesn't block user | ✓ Good |
| Dashboard toolbar for audio/image import | Floating NSPanel + NSOpenPanel incompatible; dashboard provides stable window context | ✓ Good |
| GoogleCalendarService in JarvisCore | Cross-target access needed (both CLI and menu bar app use it) | ✓ Good |
| LaunchAgent over Login Items | More control over lifecycle, single architecture | ✓ Good |
| DispatchSource for folder watching | Low overhead, immediate file detection without polling | ✓ Good |
| CloudKit over Supabase for sync | Native Apple integration, no server costs, privacy-first | ✓ Good |
| Last-write-wins conflict resolution | Simple, predictable for single-user multi-Mac sync | ✓ Good |
| CoreGraphics for image conversion | No external dependencies, handles HEIC/TIFF/BMP natively | ✓ Good |

---
*Last updated: 2026-04-03 after v1.2 milestone*
