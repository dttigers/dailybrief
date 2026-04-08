# Phase 25: Bulk Actions & Filtering

**Goal:** Multi-select thoughts with bulk delete/retriage/recategorize, plus source and date search filters.

**Depends on:** Phase 24 (Thought Editing) — complete

## Plans

| Plan | Name | Wave | Depends On | Autonomous |
|------|------|------|------------|------------|
| 25-01 | Multi-Select & Bulk Actions | 1 | — | Yes |
| 25-02 | Source & Date Filters | 2 | 25-01 | Yes |

## Wave Structure

```
Wave 1: 25-01 (Multi-Select & Bulk Actions)
Wave 2: 25-02 (Source & Date Filters)
```

Plans are sequential due to shared files (DashboardView, DashboardViewModel, ThoughtStore).

## What Gets Built

### Plan 01: Multi-Select & Bulk Actions
- Selection mode toggle in toolbar
- Checkbox on each thought row when selection is active
- Bulk action bar: delete, re-triage (AI), re-categorize (manual pick)
- ThoughtStore bulk operations (bulkDelete, bulkUpdateCategory)
- Select all / deselect all, Cmd+A shortcut

### Plan 02: Source & Date Filters
- Source filter in sidebar (All / Text / Voice / Image)
- Date range filter in sidebar (All Time / Today / This Week / This Month)
- ThoughtStore `fetchFiltered` with source/date parameters
- Filters combine with existing category, task status, and FTS5 search

## Key Files Modified

- `Sources/JarvisCore/Storage/ThoughtStore.swift` — bulk ops + filtered queries
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` — selection state, bulk methods, filter state
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` — toolbar toggle, bulk bar, sidebar filter sections
- `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` — selection checkbox

## Execution

```bash
# Plan 01
/gsd:execute-plan .planning/phases/25-bulk-actions-filtering/25-01-PLAN.md

# Plan 02 (after 01 completes)
/gsd:execute-plan .planning/phases/25-bulk-actions-filtering/25-02-PLAN.md

# Or run both sequentially:
/gsd:execute-phase 25
```
