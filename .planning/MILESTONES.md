# Project Milestones: Vigil — Ambient AI Life Assistant

## v2.2 Polish & Power (Shipped: 2026-04-05)

**Delivered:** Stabilized the platform with local code path removal, added brief history browsing, thought export, configurable PDF layout, and dashboard AI chat with thought context — completing the transition from local tool to polished multi-client platform.

**Phases completed:** 45-50 (12 plans total)

**Key accomplishments:**

- G2 plugin UX fixes — task detail screen with tap-to-expand and swipe navigation
- Retired all local-only code paths — removed GRDB, CloudKit, local AI services (2,703 lines deleted)
- Brief history — browse and reprint past daily briefs from dashboard and CLI
- Export system — thoughts as JSON, CSV, or Markdown via API and CLI
- Configurable PDF — paper size, margins, font scale, section toggles in settings UI
- Dashboard AI chat — multi-turn conversation with Claude using thought context injection

**Stats:**

- 81 files created/modified
- +6,687 / -3,774 lines (Swift + TypeScript)
- 6 phases, 12 plans, ~24 tasks
- 1 day (2026-04-05)

**Git range:** `feat(45-01)` → `fix: bump vigil-core to 0.2.0`

**What's next:** TBD — next milestone planning

---

## v2.1 Server Deployment (Shipped: 2026-04-05)

**Delivered:** Production deployment of Vigil Core API on Railway with PostgreSQL, bearer token authentication, data migration, and all 3 clients (Mac app, G2 glasses, API) connected to production server with hardened security.

**Phases completed:** 37-44 (13 plans total)

**Key accomplishments:**

- Full PostgreSQL migration — replaced better-sqlite3 with Drizzle ORM across all routes, tsvector FTS
- Production deployment on Railway — managed Postgres addon, programmatic migrations, public domain
- Bearer token auth — SHA-256 hashed API keys (vk_ prefix) protecting all 12 route modules
- Data migration — 45 thoughts from local SQLite to production PostgreSQL with integrity verification
- Multi-client production config — G2 plugin and Mac app pointed at production URL with auth headers
- API hardening — rate limiting (100 req/60s), 30s timeouts, security headers, CORS, 12-endpoint smoke test

**Stats:**

- 68 files created/modified
- +7,014 / -825 lines (TypeScript + Swift)
- 8 phases, 13 plans, ~25 tasks
- 1 day (2026-04-05, ~4 hours active development)

**Git range:** `docs(37)` → `fix(42-01)`

**What's next:** TBD — next milestone planning

---

## v2.0 Vigil Platform (Shipped: 2026-04-04)

**Delivered:** Platform-agnostic Vigil Core API (Node.js/Hono/TypeScript) with 20+ REST endpoints, Even G2 smart glasses plugin with 3-screen navigation, and full Mac app migration to API backend via protocol abstraction and config toggle.

**Phases completed:** 29-36 (22 plans total)

**Key accomplishments:**

- Vigil Core API — full REST surface with thoughts CRUD, tags/favorites/links, brief aggregation, bulk operations, FTS5 search
- AI service layer — triage, affirmation, insights, therapy, prioritization, and image description ported from Swift to Node.js with caching
- Even G2 smart glasses plugin — Vite+TypeScript with home, work orders, and affirmation screens, live API data, 60s auto-refresh
- Mac app protocol migration — ThoughtRepository + 6 AI service protocols abstracting local GRDB vs API backends
- Config-driven backend selection — single `vigil.useAPI` flag switches entire Mac app between local and Vigil Core API mode
- LaunchAgent auto-start — Vigil Core API starts on login alongside existing DailyBrief scheduler

**Stats:**

- 102 files created/modified
- ~11,737 lines added (Swift + TypeScript)
- 8 phases, 22 plans
- 1 day (2026-04-04)

**Git range:** `feat(29-01)` → `feat(36-01)`

**What's next:** TBD — next milestone planning (server deployment, G2 hardware testing, or new features)

---

## v1.4 Intelligence & Organization (Shipped: 2026-04-04, Early Close)

**Delivered:** Dashboard power tools — inline thought editing with undo, bulk actions, source/date filters, AI therapy intelligence (classification + pattern recognition + session prep), and tags/favorites/thought-to-thought linking. Closed early to pivot to Vigil platform (Even G2 smart glasses + Vigil Core API).

**Phases completed:** 24-28 (11 plans total, phases 29-32 deferred)

**Key accomplishments:**

- Inline thought editing with UndoManager integration and expand/collapse
- Multi-select with bulk delete, recategorize, re-triage; source type and date range filters
- AI therapy intelligence — classifies therapy thoughts as self-learnable vs bring-to-therapist
- Therapy prep — pattern recognition across thoughts, AI session prep, PDF integration, dashboard UI
- Tags, favorites, and bidirectional thought-to-thought linking with CloudKit sync
- v5 DB migration combining tags, isFavorited, and thought_links in one schema change

**Stats:**

- 44 files created/modified
- ~5,740 lines of Swift added/modified
- 5 phases, 11 plans
- 1 day (2026-04-04)

**Git range:** `feat(24-01)` → `feat(28-03)`

**What's next:** v2.0 Vigil Platform — Vigil Core API (Node.js), Even G2 smart glasses plugin, Mac app migration

---

## v1.3 Stability & Smarts (Shipped: 2026-04-04)

**Delivered:** Bug fixes for daily reliability, manual re-triage, AI work order prioritization, and OAuth2 IMAP work email.

**Phases completed:** 19-23 (7 plans total)

**Key accomplishments:**

- Fixed FTS5 duplicate thoughts, config startup error, settings window sizing
- Manual re-triage button on dashboard thought rows
- AI work order prioritization with Claude-powered urgency ranking and daily cache
- OAuth2 IMAP work email with device code flow and XOAUTH2 authentication

**Stats:**

- 5 phases, 7 plans
- 1 day (2026-04-04)

**Git range:** `feat(19-01)` → `feat(23-01)`

**What's next:** v1.4 Intelligence & Organization

---

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
