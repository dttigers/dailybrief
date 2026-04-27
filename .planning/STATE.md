---
gsd_state_version: 1.0
milestone: v3.7
milestone_name: Source Pickers, Verify-Email UX & Closeout Cleanup
status: planning
stopped_at: "v3.7 milestone started 2026-04-27 — defining requirements (CAL-01, SPORTS-01, AUTH-12, AUTH-13, OPS-01, OPS-02, POLISH-01). Phase numbering continues from 114 → v3.7 starts at Phase 115."
last_updated: "2026-04-27T00:00:00.000Z"
last_activity: 2026-04-27
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27 — v3.7 milestone started)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** v3.7 — defining requirements

## Current Position

Milestone: v3.7 (started 2026-04-27)
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-27 — Milestone v3.7 started

## Performance Metrics

**Velocity:**

- Total plans completed: ~245 through v3.6 (16 milestones, ~18 days)

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0–v3.4 | 1-102 | ~211 | ~18 days |
| v3.5 | 103-107 (+107.1/107.2/107.3) | 34 | paused pre-ship (G2 hardware UAT) |
| v3.6 | 108-114 | 27 | shipped 2026-04-26 |
| v3.7 | TBD (starting at 115) | TBD | started 2026-04-27 |

## Accumulated Context

### Roadmap Evolution

- Phase 107.1 inserted after Phase 107: local dev environment with Postgres and hot-reload stack (URGENT)
- Phase 107.2 inserted after Phase 107: cross-machine Tailscale dev access with secure bind and CORS (URGENT)
- Phase 107.3 inserted after Phase 107 (2026-04-22): prod bind default + install.sh silent-fail + doctor stale-drift cleanup
- v3.5 paused 2026-04-22 at 34/34 plans, waiting on G2 physical hardware UAT (device delivery unknown)
- v3.6 shipped 2026-04-26: 7 phases (108-114), 27 plans, 8/8 requirements satisfied via live HUMAN-UAT against Railway production
- v3.7 started 2026-04-27 — themes: PWA Settings source pickers (calendars + sports), auth-email UX hardening (verify-email + forgot-password D-13/D-21 friction), closeout cleanup (DMARC ramp, prod test-user delete, ThoughtRow polish)

### Decisions

All decisions logged in PROJECT.md Key Decisions table. Phase-specific decisions logged in their respective `phases/<N>/<N>-CONTEXT.md` files (preserved in archive `.planning/milestones/v3.6-phases/` after milestone close).

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

Last session: 2026-04-27T00:00:00.000Z
Stopped at: v3.7 milestone started — PROJECT.md and STATE.md reset, ready to define REQUIREMENTS.md
Resume file: None
Next action: /gsd-plan-phase 115 (after roadmap lands)
