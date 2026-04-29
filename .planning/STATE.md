---
gsd_state_version: 1.0
milestone: v3.7
milestone_name: Source Pickers, Verify-Email UX & Closeout Cleanup
status: executing
stopped_at: Completed 116-03-PLAN.md
last_updated: "2026-04-29T13:41:39.483Z"
last_activity: 2026-04-29
progress:
  total_phases: 12
  completed_phases: 7
  total_plans: 42
  completed_plans: 42
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27 — v3.7 milestone started)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 116 — sports-source-picker

## Current Position

Milestone: v3.7 (started 2026-04-27)
Phase: 116 (sports-source-picker) — EXECUTING
Plan: 2 of 5
Status: Ready to execute
Last activity: 2026-04-29

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
| Phase 116 P01 | 5min | 2 tasks | 4 files |
| Phase 116 P02 | 4min | 2 tasks | 4 files |
| Phase 116 P03 | 5min | 1 tasks | 2 files |

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
- [Phase 116]: Phase 116-01: Sports preferences persisted in app_settings as single jsonb (key='sports_selections') — composite PK already supports per-user, no migration
- [Phase 116]: Phase 116-01: Validation single-sourced in service.setUserSelections (validateSportsSelections); route catches throw and maps to 400 — same pattern as Phase 115 calendar setCalendarSelections
- [Phase 116]: Phase 116-01: Hono route ordering — literal /sports/selections registered BEFORE /sports/:league so the param route does not shadow
- [Phase 116]: Phase 116-01: D-24 preservation rule — validator accepts favoriteTeams.<league> entries even when that league is NOT in enabledLeagues (disabling does not clear the team)
- [Phase 116]: Phase 116-02: TEAMS_CACHE_TTL_MS = 24h global cache (D-07) — rosters rarely change AND BDL free-tier rate limit is 5 req/min
- [Phase 116]: Phase 116-02: Per-league name normalization at service layer (D-08) — MLB display_name vs NFL/NBA/NHL full_name; collapses BDL divergence to a uniform TeamListEntry
- [Phase 116]: Phase 116-02: BDL team_id returned as STRING (D-05) — direct drop-in for the existing team_ids[]=<id> string concatenation in fetchLeague*
- [Phase 116]: Phase 116-02: Hono route order — /sports/teams/:league BEFORE /sports/:league so the literal /teams/ segment wins first-match dispatch
- [Phase 116]: Phase 116-02: isFresh(entry, ttlMs?) parameterized with default = CACHE_TTL_MS — one-line signature change cleaner than duplicating the helper as isFreshTeams
- [Phase 116]: Phase 116-03: fetchAllLeagues(selections?) — optional parameter widens API backward-compatibly; legacy env-var path (D-13) preserved for tests, prod always passes selections
- [Phase 116]: Phase 116-03: LeagueResult.status += 'disabled' (D-15) — single union extension; renderer (Plan 04) checks status === 'disabled' to suppress that league; partial flag treats 'disabled' as intentional opt-out, NOT a partial signal
- [Phase 116]: Phase 116-03: All-disabled short-circuit BEFORE Promise.allSettled (D-17) — zero outbound HTTP guaranteed by control-flow ordering, verified by mockFetch.calls.length === 0 assertion
- [Phase 116]: Phase 116-03: Standings-only path co-located inside each per-league fetcher (D-16) — fetcher already owns BASE_URLS[league] + normalizeStandings, no new shared helper needed for one URL pattern
- [Phase 116]: Phase 116-03: Cache-bypass for standings-only requests — cache key league:${league} doesn't include selections, so standings-only must NOT poison full-fetch cache and vice versa (T-116-03-06)
- [Phase 116]: Phase 116-03: Hard-coded league iteration in fetchAllLeagues (T-116-03-01 mitigation) — Promise.allSettled iterates the four literal League values, never selections.enabledLeagues; corrupted entries are structurally unreachable
- [Phase 116]: Phase 116-03: [Rule 1 fix] Per-league fetchers now reuse the resolved teamId const for parseInt (was double-reading getTeamId); fixes a latent home/away bug where selections-driven URL would use the picker team but the home/away identifier would still use the env-var team

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

Last session: 2026-04-29T13:41:39.477Z
Stopped at: Completed 116-03-PLAN.md
Resume file: None
Next action: /gsd-plan-phase 115
