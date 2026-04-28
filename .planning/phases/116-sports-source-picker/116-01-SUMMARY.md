---
phase: 116-sports-source-picker
plan: 01
subsystem: api
tags: [hono, drizzle, postgres, jsonb, sports, preferences, app_settings, validation, bearerauth]

requires:
  - phase: 102-multi-user-app-settings
    provides: app_settings table with composite PK (user_id, key) and jsonb value column
  - phase: 109-per-user-scheduler-fan-out
    provides: bearerAuth global dispatcher + c.get("userId") per-user scoping pattern
  - phase: 115-calendar-source-picker-thoughtrow-polish
    provides: validateCalendarIds + setCalendarSelections shape (single-source validation, route catches throw -> 400)
provides:
  - createSportsPreferencesService factory + validateSportsSelections + SportsSelections type + EMPTY_SELECTIONS + MAX_ENABLED_LEAGUES + SPORTS_SELECTIONS_KEY
  - GET /v1/sports/selections (returns persisted value or empty default — D-10)
  - PUT /v1/sports/selections (wholesale-replace upsert, idempotent)
  - SportsRouterDeps intersection type (SportsServiceDeps & SportsPreferencesServiceDeps)
affects: [116-03 sports-service threading, 116-04 brief-assembly threading, 116-05 PWA Settings UI]

tech-stack:
  added: []
  patterns:
    - "Service-layer single-source validation (validateSportsSelections); route catches throw and maps to Error -> 400"
    - "Drizzle insert + onConflictDoUpdate on composite PK (userId, key) for per-user jsonb upsert"
    - "Mass-assignment defense: validator allowlists top-level keys (rejects { isAdmin: true } etc.)"
    - "Defensive read: getUserSelections re-validates persisted row; returns empty default if corrupt (D-10 + D-11 fallback)"
    - "Hono route ordering: literal /sports/selections registered BEFORE /sports/:league so the param route does not shadow"
    - "Test wrapper: outer Hono app uses use('*') middleware to pre-set userId, then app.route('/', innerRouter) — mirrors production global bearerAuth dispatcher"

key-files:
  created:
    - vigil-core/src/services/sports-preferences-service.ts
    - vigil-core/src/services/sports-preferences-service.test.ts
  modified:
    - vigil-core/src/routes/sports.ts
    - vigil-core/src/routes/sports.test.ts

key-decisions:
  - "Store sports preferences as a single jsonb blob in app_settings (key='sports_selections') — composite PK already supports per-user, no migration needed (D-01)"
  - "PUT wholesale-replaces the row's value (idempotent) — mirrors Phase 115 calendar D-02 pattern (D-03)"
  - "GET returns the empty default { enabledLeagues: [], favoriteTeams: {} } when no row exists (NOT 404) — clean new-user UX (D-10)"
  - "Validator accepts favoriteTeams.<league> entries even when that league is NOT in enabledLeagues — preservation rule, disabling a league does not clear its team (D-24)"
  - "userId always sourced from c.get('userId'), NEVER from request body — T-116-01-04 cross-tenant write defense (D-04b)"
  - "MAX_ENABLED_LEAGUES = 4 (= league count); favoriteTeams duplicate-league entries are structurally impossible via Record<League, string?> shape (T-116-01-02 DoS cap)"
  - "Route order: GET /sports, GET /sports/selections, PUT /sports/selections, GET /sports/:league — literal path wins over :league param matching"

patterns-established:
  - "Service-layer single-source validation with route-level throw -> 400 mapping (replicates Phase 115 calendar pattern for the third subsystem; now a shared idiom)"
  - "Defensive jsonb read: re-validate persisted shape on read so corrupt rows fall back to empty default rather than crashing downstream consumers"
  - "Composite-PK upsert via onConflictDoUpdate for per-user app_settings writes (no migration needed; reusable for any future per-user key)"

requirements-completed: [SPORTS-01]

duration: 5min
completed: 2026-04-28
---

# Phase 116 Plan 01: Sports preferences persistence layer Summary

**Per-user sports picker selections persisted to app_settings (key='sports_selections') with bearer-gated GET/PUT /v1/sports/selections endpoints, single-source validation in a new sports-preferences-service, and 26 new tests covering happy path + 12 validation rules + D-24 preservation rule.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-28T18:50:31Z
- **Completed:** 2026-04-28T18:55:21Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- New `sports-preferences-service.ts` with `createSportsPreferencesService` factory, `validateSportsSelections` validator, `SportsSelections` type, `EMPTY_SELECTIONS` constant, `MAX_ENABLED_LEAGUES = 4` cap, `SPORTS_SELECTIONS_KEY = "sports_selections"` constant
- Two new bearer-gated endpoints wired through the existing `createSportsRouter` factory: `GET /v1/sports/selections` (returns row or empty default) and `PUT /v1/sports/selections` (wholesale-replace upsert)
- `SportsRouterDeps = SportsServiceDeps & SportsPreferencesServiceDeps` — single intersection type lets the production singleton stay parameter-less
- Validator enforces all 5 rules from D-04a: whitelist league keys, string team values, max 4 enabled leagues, max 1 team per league (structural via Record shape), no mass-assigned extra top-level keys (T-116-01-05)
- 26 new tests pass: 14 unit tests on the service (12+ behaviors plus EMPTY_SELECTIONS shape + extra-keys mass-assignment) and 12 route tests (happy path, empty default, idempotent, all 6 validation branches, invalid JSON, D-24 preservation, GET row-present, GET row-absent)
- Zero new dependencies, zero migrations, zero changes to `index.ts` mount

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sports-preferences-service.ts with factory, validator, and unit tests** — `42175b7` (feat)
2. **Task 2: Wire GET/PUT /sports/selections handlers into routes/sports.ts and add route tests** — `be7c254` (feat)

_TDD pattern: each task wrote tests first, confirmed RED (module-not-found / route-shadow 400), then implemented to GREEN. Committed once per task as feat — no separate test/feat/refactor split because the green delta was small and atomic._

## Files Created/Modified

- `vigil-core/src/services/sports-preferences-service.ts` (created) — Factory, validator, types, EMPTY_SELECTIONS, MAX_ENABLED_LEAGUES, SPORTS_SELECTIONS_KEY. Drizzle insert+onConflictDoUpdate on (userId, key) composite PK.
- `vigil-core/src/services/sports-preferences-service.test.ts` (created) — 14 unit tests covering empty default, persisted-value retrieval, all validation branches, idempotency, D-24 disabled-team preservation, mass-assignment defense.
- `vigil-core/src/routes/sports.ts` (modified) — Added `SportsRouterDeps` intersection type, `prefsService` instantiation inside the factory, GET + PUT `/sports/selections` handlers ordered BEFORE the existing `/sports/:league` param route.
- `vigil-core/src/routes/sports.test.ts` (modified) — Appended `// ── Phase 116 SPORTS-01 ──` test block: 12 route tests using `makeApp()` wrapper that pre-sets `userId` via outer Hono `use('*')` middleware (mirrors production bearerAuth dispatcher).

## Decisions Made

- All decisions inherited from `116-CONTEXT.md` (D-01 through D-24) — no new decisions made during execution. Plan-writer's recommendations applied verbatim:
  - **Route ordering** — registered `/sports/selections` BEFORE `/sports/:league` to eliminate any ambiguity between the literal path and the param route (Hono matches in declaration order). This was a plan instruction; implementation followed exactly.
  - **JSDoc on `dbUpsertFn` mentions `onConflictDoUpdate`** — caused the `grep -c onConflictDoUpdate` count to be 2 (1 doc + 1 code) rather than the plan's expected 1. Both occurrences accurate; doc-comment is informative and worth keeping. Not a deviation from plan intent.

## Deviations from Plan

None — plan executed exactly as written. All 14+12 = 26 new tests pass on first GREEN run; pre-existing 3 sports route tests still pass; `tsc --noEmit` clean.

## Issues Encountered

- **noUncheckedIndexedAccess strictness** — Initial draft accessed `obj.enabledLeagues` and `obj.favoriteTeams` as bare properties on a `Record<string, unknown>`. Switched to bracket access (`obj["enabledLeagues"]`) to satisfy `--strict` mode under `tsc --noEmit`. Resolved before commit.

## Threat Model Bindings

| Threat ID | Mitigation Implemented |
|---|---|
| T-116-01-01 (Spoofing — bearer absent) | Inherited via global `bearerAuth` dispatcher mounted before `app.route("/v1", sports)` at index.ts:191. No per-route auth code; architectural gate is the contract. |
| T-116-01-02 (DoS — payload bomb) | `MAX_ENABLED_LEAGUES = 4` cap enforced in `validateSportsSelections`. `favoriteTeams` is structurally bounded by the 4 league keys. Asserted by `SPORTS-01-prefs-set-validates-cap` (unit) and `SPORTS-01-put-rejects-too-many-leagues` (route). |
| T-116-01-03 (Tampering — wrong types) | Validator rejects non-array `enabledLeagues`, unknown league keys, non-string `favoriteTeams.<league>`. Asserted by 5 validation tests (3 unit + 2 route). |
| T-116-01-04 (Cross-tenant write) | `userId` always read from `c.get("userId")` — never from request body. Verified by `grep -c 'c.get("userId")' src/routes/sports.ts` = 4 (both new handlers + 2 GET handlers from Phase 73). Body schema has no `userId` field; validator rejects extra top-level keys. |
| T-116-01-05 (Mass assignment) | `validateSportsSelections` allowlists ONLY `enabledLeagues` + `favoriteTeams`. Asserted by `SPORTS-01-prefs-validate-rejects-extra-keys` unit test. |

## Next Phase Readiness

- **Plan 02 (Teams endpoint + 24h cache):** Independent of Plan 01 — can run in parallel (per D-25 wave assignment).
- **Plan 03 (sports-service `selections` param + `disabled` status):** Now unblocked — has `SportsSelections` type to consume from `sports-preferences-service`.
- **Plan 04 (brief-assembly threading + renderer all-disabled guard):** Now unblocked — Plan 04 reads `app_settings` directly (or imports `getUserSelections` from this service); the contract is locked.
- **Plan 05 (PWA Settings UI):** Now unblocked at the API contract layer — PWA can wire `getSportsSelections()` / `setSportsSelections(s)` typed helpers against the live `GET/PUT /v1/sports/selections` endpoints.

No blockers carried forward.

## Self-Check: PASSED

- [x] `vigil-core/src/services/sports-preferences-service.ts` exists
- [x] `vigil-core/src/services/sports-preferences-service.test.ts` exists
- [x] `vigil-core/src/routes/sports.ts` modified (added SportsRouterDeps + GET/PUT selections + route ordering)
- [x] `vigil-core/src/routes/sports.test.ts` modified (12 new SPORTS-01 tests appended)
- [x] Commit `42175b7` exists in git log (Task 1)
- [x] Commit `be7c254` exists in git log (Task 2)
- [x] `cd vigil-core && npx tsx --test src/services/sports-preferences-service.test.ts` exits 0 (14 pass)
- [x] `cd vigil-core && npx tsx --test src/routes/sports.test.ts` exits 0 (15 pass — 3 pre-existing + 12 new)
- [x] `cd vigil-core && npx tsc --noEmit` exits 0
- [x] `app.route("/v1", sports)` still mounted at index.ts:191 (verified — unchanged)
- [x] No new files in `vigil-core/src/db/migrations/` (storage column reused per D-01)

---
*Phase: 116-sports-source-picker*
*Completed: 2026-04-28*
