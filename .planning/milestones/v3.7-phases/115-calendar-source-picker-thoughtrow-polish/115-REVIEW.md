---
phase: 115-calendar-source-picker-thoughtrow-polish
reviewed: 2026-04-27T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - vigil-core/src/services/calendar-service.ts
  - vigil-core/src/services/calendar-service.test.ts
  - vigil-core/src/routes/calendar.ts
  - vigil-core/src/routes/calendar.test.ts
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/pages/SettingsPage.tsx
  - vigil-pwa/src/pages/SettingsPage.test.tsx
  - vigil-pwa/src/components/ThoughtRow.tsx
  - vigil-pwa/src/components/ThoughtRow.test.tsx
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 115: Code Review Report (Re-Review After 115-04 Gap Closure)

**Reviewed:** 2026-04-27 (re-review)
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found (CR-01 RESOLVED — remaining items are deferred per 115-04 plan)

## Summary

This is a re-review after Plan 115-04 (commit `02d1d47` and `0ebdacc`) shipped to close the original CR-01 finding. The gap closure was tightly scoped to the data-flow plumbing that made first-toggle wipe the user's prior calendar selection.

**CR-01 — VERIFIED RESOLVED.** The fix is correctly implemented end-to-end:

- `vigil-core/src/services/calendar-service.ts:44` — `CalendarListResponse` "ok" variant now carries `selectedCalendarIds: string[]`. `getValidAccessToken` already normalized the row's `calendarSelections` to `string[]` (line 213), so the value flowing into the response is type-safe.
- `vigil-core/src/services/calendar-service.ts:363-399` — `fetchCalendarList` destructures `result.calendarSelections` and returns it on the ok branch.
- `vigil-core/src/routes/calendar.ts:25-29` — unchanged; the route just JSON-forwards the widened response shape.
- `vigil-pwa/src/api/client.ts:797-800` — `CalendarListResult` "ok" variant widened to mirror the server.
- `vigil-pwa/src/pages/SettingsPage.tsx:176-180` — `loadCalendars` ok branch now hydrates BOTH `selectedCalendarIds` state AND `lastSavedSelectionRef.current` from the server response. This closes both halves of the original bug: checkboxes render correctly on mount, AND the rollback target on save failure restores to actual server-known-good state (not `[]`).
- `vigil-pwa/src/pages/SettingsPage.tsx:409-435` — `handleCalendarToggle` is unchanged (correctly so per the plan); now that `previous = selectedCalendarIds` reflects server truth, `next` automatically preserves the rest of a multi-selection.

The two PWA regression tests are the right shape:
- `CR-01-reload-preservation-checked-from-server` (test file lines 589-611) directly asserts `cb.checked === true` on hydration — pins the visible-DOM contract.
- `CR-01-multi-selection-toggle-preserves-others` (lines 613-642) asserts the PUT body is `['cal-a', 'cal-c']` after toggling `cal-b` off from `[a,b,c]` — pins the upstream behavior that was the actual data-loss path.

The two backend tests (`CAL-01-list-includes-selections-nonempty` + `-empty`, calendar-service.test.ts:451-485) cover the new return-shape contract on both populated and empty selection states.

**No new bugs were introduced by 115-04.** The widened discriminated union forced the existing CAL-01-picker-* test fixtures to include `selectedCalendarIds: []`, which the executor handled (test file lines 456, 505, 524, 578) — TypeScript would have caught any miss.

**POLISH-01 (whitespace-pre-line) and the ThoughtRow context-menu changes** are unchanged from the prior review and remain safe.

The remaining warnings (WR-01 through WR-04) and info items (IN-01, IN-02, IN-03, IN-05) are all carried forward from the prior review. They were explicitly out-of-scope for 115-04 (see plan `<objective>` and 115-04-SUMMARY's "Items NOT Addressed" section). They remain applicable. **IN-04 is partially closed** — items (1) and (2) shipped in the gap closure; items (3) unmount-flush and (4) rollback-target-equals-server-state are still missing as test gaps.

The original CR-01 has been dropped from this report. All other findings are restated below for continuity, with severity unchanged.

## Critical Issues

None. CR-01 from the prior review is resolved by 115-04 (commits `0ebdacc` + `02d1d47`).

## Warnings

### WR-01: DB / network errors during `setCalendarSelections` are returned to the PWA as HTTP 400

**File:** `vigil-core/src/routes/calendar.ts:53-57`

**Issue:** The `try/catch` wrapping `service.setCalendarSelections(userId, ids)` maps every thrown error to `400 { error: <message> }`. `setCalendarSelections` in the service throws from two sources: validation (`validateCalendarIds`, intentional → 400) and the underlying Drizzle `db.update(...)` call (real DB / network failure → should be 500). Conflating them means:

- Real outage shows the user a "validation failed" code path with no retry and no telemetry distinction.
- Server-side incident dashboards lose 5xx signal.
- The client wrapper `setCalendarSelections` in `client.ts:818-824` throws on any non-OK status, surfacing the toast "Couldn't save calendar selection — try again", but the user has no way to know whether it's their fault or the server's.

Worse, the error message is forwarded verbatim (`err.message`), which can leak Drizzle / pg internals into a 400 body if a DB exception ever surfaces.

**Status:** Carried forward from prior review — explicitly deferred by 115-04 plan.

**Fix:** Distinguish validation throws from DB throws — either by introducing a typed error class in the service or by validating in the route before the service call:

```typescript
// vigil-core/src/services/calendar-service.ts
export class CalendarSelectionsValidationError extends Error {
  constructor(msg: string) { super(msg); this.name = "CalendarSelectionsValidationError"; }
}
function validateCalendarIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids)) throw new CalendarSelectionsValidationError("selectedCalendarIds must be an array");
  // ...
}

// vigil-core/src/routes/calendar.ts
try {
  await service.setCalendarSelections(userId, ids as string[]);
} catch (err) {
  if (err instanceof CalendarSelectionsValidationError) {
    return c.json({ error: err.message }, 400);
  }
  console.error("[calendar] setCalendarSelections failed", err);
  return c.json({ error: "Internal error" }, 500);
}
```

### WR-02: Debounced PUT is silently dropped on unmount — user sees the optimistic check survive but nothing persists

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:202-209, 421-435`

**Issue:** The cleanup `useEffect` clears `calendarSaveTimerRef` on unmount, which is correct hygiene against setState-after-unmount. But it does **not** flush the pending save. Concrete failure: user toggles a checkbox, then within 400ms navigates away from /settings (e.g., taps a tab). The timer is canceled, no PUT fires, the optimistic UI state lives only in component memory and is lost. On their next Settings visit, the prior server value still loads.

After the 115-04 hydration fix this is now a more visible failure mode: the user sees the previously-saved selection load correctly, toggles a change, navigates away within 400ms, and on return sees their attempted change reverted with no warning. There is no telemetry, no toast.

**Status:** Carried forward — explicitly deferred by 115-04 plan.

**Fix:** On unmount, fire the pending save synchronously instead of dropping it. Capture state via a ref (mirroring the `isEditingRef` pattern at `ThoughtRow.tsx:144-147`) so the cleanup callback reads the latest value without re-running:

```typescript
const selectedRef = useRef<string[]>([])
useEffect(() => { selectedRef.current = selectedCalendarIds }, [selectedCalendarIds])

useEffect(() => {
  return () => {
    if (calendarSaveTimerRef.current !== null) {
      window.clearTimeout(calendarSaveTimerRef.current)
      calendarSaveTimerRef.current = null
      const pending = selectedRef.current
      if (pending !== lastSavedSelectionRef.current) {
        // Fire-and-forget on unmount — no UI to update on failure.
        setCalendarSelections(pending).catch(() => {})
      }
    }
  }
}, [])
```

### WR-03: Rapid-toggle race can ship a stale rollback if an in-flight PUT fails after a newer toggle has fired

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:421-435`

**Issue:** `lastSavedSelectionRef.current = next` updates on success, but if the user toggles again *during* the in-flight `await setCalendarSelections(next)`, the new toggle starts a new debounce timer that races with the resolution of the old PUT. If the old PUT errors after the new toggle has updated `setSelectedCalendarIds` and fired its own (still-pending) timer, the rollback `setSelectedCalendarIds(lastSavedSelectionRef.current)` (line 428) will overwrite the user's newer optimistic selection with a stale value.

Sequence to reproduce:
1. User toggles A (optimistic `[A]`, timer T1 starts).
2. T1 fires, PUT-A in flight.
3. User toggles B (optimistic `[A,B]`, timer T2 starts; T1 still in flight).
4. PUT-A rejects (network blip).
5. catch runs: `setSelectedCalendarIds(lastSavedSelectionRef.current)` overwrites `[A,B]` with the prior server-known-good (now meaningfully populated post-115-04, but still stale relative to the user's current intent).
6. T2 fires PUT-B with the wrong body or — worse — the rollback wins the next render.

A single in-flight tracker (e.g., `saveTokenRef` checking the request id against the current head) prevents the race.

**Status:** Carried forward — explicitly deferred by 115-04 plan. 115-04 did not change this code path, but the rollback target it touches is now more meaningful, so the race-window's user-visible impact has shifted (used to roll back to `[]`, now rolls back to server truth).

**Fix:** Tag each save with a monotonically-increasing token; ignore rollbacks whose token isn't the latest:

```typescript
const saveTokenRef = useRef(0)
// inside the timer:
const myToken = ++saveTokenRef.current
try {
  await setCalendarSelections(next)
  if (saveTokenRef.current === myToken) {
    lastSavedSelectionRef.current = next
  }
} catch {
  if (saveTokenRef.current === myToken) {
    setSelectedCalendarIds(lastSavedSelectionRef.current)
    showToast({ variant: 'error', body: "Couldn't save calendar selection — try again" })
  }
}
```

### WR-04: Route handler accepts `Content-Type: text/plain` — `c.req.json()` happily parses any body

**File:** `vigil-core/src/routes/calendar.ts:44-48`

**Issue:** Hono's `c.req.json()` parses the body regardless of `Content-Type`. There's no enforced `application/json` check. This isn't an injection vector (the body is parsed safely and the content shape is validated in `setCalendarSelections`), but it does mean the endpoint silently accepts CSRF-style form posts (`text/plain` is one of the three CORS-simple types that bypasses preflight). With JWTs in `sessionStorage` this is moot (no automatic credential attach), but it's worth tightening the contract.

**Status:** Carried forward — explicitly deferred by 115-04 plan.

**Fix:** Reject non-JSON content types early, or document explicitly that the endpoint relies on bearer-only auth (no cookies) for CSRF safety:

```typescript
const ct = c.req.header("content-type") ?? "";
if (!ct.toLowerCase().includes("application/json")) {
  return c.json({ error: "Content-Type must be application/json" }, 415);
}
```

Add a route test for the 415 path.

## Info

### IN-01: `fetchCalendarListRaw` swallows non-OK responses silently

**File:** `vigil-core/src/services/calendar-service.ts:219-227`

**Issue:** When `fetchTodaysEvents` falls back to "fetch all calendars" (no selection), `fetchCalendarListRaw` returns `[]` on any non-OK response (`if (!res.ok) return [];`). That collapses 401, 403, 500, and rate-limit responses into "no calendars" — the brief assembly layer then fetches zero events with no signal that anything went wrong. Compare with the same shape in `fetchCalendarList` which distinguishes 401 → `needs_reauth` and other → error.

**Status:** Carried forward — pre-existing pattern, not introduced by Phase 115.

**Fix:** Mirror the discriminator from `fetchCalendarList`:

```typescript
async function fetchCalendarListRaw(accessToken: string): Promise<string[]> {
  const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new Error("needs_reauth");
  if (!res.ok) throw new Error(`calendarList fetch failed: ${res.status}`);
  const data = (await res.json()) as GCalCalendarListResponse;
  return (data.items ?? []).map((item) => item.id);
}
```

The caller already wraps in try/catch (lines 300-304) and maps to `{ status: "error", ... }`.

### IN-02: Per-calendar normalization uses `calendarId` for both `calendarId` and `calendarName`, sets color to null

**File:** `vigil-core/src/services/calendar-service.ts:336-338`

**Issue:** When iterating selections, `normalizeEvent(raw, calendarId, calendarId, null)` puts the raw ID where the human-readable calendar name should go and discards color entirely. The `CalendarEvent` interface advertises both fields. Downstream UI (or the PDF brief) cannot color-code or show friendly names without an extra round-trip.

**Status:** Carried forward — pre-existing pattern.

Note: now that `fetchCalendarList` returns `selectedCalendarIds` alongside the calendar metadata, an upgrade path is to cache the calendar metadata server-side and reuse it inside `fetchTodaysEvents` — this would also mitigate IN-02 in the same change.

**Fix:** Build a `Map<id, { name, color }>` from a single `calendarList` fetch even when selections are present, then thread name + color into `normalizeEvent`.

### IN-03: Test coverage gaps — unmount-flush and rollback-target verification still missing

**File:** `vigil-pwa/src/pages/SettingsPage.test.tsx:497-642`

**Issue:** 115-04 added two regression tests that close the most critical gaps from the prior IN-04. Two original gap items remain:

1. ~~Set a non-empty `selectedCalendarIds` server response and assert the matching checkbox starts checked.~~ **Closed by `CR-01-reload-preservation-checked-from-server` (line 589).**
2. ~~Toggle one calendar in a multi-selection and assert the PUT body preserves the others.~~ **Closed by `CR-01-multi-selection-toggle-preserves-others` (line 613).**
3. **Still missing:** Toggle then unmount before the debounce fires and assert the save was flushed. (Will fail until WR-02 is fixed — pins the WR-02 fix.)
4. **Still missing:** Test that the rollback path on PUT failure restores the server-side selection (the now-meaningful `lastSavedSelectionRef.current`), not `[]`. After the 115-04 hydration this is structurally correct, but no test asserts it directly.

**Status:** Reduced from prior IN-04 — two of four items closed. Remaining items track the still-deferred WR-02 and the rollback-target invariant.

**Fix:** Add the two remaining tests when WR-02 is addressed.

### IN-05: `signOut` in client.ts dispatches a CustomEvent then immediately navigates — listeners may miss the event in JSDOM tests

**File:** `vigil-pwa/src/api/client.ts:29-32, 81-85`

**Issue:** This is pre-existing (not introduced in Phase 115), but worth flagging: `signOut()` dispatches `vigil:signout` and the surrounding code in `vigilFetch` then sets `window.location.href`. In test environments (JSDOM) `window.location.href = ...` is a no-op, but in production it triggers an immediate teardown. Any async listener on `vigil:signout` that returns a Promise will not get awaited. The current usages (App.tsx isAuthenticated flip) are synchronous so this is fine today. Flag for the next time someone wants to add cleanup work to that listener.

**Status:** Carried forward — pre-existing.

**Fix:** No code change required. If async work is ever needed, switch to a `beforeunload`-style synchronous coordination or do the work inside `signOut` before dispatching.

---

## CR-01 Resolution Verification (Detail)

The 115-04 fix was reviewed against the original CR-01 invariants:

| Invariant | How verified | Result |
|-----------|-------------|--------|
| GET /v1/calendar/list ok response carries selectedCalendarIds | `calendar-service.ts:44` (type), `:399` (return), test `CAL-01-list-includes-selections-nonempty` (calendar-service.test.ts:451) | PASS |
| PWA discriminated union exposes selectedCalendarIds on ok | `client.ts:798` | PASS |
| loadCalendars seeds selectedCalendarIds state from server | `SettingsPage.tsx:178` (`setSelectedCalendarIds(result.selectedCalendarIds)`) | PASS |
| loadCalendars seeds lastSavedSelectionRef.current from server | `SettingsPage.tsx:179` | PASS — closes the rollback-target half of the original bug |
| Checkboxes render checked from server selection on first paint | Test `CR-01-reload-preservation-checked-from-server` (SettingsPage.test.tsx:589) | PASS |
| Toggling one calendar in a multi-selection PUTs the full updated array | Test `CR-01-multi-selection-toggle-preserves-others` (SettingsPage.test.tsx:613) | PASS |
| Empty/null calendarSelections still falls back to all calendars in fetchTodaysEvents (D-11 preservation) | `calendar-service.ts:299-305` unchanged | PASS |
| MAX_CALENDAR_SELECTIONS = 1000 cap unchanged | `calendar-service.ts:253` | PASS |
| Route handler unchanged | `routes/calendar.ts` diff = no changes | PASS |

No regressions introduced. CR-01 is structurally closed.

---

_Reviewed: 2026-04-27 (re-review after 115-04)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
