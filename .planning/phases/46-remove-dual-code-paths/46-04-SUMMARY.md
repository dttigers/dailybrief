---
phase: 46-remove-dual-code-paths
plan: 04
subsystem: cli, ai
tags: [swift, vigil-api, cli, dead-code-removal]

# Dependency graph
requires:
  - phase: 46-01
    provides: GRDB/SQLite removed, clean Thought models
  - phase: 46-02
    provides: Local AI services deleted, config toggle removed, top-level apiBaseUrl/apiKey
provides:
  - CLI uses API for all data and AI services
  - No local-only code paths remain in CLI target
  - Orphaned AI service types restored to AIServiceProtocols.swift
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [api-only-cli]

key-files:
  created: []
  modified:
    - Sources/DailyBrief/DailyBrief.swift
    - Sources/DailyBrief/Services/AIService.swift
    - Sources/DailyBrief/Services/WorkOrderPrioritizer.swift
    - Sources/JarvisCore/Services/AIServiceProtocols.swift

key-decisions:
  - "Restored orphaned AI service types (TriageResult, ImageMediaType, error enums) to AIServiceProtocols.swift — they were lost when plan 46-02 deleted the local service files"

patterns-established:
  - "API-only CLI: all data and AI services route through VigilAPIClient"

# Metrics
duration: 5min
completed: 2026-04-05
---

# Plan 04: Migrate CLI to API-Only Summary

**CLI uses Vigil Core API for all thought data, AI affirmation, insights, and therapy features — zero local-only code paths remain**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05
- **Completed:** 2026-04-05
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Migrated DailyBrief.swift to use VigilAPIClient, APIThoughtStore, APIInsightService, APITherapyPatternService, APITherapyPrepService for all data
- Deleted ClaudeAIProvider actor (local Claude affirmation) and WorkOrderPrioritizer actor (local Claude prioritization)
- Restored 8 orphaned AI service types/enums to AIServiceProtocols.swift that were lost in plan 46-02
- Full project builds cleanly with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate DailyBrief.swift to API-only** - `608f9ed` (refactor)
2. **Task 2: Clean up CLI service files and verify build** - `dd2bd3f` (refactor)

## Files Created/Modified
- `Sources/DailyBrief/DailyBrief.swift` - Replaced all local DB/AI usage with API calls via VigilAPIClient
- `Sources/DailyBrief/Services/AIService.swift` - Deleted ClaudeAIProvider, kept AIProvider protocol + APIAIProvider
- `Sources/DailyBrief/Services/WorkOrderPrioritizer.swift` - Deleted local WorkOrderPrioritizer, kept protocol + APIWorkOrderPrioritizer
- `Sources/JarvisCore/Services/AIServiceProtocols.swift` - Added TriageResult, TriageError, ImageMediaType, ImageDescriptionError, TherapyClassificationResult, TherapyClassificationError, InsightError, TherapyPatternError, TherapyPrepError

## Decisions Made
- Restored orphaned types to AIServiceProtocols.swift rather than creating a separate types file — keeps protocol and type definitions colocated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored orphaned AI service types**
- **Found during:** Task 2 (Build verification)
- **Issue:** Plan 46-02 deleted 6 local service files that contained shared type definitions (TriageResult, ImageMediaType, error enums). These types are still used by AIServiceProtocols.swift and APIAIServices.swift.
- **Fix:** Extracted all 8 type/enum definitions from git history and added them to AIServiceProtocols.swift
- **Files modified:** Sources/JarvisCore/Services/AIServiceProtocols.swift
- **Verification:** `swift build` succeeds with zero errors
- **Committed in:** dd2bd3f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for build success. Types were orphaned by a prior plan's deletion. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All dual code paths removed from the project
- Plan 46-03 (AppDelegate simplification) may still be pending for the Mac app target
- CLI target is fully API-only and builds cleanly

---
*Phase: 46-remove-dual-code-paths*
*Completed: 2026-04-05*
