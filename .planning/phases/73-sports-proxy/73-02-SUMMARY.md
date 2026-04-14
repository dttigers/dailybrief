---
phase: 73-sports-proxy
plan: 02
subsystem: vigil-core/routes
tags: [sports, hono, tdd, route, balldontlie, partial-success]
dependency_graph:
  requires: [vigil-core/src/services/sports-service.ts (Plan 01)]
  provides: [GET /v1/sports, GET /v1/sports/:league, sports Hono instance]
  affects: [vigil-core/src/index.ts, Phase 76 brief assembly]
tech_stack:
  added: []
  patterns: [DI factory route pattern, allowlist param validation, TDD red-green]
key_files:
  created:
    - vigil-core/src/routes/sports.ts
    - vigil-core/src/routes/sports.test.ts
  modified:
    - vigil-core/src/index.ts
decisions:
  - "createSportsRouter factory mirrors work-order-status.ts DI pattern for testability"
  - "VALID_LEAGUES allowlist with 400 response satisfies T-73-03 threat mitigation"
  - "Test stub differentiates games vs standings URLs and per-league base URLs to avoid false routing"
metrics:
  duration: ~15 minutes
  completed: 2026-04-13T02:05:00Z
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 73 Plan 02: Sports Route Summary

**One-liner:** Hono sports route with `createSportsRouter` factory, per-league allowlist validation (T-73-03), and SPORT-06 partial-success test — all 53 vigil-core tests green.

## Tasks Completed

| Task | Type | Commit | Description |
|------|------|--------|-------------|
| 1 (RED) | TDD test | 19e0d78 | 3 failing route tests — SPORT-06, valid league 200, invalid league 400 |
| 1 (GREEN) | feat + test fix | 9782838 | Route implementation + corrected stub URL routing — all 3 tests pass |
| 2 | feat | 57be8af | Register sports route in index.ts, full suite 53/53 green |

## What Was Built

`vigil-core/src/routes/sports.ts` — Hono route file:

- **`createSportsRouter(deps?)`** — DI factory accepting `SportsServiceDeps`; creates service instance and wires two routes
- **`GET /sports`** — calls `service.fetchAllLeagues()`, returns full `SportsResponse` JSON (200)
- **`GET /sports/:league`** — validates `:league` param against `VALID_LEAGUES = ["mlb","nfl","nba","nhl"]`; returns `LeagueResult` JSON (200) or 400 with `"Unknown league. Valid: mlb, nfl, nba, nhl"`
- **`export const sports = createSportsRouter()`** — production instance (real fetch + env vars)

`vigil-core/src/index.ts` — updated:

- Added `import { sports } from "./routes/sports.js"`
- Added `app.route("/v1", sports)` after `workOrderStatus` — inherits bearer auth from `app.use("/v1/*", ...)` middleware block

## Test Coverage

| Test | Requirement | Result |
|------|-------------|--------|
| SPORT-06: one league rejection returns partial true with other leagues ok | SPORT-06 | PASS |
| GET /sports/:league with valid league returns 200 | Route behavior | PASS |
| GET /sports/:league with invalid league returns 400 | T-73-03 / Route behavior | PASS |
| Full suite (53 tests) — zero regressions | All prior | PASS |

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed test stub URL routing for SPORT-06**
- **Found during:** Task 1 GREEN phase — SPORT-06 test failed with "NBA should have ok or off_season status, got: error"
- **Issue:** Original stub returned `makeNBASuccessResponse()` (game format) for both NBA games AND standings URLs. The standings normalizer (`normalizeStandings`) expects `team.full_name` objects, not game objects — so it threw, causing NBA to land as `status: "error"`. Also, the initial URL routing logic used `/v1/games` which ambiguously matched both NBA and NFL URLs.
- **Fix:** (1) Split stub into separate game and standings response builders. (2) Changed URL routing to use unambiguous domain patterns (`balldontlie.io/nfl/`, `balldontlie.io/nhl/`, `balldontlie.io/v1/`) combined with `/games` check to route to correct fixture.
- **Files modified:** `vigil-core/src/routes/sports.test.ts`
- **Commit:** 9782838

## Known Stubs

None — route wires directly to `createSportsService` which is fully implemented. `upcomingGame` is always `null` in the service layer (tracked in Plan 01 SUMMARY) but this is a known service-layer stub, not a route stub.

## Threat Flags

No new threat surface beyond what the plan's threat model documents:
- T-73-03 mitigated: `VALID_LEAGUES` allowlist check with 400 on unknown league — implemented
- T-73-04 mitigated: service layer wraps errors in `status: "error"` with sanitized message — route passes through unchanged, no raw upstream bodies exposed
- T-73-05 accepted: existing 30s timeout middleware covers the fan-out; try/catch in service layer isolates league failures

## Self-Check: PASSED

- FOUND: vigil-core/src/routes/sports.ts
- FOUND: vigil-core/src/routes/sports.test.ts
- FOUND: vigil-core/src/index.ts contains `import { sports } from "./routes/sports.js"`
- FOUND: vigil-core/src/index.ts contains `app.route("/v1", sports)`
- FOUND: commit 19e0d78 (RED phase)
- FOUND: commit 9782838 (GREEN phase + corrected tests)
- FOUND: commit 57be8af (index.ts registration)
- All 53 tests pass (verified via `npm test`)
