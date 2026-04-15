# Phase 88: Date Window Helper & Weekly Rollover — Research

**Researched:** 2026-04-15
**Domain:** Server-side timezone math (native Intl/Date), Drizzle query composition, Hono route mutation, React prop interface changes
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Two named pure functions in `vigil-core/src/utils/<date-window>.ts`: `getCurrentWeekWindow(tz, now?)` and `getRollingDayWindow(tz, days, now?)`, both returning `{ start: Date; end: Date }`.
- **D-02:** Return `Date` objects. Feeds Drizzle `gte`/`lte` with zero conversion.
- **D-03:** Helper is pure — callers pass `tz`. Route handlers resolve tz via the existing settings lookup. Helper does not touch the DB.
- **D-04:** `now` is injectable (optional) for test clock-pinning without mocking `Date`.
- **D-05:** Native `Intl.DateTimeFormat` / `Date` only — no new dependency.
- **D-06:** Enforce on server. `GET /thoughts` defaults to current-week window when no explicit scope param is present.
- **D-07:** Three bypass rules on `GET /thoughts`: `?q=` present, `?after=`/`?before=` present, or `?window=all` present.
- **D-08:** Audit and update existing callers before shipping. Callers expecting "all thoughts" must pass `?window=all`.
- **D-09:** Chat's historical access preserved — Chat uses its own retrieval path (direct DB query, not `/thoughts` list). Verify during audit.
- **D-10:** Search bypass is server-side and automatic. No new client flag on SearchBar.
- **D-11:** While search query active, Thoughts tab header swaps from week label to `Search: all time`. Clears when search input clears.
- **D-12:** No prior-week browse UI. Search is the only way to reach older thoughts.
- **D-13:** Compact header above list: `This week · {start} – {end}`.
- **D-14:** Empty state: "No thoughts this week yet — capture one above." plus "Looking for older thoughts? Search."
- **D-15:** Timezone change uses "on next page load" semantics. No live cache invalidation.

### Claude's Discretion

- Exact module file name and layout under `vigil-core/src/utils/`.
- Exact copy for week header, search header swap, and empty state (UI-phase has now finalized — see UI-SPEC.md).
- Unit test structure (Wed boundary, DST edges, non-Wed "now" values).
- Whether to emit a debug header/log with the computed window on `GET /thoughts` responses.

### Deferred Ideas (OUT OF SCOPE)

- Week picker / previous-week navigation in the Thoughts tab.
- Live cache invalidation on timezone change.
- Emitting window metadata in `GET /thoughts` response envelope (Claude's discretion only if useful).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROLLOVER-01 | User sees only thoughts from current week (Wed–Tue) in Thoughts tab by default | `getCurrentWeekWindow` in `GET /thoughts` default; UI header shows bounded range |
| ROLLOVER-02 | User can access thoughts from any prior week via full-text search | `?q=` bypass in `GET /thoughts` disables window; search shows all-time results |
| ROLLOVER-03 | Chat queries have access to all historical thoughts regardless of rollover window | Chat.ts uses direct Drizzle query (no `GET /thoughts`); no change needed — confirm in audit |
| ROLLOVER-04 | Rollover boundary is Wednesday 00:00 in user's configured timezone | `getCurrentWeekWindow` anchors to most recent Wed 00:00 in IANA tz from settings; "next page load" semantics confirmed |
</phase_requirements>

---

## Summary

Phase 88 delivers a pure server-side date-window utility and wires it into `GET /thoughts` as a default filter. The core technical challenge is correct Wednesday-anchored week math in arbitrary IANA timezones using only native `Intl.DateTimeFormat` and `Date` — no external date library exists in the stack and none should be added.

The caller audit reveals five code paths that call `GET /thoughts` or read from the thoughts table. Two of them (`useTherapy` and `useInsights`) currently call `getThoughts({ limit: 200 })` with no date scoping and will silently lose cross-week history after this phase ships — they must add `window=all`. The Mac CLI's `triage` command also calls `/thoughts` without date scope and must add `window=all`. Chat's context injection queries the DB directly (not via the HTTP route) and is safe as-is. The extension only POSTs thoughts; it never GETs them.

The UI changes are minimal: a conditional header row in `ThoughtsPage.tsx` and an `isSearchActive` prop addition to `ThoughtList.tsx`. The UI-SPEC.md has locked all copy, colors, and structure — the planner should treat those as implementation-ready directives with no discretion remaining.

**Primary recommendation:** Implement the helper using the "get wall-clock parts in tz, find most recent Wednesday" algorithm. For DST safety, compute the Wednesday boundary as a wall-clock target in the named timezone rather than subtracting fixed millisecond offsets from UTC.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Intl.DateTimeFormat` | Built-in (Node 18+) | Resolve wall-clock date parts in arbitrary IANA tz | Only correct way to do tz math in pure JS without a date lib [VERIFIED: codebase — already used in settings.ts isValidTimezone()] |
| Drizzle ORM | 0.45.2 | Query composition with `gte`/`lte` on `createdAt` | Already in use; `conditions[]` array pattern already established [VERIFIED: vigil-core/package.json, thoughts.ts:136-141] |
| Node.js `node:test` + `node:assert/strict` | Built-in | Unit testing the helper | Already used for token-crypto.test.ts — house test framework [VERIFIED: token-crypto.test.ts, package.json scripts.test] |

### No New Dependencies
The phase explicitly prohibits new dependencies (D-05). Confirmed: no date library (`date-fns`, `dayjs`, `luxon`, `moment`) appears in `vigil-core/package.json`. [VERIFIED: vigil-core/package.json]

---

## Architecture Patterns

### Recommended Project Structure

```
vigil-core/src/utils/
├── token-crypto.ts          # existing
├── token-crypto.test.ts     # existing
├── date-window.ts           # NEW — pure helper
└── date-window.test.ts      # NEW — unit tests
```

`date-window.ts` is the natural name: descriptive, parallel to `token-crypto.ts`, no collision with any existing file. [ASSUMED — planner may choose differently per D-01 discretion]

### Pattern 1: Wed-Anchored Week Window via Wall-Clock Parts

**What:** To find "most recent Wednesday 00:00 in tz", decompose `now` into wall-clock components *in the target timezone*, compute how many days back the most recent Wednesday was, then re-assemble that wall-clock moment as a UTC `Date`.

**Why wall-clock, not UTC offset subtraction:** UTC offset varies across DST transitions. If you subtract `N * 86400000ms` from `now.getTime()` to find last Wednesday, you may land on the wrong wall-clock date when the intervening days include a DST spring-forward or fall-back. The correct approach resolves the wall-clock date in the named timezone at each step.

**The trap:** `new Date(year, month, day)` creates a date in the *local system timezone*, not in the user's tz. On a Railway server running UTC, `new Date(2024, 2, 13, 0, 0, 0)` is UTC midnight, not `America/New_York` midnight. You must convert back from tz-local wall clock to UTC explicitly.

**Correct algorithm:** [ASSUMED — pattern derived from Intl.DateTimeFormat semantics; test suite will validate]

```typescript
// Source: derived from Intl.DateTimeFormat 'en-CA' locale trick + standard tz math
export function getCurrentWeekWindow(tz: string, now: Date = new Date()): { start: Date; end: Date } {
  // Step 1: Get wall-clock parts of `now` in the target timezone
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // 'en-CA' produces "YYYY-MM-DD" — stable, parseable format
  const [year, month, day] = fmt.format(now).split('-').map(Number);
  
  // Step 2: What day of week is `now` in tz?
  const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const dow = dowFmt.format(now); // "Sun", "Mon", ..., "Sat"
  
  // Step 3: Days since most recent Wednesday (0 = today is Wed, 1 = today is Thu, etc.)
  const DOW_TO_DAYS_SINCE_WED: Record<string, number> = {
    Wed: 0, Thu: 1, Fri: 2, Sat: 3, Sun: 4, Mon: 5, Tue: 6
  };
  const daysSinceWed = DOW_TO_DAYS_SINCE_WED[dow];
  
  // Step 4: Compute wall-clock Wednesday date in tz
  const wednesdayDate = day - daysSinceWed;
  // Handle month underflow by working with a reference Date and then re-resolving
  const approxWed = new Date(now.getTime() - daysSinceWed * 86400_000);
  // approxWed is ~Wednesday in UTC but may be off by 1 day at DST boundary —
  // snap it to exactly Wed 00:00 in tz using the wall-clock-to-UTC converter below
  const wedParts = fmt.format(approxWed).split('-').map(Number);
  
  // Step 5: Convert Wed wall-clock 00:00 tz → UTC Date
  const start = wallClockToUtc(wedParts[0], wedParts[1], wedParts[2], 0, 0, 0, tz);
  const end = wallClockToUtc(wedParts[0], wedParts[1], wedParts[2] + 7, 0, 0, 0, tz);
  
  return { start, end };
}

// wallClockToUtc: binary-search a UTC timestamp whose wall-clock representation
// in `tz` matches the given year/month/day/hour/min/sec.
// This is the canonical approach — no external library needed.
function wallClockToUtc(
  year: number, month: number, day: number,
  hour: number, min: number, sec: number,
  tz: string
): Date {
  // Initial estimate: UTC midnight (will be off by offset)
  let guess = Date.UTC(year, month - 1, day, hour, min, sec);
  for (let i = 0; i < 3; i++) {
    const actual = getWallClockParts(new Date(guess), tz);
    const diff = Date.UTC(year, month - 1, day, hour, min, sec)
               - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.min, actual.sec);
    guess += diff;
  }
  return new Date(guess);
}
```

**Simpler production-safe implementation** [ASSUMED — recommended approach for the planner]:

The binary-search `wallClockToUtc` converges in 2–3 iterations for all practical timezones. During DST "fall-back", the target wall-clock time may be ambiguous (occurs twice). The convention is to use the earlier (standard time) occurrence — which the binary search naturally converges to — consistent with how `Intl.DateTimeFormat` reports times.

### Pattern 2: Rolling Day Window

```typescript
// Source: derived pattern [ASSUMED]
export function getRollingDayWindow(tz: string, days: number, now: Date = new Date()): { start: Date; end: Date } {
  const end = now; // "ending now" — not aligned to day boundary per spec
  // Align start to 00:00 on (today - days) in tz
  const startApprox = new Date(now.getTime() - days * 86400_000);
  const parts = getWallClockParts(startApprox, tz);
  const start = wallClockToUtc(parts.year, parts.month, parts.day, 0, 0, 0, tz);
  return { start, end };
}
```

Phase 89 (Insights/Therapy/Therapy-prep) will call this with `days=7`. This phase ships the function but it only needs `getCurrentWeekWindow` for ROLLOVER-01..04.

### Pattern 3: Drizzle Condition Injection

**Current structure in `thoughts.ts`:**
```typescript
const conditions = [ne(thoughtsTable.syncStatus, "pendingDeletion")];
// ... other filters pushed conditionally ...
if (after) { conditions.push(gte(thoughtsTable.createdAt, new Date(after))); }
if (before) { conditions.push(lte(thoughtsTable.createdAt, new Date(before))); }
const whereCondition = and(...conditions);
```
[VERIFIED: vigil-core/src/routes/thoughts.ts:103-143]

**Window default injection — exact location:**
Insert after all existing filter pushes but before `const whereCondition = and(...conditions)`. The bypass check must evaluate ALL three bypass conditions first:

```typescript
// Resolve timezone from settings (call getTimezone helper — see settings.ts:172-185)
const window = c.req.query("window");
const bypassWindow = !!q || !!after || !!before || window === "all";
if (!bypassWindow) {
  const tz = await getTimezone(db); // reuse existing settings read path
  const { start, end } = getCurrentWeekWindow(tz);
  conditions.push(gte(thoughtsTable.createdAt, start));
  conditions.push(lte(thoughtsTable.createdAt, end));
}
```

**Key insight about `?window=all`:** The `window` query param is new. No existing caller passes it today. Existing callers that need all-time access must add it after the window default ships.

### Pattern 4: Settings Timezone Lookup in Route Handlers

The existing pattern in `settings.ts:172-185` reads from `appSettings` table with key `user_timezone`, defaulting to `America/New_York`. [VERIFIED: settings.ts:172-188]

For `thoughts.ts`, the simplest approach is an inline DB read (same pattern, no new abstraction needed):
```typescript
const tzRows = await db.select({ value: appSettings.value })
  .from(appSettings)
  .where(eq(appSettings.key, "user_timezone"))
  .limit(1);
const tz = tzRows.length > 0 ? tzRows[0].value as string : "America/New_York";
```

The `appSettings` table and `eq` import are not currently in `thoughts.ts` — they must be added. This is a small import addition only. [VERIFIED: thoughts.ts imports — appSettings not present; settings.ts:3-4 shows the import pattern]

### Anti-Patterns to Avoid

- **UTC offset subtraction for boundary math:** `now.getTime() - N * 86400_000` is wrong when a DST transition occurs between `now` and the target boundary. Always use wall-clock-in-tz resolution.
- **`new Date(year, month, day)` for tz-local midnight:** Constructs in system timezone (UTC on Railway), not user tz. Use `wallClockToUtc` or equivalent.
- **Assuming `Intl.DateTimeFormat` locale format is stable:** `en-CA` producing `YYYY-MM-DD` is stable in V8/Node.js in practice but using the `{ year, month, day }` parts API (`formatToParts`) is more robust for production code.
- **Forgetting `lte` is exclusive/inclusive:** Drizzle's `lte` is inclusive. The week window is `[start, end)` semantically (start inclusive, end exclusive). Use `lte(createdAt, end)` only if `end` is Wed 00:00:00.000 — any thought created exactly at Wed midnight would be included in both weeks. The safer choice is `lt(createdAt, end)` for the end bound. [ASSUMED — confirm Drizzle `lt` import exists; it is in the `drizzle-orm` import but not in thoughts.ts currently]

**Note on `lt` vs `lte`:** `lt` (strict less than) is not currently imported in `thoughts.ts`. It needs to be added to the import from `drizzle-orm`. `lt` is exported by drizzle-orm. [ASSUMED — verify at implementation time]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone validity check | Custom regex or IANA list lookup | `new Intl.DateTimeFormat('en-US', { timeZone: tz })` — already done in settings.ts `isValidTimezone()` | V8 throws on invalid tz string; catch the error |
| DST-aware UTC↔wall-clock conversion | Lookup tables, hardcoded offset arrays | `Intl.DateTimeFormat.formatToParts()` → iterate to UTC via binary search | Correct for all IANA zones, handles DST transitions |
| Test clock pinning | `jest.useFakeTimers()`, monkey-patching `Date.now` | Injectable `now?: Date` parameter (D-04 is already the decision) | Zero test framework overhead; pure function |

---

## Caller Audit Map

This is the complete set of code paths that call `GET /thoughts` (the HTTP route) or read from the thoughts table, and what action each needs.

### PWA `useThoughts` hook
**File:** `vigil-pwa/src/hooks/useThoughts.ts`
**Current behavior:** Calls `getThoughts({ category, q, source, after, before, favoritesOnly, limit: 50 })`. When `q` is set, it's already forwarded — the server-side bypass will fire correctly. When no scope is set, it will receive the week window after this phase. [VERIFIED: useThoughts.ts:25-33]
**Action needed:** The `ThoughtsPage` usage is the intended consumer of the window default. No `window=all` needed here. The `dateAfter`/`dateBefore` filters in `FilterBar` already trigger the `?after=`/`?before=` bypass.
**Status: Safe — no change needed for ROLLOVER behavior.**

### PWA `useInsights` hook
**File:** `vigil-pwa/src/hooks/useInsights.ts`
**Current behavior:** Calls `getThoughts({ limit: 200 })` — no category, no date scope. After this phase, it will receive only current-week thoughts, silently breaking insight generation for users with <3 thoughts this week. [VERIFIED: useInsights.ts:19]
**Action needed:** Add `window: 'all'` parameter. This requires:
  1. Adding `window?: 'all'` to `getThoughts` params in `vigil-pwa/src/api/client.ts`
  2. Setting `qs.set('window', 'all')` when `params.window === 'all'`
  3. Updating the `useInsights` call to `getThoughts({ limit: 200, window: 'all' })`
**Status: MUST FIX — add `window=all`.**

### PWA `useTherapy` hook
**File:** `vigil-pwa/src/hooks/useTherapy.ts`
**Current behavior:** Calls `getThoughts({ limit: 200 })` twice (for pattern analysis and therapy prep). Same issue as `useInsights` — will silently lose cross-week therapy thoughts. [VERIFIED: useTherapy.ts:32, :63]
**Action needed:** Both calls need `window: 'all'`. Therapy context requires full history to be meaningful.
**Status: MUST FIX — add `window=all` to both calls.**

### PWA `useProjects` hook
**File:** `vigil-pwa/src/hooks/useProjects.ts`
**Current behavior:** Calls `getThoughts({ projectId: p.id, limit: 200 })` and `getThoughts({ unassigned: true, limit: 200 })`. These pass explicit `projectId` or `unassigned` but NOT `?after=`/`?before=` — the window default WILL apply to project thought lists. Project thoughts from prior weeks would disappear from the projects view. [VERIFIED: useProjects.ts:26, :32]
**Action needed:** Add `window: 'all'` to both calls. Project membership is not time-scoped.
**Status: MUST FIX — add `window=all`.**

### Mac CLI (`DailyBrief.swift` triage command)
**File:** `Sources/DailyBrief/DailyBrief.swift`
**Current behavior:** `apiClient.get(path: "/thoughts", query: ["limit": String(fetchLimit), "offset": "0"])`. Fetches thoughts for triage — expects full unscoped list. After this phase, only current-week thoughts would be triaged. [VERIFIED: DailyBrief.swift:458-461]
**Action needed:** Add `"window": "all"` to the query dictionary.
**Status: MUST FIX — add `window=all`.**

### Browser Extension (`vigil-extension/popup.js`)
**Current behavior:** Only POSTs to `/v1/thoughts` (POST to create). Never GETs thoughts. [VERIFIED: popup.js:112]
**Action needed:** None.
**Status: Safe — no change needed.**

### Chat context injection (`vigil-core/src/routes/chat.ts`)
**Current behavior:** Direct Drizzle query on `thoughtsTable` ordered by `createdAt` desc, limited to `contextLimit` (20 default, 50 max). Does NOT go through `GET /thoughts` route. [VERIFIED: chat.ts:61-73]
**Action needed:** None — D-09 confirmed. Chat reads from DB directly; the route-level window default has no effect.
**Status: Safe — no change needed. Satisfies ROLLOVER-03.**

### Brief assembly service (`vigil-core/src/services/brief-assembly-service.ts`)
**Current behavior:** Three direct Drizzle queries (`fetchTaskThoughts`, `fetchRecentThoughts`, `fetchUnprocessedThoughts`) — all unscoped, limit 8–20. Does NOT go through `GET /thoughts` route. [VERIFIED: brief-assembly-service.ts:200-239]
**Action needed:** None for Phase 88. SCOPE-04 (7-day window for PDF) is deferred to Phase 93.
**Status: Safe for Phase 88 — no change needed.**

### Smoke test (`vigil-core/scripts/smoke-test.ts`)
**Current behavior:** Calls `api("/thoughts")` bare — no scope. After this phase, the smoke test will only see current-week thoughts. The test creates a thought then checks for it in the list — if both the create and the GET happen in the same request cycle (same wall-clock second), the thought will be in the current week and the test will pass. [VERIFIED: smoke-test.ts:116-136]
**Action needed:** The smoke test should add `?window=all` to the list call to remain reliable regardless of when in the week it runs. This is a test reliability fix, not a behavior fix.
**Status: LOW RISK but recommended fix.**

---

## DST Edge Cases — The Traps and Correct Approaches

### Spring-Forward Wednesday (e.g., America/New_York, second Sunday in March)
The spring-forward transition in the US always occurs on a Sunday (2:00 AM → 3:00 AM). Wednesday 00:00 Eastern on a spring-forward week is unambiguous — no gap occurs at midnight. The transition Sunday has a missing hour (2:00–3:00 AM), not Wednesday midnight. **Result: No special handling needed for US timezones where DST transitions are on Sundays.**

### Fall-Back Wednesday (rare — depends on jurisdiction)
Most jurisdictions with DST set transitions on Sundays. In rare zones where a transition could land on a Wednesday (e.g., some historical/hypothetical rules), a fall-back at 2:00 AM means 01:30 AM occurs twice. Wednesday 00:00 AM is unambiguous (before the transition). The binary-search converges to the first (pre-transition) occurrence of any ambiguous time, which is correct for boundary semantics.

### Pacific/Kiritimati (+14)
UTC+14. No DST. Wednesday 00:00 is well-defined. The wall-clock-to-UTC conversion subtracts 14 hours. The week window in UTC would start on Tuesday 10:00 AM UTC. Test case: confirm `start.getUTCDay() === 2` (Tuesday) and `start.getUTCHours() === 10`. [ASSUMED — calculation]

### Pacific/Pago_Pago (-11)
UTC-11. No DST. Wednesday 00:00 is well-defined. Converts to Wednesday 11:00 AM UTC. Test case: confirm `start.getUTCDay() === 3` (Wednesday) and `start.getUTCHours() === 11`. [ASSUMED — calculation]

### Southern-hemisphere DST (e.g., Australia/Sydney)
DST transitions occur in October (spring) and April (fall) — opposite of Northern Hemisphere. Transitions are on Sundays. Same analysis as Northern Hemisphere spring-forward/fall-back applies. Wednesday boundaries are unaffected.

### Non-Wednesday "now" values
The algorithm must handle any day. For a `now` on Sunday: `daysSinceWed = 4` (Sun is 4 days after Wed). For Monday: 5. For Tuesday: 6. These are the largest lookbacks.

### Wednesday exactly at 00:00:00.000
`daysSinceWed = 0`. The window starts at exactly `now` (midnight). Important test: a thought created at `Wed 00:00:01` is inside the window; one created at `Tue 23:59:59` is outside.

### Wednesday just before midnight (23:59:59)
`daysSinceWed = 0`. Window still starts at the most recent Wednesday 00:00. `now` is late in the same window day — the end is next Wednesday 00:00.

---

## Common Pitfalls

### Pitfall 1: Forgetting to import `appSettings` in `thoughts.ts`
**What goes wrong:** The timezone lookup requires `appSettings` from `../db/schema.js` and `eq` from `drizzle-orm` — neither is currently imported in `thoughts.ts`.
**Why it happens:** `thoughts.ts` handles thought CRUD only; it has never needed settings access.
**How to avoid:** Add to imports: `import { appSettings } from "../db/schema.js"` (already has `eq` from drizzle-orm — check: yes, `eq` is in the import at line 5). Actually `eq` IS already imported. Only `appSettings` needs to be added. [VERIFIED: thoughts.ts:1-6]

### Pitfall 2: `window` query param name collision
**What goes wrong:** `window` is a global in browser environments. On the server (Node.js/Hono), there is no global `window`, but it is a reserved-looking name that could confuse readers.
**How to avoid:** The parameter is read via `c.req.query("window")` and stored as `const windowParam = c.req.query("window")` — never as `const window = ...`. The planner should use `windowParam` as the local variable name to avoid shadowing confusion.

### Pitfall 3: `useProjects` silently scoping project thought lists
**What goes wrong:** `useProjects` calls `getThoughts({ projectId: p.id })` without `window=all`. After this phase, the Projects page would only show current-week thoughts within each project.
**Why it happens:** The window default applies to ALL GET /thoughts calls without bypass, including calls with other filters like `projectId`.
**How to avoid:** Add `window=all` to `useProjects` calls. [VERIFIED: useProjects.ts:26, :32]

### Pitfall 4: `lt` vs `lte` for the end bound
**What goes wrong:** Using `lte(createdAt, end)` where `end = next Wednesday 00:00:00.000` means a thought created at exactly next Wednesday midnight is included in the current window AND would also appear in next week's window (which starts at the same timestamp). This is a one-millisecond overlap edge case.
**How to avoid:** Use `lt(createdAt, end)` (strict less than). `lt` must be added to the drizzle-orm import in `thoughts.ts`. Current import: `eq, and, ne, gte, lte, desc, count, sql, isNull`. Add `lt`. [VERIFIED: thoughts.ts:5]

### Pitfall 5: `getThoughts` API client missing `window` param
**What goes wrong:** If `vigil-pwa/src/api/client.ts` `getThoughts()` doesn't support a `window` param, the PWA hooks can't pass `window=all`.
**How to avoid:** The `getThoughts` function params interface and URLSearchParams builder must be updated to support `window?: 'all'`. [VERIFIED: client.ts:70-96 — `window` is absent from params]

### Pitfall 6: Smoke test becomes week-dependent
**What goes wrong:** `smoke-test.ts` creates a thought and immediately lists `/thoughts`. If the smoke test runs before the route change ships, it works. After the route change, the newly created thought will be in the current week and will appear — unless the server clock and DB have different timezone assumptions. Low risk but not deterministic.
**How to avoid:** Update smoke test's list call to `/thoughts?window=all` to make it timezone/week independent.

---

## Code Examples

### Getting timezone in a Hono route handler
```typescript
// Source: settings.ts:178-185 pattern [VERIFIED]
const tzRows = await db
  .select({ value: appSettings.value })
  .from(appSettings)
  .where(eq(appSettings.key, "user_timezone"))
  .limit(1);
const tz = tzRows.length > 0 ? (tzRows[0].value as string) : "America/New_York";
```

### Intl.DateTimeFormat parts extraction (robust alternative to 'en-CA' trick)
```typescript
// Source: MDN Intl.DateTimeFormat.formatToParts [ASSUMED — canonical API usage]
function getWallClockParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day'),
           hour: get('hour'), min: get('minute'), sec: get('second') };
}
```

### Existing Drizzle condition pattern (reference)
```typescript
// Source: thoughts.ts:136-141 [VERIFIED]
if (after) {
  conditions.push(gte(thoughtsTable.createdAt, new Date(after)));
}
if (before) {
  conditions.push(lte(thoughtsTable.createdAt, new Date(before)));
}
```

### Test structure (node:test pattern)
```typescript
// Source: token-crypto.test.ts pattern [VERIFIED]
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCurrentWeekWindow } from "./date-window.js";

test("DW-01: non-Wed now returns most recent Wed as start", () => {
  // Thursday 2024-01-11 12:00:00 UTC = Thursday 07:00 in America/New_York (EST, UTC-5)
  const now = new Date("2024-01-11T12:00:00Z");
  const { start } = getCurrentWeekWindow("America/New_York", now);
  // Most recent Wednesday in ET: 2024-01-10 00:00 ET = 2024-01-10T05:00:00Z
  assert.equal(start.toISOString(), "2024-01-10T05:00:00.000Z");
});
```

### ThoughtsPage header conditional (from UI-SPEC.md)
```tsx
// Source: 88-UI-SPEC.md [VERIFIED — locked copy]
{debouncedQuery === '' ? (
  <p className="text-xs mb-2 text-left" role="status" aria-live="polite">
    <span className="text-teal-400 font-medium">This week</span>
    <span className="text-gray-400"> · {formattedStart} – {formattedEnd}</span>
  </p>
) : (
  <p className="text-xs mb-2 text-left" role="status" aria-live="polite">
    <span className="text-teal-400 font-medium">Search</span>
    <span className="text-gray-400"> · all time</span>
  </p>
)}
```

---

## Validation Architecture

This section maps ROLLOVER-01..04 to testable probes. The test framework is `node:test` + `node:assert/strict` (existing house framework). [VERIFIED: package.json test script, token-crypto.test.ts]

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — test files discovered via `tsx --test "src/**/*.test.ts"` |
| Quick run command | `cd vigil-core && npm test -- --test-name-pattern "DW-"` |
| Full suite command | `cd vigil-core && npm test` |

### ROLLOVER-01: Week window default on GET /thoughts
**Behavior:** Bare `GET /thoughts` with no scope params returns only thoughts from `[most recent Wed 00:00, next Wed 00:00)` in user's tz.
**Test type:** Unit (pure function) + Integration (route-level)
**Unit tests in `date-window.test.ts`:**
- `DW-01`: Non-Wed `now` → correct `start` (most recent Wed)
- `DW-02`: `now` is Wed 00:00:00.000 exactly → `start` equals `now`
- `DW-03`: `now` is Wed 23:59:59 → same week window as DW-01
- `DW-04`: `now` is Tue 23:59:59 (6 days after last Wed) → `start` is 6 days prior Wed
- `DW-05`: `America/New_York` spring-forward week (DST transition is on Sunday) → Wednesday boundary is unaffected
- `DW-06`: `America/New_York` fall-back week → Wednesday boundary is unaffected
- `DW-07`: `Pacific/Kiritimati` (+14) → UTC representation of Wed midnight is 14 hours earlier (Tuesday UTC)
- `DW-08`: `Pacific/Pago_Pago` (-11) → UTC representation is 11 hours later
- `DW-09`: `now` injectable — same function called with two different `now` values returns two different windows

**Route-level verification (manual probe / smoke test):**
```bash
# Create a thought with a known old createdAt (insert directly or via triage script)
# Then call GET /thoughts bare — confirm old thought absent
curl -s "$VIGIL_URL/v1/thoughts" -H "Authorization: Bearer $KEY" | jq '.total'
# With ?window=all — confirm old thought present
curl -s "$VIGIL_URL/v1/thoughts?window=all" -H "Authorization: Bearer $KEY" | jq '.total'
```

### ROLLOVER-02: Search bypasses the window
**Behavior:** `GET /thoughts?q=term` returns all-time matching thoughts regardless of week.
**Test type:** Unit (bypass logic check) + Manual UAT
**Unit tests (in a `thoughts.ts` integration test or route test):**
- `RO2-01`: Request with `?q=anything` → window conditions NOT added to Drizzle query
**Manual probe:**
```bash
# Capture an old thought (inject createdAt in the past)
# Search for its content — expect it to appear
curl -s "$VIGIL_URL/v1/thoughts?q=oldthought" -H "Authorization: Bearer $KEY" | jq '.total'
```

### ROLLOVER-03: Chat accesses all history
**Behavior:** POST /chat with `includeContext: true` includes thoughts from all weeks as context.
**Test type:** Confirm at code level (no change needed) + smoke probe
**Confirmation:** `chat.ts:61-73` uses direct Drizzle `select` from `thoughtsTable` with no date filter. This is already all-time. [VERIFIED: chat.ts]
**Probe:** POST a chat message referencing content from a thought created >7 days ago — verify AI response references it.
```bash
curl -s -X POST "$VIGIL_URL/v1/chat" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What do you know about my old thoughts?"}],"contextLimit":50}'
```

### ROLLOVER-04: Rollover boundary is Wednesday 00:00 in user tz
**Behavior:** When user tz is `America/New_York`, the window start is Wed 00:00 ET (not UTC). Changing tz in Settings → new boundary appears on next page load.
**Test type:** Unit (tz correctness) + Manual UAT
**Unit test:** `DW-01` above verifies the ET→UTC conversion. Additional:
- `DW-10`: Same `now` with `America/Los_Angeles` (UTC-8) → `start` is 3 hours later in UTC than with `America/New_York` (UTC-5)
**Manual UAT:**
1. Set tz to `America/New_York` in Settings
2. Confirm Thoughts tab header shows `Wed Apr 9 – Tue Apr 15` (or current week)
3. Change tz to `Asia/Tokyo` (UTC+9)
4. **Without reloading:** Confirm header still shows old range (D-15 semantics)
5. Reload page: confirm header updates to Tokyo-anchored range

### Wave 0 Gaps
- [ ] `vigil-core/src/utils/date-window.test.ts` — covers DW-01..DW-10 (new file)
- [ ] No framework install needed — `node:test` is built-in

---

## UI Integration Points (From UI-SPEC.md — Locked)

All copy, colors, and structure are locked. No discretion remaining for the executor. Key facts:

- **Header location:** Between `<CategoryTabs>` and the `<div className="flex-1 overflow-y-auto mt-4">` in `ThoughtsPage.tsx` [VERIFIED: ThoughtsPage.tsx:199-202]
- **Header visibility:** `debouncedQuery === ''` → week header; otherwise search header. `debouncedQuery` is already in scope in `ThoughtsPage.tsx`. [VERIFIED: ThoughtsPage.tsx:14, :27-29]
- **Date format for header:** `Intl.DateTimeFormat` with `{ weekday: 'short', month: 'short', day: 'numeric' }` in `navigator.language` locale. Example: `Wed Apr 9 – Tue Apr 15`. [VERIFIED: UI-SPEC.md]
- **`formattedStart` / `formattedEnd` derivation:** The PWA needs to know the week boundaries for display. Options: (a) compute client-side using the user's tz from settings, (b) include in API response. D-15 and the deferred "emit window metadata" note suggest client-side computation. The `useThoughts` hook will need to expose (or a sibling hook will need to compute) `{ start, end }` from `getCurrentWeekWindow` — but this is a *client-side* reimplementation of the same algorithm using `Intl`, not a call to the server. **The planner must add a client-side `getWeekWindow(tz)` helper or inline the date formatting in `ThoughtsPage.tsx`.**
- **Timezone on the client:** The PWA must read the user tz from `GET /settings/timezone` to compute the correct display dates. The hook or component needs a `useTimezone()` hook or similar to fetch and cache this value. [ASSUMED — no existing client-side tz hook found in codebase]
- **`ThoughtList.tsx` prop change:** Add `isSearchActive: boolean` to `ThoughtListProps`. The caller in `ThoughtsPage.tsx` passes `isSearchActive={debouncedQuery !== ''}`. [VERIFIED: ThoughtList.tsx:4-15, ThoughtsPage.tsx:202-213]
- **Empty state trigger:** `thoughts.length === 0 && !isLoading && error === null && !isSearchActive` [VERIFIED: UI-SPEC.md]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `date-window.ts` is the right file name | Architecture Patterns | Low — planner has discretion per D-01 |
| A2 | Binary-search `wallClockToUtc` converges in 2–3 iterations for all IANA zones | Architecture Patterns | Medium — if a zone has a >24h offset anomaly (none exist in real IANA data), may need more iterations |
| A3 | DST transitions in US zones always occur on Sundays (not Wednesdays) | DST Edge Cases | Low — true in all US zones historically; IANA database confirms |
| A4 | `lt` (strict less than) is exported by `drizzle-orm` 0.45.2 | Don't Hand-Roll / Pitfalls | Low — standard Drizzle operator; if absent use `lte` with `end - 1ms` |
| A5 | The PWA needs a client-side week window computation for header display | UI Integration Points | Medium — if a different approach (API response metadata) is chosen, the client-side helper is not needed |
| A6 | No existing `useTimezone()` hook in the PWA | UI Integration Points | Low — grep found no such hook; if one exists it can be reused |

---

## Open Questions

1. **Client-side week boundary computation for the header display**
   - What we know: `ThoughtsPage.tsx` needs `formattedStart` and `formattedEnd` to render the week header. The server computes the window; the client needs to format it.
   - What's unclear: Does the planner want to (a) fetch the window from the server (e.g., a new `GET /thoughts/window` endpoint or by including it in the response envelope), or (b) reimplement `getCurrentWeekWindow` logic client-side in the PWA using `Intl.DateTimeFormat`?
   - Recommendation: Option (b) — inline client-side computation in `ThoughtsPage.tsx` using `navigator.language` and the tz from `GET /settings/timezone`. This keeps the server focused on data filtering and the client focused on display. The algorithm is short (<20 lines). No additional API round-trip.

2. **Should `thoughts.ts` be modified to import `appSettings` or extract to a shared helper?**
   - What we know: The tz lookup is one DB read. Settings.ts already has the pattern.
   - What's unclear: Whether a shared `getTimezone(db)` function should be extracted to avoid duplication (since Phase 89 routes will also need tz).
   - Recommendation: Extract a `getTimezone(db)` utility function — either in `date-window.ts` itself (since it's a dependency of the window helpers) or as a separate `utils/get-timezone.ts`. Phase 89 will reuse it.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is code-only changes with no new external dependencies. All tooling (`tsx`, `node:test`, TypeScript) is already installed and in active use. [VERIFIED: vigil-core/package.json]

---

## Sources

### Primary (HIGH confidence)
- `vigil-core/src/routes/thoughts.ts` — GET /thoughts handler, Drizzle conditions pattern [VERIFIED]
- `vigil-core/src/routes/settings.ts:172-188` — timezone read path [VERIFIED]
- `vigil-core/src/utils/token-crypto.ts` + `token-crypto.test.ts` — plain-function utility + test pattern [VERIFIED]
- `vigil-pwa/src/hooks/useThoughts.ts` — PWA primary consumer [VERIFIED]
- `vigil-pwa/src/hooks/useInsights.ts` — unscoped `getThoughts` caller needing `window=all` [VERIFIED]
- `vigil-pwa/src/hooks/useTherapy.ts` — two unscoped `getThoughts` callers needing `window=all` [VERIFIED]
- `vigil-pwa/src/hooks/useProjects.ts` — two unscoped `getThoughts` callers needing `window=all` [VERIFIED]
- `vigil-core/src/routes/chat.ts` — direct Drizzle query, no HTTP /thoughts dependency [VERIFIED]
- `vigil-core/src/services/brief-assembly-service.ts` — direct Drizzle queries, no HTTP /thoughts dependency [VERIFIED]
- `vigil-extension/popup.js:112` — only POSTs, never GETs thoughts [VERIFIED]
- `Sources/DailyBrief/DailyBrief.swift:458-461` — Mac CLI triage command GETs /thoughts without scope [VERIFIED]
- `vigil-pwa/src/pages/ThoughtsPage.tsx` — header insertion point identified [VERIFIED]
- `vigil-pwa/src/components/ThoughtList.tsx` — empty state location, props interface [VERIFIED]
- `.planning/phases/88-date-window-helper-rollover/88-CONTEXT.md` — all decisions [VERIFIED]
- `.planning/phases/88-date-window-helper-rollover/88-UI-SPEC.md` — locked UI contract [VERIFIED]
- `vigil-core/package.json` — no date library present, confirms D-05 [VERIFIED]

### Secondary (MEDIUM confidence)
- MDN Intl.DateTimeFormat.formatToParts — referenced for `formatToParts` API correctness

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in package.json and existing code
- Architecture: HIGH — exact existing patterns identified in source; algorithm is HIGH for `formatToParts` approach, MEDIUM for binary-search `wallClockToUtc` (well-known pattern but not verified via external source this session)
- Caller audit: HIGH — all five named callers found and classified; no other GET /thoughts callers exist outside of scripts
- Pitfalls: HIGH — all identified from direct code inspection
- DST edge cases: MEDIUM — US-specific DST knowledge HIGH; non-US zones ASSUMED

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable APIs, no fast-moving dependencies)
