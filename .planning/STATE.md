---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: Gmail & CLI Evolution
status: executing
stopped_at: Phase 81 context gathered
last_updated: "2026-04-14T02:49:04.896Z"
last_activity: 2026-04-14 -- Phase 79.1 planning complete
progress:
  total_phases: 12
  completed_phases: 2
  total_plans: 14
  completed_plans: 9
  percent: 64
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-13)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Milestone v3.1 — Phase 79: Gmail OAuth Server Foundation

## Current Position

Phase: 81 of 82 (pwa settings & google oauth ui)
Plan: Not started
Status: Ready to execute
Last activity: 2026-04-14 -- Phase 79.1 planning complete

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: ~176 (through v3.0)
- Total execution time: ~13 days
- Average duration: ~5 min per plan

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0–v2.5 | 1-72 | ~165 | 12 days |
| v3.0 Server-Side PDF | 73-78 | 11 | 1 day |
| v3.1 Gmail & CLI | 79-82 | TBD | - |

## Accumulated Context

### Roadmap Evolution

- Phase 80.1 inserted after Phase 80: PWA Brand Token Foundation (INSERTED) — apply Vigil brand guidelines (teal palette, Inter font, type scale) to PWA before Settings UI in Phase 81
- Phase 79.1 inserted after Phase 79: Close OAuth schema gap (URGENT) — add `scopes` + `account_email` columns to oauth_tokens, parse tokens.scope in callback, remove back-compat branch from status endpoint. Surfaced by Phase 81 UAT 2026-04-13 — gmail scope granted by Google but status endpoint hardcodes needs_auth.

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions affecting v3.1:

- Phase 74 OAuth token row (provider='google') shared by Calendar + Gmail — no schema migration
- gmail.readonly is restricted scope (not sensitive) — keep app in Testing/personal-use, no CASA audit
- In-memory nonce must move to signed JWT before any Phase 79 production deploy (Railway rolling restarts kill in-memory state)
- Existing Calendar refresh token will 403 on Gmail calls until user re-authorizes — Phase 79 must detect scope gap
- CLI plist must be audited and updated atomically with command retirement in Phase 82

### Pending Todos

- Verify `GOOGLE_OAUTH_STATE_SECRET` env var exists in Railway before Phase 79 deploy
- Confirm WO sender domain allowlist value (required for Phase 80 extraction)
- Verify Railway "Always On" is enabled (service sleep kills first request)
- G2 hardware testing still pending

### Blockers/Concerns

- Google OAuth consent screen may need re-verification after adding gmail.readonly scope
- `jsonwebtoken` availability in vigil-core — confirm before writing JWT nonce implementation in Phase 79
- iOS PWA OAuth full-page redirect behavior — requires real device test during Phase 81

## Session Continuity

Last session: 2026-04-13T23:26:28.754Z
Stopped at: Phase 81 context gathered
Resume file: .planning/phases/81-pwa-settings-google-oauth-ui/81-CONTEXT.md
Next action: /gsd-plan-phase 79
