---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
plan: 07
subsystem: pwa-settings
tags: [phase-125, wave-3, pwa, settings, quiet-mode, optimistic-toggle]
requirements: [AGENT-HUD-03]

dependency_graph:
  requires:
    - plan: 125-05
      provides: "GET/PUT /v1/quiet-mode bearer-gated endpoint the PWA helpers call"
  provides:
    - "vigil-pwa/src/api/client.ts getQuietMode() + setQuietMode(enabled) — typed helpers over vigilFetch"
    - "vigil-pwa SettingsPage G2 Plugin section — only user-facing surface for users.quiet_mode"
    - "Optimistic flip + 400ms debounced PUT + rollback toast (mirrors Phase 116 SPORTS-01)"
    - "Loading / error / ok state branching mirrors SPORTS-01 sportsListStatus pattern"
    - "8 vitest+RTL gates per UI-SPEC §Verification Gates Surface 1"
  affects:
    - "Phase 125 Wave 4 hardware retest — operator can now toggle quiet_mode end-to-end and observe Q glyph on G2 HUD"
    - "AGENT-HUD-03 — last user-facing surface lands; requirement satisfied collectively by Plans 03+05+06+07"

tech-stack:
  added: []
  patterns:
    - "Native <input type='checkbox'> with accent-teal-600 (NOT a custom switch component — mirrors CAL-01/SPORTS-01)"
    - "Optimistic UI: setState BEFORE PUT fires; 400ms debounced PUT; rollback to lastSavedRef on failure"
    - "showToast({variant: 'error', body: verbatim UI-SPEC copy}) on PUT failure (Phase 116 D-21)"
    - "useCallback-wrapped loadQuietMode + useEffect mount-load (mirrors loadSportsSelections at line 312)"
    - "aria-describedby ties helper copy <p> to the checkbox for screen-reader users"
    - "fetchImpl route-stub test pattern (no vi.mock('../api/client')); mirrors SPORTS-01 makeSportsFetchImpl"

key-files:
  created: []
  modified:
    - "vigil-pwa/src/api/client.ts (+36 LOC — QuietModeResult interface + 2 typed helpers)"
    - "vigil-pwa/src/pages/SettingsPage.tsx (+117 LOC — imports + state + loadQuietMode + handler + cleanup + section render)"
    - "vigil-pwa/src/pages/SettingsPage.test.tsx (+163 LOC — 8 new vitest+RTL tests + makeQuietModeFetchImpl helper)"

key-decisions:
  - "Section placed AFTER Sports `</section>` (line 1220 post-edit) and BEFORE first ScheduleCard (Auto-generate at 1280) — satisfies UI-SPEC's 'after Sports, before Timezone' framing AND the plan's awk verification (sports < g2-plugin < Timezone). Placing it before ScheduleCard preserves the data-source → consumer mental model from UI-SPEC."
  - "Followed the existing SPORTS-01 fetchImpl route-stub test pattern (not vi.mock('../api/client') as the plan suggested) — the entire SettingsPage.test.tsx file uses fetchImpl exclusively. Switching to module mocks would have required converting the rest of the test scaffold or maintaining two parallel testing styles. fetchImpl is the load-bearing pattern; my tests honor it."
  - "loadQuietMode wrapped in useCallback (not inlined in useEffect) so the error-state Retry button can invoke it — mirrors loadSportsSelections at line 312, where loadSportsSelections is both the mount-load and the Retry handler."
  - "Section render uses three branches (`{quietModeStatus === 'loading' && …}` / `error` / `ok`) instead of a single `{quietModeStatus === 'ok' ? … : …}` ternary — mirrors SPORTS-01's render shape exactly and makes the three states grep-discoverable."
  - "Used JSX whitespace `{' '}` implicit (single space between sentence boundaries in the helper copy) — RTL collapses whitespace on `getByText` so the regex assertion works whether the text is one or two text nodes. Verified by QUIET-07 passing on first GREEN run."
  - "Did NOT add a 9th 'no DND copy' assertion — the acceptance criteria already required absent substrings, and the grep is faster as a shell check in the executor verification phase. Codified DND-absence as bash grep instead of vitest."

metrics:
  duration: "5 min 18 sec wall (2026-05-10T18:41:43Z → 18:47:01Z)"
  completed: "2026-05-10"
  tasks_completed: 2
  files_changed: 3  # 0 created, 3 modified
  loc_added: 316  # 36 + 117 + 163
  loc_removed: 0
  tests_added: 8 GREEN (vitest+RTL)
  tests_passing: "217/219 in vigil-pwa (was 209/211 pre-plan; +8 from QUIET-01..08; 2 pre-existing failures unchanged)"
---

# Phase 125 Plan 07: Wave-3 PWA — Quiet-mode toggle in Settings → G2 Plugin section Summary

**One-liner:** Surfaced the user-facing AGENT-HUD-03 control — new G2 Plugin section on the PWA Settings page with a native checkbox that optimistically flips, debounces 400ms before PUTting `/v1/quiet-mode`, rolls back + shows a verbatim error toast on failure. Mirrors Phase 116 SPORTS-01 / CAL-01 source-picker shape. Two new API client helpers (`getQuietMode` / `setQuietMode`) wrap `vigilFetch`. 8 new vitest+RTL tests cover render / loading / loaded-off / loaded-on / optimistic-flip / rollback / verbatim-helper-copy / no-arbitrary-tailwind-values per UI-SPEC §Verification Gates Surface 1.

## Performance

- **Duration:** 5 min 18 sec wall
- **Started:** 2026-05-10T18:41:43Z
- **Completed:** 2026-05-10T18:47:01Z
- **Tasks:** 2 (both atomic, both committed individually)
- **Files modified:** 3 (0 created)
- **LOC added:** 316 (36 client.ts + 117 SettingsPage.tsx + 163 SettingsPage.test.tsx)
- **Tests added:** 8 GREEN; total vigil-pwa suite 217/219 (+8 from this plan; 2 pre-existing failures unchanged)

## Accomplishments

- **`getQuietMode()` / `setQuietMode(enabled)`** — typed PWA API client helpers over `vigilFetch` (bearer auth + Phase 110 session-expired handling). New `QuietModeResult` interface mirrors the Plan 05 server contract (`{enabled, since: ISO|null}`).
- **G2 Plugin section** — new `<section data-testid="g2-plugin-section">` rendered AFTER Sports section and BEFORE the Auto-generate ScheduleCard / Timezone section. Verbatim markup from UI-SPEC §"Section Placement" + §"Quiet-Mode Toggle Row".
- **Optimistic + debounced + rollback** — `handleQuietModeToggle` flips checkbox state immediately, schedules a 400ms `setTimeout` PUT; on failure rolls back to `lastSavedQuietModeRef.current` and fires `showToast({variant: 'error', body: "Couldn't save quiet mode — try again"})`. Pattern verbatim from `handleCalendarToggle` at line 588 + Phase 116 SPORTS-01 D-21.
- **State branching** — `quietModeStatus` ('loading' | 'ok' | 'error') drives render of `Loading G2 settings…` / red error block with Retry / toggle row. Loading text + error retry shape mirror SPORTS-01 at lines 1028–1043.
- **A11y** — `aria-describedby="quiet-mode-help"` ties helper copy `<p>` to the checkbox; native `<input type="checkbox">` keyboard semantics inherited (Tab + Space).
- **Verbatim UI-SPEC copy** — heading "G2 Plugin", description "Settings for the Vigil plugin running on your Even Realities G2 glasses.", helper "Only urgent events (need-input prompts and failures) reach your glasses while this is on. Other events are queued and delivered when you turn it off.", error toast "Couldn't save quiet mode — try again". Zero "DND" / "Do Not Disturb" in user-facing copy (verified via grep `! grep "Do Not Disturb"` + `! grep -E "\bDND\b"` exiting 0).
- **8 GREEN tests** — QUIET-01 (render) / QUIET-02 (loading) / QUIET-03 (loaded-off) / QUIET-04 (loaded-on) / QUIET-05 (optimistic-flip) / QUIET-06 (rollback + verbatim toast) / QUIET-07 (verbatim helper copy) / QUIET-08 (static-grep rejects arbitrary Tailwind values). All pass against the implementation; failed all 8/8 against pre-implementation source (TDD RED confirmed).

## Task Commits

1. **Task 1: Add `getQuietMode` + `setQuietMode` PWA API client helpers** — `14872a1` (feat)
2. **Task 2: G2 Plugin section in SettingsPage with Quiet-mode toggle + 8 GREEN tests** — `862e2c0` (feat)

(Final metadata commit lands separately via the executor's docs commit.)

## Files Created/Modified

### Modified (3)

- **`vigil-pwa/src/api/client.ts`** — Appended a new `Phase 125` section (after `classifyFetchError`) with the `QuietModeResult` interface + `getQuietMode` + `setQuietMode` helpers. Uses `vigilFetch` so the existing bearer auth + Phase 110 session-expired handler apply for free. +36 LOC.
- **`vigil-pwa/src/pages/SettingsPage.tsx`** — Added imports (`getQuietMode`, `setQuietMode`), state (`quietModeEnabled` / `quietModeStatus` / `quietModeError` / `lastSavedQuietModeRef` / `quietModeSaveTimerRef`), `loadQuietMode` useCallback + mount useEffect, cleanup useEffect for the save timer, `handleQuietModeToggle` function, and the new `<section data-testid="g2-plugin-section">` JSX block (inserted between Sports `</section>` and the Auto-generate `ScheduleCard`). +117 LOC.
- **`vigil-pwa/src/pages/SettingsPage.test.tsx`** — Appended a new `describe('G2 Plugin Quiet-mode toggle (AGENT-HUD-03)', …)` block with a `makeQuietModeFetchImpl` helper (mirrors `makeSportsFetchImpl`) + 8 vitest+RTL tests. +163 LOC.

## Decisions Made

- **`fetchImpl` route-stub test pattern (not `vi.mock('../api/client')`).** Every existing test block in `SettingsPage.test.tsx` (CAL-01, SPORTS-01, AUTH-12 resend-verification) uses the `renderPage({ fetchImpl })` helper with a per-block `fetchImpl` factory that route-stubs by URL substring. Switching one new block to module mocks would have created two parallel testing styles. fetchImpl is the load-bearing pattern; my tests honor it. The plan's "use `vi.mock('../api/client')`" suggestion was a pattern hint, not a hard constraint — the acceptance criteria assert behaviors, not the test isolation mechanism.
- **`loadQuietMode` wrapped in `useCallback`.** Allows the error-state Retry button to invoke the same loader the mount-effect uses. Mirrors `loadSportsSelections` at line 312 (also useCallback, also used by both mount and Retry). Eliminates duplicate code.
- **Section placement: after Sports `</section>`, before Auto-generate `ScheduleCard`.** UI-SPEC §"Section Placement" framed it as "after Sports, before Timezone" but the actual file has two `ScheduleCard` rows (Auto-generate, Auto-print) between them. Placing the G2 Plugin section directly after Sports preserves UI-SPEC's data-source-type ordering (Vigil → Google → Calendars → Sports → G2 Plugin → ScheduleCards → Timezone). The plan's awk acceptance check (`sports < g2-plugin < Timezone`) returns FULL_ORDER_OK with this placement.
- **`<input type="checkbox">` with `accent-teal-600`, NOT a custom switch component.** UI-SPEC §"Quiet-Mode Toggle Row" line 102-106 locked this: every other toggle in SettingsPage (CAL-01 calendars, SPORTS-01 leagues) is a native checkbox. The 125-RESEARCH §Example E sample at lines 891-906 showed a custom `role="switch"` button shape, but UI-SPEC explicitly rejected that ("breaks the visual pattern and creates a precedent the planner would have to defend"). I followed UI-SPEC, not RESEARCH.
- **Trailing period on helper copy + NO trailing period on error toast.** UI-SPEC §"Copywriting Contract" notes the inconsistency between CAL-01 (no period) and SPORTS-01 (with period); spec-locked "no period for quiet mode". My error toast body is exactly `"Couldn't save quiet mode — try again"` (no period), matching the must_haves frontmatter contract.

## Deviations from Plan

### Auto-fixed Issues

**None — plan executed exactly as written**, with these two pattern-fit substitutions (documented above under "Decisions Made"):

1. **Test pattern: used `fetchImpl` route-stub instead of `vi.mock('../api/client')`.** This was a planner suggestion in the plan's <action> Step 7 — the acceptance criteria assert behavior (test names + 8 GREEN), not isolation mechanism. Using `fetchImpl` honors the established SettingsPage.test.tsx pattern.

2. **Section placement: after Sports `</section>`, before Auto-generate ScheduleCard** — not strictly between Sports and Timezone as the plan's prose said. Two `ScheduleCard` rows exist between Sports and Timezone in the actual file. Placing the new section directly after Sports preserves the data-source-type ordering UI-SPEC §"Section Placement" framed and passes both the plan's `awk` ordering checks (sports < g2-plugin, sports < g2-plugin < Timezone).

These are pattern alignment decisions, not Rule 1-3 deviations.

## Issues Encountered

### Pre-existing failures unchanged by this plan (out of scope)

- **`SettingsPage.test.tsx` line 109** — `SettingsPage > callback > shows error banner with decoded message when ?google_error=invalid_state` was failing BEFORE Task 1 began (confirmed by stashing my client.ts change and re-running: 2 failed / 209 passed; same state after my changes: 2 failed / 217 passed). Not a Plan 07 regression.
- **`src/api/client.test.ts`** — `redirectToGoogleAuth sets window.location.href to /v1/auth/google` — same pre-existing failure (test stubs `window.location.href = …` then `redirectToGoogleAuth` calls `vigilFetch` which tries to read `res.status` on an undefined fetch return). Not a Plan 07 regression.
- **`tsc --noEmit -p tsconfig.json` non-zero exit** — TS6305 errors on stale `.d.ts` files in src tree from a prior project-mode build. `tsc --noEmit -p tsconfig.app.json` filters to source and shows the same pre-existing `import.meta.env` typing errors (unaffected by my work). Plan 08's parallel commit `c9c4b15` separately excluded test files from tsconfig.json for build-prod purposes; that change is orthogonal to Plan 07.

All three issues logged for triage but out of scope per `<scope_boundary>`.

### Parallel commit during execution (informational)

- Between my Task 1 commit (`14872a1`) and Task 2 commit (`862e2c0`), Plan 125-08 landed `c9c4b15` (chore: exclude test files from tsc build + pack vigil.ehpk v0.3.0). That commit did NOT touch any of my Plan 07 files. Plan 08's deferred-items.md explicitly logged the Plan 07 PWA files as "DEF-125-08-01" out-of-scope, which is the expected behavior. No conflict, no merge needed.

## Threat Model Verification

| Threat | Mitigation | Verified |
|--------|------------|----------|
| T-125-W7-01 (toggle race during browser close before PUT settles) | accepted — 400ms debounce matches SPORTS-01; `lastSavedQuietModeRef` ensures eventual consistency on reload. No code mitigation needed. | Design accepted per plan; not auto-testable |
| T-125-W7-02 (network-tab payload disclosure) | accepted — same posture as all other vigil-core endpoints. Bearer in localStorage; payload is non-PII. | Design accepted per plan |
| T-125-04 (UI shows wrong checkbox state vs server reality on PUT failure) | mitigated — QUIET-06 test asserts rollback to `lastSavedQuietModeRef` + verbatim error toast after PUT 500 | QUIET-06 GREEN (8/8 plan-tests pass) |

## Self-Check: PASSED

- File `vigil-pwa/src/api/client.ts` contains `export interface QuietModeResult`: ✓ (1 occurrence)
- File contains `export async function getQuietMode`: ✓ (1 occurrence)
- File contains `export async function setQuietMode`: ✓ (1 occurrence)
- File contains `vigilFetch('/v1/quiet-mode'`: ✓ (2 occurrences — GET + PUT call sites)
- File contains `method: 'PUT'` for `setQuietMode`: ✓
- File `vigil-pwa/src/pages/SettingsPage.tsx` contains `data-testid="g2-plugin-section"`: ✓
- File contains `id="g2-plugin-heading"`: ✓
- File contains heading text `G2 Plugin`: ✓
- File contains `data-testid="quiet-mode-checkbox"`: ✓
- File contains `accent-teal-600`: ✓ (4 occurrences — calendar, sports, sports radio, quiet-mode)
- File contains `aria-describedby="quiet-mode-help"`: ✓
- File contains EXACT helper copy `Only urgent events (need-input prompts and failures) reach your glasses while this is on.`: ✓
- File does NOT contain `Do Not Disturb`: ✓ (grep exit 1)
- File does NOT contain `\bDND\b`: ✓ (grep -E exit 1)
- File contains `"Couldn't save quiet mode — try again"`: ✓
- Section ordering check 1 (sports < g2-plugin): `awk '/sports-section/{p1=NR} /g2-plugin-section/{p2=NR} END{print (p1 < p2) ? "ORDER_OK" : "ORDER_BROKEN"}' vigil-pwa/src/pages/SettingsPage.tsx | head -1` → `ORDER_OK`
- Section ordering check 2 (sports < g2-plugin < Timezone-h2): `awk '/sports-section/{p1=NR} /g2-plugin-section/{p2=NR} /<h2.*Timezone</{p3=NR; exit} END{print "sports=" p1 " g2=" p2 " tz=" p3 " => " ((p1 < p2 && p2 < p3) ? "FULL_ORDER_OK" : "FULL_ORDER_BROKEN")}' vigil-pwa/src/pages/SettingsPage.tsx` → `sports=1085 g2=1224 tz=1294 => FULL_ORDER_OK`
- Commit `14872a1` (Task 1) FOUND in `git log --oneline -10`: ✓
- Commit `862e2c0` (Task 2) FOUND in `git log --oneline -10`: ✓
- `cd vigil-pwa && npx vitest run src/pages/SettingsPage.test.tsx -t "G2 Plugin Quiet-mode"`: tests 8 / pass 8 / fail 0 ✓
- `cd vigil-pwa && npm test`: 217/219 passing (was 209/211 before plan; +8 from QUIET-01..08; 2 pre-existing failures unchanged) ✓
- No new tsc errors on `tsc --noEmit -p tsconfig.app.json`: ✓ (only pre-existing `import.meta.env` lines 3 + pre-existing thoughts/captureBar errors; zero new errors from my changes)

## Next Plan Readiness

- **AGENT-HUD-03 surfaces complete** — Plan 03 (suppression queue) + Plan 05 (route + agent-stream Phase 0 frame) + Plan 06 (plugin filter) + Plan 07 (PWA toggle, this plan) collectively satisfy AGENT-HUD-03 end-to-end. Final mark-complete waits for Wave 4 hardware retest.
- **Wave 4 (Plan 09 hardware retest + Plan 10 Even Hub submit + Plan 11 demo recording)** — operator wallclock; not auto-executable. The full PWA → Core → SSE → plugin → HUD chain is wired and unit-tested.
- **No new env vars, no new deps, no DB migrations.** Plan 02's `users.quiet_mode` migration auto-applies on Railway deploy; everything downstream is no-op until then.
- **No CLAUDE.md** in the repo root; no project-specific directives to honor beyond the standard workflow.

---
*Phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo*
*Plan: 07*
*Completed: 2026-05-10*
