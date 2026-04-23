---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: Multi-User Completion, Auth UX & Safari Parity
status: executing
stopped_at: Completed 109-01-PLAN.md
last_updated: "2026-04-23T18:49:54.616Z"
last_activity: 2026-04-23
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
**Current focus:** Phase 109 — per-user-scheduler-fan-out

## Current Position

Phase: 109 (per-user-scheduler-fan-out) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-04-23

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

### Memory drift flagged

- `reference_macbook_pro.md` still says 'vigilcore unloaded by design'; as of 2026-04-21 Plan 107.1-04 retired the daemon on BOTH machines (MacBook Pro was actually running, PID 740). Preserved plist in 107.1-daemon-retirement.md.

## Session Continuity

Last session: 2026-04-23T18:49:54.610Z
Stopped at: Completed 109-01-PLAN.md
Resume file: None
Next action: /gsd-plan-phase 108
