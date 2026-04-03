# Project Milestones: Jarvis — Personal AI Life Assistant

## v1.2 Daily Driver (Shipped: 2026-04-03)

**Delivered:** Reliable daily-use assistant with batch multi-file upload, task status workflow (open/in-progress/done), multi-sport support (MLB/NFL/NBA/NHL), configurable IMAP email, and LaunchAgent reliability fixes.

**Phases completed:** 14-18 (14 plans total)

**Key accomplishments:**

- Fixed LaunchAgent exit code -4 with Aqua session constraints and auto-delete for processed files
- Multi-file batch import with drag & drop and per-file progress tracking
- Full task status workflow (open → in-progress → done) for thoughts and work orders with UI + PDF
- Multi-sport support — NFL, NBA, NHL added alongside MLB with ESPN API and adaptive PDF layout
- Configurable IMAP email replacing hardcoded Gmail with backward-compatible migration
- Shared ImageConversion utility, clean release build with zero errors/warnings

**Stats:**

- 53 files created/modified
- ~4,813 lines of Swift added/modified
- 5 phases, 14 plans
- 4 days (2026-03-30 → 2026-04-03)

**Git range:** `feat(14-01)` → `feat(18-03)`

**What's next:** TBD — next milestone planning

---

## v1.1 Always On (Shipped: 2026-04-03)

**Delivered:** Always-running background assistant with LaunchAgent auto-start, passive folder watching, sports UX overhaul, AI-powered insights, CloudKit sync across Macs, and integration polish.

**Phases completed:** 8-13 (16 plans total)

**Key accomplishments:**

- macOS LaunchAgent with BriefScheduler for auto-start at login and daily brief generation
- Passive folder watching via DispatchSource for automatic audio/image ingest
- MLB team name picker replacing raw numeric IDs, config-driven PDF sports section
- InsightService actor with Claude-powered pattern recognition, connections, action prompts, trends
- Full CloudKit sync with bidirectional push/pull and last-write-wins conflict resolution
- Integration polish: insights in dashboard + PDF, event-driven sync, HEIC/TIFF/BMP support

**Stats:**

- 58 files created/modified
- ~5,034 lines of Swift added/modified
- 6 phases, 16 plans
- 4 days (2026-03-30 → 2026-04-03)

**Git range:** `feat(08-01)` → `feat(13-04)`

**What's next:** TBD — next milestone planning

---

## v1.0 MVP (Shipped: 2026-04-02)

**Delivered:** Full personal AI life assistant with frictionless thought capture, AI-powered triage, central dashboard, voice/image capture, evolved daily brief, and Google Calendar integration.

**Phases completed:** 1-7 (17 plans total)

**Key accomplishments:**

- Shared JarvisCore SPM library with GRDB/SQLite storage, FTS5 search, and config management
- Frictionless thought capture via menu bar popover with Cmd+Shift+J global hotkey
- Claude AI auto-triage categorizing thoughts into 5 types with confidence scores and user override
- Central SwiftUI dashboard with category sidebar, FTS5 search, and tabbed settings UI
- Voice transcription (SFSpeechRecognizer) and image capture with multimodal Claude descriptions
- Evolved daily PDF brief with captured thoughts page and contextual AI affirmations
- Google Calendar OAuth2 integration pulling events into brief and dashboard

**Stats:**

- 52 files created/modified
- 5,501 lines of Swift
- 7 phases, 17 plans
- 3 days from project start to ship

**Git range:** `feat(01-02)` → `feat(07-03)`

**What's next:** TBD — next milestone planning

---
