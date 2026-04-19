# Phase 100: Edit-Refresh Pause - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 100-edit-refresh-pause
**Areas discussed:** Pause mechanism, Scope, Resume + long-edit, Thought-created events

---

## Pause Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Event bus (Recommended) | ThoughtRow fires window events `vigil:edit-started` / `vigil:edit-ended` with a refcount id. useThoughts listens and gates the poll. Matches existing `vigil:thought-created` pattern. ~15-line change across 2 files. | ✓ |
| Focus-based | Read `document.activeElement` in the poll callback; skip if focus is on a textarea/input inside a ThoughtRow. Zero coordination, but broad — would also pause during search box typing, filter dropdowns, etc. | |
| Shared EditContext | React context provider tracks active-edits set. Hook reads it via useContext. Cleanest isolation but adds a new provider in the tree. Overkill for one feature. | |

**User's choice:** Event bus
**Notes:** Mirrors the existing `vigil:thought-created` pattern already used in `useThoughts.ts:84`. Lowest-complexity, no new abstractions.

---

## Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Just useThoughts (Recommended) | Narrow fix matching EDIT-01 exactly. Other hooks don't currently have an edit surface. | ✓ |
| All polling hooks | Generic `usePausablePoll` helper adopted by every hook. Future-proof but larger change (~4-5 files) and speculative. | |
| Reusable helper, adopt only in useThoughts | Extract helper now, adopt only in useThoughts. Phase 101+ adopts it elsewhere if needed. Middle ground. | |

**User's choice:** Just useThoughts
**Notes:** Ship the narrow fix. Extract a reusable helper only when a second hook has a concrete collision (possibly Phase 101 context menu).

---

## Resume

| Option | Description | Selected |
|--------|-------------|----------|
| Fire once on resume, then reset 30s timer (Recommended) | User gets fresh list as soon as edit dismissed. Timer resets so next tick is 30s from that moment. Matches user intuition. | ✓ |
| Resume on natural schedule | No immediate catch-up. Next fire whenever the original 30s interval would have fired. User may see stale list for up to 30s after saving. | |
| Reset timer, no catch-up fire | Cancel pending fire, restart 30s timer. No fetch until 30s elapses. Conservative but unnecessary. | |

**User's choice:** Fire once on resume, then reset 30s timer
**Notes:** "I'm done editing, show me what's new" is the correct intuition.

---

## Created Event During Edit

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — pause all auto-refresh triggers (Recommended) | While editing, NO refetch fires regardless of source. Consistent behavior. Newly captured thoughts appear when edit finishes. | ✓ |
| No — only pause the 30s poll | The 30s poll pauses, but `vigil:thought-created` still triggers refetch. Risk: that refetch still replaces the array and collides with the edit. | |
| Queue: remember pending refetch, fire on edit end | Other triggers during edit set a 'refetch pending' flag. When edit ends, fire once. Same user-visible outcome as option 1 in most cases. | |

**User's choice:** Yes — pause all auto-refresh triggers
**Notes:** Consistency wins. The catch-up fire on resume covers anything missed.

---

## Long-Edit Protection (Success Criterion 3)

Not a separate question — answered by the mechanism + scope decisions above. The ref-counted event-bus pause gates refreshes for any duration, and the `draft` state lives in ThoughtRow local state, so it survives re-renders as long as the component stays mounted. With the pause in place, the thoughts array isn't replaced, so ThoughtRow keys stay stable and the component stays mounted.

---

## Claude's Discretion

- Exact event names (`vigil:edit-started` / `vigil:edit-ended` is the strong recommendation).
- `useRef` vs `useState` for the active-edits Set inside `useThoughts`.
- Test strategy (recommend `vi.useFakeTimers()` + `window.dispatchEvent` on the hook).

## Deferred Ideas

- Reusable `usePausablePoll` helper (extract when a second hook needs it)
- Optimistic merge strategy ("pin editing row, update the rest")
- Visual paused indicator in UI
- Telemetry on pause frequency
- Debounce edit events
- Pause other polling hooks (workorders, briefs, projects, google, timezone)
