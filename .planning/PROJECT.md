# Jarvis — Personal AI Life Assistant

## What This Is

A native macOS app that acts as a central nervous system for capturing, organizing, and surfacing thoughts, tasks, and life data. Features frictionless text/voice/image capture via a global hotkey, Claude AI auto-triage into 5 categories, a SwiftUI dashboard with full-text search, Google Calendar integration, and a daily printed PDF brief with captured thoughts and contextual affirmations — all designed for an ADHD brain that needs zero-friction capture and automatic organization.

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

### Active

- [ ] Pattern recognition — surface recurring themes, especially for therapy prep
- [ ] Undo/redo for thought editing
- [ ] Thought tagging and manual organization beyond AI categories
- [ ] Brief history — browse and reprint past daily briefs

### Out of Scope

- iOS/mobile app — pocket voice recorder handles mobile capture; revisit later
- Real-time voice assistant — this is capture-and-review, not conversational
- Replacing the physical notebook — digital complements the traveler's notebook, doesn't replace it
- Multi-user support — this is a personal tool for one person
- Cloud sync/hosting — local macOS app with local data
- Offline mode — local-first architecture already works offline except for API calls

## Context

Shipped v1.0 MVP with 5,501 LOC Swift across 52 files in 3 days.
Tech stack: Swift 6.2, SwiftUI, SPM, GRDB/SQLite with FTS5, Claude API (SwiftAnthropic), Google Calendar REST API with OAuth2.
5 major services: CaptureService, TriageService, VoiceCaptureService (SFSpeechRecognizer), ImageDescriptionService, GoogleCalendarService.
3 UI surfaces: floating capture panel (Cmd+Shift+J), central dashboard with settings, daily PDF brief.
8+ Swift 6 Sendable/actor isolation issues resolved throughout development.

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

---
*Last updated: 2026-04-02 after v1.0 milestone*
