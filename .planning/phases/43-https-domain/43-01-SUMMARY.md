---
phase: 43-https-domain
plan: 01
subsystem: infra
tags: [cors, hono, railway, https]

# Dependency graph
requires:
  - phase: 39-railway-deployment
    provides: Railway deployment with default domain
  - phase: 42-mac-app-server-migration
    provides: Mac app client pointing at Railway production URL
provides:
  - CORS middleware on Vigil Core API for cross-origin browser requests
  - Explicit decision to keep Railway default domain (custom domain deferred)
affects: [vigil-g2-plugin, future-custom-domain]

# Tech tracking
tech-stack:
  added: []
  patterns: [hono/cors middleware before auth]

key-files:
  created: []
  modified: [vigil-core/src/index.ts]

key-decisions:
  - "Keep Railway default domain for now — zero config, already working, custom domain can be added later"
  - "CORS origin configurable via CORS_ORIGINS env var, falls back to wildcard"

patterns-established:
  - "CORS middleware placed before auth middleware so OPTIONS preflight is not rejected"

# Metrics
duration: 5min
completed: 2026-04-05
---

# Phase 43: HTTPS & Domain Summary

**CORS middleware on Vigil Core API via hono/cors, custom domain deferred in favor of Railway default**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05
- **Completed:** 2026-04-05
- **Tasks:** 3 (1 auto, 1 checkpoint, 1 no-op)
- **Files modified:** 1

## Accomplishments
- Added CORS middleware to Vigil Core API using built-in hono/cors, placed before auth so OPTIONS preflight works
- CORS origin configurable via `CORS_ORIGINS` env var (comma-separated), defaults to wildcard
- Decision checkpoint: user chose to keep Railway default domain, skipping custom domain setup

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CORS middleware to Vigil Core API** - `9d4f612` (feat)
2. **Task 2: Choose custom domain** - checkpoint, user chose "skip"
3. **Task 3: Configure custom domain / update URLs** - no-op per skip decision

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `vigil-core/src/index.ts` - Added CORS middleware with configurable origins before auth middleware

## Decisions Made
- Keep Railway default domain (`vigil-core-production.up.railway.app`) — zero config, already working, custom domain can be added later without client changes since URLs are already configurable via env/config

## Deviations from Plan

None - plan executed exactly as written (skip path).

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CORS enabled, G2 plugin can make cross-origin requests to Railway API
- Custom domain can be revisited anytime without code changes (URLs are config-driven)
- Ready for phase 44

---
*Phase: 43-https-domain*
*Completed: 2026-04-05*
