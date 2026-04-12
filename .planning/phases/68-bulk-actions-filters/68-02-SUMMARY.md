---
phase: 68-bulk-actions-filters
plan: "02"
subsystem: vigil-pwa
tags: [filters, favorites, ui, thoughts]
dependency_graph:
  requires: ["68-01"]
  provides: ["source-filter", "date-range-filter", "favorites-toggle", "favorites-filter"]
  affects: ["vigil-pwa/src/pages/ThoughtsPage.tsx", "vigil-pwa/src/components/ThoughtList.tsx"]
tech_stack:
  added: []
  patterns: ["controlled filter state with JSON.stringify dep key", "optional callback prop for favorite toggle"]
key_files:
  created:
    - vigil-pwa/src/components/FilterBar.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/hooks/useThoughts.ts
    - vigil-pwa/src/components/ThoughtRow.tsx
    - vigil-pwa/src/components/ThoughtList.tsx
    - vigil-pwa/src/pages/ThoughtsPage.tsx
decisions:
  - "Use JSON.stringify(filters) as single useEffect dependency to avoid object reference churn"
  - "onToggleFavorite is optional on ThoughtRow/ThoughtList — callers without favorite support unaffected"
  - "FilterBar hidden by default; active-filter dot on Filters button signals state without cluttering the toolbar"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  files_changed: 6
---

# Phase 68 Plan 02: Source/Date/Favorites Filters Summary

Adds source type filter, date range filter, and per-thought favorites toggle/filter to the thoughts dashboard. Users can now slice thought history by input modality, time window, and importance without leaving the page.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend API client and useThoughts hook | 6d0c1cb | client.ts, useThoughts.ts |
| 2 | FilterBar, heart toggle, ThoughtsPage wiring | c28999b | FilterBar.tsx, ThoughtRow.tsx, ThoughtList.tsx, ThoughtsPage.tsx |

## What Was Built

**FilterBar component** (`vigil-pwa/src/components/FilterBar.tsx`): A collapsible horizontal row with a source dropdown (All/Text/Voice/Image), From/To date pickers that convert YYYY-MM-DD values to ISO start/end-of-day strings, a heart toggle for favorites-only mode, and a Clear button that appears when any filter is active.

**Favorite heart toggle on ThoughtRow**: An optional `onToggleFavorite` callback prop. When provided, a heart icon (♥/♡) appears in the top-right of each row. Filled red when `isFavorited` is true, slate/hover-red when false. Clicking calls the callback immediately — the parent handles the API call and local state update.

**ThoughtsPage wiring**: Four filter state variables (`sourceFilter`, `dateAfter`, `dateBefore`, `favoritesOnly`) compose into a `ThoughtFilters` object passed as the third arg to `useThoughts`. A "Filters" pill button toggles FilterBar visibility; an active-filter dot on the button signals when filters are set while the bar is hidden. Selection is cleared whenever any filter changes.

**API layer**: `getThoughts` in `client.ts` now appends `source`, `after`, `before`, and `favoritesOnly=true` query params when set. `useThoughts` accepts a `ThoughtFilters` optional third param and uses `JSON.stringify(filters)` as a stable `useEffect` dependency to avoid unnecessary refetches on object identity changes.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all filter state flows to API calls and heart toggle persists to server via existing `updateThought` PUT endpoint.

## Threat Flags

No new network endpoints or auth paths introduced. All filter params are query string additions to the existing GET /v1/thoughts endpoint; server-side validation (VALID_SOURCES enum, ISO 8601 date check) was already in place per T-68-03 and T-68-04.

## Self-Check: PASSED

- `vigil-pwa/src/components/FilterBar.tsx` — FOUND
- `vigil-pwa/src/api/client.ts` — FOUND (modified)
- `vigil-pwa/src/hooks/useThoughts.ts` — FOUND (modified)
- `vigil-pwa/src/components/ThoughtRow.tsx` — FOUND (modified)
- `vigil-pwa/src/components/ThoughtList.tsx` — FOUND (modified)
- `vigil-pwa/src/pages/ThoughtsPage.tsx` — FOUND (modified)
- Commit 6d0c1cb — FOUND
- Commit c28999b — FOUND
- Vite build: clean (258 kB bundle, 0 errors)
