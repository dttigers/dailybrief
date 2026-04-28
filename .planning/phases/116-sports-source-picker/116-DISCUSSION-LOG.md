# Phase 116: Sports source picker - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 116-sports-source-picker
**Areas discussed:** Storage shape, Team identity + list source, Defaults + existing-user migration, Brief-service threading + no-team semantics

---

## Storage shape

### Where should sportsSelections live in the database?

| Option | Description | Selected |
|--------|-------------|----------|
| app_settings row, key='sports_selections' | Composite PK (user_id, key) already supports per-user config; no migration. value: jsonb. Matches existing pattern (user_timezone, schedules per Phase 102). | ✓ |
| New jsonb column on users table | Closer to user identity. Requires migration. | |
| New dedicated user_sports_preferences table | Normalized per-league rows. More schema than data warrants. | |
| Reuse oauth_tokens with new jsonb column | Mirrors Phase 115. Semantically wrong (sports != Google OAuth). | |

**User's choice:** app_settings row, key='sports_selections'

### API endpoint shape for read/write?

| Option | Description | Selected |
|--------|-------------|----------|
| PUT + GET /v1/sports/selections | Mirrors Phase 115 exactly. Wholesale-replace, idempotent. | ✓ |
| PUT only; piggyback read on /v1/me | Saves one round trip; couples sports state to /me. | |
| PATCH /v1/sports/preferences | Allows partial updates; breaks Phase 115 wholesale pattern. | |

**User's choice:** PUT + GET /v1/sports/selections

### Where should new endpoint handlers live?

| Option | Description | Selected |
|--------|-------------|----------|
| Add to existing src/routes/sports.ts | createSportsRouter factory exists; mounted at /v1. Phase 115 calendar pattern. | ✓ |
| New src/routes/sports-preferences.ts | Separates BDL routes from preference routes. Adds file/mount. | |
| New shared src/routes/preferences.ts | Premature; only sports + calendar exist today. | |

**User's choice:** Add to existing src/routes/sports.ts

### Service-layer abstraction for sports preferences?

| Option | Description | Selected |
|--------|-------------|----------|
| New createSportsPreferencesService factory | Mirrors calendar-service. Injectable dbSelectFn/dbUpdateFn for tests. | ✓ |
| Extend createSportsService | Mixes BDL fetching with user-state persistence. | |
| Inline in routes/sports.ts | Less ceremony; worse for testing. | |

**User's choice:** New createSportsPreferencesService factory

---

## Team identity + list source

### What value should be stored in favoriteTeams.<league>?

| Option | Description | Selected |
|--------|-------------|----------|
| BDL team_id as string | "10" for Yankees. Direct drop-in for sports-service. | ✓ |
| Team full_name string | "New York Yankees". Requires name→id lookup at brief time. | |
| Both: { id, name } | Robust to renames. More verbose. | |

**User's choice:** BDL team_id as string
**Notes:** UI-SPEC's "balldontlie full_name / display_name" line will be amended in plan-phase to read "BDL team_id as string".

### How does the PWA get the list of teams?

| Option | Description | Selected |
|--------|-------------|----------|
| New GET /v1/sports/teams/:league, server proxies BDL /teams | Cached server-side. Keeps API key server-side. | ✓ |
| Static hardcoded list bundled in PWA | Zero round-trips. Stale on rename. | |
| Pre-compute and return on GET /sports/selections | Larger payload on every Settings load. | |

**User's choice:** New GET /v1/sports/teams/:league endpoint

### Server-side teams cache TTL?

| Option | Description | Selected |
|--------|-------------|----------|
| 24h, in-memory Map | Mirrors existing CACHE_TTL_MS pattern with longer TTL. | ✓ |
| 1h, in-memory Map | More conservative; no real benefit. | |
| Per-process forever, only invalidated on restart | Simplest but stale on team rename. | |

**User's choice:** 24h in-memory Map

### How to normalize per-league BDL field name differences?

| Option | Description | Selected |
|--------|-------------|----------|
| Server returns { id, name } per team | Server normalizes; PWA uniform shape. | ✓ |
| Server returns raw BDL response | PWA handles per-league field-name variation. | |
| Server returns { id, name, abbreviation } | Includes abbrev; not needed by current UI-SPEC. | |

**User's choice:** Server returns { id: string, name: string }

---

## Defaults + existing-user migration

### What's the default state for a new user?

| Option | Description | Selected |
|--------|-------------|----------|
| All leagues OFF, no teams | Brief renders no sports section by default. User opts in. | ✓ |
| All four leagues ON, no team selected | Standings-only by default. Mildly noisy but discoverable. | |
| Pre-populate from current SPORTS_*_TEAM_ID env vars | Couples user-creation to env config. | |

**User's choice:** All leagues OFF, no teams

### What happens to the existing prod user on first deploy?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop hardcoded env vars; user re-picks | Solo-dev tool, single prod user. Clean break. | ✓ |
| One-shot migration script that backfills | Zero break in brief content. Migration tax for one user. | |
| Keep env vars as fallback when row is null | Two parallel paths forever — tech debt. | |

**User's choice:** Drop hardcoded env vars; user re-picks in Settings

### Should SPORTS_*_TEAM_ID env vars be removed entirely?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep env-var path for test fixtures only | Tests reuse Detroit fixtures. Production code uses app_settings only. | ✓ |
| Remove env-var path entirely | Cleaner codebase; all tests must pass deps.teamIds. | |
| Keep env-var path as runtime fallback | Adds a code path that mostly never runs. | |

**User's choice:** Keep env-var path for test fixtures only

---

## Brief-service threading + no-team semantics

### How should per-user selections reach sportsService.fetchAllLeagues()?

| Option | Description | Selected |
|--------|-------------|----------|
| fetchAllLeagues(selections) accepts SportsSelections param | brief-assembly reads selections, passes through. | ✓ |
| fetchAllLeagues(userId) reads selections itself | Adds DB dependency to sports-service. | |
| Separate orchestration layer | Premature; one consumer. | |

**User's choice:** fetchAllLeagues(selections) accepts SportsSelections param

### What does fetchAllLeagues do for a NOT-enabled league?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip entirely; return sentinel or omit | No HTTP call. Brief PDF skips section if all disabled. | ✓ (sentinel) |
| Skip and return status: 'off_season' | Conflates user intent with seasonal data. | |
| Add new status: 'disabled' to LeagueResult | Distinct sentinel. Clean semantics. | ✓ (refined) |

**User's choice:** New status: 'disabled' as a LeagueResult variant; response shape stable (all four keys present).

### What does fetchLeague do for an ENABLED league with no team selected?

| Option | Description | Selected |
|--------|-------------|----------|
| Return standings only | Standings doesn't need team_id. Honors UI-SPEC "standings only" copy. | ✓ |
| Treat no-team as disabled — UI must enforce team pick | Diverges from UI-SPEC; simpler service. | |
| Return error 'no team selected' | Forces error state. Punishes valid state. | |

**User's choice:** Return standings only

### What does the brief renderer do when ALL leagues are disabled?

| Option | Description | Selected |
|--------|-------------|----------|
| Omit entire sports section from PDF | Cleanest output. Honors SC#4 directly. | ✓ |
| Render small "no leagues selected" placeholder | ROADMAP SC#4 allows this; wastes line space. | |

**User's choice:** Omit entire sports section from PDF

---

## Claude's Discretion

- Exact factory function names in `sports-preferences-service.ts`.
- Exact debounce implementation choice (existing util vs `setTimeout` vs `useDebouncedCallback`).
- PWA component decomposition (inline JSX vs extracted `<SportsPicker>`).
- Whether to render a "(N selected)" counter in the section header.
- Concrete error-toast wording variant.
- Loading skeleton vs spinner during per-league teams fetch.

## Deferred Ideas

- Multiple favorite teams per league (UI-SPEC locks single-select).
- Team color/logo metadata.
- Per-league scheduling rules.
- Telemetry events for picker interactions.
- OpenAPI doc update.
- Migration script for existing prod user (rejected per D-11).
- Recent/upcoming game without a favorite team (would need new BDL query path).
- `abbreviation` field on team list.
- Debounce-cancel-on-unmount fix (inherited from Phase 115).
