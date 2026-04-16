---
phase: 89-7-day-analysis-scope
plan: "02"
subsystem: vigil-pwa
tags: [pwa, hooks, api-client, ui, simplification]
dependency_graph:
  requires: [89-01]
  provides: [SCOPE-01-client, SCOPE-02-client, SCOPE-03-client]
  affects: [vigil-pwa/src/api/client.ts, vigil-pwa/src/hooks/useInsights.ts, vigil-pwa/src/hooks/useTherapy.ts, vigil-pwa/src/pages/InsightsPage.tsx, vigil-pwa/src/pages/TherapyPage.tsx]
tech_stack:
  added: []
  patterns: [server-side data ownership, error message propagation]
key_files:
  created: []
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/hooks/useInsights.ts
    - vigil-pwa/src/hooks/useTherapy.ts
    - vigil-pwa/src/pages/InsightsPage.tsx
    - vigil-pwa/src/pages/TherapyPage.tsx
decisions:
  - "Server-side error messages (body.error) propagate to hook error state instead of generic status codes"
  - "therapyThoughtCount removed from hook entirely — count is now communicated via server-side 400 error messages"
metrics:
  duration_seconds: 139
  completed_date: "2026-04-16"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 89 Plan 02: PWA Client Simplification Summary

**One-liner:** Stripped client-side thought fetching from all three analysis hooks and API functions — PWA now calls analysis endpoints with no body, trusting server to scope 7-day window.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Simplify API client functions and PWA hooks | 768a040 | client.ts, useInsights.ts, useTherapy.ts |
| 2 | Add "Analyzing last 7 days" subheadings | 3ee2aeb | InsightsPage.tsx, TherapyPage.tsx |

## What Was Built

**Task 1 — API client + hooks simplification:**

- `generateInsights()`, `getTherapyPatterns()`, `generateTherapyPrep()` in `client.ts`: all params removed, no request body sent, server-side `body.error` extracted from non-ok responses to surface friendly insufficient-data messages
- `useInsights`: removed `getThoughts` import and `days` param; `generate()` now calls `apiGenerateInsights()` directly with no args; removed client-side `thoughts.length < 3` guard (server owns that check)
- `useTherapy`: removed `getThoughts` import, `therapyThoughtCount` state, client-side filtering/mapping; `analyzePatterns()` and `generatePrep()` call endpoints directly with no args; `generatePrep` dependency array changed from `[patterns]` to `[]`

**Task 2 — UI subheadings:**

- `InsightsPage`: h1 wrapped in div, `<p className="text-xs text-gray-400 mt-0.5">Analyzing last 7 days</p>` added below
- `TherapyPage`: same subheading added under both "Therapy Patterns" and "Session Prep" h2 headers

## Verification Results

1. `npx tsc --noEmit -p tsconfig.app.json` — no new errors introduced (4 pre-existing errors in unrelated files: ImportMeta.env x2, index.css, BriefHistoryPage state comparison)
2. `grep -c "getThoughts" useInsights.ts` → 0
3. `grep -c "getThoughts" useTherapy.ts` → 0
4. `grep -c "Analyzing last 7 days" InsightsPage.tsx` → 1
5. `grep -c "Analyzing last 7 days" TherapyPage.tsx` → 2

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all five files contain real wired behavior (API calls → state updates → render).

## Threat Surface Scan

T-89-05 (Tampering — PWA POST body): Fully mitigated. All three API client functions now send no request body. Server ignores any body entirely.

T-89-06 (Information Disclosure — error messages): Accepted per plan. Server 400 errors (e.g., "Only 2 thoughts in last 7 days") surface in hook `error` state and render in the existing red error banner. Thought count of user's own data is not sensitive.

No new trust boundaries introduced.

## Self-Check: PASSED

All 5 modified files exist on disk. Both task commits (768a040, 3ee2aeb) confirmed in git log.
