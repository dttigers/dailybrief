---
phase: 129-lifecycle-restore-servicenow-popup
plan: "04"
subsystem: vigil-core/api
tags: [vigil-core, hono-route, idempotency, dedup, di-refactor, tdd, work-orders, svcnow]

dependency_graph:
  requires:
    - phase: 129-01
      provides: work_orders.clientCaptureId column + uq_work_orders_user_client_capture_id partial unique index
    - phase: 121-agent-events
      provides: createAgentEventsRoute DI factory pattern + dbInsertOrGet shape mirrored exactly
  provides:
    - createWorkOrdersRoute(deps) DI factory for work-orders route
    - WorkOrdersDeps interface with dbInsertOrGet + dbUpsertLegacy + db + dbAvailable
    - SVCNOW-04 server-side dedup via (user_id, client_capture_id) composite guard
    - work-orders.test.ts with 12 DI unit tests (idempotency + backward-compat + mass-assign + drift)
    - workOrdersRouter pre-wired production binding preserved for index.ts:30 compat
  affects:
    - vigil-core/src/index.ts (import continues unchanged — zero edits required)
    - ServiceNow extension popup plans (Plans 05+) which POST with clientCaptureId

tech-stack:
  added: []
  patterns:
    - createWorkOrdersRoute(deps) DI factory pattern mirroring Phase 121 createAgentEventsRoute
    - dbInsertOrGet primitive: SELECT-first guard + INSERT, returns { row, isNew }
    - dbUpsertLegacy: ON CONFLICT (case_number) DO UPDATE — backward-compat legacy path
    - syncedCount accumulation: isNew:true → +1, isNew:false → +0, legacy → +1
    - Drift-detector tests via readFileSync + regex (source-level + migration SQL)
    - Per-item dedup branching in sync loop (clientCaptureId null vs non-null)

key-files:
  created:
    - vigil-core/src/routes/work-orders.test.ts
  modified:
    - vigil-core/src/routes/work-orders.ts

key-decisions:
  - "GET/PUT/DELETE handlers use deps.db (raw reference) rather than per-method dep wrappers — minimal refactor surface; only the POST sync dedup is tightly DI'd"
  - "synced:0 on dedup hit is intentional HTTP 200 — popup closes on any 200 per D-03; operators should not see an error when a duplicate is detected"
  - "camelCase clientCaptureId preferred over snake_case client_capture_id; both accepted for cross-client compat (RESEARCH Probe 4 + Pitfall 5)"
  - "DI tests run with stubbed deps — no real Postgres required for dedup unit tests (same as agent-events.test.ts approach)"

patterns-established:
  - "WorkOrdersDeps factory pattern: exported interface + exported factory + pre-wired production singleton at file bottom (mirrors agent-events.ts)"
  - "In-memory dedup stub Map<userId|clientCaptureId, row> for idempotency tests without DB"
  - "Drift-detector tests for migration SQL + app-layer dedup presence pinned in source"

requirements-completed: [SVCNOW-04]

duration: ~25min
completed: "2026-05-15"
---

# Phase 129 Plan 04: work-orders.ts DI refactor + SVCNOW-04 server-side dedup Summary

**work-orders.ts refactored to createWorkOrdersRoute(deps) DI factory mirroring Phase 121's agent-events pattern; POST /v1/work-orders/sync extended with clientCaptureId dedup guard so multi-tab/retry SVCNOW popup submissions produce exactly one row**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-15T00:00:00Z
- **Completed:** 2026-05-15T00:25:00Z
- **Tasks:** 1 (TDD: RED commit + GREEN commit)
- **Files modified:** 2

## Accomplishments

- Refactored `work-orders.ts` from global-db closure to `createWorkOrdersRoute(deps: WorkOrdersDeps): Hono` factory pattern (mirrors Phase 121 `createAgentEventsRoute`)
- Extended `POST /work-orders/sync` with per-item `clientCaptureId` branching: non-null → `deps.dbInsertOrGet` (dedup, synced:0 on hit), null → `deps.dbUpsertLegacy` (legacy ON CONFLICT, synced:1 always)
- Mass-assignment sanitizer extended with 10th field (`clientCaptureId`) with camelCase-preferred / snake_case-fallback
- Pre-wired `workOrdersRouter` production binding preserved so `vigil-core/src/index.ts:30` import needs zero changes
- 12 DI unit tests covering idempotency, per-user scoping, backward-compat, mass-assignment defense, snake_case fallback, DB-unavailable, and two drift detectors
- All 38 work-orders + agent-events tests green; `tsc --noEmit` clean

## Task Commits

TDD execution (RED → GREEN):

1. **RED — Failing tests** - `a705578` (test) — 12 failing tests for DI factory + dedup behavior
2. **GREEN — Implementation** - `965ba03` (feat) — createWorkOrdersRoute factory + pre-wired binding; all 12 tests green

## Files Created/Modified

- `vigil-core/src/routes/work-orders.ts` — Refactored to DI factory pattern; exports `createWorkOrdersRoute(deps)` + `workOrdersRouter` pre-wired binding; POST sync handler with per-item dedup branching
- `vigil-core/src/routes/work-orders.test.ts` — 12 DI unit tests: T1-T8 behavioral + T1-T2 drift detectors + T1-T2 structural checks

## Decisions Made

- **GET/PUT/DELETE use `deps.db` (raw):** Only the POST dedup is tightly DI'd; the other handlers use a raw `db: typeof db` dep to minimize refactor surface. Documented as a conscious trade-off — the dedup primitive is what needed testability.
- **`synced: 0` on dedup hit (HTTP 200):** D-03 — popup closes on any 200; a dedup is not an error. The accumulator pattern (isNew:true → +1, isNew:false → +0, legacy → +1) matches the plan spec exactly.
- **In-memory stub instead of real Postgres:** DI tests use `Map<userId|clientCaptureId, WorkOrderRow>` stub. Same approach as agent-events.test.ts — unlocks unit-testable dedup without a test-DB infrastructure dependency.

## Deviations from Plan

None — plan executed exactly as written. The `sql` import from `drizzle-orm` (already in the file from prior code) was not needed in the refactored version since the GET handler no longer uses raw SQL; it was removed without issue.

## TDD Gate Compliance

- RED commit `a705578`: `test(129-04)` — 12 failing tests (createWorkOrdersRoute not exported)
- GREEN commit `965ba03`: `feat(129-04)` — all 12 tests pass, tsc clean

## Known Stubs

None — production binding wires real `db` from `../db/connection.js`. No UI or placeholder data involved.

## Threat Flags

None — all STRIDE threats from the plan's threat model addressed:
- T-129-14 (multi-tab race): `dbInsertOrGet` SELECT-first guard + DB partial unique index (defense-in-depth)
- T-129-15 (mass-assignment): sanitizer destructures exactly 10 known fields; userId always from middleware
- T-129-17 (migration drift): DRIFT/T2 test pins `WHERE "client_capture_id" IS NOT NULL` in 0021 SQL
- T-129-20 (DI refactor regression): DRIFT/T1 test greps source for `dbInsertOrGet` presence

## Self-Check: PASSED

- `vigil-core/src/routes/work-orders.ts`: EXISTS and exports `createWorkOrdersRoute` + `workOrdersRouter`
- `vigil-core/src/routes/work-orders.test.ts`: EXISTS with 12 passing tests
- Commit `a705578` (RED): EXISTS
- Commit `965ba03` (GREEN): EXISTS
- `grep -c 'export function createWorkOrdersRoute' work-orders.ts` = 1: VERIFIED
- `grep -c 'export const workOrdersRouter' work-orders.ts` = 1: VERIFIED
- `tsc --noEmit` clean: VERIFIED
- All 38 work-orders + agent-events tests green: VERIFIED
