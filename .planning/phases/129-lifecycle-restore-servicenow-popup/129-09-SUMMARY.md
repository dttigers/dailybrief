---
phase: 129-lifecycle-restore-servicenow-popup
plan: 09
subsystem: g2-plugin
tags: [g2-plugin, navigation, input-gesture, double-click, gap-closure, phase-124-d-08-pattern, hardware-input]

# Dependency graph
requires:
  - phase: 124-g2-polish-bundle
    provides: "Phase 124 D-08 COMPANION DOUBLE_CLICK carve-out structural template at navigation.ts:252-271"
  - phase: 127.5-g2-input-audit
    provides: "AUDIT-G2-INPUT-01 CONFIRM-DEFER verdict on single-press — DOUBLE_CLICK is the only reliably-plumbed G2 gesture"
  - phase: 129-lifecycle-restore-servicenow-popup
    provides: "Plan 129-02 restoreScreenFn at main.ts:99-130 + navigateToTaskDetail id-only localStorage write at navigation.ts:202-213"
provides:
  - "Context-sensitive WORK_ORDERS DOUBLE_CLICK gesture that enters TASK_DETAIL for index-0 (top-of-list) task on G2 hardware"
  - "Empty-list fall-through preserving the DOUBLE_CLICK→HOME exit affordance when there are no tasks to drill into"
  - "Source-level drift detectors (4 new tests) pinning the carve-out shape, ordering, and required comment-block references"
  - "Hardware-reachable seeding path for the `vigil:v3:lastScreen` localStorage `{screen: TASK_DETAIL, args: {id}}` payload — restore-to-TASK_DETAIL UAT scenario becomes testable in Plan 129-13"
affects: [129-10, 129-13, 130-voice-spike-removal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-level drift detector tests for navigation carve-outs (grep-on-comment-stripped-source) — established by Phase 124 Plan 07, reused here because behavioral imports fail under `tsx --test` (api.ts uses import.meta.env which is Vite-only)"
    - "Context-sensitive DOUBLE_CLICK carve-out template (Phase 124 D-08): `if currentScreen === <Screen> && eventType === DOUBLE_CLICK_EVENT → context-specific action; return` — extends Phase 124 COMPANION + Phase 128a VOICE_SPIKE to WORK_ORDERS"
    - "Fall-through-on-empty pattern: carve-out conditionally returns; when the precondition (non-empty task list) is unmet, control falls past the carve-out to the default switch — used here so empty WORK_ORDERS still has a defined exit gesture (DOUBLE_CLICK → HOME)"

key-files:
  created: []
  modified:
    - "vigil-g2-plugin/src/navigation.ts (new WORK_ORDERS DOUBLE_CLICK carve-out in handleNavEvent at lines ~298-345)"
    - "vigil-g2-plugin/src/__tests__/navigation.test.ts (4 new GAP-129-F drift tests)"
    - ".planning/phases/129-lifecycle-restore-servicenow-popup/deferred-items.md (logged pre-existing TTL_MS test failure as out-of-scope)"

key-decisions:
  - "Test pattern fallback: plan <interfaces> referenced a FakeBridge + setLastFetchedTasks test seam that don't exist; switched to source-level drift detector pattern (same as Phase 124 Plan 07) per plan <deviation_handling> guidance"
  - "DOUBLE_CLICK conflict resolution: non-empty list enters TASK_DETAIL (primary use case); empty list falls through to HOME (preserving exit affordance). HOME exit from non-empty WORK_ORDERS reachable via SCREEN_ORDER carousel swipe-up — same affordance every other carousel screen provides"
  - "Sim-side CLICK_EVENT wiring at main.ts:316-322 PRESERVED — both gesture paths coexist (CLICK_EVENT on sim, DOUBLE_CLICK on hardware), converging on navigateToTaskDetail. No risk of behavioral regression in sim test runs"
  - "Pre-existing TTL_MS drift test failure unrelated to GAP-129-F — logged to deferred-items.md per scope-boundary rule, owner suggested as Plan 129-10 or standalone follow-up"

patterns-established:
  - "Hardware-vs-sim input gesture duality: sim relies on CLICK_EVENT (list-item-click), hardware relies on DOUBLE_CLICK_EVENT (temple-touchpad). Both paths must coexist when shipping a feature that needs to work on both surfaces"
  - "Drift-detector test for narrative comment-block invariants: assert that a windowed slice of raw source around a guard contains the required project-history references (Phase X, GAP-Y) — this codifies the unwritten norm that carve-outs MUST explain their own provenance"

requirements-completed: [G2-LIFECYCLE-02]

# Metrics
duration: 5 min
completed: 2026-05-16
---

# Phase 129 Plan 09: G2 DOUBLE_CLICK entry gesture on WORK_ORDERS list → TASK_DETAIL Summary

**WORK_ORDERS list now has a hardware-reliable DOUBLE_CLICK carve-out that enters TASK_DETAIL for the top-of-list task, closing GAP-129-F and unblocking UAT Scenario 1 (full restore-to-TASK_DETAIL flow)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-16T17:11:51Z
- **Completed:** 2026-05-16T17:16:39Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 3 (navigation.ts, navigation.test.ts, deferred-items.md)

## Accomplishments

- Added a Phase-124-D-08-style context-sensitive DOUBLE_CLICK carve-out for `Screen.WORK_ORDERS` in `handleNavEvent`. When `getLastFetchedTasks().length >= 1`, the carve-out calls `await navigateToTaskDetail(0, bridge); return` — entering the first/top-of-list task. The existing fire-and-forget localStorage write inside `navigateToTaskDetail` (navigation.ts:202-213) seeds `vigil:v3:lastScreen` with `{screen: TASK_DETAIL, args: {id}, savedAt}`, making the restore-on-relaunch precondition reachable through normal operator interaction on real G2 hardware.
- Empty-list fall-through: when `getLastFetchedTasks()` returns `[]`, the carve-out does NOT return, allowing execution to fall past to the bottom `let target: ScreenName` default-switch where `DOUBLE_CLICK_EVENT → Screen.HOME` already exists. Empty WORK_ORDERS preserves the exit-to-HOME affordance.
- Wrote 4 new source-level drift detector tests in `navigation.test.ts` covering: (1) the guard + body shape (`navigateToTaskDetail(0,` + `getLastFetchedTasks` references), (2) the empty-list fall-through ordering (default switch's `DOUBLE_CLICK → Screen.HOME` still exists AFTER the carve-out), (3) the source ordering (carve-out appears between VOICE_SPIKE and the default `let target: ScreenName` switch), (4) the comment-block references (Phase 124 D-08, Phase 45, GAP-129-F all appear in the comment header).
- Sim-side CLICK_EVENT wiring at `main.ts:316-322` preserved untouched. Both event paths now converge on `navigateToTaskDetail` (CLICK_EVENT on sim, DOUBLE_CLICK_EVENT on hardware).
- Logged a pre-existing TTL_MS test failure (unrelated to this plan, from commit ca91f60) to `deferred-items.md` per the scope-boundary rule.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author navigation.test.ts cases for new WORK_ORDERS DOUBLE_CLICK carve-out (RED)** — `7b90918` (test)
2. **Task 2: Add WORK_ORDERS DOUBLE_CLICK carve-out to navigation.ts handleNavEvent (GREEN)** — `f8e395c` (feat — bundled the post-RED test-window widening as a Rule-1 deviation, see Deviations section)

**Plan metadata:** _Pending (this SUMMARY + deferred-items.md will commit as the docs commit below)_

## Files Created/Modified

- **`vigil-g2-plugin/src/navigation.ts`** — Added WORK_ORDERS DOUBLE_CLICK carve-out in `handleNavEvent` (lines ~298-345) between the VOICE_SPIKE carve-out and the default `let target: ScreenName` switch. Pattern follows Phase 124 D-08 COMPANION (navigation.ts:252-271). Includes a 50-line comment header documenting the structural template, the Phase 45 retro context (CLICK_EVENT is sim-only on G2), the Phase 127.5 AUDIT-G2-INPUT-01 verdict (CONFIRM-DEFER for single-press), the GAP-129-F closure, the empty-list fall-through rationale, and the DOUBLE_CLICK conflict resolution.
- **`vigil-g2-plugin/src/__tests__/navigation.test.ts`** — Added 4 new drift tests under the `// ── Phase 129 Plan 09 — GAP-129-F` section: `GAP-129-F (case A)`, `GAP-129-F (case B)`, `GAP-129-F: ordering`, `GAP-129-F: comment block references`. Includes a header comment explaining why this codebase uses drift-detector pattern over behavioral tests (api.ts uses import.meta.env which breaks `tsx --test`). Widened the comment-block test's source-window from 1500 to 2500 chars after authoring (Rule-1 deviation on a self-authored test).
- **`.planning/phases/129-lifecycle-restore-servicenow-popup/deferred-items.md`** — New file. Logs the pre-existing `D-129 drift: TTL constant 30 * 60 * 1000 present in helpers` test failure from commit `ca91f60` (Plan 129-02's "drop unused TTL_MS" refactor that wasn't synced into the drift test).

## Decisions Made

- **Drift-detector tests instead of FakeBridge behavioral tests.** The plan's `<interfaces>` block described a FakeBridge + `setLastFetchedTasks` test seam pattern. Neither exists in this codebase. `navigation.ts` transitively imports `api.ts`, which reads `import.meta.env.VITE_API_URL` — a Vite-only construct that throws `Cannot read properties of undefined (reading 'VITE_API_URL')` under `tsx --test`. The closest applicable pattern (per plan `<deviation_handling>` guidance) is the source-level drift detector — the SAME pattern Phase 124 Plan 07 used for the COMPANION DOUBLE_CLICK carve-out tests at navigation.test.ts lines 39-63. Hardware behavioral verification of the gesture lives in Plan 129-13.

- **DOUBLE_CLICK conflict resolution: non-empty enters TASK_DETAIL, empty preserves HOME exit.** Previously DOUBLE_CLICK on WORK_ORDERS routed to HOME via the default switch. The new behavior prioritizes the primary use case (drill into the first task) while preserving an exit affordance when the screen has nothing to drill into. From a non-empty WORK_ORDERS screen, the operator reaches HOME by swiping up past the top of the list — the same SCREEN_ORDER-carousel affordance every other carousel screen provides. This preserves the Phase 124 D-07 invariant "glasses-menu launches still land on operator-picked screen" because the carve-out only fires on DOUBLE_CLICK, not on launch.

- **Sim-side CLICK_EVENT wiring preserved.** Removing the `main.ts:316-322` CLICK_EVENT handler would break sim-test fidelity (sim fires CLICK_EVENT, not DOUBLE_CLICK_EVENT). Both paths can coexist because they fire on different event surfaces. Phase 45 retro is preserved as historical truth (CLICK_EVENT IS sim-only on G2); the DOUBLE_CLICK path is additive.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test framework pattern mismatch — FakeBridge harness doesn't exist**

- **Found during:** Task 1 (RED test authoring)
- **Issue:** The plan's `<interfaces>` block described a FakeBridge + `setLastFetchedTasks` test seam and asserted behavioral outcomes (`fakeBridge.recordedRebuildContainers`, `currentScreen === Screen.TASK_DETAIL`). Neither the FakeBridge harness nor the `setLastFetchedTasks` setter exists in `vigil-g2-plugin`. Probing further: `navigation.ts` transitively imports `api.ts` which reads `import.meta.env.VITE_API_URL` (Vite-only). Direct dynamic import of `./src/navigation.ts` under `tsx --test` throws `Cannot read properties of undefined (reading 'VITE_API_URL')`. The existing `navigation.test.ts` (Phase 124 Plan 07) and `main.test.ts` (Phase 124 Plan 08) both use **source-level drift detectors** — `readFileSync` + comment-stripped grep — for exactly this reason. This is the project's documented pattern (see main.test.ts:8-18 comment block on the side-effect workaround).
- **Fix:** Authored Task 1's RED tests as four drift-detector assertions mirroring the existing D-08 COMPANION drift tests at navigation.test.ts:39-63. Tests assert: (A) the guard `currentScreen === Screen.WORK_ORDERS` + `DOUBLE_CLICK_EVENT` + body calls `navigateToTaskDetail(0,` + reads `getLastFetchedTasks`; (B) the carve-out checks `.length` AND the default switch's `DOUBLE_CLICK_EVENT → Screen.HOME` line still exists AFTER the carve-out (fall-through target); (C) source ordering between VOICE_SPIKE and the default switch; (D) comment block references Phase 124 D-08 + Phase 45 + GAP-129-F.
- **Files modified:** `vigil-g2-plugin/src/__tests__/navigation.test.ts`
- **Verification:** All 4 new tests RED-fail against unmodified `navigation.ts`; all turn GREEN after Task 2's carve-out lands.
- **Committed in:** `7b90918` (Task 1 RED commit)

**2. [Rule 1 - Bug] Comment-block drift test source-window too narrow (self-authored test)**

- **Found during:** Task 2 (GREEN verification)
- **Issue:** The Task-1 drift test `GAP-129-F: WORK_ORDERS carve-out comment block references Phase 124 D-08, Phase 45, and GAP-129-F` used a 1500-char window before the WORK_ORDERS guard to assert the required literals appear in the comment block. The new carve-out's comment header runs ~50 lines (a deliberate choice — the carve-out documents Phase 124 D-08 template, Phase 45 retro rationale, Phase 127.5 audit verdict, GAP-129-F closure, empty-list fall-through reasoning, AND DOUBLE_CLICK conflict resolution). The `GAP-129-F` literal sits at the very top of the comment, just beyond the 1500-char window — the test failed with `Comment block references GAP-129-F` returning false.
- **Fix:** Widened the window to 2500 chars in `navigation.test.ts` and documented the empirical width in a code comment.
- **Files modified:** `vigil-g2-plugin/src/__tests__/navigation.test.ts`
- **Verification:** All 4 new GAP-129-F tests pass after the widening; ran `npx tsx --test src/__tests__/navigation.test.ts` to confirm. The RED→GREEN gate sequence is preserved because the guard-presence assertion (test case A) fires first on unmodified source — the comment-block test never gets a chance to evaluate window contents pre-Task-2.
- **Committed in:** `f8e395c` (bundled with Task 2 GREEN commit because the two source-file changes form a single coherent unit — the test now correctly validates a carve-out whose comment header was always going to be long enough to need a wider window).

**3. [Rule 3 - Out-of-scope, deferred] Pre-existing TTL_MS drift test failure unrelated to GAP-129-F**

- **Found during:** Baseline test run before Task 1
- **Issue:** `D-129 drift: TTL constant 30 * 60 * 1000 present in helpers` in `main.test.ts:259-268` fails because commit `ca91f60` ("fix(129-02): drop unused TTL_MS") removed the `TTL_MS` import from `launch-source-helpers.ts` without updating this drift test. Baseline tests: 107 pass / 1 fail.
- **Fix:** NOT fixed in this plan. Per scope-boundary rule (`gsd-executor.md` §SCOPE BOUNDARY: "Only auto-fix issues DIRECTLY caused by the current task's changes"), this is pre-existing tech debt unrelated to GAP-129-F. Logged to `.planning/phases/129-lifecycle-restore-servicenow-popup/deferred-items.md` with recommended fix (update the drift test to assert `pickRestoredScreen` import in helpers, OR assert TTL literal in `screen-state-restore.ts`, OR delete the test).
- **Files modified:** `.planning/phases/129-lifecycle-restore-servicenow-popup/deferred-items.md` (new file)
- **Verification:** Test failure exists on `main` BEFORE this plan started; will persist after this plan lands. No regression introduced.
- **Suggested owner:** Plan 129-10 (G2 restore diagnostic) or a standalone follow-up.

---

**Total deviations:** 3 (1 blocking-pattern-mismatch, 1 self-test-bug-fix, 1 out-of-scope-deferred)
**Impact on plan:** Deviation 1 changed the test pattern from behavioral to drift-detector, which matches the codebase norm (Phase 124 precedent) and preserves the RED→GREEN→commit gate sequence. Deviation 2 was a self-correction on a test I authored in Task 1. Deviation 3 is pure scope hygiene — pre-existing failure, properly logged, not fixed. No scope creep; carve-out implementation matches plan `<must_haves.truths>` and all `<acceptance_criteria>` items pass.

## Issues Encountered

- The plan's `<interfaces>` description of a FakeBridge test harness did not match codebase reality. Caught and resolved during Task 1 via the plan's own `<deviation_handling>` instructions ("fall back to the closest applicable test pattern"). Documented as Deviation 1 above.

## Verification Output

### Test suite (Task 1 + Task 2 verify commands)

```
$ npx tsx --test src/__tests__/navigation.test.ts src/__tests__/main.test.ts
ℹ tests 30
ℹ pass 29
ℹ fail 1   (← pre-existing TTL_MS, deferred)
ℹ duration_ms ~180

✔ All 4 new GAP-129-F drift tests pass
✔ All 5 existing navigation.test.ts drift tests still pass
✔ 24 of 25 main.test.ts tests pass (1 pre-existing failure)
```

### TypeScript compile

```
$ npx tsc --noEmit
(clean — exit 0)
```

### Build-gate (Plan 129-12 convention)

```
$ npm run build
> vigil-g2-plugin@0.0.0 build
> tsc && vite build

vite v8.0.3 building client environment for production...
✓ 21 modules transformed.
dist/index.html                 3.46 kB │ gzip:  1.34 kB
dist/assets/index-Bc8IIeFY.js  78.09 kB │ gzip: 29.57 kB
✓ built in 60ms
(clean — exit 0)
```

### Source grep

```
$ grep -c 'Screen.WORK_ORDERS' src/navigation.ts
4   (≥ 2 — existing TASK_DETAIL→WORK_ORDERS fallback + new WORK_ORDERS carve-out guard + 2 in comments)
```

## Threat Surface Review

Per plan `<threat_model>`:

- **T-129-36 (DoS on empty list)** — Mitigated. Empty-list fall-through hands control to the default switch (`DOUBLE_CLICK → Screen.HOME`), verified by drift test case B's assertion that the default `case OsEventTypeList.DOUBLE_CLICK_EVENT:` line still exists AFTER the carve-out and routes to `Screen.HOME`. No path through the new code can call `navigateToTaskDetail(0, ...)` with `tasks.length === 0`.
- **T-129-37 (Tampering / out-of-bounds index)** — Mitigated by two layers. (1) The new carve-out's `if (tasks.length >= 1)` guards the `navigateToTaskDetail(0, ...)` call. (2) Defense-in-depth: `navigateToTaskDetail` itself has `if (!task) return` at navigation.ts:198.
- **T-129-38 (Repudiation / sim vs hardware divergence)** — Accepted per plan. Sim still fires CLICK_EVENT (handled at main.ts:316-322), hardware fires DOUBLE_CLICK_EVENT (handled by the new carve-out). Both paths converge on `navigateToTaskDetail`. Hardware verification step lives in Plan 129-13.
- **T-129-SC (Supply chain)** — N/A. No new packages installed.

No new threat flags discovered. No new external surface introduced.

## Known Stubs

None. The carve-out wires real production code into the existing handleNavEvent dispatcher; no placeholder/mock/empty-array patterns are introduced.

## TDD Gate Compliance

This is a TDD plan (`tdd="true"` on both tasks):

- ✓ RED gate: `test(129-09): add failing drift tests` at commit `7b90918` (4 new tests fail against unmodified navigation.ts)
- ✓ GREEN gate: `feat(129-09): add WORK_ORDERS DOUBLE_CLICK carve-out` at commit `f8e395c` (all 4 RED tests turn green)
- REFACTOR gate: not exercised (the implementation was minimal — adding a 12-line carve-out — no cleanup was needed)

Gate sequence verified via `git log --oneline | grep 129-09`.

## Next Phase Readiness

- **Plan 129-13 (re-run UAT)** unblocked: operator can now reach TASK_DETAIL on real G2 hardware via DOUBLE_CLICK on a non-empty WORK_ORDERS list. UAT Scenario 1 (full restore-to-TASK_DETAIL flow) becomes testable end-to-end.
- **Plan 129-10 (G2 restore diagnostic)** unblocked: the precondition seeding (entering TASK_DETAIL, which writes `vigil:v3:lastScreen` localStorage) is now reachable on hardware.
- **Deferred:** TTL_MS drift test fix (logged to `deferred-items.md`) — suggested owner is Plan 129-10 or a standalone follow-up.
- **Hardware verification of DOUBLE_CLICK gesture itself** — deferred to Plan 129-13 UAT.

## Self-Check

- Created file `.planning/phases/129-lifecycle-restore-servicenow-popup/129-09-SUMMARY.md`: WILL VERIFY POST-WRITE
- Created file `.planning/phases/129-lifecycle-restore-servicenow-popup/deferred-items.md`: VERIFIED VIA `git status`
- Commit `7b90918` (Task 1 RED): VERIFIED VIA `git rev-parse --short`
- Commit `f8e395c` (Task 2 GREEN): VERIFIED VIA `git rev-parse --short`
- All `<acceptance_criteria>` items: VERIFIED (test suite + source-grep + tsc + build all pass per Verification Output section)

## Self-Check: PASSED

---
*Phase: 129-lifecycle-restore-servicenow-popup*
*Plan: 09*
*Completed: 2026-05-16*
