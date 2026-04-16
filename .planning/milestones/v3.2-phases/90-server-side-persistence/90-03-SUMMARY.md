---
phase: 90-server-side-persistence
plan: 03
subsystem: ui
tags: [react, tailwind, cache-ui, relative-time, pwa, typescript]

# Dependency graph
requires:
  - phase: 90-server-side-persistence plan 02
    provides: Cache-first useInsights/useTherapy hooks with isCached, generatedAt, regenerate callbacks
provides:
  - formatRelativeTime utility for relative timestamp display
  - InsightsPage with Regenerate button + timestamp when cached
  - TherapyPage with Regenerate button + timestamp for both Patterns and Prep sections
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [conditional-header-action-by-cache-state, inline-relative-time-formatter]

key-files:
  created:
    - vigil-pwa/src/utils/formatRelativeTime.ts
  modified:
    - vigil-pwa/src/pages/InsightsPage.tsx
    - vigil-pwa/src/pages/TherapyPage.tsx

key-decisions:
  - "Regenerate button uses gray-900/80 (not teal) per UI-SPEC to visually subordinate it to primary Generate action"

patterns-established:
  - "Conditional header action: isCached && generatedAt && !isLoading ternary to swap Regenerate vs Generate button"
  - "formatRelativeTime inline utility: no external deps, returns just now / Nm ago / Nh ago / Nd ago"

requirements-completed: [PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04]

# Metrics
duration: 2min
completed: 2026-04-16
---

# Phase 90 Plan 03: Cache-Aware UI with Regenerate + Timestamp Summary

**InsightsPage and TherapyPage show gray Regenerate button + relative timestamp when cached, teal Generate button on first visit**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-16T14:33:41Z
- **Completed:** 2026-04-16T14:35:13Z
- **Tasks:** 1 of 2 (Task 2 is human-verify checkpoint)
- **Files modified:** 3

## Accomplishments
- Created formatRelativeTime utility returning "just now", "Nm ago", "Nh ago", "Nd ago" from ISO timestamps
- Updated InsightsPage to show Regenerate + timestamp when cached, Generate Insights when not cached
- Updated TherapyPage to show Regenerate + timestamp for both Therapy Patterns and Session Prep sections
- All styling matches UI-SPEC: gray-900/80 Regenerate button, teal Generate button, text-xs text-gray-400 timestamp

## Task Commits

Each task was committed atomically:

1. **Task 1: Create formatRelativeTime utility and update InsightsPage + TherapyPage** - `eaf561c` (feat)

**Task 2: Verify all four PERSIST requirements end-to-end** - checkpoint:human-verify (pending user verification)

## Files Created/Modified
- `vigil-pwa/src/utils/formatRelativeTime.ts` - Relative timestamp formatter (just now, Nm ago, Nh ago, Nd ago)
- `vigil-pwa/src/pages/InsightsPage.tsx` - Added formatRelativeTime import, destructured isCached/generatedAt/regenerate, conditional Regenerate vs Generate header
- `vigil-pwa/src/pages/TherapyPage.tsx` - Added formatRelativeTime import, destructured all cache/regenerate fields, conditional headers for both Patterns and Prep sections

## Decisions Made
- Regenerate button uses gray-900/80 (not teal) per UI-SPEC to visually subordinate it to primary Generate action

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TS6305 stale .d.ts warnings in vigil-pwa (out of scope, same as Plan 02); no real type errors from changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Task 2 (human-verify checkpoint) pending: user needs to verify all four PERSIST requirements end-to-end in browser
- All UI code is in place; verification requires running vigil-core + vigil-pwa locally

## Self-Check: PASSED
