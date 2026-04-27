---
phase: 115-calendar-source-picker-thoughtrow-polish
plan: 01
subsystem: api
tags: [calendar, oauth, hono, drizzle, jsonb, validation, multi-user]

# Dependency graph
requires:
  - phase: 109-per-user-scheduler-fan-out
    provides: per-user calendar-service signature (fetchTodaysEvents(userId), fetchCalendarList(userId)) and the (userId, provider="google") oauth_tokens scoping pattern that setCalendarSelections mirrors
  - phase: 108-work-order-statuses-userid-scoping-isolation-test
    provides: bearerAuth-driven c.get("userId") tenant identity contract used by the new PUT handler
provides:
  - PUT /v1/calendar/selections route (bearer-gated, validates body, persists per-user)
  - setCalendarSelections(userId, ids) service method on createCalendarService
  - validateCalendarIds shape/cap/element validator (single-sourced at the service boundary, 1000-id DoS cap)
  - dbSetCalendarSelectionsFn injection point on CalendarServiceDeps for test mocking
  - ROADMAP §Phase 115 SC#1 amended from /v1/calendar/calendars to /v1/calendar/list
affects: [115-02 PWA Settings calendars subsection, 115 verifier (literal SC#1 path read), brief-generate downstream consumers of fetchTodaysEvents empty-array fallback]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-sourced validation at the service boundary; route catches the throw and maps to 400 (avoids duplicated validation rules between layers)"
    - "Dedicated DI hook per write (dbSetCalendarSelectionsFn) instead of overloading dbUpdateFn — keeps token-refresh and selections-write mocks orthogonal"
    - "Test-only userId middleware wrapper (Hono `app.use('*')` + outer `app.route('/', inner)`) to mirror the production global bearerAuth dispatcher in unit tests"

key-files:
  created: []
  modified:
    - vigil-core/src/services/calendar-service.ts
    - vigil-core/src/services/calendar-service.test.ts
    - vigil-core/src/routes/calendar.ts
    - vigil-core/src/routes/calendar.test.ts
    - .planning/ROADMAP.md

key-decisions:
  - "Add dbSetCalendarSelectionsFn as a NEW dep instead of overloading dbUpdateFn — semantically the existing dbUpdateFn is for token-refresh writes; adding a separate hook keeps mocks independent and makes test failures point at the right call site"
  - "Validation lives in the service layer, not the route — route catches the throw and maps to HTTP 400; this guarantees the same rules apply if any future caller (CLI, scheduler, integration test) hits setCalendarSelections directly"
  - "Production fall-through to the real Drizzle update mirrors the existing dbUpdate helper exactly: `where(and(eq(userId), eq(provider, 'google')))` so cross-tenant writes are structurally impossible (T-115-01-04)"

patterns-established:
  - "Validation throws Error from the service; route catches and maps to 400 with the underlying message — used here for setCalendarSelections, replicable for any future write that needs the same semantics"
  - "Test wrapper for routes that depend on c.get('userId'): outer Hono app + use('*') middleware sets userId, then route('/', innerRouter) — works because Hono dispatches use('*') middleware before route handlers regardless of registration order"

requirements-completed: [CAL-01]

# Metrics
duration: 5min
completed: 2026-04-27
---

# Phase 115 Plan 01: Calendar source picker (server) Summary

**New `PUT /v1/calendar/selections` endpoint with single-sourced array validation (shape, string elements, 1000-id cap) and per-user Drizzle `oauth_tokens.calendar_selections` write — empty array preserved as the all-calendars fallback contract.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-27T22:31:59Z
- **Completed:** 2026-04-27T22:36:18Z
- **Tasks:** 3 / 3
- **Files modified:** 5 (4 source/test + 1 ROADMAP)
- **Commits:** 5 (2 RED, 2 GREEN, 1 docs)

## Accomplishments

- Service-layer `setCalendarSelections(userId, ids)` with input validation (array shape, string elements, 1000-id cap) and Drizzle update scoped to `(userId, provider="google")` — structurally prevents cross-tenant writes per T-115-01-04.
- Route handler `PUT /v1/calendar/selections` mounted automatically at `/v1/calendar/selections` via the existing `app.route("/v1", calendar)` in `index.ts:192` (no wiring change). Body parse failures and validation throws both surface as HTTP 400 with the underlying error message.
- 13 new tests pass (6 service-level CAL-01-set-* + 7 route-level CAL-01-put-*); all 5 prior route tests and all 11 prior service tests still green (29 calendar tests total, 0 fail).
- ROADMAP §Phase 115 SC#1 amended to reference the existing `GET /v1/calendar/list` (the verifier reads SC#1 literally).

## Task Commits

Each task was committed atomically (TDD tasks have RED + GREEN commits):

1. **Task 1 RED: failing setCalendarSelections tests** — `a8b98fe` (test)
2. **Task 1 GREEN: setCalendarSelections implementation** — `22da587` (feat)
3. **Task 2 RED: failing PUT /calendar/selections tests** — `8ce8c66` (test)
4. **Task 2 GREEN: PUT /calendar/selections route** — `ceff2ee` (feat)
5. **Task 3: ROADMAP SC#1 path amendment** — `239bb77` (docs)

**Plan metadata commit:** to follow this SUMMARY (final docs commit).

## Files Created/Modified

- `vigil-core/src/services/calendar-service.ts` — Added `dbSetCalendarSelectionsFn` to `CalendarServiceDeps`, extended factory return type with `setCalendarSelections`, added `MAX_CALENDAR_SELECTIONS = 1000` constant + `validateCalendarIds` helper, added `setCalendarSelections` function (38 insertions, 1 deletion).
- `vigil-core/src/services/calendar-service.test.ts` — 6 new tests under `// ── Phase 115 CAL-01: setCalendarSelections ──` (78 insertions).
- `vigil-core/src/routes/calendar.ts` — Added `router.put("/calendar/selections", ...)` handler that reads `userId` from `c.get("userId")`, parses JSON body, delegates validation to the service layer, and maps any throw to HTTP 400 (30 insertions).
- `vigil-core/src/routes/calendar.test.ts` — 7 new tests under `// ── Phase 115 CAL-01: PUT /calendar/selections ──` plus a `makeAppWithUserId` helper that wraps the router in an outer Hono app with a `use('*')` middleware pre-setting `userId=1` (mirrors the production global bearerAuth dispatcher in unit tests) (125 insertions, 1 import added).
- `.planning/ROADMAP.md` — SC#1 path string amended from `GET /v1/calendar/calendars` to `GET /v1/calendar/list` (line 387; the wrong path appears 0 times in the file now).

## Decisions Made

- **Two DI hooks, not one** — Added `dbSetCalendarSelectionsFn` as a separate dep on `CalendarServiceDeps` rather than reusing `dbUpdateFn`. `dbUpdateFn` is semantically the token-refresh write (it takes `(accessToken, expiresAt)`); the selections write needs `(userId, ids)`. Keeping them separate makes test failures point at the right call site and avoids re-shaping the existing token-refresh mock signature.
- **Validation single-sourced in the service** — `validateCalendarIds` lives next to `setCalendarSelections` so any future caller (CLI, scheduler, integration test) gets the same rules. The route handler is a thin try/catch that maps the service throw to HTTP 400 with the underlying error message.
- **Test wrapper pattern for userId-dependent routes** — `createCalendarRouter` does not mount bearerAuth (the middleware lives at the global catch-all in `index.ts`). For the new PUT to read `userId=1`, the test wraps the router in an outer Hono app with `app.use("*", c => c.set("userId", 1))` then `app.route("/", inner)`. This pattern is reusable for any future route test that needs to exercise userId without booting the full app.

## Deviations from Plan

None — plan executed exactly as written. The only minor adaptation: tests cast `c.set` arguments with `as never` to satisfy Hono's typed `Variables` generic (the production code path uses `c.get("userId") as number` and never sets it directly; only the test middleware does).

## Issues Encountered

- **None during implementation.** One observability note for the executor: `grep -c <pattern> file` returns exit code 1 when zero matches are found, which short-circuits a `&&` chain — split end-of-plan verification across two shell calls when one of the checks expects a count of 0.

## User Setup Required

None — no external service configuration required. The new PUT endpoint inherits the existing global `bearerAuth` middleware, the `oauth_tokens.calendar_selections` jsonb column already exists per the Phase 115 CONTEXT (no migration needed), and no new dependencies were added.

## Threat Flags

None — the new endpoint surface is fully covered by the threat register in `115-01-PLAN.md` (T-115-01-01 auth, T-115-01-02 DoS cap, T-115-01-03 type validation, T-115-01-04 tenant isolation, T-115-01-05 SQL injection accept, T-115-01-06 CSRF Authorization-header defense, T-115-01-07 logging accept). All `mitigate` dispositions are asserted by tests in Tasks 1 and 2.

## Next Phase Readiness

- **Plan 115-02 (PWA Calendars subsection)** can begin immediately. The PWA helper in `vigil-pwa/src/api/client.ts` (D-10) wraps `PUT /v1/calendar/selections` with body `{ selectedCalendarIds: string[] }`; the server returns `{ ok: true }` on success and `{ error: <message> }` on 400.
- **Plan 115-03 (POLISH-01 ThoughtRow)** is independent and can land in parallel with 115-02 per D-18.
- The empty-array → all-calendars fallback at `calendar-service.ts:299` is preserved untouched (D-11), so existing brief generation continues to work for users who haven't yet opened the picker.

## Self-Check: PASSED

- `vigil-core/src/services/calendar-service.ts` — FOUND (modified)
- `vigil-core/src/services/calendar-service.test.ts` — FOUND (modified)
- `vigil-core/src/routes/calendar.ts` — FOUND (modified)
- `vigil-core/src/routes/calendar.test.ts` — FOUND (modified)
- `.planning/ROADMAP.md` — FOUND (modified)
- Commit a8b98fe — FOUND
- Commit 22da587 — FOUND
- Commit 8ce8c66 — FOUND
- Commit ceff2ee — FOUND
- Commit 239bb77 — FOUND
- Service tests: 17/17 pass
- Route tests: 12/12 pass
- ROADMAP wrong-path count: 0
- `index.ts:192` mount line unchanged

---
*Phase: 115-calendar-source-picker-thoughtrow-polish*
*Plan: 01*
*Completed: 2026-04-27*
