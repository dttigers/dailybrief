---
phase: 66-work-orders-dashboard
plan: "01"
subsystem: vigil-core, DailyBrief CLI
tags: [work-orders, api, sync, migration, postgresql]
dependency_graph:
  requires: [65-01]
  provides: [work_orders table, GET /v1/work-orders, POST /v1/work-orders/sync, CLI sync]
  affects: [vigil-pwa]
tech_stack:
  added: []
  patterns: [drizzle upsert onConflictDoUpdate, mass-assignment defense, fire-and-forget sync]
key_files:
  created:
    - vigil-core/src/routes/work-orders.ts
    - vigil-core/drizzle/0005_breezy_random.sql
    - vigil-core/drizzle/meta/0005_snapshot.json
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/index.ts
    - Sources/DailyBrief/DailyBrief.swift
decisions:
  - Used two separate queries (select workOrders + select workOrderStatuses) instead of LEFT JOIN due to drizzle-orm query builder ergonomics; built status map in application layer — same result, simpler code
  - Migration applied at Railway deploy time; postgres.railway.internal not reachable from local dev machine
metrics:
  duration: ~20 minutes
  completed: 2026-04-12
  tasks_completed: 2
  files_created: 3
  files_modified: 3
---

# Phase 66 Plan 01: Work Orders Table and Sync API Summary

**One-liner:** PostgreSQL work_orders table with upsert sync endpoint (POST /v1/work-orders/sync) and read endpoint (GET /v1/work-orders with status join), plus CLI fire-and-forget push after IMAP fetch.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create work_orders table and GET/POST endpoints | 79d894b | schema.ts, work-orders.ts, index.ts, 0005_breezy_random.sql |
| 2 | CLI sync — push work orders to API after IMAP fetch | abcc4a7 | DailyBrief.swift |

## What Was Built

### vigil-core: work_orders table
Added `workOrders` table to `schema.ts` with `caseNumber` as primary key and 9 text fields matching the existing Swift `WorkOrder` struct plus a `syncedAt` timestamp.

### vigil-core: POST /v1/work-orders/sync
- Accepts `{ workOrders: WorkOrder[] }` (max 100 items — T-66-04 rate guard)
- Mass-assignment defense: destructures only the 9 known fields per item (T-66-02)
- Upserts each work order by `caseNumber` using `onConflictDoUpdate`
- Returns `{ synced: number }`
- Protected by existing Bearer auth middleware (T-66-01)

### vigil-core: GET /v1/work-orders
- Returns all work orders from `work_orders` table
- Joins with `work_order_statuses` via application-layer map
- Missing status rows default to `"open"`
- Response: `{ data: Array<WorkOrder & { status, syncedAt }> }`

### CLI: DailyBrief sync call
- After `let allWorkOrders = await (workOrdersResult ?? [])` and before `woStatuses` fetch
- Calls `POST /v1/work-orders/sync` with `SyncRequest(workOrders: allWorkOrders)`
- `SyncResponse` reads back `synced` count
- Failure is caught, logged as non-fatal, does NOT block brief generation or PDF output

## Migration

Migration file `vigil-core/drizzle/0005_breezy_random.sql` is committed. It creates the `work_orders` table.

**Application status:** The Railway Postgres database uses `postgres.railway.internal` which is only reachable from within Railway's private network — not from local dev. The migration will be applied automatically when this branch is merged to main and Railway auto-deploys. To apply manually before deploy: use Railway's console/shell on the deployed service.

## Deviations from Plan

### Architecture: Two queries instead of LEFT JOIN

**Found during:** Task 1 implementation

**Issue:** The plan specified using a LEFT JOIN on `workOrderStatuses` by `caseNumber`. Drizzle's `leftJoin` with a separate table in this schema requires explicit relation setup or raw SQL. The simpler and equally correct approach is two sequential selects with an application-layer map.

**Fix:** Fetch `workOrders` and `workOrderStatuses` in two queries, build a `Map<caseNumber, status>` in TypeScript, then assemble the response. Same correctness, simpler code.

**Files modified:** `vigil-core/src/routes/work-orders.ts`

**Classification:** Rule 1 (implementation choice, not a bug) — no behavioral difference.

## Known Stubs

None — all data flows are wired. The GET endpoint returns real database rows. The CLI sync call is fully integrated.

## Threat Flags

None — all endpoints are protected by existing Bearer auth middleware at `/v1/*`. Threat mitigations T-66-01, T-66-02, T-66-04 are implemented as specified.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| vigil-core/src/routes/work-orders.ts | FOUND |
| vigil-core/drizzle/0005_breezy_random.sql | FOUND |
| Sources/DailyBrief/DailyBrief.swift | FOUND |
| commit 79d894b (Task 1) | FOUND |
| commit abcc4a7 (Task 2) | FOUND |
| npm run build (vigil-core) | PASSED |
| swift build | PASSED |
