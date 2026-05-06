# Phase 116: Sports source picker - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

PWA Settings exposes per-user controls to (1) toggle each of MLB/NFL/NBA/NHL on/off and (2) pick one favorite team per enabled league. Selections persist per-user in `app_settings`. The next generated brief renders only the user's enabled leagues, and uses the user's favorite team (not the previously-hardcoded `SPORTS_*_TEAM_ID` env vars) for game data. With all leagues disabled the brief omits the sports section entirely.

**Out of scope:** Multiple favorite teams per league (UI-SPEC locks single-select radio per league). Scheduling rules per league (no "weekday-only NHL"). Team color/logo metadata (server returns `{id, name}` only). New brief sections beyond what already exists. Calendar source picker (Phase 115, shipped). Auth-email rate-limit UX (Phase 117).

</domain>

<decisions>
## Implementation Decisions

### Storage shape (server)
- **D-01:** Persist user sports preferences in the existing `app_settings` table with `key='sports_selections'`, `value` jsonb. The composite PK `(user_id, key)` from Phase 102 already supports per-user config; no migration needed beyond writing rows. Pattern matches existing per-user keys like `user_timezone`, `print_schedule`.
- **D-02:** `value` jsonb shape: `{ enabledLeagues: ("mlb"|"nfl"|"nba"|"nhl")[], favoriteTeams: { mlb?: string; nfl?: string; nba?: string; nhl?: string } }`. Strings are **BDL team_ids** (see D-05), NOT team names — the UI-SPEC line about "balldontlie full_name / display_name" is amended in plan-phase to say "BDL team_id as string".
- **D-03:** New endpoints `GET /v1/sports/selections` and `PUT /v1/sports/selections`. PUT accepts `{ enabledLeagues, favoriteTeams }` and **wholesale-replaces** the row's value (idempotent; mirrors Phase 115 D-02 calendar pattern). GET returns the current row or the empty default `{ enabledLeagues: [], favoriteTeams: {} }` when no row exists.
- **D-04:** Both handlers live in the existing `vigil-core/src/routes/sports.ts` (alongside `GET /sports` and `GET /sports/:league`). No new routes file. The router is already mounted at `/v1` in `index.ts:191`.
- **D-04a:** New service `vigil-core/src/services/sports-preferences-service.ts` with `createSportsPreferencesService({ dbSelectFn?, dbUpsertFn? })` factory. Exposes `getUserSelections(userId)` and `setUserSelections(userId, selections)`. Validation (whitelist league keys, string check on team values, max-4 enabled leagues, max-1 favorite team per league) is single-sourced here; route catches the throw and maps to 400 — same pattern as Phase 115 calendar-service `validateCalendarIds` (T-115-01-02 / -03 mitigation).
- **D-04b:** Per-user scoping follows Phase 109 D-11/D-12 / Phase 115 D-05: `userId = c.get("userId")`, NEVER read from request body. Returns 401 if bearer absent (existing `bearerAuth` middleware handles this).

### Team identity + list source
- **D-05:** `favoriteTeams.<league>` stores the **BDL team_id as a string** (e.g., `"10"` for the Yankees). Direct drop-in for `sports-service.ts` which already accepts a string per league via `deps.teamIds[league]` and uses it in `team_ids[]=<id>` query strings. The PWA picker shows the team name but persists the id.
- **D-06:** New endpoint `GET /v1/sports/teams/:league` (alongside the existing `GET /sports/:league`). Server proxies BDL `/teams` per league, returns a normalized array `[{ id: string, name: string }]` sorted alphabetically by `name`. PWA fetches lazily when a league is first enabled (or on Settings mount if the league is already enabled, since selection-driven fetches must be visible immediately).
- **D-07:** Server-side teams cache: 24-hour TTL, in-memory `Map`, mirrors the existing `CACHE_TTL_MS` pattern in `sports-service.ts` (line 67) but with longer TTL since rosters rarely change. Cache key: `teams:${league}`. Lives inside the new `getTeamsForLeague` helper or extends `createSportsService` with `fetchTeams(league)`.
- **D-08:** Per-league name normalization (BDL field names differ): MLB → `display_name`, NBA/NFL/NHL → `full_name`. Server normalizes; PWA only sees the uniform `{id, name}` shape. Adding `abbreviation` to the response is **deferred** — UI-SPEC uses full team names in the picker.
- **D-09:** New typed PWA helpers in `vigil-pwa/src/api/client.ts`: `getSportsSelections(): Promise<SportsSelections>`, `setSportsSelections(s: SportsSelections): Promise<void>`, `getSportsTeams(league): Promise<Array<{id: string; name: string}>>`. Use existing `vigilFetch` (handles bearer + 401 redirect + `vigil:edit-ended` semantics).

### Defaults + existing-user migration
- **D-10:** New-user default: **all leagues OFF, no teams selected** (`{ enabledLeagues: [], favoriteTeams: {} }`). Brief renders with no sports section by default. User opts in by toggling leagues in Settings. Honest behavior: no surprise sports content from a system the user never configured. UI-SPEC empty-state copy "No leagues selected — sports section will be omitted from your brief." applies.
- **D-11:** Existing prod user (jamesonmorrill1@gmail.com) gets the same all-off default on first deploy of this phase. **No migration script.** First brief after deploy has no sports section; user goes to Settings and re-picks 4 leagues + 4 teams in <1 minute. Rationale: solo-dev tool, single prod user, clean break from env-var era beats the cost of writing+testing a one-shot migration that exists only to preserve one user's settings.
- **D-12:** Remove `SPORTS_MLB_TEAM_ID`, `SPORTS_NFL_TEAM_ID`, `SPORTS_NBA_TEAM_ID`, `SPORTS_NHL_TEAM_ID` from production environment (Railway service variables) after the deploy lands. Document in the phase SUMMARY so it doesn't get re-added by a stale `.env` paste.
- **D-13:** Keep the `SPORTS_*_TEAM_ID` env-var read path in `sports-service.ts` `getTeamId()` **only as a test-fixture fallback**. `sports-service.test.ts:7-10` already sets these env vars for Detroit teams; rather than rewrite every test to inject `deps.teamIds`, the env path is preserved BUT only triggered when `selections` is undefined (i.e., the legacy code path). Production code always passes `selections` per D-14, so the env path is dead in prod and live in tests. Document this clearly in the service-file header.

### Brief-service threading + no-team semantics
- **D-14:** `sportsService.fetchAllLeagues(selections)` accepts a `SportsSelections` parameter. `brief-assembly-service.ts:439` reads the selections from `app_settings` (using its already-injected `dbClient` + `userId` already in scope at line 437) and passes them through. Sports-service does NOT import `db` — single-pulls-from-DB-then-delegates pattern is preserved.
- **D-15:** New `LeagueResult` variant: `{ status: 'disabled' }` with no `data` field. `fetchAllLeagues` returns this for any league NOT in `selections.enabledLeagues` and makes zero HTTP calls for it. Response shape stays stable (`{ leagues: { mlb, nfl, nba, nhl } }` — all four keys always present); renderer/PDF check `status === 'disabled'` and suppress that league's section.
- **D-16:** For an ENABLED league with no favorite team selected (`favoriteTeams[league]` is undefined): fetch standings only — no recent game, no upcoming game. Return `{ status: 'ok', data: { recentGame: null, upcomingGame: null, standings: [...] } }`. The standings endpoint (`/standings?season=YYYY`) doesn't take a team_id, so this is a clean code path. Renderer already handles null game fields (existing off-day path).
- **D-17:** When `selections.enabledLeagues` is empty (no leagues enabled): `fetchAllLeagues` short-circuits — returns `{ leagues: { mlb: 'disabled', nfl: 'disabled', nba: 'disabled', nhl: 'disabled' }, fetchedAt, partial: false }` with **zero BDL calls**. The brief renderer detects "all leagues disabled" and **omits the entire sports section from the PDF** (no header, no placeholder text). This satisfies ROADMAP SC#4 directly.
- **D-18:** Rendering layer changes: the brief renderer (PDF generator) needs a guard "if all four leagues have `status: 'disabled'`, skip the sports section header and content entirely." Plan-phase identifies the exact file (likely `vigil-core/src/services/brief-renderer.ts` or similar PDF template module) and adds the guard.

### Settings UI (mirrors UI-SPEC.md exactly)
- **D-19:** Section card placement and layout per UI-SPEC.md: new `<section>` card in `SettingsPage.tsx` with heading "Sports", helper "Choose which leagues and favorite teams appear in your daily brief." Lives **between the Google Account card and the ScheduleCard rows**.
- **D-20:** Per-league row pattern per UI-SPEC: top-level checkbox `[checkbox] [League — Sport]` (e.g., "MLB — Baseball"), and when checked, an indented team radio list beneath it. Single-select radio per league. Disabled league's team list is not rendered (no `aria-disabled`, just absence).
- **D-21:** Save UX matches Phase 115 D-08/D-14: optimistic toggle + ~400ms debounce + wholesale `PUT /v1/sports/selections` + rollback to last-known-good on failure + error toast "Couldn't save sports settings — try again." No explicit Save button.
- **D-22:** Loading: per-league `Loading teams…` while team list is fetching. Error: per-league `bg-red-900/20 border border-red-900/40 rounded p-3` with `Retry` button (mirrors Phase 115 calendar error block at `SettingsPage.tsx:728-738`).
- **D-23:** League team list is fetched lazily — when a league is toggled ON for the first time in this session OR on Settings mount if `enabledLeagues` already contains it (so the radios populate without an extra click). Cached client-side for the session in component state (no PWA-side persistent cache; the 24h server cache is enough).
- **D-24:** Disabling a league does NOT clear `favoriteTeams[league]` server-side — preserved per UI-SPEC's preservation rule. Re-enabling restores the radio selection from server state on next load. This is a server-side decision on PUT validation: D-04a's validation accepts `favoriteTeams.<league>` even when that league is not in `enabledLeagues`.

### Sequencing
- **D-25:** Plan-phase produces parallelizable plan files: (1) DB/route/service for selections (server), (2) Teams endpoint + cache (server), (3) sports-service `selections` param + `disabled` status + standings-only path (server, depends on 1), (4) brief-assembly threading + renderer all-disabled guard (server, depends on 1+3), (5) PWA Settings UI + api/client helpers + tests (frontend, depends on 1+2 contract). Plan-phase decides the exact wave assignment.

### Claude's Discretion
- Exact name and signature of `sports-preferences-service.ts` factory functions (D-04a suggests `getUserSelections` / `setUserSelections`).
- Exact debounce implementation (existing util vs inline `setTimeout` vs `useDebouncedCallback` hook) — pick what matches Phase 115's calendar picker convention.
- Exact PWA component decomposition for the picker (single inline JSX in SettingsPage vs extracted `<SportsPicker>` component) — pick what matches Phase 115's calendars subsection style.
- Whether to render a "(N selected)" counter in the section header — UI-SPEC doesn't specify either way.
- Concrete error-toast wording variant if helpful ("Couldn't save sports settings — try again." is the default).
- Loading skeleton vs spinner during per-league teams fetch.

### Folded Todos
None — no pending todos in `.planning/todos/` matched Phase 116 scope (per init/codebase scout).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 116 source-of-truth
- `.planning/REQUIREMENTS.md` — SPORTS-01 (full requirement text including hardcoded `teamIds` reference, "Brief PDF only renders selected leagues").
- `.planning/ROADMAP.md` §"Phase 116: Sports source picker" — Goal, requirements mapping, 4 success criteria.
- `.planning/phases/116-sports-source-picker/116-UI-SPEC.md` — UI design contract; visual + interaction spec; **note**: data-shape line about "balldontlie full_name / display_name" is amended in plan-phase to read "BDL team_id as string" per D-05.

### Phase 115 reference (same-page picker pattern, just shipped)
- `.planning/phases/115-calendar-source-picker-thoughtrow-polish/115-CONTEXT.md` — D-01 through D-14 establish auto-save debounce (400ms), optimistic toggle + rollback + error toast, wholesale-replace PUT body, per-user scoping pattern, `bearerAuth` integration.
- `vigil-core/src/services/calendar-service.ts` — `setCalendarSelections(userId, ids)` reference implementation (validation + db update + per-user scope).
- `vigil-core/src/routes/calendar.ts:31-59` — `PUT /calendar/selections` reference handler (body parsing, error mapping to 400, ok-true response).
- `vigil-pwa/src/pages/SettingsPage.tsx:717-777` — Phase 115 calendars subsection JSX is the styling/layout baseline for Phase 116's sports section.
- `vigil-pwa/src/api/client.ts` — `vigilFetch` helper (line 53), `setCalendarSelections` typed helper (line 17 import) — pattern for D-09.

### Existing sports code (touch but don't break)
- `vigil-core/src/services/sports-service.ts` — `createSportsService(deps)` factory; `fetchLeague(league)`, `fetchAllLeagues()`. Lines 60 (`teamIds?: Record<League, string>`), 240-244 (`getTeamId`), 275/335/395/455 (per-league fetch using `team_ids[]=<id>`). All four `fetchLeague*` functions need `selections`-aware paths: skip when disabled, standings-only when team unset.
- `vigil-core/src/services/sports-service.test.ts:7-10` — env var fixtures (`SPORTS_*_TEAM_ID = Detroit teams`). Preserved per D-13.
- `vigil-core/src/routes/sports.ts` — existing `createSportsRouter(deps?)` factory + production `sports` singleton. New PUT/GET selections handlers + `GET /sports/teams/:league` land here per D-04 / D-06.
- `vigil-core/src/routes/sports.test.ts` — Existing test patterns to extend.
- `vigil-core/src/services/brief-assembly-service.ts:32, 437-440, 465-471, 506` — `sportsService` typed shim, `Promise.allSettled` source fan-out, `mapSports` extraction, `data.sports` assembly. Line 439 is the call site that gains `selections` per D-14.

### Database
- `vigil-core/src/db/schema.ts:308-318` — `appSettings` table with composite PK `(user_id, key)`, `value: jsonb`, `updatedAt`. **No new migration needed** — D-01 reuses this table.
- `vigil-core/src/db/schema.ts:25-55` — `users` table (referenced for FK semantics in app_settings).

### PWA Settings
- `vigil-pwa/src/pages/SettingsPage.tsx:546+` — Settings page card structure (background, border, padding patterns).
- `vigil-pwa/src/pages/SettingsPage.tsx:780+` — `<ScheduleCard>` rows mark the bottom edge; new Sports section card lives above them.
- `vigil-pwa/src/pages/SettingsPage.test.tsx` — Existing Phase 115 test patterns to extend for the new picker.

### Prior decisions to honor
- Phase 102 — `app_settings` composite PK `(user_id, key)`; per-user state pattern.
- Phase 109 D-11/D-12 — per-user scoping, `c.get("userId")` from `bearerAuth`.
- Phase 115 D-02/D-08/D-14 — wholesale-replace PUT, 400ms debounce + optimistic + rollback + toast.
- `vigil-core` env-gate fail-closed (memory: project_vigil_core_env_gates) — JWT_SECRET + VIGIL_ALLOWED_EMAILS already enforced; new endpoints inherit via existing `bearerAuth` middleware.
- Solo-dev tool / single prod user (memory: user profile + project) — informs D-11 (no migration script needed).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app_settings` table (`schema.ts:308-318`) — already exists with composite PK. No migration. Use raw drizzle insert/update with `onConflict do update set value = excluded.value, updated_at = now()`.
- `createSportsService(deps)` factory (`sports-service.ts:221`) — already injectable for tests. Add `selections?: SportsSelections` to deps OR (better) thread through `fetchAllLeagues(selections)` per D-14.
- BDL `/teams` endpoint (one HTTP call per league), already-validated key handling pattern in `fetchJSON` (`sports-service.ts:262-273`) — reuse for D-06.
- `vigilFetch` (`vigil-pwa/src/api/client.ts:53`) — handles bearer injection, 401 redirect, `vigil:edit-ended` semantics. Use it for all D-09 helpers.
- Phase 115 calendars subsection JSX (`SettingsPage.tsx:717-777`) — copy the structure (loading/error/list states) for the sports section.
- `ToastHost` (`vigil-pwa/src/components/ToastHost.tsx`) — toast surface for D-21 error toast.
- `bearerAuth` middleware — already gates everything mounted under `/v1`; new endpoints inherit.

### Established Patterns
- Hono `createXxxRouter(deps?)` factory + production singleton at module bottom (e.g., `routes/sports.ts:35`, `routes/calendar.ts:66`). New endpoints land in the existing `createSportsRouter` factory.
- `bearerAuth` sets `c.var.userId`; routes read via `c.get("userId") as number`. Same pattern for new handlers (D-04b).
- Service factory takes `deps` with injectable functions (DB + fetch). Test files build the router with `createSportsRouter({ ... })` and mock those functions (Phase 115 calendar route tests).
- Per-source `Promise.allSettled` fan-out in `brief-assembly-service.ts:437-462` — sports already lives here. The change is the `selections` argument, not the orchestration shape.
- PWA mount-time data load pattern: `useEffect` calling `vigilFetch` once, status-state machine `'idle' | 'loading' | 'ok' | 'error'` (Phase 115 calendars subsection model).
- In-memory cache with `CACHE_TTL_MS` constant (`sports-service.ts:67-83`) — add `TEAMS_CACHE_TTL_MS = 24 * 60 * 60 * 1000` for D-07.

### Integration Points
- New PUT/GET selections handlers + new GET teams handler land in `vigil-core/src/routes/sports.ts`; auto-mounted via `app.route("/v1", sports)` at `index.ts:191`.
- New service `sports-preferences-service.ts` is wired into `routes/sports.ts` via the same factory `deps?` param shape.
- `sports-service.ts` `fetchAllLeagues` signature changes to `(selections: SportsSelections) => Promise<SportsResponse>`. `LeagueResult.status` union expands with `'disabled'`.
- `brief-assembly-service.ts:437-440` reads `app_settings.sports_selections` for the userId, parses, passes to `fetchAllLeagues`. Single new query before the `Promise.allSettled`.
- Brief renderer (PDF) gains a guard: if all four leagues are `status: 'disabled'`, the section header + content are not rendered. Plan-phase identifies the exact file (renderer or template) and adds the guard with a regression test.
- New PWA helpers in `vigil-pwa/src/api/client.ts`: `getSportsSelections`, `setSportsSelections`, `getSportsTeams` — all use `vigilFetch`.
- New JSX in `SettingsPage.tsx` (between Google card and ScheduleCard rows). Likely an extracted `<SportsPicker>` component if the inline JSX gets long; plan-phase decides.

### Constraints
- Brief generation must continue to work for users with NO `sports_selections` row (the all-off default per D-10). Tests must cover the empty-selections case explicitly. Render path must NOT throw on missing row — it's the new normal.
- `BALLDONTLIE_API_KEY` is NEVER logged or returned in responses (existing T-73-01 mitigation). New `GET /sports/teams/:league` handler must follow this.
- Free-tier rate limit: 5 requests/minute. Per-user team-list fetches plus per-user enabled-league game fetches must stay under this. The 24h teams cache (D-07) and the existing 5-min league cache make this easy in practice (one user, ~4 league fetches per brief = well under 5/min).
- Validation must be enforced server-side regardless of UI state (T-115-01-02 / -03 pattern from Phase 115). Don't trust the body shape; validate league keys and string types in the service.
- `selections` is per-user, but `BDL` team-list is shared across users — keep the teams cache as a global (not per-user) Map.
- Don't break the `vigil:edit-ended` semantics on `vigilFetch` 401 paths in PWA (Phase 115 baseline).

</code_context>

<specifics>
## Specific Ideas

- "BDL team_id as string" is the right canonical identifier — the service already speaks this language (`team_ids[]=10`); having the PWA also speak it removes a translation layer.
- "All-off default + clean break from env-var era" is honest UX: the user picks what they want from a blank slate rather than inheriting hardcoded Detroit/Yankees defaults.
- "Standings only when league enabled but no team" matches the natural BDL API surface (standings endpoint takes no team_id) — the path of least resistance happens to be the most permissive UX.
- "All four league keys always present in response.leagues" with `status: 'disabled'` keeps the renderer's existing per-league branching shape stable instead of introducing optional keys.
- The Phase 115 calendar picker is the shape baseline for everything UI here — copying its structure (loading/error/list states, toast semantics, debounce timer) keeps the codebase coherent.

</specifics>

<deferred>
## Deferred Ideas

- Multiple favorite teams per league (UI-SPEC locks single-select; SPORTS-01 says "team(s)" but UI-SPEC notes single-select for simplicity).
- Team color/logo metadata in picker — server returns `{id, name}` only; can add later if BDL exposes it cleanly.
- Per-league scheduling rules ("show NHL only on weekdays") — out of scope.
- Telemetry/PostHog events for picker interactions (`sports_league_toggled`, `sports_team_changed`) — not required by SC; can ride along if the planner sees a clean spot.
- OpenAPI / API-contract doc update for the three new endpoints — surface during plan-phase if a contract doc exists; otherwise out of scope.
- Migration script to backfill existing prod user (intentionally rejected per D-11).
- "Recent + upcoming game without a favorite team" via league-wide schedule — would require a new BDL query path; standings-only is enough for the MVP.
- `abbreviation` field on team list (NYY, BOS) — not needed by current UI-SPEC.
- Debounce-cancel-on-unmount fix (WR-02 known limitation) — explicitly inherited from Phase 115's deferred list.

### Reviewed Todos (not folded)
None — no relevant pending todos surfaced for Phase 116.

</deferred>

---

*Phase: 116-sports-source-picker*
*Context gathered: 2026-04-28*
