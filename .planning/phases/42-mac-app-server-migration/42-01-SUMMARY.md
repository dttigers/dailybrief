---
phase: 42-mac-app-server-migration
plan: 01
subsystem: api
tags: [swift, bearer-auth, vigil-api-client, railway, production-url]

# Dependency graph
requires:
  - phase: 38-api-key-auth
    provides: Bearer token auth on Vigil Core API (vk_ prefixed keys)
  - phase: 39-railway-deployment
    provides: Production URL at vigil-core-production.up.railway.app
  - phase: 41-g2-plugin-production-url
    provides: Bearer auth pattern reference for client migration
provides:
  - VigilAPIClient sends Bearer auth headers on all HTTP requests when apiKey configured
  - Mac app default URL points at Railway production server
  - Both CLI and menu bar entry points pass apiKey from config
affects: [43-mac-app-server-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [bearer-auth-headers-swift, centralized-applyHeaders-helper]

key-files:
  created: []
  modified: [Sources/JarvisCore/Config/AppConfig.swift, Sources/JarvisCore/Services/VigilAPIClient.swift, Sources/DailyBriefMonitor/AppDelegate.swift, Sources/DailyBrief/DailyBrief.swift]

key-decisions:
  - "Added applyHeaders() helper to centralize Accept and Authorization headers instead of duplicating across methods"
  - "apiKey is optional — nil/empty omits Authorization header for backward-compatible local dev"
  - "Default URL changed from localhost:3001 to Railway production URL"

patterns-established:
  - "applyHeaders pattern: centralized header injection on VigilAPIClient for DRY auth"

# Metrics
duration: 5min
completed: 2026-04-05
---

# Phase 42 Plan 01: Mac App Server Migration Summary

**Bearer auth and production URL added to VigilAPIClient with centralized header injection**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05T18:25:00Z
- **Completed:** 2026-04-05T18:30:00Z
- **Tasks:** 2
- **Files modified:** 4 (source) + 1 (user config)

## Accomplishments
- VigilAPIClient now accepts optional apiKey and attaches Bearer auth header on all requests
- Refactored 5 HTTP methods (get, post, put, delete, postNoResponse) to use centralized `applyHeaders()` helper
- Both entry points (DailyBrief CLI and DailyBriefMonitor menu bar app) pass apiKey from config
- Default API URL updated from localhost to Railway production server
- User config updated with production URL and api_key placeholder

## Task Commits

Each task was committed atomically:

1. **Task 1: Add API key to VigilConfig and inject Bearer auth into VigilAPIClient** - `61eb466` (feat)
2. **Task 2: Update user config and validate end-to-end** - no commit (external config file, not tracked in repo)

## Files Created/Modified
- `Sources/JarvisCore/Config/AppConfig.swift` - Added apiKey field to VigilConfig, updated default URL
- `Sources/JarvisCore/Services/VigilAPIClient.swift` - Added apiKey property, applyHeaders() helper, refactored all HTTP methods
- `Sources/DailyBriefMonitor/AppDelegate.swift` - Pass apiKey from config to VigilAPIClient init
- `Sources/DailyBrief/DailyBrief.swift` - Pass apiKey from config to VigilAPIClient init
- `~/.config/dailybrief/config.json` - Updated api_base_url to production, added api_key placeholder

## Decisions Made
- Used centralized `applyHeaders()` method instead of inline header setting per HTTP method (DRY, less error-prone)
- apiKey is `String?` — when nil or empty, Authorization header is omitted (backward compat for local dev)

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
**User must add their production API key to config.** The api_key field in `~/.config/dailybrief/config.json` is currently empty. The key prefix `vk_e2e2fae0` was generated in phase 39 -- the full key must be retrieved from wherever it was saved and added to the vigil.api_key config field.

## Next Phase Readiness
- Mac app is ready to connect to production Vigil Core API once API key is configured
- Health check confirms production API is reachable and database connected

---
*Phase: 42-mac-app-server-migration*
*Completed: 2026-04-05*
