---
phase: 90-server-side-persistence
plan: 02
subsystem: ui
tags: [react, hooks, cache-first, pwa, typescript]

# Dependency graph
requires:
  - phase: 90-server-side-persistence plan 01
    provides: GET /insights/cache, GET /therapy/cache endpoints with cached + generatedAt metadata
provides:
  - getInsightsCache, getTherapyPatternsCache, getTherapyPrepCache API client functions
  - Cache-first useInsights hook with isCached, generatedAt, regenerate
  - Cache-first useTherapy hook with isCachedPatterns, isCachedPrep, regeneratePatterns, regeneratePrep
  - Auto-resume useChat hook loading most recent session on mount
affects: [90-server-side-persistence plan 03, pwa-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [cache-first-with-fallback, clear-before-regenerate, auto-resume-session]

key-files:
  created: []
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/hooks/useInsights.ts
    - vigil-pwa/src/hooks/useTherapy.ts
    - vigil-pwa/src/hooks/useChat.ts

key-decisions:
  - "useInsights auto-generates on mount when no cache exists (preserves first-visit behavior)"
  - "useTherapy does NOT auto-generate on mount when no cache — user clicks Analyze/Generate buttons"
  - "useChat loadSession dependency is stable useCallback with empty deps, safe in effect"

patterns-established:
  - "Cache-first pattern: useEffect checks GET /cache on mount, falls back to POST /generate if 404"
  - "Clear-before-regenerate (D-05): regenerate clears state before request so loading spinner shows"
  - "Auto-resume (D-09): most recent session loaded via sessions[0] since server sorts desc(updatedAt)"

requirements-completed: [PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04]

# Metrics
duration: 2min
completed: 2026-04-16
---

# Phase 90 Plan 02: PWA Cache-First Hooks Summary

**Cache-first useInsights/useTherapy hooks with regenerate callbacks, auto-resume useChat, and cache API client functions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-16T14:29:49Z
- **Completed:** 2026-04-16T14:31:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added getInsightsCache, getTherapyPatternsCache, getTherapyPrepCache API client functions returning null on 404
- Updated generateInsights, getTherapyPatterns, generateTherapyPrep return types to include cached + generatedAt metadata
- Rewrote useInsights with cache-first mount, isCached/generatedAt state, and regenerate that clears before re-fetching (D-05)
- Rewrote useTherapy with cache-first mount for both patterns and prep, plus regeneratePatterns/regeneratePrep
- Added auto-resume to useChat: loads most recent session on mount when sessions exist (D-09)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cache API functions and update existing API response types** - `af7b2c6` (feat)
2. **Task 2: Rewrite useInsights, useTherapy, useChat hooks for cache-first + auto-resume** - `8d4ff41` (feat)

## Files Created/Modified
- `vigil-pwa/src/api/client.ts` - Added cache fetch functions and updated generate return types with cached/generatedAt
- `vigil-pwa/src/hooks/useInsights.ts` - Full rewrite: cache-first on mount, isCached, generatedAt, regenerate
- `vigil-pwa/src/hooks/useTherapy.ts` - Full rewrite: cache-first for patterns + prep, regeneratePatterns, regeneratePrep
- `vigil-pwa/src/hooks/useChat.ts` - Auto-resume most recent session on mount (D-09)

## Decisions Made
- useInsights auto-generates on mount when no cache exists (preserves current first-visit UX)
- useTherapy does NOT auto-generate when no cache — therapy analysis is intentional user action
- loadSession is a stable useCallback (empty deps), safe as useEffect dependency for auto-resume

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TS6305 stale .d.ts warnings in vigil-pwa (out of scope); no real type errors from changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All hooks expose cache metadata and regenerate callbacks; Plan 03 UI work can wire these into page components
- Pages currently destructure a subset of hook return values; new fields are additive and backward-compatible

## Self-Check: PASSED

All 4 files verified present. Both commit hashes (af7b2c6, 8d4ff41) found in git log.

---
*Phase: 90-server-side-persistence*
*Completed: 2026-04-16*
