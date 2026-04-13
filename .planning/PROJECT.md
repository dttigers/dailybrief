# Vigil — Ambient AI Life Assistant

## Current State: v3.1 Gmail & CLI Evolution in progress (2026-04-13)

**Delivered:** v3.0 Server-Side PDF complete — brief generation moved to vigil-core, Mac CLI is a thin client, PWA generates/previews/downloads briefs. 78 phases and ~176 plans completed across 12 milestones.

## Current Milestone: v3.1 Gmail & CLI Evolution

**Goal:** Add Gmail reading to the PWA via Google OAuth integration, and restructure the CLI to match the Vigil CLI spec (capture, triage, doctor; retire work order commands).

**Target features:**
1. **Google OAuth in PWA** — Settings/Integrations page, connect/disconnect Google account
2. **Gmail inbox reading** — List messages, read threads in PWA
3. **Gmail search** — Search by keyword, sender, date range
4. **Work order extraction from Gmail** — Auto-detect WO emails, feed into existing WO system
5. **Gmail API on server** — Add gmail.readonly scope, Gmail service + routes in vigil-core
6. **CLI capture command** — POST thought from terminal, triggers AI triage
7. **CLI triage command** — Batch re-triage uncategorized thoughts
8. **CLI doctor command** — Check API keys, env vars, plist, Railway sync
9. **Retire CLI work order commands** — Move complete/uncomplete/list-completed to dashboard-only
10. **Promote setup to subcommand** — Replace --setup flag with proper `setup` subcommand

**Key context:** Google OAuth infrastructure exists from Phase 74 (calendar). Reuse token storage/refresh, add gmail.readonly scope. CLI restructure follows Vigil CLI Structure PDF spec (April 2026).

## What This Is

An ambient AI life assistant built for ADHD brains. A native macOS app (formerly Jarvis) with frictionless text/voice/image capture, Claude AI auto-triage, therapy intelligence, tags/favorites/linking, a SwiftUI dashboard, and a daily printed PDF brief. Now a multi-client platform deployed to production: Vigil Core API (Node.js/Hono/Drizzle/PostgreSQL) runs on Railway, the Mac app connects to the production server with bearer token auth, and Even G2 smart glasses provide ambient glanceable display of work orders, reminders, and affirmations.

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
- ✓ Server deployment — Vigil Core on Railway with managed PostgreSQL, bearer auth, HTTPS — v2.1
- ✓ PostgreSQL migration — Drizzle ORM replacing better-sqlite3, tsvector FTS — v2.1
- ✓ API hardening — rate limiting, timeouts, security headers, CORS, smoke tests — v2.1
- ✓ Data migration — local SQLite thoughts migrated to production PostgreSQL — v2.1
- ✓ G2 plugin UX — task detail screen with tap-to-expand and swipe navigation — v2.2
- ✓ Remove dual code paths — retired GRDB, CloudKit, local AI services (API-only mode) — v2.2
- ✓ Brief history — browse and reprint past daily briefs from dashboard and CLI — v2.2
- ✓ Export system — thoughts as JSON, CSV, or Markdown via API and CLI — v2.2
- ✓ Configurable PDF — paper size, margins, font scale, section toggles — v2.2
- ✓ Dashboard AI chat — multi-turn Claude conversation with thought context injection — v2.2
- ✓ Menu bar update action — one-click rebuild/reinstall/reload from DailyBriefMonitor, replaces install.sh dev loop — v2.3
- ✓ Projects as first-class entities — named projects with per-project dashboard views, optimistic assign/move/unassign, NewProjectSheet with create+edit modes, status filter — v2.3
- ✓ Push-on-phase-complete structural fix — `gsd phase complete` auto-pushes deploy-target commits; first real fire during Phase 53 UAT pushed 22 backlogged commits — v2.3
- ✓ Cross-machine bootstrap + drift doctor — `scripts/bootstrap.sh` (1Password CLI + 10-step orchestration) and `scripts/dailybrief-doctor.sh` (read-only ANTHROPIC + VIGIL bearer drift detection) — v2.3
- ✓ Persistent code signing — Developer ID Application signing in install.sh; TCC permissions survive rebuilds — v2.4
- ✓ Smart photo upload — Claude vision paper-type detection, verbatim transcription, lined→split/gridded→single, preview with override, uncertainty surfacing — v2.4
- ✓ Folder watch feeder — DispatchSource watcher feeds images + audio to Vigil Core headlessly, iCloud support, auto-triage, menu bar error state — v2.4
- ✓ Folder watch settings UI — paper-type picker, live watcher restart on save, corrected extension help text — v2.4
- ✓ .app bundle packaging — DailyBriefMonitor.app with Info.plist, LSUIElement, Developer ID bundle signing — v2.4
- ✓ PWA dashboard — cross-platform web app at app.vigilhub.io replacing Mac-only SwiftUI dashboard — v2.5
- ✓ Work order management — view, complete, prioritize work orders from PWA — v2.5
- ✓ Bulk actions & filters — multi-select delete/recategorize, category/date filters in PWA — v2.5
- ✓ AI chat in PWA — multi-turn Claude conversation with thought context — v2.5
- ✓ Insights & therapy in PWA — pattern recognition, therapy prep display — v2.5
- ✓ Brief history & photo upload in PWA — browse past briefs, upload photos — v2.5
- ✓ Server-side sports API — balldontlie.io proxy in vigil-core for MLB, NFL, NBA, NHL — v3.0
- ✓ Server-side Google Calendar — OAuth token storage + refresh in vigil-core — v3.0
- ✓ Brief assembly endpoint — `/v1/brief/generate` orchestrates all data, returns PDF — v3.0
- ✓ Server-side PDF rendering — PDFKit 3-page brief with Vigil branding — v3.0
- ✓ PWA brief UI — generate, preview, download, print-from-browser — v3.0
- ✓ Server-side brief storage — save generated PDFs for retrieval by any client — v3.0
- ✓ Mac CLI thin client — replace local CoreGraphics rendering with API call + lpr — v3.0

### Active (v3.1)

- [ ] Google OAuth in PWA — Settings/Integrations page with connect/disconnect Google account
- [ ] Gmail inbox reading — list messages and read threads in PWA
- [ ] Gmail search — search by keyword, sender, date range in PWA
- [ ] Work order extraction from Gmail — auto-detect WO emails, feed into WO system
- [ ] Gmail API on server — gmail.readonly scope, Gmail service + routes in vigil-core
- [ ] CLI capture command — POST thought from terminal with AI triage
- [ ] CLI triage command — batch re-triage uncategorized thoughts
- [ ] CLI doctor command — check API keys, env vars, plist, Railway sync
- [ ] Retire CLI work order commands — complete/uncomplete/list-completed to dashboard-only
- [ ] Promote setup to subcommand — replace --setup flag with proper subcommand

### Future

- Email delivery — optional scheduled brief delivery as PDF attachment (deferred from v3.0)

### Out of Scope

- Native iOS/Android app — PWA covers cross-platform access; native mobile only if PWA proves insufficient
- Real-time voice assistant — this is capture-and-review, not conversational
- Replacing the physical notebook — digital complements the traveler's notebook, doesn't replace it
- Multi-user support — build after Vigil Core is proven on a server
- Android XR native — WebXR/PWA first; native Kotlin only if spatial features needed
- ServiceNow API integration — blocked on IT token; work orders stay IMAP-sourced until unblocked
- Auto-detection of project assignment from photo content — manual assignment works; auto-routing is future
- Work order → project linkage — projects are personal only; work orders stay separate

## Context

Shipped v3.0 Server-Side PDF (2026-04-13) — Brief generation moved to vigil-core (PDFKit), Mac CLI is thin client, PWA generates/previews/downloads. 6 phases, 11 plans.
Shipped v2.5 Dashboard Everywhere (2026-04-12) — Full PWA at app.vigilhub.io with thoughts, work orders, projects, bulk actions, AI chat, insights/therapy, brief history, photo upload. 10 phases, 17 plans.
Shipped v2.4 Capture Without Friction (2026-04-10) — Developer ID signing, smart photo upload, folder watch feeder, .app bundle packaging.
Tech stack: Swift 6.2/SwiftUI/SPM (Mac app, ~14,000 LOC), Node.js/Hono/TypeScript/Drizzle ORM/PostgreSQL (Vigil Core API), React/Vite/TypeScript (PWA), Vite/TypeScript/Even Hub SDK (G2 plugin).
4 client surfaces connected to production: Mac app (capture + menu bar + folder watcher + PDF brief), PWA (dashboard + management), Vigil Core API (Railway, 20+ REST endpoints), Even G2 plugin (3 screens + task detail).
API secured with SHA-256 hashed bearer tokens, rate limiting (100 req/60s), 30s timeouts, security headers, and CORS.
78 phases and ~176 plans completed across 12 milestones in ~13 days.

## Constraints

- **Platform**: macOS 14+ (Sonoma), Swift 6.2, SwiftUI; PWA via React/Vite
- **AI Provider**: Anthropic Claude API (already integrated)
- **Build System**: Swift Package Manager (existing setup)
- **Data Storage**: Production PostgreSQL on Railway (Drizzle ORM, tsvector FTS)
- **Voice Capture**: SFSpeechRecognizer for on-device transcription; external pocket recorder for mobile
- **Physical Output**: Daily PDF must remain printable and glueable into traveler's notebook

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Native macOS app (not web) | User is all-Apple; deeper system integration; DailyBrief already Swift/SwiftUI | ✓ Good |
| Pocket voice recorder for mobile capture | Phone is too much friction while driving; one-button press solves ADHD capture barrier | ✓ Good |
| Claude for AI categorization | Already integrated for affirmations; natural language understanding for thought triage | ✓ Good |
| Local-first data storage (GRDB/SQLite) | Privacy (therapy notes, personal thoughts); no cloud dependency; simplicity | ✓ Good |
| Drop Apple Reminders — use Vigil task thoughts | Vigil captures tasks natively; Reminders was redundant and Mac-only | ✓ Good — decided v3.0 |
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
| Config toggle (vigil.useAPI) for dual mode | Allowed testing API backend while keeping local fallback; retired in v2.2 | ✓ Good — served its purpose |
| snake_case config keys for cross-platform compat | Swift JSONEncoder requires snake_case; discovered during integration testing | ✓ Good |
| Localhost-only for v2.0 | Avoids auth/deployment complexity; proves architecture before scaling | ✓ Good — enabled confident v2.1 deployment |
| Drizzle ORM over raw SQL for PostgreSQL | Type-safe queries, migration tooling, connection pooling built-in | ✓ Good |
| Railway over self-hosted VPS | Managed Postgres addon, GitHub CI/CD, zero DevOps overhead | ✓ Good |
| SHA-256 hashed bearer tokens (vk_ prefix) | Simple auth model, no session management needed for API-to-API calls | ✓ Good |
| Keep Railway default domain | vigil-core-production.up.railway.app with HTTPS included; custom domain unnecessary for now | — Pending |
| In-memory rate limiting over Redis | Single-instance deployment; no external dependency needed at current scale | ✓ Good |
| Programmatic migrations on deploy | Drizzle migrate() runs idempotently on every Railway deploy; no manual step | ✓ Good |

| PDFLayout computed from PDFConfig | Flat struct with all dimensions, drives all renderers; notebook preset hardcodes 270x540 | ✓ Good |
| maxTokens 1024 for chat | ADHD-friendly concise replies from Claude | ✓ Good |
| Retire local GRDB/CloudKit/AI in v2.2 | API backend proven stable in v2.1; dual code paths were maintenance burden | ✓ Good |

| Server-side PDF rendering | Removes Mac dependency for brief generation; any client can get briefs | — Pending |
| HTML+CSS to PDF over CoreText port | Easier to maintain, iterate on layout; Puppeteer/similar in Node | — Pending |

---
*Last updated: 2026-04-13 after v3.1 Gmail & CLI Evolution milestone started*
