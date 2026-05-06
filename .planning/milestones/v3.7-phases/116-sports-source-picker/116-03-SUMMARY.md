---
phase: 116-sports-source-picker
plan: 03
subsystem: api
tags: [sports, balldontlie, selections, disabled-status, standings-only, cache-bypass]

requires:
  - phase: 116-01
    provides: SportsSelections type + sports-preferences-service.ts (so sports-service.ts can import the type)
  - phase: 116-02
    provides: fetchTeams, TeamListEntry, TEAMS_CACHE_TTL_MS, parameterized isFresh — Plan 03 must not regress any of these
provides:
  - fetchAllLeagues(selections?: SportsSelections) — selections-aware fan-out (D-14)
  - LeagueResult.status union extended with 'disabled' (D-15)
  - Per-league fetchers (MLB/NFL/NBA/NHL) accept opts: { teamId?, standingsOnly? }
  - All-disabled short-circuit before Promise.allSettled fan-out (D-17, zero outbound calls)
  - Standings-only path when league enabled but no favorite team (D-16)
  - D-13 legacy env-var fallback retained for test fixtures (sports-service.test.ts:7-10)
  - SportsSelections re-exported from sports-service.js for downstream consumers
affects: [116-04 brief-assembly threading, 116-05 PWA Settings UI (already unblocked at API contract)]

tech-stack:
  added: []
  patterns:
    - "Optional-parameter signature widening preserves backward compatibility: fetchAllLeagues() works exactly as before; fetchAllLeagues(selections) is the new prod entry point"
    - "Discriminated planning function (planLeague) returns either an opts object OR the literal 'disabled' — branches the fan-out cleanly without scattering disabled-checks across each fetcher"
    - "Per-fetcher opts: { teamId?, standingsOnly? } pattern — caller decides intent (selections-driven prod path vs env-var legacy fallback) at the dispatch boundary; fetcher implementation stays simple"
    - "Cache bypass for standings-only requests: cache key is league:${league} (selections do NOT enter the key), so standings-only must NOT poison the full-fetch cache and vice versa — the single boolean opts.standingsOnly gates both read and write paths"
    - "Hard-coded league iteration (T-116-03-01 mitigation): fetchAllLeagues iterates only the four literal League values, never selections.enabledLeagues — corrupted entries (e.g., 'soccer') are structurally unreachable as fetched leagues"
    - "'disabled' is NOT a partial signal: partial flag is true ONLY when status is error/off_season; intentional opt-outs do not surface as 'partial: true' in the response"

key-files:
  created: []
  modified:
    - vigil-core/src/services/sports-service.ts
    - vigil-core/src/services/sports-service.test.ts

key-decisions:
  - "Optional selections parameter (D-13/D-14): fetchAllLeagues() preserves the legacy env-var path so existing test fixtures work unchanged; production code (Plan 04 onward) always passes selections, making the env-var path dead in prod"
  - "LeagueResult.status += 'disabled' (D-15): single union extension keeps the response shape stable across all four leagues — renderer (Plan 04) checks status === 'disabled' and suppresses that section without needing optional keys"
  - "Standings-only branch lives inside each per-league fetcher (D-16): standings URL is shared shape across all four leagues, but the fetcher already owns BASE_URLS[league] and normalizeStandings — co-locating the branch means no new helper to wire"
  - "All-disabled short-circuit BEFORE Promise.allSettled (D-17): zero outbound HTTP guaranteed by control-flow ordering, not by fetcher-side opt-outs — verified via mockFetch.calls.length === 0 assertion"
  - "Cache bypass for standings-only: cache key is league:${league}; selections do NOT enter the key. Skipping both read and write for standings-only avoids cross-request contamination (T-116-03-06)"
  - "Hard-coded league iteration in fetchAllLeagues (T-116-03-01): only the four literal League values are iterated by Promise.allSettled — corrupted enabledLeagues entries are silently dropped because the iteration list is fixed in source, not derived from input"
  - "T-73-01 BDL key non-disclosure preserved: BALLDONTLIE_API_KEY only at the existing fetchJSON line; no new logging/echoing introduced; standings-only branch reuses fetchJSON unchanged"

patterns-established:
  - "Optional-parameter signature widening for backward-compatible API evolution — extends without breaking existing call sites or test fixtures (legacy env-var path preserved by D-13)"
  - "Discriminated 'plan or disabled' helper inside the dispatcher: cleanly separates 'should we fetch?' from 'how should we fetch?' — replaces would-be scattered if-disabled checks across each fetcher"
  - "Cache-key-vs-request-shape isolation: when a single cache key serves multiple request shapes, the bypass-on-non-canonical-shape pattern (skip read AND write) prevents poisoning"

requirements-completed: [SPORTS-01]

duration: ~5min
completed: 2026-04-29
---

# Phase 116 Plan 03: Selections-aware fetchAllLeagues Summary

**Threaded `SportsSelections` through `sports-service.ts` so `fetchAllLeagues(selections?)` respects per-user picker selections (D-14): non-enabled leagues return `{ status: 'disabled' }` with zero HTTP calls (D-15/D-17), enabled leagues with no favorite team fetch standings-only (D-16), and the legacy `SPORTS_*_TEAM_ID` env-var path is retained as a test-only fallback (D-13). Extended `LeagueResult.status` union with `'disabled'`; standings-only requests bypass the league cache to avoid contamination. 8 new tests pass; baseline + Plan 02 tests untouched.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-29 (Phase 116 P03 execution)
- **Completed:** 2026-04-29
- **Tasks:** 1 (TDD: RED → GREEN, no REFACTOR)
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- **`LeagueResult` union extended** with `'disabled'` — disabled leagues stay shape-stable in the response (`{ status: 'disabled' }`, no `data` field) so the renderer (Plan 04) can branch on `status === 'disabled'` to suppress that section
- **`SportsSelections` imported and re-exported** from `sports-service.ts` — downstream consumers (brief-assembly Plan 04) can import from either `sports-preferences-service.js` (origin) or `sports-service.js` (re-export); avoids circular imports because the type alias `League` matches by literal-string equivalence, not nominal identity
- **Per-league fetchers (`fetchLeagueMLB/NFL/NBA/NHL`)** accept `opts: { teamId?: string; standingsOnly?: boolean }`:
  - `teamId` defaults to `getTeamId(league)` (D-13 legacy env-var fallback)
  - `standingsOnly` short-circuits to a single standings fetch returning `{ recentGame: null, upcomingGame: null, standings: [...] }`
  - The internal `parseInt(teamId, 10)` (used to identify home/away in normalizers) now reads the resolved `teamId` variable, not a second `getTeamId()` call — so per-user selections override env-var Detroit teams correctly
- **`fetchLeague` dispatcher widened** to accept and pass-through opts. Cache check + cache write are gated on `!opts.standingsOnly` so standings-only requests don't poison the `league:${league}` cache and full requests don't read stale standings-only data
- **`fetchAllLeagues(selections?)` is the new entry point**:
  - When `selections` is undefined: legacy path, all four leagues fetched via `getTeamId()` env-var (preserves `sports-service.test.ts:7-10` Detroit fixtures)
  - When `selections.enabledLeagues.length === 0`: short-circuit BEFORE `Promise.allSettled`, all four leagues marked `'disabled'`, ZERO outbound HTTP (D-17)
  - Otherwise: each league is independently planned via `planLeague(league)` returning either a fetch opts object OR the literal `'disabled'`. Disabled leagues skip `fetchLeague` entirely (no cache hit, no HTTP)
  - `partial` flag treats `'disabled'` as intentional, NOT as a partial signal: `partial = some(l => l.status !== 'ok' && l.status !== 'disabled')`
- **Factory return type widened**: `fetchLeague: (league, opts?) => Promise<LeagueResult>`, `fetchAllLeagues: (selections?) => Promise<SportsResponse>`. Existing call sites (`routes/sports.ts:28` and `brief-assembly-service.ts:439` shim) continue to compile because all new params are optional
- **8 new unit tests pass** + 7 baseline + 10 Plan-02 teams = 25 total; 21 route tests still green; `tsc --noEmit` clean
- Zero new dependencies, zero migrations, zero changes to `index.ts` mount, zero changes to `routes/sports.ts`

## Task Commits

Each task committed atomically with TDD red→green pattern:

1. **Task 1 RED: failing tests for selections-aware fetchAllLeagues** — `7c56f1a` (test)
2. **Task 1 GREEN: SportsSelections threaded through fetchAllLeagues** — `cc14729` (feat)

_REFACTOR phase: skipped — GREEN delta was clean (no duplication needing extraction, no awkward intermediate states), so no cleanup warranted._

## Files Created/Modified

- `vigil-core/src/services/sports-service.ts` (modified) — Header comment expanded with Phase 116 SPORTS-01 policy block; `LeagueResult.status` union extended; `SportsSelections` import + re-export; per-league fetchers (×4) accept `opts: { teamId?, standingsOnly? }` with D-13 fallback and D-16 standings-only branch; `parseInt(teamId, 10)` uses resolved `teamId` variable (not redundant `getTeamId()` call); `fetchLeague` dispatcher widened with cache-bypass for standings-only; `fetchAllLeagues(selections?)` short-circuits when enabledLeagues=[], otherwise plans each league independently; factory return type widened with optional opts/selections.
- `vigil-core/src/services/sports-service.test.ts` (modified) — Appended 8 SPORTS-01-selections-* tests covering: legacy undefined-selections path uses env-var teamId 116, empty selections short-circuits with zero HTTP, disabled-league not fetched, standings-only when no team, team-id override displaces env-var, response shape stable, disabled bypasses cache (poisoning check via toggle test), and compile-only `'disabled'` status assignment.

## Decisions Made

All decisions inherited from `116-CONTEXT.md` (D-13 through D-17). Plan-writer's recommendations applied verbatim:

- **Optional `selections` parameter over required**: `fetchAllLeagues()` (no arg) works unchanged so test fixtures don't need rewriting; production code in Plan 04 will always pass selections, making the legacy path dead in prod and live in tests (D-13).
- **Internal `parseInt(teamId)` references the resolved `teamId` variable, not a second `getTeamId()` call**: the original code at lines 317/377/437/497 read the env-var twice (once for URL, once for the home/away identifier). This was a latent bug for selections — the URL would use the picker team but the home/away identifier would use the env-var Detroit team. Fixed inline by reusing the local `teamId` const that's already resolved with `opts.teamId ?? getTeamId(league)`. Documented as a Rule 1 deviation below.
- **Cache bypass for standings-only**: skipping both read AND write avoids cross-request contamination since the cache key (`league:${league}`) doesn't include selections. Picked over keying selections into the cache because selections affect WHAT is fetched, not WHETHER caching happens — and standings-only is a different request shape, not a different selection of the same shape.
- **`partial` excludes `'disabled'`**: an opt-out is not a degradation. Renderer-side (Plan 04 D-18) will detect "all disabled" specifically; mid-state partial only fires for actual fetch failures.
- **No new helper for the standings URL**: each fetcher already constructs `${BASE_URLS[league]}/standings?season=2026` inline; co-locating the standings-only branch with the fetcher avoids a new shared utility for one URL pattern.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed double-read of getTeamId() in per-league fetchers** — During implementation I noticed each per-league fetcher called `getTeamId(league)` twice: once at the top to build URLs, and again later (e.g., `parseInt(getTeamId("mlb"), 10)`) for the home/away identifier in normalizers. With the new selections path, the URL would use the user's picked team but the home/away match would still use the env-var team — incorrect home/away resolution for any user not on the Detroit teams. Fixed inline by reusing the local `teamId` const (now resolved as `opts.teamId ?? getTeamId(league)`) for the parseInt call too. Pre-existing baseline tests still pass (env-var path: same numeric value, no behavior change). New `SPORTS-01-selections-team-override` test exercises this exact scenario.

   - **Found during:** Task 1 GREEN
   - **Files modified:** `vigil-core/src/services/sports-service.ts` (4 sites: MLB line 350, NFL line 377, NBA line 437, NHL line 497)
   - **Commit:** `cc14729`

## Issues Encountered

- **Type-level RED phase verification**: After writing the 8 new tests, `tsx --test` ran them against the unchanged `sports-service.ts` and several passed silently (because `fetchAllLeagues()` with no arg ran the legacy path), so I separately ran `tsc --noEmit` to confirm RED at the type level too — got 8 errors (`fetchAllLeagues` doesn't accept arg, `'disabled'` not in union). Confirmed full RED state before implementing GREEN.
- **`SportsSelections` re-export pattern**: Per the plan's interface spec, the local `League` alias inside `sports-service.ts` and the imported one from `sports-preferences-service.ts` are by-coincidence-equivalent literal-string unions. To avoid a circular import / re-aliasing dance, the file imports `SportsSelections` only and re-exports it (`export type { SportsSelections }`). The local `League` type stays unchanged.

## Threat Model Bindings

| Threat ID | Mitigation Implemented |
|---|---|
| T-116-03-01 (Tampering — corrupted enabledLeagues) | `fetchAllLeagues` iterates ONLY the four hard-coded league literals (mlb, nfl, nba, nhl) via the fixed-shape `[mlbResult, nflResult, nbaResult, nhlResult] = await Promise.allSettled([fetchOrDisabled("mlb"), ...])`. Any value in `selections.enabledLeagues` that doesn't match one of these literals is structurally unreachable — `planLeague` returns 'disabled' because `selections.enabledLeagues.includes(league)` is false for the four literals when corrupted strings are present. NO outbound call is constructed from a string outside the four-league allowlist. |
| T-116-03-02 (Tampering — favoriteTeams URL injection) | `teamId` is interpolated as `team_ids[]=${teamId}` into a fixed BDL URL string (`${BASE_URLS[league]}/games?...`). Path segments are fixed in source — even if `teamId` contains URL-special characters, the BDL parser treats them as part of the query value. Defense-in-depth: Plan 01's `validateSportsSelections` rejects non-string `favoriteTeams` values at the WRITE path; the READ path forwards the validated string. |
| T-116-03-03 (Information Disclosure — disabled leaks preferences) | Accept (per CONTEXT). `fetchAllLeagues` result is returned ONLY to the authenticated calling user via brief-assembly (Plan 04). Not cached cross-user, not exposed via a separate route, not logged. |
| T-116-03-04 (DoS — picker spam) | Mitigated by the existing 5-min league cache + brief generation gate (only fires at scheduled brief or on-demand from PWA Brief page; not from picker UX). |
| T-116-03-05 (Tampering — NaN/negative teamId) | `favoriteTeams` values are typed `string` per `SportsSelections` interface AND validated at the WRITE path (Plan 01). The READ path uses them as opaque strings; BDL returns empty data for invalid values which surfaces as `off_season` — graceful degradation, not a security boundary crossing. |
| T-116-03-06 (Cache poisoning) | Cache (`getCachedLeague`/`setCachedLeague`) is gated on `!opts.standingsOnly` for both read AND write paths. Standings-only results are NEVER cached and NEVER served from cache. Full-fetch and standings-only requests never share cache state for the same league. |

## Next Phase Readiness

- **Plan 04 (brief-assembly threading + renderer all-disabled guard):** Now unblocked at the service layer — `fetchAllLeagues(selections)` is live and returns `{ status: 'disabled' }` for non-enabled leagues. Plan 04 reads `selections` from `app_settings` via Plan 01's `getUserSelections`, passes through to `fetchAllLeagues`, and adds the renderer guard (D-18). The brief-assembly typed shim at `brief-assembly-service.ts:32` (`sportsService?: { fetchAllLeagues: () => Promise<SportsResponse> }`) is structurally compatible with the new signature (optional param); Plan 04 will widen the shim type as part of its implementation.
- **Plan 05 (PWA Settings UI):** Already unblocked by Plans 01+02 contracts; Plan 03 doesn't add new blockers.

No blockers carried forward.

## Self-Check: PASSED

- [x] `vigil-core/src/services/sports-service.ts` modified (LeagueResult union, SportsSelections import/re-export, per-league fetcher opts, fetchLeague dispatcher, fetchAllLeagues selections-aware, factory return type, header comment)
- [x] `vigil-core/src/services/sports-service.test.ts` modified (8 SPORTS-01-selections-* tests appended)
- [x] Commit `7c56f1a` exists in git log (Task 1 RED)
- [x] Commit `cc14729` exists in git log (Task 1 GREEN)
- [x] `cd vigil-core && npx tsx --test src/services/sports-service.test.ts` exits 0 (25 pass: 7 baseline + 10 Plan 02 + 8 Plan 03)
- [x] `cd vigil-core && npx tsx --test src/routes/sports.test.ts` exits 0 (21 pass: 3 baseline + 12 Plan 01 + 6 Plan 02; route call site `service.fetchAllLeagues()` unaffected)
- [x] `cd vigil-core && npx tsc --noEmit` exits 0
- [x] `grep -nc 'status: "ok" | "error" | "off_season" | "disabled"' src/services/sports-service.ts` = 1 (LeagueResult union extended)
- [x] `grep -nc 'selections?: SportsSelections' src/services/sports-service.ts` = 2 (factory return type + fetchAllLeagues signature)
- [x] `grep -nc 'import type { SportsSelections } from "./sports-preferences-service' src/services/sports-service.ts` = 1
- [x] `grep -c 'standingsOnly' src/services/sports-service.ts` = 16 (>= 8 required: 4 fetcher signatures + 4 standings-only branches + dispatcher × 2 + planLeague × 3 + cache-bypass × 2 + comment × 1)
- [x] `grep -nc 'enabledLeagues.length === 0' src/services/sports-service.ts` = 1 (D-17 short-circuit)
- [x] `grep -c '{ status: "disabled" }' src/services/sports-service.ts` = 5 (4 in the all-disabled object + 1 in fetchOrDisabled)
- [x] `grep -c 'opts.teamId ?? getTeamId' src/services/sports-service.ts` = 4 (one per league fetcher)
- [x] `grep -c 'test("SPORTS-01-selections-' src/services/sports-service.test.ts` = 8
- [x] `function getTeamId` STILL exists in src/services/sports-service.ts (D-13 legacy fallback function preserved)
- [x] BALLDONTLIE_API_KEY appears at fetchJSON read site (line ~296) only — no new logging/echoing introduced (other match is the pre-existing security comment at line 4)
- [x] Plan 01 + Plan 02 artifacts unchanged: `sports-preferences-service.ts` untouched; `fetchTeams`, `TEAMS_CACHE_TTL_MS`, `TeamListEntry` all still present in sports-service.ts

---
*Phase: 116-sports-source-picker*
*Completed: 2026-04-29*
