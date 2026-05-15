---
phase: 129-lifecycle-restore-servicenow-popup
plan: "02"
subsystem: g2-plugin
tags: [g2-plugin, lifecycle, background-state, local-storage, tdd]
dependency_graph:
  requires: []
  provides: [screen-state-restore-module, navigation-setLocalStorage, pickInitialScreen-restore, main-module-scope-registration]
  affects: [vigil-g2-plugin]
tech_stack:
  added: []
  patterns: [audio-session-guard-feature-detect, fire-and-forget-catch, drift-detector-readFileSync, tdd-red-green]
key_files:
  created:
    - vigil-g2-plugin/src/lib/screen-state-restore.ts
    - vigil-g2-plugin/src/lib/__tests__/screen-state-restore.test.ts
  modified:
    - vigil-g2-plugin/src/navigation.ts
    - vigil-g2-plugin/src/lib/launch-source-helpers.ts
    - vigil-g2-plugin/src/main.ts
    - vigil-g2-plugin/src/__tests__/main.test.ts
decisions:
  - "D-AUTO-01: Used task.id instead of task.caseNumber in navigateToTaskDetail setLocalStorage write — VigilBrief.openTasks items have id:number (thought tasks), not caseNumber (ServiceNow work orders); plan text had a naming confusion between the two entity types"
  - "D-AUTO-02: Drift test checks registerBackgroundStateHandlers( literal instead of setBackgroundState( literal — setBackgroundState is called inside screen-state-restore.ts (correct abstraction boundary); main.ts calls the register function which is the module-scope sentinel"
metrics:
  duration_minutes: 11
  completed_date: "2026-05-15"
  tasks_completed: 2
  files_created: 2
  files_modified: 4
---

# Phase 129 Plan 02: G2 Lifecycle Restore — Screen State Module + Wiring Summary

G2-LIFECYCLE-01/02/03 delivered: screen-state-restore module with setBackgroundState/onBackgroundRestore registration at module scope, setLocalStorage fire-and-forget writes on every navigation, TTL-gated restore in pickInitialScreen for non-glassesMenu launches, and companion HUD cache fold (D-11 free win).

## What Was Built

### Task 1: screen-state-restore.ts module + unit tests (TDD)

**`vigil-g2-plugin/src/lib/screen-state-restore.ts`** (NEW, 115 lines):
- `ScreenRestoreBridge` interface (locally declared, SDK-free per audio-session-guard.ts pattern)
- `SCREEN_STATE_KEY = 'vigil-screen-state'`, `COMPANION_STATE_KEY = 'vigil-companion-state'`
- `LAST_SCREEN_LS_KEY = 'vigil:v3:lastScreen'`, `TTL_MS = 30 * 60 * 1000` (inline literal per D-05)
- `StoredLastScreen` type (id-only args per D-08)
- `pickRestoredScreen(stored, now)`: pure TTL-gate helper — returns stored.screen when fresh, 'home' otherwise; all malformed inputs return 'home' without throwing (T-129-05)
- `registerBackgroundStateHandlers(bridge, ...)`: feature-detect + dual setBackgroundState/onBackgroundRestore registration (COMPANION_STATE_KEY for D-11 + SCREEN_STATE_KEY for G2-LIFECYCLE-01)
- `__resetForTesting()`: test-reset helper per audio-session-guard.ts pattern

**`vigil-g2-plugin/src/lib/__tests__/screen-state-restore.test.ts`** (NEW, 18 tests):
- TTL boundary tests: 29min 59s → restore, 30min 01s → HOME
- pickRestoredScreen: null/string/empty-object/missing-savedAt → HOME without throwing
- registerBackgroundStateHandlers with dev-preview bridge: no throw, console.warn fired
- registerBackgroundStateHandlers with full bridge: both vigil-companion-state and vigil-screen-state registered
- D-11 companion snapshot hydration: restoreCompanionSnapshot called with verbatim payload (deepStrictEqual)
- D-07 404-fallback: TASK_DETAIL with args + null re-fetch → recorded navigateTo lands on 'work-orders', NOT 'home'
- Drift-detector: TTL constant `30 * 60 * 1000` present verbatim in source

### Task 2: navigation.ts + launch-source-helpers.ts + main.ts wiring + main.test.ts drift coverage (TDD)

**`vigil-g2-plugin/src/navigation.ts`** (MODIFIED):
- Import `LAST_SCREEN_LS_KEY` from screen-state-restore.ts
- `navigateTo()`: fire-and-forget setLocalStorage write after rebuildPageContainer — shape `{screen, savedAt}` (G2-LIFECYCLE-02)
- `navigateToTaskDetail()`: fire-and-forget setLocalStorage write — shape `{screen: TASK_DETAIL, args: {id: task.id}, savedAt}` per D-08 id-only

**`vigil-g2-plugin/src/lib/launch-source-helpers.ts`** (MODIFIED):
- Import `pickRestoredScreen`, `LAST_SCREEN_LS_KEY`, `TTL_MS` from screen-state-restore.ts
- `pickInitialScreen` extended with optional `bridge?` third param
- For `source !== 'glassesMenu'` with bridge: attempts TTL-gated restore via `bridge.getLocalStorage(LAST_SCREEN_LS_KEY)`, JSON.parse wrapped in try/catch, falls through to HOME on malformed/expired
- `source === 'glassesMenu'` branch: UNCHANGED (D-10 invariant preserved)

**`vigil-g2-plugin/src/main.ts`** (MODIFIED):
- Import `getActiveSessions` from companion.ts, `fetchBrief` from api.ts, `registerBackgroundStateHandlers` from screen-state-restore.ts
- Module-scope `restoreScreenFn` const declared BEFORE `function init()`:
  - For TASK_DETAIL + args.id: fetchBrief() → find task by id → if not found (404), `navigateTo(Screen.WORK_ORDERS, bridge)` (D-07); if found, `navigateToTaskDetail(taskIdx, bridge)`
  - For other screens: `navigateTo(screen, bridge)` directly
- Module-scope `registerBackgroundStateHandlers(bridgeInstance, ...)` call inserted BETWEEN launchSourcePromise declaration and function init() declaration — satisfies G2-LIFECYCLE-01 module-scope constraint
- Companion snapshot uses `getActiveSessions()` for live state (D-11)
- `pickInitialScreen(source, ..., bridge)` call updated to pass bridgeInstance as third arg (G2-LIFECYCLE-02)

**`vigil-g2-plugin/src/__tests__/main.test.ts`** (MODIFIED — 5 new tests appended):
- D-129 drift: `registerBackgroundStateHandlers(` precedes `function init()` (module-scope constraint)
- D-129 drift: helpers file references `TTL_MS` (imported from screen-state-restore.ts)
- D-129: `pickInitialScreen('glassesMenu', fetchSessions, fakeBridge)` returns COMPANION — localStorage ignored (D-10)
- D-129 drift: `Screen.WORK_ORDERS` appears near `restoreScreenFn` in main.ts source
- D-129 drift: navigation.ts contains `setLocalStorage` and `LAST_SCREEN_LS_KEY`

## Verification

Final test run: **39/39 tests pass**
- main.test.ts: 21/21 (16 pre-existing + 5 new D-129 tests)
- screen-state-restore.test.ts: 18/18 (all new)

Pre-existing D-07 drift assertions: **21/21 remain green**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used task.id instead of task.caseNumber in navigateToTaskDetail**
- **Found during:** Task 2 implementation
- **Issue:** Plan text says `{ id: task.caseNumber }` but `VigilBrief['openTasks']` items have `id: number` (thought tasks from vigil-core). `caseNumber` is a ServiceNow work order field, not a thought task field. The plan conflated the two entity types.
- **Fix:** Used `task.id` (the actual property on the task object from openTasks)
- **Files modified:** `vigil-g2-plugin/src/navigation.ts`
- **Commit:** d3050c9

**2. [Rule 1 - Bug] Drift test checks registerBackgroundStateHandlers( instead of setBackgroundState(**
- **Found during:** Task 2 GREEN phase
- **Issue:** Plan says "drift test asserts `setBackgroundState(` source index < `function init(` source index in main.ts". But main.ts calls `registerBackgroundStateHandlers()` (the wrapper function from screen-state-restore.ts) — `setBackgroundState(` literally appears inside screen-state-restore.ts, not main.ts. The drift test as specified would never pass with the correct abstraction boundary.
- **Fix:** Updated drift test to check for `registerBackgroundStateHandlers(` in main.ts, which is the correct module-scope sentinel. Added comment explaining the abstraction boundary rationale.
- **Files modified:** `vigil-g2-plugin/src/__tests__/main.test.ts`
- **Commit:** d3050c9

## Self-Check

### Files Created/Modified Exist
- `vigil-g2-plugin/src/lib/screen-state-restore.ts`: exists
- `vigil-g2-plugin/src/lib/__tests__/screen-state-restore.test.ts`: exists
- `vigil-g2-plugin/src/navigation.ts`: modified
- `vigil-g2-plugin/src/lib/launch-source-helpers.ts`: modified
- `vigil-g2-plugin/src/main.ts`: modified
- `vigil-g2-plugin/src/__tests__/main.test.ts`: modified

### Commits Exist
- f174a1f: test(129-02): add failing tests for screen-state-restore module (RED)
- c6b1538: feat(129-02): implement screen-state-restore module (GREEN)
- defcb2f: test(129-02): add failing drift tests to main.test.ts (RED phase Task 2)
- d3050c9: feat(129-02): wire navigation.ts + launch-source-helpers.ts + main.ts (GREEN)

## Self-Check: PASSED
