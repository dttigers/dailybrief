# Phase 115: Calendar source picker (+ ThoughtRow whitespace polish) - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Two scoped slices, both shippable in this phase:

1. **CAL-01 — Calendar source picker.** PWA Settings exposes a multi-select list of the user's Google calendars (already returned by `GET /v1/calendar/list`). The user toggles calendars on/off; selections persist per-user via the existing `oauth_tokens.calendar_selections` jsonb column. The next generated brief includes events only from selected calendars. Empty selection continues to fall back to "all calendars" (current `calendar-service.ts` behavior preserved).

2. **POLISH-01 — ThoughtRow whitespace fix.** Add `whitespace-pre-line` to the row content className at `vigil-pwa/src/components/ThoughtRow.tsx:399` so multi-line thought captures render with line breaks preserved instead of collapsing to a single line.

**Out of scope:** Sports source picker (Phase 116). Auth-email rate-limit UX (Phase 117). Any new calendar capabilities beyond toggling which calendars contribute (no event-level filtering, no display preferences).

</domain>

<decisions>
## Implementation Decisions

### Write endpoint shape (CAL-01 server)
- **D-01:** New endpoint `PUT /v1/calendar/selections` (NOT `PUT /v1/calendar/list` and NOT `PUT /v1/calendar/calendars`). Existing `GET /v1/calendar/list` stays as-is — ROADMAP SC#1 wording (`/v1/calendar/calendars`) is amended in the plan-phase pass to match the existing route.
- **D-02:** Request body `{ selectedCalendarIds: string[] }`. Server overwrites `oauth_tokens.calendar_selections` wholesale on each call. Idempotent. Empty array is valid input and triggers the "fall back to all calendars" behavior in `fetchTodaysEvents`.
- **D-03:** No server-side validation against the user's actual Google calendar list on save. Stale or unknown IDs persist as-is and naturally contribute zero events on the next brief. No extra Google API roundtrip on save.
- **D-04:** No selection cap. Whatever Google returns, the user can pick.
- **D-05:** Per-user scoping follows Phase 109 D-11/D-12 pattern: `userId = c.get("userId")`, scope `oauth_tokens` lookup by `(userId, provider="google")`. Returns 401 if bearer absent (existing `bearerAuth` middleware handles this).

### Settings UI (CAL-01 PWA)
- **D-06:** Picker placement: inside the existing **Google Account card** in `SettingsPage.tsx`, as a **"Calendars" subsection beneath the existing ScopeRow rows** (around line 626). Visually nested with the connection status it depends on.
- **D-07:** List shape: one row per calendar with `[checkbox] [color swatch from item.color] [name] [PRIMARY badge if item.primary]`. Reuses fields already returned by `GET /v1/calendar/list` (`{id, name, color, primary}`).
- **D-08:** Save UX: **auto-save per toggle, ~400ms debounce**. Optimistic UI update on click; debounced `PUT /v1/calendar/selections` with the full new array; rollback to last-known-good + error toast on failure. No explicit Save button.
- **D-09:** Initial fetch: `GET /v1/calendar/list` is called on **SettingsPage mount**, alongside the existing `/v1/me` and `/v1/auth/me` mount-time fetches.
- **D-10:** A new typed helper in `vigil-pwa/src/api/client.ts` wraps the PUT (e.g., `setCalendarSelections(ids: string[])`) using the existing `vigilFetch` pattern.

### State handling (CAL-01)
- **D-11:** Empty selection semantics: **empty = all calendars** (preserves `calendar-service.ts:262-268` fallback and ROADMAP SC#3). UI shows helper copy: "No calendars selected — brief includes all of them."
- **D-12:** `needs_reauth` from `GET /v1/calendar/list`: **hide the calendars subsection entirely**. The existing ScopeRow Calendar (line 626) already shows the reconnect prompt — no duplicate UI. Picker re-appears once the user reconnects Google.
- **D-13:** `error` from `GET /v1/calendar/list`: render an **inline error block with a Retry button** inside the calendars subsection. User can retry without leaving Settings.
- **D-14:** PUT failure during auto-save: **rollback optimistic UI to last-known-good** and surface an error toast ("Couldn't save calendar selection — try again"). No unsaved-state badge, no auto-retry.

### POLISH-01 (ThoughtRow)
- **D-15:** Single CSS change: append `whitespace-pre-line` to the `<p>` className at `vigil-pwa/src/components/ThoughtRow.tsx:399`. Keep `line-clamp-3` and `break-words` as-is. Final className: `text-gray-100 text-sm leading-relaxed line-clamp-3 break-words cursor-text whitespace-pre-line`.
- **D-16:** Edit-mode textarea (line 390-395) is **not** modified — `<textarea>` preserves `\n` natively.
- **D-17:** Add one regression test in `ThoughtRow.test.tsx`: render a thought with embedded `\n`, assert the rendered `<p>` className contains `whitespace-pre-line`. Locks in POLISH-01 against future className refactors / Tailwind purging.

### Sequencing
- **D-18:** POLISH-01 ships as its **own atomic plan** (separate from CAL-01 plans). Independent files, can land in parallel with calendar work, can ship even if calendar work hits a snag. Plan-phase chooses the exact wave assignment.

### Claude's Discretion
- Exact name of PWA helper function in `api/client.ts` (D-10 suggests `setCalendarSelections`).
- Exact debounce implementation (existing util vs inline `setTimeout` vs `useDebouncedCallback` hook) — pick what matches existing PWA conventions.
- Toast styling — reuse whatever `ToastHost` API already exposes (don't invent a new pattern).
- Helper copy wording for the empty-selection note.
- Loading skeleton vs spinner during initial fetch.
- Whether to show calendar count ("3 of 7 selected") in the section header.

### Folded Todos
None — no pending todos in `.planning/todos/` matched Phase 115 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 115 source-of-truth
- `.planning/REQUIREMENTS.md` — CAL-01 (full requirement text including `oauth_tokens.calendarSelections` reference) and POLISH-01 (`whitespace-pre-line` at `ThoughtRow.tsx:399`).
- `.planning/ROADMAP.md` §"Phase 115: Calendar source picker (+ ThoughtRow whitespace polish)" (lines 382-392) — Goal, depends-on, requirements mapping, 4 success criteria. Note: SC#1 path string `GET /v1/calendar/calendars` is to be amended during plan-phase to match existing `GET /v1/calendar/list` per D-01.

### Existing calendar code (touch but don't break)
- `vigil-core/src/db/schema.ts:293` — `calendarSelections: jsonb("calendar_selections").$type<string[]>().default([])` on `oauth_tokens`. Storage already exists; no migration needed.
- `vigil-core/src/services/calendar-service.ts` — `createCalendarService` factory. `fetchTodaysEvents` (line 246) already filters by `calendarSelections` and falls back to all when empty (line 262-268). `fetchCalendarList` (line 325) is what `GET /v1/calendar/list` calls.
- `vigil-core/src/routes/calendar.ts` — Existing `createCalendarRouter` mounts `GET /calendar/events` and `GET /calendar/list`. New `PUT /calendar/selections` handler is added here, mounted at `/v1` via `app.route("/v1", calendar)` in `vigil-core/src/index.ts:192`.
- `vigil-core/src/services/calendar-service.test.ts` and `vigil-core/src/routes/calendar.test.ts` — Existing test patterns to extend.

### PWA Settings + API
- `vigil-pwa/src/pages/SettingsPage.tsx` — Google Account card lives around line 626 (existing `ScopeRow Calendar` integration point per D-06). Mount-time fetch pattern at lines 121, 144 (per D-09).
- `vigil-pwa/src/api/client.ts` — `vigilFetch` helper (line 53), existing `WorkOrderStatus`-style typed helpers throughout. New `setCalendarSelections` helper added here per D-10.
- `vigil-pwa/src/pages/SettingsPage.test.tsx` — Existing test patterns to extend for the new picker.

### POLISH-01 file
- `vigil-pwa/src/components/ThoughtRow.tsx:397-403` — `<p>` element with current className. Single-line change per D-15.
- `vigil-pwa/src/components/ThoughtRow.test.tsx` — Existing test file gets the regression test from D-17.

### Prior decisions to honor
- Phase 109 D-11/D-12 (per-user scoping) — `c.get("userId")` + scope `oauth_tokens` lookup. Reflected in `calendar-service.ts:127, 149`.
- `vigil-core` env-gate fail-closed pattern (memory: project_vigil_core_env_gates) — JWT_SECRET + VIGIL_ALLOWED_EMAILS already enforced; new endpoint inherits via existing `bearerAuth` middleware.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `oauth_tokens.calendar_selections` jsonb column (`vigil-core/src/db/schema.ts:293`) — already exists with `default([])`. No migration.
- `calendar-service.ts` `fetchCalendarList(userId)` and `fetchTodaysEvents(userId)` — both already userId-scoped and already implement the empty-array → all-calendars fallback. Backend behavior side of CAL-01 is essentially complete.
- `vigilFetch` (`vigil-pwa/src/api/client.ts:53`) — handles bearer injection, 401 redirect, `vigil:edit-ended` semantics. Use it for PUT.
- `ScopeRow` (`vigil-pwa/src/pages/SettingsPage.tsx:691`) — existing Google scope rendering; the new picker sits beneath these.
- `ToastHost` (`vigil-pwa/src/components/ToastHost.tsx`) — toast surface for D-14 error toast.
- `ThoughtRow.test.tsx` — already in place; add one POLISH-01 regression test.

### Established Patterns
- Hono `createXxxRouter(deps?)` factory + production singleton at module bottom (e.g., `calendar-service.ts:371`, `routes/calendar.ts:36`). New write handler follows the same DI shape (test-injectable `dbUpdateFn`).
- `bearerAuth` middleware sets `c.var.userId`; routes read via `c.get("userId") as number`. New PUT handler uses the same pattern.
- PWA mount-time data load: `useEffect` calling `vigilFetch` once; failure → silent UI fallback (e.g., banner absent), as in lines 144-150 of SettingsPage.
- Test pattern: route-level tests use `createCalendarRouter({ dbSelectFn, dbUpdateFn, fetchFn })` with mocks (see `routes/calendar.test.ts`).

### Integration Points
- New PUT handler lands in `vigil-core/src/routes/calendar.ts` and is automatically mounted because `app.route("/v1", calendar)` already exists in `index.ts`.
- New service method `setCalendarSelections(userId, ids)` lands in `vigil-core/src/services/calendar-service.ts` (extending the factory return type at line 113-116).
- New PWA UI lands as a JSX subsection inside the Google card in `SettingsPage.tsx` (D-06). New helper in `vigil-pwa/src/api/client.ts` (D-10).
- POLISH-01 is a single-line className change in `ThoughtRow.tsx:399` plus one new test case in `ThoughtRow.test.tsx`.

### Constraints
- Brief generation must continue to work for users with `null`/empty `calendar_selections` (existing seed user behavior). Tests must cover the empty case explicitly.
- `vigil:edit-ended` event on `vigilFetch` 401 paths is unrelated but already handled — don't break it.
- `oauth_tokens` writes happen alongside scheduler writes (Phase 109) — assume row exists by the time the picker opens (Google must be connected, which the picker visibility gating in D-12 already ensures).

</code_context>

<specifics>
## Specific Ideas

- "Inside the Google card, beneath ScopeRow" — visual nesting reinforces the dependency on Google connection.
- "Color swatch + PRIMARY badge" — reuse what Google already returns; users recognize their own calendars by color.
- "Empty = all calendars" is **load-bearing** in the existing brief flow; the UI must communicate this clearly so users don't accidentally produce empty-selection-but-full-events briefs and get confused.

</specifics>

<deferred>
## Deferred Ideas

- Telemetry/PostHog events for picker interactions (`calendar_selection_changed`, `calendar_picker_loaded`) — not required by CAL-01 SCs; can ride along if the planner sees a clean spot, otherwise own ticket later.
- OpenAPI / API-contract doc update for the new PUT endpoint — surface during plan-phase if a contract doc exists; otherwise out of scope.
- Editing-mode textarea polish for ThoughtRow — explicitly deferred per D-16 (no current bug).
- Sports source picker — Phase 116.
- Per-event filtering (e.g., decline declined events) — future capability, not requested.
- Display preferences for calendar events in the brief — future capability, not requested.

### Reviewed Todos (not folded)
None — no relevant pending todos surfaced in matching for Phase 115.

</deferred>

---

*Phase: 115-calendar-source-picker-thoughtrow-polish*
*Context gathered: 2026-04-27*
