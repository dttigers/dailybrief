---
phase: 27-therapy-prep-patterns
plan: 01
subsystem: api
tags: [swift, claude-api, therapy, ai-services, actor]

# Dependency graph
requires:
  - phase: 26-therapy-intelligence
    provides: TherapyClassificationService pattern, TherapyClassification enum, therapy ThoughtStore queries
provides:
  - TherapyPattern model for recurring theme detection
  - TherapyPrep and TherapyPrepItem models for session prep
  - TherapyPatternService actor for AI pattern detection
  - TherapyPrepService actor for AI session prep generation
  - ThoughtStore date-range therapy query methods
affects: [27-therapy-prep-patterns (plan 02+), therapy-pdf, therapy-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [actor-based AI service with Claude API, date-range ThoughtStore queries]

key-files:
  created:
    - Sources/JarvisCore/Models/TherapyPattern.swift
    - Sources/JarvisCore/Models/TherapyPrep.swift
    - Sources/JarvisCore/Services/TherapyPatternService.swift
    - Sources/JarvisCore/Services/TherapyPrepService.swift
  modified:
    - Sources/JarvisCore/Storage/ThoughtStore.swift

key-decisions:
  - "Minimum 5 thoughts for pattern detection, 1 thought for prep generation"
  - "0.5 confidence threshold for pattern filtering (matching InsightService)"
  - "Both services use max_tokens 1024 for detailed responses"

patterns-established:
  - "Therapy AI services use safety-first prompts disclaiming clinical advice"
  - "Date-range queries on ThoughtStore return results ordered by createdAt desc"

# Metrics
duration: 3min
completed: 2026-04-04
---

# Phase 27-01: Therapy Prep Patterns Summary

**TherapyPatternService and TherapyPrepService actors with supporting models and ThoughtStore date-range queries**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-04T20:42:38Z
- **Completed:** 2026-04-04T20:45:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- TherapyPattern and TherapyPrep/TherapyPrepItem models with snake_case CodingKeys for Claude API JSON parsing
- TherapyPatternService actor detecting recurring emotional themes across therapy thoughts (min 5 thoughts, confidence >= 0.5)
- TherapyPrepService actor generating structured session prep from bringToTherapist thoughts with optional pattern context
- ThoughtStore gains fetchTherapyThoughtsByDateRange and fetchRecentTherapyThoughts convenience methods

## Task Commits

Each task was committed atomically:

1. **Task 1: Create therapy models and ThoughtStore date-range queries** - `dd6db7e` (feat)
2. **Task 2: Create TherapyPatternService and TherapyPrepService actors** - `edf8a20` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Models/TherapyPattern.swift` - Recurring therapy pattern model with theme, frequency, trend, confidence
- `Sources/JarvisCore/Models/TherapyPrep.swift` - Session prep models (TherapyPrepItem + TherapyPrep) with urgency and focus
- `Sources/JarvisCore/Services/TherapyPatternService.swift` - Actor detecting recurring patterns via Claude API
- `Sources/JarvisCore/Services/TherapyPrepService.swift` - Actor generating session prep via Claude API
- `Sources/JarvisCore/Storage/ThoughtStore.swift` - Added date-range therapy query methods

## Decisions Made
- Minimum 5 thoughts for pattern detection (returns empty below threshold), 1 thought minimum for prep
- Both services follow InsightService double-parse pattern (outer Claude response -> inner JSON)
- Safety-first prompt design: "pattern detection tool, NOT a therapist" and "organizing thoughts, NOT providing therapy"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both services ready for integration into PDF generation and dashboard UI
- ThoughtStore date-range queries available for any time-bounded therapy analysis

---
*Phase: 27-therapy-prep-patterns*
*Completed: 2026-04-04*
