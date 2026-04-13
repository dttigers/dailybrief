---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Server-Side PDF
status: executing
stopped_at: Phase 78 context gathered
last_updated: "2026-04-13T19:16:23.823Z"
last_activity: 2026-04-13
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 77 — pwa-brief-ui

## Current Position

Phase: 78
Plan: Not started
Status: Executing Phase 77
Last activity: 2026-04-13

## Performance Metrics

**Velocity:**

- Total plans completed: ~165 (through v2.5)
- Total execution time: ~13 days
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
| v2.1 Server Deployment | 37-44 | 13 | 1 day |
| v2.2 Polish & Power | 45-50 | 12 | 1 day |
| v2.3 Projects & Precision | 51-57 | 14 | ~19h |
| v2.4 Capture Without Friction | 58-62 | 9 | 2 days |
| v2.5 Dashboard Everywhere | 63-72 | 17 | 2 days |

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions affecting v3.0:

- Apple Reminders dropped — Vigil task thoughts replace the todo section on Page 1
- PDF rendering moves from Mac CLI (CoreGraphics) to vigil-core — using PDFKit 0.18 (NOT Puppeteer, disqualified on Railway due to pthread/D-Bus launch failures)
- Sports API is balldontlie.io (NOT ESPN — undocumented ESPN API replaced by documented, authenticated balldontlie.io covering all 4 leagues)
- Google OAuth tokens must use `access_type: 'offline'` AND `prompt: 'consent'`; consent screen must be published to Production (Testing tokens expire in 7 days)
- PDF storage uses storage_key text column (NOT bytea in PostgreSQL)
- Mac CLI becomes thin client: fetch PDF from API, pipe to lpr
- Auto-print workflow preserved — BriefScheduler calls API instead of rendering locally
- Email delivery deferred to v3.1+

### Phase Ordering Rationale

1. Phase 73 — Sports Proxy: no dependencies, proves deploy pipeline cheaply
2. Phase 74 — Google Calendar: highest complexity (OAuth), must be isolated and proven
3. Phase 75 — PDF Engine: core risk, validate PDFKit on Railway before full orchestrator
4. Phase 76 — Brief Assembly: wire proven components together with Promise.allSettled
5. Phase 77 — PWA Brief UI: consume the assembly endpoint from the browser
6. Phase 78 — Mac CLI Thin Client: replace local rendering, preserve lpr

Note: Phase 74 and Phase 75 can execute in parallel — no dependency between them.

### Pending Todos

- Verify Railway "Always On" is enabled before Phase 76 UAT (service sleep kills first brief request)
- Port 270x540pt traveler's notebook layout constants from Swift to PDFKit during Phase 75
- Test ESPN off-season behavior (empty events arrays) during Phase 73 — confirmed: use balldontlie.io

### Blockers/Concerns

- G2 hardware testing — plugin validated in simulator only, awaiting physical Even G2 glasses
- ServiceNow API token — blocks future WO-F01 (deferred to future milestone)
- Railway Buckets availability — if not available on current plan, fallback to volume mount for PDF storage

## Session Continuity

Last session: 2026-04-13T19:16:23.802Z
Stopped at: Phase 78 context gathered
Resume file: .planning/phases/78-mac-cli-thin-client/78-CONTEXT.md
Next action: `/gsd-plan-phase 73`
