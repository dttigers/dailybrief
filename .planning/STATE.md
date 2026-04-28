---
gsd_state_version: 1.0
milestone: v3.7
milestone_name: Source Pickers, Verify-Email UX & Closeout Cleanup
status: executing
stopped_at: Completed 115-04-PLAN.md
last_updated: "2026-04-28T00:01:48.567Z"
last_activity: 2026-04-28
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 37
  completed_plans: 39
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27 — v3.7 milestone started)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 115 — calendar-source-picker-thoughtrow-polish

## Current Position

Milestone: v3.7 (started 2026-04-27)
Phase: 115 (calendar-source-picker-thoughtrow-polish) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-04-28

Progress: [░░░░░░░░░░] 0%

**v3.7 phases (115-119, all 0%):**

| Phase | Name | Status |
|-------|------|--------|
| 115 | Calendar source picker (+ ThoughtRow polish) | Not started |
| 116 | Sports source picker | Not started |
| 117 | Auth-email rate-limit UX hardening | Not started |
| 118 | Production test-user cleanup | Not started |
| 119 | DMARC quarantine ramp | Not started |

## Performance Metrics

**Velocity:**

- Total plans completed: ~245 through v3.6 (16 milestones, ~18 days)

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0–v3.4 | 1-102 | ~211 | ~18 days |
| v3.5 | 103-107 (+107.1/107.2/107.3) | 34 | paused pre-ship (G2 hardware UAT) |
| v3.6 | 108-114 | 27 | shipped 2026-04-26 |
| v3.7 | 5 (115-119) | TBD | started 2026-04-27, roadmap 2026-04-27 |
| Phase 115 P01 | 5min | 3 tasks | 5 files |
| Phase 115 P03 | 3min | 2 tasks | 2 files |
| Phase 115 P02 | 6min | 3 tasks | 4 files |
| Phase 115 P04 | 15 | 2 tasks | 5 files |

## Accumulated Context

### Roadmap Evolution

- Phase 107.1 inserted after Phase 107: local dev environment with Postgres and hot-reload stack (URGENT)
- Phase 107.2 inserted after Phase 107: cross-machine Tailscale dev access with secure bind and CORS (URGENT)
- Phase 107.3 inserted after Phase 107 (2026-04-22): prod bind default + install.sh silent-fail + doctor stale-drift cleanup
- v3.5 paused 2026-04-22 at 34/34 plans, waiting on G2 physical hardware UAT (device delivery unknown)
- v3.6 shipped 2026-04-26: 7 phases (108-114), 27 plans, 8/8 requirements satisfied via live HUMAN-UAT against Railway production
- v3.7 started 2026-04-27 — themes: PWA Settings source pickers (calendars + sports), auth-email UX hardening (verify-email + forgot-password D-13/D-21 friction), closeout cleanup (DMARC ramp, prod test-user delete, ThoughtRow polish)
- v3.7 ROADMAP.md landed 2026-04-27 — 5 phases (115-119): 115 Calendar picker (+ POLISH-01 ride-along), 116 Sports picker, 117 Auth-email rate-limit UX, 118 Test-user cleanup, 119 DMARC quarantine ramp; 7/7 v1 requirements mapped

### Decisions

All decisions logged in PROJECT.md Key Decisions table. Phase-specific decisions logged in their respective `phases/<N>/<N>-CONTEXT.md` files (preserved in archive `.planning/milestones/v3.6-phases/` after milestone close).

- [Phase 115]: Phase 115-01: Add dbSetCalendarSelectionsFn as a NEW dep instead of overloading dbUpdateFn — keeps token-refresh and selections-write mocks orthogonal
- [Phase 115]: Phase 115-01: Validation single-sourced in service.setCalendarSelections (validateCalendarIds); route catches throw and maps to 400 — same rules apply to any future direct caller
- [Phase 115]: Phase 115-01: Test wrapper pattern — outer Hono app with use('*') middleware setting userId, then route('/', innerRouter) — mirrors production global bearerAuth dispatcher in unit tests
- [Phase 115]: Phase 115-03: POLISH-01 ships as a 1-class Tailwind append + dedicated regression test in same plan — locks visual contract against future className refactors / Tailwind purging
- [Phase 115]: Phase 115-02: PWA-side discriminated-union API helper pattern (caller routes on .status) replaces 'throw on every non-ok status' for endpoints with structured non-error states
- [Phase 115]: Phase 115-02: Optimistic toggle + previous-value capture (lastSavedSelectionRef) for D-14 rollback contract — server-confirmed value is the source of truth
- [Phase 115]: Phase 115-04: Extend GET /v1/calendar/list response shape (not a new endpoint) to carry selectedCalendarIds — smallest-diff fix for CR-01 reload-preservation bug
- [Phase 115]: Phase 115-04: Seed lastSavedSelectionRef.current from server response on loadCalendars mount — ties rollback target to server truth, not empty array

### Pending Todos

Captured for v3.7 execution (already in REQUIREMENTS once roadmap lands):

- Test users `upper@case.com` (id=3) and `test+phase104@local.test` (id=44) cleanup → OPS-01
- DMARC ramp `p=none → p=quarantine` (auto-eval 2026-05-06) → OPS-02
- ThoughtRow.tsx:399 `whitespace-pre-line` → POLISH-01

Captured but explicitly out of v3.7 scope:

- SEED-004 — verify-email error UX rotated/expired/rate-limited differentiation (token-rotation copy axis only; v3.7 covers the rate-limit axis)
- Disable gmail-workorders importer tick — defer to whichever milestone unblocks ServiceNow API

### Blockers/Concerns

**Carried into v3.7 (still-blocked from prior milestones):**

- ServiceNow API token still blocks Phase 80 (from v3.1)
- Phase 85 (iOS Shortcut) held — Shortcuts.app bugs
- G2 physical hardware retest pending device delivery (unknown date) — blocks v3.5 ship, NOT v3.7 execution
- Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated; blocks any plan needing to run live migrations against a freshly-set-up local dev DB
- vigil-core npm test suite hang: integration tests import index.js which spawns generate-scheduler + gmail-workorders setInterval loops at module load, keeping tsx alive after final assertion. Workaround: run individual files via `npx tsx --test <file>`. Fix candidate: gate scheduler start-up on NODE_ENV !== test, or split buildApp() + bootstrap entrypoint.

**Active for v3.7:**

- DMARC ramp (OPS-02) is gated on auto-eval routine 2026-05-06 — phase implementation can land any time, but the ramp action itself only fires after gate passes (≥7 days clean aggregate reports + ≥3 days verify-email volume)
- Sports picker (SPORTS-01) introduces new per-user persistence (today the sports-service has hardcoded teamIds); calendar picker (CAL-01) reuses existing `calendarSelections` storage on oauth_tokens — different complexity profiles, expect at least one phase apiece

### Memory drift flagged

- `reference_macbook_pro.md` still says 'vigilcore unloaded by design'; as of 2026-04-21 Plan 107.1-04 retired the daemon on BOTH machines.

## Session Continuity

Last session: 2026-04-28T00:01:48.561Z
Stopped at: Completed 115-04-PLAN.md
Resume file: None
Next action: /gsd-plan-phase 115
