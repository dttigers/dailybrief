---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: Multi-User Completion, Auth UX & Safari Parity
status: executing
stopped_at: Phase 111 context gathered
last_updated: "2026-04-24T16:24:44.796Z"
last_activity: 2026-04-24 -- Phase 111 planning complete
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 22
  completed_plans: 21
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 110 — change-password-password-changed-at-gate

## Current Position

Phase: 110
Plan: Not started
Status: Ready to execute
Last activity: 2026-04-24 -- Phase 111 planning complete

```
Phase 108 [          ] 0%   work_order_statuses userId Scoping + Isolation Test
Phase 109 [          ] 0%   Per-User Scheduler Fan-Out
Phase 110 [          ] 0%   Change Password + password_changed_at Gate
Phase 111 [          ] 0%   Transactional Email Infrastructure (Resend + DNS)
Phase 112 [          ] 0%   Forgot-Password Email Flow
Phase 113 [          ] 0%   Verify Email on Signup
Phase 114 [          ] 0%   Safari Extension Quick-Capture Parity

v3.6 overall [          ] 0/7 phases complete
```

## Performance Metrics

**Velocity:**

- Total plans completed: ~211 (through v3.4) + 34 (v3.5 not-yet-shipped) = ~245
- Total execution time: ~18 days
- Average duration: ~5 min per plan

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0–v3.4 | 1-102 | ~211 | ~18 days |
| v3.5 | 103-107 (+107.1/107.2/107.3) | 34 | paused pre-ship (G2 hardware UAT) |
| v3.6 | 108-114 | TBD | In progress (started 2026-04-22) |
| Phase 108 P01 | 25 | 4 tasks | 5 files |
| Phase 108 P02 | 4 | 3 tasks | 4 files |
| Phase 108 P03 | 12 | 1 tasks | 1 files |
| Phase 109 P01 | 12min | 3 tasks | 2 files |
| Phase 109 P02 | 18min | 2 tasks | 2 files |
| Phase 109 P3 | 11min | 4 tasks | 8 files |
| Phase 110 P01 | 5min | 3 tasks | 5 files |
| Phase 110 P02 | 13min | 3 tasks | 7 files |
| Phase 110 P03 | 5min | 2 tasks | 3 files |

## Accumulated Context

### Roadmap Evolution

- Phase 107.1 inserted after Phase 107: local dev environment with Postgres and hot-reload stack (URGENT)
- Phase 107.2 inserted after Phase 107: cross-machine Tailscale dev access with secure bind and CORS (URGENT)
- Phase 107.3 inserted after Phase 107 (2026-04-22): prod bind default + install.sh silent-fail + doctor stale-drift cleanup — three paper-cuts surfaced during fresh MacBook Pro bootstrap; 107.2 prod bind caused live api.vigilhub.io 502 outage, fixed via Railway `VIGIL_BIND_HOST=0.0.0.0` env var
- v3.5 paused 2026-04-22 at 34/34 plans complete, waiting on G2 physical hardware UAT (device delivery unknown). v3.6 started same day with multi-user debt + auth UX + Safari parity.
- v3.6 roadmap created 2026-04-23: 7 phases (108-114), 8 requirements fully mapped. W-01 + W-02 merged into Phase 108 (W-02 is a single test addition in the same isolation test file). Phase ordering respects EMAIL-01 → AUTH-10 → AUTH-11 dependency chain and ensures password_changed_at gate (AUTH-09 / Phase 110) exists before AUTH-10 / Phase 112 can update it.

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

**v3.5 key decisions (retained for reference — v3.5 pre-ship):**

- PostHog: separate API keys per environment; all `capture()` via `trackEvent()` wrapper with null-guard; property allowlist (enums/booleans/numbers); `shutdown()` on SIGTERM/SIGINT
- JWT storage: sessionStorage (not localStorage) — XSS tradeoff acceptable for single-user private app
- AUTH-06 login error: single generic message for all 4xx — no user enumeration
- G2 resubmit: all three items (G2-01/02/03) gated together — no partial submission
- Phase 107.3 bind detection: `RAILWAY_SERVICE_ID` presence check (not `NODE_ENV`, not nonexistent `RAILWAY_ENVIRONMENT`); Phase 107.2 security bias (127.0.0.1 default) preserved for non-Railway envs

**v3.6 key decisions (roadmap phase):**

- W-01 + W-02 merged into Phase 108: W-02 is a single it() block in cross-user-isolation.test.ts; it belongs in the same phase as W-01 because both live in the same test file and W-01's migration is the prerequisite for W-02's test to be meaningful
- SCHED-01 stays as standalone Phase 109 (not merged with W-01): scheduler refactor touches generate-scheduler.ts + prioritize.ts + their test files — enough scope to warrant its own phase
- AUTH-09 is Phase 110, not Phase 108: no hard dependency on multi-user scoping; Wave 1 parallelizable; assigned own phase because password_changed_at gate is a cross-cutting security foundation that Phase 112 (AUTH-10) depends on
- EMAIL-01 is Phase 111: DNS propagation is non-deterministic; isolating it as a standalone phase lets DNS work start and propagate while Phases 108-110 execute
- AUTH-10 and AUTH-11 are separate phases (112, 113): blast radius containment; AUTH-11 reuses password_reset_tokens (type column) created in AUTH-10's migration — sequential ordering is required
- EXT-02 is Phase 114 (last): fully independent of server/PWA work; scheduled last as a clean cap to the milestone; can be executed on MacBook Pro in parallel with any server phase if desired
- [Phase 108]: Hand-added 0014 to _journal.json: drizzle migrator requires SQL files to be in journal; hand-written migrations bypass drizzle-kit generate which normally auto-updates it
- [Phase 108]: seed-work-order-statuses.ts fixed to look up seed user by email and include userId in inserts — required by NOT NULL constraint added in Plan 01
- [Phase 108]: W-02: used date 2099-12-28 (D-13), single 404-only scenario (D-14), briefPdfs lazily imported inside it() body matching aiCache pattern
- [Phase 109]: Plan 01: scheduler fan-out removes seedUserId hard-scope; default getAllUsersFn closes over deps.db; per-user try/catch uses continue (never return); SCH-09 regression guards SC#1/SC#2/SC#4
- [Phase 109]: Plan 02: /prioritize cache filename scoped to userId (wo-priority-${userId}-${today}-${hash}.json); getCacheKey userId-first positional; no runtime 401 guard (D-09 — global bearerAuth dispatcher) and no startup sweep of pre-migration files (D-10)
- [Phase 109]: Plan 03: calendar-service userId-required + atomic two-site wiring (9054a5d); first time calendar events reach brief PDF from either path — D-11 makes fetchTodaysEvents/fetchCalendarList require userId (TypeScript build is the forcing function); D-12 commits index.ts + routes/brief-generate.ts wiring atomically; D-13 rewrites TODO(AUTH-06+) in-place (dropped in calendar-service, retained + DEFERRED marker in gmail-workorder-service). Human-verify Path B confirmed graceful degradation: HTTP 200, 19KB PDF, no "No calendar service" log, no stack traces. Path A deferred to post-v3.6 production smoke-test (no local OAuth row on fresh 107.1 dev DB).
- [Phase 110]: Plan 01: D-03 backfill pinned — password_changed_at = created_at EXACTLY (verified via COUNT(*) WHERE != created_at = 0); zero existing JWTs invalidated by deploy
- [Phase 110]: Plan 01: drizzle-kit 0015 SQL draft discarded (re-embedded Phase 108 migration due to missing 0014_snapshot); hand-authored 3-statement 5-step template per D-02
- [Phase 110]: Plan 01: Rule 3 auto-fix bumped 0015 when=1777267200000 to exceed Phase 108 0014 when=1777180800000 — drizzle-kit migrate orders by when not idx, silently skips out-of-order entries
- [Phase 110]: Plan 01: Rule 3 auto-fix repaired 0013_snapshot.json duplicate id (Phase 107.1 drift) with fresh UUID; prevId repointed to actual 0012 id — unblocked drizzle-kit generate
- [Phase 110]: Plan 02: CONTEXT §specifics line 135 wording bug reconciled in CP-GATE-02 — strict-less-than gate means iat == floor(passwordChangedAt/1000) PASSES; test description + comment pin actual live-code semantics
- [Phase 110]: Plan 02: CP-GATE-04 reframed as 'vk_ unaffected by gate REJECTION' (passwordChangedAt 1y future still 200); 'no DB read on Path 1' claim anchored in code (gate SELECT inside if looksLikeJwt block), not provable by test
- [Phase 110]: Plan 02: Rule 3 cascade — Plan 01 NOT NULL column forced 4-site passwordChangedAt fix (register insert, claim-flow update, isolation-test seeds A+B, middleware happy-path test). Claim-flow now bumps passwordChangedAt + updatedAt defensively
- [Phase 110]: Plan 02: D-14 ordering (await db.update BEFORE await signToken) pinned by CP-CHG-06 — asserts iat >= floor(passwordChangedAt/1000) plus follow-up authenticated request that would 401 if reordered
- [Phase 110]: Plan 03: D-17 ordering preserved — storeKey(body.token) executes BEFORE any setState or setTimeout; React setState does not fire fetches so execution order is sufficient. Inline comment pins CONTEXT 'vigil_token' typo vs live-code 'vigil_jwt' via storeKey() (api/client.ts:1).
- [Phase 110]: Plan 03: D-19 body discriminator (not path filter) — any 401 with { error: 'Session expired' } triggers signOut+navigate; 'Invalid credentials' from change-password's wrong-current 401 passes through unchanged. res.clone() keeps caller's body consumable.
- [Phase 110]: Plan 03: Emoji eye-icon toggles (👁/🙈) used instead of adding lucide-react/react-icons dep — zero-dep, aria-label accessible. D-16 'no confirm-password field' satisfied by show/hide toggle.
- [Phase 110]: Plan 03: Pre-existing SettingsPage.test.tsx:104 WR-03 assertion failure (unrelated — asserts raw 'invalid_state' code but WR-03 allowlist maps to friendly text) logged to deferred-items.md. Not caused by this plan — confirmed via git stash + test on prior commit.

### Pending Todos

None — ready to plan Phase 108.

### Blockers/Concerns

**Carried into v3.6 (still-blocked from prior milestones):**

- ServiceNow API token still blocks Phase 80 (from v3.1)
- Phase 85 (iOS Shortcut) held — Shortcuts.app bugs
- G2 physical hardware retest pending device delivery (unknown date) — blocks v3.5 ship, NOT v3.6 execution
- Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated; blocks any plan needing to run live migrations against a freshly-set-up local dev DB

**Active for v3.6:**

- DNS propagation for vigilhub.io DKIM/SPF/DMARC (Phase 111) is variable — start DNS config early, do not block Phase 112 planning on propagation completion
- Safari Cmd+Enter keyboard priority: must be empirically tested as step 1 of Phase 114 before any implementation — if swallowed, fallback UX must be designed upfront
- Pre-existing npm test suite hang in vigil-core: src/integration/cross-user-isolation.test.ts imports ../index.js which spawns generate-scheduler (60s) + gmail-workorders (5m) setInterval loops at module load, keeping the tsx child process alive after the final assertion. Individual test files run fine via npx tsx --test <file>. Fix candidate: gate scheduler start-up in index.ts on NODE_ENV !== test, or split into buildApp() + bootstrap entrypoint.

### Memory drift flagged

- `reference_macbook_pro.md` still says 'vigilcore unloaded by design'; as of 2026-04-21 Plan 107.1-04 retired the daemon on BOTH machines (MacBook Pro was actually running, PID 740). Preserved plist in 107.1-daemon-retirement.md.

## Session Continuity

Last session: 2026-04-24T15:45:14.949Z
Stopped at: Phase 111 context gathered
Resume file: .planning/phases/111-transactional-email-infrastructure-resend-dns/111-CONTEXT.md
Next action: /gsd-plan-phase 108
