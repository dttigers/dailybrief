---
phase: 34-mac-migration-first
plan: 03
subsystem: api
tags: [swift, actor, vigil-api, rest-client, thought-repository]

requires:
  - phase: 34-02
    provides: ThoughtRepository protocol, VigilAPIClient HTTP client
provides:
  - APIThoughtStore actor implementing ThoughtRepository via REST API
  - ThoughtRepository methods migrated to async throws
  - Sendable-conforming response types
affects: [34-04, 34-05]

tech-stack:
  added: []
  patterns: [API response mapping with private Decodable structs, ISO 8601 date parsing with fractional seconds fallback]

key-files:
  created: [Sources/JarvisCore/Storage/APIThoughtStore.swift]
  modified: [Sources/JarvisCore/Storage/ThoughtRepository.swift, Sources/JarvisCore/Storage/ThoughtStore.swift, Sources/JarvisCore/Services/VigilAPIClient.swift]

key-decisions:
  - "Migrated all ThoughtRepository sync throws methods to async throws to enable API-backed implementations"
  - "Used subtraction approach for countUnclassifiedTherapy (total - selfLearnable - bringToTherapist)"
  - "Used nonisolated(unsafe) for ISO8601DateFormatter statics (immutable after init, safe in practice)"

patterns-established:
  - "API response mapping: private Decodable struct per endpoint shape, toThought() converter"
  - "Error handling: 404 -> nil/false for optional returns, 503 -> serverUnavailable"
  - "Count queries: use limit=0 to avoid transferring data, read total from PaginatedResponse"

duration: 8min
completed: 2026-04-04
---

# Plan 34-03: APIThoughtStore Summary

**Complete API-backed ThoughtRepository implementation with 30+ methods mapping to Vigil Core REST endpoints**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-04
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- APIThoughtStore actor fully conforms to ThoughtRepository, routing all operations through VigilAPIClient
- All read operations (fetch, list, filter, search, count, tags, links) mapped to GET endpoints with query params
- All write operations (CRUD, tags, favorites, links, bulk) mapped to POST/PUT/DELETE endpoints
- ThoughtRepository protocol migrated to async throws for network-compatible implementations

## Task Commits

Each task was committed atomically:

1. **Task 1: Protocol async migration** - `8351e73` (feat)
2. **Task 2: APIThoughtStore implementation** - `66f2e16` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Storage/APIThoughtStore.swift` - Complete API-backed ThoughtRepository actor (519 lines)
- `Sources/JarvisCore/Storage/ThoughtRepository.swift` - All methods now async throws
- `Sources/JarvisCore/Storage/ThoughtStore.swift` - Updated method signatures to match protocol
- `Sources/JarvisCore/Services/VigilAPIClient.swift` - PaginatedResponse/CountResponse made Sendable

## Decisions Made
- Migrated ThoughtRepository from mixed sync/async to fully async throws. Required because API calls are inherently async, and the protocol must support both local (GRDB) and remote (API) backends. All existing callers already used `try await` across actor boundaries.
- Used `nonisolated(unsafe)` for ISO 8601 date formatters since they're immutable after initialization.
- Used subtraction approach for counting unclassified therapy thoughts (3 API calls) since the API doesn't support filtering by null classification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ThoughtRepository sync throws incompatible with async API calls**
- **Found during:** Task 1 (Read operations)
- **Issue:** 12 protocol methods were `throws` (not `async throws`), making it impossible to call async VigilAPIClient from conforming implementations
- **Fix:** Migrated all sync-only `throws` protocol methods to `async throws`, updated ThoughtStore signatures to match
- **Files modified:** ThoughtRepository.swift, ThoughtStore.swift
- **Verification:** swift build succeeds, all callers already used try await
- **Committed in:** 8351e73 (Task 1 commit)

**2. [Rule 3 - Blocking] Sendable conformance for cross-actor response types**
- **Found during:** Task 1 (Read operations)
- **Issue:** PaginatedResponse and APIThoughtResponse were not Sendable, causing errors when returned across actor boundaries
- **Fix:** Added Sendable conformance to PaginatedResponse, CountResponse, and all private response structs
- **Files modified:** VigilAPIClient.swift, APIThoughtStore.swift
- **Verification:** swift build succeeds with strict concurrency
- **Committed in:** 8351e73, 66f2e16

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were essential for compilation. No scope creep.

## Issues Encountered
None beyond the deviations noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- APIThoughtStore ready to be wired into DI container (Plan 34-04)
- ThoughtRepository protocol fully async, compatible with both local and remote backends
- No blockers

---
*Phase: 34-mac-migration-first*
*Completed: 2026-04-04*
