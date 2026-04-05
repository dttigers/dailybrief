---
phase: 38-api-key-auth
plan: 01
subsystem: auth
tags: [api-key, sha256, hono-middleware, bearer-token]

# Dependency graph
requires:
  - phase: 37-postgresql-migration
    provides: Drizzle ORM + PostgreSQL schema and connection
provides:
  - api_keys table with SHA-256 hashed key storage
  - Bearer token auth middleware for Hono
  - CLI key generation script (vk_ prefixed keys)
  - All API routes protected except /v1/health
affects: [39-railway-deploy, client-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [bearer-token-auth, hash-only-key-storage, fire-and-forget-updates]

key-files:
  created:
    - vigil-core/src/middleware/auth.ts
    - vigil-core/scripts/generate-key.ts
    - vigil-core/drizzle/0001_parallel_onslaught.sql
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/index.ts
    - vigil-core/package.json

key-decisions:
  - "Store only SHA-256 hash of API key, never the raw key"
  - "vk_ prefix on keys for easy identification in logs/configs"
  - "keyPrefix stores first 11 chars (vk_ + 8 hex) for log-safe ID"
  - "lastUsedAt update is fire-and-forget to avoid blocking requests"
  - "Health endpoint excluded from auth via path check in middleware wrapper"

patterns-established:
  - "Bearer token auth: Authorization header -> SHA-256 hash -> DB lookup"
  - "Key generation: crypto.randomBytes(32) -> vk_ prefix -> hash-and-store"

# Metrics
duration: 8min
completed: 2026-04-05
---

# Phase 38, Plan 01: API Key Auth Summary

**Bearer token auth with SHA-256 hashed keys, CLI key generator, and Hono middleware protecting all 12 route modules**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-05
- **Completed:** 2026-04-05
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- api_keys table with hash-only storage, prefix for log identification, and active flag
- CLI script generates vk_-prefixed 32-byte random keys, prints once, stores hash
- Auth middleware validates Bearer tokens against hashed keys in database
- All 12 route modules protected; /v1/health remains open for monitoring

## Task Commits

Each task was committed atomically:

1. **Task 1: API keys schema + key generation script** - `6927126` (feat)
2. **Task 2: Auth middleware + protect all routes** - `74cf46b` (feat)

## Files Created/Modified
- `vigil-core/src/db/schema.ts` - Added apiKeys table definition
- `vigil-core/src/middleware/auth.ts` - Bearer token validation middleware
- `vigil-core/src/index.ts` - Applied auth middleware to all routes except health
- `vigil-core/scripts/generate-key.ts` - CLI tool for generating API keys
- `vigil-core/package.json` - Added db:generate-key script
- `vigil-core/drizzle/0001_parallel_onslaught.sql` - Migration for api_keys table

## Decisions Made
- Store only SHA-256 hash — raw keys shown once at generation and never recoverable
- vk_ prefix for easy grep/identification in configs and logs
- Fire-and-forget lastUsedAt update to avoid adding latency to requests
- Path-based skip for /v1/health in middleware wrapper (Hono middleware matches by path pattern, not registration order)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Health route middleware exclusion strategy**
- **Found during:** Task 2 (Auth middleware)
- **Issue:** Plan suggested Hono middleware applies based on registration order, but Hono matches middleware by path pattern — /v1/health would still be auth-gated
- **Fix:** Used wrapper function that checks `c.req.path === "/v1/health"` and skips auth
- **Files modified:** vigil-core/src/index.ts
- **Verification:** TypeScript compiles, path check correctly skips health
- **Committed in:** 74cf46b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential fix for correct health endpoint behavior. No scope creep.

## Issues Encountered
- `db:push` failed due to no DATABASE_URL in environment (expected — local dev without running PostgreSQL). Schema generation succeeded and migration SQL was created correctly.

## User Setup Required

None - no external service configuration required. API keys are generated via `npm run db:generate-key -- --name "my-client"` once the database is available.

## Next Phase Readiness
- Auth layer complete, ready for Railway deployment (Phase 39)
- First API key should be generated after database is accessible: `npm run db:push && npm run db:generate-key -- --name "g2-glasses"`

---
*Phase: 38-api-key-auth*
*Completed: 2026-04-05*
