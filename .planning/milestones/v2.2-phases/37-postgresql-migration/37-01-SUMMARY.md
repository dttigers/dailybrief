---
phase: 37-postgresql-migration
plan: 01
subsystem: database
tags: [drizzle-orm, postgres, postgresql, migration, tsvector, jsonb]

requires:
  - phase: 36-vigil-mac-migration
    provides: existing SQLite schema and route structure in vigil-core
provides:
  - Drizzle ORM schema (thoughts + thought_links tables)
  - PostgreSQL connection module with postgres.js driver
  - drizzle-kit config and migration infrastructure
  - Initial migration SQL with tsvector FTS column
affects: [37-postgresql-migration plans 02-04, 38-auth-api-keys]

tech-stack:
  added: [drizzle-orm, postgres (postgres.js), drizzle-kit]
  patterns: [Drizzle pgTable schema definition, postgres.js connection pooling, snake_case SQL / camelCase TS mapping]

key-files:
  created:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/db/connection.ts
    - vigil-core/drizzle.config.ts
    - vigil-core/.env.example
    - vigil-core/drizzle/0000_dazzling_ezekiel_stane.sql
  modified:
    - vigil-core/package.json
    - vigil-core/src/db/types.ts

key-decisions:
  - "Kept legacy Thought/ThoughtLink interfaces alongside Drizzle-inferred types (DrizzleThought/DrizzleThoughtLink) for coexistence during migration"
  - "Connection module uses null guard for DATABASE_URL — warns but doesn't crash when unset, since SQLite routes still work"
  - "tsvector column added as GENERATED ALWAYS STORED in migration SQL rather than Drizzle schema (no native tsvector support)"

patterns-established:
  - "Dual type system: legacy SQLite interfaces + Drizzle-inferred types coexist until route migration completes in 37-04"
  - "snake_case PostgreSQL columns mapped to camelCase TypeScript via Drizzle column definitions"

duration: 5min
completed: 2026-04-05
---

# Plan 37-01: PostgreSQL Migration Foundation Summary

**Drizzle ORM schema with thoughts/thought_links tables, postgres.js connection module, and initial migration with tsvector FTS**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05
- **Completed:** 2026-04-05
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Drizzle schema defines thoughts (14 columns, 3 indexes) and thought_links (4 columns, 2 indexes, unique constraint) with PostgreSQL-native types
- PostgreSQL connection module with testConnection/closeConnection helpers using postgres.js driver
- Initial migration SQL generated with tsvector GENERATED ALWAYS STORED column and GIN index for full-text search
- drizzle-kit config and npm scripts (db:generate, db:migrate, db:push, db:studio) ready for use

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Drizzle ORM + PostgreSQL driver and define schema** - `61cdf8e` (feat)
2. **Task 2: Create database connection module and migration config** - `2ae152d` (feat)

## Files Created/Modified
- `vigil-core/src/db/schema.ts` - Drizzle pgTable definitions for thoughts and thought_links
- `vigil-core/src/db/connection.ts` - PostgreSQL connection via postgres.js with test/close helpers
- `vigil-core/src/db/types.ts` - Added Drizzle-inferred types, kept legacy SQLite interfaces
- `vigil-core/drizzle.config.ts` - drizzle-kit configuration pointing to schema
- `vigil-core/.env.example` - Documents DATABASE_URL and ANTHROPIC_API_KEY
- `vigil-core/drizzle/0000_dazzling_ezekiel_stane.sql` - Initial migration with FTS support
- `vigil-core/package.json` - Added drizzle-orm, postgres, drizzle-kit deps + db scripts

## Decisions Made
- Kept legacy Thought/ThoughtLink interfaces in types.ts alongside new Drizzle-inferred types (DrizzleThought, DrizzleThoughtLink) to avoid breaking existing SQLite routes during the migration period
- Connection module gracefully handles missing DATABASE_URL with a warning rather than crashing, since SQLite routes still serve traffic
- tsvector generated column added directly in migration SQL since Drizzle doesn't natively support tsvector column types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Legacy type preservation for coexistence**
- **Found during:** Task 1 (Schema and types)
- **Issue:** Plan said to remove old Thought interface, but existing routes import it and would fail type-checking with Drizzle-inferred types (different field types: string[] vs string for tags, boolean vs number for isFavorited, Date vs string for timestamps)
- **Fix:** Kept legacy interfaces, exported Drizzle types as DrizzleThought/DrizzleThoughtLink
- **Files modified:** vigil-core/src/db/types.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 61cdf8e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for correctness — removing the old interface would break all existing routes. Types will converge when routes are migrated in Plan 37-04.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema and connection module ready for Plan 37-02 (route migration)
- Migration SQL ready to run against a PostgreSQL database when available
- Old SQLite routes continue working unmodified

---
*Phase: 37-postgresql-migration*
*Completed: 2026-04-05*
