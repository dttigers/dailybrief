# Phase 101: Context Menu - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a per-thought-row context menu to the PWA that opens via right-click (desktop) or long-press (mobile) and wires five row-level actions — Edit, Re-triage, Move to category, Add to project, Delete — to existing backend mutations. Scope is limited to the thoughts list; work orders, briefs, projects, etc. are untouched.

Satisfies CTX-01 through CTX-07.

</domain>

<decisions>
## Implementation Decisions

### Open Triggers
- **D-01:** Desktop opens via native `onContextMenu` (right-click). Suppress the browser's default menu with `e.preventDefault()`.
- **D-02:** Mobile/touch opens via **long-press at 500 ms** with a **10 px movement tolerance**. If the user's finger moves more than 10 px before the timer fires, the press is treated as a scroll/drag and the menu does NOT open. Starting a scroll cancels a pending long-press.
- **D-03:** The menu is **suppressed while the row is in edit mode** (`isEditing === true` from Phase 100). Right-clicking an editing row does nothing; long-pressing an editing row does nothing. The user must exit edit mode (save, Escape, or blur) before the menu becomes available again. This keeps the Phase 100 refresh-pause invariant clean — no edit-ended/edit-started interleaving from menu-triggered transitions.
- **D-04:** Right-click is desktop-only; long-press is touch-only. The handlers are independent — no cross-firing (e.g., a trackpad right-click does not also register as a long-press).

### Menu Layout & Positioning
- **D-05:** The menu is a **floating popover rendered via React portal to `document.body`**. Not an inline dropdown, not a modal, not a bottom sheet. One code path for both desktop and mobile; the only difference is the anchor point.
- **D-06:** Anchor:
  - Desktop — pointer position from the `contextmenu` event (`clientX` / `clientY`).
  - Mobile — row bottom-left (the element the long-press started on). If the menu would overflow the viewport bottom, flip to row top.
- **D-07:** Close on: Escape key, click/tap outside the menu, selection of a menu item, viewport scroll, or viewport resize. No focus trap — the menu is five items and closes on outside interaction.
- **D-08:** Viewport overflow: if the menu would render past the right edge, shift left so it fits. If it would render past the bottom edge, flip above the anchor. No scrolling the menu itself.

### Menu Item Order
- **D-09:** Items in this order, top to bottom: **Edit · Re-triage · Move to category → · Add to project → · (separator) · Delete**. The arrow suffix on "Move to category" and "Add to project" signals they open submenus. Delete is visually distinct (red text) and separated from the other items.
- **D-10:** Exactly these five items for this phase. No "Copy", no "Share", no "Favorite toggle" — favorite is already a click target on the row itself.

### Secondary Pickers (Category, Project)
- **D-11:** **Desktop** — hovering "Move to category →" or "Add to project →" expands a **nested submenu to the right** of the parent menu (standard desktop pattern). Submenu closes when the user moves to another menu item or clicks outside.
- **D-12:** **Mobile/touch** — tapping "Move to category →" or "Add to project →" **replaces the menu contents in place** with the category/project list (inline-expand, like the `BulkActionBar.tsx:51` pattern). A back affordance (`← Categories` / `← Projects` header) returns to the root menu. No hover on mobile.
- **D-13:** Both lists show **all available items each time**, **sorted alphabetically**. Categories come from the existing category source (hardcoded list or derived from existing thoughts — planner's call). Projects come from `GET /v1/projects`.
- **D-14:** The thought's **current** category/project is visually indicated (checkmark or dimmed "(current)" suffix) but still selectable — re-selecting is a no-op at the API layer.

### Destructive Action UX (Delete)
- **D-15:** Delete is **immediate with a 5-second undo toast** — no confirm dialog. The row disappears optimistically from the list the moment Delete is tapped; the API call fires immediately. An undo toast pins to the bottom of the viewport for 5 seconds with "Thought deleted. [Undo]".
- **D-16:** "Undo" re-creates the thought client-side (restores the row) AND fires a POST to restore it server-side. If the user does nothing for 5 seconds, the toast dismisses and the deletion is final. If the user triggers a second delete before the first toast dismisses, the first toast is replaced (one toast at a time, not stacked) — the first deletion is committed silently.
- **D-17:** ⚠ **Scope implication — no toast infrastructure exists in the PWA.** This phase builds a minimal `ToastHost` + `useToast()` or equivalent. Planner scopes it as part of Phase 101. Keep it small: single toast slot, manual dismiss, 5 s auto-dismiss, action button. Not a general-purpose notification system.

### Re-triage UX
- **D-18:** Re-triage from the context menu is **silent** and reuses the existing `onRetriage` wiring passed into `ThoughtRow`. The menu item calls `onRetriage(thought.id)` and closes. The category updates inline when the API responds (existing behavior). No "preview the AI's suggestion, accept/reject" flow — if the user wants manual control they use Move to Category instead.

### Edit Action (interlock with Phase 100)
- **D-19:** The menu's "Edit" item calls the existing `handleContentClick` path (or an exported equivalent) on `ThoughtRow` so that `setIsEditing(true)` **and** the `vigil:edit-started` window event dispatch both happen. The menu MUST NOT simply set `isEditing = true` and skip the event — that would break the Phase 100 refresh-pause invariant by pausing the poll asymmetrically.

### API Wiring (planner reference)
- **D-20:** Delete → `bulkDeleteThoughts([id])` (already in `api/client.ts`). Move to category → `updateThought(id, { category })`. Add to project → `updateThought(id, { projectId })`. Re-triage → existing `onRetriage` wiring (already calls `triageThought` + `updateThought`). No new backend endpoints needed.

### Accessibility
- **D-21:** Menu root has `role="menu"`; items have `role="menuitem"`. Arrow Up/Down navigates, Enter activates, Escape closes. Focus returns to the triggering row on close. Submenus open on Right arrow, close on Left arrow. (Keyboard support is a Claude's-discretion polish layer — ship the mouse/touch flow first; keyboard is additive.)

### Claude's Discretion
- Portal target, component file layout (one file or split into `ContextMenu` + `Submenu` + `ToastHost`).
- CSS approach (Tailwind classes inline vs. extracted component class names — match existing codebase convention).
- Whether submenu nesting uses Headless UI's `Menu` primitive, Radix, or a hand-rolled popover. Planner picks based on existing deps.
- Exact timing curves / transitions for menu open/close and toast enter/exit.
- Test strategy (vitest + Testing Library is the existing pattern — continue it).

### Folded Todos

None — `gsd-tools todo match-phase 101` returned zero matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Intent
- `.planning/ROADMAP.md` §"Phase 101: Context Menu" — Goal, Success Criteria, CTX-01..CTX-07 mapping.
- `.planning/REQUIREMENTS.md` §"Context Menu" — CTX-01..CTX-07 acceptance bullets.

### Phase 100 Interlock (load-bearing)
- `.planning/phases/100-edit-refresh-pause/100-CONTEXT.md` §"Edit Lifecycle" D-11, D-12 — where `vigil:edit-started` fires today. The Edit menu item MUST go through this path.
- `.planning/phases/100-edit-refresh-pause/100-01-SUMMARY.md` — final dispatch sites in `ThoughtRow.tsx`.
- `vigil-pwa/src/components/ThoughtRow.tsx` — current `handleContentClick`, `handleSave`, `handleKeyDown`, and unmount cleanup.
- `vigil-pwa/src/hooks/useThoughts.ts` — refresh-pause gate; menu must not break it.

### Existing Patterns to Match
- `vigil-pwa/src/components/BulkActionBar.tsx` — category picker pattern for inline-expand on mobile (D-12 reuses this shape).
- `vigil-pwa/src/components/ThoughtList.tsx` — prop-drilling pattern for `onUpdate`, `onToggleFavorite`, `onRetriage`, `onChat`; the new menu actions plug in the same way.
- `vigil-pwa/src/api/client.ts` — `updateThought`, `bulkDeleteThoughts`, `triageThought`, `GET /v1/projects` (D-20 wiring).
- `vigil-pwa/src/components/ProjectCard.tsx` — `onAssign(thoughtId, projectId)` callsite shape for "Add to project".

### Brand / Visual
- `reference_brand_guidelines.md` (iCloud Drive; user memory reference) — teal #1D9E75 primary; Inter typeface; voice and tone. Menu styling stays inside existing PWA tokens — no new colors.

No external specs or ADRs — the full contract is captured in the decisions above plus the code paths referenced.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ThoughtRow.tsx` edit-mode infrastructure (`isEditing`, `handleContentClick`, `vigil:edit-started` dispatch) — the menu's Edit item reuses this, does not duplicate it.
- `api/client.ts` — every mutation the menu needs already exists. No new backend work.
- `BulkActionBar.tsx` — inline category picker shape transfers directly to mobile submenu (D-12).
- `useProjects` hook — loads projects list the "Add to project" submenu needs.

### Established Patterns
- Callback prop-drilling from page → `ThoughtList` → `ThoughtRow` (not context, not Redux). The five new menu actions follow this.
- Vitest + Testing Library with `fireEvent.contextMenu`, `fireEvent.touchStart/End`, and fake timers (Phase 100 pattern for 500 ms long-press).
- No external UI library currently used for menus/popovers. Check existing deps before introducing Radix/Headless UI (may already be there; planner checks).

### Integration Points
- `ThoughtRow.tsx` — adds `onContextMenu` and touch handlers; mounts the `ContextMenu` component via portal.
- `ThoughtList.tsx` props — extend with `onDelete(id)`, `onMoveToCategory(id, cat)`, `onAssignProject(id, projectId)`. `onRetriage`, `onUpdate` already present.
- `App` (or whichever page hosts `ThoughtList`) — adds `<ToastHost />` at the root, provides `useToast()` context for undo.
- No changes to `useThoughts.ts` internals — mutations already update local state via `updateLocal` / `removeMany`.

</code_context>

<specifics>
## Specific Ideas

- Menu item order is the user's explicit preference: Edit / Re-triage / Move to category / Add to project / Delete (destructive last, visually separated).
- Undo toast matches modern mobile patterns (Gmail, iOS Mail) — no confirm friction.
- Menu is **suppressed while editing** — the user said the Phase 100 refresh-pause must stay clean.
- No new menus/popovers beyond the thoughts list in this phase; the pattern extracts later if a second surface needs it (Phase 100 D-05 convention).

</specifics>

<deferred>
## Deferred Ideas

- Keyboard shortcut to open menu without mouse (e.g., `Shift+F10` on focused row) — note under D-21 for polish later.
- Context menu on work orders, briefs, projects, chat sessions — different phases.
- Multi-select + bulk menu (right-click a selected set) — `BulkActionBar` already covers bulk; don't conflate.
- Toast "history" / notification center — only a single undo toast in this phase.
- Favorite toggle in the menu — already a click target on the row (D-10).
- Rich re-triage preview flow (show AI suggestion, accept/reject) — user opted for silent re-triage.
- Confirm-dialog infrastructure — not needed since delete uses undo toast instead.

</deferred>

---

*Phase: 101-context-menu*
*Context gathered: 2026-04-18*
