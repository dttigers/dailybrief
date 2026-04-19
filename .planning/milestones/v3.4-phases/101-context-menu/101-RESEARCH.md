# Phase 101: Context Menu - Research

**Researched:** 2026-04-17
**Domain:** React 19 PWA UI — floating popover (portal), long-press gesture, toast infra
**Confidence:** HIGH

## Summary

Phase 101 adds a per-thought-row context menu with five actions (Edit, Re-triage, Move to category, Add to project, Delete) and a new ToastHost for an optimistic-delete-with-undo flow. The research confirms **everything is hand-rolled on React 19 + Tailwind v4** — no UI library, no popover library, no toast library, no portal helper. `vigil-pwa/package.json` lists only `react`, `react-dom`, `react-router` as runtime deps; no Radix, Headless UI, Floating UI, shadcn, or even a popover primitive exists. The UI-SPEC locked this as a "Registry Safety: none" phase, and the existing code (`BulkActionBar.tsx`, `Layout.tsx`) proves the house style is manual Tailwind + lightweight React.

The load-bearing findings are: (1) **The Phase 100 `vigil:edit-started` contract is live and covered by 12 tests** — the Edit menu item must call `handleContentClick` via an exported reference or new `startEdit(id)` prop, NOT flip `setIsEditing(true)` directly, or it will break the pause gate. (2) **There is no server-side restore endpoint** — `POST /v1/thoughts/bulk/delete` soft-deletes by flipping `syncStatus='pendingDeletion'`, and `PUT /thoughts/:id` explicitly excludes pending-deletion rows (`thoughts.ts:359`). The clean undo path is **deferred-commit** (hide the row client-side, keep the ID in toast state, only call `bulkDeleteThoughts` when the 5s timer actually expires). (3) **Long-press on iOS has three distinct gotchas** — native `contextmenu` fires on long-press in some browsers but NOT iOS Safari; `-webkit-touch-callout: none` is required to kill the native iOS text-selection callout; Pointer Events with `touch-action: manipulation` is the cleanest cross-platform path.

**Primary recommendation:** Hand-roll a single `<ContextMenu>` component with a `view` state machine (`'root' | 'categories' | 'projects'`), use Pointer Events for long-press, render via `createPortal` to `document.body`, and implement undo as **deferred-commit client-side** (no server round-trip until the 5s window closes). Parallel two workstreams: (a) `ContextMenu` + handlers + portal positioning, (b) `ToastHost` + `useToast()` + App root mount.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Triggers (D-01..D-04):**
- D-01: Desktop opens via native `onContextMenu`; `e.preventDefault()` to suppress the browser menu.
- D-02: Mobile opens via **500ms long-press with 10px movement tolerance**; scroll cancels pending long-press.
- D-03: **Menu is suppressed while `isEditing === true`.** Right-click and long-press both do nothing on an editing row. User must exit edit mode first.
- D-04: Right-click is desktop-only; long-press is touch-only. No cross-firing.

**Menu layout & positioning (D-05..D-08):**
- D-05: Floating popover via `createPortal(…, document.body)`. One code path for both desktop and mobile.
- D-06: Desktop anchor = pointer `clientX/clientY`; mobile anchor = row bottom-left (flip above on bottom-overflow).
- D-07: Close on Escape, outside click/tap, item selection, scroll, or resize. No focus trap.
- D-08: Viewport overflow handling: shift-left on right overflow, flip-above on bottom overflow.

**Menu item order (D-09, D-10):**
- D-09: Order = Edit · Re-triage · Move to category → · Add to project → · (separator) · Delete. Delete is red text, visually separated.
- D-10: Exactly these five items. No Copy, no Share, no Favorite.

**Secondary pickers (D-11..D-14):**
- D-11: Desktop — hovering "Move to category →" / "Add to project →" opens a **right-side nested submenu**.
- D-12: Mobile — tapping opens an **in-place replace** with a `← Categories` / `← Projects` back-affordance.
- D-13: Both lists show all items, sorted alphabetically. Categories come from existing source (hardcoded per `BulkActionBar.tsx:3`), projects from `GET /v1/projects`.
- D-14: Current category/project is indicated (checkmark or dimmed "(current)") but still selectable (re-select is no-op).

**Destructive UX (D-15..D-17):**
- D-15: Delete is **immediate optimistic with 5s undo toast** — NO confirm dialog.
- D-16: Undo re-shows the row client-side AND fires a restore. If user does nothing for 5s, deletion is final. Only one toast slot — second delete silently commits the first.
- D-17: **No toast infra exists in PWA.** Phase 101 ships a minimal `ToastHost` + `useToast()`.

**Re-triage (D-18):** Silent. Reuses existing `onRetriage` wiring. No preview/confirm flow.

**Edit interlock (D-19):** Menu's Edit item MUST call `handleContentClick` (or exported equivalent) on `ThoughtRow` so BOTH `setIsEditing(true)` AND the `vigil:edit-started` window event fire. MUST NOT set `isEditing = true` directly.

**API wiring (D-20):** Delete → `bulkDeleteThoughts([id])`. Move to category → `updateThought(id, { category })`. Add to project → `updateThought(id, { projectId })`. Re-triage → existing `onRetriage`. **No new backend endpoints.**

**Accessibility (D-21):** `role="menu"`, `role="menuitem"`, ArrowUp/Down, Enter, Escape. Focus returns to row on close. Submenus open on Right, close on Left. Keyboard is polish — ship mouse/touch first.

### Claude's Discretion

- Portal target (D-05 locks `document.body`; planner picks exact mount shape).
- Component file split — one file vs. split `ContextMenu` / `Submenu` / `ToastHost`.
- CSS approach — Tailwind utilities inline (matches existing convention).
- Submenu nesting primitive — Headless UI, Radix, or hand-rolled (planner picks based on existing deps; **research confirms none are installed — hand-roll**).
- Exact timing curves / transitions.
- Test strategy — Vitest + Testing Library (matches existing `ThoughtRow.test.tsx`, `useThoughts.test.tsx`).

### Deferred Ideas (OUT OF SCOPE)

- Keyboard shortcut to open menu without mouse (e.g., `Shift+F10`). Note under D-21 polish later.
- Context menu on work orders, briefs, projects, chat sessions.
- Multi-select + bulk context menu.
- Toast history / notification center (single-slot only).
- Favorite toggle in the menu (already a row button).
- Rich re-triage preview.
- Confirm-dialog infrastructure.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-01 | Right-click opens context menu on desktop | Native `onContextMenu` + `e.preventDefault()` — see [Architecture Patterns: Desktop trigger](#pattern-1-desktop-contextmenu-handler) |
| CTX-02 | Long-press opens context menu on iOS/mobile | Pointer Events + 500ms timer + 10px tolerance + iOS callout suppression — see [Pattern 2](#pattern-2-pointer-based-long-press-with-tolerance) and [Pitfall: iOS Safari callout](#pitfall-1-ios-safari-native-long-press-callout) |
| CTX-03 | Delete from context menu | `bulkDeleteThoughts([id])` + **deferred-commit undo pattern** — server call delayed until toast expires. See [Pattern 5](#pattern-5-deferred-commit-undo-no-restore-endpoint-needed) |
| CTX-04 | Move to category from context menu | `updateThought(id, { category })` + optimistic `updateLocal` — existing wiring in `ThoughtsPage.tsx:83-86` |
| CTX-05 | Enter edit mode from context menu | **MUST route through `handleContentClick`** or new `onStartEdit(id)` prop that dispatches `vigil:edit-started`. Setting `setIsEditing(true)` directly breaks Phase 100 pause gate. See [Pattern 3](#pattern-3-edit-interlock-with-phase-100) |
| CTX-06 | Re-triage from context menu | Reuse existing `onRetriage` prop already passed to `ThoughtRow` |
| CTX-07 | Add to project from context menu | `updateThought(id, { projectId })` + `useProjects().projects` for the picker list |

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` at project root (verified via `ls`). No `.claude/skills/` or `.agents/skills/` directory. No project-wide directives to honor beyond what CONTEXT.md and UI-SPEC.md already encode.

## Standard Stack

### Core (already installed — DO NOT add dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | 19.2.5 | Component runtime + `createPortal` | [VERIFIED: `vigil-pwa/package.json`] Already present. `createPortal` is the official portal API and has been stable since React 16. |
| `react-dom` | 19.2.5 | Exports `createPortal` | [VERIFIED: `vigil-pwa/package.json`] |
| `tailwindcss` | 4.2.2 | Styling — `@theme` tokens, utility classes | [VERIFIED: `vigil-pwa/package.json`, `index.css`] All UI in the PWA is hand-rolled Tailwind v4 with `@theme` tokens. No new tokens needed per UI-SPEC. |
| `vitest` | 2.1.9 | Test runner | [VERIFIED: `vigil-pwa/package.json`] |
| `@testing-library/react` | 16.3.2 | Component tests | [VERIFIED: `vigil-pwa/package.json`] |
| `@testing-library/user-event` | 14.6.1 | Higher-fidelity input simulation (optional — `fireEvent` is the existing convention) | [VERIFIED: `vigil-pwa/package.json`] |
| `jsdom` | 25.0.1 | DOM environment for tests | [VERIFIED: `vigil-pwa/package.json`] |

### Deliberately NOT Added

| Library | Why NOT | Evidence |
|---------|---------|----------|
| `@radix-ui/react-context-menu` | UI-SPEC §Registry Safety locks "none"; `package.json` has no `@radix-ui/*`. Adding would require design-system adoption. | [VERIFIED: `vigil-pwa/package.json`] — no `@radix-ui` key under dependencies |
| `@headlessui/react` | Same rationale. Not installed. | [VERIFIED: `vigil-pwa/package.json`] |
| `@floating-ui/react` | Same. Menu positioning math is ~15 lines; not worth a dep. | [VERIFIED: `vigil-pwa/package.json`] |
| `shadcn/ui` | `vigil-pwa` has no `components.json`; shadcn not initialized. | [VERIFIED: UI-SPEC §Registry Safety line 236] |
| `react-hot-toast` / `sonner` / `react-toastify` | `ToastHost` is spec'd as a single-slot minimal primitive (D-17). A toast library is ~50KB+ for 3KB of needed behavior. | [VERIFIED: UI-SPEC line 215-216 component inventory] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled portal + math | `@floating-ui/react` | Handles edge cases (auto-flip, shift, arrow positioning) out of the box. Adds ~10KB gzipped and a new dep. **Reject** — violates UI-SPEC §Registry Safety and existing hand-roll convention. |
| Hand-rolled menu + ARIA | `@radix-ui/react-context-menu` | Full ARIA + keyboard nav for free. Adds ~25KB + new dep + new design-system adoption. **Reject** — out of scope for this phase. |
| `createPortal` direct | `react-portal` npm package | Zero value — `createPortal` ships with `react-dom`. **Reject.** |
| Timer-based long-press | `react-use-long-press` (npm) | Adds a dep for ~30 lines of code. **Reject**. |

**Installation:** None required. Phase is additive with zero new dependencies.

**Version verification:**
- `react@19.2.5` — installed. `createPortal` is stable. [VERIFIED: `package.json`]
- `vitest@2.1.9` — installed. Fake timers API (`vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync`) proven working in `useThoughts.test.tsx`. [VERIFIED: `useThoughts.test.tsx:27`]
- `@testing-library/react@16.3.2` — installed. `fireEvent.contextMenu`, `fireEvent.touchStart/touchMove/touchEnd` all available. [VERIFIED: `@testing-library/dom@10.4.1` ships these event helpers]

## Architecture Patterns

### Recommended Project Structure

```
vigil-pwa/src/
├── components/
│   ├── ContextMenu.tsx           # NEW — portal, positioning, view state (root | categories | projects)
│   ├── ContextMenu.test.tsx      # NEW — 8-12 tests covering triggers, positioning, submenus, a11y
│   ├── ToastHost.tsx             # NEW — single-slot toast portal
│   ├── ToastHost.test.tsx        # NEW — 4-6 tests covering show, auto-dismiss, replace, action-click
│   ├── ThoughtRow.tsx            # MODIFY — add onContextMenu + pointer handlers, mount ContextMenu on open
│   ├── ThoughtRow.test.tsx       # MODIFY — add tests for right-click, long-press, edit-mode suppression
│   └── ThoughtList.tsx           # MODIFY — prop-drill onDelete, onMoveToCategory, onAssignProject
├── hooks/
│   ├── useToast.ts               # NEW — module-level store OR context; exposes showToast()
│   └── useToast.test.tsx         # NEW — 3-4 tests on the store behavior
├── App.tsx                       # MODIFY — mount <ToastHost /> at root
└── pages/
    └── ThoughtsPage.tsx          # MODIFY — wire the three new callbacks to API + useToast
```

**Single-file vs split:** Recommend **one `ContextMenu.tsx` file** containing `<ContextMenu>`, `<MenuItem>`, `<Submenu>` as co-located named exports. File size will be ~200-250 lines — below any reasonable split threshold. The tight coupling between root-menu state and submenu view state (`'root' | 'categories' | 'projects'`) means splitting adds import churn for no benefit.

### Pattern 1: Desktop `onContextMenu` handler

The browser `contextmenu` event fires on right-click and (on some browsers) long-press. React surfaces it as `onContextMenu`. Call `e.preventDefault()` to suppress the native menu.

```tsx
// Source: MDN Element: contextmenu event, React 19 SyntheticEvent
// [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event]
function ThoughtRow({ thought, ... }) {
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    if (isEditing) return                       // D-03: suppress while editing
    e.preventDefault()                          // D-01: kill native menu
    setMenuAnchor({ x: e.clientX, y: e.clientY })
  }

  return (
    <div onContextMenu={handleContextMenu} ...>
      {/* row content */}
      {menuAnchor && (
        <ContextMenu
          anchor={menuAnchor}
          thought={thought}
          onClose={() => setMenuAnchor(null)}
          onStartEdit={handleContentClick}     // D-19: reuse edit-started path
          onDelete={onDelete}
          onMoveToCategory={onMoveToCategory}
          onAssignProject={onAssignProject}
          onRetriage={onRetriage}
        />
      )}
    </div>
  )
}
```

### Pattern 2: Pointer-based long-press with tolerance

**Pointer Events are the canonical cross-platform input API** — they unify touch, mouse, and pen. Safari on iOS has supported Pointer Events since iOS 13 (2019). Using pointer events (not separate `touchstart` + `mousedown` listeners) avoids event duplication on touch devices that also emit mouse events.

**Long-press is NOT a native web API.** You roll your own. The pattern:

```tsx
// Source: MDN Pointer events + community convention (react-use-long-press source, Floating UI useLongPress source)
// [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events]
// [ASSUMED — 500ms / 10px defaults based on iOS HIG long-press convention]

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 10

function useLongPress(onLongPress: (x: number, y: number) => void) {
  const timer = useRef<number | null>(null)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  const cancel = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    startPos.current = null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // Only touch — desktop right-click goes through onContextMenu (D-04)
    if (e.pointerType !== 'touch') return
    startPos.current = { x: e.clientX, y: e.clientY }
    timer.current = window.setTimeout(() => {
      if (startPos.current) {
        onLongPress(startPos.current.x, startPos.current.y)
      }
      timer.current = null
    }, LONG_PRESS_MS)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startPos.current || timer.current === null) return
    const dx = Math.abs(e.clientX - startPos.current.x)
    const dy = Math.abs(e.clientY - startPos.current.y)
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) cancel()
  }

  const onPointerUp = cancel
  const onPointerCancel = cancel   // fires on scroll-start in most browsers

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
```

**Why `pointerType === 'touch'` gate:** Per D-04, right-click is desktop-only and long-press is touch-only. Gating on `pointerType` lets both coexist on the same element without cross-firing (a trackpad right-click will emit `pointerdown` with `pointerType === 'mouse'` → ignored by the long-press logic; a touch screen long-press will emit `pointerType === 'touch'` → handled). The native `contextmenu` event handles desktop right-click independently.

### Pattern 3: Edit interlock with Phase 100

This is the **most load-bearing pattern in the phase.** Phase 100 established `vigil:edit-started` / `vigil:edit-ended` as the canonical edit-lifecycle signal on `window`. The Set-refcount gate in `useThoughts.ts:78-139` pauses three refresh triggers (30s interval, visibilitychange, `vigil:thought-created`) while any edit is active. If the menu's Edit item sets `isEditing = true` directly without dispatching `vigil:edit-started`, the gate stays at 0 and the poll will happily `setThoughts(res.data)` mid-edit, clobbering the user's draft.

**Two correct implementations; pick one:**

```tsx
// OPTION A: Export handleContentClick as a prop ref (minimal diff).
// ThoughtRow owns the entry point; the menu triggers it via a callback.

// In ThoughtRow.tsx:
<ContextMenu
  onStartEdit={handleContentClick}     // already dispatches vigil:edit-started — line 117-120 of existing ThoughtRow
  ...
/>

// In ContextMenu.tsx:
<MenuItem onClick={() => { onStartEdit(); onClose() }}>Edit</MenuItem>
```

```tsx
// OPTION B: Lift handleContentClick into a reusable function passed via props.
// Cleaner for testing but touches more files.

// In ThoughtsPage.tsx or ThoughtList.tsx:
const startEdit = useCallback((id: number) => {
  // equivalent of handleContentClick — setIsEditing(true) + dispatch
  // Problem: isEditing is local to ThoughtRow, not lifted.
}, [])
```

**Recommendation: Option A.** It's a two-line change in `ThoughtRow.tsx`, leaves the existing `handleContentClick` contract intact, and reuses the dispatch that Phase 100 tests already pin down. Option B requires lifting `isEditing` state up to `ThoughtList`, which is a larger refactor.

**Verification — make it a test:** Add to `ContextMenu.test.tsx`:
```tsx
it('Edit menu item dispatches vigil:edit-started (Phase 100 D-19 interlock)', () => {
  const startSpy = vi.fn()
  window.addEventListener('vigil:edit-started', startSpy)
  // render a ThoughtRow, open menu via right-click, click Edit,
  // assert startSpy called with { id }
  window.removeEventListener('vigil:edit-started', startSpy)
})
```

### Pattern 4: Portal + viewport-overflow positioning

No Floating UI → hand-roll the math. Two-pass positioning: render at the pointer, measure `getBoundingClientRect()` in a `useLayoutEffect`, shift if overflow detected.

```tsx
// Source: standard popover pattern; Floating UI README documents the same math
// [CITED: https://floating-ui.com/docs/tutorial — "The computation"]

function ContextMenu({ anchor, onClose, ...props }) {
  const ref = useRef<HTMLDivElement>(null)
  const [adjusted, setAdjusted] = useState(anchor)

  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    let { x, y } = anchor

    // D-08: right-edge overflow → shift left
    if (x + rect.width > viewportW - 8) x = viewportW - rect.width - 8
    // D-08: bottom-edge overflow → flip above
    if (y + rect.height > viewportH - 8) y = anchor.y - rect.height
    // keep inside top/left margins
    x = Math.max(8, x)
    y = Math.max(8, y)

    setAdjusted({ x, y })
  }, [anchor])

  // close on outside click, scroll, resize, Escape (D-07)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onScroll = () => onClose()
    const onResize = () => onClose()
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)  // capture for scroll in any ancestor
    window.addEventListener('resize', onResize)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-48 max-w-[280px] bg-gray-900/80 border border-gray-400/30 rounded-lg shadow-xl py-1"
      style={{ left: adjusted.x, top: adjusted.y }}
    >
      {/* items */}
    </div>,
    document.body,
  )
}
```

**Why `pointerdown` for outside-click (not `mousedown` or `click`):** Pointer events unify touch + mouse, and they fire BEFORE click, which means the menu closes before the row underneath gets a stray click. This matches the existing `Layout.tsx:47` pattern except that it uses `mousedown` (also fine, but pointer is more correct for touch). Either works; pointer is marginally better for touch UX.

**Why `{ capture: true }` on scroll:** Scroll events don't bubble. If a thought list scrolls (nested scroll container), a bubbling listener on `window` won't catch it. Capture-phase does. Pattern lifted from established DOM idiom.

### Pattern 5: Deferred-commit undo (no restore endpoint needed)

**Critical finding:** The server has no restore endpoint. `POST /v1/thoughts/bulk/delete` does a soft-delete by flipping `syncStatus = 'pendingDeletion'` [VERIFIED: `vigil-core/src/routes/bulk.ts:39-46`]. `PUT /thoughts/:id` filters out pending-deletion rows [VERIFIED: `vigil-core/src/routes/thoughts.ts:359`]. `POST /v1/thoughts` creates a new row with a new ID — this would break re-links (tags, projectId, chat-history refs by id).

**The clean solution: defer the API call until the undo window closes.**

```tsx
// Flow:
// 1. User clicks Delete in menu
// 2. Client-side: removeMany(new Set([id])) — row disappears instantly (optimistic)
// 3. Client-side: showToast({ body: 'Thought deleted.', action: 'Undo', onAction: restore, onExpire: commit })
//    - Capture a copy of the thought object in toast state (so restore can re-insert it)
// 4. If user clicks Undo within 5s: prependThought(savedCopy); do NOT call API
// 5. If 5s timer fires: call bulkDeleteThoughts([id]) exactly once
// 6. If a second delete fires during the 5s window: commit the first immediately, then start the new 5s window

// Source: Gmail mobile undo pattern, iOS Mail undo pattern (both defer the server call)
// [ASSUMED — these apps don't publish their architecture, but the behavior is consistent with this pattern]
```

**Pros:**
- Zero backend work.
- Undo is truly lossless (same ID, same relations, same tags).
- Single API call per delete (more efficient than delete + restore).
- If the browser crashes mid-window, the row is still on the server — acceptable failure mode (user will see the row return on next load, which is safer than losing data).

**Cons:**
- Row is still visible on server for up to 5s. If user logs in on a second device during that window, they see a deleted-but-not-committed row. **Acceptable** for this single-user product stage (multi-user is Phase 102, not live yet).
- The 30s poll during the window could re-show the row (setThoughts replaces array including the not-yet-deleted row). **Solution:** when toast is open, maintain a `Set<number>` of ids-hidden-pending-delete in the component owning the toast (ThoughtsPage), and filter them out of `thoughts` at render time. Alternative: dispatch `vigil:edit-started` to pause the poll during the undo window — abuses the semantics but is zero-code. **Recommendation: filter at render time** — explicit, no event bus abuse.

**Commit/undo race:** If a second delete fires while the first is still in its 5s window (D-16 says "the first deletion is committed silently"), commit the first synchronously (call `bulkDeleteThoughts` with the first id), then set up the new toast for the second id. The toast state machine is effectively:

```
state: { id: number; thought: ThoughtApiResponse; timeoutId: number } | null
```

**Alternative considered:** Add `POST /v1/thoughts/:id/restore` endpoint that flips `syncStatus` back to `'synced'`. **Reject** — D-17 explicitly scopes this phase to "no new backend endpoints needed" (D-20). The deferred-commit pattern meets CTX-03 with zero server changes.

### Pattern 6: Submenu architecture — one component with view state

UI-SPEC leaves this open. Two viable shapes:

**Shape A (recommended): Single `<ContextMenu>` with `view` state machine**

```tsx
type View = 'root' | 'categories' | 'projects'

function ContextMenu(props) {
  const [view, setView] = useState<View>('root')
  const [submenuAnchor, setSubmenuAnchor] = useState<...>(null)  // desktop only

  // Desktop (hover-to-open): when user hovers "Move to category →", set submenuAnchor
  // Mobile (tap-to-replace): when user taps "Move to category →", setView('categories')

  if (view === 'categories') return <CategoryList onBack={() => setView('root')} ... />
  if (view === 'projects') return <ProjectList onBack={() => setView('root')} ... />
  return <RootMenu ... />
}
```

Media-query detection for mobile vs desktop: `window.matchMedia('(pointer: coarse)')` is the canonical check — true on touch devices, false on mouse/trackpad. **Do NOT use user-agent sniffing.** Alternative: pass `pointerType` from the trigger that opened the menu (`'mouse'` → desktop submenu, `'touch'` → in-place replace).

**Shape B: Separate `<RootContextMenu>` + `<SubmenuPortal>` components**

Reject. The state machine (`view: root | categories | projects`) is inherently shared — splitting into two components just means passing it around as props. Single component is cleaner.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Portal | DOM manipulation with `document.body.appendChild` | `createPortal` from `react-dom` | Handles React reconciliation, unmount cleanup, event bubbling-through-React-tree. |
| Long-press counter | Custom `setTimeout` state machine with manual touch coordinate tracking scattered across component | A single `useLongPress(onLongPress)` hook per Pattern 2 | Centralized cancellation logic; reusable for future phases. |
| Outside-click detection | Multiple independent listeners on every component | Single `pointerdown` listener on `window` filtered by `ref.contains(e.target)` (Pattern 4) | One listener, one cleanup. Existing `Layout.tsx:41-49` uses the same shape with `mousedown`. |
| Category list | Hardcoded strings in each new component | Import from existing source (`BulkActionBar.tsx:3`: `['task', 'therapy', 'idea', 'reflection', 'project']`) — or better, extract to `src/constants/categories.ts` | Single source of truth. UI-SPEC §Submenu empty states locks this list at 5 hardcoded items. |
| Project list | Fresh `GET /v1/projects` on menu open | Reuse `useProjects()` at the `ThoughtsPage` level and pass down — OR accept menu-local fetch since it's rare (user opens menu, taps Add to project → <10 times/day). | Cheap either way; menu-local fetch is simpler for the phase. If perceived latency is bad, hoist. |
| Toast | Global window event bus for `toast:show` | Module-level store OR React context with `useToast()` hook | Type-safe, testable, no string-keyed events. Existing precedent: `GoogleStatusContext.tsx` (context pattern for cross-tree shared state). |
| Keyboard navigation in menu | Complex focus trap library | Simple arrow-key state (`focusedIndex`) + `tabIndex={-1}` on items + `.focus()` on mount | D-21 says no focus trap. Five items. Arrow keys cycle through. |
| `getBoundingClientRect` math | Multiple overlapping `useEffect`s that race | Single `useLayoutEffect` that reads rect and sets adjusted position in one pass | `useLayoutEffect` fires synchronously after DOM mutation — no flicker. |

**Key insight:** This phase is the sort of UI where the wrong instinct is to reach for a library. Every primitive needed (portal, long-press, positioning, toast) is 15-40 lines in isolation. The complexity lives in *coordinating* them, and no library solves that for you. The existing `BulkActionBar.tsx` (82 lines) and `Layout.tsx` More dropdown (both hand-rolled popovers with outside-click) prove the pattern scales.

## Common Pitfalls

### Pitfall 1: iOS Safari native long-press callout

**What goes wrong:** On iOS Safari, a long-press on text triggers the native text-selection callout ("Copy", "Share", "Look Up") — this fires instead of (or in addition to) your custom long-press. Users see a flicker of native UI before your menu appears, or the native menu blocks your menu entirely.

**Why it happens:** iOS applies `-webkit-touch-callout: default` to all elements by default. The callout behavior is separate from `contextmenu` events (which iOS Safari does NOT fire on long-press).

**How to avoid:** Apply `-webkit-touch-callout: none` and `user-select: none` to the thought-row element. In Tailwind v4 this is an arbitrary property:

```tsx
<div
  className="[-webkit-touch-callout:none] select-none ..."
  onContextMenu={handleContextMenu}
  {...longPressHandlers}
>
```

**Warning signs:** During manual testing on an actual iPhone (NOT Safari desktop devtools simulation — which doesn't reproduce iOS callout), long-pressing a thought row shows the "Copy | Look Up | Share" system UI before the context menu appears.

[CITED: https://developer.apple.com/documentation/safariservices/preventing_a_long-press_menu - Apple: "Preventing a long-press menu from appearing on an element"]

### Pitfall 2: `contextmenu` event not firing on iOS Safari long-press

**What goes wrong:** You wire `onContextMenu` expecting it to fire on iOS long-press (as it does on Android Chrome). It doesn't. Mobile users see nothing happen.

**Why it happens:** iOS Safari deliberately does not synthesize `contextmenu` from long-press; Android Chrome and most desktops do. This is a platform-level inconsistency.

**How to avoid:** **Always implement long-press explicitly** (Pattern 2). Don't rely on `onContextMenu` for mobile. Gate on `pointerType === 'touch'` (desktop right-click on mobile Chrome DevTools emulation will still fire `contextmenu` through `pointerType: 'mouse'` — the real iOS behavior is the one that matters).

[VERIFIED: https://caniuse.com/mdn-api_element_contextmenu_event — "Safari on iOS" shows partial support]

### Pitfall 3: React 19 automatic batching hides multiple state updates in tests

**What goes wrong:** Test asserts "after two 30s ticks, `getThoughts` was called twice" and gets 1. Or a test that dispatches two events in a row only sees one re-render.

**Why it happens:** React 19 batches all state updates within a single microtask, and `vi.advanceTimersByTimeAsync(60_000)` triggers both 30s ticks in one microtask.

**How to avoid:** Split advances and flush microtasks between them — exactly the pattern Phase 100 established in `useThoughts.test.tsx:46-56`:

```tsx
await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
await flushMicrotasks()
expect(mockGetThoughts).toHaveBeenCalledTimes(2)

await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
await flushMicrotasks()
expect(mockGetThoughts).toHaveBeenCalledTimes(3)
```

[VERIFIED: `vigil-pwa/src/hooks/useThoughts.test.tsx:18-23, 46-56` — `flushMicrotasks` helper and split-advance pattern]

### Pitfall 4: `fireEvent.touchStart` does not populate `clientX/clientY` unless you pass `touches: [...]`

**What goes wrong:** Long-press test fails because `startPos.current` is `{ x: 0, y: 0 }` and any move is ≥ 10px.

**Why it happens:** `fireEvent.touchStart` creates a `TouchEvent` with no `touches` array by default.

**How to avoid:** Pass explicit touches:

```tsx
fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] })
fireEvent.touchMove(row, { touches: [{ clientX: 105, clientY: 102 }] })  // within tolerance
vi.advanceTimersByTime(500)
// assert menu opened
```

**Better alternative:** Use `fireEvent.pointerDown` with explicit `pointerType: 'touch'` + `clientX/clientY` — matches the production Pointer Events path exactly:

```tsx
fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 100, clientY: 100 })
```

[CITED: https://testing-library.com/docs/dom-testing-library/api-events — `fireEvent` options]

### Pitfall 5: Portal click-outside fires on the click that OPENED the menu

**What goes wrong:** You right-click a row, the menu opens, then the same `pointerup` / `click` event bubbles to `window` and the outside-click listener closes the menu immediately. Users see nothing.

**Why it happens:** Event handler registration happens during render; but the `contextmenu` event that triggered the render is still propagating.

**How to avoid:** (1) Register the outside-click listener inside a `useEffect`, NOT inline. The effect runs after the event cycle completes. (2) Alternative: check `e.target` against the trigger element itself, not just the menu ref. Existing `Layout.tsx:41-49` does this correctly with a `useEffect`.

**Warning signs:** Menu opens and closes in the same frame. Add `console.log` to the outside-click listener to see if it fires immediately.

### Pitfall 6: Phase 100 refcount leak if menu mutates `isEditing` directly

**What goes wrong:** Developer writes `onClick={() => setIsEditing(true)}` in the menu's Edit item instead of calling `handleContentClick`. `vigil:edit-started` never dispatches. 30s later the poll fires, `setThoughts(res.data)` runs, the row re-renders with `isEditing: false` (local state resets on prop change since thought object is new), and the user's draft is gone.

**Why it happens:** `isEditing` is local to `ThoughtRow`, and changing it doesn't automatically dispatch the pause event. The dispatch is a separate manual call in `handleContentClick`.

**How to avoid:** **Route all edit-entry through `handleContentClick`** (D-19). Add a unit test that spies on `window.dispatchEvent` when Edit is clicked. See Pattern 3.

**Warning signs:** Users report losing draft content ~30s into editing when they entered edit mode via the context menu but NOT when they clicked the row directly.

### Pitfall 7: Toast auto-dismiss timer fires after component unmount

**What goes wrong:** User navigates away from thoughts page while toast is visible. 2s later, the toast timeout fires `bulkDeleteThoughts([id])` — but the page is gone. The call still succeeds, but if the component owned optimistic state, it's already been GC'd. Then the user returns, sees the row missing (good), but if the API failed, there's no way to show the error toast.

**Why it happens:** `setTimeout` doesn't know about React lifecycle.

**How to avoid:** (1) Mount `<ToastHost />` at `App.tsx` root (outside the router-page tree) so navigation doesn't unmount it. (2) `useToast()` store should be module-level OR app-root context — NOT per-page. UI-SPEC §Component Inventory locks this: "ToastHost - Single-slot toast container mounted at app root (`App.tsx`)".

**Warning signs:** Toast briefly appears and disappears when user navigates. API call orphaned. Implementation check: does `ToastHost` re-mount between `/` and `/work-orders`? It shouldn't.

### Pitfall 8: Two portaled menus overlap when user right-clicks a second row

**What goes wrong:** Right-click row A, menu opens. Right-click row B (without closing A's menu first). Two portals render simultaneously.

**Why it happens:** Each row owns its own menu state; they don't know about each other.

**How to avoid:** Lift the "which row's menu is open" state up to `ThoughtList` or `ThoughtsPage` — a single `openMenuForId: number | null`. Each row's `handleContextMenu` sets `openMenuForId = thought.id`; the menu renders only when `openMenuForId === thought.id`. Opening a new menu auto-closes the old one.

**Alternative:** Use `window.dispatchEvent` with a `vigil:context-menu-opened` event; each open menu listens and closes itself if it wasn't the origin. More complex. Reject for lifted state.

### Pitfall 9: Passive event listeners prevent `preventDefault()` on touch

**What goes wrong:** You want to call `e.preventDefault()` on `pointerdown` to prevent iOS scrolling — but modern browsers treat touch listeners as passive by default, and passive listeners can't preventDefault.

**Why it happens:** Browsers made touch listeners passive for performance. React honors this.

**How to avoid:** For long-press specifically, DON'T preventDefault on pointerdown — you WANT the user's scroll to work if they decide to scroll. The 10px tolerance + pointercancel naturally handles this (if the user scrolls, `pointercancel` fires, long-press cancels, normal scroll proceeds). Use `touch-action: manipulation` on the row element to disable double-tap-to-zoom without blocking scroll.

```tsx
<div className="touch-manipulation ..." {...longPressHandlers}>
```

[CITED: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action]

## Code Examples

### Minimal `useToast` hook

```tsx
// vigil-pwa/src/hooks/useToast.ts
// Source: adapts the GoogleStatusContext.tsx pattern (React context with hook)

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface Toast {
  id: number
  body: string
  action?: string
  onAction?: () => void
  onExpire?: () => void
  variant: 'default' | 'error'   // UI-SPEC error state: role="alert" vs role="status"
}

interface ToastContextValue {
  current: Toast | null
  showToast: (t: Omit<Toast, 'id'>) => void
  dismiss: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 5_000   // D-15

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null)
  const timerRef = useRef<number | null>(null)
  const expireRef = useRef<(() => void) | undefined>(undefined)
  const idRef = useRef(0)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const dismiss = useCallback(() => {
    clearTimer()
    expireRef.current = undefined
    setCurrent(null)
  }, [])

  const showToast = useCallback((t: Omit<Toast, 'id'>) => {
    // D-16: replace — first toast's onExpire fires (commit silently).
    if (expireRef.current) expireRef.current()
    clearTimer()

    const id = ++idRef.current
    const next = { ...t, id }
    expireRef.current = t.onExpire
    setCurrent(next)
    timerRef.current = window.setTimeout(() => {
      const fn = expireRef.current
      expireRef.current = undefined
      if (fn) fn()
      setCurrent((c) => (c?.id === id ? null : c))
    }, TOAST_DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ current, showToast, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
```

```tsx
// vigil-pwa/src/components/ToastHost.tsx
import { createPortal } from 'react-dom'
import { useToast } from '../hooks/useToast'

export default function ToastHost() {
  const { current, dismiss } = useToast()
  if (!current) return null

  const isError = current.variant === 'error'

  return createPortal(
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="fixed bottom-6 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-900/80 border border-gray-400/30 rounded-lg shadow-xl px-4 py-3 flex items-center gap-4 min-w-[240px]"
      style={{ bottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <span className="text-sm text-gray-50">{current.body}</span>
      {current.action && (
        <button
          onClick={() => {
            current.onAction?.()
            dismiss()
          }}
          className="text-sm font-medium text-teal-400 hover:text-teal-100 min-w-[44px] text-center"
        >
          {current.action}
        </button>
      )}
    </div>,
    document.body,
  )
}
```

**Mount point in `App.tsx`:**

```tsx
// vigil-pwa/src/App.tsx — inside the authenticated branch
<GoogleStatusProvider>
  <ToastProvider>
    <Layout>...</Layout>
    <ToastHost />
  </ToastProvider>
</GoogleStatusProvider>
```

### Delete flow with deferred commit

```tsx
// vigil-pwa/src/pages/ThoughtsPage.tsx additions

const { showToast } = useToast()
const [hiddenPendingDelete, setHiddenPendingDelete] = useState<Set<number>>(new Set())

async function handleDelete(id: number) {
  const thought = thoughts.find((t) => t.id === id)
  if (!thought) return

  // Optimistic: hide immediately.
  setHiddenPendingDelete((s) => { const n = new Set(s); n.add(id); return n })
  // (Do NOT call removeMany — keeps the thought in the array so restore is a no-op.
  // Alternative: removeMany + prependThought on restore. Either works; filter-on-render
  // is simpler because it doesn't need the original array index.)

  showToast({
    body: 'Thought deleted.',
    action: 'Undo',
    variant: 'default',
    onAction: () => {
      // restore: unhide
      setHiddenPendingDelete((s) => { const n = new Set(s); n.delete(id); return n })
    },
    onExpire: async () => {
      // commit: actually delete on server, then clear local
      try {
        await bulkDeleteThoughts([id])
        removeMany(new Set([id]))
      } catch (e) {
        // revert + show error toast (different toast, not the undo one — it's already dismissing)
        setHiddenPendingDelete((s) => { const n = new Set(s); n.delete(id); return n })
        showToast({ body: "Couldn't delete. Try again.", variant: 'error' })
      } finally {
        setHiddenPendingDelete((s) => { const n = new Set(s); n.delete(id); return n })
      }
    },
  })
}

// In the render — filter out pending-delete rows:
const visibleThoughts = thoughts.filter((t) => !hiddenPendingDelete.has(t.id))
<ThoughtList thoughts={visibleThoughts} ... />
```

### Long-press test (fake timers)

```tsx
// vigil-pwa/src/components/ThoughtRow.test.tsx additions

it('opens context menu after 500ms long-press on touch device', async () => {
  vi.useFakeTimers()
  try {
    const { getByText, findByRole } = render(<ThoughtRow thought={baseThought} onUpdate={vi.fn()} />)
    const row = getByText('hello').closest('div')!

    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 100, clientY: 100 })

    // Before 500ms — no menu.
    act(() => { vi.advanceTimersByTime(400) })
    expect(document.querySelector('[role="menu"]')).toBeNull()

    // Cross 500ms threshold.
    act(() => { vi.advanceTimersByTime(150) })
    const menu = await findByRole('menu')
    expect(menu).toBeTruthy()
  } finally {
    vi.useRealTimers()
  }
})

it('cancels long-press if pointer moves > 10px before 500ms', () => {
  vi.useFakeTimers()
  try {
    const { getByText } = render(<ThoughtRow thought={baseThought} onUpdate={vi.fn()} />)
    const row = getByText('hello').closest('div')!

    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 115, clientY: 102 })  // 15px > 10px
    act(() => { vi.advanceTimersByTime(600) })

    expect(document.querySelector('[role="menu"]')).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('does not open menu via right-click while isEditing', () => {
  const { getByText } = render(<ThoughtRow thought={baseThought} onUpdate={vi.fn()} />)
  fireEvent.click(getByText('hello'))   // enter edit mode

  const row = getByText('hello').closest('div') ?? document.querySelector('textarea')!.closest('div')!
  fireEvent.contextMenu(row, { clientX: 100, clientY: 100 })

  expect(document.querySelector('[role="menu"]')).toBeNull()
})
```

### Context menu test (right-click + portal queries)

```tsx
// vigil-pwa/src/components/ContextMenu.test.tsx

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { ToastProvider } from '../hooks/useToast'
import ThoughtRow from './ThoughtRow'

// screen queries document.body — picks up portaled content automatically.

it('right-click opens menu at pointer position', () => {
  const { getByText } = render(
    <ToastProvider>
      <ThoughtRow thought={baseThought} onUpdate={vi.fn()} onDelete={vi.fn()} ... />
    </ToastProvider>
  )
  fireEvent.contextMenu(getByText('hello'), { clientX: 250, clientY: 300 })

  const menu = screen.getByRole('menu')
  expect(menu).toBeTruthy()
  // Position check (ballpark — exact values depend on overflow-flip logic)
  expect(menu).toHaveStyle({ left: '250px', top: '300px' })
})

it('clicking Edit item dispatches vigil:edit-started (Phase 100 D-19 interlock)', () => {
  const startSpy = vi.fn()
  window.addEventListener('vigil:edit-started', startSpy)
  try {
    const { getByText } = render(<ToastProvider><ThoughtRow ... /></ToastProvider>)
    fireEvent.contextMenu(getByText('hello'), { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(startSpy).toHaveBeenCalledTimes(1)
    const ev = startSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
    expect(ev.detail).toEqual({ id: 42 })
  } finally {
    window.removeEventListener('vigil:edit-started', startSpy)
  }
})

it('Escape closes the menu', () => {
  const { getByText } = render(<ToastProvider><ThoughtRow ... /></ToastProvider>)
  fireEvent.contextMenu(getByText('hello'), { clientX: 100, clientY: 100 })
  expect(screen.getByRole('menu')).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `onTouchStart`/`onMouseDown` dual-wired | `onPointerDown` (Pointer Events) | Safari iOS 13 (2019) — full support | One handler, no event duplication on touch-devices-with-mouse-emulation |
| `ReactDOM.render` + manual portal root | `createPortal` | React 16 (2017) | Portal IS stable React API; no third-party lib needed |
| Global mouse listeners for outside-click | `useEffect`-scoped `pointerdown` with `ref.contains` | React 16.8 hooks (2019) | Automatic cleanup on unmount; idiomatic React |
| `window.alert/confirm` for destructive | Optimistic UI + undo toast | iOS Mail pattern (2010s+), Gmail (2015+) | Zero confirm friction, better UX, lossless via deferred commit |
| `role="listbox"` for menus | `role="menu"` + `role="menuitem"` | WAI-ARIA 1.1 | Semantics match the interaction pattern |
| Synchronous state updates assumed | React 19 automatic batching (must flush microtasks in tests) | React 18 (2022) | Tests must `await flushMicrotasks()` between advances |

**Deprecated/outdated:**
- **Do NOT use `@radix-ui/react-context-menu` just because it's popular.** UI-SPEC §Registry Safety locks this phase as hand-roll. Adding Radix is a design-system adoption phase, not this phase.
- **Do NOT use `react-portal` npm package** — `createPortal` has been the canonical API for 8 years.
- **Do NOT use `react-use-gesture` / `react-use-long-press`** — the hook is ~30 lines; the dep is ~20KB.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 500ms / 10px long-press threshold matches iOS HIG expectations | Pattern 2, Pitfall 4 | If actual native iOS long-press is 400ms or 600ms, power users will feel a mismatch. D-02 locks 500ms anyway, so this is a CONTEXT-locked value — research just cross-references it to convention. Low risk: matches CONTEXT exactly. |
| A2 | Gmail/iOS Mail use client-side deferred commit for their undo-delete flow | Pattern 5 | These apps don't publish their architecture. The behavior is consistent with deferred commit (undo is instant; commit happens at window-close), but they might actually hit an endpoint that flips a flag. **Impact if wrong: None.** The recommendation stands independent of what Gmail does — it's the right pattern for this codebase because no restore endpoint exists. |
| A3 | `window.matchMedia('(pointer: coarse)')` reliably detects touch devices | Pattern 6 | On hybrid devices (laptops with touchscreens), this returns `true` even though the user may be using mouse. Safer alternative: dispatch based on which trigger opened the menu (`contextmenu` event → desktop layout, long-press handler → mobile layout). **Recommendation: derive from trigger source, not media query** — the trigger already knows the input modality. |
| A4 | Tailwind v4 supports `[-webkit-touch-callout:none]` arbitrary-property syntax | Pitfall 1 | Tailwind v4 docs confirm arbitrary variants and arbitrary property values work. If syntax differs, fall back to a one-line CSS rule in `index.css` (`.no-callout { -webkit-touch-callout: none }`). Low risk. |

## Open Questions (RESOLVED)

1. **Desktop vs touch detection — media query or trigger source?**
   - What we know: `(pointer: coarse)` media query works but has edge cases on hybrid devices.
   - What's unclear: If a user right-clicks with a trackpad on an iPad (external mouse connected), should they get the desktop-submenu-on-hover layout or the mobile in-place-replace layout? D-11 says desktop = hover-submenu, D-12 says mobile = in-place. Ambiguous for hybrid devices.
   - **RESOLVED:** Recommendation: **Derive from trigger source.** If opened via `contextmenu` event → desktop layout; if opened via long-press → mobile layout. Pass a flag into `<ContextMenu>` at open time. This sidesteps the hybrid-device ambiguity entirely.

2. **Category list source — hardcode vs derive from existing thoughts?**
   - What we know: `BulkActionBar.tsx:3` hardcodes `['task', 'therapy', 'idea', 'reflection', 'project']`. The backend validates against the same list via `VALID_CATEGORIES` in `vigil-core/src/routes/thoughts.ts`. UI-SPEC §Submenu empty states locks "5 hardcoded categories".
   - What's unclear: Whether to extract to a shared `src/constants/categories.ts` (so both `BulkActionBar` and `ContextMenu` import from one source) or duplicate.
   - **RESOLVED:** Recommendation: **Extract to `src/constants/categories.ts`** as part of Phase 101 (one-liner file; eliminates future drift). Not strictly required; planner's call. D-13 says "planner's call" explicitly.

3. **Should the 5-second undo toast pause the 30s poll?**
   - What we know: During the 5s undo window, the row is hidden locally but still on the server. If the poll fires `setThoughts(res.data)`, the deleted-pending-commit row would be in the response.
   - What's unclear: Does the filter-on-render approach (Pattern 5) handle this, or do we need to pause the poll?
   - **RESOLVED:** Recommendation: **Filter-on-render is sufficient** — the `hiddenPendingDelete` Set persists across poll-driven state replaces. No need to pause. Lower complexity, no event bus abuse.

4. **Single-open-menu invariant — lift state or event bus?**
   - What we know: Two menus open simultaneously is a valid bug vector (Pitfall 8).
   - What's unclear: Lift `openMenuForId` to `ThoughtList` OR use a `vigil:context-menu-opened` window event.
   - **RESOLVED:** Recommendation: **Lift state.** Simpler, type-safe, no cross-cutting concerns. Four-line change in `ThoughtList.tsx`.

## Environment Availability

Phase is pure browser-side React. No external services or CLIs beyond what's already installed.

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node / npm | Build + test | ✓ | (existing vite setup) | — |
| `vitest` | Tests | ✓ | 2.1.9 | — |
| `jsdom` | Test DOM env | ✓ | 25.0.1 | — |
| iPhone physical device OR Safari iOS simulator | UAT for long-press + `-webkit-touch-callout` | ⚠ User-side | — | Chrome DevTools touch emulation does NOT reproduce iOS callout — manual test on iOS Safari (or TestFlight) is load-bearing before phase close. Document as a UAT checklist item. |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None for build/test. Real-device iOS testing is a manual UAT step — flag it in the plan's "Human Verification" section.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@2.1.9` + `@testing-library/react@16.3.2` + `jsdom@25.0.1` |
| Config file | `vigil-pwa/vite.config.ts` (existing — vitest plugin auto-configured) |
| Quick run command | `cd vigil-pwa && npx vitest run src/components/ContextMenu.test.tsx src/components/ToastHost.test.tsx src/components/ThoughtRow.test.tsx src/hooks/useToast.test.tsx` |
| Full suite command | `cd vigil-pwa && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTX-01 | Right-click on row opens menu at pointer position | unit | `npx vitest run src/components/ThoughtRow.test.tsx -t "right-click opens menu"` | ❌ Wave 0 |
| CTX-01 | Right-click suppressed while `isEditing === true` (D-03) | unit | `npx vitest run src/components/ThoughtRow.test.tsx -t "no menu while editing"` | ❌ Wave 0 |
| CTX-02 | Long-press ≥500ms on touch opens menu | unit (fake timers) | `npx vitest run src/components/ThoughtRow.test.tsx -t "long-press opens menu"` | ❌ Wave 0 |
| CTX-02 | Long-press cancelled by ≥10px pointer move | unit (fake timers) | `npx vitest run src/components/ThoughtRow.test.tsx -t "cancels long-press on move"` | ❌ Wave 0 |
| CTX-02 | Long-press suppressed on iOS native callout element (verify `-webkit-touch-callout: none` applied) | manual UAT | physical iPhone test | ❌ Wave 0 (manual, not automated) |
| CTX-03 | Delete menu item hides row optimistically + shows undo toast | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "delete optimistic"` | ❌ Wave 0 |
| CTX-03 | Undo within 5s restores row, no server call | unit (fake timers) | `npx vitest run src/pages/ThoughtsPage.test.tsx -t "undo restores row"` | ❌ Wave 0 (ThoughtsPage test may need scaffold) |
| CTX-03 | No undo after 5s → `bulkDeleteThoughts` called once | unit (fake timers) | `npx vitest run src/pages/ThoughtsPage.test.tsx -t "commits after 5s"` | ❌ Wave 0 |
| CTX-04 | Move-to-category updates thought via `updateThought(id, { category })` | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "move to category"` | ❌ Wave 0 |
| CTX-05 | Edit menu item dispatches `vigil:edit-started` (Phase 100 interlock) | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "Edit dispatches vigil:edit-started"` | ❌ Wave 0 |
| CTX-06 | Re-triage calls existing `onRetriage(id)` | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "re-triage calls onRetriage"` | ❌ Wave 0 |
| CTX-07 | Add-to-project updates via `updateThought(id, { projectId })` | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "add to project"` | ❌ Wave 0 |
| CTX-07 | Projects submenu empty state shows copy when no projects | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "empty projects"` | ❌ Wave 0 |
| — | Toast auto-dismiss after 5s fires `onExpire` | unit (fake timers) | `npx vitest run src/hooks/useToast.test.tsx -t "auto-dismiss"` | ❌ Wave 0 |
| — | Second toast replaces first, first's `onExpire` fires (D-16) | unit | `npx vitest run src/hooks/useToast.test.tsx -t "replace commits first"` | ❌ Wave 0 |
| — | Viewport-overflow: menu shifts left on right-overflow | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "shifts left on overflow"` | ❌ Wave 0 |
| — | Viewport-overflow: menu flips above on bottom-overflow | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "flips above on overflow"` | ❌ Wave 0 |
| — | Escape key closes menu | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "escape closes"` | ❌ Wave 0 |
| — | Outside-click closes menu | unit | `npx vitest run src/components/ContextMenu.test.tsx -t "outside click closes"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd vigil-pwa && npx vitest run src/components/ContextMenu.test.tsx src/components/ThoughtRow.test.tsx src/hooks/useToast.test.tsx` — targets changed files, < 10s.
- **Per wave merge:** `cd vigil-pwa && npm test` — full suite (was 34/35 post-Phase 100; Phase 101 adds ~15-20 new cases → target 50+/51+).
- **Phase gate:** Full suite green + `npm run build` exit 0 + manual UAT on iOS Safari for Pitfalls 1+2.

### Wave 0 Gaps

- [ ] `vigil-pwa/src/components/ContextMenu.tsx` + `ContextMenu.test.tsx` — covers CTX-01, CTX-03 (menu side), CTX-04..CTX-07, viewport-overflow, Escape, outside-click
- [ ] `vigil-pwa/src/components/ToastHost.tsx` + `ToastHost.test.tsx` — covers toast render, `role="status"` vs `role="alert"`, position
- [ ] `vigil-pwa/src/hooks/useToast.ts` + `useToast.test.tsx` — covers `showToast`, auto-dismiss timer, replace-commits-first (D-16)
- [ ] `vigil-pwa/src/components/ThoughtRow.test.tsx` — extend with right-click, long-press (fake timers + pointer events), edit-mode suppression tests
- [ ] `vigil-pwa/src/pages/ThoughtsPage.test.tsx` — NEW file for the delete-deferred-commit integration test. Currently no `ThoughtsPage.test.tsx` exists. If scaffold cost is too high, move those tests into `ContextMenu.test.tsx` with a stub parent that wires `onDelete` → `useToast`. Either is acceptable.
- [ ] `vigil-pwa/src/constants/categories.ts` — optional extraction (Open Question 2). If done, add `BulkActionBar.tsx:3` refactor.

## Security Domain

**Applies:** No — this phase is pure client-side UI. All mutations go through already-authenticated endpoints (`bulkDeleteThoughts`, `updateThought`, `triageThought`) that were hardened in earlier phases.

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no — existing bearer-token auth via `vigilFetch` in `api/client.ts` unchanged | — |
| V3 Session Management | no | — |
| V4 Access Control | no — no new endpoints, no new routes | — |
| V5 Input Validation | marginal — category values constrained to hardcoded list; project IDs sourced from `GET /v1/projects` response | Client-side type check in TypeScript; server still validates via `VALID_CATEGORIES` (`thoughts.ts:373`) |
| V6 Cryptography | no | — |

**Known threat patterns for this stack:** None introduced by this phase. Context menu triggers no new data paths. The deferred-commit undo (Pattern 5) leaves a soft-deletable row on the server for up to 5s — acceptable in single-user deployment and auto-commits even if the browser crashes (D-16 lock).

## Sources

### Primary (HIGH confidence)
- `vigil-pwa/package.json` — dependency audit (no Radix/Headless UI/Floating UI/shadcn installed) [VERIFIED]
- `vigil-pwa/src/index.css` — Tailwind v4 `@theme` tokens inventory [VERIFIED]
- `vigil-pwa/src/components/ThoughtRow.tsx` — existing `handleContentClick` dispatch pattern (Phase 100 D-11) [VERIFIED]
- `vigil-pwa/src/hooks/useThoughts.ts` — pause-gate implementation, refresh trigger list [VERIFIED]
- `vigil-pwa/src/hooks/useThoughts.test.tsx` — proves fake-timer + microtask-flush pattern [VERIFIED]
- `vigil-pwa/src/components/ThoughtRow.test.tsx` — existing 7-test harness, spy pattern [VERIFIED]
- `vigil-pwa/src/components/BulkActionBar.tsx` — inline category picker pattern (D-12 reuse shape), category constant [VERIFIED]
- `vigil-pwa/src/components/Layout.tsx` — More dropdown outside-click pattern, `role="menu"` precedent [VERIFIED]
- `vigil-pwa/src/api/client.ts` — `updateThought`, `bulkDeleteThoughts`, `triageThought`, `getProjects` signatures [VERIFIED]
- `vigil-pwa/src/hooks/useProjects.ts` — projects loader [VERIFIED]
- `vigil-pwa/src/pages/ThoughtsPage.tsx` — wiring shape for `handleUpdate`, `handleRetriage`, `handleBulkDelete` [VERIFIED]
- `vigil-core/src/routes/bulk.ts:24-53` — soft-delete implementation (`syncStatus = 'pendingDeletion'`) [VERIFIED]
- `vigil-core/src/routes/thoughts.ts:345-477` — PUT/DELETE behavior, pending-deletion filter [VERIFIED]
- `.planning/phases/100-edit-refresh-pause/100-01-SUMMARY.md` — Phase 100 invariants and dispatch sites [VERIFIED]
- `.planning/phases/101-context-menu/101-CONTEXT.md` — D-01..D-21 locked decisions [VERIFIED]
- `.planning/phases/101-context-menu/101-UI-SPEC.md` — visual/interaction contract [VERIFIED]

### Secondary (HIGH-MEDIUM confidence)
- MDN `contextmenu` event page — browser compatibility, `preventDefault` behavior [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event]
- MDN Pointer events — cross-platform input model [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events]
- MDN `touch-action` CSS property — scroll/zoom control [CITED: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action]
- Apple Safari docs — preventing long-press menu [CITED: https://developer.apple.com/documentation/safariservices/preventing_a_long-press_menu]
- Can I Use — `contextmenu` event on iOS Safari partial support [CITED: https://caniuse.com/mdn-api_element_contextmenu_event]
- React 19 release notes — automatic batching semantics (known from training, reinforced by Phase 100 test pattern that already deals with it)

### Tertiary (LOW confidence, flagged)
- Gmail/iOS Mail undo-delete architecture — assumed deferred-commit (A2); behavior is consistent with the pattern but not officially documented. Recommendation stands regardless because no restore endpoint exists in this codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against `package.json` directly; zero library recommendations require new deps.
- Architecture: HIGH — every pattern is proven in the existing codebase (portals, pointer events, outside-click via `useEffect`, context-based stores).
- Pitfalls: HIGH — Pitfalls 1, 2, 3, 6 are direct consequences of Phase 100 lessons and documented browser behavior. Pitfall 7 is a standard React-portal-lifecycle concern.
- Undo architecture: HIGH — the no-restore-endpoint finding is VERIFIED against `bulk.ts` and `thoughts.ts` source. Deferred-commit is the only low-risk path.

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days for stable React/browser APIs). Revisit if React 20 drops or iOS 18 changes Pointer Event semantics.

## RESEARCH COMPLETE
