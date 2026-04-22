---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: Multi-User Completion, Auth UX & Safari Parity
status: planning
stopped_at: Defining requirements
last_updated: "2026-04-22T21:00:00Z"
last_activity: 2026-04-22
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** v3.6 milestone — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-22 — Milestone v3.6 started

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
| v3.6 | TBD | TBD | In progress (started 2026-04-22) |

## Accumulated Context

### Roadmap Evolution

- Phase 107.1 inserted after Phase 107: local dev environment with Postgres and hot-reload stack (URGENT)
- Phase 107.2 inserted after Phase 107: cross-machine Tailscale dev access with secure bind and CORS (URGENT)
- Phase 107.3 inserted after Phase 107 (2026-04-22): prod bind default + install.sh silent-fail + doctor stale-drift cleanup — three paper-cuts surfaced during fresh MacBook Pro bootstrap; 107.2 prod bind caused live api.vigilhub.io 502 outage, fixed via Railway `VIGIL_BIND_HOST=0.0.0.0` env var
- v3.5 paused 2026-04-22 at 34/34 plans complete, waiting on G2 physical hardware UAT (device delivery unknown). v3.6 started same day with multi-user debt + auth UX + Safari parity.

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

**v3.5 key decisions (retained for reference — v3.5 pre-ship):**

- PostHog: separate API keys per environment; all `capture()` via `trackEvent()` wrapper with null-guard; property allowlist (enums/booleans/numbers); `shutdown()` on SIGTERM/SIGINT
- JWT storage: sessionStorage (not localStorage) — XSS tradeoff acceptable for single-user private app
- AUTH-06 login error: single generic message for all 4xx — no user enumeration
- G2 resubmit: all three items (G2-01/02/03) gated together — no partial submission
- Phase 107.3 bind detection: `RAILWAY_SERVICE_ID` presence check (not `NODE_ENV`, not nonexistent `RAILWAY_ENVIRONMENT`); Phase 107.2 security bias (127.0.0.1 default) preserved for non-Railway envs

(Plan-level decisions from Phases 103–107.3 archived in git history; not re-listed here for v3.6 planning brevity.)

### Pending Todos

None — v3.6 requirements gathering is next step.

### Blockers/Concerns

**Carried into v3.6 (still-blocked from prior milestones):**
- ServiceNow API token still blocks Phase 80 (from v3.1)
- Phase 85 (iOS Shortcut) held — Shortcuts.app bugs
- G2 physical hardware retest pending device delivery (unknown date) — blocks v3.5 ship, NOT v3.6 execution
- Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated; blocks any plan needing to run live migrations against a freshly-set-up local dev DB

**New for v3.6:**
- Transactional email provider decision (AUTH-10/AUTH-11 depend on this) — candidates: Resend, Postmark, AWS SES. First outbound email in Vigil; touches DKIM/SPF/deliverability.

### Memory drift flagged

- `reference_macbook_pro.md` still says 'vigilcore unloaded by design'; as of 2026-04-21 Plan 107.1-04 retired the daemon on BOTH machines (MacBook Pro was actually running, PID 740). Preserved plist in 107.1-daemon-retirement.md.

## Session Continuity

Last session: 2026-04-22T21:00:00Z
Stopped at: v3.6 milestone initialization — PROJECT.md updated, requirements-gathering next
Resume file: None
Next action: Define REQUIREMENTS.md (optionally after research), then spawn gsd-roadmapper
