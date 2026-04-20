---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Observability, G2 Resubmit & Capture Repair
status: executing
stopped_at: Completed 105-01-PLAN.md
last_updated: "2026-04-20T02:14:51.391Z"
last_activity: 2026-04-20
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 11
  completed_plans: 9
  percent: 82
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-19)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 105 — product-events-api-metrics-user-identity

## Current Position

Phase: 105 (product-events-api-metrics-user-identity) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-04-20

Progress: [░░░░░░░░░░] 0%

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

## Accumulated Context

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

### Pending Todos

None.

### Blockers/Concerns

- ServiceNow API token still blocks Phase 80 (carried forward from v3.1)
- G2 hardware retest pending physical device access (~2026-04-24) — does not block simulator-verified submission
- Phase 85 (iOS Shortcut) held — Shortcuts.app bugs
- Phase 106 research flag: confirm exact G2 double-press event name from Even Hub docs in-browser (WebFetch returned empty during research)
- Phase 106 research flag: review Even Realities public Figma design spec before G2-03 CSS changes

## Session Continuity

Last session: 2026-04-20T02:14:51.386Z
Stopped at: Completed 105-01-PLAN.md
Resume file: None
Next action: `/gsd-plan-phase 103`
