---
phase: 116-sports-source-picker
plan: 04
subsystem: api
tags: [api, backend, sports, brief, brief-assembly, app_settings, selections, jsonb, defense-in-depth]

requires:
  - phase: 116-01
    provides: SportsSelections type (re-exported from sports-service.js) + sports_selections jsonb storage in app_settings (key='sports_selections')
  - phase: 116-03
    provides: fetchAllLeagues(selections?) selections-aware fan-out + LeagueResult.status='disabled' + zero-call short-circuit
  - phase: 102
    provides: app_settings composite PK (user_id, key) + per-user jsonb storage pattern (mirrored from getUserTimezone)
provides:
  - getUserSportsSelections helper (mirrors getUserTimezone shape; defensive shape-check; returns EMPTY_SELECTIONS on missing/corrupt rows or DB throws)
  - assembleAndRender now reads sports_selections from app_settings before the Promise.allSettled fan-out and threads it into deps.sportsService.fetchAllLeagues(selections)
  - BriefAssemblyDeps.sportsService.fetchAllLeagues signature widened to (selections?: SportsSelections) — backward-compatible with legacy zero-arg test fixtures
  - mapSports D-15/D-18 clarifying comment locking the disabled-status filter contract (no code change required — `status !== 'ok'` already drops 'disabled')
  - index.ts paper-trail comment documenting D-12 SPORTS_*_TEAM_ID env-var deprecation for production
affects: [end-of-phase 116 closeout — picker UI (Plan 05) is now wired end-to-end through brief generation; SC#3 + SC#4 satisfied]

tech-stack:
  added: []
  patterns:
    - "Defense-in-depth READ on jsonb settings: WRITE-path validator (Plan 01) + READ-path shape-check (this plan) — protects against corrupt rows, schema drift, hand-edited DB tampering"
    - "Sibling-helper-by-key pattern: getUserTimezone (key='user_timezone') and getUserSportsSelections (key='sports_selections') share the exact same query shape — single Drizzle pattern for any per-user app_settings jsonb read"
    - "Module-level EMPTY_SELECTIONS sentinel: const referenced from both the helper return AND the no-db fallback path — single source of truth for the empty default, no construction-per-call allocation"
    - "Optional-parameter signature widening: deps.sportsService.fetchAllLeagues(selections?) keeps legacy test fixtures (line 59 zero-arg call) working while production wire-through threads selections — same pattern Plan 03 used at the sports-service factory boundary"
    - "Structural D-18 satisfaction: mapSports's existing `status !== 'ok'` filter coincidentally drops 'disabled' (added in Plan 03) — the comment makes the contract load-bearing and locks future maintainers from 'simplifying' the filter to `status === 'error'` and breaking the cascade"

key-files:
  created: []
  modified:
    - vigil-core/src/services/brief-assembly-service.ts
    - vigil-core/src/services/brief-assembly-service.test.ts
    - vigil-core/src/index.ts

key-decisions:
  - "Mirror getUserTimezone shape exactly for getUserSportsSelections — same try/catch wrapper, same drizzle select chain, same fallback-on-throw — keeps the assembler's persistence-read patterns visually uniform"
  - "Defensive READ shape-check rejects rows where value is not an object OR where enabledLeagues is not an array OR where favoriteTeams is missing — protects against direct psql tampering / schema drift even though Plan 01's WRITE path validator is the first line of defense (T-116-04-01)"
  - "EMPTY_SELECTIONS as a module-level const (not constructed per call) — referenced from both the success path return AND the no-db Promise.resolve fallback — avoids per-render allocation"
  - "No code change to mapSports filter logic — only a clarifying comment added — `'disabled' !== 'ok'` already drops disabled leagues structurally; locking the contract via comment is cheaper than a redundant `status !== 'disabled'` clause that would semantically duplicate the existing condition"
  - "Single new DB query before Promise.allSettled (not inside it) — keeps the source fan-out's structure unchanged, mirrors getUserTimezone's already-sequential placement; sequential because the selections must be resolved before sports-service.fetchAllLeagues can be invoked in the same allSettled tuple"
  - "index.ts comment documents D-12 deprecation but does NOT remove the env-var fallback inside sports-service.ts — the env-var fallback (D-13) is preserved as a TEST-ONLY path; deletion from Railway is a manual ops step (see Railway Runbook below)"

patterns-established:
  - "Defense-in-depth on per-user jsonb settings: validate at WRITE (service layer), shape-check at READ (consumer layer), fall back to a documented empty default — third subsystem to use this pattern (calendar selections Phase 115, sports selections Phase 116-01, brief consumer Phase 116-04); now a project-wide idiom"
  - "Renderer-guard cascade for opt-in sections: store empty default → service short-circuits → mapper filters → renderer guards on `data.X.length > 0` → section omitted entirely. Four-stage pipeline structurally satisfies 'no surprise content from unconfigured features' (D-10 honest UX) without any per-section opt-in flag"
  - "Comment-as-contract for load-bearing filters: mapSports `status !== 'ok'` is now load-bearing for D-18; the new comment locks it against future 'simplification' refactors that would break the renderer guard cascade"

requirements-completed: [SPORTS-01]

duration: ~7min
completed: 2026-04-29
---

# Phase 116 Plan 04: Brief assembly threading + renderer all-disabled cascade Summary

**Wired per-user sports picker selections into the brief generation pipeline so the next brief actually respects the user's picks (SC#3, SC#4): assembleAndRender now reads `sports_selections` from `app_settings` for the userId in scope (single new query mirroring getUserTimezone), defensively shape-checks the jsonb value, and threads selections into `deps.sportsService.fetchAllLeagues(selections)` before the Promise.allSettled fan-out. When all four leagues come back disabled, mapSports's existing `status !== 'ok'` filter drops them structurally → BriefRenderData.sports = [] → pdf-service.ts:281's `data.sports.length > 0` guard suppresses the entire sports section header AND content. SPORTS_*_TEAM_ID env vars deprecated for production via index.ts paper-trail comment (Railway deletion is a manual ops step in the runbook below). 4 new SPORTS-01-brief-* integration tests pass; 20 pre-existing brief-assembly tests still pass; sports-service + sports route tests untouched.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-29T14:02:12Z
- **Completed:** 2026-04-29T14:09:05Z
- **Tasks:** 2
- **Files modified:** 3 (0 created, 3 modified)

## Accomplishments

- **`getUserSportsSelections` helper added** (sibling to `getUserTimezone`): same Drizzle select chain with `where(and(drizzleEq(appSettings.userId, userId), drizzleEq(appSettings.key, "sports_selections")))`. Returns `EMPTY_SELECTIONS = { enabledLeagues: [], favoriteTeams: {} }` when:
  - No row exists (D-10 honest new-user default)
  - Row value is not an object (corrupt jsonb / hand-edited tampering)
  - `enabledLeagues` is not an array OR `favoriteTeams` is missing/non-object (defense-in-depth shape-check)
  - DB query throws (e.g., connection drop — fail-soft, brief still renders)
- **`BriefAssemblyDeps.sportsService.fetchAllLeagues` signature widened** to `(selections?: SportsSelections) => Promise<SportsResponse>` — backward-compatible with the existing 700+ pre-existing tests' zero-arg `fetchAllLeagues()` fixture calls (line 59, 112, 172, 213, 726, 780)
- **Single new DB query in `assembleAndRender`** placed BEFORE the existing `Promise.allSettled` fan-out (sequential with `getUserTimezone`):
  ```ts
  const sportsSelections = db ? await getUserSportsSelections(db, userId) : EMPTY_SELECTIONS;
  ```
- **`fetchAllLeagues` call site threaded** with the resolved selections:
  ```ts
  ? withTimeout(deps.sportsService.fetchAllLeagues(sportsSelections), SOURCE_TIMEOUT_MS)
  ```
- **`EMPTY_SELECTIONS` exported as a module-level const** (not constructed per call) — referenced from both the helper return path AND the no-db fallback
- **`mapSports` D-15/D-18 clarifying comment added** above `if (league.status !== "ok" || !league.data) continue;` — locks the contract that `'disabled' !== 'ok'` (so the filter drops disabled leagues structurally without needing a redundant `status !== 'disabled'` clause)
- **Renderer-guard cascade now end-to-end verified**: when all four leagues are disabled, mapSports filters them all out → `data.sports = []` → pdf-service.ts:281 `data.sports.length > 0` is false → sports section header AND content are skipped (D-18 satisfied without any pdf-service changes)
- **`vigil-core/src/index.ts` paper-trail comment added** above the production `assembler` instantiation explaining D-12: SPORTS_*_TEAM_ID env vars are no longer read by production code; the env-var fallback path inside sports-service.ts (D-13) is retained ONLY for the existing Detroit-team test fixtures
- **4 new integration tests pass** + 20 pre-existing = 24 total brief-assembly tests; 25 sports-service tests still green; 21 sports route tests still green; `tsc --noEmit` clean
- Zero new dependencies, zero migrations, zero changes to `routes/sports.ts`, zero changes to `pdf-service.ts`, zero changes to `sports-service.ts`

## Task Commits

Each task was committed atomically with TDD red→green pattern for Task 1:

1. **Task 1 RED: failing tests for per-user sports selections threading** — `32ef6e6` (test) — 1 file, +209 lines
2. **Task 1 GREEN: thread per-user sports selections into brief assembly** — `6c93313` (feat) — 1 file, +49/-3 lines
3. **Task 2: document SPORTS_*_TEAM_ID env-var deprecation in index.ts** — `59a2c23` (chore) — 1 file, +9 lines

_REFACTOR phase: skipped — GREEN delta was clean (helper mirrors getUserTimezone exactly; no duplication needing extraction)._

## Files Created/Modified

- `vigil-core/src/services/brief-assembly-service.ts` (modified) — Extended import to include `SportsSelections`; added `EMPTY_SELECTIONS` const after AFFIRMATION_FALLBACK; widened `BriefAssemblyDeps.sportsService.fetchAllLeagues` signature; added D-15/D-18 clarifying comment above mapSports's existing filter; added `getUserSportsSelections` helper after `getUserTimezone`; inserted single selections-read line before Promise.allSettled fan-out; threaded selections into the fetchAllLeagues call site.
- `vigil-core/src/services/brief-assembly-service.test.ts` (modified) — Appended `// ── Phase 116 SPORTS-01: per-user selections threading ──` block: `makeKeyAwareDb` helper that returns rows based on the appSettings.key in the WHERE clause (uses the existing `collectChunkValues` chunk-walker pattern from Test 11), `makeAllDisabledSportsResponse` fixture, and 4 new tests covering: stored row drives fetchAllLeagues, missing row → empty default, all-disabled → empty BriefRenderData.sports, corrupt row → empty default + no throw.
- `vigil-core/src/index.ts` (modified) — Added 8-line paper-trail comment above `const assembler = createBriefAssemblyService({ ... })` explaining D-12 env-var deprecation, D-13 test-only fallback retention, and pointing to the SUMMARY's Railway runbook for the manual ops step. No code change to the assembler instantiation itself.

## Decisions Made

All decisions inherited from `116-CONTEXT.md` (D-10, D-12, D-14, D-15, D-17, D-18) and Plan 04's `must_haves` block. Plan-writer's recommendations applied verbatim:

- **Mirror `getUserTimezone` shape exactly** — same try/catch + same Drizzle select chain + same fallback-on-throw idiom. Visual uniformity with `getUserTimezone` makes the assembler's persistence-read patterns scan as a single mental model.
- **Defensive READ shape-check** — even though Plan 01's WRITE-path validator already enforces the shape, the READ path defends against direct psql tampering / schema drift / corrupt jsonb. Asserted by `SPORTS-01-brief-corrupt-row-falls-back`. T-116-04-01 mitigation.
- **`EMPTY_SELECTIONS` as a module-level const (not per-call)** — referenced from both the helper return AND the no-db fallback path; avoids per-call allocation; single source of truth for the empty-default semantics.
- **No code change to `mapSports`** — only a comment added. The existing `status !== "ok"` filter already drops 'disabled' (because `'disabled' !== 'ok'`); adding a redundant `status !== 'disabled'` clause would semantically duplicate the existing condition. The comment locks the contract instead.
- **Single new DB query placed sequentially before Promise.allSettled (not inside it)** — selections must be resolved before sports-service.fetchAllLeagues can be invoked in the same allSettled tuple. Mirrors getUserTimezone's already-sequential placement.
- **index.ts paper-trail comment + SUMMARY runbook entry, NOT a code-side env-var deletion** — the env-var fallback inside sports-service.ts (D-13) is preserved as a TEST-ONLY path. Removing it would require rewriting `sports-service.test.ts:7-10`'s Detroit-team fixtures, which is out of scope for this plan and would force a breaking change to a test file Plan 03 just deliberately preserved.

## Deviations from Plan

None — plan executed exactly as written. All 4 new tests pass on first GREEN run; pre-existing 20 brief-assembly tests still pass; sports-service + sports route tests untouched; `tsc --noEmit` clean.

## Issues Encountered

- **Test 3 (`SPORTS-01-brief-all-disabled-yields-empty-sports-array`) passed during RED** — coincidental: the test is structurally a regression-lock test for D-18, not a feature-driver test. The mapSports filter (`status !== 'ok'`) already drops disabled (added in Plan 03's `LeagueResult.status` union extension), so the all-disabled response → empty `data.sports` cascade was already working. RED for Tests 1/2/4 was sufficient evidence the GREEN delta was needed; Test 3 is a safety net against future filter "simplification" refactors.

## Threat Model Bindings

| Threat ID | Mitigation Implemented |
|---|---|
| T-116-04-01 (Tampering / Information Disclosure — corrupted sports_selections row) | `getUserSportsSelections` wraps the DB query in try/catch, type-checks the row shape (`enabledLeagues` is array, `favoriteTeams` is object), and returns `EMPTY_SELECTIONS` on any failure. assembleAndRender therefore never throws on a corrupt row — the user gets a brief without a sports section instead of a 500. Asserted by `SPORTS-01-brief-corrupt-row-falls-back` (jsonb value = string "not an object" → fetchAllLeagues receives `{ enabledLeagues: [], favoriteTeams: {} }`, brief renders successfully). |
| T-116-04-02 (Information Disclosure — cross-user selections leak) | The `where(and(drizzleEq(appSettings.userId, userId), drizzleEq(appSettings.key, "sports_selections")))` clause scopes the read by userId, which comes from the `assembleAndRender(dateStr, userId)` parameter. The userId originates from the bearerAuth-set `c.get("userId")` at the route layer (Phase 102 baseline). NO cross-user reads possible without compromising the bearer gate itself. |
| T-116-04-03 (Tampering — race between PUT and brief generation) | Accept (per CONTEXT). Brief generation runs at most once per scheduled brief or on-demand. PUT writes a single jsonb row atomically. Worst case: a brief generated mid-toggle uses the pre-toggle value. Solo-dev tool, single prod user — acceptable. |
| T-116-04-04 (Information Disclosure — selections logged) | Accept (per CONTEXT). `getUserSportsSelections` does NOT log anything (only fallback returns on errors). League + team selections are not PII or secrets. |
| T-116-04-05 (Denial of Service — large jsonb value) | Plan 01's WRITE-path validator caps `enabledLeagues` at 4 and `favoriteTeams` at 4 keys (one per league) by structure. The largest possible row value is roughly 200 bytes. The READ path's defensive check rejects corrupt shapes (e.g., an attacker who somehow bypassed the WRITE path) by falling back to `EMPTY_SELECTIONS`. |
| T-116-04-06 (Privilege Escalation — sports-omission as oracle) | Accept (per CONTEXT). No privilege information encoded in selections. Selections are purely UX preferences. |

## Decision-IDs Implemented

- **D-10** — Honest new-user default: missing app_settings row → empty `{ enabledLeagues: [], favoriteTeams: {} }`. Verified by `SPORTS-01-brief-empty-default-when-no-row`.
- **D-12** — SPORTS_*_TEAM_ID env-var deprecation for production. Documented via index.ts paper-trail comment + Railway Runbook section below.
- **D-14** — Selections plumbing: assembleAndRender reads sports_selections from app_settings and threads to fetchAllLeagues. Verified by `SPORTS-01-brief-threads-selections`.
- **D-17** — Zero-call cascade: empty selections short-circuit happens inside sports-service (Plan 03), not duplicated here. Plan 04 just hands sports-service the empty default; Plan 03's logic does the rest.
- **D-18** — Renderer guard cascade: mapSports filters disabled → `data.sports = []` → pdf-service.ts:281 guard fires → no section header. Structural satisfaction (no renderer changes), verified by `SPORTS-01-brief-all-disabled-yields-empty-sports-array`.

## Renderer-Guard Cascade (D-18 in Detail)

```
sports-service.fetchAllLeagues(selections)
  ↓ (selections.enabledLeagues = [] → all 4 leagues get { status: 'disabled' })
  ↓ (or per-league: any league not in enabledLeagues gets { status: 'disabled' })
brief-assembly.mapSports(sportsR)
  ↓ (filter: `status !== 'ok'` drops 'disabled' AND 'error' AND 'off_season')
  ↓ (if all 4 disabled, mapped = [])
BriefRenderData.sports = []
  ↓
pdf-service.ts:281 `if (layout.enabledSections.has("sports") && data.sports.length > 0)`
  ↓ (length === 0 → branch is FALSE)
Sports section header + content path SKIPPED entirely.
```

This four-stage pipeline structurally satisfies SC#4 ("all-disabled → no sports section") without any per-section opt-in flag and without any pdf-service code changes. The only piece this plan added is the comment locking the contract; the cascade was already operational once Plan 03 added 'disabled' to the LeagueResult.status union.

## Railway Runbook (D-12 — Manual Ops Step, NOT a Code Change)

After this phase ships and the picker UI (Plan 05) is exercised by the prod user to seed `sports_selections` rows, delete the following four env vars from the Railway service Variables panel for the `vigil-core` service:

- `SPORTS_MLB_TEAM_ID`
- `SPORTS_NFL_TEAM_ID`
- `SPORTS_NBA_TEAM_ID`
- `SPORTS_NHL_TEAM_ID`

**Reversibility:** Re-paste the four values from the deploy history if rollback is needed (the env-var fallback path inside `sports-service.ts` `getTeamId()` is preserved per D-13).

**Local dev:** `.env` files on dev machines can keep these env vars — the Detroit-team test fixtures at `sports-service.test.ts:7-10` rely on them. The fallback path is now TEST-ONLY in production (production code always passes selections per this plan).

**Prerequisite:** Verify the prod user has at least one `sports_selections` row in `app_settings` (PWA Settings → Sports → toggle a league). Without a row, the user gets the empty default (D-10) and no sports section in their brief — which is the intended behavior for a fresh install but is a regression for the existing prod user who had Detroit teams hardcoded via env vars. The user is expected to spend <1 minute in Settings re-picking 4 leagues + 4 teams (D-11 explicit decision: no migration script).

## Next Phase Readiness

- **End of Phase 116:** With Plan 04 complete and Plan 05 already done (per the prior summary), the picker UI → brief output loop is now closed end-to-end. Plans 01 + 02 + 03 + 04 + 05 all green.
- **SC#3 (brief renders only enabled leagues, uses user's picks):** Satisfied — fetchAllLeagues threads selections, sports-service uses them per Plan 03, mapSports + renderer carry through to the PDF.
- **SC#4 (all-disabled → no sports section):** Satisfied — empty `selections.enabledLeagues` → all-disabled response → empty `data.sports` → pdf-service guard suppresses the entire section.
- **Phase 116 ready for /gsd-verify-phase + /gsd-complete-phase + /gsd-transition** to advance to Phase 117 (Auth-email rate-limit UX hardening).

No blockers carried forward.

## Self-Check: PASSED

- [x] `vigil-core/src/services/brief-assembly-service.ts` modified (SportsSelections import, EMPTY_SELECTIONS const, deps shim widened, mapSports D-15/D-18 comment, getUserSportsSelections helper, selections-read line, fetchAllLeagues call site)
- [x] `vigil-core/src/services/brief-assembly-service.test.ts` modified (4 SPORTS-01-brief-* tests appended + makeKeyAwareDb helper + makeAllDisabledSportsResponse fixture)
- [x] `vigil-core/src/index.ts` modified (8-line D-12 paper-trail comment above assembler instantiation)
- [x] Commit `32ef6e6` exists in git log (Task 1 RED)
- [x] Commit `6c93313` exists in git log (Task 1 GREEN)
- [x] Commit `59a2c23` exists in git log (Task 2)
- [x] `cd vigil-core && npx tsx --test src/services/brief-assembly-service.test.ts` exits 0 (24 pass: 20 pre-existing + 4 new)
- [x] `cd vigil-core && npx tsx --test src/services/sports-service.test.ts` exits 0 (25 pass; no regression to Plans 01/02/03)
- [x] `cd vigil-core && npx tsx --test src/routes/sports.test.ts` exits 0 (21 pass; route layer unchanged)
- [x] `cd vigil-core && npx tsc --noEmit` exits 0
- [x] `grep -n "data.sports.length > 0" vigil-core/src/services/pdf-service.ts` STILL matches at line 281 (renderer guard untouched — D-18 satisfied structurally)
- [x] `grep -n 'league.status !== "ok" || !league.data' vigil-core/src/services/brief-assembly-service.ts` STILL matches at line 81 (filter unchanged, comment added above)
- [x] `grep -n "function getUserSportsSelections" vigil-core/src/services/brief-assembly-service.ts` matches once
- [x] `grep -n 'key, "sports_selections"' vigil-core/src/services/brief-assembly-service.ts` matches once
- [x] `grep -n "fetchAllLeagues(sportsSelections)" vigil-core/src/services/brief-assembly-service.ts` matches once
- [x] `grep -n "fetchAllLeagues: (selections?: SportsSelections)" vigil-core/src/services/brief-assembly-service.ts` matches once (deps shim widened)
- [x] `grep -n "Phase 116 SPORTS-01 D-12" vigil-core/src/index.ts` matches once
- [x] `grep -c "SPORTS-01-brief-" vigil-core/src/services/brief-assembly-service.test.ts` returns 4

---
*Phase: 116-sports-source-picker*
*Completed: 2026-04-29*
