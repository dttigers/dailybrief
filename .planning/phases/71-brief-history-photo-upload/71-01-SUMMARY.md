---
phase: 71-brief-history-photo-upload
plan: "01"
subsystem: vigil-pwa
tags: [brief-history, pwa, react, typescript]
dependency_graph:
  requires: []
  provides: [brief-history-ui, brief-api-client, useBriefs-hook]
  affects: [vigil-pwa/src/api/client.ts, vigil-pwa/src/App.tsx, vigil-pwa/src/components/Layout.tsx]
tech_stack:
  added: []
  patterns: [useState+useEffect hook, list/detail navigation pattern, vigilFetch API wrapper]
key_files:
  created:
    - vigil-pwa/src/hooks/useBriefs.ts
    - vigil-pwa/src/pages/BriefHistoryPage.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/App.tsx
decisions:
  - "Summary rendered as plain text if string, else JSON.stringify in pre/code block — handles both structured and flat brief formats"
  - "History tab inserted after Therapy in TABS array to maintain logical grouping"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  files_modified: 5
---

# Phase 71 Plan 01: Brief History Browsing Summary

Brief history browsing added to the Vigil PWA — `BriefApiResponse` types, `getBriefs`/`getBriefByDate` API functions, `useBriefs` hook, and `BriefHistoryPage` with list/detail navigation, History nav tab, and `/history` route.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Brief API functions and useBriefs hook | cd4dc09 | vigil-pwa/src/api/client.ts, vigil-pwa/src/hooks/useBriefs.ts |
| 2 | BriefHistoryPage with list/detail view and nav wiring | 73d1c7c | vigil-pwa/src/pages/BriefHistoryPage.tsx, vigil-pwa/src/components/Layout.tsx, vigil-pwa/src/App.tsx |

## What Was Built

**API layer (client.ts):**
- `BriefApiResponse` interface matching the vigil-core backend shape
- `BriefsListResponse` interface for paginated list response
- `getBriefs(params?)` — GET /v1/briefs with limit/offset query params, default limit 50
- `getBriefByDate(date)` — GET /v1/briefs/:date, throws on non-ok

**Hook (useBriefs.ts):**
- `useBriefs()` — mounts, calls `getBriefs({ limit: 50 })`, returns `{ briefs, loading, error }`
- Cancellation-safe via `cancelled` flag in useEffect cleanup

**Page (BriefHistoryPage.tsx):**
- List view: brief cards showing formatted date ("April 10, 2026"), thoughtCount, taskCount
- Detail view: fetches `getBriefByDate` on click, renders summary as text or JSON pre-block
- Back button returns to list
- Loading skeleton states in both list and detail views
- Empty state: "No briefs found."
- Dark theme matching existing Tailwind slate-950/slate-800/indigo palette

**Navigation:**
- History tab added to Layout TABS array after Therapy
- `/history` route registered in App.tsx authenticated Routes block

## Decisions Made

1. **Summary rendering:** `typeof summary === 'string'` renders as plain text with `whitespace-pre-wrap`; otherwise `JSON.stringify(summary, null, 2)` in a `<pre>` block. This handles both plain-text and structured brief formats without crashing.
2. **Tab placement:** History inserted after Therapy — keeps chronological/reflective tabs together, separates from action-oriented tabs (Work Orders, Projects).

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run build` passes: 52 modules transformed, 0 errors
- History tab present in TABS array in Layout.tsx
- `/history` route registered in App.tsx pointing to BriefHistoryPage

## Self-Check: PASSED

- vigil-pwa/src/hooks/useBriefs.ts: FOUND
- vigil-pwa/src/pages/BriefHistoryPage.tsx: FOUND
- vigil-pwa/src/api/client.ts (modified): FOUND
- vigil-pwa/src/components/Layout.tsx (modified): FOUND
- vigil-pwa/src/App.tsx (modified): FOUND
- Commit cd4dc09: FOUND
- Commit 73d1c7c: FOUND
