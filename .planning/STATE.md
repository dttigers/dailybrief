---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: Gmail + Thin Clients
status: shipped
last_milestone_shipped: v3.1 (2026-04-15)
deferred_to_next_milestone:
  - Phase 80 (Gmail Server Service — blocked on ServiceNow token)
  - Phase 85 (iOS Shortcut — Shortcuts.app bugs)
last_updated: "2026-04-15T22:00:00.000Z"
last_activity: 2026-04-15 — v3.1 shipped (83, 84, 86, 87); audit tech_debt_accepted
progress:
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 84 complete — browser extension shipped in Chrome + Safari

## Current Position

Phase: 84 (browser-extension) — COMPLETE
Plan: 2 of 2
Status: Verified, ready for next phase
Last activity: 2026-04-15

Progress: [██████████] 100%

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

Last session: 2026-04-15
Stopped at: Phase 85 (iOS Shortcut) **DEFERRED** mid task 1 — two Shortcuts.app bugs stacked (note-input dialog refuses typing on macOS, and a silent "uploaded" success branch with no thought appearing in Vigil PWA). Not worth blocking v3.1 close on.
Resume file: .planning/HANDOFF.json (status=deferred)
Next action: Pick next work — either close v3.1 without phase 85, start a new phase, or come back to 85 later on an iPhone where share-sheet Shortcuts is better-tested.
