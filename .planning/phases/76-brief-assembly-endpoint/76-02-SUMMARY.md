---
phase: 76-brief-assembly-endpoint
plan: 02
subsystem: api
tags: [hono, pdf, routes, di-factory, upsert, binary-response]

# Dependency graph
requires:
  - phase: 76-brief-assembly-endpoint
    plan: 01
    provides: createBriefAssemblyService().assembleAndRender(dateStr) orchestration
provides:
  - POST /v1/brief/generate endpoint returning PDF binary with X-Brief-Storage-Key header
  - GET /v1/brief/:date endpoint returning stored PDF by date key
  - createBriefGenerateRouter() DI factory for route-level testing
  - Briefs table upsert on each generation with pdfFilename and metadata
affects: [77-pwa-brief-ui, 78-mac-cli-thin-client]

# Tech tracking
tech-stack:
  added: []
  patterns: [di-factory-route, binary-response-uint8array, date-regex-path-traversal-guard]

key-files:
  created:
    - vigil-core/src/routes/brief-generate.ts
    - vigil-core/src/routes/brief-generate.test.ts
  modified:
    - vigil-core/src/index.ts

key-decisions:
  - "Used DI factory pattern (createBriefGenerateRouter) matching sports route convention for testability"
  - "Buffer converted to Uint8Array for Response constructor TypeScript compatibility with Node 25"
  - "briefGenerate registered BEFORE brief route in index.ts for path specificity (POST /brief/generate before GET /brief)"

patterns-established:
  - "Binary PDF response via new Response(new Uint8Array(buffer)) with Content-Type: application/pdf"
  - "X-Brief-Storage-Key response header carries date for client-side cache keying"

requirements-completed: [BRIEF-01, BRIEF-03, BRIEF-04]

# Metrics
duration: 4min
completed: 2026-04-13
---

# Phase 76 Plan 02: Brief Generate Route Summary

**POST /brief/generate and GET /brief/:date Hono route handlers with DI factory, briefs table upsert, date validation, and binary PDF response**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-13T12:58:44Z
- **Completed:** 2026-04-13T13:02:54Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- POST /v1/brief/generate calls assembleAndRender, upserts briefs table, returns PDF binary with Content-Type: application/pdf and X-Brief-Storage-Key header
- GET /v1/brief/:date validates date format (T-76-04 path traversal prevention), queries briefs table, reads PDF file, returns binary or appropriate 404
- Both routes return 503 when database unavailable, 500 with generic message on errors (T-76-05)
- DI factory (createBriefGenerateRouter) enables route-level testing without module mocking
- 9 route tests + 15 service tests + full suite of 116 tests all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /brief/generate and GET /brief/:date routes with TDD** - `1bfe11a` (feat)
2. **Task 2: Register brief-generate routes in index.ts and run full suite** - `2e78dce` (feat)

## Files Created/Modified
- `vigil-core/src/routes/brief-generate.ts` - Route handlers with DI factory, briefs upsert, binary PDF response, date validation
- `vigil-core/src/routes/brief-generate.test.ts` - 9 tests: generate success, upsert verification, no-DB 503, error 500, retrieve success, 404 no row, 404 file missing, bad date 400, retrieve no-DB 503
- `vigil-core/src/index.ts` - Added briefGenerate import and registration before brief route

## Decisions Made
- Used DI factory pattern (createBriefGenerateRouter) matching the project's established sports route convention rather than module mocking (mock.module not available in Node 25)
- Buffer converted to Uint8Array for Response constructor to satisfy TypeScript strict mode in Node 25
- briefGenerate registered before the existing brief route in index.ts to ensure POST /brief/generate and GET /brief/:date match before the generic GET /brief handler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Buffer type incompatibility with Response constructor**
- **Found during:** Task 2 (tsc --noEmit verification)
- **Issue:** Node 25's TypeScript types don't accept Buffer as BodyInit for Response constructor
- **Fix:** Wrapped buffer in `new Uint8Array(buffer)` for both POST and GET response paths
- **Files modified:** vigil-core/src/routes/brief-generate.ts
- **Verification:** tsc --noEmit passes, all 9 route tests still pass
- **Committed in:** 2e78dce (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - routes use existing bearer auth middleware, no new configuration needed.

## Next Phase Readiness
- Both endpoints are live behind bearer auth at POST /v1/brief/generate and GET /v1/brief/:date
- Phase 77 (PWA Brief UI) can call POST /v1/brief/generate to get PDF binary
- Phase 78 (Mac CLI Thin Client) can call POST /v1/brief/generate and pipe to lpr

## Self-Check: PASSED
