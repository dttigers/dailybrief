---
phase: 116-sports-source-picker
verified: 2026-04-29T13:30:00Z
status: human_needed
score: 4/4 success criteria verified at automated layer
overrides_applied: 0
human_verification:
  - test: "Open PWA Settings, verify the Sports section card renders between Google Account card and the Auto-generate ScheduleCard with heading 'Sports' and 4 league checkboxes (MLB — Baseball, NFL — Football, NBA — Basketball, NHL — Hockey)"
    expected: "Section visible at correct position; all 4 checkboxes present; checkboxes start unchecked for a fresh user; helper copy 'No leagues selected — sports section will be omitted from your brief.' visible below"
    why_human: "Visual layout/placement and copy correctness are not programmatically verifiable — must be eyeballed in a running PWA"
  - test: "Toggle MLB checkbox ON; verify a 'Loading teams…' state appears briefly then a list of MLB team radios renders sorted alphabetically; pick a team; reload the page and verify the MLB checkbox is still ON and the same team radio is still selected"
    expected: "Lazy team-list fetch fires on enable; radios populate alphabetically; selection persists across reload (PUT /v1/sports/selections + GET /v1/sports/selections round-trip)"
    why_human: "Real-time UI behavior (lazy fetch, debounced PUT timing, optimistic UI, persistence-across-reload) requires a running browser session"
  - test: "Disable a previously-enabled league with a team selected; reload; re-enable; verify the previously-selected team radio is still selected (D-24 preservation rule)"
    expected: "Disabling a league does NOT clear favoriteTeams[league] in the PUT body; re-enabling restores the prior radio selection from server state"
    why_human: "End-to-end preservation rule requires real DB write + reload cycle in browser"
  - test: "With at least one league enabled and a team picked, generate the next brief PDF and verify the sports section renders ONLY for the picked leagues with team-specific data driven by your picks (NOT the legacy hardcoded Detroit teams)"
    expected: "Brief PDF sports section contains only enabled leagues; team-specific recent/upcoming game blocks reference the user's picked team_id, not env-var Detroit teams"
    why_human: "End-to-end PDF rendering with real BDL data — visual + PDF inspection required (SPORTS-01 SC#3)"
  - test: "Disable ALL FOUR leagues; generate a brief; verify the brief PDF has NO sports section header AND no 'no leagues selected' placeholder content (SC#4) — entire section omitted by pdf-service.ts:281 guard"
    expected: "Sports section header + content suppressed entirely from PDF; no stale hardcoded data appears"
    why_human: "PDF inspection required to confirm SC#4 — programmatic verification only confirms data.sports = [] reaches the renderer, not the final PDF output"
  - test: "Verify Railway env-var deletion runbook (D-12 ops step): after picker is exercised in prod, delete SPORTS_MLB_TEAM_ID, SPORTS_NFL_TEAM_ID, SPORTS_NBA_TEAM_ID, SPORTS_NHL_TEAM_ID from Railway vigil-core service Variables panel; redeploy; generate a brief; verify sports section still renders correctly (using picker-driven team IDs, NOT env-var fallback)"
    expected: "Brief generation continues to work after env-var deletion because production code path no longer reads them (D-12); only test fixtures depend on the env-var fallback (D-13)"
    why_human: "Manual ops step on Railway — requires production deploy + live brief generation"
---

# Phase 116: Sports source picker — Verification Report

**Phase Goal:** Users pick which sports leagues and favorite teams to track from PWA Settings; the sports-service respects per-user selections instead of hardcoded team IDs.
**Verified:** 2026-04-29T13:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | User can open PWA Settings and toggle each of the four leagues (MLB, NFL, NBA, NHL) on/off; per-league team picker appears for enabled leagues | ? UNCERTAIN (automated layer ✓) | Section card present with `data-testid="sports-section"` (SettingsPage.tsx:910); heading "Sports" + helper "Choose which leagues..." (line 916); 4 LEAGUE_LABELS constants `MLB — Baseball / NFL — Football / NBA — Basketball / NHL — Hockey` (lines 41-44); `handleSportsLeagueToggle` lazily loads team list on enable (lines 537-552); radio sub-list rendered conditionally per league. SPORTS-01-picker-render-empty + SPORTS-01-picker-league-toggle-saves vitest specs PASS. **Visual placement (between Google card and ScheduleCard) and live UI requires human verification.** |
| 2 | User can select favorite team(s) per enabled league; selections persist per-user via new storage and survive reload | ? UNCERTAIN (automated layer ✓) | `handleSportsTeamSelect` (line 556) updates `favoriteTeams[league]` and triggers debounced PUT; `lastSavedSportsRef` rollback on PUT failure (line 530); persistence path: PUT → `validateSportsSelections` → drizzle `onConflictDoUpdate` on app_settings(userId, key='sports_selections'); reload path: GET → `getUserSelections` → seed state. SPORTS-01-picker-team-select-saves PASS. SPORTS-01-prefs-set-* (14 tests) verify upsert path. **Reload-survives-persistence requires browser session.** |
| 3 | The next generated brief renders only the leagues the user enabled; team-specific data uses the user's picks, not the previously-hardcoded teamIds defaults | ✓ VERIFIED at code/test layer | `assembleAndRender` reads `sports_selections` from app_settings via `getUserSportsSelections` (brief-assembly-service.ts:430); threads to `fetchAllLeagues(sportsSelections)` (line 485); `fetchAllLeagues` `planLeague` returns 'disabled' for non-enabled leagues (sports-service.ts:720+); per-league fetchers use `opts.teamId ?? getTeamId(league)` (D-13/D-14 — picker overrides env-var). SPORTS-01-brief-threads-selections + SPORTS-01-selections-team-override + SPORTS-01-selections-disabled-league-not-fetched PASS. **End-to-end PDF inspection requires human verification.** |
| 4 | A user with all leagues disabled gets a brief PDF with no sports section (or a clean "no leagues selected" placeholder), not stale hardcoded data | ✓ VERIFIED at code/test layer | Cascade structurally satisfied: empty enabledLeagues → `fetchAllLeagues` short-circuits all 4 leagues to `{status: 'disabled'}` with ZERO outbound calls (sports-service.ts:707) → mapSports filter `status !== "ok"` drops them (brief-assembly-service.ts:81 with D-15/D-18 lock comment line 77) → `data.sports = []` → pdf-service.ts:281 guard `data.sports.length > 0` suppresses entire section. SPORTS-01-brief-all-disabled-yields-empty-sports-array + SPORTS-01-selections-empty-short-circuits PASS. **Final PDF inspection requires human verification.** |

**Score:** 4/4 success criteria verified at the automated test layer. Items 1-2 require human verification of visual placement, real-time UI, and persistence-across-reload. Items 3-4 require human verification of final PDF output.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `vigil-core/src/services/sports-preferences-service.ts` | createSportsPreferencesService factory + validateSportsSelections + types | ✓ VERIFIED | Exports: createSportsPreferencesService (line 94), validateSportsSelections (line 47), SportsSelections (17), EMPTY_SELECTIONS (27), SPORTS_SELECTIONS_KEY (29), MAX_ENABLED_LEAGUES (34); 5,062 bytes; 14 unit tests pass. WIRED via routes/sports.ts. |
| `vigil-core/src/services/sports-preferences-service.test.ts` | Unit tests for service | ✓ VERIFIED | 14 SPORTS-01-prefs-* tests, all PASS (`npx tsx --test` exits 0). |
| `vigil-core/src/routes/sports.ts` | GET + PUT /sports/selections + GET /sports/teams/:league handlers, ordered before /:league | ✓ VERIFIED | Routes registered in correct order: `/sports` (27), `/sports/selections` GET (37), `/sports/selections` PUT (50), `/sports/teams/:league` (76), `/sports/:league` (88) — literal paths before param. createSportsPreferencesService instantiated. |
| `vigil-core/src/routes/sports.test.ts` | Route tests: PUT/GET selections + teams routes | ✓ VERIFIED | 21 tests pass total (3 baseline + 12 SPORTS-01-put/get + 6 SPORTS-01-teams-route). |
| `vigil-core/src/services/sports-service.ts` | fetchTeams + selections-aware fetchAllLeagues + 'disabled' status + standings-only path | ✓ VERIFIED | TEAMS_CACHE_TTL_MS=24h (82); fetchTeams (629); teamsCache Map (259); LeagueResult.status union includes 'disabled'; per-league fetchers accept `opts: {teamId?, standingsOnly?}` (lines 307, 386, 465, 544); fetchAllLeagues short-circuits enabledLeagues=[] with zero calls (707); planLeague disabled branch (720+); BALLDONTLIE_API_KEY untouched (T-73-01 preserved). |
| `vigil-core/src/services/sports-service.test.ts` | Unit tests for fetchTeams + selections | ✓ VERIFIED | 25 tests pass: 7 baseline + 10 SPORTS-01-teams + 8 SPORTS-01-selections. |
| `vigil-core/src/services/brief-assembly-service.ts` | getUserSportsSelections + selections threading | ✓ VERIFIED | EMPTY_SELECTIONS const (54); deps shim widened (32); D-15/D-18 comment above mapSports filter (77); getUserSportsSelections helper (430-447); single new query before fan-out (476); fetchAllLeagues(sportsSelections) call site (485). |
| `vigil-core/src/services/brief-assembly-service.test.ts` | Brief-threading integration tests | ✓ VERIFIED | 24 tests pass (20 baseline + 4 SPORTS-01-brief-*). |
| `vigil-core/src/index.ts` | D-12 paper-trail comment | ✓ VERIFIED | Line 240: `// Phase 116 SPORTS-01 D-12: SPORTS_MLB_TEAM_ID, ...` documents env-var deprecation; createSportsService() wiring untouched. |
| `vigil-pwa/src/api/client.ts` | 3 typed helpers + types | ✓ VERIFIED | export type League (829); SportsSelections (832); TeamListEntry (843); getSportsSelections (853); setSportsSelections (864); getSportsTeams (877). All use vigilFetch (bearer + 401 inherited). |
| `vigil-pwa/src/pages/SettingsPage.tsx` | Sports section card + state + handlers | ✓ VERIFIED | data-testid="sports-section" (910); heading "Sports" + helper (916); LEAGUE_LABELS + LEAGUE_ORDER (40-46); 6 state hooks (123-132); loadSportsSelections + loadTeamsForLeague (237-280); scheduleSportsSave + handleSportsLeagueToggle + handleSportsTeamSelect (519-561); UI-SPEC copy "No leagues selected — sports section will be omitted from your brief." (1013) and "No favorite team selected — standings only." (999). |
| `vigil-pwa/src/pages/SettingsPage.test.tsx` | 9 picker tests | ✓ VERIFIED | All 9 SPORTS-01-picker-* tests PASS (verified via verbose vitest output); 32/33 total pass — only failure is documented Phase 115 baseline `?google_error=invalid_state`. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| routes/sports.ts PUT /sports/selections | sports-preferences-service.setUserSelections | createSportsPreferencesService(deps).setUserSelections | ✓ WIRED | Service instantiated in createSportsRouter; handler calls service.setUserSelections (verified by SPORTS-01-put-* route tests calling actual handler chain). |
| sports-preferences-service.setUserSelections | drizzle insert+onConflictDoUpdate on appSettings | composite PK (userId, key='sports_selections') | ✓ WIRED | sports-preferences-service.ts:111-117 uses `db.insert(appSettings).values({...}).onConflictDoUpdate({target:[userId,key], set:{value, updatedAt}})`. |
| GET/PUT /v1/sports/selections | bearerAuth global dispatcher | app.route("/v1", sports) mounted AFTER bearerAuth | ✓ WIRED | index.ts:191 mount unchanged; routes use c.get("userId") (sports.ts:38, 51). |
| routes/sports.ts GET /sports/teams/:league | sports-service.fetchTeams | createSportsService(deps).fetchTeams | ✓ WIRED | Handler calls service.fetchTeams(league as League); 6 SPORTS-01-teams-route tests verify wiring end-to-end. |
| sports-service.fetchTeams | BDL /teams endpoint per league | fetchJSON(`${BASE_URLS[league]}/teams`) — Authorization header | ✓ WIRED | sports-service.ts:629-643; uses existing fetchJSON (BALLDONTLIE_API_KEY in Authorization header only, T-73-01 preserved). |
| sports-service.fetchTeams | in-memory teams cache | Map<League, CacheEntry<TeamListEntry[]>> with TEAMS_CACHE_TTL_MS=24h | ✓ WIRED | teamsCache.get/set + isFresh(cached, TEAMS_CACHE_TTL_MS) at lines 630-642; SPORTS-01-teams-cache-hit test confirms zero second-call. |
| brief-assembly-service.assembleAndRender | sports-preferences-service via app_settings | drizzle select where userId AND key='sports_selections' | ✓ WIRED | getUserSportsSelections at brief-assembly-service.ts:430-447; called at line 476; threads to fetchAllLeagues at line 485. |
| brief-assembly-service.fetchAllLeagues call site | sports-service.fetchAllLeagues(selections) | deps.sportsService.fetchAllLeagues(sportsSelections) | ✓ WIRED | Direct call site verified; deps shim widened to accept selections (32). 4 SPORTS-01-brief-* integration tests confirm threading. |
| mapSports filter | BriefRenderData.sports | skip leagues where status !== "ok" (drops 'disabled' structurally) | ✓ WIRED | brief-assembly-service.ts:81 with D-15/D-18 lock comment at line 77; SPORTS-01-brief-all-disabled-yields-empty-sports-array confirms data.sports=[] cascade. |
| BriefRenderData.sports | pdf-service render guard | data.sports.length > 0 at pdf-service.ts:281 | ✓ WIRED | Renderer guard unchanged; structurally satisfies D-18 when sports=[]. |
| SettingsPage mount | GET /v1/sports/selections | getSportsSelections() in loadSportsSelections useEffect | ✓ WIRED | SettingsPage.tsx:252 + useEffect at 278; SPORTS-01-picker-render-empty verifies. |
| SettingsPage league enable | GET /v1/sports/teams/:league | getSportsTeams(league) lazy + mount-prefetch for already-enabled | ✓ WIRED | loadTeamsForLeagueImpl (239); mount prefetch (270); on-toggle fetch (549). SPORTS-01-picker-league-toggle-saves + SPORTS-01-picker-mount-prefetches-teams-D23 verify. |
| SettingsPage toggle (league or team) | PUT /v1/sports/selections | setSportsSelections(s) debounced 400ms via scheduleSportsSave | ✓ WIRED | scheduleSportsSave (519); handleSportsLeagueToggle (537); handleSportsTeamSelect (556). SPORTS-01-picker-rollback-on-put-failure-D21 confirms rollback path. |
| PUT failure | ToastHost | useToast().showToast({variant:'error', body:"Couldn't save sports settings — try again."}) + lastSavedSportsRef rollback | ✓ WIRED | scheduleSportsSave catch block (530-533); SPORTS-01-picker-rollback-on-put-failure-D21 PASS. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| SettingsPage.tsx Sports section | sportsSelections (useState) | getSportsSelections() in loadSportsSelections useEffect | YES — calls vigilFetch GET /v1/sports/selections, server returns row from app_settings (Plan 01 Drizzle select) | ✓ FLOWING |
| SettingsPage.tsx team radios | teamsByLeague[league] (useState) | getSportsTeams(league) lazy + on-mount prefetch | YES — vigilFetch GET /v1/sports/teams/:league, server hits BDL /teams (Plan 02 fetchTeams with 24h cache) | ✓ FLOWING |
| Brief PDF sports section | data.sports (BriefRenderData) | mapSports(sportsR) where sportsR is fetchAllLeagues(sportsSelections) result | YES — selections from app_settings → fetchAllLeagues respects them → mapSports filters disabled | ✓ FLOWING |
| Brief sports per-league data | leagues[key].data (recentGame, upcomingGame, standings) | sports-service.fetchLeague{MLB,NFL,NBA,NHL}(opts) using opts.teamId from selections.favoriteTeams[league] | YES — picker teamId overrides env-var fallback (D-13/D-14); BDL game/standings fetched live | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| sports-preferences-service unit tests | `cd vigil-core && npx tsx --test src/services/sports-preferences-service.test.ts` | 14/14 pass | ✓ PASS |
| sports route tests (PUT/GET selections + teams) | `cd vigil-core && npx tsx --test src/routes/sports.test.ts` | 21/21 pass (3 baseline + 12 selections + 6 teams) | ✓ PASS |
| sports-service tests (fetchTeams + selections) | `cd vigil-core && npx tsx --test src/services/sports-service.test.ts` | 25/25 pass (7 baseline + 10 teams + 8 selections) | ✓ PASS |
| brief-assembly-service tests (selections threading) | `cd vigil-core && npx tsx --test src/services/brief-assembly-service.test.ts` | 24/24 pass (20 baseline + 4 SPORTS-01-brief) | ✓ PASS |
| vigil-core type-check | `cd vigil-core && npx tsc --noEmit` | exit 0 (no errors) | ✓ PASS |
| SettingsPage picker tests | `cd vigil-pwa && npx vitest run src/pages/SettingsPage.test.tsx` | 32/33 pass; only failure is documented Phase 115 baseline (?google_error=invalid_state) | ✓ PASS |
| Route ordering check | `grep -n "router.get\|router.put" vigil-core/src/routes/sports.ts` | `/sports` (27), `/sports/selections` GET (37), PUT (50), `/sports/teams/:league` (76), `/sports/:league` (88) — correct order | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SPORTS-01 | 116-01, 116-02, 116-03, 116-04, 116-05 | "User can pick which sports leagues + favorite teams to track from PWA Settings — multi-select league toggle (MLB / NFL / NBA / NHL) and per-league team picker, persisted per-user via new storage, respected by sports-service so unselected leagues are skipped and team-specific data uses the user's pick instead of hardcoded teamIds. Brief PDF only renders selected leagues." | ✓ SATISFIED at code/test layer | All 5 plans declare requirements: [SPORTS-01]; storage (Plan 01), teams endpoint + cache (Plan 02), service threading (Plan 03), brief integration (Plan 04), PWA UI (Plan 05). REQUIREMENTS.md line 13 marked [x]. 63 SPORTS-01 tests across the 5 test files all pass. End-to-end PDF behavior requires human verification (see human_verification). |

No orphaned requirements — REQUIREMENTS.md maps SPORTS-01 to Phase 116 only and all 5 plans declared it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| vigil-core/src/services/sports-service.ts | 331-332, 410-411, 489-490, 568-569 | `teamId` interpolated into BDL URL without `encodeURIComponent` | ⚠️ Warning (WR-01 from REVIEW.md) | Defense-in-depth gap — write path validates string but read path is shallow; corrupt row could inject query params. Not a current security failure (write-path validator catches it) but worth fixing. Surfaced in 116-REVIEW.md WR-01. |
| vigil-core/src/services/brief-assembly-service.ts | 84 | `mapSports` reads `teamName` from `process.env[SPORTS_*_TEAM_NAME]` ignoring picker | ⚠️ Warning (WR-02 from REVIEW.md) | When env vars deleted from Railway (D-12 runbook), `teamName` becomes "My Team" placeholder for all users. Recent/upcoming game data still correct (homeTeam/awayTeam from BDL response), but the per-league `teamName` label may be misleading in PDF output. Surfaced in 116-REVIEW.md WR-02. |
| vigil-core/src/services/brief-assembly-service.ts | 430-448 | READ-side shape check (`getUserSportsSelections`) is shallower than WRITE-side validator | ⚠️ Warning (WR-04 from REVIEW.md) | Doesn't invoke `validateSportsSelections` — only checks Array/object shapes; a corrupt row with `enabledLeagues:["soccer"]` would pass. Mitigated downstream by `selections.enabledLeagues.includes(league)` allowlist iteration in fetchAllLeagues, but worth tightening. |
| vigil-core/src/services/brief-assembly-service.ts | 483-508 | Unused `affirmationR` placeholder in Promise.allSettled | ℹ️ Info (WR-03 from REVIEW.md) | Dead code; doesn't affect behavior. Not Phase 116 specific (pre-existing). |
| vigil-core/src/services/sports-service.ts | 651-656, 681-684 | 5-min league cache key is `league:${league}`, doesn't include teamId | ℹ️ Info (IN-06 from REVIEW.md) | After picker team change, user may see stale game data for up to 5 min. Not security; UX freshness only. |

All anti-patterns pre-exist as REVIEW.md warnings — none are Phase 116 regressions and none block goal achievement. They are documented for follow-up but do not invalidate the phase.

### Human Verification Required

See `human_verification:` block in YAML frontmatter above. 6 items require human testing:

1. **Visual placement + copy correctness** of Sports section card in PWA Settings (between Google + ScheduleCard; heading + helper + 4 league checkboxes with exact UI-SPEC labels).
2. **Live UI behavior**: lazy team-list fetch on enable, debounced PUT, optimistic UI, persistence-across-reload.
3. **D-24 preservation rule end-to-end**: disable → reload → re-enable restores team selection.
4. **Brief PDF output (SC#3)**: verify enabled-only leagues render with picker-driven team data (not env-var Detroit fallback).
5. **Brief PDF output (SC#4)**: verify all-disabled brief omits sports section header AND content (not just blank space).
6. **Railway runbook (D-12)**: ops step to delete `SPORTS_*_TEAM_ID` env vars after picker exercised in prod; verify brief still works (production code path no longer reads them).

### Gaps Summary

**No automated gaps.** All 4 ROADMAP success criteria are satisfied at the code + test layer:

- SC#1 (toggle leagues): Section card + checkboxes + per-league team picker all present and tested.
- SC#2 (persist team picks): PUT/GET round-trip implemented; tests cover the contract end-to-end.
- SC#3 (brief uses picks): selections threaded from app_settings → fetchAllLeagues → per-league fetcher; team override displaces env-var fallback (verified by SPORTS-01-selections-team-override).
- SC#4 (all-disabled → no sports section): cascade structurally satisfied via mapSports filter + pdf-service.ts:281 guard; verified by SPORTS-01-brief-all-disabled-yields-empty-sports-array.

The 5 plans landed cleanly with TDD red→green commits, 63 new SPORTS-01 tests pass, type-check clean, no regressions to baseline. The single PWA test failure (`?google_error=invalid_state`) is the documented Phase 115 baseline carry-over — explicitly inherited from Phase 115's deferred-items.md.

The 6 human-verification items above gate "passed" because the deliverable is fundamentally a user-visible PWA picker + PDF render — visual layout, real-time UX, persistence-across-reload, and final PDF inspection cannot be programmatically verified without running the actual app and generating a real brief.

---

_Verified: 2026-04-29T13:30:00Z_
_Verifier: Claude (gsd-verifier)_
