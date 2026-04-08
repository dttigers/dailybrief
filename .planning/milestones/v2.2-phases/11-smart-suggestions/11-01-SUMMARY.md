---
phase: 11-smart-suggestions
plan: 01
subsystem: ai, api
tags: [claude-api, actor, insights, codable]

# Dependency graph
requires:
  - phase: 03-ai-triage
    provides: TriageService actor pattern, Claude API HTTP call structure
  - phase: 01-foundation
    provides: Thought model, ThoughtStore, AppConfig pattern
provides:
  - Insight model (InsightType enum + Insight struct)
  - InsightService actor (Claude API insight generation)
  - InsightError enum
  - InsightsConfig in AppConfig (backward-compatible)
affects: [11-smart-suggestions, 06-evolved-daily-brief]

# Tech tracking
tech-stack:
  added: []
  patterns: [actor-based AI service, backward-compatible config decoding]

key-files:
  created:
    - Sources/JarvisCore/Models/Insight.swift
    - Sources/JarvisCore/Services/InsightService.swift
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift

key-decisions:
  - "Used JSONDecoder for insight parsing instead of manual JSONSerialization — cleaner with Codable model"
  - "Snake_case CodingKeys on Insight to match Claude API JSON format (related_thought_ids)"

patterns-established:
  - "InsightService follows same actor + Claude API pattern as TriageService"
  - "InsightsConfig uses decodeIfPresent fallback for backward compatibility"

# Metrics
duration: 4min
completed: 2026-04-03
---

# Plan 11-01: Insight Model and InsightService Summary

**Insight model and InsightService actor for Claude-powered thought analysis with backward-compatible config**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created InsightType enum (pattern, connection, actionPrompt, trend) and Insight struct with Codable/Sendable conformance
- Built InsightService actor following TriageService pattern with Claude API integration, confidence filtering, and minimum-thought guard
- Added InsightsConfig to AppConfig with backward-compatible decoding

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Insight model and InsightService actor** - `4ed8c44` (feat)
2. **Task 2: Add insights config and export from JarvisCore** - `4d822a2` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Models/Insight.swift` - InsightType enum and Insight struct
- `Sources/JarvisCore/Services/InsightService.swift` - InsightError enum and InsightService actor
- `Sources/JarvisCore/Config/AppConfig.swift` - Added InsightsConfig struct and insights property

## Decisions Made
- Used JSONDecoder for parsing Claude's insight response instead of manual JSONSerialization (cleaner with Codable model)
- Added snake_case CodingKeys on Insight to match the JSON format requested from Claude (related_thought_ids)

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- InsightService is ready to be called from daily brief and dashboard
- InsightsConfig allows enabling/disabling and configuring lookback window
- All types are public and accessible via `import JarvisCore`

---
*Plan: 11-01*
*Completed: 2026-04-03*
