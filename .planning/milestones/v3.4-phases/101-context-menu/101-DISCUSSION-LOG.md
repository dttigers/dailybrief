# Phase 101: Context Menu - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 101-context-menu
**Areas discussed:** Open triggers & edit-mode coexistence, Menu layout & positioning, Secondary pickers (category, project), Destructive action UX (delete, re-triage)

---

## Open Triggers & Edit-Mode Coexistence

Presented as Area 1 in gray-area selection. User accepted all recommendations ("good with your recommendations").

| Dimension | Options Presented | Selected |
|-----------|------------------|----------|
| Desktop trigger | `onContextMenu` (right-click) / keyboard shortcut / both | Right-click only (recommended) ✓ |
| Mobile trigger | Long-press 500 ms, 10 px tolerance, scroll cancels / tap-and-hold with no timer / dedicated gesture icon | Long-press 500 ms + 10 px + scroll cancels (recommended) ✓ |
| While editing | Suppress menu / show reduced menu / show full menu | Suppress entirely (recommended) ✓ |

**User's choice:** Recommendations accepted for all three.
**Notes:** Edit-mode suppression preserves the Phase 100 refresh-pause invariant — menu-triggered entry into edit would otherwise introduce asymmetric `vigil:edit-started`/`vigil:edit-ended` dispatches.

---

## Menu Layout & Positioning

Presented as Area 2 in gray-area selection.

| Dimension | Options Presented | Selected |
|-----------|------------------|----------|
| Container | Floating popover (portal) / row-anchored dropdown / bottom sheet on mobile | Floating popover, portal-mounted (recommended) ✓ |
| Desktop anchor | Pointer position / row bottom-left / row right edge | Pointer position (recommended) ✓ |
| Mobile anchor | Row bottom-left / viewport bottom sheet / center of screen | Row bottom-left with flip-on-overflow (recommended) ✓ |
| Close triggers | Outside click + Escape / plus scroll/resize / plus focus loss | Outside click + Escape + scroll + resize (recommended) ✓ |
| Focus trap | Yes / No | No — 5 items, outside-click closes (recommended) ✓ |

**User's choice:** Recommendations accepted.

---

## Secondary Pickers (Move to Category, Add to Project)

Presented as Area 3 in gray-area selection.

| Dimension | Options Presented | Selected |
|-----------|------------------|----------|
| Desktop | Nested submenu (hover to open) / inline-expand / separate dialog | Nested submenu right of parent (recommended) ✓ |
| Mobile | Inline-expand (replace menu contents) / bottom sheet / full-screen modal | Inline-expand with back affordance (recommended, matches `BulkActionBar.tsx:51`) ✓ |
| Sort | Alphabetical / usage-frequency / user-defined order | Alphabetical (recommended) ✓ |
| Current selection | Hidden / marked but selectable / marked and disabled | Marked but selectable (no-op at API) (recommended) ✓ |

**User's choice:** Recommendations accepted.

---

## Destructive Action UX (Delete, Re-triage)

Presented as Area 4 in gray-area selection.

| Dimension | Options Presented | Selected |
|-----------|------------------|----------|
| Delete confirm | `window.confirm` dialog / inline two-step "click-twice" / immediate with 5 s undo toast / both confirm + toast | Immediate + 5 s undo toast (recommended, matches Gmail/iOS Mail) ✓ |
| Undo scope | Restore locally + POST server / local-only with toast / server-round-trip before toast shows | Optimistic local restore + POST (recommended) ✓ |
| Re-triage | Silent (reuses `onRetriage`) / preview AI suggestion with accept-reject / confirm then apply | Silent (recommended) ✓ |

**User's choice:** Recommendations accepted.
**Scope implication flagged:** No toast infrastructure exists in the PWA — Phase 101 builds a minimal `ToastHost` + `useToast()` alongside the menu. Captured in CONTEXT.md D-17.

---

## Claude's Discretion

- Portal target, component file layout, CSS approach.
- Use of Radix / Headless UI / hand-rolled popover (planner checks existing deps).
- Transition timings.
- Keyboard navigation polish (D-21 — arrow keys, Enter, Escape, Shift+F10) listed as additive to the mouse/touch flow.

## Deferred Ideas

- Keyboard shortcut to open menu (`Shift+F10`) — additive.
- Context menu on other row types (work orders, briefs, projects, chat).
- Bulk right-click menu — `BulkActionBar` already covers bulk.
- Toast history / notification center.
- Favorite toggle inside the menu — already a row click target.
- Re-triage preview (accept/reject AI suggestion).
- Confirm-dialog infrastructure — undo toast replaces this.
