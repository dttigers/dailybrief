---
phase: 101-context-menu
plan: 03
subsystem: ui

tags: [context-menu, thought-row, thought-list, thoughts-page, app-root, deferred-commit, toast, pointer-events, interlock, wave-2, tdd]

# Dependency graph
requires:
  - phase: 101-context-menu
    provides: Wave 0 ThoughtRow RED scaffold (17 Phase 101 cases pinning triggers + D-19 interlock + iOS pitfalls), Plan 01 useToast + ToastHost, Plan 02 ContextMenu portal
  - phase: 100-edit-refresh-pause
    provides: handleContentClick / vigil:edit-started dispatch path (D-19 interlock anchor)
provides:
  - ThoughtRow right-click + long-press triggers wired to Plan 02's ContextMenu (D-01..D-06)
  - iOS Safari callout suppression ([-webkit-touch-callout:none] + touch-manipulation)
  - Single-open invariant lifted into ThoughtList (Pitfall 8)
  - Deferred-commit delete flow via filter-on-render + 5s undo toast (Pattern 5, D-15/D-16)
  - Optimistic category/project moves with revert-on-error + error toast
  - ToastHost mounted once at authenticated App root, outside <Routes> (Pitfall 7)
  - PointerEvent polyfill in test setup so long-press tests exercise the production hook path
affects: [101-04-a11y-polish, phase-102-multi-user (no coupling)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-mode open-state: ThoughtRow defers to parent's isMenuOpen / onOpenMenu / onCloseMenu when supplied; falls back to local anchor-only state for standalone unit tests. Lets the production single-open invariant live in ThoughtList without breaking the 17 Wave 0 tests that render ThoughtRow bare."
    - "Filter-on-render deferred commit: hiddenPendingDelete: Set<number> in ThoughtsPage + visibleThoughts = thoughts.filter(!hiddenPendingDelete.has). Undo becomes Set.delete — no optimistic remove + restore round-trip."
    - "Phase 101 Pitfall 7 mount pattern: ToastHost is a sibling to <Layout> (not a route child), inside ToastProvider — deferred timers survive navigation between /thoughts and /work-orders so onExpire commits always fire."
    - "PointerEvent polyfill in test/setup.ts — jsdom 25 ships generic Event for fireEvent.pointerDown so pointerType/clientX/clientY silently drop. Polyfill extends MouseEvent with PointerEventInit fields. Production code unchanged."
    - "Long-press cleanup on unmount via useEffect(() => () => cancelLongPress(), []) — mirrors Phase 100's []-deps unmount pattern. Prevents torn-down component state updates on a pending 500ms timer (T-101-03-07)."

key-files:
  created: []
  modified:
    - vigil-pwa/src/components/ThoughtRow.tsx (+155 / -3)
    - vigil-pwa/src/components/ThoughtList.tsx (+26 / -2)
    - vigil-pwa/src/pages/ThoughtsPage.tsx (+93 / -2)
    - vigil-pwa/src/App.tsx (+10 / -9)
    - vigil-pwa/src/test/setup.ts (+33 / -0)  # PointerEvent polyfill for jsdom

key-decisions:
  - "PointerEvent polyfill in src/test/setup.ts (Rule 3 blocking issue) — jsdom does not implement PointerEvent, so fireEvent.pointerDown creates a generic Event with pointerType/clientX/clientY dropped. The Wave 0 Plan 00 pointerType:'touch' contract was untestable without the polyfill. Added a class PointerEventPolyfill extends MouseEvent that honors PointerEventInit fields. Installed on window + globalThis guarded by typeof check. Production code is completely unchanged."
  - "Dual-mode open-state in ThoughtRow (parent-managed vs. local-fallback) — the 17 Wave 0 ThoughtRow tests render ThoughtRow standalone without isMenuOpen / onOpenMenu, but production flows through ThoughtList which manages single-open via openMenuForId. Rather than require the parent to always be present (breaking the standalone tests), ThoughtRow checks parentManagesOpenState = onOpenMenu !== undefined; if false, the local anchor's presence drives isActuallyOpen. Lets both the parent-managed single-open invariant and the bare-component test render coexist."
  - "Filter-on-render (visibleThoughts) over optimistic removeMany — Pattern 5 from 101-RESEARCH. Undo becomes a trivial setHiddenPendingDelete Set.delete instead of re-inserting the row in the right sort position. Also keeps the API call deferred to toast onExpire so Undo is purely client-side (no restore roundtrip)."
  - "hiddenPendingDelete cleanup in the success path of onExpire (not just error) — even after a successful bulkDeleteThoughts + removeMany, the hide-set entry needs to be cleared so a never-garbage-collected Set doesn't grow forever during a long session. Equality-guard (if (!s.has(id)) return s) avoids a needless re-render when Undo already cleared the entry."
  - "ToastProvider wraps Layout but ToastHost renders OUTSIDE Layout (as a sibling) — Pitfall 7. If ToastHost were inside Layout, route transitions would still be fine because Layout itself doesn't unmount on route change. But putting ToastHost as a sibling makes the survives-route-change guarantee structurally obvious (the file reads top-to-bottom: provider → layout/routes → toast-host) without relying on readers knowing Layout's stability."

patterns-established:
  - "Pattern 1: Dual-mode controlled/uncontrolled component state. When a prop-drilled parent callback is supplied, use the parent's state; otherwise fall back to local. Lets components remain test-friendly in isolation without forcing test scaffolding."
  - "Pattern 2: jsdom polyfills live in test/setup.ts beside existing localStorage shim. Future additions (ResizeObserver, IntersectionObserver, etc.) follow the same guard-and-install shape."
  - "Pattern 3: Deferred-commit undo-toast primitive reused elsewhere — handleDelete is the canonical template for any future destructive action that wants the Gmail-undo feel (e.g. unassign project, delete work order). Copy the handler shape: setHiddenPendingX → showToast({ action, onAction: un-hide, onExpire: commit+revert-on-error })."

requirements-completed: [CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, CTX-06, CTX-07]

# Metrics
duration: 9min
completed: 2026-04-18
---

# Phase 101 Plan 03: ThoughtRow + ThoughtsPage + App Wiring Summary

**Right-click + long-press triggers wired to ContextMenu, single-open state lifted into ThoughtList, deferred-commit delete + optimistic category/project moves in ThoughtsPage, and ToastHost mounted once at the authenticated App root. Closes all seven CTX-XX requirements. 24/24 ThoughtRow tests GREEN, full suite 95/99 with only the pre-existing SettingsPage flake remaining (Phase 100 deferred-items.md).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-04-18T17:31:36Z
- **Completed:** 2026-04-18T17:40:10Z
- **Tasks:** 3/3 completed
- **Files modified:** 5 (0 created, 5 modified — includes PointerEvent polyfill in test/setup.ts)

## Accomplishments

- **Task 1 (ThoughtRow wiring):** right-click handler with `e.preventDefault()`, long-press timer at `LONG_PRESS_MS=500` with `MOVE_TOLERANCE_PX=10`, `pointerType !== 'touch'` D-04 gate, `isEditing` D-03 guard on BOTH paths, `[-webkit-touch-callout:none]` + `touch-manipulation` on outer row div, ContextMenu mounted via JSX with `onStartEdit={handleContentClick}` closing the D-19 INTERLOCK. Turned all 17 Phase 101 ThoughtRow cases GREEN on first run after the polyfill was in place.
- **Task 2 (ThoughtList single-open lift):** `openMenuForId: number | null` lifted, `useEffect` auto-close when row drops out of filtered result set, prop-drills `onDelete/onMoveToCategory/onAssignProject/projects/isMenuOpen/onOpenMenu/onCloseMenu` to every ThoughtRow. No rendering regressions across Layout / ContextMenu / useToast / ToastHost test suites.
- **Task 3 (ThoughtsPage + App root):** ToastProvider wraps Layout inside authenticated branch; `<ToastHost />` mounts exactly once as a sibling to Layout (outside `<Routes>` per Pitfall 7). ThoughtsPage gains `hiddenPendingDelete: Set<number>` + `visibleThoughts` filter-on-render, three new handlers (handleDelete / handleMoveToCategory / handleAssignProject) following Pattern 5 (RESEARCH) with optimistic UI + revert-on-error + UI-SPEC-locked toast copy (`'Thought deleted.'`, `'Undo'`, `"Couldn't delete. Try again."`, `"Couldn't move. Try again."`, `"Couldn't add to project. Try again."`).
- **Phase 100 invariants held:** `git diff --stat HEAD vigil-pwa/src/hooks/useThoughts.ts` reports ZERO changes (T-101-03-01 mitigation). All 5 `vigil:edit-ended` dispatch sites in ThoughtRow preserved intact. D-19 interlock verified end-to-end via the Wave 0 trap-test (spy on `vigil:edit-started` around menu Edit click → fires exactly once).
- **Build green:** 337.09 kB gzipped (98.45 kB gzip) — +9.64 kB vs. Plan 02 baseline (327.45 kB). Size increase tracks ThoughtRow pointer plumbing, ThoughtsPage handlers, ToastHost mount path, and useProjects import chain. Well below the ~15 kB mental ceiling for the feature.

## Task Commits

Each task committed atomically:

1. **Task 1: Wire ThoughtRow — right-click, long-press, context menu mount** — `297f571` (feat)
2. **Task 2: Lift single-open menu state into ThoughtList** — `f5d5b53` (feat)
3. **Task 3: Deferred-commit delete + category/project moves in ThoughtsPage** — `97addec` (feat)

## Files Created/Modified

- `vigil-pwa/src/components/ThoughtRow.tsx` (modified, +155/-3) — Added `ContextMenu` import, `ProjectApiResponse` type import, 7 new optional props, `menuAnchor`/`openedVia` local state, dual-mode `isActuallyOpen` signal, `handleContextMenu` / `handlePointerDown` / `handlePointerMove` / `handlePointerUp` / `handlePointerCancel` handlers, long-press ref cleanup `useEffect(() => () => cancelLongPress(), [])`, parent-close sync useEffect, `[-webkit-touch-callout:none] touch-manipulation select-none` classes on outer div with 5 new event listeners, ContextMenu JSX mount with `onStartEdit={handleContentClick}` (D-19).
- `vigil-pwa/src/components/ThoughtList.tsx` (modified, +26/-2) — Added `useEffect`/`useState` imports, `ProjectApiResponse` type import, 4 new optional props in `ThoughtListProps`, `openMenuForId` state + auto-close `useEffect` on `thoughts` change, 7 new prop pass-throughs on each ThoughtRow render.
- `vigil-pwa/src/pages/ThoughtsPage.tsx` (modified, +93/-2) — Added `useToast`/`useProjects` imports, `showToast`/`projects`/`hiddenPendingDelete` hook state, 3 new handlers (handleDelete / handleMoveToCategory / handleAssignProject), `visibleThoughts` filter-on-render, 4 new props on `<ThoughtList>` (onDelete, onMoveToCategory, onAssignProject, projects), adjusted `total={total - hiddenPendingDelete.size}` so the "Showing N of M" line reads correctly during a pending delete.
- `vigil-pwa/src/App.tsx` (modified, +10/-9) — Added `ToastProvider` + `ToastHost` imports. Inserted `<ToastProvider>` wrapping `<Layout>` inside authenticated branch; `<ToastHost />` as sibling to Layout (outside `<Routes>`). Unauthenticated `<AuthPage>` branch untouched.
- `vigil-pwa/src/test/setup.ts` (modified, +33/-0) — Added PointerEvent polyfill extending MouseEvent for jsdom 25 compatibility. Installed on `window` and `globalThis` guarded by `typeof window.PointerEvent === 'undefined'`. Allows `fireEvent.pointerDown(el, { pointerType: 'touch', clientX, clientY })` to carry init fields through to the handler, which is the Wave 0 Plan 00 contract (Pitfall 4 mitigation).

## Decisions Made

See `key-decisions` in frontmatter. Summary:
- **PointerEvent polyfill in test setup** was the cleanest fix (Rule 3 auto-fix). Production code stays portable. Future long-press / gesture tests reuse it automatically.
- **Dual-mode open-state in ThoughtRow** (parent-managed vs. local-fallback) preserves both the single-open invariant in production AND the standalone Wave 0 test contract without duplicating logic.
- **Filter-on-render** (Pattern 5) over optimistic removal keeps Undo trivial and makes the "5s pending" state auditable in the React tree (hiddenPendingDelete.size > 0 → a commit is in flight).
- **ToastHost outside `<Routes>`** makes Pitfall 7 structurally obvious without relying on Layout's route-stability.
- **Success-path hide-set cleanup** prevents long-session Set growth; the equality guard `if (!s.has(id)) return s` avoids a needless re-render when Undo already cleared the entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom PointerEvent polyfill required for long-press tests**
- **Found during:** Task 1 initial vitest run (2/24 tests failing: "long-press ≥500ms on touch opens menu" and "long-press tolerates ≤10px movement")
- **Issue:** jsdom 25 does not ship `PointerEvent`. `fireEvent.pointerDown(el, { pointerType: 'touch', clientX: 100, clientY: 100 })` creates a generic `Event` (verified via `captured.constructor.name` → `"Event"`, `captured.pointerType` → `undefined`). My production code's `if (e.pointerType !== 'touch') return` gate (D-04 correctness requirement) returns early for all test events → the 500ms timer is never scheduled → menu never opens.
- **Options considered:**
  1. Hack production: accept `undefined` pointerType → loses D-04 touch-only correctness
  2. Hack tests: call handler directly, bypassing fireEvent → loses Wave 0 Plan 00 decision about using production pointer path 1:1
  3. Polyfill jsdom → clean, matches existing localStorage shim pattern in same file, scoped to test env
- **Fix:** Added `class PointerEventPolyfill extends MouseEvent` honoring `PointerEventInit` fields (pointerId, pointerType, width, height, pressure, tangentialPressure, tiltX, tiltY, twist, isPrimary), installed on `window` + `globalThis` guarded by `typeof window.PointerEvent === 'undefined'`. Production code is completely unchanged.
- **Files modified:** `vigil-pwa/src/test/setup.ts`
- **Commit:** `297f571` (folded into Task 1 commit since the polyfill was prerequisite to turning Task 1's tests GREEN)
- **Verification:** `npm run test -- --run src/components/ThoughtRow.test.tsx` → 24/24 passed. Other tests using pointer events (ContextMenu pointerdown outside-close) still work because the polyfill extends MouseEvent (backward compatible).

**2. [Rule 2 - Critical functionality] Dual-mode open-state in ThoughtRow to preserve Wave 0 test contract**
- **Found during:** Task 1 design (pre-implementation read of ThoughtRow.test.tsx)
- **Issue:** The plan's `isActuallyOpen = isMenuOpen === true && menuAnchor !== null` check requires the parent to supply `isMenuOpen={true}`. But the 17 Wave 0 ThoughtRow tests render `<ThoughtRow thought={...} onUpdate={...} onDelete={...} .../>` bare — no `isMenuOpen`, no `onOpenMenu`. Under the plan's logic, right-click would set `menuAnchor` but `isMenuOpen` stays `undefined` → `isActuallyOpen === false` → menu never mounts → all positive-assertion tests fail.
- **Fix:** `parentManagesOpenState = onOpenMenu !== undefined`. If true → use parent's `isMenuOpen`. If false (standalone tests) → `isActuallyOpen = menuAnchor !== null` (local-only). Preserves the single-open invariant in production (ThoughtList always supplies onOpenMenu) while letting standalone tests pass without fabricating parent state.
- **Files modified:** `vigil-pwa/src/components/ThoughtRow.tsx`
- **Commit:** `297f571` (Task 1)
- **Threat-surface impact:** no new surface. Rule 2 rather than Rule 4 because this is a test-ergonomic fallback, not architectural — the production contract (single-open via ThoughtList) is unchanged.

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 2 critical-functionality shim). Both were surfaced by reading the Wave 0 contract closely before implementing — neither was a production behavior change.

## Issues Encountered

- **Pre-existing `SettingsPage.test.tsx` failure** (OAuth `invalid_state` assertion) — documented in Phase 100 `deferred-items.md` and Plan 02 summary. Verified still the ONLY failing test both before and after this plan. Out of scope per SCOPE BOUNDARY rule.
- **3 skipped ContextMenu tests** — Plan 04 keyboard a11y polish placeholders (ArrowDown focus nav, Enter activates focused item, Escape returns focus to trigger). Intentionally deferred per D-21.

## Verification Run

```
$ cd vigil-pwa && npm run test -- --run src/components/ThoughtRow.test.tsx
 ✓ src/components/ThoughtRow.test.tsx (24 tests) 278ms

$ cd vigil-pwa && npm run test -- --run
 Test Files  1 failed | 8 passed (9)
      Tests  1 failed | 95 passed | 3 skipped (99)

$ cd vigil-pwa && npm run build
dist/assets/index-DtaQGOzY.js   337.09 kB │ gzip: 98.45 kB
✓ built in 241ms

$ git diff --stat HEAD~3 vigil-pwa/src/hooks/useThoughts.ts
(empty — useThoughts.ts is byte-identical to Phase 100 final state)

$ grep -c "vigil:edit-ended" vigil-pwa/src/components/ThoughtRow.tsx
5

$ grep -c "setIsEditing\|vigil:edit-started" vigil-pwa/src/components/ContextMenu.tsx
0

$ grep -c "<ToastHost" vigil-pwa/src/App.tsx
1
```

Delta from Plan 02 baseline: +12 tests turned green (Phase 101 ThoughtRow 5→17 → now 17/17). Pre-existing failure count: 13 → 1 (the 12 RED ThoughtRow tests that gated Plan 03 are now all green; only the unrelated SettingsPage flake remains).

## Threat Mitigations Confirmed

- **T-101-03-01** (Tampering with Phase 100 invariant): `git diff --stat HEAD vigil-pwa/src/hooks/useThoughts.ts` reports no changes. 5 `vigil:edit-ended` sites in ThoughtRow confirmed intact.
- **T-101-03-02** (EoP bypassing edit-started dispatch): D-19 interlock test (ThoughtRow.test.tsx:391) passes — menu Edit click fires `vigil:edit-started` exactly once. `onStartEdit={handleContentClick}` wired in ThoughtRow:402.
- **T-101-03-03** (DoS via orphaned toast timer): ToastHost mounts at App root sibling to Layout (outside Routes). Deferred-commit timer survives navigation.
- **T-101-03-04** (Double-delete race): handleDelete's onExpire is idempotent against same id (bulkDeleteThoughts + setHiddenPendingDelete.delete with equality guard).
- **T-101-03-05** (Stale thought.id): handleDelete captures `id` via function-param closure at invocation time. setHiddenPendingDelete mutates Set immutably.
- **T-101-03-06** (XSS via category/project labels): grep `dangerouslySetInnerHTML` exits 1 across ThoughtRow, ThoughtList, ThoughtsPage (0 matches). React interpolation throughout.
- **T-101-03-07** (Long-press timer leak on unmount): `useEffect(() => () => cancelLongPress(), [])` in ThoughtRow:272 clears pending setTimeout before unmount.

## Next Phase Readiness

Wave 3 can proceed:

- **Plan 04 (keyboard a11y polish)** — 3 `it.skip` placeholders in ContextMenu.test.tsx flag the Wave 3 focus/keyboard work (ArrowDown focus nav, Enter activates focused item, Escape returns focus to trigger). Plan 04 will implement, un-skip, and turn green. No blockers from this plan.

**Phase 101 end-to-end verifiable after Plan 03:** `npm run dev`, right-click a thought row, pick an action. All 7 CTX requirements (CTX-01 desktop right-click, CTX-02 mobile long-press, CTX-03 delete+undo, CTX-04 move-to-category, CTX-05 edit interlock, CTX-06 re-triage, CTX-07 add-to-project) demo end-to-end without Plan 04 present.

No blockers. No new dependencies introduced. No secrets handled.

## Self-Check: PASSED

- FOUND: `vigil-pwa/src/components/ThoughtRow.tsx` (modified)
- FOUND: `vigil-pwa/src/components/ThoughtList.tsx` (modified)
- FOUND: `vigil-pwa/src/pages/ThoughtsPage.tsx` (modified)
- FOUND: `vigil-pwa/src/App.tsx` (modified)
- FOUND: `vigil-pwa/src/test/setup.ts` (modified — PointerEvent polyfill)
- FOUND commit: `297f571` (Task 1 — ThoughtRow wiring + PointerEvent polyfill)
- FOUND commit: `f5d5b53` (Task 2 — ThoughtList single-open lift)
- FOUND commit: `97addec` (Task 3 — ThoughtsPage deferred-commit + App root ToastHost)
- VERIFIED: 24/24 ThoughtRow.test.tsx GREEN (7 Phase 100 + 17 Phase 101)
- VERIFIED: full suite 95/99 green (1 pre-existing SettingsPage failure, 3 skipped for Plan 04)
- VERIFIED: `useThoughts.ts` byte-identical to Phase 100 final state (zero diff)
- VERIFIED: Phase 100's 5 `vigil:edit-ended` dispatch sites still present
- VERIFIED: ContextMenu.tsx has zero `setIsEditing` or `vigil:edit-started` references (D-19 interlock preserved)
- VERIFIED: ToastHost mounted exactly once at App root (inside authenticated branch, outside Routes)

---
*Phase: 101-context-menu*
*Plan: 03*
*Completed: 2026-04-18*
