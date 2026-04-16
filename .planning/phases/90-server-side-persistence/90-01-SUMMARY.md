---
phase: 90-server-side-persistence
plan: 01
subsystem: api, database
tags: [drizzle, postgres, hono, jsonb, cache, upsert]

# Dependency graph
requires:
  - phase: 89-7-day-analysis-scope
    provides: 7-day rolling window for insights and therapy routes
provides:
  - ai_cache table in PostgreSQL with unique index on type column
  - GET /v1/insights/cache endpoint
  - GET /v1/therapy/cache?type=patterns|prep endpoint
  - Cache-write upsert in POST /insights, /therapy/patterns, /therapy/prep
affects: [90-02 chat-session-resume, PWA insights/therapy hooks]

# Tech tracking
tech-stack:
  added: []
  patterns: [upsert-on-conflict cache pattern for expensive AI results]

key-files:
  created:
    - vigil-core/drizzle/0010_add_ai_cache.sql
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/routes/insights.ts
    - vigil-core/src/routes/therapy.ts
    - vigil-core/drizzle/meta/_journal.json

key-decisions:
  - "Journal backfilled for migrations 0008-0009 that were applied via push but missing from journal"
  - "Spread TherapyPrep result in GET cache response for prep type to match existing response shape"

patterns-established:
  - "ai_cache upsert pattern: insert + onConflictDoUpdate on type column for single-row-per-type caching"

requirements-completed: [PERSIST-01, PERSIST-02, PERSIST-03]

# Metrics
duration: 3min
completed: 2026-04-16
---

# Phase 90 Plan 01: AI Cache Persistence Summary

**ai_cache Drizzle table with JSONB storage, GET cache endpoints for insights/therapy, and upsert cache-write in all three POST AI handlers**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-16T14:25:34Z
- **Completed:** 2026-04-16T14:28:08Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- ai_cache table with type, result (JSONB), generatedAt, updatedAt columns and unique index on type
- GET /insights/cache returns 404 when empty, cached insights with generatedAt when populated
- GET /therapy/cache?type=patterns|prep returns 404 when empty, cached result when populated; invalid type returns 400
- POST /insights, /therapy/patterns, /therapy/prep upsert to ai_cache after AI generation; responses include cached: false and generatedAt
- Schema pushed to Railway Postgres successfully; all 170 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ai_cache table to Drizzle schema and create migration** - `6b80cb3` (feat)
2. **Task 2: Add cache GET endpoints and cache-write to POST handlers** - `2387a64` (feat)
3. **Task 3: Push database schema to Railway Postgres** - no file changes (schema push only)

## Files Created/Modified
- `vigil-core/src/db/schema.ts` - Added aiCache table definition with uniqueIndex on type
- `vigil-core/drizzle/0010_add_ai_cache.sql` - Migration SQL for ai_cache table creation
- `vigil-core/drizzle/meta/_journal.json` - Backfilled entries 0008-0009, added 0010
- `vigil-core/src/routes/insights.ts` - GET /insights/cache endpoint + upsert in POST
- `vigil-core/src/routes/therapy.ts` - GET /therapy/cache endpoint + upsert in POST patterns and prep

## Decisions Made
- Backfilled journal entries for migrations 0008 and 0009 that had been applied via `drizzle-kit push` but were missing from _journal.json
- Used `as Record<string, unknown>` cast on prep cache result spread to satisfy TypeScript object spread constraint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Backfilled missing journal entries for migrations 0008-0009**
- **Found during:** Task 1
- **Issue:** _journal.json only had entries through idx 7 but migration files 0008 and 0009 existed on disk
- **Fix:** Added journal entries for 0008_add_oauth_scopes_and_account_email and 0009_add_app_settings alongside the new 0010 entry
- **Files modified:** vigil-core/drizzle/meta/_journal.json
- **Verification:** Journal now has entries 0-10 matching migration files on disk
- **Committed in:** 6b80cb3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Journal consistency fix, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ai_cache table live in PostgreSQL, ready for PWA hook integration (Plan 02)
- Cache endpoints available for client consumption
- Chat session resume (Plan 03) can proceed independently

---
*Phase: 90-server-side-persistence*
*Completed: 2026-04-16*
