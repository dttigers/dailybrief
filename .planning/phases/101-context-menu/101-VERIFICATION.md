---
phase: 101-context-menu
verified: 2026-04-18T20:30:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 101: Context Menu Verification Report

**Phase Goal:** Users can act on any thought row via right-click (desktop) or long-press (mobile) without navigating away.
**Verified:** 2026-04-18T20:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Right-clicking a thought row on desktop opens a context menu; long-pressing on iOS opens the same menu (SC #1 / CTX-01, CTX-02) | VERIFIED | ThoughtRow.tsx:236-242 `handleContextMenu` (mouse path, `e.preventDefault()` + `setMenuAnchor` + `setOpenedVia('mouse')`); ThoughtRow.tsx:245-263 `handlePointerDown` (touch path, `LONG_PRESS_MS=500` + `MOVE_TOLERANCE_PX=10`, pointerType!=='touch' early return per D-04). Row div wires both via `onContextMenu` + `onPointerDown` (ThoughtRow.tsx:315-316). Same `<ContextMenu>` component mounted (ThoughtRow.tsx:404-444). iOS UAT Tests A/B/C confirmed on physical iPhone post-fix. |
| 2 | User can delete a thought from the context menu and it disappears from the list immediately (SC #2 / CTX-03) | VERIFIED | ContextMenu.tsx:275-278 `handleDelete` → props.onDelete(thought.id). ThoughtsPage.tsx:138-181 `handleDelete` implements D-15/D-16 deferred commit: `setHiddenPendingDelete.add(id)` (immediate hide via `visibleThoughts` filter-on-render, ThoughtsPage.tsx:264), `showToast({body: 'Thought deleted.', action: 'Undo', onAction, onExpire})`. Undo path (onAction) un-hides without API call; 5s expiry (onExpire) commits via `bulkDeleteThoughts([id])` + `removeMany`. Integration test `ThoughtsPage.test.tsx:5 cases` all green. iOS UAT Tests D/E confirmed. |
| 3 | User can move a thought to a different category from the context menu and it reflects the new category without a full reload (SC #3 / CTX-04) | VERIFIED | ContextMenu.tsx:337-359 renders 5 alphabetical categories with `data-current` marker on active one. `handleMoveCategory` (ContextMenu.tsx:259-265) routes through props.onMoveToCategory. ThoughtsPage.tsx:183-194 `handleMoveToCategory`: `updateLocal(id, {category})` optimistic pill-flip immediately, then `await updateThought(id, {category})`; revert + error-toast on failure. Shared CATEGORIES source via constants/categories.ts consumed by both ContextMenu and BulkActionBar. iOS UAT Test G confirmed. |
| 4 | User can enter inline edit mode, trigger re-triage, or add the thought to a project — all from the context menu (SC #4 / CTX-05, CTX-06, CTX-07) | VERIFIED | **Edit (D-19 INTERLOCK):** ContextMenu.tsx `handleEdit` → `props.onStartEdit()`; ThoughtRow.tsx:438 wires `onStartEdit={handleContentClick}` (the authoritative Phase 100 edit-entry that dispatches `vigil:edit-started`). Trap-test ThoughtRow.test.tsx case #10 passes (spy fires exactly once). **Re-triage:** ContextMenu `handleRetriage` → `onRetriage(thought.id)` → ThoughtsPage.handleRetriage (triageThought + updateThought). **Add to project:** ContextMenu renders alphabetical project list with empty-state "No projects yet. Create one on the Projects tab." when `projects.length===0`; `handleAssignProject` → ThoughtsPage.handleAssignProject (optimistic updateLocal + updateThought + revert-on-error). iOS UAT Test F (edit interlock) initially FAILED, root-caused to D-21 focus-race, fixed in commit `e7fb7d5`, regression test added at ThoughtRow.test.tsx:421. Post-fix UAT: PASS. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Data Flows | Status | Details |
|----------|----------|--------|-------------|-------|------------|--------|---------|
| `vigil-pwa/src/components/ContextMenu.tsx` | Portaled popover with view state machine, 5 root items, submenus, keyboard nav, close semantics | Yes (529 LOC) | Yes (createPortal, role=menu, role=menuitem×5, onKey Escape/Arrow/Enter, onScroll capture, onResize, onDown, useLayoutEffect positioning, focusedIndex nav, CATEGORIES import, D-19 guards: 0 setIsEditing / 0 vigil:edit-started) | Imported by ThoughtRow.tsx:3; mounted ThoughtRow.tsx:404-444 | N/A (stateless component; data via props from ThoughtRow) | VERIFIED | 33/33 tests GREEN; D-19 grep guards pass |
| `vigil-pwa/src/hooks/useToast.tsx` | Context + hook with single-slot state, 5s auto-dismiss, replace-fires-onExpire (D-15/D-16) | Yes (95 LOC) | Yes (ToastProvider, useToast with provider-throw-guard, TOAST_DURATION_MS=5_000, expireRef/timerRef, replace-fires-previous-synchronously, manual-dismiss-does-not-fire-onExpire) | ToastProvider mounted App.tsx:42; useToast consumed by ThoughtHost.tsx:2 + ThoughtsPage.tsx:16 | Passes toast state via React context | VERIFIED | 9/9 tests GREEN |
| `vigil-pwa/src/components/ToastHost.tsx` | Portal-mounted single-slot renderer, role=status|alert, teal-400 action button, z-[60], safe-area-inset-bottom | Yes (48 LOC) | Yes (createPortal document.body, role switching on variant, aria-live polite/assertive, text-teal-400 action, onAction before dismiss ordering, env(safe-area-inset-bottom) via inline style) | Mounted App.tsx:59 exactly once; imported App.tsx:6 | Reads current toast from useToast context | VERIFIED | 8/8 tests GREEN |
| `vigil-pwa/src/constants/categories.ts` | CATEGORIES tuple + Category type, single source of truth | Yes (15 LOC) | Yes (tuple in v2.5 order: task/therapy/idea/reflection/project, `as const`, Category type alias, server-sync doc comment) | Imported by BulkActionBar.tsx + ContextMenu.tsx:4 | N/A (constant) | VERIFIED | 2 consumers, no duplication |
| `vigil-pwa/src/components/ThoughtRow.tsx` | Right-click + long-press triggers, iOS callout suppression, D-19 onStartEdit wiring, 5+ vigil:edit-ended sites preserved | Yes (447 LOC, modified from Phase 100) | Yes (handleContextMenu D-01 preventDefault, handlePointerDown/Move/Up/Cancel with 500ms/10px, `pointerType!=='touch'` D-04 gate, `isEditing return` D-03 guards, iOS `[-webkit-touch-callout:none]` + `touch-manipulation` classes, rowRef tabIndex=-1 + rAF-deferred focus restoration with "skip if focus in row" guard per D-21 fix, 6 vigil:edit-ended sites, onStartEdit={handleContentClick}) | Consumed by ThoughtList.tsx; wires ContextMenu onStartEdit/onDelete/onMoveToCategory/onAssignProject/onRetriage | Pass-through to ContextMenu props | VERIFIED | 25/25 tests GREEN including D-21 focus-race regression |
| `vigil-pwa/src/components/ThoughtList.tsx` | Lifted openMenuForId single-open state + prop-drilling | Yes (104 LOC) | Yes (useState<number\|null>, useEffect auto-close on filter change, isMenuOpen={openMenuForId===thought.id} wiring, 4 Phase 101 callback props drilled) | Consumed by ThoughtsPage.tsx:370 | Feeds real `thoughts` array from parent | VERIFIED | Pitfall 8 single-open invariant enforced |
| `vigil-pwa/src/pages/ThoughtsPage.tsx` | Deferred-commit delete, optimistic category/project, projects injection, visibleThoughts filter-on-render | Yes (402 LOC) | Yes (useToast + useProjects hooks wired, hiddenPendingDelete Set, handleDelete with toast+onAction+onExpire, handleMoveToCategory optimistic+revert, handleAssignProject optimistic+revert, visibleThoughts filter, UI-SPEC-locked copy for all 3 error toasts) | Mounted at `/` via DashboardPage → ThoughtsPage | Real data via `useThoughts` (DB-backed via vigilFetch), `useProjects` (API), `bulkDeleteThoughts` + `updateThought` + `triageThought` mutations | VERIFIED | 5/5 integration tests GREEN |
| `vigil-pwa/src/App.tsx` | ToastProvider wrapping Layout, ToastHost sibling outside Routes (Pitfall 7) | Yes (68 LOC) | Yes (ToastProvider import+mount at line 42, ToastHost import+mount exactly once at line 59 inside authenticated branch and OUTSIDE Routes) | Authenticated branch | Connects useToast context to all authenticated pages | VERIFIED | Pitfall 7 correct mount |
| `vigil-pwa/src/pages/ThoughtsPage.test.tsx` | End-to-end deferred-commit integration test (5 cases) | Yes (261 LOC) | Yes (Undo-before-5s, 5s commit, D-16 replace semantics, error-path revert, move-to-category — all using vi.useFakeTimers + flushMicrotasks pattern) | Tests real ThoughtsPage component | N/A (test) | VERIFIED | 5/5 pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| ContextMenu Edit menuitem | ThoughtRow.handleContentClick | onStartEdit prop wiring | WIRED | `onStartEdit={handleContentClick}` exact match found at ThoughtRow.tsx:438. D-19 trap-test (ThoughtRow.test.tsx #10) verifies transitively that clicking Edit dispatches `vigil:edit-started` exactly once. |
| ContextMenu Delete menuitem | ThoughtsPage.handleDelete | onDelete → ThoughtRow prop → ThoughtsPage via ThoughtList | WIRED | ContextMenu handleDelete → props.onDelete (ContextMenu.tsx:275-278) → ThoughtRow passes `(id) => onDelete?.(id)` → ThoughtList passes onDelete={onDelete} → ThoughtsPage handleDelete. Chain verified end-to-end in ThoughtsPage.test.tsx "Undo within 5s" and "commits via bulkDeleteThoughts after 5s" tests. |
| ThoughtsPage.handleDelete | bulkDeleteThoughts API | onExpire callback of toast | WIRED | ThoughtsPage.tsx:159 `await bulkDeleteThoughts([id])` inside showToast onExpire. Integration test asserts this is called exactly once with [id] after 5s advance. |
| ThoughtsPage.handleDelete | useToast showToast | direct call | WIRED | Line 144 showToast({body, action, onAction, onExpire}). Test suite exercises both onAction and onExpire paths. |
| App ToastProvider | ThoughtsPage useToast | React context | WIRED | App.tsx:42 wraps Layout which hosts ThoughtsPage; ThoughtsPage.tsx:30 consumes via useToast. Provider-guard in useToast.tsx:93 throws if used outside provider. |
| ThoughtList lifts single-open state | ThoughtRow.isMenuOpen | useState + prop drill | WIRED | ThoughtList.tsx:31 `openMenuForId` + useEffect auto-close; passes `isMenuOpen={openMenuForId === thought.id}` and onOpenMenu/onCloseMenu (lines 91-93). Pitfall 8 tests (ThoughtRow.test.tsx "only one menu") pass. |
| ThoughtRow pointer handlers | ContextMenu mount | isActuallyOpen + menuAnchor state | WIRED | handleContextMenu + handlePointerDown set menuAnchor + openedVia + call onOpenMenu. isActuallyOpen gates the JSX mount at ThoughtRow.tsx:404. |
| ContextMenu CATEGORIES import | shared constants | named import | WIRED | ContextMenu.tsx:4 `import { CATEGORIES } from '../constants/categories'`; BulkActionBar.tsx also imports (single source). Grep: both files reference `from '../constants/categories'`. |
| ContextMenu close listeners | window events | keydown / scroll-capture / resize / pointerdown | WIRED | useEffect ContextMenu.tsx:175-245 registers 4 listeners with cleanup. 5 close-on-X tests GREEN. |
| ThoughtRow rowRef focus restoration | D-21 close path | requestAnimationFrame + activeElement check | WIRED | ThoughtRow.tsx:421-432 rAF-defer + "skip if activeElement already inside row" guard. Added post-UAT to fix Test F regression (commit e7fb7d5). Regression test at ThoughtRow.test.tsx:421 passes. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| ContextMenu categories submenu | `ALPHABETICAL_CATEGORIES` | Imported from `constants/categories.ts` (constant tuple) | Yes — hardcoded but canonical, matches server VALID_CATEGORIES | FLOWING (by design — category list is a closed enum) |
| ContextMenu projects submenu | `projects` prop | Flows: ThoughtsPage useProjects() → ThoughtList prop → ThoughtRow prop → ContextMenu prop | Yes — `useProjects` hook calls getProjects API (vigilFetch) and returns live list. Empty-state copy renders when `projects.length === 0`. | FLOWING |
| ThoughtRow displayed thought | `thought` prop | ThoughtsPage `useThoughts` → `visibleThoughts` filter → ThoughtList thoughts prop → ThoughtRow | Yes — useThoughts hook fetches via vigilFetch to `/v1/thoughts` (confirmed via useThoughts.ts read; Phase 100 code, unchanged) | FLOWING |
| ToastHost body | `current.body` | useToast context state | Yes — set via showToast calls from ThoughtsPage handlers with real event-driven strings ("Thought deleted.", error copies) | FLOWING |
| ThoughtsPage visibleThoughts | `hiddenPendingDelete` Set | Mutated by handleDelete (add id), onAction (delete id), onExpire (delete id after commit) | Yes — filter removes id from rendered rows immediately; Undo/expire mutations all trigger re-render | FLOWING |
| ContextMenu focusedIndex | `useState(0)` | Updated by Arrow key handlers + onFocus + ref callback; consumed by tabIndex roving + FOCUS_RING className | Yes — keyboard navigation produces visible focus ring and correct activeElement | FLOWING |
| ThoughtsPage category pill (optimistic) | `thought.category` in `thoughts` | updateLocal mutation in handleMoveToCategory before API call; revert on error | Yes — optimistic path exercised in integration test and by real calls through ThoughtList | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes (Phase 100 + 101) | `cd vigil-pwa && npm run test -- --run` | 108 passed / 1 failed (pre-existing SettingsPage OAuth flake — Phase 100 deferred-items) | PASS |
| ThoughtsPage deferred-commit integration tests pass | `cd vigil-pwa && npm run test -- --run src/pages/ThoughtsPage.test.tsx` | 5 passed (all: Undo-before-5s, 5s commit, D-16 replace, error-path, move-to-category) | PASS |
| TypeScript build green | `cd vigil-pwa && npm run build` | `✓ built in 245ms` — dist/assets/index-CQ7unLjy.js 338.79 kB gzip 99.00 kB | PASS |
| D-19 guard: setIsEditing absent from ContextMenu | `grep -c "setIsEditing" vigil-pwa/src/components/ContextMenu.tsx` | 0 | PASS |
| D-19 guard: vigil:edit-started absent from ContextMenu | `grep -c "vigil:edit-started" vigil-pwa/src/components/ContextMenu.tsx` | 0 | PASS |
| Phase 100 invariant: ≥5 vigil:edit-ended sites in ThoughtRow | `grep -c "vigil:edit-ended" vigil-pwa/src/components/ThoughtRow.tsx` | 6 (5 required + 1 new for empty-content early path) | PASS |
| Phase 100 read-only invariant: useThoughts.ts last-touched in Phase 100 | `git log -1 --format='%s' vigil-pwa/src/hooks/useThoughts.ts` | "feat(100-01): edit-aware pause gate in useThoughts auto-refresh" (byte-identical since Phase 100) | PASS |
| ToastHost mounted exactly once | `grep -c "<ToastHost" vigil-pwa/src/App.tsx` | 1 | PASS |
| iOS callout suppression present | `grep -c 'webkit-touch-callout' vigil-pwa/src/components/ThoughtRow.tsx` | 1 | PASS |
| No UI library drift | `grep -cE "@radix-ui|@headlessui|@floating-ui|react-hot-toast|sonner|react-toastify" vigil-pwa/package.json` | 0 (none found) | PASS |
| All 14 referenced commits exist | `git log -1` on 4036c72, 57b4a42, c013e6d, 66235da, 11191e7, 949e2d7, b6f981d, 297f571, f5d5b53, 97addec, 713072c, aff3b2c, 347e23b, e7fb7d5 | All 14 commits resolve with expected subject lines | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CTX-01 | 101-00, 101-02, 101-03, 101-04 | User can right-click a thought row to open a context menu (desktop) | SATISFIED | ThoughtRow.handleContextMenu (D-01 preventDefault + open); ContextMenu renders role=menu; 5/5 right-click tests in ThoughtRow.test.tsx green; iOS UAT Test A pass. REQUIREMENTS.md:20 marked `[x]`. |
| CTX-02 | 101-00, 101-02, 101-03, 101-04 | User can long-press a thought row to open a context menu (iOS/mobile) | SATISFIED | ThoughtRow.handlePointerDown (LONG_PRESS_MS=500, MOVE_TOLERANCE_PX=10, touch-only D-04); cancel-on-move/short-press tests green; iOS UAT Test A PASS on physical iPhone. REQUIREMENTS.md:21 marked `[x]`. |
| CTX-03 | 101-00, 101-01, 101-02, 101-03, 101-04 | User can delete a thought from the context menu | SATISFIED | ContextMenu Delete menuitem → ThoughtsPage.handleDelete → deferred-commit via toast. Integration test 5/5 green; iOS UAT Tests D/E pass. REQUIREMENTS.md:22 marked `[x]`. |
| CTX-04 | 101-00, 101-02, 101-03, 101-04 | User can move a thought to a different category | SATISFIED | ContextMenu categories submenu (5 alphabetical) → ThoughtsPage.handleMoveToCategory (optimistic updateLocal + updateThought + revert-on-error); integration test "move to category" green; iOS UAT Test G pass. REQUIREMENTS.md:23 marked `[x]`. |
| CTX-05 | 101-00, 101-02, 101-03 | User can enter edit mode from the context menu | SATISFIED | ContextMenu Edit menuitem → onStartEdit (wired to ThoughtRow.handleContentClick per D-19) → dispatches vigil:edit-started → Phase 100 pause-gate honors edit. Trap-test ThoughtRow.test.tsx #10 + D-21 focus-race regression test green; iOS UAT Test F PASS after fix. REQUIREMENTS.md:24 marked `[x]`. |
| CTX-06 | 101-00, 101-02, 101-03 | User can re-triage a thought from the context menu | SATISFIED | ContextMenu Re-triage menuitem → onRetriage(thought.id) → ThoughtsPage.handleRetriage (triageThought + updateThought); test ThoughtRow.test.tsx "Re-triage menuitem calls the onRetriage prop" green. REQUIREMENTS.md:25 marked `[x]`. NOTE: Code review WR-04 flagged missing try/catch — advisory, not blocking goal achievement. |
| CTX-07 | 101-00, 101-02, 101-03 | User can add a thought to a project from the context menu | SATISFIED | ContextMenu projects submenu (alphabetical, empty-state copy) → onAssignProject → ThoughtsPage.handleAssignProject (optimistic updateLocal + updateThought + revert). Tests ContextMenu.test.tsx "Add to project selection calls onAssignProject" and "Add to project empty state" green. REQUIREMENTS.md:26 marked `[x]`. |

No orphaned requirements. All 7 CTX-XX requirements are claimed by at least one plan, all mapped to implementation, and all marked `[x]` in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| vigil-pwa/src/pages/ThoughtsPage.tsx | 183-194 | Revert-on-error skipped when `prev === undefined` in handleMoveToCategory (code review WR-03) | Warning | Edge case only triggered by race during filter switch; error toast still fires so user knows. Not a goal-blocking gap. |
| vigil-pwa/src/pages/ThoughtsPage.tsx | 105-126 | handleRetriage lacks try/catch wrapper (code review WR-04, pre-existing Phase 100 path) | Warning | Rejection may surface as unhandledrejection; no toast on failure. Pre-existing bug — phase adds a second trigger surface (menu) but the defect predates Phase 101. Advisory. |
| vigil-pwa/src/components/ContextMenu.tsx | 175-245 | keydown listener effect deps include `focusedIndex` → rebinds on every arrow keystroke (WR-01) | Warning | Performance micro-cost; correctness unaffected. Could be optimized via refs. Advisory. |
| vigil-pwa/src/components/ThoughtRow.tsx | 286 | useEffect cleanup captures `cancelLongPress` by closure not ref (WR-02) | Warning | Works today (only touches refs); fragile if cancelLongPress grows reactive deps. Preventative only. |

**Zero critical/blocker anti-patterns.** All 4 warnings are advisory per 101-REVIEW.md (`findings: critical=0, warning=4, info=10`). None prevent goal achievement; all are logged for follow-up. No TODO/FIXME/placeholder comments, no `return null` stubs, no hardcoded empty props at call sites, no console.log-only implementations, no disconnected data sources.

### Human Verification Required

None. The phase explicitly included a human-verification checkpoint (Plan 04 Task 3 iOS UAT), which was executed on 2026-04-18 on a physical iPhone against LAN dev (`http://192.168.1.212:5173`). All 8 tests recorded PASS (Test F required root-cause fix for D-21 focus-race before passing — fix commit `e7fb7d5`, regression test added at `ThoughtRow.test.tsx:421`). Per SUMMARY Plan 04, UAT is approved and the checkpoint is resolved.

No additional human testing required because:
- All visual/UX behaviors from the 8-test iOS UAT are PASS.
- External service integration (vigilFetch to api.vigilhub.io) is exercised indirectly via the Phase 100 invariants (useThoughts unchanged) and integration tests mock the API layer.
- Real-time behavior (5s deferred commit, 500ms long-press) is deterministically tested with fake timers.
- Error messaging clarity is contractually pinned by UI-SPEC copy assertions in tests.

### Gaps Summary

No gaps. All 4 phase success criteria achieved:
1. Right-click and long-press both open the context menu on their respective platforms.
2. Delete hides the row immediately and shows an Undo toast with 5s commit window.
3. Move to category flips the pill instantly via optimistic UI with revert-on-error.
4. Edit (via Phase 100 interlock), Re-triage, and Add-to-project all work from the menu.

Full test suite 108/109 passing (1 failure = pre-existing SettingsPage OAuth flake tracked in Phase 100 deferred-items — explicitly out of scope). Build green. D-19 interlock preserved (grep guards: 0 matches). Phase 100 invariants held (useThoughts.ts byte-identical, 6 vigil:edit-ended dispatch sites in ThoughtRow, 2 vigil:edit-started). ToastHost mounted exactly once at App root outside Routes (Pitfall 7 correct). Zero new dependencies. iOS UAT approved with documented root-cause-and-fix loop for the one initial failure.

The D-21 focus-race UAT regression (Test F initially failed, then fixed in `e7fb7d5` with an automated regression test at `ThoughtRow.test.tsx:421` titled "Edit menuitem keeps edit mode — focus-return must not blur the textarea (D-21 focus race)") is precisely the kind of high-value feedback the human-verification checkpoint was designed to surface — it demonstrates the gate working as intended rather than a process gap.

Code review findings (4 warnings, 10 info) are advisory and do not block goal achievement. They are candidates for a follow-up polish phase but should not gate closure.

---

_Verified: 2026-04-18T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
