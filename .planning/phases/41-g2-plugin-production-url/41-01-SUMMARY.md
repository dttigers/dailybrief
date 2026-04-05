---
phase: 41-g2-plugin-production-url
plan: 01
subsystem: infra
tags: [vite, even-g2, api-client, bearer-auth, ehpk]

# Dependency graph
requires:
  - phase: 38-api-key-auth
    provides: Bearer token auth on Vigil Core API (vk_ prefixed keys)
  - phase: 39-railway-deployment
    provides: Production URL at vigil-core-production.up.railway.app
provides:
  - G2 plugin reads API URL and key from Vite env vars
  - Bearer auth headers on all G2 plugin API requests
  - Production build targeting Railway URL
  - .ehpk packaging via evenhub pack
affects: [42-g2-plugin-production-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: [vite-env-vars-for-config, bearer-auth-headers]

key-files:
  created: [vigil-g2-plugin/.env, vigil-g2-plugin/.env.production]
  modified: [vigil-g2-plugin/src/api.ts, vigil-g2-plugin/package.json, vigil-g2-plugin/app.json, vigil-g2-plugin/.gitignore]

key-decisions:
  - "authHeaders() returns Content-Type only when API_KEY is empty (local dev without auth), adds Authorization header when set"
  - "app.json entrypoint changed from dist/index.html to index.html since evenhub pack takes dist/ as the project folder argument"
  - "app.json updated with required Even Hub fields: package_id (com.vigilapp.g2), edition (202601), min_sdk_version (0.0.9)"

patterns-established:
  - "Vite env var pattern: VITE_API_URL and VITE_API_KEY with localhost fallback"
  - "authHeaders() helper centralizes auth header logic for all fetch calls"

# Metrics
duration: 5min
completed: 2026-04-05
---

# Phase 41: G2 Plugin Production URL Summary

**Configurable API URL and Bearer auth via Vite env vars, with .ehpk packaging for Even Hub distribution**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05T12:15:00Z
- **Completed:** 2026-04-05T12:20:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- API URL and API key configurable via VITE_API_URL and VITE_API_KEY environment variables
- Bearer auth headers included in all three API fetch calls (summary, brief, affirmation)
- Production build targets Railway URL (https://vigil-core-production.up.railway.app/v1)
- .ehpk package file generated via `npm run release` one-command workflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Add configurable API URL and Bearer auth** - `da13fef` (feat)
2. **Task 2: Add pack script and build production .ehpk** - `76c3a62` (feat)

## Files Created/Modified
- `vigil-g2-plugin/src/api.ts` - Replaced hardcoded URL with env vars, added authHeaders() helper
- `vigil-g2-plugin/.env` - Local dev config (localhost:3001, gitignored)
- `vigil-g2-plugin/.env.production` - Production config (Railway URL)
- `vigil-g2-plugin/package.json` - Added build:prod, pack, release scripts
- `vigil-g2-plugin/app.json` - Added required Even Hub fields, fixed entrypoint path
- `vigil-g2-plugin/.gitignore` - Added *.ehpk pattern

## Decisions Made
- authHeaders() omits Authorization header when API_KEY is empty, enabling seamless local dev without auth
- app.json entrypoint changed to "index.html" (relative to dist/) since evenhub pack takes dist/ as project folder
- Added required Even Hub manifest fields: package_id, edition, min_app_version, min_sdk_version, supported_languages

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] app.json missing required Even Hub fields**
- **Found during:** Task 2 (pack script)
- **Issue:** evenhub pack requires package_id, edition, min_app_version, min_sdk_version, supported_languages
- **Fix:** Added all required fields to app.json
- **Files modified:** vigil-g2-plugin/app.json
- **Verification:** `npm run pack` succeeds and produces out.ehpk
- **Committed in:** 76c3a62 (Task 2 commit)

**2. [Rule 3 - Blocking] app.json entrypoint path incorrect for pack**
- **Found during:** Task 2 (pack script)
- **Issue:** entrypoint "dist/index.html" caused pack to look for dist/dist/index.html
- **Fix:** Changed to "index.html" (relative to dist/ project folder)
- **Files modified:** vigil-g2-plugin/app.json
- **Verification:** `npm run pack` succeeds
- **Committed in:** 76c3a62 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for pack command to work. No scope creep.

## Issues Encountered
None.

## User Setup Required

Before building for production distribution, the user must:
1. Set `VITE_API_KEY=vk_...` in `vigil-g2-plugin/.env.production` with their actual API key from Phase 38
2. Run `npm run release` to build and package the .ehpk

## Next Phase Readiness
- G2 plugin is production-ready pending API key configuration
- .ehpk can be uploaded to Even Hub for distribution
- Ready for Phase 42 (G2 plugin production deploy)

---
*Phase: 41-g2-plugin-production-url*
*Completed: 2026-04-05*
