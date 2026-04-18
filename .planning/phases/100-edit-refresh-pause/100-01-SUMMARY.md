---
phase: 100-edit-refresh-pause
plan: 01
subsystem: ui
tags: [react, vitest, custom-events, polling, edit-state, pwa]

requires:
  - phase: 94-pwa-task-filters
    provides: useThoughts hook structure with 30s auto-refresh + vigil:thought-created pattern
provides:
  - Edit-aware pause gate in useThoughts: Set<number> refcount on window vigil:edit-started/ended events
  - ThoughtRow dispatches vigil:edit-started on content click, vigil:edit-ended on save/Escape/blur/unmount
  - Canonical window CustomEvent<{id:number}> contract reusable by Phase 101 context menu and any future pause consumer
  - 12 new vitest test cases (6 consumer, 6 producer) locking in the contract
affects: [phase-101-context-menu, phase-102-multi-user, future-polling-hooks]

tech-stack:
  added: []
  patterns:
    - "Window CustomEvent bus with typed detail payload for cross-component coordination (extends existing vigil:thought-created pattern)"
    - "Set-based refcount for concurrent-edit safety (size > 0 = paused; N->0 transition triggers catch-up)"
    - "clearInterval-on-pause / setInterval-on-resume so resumed poll cadence is always a full 30s from resume moment (D-09)"
    - "isEditingRef + thoughtIdRef + []-deps cleanup for unmount-only side effects (avoids dep-change false firings)"

key-files:
  created:
    - vigil-pwa/src/hooks/useThoughts.test.tsx
    - vigil-pwa/src/components/ThoughtRow.test.tsx
    - .planning/phases/100-edit-refresh-pause/deferred-items.md
  modified:
    - vigil-pwa/src/hooks/useThoughts.ts
    - vigil-pwa/src/components/ThoughtRow.tsx

key-decisions:
  - "Event names finalized: vigil:edit-started / vigil:edit-ended on window (not document), matching vigil:thought-created precedent (D-01, D-03)"
  - "Refcount container: effect-scoped const activeEdits = new Set<number>() inside useEffect (no useRef needed — refetch identity is stable from [] useCallback deps, effect runs exactly once)"
  - "Five edit-ended dispatch sites in ThoughtRow (D-11, D-12): no-change early return, empty-content early return, handleSave finally, Escape branch, unmount-while-editing cleanup"
  - "D-12 unmount guard: deviated from plan's [isEditing, thought.id] dep array to isEditingRef + [] deps — the plan's deps would re-fire cleanup on every isEditing transition, double-dispatching end alongside explicit Escape/Save dispatches (Rule 1 bug fix, see Deviations)"
  - "N->0 transition guard (hadEntry && activeEdits.size === 0) ensures stray edit-ended from foreign code is a no-op (Test 5 contract)"

patterns-established:
  - "Pause-gated polling via window event bus: reusable shape for Phase 101 context menu or any future polling hook needing edit-aware suspension"
  - "TDD on React hooks with fake timers: advance in single 30s increments + act(flushMicrotasks) between advances to avoid React batching collapsing two setState calls into one render"

requirements-completed: [EDIT-01]

duration: 5min
completed: 2026-04-18
---

# Phase 100 Plan 01: Edit-Refresh Pause Summary

**Window event bus (vigil:edit-started/ended) with Set-based refcount pauses useThoughts' 30s poll + visibilitychange + vigil:thought-created triggers during active inline edits, fires a single catch-up refetch on the last-edit-ends transition, and ships with 12 new vitest cases locking in the contract.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-18T00:42:53Z
- **Completed:** 2026-04-18T00:47:48Z
- **Tasks:** 3
- **Files modified:** 2 source + 2 test (4 total)

## Accomplishments

- All three refresh triggers in `useThoughts` (30s interval, visibilitychange, vigil:thought-created) now gate on `activeEdits.size === 0` — an inline-edit-in-progress no longer has its draft clobbered by `setThoughts(res.data)`
- ThoughtRow emits `vigil:edit-started` exactly once on content click and `vigil:edit-ended` on every exit path — save success, save no-change, save empty-content, Escape, blur, and unmount-while-editing (5 dispatch sites in total, verified by grep)
- Set-based refcount (not counter) protects against stray `edit-ended` without matching start and duplicate `edit-started` with same id — both were explicit test cases
- On the last edit ending, one catch-up refetch fires immediately and the 30s interval restarts from that moment (fresh cadence, not partial leftover)
- 6 new `useThoughts.test.tsx` cases + 6 new `ThoughtRow.test.tsx` cases — all 12 pass, plus all pre-existing vitest cases still pass (34/35 in full suite; 1 pre-existing failure out of scope, logged to deferred-items.md)
- Production `npm run build` succeeds — no regressions in bundle

## Task Commits

1. **Task 1: [RED] Write failing vitest for useThoughts pause-gate behavior** — `1638a8a` (test)
2. **Task 2: [GREEN] Implement edit-aware pause gate in useThoughts** — `f1ffdd6` (feat)
3. **Task 3: [RED→GREEN] ThoughtRow dispatches edit-started/ended on all edit-lifecycle paths** — `eca9273` (feat)

_TDD tasks combined RED and GREEN commits where Task 1's test file was kept separate from Task 2's implementation; Task 3 combined them because ThoughtRow had no pre-existing test file._

## Files Created/Modified

- `vigil-pwa/src/hooks/useThoughts.ts` — Replaced unconditional refresh useEffect with Set<number>-tracked, event-gated version. All three triggers now check `activeEdits.size === 0` before calling `refetch()`. On the N→0 transition (last edit ended, `hadEntry` true, `Set.size` now 0): one `refetch()` + `setInterval(refetch, 30_000)` restart.
- `vigil-pwa/src/components/ThoughtRow.tsx` — Added 6 `window.dispatchEvent` calls: 1 start (handleContentClick) + 5 ends (handleSave no-change early-exit, handleSave empty-content early-exit, handleSave finally, handleKeyDown Escape, unmount useEffect cleanup). Unmount guard uses `isEditingRef` + `thoughtIdRef` + `[]` deps to fire only on real unmount.
- `vigil-pwa/src/hooks/useThoughts.test.tsx` (new) — 6 tests: 30s-pause, visibilitychange-pause, vigil:thought-created-pause, two-concurrent-edits refcount, stray-end no-op, duplicate-start idempotent
- `vigil-pwa/src/components/ThoughtRow.test.tsx` (new) — 6 tests: content-click start, Cmd+Enter save end, Escape end, blur end, unmount-while-editing end, no-dispatch-when-never-edited
- `.planning/phases/100-edit-refresh-pause/deferred-items.md` (new) — Records the pre-existing SettingsPage test failure and `tsc --noEmit` TS6305 errors as out-of-scope

## Decisions Made

- **Event bus over zustand/context**: chose window CustomEvent bus per D-01, mirroring the existing `vigil:thought-created` precedent in the same hook. Zero new dependencies; consistent with established pattern. Reusable by Phase 101's right-click context menu without any schema change (the `{id}` detail shape is generic).
- **Set<number> over counter**: per D-02, a Set makes stray `edit-ended` events (no matching start) a safe no-op via `Set.delete`'s return value. A plain counter would over-decrement and trap the gate below 0.
- **clearInterval on pause, setInterval on resume** (D-09): chosen over "always-on interval with flag check" so resumed poll cadence is a clean 30s from the resume moment instead of whatever partial fraction remained from the pre-pause interval.
- **Effect-scoped Set, not useRef** (Claude's Discretion per CONTEXT.md): `refetch` identity is stable because of its `useCallback([])`, so the effect re-runs exactly once on mount and the closure-scoped Set's lifecycle matches the effect's. A useRef would add indirection for no benefit.
- **Five edit-ended dispatch sites, not three** (D-11 extension): plan named three sites (handleSave finally, handleKeyDown Escape, onBlur via handleSave), but handleSave has two early-return branches (no-change + empty-content) that also leave edit mode. Without dispatch on those paths the refcount would leak every time a user clicked in then clicked out without changes. Fifth site is the unmount useEffect (D-12).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D-12 unmount guard: swapped `[isEditing, thought.id]` deps for ref-based []-deps pattern**
- **Found during:** Task 3 (ThoughtRow test run)
- **Issue:** The plan's suggested `useEffect(() => { return () => { if (isEditing) dispatch(end) } }, [isEditing, thought.id])` pattern caused Test 3 (Escape) to fail with "expected 1, got 2" because the cleanup runs on every dependency change, not just unmount. On Escape, `setIsEditing(false)` triggers the effect's cleanup with the PREVIOUS render's `isEditing=true`, dispatching end. Then the explicit Escape-branch `window.dispatchEvent` fires a second end. Refcount double-decrement.
- **Fix:** Kept the unmount useEffect but switched to `isEditingRef` + `thoughtIdRef` + `[]` deps. Two small sync effects (`useEffect(() => { isEditingRef.current = isEditing }, [isEditing])` etc.) keep the refs current. The `[]`-deps cleanup reads `isEditingRef.current` at unmount time — fires only when the component is actually tearing down, not on every state transition.
- **Files modified:** `vigil-pwa/src/components/ThoughtRow.tsx`
- **Verification:** All 6 ThoughtRow tests pass, including Test 3 (Escape single-end) and Test 5 (unmount-while-editing fires end exactly once)
- **Committed in:** `eca9273` (Task 3 commit)

**2. [Rule 1 - Bug] Task 1 test advancement: split 60s window into two 30s advances**
- **Found during:** Task 2 verification
- **Issue:** `await vi.advanceTimersByTimeAsync(60_000)` triggers two 30s ticks but React batches both `setFetchTick` calls into a single re-render because no microtask flush occurs between them. Result: only one fresh `getThoughts` call for two poll ticks. Test 1 assertion `toHaveBeenCalledTimes(3)` got 2.
- **Fix:** Split the 60s initial-advance into two `advanceTimersByTimeAsync(30_000)` calls with `await flushMicrotasks()` between them. Each tick now settles its own fetch before the next fires.
- **Files modified:** `vigil-pwa/src/hooks/useThoughts.test.tsx` (committed with the Task 2 implementation)
- **Verification:** All 6 useThoughts tests pass
- **Committed in:** `f1ffdd6` (Task 2 commit — test-timing adjustment alongside the feature it was testing)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs)
**Impact on plan:** Both were test-infrastructure / React-lifecycle realities not predicted by the plan. No scope creep — both fixes keep behavior identical and make the tests deterministic. The D-12 pattern change is the kind of subtlety that only surfaces with a test that actually exercises the Escape lifecycle synchronously.

## Issues Encountered

- **Pre-existing test failure in `SettingsPage.test.tsx`** (OAuth `invalid_state` assertion). Verified via `git stash` that failure exists on `main` before Phase 100 changes. Out of scope per SCOPE BOUNDARY rule — logged to `.planning/phases/100-edit-refresh-pause/deferred-items.md`.
- **Pre-existing TS6305 errors from `npx tsc --noEmit`** (stale `.d.ts` output files in src/). Unrelated to Phase 100 source; logged to deferred-items.md. `npm run build` succeeds cleanly.

## User Setup Required

None — pure in-browser UI coordination. No environment variables, no server changes, no external services.

## Next Phase Readiness

- EDIT-01 closed: inline-edit draft survives 30s+ typing sessions
- The `vigil:edit-started` / `vigil:edit-ended` + `{id: number}` contract is the reusable primitive for Phase 101 (right-click context menu pause): the menu open/close can dispatch the same events to share the pause gate, no new hooks or stores needed
- The Set-refcount + N→0-transition catch-up pattern is locked in by 12 test cases — future refactors have a contract to conform to
- No blockers, no pending integration work

## Self-Check: PASSED

**Files verified:**
- FOUND: `vigil-pwa/src/hooks/useThoughts.ts` (modified)
- FOUND: `vigil-pwa/src/components/ThoughtRow.tsx` (modified)
- FOUND: `vigil-pwa/src/hooks/useThoughts.test.tsx` (created)
- FOUND: `vigil-pwa/src/components/ThoughtRow.test.tsx` (created)
- FOUND: `.planning/phases/100-edit-refresh-pause/deferred-items.md` (created)

**Commits verified:**
- FOUND: `1638a8a` (Task 1 test — RED)
- FOUND: `f1ffdd6` (Task 2 + test-timing fix — GREEN)
- FOUND: `eca9273` (Task 3 + unmount-ref fix — GREEN)

**Vitest suite:** 34/35 passing (1 pre-existing SettingsPage failure unrelated to this phase — see Issues Encountered).

**Production build:** `npm run build` exits 0, bundle +0.7 KiB from new event-handling code.

---
*Phase: 100-edit-refresh-pause*
*Completed: 2026-04-18*
