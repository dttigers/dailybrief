---
phase: 88-date-window-helper-rollover
plan: "03"
subsystem: pwa-api-client, mac-cli, smoke-test
tags: [pwa, api-client, mac-cli, caller-audit, rollover]

requires:
  - 88-01 (getCurrentWeekWindow utility)
  - 88-02 (GET /thoughts week-window default + ?window=all bypass)

provides:
  - getThoughts() with typed window?: 'all' parameter
  - Five PWA call sites passing window=all (useInsights, useTherapy×2, useProjects×2)
  - Mac CLI triage command sending window=all
  - Smoke test LIST call using window=all for week-independence

affects:
  - vigil-pwa Insights, Therapy, Projects pages (preserve cross-week data)
  - Mac CLI triage command (preserves all-time thought fetch)
  - vigil-core smoke test (week-independent verification)

tech-stack:
  added: []
  patterns:
    - "window?: 'all' literal type on getThoughts params — TypeScript enforces at call sites"
    - "qs.set('window', params.window) only when set — zero overhead for callers omitting it"

key-files:
  created: []
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/hooks/useInsights.ts
    - vigil-pwa/src/hooks/useTherapy.ts
    - vigil-pwa/src/hooks/useProjects.ts
    - Sources/DailyBrief/DailyBrief.swift
    - vigil-core/scripts/smoke-test.ts

key-decisions:
  - "window?: 'all' typed as string literal (not string) — TypeScript rejects typos like 'All' or 'ALL' at compile time"
  - "useThoughts.ts left intentionally unchanged — it is the week-default consumer (ROLLOVER-01 preserved)"
  - "Pre-existing SettingsPage test failure documented as out-of-scope (fails identically on unmodified codebase)"
  - "Smoke test bare /thoughts auth-enforcement tests left unchanged — they test 401 rejection, not LIST behavior"

requirements-completed:
  - ROLLOVER-01
  - ROLLOVER-02

duration: ~4min
completed: 2026-04-15
---

# Phase 88 Plan 03: Caller Audit — Add window=all to Cross-Week Callers Summary

**Five PWA hooks + Mac CLI triage + smoke test patched with window=all; getThoughts() gains typed window?: 'all' param; useThoughts unchanged as intended week-default consumer**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-15T18:09:46Z
- **Completed:** 2026-04-15T18:14:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `window?: 'all'` typed parameter to `getThoughts()` in `vigil-pwa/src/api/client.ts` (line 81) with `qs.set('window', params.window)` encoding (line 93)
- Patched five call sites that expected all-time data:
  - `useInsights.ts` line 19: `getThoughts({ limit: 200, window: 'all' })`
  - `useTherapy.ts` line 32 (`analyzePatterns`): `getThoughts({ limit: 200, window: 'all' })`
  - `useTherapy.ts` line 63 (`generatePrep`): `getThoughts({ limit: 200, window: 'all' })`
  - `useProjects.ts` line 26 (project list): `getThoughts({ projectId: p.id, limit: 200, window: 'all' })`
  - `useProjects.ts` line 32 (unassigned list): `getThoughts({ unassigned: true, limit: 200, window: 'all' })`
- Fixed `Sources/DailyBrief/DailyBrief.swift` triage command (line 458–461): added `"window": "all"` to query dict
- Fixed `vigil-core/scripts/smoke-test.ts` LIST call (line 130): `api("/thoughts?window=all")` for week-independence
- `vigil-pwa` TypeScript build: clean (60 modules, no errors)
- `swift build -c release`: complete, no new errors

## Task Commits

1. **Task 1: Add window?: 'all' to getThoughts + fix 5 PWA call sites** — `960bf55` (feat)
2. **Task 2: Fix Mac CLI triage + server smoke test** — `320f35e` (feat)

## Files Created/Modified

- `vigil-pwa/src/api/client.ts` — Added `window?: 'all'` to params type (line 81); added `if (params.window) qs.set('window', params.window)` to URLSearchParams builder (line 93). +2 lines.
- `vigil-pwa/src/hooks/useInsights.ts` — Line 19: added `window: 'all'` to getThoughts call. +1 char.
- `vigil-pwa/src/hooks/useTherapy.ts` — Lines 32 and 63: added `window: 'all'` to both getThoughts calls. +2 chars.
- `vigil-pwa/src/hooks/useProjects.ts` — Lines 26 and 32: added `window: 'all'` to both getThoughts calls. +2 chars.
- `Sources/DailyBrief/DailyBrief.swift` — Line 460: added `"window": "all"` to query dict in triage GET /thoughts call. +1 key-value pair.
- `vigil-core/scripts/smoke-test.ts` — Line 130: changed `api("/thoughts")` to `api("/thoughts?window=all")` in LIST verification step. +11 chars.

## ROLLOVER-01 Intent Preserved

`vigil-pwa/src/hooks/useThoughts.ts` was read and confirmed to contain zero occurrences of `window: 'all'`. This hook powers the Thoughts tab — the intended consumer of the new week-default behavior. It was intentionally left unchanged.

## Safe Callers Confirmed Untouched

Per RESEARCH §Caller Audit Map (verified during plan):
- `vigil-core/src/routes/chat.ts` — uses direct Drizzle query, not HTTP GET /thoughts. No change needed. RO-08 test in Plan 02 locks this in.
- `vigil-core/src/services/brief-assembly-service.ts` — uses direct Drizzle. Phase 93 handles SCOPE-04 separately.
- `vigil-extension/popup.js` — only POSTs thoughts, never GETs. No change needed.

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| `grep "window?: 'all'" client.ts` | MATCH (line 81) |
| `grep "qs.set('window'" client.ts` | MATCH (line 93) |
| `grep -c "window: 'all'" useInsights.ts` = 1 | 1 |
| `grep -c "window: 'all'" useTherapy.ts` = 2 | 2 |
| `grep -c "window: 'all'" useProjects.ts` = 2 | 2 |
| `grep "window: 'all'" useThoughts.ts` = 0 | 0 (PASS) |
| `cd vigil-pwa && npm run build` | exits 0 |
| `grep '"window": "all"' DailyBrief.swift` | MATCH (line 460) |
| `swift build -c release` | Build complete, no new errors |
| `grep -E '/thoughts\??.*window=all' smoke-test.ts` | MATCH (line 130) |

## Pre-existing Test Failure (Out of Scope)

`vigil-pwa/src/pages/SettingsPage.test.tsx` — one test fails on the unmodified codebase:
- `SettingsPage > callback > shows error banner with decoded message when ?google_error=invalid_state`
- Confirmed pre-existing by stashing changes and running the suite — identical failure. Not caused by this plan's changes. Deferred per scope boundary rule.

## Deviations from Plan

None — plan executed exactly as written. All 5 PWA call sites, Swift triage, and smoke test patched as specified.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints introduced. `window=all` is a client-supplied query parameter — same trust boundary as T-88-09 (Plan 02 threat model). TypeScript literal type `window?: 'all'` provides T-88-10 mitigation: typos like `'All'` or `'ALL'` are compile-time errors. The `useThoughts.ts` zero-occurrence acceptance criterion acts as a build-time sentinel.
