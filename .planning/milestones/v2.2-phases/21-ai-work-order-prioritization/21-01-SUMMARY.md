---
phase: 21-ai-work-order-prioritization
plan: 01
subsystem: ai
tags: [claude-api, work-orders, prioritization, caching]

# Dependency graph
requires:
  - phase: 07-work-orders
    provides: WorkOrder model and email fetching
  - phase: 12-ai-affirmation
    provides: ClaudeAIProvider pattern for Claude API calls
provides:
  - WorkOrderPrioritizer actor for AI-powered urgency ranking
  - AI priority sort order in PDF work order section
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [actor-based AI service with daily cache, hash-based cache invalidation]

key-files:
  created:
    - Sources/DailyBrief/Services/WorkOrderPrioritizer.swift
  modified:
    - Sources/JarvisCore/Models/DailyBriefData.swift
    - Sources/DailyBrief/DailyBrief.swift
    - Sources/DailyBrief/PDF/PageOneRenderer.swift

key-decisions:
  - "Cache keyed by date + hash of case numbers so cache invalidates when work order set changes"
  - "Return nil on failure to preserve existing sort behavior (graceful degradation)"
  - "Status sort still takes precedence (inProgress > open > done); AI priority is secondary within same status"

patterns-established:
  - "AI service with hash-based cache invalidation for set-dependent results"

# Metrics
duration: 2min
completed: 2026-04-04
---

# Phase 21: AI Work Order Prioritization Summary

**Claude-powered work order urgency ranking with daily caching and graceful fallback to status-only sort**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-04T16:14:47Z
- **Completed:** 2026-04-04T16:17:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- WorkOrderPrioritizer actor that calls Claude to rank work orders by urgency (safety, business impact, time-sensitivity)
- Daily caching with hash-based invalidation so re-runs within the same day with same work orders skip the API call
- PDF sort order enhanced: inProgress first, then open (AI-ranked within group), then done
- Graceful fallback: if AI prioritization fails or returns nil, existing sort behavior is unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WorkOrderPrioritizer service** - `9121f61` (feat)
2. **Task 2: Integrate prioritizer into generate command and PDF rendering** - `26dfc9a` (feat)

## Files Created/Modified
- `Sources/DailyBrief/Services/WorkOrderPrioritizer.swift` - Actor that calls Claude API to rank work orders by urgency, with daily file cache
- `Sources/JarvisCore/Models/DailyBriefData.swift` - Added `workOrderPriorityOrder: [String]?` field
- `Sources/DailyBrief/DailyBrief.swift` - Instantiates prioritizer, filters open WOs, passes result to DailyBriefData
- `Sources/DailyBrief/PDF/PageOneRenderer.swift` - Enhanced sort to use AI priority within same-status groups

## Decisions Made
- Cache key uses djb2 hash of sorted case numbers for deterministic invalidation
- AI prioritization runs only on non-done work orders (no point ranking completed ones)
- Kept existing status-based primary sort; AI priority is tie-breaker within same status group

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Uses existing Claude API key from config.

## Next Phase Readiness
- AI prioritization ready for use on next generate run
- Cache directory created automatically on first use

---
*Phase: 21-ai-work-order-prioritization*
*Completed: 2026-04-04*
