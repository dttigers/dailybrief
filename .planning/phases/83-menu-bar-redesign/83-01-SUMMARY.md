---
phase: 83-menu-bar-redesign
plan: 01
subsystem: api
tags: [hono, drizzle, postgres, jsonb, print-schedule, settings]

# Dependency graph
requires: []
provides:
  - app_settings table (key/value/updated_at, text PK + jsonb) in PostgreSQL via migration 0009
  - GET /v1/settings/print-schedule — returns { hour, minute, enabled } with defaults { 6, 0, true }
  - PUT /v1/settings/print-schedule — upserts schedule, validates hour 0-23 / minute 0-59 / enabled boolean
  - createSettingsRouter + settings exports from vigil-core/src/routes/settings.ts
affects:
  - 83-02-PWA-settings-ui
  - 83-03-mac-app-settings
  - 83-04-scheduler-wiring

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DI-injectable router factory (createSettingsRouter with SettingsDeps) matching google-status.ts pattern
    - Drizzle onConflictDoUpdate upsert for single-row key-value settings

key-files:
  created:
    - vigil-core/drizzle/0009_add_app_settings.sql
    - vigil-core/src/routes/settings.ts
    - vigil-core/src/routes/settings.test.ts
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/index.ts

key-decisions:
  - "Key-value app_settings table (not a typed row per setting) keeps schema simple and extensible"
  - "DI factory pattern for settings router mirrors google-status.ts exactly — consistent testing approach"

patterns-established:
  - "Settings persistence: single text PK row in app_settings, value as jsonb, upserted via onConflictDoUpdate"

requirements-completed: [SC-3]

# Metrics
duration: 20min
completed: 2026-04-15
---

# Phase 83 Plan 01: app_settings Table + Print Schedule API Summary

**PostgreSQL app_settings key-value table + GET/PUT /v1/settings/print-schedule Hono endpoints, fully tested with DI factory pattern**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-15T00:00:00Z
- **Completed:** 2026-04-15T00:20:10Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Migration `0009_add_app_settings.sql` creates `app_settings` table with `key` (text PK), `value` (jsonb), `updated_at` (timestamptz)
- `GET /v1/settings/print-schedule` returns `{ hour: 6, minute: 0, enabled: true }` defaults when no row exists; returns stored schedule when row exists
- `PUT /v1/settings/print-schedule` validates hour 0-23, minute 0-59, enabled boolean — returns 400 `{ error: "invalid_input" }` on any violation
- All 6 unit tests (PS-01 through PS-06) passing via `npx tsx --test`
- Route registered in index.ts behind existing bearerAuth middleware (satisfies T-83-01 / T-83-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: app_settings migration + schema table** - `9c00218` (feat)
2. **Task 2: GET + PUT /v1/settings/print-schedule route + tests** - `8dedbc9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `vigil-core/drizzle/0009_add_app_settings.sql` — CREATE TABLE migration for app_settings
- `vigil-core/src/db/schema.ts` — Added appSettings pgTable export
- `vigil-core/src/routes/settings.ts` — createSettingsRouter factory + settings singleton export
- `vigil-core/src/routes/settings.test.ts` — 6 node:test unit tests (PS-01 through PS-06), no DB required
- `vigil-core/src/index.ts` — Added settings import + app.route("/v1", settings) after googleStatus

## Decisions Made

- Used key-value `app_settings` table (not a dedicated `print_schedule` table) — extensible to future settings without new migrations
- DI factory pattern (`createSettingsRouter(deps?)`) mirrors `google-status.ts` exactly — zero new patterns introduced
- Tests use `tsx --test` (project convention), not plain `node --test` (which requires compiled `.js`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used tsx --test instead of node --test**
- **Found during:** Task 2 (running tests)
- **Issue:** Plan's `<verify>` block used `node --test src/routes/settings.test.ts` but this project's TypeScript source requires `tsx` as the loader (package.json `"test"` script uses `tsx --test`)
- **Fix:** Verified using `npx tsx --test src/routes/settings.test.ts`; all 6 tests pass
- **Files modified:** None — test runner invocation only, no file change needed
- **Verification:** All 6 tests green
- **Committed in:** 8dedbc9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — test runner invocation)
**Impact on plan:** No scope change. Tests pass correctly. Node runner note added to summary for future plans.

## Issues Encountered

- Worktree initially had wrong base commit; reset to `12a79d5` before starting work
- Files initially written to main repo path (`/Users/.../dailybrief/vigil-core/`) instead of worktree path; corrected before any commits

## User Setup Required

After deployment to Railway, the migration `0009_add_app_settings.sql` will be applied automatically via `drizzle migrate()` on deploy. No manual steps required.

Verification after deploy:
```bash
curl -H "Authorization: Bearer $VIGIL_API_KEY" https://api.vigilhub.io/v1/settings/print-schedule
# Expected: {"hour":6,"minute":0,"enabled":true}
```

## Next Phase Readiness

- `GET /v1/settings/print-schedule` and `PUT /v1/settings/print-schedule` are ready for Plans 02, 03, 04 to wire against
- Route is protected by bearerAuth — Mac app and PWA must send `Authorization: Bearer <key>` header
- Default schedule `{ hour: 6, minute: 0, enabled: true }` will be returned until first PUT stores a value

## Self-Check: PASSED

- FOUND: vigil-core/drizzle/0009_add_app_settings.sql
- FOUND: vigil-core/src/db/schema.ts (appSettings exported)
- FOUND: vigil-core/src/routes/settings.ts
- FOUND: vigil-core/src/routes/settings.test.ts
- FOUND: .planning/phases/83-menu-bar-redesign/83-01-SUMMARY.md
- FOUND: commit 9c00218 (app_settings migration + schema)
- FOUND: commit 8dedbc9 (route + tests)
- FOUND: app.route("/v1", settings) in index.ts

---
*Phase: 83-menu-bar-redesign*
*Completed: 2026-04-15*
