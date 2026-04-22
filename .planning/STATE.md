---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Observability, G2 Resubmit & Capture Repair
status: executing
stopped_at: Completed 107.2-02-PLAN.md
last_updated: "2026-04-22T13:00:56.155Z"
last_activity: 2026-04-22
progress:
  total_phases: 8
  completed_phases: 5
  total_plans: 32
  completed_plans: 30
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-19)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 107.2 — cross-machine-tailscale-dev-access-with-secure-bind-and-cors

## Current Position

Phase: 107.2 (cross-machine-tailscale-dev-access-with-secure-bind-and-cors) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-04-22

Progress: [███████░░░] 71% (5/7 plans)

## Performance Metrics

**Velocity:**

- Total plans completed: ~211 (through v3.4)
- Total execution time: ~18 days
- Average duration: ~5 min per plan

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0–v3.4 | 1-102 | ~211 | ~18 days |
| v3.5 | 103-107 | TBD | In progress |
| Phase 103 P00 | 3m 11s | 2 tasks | 4 files |
| Phase 103 P01 | 3m 10s | 2 tasks | 3 files |
| Phase 103 P03 | 1m 14s | 1 tasks | 1 files |
| Phase 103 P02 | 18m 10s | 3 tasks | 6 files |
| Phase 103 P04 | 12m 23s | 4 tasks | 5 files |
| Phase 104 P01 | 3min | 2 tasks | 7 files |
| Phase 104 P02 | 3m 3s | 2 tasks | 7 files |
| Phase 104 P03 | 24m 9s | 3 tasks | 5 files |
| Phase 105 P01 | 37min | 2 tasks | 2 files |
| Phase 105 P02 | 4m 7s | 2 tasks | 7 files |
| Phase 105 P03 | 2m 37s | 1 tasks | 2 files |
| Phase 106 P01 | 2m 0s | 2 tasks | 5 files |
| Phase 106 P02 | 4m 32s | 1 tasks | 1 files |
| Phase 106 P03 | 4m 52s | 3 tasks | 5 files |
| Phase 106 P04 | 3m 0s | 2 tasks | 4 files |
| Phase 107 P00 | 2m 40s | 2 tasks | 2 files |
| Phase 107 P01 | 2m 1s | 1 tasks | 1 files |
| Phase 107 P02 | 3m 50s | 2 tasks | 1 files |
| Phase 107 P03 | 2m 18s | 4 tasks | 4 files |
| Phase 107 P05 | 6m 55s | 3 tasks | 5 files |
| Phase 107.1 P01 | 1m 34s | 2 tasks | 1 files |
| Phase 107.1 P02 | 5m 1s | 2 tasks | 2 files |
| Phase 107.1 P04 | ~8m | 1 tasks | 1 files |
| Phase 107.1 P03 | 3m 36s | 2 tasks | 4 files |
| Phase 107.1 P05 | ~7 min | 1 tasks | 4 files |
| Phase 107.1 P06 | 2m 36s | 3 tasks | 1 files |
| Phase 107.1 P07 | 4m 2s | 3 tasks | 4 files |
| Phase 107.2 P01 | 4m 13s | 3 tasks | 3 files |
| Phase 107.2 P02 | 5m 6s | 2 tasks | 3 files |

## Accumulated Context

### Roadmap Evolution

- Phase 107.1 inserted after Phase 107: local dev environment with Postgres and hot-reload stack (URGENT)
- Phase 107.2 inserted after Phase 107: cross-machine Tailscale dev access with secure bind and CORS (URGENT)

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

**v3.5 key decisions locked before implementation:**

- PostHog: separate API keys per environment (never one project for all envs)
- PostHog: all `capture()` calls via `trackEvent()` wrapper with null-guard — never at call sites directly
- PostHog: property allowlist — enums, booleans, numbers only; never string content from user data
- PostHog: `shutdown()` added to SIGTERM and SIGINT handlers at SDK init time
- JWT storage: sessionStorage (not localStorage) — XSS tradeoff acceptable for single-user private app
- AUTH-06 login error: single generic message for all 4xx — no user enumeration
- AUTH-06 scope: no "Forgot Password" link — no email infrastructure in v3.5
- G2 resubmit: all three items (G2-01/02/03) gated together — no partial submission
- CAP-02: run diagnostic curl before any fix code is written
- [Phase 103]: Plan 103-00 — RED-by-default scaffold pattern: appended failing tests before implementation lands. CAP-02 reproduces on live Railway (5 thoughts, all category=null) per artifacts/cap-02-pre-fix-curl.txt
- [Phase 103]: Plan 103-00 — Runtime RED (not TS compile-time RED) chosen for CAP-* cases: cast fake deps as Partial<ProcessPhotoDeps> so file compiles today; Plan 02 removes cast when extending interface
- [Phase 103]: Plan 103-01 — Used snake_case before_send verbatim (Pitfall 2); normalized non-Error throws inside captureException wrapper; no NODE_ENV coupling (key-absence gate only)
- [Phase 103]: Plan 103-03 — Used String(row.id) from the DB-returned value rather than String(userId) from context; distinguished 'db_unavailable' sentinel from other throws (503 vs rethrow to app.onError); exported BOTH createMeRouter factory AND me singleton to satisfy Plan 00 tests today and future dep-injected tests later
- [Phase 103]: Plan 103-02 — Replaced sharp with heic-convert@^2.1.0 per D-01 revision (pure-JS, zero Railway rebuild). Promise.allSettled over Promise.all for per-thought triage (Pitfall 6). Extended ProcessPhotoDeps from 3 to 6 fields (heicConvertFn, triageFn, dbUpdateTriageFn) as required, non-optional — test makeDeps() gained defaults so existing callers compile unchanged.
- [Phase 103]: Used debug-throw temporary route (Option B) for ANLY-01 SC#3 verification — no pre-existing broken endpoint available
- [Phase 103]: HEIC test fixture sourced from strukturag/libheif (not catdad-experiments) — GitHub raw URL redirect issue
- [Phase 103]: posthog-dev-vs-prod.txt documents automated code-path verification; PostHog Cloud UI confirmation deferred to user (autonomous: false plan)
- [Phase 104]: [Phase 104] Plan 104-01 — reused createMemoryStorage() factory with SEPARATE Map for sessionStorage shim (T-104-W0-01 isolation); migrated 3 existing test files to sessionStorage/vigil_jwt one plan ahead of client.ts (accepts 3 intentionally RED Bearer tests until Plan 02); exact-string assertion 'Invalid email or password. Please try again.' in AuthPage.test.tsx prevents user-enumeration regressions (T-104-W0-02)
- [Phase 104]: Plan 104-02 — STORAGE_KEY value flipped ('vigil_api_key'→'vigil_jwt') while keeping the identifier name, minimizing blast radius on vigilFetch and all callers; clearKey idempotently cleans BOTH sessionStorage['vigil_jwt'] AND localStorage['vigil_api_key'] (D-10) so stale tabs opened after migration land clean; AuthPage onAuthSuccess signature expanded to (userId,email) in this plan to unblock Plan 03 identifyUser wiring without re-editing AuthPage; posthog.init(...) ?? null defends against builds that return undefined (Pitfall 6)
- [Phase 104]: Plan 104-03 — centralized signOut() in api/client.ts + window 'vigil:signout' CustomEvent bus to sync App.tsx isAuthenticated with sessionStorage on sign-out (UAT-found redirect-loop fix); returning-session /v1/me identify swallows errors silently and relies on vigilFetch auth guard for stale-JWT redirect; Phase 104 complete, all 5 success criteria human-verified
- [Phase 105]: [Phase 105] Plan 105-01 — BLOCKED_PROPERTY_NAMES Set + identifyUser wrapper land in vigil-core/src/analytics/posthog.ts; trackEvent partitions properties by name and emits posthog_property_blocked meta-event per drop (D-02 drop-the-property semantics); Phase 103 wrapper signature untouched (D-03); 9 existing + 10 new tests all pass under POSTHOG_API_KEY-unset shim
- [Phase 105]: [Phase 105] Plan 105-02 — metricsMiddleware (MiddlewareHandler factory + dep-injected trackFn + statusClass enum helper) lands as the only /v1/* app.use between bearerAuth dispatcher (line 105) and first protected route (summary line 125); fires api_request with { route, method, status, duration_ms, status_class } on every authenticated request, skips on missing userId (D-05 — no anonymous metrics). 5 capture-funnel events wired at success points: thought_created (thoughts.ts), photo_uploaded + triage_completed (process-photo.ts, triage_completed strictly inside fulfilled-branch after dbUpdateTriageFn succeeds per D-15), brief_generated (brief-generate.ts with briefId hoisted outside tx closure), chat_sent (chat.ts after callClaudeConversation). Zero BLOCKED_PROPERTY_NAMES collisions; all properties are bounded enums/booleans/numbers.
- [Phase 105]: [Phase 105] Plan 105-03 — /v1/me now calls identifyUser(row.id, {email, createdAt: row.createdAt.toISOString()}) after successful lookup, inside a defensive try/catch; MeDeps widened to return createdAt + optional identifyFn spy; response body D-16 {userId, email} unchanged (createdAt travels only to PostHog person properties); vk_ legacy clients flow through existing Phase 103 D-17 seed-user mapping — no new code path. 5 new tests pass, all 8 me.test.ts + 19 posthog.test.ts tests green, tsc --noEmit clean.
- [Phase 106]: [Phase 106] Plan 106-01 — scaffold lands atomic-gate: check-verified.mjs fail-closes on placeholder/stale/unparseable timestamp; package.json pack script amended with -o vigil.ehpk (Pitfall 1 fix); package:ehpk chain (gate → build:prod → pack); app.json version 0.1.0 → 0.2.0; VERIFIED.md template with G2-01/G2-02/G2-03 checkboxes + T8-leak-2 evenhub-creds reminder + Figma spec review Q1 + resubmission-readiness sublist. Verified locally: gate exits 1 with "Unparseable timestamp"; npm run package:ehpk aborts before release; tsc clean. Wave 1 (02/03/04) unblocked; Plan 05 pack gated.
- [Phase 106]: [Phase 106] Plan 106-02 — G2-02 home-branch exit-confirm edge added to handleNavEvent as 7-line early-return between task-detail branch and generic switch. Fire-and-forget `void bridge.shutDownPageContainer(1)` per RESEARCH Pitfall 3 (SDK Promise<boolean> semantics undocumented; lifecycle via existing FOREGROUND_* listeners). Non-home DOUBLE_CLICK→HOME preserved (D-02). No new imports, no new ContainerId entries, no new files. tsc + build:prod clean. Simulator/hardware verification deferred to Plan 05.
- [Phase 106]: Plan 106-03 — G2-03 closes store rejection item via buildVigilHeader factory: one wordmark+divider header across all 4 screens, body borders 1/15/0 greyscale, exit-gesture footers, render-layer Vigil-voice fallbacks (Pitfall 5). Zero new containers — ContainerId stays at 12 (T-106-03-01 mitigated). Rule 3 auto-fix: unused DIVIDER imports removed from affirmation/work-orders/task-detail after header replacement. tsc + vite build clean; pack gated by human-verified screenshots in Plan 05.
- [Phase 106]: Plan 106-04 — VITE_SCREENSHOT_MODE guard + 3 DEMO_* constants land in api.ts as module-scope const truthy-check (not === 'true') so Vite static-replacement + tree-shaker flatten each guard and drop DEMO_* from prod bundles. vite-env.d.ts augments ImportMetaEnv with VITE_SCREENSHOT_MODE?: string (interface merge with vite/client, no tsconfig edit). .env.screenshot gitignored via explicit new rule; .env.screenshot.example committed with T8-leak-1 security warning. .env.production untouched — grep confirms. DCE verified both directions: flag unset → no 'Follow up on PR-4827' / DEMO_BRIEF in dist/assets; VITE_SCREENSHOT_MODE=1 vite build → strings present. Exact demo strings locked for Plan 05 reproducibility.
- [Phase 107]: Plan 107-00 — verification harness lands BEFORE implementation (RED-by-default at phase level). Scripts/verify-phase-107.sh (3 modes: --static/--runtime/--full) + 107-HUMAN-UAT.md (ship-with-uat-pending, 5 tests for SC#1 reboot + SC#2 no-window-flash). --static exits 1 today: Check 2 PASS (MACOSX_DEPLOYMENT_TARGET=15.7 already), Checks 1/3/4 FAIL pre-implementation. Script committed under Scripts/ (canonical git-tracked casing), not scripts/ as plan referenced — macOS case-insensitive fs masked this.
- [Phase 107]: Plan 107-01 — literal Info.plist edit (not INFOPLIST_KEY_LSUIElement build setting) for git-diff visibility; storyboard + ViewController untouched so Plan 03 WKWebView prefs bridge still works; tab indentation preserved; Checks 1+2 of verify-phase-107.sh --static now green, 3+4 remain red pending Plan 02
- [Phase 107]: Plan 107-02 — Aliased switch + literal register() + doc-comment .status literal reconciled Plan 00 harness literal-grep contract with plan frontmatter aliased key_link pattern; future AppDelegate edits must preserve both SMAppService.mainApp.register() and SMAppService.mainApp.status as literal substrings
- [Phase 107]: Plan 107-02 — UserDefaults firstLaunchAlertShown flag set AFTER runModal() preserves at-least-once alert delivery if crash occurs mid-modal; informativeText pre-empts macOS BTM Background Items Added system notification (Open Question 3)
- [Phase 107]: Plan 107-03 — Persistence pill (D-04) lands additively: 4-file surgical diff (Main.html +6, Script.js +14, Style.css +23, ViewController.swift +19). showPersistence JS fn uses spread-remove + includes guard for graceful unknown-state handling. persistenceStateString @unknown default maps to "failed" (visible signal for new OS Status cases). No color styling — pills inherit native font, text distinguishes states. xcodebuild clean; verify-phase-107.sh --static still green; Open Question Q1 (does WKWebView didFinish fire under LSUIElement?) deferred to Plan 04 runtime UAT with viewDidAppear fallback documented.
- [Phase 107]: [Phase 107] Plan 107-05 — gap_107_1 (storyboard window flash on first launch) closed via launch-source-gated window suppression: AppDelegate.suppressStoryboardWindows() orders NSApp.windows out unconditionally, then gates shouldRevealWindow on systemUptime >= 120 AND firstLaunchAlertShown. application(_:open:) inbound hook opportunistically overrides the gate for Safari-prefs click. ViewController.webView(_:didFinish:) makeKeyAndOrderFront now inside if-let delegate.shouldRevealWindow guard — D-01 preserved on Login Item boot, D-04 preserved on user-initiated launches. Runtime probe WINDOWS_FIRST=1 post-fix (was 2 before). tradeoff_107_1 documents the within-120s-of-boot Safari-prefs edge case as accepted/minor. check_window_suppression grep-only static check adds regression guard via grep -B1 line-before makeKeyAndOrderFront.
- [Phase 107.1]: [Phase 107.1] Plan 107.1-01 — local postgresql@16 (16.13) installed + vigil_dev live on iMac and user-confirmed on MacBook Pro; vigil-core/.env.example expanded from 2 keys to the 6-key LOCAL-ONLY template (D-17) with VIGIL_ALLOWED_EMAILS pinned to the seed user, PORT=3001 matching retired daemon, POSTHOG_API_KEY blank for Phase 103 key-absence gate. Rule 1 auto-fix: plan action text used 'Railway proxy' and 'rlwy.net' in comments that the plan's own automated regex rejected — rephrased to 'remote production host' / 'remote hostname' preserving the T-LOCAL-1 intent without tripping acceptance checks.
- [Phase 107.1]: Plan 107.1-02 — seed-local.ts lands idempotent via onConflictDoNothing for unique-constrained cols (users.email, cloudKitRecordID, caseNumber) and count-guard for projects + api_keys (vk_ preservation > rotation). tsx --env-file=.env required for DATABASE_URL visibility per RESEARCH Pattern 6. Live end-to-end verification blocked by pre-existing schema-drift on work_orders (missing notes/archived_at/last_change_at/last_change_summary columns never migrated from schema.ts to drizzle/) — logged to deferred-items.md for follow-on plan; Plan 03 dev-setup.sh will hit the same wall until a 0013_work_orders_drift_repair migration is authored.
- [Phase 107.1]: Plan 107.1-04 — Preserved plist XML to 107.1-daemon-retirement.md BEFORE bootout (T-LOCAL-6 reversibility gate). ANTHROPIC_API_KEY redacted inside preserved XML; restore path is Anthropic console, not VCS resurrection. Both machines retired in one session (iMac local, MacBook Pro over SSH at 192.168.1.136). RESEARCH Pitfall 2 (Aqua bootout over SSH) did NOT reproduce on macOS 15.x/gui-501 with a live UID session. Corrected stale memory: reference_macbook_pro.md said daemon was unloaded but live probe showed it was running (PID 740).
- [Phase 107.1]: Plan 107.1-03 — three local-dev shell scripts land (preflight-check.sh 4-check fail-loud doctor; dev-setup.sh idempotent bootstrap with T-LOCAL-2 timestamped .env backup, Aqua-daemon detect-only, VITE_API_BASE not VITE_API_URL; dev-reset.sh y/N confirmed dropdb+rebuild). Rule 1 auto-fix: removed literal 'VITE_API_URL' from comment — plan's own acceptance regex self-collides same as Plan 01's 'Railway proxy'. Rule 2 auto-add: .env.bak.* + *.env.bak.* added to .gitignore so dev-setup.sh's timestamped backups never pollute git status. Live preflight-check.sh smoke passed Checks 1-3, fired loud on Check 4 against the still-Railway vigil-core/.env (Plan 06 owns rewrite). T-LOCAL-2 backup verified byte-for-byte via SHA1 match.
- [Phase 107.1]: [Phase 107.1] Plan 107.1-05 — thin-orchestrator root package.json (11 lines, no workspaces) + concurrently@9.2.1 locked via package-lock.json + vigil-core dev script upgraded to tsx --env-file=.env watch (RESEARCH finding #1 / Pitfall 1 closed before Plan 06 repoints .env). Task 2 live dual-stream smoke DEFERRED to Plan 06 first dev session + Plan 07 verify-phase-107.1.sh D4 test per user path A — running the smoke today would either fail at preflight Check 4 (Plan 06 hasn't rewritten .env yet) or require bypassing preflight (violates T-LOCAL-3). All 14 Task 1 static acceptance checks PASS live; preflight-gate live observation confirms Checks 1-3 PASS, Check 4 fails loud on Railway URL as expected pre-Plan-06 (fail-closed gate working as designed).
- [Phase 107.1]: Plan 107.1-06 — D-17/D-18 closed: vigil-core/.env is 6-key LOCAL-ONLY (localhost DATABASE_URL, 64-hex JWT_SECRET, dev-workspace Anthropic key sk-a...pAAA with $20/mo cap, blank POSTHOG_API_KEY, PORT=3001). Pre-rewrite backup vigil-core/.env.bak.20260421-184421 preserved (gitignored; user deletes after 24h stable). sync-anthropic-key.sh updated: plist sync block replaced with retirement notice (D-09 closed), --include-config-env opt-in added (default-off so local/prod key divergence is no longer treated as drift). No vigil-core/config.json exists — orchestrator 'clean config.json' instruction was moot; ~/.config/dailybrief/config.json remains canonical prod source (used by sync-anthropic-key.sh for Railway). Live preflight 4/4 PASS — Plan 05 Task 2 deferred dual-stream smoke now unblocked.
- [Phase 107.1]: Plan 107.1-07 — D-19 closed: dailybrief-doctor.sh gained exit-code-neutral 'local vigil_dev DB' informational row with 3 branches (connected/unreachable/not-installed) each carrying actionable fix. RUNBOOK gained full Local Development section (first-time setup, daily loop, resync, reset, secret-drift policy amendment, preflight triage table, backup locations, Anthropic dev-key rotation). README gained concise Local Dev Quickstart. REQUIREMENTS.md gained REQ-DEV-LOCAL-ENV traceability row (13 → 14 total). Rule 2 auto-add: RUNBOOK expanded beyond plan's minimum 6 sections to include Known Issues cross-link + preflight triage + backups + key rotation per orchestrator critical_context 'practical first-person ops doc'. Live doctor row shows 'unreachable' on this iMac due to work_orders schema drift preventing migrations from applying — row behaves as designed; on a fully-migrated machine it reads 'connected (N users)'. Phase 107.1: 7/7 plans complete, ready for orchestrator verification.
- [Phase 107.2]: [Phase 107.2] Plan 107.2-01 — D-B2 default literal 127.0.0.1 (not 'localhost') per RESEARCH Pitfall 1 macOS/Linux IPv6 quirk; D-D2 prod CORS FATAL guard inserted between JWT_SECRET guard and Hono app declaration (src/index.ts:64-72), mirrors the JWT guard pattern exactly; process.env.NODE_ENV (not Vite-only import.meta.env.DEV, Pitfall 2). Task 3 committed empty (chore 8e555d4) because vigil-core/.env is gitignored — preserves atomic-per-task audit trail. Live probes: dev boot → 'Vigil Core API running on 0.0.0.0:3001'; prod NODE_ENV=production with CORS_ORIGINS unset → exit 1 with exact FATAL string; prod with CORS_ORIGINS=https://app.vigilhub.io → boots normally at 127.0.0.1:3001 (VIGIL_BIND_HOST not set in prod-shape env = Railway default path).
- [Phase 107.2]: [Phase 107.2] Plan 107.2-02 — Vite config function-form rewrite with loadEnv(mode, process.cwd(), ''); server.host: true binds 0.0.0.0 for Tailscale peers; /v1 proxy target env-driven via VITE_DEV_API_TARGET (default http://localhost:3001). VitePWA manifest preserved byte-for-byte (only +2 indent diff). Pitfall 4 CLOSED — VITE_API_BASE commented out in vigil-pwa/.env.local; client.ts:3 fallback now wins and proxy routes same-origin fetches. E2E smoke GREEN: curl http://127.0.0.1:5173/v1/health returned vigil-core's real health payload through the proxy. Rule 2 auto-add: .gitignore extended with .env.local.bak* patterns (existing .env.bak.* family didn't cover the variant). Pre-existing tsc TS6305 noise logged as deferred — 64 errors identical before and after edit, npm run build exits 0 compensates.

### Pending Todos

None.

### Blockers/Concerns

- ServiceNow API token still blocks Phase 80 (carried forward from v3.1)
- G2 hardware retest pending physical device access (~2026-04-24) — does not block simulator-verified submission
- Phase 85 (iOS Shortcut) held — Shortcuts.app bugs
- Phase 106 research flag: confirm exact G2 double-press event name from Even Hub docs in-browser (WebFetch returned empty during research)
- Phase 106 research flag: review Even Realities public Figma design spec before G2-03 CSS changes
- Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated; blocks Plan 02 live-seed e2e + Plan 03 final step. See deferred-items.md.
- Memory update needed: reference_macbook_pro.md still says 'vigilcore unloaded by design'; as of 2026-04-21 Plan 107.1-04 retired the daemon on BOTH machines (MacBook Pro was actually running, PID 740). Preserved plist in 107.1-daemon-retirement.md.

## Session Continuity

Last session: 2026-04-22T13:00:38.000Z
Stopped at: Completed 107.2-02-PLAN.md
Resume file: None
Next action: `/gsd-plan-phase 103`
