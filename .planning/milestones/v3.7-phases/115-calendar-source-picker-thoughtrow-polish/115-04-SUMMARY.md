---
phase: 115
plan: 04
subsystem: calendar-picker
tags:
  - pwa
  - settings
  - calendar
  - gap-closure
  - bug-fix
dependency_graph:
  requires:
    - 115-01  # calendar selections write endpoint (PUT /v1/calendar/selections)
    - 115-02  # SettingsPage calendar picker UI + CAL-01 picker tests baseline
  provides:
    - CR-01 gap closure: reload preserves calendar selection (SC#2 VERIFIED)
    - selectedCalendarIds in GET /v1/calendar/list ok response
    - loadCalendars hydrates selectedCalendarIds state + lastSavedSelectionRef from server
  affects:
    - vigil-core/src/services/calendar-service.ts
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/pages/SettingsPage.tsx
tech_stack:
  added: []
  patterns:
    - Discriminated-union widening: add field to existing 'ok' branch (server + client)
    - Seed optimistic state AND rollback ref from server response on mount
key_files:
  created: []
  modified:
    - vigil-core/src/services/calendar-service.ts
    - vigil-core/src/services/calendar-service.test.ts
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/pages/SettingsPage.tsx
    - vigil-pwa/src/pages/SettingsPage.test.tsx
decisions:
  - Extend GET /v1/calendar/list response shape (not a new endpoint) — smallest-diff fix per 115-REVIEW.md CR-01
  - Seed lastSavedSelectionRef.current from server response alongside selectedCalendarIds state — ties rollback target to server truth
metrics:
  duration: "~15 minutes"
  completed: "2026-04-28"
  tasks_completed: 2
  files_modified: 5
---

# Phase 115 Plan 04: CR-01 Gap Closure — Reload Preservation SUMMARY

One-liner: Extended GET /v1/calendar/list response with `selectedCalendarIds: string[]` sourced from `oauth_tokens.calendarSelections` and seeded both PWA state and rollback ref from server on mount — making SC#2 ("reload preserves the choice") structurally true.

## What Was Built

### CalendarListResponse type widening (vigil-core)

`vigil-core/src/services/calendar-service.ts` — `CalendarListResponse` "ok" variant extended:

```typescript
// Before
| { status: "ok"; calendars: CalendarInfo[] }

// After
| { status: "ok"; calendars: CalendarInfo[]; selectedCalendarIds: string[] }
```

`fetchCalendarList` now captures `calendarSelections` from `getValidAccessToken` (which already normalized it to `string[]`) and includes it in the return:

```typescript
let calendarSelections: string[];
const result = await getValidAccessToken(userId);
accessToken = result.token;
calendarSelections = result.calendarSelections;  // ← new
// ...
return { status: "ok", calendars, selectedCalendarIds: calendarSelections };  // ← new field
```

No change to `routes/calendar.ts` — it JSON-forwards the response, so the new field flows through automatically. No change to `fetchTodaysEvents` or `setCalendarSelections`. D-11 fallback (empty selection → all calendars in brief) preserved at line 299.

### CalendarListResult type widening (vigil-pwa)

`vigil-pwa/src/api/client.ts` — `CalendarListResult` "ok" variant extended:

```typescript
// Before
| { status: 'ok'; calendars: CalendarInfo[] }

// After
| { status: 'ok'; calendars: CalendarInfo[]; selectedCalendarIds: string[] }
```

`getCalendarList()` body unchanged — it forwards the JSON from the server, so the new field is automatically available to callers.

### loadCalendars hydration fix (vigil-pwa)

`vigil-pwa/src/pages/SettingsPage.tsx` — `loadCalendars` ok branch now seeds both state and rollback ref:

```typescript
// Before
if (result.status === 'ok') {
  setCalendarList(result.calendars)
  setCalendarListStatus('ok')
}

// After
if (result.status === 'ok') {
  setCalendarList(result.calendars)
  setSelectedCalendarIds(result.selectedCalendarIds)       // ← new: hydrates checkboxes
  lastSavedSelectionRef.current = result.selectedCalendarIds  // ← new: ties rollback to server truth
  setCalendarListStatus('ok')
}
```

This two-line addition closes both aspects of the CR-01 bug:
1. `selectedCalendarIds` state starts at the actual server selection → checkboxes render CHECKED correctly on mount
2. `lastSavedSelectionRef.current` starts at server selection → PUT failure rolls back to actual server-known-good state (not `[]`)

`handleCalendarToggle` required zero changes — once `previous = selectedCalendarIds` is the real server selection, `next = previous +/- toggledId` preserves the rest of the multi-selection automatically.

## New Tests

### Backend (vigil-core/src/services/calendar-service.test.ts)

- **CAL-01-list-includes-selections-nonempty**: `fetchCalendarList` returns `selectedCalendarIds: ["primary@gmail.com", "work@company.com"]` when the DB row has that selection. Asserts: `result.selectedCalendarIds` deep-equals the stored array; `result.calendars.length === 2` (regression sanity).
- **CAL-01-list-includes-selections-empty**: `fetchCalendarList` returns `selectedCalendarIds: []` when the DB row has an empty array. Asserts: `result.selectedCalendarIds` deep-equals `[]`.

Test count: 17 → 19 (2 new). All 19 pass.

### PWA (vigil-pwa/src/pages/SettingsPage.test.tsx)

- **CR-01-reload-preservation-checked-from-server**: Renders SettingsPage with server returning `selectedCalendarIds: ['primary@gmail.com', 'work@company.com']`. Asserts: checkboxes for those two calendars have `checked === true`; the unselected `side@gmail.com` has `checked === false`.
- **CR-01-multi-selection-toggle-preserves-others**: Renders with `selectedCalendarIds: ['cal-a', 'cal-b', 'cal-c']`. User clicks `cal-b`. After 400ms debounce, asserts: PUT body is `{ selectedCalendarIds: ['cal-a', 'cal-c'] }` — NOT `[]` or `['cal-b']` (the pre-fix broken behaviors).

Additionally, the 3 existing CAL-01-picker-* tests that passed an ok-branch `calendarList` object were updated to include `selectedCalendarIds: []` (required by the widened union). The `makeFetchImpl` default was updated likewise.

Test count: 21 passed → 23 passed. The 1 pre-existing failure (`?google_error=invalid_state` test) is unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Items NOT Addressed (Explicitly Out of Scope)

Per plan `<objective>` and success_criteria:

- **WR-01**: DB/network errors during `setCalendarSelections` returned as 400 (error classification). Deferred.
- **WR-02**: Debounced PUT silently dropped on unmount (no flush in cleanup). Deferred.
- **WR-03**: Race-token guard for rapid in-flight toggles. Deferred.
- **WR-04**: Content-Type guard rejecting non-application/json bodies. Deferred.
- **IN-01/IN-02/IN-03/IN-05**: Pre-existing patterns. Deferred.

These items are tracked in `.planning/phases/115-calendar-source-picker-thoughtrow-polish/deferred-items.md`.

## Pre-existing Issues (Unchanged)

- `?google_error=invalid_state` SettingsPage test: 1 pre-existing failure — documented in `deferred-items.md`, NOT a Phase 115 regression. Not fixed in this plan.
- `vigil-pwa` `npx tsc --noEmit` stale `.d.ts` TS6305 errors: documented in `deferred-items.md`. Pre-existing from build artifacts, not introduced by this plan. All Phase 115 source changes type-check cleanly (`tsc -p tsconfig.app.json` shows only pre-existing `ImportMeta.env` errors unrelated to this plan's files).

## What Did NOT Change

- `vigil-core/src/routes/calendar.ts` — zero changes (route JSON-forwards the widened response shape)
- `vigil-core/src/db/schema.ts` — zero changes
- `PUT /v1/calendar/selections` endpoint — zero changes
- `handleCalendarToggle` in SettingsPage.tsx — zero changes
- Debounce-cleanup `useEffect` in SettingsPage.tsx — zero changes (WR-02 explicitly deferred)
- No new database migrations, no new endpoints, no security model changes

## Threat Surface

No new threat surface introduced. The `selectedCalendarIds` field surfaced in the GET response is a read-only reflection of data the authenticated user already wrote via PUT. The existing tenant-isolation gate (`bearerAuth → userId → dbSelect(userId)`) ensures cross-tenant reads are structurally impossible. See plan `<threat_model>` T-115-04-01 through T-115-04-04 for full analysis.

## Self-Check: PASSED

All modified files exist. Both task commits verified in git log.

| Check | Result |
|-------|--------|
| vigil-core/src/services/calendar-service.ts | FOUND |
| vigil-core/src/services/calendar-service.test.ts | FOUND |
| vigil-pwa/src/api/client.ts | FOUND |
| vigil-pwa/src/pages/SettingsPage.tsx | FOUND |
| vigil-pwa/src/pages/SettingsPage.test.tsx | FOUND |
| 115-04-SUMMARY.md | FOUND |
| commit 0ebdacc (Task 1) | FOUND |
| commit 02d1d47 (Task 2) | FOUND |
