# Vigil — Ambient AI Life Assistant

## Current State

**In progress:** v3.6 Multi-User Completion, Auth UX & Safari Parity (started 2026-04-22) — close the v3.4 multi-user loop (per-user isolation + scheduler fan-out), complete auth UX (change-password, forgot-password, email verify), and bring Safari extension to Phase 94 quick-capture parity with Chrome.

**Paused:** v3.5 Observability, G2 Resubmit & Capture Repair — 34/34 plans complete but not shipped. Blocked only on G2 physical hardware UAT (device delivery date unknown). Phase 106-05 simulator-session `.ehpk` package + hardware retest carry forward; will close v3.5 when device arrives.

**Phase 111 complete (2026-04-24):** Transactional email infrastructure (Resend) — `vigilhub.io` verified as a Resend sending domain (DKIM TXT root + SPF/MX at `send.` subdomain + DMARC with `rua=` to gmail), `vigil-core/src/services/email-service.ts` ships typed wrappers (sendPasswordResetEmail, sendEmailVerificationEmail, sendEmail) with lazy null-init mirroring `posthog.ts` pattern, SHA-256 PII hashing, no-key gate (returns `{status:"skipped_no_key"}` cold), and Vigil teal `#1D9E75` CTA. Live smoke send hit jamesonmorrill1@gmail.com Inbox with DKIM/SPF/DMARC=PASS and verbatim `app.vigilhub.io/auth/reset` href (no tracking rewrite). EMAIL-01 satisfied. iCloud personal email coexistence preserved (root SPF untouched).

**Phase 110 complete (2026-04-24):** Change password + `password_changed_at` JWT iat-gate — `POST /v1/auth/change-password` mounted on protected router, bearerAuth Path 2 rejects pre-change JWTs with distinct `{error:"Session expired"}` 401, PWA Settings inline form keeps the initiating device logged in (D-17 ordering pinned), global `vigilFetch` 401 handler force-navigates other devices to `/auth?reason=session_expired` with banner. AUTH-09 satisfied. 19 commits pushed to Railway.

**Phase 107.3 complete (2026-04-22):** Prod bind + install.sh + doctor cleanup — vigil-core Railway-aware bind via `RAILWAY_SERVICE_ID` (fixes 502 class of bug), install.sh awk-based identity resolution (pipefail-immune), dailybrief-doctor.sh three-way plist branch (retired/present/missing), verify-phase-107.sh `--external` live `api.vigilhub.io/v1/health` probe.

**Phase 107.2 complete (2026-04-22):** Cross-machine Tailscale dev access — MacBook Pro browser → iMac's `npm run dev` stack via Vite proxy, without weakening prod. Env-gated VIGIL_BIND_HOST (default 127.0.0.1 safe), prod FATAL guard refuses to boot without CORS_ORIGINS, Vite `host: true` + `allowedHosts` + `/v1` proxy, preflight Check 5 surfaces bind + macOS firewall state.

**Shipped:** v3.4 Multi-User Foundation & PWA Polish (2026-04-18) — 4 phases, 15 plans, 14/14 requirements satisfied, live on api.vigilhub.io with 5/5 go/no-go curls GREEN.

## Current Milestone: v3.6 Multi-User Completion, Auth UX & Safari Parity

**Goal:** Close the v3.4 multi-user loop end-to-end (per-user isolation + scheduler fan-out), complete the auth UX flows (change password, forgot password, email verify), and bring the Safari extension up to Chrome's Phase 94 quick-capture feature parity.

**Target features:**

*Multi-user completion (v3.4/v3.5 carry-forward):*
- W-01: `work_order_statuses` userId column + migration + query scoping
- W-02: cross-user isolation test for `GET /v1/brief/:date` PDF bytes path
- SCHED-01: per-user scheduler fan-out — brief generation + prioritization cache iterate all users, not just seed

*Auth UX completion:*
- AUTH-09: change password from PWA profile (self-service, no email needed)
- AUTH-10: forgot-password email link (introduces transactional email)
- AUTH-11: verify email on signup (reuses AUTH-10 email provider)

*Safari extension parity:*
- EXT-02: Safari extension matches Chrome Phase 94 quick-capture — freeform text + URL checkbox + triage feedback + Cmd+Enter submit

**New cross-cutting dependency:**
- Transactional email provider (Resend / Postmark / SES / similar) — first outbound email in Vigil; provider choice falls out of research or the first auth phase plan

**Paused from v3.5 (blocked on G2 hardware — delivery unknown):**
- Phase 106-05: single simulator session to capture verified PNGs + package `.ehpk`
- G2 physical device retest (tap-expand + swipe-out-of-list + resubmit UAT)

**Still blocked (not in v3.6 scope):**
- Phase 85 (iOS Shortcut) — Shortcuts.app bugs
- Phase 80 (ServiceNow API work orders) — IT token

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

- ✓ Server-side sports API — ESPN/balldontlie proxy in vigil-core for MLB, NFL, NBA, NHL — v3.0
- ✓ Server-side Google Calendar — OAuth token storage + refresh in vigil-core — v3.0
- ✓ Brief assembly endpoint — `/v1/brief/generate` orchestrates all data, returns PDF — v3.0
- ✓ Server-side PDF rendering — 3-page brief via PDFKit on Railway — v3.0
- ✓ PWA brief UI — generate, preview, download — v3.0
- ✓ Server-side brief storage — briefs table, retrievable by any client — v3.0
- ✓ Mac CLI thin client — replaced local CoreGraphics with API call + lpr — v3.0
- ✓ Gmail OAuth server foundation — scope expansion, JWT nonce survives rolling deploys — v3.1
- ✓ PWA brand token foundation — Vigil teal/Inter/brand-compliant theme — v3.1
- ✓ PWA Settings & Google OAuth UI — connect/disconnect, per-scope status — v3.1
- ✓ CLI restructure — capture/triage/doctor/setup subcommands — v3.1
- ✓ Menu bar redesign — print-scheduler-only monitor, LSUIElement — v3.1
- ✓ Browser extension v1 — Chrome + Safari one-click URL capture — v3.1
- ✓ Split brief schedule — server cron + Mac pull-only CLI + PWA two-card UI — v3.1
- ✓ Vigil app icons — PWA icon set + Mac AppIcon.icns from brand master — v3.1
- ✓ Weekly thought rollover — Wed–Tue view window with search/Chat bypass — v3.2
- ✓ 7-day analysis window — Insights + Therapy scoped to last 7 days via shared date-window helper — v3.2
- ✓ Server-side persistence — Insights/Therapy/Therapy-prep cached with Regenerate; Chat auto-resumes — v3.2
- ✓ Tasks tab status filter — Open/Done/All toggle with localStorage + server-synced persistence — v3.2
- ✓ Work Order auto-archive — lazy archive on GET, Active/Archived/All filter, unarchive, bulk-clear — v3.2
- ✓ Brief PDF cleanup — de-duplicated Tasks, Affirmation on Page 1, 7-day thought scope — v3.2
- ✓ Browser extension quick-capture — freeform text + triage feedback + URL checkbox + Cmd+Enter — v3.2
- ✓ iOS PWA standalone OAuth — real-device verified on live Railway deploy — v3.2
- ✓ PWA chat 400 fix — messagesRef pattern for React 18 concurrent mode — v3.3
- ✓ Completed tasks hidden from all views — server-side excludeDone filter — v3.3
- ✓ Mac CLI print reliability — lpr error handling, 404 fallback, reachability check — v3.3
- ✓ Thought-contextual chat — chat button on every thought with auto-send — v3.3
- ✓ Multi-user foundation — users table + userId FK on 11 scoped tables, argon2id password + HS256 JWT, bearerAuth three-path dispatcher (vk_ keys + JWT + legacy), POST /v1/auth/register|login with D-11 claim-flow, seed-user backfill preserving D-03 vk_-client backcompat — v3.4
- ✓ Brief history survives Railway redeploys — brief_pdfs BYTEA table replacing /tmp write path, structured 404 (`brief_not_found` vs `brief_pdf_not_stored`) drives branched PWA UX with Regenerate affordance — v3.4
- ✓ Edit-refresh pause gate — window event bus `vigil:edit-started/ended` with refcount pauses 30s poll during inline edits, fires catch-up refetch on last-edit-ends — v3.4
- ✓ Right-click + long-press context menu — 7 actions (delete/move/edit/re-triage/add-to-project), deferred-commit delete with single-slot toast undo, D-19 interlock preserves Phase 100 pause gate — v3.4
- ✓ `work_order_statuses` user scoping — `user_id NOT NULL` FK + composite `(user_id, case_number)` PK, all 4 route call sites scoped, D-23 guardrail flipped, cross-user PUT overwrite structurally prevented (W-01 — v3.6 Phase 108)
- ✓ GET /v1/brief/:date cross-user isolation — userB receives 404 (not userA's bytes) when requesting a date only userA has; `brief PDF isolation` it() block in `cross-user-isolation.test.ts` (W-02 — v3.6 Phase 108)
- ✓ Per-user scheduler fan-out — `generate-scheduler.ts` iterates all users with try/catch + `continue` for error isolation; `/prioritize` AI cache filenames scoped by userId (`wo-priority-${userId}-${today}-${hash}.json`); `calendar-service.ts` `fetchTodaysEvents(userId)` and `fetchCalendarList(userId)` required; atomic D-12 two-site wiring (`index.ts` + `routes/brief-generate.ts`) makes calendar events render in briefs for the first time ever (SCHED-01 — v3.6 Phase 109)

### Active

**v3.6 (in progress):**
- [ ] Change password from PWA profile (AUTH-09)
- [ ] Forgot-password email link (AUTH-10 — introduces transactional email)
- [ ] Verify email on signup (AUTH-11)
- [ ] Safari extension Phase 94 quick-capture parity (EXT-02)

**v3.5 paused (blocked on G2 hardware):**
- [ ] G2 resubmit: latest-simulator screenshots (G2-01 — code side done, simulator session pending)
- [ ] G2 resubmit: double-tap exit dialogue per lifecycle docs (G2-02 — code side done)
- [ ] G2 resubmit: WebView brand-compliant content (G2-03 — code side done)
- [x] Photo folder watcher repair — broken on iCloud path (CAP-01 — Phase 103)
- [x] Manual photo upload triage — uploaded photos skipping AI categorization (CAP-02 — Phase 103)
- [x] PostHog analytics integration — error tracking + product events + API metrics (ANLY-01 Phase 104, ANLY-02/03/04 Phase 105; dashboard visibility pending human UAT)
- [x] PWA login/register UI (AUTH-06 — Phase 104)
- [x] PWA profile + change-password foundation (AUTH-07 — email display + sign out; full profile editing now AUTH-09 in v3.6)
- [x] Email display in PWA header (AUTH-08 — Phase 104)
- [x] Persistent Safari extension survives restart (EXT-01 — Phase 107; ship-with-uat-pending on physical reboot)
- [x] Local dev environment with Postgres + hot-reload stack (REQ-DEV-LOCAL-ENV — Phase 107.1)
- [x] Cross-machine Tailscale dev access (REQ-DEV-CROSS-MACHINE — Phase 107.2)

**Still blocked (future milestones):**
- [ ] iOS Shortcut quick-capture (IOS-01 — Shortcuts.app bugs)
- [ ] ServiceNow API work order source (WO-01 — IT token)

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

Shipped v3.4 Multi-User Foundation & PWA Polish (2026-04-18) — brief history fix, edit-refresh pause, right-click + long-press context menu, multi-user backend. 4 phases, 15 plans, 131 files changed (+27,410/-645 LOC). Multi-user auth live on https://api.vigilhub.io with seed-user claim-flow, HS256 JWTs, and D-03 no-regression preserved for existing vk_ clients. Tech debt carry-forward: AUTH-06 PWA login UI, W-01 work_order_statuses userId scoping, per-user scheduler fan-out.
Shipped v3.3 Stability & Chat Context (2026-04-17) — PWA chat 400 fix, server-side excludeDone filter, Mac CLI print hardening, thought-contextual chat. 3 phases, 5 plans, 12 files changed (+195/-41 LOC).
Shipped v3.2 Freshness & Capture Parity (2026-04-16) — Wed-anchored weekly rollover, 7-day analysis scope, server-side AI cache with Regenerate, task status filter, work order auto-archive, brief PDF restructure, browser extension quick-capture. 8 phases, 14 plans.
Shipped v3.1 Gmail + Thin Clients (2026-04-15) — Gmail OAuth, PWA brand theme, Settings UI, CLI restructure, menu bar redesign, browser extension, split brief schedule, app icons.
Shipped v3.0 Server-Side PDF (2026-04-14) — Sports proxy, Google Calendar server-side, PDFKit 3-page brief, brief assembly endpoint, PWA brief UI, Mac CLI thin client.
Tech stack: Swift 6.2/SwiftUI/SPM (Mac app, ~14,000 LOC), Node.js/Hono/TypeScript/Drizzle ORM/PostgreSQL (Vigil Core API), React/Vite/TypeScript (PWA), Vite/TypeScript/Even Hub SDK (G2 plugin).
5 client surfaces connected to production: Mac app (capture + menu bar + folder watcher + PDF brief), PWA (dashboard + management + settings), Vigil Core API (Railway, 25+ REST endpoints), Even G2 plugin (3 screens + task detail), Browser extension (Chrome + Safari quick-capture).
API secured with SHA-256 hashed bearer tokens, rate limiting (100 req/60s), 30s timeouts, security headers, and CORS.
102 phases and ~211 plans completed across 16 milestones in ~18 days.

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

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-24 — Phase 110 complete. AUTH-09 shipped: POST /v1/auth/change-password on protected router, bearerAuth iat-gate invalidates pre-change JWTs with distinct "Session expired" 401, PWA inline form + global 401 handler with ?reason=session_expired banner on AuthPage. Live UAT confirmed cross-device invalidation. v3.6 progress: 3/7 phases complete.*
