---
phase: 65-work-order-status-api
plan: "02"
subsystem: cli
tags: [swift, work-orders, api-migration, completion-store, vigil-api]
dependency_graph:
  requires: ["65-01"]
  provides: ["API-backed work order status reads and writes in DailyBrief CLI"]
  affects: ["Sources/DailyBrief/DailyBrief.swift"]
tech_stack:
  added: []
  patterns: ["AsyncParsableCommand", "API-first with local fallback", "do/catch graceful degradation"]
key_files:
  modified:
    - Sources/DailyBrief/DailyBrief.swift
decisions:
  - "Complete/Uncomplete/ListCompleted all migrated to AsyncParsableCommand in same plan to keep CompletionStore fully deprecated in one pass"
  - "Fallback to CompletionStore preserved in all paths so network error never breaks brief generation"
  - "openWorkOrders filter uses woStatuses map lookup (woStatuses[$0.caseNumber] ?? 'open') instead of direct CompletionStore call"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-04-12T20:04:59Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase 65 Plan 02: Work Order Status API — CLI Migration Summary

**One-liner:** Migrated DailyBrief CLI from local CompletionStore file reads to Vigil Core API for work order status, with CompletionStore fallback on network error.

## What Was Built

`DailyBrief.swift` now reads work order statuses from `GET /v1/work-orders/statuses` (the endpoint created in Plan 01) instead of the local `~/.config/dailybrief/completed_workorders.json` file. Status changes made from any client (PWA, future Android, etc.) now appear in the next generated daily brief PDF.

The three CLI subcommands that previously wrote to the local file now call the API:
- `complete` — PUT `/v1/work-orders/:caseNumber/status`
- `uncomplete` — PUT `/v1/work-orders/:caseNumber/status` with `{ status: "open" }`
- `list-completed` — GET `/v1/work-orders/statuses` filtered for `"done"`

All three are now `AsyncParsableCommand`. All three fall back to CompletionStore if the API is unreachable.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Migrate Generate.run() and CLI subcommands to API | 330cb4c | Sources/DailyBrief/DailyBrief.swift |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The API call is wired to the live endpoint created in Plan 01. CompletionStore remains as the active fallback path.

## Threat Flags

No new network surface introduced beyond what the plan's threat model covers. The fallback pattern (T-65-04 mitigation) is implemented — `do/catch` wraps all API calls in `Generate.run()` and `ListCompleted`.

## Self-Check

- [x] `Sources/DailyBrief/DailyBrief.swift` modified and committed at 330cb4c
- [x] `grep -c "work-orders/statuses"` returns 2 (Generate.run() line 177, ListCompleted line 771)
- [x] `grep "AsyncParsableCommand"` shows Complete, Uncomplete, ListCompleted
- [x] CompletionStore still imported and used in all fallback paths
- [x] `swift build` — Build complete!

## Self-Check: PASSED
