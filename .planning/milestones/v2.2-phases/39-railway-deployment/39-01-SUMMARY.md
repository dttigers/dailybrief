---
phase: 39-railway-deployment
plan: 01
subsystem: infra
tags: [docker, railway, drizzle-orm, migrations, node-alpine]

requires:
  - phase: 38-api-key-auth
    provides: vigil-core application with all routes and auth middleware
provides:
  - Multi-stage Dockerfile for containerized vigil-core builds
  - Programmatic migration script using drizzle-orm (no devDeps)
  - .dockerignore for clean builds
affects: [39-railway-deployment]

tech-stack:
  added: []
  patterns: [multi-stage Docker build, programmatic Drizzle migrations]

key-files:
  created:
    - vigil-core/Dockerfile
    - vigil-core/.dockerignore
    - vigil-core/src/db/migrate.ts
  modified:
    - vigil-core/package.json

key-decisions:
  - "Migrations run on every deploy via CMD — idempotent via __drizzle_migrations table"
  - "Single connection (max: 1) for migration client to avoid pool overhead"

patterns-established:
  - "Production migrations use drizzle-orm/postgres-js/migrator, not drizzle-kit"
  - "Dockerfile CMD chains migration then app start with sh -c"

duration: 4min
completed: 2026-04-05
---

# Phase 39-01: Railway Deployment Config Summary

**Multi-stage Dockerfile with node:20-alpine and programmatic Drizzle migration script for production deploys**

## Performance

- **Duration:** 4 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Multi-stage Dockerfile: builder stage (npm ci + tsc) then production stage with only runtime deps
- Programmatic migrate.ts using drizzle-orm migrator (not drizzle-kit devDep)
- Dockerfile CMD runs migrations before app start on every deploy
- .dockerignore excludes node_modules, dist, .env, .git

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Dockerfile and .dockerignore** - `3365770` (feat)
2. **Task 2: Create programmatic migration script** - `3ffa8ce` (feat)

## Files Created/Modified
- `vigil-core/Dockerfile` - Multi-stage build (builder + production)
- `vigil-core/.dockerignore` - Excludes node_modules, dist, .env, .git
- `vigil-core/src/db/migrate.ts` - Programmatic Drizzle migrations using production deps only
- `vigil-core/package.json` - Added db:migrate-prod script

## Decisions Made
- Migrations run on every deploy via CMD chain — idempotent (Drizzle tracks applied migrations)
- Single connection (max: 1) for migration client

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dockerfile and migration script ready for Railway deployment
- Next plan can configure Railway service, set environment variables, and deploy

---
*Phase: 39-railway-deployment*
*Completed: 2026-04-05*
