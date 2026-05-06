---
phase: 116-sports-source-picker
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - vigil-core/src/index.ts
  - vigil-core/src/routes/sports.test.ts
  - vigil-core/src/routes/sports.ts
  - vigil-core/src/services/brief-assembly-service.test.ts
  - vigil-core/src/services/brief-assembly-service.ts
  - vigil-core/src/services/sports-preferences-service.test.ts
  - vigil-core/src/services/sports-preferences-service.ts
  - vigil-core/src/services/sports-service.test.ts
  - vigil-core/src/services/sports-service.ts
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/pages/SettingsPage.test.tsx
  - vigil-pwa/src/pages/SettingsPage.tsx
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 116: Code Review Report

**Reviewed:** 2026-04-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 116 (Sports Source Picker) introduces a per-user picker for league enable/disable + favorite team selection, persisted in `app_settings` and threaded through brief assembly. The implementation is well-structured with single-source validation in `sports-preferences-service.ts`, defense-in-depth READ checks in `brief-assembly-service.ts`, and matching optimistic UI with debounced PUT + rollback in the PWA.

Test coverage is comprehensive (route, service, brief-threading, picker UI). No critical or security-blocking issues were found. Four warnings are worth addressing before the next phase: a defense-in-depth gap where `favoriteTeams` values flow into BDL URLs without `encodeURIComponent`, a stale `teamName` derivation in `mapSports` that ignores the picker, an unused `affirmationR` placeholder slot in `Promise.allSettled`, and a weaker shape check on the READ path than on the WRITE path.

## Warnings

### WR-01: `teamId` interpolated into BDL URL without encoding (defense-in-depth gap)

**File:** `vigil-core/src/services/sports-service.ts:331-332,410-411,489-490,568-569`
**Issue:** Across all four `fetchLeague{MLB,NFL,NBA,NHL}` functions, `teamId` is interpolated directly into the request URL via template literal:
```ts
const recentUrl = `${BASE_URLS.mlb}/games?dates[]=${yesterday}&team_ids[]=${teamId}&per_page=5`;
```
The WRITE path validates `favoriteTeams.<league>` must be a string (`sports-preferences-service.ts:78`), but the READ path in `brief-assembly-service.ts:430-447` only checks `Array.isArray(enabledLeagues)` and `typeof favoriteTeams === "object"` — it does NOT verify each value in `favoriteTeams` is a non-malicious string. A historical/corrupt row (or a future bug bypassing the validator) could deliver a `teamId` containing `&season=...` or other URL params. Even with the "stringification" guarantee, a value like `"116&malicious=1"` would silently inject a query parameter into the BDL request.
**Fix:** Encode the teamId at URL-construction time as a defense-in-depth boundary, regardless of upstream validation:
```ts
const encodedTeamId = encodeURIComponent(teamId);
const recentUrl = `${BASE_URLS.mlb}/games?dates[]=${yesterday}&team_ids[]=${encodedTeamId}&per_page=5`;
```
Apply the same change in `fetchLeagueNFL`, `fetchLeagueNBA`, `fetchLeagueNHL`.

---

### WR-02: `mapSports` reads `teamName` from env var, ignoring picker selection

**File:** `vigil-core/src/services/brief-assembly-service.ts:84`
**Issue:** After Phase 116, the user's favorite team is stored per-user in `app_settings.sports_selections.favoriteTeams[league]`. However, `mapSports` still reads the team display name from the legacy environment variable:
```ts
const teamName = process.env[`SPORTS_${key.toUpperCase()}_TEAM_NAME`] ?? "My Team";
```
This means a user who picks the Yankees in the PWA picker will see `teamName: "Detroit Tigers"` (from the `SPORTS_MLB_TEAM_NAME` env var) or `"My Team"` (when the env var is unset, e.g., after the runbook deletes them per the SUMMARY in `index.ts:240-248`). The `recentGame`/`upcomingGame` data inside is correct (it comes from the BDL API response), but the `teamName` field on `BriefSportLeague` is stale and may be misleading in the rendered PDF.
**Fix:** Either (a) thread the picker's `favoriteTeams[league]` lookup result into `mapSports` so it can resolve a name from cached `fetchTeams` data, or (b) drop the `teamName` field entirely from `BriefSportLeague` and rely on the per-game team names already in `recentGame.homeTeam`/`awayTeam`. Path (b) is the simpler v1 fix:
```ts
// Remove the teamName field from BriefSportLeague (in pdf-types.ts) and from this mapper.
// The PDF renderer can use recentGame.homeTeam/awayTeam directly.
```

---

### WR-03: Unused `affirmationR` placeholder in `Promise.allSettled` destructure

**File:** `vigil-core/src/services/brief-assembly-service.ts:483-508`
**Issue:** The destructure binds five values but the fifth (`affirmationR`) is a `Promise.resolve(null)` placeholder that is never read — affirmation is fetched separately at line 539 (`await fetchAffirmation(...)`). The placeholder is dead code that confuses the reader and adds an unused promise to the settled array:
```ts
const [sportsR, calendarR, thoughtsR, workOrdersR, affirmationR] = await Promise.allSettled([
  // ...
  Promise.resolve(null), // placeholder — will fetch affirmation after
]);
```
**Fix:** Remove the placeholder and the trailing destructure variable:
```ts
const [sportsR, calendarR, thoughtsR, workOrdersR] = await Promise.allSettled([
  deps.sportsService ? withTimeout(...) : Promise.reject(...),
  deps.calendarService ? withTimeout(...) : Promise.reject(...),
  db ? withTimeout(...) : Promise.resolve(...),
  db ? withTimeout(...) : Promise.resolve(...),
]);
```

---

### WR-04: READ-side shape check is weaker than the validator used on WRITE

**File:** `vigil-core/src/services/brief-assembly-service.ts:430-448`
**Issue:** `getUserSportsSelections` performs a defensive shape check before returning the persisted value, but the check is shallow:
```ts
if (!Array.isArray(v.enabledLeagues) || !v.favoriteTeams || typeof v.favoriteTeams !== "object") {
  return EMPTY_SELECTIONS;
}
return value as SportsSelections;
```
It does NOT validate that:
- Each entry in `enabledLeagues` is one of `"mlb"|"nfl"|"nba"|"nhl"`.
- Values in `favoriteTeams` are strings (could be numbers, objects, etc.).
- Keys in `favoriteTeams` are valid league keys.

A corrupt row with `enabledLeagues: ["soccer"]` would pass through to `sports-service.fetchAllLeagues`, where `selections.enabledLeagues.includes("mlb")` would correctly return false (so MLB stays disabled) — but the shape leak is unnecessary risk, and combines with WR-01 to enable URL parameter injection if `favoriteTeams.mlb` is non-string.
**Fix:** Reuse the validator already exported from sports-preferences-service.ts:
```ts
import { validateSportsSelections } from "./sports-preferences-service.js";
// ...
try {
  validateSportsSelections(value);
  return value;
} catch {
  return EMPTY_SELECTIONS;
}
```
This single-sources the shape contract (matches sports-preferences-service.ts:128-133's READ defense pattern).

---

## Info

### IN-01: `getUserSelections` uses falsy check on `row` instead of explicit null

**File:** `vigil-core/src/services/sports-preferences-service.ts:124`
**Issue:** `if (!row) return { ...empty default };` would also short-circuit if `row` is an empty string, `0`, `false`, or `NaN`. While jsonb columns won't actually return those types, an explicit check is clearer and more correct:
**Fix:**
```ts
if (row === null) return { enabledLeagues: [], favoriteTeams: {} };
```

---

### IN-02: `c.get("userId") as number` cast without runtime guard

**File:** `vigil-core/src/routes/sports.ts:38,51`
**Issue:** Both `GET /sports/selections` and `PUT /sports/selections` cast `c.get("userId")` to `number` without verifying the dispatcher actually populated it. The `index.ts` mount-order comment at lines 175-180 guarantees this in production, but a defense-in-depth `if (typeof userId !== "number")` guard would prevent a future routing change from creating a silent userId-undefined bug.
**Fix:**
```ts
const userId = c.get("userId");
if (typeof userId !== "number") {
  return c.json({ error: "Unauthorized" }, 401);
}
```

---

### IN-03: `sports-service.ts:749` uses `String(reason)` while siblings use `.message`

**File:** `vigil-core/src/services/sports-service.ts:749`
**Issue:** `settledToResult` formats rejection as `error: String(r.reason)`, which produces `"Error: <message>"` for Error instances. Sibling paths (e.g., line 327, line 406) use `err instanceof Error ? err.message : String(err)`. Inconsistent error formatting leaks "Error: " prefix into the response body.
**Fix:**
```ts
function settledToResult(r: PromiseSettledResult<LeagueResult>): LeagueResult {
  if (r.status === "fulfilled") return r.value;
  const reason = r.reason;
  return { status: "error", error: reason instanceof Error ? reason.message : String(reason) };
}
```

---

### IN-04: `sports-service.test.ts` mutates `process.env` at module top-level

**File:** `vigil-core/src/services/sports-service.test.ts:7-10`
**Issue:** Setting `SPORTS_*_TEAM_ID` env vars at module load time pollutes the global `process.env` for the entire test process. If another test file imported in the same node:test run reads these vars (or expects them unset), behavior will diverge based on test load order. The `index.ts` comment at lines 240-248 explicitly states production no longer reads these — they're test-only fallbacks. Comment is good; isolation is not.
**Fix:** Set env vars inside a `beforeEach` block per-test, or use a per-test override via the `teamIds` dep that the service already supports:
```ts
const service = createSportsService({ fetchFn, teamIds: { mlb: "116", nfl: "13", nba: "10", nhl: "10" } });
```

---

### IN-05: `loadTeamsForLeagueImpl` not wrapped in useCallback, called from inside another callback

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:239-249`
**Issue:** `loadTeamsForLeagueImpl` is a plain async function defined inside the component body that closes over `setTeamsByLeague`. The wrapped `loadTeamsForLeague` (line 249) is the useCallback'd version, but `loadSportsSelections` (line 270) calls `loadTeamsForLeagueImpl` directly to avoid a dependency cycle. The comment explains the intent, but the duplication is fragile — a future refactor could accidentally diverge their behavior. The current `setTeamsByLeague` calls are stable (functional updates), so the dep-cycle workaround isn't strictly needed.
**Fix:** Inline the implementation into `loadTeamsForLeague` and call it directly in both places (it remains stable because `setTeamsByLeague` is React-stable):
```ts
const loadTeamsForLeague = useCallback(async (league: League) => {
  setTeamsByLeague((prev) => ({ ...prev, [league]: 'loading' }))
  try {
    const teams = await getSportsTeams(league)
    setTeamsByLeague((prev) => ({ ...prev, [league]: teams }))
  } catch {
    setTeamsByLeague((prev) => ({ ...prev, [league]: 'error' }))
  }
}, [])
// Then in loadSportsSelections, depend on loadTeamsForLeague (stable identity).
```

---

### IN-06: `getCachedLeague` ignores cache key collision between full-fetch and standings-only

**File:** `vigil-core/src/services/sports-service.ts:651-656,681-684`
**Issue:** The cache key is `league:${league}` and does NOT include `standingsOnly` or `teamId`. The current code correctly bypasses cache writes/reads on standings-only requests (lines 653, 682) — but it does NOT prevent a full-fetch result from being served to a code path that subsequently changes the team via the picker. A user changing their favorite team will see stale recent/upcoming game data for up to 5 minutes (CACHE_TTL_MS). This is documented in the comment at lines 650-652, but worth surfacing explicitly: clearCache should be called whenever `setSportsSelections` succeeds.
**Fix:** Either (a) include teamId in the cache key (`league:${league}:${teamId ?? "none"}`), or (b) call `service.clearCache()` from the PUT handler in `sports.ts` after a successful `setUserSelections`. Path (b) is simpler and matches the stated v1 caching strategy.

---

_Reviewed: 2026-04-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
