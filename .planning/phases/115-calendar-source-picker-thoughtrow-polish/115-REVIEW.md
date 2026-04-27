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
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 115: Code Review Report

**Reviewed:** 2026-04-27
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 115 ships two changes:

1. **CAL-01** — `PUT /v1/calendar/selections` endpoint plus a Settings-page picker UI to choose which Google calendars feed the daily brief.
2. **POLISH-01** — `whitespace-pre-line` class on the `ThoughtRow` display `<p>` so multi-line content renders with line breaks.

The server-side picker endpoint is well-built. Auth scoping is correct (userId comes from `c.get("userId")` set by the global bearerAuth dispatcher in `vigil-core/src/index.ts:135`, not from the request body — the T-115-01-04 cross-tenant write threat is mitigated). Validation (array shape, string elements, 1000 cap) is single-sourced in `validateCalendarIds` in the service layer; the route maps thrown errors to 400 cleanly. Drizzle parameterizes the `UPDATE`, so SQL injection via calendar-id strings is not reachable.

POLISH-01 is safe. `whitespace-pre-line` is a CSS class; `thought.content` still flows through React's text-node escaping in `{thought.content}`. There is no `dangerouslySetInnerHTML` and no innerHTML write — XSS posture is unchanged.

The critical finding is in the **PWA picker state initialization**, not the server. `selectedCalendarIds` is hard-coded to `[]` on every Settings mount and is never re-hydrated from the server. Combined with the wholesale-overwrite semantics of `PUT /v1/calendar/selections`, the user's first checkbox toggle in any Settings session silently destroys their previously-saved selection. This is a data-loss bug that ships every render.

The remaining warnings cover error-classification (DB failures producing 400), state coupling (rollback target stuck at `[]` for the same reason as the critical), and a small async-flow issue with the in-flight save loss on unmount.

## Critical Issues

### CR-01: PWA never hydrates `selectedCalendarIds` from server — first toggle wipes user's saved calendar selection

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:104-107, 407-433`

**Issue:** `selectedCalendarIds` is initialized to `[]` and only ever mutated by `handleCalendarToggle`. `loadCalendars()` (lines 171-192) populates `calendarList` from `GET /v1/calendar/list` but that endpoint returns only `{id, name, color, primary}` per calendar — no `selected` flag and no parallel "current selection" payload. There is also no separate `GET /v1/calendar/selections` route. So:

1. User opens Settings. All checkboxes render unchecked, regardless of prior saves (`selectedCalendarIds.includes(cal.id)` always false at line 742).
2. User toggles one checkbox. `previous = []`, `next = [clickedId]`, optimistic state becomes `[clickedId]`.
3. After 400ms, `setCalendarSelections([clickedId])` PUTs to the server, which **wholesale overwrites** `oauth_tokens.calendarSelections` per the route doc ("overwrite the calling user's calendar_selections wholesale", `vigil-core/src/routes/calendar.ts:31-34`) and the service body (`calendar-service.ts:275-278`).
4. The user's prior (possibly long, hand-curated) selection is now gone.

The empty-helper copy at line 768 ("No calendars selected — brief includes all of them") will also lie on first paint for users who had a non-empty saved selection.

`lastSavedSelectionRef.current` (line 106) starts at `[]` too — so the rollback path on save failure (line 426) restores `[]`, never the user's actual prior server state. The data-loss happens whether or not the PUT succeeds.

This bug is reachable on every Settings mount for any user who previously connected Google + had calendarSelections set (e.g., via the SchedulerFanOut path that sets selections during connect, or via a prior PUT). It will manifest on the very first session this picker ships to production.

The route + service unit tests (CAL-01-set-*, CAL-01-put-*) all pass because they only exercise the write path with explicit input arrays. No test renders the picker against a non-empty server-side selection state, so the bug slips past the suite (see also IN-04).

**Fix:** Either (a) extend `GET /v1/calendar/list` to include the user's current selection, or (b) add a dedicated read endpoint. Option (a) is the smaller diff:

```typescript
// vigil-core/src/services/calendar-service.ts — fetchCalendarList return shape
export type CalendarListResponse =
  | { status: "ok"; calendars: CalendarInfo[]; selectedCalendarIds: string[] }
  | { status: "needs_reauth" }
  | { status: "error"; error: string };

// inside fetchCalendarList, after getValidAccessToken:
const { token, calendarSelections } = result;
// ... existing fetch ...
return { status: "ok", calendars, selectedCalendarIds: calendarSelections };
```

```typescript
// vigil-pwa/src/pages/SettingsPage.tsx — loadCalendars()
if (result.status === 'ok') {
  setCalendarList(result.calendars)
  setSelectedCalendarIds(result.selectedCalendarIds)
  lastSavedSelectionRef.current = result.selectedCalendarIds
  setCalendarListStatus('ok')
}
```

Add a regression test that renders the picker with a non-empty server selection and asserts the corresponding checkboxes start checked, plus a test that toggling one calendar does not erase the others from the PUT body.

## Warnings

### WR-01: DB / network errors during `setCalendarSelections` are returned to the PWA as HTTP 400

**File:** `vigil-core/src/routes/calendar.ts:53-57`

**Issue:** The `try/catch` wrapping `service.setCalendarSelections(userId, ids)` maps every thrown error to `400 { error: <message> }`. `setCalendarSelections` in the service throws from two sources: validation (`validateCalendarIds`, intentional → 400) and the underlying Drizzle `db.update(...)` call (real DB / network failure → should be 500). Conflating them means:

- Real outage shows the user a "validation failed" code path with no retry and no telemetry distinction.
- Server-side incident dashboards lose 5xx signal.
- The client wrapper `setCalendarSelections` in `client.ts:818-824` throws on any non-OK status, surfacing the toast "Couldn't save calendar selection — try again", but the user has no way to know whether it's their fault or the server's.

Worse, the error message is forwarded verbatim (`err.message`), which can leak Drizzle / pg internals into a 400 body if a DB exception ever surfaces.

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

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:200-207, 419-432`

**Issue:** The cleanup `useEffect` clears `calendarSaveTimerRef` on unmount, which is correct hygiene against setState-after-unmount. But it does **not** flush the pending save. Concrete failure: user toggles a checkbox, then within 400ms navigates away from /settings (e.g., taps a tab). The timer is canceled, no PUT fires, the optimistic UI state lives only in component memory and is lost. On their next Settings visit, the prior server value still loads (which itself is `[]` on first toggle — see CR-01 — but even after CR-01 is fixed this remains).

There is no telemetry, no toast, no warning. The user thinks the change saved.

**Fix:** On unmount, fire the pending save synchronously instead of dropping it. The simplest fix is to pull the latest pending value out of state and PUT it immediately in the cleanup, accepting that errors here cannot be surfaced (the component is gone):

```typescript
useEffect(() => {
  return () => {
    if (calendarSaveTimerRef.current !== null) {
      window.clearTimeout(calendarSaveTimerRef.current)
      calendarSaveTimerRef.current = null
      // Flush pending save — fire-and-forget on unmount
      const pending = selectedCalendarIds
      if (pending !== lastSavedSelectionRef.current) {
        setCalendarSelections(pending).catch(() => {/* unmounted — no UI to update */})
      }
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

Note the empty deps + `selectedCalendarIds` read from closure is wrong — capture via ref instead. A `selectedCalendarIdsRef` synced in a separate effect mirrors the existing `isEditingRef` pattern in `ThoughtRow.tsx:144-147`.

### WR-03: Race: rapid toggles within 400ms can still ship a stale write if the new debounce fires after a successful one resolves

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:419-432`

**Issue:** `lastSavedSelectionRef.current = next` updates on success, but if the user toggles again *during* the in-flight `await setCalendarSelections(next)`, the new toggle starts a new debounce timer that races with the resolution of the old PUT. If the old PUT errors after the new toggle has updated `setSelectedCalendarIds` and fired its own (still-pending) timer, the rollback `setSelectedCalendarIds(lastSavedSelectionRef.current)` (line 426) will overwrite the user's newer optimistic selection with a stale value.

Sequence to reproduce:
1. User toggles A (optimistic `[A]`, timer T1 starts).
2. T1 fires, PUT-A in flight.
3. User toggles B (optimistic `[A,B]`, timer T2 starts; T1 still in flight).
4. PUT-A rejects (network blip).
5. catch runs: `setSelectedCalendarIds(lastSavedSelectionRef.current)` → `setSelectedCalendarIds([])` (stale).
6. T2 fires PUT-B with the wrong body or — worse — an empty rollback wins the next render.

This is a classic optimistic-update ordering bug. A single in-flight tracker (e.g., `isSavingRef` plus a stale-result guard checking the request id against the current head) prevents the race.

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

**Fix:** Fetch `calendarList` once even when selections are present (cache it in-memory for the single call) so each event can be tagged with name + color. Or thread the lookup through a `Map<id, { name, color }>` built from `fetchCalendarListRaw` extended to return full info.

### IN-03: `useEffect` cleanup for `calendarSaveTimerRef` has empty deps and a stale-closure pitfall

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:200-207`

**Issue:** This effect only runs cleanup on unmount. As written it works correctly because it doesn't read any state (just clears the timer). But the comment claims it mirrors the Phase 110 WR-02 pattern, and the pattern there reads stale state via refs intentionally. If WR-02 above is fixed, this effect needs a `selectedCalendarIdsRef` to flush correctly. Flag now so the next-touch doesn't introduce a stale-closure read.

**Fix:** When implementing the WR-02 flush, mirror the `isEditingRef` ref-sync pattern used in `ThoughtRow.tsx:144-147`.

### IN-04: Test coverage gaps — no test asserts the picker reflects existing server selections, and no test exercises rapid-toggle race

**File:** `vigil-pwa/src/pages/SettingsPage.test.tsx:497-583`

**Issue:** Existing tests cover render, toggle-saves-PUT, needs_reauth-hides, error-retry, and empty-helper. None of them:

1. Set a non-empty `selectedCalendarIds` server response and assert the matching checkbox starts checked. (This gap is what let CR-01 ship.)
2. Toggle two calendars within the debounce window and assert the PUT body contains both, not just the latest.
3. Toggle then unmount before the debounce fires and assert the save was flushed (will fail until WR-02 is fixed).
4. Test that the rollback path restores the server-side selection, not `[]`.

**Fix:** Add the four tests above. The first two are forcing-functions for CR-01 and WR-03; (3) and (4) pin the WR-02 fix.

### IN-05: `signOut` in client.ts dispatches a CustomEvent then immediately navigates — listeners may miss the event in JSDOM tests

**File:** `vigil-pwa/src/api/client.ts:29-32, 81-85`

**Issue:** This is pre-existing (not introduced in Phase 115), but worth flagging: `signOut()` dispatches `vigil:signout` and the surrounding code in `vigilFetch` then sets `window.location.href`. In test environments (JSDOM) `window.location.href = ...` is a no-op, but in production it triggers an immediate teardown. Any async listener on `vigil:signout` that returns a Promise will not get awaited. The current usages (App.tsx isAuthenticated flip) are synchronous so this is fine today. Flag for the next time someone wants to add cleanup work to that listener.

**Fix:** No code change required. If async work is ever needed, switch to a `beforeunload`-style synchronous coordination or do the work inside `signOut` before dispatching.

---

_Reviewed: 2026-04-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
