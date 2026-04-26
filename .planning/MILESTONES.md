# Project Milestones: Vigil — Ambient AI Life Assistant

## v3.6 Multi-User Completion, Auth UX & Safari Parity (Shipped: 2026-04-26)

**Phases completed:** 7 phases (108-114), 27 plans, all 8 v3.6 requirements satisfied
**Requirements:** 8/8 satisfied (W-01, W-02, SCHED-01, AUTH-09, EMAIL-01, AUTH-10, AUTH-11, EXT-02)
**Production:** live at api.vigilhub.io and app.vigilhub.io — full UAT pass on 2026-04-26 across all phases

**Key accomplishments:**

- **Multi-user loop fully closed (Phases 108-109)** — `work_order_statuses` migrated to user-scoped composite key with all four call sites userId-filtered (W-01); cross-user isolation test extended to assert User B cannot retrieve User A's brief PDF bytes (W-02); generate-scheduler `tick()` iterates every registered user with per-user try/catch+continue, prioritization filesystem cache key includes userId so no cross-user data leaks (SCHED-01).
- **Self-service password change with cross-device session invalidation (Phase 110, AUTH-09)** — POST /v1/auth/change-password endpoint + bearerAuth `jwt.iat < password_changed_at` gate + PWA inline form on Settings page; D-19 cross-device session invalidation verified live (Device A change → Device B kicked to /auth on next request); 401 'Session expired' handler in vigilFetch redirects with `?reason=session_expired` so the user sees a banner instead of a cryptic bounce.
- **First production-deliverable email infrastructure (Phase 111, EMAIL-01)** — Resend account + DKIM/SPF/DMARC live on `vigilhub.io` Cloudflare DNS with verified status; email-service.ts module follows the lazy-null-init pattern (vigil-core boots without RESEND_API_KEY); click_tracking: false applied per-send so Apple Mail prefetch can't burn single-use tokens; raw-source verification in Gmail confirms verbatim app.vigilhub.io URLs (no Resend tracking wrapper). DMARC monitoring active with daily aggregate reports streaming clean DKIM+SPF passes.
- **Forgot-password flow shipped end-to-end (Phase 112, AUTH-10)** — POST /v1/auth/forgot-password (enumeration-safe: dummy argon2 verify on miss + dual-axis rate limit) + POST /v1/auth/reset-password (atomic UPDATE-RETURNING claim + password_changed_at bump for AUTH-09 session invalidation) + ForgotPasswordPage and ResetPasswordPage in PWA. Live UAT on 2026-04-25 confirmed all 5 SCs PASS against Railway production.
- **Verify email on signup with grandfathering (Phase 113, AUTH-11)** — Register hook fires fire-and-forget verification email; PWA `/settings` shows non-blocking amber banner with Resend lifecycle (3/hr per-userId rate limit, terminal 429 state at 4th click); D-19 prefetch-safe gate (Confirm button required — no useEffect-fired POST on mount, regression test `AUTH-11-P-MOUNT-NO-FETCH` locks it in); 0017 migration backfills `email_verified_at = created_at` for all pre-existing users so no lockout post-deploy. 5 SCs PASS in live UAT 2026-04-26; Apple Mail prefetch DEFERRED with structural+runtime evidence for D-19.
- **Safari extension Chrome-94 quick-capture parity (Phase 114, EXT-02)** — verbatim Chrome → Safari port of `popup.{html,js,css}`: empty textarea on open + focus, "Include page URL" checkbox with verbatim D-06 format `\n\n${tab.title || 'Page'}: ${tab.url}`, ⌘+Enter handler keying off `e.metaKey || e.ctrlKey` (load-bearing empirical probe in Plan 01 captured `metaKey: true` from WebKit Web Inspector before any port code landed per D-03/D-04/D-05), 800ms triage poll with 5s timeout rendering category-badge pill on success or plain "✓ Captured!" on timeout. Re-sign verified via `xcodebuild clean build` + `codesign --verify --deep --strict` (D-15 reword from `spctl --assess` after empirical proof spctl rejects Apple Development-signed builds by design). 5 SCs PASS on physical Mac hardware UAT.
- **Late-breaking Phase 102 hotfix (Google OAuth init regression)** — discovered during v3.6 closeout: PWA's `redirectToGoogleAuth()` called `window.location.href = ${API_BASE}/v1/auth/google` but server-side route was bearerAuth-gated since Phase 102; browsers don't send Authorization headers on plain navigations, so the route silently 401'd for 12 days. Fixed via new `POST /v1/auth/google/init` endpoint (bearer-required, returns `{redirect_url}` JSON) + PWA two-step async flow + 4 regression tests including `GA-INIT-04-method-only` that asserts GET on the path returns 404 (prevents the same regression class from sneaking back). User re-OAuth'd Gmail + Calendar successfully.
- **Polish: ADHD-friendly capture hygiene** — `shouldBypassWindow()` exempts both `category="idea"` and `category="task"` from the default 7-day thoughts window, matching the "nothing rots" capture contract; D-02 lockstep header comments mirror across all 6 Chrome+Safari extension popup files; 4 follow-ups captured as seeds/todos (DMARC ramp, verify-email error UX, gmail-workorders importer, ThoughtRow whitespace-pre-line).

**Known deferrals (DEFERRED, not blocking ship):**

- **Apple Mail prefetch UAT (Phase 113)** — no iOS device with `jamesonmorrill1@gmail.com` bound to native Mail.app available during UAT session. D-19 gate verified at source level + 3 runtime confirmations during SC#3. Revisit if/when an iOS device with this inbox becomes available.
- **DMARC ramp `p=none` → `p=quarantine`** — captured as SEED-003 with auto-evaluation routine scheduled for 2026-05-06 (10 days post-Phase-113-ship; checks ≥7 days clean aggregate reports + ≥3 days production verify-email volume).

**Post-ship cleanup (captured for v3.7+):**

- SEED-003 — DMARC ramp
- SEED-004 — verify-email error UX (rotated/expired/rate-limited differentiation)
- Todo — disable gmail-workorders importer tick (or replace via ServiceNow API)
- Todo — `whitespace-pre-line` on `ThoughtRow.tsx:399`
- Test-user cleanup (`upper@case.com`, `test+phase104@local.test` rows in production)

---

## v3.4 Multi-User Foundation & PWA Polish (Shipped: 2026-04-18)

**Phases completed:** 4 phases (99-102), 15 plans, 37 tasks
**Git range:** fbd667c..a9309e8 (56 commits, +27,410 / -645 LOC across 131 files)
**Requirements:** 14/14 satisfied (BRIEF-01, EDIT-01, CTX-01..07, AUTH-01..05)
**Production:** live at api.vigilhub.io — 5/5 go/no-go curls GREEN

**Key accomplishments:**

- **Multi-user foundation live on Railway** — users table with argon2id passwords, POST /v1/auth/register + /login with JWT (HS256), bearerAuth three-path dispatcher (vk_/JWT/malformed), userId FKs on 11 data tables, and per-user scoping threaded through 20 route files + 4 service files. Google OAuth state-JWT carries userId through initiate → callback → oauth_tokens upsert. vk_ backcompat preserved so PWA/Monitor/G2/CLI survive with zero client changes. (Phase 102)
- **Context menu on every thought row** — right-click (desktop) + long-press (iOS) surfaces a 7-action menu (delete/move/edit/re-triage/add-to-project/etc). Deferred-commit delete with single-slot toast undo window, optimistic category/project moves, and the D-19 interlock that keeps Phase 100's edit pause-gate as the sole setIsEditing entry point. 33/33 ContextMenu cases + 5/5 ThoughtsPage integration tests GREEN; iOS Safari long-press UAT operator-approved. (Phase 101)
- **Edit-refresh collision eliminated** — window event bus `vigil:edit-started`/`vigil:edit-ended` with Set-based refcount pauses the 30s poll (+ visibilitychange + vigil:thought-created triggers) during active inline edits, then fires a single catch-up refetch on the last-edit-ends transition. 12/12 fake-timer vitest cases lock the contract. (Phase 100)
- **Brief history survives Railway redeploys** — new brief_pdfs BYTEA table replaces the /tmp filesystem write path; POST/GET + scheduler + PWA detail-view all round-trip through the DB sink. Structured 404 (`brief_not_found` vs `brief_pdf_not_stored`) drives branched PWA UX with a Regenerate affordance. Operator-verified post-deploy on live Railway. (Phase 99)
- **Wave-0 TDD discipline at scale** — 108+ failing test scaffolds landed before a single production line across Phases 101 (63 cases: D-01..D-21 + CTX-01..CTX-07 + iOS pitfalls) and 102 (45 cases: password/jwt/middleware/auth-routes/migration/cross-user-isolation). Cross-user-isolation suite runs against live Railway DB.
- **Production operability** — JWT_SECRET fail-fast boot-check, Dockerfile seed-script CMD chain, 102-RUNBOOK.md (deploy + rotation + rollback playbook), and the 6380c6c `.trim().toLowerCase()` fix hardening seed-user lookup against paste-artifact whitespace across all three scheduler call sites.

**Known non-blocking tech debt (v3.5 candidates):**

- W-01: `work_order_statuses` table lacks userId column — top AUTH-06-adjacent follow-up
- W-02: cross-user-isolation test covers GET /v1/briefs list but not GET /v1/brief/:date PDF bytes
- Phase 101 WR-01..04 + info findings (ContextMenu keydown deps, handleRetriage try/catch, etc.)
- VALIDATION.md paperwork gap for Phases 99/100/102 (coverage itself is substantial)

**Audit:** [milestones/v3.4-MILESTONE-AUDIT.md](milestones/v3.4-MILESTONE-AUDIT.md)
**Archive:** [milestones/v3.4-ROADMAP.md](milestones/v3.4-ROADMAP.md) · [milestones/v3.4-REQUIREMENTS.md](milestones/v3.4-REQUIREMENTS.md)

---

## v3.3 Stability & Chat Context (Shipped: 2026-04-17)

**Phases completed:** 3 phases, 5 plans, 11 tasks

**Key accomplishments:**

- Fixed PWA chat 400 error by replacing setState functional updater with messagesRef — React 18 concurrent mode does not call the updater synchronously, so newMessages was always [] at the time sendChatMessage was called
- Server-side excludeDone filter on GET /v1/thoughts hides done tasks from all views by default, with Tasks tab Done/All overrides preserved
- PrintService throws on lpr failure with reachability guard, CLI recovers from Railway /tmp 404 via POST generate, Monitor shows red badge on failure
- Full print chain verified: PDF generation, 404 fallback, actual-size printing, Doctor all-pass, legacy agent removed
- Chat button on every thought row with one-tap navigation to ChatPage that auto-sends the thought and gets an AI response

---

## v3.2 Freshness & Capture Parity (Shipped: 2026-04-16)

**Phases completed:** 8 phases, 14 plans, 24 tasks

**Key accomplishments:**

- Pure Wed-anchored week window utility using native Intl.DateTimeFormat with 13 passing unit tests covering DST, extreme tz offsets, and injectable now — zero new dependencies
- GET /thoughts now defaults to current Wed-Wed window in user tz; three bypass rules preserve search, explicit date ranges, and ?window=all; RO-08 sentinel locks Chat's direct-Drizzle path as a regression test
- Five PWA hooks + Mac CLI triage + smoke test patched with window=all; getThoughts() gains typed window?: 'all' param; useThoughts unchanged as intended week-default consumer
- Week/search context header wired to ThoughtsPage with client-side tz-aware date bounds and branched empty state in ThoughtList — human-verified in live PWA (Checks A, B, D passed)
- One-liner:
- ai_cache Drizzle table with JSONB storage, GET cache endpoints for insights/therapy, and upsert cache-write in all three POST AI handlers
- Cache-first useInsights/useTherapy hooks with regenerate callbacks, auto-resume useChat, and cache API client functions
- InsightsPage and TherapyPage show gray Regenerate button + relative timestamp when cached, teal Generate button on first visit
- Segmented Open/Done/All pill toggle on Tasks tab with localStorage-first persistence and server sync via app_settings
- Soft-delete archivedAt column with lazy auto-archive on GET, filter param, unarchive endpoint, bulk-delete endpoint, and PWA client functions
- Active/Archived/All filter tabs with dimmed archived row styling, per-row Unarchive button, and Clear Archived bulk-delete with confirmation dialog
- Wed-anchored week window applied to all three brief thought queries using Phase 88 date-window helper and app_settings timezone
- Capture UX with triage polling (category badge feedback), optional URL inclusion, and Cmd/Ctrl+Enter keyboard shortcut
- iOS PWA standalone mode Google OAuth verified working on real iPhone against live Railway deployment

---

## v3.1 Gmail + Thin Clients (Shipped: 2026-04-15)

**Phases completed:** 11 phases, 26 plans, 17 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- oauthTokens table
- calendar-service.ts
- PDFKit-based rendering engine with Inter font bundling, BriefRenderData contract, and Page 1 layout (work orders, task thoughts, calendar, notes) using Vigil brand colors
- Complete 3-page daily brief PDF: Page 2 with multi-sport compact layout and affirmation, Page 3+ with paginated AI insights spillover and therapy prep
- Promise.allSettled orchestration service with per-source timeouts, data mappers for sports/calendar/work orders/thoughts, filesystem PDF persistence, and affirmation/prioritization caching
- POST /brief/generate and GET /brief/:date Hono route handlers with DI factory, briefs table upsert, date validation, and binary PDF response
- Generate/preview/download brief UI in React PWA — iframe blob URL rendering, generate state machine, blob cleanup, and Layout tab rename
- One-liner:
- GET /v1/google/status endpoint reads oauthTokens.scopes column and returns per-scope calendar/gmail authorization state behind bearer auth
- Task 1 — Schema update (commit `74b896b`):
- Task 1 — calendar-auth.ts callback + status wiring (commit `b1d9a9d`):
- Task 1 — Test harness + 5 new tests (commit `dc73066`):
- Brand token system:
- AuthPage.tsx
- 1. [Rule 3 - Blocking] Added missing `@testing-library/dom` peer dependency
- 1. [Rule 3 — Blocking] Stale `pwaUrl` variable reference after rename
- 1. [Rule 3 — Blocking] vitest harness not yet merged from parallel Plan 01
- One-liner:
- Files:
- Four new ArgumentParser subcommands (Capture/Triage/Doctor/Setup) scaffolded with full flag declarations; three WO commands retired to dashboard redirect; --setup flag shimmed with deprecation warning
- Full implementations for Capture (POST /thoughts + /triage), Triage (batch uncategorized + PUT back), and Doctor (5-check health report) replacing Plan 01 stubs

---

## v2.5 Dashboard Everywhere (Shipped: 2026-04-12)

**Phases completed:** 10 phases, 16 plans, 11 tasks

**Key accomplishments:**

- One-liner:
- Read-only thoughts dashboard with category tab filtering and 300ms-debounced full-text search, replacing the Phase 63 placeholder via six new components and four new API functions
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- `bulkDeleteThoughts` / `bulkRecategorizeThoughts`
- FilterBar component
- One-liner:
- useTherapy hook
- API layer (client.ts):
- Status:

---

## v2.4 Capture Without Friction (Shipped: 2026-04-10)

**Phases completed:** 11 phases, 23 plans, 46 tasks

**Key accomplishments:**

- 1. [Rule 1 - Bug] NSString string-literal initializer required `string:` label
- Replaced the install.sh subprocess inside `UpdateService.runUpdateLifecycle()` with an inline `installBuiltBinaries()` Swift helper using `FileManager.copyItem`, restoring the trampoline invariant (only `/tmp/vigil-reload.sh` touches launchctl) and making the Update Vigil button actually surface the "✓ Updated to {sha}" feedback end-to-end.
- One-liner:
- `Sources/JarvisCore/Models/Project.swift` (new):
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift`:
- `Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift`
- One-liner:
- One-liner:
- One-liner:
- Found during:
- Developer ID Application signing wired into install.sh with cert guard, codesign --force after cp, and codesign --verify — eliminates the TCC permission reset on every rebuild
- Added block
- Verbatim-OCR photo endpoint live — Claude vision + batched Postgres insert + real lined/gridded handwriting verified with a writer's typo preserved through the pipeline
- `/v1/process-photo` gains preview mode, `forcePaperType` override, 413 guard, and generic 502 — backend enablement for dashboard before-commit preview UX
- Mac dashboard preview-first photo upload shipped — SwiftUI sheet with paper-type override, confidence badge, uncertainty banner, Settings default paper type, and the existing batch loop rewritten to pipe every photo through /v1/process-photo?preview=true before committing
- One-liner:
- One-liner:
- Task 1: defaultPaperType config + Settings UI (commit e5bcf36)

---

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
