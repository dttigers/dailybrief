---
phase: 35-mac-migration-ai
plan: 01
subsystem: ai
tags: [swift, protocols, vigil-api, actor-concurrency]

# Dependency graph
requires:
  - phase: 34-mac-migration-first
    provides: ThoughtRepository protocol pattern, VigilAPIClient, APIThoughtStore
  - phase: 31-vigil-core-ai
    provides: Vigil Core AI endpoints (triage, insights, describe-image, therapy)
provides:
  - 6 AI service protocols (TriageProviding, InsightProviding, ImageDescriptionProviding, TherapyClassifyProviding, TherapyPatternProviding, TherapyPrepProviding)
  - 6 API-backed implementations using VigilAPIClient
  - Protocol conformance on all 6 existing Claude-direct services
affects: [35-mac-migration-ai]

# Tech tracking
tech-stack:
  added: []
  patterns: [AI service protocol abstraction with Actor conformance, VigilAPIClient-based API services with private Codable DTOs]

key-files:
  created:
    - Sources/JarvisCore/Services/AIServiceProtocols.swift
    - Sources/JarvisCore/Services/APIAIServices.swift
  modified:
    - Sources/JarvisCore/Services/TriageService.swift
    - Sources/JarvisCore/Services/InsightService.swift
    - Sources/JarvisCore/Services/ImageDescriptionService.swift
    - Sources/JarvisCore/Services/TherapyClassificationService.swift
    - Sources/JarvisCore/Services/TherapyPatternService.swift
    - Sources/JarvisCore/Services/TherapyPrepService.swift

key-decisions:
  - "Protocol signatures match existing service methods exactly — existing services are source of truth"
  - "API response DTOs use camelCase (matching Vigil Core output) rather than snake_case CodingKeys used by existing models for direct Claude parsing"
  - "Minimum count guards (3 thoughts for insights, 5 for patterns) replicated in API services to avoid unnecessary API calls"

patterns-established:
  - "AI service protocol pattern: public protocol XProviding: Actor with async throws methods"
  - "API AI service pattern: actor with private Codable DTOs, VigilAPIClient dependency, error translation to service-specific types"

# Metrics
duration: 3min
completed: 2026-04-05
---

# Phase 35 Plan 01: AI Service Protocols Summary

**6 AI service protocol abstractions with Vigil Core API-backed implementations enabling backend-swappable AI services**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-05T00:57:59Z
- **Completed:** 2026-04-05T01:00:31Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Defined 6 protocols (TriageProviding, InsightProviding, ImageDescriptionProviding, TherapyClassifyProviding, TherapyPatternProviding, TherapyPrepProviding) with Actor conformance requirement
- Added protocol conformance extensions to all 6 existing Claude-direct service actors
- Created 6 API-backed actor implementations using VigilAPIClient to call Vigil Core endpoints

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AI service protocols and conform existing services** - `06bd3dc` (feat)
2. **Task 2: Create API-backed AI service implementations** - `7a40800` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Services/AIServiceProtocols.swift` - 6 public protocols requiring Actor conformance
- `Sources/JarvisCore/Services/APIAIServices.swift` - 6 API-backed actor implementations with private DTOs
- `Sources/JarvisCore/Services/TriageService.swift` - Added TriageProviding conformance
- `Sources/JarvisCore/Services/InsightService.swift` - Added InsightProviding conformance
- `Sources/JarvisCore/Services/ImageDescriptionService.swift` - Added ImageDescriptionProviding conformance
- `Sources/JarvisCore/Services/TherapyClassificationService.swift` - Added TherapyClassifyProviding conformance
- `Sources/JarvisCore/Services/TherapyPatternService.swift` - Added TherapyPatternProviding conformance
- `Sources/JarvisCore/Services/TherapyPrepService.swift` - Added TherapyPrepProviding conformance

## Decisions Made
- Protocol signatures match existing service methods exactly (existing services are source of truth)
- API DTOs use camelCase matching Vigil Core output, separate from existing model CodingKeys
- Minimum count guards replicated in API services to match local behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 protocols ready for consumer wiring (ViewModels can accept any XProviding instead of concrete service)
- Config toggle integration (switching between local and API services) is the logical next step
- Build clean with zero warnings

---
*Phase: 35-mac-migration-ai*
*Completed: 2026-04-05*
