---
phase: 115-calendar-source-picker-thoughtrow-polish
verified: 2026-04-27T18:21:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "User can toggle calendars on/off in Settings and the selection persists per-user (round-trips through oauth_tokens.calendarSelections); reload preserves the choice"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Visual layout: open the deployed PWA Settings on a Google-connected account, confirm the Calendars subsection renders inside the Google Account card with one row per calendar (checkbox + color swatch + name + PRIMARY badge on the primary calendar)"
    expected: "Subsection appears below the existing Calendar/Gmail ScopeRow rows; primary calendar carries a teal PRIMARY badge; color swatches match Google's per-calendar color"
    why_human: "JSDOM cannot compute CSS — visual layout, badge placement, color rendering, and overall card composition need eyeball verification on the deployed build"
  - test: "Multi-line thought row: capture (or paste) a thought containing literal newlines, e.g., 'line one\\nline two\\nline three', and view it in the Thoughts list"
    expected: "The thought renders across multiple visible lines (up to the line-clamp-3 cap), not collapsed to one line"
    why_human: "JSDOM cannot compute CSS white-space rendering — the regression test only locks the className presence; the actual visual line-break behavior must be eyeballed on the deployed build"
  - test: "End-to-end save+reload (CR-01 fix verification): on a Google-connected account, open Settings, check 2-3 calendars, wait ~500ms for the debounced save, hard-refresh the page, observe the picker"
    expected: "After reload the same checkboxes that were checked before reload are still checked (SC#2 'reload preserves the choice' is now implemented — the server returns selectedCalendarIds in the GET /v1/calendar/list response and the PWA hydrates state from it on mount)"
    why_human: "Confirms the CR-01 fix works in production against the live server — the unit tests pin the contract but only an end-to-end run confirms the full round-trip"
  - test: "Brief includes only selected calendars: on a Google-connected account with multiple calendars, select only ONE non-primary calendar, wait for debounced save, generate a brief"
    expected: "The brief PDF only includes events from the selected calendar; events from unselected calendars are absent"
    why_human: "Requires generating a real brief against the live Google API — cannot run in unit tests; SC#3 is the user-visible contract and must be confirmed live"
  - test: "Empty-selection fallback: on a Google-connected account, select zero calendars (clear all), confirm helper copy renders, generate a brief"
    expected: "Helper copy 'No calendars selected — brief includes all of them.' renders; the brief PDF includes events from all the user's calendars (existing fallback per D-11)"
    why_human: "End-to-end behavior across PWA + brief generation cannot be exercised in unit tests"
---

# Phase 115: Calendar source picker (+ ThoughtRow whitespace polish) Verification Report

**Phase Goal:** Users pick which Google calendars contribute to their daily brief from PWA Settings, and multi-line thought captures stop collapsing to a single line in the row view.
**Verified:** 2026-04-27T18:21:00Z
**Status:** human_needed
**Re-verification:** Yes — after Plans 115-04 gap closure (CR-01 reload-preservation)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can open PWA Settings and see a multi-select list of all Google calendars on their connected account, populated from `GET /v1/calendar/list` | VERIFIED | SettingsPage.tsx:719 renders `data-testid="calendars-subsection"` with one `<input type="checkbox">` per calendar from `calendarList.map`; line 175 calls `getCalendarList()` on mount via `loadCalendars` useCallback wired into `useEffect`. Test `CAL-01-picker-render` asserts both calendar names and the PRIMARY badge render. |
| 2 | User can toggle calendars on/off in Settings and the selection persists per-user (round-trips through `oauth_tokens.calendarSelections`); reload preserves the choice | VERIFIED | **Persist half:** `handleCalendarToggle` calls `setCalendarSelections(next)` after 400ms debounce; PUT route writes wholesale via Drizzle update scoped to `(userId, provider="google")`. 19/19 service tests + 12/12 route tests pass. **Reload-preserves half (now fixed by 115-04):** `fetchCalendarList` returns `selectedCalendarIds: string[]` in the ok response (calendar-service.ts:44, 399). `CalendarListResult` ok branch carries `selectedCalendarIds` (client.ts:798). `loadCalendars` ok branch seeds `setSelectedCalendarIds(result.selectedCalendarIds)` (line 178) AND `lastSavedSelectionRef.current = result.selectedCalendarIds` (line 179). Two new regression tests: `CR-01-reload-preservation-checked-from-server` and `CR-01-multi-selection-toggle-preserves-others` — both pass. VERIFIED. |
| 3 | The next generated brief only includes events from calendars the user selected; unselected calendars contribute zero events. Empty selection still falls back to "all calendars" (current behavior preserved) | VERIFIED (server-side) | `fetchTodaysEvents` reads `calendarSelections` from the user's oauth_tokens row, iterates only those calendarIds. Empty-array fallback to `fetchCalendarListRaw` preserved at line 299 (D-11 unchanged). `calendarSelections.length === 0` check confirmed present. Full SC#3 round-trip is in human verification (requires live Google API). |
| 4 | A multi-line thought (one with embedded `\n` characters) renders with line breaks preserved in the thoughts list row view — no longer collapses to a single line | VERIFIED | ThoughtRow.tsx:399 className = `"text-gray-100 text-sm leading-relaxed line-clamp-3 break-words cursor-text whitespace-pre-line"`. Edit-mode `<textarea>` at lines 387-395 unchanged (D-16). Regression test `POLISH-01-whitespace-pre-line-class` at ThoughtRow.test.tsx:607 asserts `<p>.className` contains `whitespace-pre-line` and load-bearing classes. 26/26 ThoughtRow tests pass. (Visual line-break rendering is human-verification territory — JSDOM cannot compute CSS.) |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/services/calendar-service.ts` | `setCalendarSelections(userId, ids)` service method + `selectedCalendarIds` in CalendarListResponse ok branch | VERIFIED | Lines 269-279: `setCalendarSelections` with `validateCalendarIds`, Drizzle update scoped to `(userId, provider="google")`. Line 44: `CalendarListResponse` ok variant now carries `selectedCalendarIds: string[]`. Line 399: `fetchCalendarList` returns `selectedCalendarIds: calendarSelections` from `getValidAccessToken`. `MAX_CALENDAR_SELECTIONS = 1000` at line 253. Factory return at line 405 exposes all three methods. |
| `vigil-core/src/routes/calendar.ts` | `PUT /calendar/selections` route handler | VERIFIED | Lines 41-59: reads userId from `c.get("userId")` (NEVER from body), parses body, delegates validation to service layer (catch → 400). Route JSON-forwards the widened `selectedCalendarIds` shape automatically. Mounted at `/v1` via `app.route("/v1", calendar)` in index.ts:192 (unchanged). |
| `vigil-pwa/src/api/client.ts` | `getCalendarList()` + `setCalendarSelections(ids)` helpers + `CalendarListResult` with `selectedCalendarIds` in ok branch | VERIFIED | Lines 786-823: `CalendarInfo` interface, `CalendarListResult` discriminated union (line 798: ok branch carries `selectedCalendarIds: string[]`), `getCalendarList()` wraps GET, `setCalendarSelections(ids)` wraps PUT with body `{selectedCalendarIds: ids}`. |
| `vigil-pwa/src/pages/SettingsPage.tsx` | Calendars subsection + mount-time fetch hydrating selectedCalendarIds state AND lastSavedSelectionRef from server | VERIFIED | Subsection at lines 719-775, all 4 branches. Lines 178-179: `setSelectedCalendarIds(result.selectedCalendarIds)` AND `lastSavedSelectionRef.current = result.selectedCalendarIds` in loadCalendars ok branch. Rollback toast at line 431. `calendarSaveTimerRef` 8 occurrences. |
| `vigil-pwa/src/pages/SettingsPage.test.tsx` | Tests covering render, toggle-debounced-save, hide-on-reauth, error+retry, empty-helper PLUS CR-01 regression tests | VERIFIED | 5 CAL-01-picker-* tests + 2 CR-01-* tests (total 7 new tests in the picker describe block). 23/24 pass (1 pre-existing failure: `?google_error=invalid_state` — documented in deferred-items.md). |
| `vigil-pwa/src/components/ThoughtRow.tsx` | `<p>` className with `whitespace-pre-line` appended | VERIFIED | Line 399: full className string confirmed, edit-mode textarea unchanged. |
| `vigil-pwa/src/components/ThoughtRow.test.tsx` | POLISH-01 regression test locking the className contract | VERIFIED | Line 607: `POLISH-01-whitespace-pre-line-class` present and passing. 26/26 ThoughtRow tests pass. |
| `vigil-core/src/services/calendar-service.test.ts` | 6 unit tests for setCalendarSelections + 2 new tests for selectedCalendarIds in fetchCalendarList response | VERIFIED | 6 CAL-01-set-* tests + 2 CAL-01-list-includes-selections-* tests. 19/19 service tests pass (up from 17/17 pre-115-04). |
| `vigil-core/src/routes/calendar.test.ts` | 7 route tests for PUT /v1/calendar/selections | VERIFIED | 7 CAL-01-put-* tests. 12/12 route tests pass (no regression — route JSON-forwards the new shape). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| SettingsPage.tsx mount useEffect | GET /v1/calendar/list | `getCalendarList()` helper | WIRED | useEffect calls loadCalendars which awaits `getCalendarList()`. |
| SettingsPage.tsx loadCalendars ok branch | `selectedCalendarIds` state + `lastSavedSelectionRef` | `setSelectedCalendarIds(result.selectedCalendarIds)` + ref assignment | WIRED (new — CR-01 fix) | Lines 178-179 in loadCalendars seed both optimistic state and rollback target from server on mount. |
| SettingsPage.tsx toggle handler | PUT /v1/calendar/selections | `setCalendarSelections(ids)` helper, debounced 400ms | WIRED | `handleCalendarToggle` sets 400ms `window.setTimeout` that calls `await setCalendarSelections(next)`. `previous = selectedCalendarIds` now starts as the actual server selection (not []). |
| Calendar row checkbox | Optimistic state + rollback | `useState<string[]>` for selectedCalendarIds + lastSavedSelectionRef | WIRED | Optimistic flip works; rollback target is now seeded from server response (CR-01 secondary effect closed). |
| Save failure | ToastHost | `useToast().showToast({variant: 'error', body: ...})` | WIRED | Toast at line 431 fires on PUT catch path. |
| PUT route handler | service.setCalendarSelections(userId, ids) | `createCalendarService(deps).setCalendarSelections` | WIRED | Route line 54: `await service.setCalendarSelections(userId, ids as string[])`. |
| service.setCalendarSelections | Drizzle update on oauthTokens scoped by userId+provider | Drizzle `.update(oauthTokens).set({calendarSelections: ids}).where(and(eq(userId), eq('google')))` | WIRED | Lines 275-278. Cross-tenant writes structurally impossible (T-115-01-04). |
| PUT route | bearerAuth | global dispatcher in index.ts mounts before `app.route("/v1", calendar)` | WIRED | Route reads userId from `c.get("userId")` at line 42 (confirmed — NEVER from body). |
| GET /v1/calendar/list ok response | PWA selectedCalendarIds state | `selectedCalendarIds` field in CalendarListResult union, seeded in loadCalendars | WIRED (new — CR-01 fix) | calendar-service.ts:44+399 → client.ts:798 → SettingsPage.tsx:178-179. End-to-end type-safe plumbing; TypeScript enforces the field at every step. |
| brief-assembly-service.ts | fetchTodaysEvents(userId) → calendarSelections filtering | per-user calendarService pipeline | WIRED | fetchTodaysEvents reads calendarSelections from oauth_tokens row and iterates only those calendarIds. Empty-array fallback at line 299 (D-11) preserved. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| SettingsPage.tsx Calendars subsection | `calendarList` (CalendarInfo[]) | `getCalendarList()` → `vigilFetch('/v1/calendar/list')` → `fetchCalendarList` → Google Calendar API | Yes (live Google API call returning real calendar metadata) | FLOWING |
| SettingsPage.tsx Calendars subsection | `selectedCalendarIds` (string[]) | `loadCalendars` ok branch now seeds from `result.selectedCalendarIds` (line 178), which comes from `oauth_tokens.calendarSelections` via `getValidAccessToken` | Yes — server truth seeded on mount; first toggle no longer operates on [] (CR-01 closed) | FLOWING (gap closed by 115-04) |
| ThoughtRow `<p>` element | `thought.content` (string with possible `\n`) | Props from parent (Thoughts list / capture pipeline) | Yes — content already flows from thought capture | FLOWING |
| brief-assembly-service.ts brief pipeline | calendar events array | `fetchTodaysEvents(userId)` → reads `calendarSelections` via `dbSelect` → Google API per selected calendar | Yes server-side; now trustworthy since CR-01 no longer silently wipes the selection on first toggle | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend calendar service tests (19 tests, 2 new CR-01) | `cd vigil-core && npx tsx --test src/services/calendar-service.test.ts` | tests 19, pass 19, fail 0 | PASS |
| Backend calendar route tests (12 tests, no change) | `cd vigil-core && npx tsx --test src/routes/calendar.test.ts` | tests 12, pass 12, fail 0 | PASS |
| ThoughtRow tests (26 tests, 1 new POLISH-01) | `cd vigil-pwa && npx vitest run --config vitest.config.ts src/components/ThoughtRow.test.tsx` | 26/26 passed | PASS |
| SettingsPage tests (24 tests, 2 new CR-01) | `cd vigil-pwa && npx vitest run --config vitest.config.ts src/pages/SettingsPage.test.tsx` | 23/24 passed (1 pre-existing: `?google_error=invalid_state`, documented in deferred-items.md) | PASS (within scope) |
| ROADMAP SC#1 path correctness | `grep "/v1/calendar/calendars" .planning/ROADMAP.md` | 0 matches; confirmed `GET /v1/calendar/list` at line 387 | PASS |
| New endpoint mount | `grep "app.route.*v1.*calendar" vigil-core/src/index.ts` | Line 192 unchanged | PASS |
| D-11 fallback preserved | `grep "calendarSelections.length === 0" vigil-core/src/services/calendar-service.ts` | Line 299: empty-array fallback to `fetchCalendarListRaw` still present | PASS |
| DoS cap preserved | `grep "MAX_CALENDAR_SELECTIONS = 1000" vigil-core/src/services/calendar-service.ts` | Line 253: cap unchanged | PASS |
| XSS posture preserved | `grep "dangerouslySetInnerHTML" vigil-pwa/src/components/ThoughtRow.tsx` | 0 matches | PASS |
| CR-01 hydration lines present | `grep "setSelectedCalendarIds(result.selectedCalendarIds)" vigil-pwa/src/pages/SettingsPage.tsx` | Line 178: exactly 1 match | PASS |
| CR-01 rollback seed present | `grep "lastSavedSelectionRef.current = result.selectedCalendarIds" vigil-pwa/src/pages/SettingsPage.tsx` | Line 179: exactly 1 match | PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CAL-01 | 115-01, 115-02, 115-04 | User can pick which Google calendars feed the brief from PWA Settings — multi-select rendered from `GET /v1/calendar/list`, persisted per-user via `oauth_tokens.calendarSelections`, respected by `fetchTodaysEvents(userId)`. Empty falls back to all calendars. Reload preserves the choice. | SATISFIED | Server endpoint (PUT /v1/calendar/selections) + per-user persistence + empty-fallback + brief-side filtering all VERIFIED. PWA picker renders, persists toggles, AND now re-hydrates selection from server on mount (CR-01 closed by 115-04). 7 new picker/CR-01 tests passing. SC#3 end-to-end needs live brief generation (routed to human verification). |
| POLISH-01 | 115-03 | `whitespace-pre-line` applied to ThoughtRow.tsx display-mode `<p>` so multi-line thought captures preserve line breaks | SATISFIED | className confirmed at line 399. Regression test at ThoughtRow.test.tsx:607 passes. Visual line-break rendering routed to human verification (JSDOM cannot compute CSS). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `vigil-core/src/routes/calendar.ts` | 53-57 | `try/catch` around `service.setCalendarSelections` maps every throw (including real DB errors) to HTTP 400 | Warning | DB/network failures surfaced as 400 with raw error.message; server-side incident dashboards lose 5xx signal. WR-01 from 115-REVIEW.md. Explicitly deferred. |
| `vigil-pwa/src/pages/SettingsPage.tsx` | 202-209 | Debounce-cleanup `useEffect` cancels timer on unmount but does NOT flush the pending PUT | Warning | User toggles and navigates away within 400ms — save is silently dropped. WR-02 from 115-REVIEW.md. Explicitly deferred. |
| `vigil-pwa/src/pages/SettingsPage.tsx` | 419-432 | Optimistic update has no in-flight request token / monotonic guard | Warning | Rapid-toggle race can ship a stale rollback if a PUT fails after a newer toggle has fired. WR-03 from 115-REVIEW.md. Explicitly deferred. |
| `vigil-core/src/services/calendar-service.ts` | 219-227 | `fetchCalendarListRaw` swallows non-OK responses (401/403/500) as empty calendar list | Info | Collapses distinct error conditions into "no calendars"; pre-existing pattern. IN-01 from 115-REVIEW.md. |
| `vigil-core/src/services/calendar-service.ts` | 336-338 | `normalizeEvent` uses calendarId for both id and name, sets color null | Info | Pre-existing pattern; calendar name/color not surfaced in brief events. IN-02 from 115-REVIEW.md. |

None of the above are blockers for the goal. The three warnings are explicitly deferred per 115-04-PLAN.md `<objective>`. The two info items are pre-existing and not introduced by Phase 115.

### Human Verification Required

1. **Visual layout: Calendars subsection renders correctly**

   **Test:** Open the deployed PWA Settings on a Google-connected account, confirm the Calendars subsection renders inside the Google Account card with one row per calendar (checkbox + color swatch + name + PRIMARY badge on the primary calendar).
   **Expected:** Subsection appears below existing ScopeRow rows; primary calendar carries a teal PRIMARY badge; color swatches match Google's per-calendar color.
   **Why human:** JSDOM cannot compute CSS — visual layout, badge placement, color rendering need eyeball verification.

2. **Multi-line thought rendering**

   **Test:** Capture (or paste) a thought containing literal newlines, e.g., `"line one\nline two\nline three"`, and view it in the Thoughts list.
   **Expected:** Renders across multiple visible lines (up to line-clamp-3 cap), not collapsed.
   **Why human:** JSDOM cannot compute CSS white-space rendering — the regression test only locks the className presence; the actual visual line-break behavior must be eyeballed on the deployed build.

3. **Save+reload (CR-01 fix verification)**

   **Test:** On a Google-connected account, open Settings, check 2-3 calendars, wait ~500ms for the debounced save, hard-refresh the page, observe the picker.
   **Expected:** After reload the same checkboxes that were checked before reload are still checked. The 115-04 fix makes this work by returning `selectedCalendarIds` from the server in `GET /v1/calendar/list` and seeding PWA state on mount. (Previous verification noted this would FAIL — it should now PASS with the fix.)
   **Why human:** Confirms the CR-01 fix works end-to-end in production against the live server; unit tests pin the contract but a live round-trip is the definitive check.

4. **Brief includes only selected calendars**

   **Test:** On a Google-connected account with multiple calendars, select only ONE non-primary calendar, wait for debounced save, generate a brief.
   **Expected:** Brief PDF only includes events from the selected calendar; events from unselected calendars absent.
   **Why human:** Requires generating a real brief against the live Google API — cannot run in unit tests.

5. **Empty-selection fallback**

   **Test:** On a Google-connected account, select zero calendars (clear all), confirm helper copy renders, generate a brief.
   **Expected:** Helper copy "No calendars selected — brief includes all of them." renders; brief PDF includes events from all calendars.
   **Why human:** End-to-end behavior across PWA + brief generation cannot be exercised in unit tests.

### Gaps Summary

No blocking gaps remain. All four observable truths are verified at the code level.

**CR-01 is closed.** Plan 115-04 shipped three changes that together make SC#2 "reload preserves the choice" structurally true:
1. `CalendarListResponse` ok variant extended with `selectedCalendarIds: string[]` sourced from the already-read `oauth_tokens.calendarSelections` (vigil-core, zero new DB calls).
2. `CalendarListResult` ok variant widened to match (vigil-pwa client type).
3. `loadCalendars` ok branch seeds both `selectedCalendarIds` state AND `lastSavedSelectionRef.current` from `result.selectedCalendarIds` — making checkboxes render correctly on mount AND tying the rollback target to server truth.

Two CR-01 regression tests (checked-from-server + multi-selection-preserve-others) and two backend tests (nonempty + empty selectedCalendarIds) confirm the fix. The 3 warnings (WR-01, WR-02, WR-03) and 2 info items (IN-01, IN-02) are all explicitly deferred to a follow-up phase per 115-04-PLAN.md.

The phase goal is achieved. Human verification of visual layout, CSS rendering, and the live end-to-end round-trip is what remains — standard for any phase that ships UI.

---

*Verified: 2026-04-27T18:21:00Z*
*Verifier: Claude (gsd-verifier)*
*Re-verification: Yes — after 115-04 gap closure*
