---
phase: 116-sports-source-picker
plan: 02
subsystem: api
tags: [hono, sports, balldontlie, cache, teams, normalization, allowlist]

requires:
  - phase: 116-01
    provides: SportsRouterDeps intersection type + createSportsRouter factory wired with prefsService + route ordering rule (literal paths before :league param)
  - phase: 73 (sports baseline)
    provides: createSportsService factory + fetchJSON helper + BASE_URLS + League type + VALID_LEAGUES allowlist
provides:
  - createSportsService factory return now includes fetchTeams(league) + clearCache also clears teamsCache
  - TeamListEntry exported interface (BDL team_id as string per D-05)
  - TEAMS_CACHE_TTL_MS = 24h constant (D-07)
  - GET /v1/sports/teams/:league handler with allowlist + body shape { teams: TeamListEntry[] } (D-06)
affects: [116-03 sports-service threading (fetchAllLeagues selections param), 116-05 PWA Settings UI (consumes teams endpoint)]

tech-stack:
  added: []
  patterns:
    - "Parameterized cache TTL: isFresh(entry, ttlMs) accepts an optional ttl, default keeps existing call sites unchanged — one signature change cleaner than duplicating the helper"
    - "Per-league field normalization at the service layer: BDL diverges (MLB display_name vs others full_name); fetchTeams collapses to a uniform TeamListEntry shape so the route + future PWA see one contract"
    - "BDL numeric id stringified at the boundary: String(raw.id) at the only place fetchTeams emits — direct drop-in for the existing team_ids[]=<id> query string in fetchLeague*"
    - "Hono route ordering: literal /sports/teams/:league registered BEFORE /sports/:league so first-match dispatch picks the more-specific path"
    - "Global (cross-user) cache for shared public BDL data: teamsCache is a Map<League, ...> in module-private factory closure scope, NEVER keyed by userId — D-07 explicit"
    - "Wrapped object response shape { teams: [...] } (NOT a bare array) so future fields (cachedAt, abbreviation) can be added without breaking consumers — matches existing /sports + /sports/:league style"

key-files:
  modified:
    - vigil-core/src/services/sports-service.ts
    - vigil-core/src/services/sports-service.test.ts
    - vigil-core/src/routes/sports.ts
    - vigil-core/src/routes/sports.test.ts

key-decisions:
  - "TEAMS_CACHE_TTL_MS = 24h (D-07): rosters rarely change AND BDL free-tier rate limit is 5 req/min — long TTL keeps total outbound traffic to ~4 calls per 24h regardless of user count"
  - "Cache is GLOBAL not per-user (D-07): team rosters are public BDL data identical for all users, so sharing is the design — sets teamsCache.set(league, ...) keyed by League enum, NEVER by userId"
  - "Per-league name normalization at service layer (D-08): MLB uses display_name, NFL/NBA/NHL use full_name — collapses BDL divergence so the route + PWA see one TeamListEntry contract"
  - "BDL team_id returned as STRING (D-05): direct drop-in for the existing team_ids[]=<id> string concatenation in fetchLeagueMLB/NFL/NBA/NHL — no translation layer needed downstream"
  - "Body shape { teams: TeamListEntry[] } not a bare array (D-06): wrapped object lets future fields (cachedAt, abbreviation) ride along without breaking PWA consumers"
  - "Route ordering: /sports → /sports/selections → /sports/teams/:league → /sports/:league — literal /teams/ segment registered BEFORE the :league param so Hono dispatches correctly"
  - "isFresh parameterized with default = CACHE_TTL_MS (one-line signature change) instead of duplicating the helper as isFreshTeams — minimal surface change, existing call sites untouched"
  - "userId NOT required by GET /sports/teams/:league handler: bearer gate still applies via global dispatcher, but the response is identical for all authenticated users (cache is shared per D-07)"

patterns-established:
  - "Parameterized TTL + global-cache pattern at the service factory: any future read-only public-data caches in sports-service or beyond can replicate the (Map keyed by typed enum) + (isFresh(entry, ttl)) shape"
  - "Per-league field normalization at service boundary: per-league readers select the right BDL field; route + downstream consumers see a uniform TeamListEntry shape"
  - "Wrapped-object response for list endpoints (NOT bare arrays): forward-compatible with future fields without breaking consumers"

requirements-completed: [SPORTS-01]

duration: ~4min
completed: 2026-04-28
---

# Phase 116 Plan 02: Teams endpoint + 24h cache Summary

**Added `fetchTeams(league)` to createSportsService with a 24-hour global in-memory cache and per-league BDL field normalization (MLB display_name vs others full_name), plus a new `GET /v1/sports/teams/:league` route returning `{ teams: [{ id: string, name: string }] }` alphabetically sorted — registered before the existing `/sports/:league` param route so Hono dispatches the literal `/teams/` segment correctly.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-28T18:59:30Z
- **Completed:** 2026-04-28T19:03:19Z
- **Tasks:** 2
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

- New `TEAMS_CACHE_TTL_MS = 24 * 60 * 60 * 1000` constant — 24h TTL specifically for the teams cache, separate from the existing 5-min `CACHE_TTL_MS` for game/standings data
- `isFresh(entry, ttlMs?)` signature parameterized with default `= CACHE_TTL_MS` so existing call sites (`getCachedLeague` etc.) work unchanged; teams cache passes the longer TTL explicitly
- New exported `TeamListEntry { id: string; name: string }` interface — id is BDL `team_id` stringified for direct drop-in with existing `team_ids[]=<id>` query strings (D-05)
- New private `BDLTeamRaw` interface tolerates either `display_name` or `full_name` — fetchTeams's per-league reader picks the right field
- New `fetchTeams(league)` method on `createSportsService` factory return:
  - 24h cache hit short-circuits (zero outbound calls)
  - Cache miss fetches from `${BASE_URLS[league]}/teams` via the existing `fetchJSON` helper (T-73-01 BDL key non-disclosure preserved — never logged, never returned)
  - Per-league field normalization: MLB → `display_name`; NFL/NBA/NHL → `full_name` (D-08)
  - `String(raw.id)` stringifies the BDL numeric id (D-05)
  - `localeCompare` alphabetical sort by name
  - Result cached with `Date.now()` fetchedAt timestamp
- `clearCache()` now clears both `cache` and `teamsCache` — required by Test 6 and ensures clean test isolation
- New `GET /sports/teams/:league` Hono handler:
  - Validates `:league` against the existing `VALID_LEAGUES` allowlist (T-116-02-06 / T-73-03 mitigation)
  - Returns `{ teams: TeamListEntry[] }` (wrapped object — D-06)
  - 400 error body is hardcoded `{ error: "Unknown league. Valid: mlb, nfl, nba, nhl" }` — never references `BALLDONTLIE` or `apiKey` (T-116-02-02)
  - Registered BEFORE `/sports/:league` so Hono's first-match dispatch picks the literal `/teams/` segment
  - Bearer-gated via global `bearerAuth` dispatcher (T-116-02-03 inherited from index.ts:191 mount)
- 16 new tests pass: 10 unit (fetchTeams) + 6 route (GET /sports/teams/:league)
- All pre-existing tests still pass: 7 sports-service + 15 sports route tests (3 baseline + 12 from Plan 01)
- Zero new dependencies, zero migrations, zero changes to `index.ts` mount

## Task Commits

Each task was committed atomically with TDD red→green pattern:

1. **Task 1 RED: failing tests for fetchTeams** — `6f2f827` (test)
2. **Task 1 GREEN: fetchTeams implementation** — `ca78b02` (feat)
3. **Task 2 RED: failing route tests for /sports/teams/:league** — `51c5902` (test)
4. **Task 2 GREEN: route handler implementation** — `9f003aa` (feat)

_REFACTOR phase: skipped — both GREEN deltas were minimal and atomic, no cleanup warranted._

## Files Created/Modified

- `vigil-core/src/services/sports-service.ts` (modified) — Added `TEAMS_CACHE_TTL_MS` constant, parameterized `isFresh(entry, ttlMs)`, added `BDLTeamRaw` + exported `TeamListEntry` interfaces, added `teamsCache` Map and `fetchTeams` method to factory body, extended factory return type + return statement to include `fetchTeams`, extended `clearCache` to also clear teams cache.
- `vigil-core/src/services/sports-service.test.ts` (modified) — Appended 10 SPORTS-01-teams-* unit tests covering per-league name normalization (mlb/nfl/nba/nhl), alphabetical sort, cache hit, clearCache eviction, per-league cache isolation, BDL error non-cache, empty data, id stringification.
- `vigil-core/src/routes/sports.ts` (modified) — Inserted `GET /sports/teams/:league` handler between `PUT /sports/selections` (line ~50, from Plan 01) and `GET /sports/:league` (line 88) so Hono first-match dispatch picks the literal `/teams/` segment over the param route.
- `vigil-core/src/routes/sports.test.ts` (modified) — Appended 6 SPORTS-01-teams-route-* tests with `makeTeamsRouterApp + makeTeamsFetch` helpers covering each league (mlb/nfl/nba/nhl), unknown league 400, no-leak invariant.

## Decisions Made

All decisions inherited from `116-CONTEXT.md` (D-05 string id, D-06 endpoint shape, D-07 cache, D-08 name normalization). Plan-writer's recommendations applied verbatim:

- **Parameterized `isFresh` with default = CACHE_TTL_MS** — picked over duplicating into `isFreshTeams` because the one-line signature change is less surface than a new helper. Existing call sites in `getCachedLeague` work unchanged.
- **Wrapped-object response shape `{ teams: [...] }` over bare array** — matches existing `/sports` + `/sports/:league` style and leaves room for future fields (`cachedAt`, etc.) without breaking PWA consumers.
- **Cache eviction via `clearCache()` test (not Date.now mocking)** — Test 6 (`SPORTS-01-teams-cache-cleared-by-clearCache`) calls `service.clearCache()` between two `fetchTeams` calls and asserts fetchFn was called twice. This proves the cache exists AND can be invalidated, which is functionally equivalent to a TTL boundary test for the contract under test, without introducing fake-clock injection.
- **`userId` NOT read in the new handler** — team rosters are public BDL data shared across users (D-07 global cache), so the response is identical for all authenticated users. The bearer gate still applies (inherited from the global dispatcher), but per-user scoping is unnecessary for this read.

## Deviations from Plan

None — plan executed exactly as written. All 16 new tests pass on first GREEN run; pre-existing tests unaffected; `tsc --noEmit` clean.

## Issues Encountered

- **NBA URL substring ambiguity in mocked fetch** — NBA's BDL base URL is `https://api.balldontlie.io/v1` (no league segment), while MLB/NFL/NHL include `mlb/`, `nfl/`, `nhl/` in their paths. The simple substring match `"v1/teams"` would accidentally match the MLB URL `mlb/v1/teams`. Resolved per the plan's explicit guidance: NBA test mocks key on the FULL host-prefixed substring `"api.balldontlie.io/v1/teams"`. No code change needed in production — only the test mock keying.
- **Pre-existing `[vigil-core] DATABASE_URL not set` warning during test run** — informational stderr from the lazy db init at module load; appears in route test output but does NOT affect test outcome. Out of scope for this plan (existed before Phase 116).

## Threat Model Bindings

| Threat ID | Mitigation Implemented |
|---|---|
| T-116-02-01 (Information Disclosure — BDL key logged or returned) | `fetchTeams` reuses the existing `fetchJSON` helper unchanged. Key is read from `process.env["BALLDONTLIE_API_KEY"]` only inside fetchJSON's auth header construction (sports-service.ts:282) — never passed to the route handler, never concatenated into error messages (`BDL fetch failed: <url> → <status>` includes only url + status). Asserted by `grep -i "balldontlie\|apikey" vigil-core/src/routes/sports.ts` returning 0 matches in `c.json` bodies (only in informational comments). |
| T-116-02-02 (Information Disclosure — 400 error leaks key surface) | 400 response body is hardcoded literal `{ error: "Unknown league. Valid: mlb, nfl, nba, nhl" }` — no key surface. Asserted by `SPORTS-01-teams-route-no-leak` test that confirms response text never contains `BALLDONTLIE` or `apiKey`. |
| T-116-02-03 (Spoofing — bearer absent) | Inherited via global `bearerAuth` dispatcher mounted before `app.route("/v1", sports)` at index.ts:191. No per-route auth code; architectural gate is the contract. |
| T-116-02-04 (DoS — BDL free-tier rate limit exhausted) | 24h global cache means the FIRST fetch per league hits BDL; subsequent fetches across all users for 24h are served from memory. Worst-case BDL load is 4 calls per 24h regardless of user count. Combined with the existing 5-min league cache, total outbound stays well under 5 req/min. |
| T-116-02-05 (Tampering — cross-user contamination via shared cache) | Accepted by design (D-07): cache stores PUBLIC roster data identical for all users. NO user-specific data ever crosses through this cache. |
| T-116-02-06 (Spoofing — unbounded league param) | Allowlist `VALID_LEAGUES.includes(league as League)` rejects any value that is not exactly `mlb`, `nfl`, `nba`, or `nhl`. Asserted by `SPORTS-01-teams-route-rejects-unknown` test. Path traversal segments (`..`) are absorbed by Hono's URL parser before reaching the handler. |
| T-116-02-07 (Cache key collision across leagues) | `teamsCache` is `Map<League, CacheEntry<TeamListEntry[]>>` keyed by the typed League enum, NOT by URL or string. fetchTeams sets via `teamsCache.set(league, ...)` and reads via `teamsCache.get(league)` — same key for the same league only. Asserted by `SPORTS-01-teams-cache-per-league-isolation` test (mlb + nba produces 2 calls, not 1). |

## Next Phase Readiness

- **Plan 03 (sports-service `selections` param + `disabled` status):** Now unblocked at the service layer — the factory return type is extended cleanly with `fetchTeams`, and Plan 03 only modifies disjoint regions of sports-service.ts (`fetchAllLeagues` signature + per-league dispatcher). Merge order is Plan 02 → Plan 03 (this plan was bumped to Wave 2 specifically because of the file overlap with Plan 01 + Plan 03 in routes/sports.ts and services/sports-service.ts).
- **Plan 04 (brief-assembly threading + renderer all-disabled guard):** Already unblocked by Plan 01's contract; Plan 02 doesn't add new blockers.
- **Plan 05 (PWA Settings UI):** Now unblocked — PWA's `getSportsTeams(league)` typed helper can call the live `GET /v1/sports/teams/:league` endpoint and rely on the `{ teams: [{id, name}] }` body shape per D-06.

No blockers carried forward.

## Self-Check: PASSED

- [x] `vigil-core/src/services/sports-service.ts` modified (TEAMS_CACHE_TTL_MS, fetchTeams, BDLTeamRaw, TeamListEntry, teamsCache, isFresh signature, clearCache extension, factory return)
- [x] `vigil-core/src/services/sports-service.test.ts` modified (10 SPORTS-01-teams-* tests appended)
- [x] `vigil-core/src/routes/sports.ts` modified (GET /sports/teams/:league handler inserted between selections and :league)
- [x] `vigil-core/src/routes/sports.test.ts` modified (6 SPORTS-01-teams-route-* tests appended)
- [x] Commit `6f2f827` exists in git log (Task 1 RED)
- [x] Commit `ca78b02` exists in git log (Task 1 GREEN)
- [x] Commit `51c5902` exists in git log (Task 2 RED)
- [x] Commit `9f003aa` exists in git log (Task 2 GREEN)
- [x] `cd vigil-core && npx tsx --test src/services/sports-service.test.ts` exits 0 (17 pass: 7 pre-existing + 10 new)
- [x] `cd vigil-core && npx tsx --test src/routes/sports.test.ts` exits 0 (21 pass: 3 baseline + 12 from Plan 01 + 6 new)
- [x] `cd vigil-core && npx tsc --noEmit` exits 0
- [x] Route ordering: `/sports/teams/:league` (line 76) BEFORE `/sports/:league` (line 88) in routes/sports.ts
- [x] `app.route("/v1", sports)` still mounted at index.ts:191 (unchanged)
- [x] No new files; no migrations; no new dependencies

---
*Phase: 116-sports-source-picker*
*Completed: 2026-04-28*
