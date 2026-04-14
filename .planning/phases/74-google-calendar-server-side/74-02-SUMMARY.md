---
phase: 74-google-calendar-server-side
plan: "02"
subsystem: vigil-core
tags: [google-calendar, token-refresh, hono, drizzle, aes-256-gcm, di-factory]
dependency_graph:
  requires: [74-01]
  provides: [calendar-events-endpoint, calendar-list-endpoint, calendar-service]
  affects: [vigil-core/src/index.ts]
tech_stack:
  added: []
  patterns: [factory-with-injected-deps, graceful-degradation-status-field, tdd-red-green]
key_files:
  created:
    - vigil-core/src/services/calendar-service.ts
    - vigil-core/src/services/calendar-service.test.ts
    - vigil-core/src/routes/calendar.ts
    - vigil-core/src/routes/calendar.test.ts
  modified:
    - vigil-core/src/index.ts
decisions:
  - "Calendar routes return HTTP 200 for all statuses (ok/needs_reauth/error) — brief assembly layer reads status field, consistent with sports endpoint pattern"
  - "On expired access token: decrypt refresh token via AES-256-GCM, call refreshFn, update DB before API calls — no token value is ever logged (T-74-08)"
  - "When calendarSelections is empty, fall back to fetching all calendars via calendarList API — avoids requiring explicit calendar selection before first use"
  - "calendarService production singleton exported for use by Phase 76 brief assembly"
metrics:
  duration: "~3 minutes"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 1
  completed_date: "2026-04-13"
---

# Phase 74 Plan 02: Calendar Service and Data Routes Summary

Google Calendar data endpoints with on-demand token refresh, DI factory pattern, graceful degradation (needs_reauth/error statuses), and all-day event detection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Calendar service with token refresh + tests | bf1b681 | calendar-service.ts, calendar-service.test.ts |
| 2 | Calendar data routes + tests + index.ts registration | 4d835a4 | calendar.ts, calendar.test.ts, index.ts |

## What Was Built

**calendar-service.ts** (`vigil-core/src/services/calendar-service.ts`): DI factory `createCalendarService(deps?)` with:
- `getValidAccessToken()`: queries oauthTokens for provider='google', checks expiry (5-min buffer), calls `decryptToken()` + refresh when expired, updates DB with new token, throws `TokenNotFoundError`/`TokenRevokedError` on failure
- `fetchTodaysEvents()`: resolves calendar IDs (from `calendarSelections` or via calendarList API), fetches events for today's date range with `singleEvents=true&orderBy=startTime`, normalizes all-day events (start.date vs start.dateTime), returns `CalendarEventsResponse`
- `fetchCalendarList()`: fetches `/users/me/calendarList`, maps to `CalendarInfo[]`, returns `CalendarListResponse`
- Graceful degradation: `needs_reauth` on missing/revoked token, `error` on network failure
- Production singleton `calendarService` exported for brief assembly

**calendar.ts** (`vigil-core/src/routes/calendar.ts`): Hono router factory `createCalendarRouter(deps?)` with:
- `GET /calendar/events` — today's events for Phase 76 brief generation
- `GET /calendar/list` — available calendars for PWA selection UI
- All responses return HTTP 200; `status` field signals ok/needs_reauth/error

**index.ts registration**: `calendar` imported and registered at line 99, after `bearerAuth` middleware at lines 70-74 — routes are protected.

## Test Results

- calendar-service: 10/10 pass (CAL-02, CAL-03 requirements)
- calendar routes: 5/5 pass (CAL-03 requirements)
- Full suite: 79/79 pass (all existing tests preserved)

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|------------|
| T-74-06: calendar event info disclosure | Only return title, startTime, endTime, location, calendarName, calendarColor — no attendees, descriptions, conference links |
| T-74-07: elevation of privilege | calendar routes registered after bearerAuth middleware — valid API key required |
| T-74-08: token logging | Log "token refreshed for provider=google" — token values never appear in logs |
| T-74-09: rate limits | Accepted — single-user system, caching deferred |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functionality is fully wired. `calendarName` and `calendarColor` on events are set to `calendarId` and `null` respectively (Google's events API doesn't include calendar metadata per event — the calendar name/color come from the calendar list). Phase 76 (brief assembly) can enrich events by joining the calendar list response.

## Threat Flags

No new security surface beyond what is modeled in the plan's threat register.

## Self-Check: PASSED

Files confirmed present:
- vigil-core/src/services/calendar-service.ts — FOUND
- vigil-core/src/services/calendar-service.test.ts — FOUND
- vigil-core/src/routes/calendar.ts — FOUND
- vigil-core/src/routes/calendar.test.ts — FOUND

Commits confirmed:
- bf1b681 — feat(74-02): implement calendar service with token refresh and tests
- 4d835a4 — feat(74-02): add calendar data routes and register in index.ts
