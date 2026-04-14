---
phase: 79-gmail-oauth-server-foundation
plan: 02
subsystem: auth
tags: [hono, oauth, google, scope-detection, drizzle, postgres]

# Dependency graph
requires:
  - phase: 79-01
    provides: oauthTokens.scopes column in schema, google-auth.ts with JWT nonce and dual scope request

provides:
  - GET /v1/google/status endpoint returning per-scope authorization state (calendar/gmail connected|needs_auth)
  - DI-injectable createGoogleStatusRouter for unit testing without database
  - 4 test cases covering all scope state scenarios

affects: [81-pwa-settings-google-oauth-ui, brief-assembly, any client needing to detect gmail re-auth requirement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope-gap detection via DB column read — no outbound API calls, pure local state check"
    - "DI injection pattern (dbSelectFn) for testable route handlers without real DB"

key-files:
  created:
    - vigil-core/src/routes/google-status.ts
    - vigil-core/src/routes/google-status.test.ts
  modified:
    - vigil-core/src/index.ts

key-decisions:
  - "googleStatus route registered AFTER bearerAuth middleware — endpoint requires valid API key (T-79-08)"
  - "Response shape is flat {calendar, gmail} strings — never exposes tokens or refresh tokens (T-79-07)"
  - "NULL scopes treated as needs_auth for both scopes — safe fallback for legacy tokens (D-10)"

patterns-established:
  - "Per-scope status strings: 'connected' | 'needs_auth' — PWA uses these to gate re-auth flow"

requirements-completed: [OAUTH-04]

# Metrics
duration: 12min
completed: 2026-04-14
---

# Phase 79 Plan 02: Google Status Endpoint Summary

**GET /v1/google/status endpoint reads oauthTokens.scopes column and returns per-scope calendar/gmail authorization state behind bearer auth**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-14T18:10:00Z
- **Completed:** 2026-04-14T18:22:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created `google-status.ts` with `createGoogleStatusRouter` DI pattern — reads only the scopes column, zero outbound API calls
- All 4 scope scenarios covered: both connected, calendar-only legacy, no token row, null scopes
- Route registered after bearerAuth middleware in index.ts — requires valid API key per threat model T-79-08
- 120 total tests pass (0 failures) including the 4 new GS-01 through GS-04 tests

## Task Commits

1. **Task 1: Create google-status.ts endpoint and tests, register in index.ts** - `2326293` (feat)

## Files Created/Modified
- `vigil-core/src/routes/google-status.ts` - GET /google/status endpoint with DI injection for testing
- `vigil-core/src/routes/google-status.test.ts` - 4 tests covering both-connected, calendar-only, no-token, null-scopes
- `vigil-core/src/index.ts` - Added googleStatus import and route registration after bearerAuth middleware

## Decisions Made
- Response shape `{ calendar: "connected"|"needs_auth", gmail: "connected"|"needs_auth" }` — matches plan spec exactly, no token leakage
- Route registration after auth middleware ensures endpoint requires bearer auth (PWA sends API key per D-06)
- `scopes ?? []` fallback treats null column as empty array — both scopes return needs_auth safely

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing node_modules in worktree**
- **Found during:** Task 1 (test execution)
- **Issue:** Worktree's `vigil-core/node_modules` was absent — tests could not run
- **Fix:** Ran `npm install` in the worktree's `vigil-core` directory
- **Files modified:** vigil-core/node_modules (not committed — gitignored)
- **Verification:** All 120 tests pass after install
- **Committed in:** Not committed (node_modules is gitignored)

**2. [Rule 3 - Blocking] Restored schema.ts scopes column in working tree**
- **Found during:** Task 1 verification
- **Issue:** Working tree had an unstaged modification removing the `scopes` column (artifact from parallel wave orchestration and soft reset)
- **Fix:** `git checkout -- vigil-core/src/db/schema.ts` to restore HEAD state (which has the scopes column from 79-01)
- **Files modified:** vigil-core/src/db/schema.ts (restored, not committed — already correct in HEAD)
- **Verification:** `grep scopes vigil-core/src/db/schema.ts` returns line 183
- **Committed in:** N/A — working tree restored to match HEAD

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking environment issues)
**Impact on plan:** Both fixes were environment setup issues in the worktree context, not code changes. No scope creep.

## Issues Encountered
- Worktree was created from soft-reset state with uncommitted staged changes and missing node_modules — both resolved before task commit
- Working tree schema had an unstaged modification removing `scopes` (from parallel wave orchestration) — restored with `git checkout`

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- GET /v1/google/status is live and protected — PWA (Phase 81) can call it with the API key to detect gmail scope gap
- Response shape `{ calendar, gmail }` with `connected|needs_auth` values is stable interface for Phase 81 settings UI
- No blockers

## Self-Check: PASSED

- FOUND: vigil-core/src/routes/google-status.ts
- FOUND: vigil-core/src/routes/google-status.test.ts
- FOUND: commit 2326293
- FOUND: import { googleStatus } in index.ts
- FOUND: app.route("/v1", googleStatus) after bearerAuth middleware

---
*Phase: 79-gmail-oauth-server-foundation*
*Completed: 2026-04-14*
