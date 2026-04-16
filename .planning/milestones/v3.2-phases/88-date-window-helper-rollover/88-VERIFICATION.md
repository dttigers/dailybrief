---
phase: 88-date-window-helper-rollover
verified: 2026-04-15T18:35:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Check C — empty-state (zero thoughts this week)"
    expected: "Empty Thoughts tab shows three-line copy: 'No thoughts this week yet' / 'Capture one above to get started.' / dimmed 'Looking for older thoughts? Search above.'"
    why_human: "No zero-thought week was available during Plan 04 UAT. Code path verified by reading ThoughtList.tsx — copy is exactly correct and branch logic is wired. Human confirm needed only to observe the rendered state."
---

# Phase 88: Date Window Helper & Weekly Rollover — Verification Report

**Phase Goal:** The Thoughts tab shows only this-week (Wed–Tue, user-timezone-anchored) thoughts by default; a shared server-side date-window helper becomes the single source of truth for all subsequent scope/rollover work.
**Verified:** 2026-04-15T18:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening the Thoughts tab shows only thoughts created since the most recent Wednesday 00:00 in the user's configured timezone | ✓ VERIFIED | `thoughts.ts:169-181`: `shouldBypassWindow` checked; when false, `getCurrentWeekWindow(tz)` called and `gte/lt` conditions pushed. `useThoughts.ts` has zero occurrences of `window: 'all'` — it is the intended week-default consumer. Human-verified in live PWA (Check A passed 2026-04-15). |
| 2 | Full-text search from the Thoughts tab returns matches from prior weeks (rollover does not gate search) | ✓ VERIFIED | `shouldBypassWindow` returns `true` when `q` is set (`thoughts.ts:28`). `ThoughtsPage.tsx:229` shows `Search · all time` header when `debouncedQuery !== ''`. Human-verified in live PWA (Check B passed 2026-04-15). |
| 3 | Asking Chat about something from a prior week returns an answer (Chat context window is unchanged by rollover) | ✓ VERIFIED | `chat.ts` has 0 occurrences of `getCurrentWeekWindow` or `window=all` (grep confirmed). Chat uses direct Drizzle query (`db.select().from(thoughtsTable).orderBy(desc(...)).limit(contextLimit)`). RO-08 sentinel test passes in CI. |
| 4 | Changing the user's timezone in Settings shifts the Wed–Tue boundary accordingly on next page load | ✓ VERIFIED | `useTimezone.ts:37` has `}, [])` — empty deps array (D-15 compliant, fetch-once). `ThoughtsPage.tsx:140` calls `getCurrentWeekWindow(tz)` with the fetched tz. Human-verified in live PWA (Check D passed 2026-04-15). |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/utils/date-window.ts` | Pure date-window helpers with `getCurrentWeekWindow` + `getRollingDayWindow` | ✓ VERIFIED | 178 lines. Exports exactly the two declared functions. Zero imports. Uses `Intl.DateTimeFormat` + `Date` only. |
| `vigil-core/src/utils/date-window.test.ts` | DW-01..DW-13 unit tests all passing | ✓ VERIFIED | 130 lines. All 13 DW-NN tests pass (confirmed by `npm test` run: 170 pass, 0 fail, 5 skipped). |
| `vigil-core/src/routes/thoughts.ts` | GET /thoughts with week-window default and three bypass rules | ✓ VERIFIED | `shouldBypassWindow` exported; `windowParam = c.req.query("window")`; `bypassWindow = shouldBypassWindow(...)` guards `getCurrentWeekWindow(tz)` call; end bound uses `lt` not `lte`. |
| `vigil-core/src/routes/thoughts.test.ts` | RO-06..RO-08 passing; RO-01..RO-05 explicitly skipped | ✓ VERIFIED | 101 lines. RO-06, RO-06b, RO-07, RO-07b, RO-07c, RO-07d, RO-08 all pass. RO-01..RO-05 are `test.skip` with comments. No silent omissions. |
| `vigil-pwa/src/api/client.ts` | `getThoughts` with `window?: 'all'` parameter | ✓ VERIFIED | `window?: 'all'` at line 81; `if (params.window) qs.set('window', params.window)` at line 94. |
| `vigil-pwa/src/hooks/useInsights.ts` | Calls `getThoughts({ limit: 200, window: 'all' })` | ✓ VERIFIED | Line 19: `getThoughts({ limit: 200, window: 'all' })` |
| `vigil-pwa/src/hooks/useTherapy.ts` | Both `analyzePatterns` and `generatePrep` pass `window: 'all'` | ✓ VERIFIED | Lines 32 and 63: both `getThoughts({ limit: 200, window: 'all' })` |
| `vigil-pwa/src/hooks/useProjects.ts` | Both project-list and unassigned calls pass `window: 'all'` | ✓ VERIFIED | Lines 26 and 32: `getThoughts({ projectId: p.id, limit: 200, window: 'all' })` and `getThoughts({ unassigned: true, limit: 200, window: 'all' })` |
| `Sources/DailyBrief/DailyBrief.swift` | Triage command passes `"window": "all"` | ✓ VERIFIED | Line 460: `query: ["limit": String(fetchLimit), "offset": "0", "window": "all"]` |
| `vigil-pwa/src/utils/date-window-client.ts` | Client-side mirror of `getCurrentWeekWindow` for header display | ✓ VERIFIED | 154 lines. Exports `getCurrentWeekWindow`. Same wall-clock-parts + `wallClockToUtc` algorithm as server. No external dependencies. Top-of-file sync comment present. |
| `vigil-pwa/src/hooks/useTimezone.ts` | Fetch-once hook, `[]` deps, defaults to `America/New_York` | ✓ VERIFIED | 40 lines. `}, [])` at line 37. `vigilFetch('/v1/settings/timezone')`. `const DEFAULT_TZ = 'America/New_York'`. |
| `vigil-pwa/src/components/ThoughtList.tsx` | `isSearchActive: boolean` required prop; branched empty state | ✓ VERIFIED | `isSearchActive: boolean` in interface (not optional). Branch at line 36: `if (isSearchActive)` returns "No thoughts found"; else returns three-line week-empty copy. |
| `vigil-pwa/src/pages/ThoughtsPage.tsx` | Week/search context header above ThoughtList; wires `useTimezone` + `getCurrentWeekWindow` | ✓ VERIFIED | Imports both; `const { tz } = useTimezone()`; IIFE formats start/end; conditional header JSX with `role="status"` + `aria-live="polite"` on both branches; `isSearchActive={debouncedQuery !== ''}` on ThoughtList. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `thoughts.ts` | `date-window.ts` | `import { getCurrentWeekWindow } from '../utils/date-window.js'` | ✓ WIRED | Line 6 of thoughts.ts |
| `thoughts.ts` | `appSettings` table | Drizzle select on `appSettings.key = 'user_timezone'` | ✓ WIRED | Lines 173-177; `appSettings` imported at line 4 |
| `thoughts.ts` | Drizzle `lt` | `lt(thoughtsTable.createdAt, end)` | ✓ WIRED | Line 180; `lt` imported at line 5 |
| `client.ts` | `URLSearchParams window` | `qs.set('window', params.window)` when set | ✓ WIRED | Line 94 |
| `ThoughtsPage.tsx` | `date-window-client.ts` | `import { getCurrentWeekWindow } from '../utils/date-window-client'` | ✓ WIRED | Line 10 |
| `ThoughtsPage.tsx` | `useTimezone.ts` | `const { tz } = useTimezone()` | ✓ WIRED | Lines 11, 18 |
| `ThoughtsPage.tsx` | `ThoughtList.tsx` | `isSearchActive={debouncedQuery !== ''}` | ✓ WIRED | Line 248 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `ThoughtsPage.tsx` header | `formattedStart`, `formattedEnd` | `getCurrentWeekWindow(tz)` → `Intl.DateTimeFormat` | Yes — live computation from real tz value fetched from server | ✓ FLOWING |
| `useTimezone.ts` | `tz` | `vigilFetch('/v1/settings/timezone')` → server `appSettings` DB row | Yes — fetches live from DB | ✓ FLOWING |
| `thoughts.ts` window filter | `start`, `end` | `getCurrentWeekWindow(tz)` where `tz` is from `appSettings` DB | Yes — DB query + pure function | ✓ FLOWING |
| `ThoughtList.tsx` | `thoughts` | `useThoughts` hook → `getThoughts()` → `GET /v1/thoughts` (week-scoped) | Yes — real DB query with week filter applied | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `vigil-core` test suite passes | `cd vigil-core && npm test` | 170 pass, 0 fail, 5 skipped (intentional RO-01..05) | ✓ PASS |
| `shouldBypassWindow` exported | `grep 'export function shouldBypassWindow' vigil-core/src/routes/thoughts.ts` | Match | ✓ PASS |
| `useThoughts.ts` has no `window: 'all'` | grep | 0 matches | ✓ PASS |
| `chat.ts` has no `getCurrentWeekWindow` or `window=all` | grep | 0 matches | ✓ PASS |
| `lt` (not `lte`) used for end bound | grep `lt(thoughtsTable.createdAt, end)` | Match at line 180 | ✓ PASS |
| `vigil-pwa` tests | `cd vigil-pwa && npm test -- --run` | 22 pass, 1 fail (pre-existing SettingsPage OAuth test unrelated to phase 88) | ✓ PASS (pre-existing failure confirmed in 88-03-SUMMARY) |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| ROLLOVER-01 | 88-02, 88-03, 88-04 | User sees only current-week (Wed–Tue) thoughts in Thoughts tab by default | ✓ SATISFIED | Server: `getCurrentWeekWindow` + `lt` applied in `thoughts.ts`. Client: `useThoughts` omits `window: 'all'`. UI: week header shows. Human-verified Check A. |
| ROLLOVER-02 | 88-02, 88-03, 88-04 | Full-text search bypasses rollover window | ✓ SATISFIED | `shouldBypassWindow` returns true when `q` set. Header swaps to "Search · all time". Human-verified Check B. |
| ROLLOVER-03 | 88-02 | Chat has access to all historical thoughts | ✓ SATISFIED | `chat.ts` unchanged — uses direct Drizzle with no window filter. RO-08 sentinel test locks this in as a regression test. |
| ROLLOVER-04 | 88-01, 88-04 | Rollover boundary is Wednesday 00:00 in user's configured timezone | ✓ SATISFIED | `getCurrentWeekWindow(tz)` uses `Intl.DateTimeFormat` wall-clock resolution. DW-05 (spring-forward) and DW-06 (fall-back) tests verify DST-correct offset. `useTimezone` fetches the user's configured tz from `appSettings`. Human-verified Check D (tz shift on reload). |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `vigil-core/src/routes/thoughts.test.ts` | 22–43 | `test.skip` for RO-01..RO-05 (seed-and-query) | ⚠️ Warning | Route-level integration tests for the window-default behavior cannot run automatically until a test-DB harness is introduced. Mitigated by: (a) pure-function unit tests of `shouldBypassWindow` (RO-06/07 pass), (b) human UAT verification of live behavior, (c) curl probe commands documented in 88-02-SUMMARY. Not a blocker — phase 88 goal is achieved; this is a test infra debt. |
| `vigil-pwa/src/pages/SettingsPage.test.tsx` | 104 | Pre-existing test failure (`?google_error=invalid_state` OAuth error banner test) | ℹ️ Info | Pre-existing failure confirmed before phase 88 changes. Unrelated to date-window rollover. Documented in 88-03-SUMMARY. |

---

### Human Verification Required

#### 1. Empty-state (no thoughts this week)

**Test:** Navigate to the Thoughts tab at a time when there are no thoughts captured in the current Wed–Tue window (e.g., first thing Wednesday morning before any captures).
**Expected:** The list area shows three lines of copy in this exact order:
1. `No thoughts this week yet` (gray, text-sm)
2. `Capture one above to get started.` (gray, text-sm)
3. `Looking for older thoughts? Search above.` (gray/70 opacity, text-xs, with margin-top-2)

The header above still reads `This week · {start} – {end}` (not the search variant).

**Why human:** No zero-thought week was available during Plan 04 UAT (Check C marked optional). The code path is fully implemented and verified by reading `ThoughtList.tsx` — the copy is correct and branch logic is wired. This is purely an observability gap: the rendered state cannot be triggered without a real empty-week scenario or a test fixture.

---

### Gaps Summary

No blocking gaps found. All four roadmap success criteria are fully implemented and wired. The phase goal — "Thoughts tab shows only this-week thoughts by default; shared server-side date-window helper is the single source of truth" — is achieved.

The one outstanding item is Check C (empty-state visual confirmation), which the plan itself marked as optional and was not available to test during UAT. This is a low-stakes cosmetic confirmation; the empty-state code is correct and passes code review.

The RO-01..RO-05 test skips represent test infrastructure debt (no shared test-DB harness), not a functional gap. The bypass predicate is fully unit-tested (RO-06/07), and the live behavior was human-verified.

---

_Verified: 2026-04-15T18:35:00Z_
_Verifier: Claude (gsd-verifier)_
