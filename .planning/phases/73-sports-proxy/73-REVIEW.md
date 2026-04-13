---
phase: 73-sports-proxy
reviewed: 2026-04-12T12:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - vigil-core/src/index.ts
  - vigil-core/src/routes/sports.test.ts
  - vigil-core/src/routes/sports.ts
  - vigil-core/src/services/sports-service.test.ts
  - vigil-core/src/services/sports-service.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 73: Code Review Report

**Reviewed:** 2026-04-12T12:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

The sports proxy feature adds a well-structured BDL (balldontlie.io) integration with per-league normalization, in-memory caching, and dependency injection for testability. The route layer is clean with proper league param validation. The service layer handles four different API response shapes correctly. Three warnings relate to logic bugs that could produce incorrect data or degrade resilience. No security vulnerabilities found -- the API key is correctly excluded from responses and error messages.

## Warnings

### WR-01: configuredTeamName derived from standings[0] instead of configured team lookup

**File:** `vigil-core/src/services/sports-service.ts:279`
**Issue:** All four `fetchLeague*` functions derive `configuredTeamName` from `standingsRes.data[0]?.team?.full_name`. This assumes the configured team is always the first entry in the standings response. If the API returns standings in a different order (e.g., sorted by conference, division, or alphabetically), `computeResult` will compute W/L relative to the wrong team, producing incorrect results. The same pattern appears at lines 314, 349, and 383.
**Fix:** Look up the configured team name from the standings array using the team ID, or pass the known team name through a separate lookup. For example:
```typescript
// Resolve team name from standings by matching team_id, or fall back to first entry
const configuredTeamEntry = standingsRes.data.find(
  (e) => String(e.team?.id) === teamId
)?.team?.full_name ?? standingsRes.data[0]?.team?.full_name ?? "";
```
If BDL standings entries don't include a team ID field, an alternative is to store team names alongside team IDs in configuration (e.g., `SPORTS_NBA_TEAM_NAME`).

### WR-02: Error results cached for full 5-minute TTL

**File:** `vigil-core/src/services/sports-service.ts:429`
**Issue:** When a league fetch fails (network error, API 5xx), the error result is cached via `setCachedLeague` on line 429. This means a transient failure locks out retries for the full 5-minute TTL. On the free tier with 5 req/min limits, this is especially costly -- a single blip wastes an entire cache window.
**Fix:** Only cache successful results:
```typescript
if (result.status !== "error") {
  setCachedLeague(league, result);
}
```

### WR-03: `partial` flag triggers on `off_season` status, not just errors

**File:** `vigil-core/src/services/sports-service.ts:453`
**Issue:** The `partial` flag is computed as `Object.values(leagues).some((l) => l.status !== "ok")`. Since `off_season` is a valid, expected state (e.g., NFL in April), this means `partial` will almost always be `true` in practice, reducing its usefulness as a signal of degraded data. Downstream consumers (brief generation) cannot distinguish "some data is missing due to errors" from "some leagues are simply not in season."
**Fix:** Only set `partial` on actual errors:
```typescript
const partial = Object.values(leagues).some((l) => l.status === "error");
```
Note: the route test `SPORT-06` explicitly asserts `partial: true` when one league errors and others succeed. If `off_season` leagues are also present, the current logic would still pass. Changing this requires updating that test assertion to account for leagues that return `off_season`.

## Info

### IN-01: Hardcoded season year `2026` in standings URLs

**File:** `vigil-core/src/services/sports-service.ts:267`
**Issue:** All four league fetchers hardcode `season=2026` in the standings URL (lines 267, 303, 338, 371). This will silently return stale or empty data after the year rolls over.
**Fix:** Derive season from the current date:
```typescript
const season = new Date().getFullYear();
const standingsUrl = `${BASE_URLS.mlb}/standings?season=${season}`;
```

### IN-02: Duplicate test ID `SPORT-01` in service tests

**File:** `vigil-core/src/services/sports-service.test.ts:251`
**Issue:** Lines 149 and 251 both define tests prefixed `SPORT-01`. The second test (line 251) verifies `STATUS_FINAL` handling. Duplicate IDs make it harder to reference specific test failures in CI logs or planning docs.
**Fix:** Rename the second test to a unique ID, e.g., `SPORT-07: MLB STATUS_FINAL is recognized as final game status`.

---

_Reviewed: 2026-04-12T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
