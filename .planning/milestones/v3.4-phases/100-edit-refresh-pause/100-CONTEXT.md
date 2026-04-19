# Phase 100: Edit-Refresh Pause - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Stop the 30s auto-refresh poll in `useThoughts` from replacing the thoughts array while a user is inline-editing a thought in `ThoughtRow`. When the edit ends (save, cancel, or blur), resume polling on a fresh cadence.

**Root cause:** `useThoughts` (vigil-pwa/src/hooks/useThoughts.ts:78-91) runs three refresh triggers — `setInterval(refetch, 30_000)`, `visibilitychange → refetch`, and `vigil:thought-created → refetch` — that all call `setThoughts(res.data)`, a full array replace. `ThoughtRow` (vigil-pwa/src/components/ThoughtRow.tsx) holds its edit state (`isEditing`, `draft`) locally. The hook and the row don't know about each other, so any refresh mid-edit is a user-visible collision (lost focus, surprise re-renders, stale drafts if the user typed past a tick).

**Success criteria (from ROADMAP):**
1. When a user clicks into a thought to edit it, the 30s auto-refresh does not fire while the input is active
2. After the user saves or dismisses the edit, the auto-refresh resumes on its normal schedule
3. A user who types for more than 30 seconds without saving does not lose their draft

**Out of scope (for this phase):**
- Other polling hooks (`useWorkOrders`, `useBriefs`, `useProjects`, `useGoogleStatus`, `useTimezone`) — no concrete collision reported yet; adopt the same pattern only if needed
- Optimistic merge strategies (e.g., "keep editing row pinned, update the rest") — over-engineered for the current collision; pure pause is sufficient
- Visual "paused" indicator in the UI — deferred unless UAT surfaces confusion
- Debouncing the edit event itself — not needed; emit/listen is cheap
- Telemetry / analytics on pause frequency — not needed at current scale

</domain>

<decisions>
## Implementation Decisions

### Pause Mechanism
- **D-01:** Coordination uses a **window event bus** with ref-counted start/end events. `ThoughtRow` dispatches `vigil:edit-started` on entering edit mode and `vigil:edit-ended` on exit (save, cancel, or blur). `useThoughts` listens on `window`, keeps a refcount of active edits in a `useRef`, and gates all refresh triggers on `refcount === 0`. This matches the existing `vigil:thought-created` pattern in the same hook.
- **D-02:** Both events carry an `{ id }` detail so concurrent/duplicate starts don't double-count. `useThoughts` tracks `Set<number>` of active edit ids and gates on `set.size > 0`. (Using a Set rather than a plain counter protects against a stray `edit-ended` without a matching `edit-started`.)
- **D-03:** Events are dispatched on `window` (not `document`) to match the existing `vigil:thought-created` convention in `useThoughts.ts:84`.

### Scope
- **D-04:** The pause applies **only to `useThoughts`** in this phase. Other polling hooks (`useWorkOrders`, `useBriefs`, `useProjects`, `useGoogleStatus`, `useTimezone`) are left untouched. EDIT-01 is a thoughts-specific requirement; nothing else has a reported collision.
- **D-05:** No new reusable helper (e.g., `usePausablePoll`) is extracted in this phase. If a second hook needs the same pattern later, extract then — not speculatively now.

### Refresh Trigger Gating
- **D-06:** All three refresh triggers in `useThoughts` pause during an active edit: the 30s `setInterval`, the `visibilitychange → refetch` handler, and the `vigil:thought-created → refetch` handler. Consistent behavior across sources; the user's draft is protected no matter what fired.
- **D-07:** No "queued refetch on edit end" logic for suppressed triggers. The single catch-up fetch on resume (D-08) is sufficient — it returns fresh data regardless of what was missed.

### Resume Behavior
- **D-08:** When the last active edit ends (refcount drops to 0), fire **one immediate `refetch()`** and **reset the 30s interval** so the next automatic tick is 30s from that moment. The user sees fresh data the moment they dismiss the editor; the next scheduled poll doesn't fire at a short interval.
- **D-09:** Implementation detail (not a binding decision, planner discretion): the cleanest way is to `clearInterval` the existing poll when pausing, and on resume call `refetch()` + `setInterval(refetch, 30_000)`. Alternative is a single always-on interval that checks the flag before calling refetch, with an explicit "fire now" on resume — either is fine.

### Long-Edit Protection (Success Criterion 3)
- **D-10:** No separate mechanism needed. The ref-counted pause gates all refreshes for the full duration of the edit, regardless of whether it lasts 30 seconds or 30 minutes. The `draft` state lives in `ThoughtRow`'s local `useState`, so it survives re-renders as long as the component doesn't unmount. With the pause in place, the thoughts array isn't replaced, so ThoughtRow keys stay stable and the component stays mounted.

### Edit Lifecycle (what fires the events)
- **D-11:** `ThoughtRow` fires `vigil:edit-started` inside the existing `handleContentClick` (after `setIsEditing(true)`). Fires `vigil:edit-ended` in three paths: `handleSave` (finally block, after `setIsEditing(false)`), `handleKeyDown` Esc branch, and the `onBlur={handleSave}` path (already covered by the `handleSave` finally block).
- **D-12:** Tab close / navigation away while mid-edit does NOT need a guard. React unmounts the `ThoughtRow`, cleanup effect fires `edit-ended` (add a `useEffect` return that dispatches end if `isEditing` was true). This prevents a stale refcount if the user reloads mid-edit.

### Claude's Discretion
- Exact event names — `vigil:edit-started` / `vigil:edit-ended` is the strong recommendation, but planner may adjust if a better convention exists.
- Whether the active-edits Set lives in a `useRef` or `useState` inside `useThoughts` — both work; `useRef` avoids an extra render on every start/end.
- Test strategy — recommend a focused test on `useThoughts` using `vi.useFakeTimers()` + `window.dispatchEvent` to verify gating behavior. Don't over-test ThoughtRow UI.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend (vigil-pwa)
- `vigil-pwa/src/hooks/useThoughts.ts` — the hook under surgery; existing 30s poll at line 85, `vigil:thought-created` handler at line 84, `visibilitychange` handler at lines 79-83
- `vigil-pwa/src/components/ThoughtRow.tsx` — emits the edit-start / edit-end events; edit state at lines 56-60, `handleContentClick` at line 84, `handleSave` at line 89, `handleKeyDown` (Esc path) at line 114, unmount cleanup to add in the existing `useEffect` at lines 63-67

### Project-level
- `.planning/REQUIREMENTS.md` §PWA Editing — EDIT-01 acceptance criterion
- `.planning/ROADMAP.md` Phase 100 — 3 success criteria (input active = no poll; resume on normal schedule; >30s typing doesn't lose draft)

No external specs/ADRs — the collision is fully scoped within vigil-pwa and the decisions above capture every constraint.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Window event pattern** — `useThoughts.ts:84` already uses `window.addEventListener('vigil:thought-created', handleCreated)`. New events mirror this exactly.
- **ThoughtRow edit state** — already fully local (`isEditing`, `draft`, `isSaving`). Only needs event emission wired in; no refactor of save/cancel logic.
- **`refetch` callback** — `useThoughts.ts:73-75` already increments a `fetchTick` to retrigger the data-fetch effect. Catch-up fire on resume just calls this.

### Established Patterns
- **Window events for cross-component coordination** — existing precedent (`vigil:thought-created`) is exactly the right abstraction for this problem; no context providers or zustand stores needed.
- **Hook cleanup via useEffect return** — `useThoughts.ts:86-90` already cleans up listeners and intervals. New pause-gate cleanup slots into the same effect.

### Integration Points
- `useThoughts` useEffect (lines 78-91) — mutation point: replace the current interval + event wiring with an edit-aware version that maintains a refcount and gates on it.
- `ThoughtRow` `handleContentClick` / `handleSave` / `handleKeyDown` (Esc) — mutation points: add `window.dispatchEvent` calls for start / end.
- `ThoughtRow` existing `useEffect` at lines 63-67 — mutation point: extend the cleanup return so an unmount during `isEditing` fires `edit-ended`.

### Caveats
- **Keep the `id` detail in events** to make the refcount robust. A `<Set<number>>` protects against a stray end without a matching start (clobbering refcount logic).
- **Do not dispatch from inside React state setters** — dispatch in the click/keyboard handler after the `setIsEditing(true/false)` call, but not inside a setter callback.
- **Don't pause on focus of the search box or filter inputs** — the event-bus approach naturally avoids this because only ThoughtRow edit mode fires the events. Focus-based detection was explicitly rejected (would over-pause).

</code_context>

<specifics>
## Specific Ideas

- Event names: `vigil:edit-started` and `vigil:edit-ended` (consistent with `vigil:thought-created` kebab-case convention).
- Catch-up fire on resume should feel like "I just clicked out of editing, show me what's new" — the user should see the list re-sync within ~300ms of dismiss.
- No visual "paused" indicator in the UI. The user is looking at the textarea they just clicked into; polling is invisible to them anyway. Add a cue only if UAT surfaces confusion.

</specifics>

<deferred>
## Deferred Ideas

- **Reusable `usePausablePoll` helper** — extract only when a second polling hook has a reported collision. Phase 101 (Context Menu) may want a similar pause while the menu is open, at which point extraction becomes justified.
- **Optimistic merge strategy** — "pin the editing row, update the rest" would be more sophisticated but isn't necessary. Pure pause is sufficient for EDIT-01.
- **Visual paused indicator** — a subtle "•" or dot in the corner while polling is paused. Deferred pending UAT.
- **Telemetry on pause frequency / duration** — no concrete use case. Add only if the pause ever becomes suspect.
- **Debounce edit events** — not needed. Dispatching once on start and once on end is cheap.
- **Pause other polling hooks** — `useWorkOrders`, `useBriefs`, etc. No reported collision; adopt the pattern only when a concrete bug surfaces.

</deferred>

---

*Phase: 100-edit-refresh-pause*
*Context gathered: 2026-04-18*
