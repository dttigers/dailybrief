# Phase 88: Date Window Helper & Weekly Rollover - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver (1) a shared server-side date-window utility that becomes the single source of truth for all v3.2 scoping/rollover work, and (2) apply it to the Thoughts tab so users see only current-week (Wed–Tue, user-timezone-anchored) thoughts by default. Search and Chat bypass the window.

**Requirements covered:** ROLLOVER-01, ROLLOVER-02, ROLLOVER-03, ROLLOVER-04

**Out of scope (belongs to later phases):** applying the helper to Insights / Therapy / Therapy prep (Phase 89), server-side persistence of those outputs (Phase 90), Tasks filter (Phase 91), WO archive (Phase 92), PDF scope (Phase 93).

</domain>

<decisions>
## Implementation Decisions

### Helper API
- **D-01:** Ship two named pure functions in a new `vigil-core/src/utils/` module (name TBD by planner, e.g. `date-window.ts`):
  - `getCurrentWeekWindow(tz: string, now?: Date): { start: Date; end: Date }` — most recent Wed 00:00 in `tz` through next Wed 00:00.
  - `getRollingDayWindow(tz: string, days: number, now?: Date): { start: Date; end: Date }` — last N days ending now, aligned to day boundaries in `tz`.
- **D-02:** Return `Date` objects (both bounds). Feeds Drizzle's `gte`/`lte` in `thoughts.ts:137` with zero conversion.
- **D-03:** Helper is pure — callers pass `tz` string. Route handlers resolve tz via the existing settings lookup (see `settings.ts:172`) and pass it in. Helper does not touch the DB.
- **D-04:** `now` is injectable (optional) so tests can pin wall-clock time without mocking `Date`.
- **D-05:** Use native `Intl.DateTimeFormat` / `Date` for tz math — no new dependency (matches v3.x stance; no date lib in `package.json`).

### Rollover Enforcement
- **D-06:** Enforce on server. `GET /thoughts` defaults to the current-week window when no explicit scope param is present.
- **D-07:** Bypass rules on `GET /thoughts`:
  - `?q=<term>` present → window default is ignored (satisfies ROLLOVER-02 without client coordination).
  - `?after=...` or `?before=...` present → caller is explicitly scoping; window default is ignored.
  - `?window=all` present → window default is ignored (explicit "give me everything" escape hatch).
- **D-08:** Audit and update existing callers of `GET /thoughts` before shipping. Known call sites to check: PWA `useThoughts` hook, Mac CLI, browser extension, Chat retrieval, any brief-generation code paths. Callers that expected "all thoughts" must pass `window=all` explicitly.
- **D-09:** Chat's historical access (ROLLOVER-03) is preserved because Chat uses its own retrieval paths (not the `/thoughts` list default) — verify during audit; if any Chat path routes through `/thoughts`, it must pass `window=all`.

### Search Behavior
- **D-10:** Search bypass is server-side and automatic: any `?q=` parameter disables the week window. PWA `SearchBar` submits queries unchanged — no new client flag.
- **D-11:** While a search query is active, the Thoughts tab header swaps from the week label (see D-13) to `Search: all time` (exact copy TBD during UI-phase). Clears when search input clears.

### Thoughts Tab UX
- **D-12:** No prior-week browse UI in this phase. Search is the only way to reach older thoughts. A week picker / "View all thoughts" link is explicitly deferred.
- **D-13:** Compact header above the thought list: `This week · {start} – {end}` (dates derived from `getCurrentWeekWindow`, formatted in user tz; exact copy/format TBD during UI-phase).
- **D-14:** Empty state (Wed morning, no thoughts this week): friendly message along the lines of "No thoughts this week yet — capture one above." with a secondary hint: "Looking for older thoughts? Search." Exact copy TBD during UI-phase.
- **D-15:** Timezone change: ROLLOVER-04's "on next page load" semantics are confirmed. Changing tz in Settings does NOT live-recompute the visible window. The new boundary appears on next navigation/reload. No cache-invalidation plumbing in this phase.

### Claude's Discretion
- Exact module file name and layout under `vigil-core/src/utils/`.
- Exact copy for the week header, search header swap, and empty state (UI-phase will finalize).
- Unit test structure (Wed boundary at tz transitions, DST edges, non-Wed "now" values).
- Whether to emit a debug header/log with the computed window on `GET /thoughts` responses for verification.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requirements
- `.planning/ROADMAP.md` §"Phase 88" — phase goal, depends-on, success criteria
- `.planning/REQUIREMENTS.md` §ROLLOVER-01..04 — acceptance criteria wording

### Code touchpoints
- `vigil-core/src/routes/thoughts.ts` — GET /thoughts list endpoint (currently supports `after`/`before`, needs window default + bypass logic)
- `vigil-core/src/routes/settings.ts:172` — user timezone GET/PUT (source of truth for `tz` argument)
- `vigil-core/src/routes/settings.test.ts:287` — timezone default (`America/New_York`) test pattern
- `vigil-pwa/src/pages/ThoughtsPage.tsx` — Thoughts tab; header swap, empty state changes land here
- `vigil-pwa/src/components/SearchBar.tsx` — no client change expected; referenced to confirm
- `vigil-pwa/src/components/ThoughtList.tsx` — empty state rendering location

### Downstream consumers (not touched this phase, but design must support)
- Phase 89 will call `getRollingDayWindow(tz, 7)` from Insights / Therapy / Therapy-prep routes.

No external ADR/spec docs exist for this phase — requirements are fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vigil-core/src/routes/thoughts.ts:137-140` — `gte(createdAt, new Date(after))` / `lte(createdAt, new Date(before))` pattern. Window default slots in as additional `conditions.push(...)` entries when no explicit scope is present.
- `vigil-core/src/routes/settings.ts:172-188` — existing `getTimezone(db)` read path; route handlers can reuse it to resolve `tz` before calling the helper.

### Established Patterns
- Plain-function utilities (no classes) — matches single `utils/token-crypto.ts` precedent.
- Drizzle query conditions assembled into a `conditions[]` array, applied via `and(...conditions)`.
- No date library — native `Date` + `Intl` only. Helper implementation should follow suit.
- Pure helpers accept dependencies as args; DB lookups happen at route layer.

### Integration Points
- New `vigil-core/src/utils/<date-window>.ts` module (sibling to `token-crypto.ts`).
- Updated `GET /thoughts` handler in `vigil-core/src/routes/thoughts.ts`.
- Thoughts tab header / empty-state copy in `vigil-pwa/src/pages/ThoughtsPage.tsx` (+ possibly `ThoughtList.tsx`).
- Caller audit across: PWA thought hooks, Mac CLI thought reads, extension capture paths, Chat retrieval, brief-generation.

</code_context>

<specifics>
## Specific Ideas

- Week boundary is Wed 00:00 in user tz (per ROLLOVER-04). Current week = [most recent Wed 00:00, next Wed 00:00).
- Search (`?q=`) and explicit range (`?after`/`?before`) and `?window=all` are the three bypasses. All three ignore the default.
- UI copy ("This week · …", "Search: all time", empty-state wording) is placeholder — final strings settled during UI-phase.

</specifics>

<deferred>
## Deferred Ideas

- Week picker / previous-week navigation in the Thoughts tab — may become its own phase if users request it after v3.2.
- Live cache invalidation on timezone change — not needed for ROLLOVER-04's "next page load" semantics.
- Emitting window metadata in `GET /thoughts` response envelope — Claude's discretion; only if useful for client display or debugging.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 88-date-window-helper-rollover*
*Context gathered: 2026-04-15*
