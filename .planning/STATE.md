# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** v2.1 Server Deployment — get Vigil Core online for G2 glasses and future mobile clients

## Current Position

Phase: 42 of 44 (Mac App Server Migration) — Plan 01 COMPLETE
Plan: 1/1 complete
Status: Phase 42 plan 01 complete, Mac app VigilAPIClient has Bearer auth and production URL
Last activity: 2026-04-05 — Added Bearer auth to Mac app VigilAPIClient, pointed at Railway production URL, updated user config

Progress: ███░░░░░░░ 37%

## Performance Metrics

**Velocity:**
- Total plans completed: 94
- Total execution time: ~10 days
- Average duration: ~5 min per plan

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0 MVP | 1-7 | 17 | 3 days |
| v1.1 Always On | 8-13 | 16 | 1 day |
| v1.2 Daily Driver | 14-18 | 14 | 1 day |
| v1.3 Stability & Smarts | 19-23 | 7 | 1 day |
| v1.4 Intelligence & Org | 24-28 | 11 | 1 day |
| v2.0 Vigil Platform | 29-36 | 22 | 1 day |
| v2.1 Server Deployment | 37-44 | TBD | in progress |

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.
Full decision history available in milestone archives:
- .planning/milestones/v1.0-ROADMAP.md
- .planning/milestones/v1.1-ROADMAP.md
- .planning/milestones/v1.2-ROADMAP.md
- .planning/milestones/v1.4-ROADMAP.md
- .planning/milestones/v2.0-ROADMAP.md

### Pending Todos

None.

### Blockers/Concerns

None.

### Roadmap Evolution

- v1.0 MVP shipped: 7 phases (1-7), 17 plans
- v1.1 Always On shipped: 6 phases (8-13), 16 plans
- v1.2 Daily Driver shipped: 5 phases (14-18), 14 plans
- v1.3 Stability & Smarts shipped: 5 phases (19-23), 7 plans
- v1.4 Intelligence & Organization shipped (early close): 5 phases (24-28), 11 plans
- v2.0 Vigil Platform shipped: 8 phases (29-36), 22 plans — Core API, Even G2 plugin, Mac app migration
- v2.1 Server Deployment created: 8 phases (37-44) — PostgreSQL, auth, Railway deploy, client migration

## Session Continuity

Last session: 2026-04-05
Stopped at: Phase 42 plan 01 complete
Resume file: None
Notes: Phase 42 Mac App Server Migration plan 01 complete. VigilAPIClient now accepts optional apiKey and sends Bearer auth on all requests. Default URL points at Railway production. Both CLI and menu bar entry points pass apiKey from config. User must add their vk_ API key to ~/.config/dailybrief/config.json.
