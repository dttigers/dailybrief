# Vigil — Ambient AI Life Assistant

## What This Is

An ambient AI life assistant built for ADHD brains. A native macOS app (formerly Jarvis) with frictionless text/voice/image capture, Claude AI auto-triage, therapy intelligence, tags/favorites/linking, a SwiftUI dashboard, and a daily printed PDF brief. Now a multi-client platform: Vigil Core API (Node.js/Hono) serves as the intelligence backend, the Mac app operates as either a local-first or API-connected client via config toggle, and Even G2 smart glasses provide ambient glanceable display of work orders, reminders, and affirmations.

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
- ✓ Bug fixes — FTS5 dedup, config startup error, settings window sizing, folder watcher triage persistence — v1.3
- ✓ Manual re-triage — UI button to re-run AI triage on any thought — v1.3
- ✓ AI work order prioritization — Claude-powered urgency ranking with daily cache — v1.3
- ✓ OAuth2 IMAP work email — device code flow, XOAUTH2 auth, configurable host/port — v1.3
- ✓ Inline thought editing with undo/redo and expand/collapse — v1.4
- ✓ Bulk actions (delete/recategorize/retriage) and source/date filters — v1.4
- ✓ AI therapy intelligence — self-learnable vs bring-to-therapist classification — v1.4
- ✓ Therapy prep — pattern recognition, session prep AI, PDF integration, dashboard UI — v1.4
- ✓ Tags, favorites, and thought-to-thought linking with CloudKit sync — v1.4
- ✓ Vigil Core API — platform-agnostic Node.js backend exposing REST API for all clients — v2.0
- ✓ Even G2 smart glasses plugin — ambient display of work orders, reminders, affirmation — v2.0
- ✓ Mac app migration — redirect Swift services to call Vigil Core instead of computing locally — v2.0

### Active

- [ ] Brief history — browse and reprint past daily briefs
- [ ] Export system — thoughts as Markdown/JSON/CSV
- [ ] CKSubscription push notifications — upgrade from polling-based sync
- [ ] Server deployment — move Vigil Core from localhost to cloud for mobile/remote access
- [ ] G2 hardware testing — validate plugin on physical Even G2 glasses
- [ ] Remove dual code paths — retire local-only mode once API backend is proven stable

### Out of Scope

- iOS/mobile app — build once Vigil Core runs on a server, not just localhost
- Real-time voice assistant — this is capture-and-review, not conversational
- Replacing the physical notebook — digital complements the traveler's notebook, doesn't replace it
- Multi-user support — build after Vigil Core is proven on a server
- Android XR — wait for SDK maturity, build after Even G2 shows traction

## Context

Shipped v2.0 Vigil Platform with ~7,500 LOC across Swift + TypeScript in 10 days total (v1.0 through v2.0).
Tech stack: Swift 6.2/SwiftUI/SPM (Mac app), Node.js/Hono/TypeScript/better-sqlite3 (Vigil Core API), Vite/TypeScript/Even Hub SDK (G2 plugin).
3 client surfaces: Mac app (dashboard + capture panel + PDF brief), Vigil Core API (localhost:3001, 20+ REST endpoints), Even G2 plugin (3 screens).
Mac app runs in dual mode: local GRDB or Vigil API backend, controlled by `vigil.useAPI` config flag.
Two LaunchAgents: com.jarvis.dailybrief (brief scheduler) and com.vigil.core.api (API server).
G2 plugin built but awaiting physical hardware for validation. Server deployment deferred — localhost only for v2.0.

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
| OAuth2 device code flow for IMAP auth | Headless-friendly (no browser redirect needed); works in CLI and menu bar contexts; Azure AD compatible | ✓ Good |
| Actor-based WorkOrderPrioritizer with daily cache | Hash-based cache invalidation avoids redundant API calls; actor isolation for thread safety | ✓ Good |

| Early close of v1.4 to pivot to Vigil platform | Even G2 smart glasses SDK launched 2026-04-03; first-mover window for ambient AI + ADHD | ✓ Good |
| Rename from Jarvis to Vigil | Jarvis has Marvel/Disney IP conflict, hundreds of existing apps; Vigil fits the product promise | — Pending |
| Hono over Express for Vigil Core API | Lightweight, TypeScript-first, edge-ready; minimal boilerplate | ✓ Good |
| better-sqlite3 for direct Jarvis DB access | No ORM overhead, shared SQLite file between Mac app and API | ✓ Good |
| Protocol abstraction for Mac app migration | ThoughtRepository + AI service protocols enable gradual migration without breaking existing code | ✓ Good |
| Config toggle (vigil.useAPI) for dual mode | Allows testing API backend while keeping local fallback; de-risks migration | ✓ Good |
| snake_case config keys for cross-platform compat | Swift JSONEncoder requires snake_case; discovered during integration testing | ✓ Good |
| Localhost-only for v2.0 | Avoids auth/deployment complexity; proves architecture before scaling | — Pending |

---
*Last updated: 2026-04-04 after v2.0 milestone*
