---
phase: 66-work-orders-dashboard
plan: "02"
subsystem: vigil-pwa
tags: [work-orders, pwa, react, typescript, routing]
dependency_graph:
  requires: [66-01]
  provides: [work-orders-pwa-ui]
  affects: [vigil-pwa]
tech_stack:
  added: []
  patterns: [react-router nested routes, optimistic UI updates, AI priority sorting with fallback]
key_files:
  created:
    - vigil-pwa/src/hooks/useWorkOrders.ts
    - vigil-pwa/src/components/WorkOrderRow.tsx
    - vigil-pwa/src/pages/WorkOrdersPage.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/App.tsx
decisions:
  - "Nested Routes inside Layout for work-orders route to keep Layout stateful (tab highlight depends on useLocation)"
  - "Re-sort on optimistic update: done items sink to bottom immediately without a full re-fetch"
  - "prioritizeWorkOrders failure is caught silently; page renders with original order rather than blocking"
metrics:
  duration: ~20m
  completed: 2026-04-12T20:29:15Z
  tasks_completed: 2
  files_changed: 6
---

# Phase 66 Plan 02: Work Orders PWA UI Summary

Work orders list page with AI priority ranking and interactive status cycling, plus Thoughts/Work Orders tab navigation — all in the PWA, all TypeScript-clean.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | API client functions and useWorkOrders hook | e5ce8be | client.ts, useWorkOrders.ts |
| 2 | WorkOrderRow, WorkOrdersPage, tab navigation | 1f50cd8 | WorkOrderRow.tsx, WorkOrdersPage.tsx, Layout.tsx, App.tsx |

## What Was Built

### API Client (`vigil-pwa/src/api/client.ts`)
- `WorkOrderApiResponse` interface matching GET /v1/work-orders response shape
- `getWorkOrders()` — fetches all work orders
- `updateWorkOrderStatus(caseNumber, status)` — PUT /v1/work-orders/:caseNumber/status
- `prioritizeWorkOrders(workOrders)` — POST /v1/prioritize for AI ranking

### useWorkOrders Hook (`vigil-pwa/src/hooks/useWorkOrders.ts`)
- Fetches work orders then calls prioritize for non-done items
- Sorts: prioritized non-done (by rank) → unprioritized non-done → done
- Attaches `priorityRank` (1-based) to each sorted work order
- `updateLocalStatus` for optimistic status updates that re-sort done items to bottom
- Graceful fallback if prioritize call fails (displays in original order)

### WorkOrderRow (`vigil-pwa/src/components/WorkOrderRow.tsx`)
- Priority rank badge (#1, #2...) in indigo for non-done prioritized items
- Case number, state label, short description, store/trade/location metadata
- Status cycle button: open (yellow) → inProgress (blue) → done (green)
- Done items rendered at opacity-50

### WorkOrdersPage (`vigil-pwa/src/pages/WorkOrdersPage.tsx`)
- Loading spinner, error state, empty state with CLI prompt
- Count header: "N work orders (M open, K done)"
- List of WorkOrderRow components with optimistic status updates persisted via API

### Layout + App Routing
- Tab bar below top nav: Thoughts (/) and Work Orders (/work-orders) with indigo active indicator
- App.tsx uses nested Routes inside Layout so useLocation works for tab highlighting
- /work-orders renders WorkOrdersPage; / renders DashboardPage (ThoughtsPage)

## Verification

- `npm run build` passes: 38 modules, 248.71 kB JS bundle
- All acceptance criteria met

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — WorkOrdersPage is fully wired to real API endpoints from Phase 66-01.

## Threat Flags

No new threat surface introduced. All requests use existing Bearer auth via `vigilFetch`. Status value validation is server-side per T-66-05.

## Self-Check: PASSED

- vigil-pwa/src/hooks/useWorkOrders.ts — FOUND
- vigil-pwa/src/components/WorkOrderRow.tsx — FOUND
- vigil-pwa/src/pages/WorkOrdersPage.tsx — FOUND
- vigil-pwa/src/components/Layout.tsx — FOUND (modified)
- vigil-pwa/src/App.tsx — FOUND (modified)
- vigil-pwa/src/api/client.ts — FOUND (modified)
- Commit e5ce8be — FOUND
- Commit 1f50cd8 — FOUND
- npm run build — PASSED
