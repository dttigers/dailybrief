---
phase: 89-7-day-analysis-scope
plan: "01"
subsystem: vigil-core/routes
tags: [analysis, insights, therapy, db-query, date-window, server-side]
dependency_graph:
  requires:
    - "Phase 88: getRollingDayWindow utility in vigil-core/src/utils/date-window.ts"
  provides:
    - "POST /insights queries DB for last 7 days of thoughts server-side"
    - "POST /therapy/patterns queries DB for therapy-classified thoughts in 7-day window"
    - "POST /therapy/prep queries DB for bringToTherapist thoughts in 7-day window"
  affects:
    - "vigil-pwa: InsightsTab, TherapyTab — no longer need to send thoughts in request body"
tech_stack:
  added: []
  patterns:
    - "getRollingDayWindow(tz, 7) for consistent 7-day window across all analysis endpoints"
    - "appSettings timezone lookup (same pattern as thoughts.ts)"
    - "Drizzle ne/gte/lt/isNotNull/eq conditions with .limit(200) cap"
    - "Structured 400 with count field for insufficient-data responses"
key_files:
  created: []
  modified:
    - vigil-core/src/routes/insights.ts
    - vigil-core/src/routes/therapy.ts
decisions:
  - "patternSection dropped from /therapy/prep in this phase; Phase 90 persistence will restore richer server-side context"
  - "Threshold for insights = 3, patterns = 5, prep = 1 — matches prior client-side guards"
  - "isNotNull(therapyClassification) used for patterns (any therapy thought); eq('bringToTherapist') used for prep (specific classification)"
metrics:
  duration: "~2.5 minutes"
  completed: "2026-04-16"
  tasks_completed: 2
  files_modified: 2
---

# Phase 89 Plan 01: 7-Day Analysis Scope — Server-Side DB Query Summary

Server-side 7-day scoped analysis for all three AI endpoints: POST /insights, POST /therapy/patterns, and POST /therapy/prep now query the DB directly using getRollingDayWindow(tz, 7) instead of accepting client-sent thoughts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor POST /insights to server-side 7-day query | 423463a | vigil-core/src/routes/insights.ts |
| 2 | Refactor POST /therapy/patterns and POST /therapy/prep to server-side 7-day query | fa3eae3 | vigil-core/src/routes/therapy.ts |

## What Was Built

### POST /insights (insights.ts)
- Removed `ThoughtInput` interface and client body parsing block
- Added `db`, `thoughtsTable`, `appSettings`, Drizzle operators, and `getRollingDayWindow` imports
- Queries thoughts with `ne(syncStatus, "pendingDeletion")`, `gte(createdAt, start)`, `lt(createdAt, end)`, ordered by `createdAt` desc, limit 200
- Returns 400 with `{ error, count }` when fewer than 3 thoughts in window
- Prompt updated to literal `"from the last 7 days"` — no more dynamic `${days}`

### POST /therapy/patterns (therapy.ts)
- Removed `PatternThought` interface and client body parsing
- Same timezone + window query pattern, adds `isNotNull(thoughtsTable.therapyClassification)` filter
- Returns 400 with count when fewer than 5 therapy-classified thoughts in window
- Prompt updated to literal `"from the last 7 days"`

### POST /therapy/prep (therapy.ts)
- Removed `PrepThought` and `PrepPattern` interfaces, client body parsing
- Same timezone + window query, adds `eq(thoughtsTable.therapyClassification, "bringToTherapist")` filter
- Returns 400 when 0 bringToTherapist thoughts in window
- `patternSection` dropped (set to `""`) — client no longer sends patterns; Phase 90 will restore via server-side persistence

### POST /therapy/classify
- Left completely unchanged — operates on a single thought, not a window

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All three endpoints query live DB data. The empty `patternSection = ""` in /therapy/prep is intentional and documented — Phase 90 will restore server-side pattern context.

## Threat Surface Scan

No new threat surface introduced beyond what the plan's threat model covered:
- T-89-01 (Tampering): mitigated — server ignores client body, queries DB directly
- T-89-03 (DoS): mitigated — all three queries include `.limit(200)`
- T-89-04 (Spoofing): accepted — timezone from server-side appSettings table

## Self-Check: PASSED

Files exist:
- vigil-core/src/routes/insights.ts — FOUND
- vigil-core/src/routes/therapy.ts — FOUND

Commits exist:
- 423463a feat(89-01): refactor POST /insights — FOUND
- fa3eae3 feat(89-01): refactor POST /therapy/patterns and /therapy/prep — FOUND

TypeScript: `npx tsc --noEmit` exits 0 — PASSED
