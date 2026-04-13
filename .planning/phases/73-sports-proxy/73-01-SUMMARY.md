---
phase: 73-sports-proxy
plan: 01
subsystem: vigil-core/services
tags: [sports, balldontlie, tdd, cache, normalization]
dependency_graph:
  requires: []
  provides: [createSportsService, SportsServiceDeps, SportsResponse, LeagueResult, LeagueData, GameScore, StandingsEntry, UpcomingGame]
  affects: [vigil-core/src/routes/sports.ts (Plan 02)]
tech_stack:
  added: []
  patterns: [dependency-injection factory, in-memory Map cache with TTL, Promise.allSettled fan-out, per-league normalization]
key_files:
  created:
    - vigil-core/src/services/sports-service.ts
    - vigil-core/src/services/sports-service.test.ts
  modified: []
decisions:
  - "Injectable fetchFn via SportsServiceDeps enables unit testing without live HTTP calls"
  - "Per-league normalization functions handle BDL field name inconsistencies (MLB STATUS_FINAL, NHL home_score/away_score, NBA visitor_team)"
  - "Empty data arrays return status off_season not error — aligns with SPORT-06 partial-success design"
  - "Cache keyed by league string; clearCache() exposed for test isolation"
metrics:
  duration: ~10 minutes
  completed: 2026-04-13T01:39:22Z
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 73 Plan 01: Sports Service TDD Summary

**One-liner:** `createSportsService` factory with 4 per-league BDL normalizers, 5-min in-memory cache, and injectable fetch — all 7 tests green.

## Tasks Completed

| Task | Type | Commit | Description |
|------|------|--------|-------------|
| 1 | RED (TDD) | 91a3bb9 | 7 failing tests for SPORT-01–SPORT-05 + edge cases; stub service |
| 2 | GREEN (TDD) | 9dfc0f2 | Full implementation — all 7 tests pass |

## What Was Built

`vigil-core/src/services/sports-service.ts` — exported factory and types:

- **`createSportsService(deps?)`** — accepts optional `fetchFn` and `teamIds` overrides
- **4 league fetchers** — `fetchLeague("mlb"|"nfl"|"nba"|"nhl")` each hits BDL games + standings concurrently via `Promise.all`
- **`fetchAllLeagues()`** — fans out to all 4 leagues via `Promise.allSettled`, sets `partial: true` if any league fails
- **`clearCache()`** — clears in-memory Map for test isolation
- **In-memory cache** — `Map<string, CacheEntry<LeagueResult>>` with 5-min TTL; second call within TTL returns without hitting `fetchFn`

### Per-league field mapping (critical correctness details)

| League | Score Fields | Status | Away Team Field |
|--------|-------------|--------|-----------------|
| MLB | `home_team_data.runs` / `away_team_data.runs` | `"STATUS_FINAL"` | `away_team_name` (string) |
| NFL | `home_team_score` / `visitor_team_score` | `"Final"` | `visitor_team.full_name` |
| NBA | `home_team_score` / `visitor_team_score` | `"Final"` | `visitor_team.full_name` |
| NHL | `home_score` / `away_score` | `"Final"` | `away_team.full_name` |

### Security (T-73-01, T-73-02)

- `BALLDONTLIE_API_KEY` read from `process.env` — never logged, never included in response body
- Authorization header: raw key only (no `Bearer` prefix — BDL requirement)
- Error logs include only URL and HTTP status code

## Test Coverage

| Test | Requirement | Result |
|------|-------------|--------|
| MLB fetcher normalizes BDL MLB response | SPORT-01 | PASS |
| NFL fetcher normalizes BDL NFL response | SPORT-02 | PASS |
| NBA fetcher normalizes BDL NBA response | SPORT-03 | PASS |
| NHL fetcher normalizes BDL NHL response | SPORT-04 | PASS |
| Second call within TTL uses cache | SPORT-05 | PASS |
| MLB STATUS_FINAL is recognized as final | SPORT-01 edge | PASS |
| Empty arrays return off_season not error | SPORT-06 precursor | PASS |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `upcomingGame` is always `null` in the current implementation. The plan's `<interfaces>` block and data model include `UpcomingGame`, but the action spec for Task 2 does not implement upcoming game fetching (future date filtering). This is intentional per the plan — the field is typed and exported; Plan 02 (route) can wire it when the service is extended in a future plan.

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model (T-73-01, T-73-02 mitigated).

## Self-Check: PASSED

- FOUND: vigil-core/src/services/sports-service.ts
- FOUND: vigil-core/src/services/sports-service.test.ts
- FOUND: commit 91a3bb9 (RED phase)
- FOUND: commit 9dfc0f2 (GREEN phase)
- All 7 tests pass (verified via `npx tsx --test src/services/sports-service.test.ts`)
