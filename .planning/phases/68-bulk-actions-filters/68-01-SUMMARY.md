---
phase: 68-bulk-actions-filters
plan: 01
subsystem: vigil-pwa
tags: [bulk-actions, multi-select, thoughts, pwa]
dependency_graph:
  requires: [67-01]
  provides: [BULK-01]
  affects: [vigil-pwa/src/pages/ThoughtsPage.tsx, vigil-pwa/src/components/ThoughtList.tsx, vigil-pwa/src/components/ThoughtRow.tsx]
tech_stack:
  added: []
  patterns: [optimistic-ui, set-based-selection, floating-action-bar]
key_files:
  created:
    - vigil-pwa/src/components/BulkActionBar.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/components/ThoughtRow.tsx
    - vigil-pwa/src/components/ThoughtList.tsx
    - vigil-pwa/src/hooks/useThoughts.ts
    - vigil-pwa/src/pages/ThoughtsPage.tsx
decisions:
  - "Selection state held as Set<number> in ThoughtsPage for O(1) has() checks"
  - "Select mode toggle (Cancel/Select button) keeps checkboxes hidden by default to avoid cluttering the list"
  - "window.confirm used for delete confirmation per plan threat model T-68-02"
  - "Optimistic removeMany/updateMany in useThoughts hook — no refetch needed after bulk ops"
metrics:
  duration: ~20min
  completed: 2026-04-12
  tasks_completed: 2
  files_changed: 6
---

# Phase 68 Plan 01: Bulk Actions — Thoughts Multi-Select Summary

Multi-select mode with bulk delete and recategorize wired end-to-end: checkboxes on each thought row, select-all toggle, floating BulkActionBar with delete confirmation and category dropdown, optimistic UI updates via new `removeMany`/`updateMany` hook callbacks.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add bulk API client functions and selection props to ThoughtRow/ThoughtList | 34a94f4 | client.ts, ThoughtRow.tsx, ThoughtList.tsx |
| 2 | BulkActionBar, multi-select mode, and bulk delete/recategorize in ThoughtsPage | 1e03671 | BulkActionBar.tsx (new), ThoughtsPage.tsx, useThoughts.ts |

## What Was Built

**`bulkDeleteThoughts` / `bulkRecategorizeThoughts`** — two new exported functions in `api/client.ts` that POST to the existing backend endpoints `/v1/thoughts/bulk/delete` and `/v1/thoughts/bulk/recategorize`.

**Selection props on ThoughtRow** — `isSelectable`, `isSelected`, `onToggleSelect` added. When `isSelectable` is true a checkbox renders before the category badge, and selected rows get an indigo left border.

**ThoughtList forwarding** — `selectedIds`, `onToggleSelect`, `isSelectable` flow through ThoughtList to each ThoughtRow.

**`removeMany` / `updateMany` in useThoughts** — two new optimistic callbacks. `removeMany(ids: Set<number>)` filters out deleted thoughts and decrements total. `updateMany(ids, patch)` applies a partial patch to all matching thoughts.

**BulkActionBar** — fixed-position floating bar (above nav, `bottom-20`) that renders only when `selectedCount > 0`. Contains: selection count label, Delete button (with `window.confirm`), Recategorize dropdown (5 categories), and a clear (×) button. Buttons disabled with `...` suffix while `isProcessing`.

**ThoughtsPage multi-select wiring** — `Select` / `Cancel` toggle button beside SearchBar; select-all checkbox in header row when select mode active; `handleToggleSelect` builds immutable new Sets; `useEffect` clears selection on `activeCategory` or `debouncedQuery` change.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all selection and bulk operation paths are fully wired.

## Threat Flags

None — both trust boundaries in the plan's threat model are satisfied. `window.confirm` provides the T-68-02 DoS mitigation; bearer auth on the API handles T-68-01.

## Self-Check

Files created/modified:

- FOUND: vigil-pwa/src/components/BulkActionBar.tsx
- FOUND: vigil-pwa/src/api/client.ts
- FOUND: vigil-pwa/src/components/ThoughtRow.tsx
- FOUND: vigil-pwa/src/components/ThoughtList.tsx
- FOUND: vigil-pwa/src/hooks/useThoughts.ts
- FOUND: vigil-pwa/src/pages/ThoughtsPage.tsx

Commits:
- FOUND: 34a94f4
- FOUND: 1e03671

## Self-Check: PASSED
