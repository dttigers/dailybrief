---
phase: 70-insights-therapy
plan: "01"
subsystem: vigil-pwa
tags: [insights, therapy, pwa, ai]
dependency_graph:
  requires: []
  provides: [insights-page, therapy-badges, insights-api-client, therapy-api-client]
  affects: [vigil-pwa]
tech_stack:
  added: []
  patterns: [react-hook-state, vite-pwa, dark-theme-slate]
key_files:
  created:
    - vigil-pwa/src/hooks/useInsights.ts
    - vigil-pwa/src/pages/InsightsPage.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/components/ThoughtRow.tsx
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/App.tsx
decisions:
  - No classifyTherapy function added — classification is server-side during triage; PWA only reads the stored field
  - Insight cards show confidence as percentage in top-right corner for quick scanning
  - Therapy badges use concise labels (Self-work / For therapy) rather than raw classification strings
metrics:
  duration: ~15 minutes
  completed: "2026-04-12"
  tasks_completed: 3
  files_changed: 6
---

# Phase 70 Plan 01: Insights and Therapy Badges Summary

PWA Insights page and therapy classification badges — AI-generated patterns and connections surfaced via new nav tab, with self-work/for-therapy badges on classified thoughts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add insights/therapy API functions and fix ThoughtApiResponse | cdc3cb9 | vigil-pwa/src/api/client.ts |
| 2 | Create InsightsPage with useInsights hook, add nav tab and route | 3840eea | useInsights.ts, InsightsPage.tsx, Layout.tsx, App.tsx |
| 3 | Add therapy classification badges to ThoughtRow | c487d80 | vigil-pwa/src/components/ThoughtRow.tsx |

## What Was Built

### Task 1 — API Client Extensions
- Added `therapyClassification: string | null` to `ThoughtApiResponse` (backend already returns this field)
- Added `Insight`, `TherapyClassificationResult`, `TherapyPattern`, `TherapyPrepItem`, `TherapyPrep` types
- Added `generateInsights`, `getTherapyPatterns`, `generateTherapyPrep` async functions wired to the backend contracts

### Task 2 — Insights Page
- `useInsights` hook: fetches up to 200 thoughts, maps to API shape, enforces 3-thought minimum, calls `/v1/insights`, stores results
- `InsightsPage`: header with Generate button (disabled during load), skeleton loading state, empty-state prompt, insight cards with type badge (pattern=blue, connection=green, action=amber, trend=purple), title, message, and confidence percentage
- Layout.tsx: added Insights tab after Chat
- App.tsx: added `/insights` route

### Task 3 — Therapy Badges
- Added `THERAPY_STYLES` map for `selfLearnable` (teal "Self-work") and `bringToTherapist` (rose "For therapy")
- Badge renders in the same flex row as category and task status badges when `therapyClassification` is non-null

## Deviations from Plan

None — plan executed exactly as written.

## Verification

Build output:
```
dist/assets/index-BCTLR6ee.js   268.64 kB │ gzip: 83.19 kB
✓ built in 202ms
```

All three tasks pass TypeScript compilation (stale `.d.ts` TS6305 errors are pre-existing build artifacts, not type errors).

## Known Stubs

None. The insights generation calls a live backend endpoint; therapy badges read a live field from the API response.

## Self-Check: PASSED

- vigil-pwa/src/hooks/useInsights.ts: FOUND
- vigil-pwa/src/pages/InsightsPage.tsx: FOUND
- vigil-pwa/src/api/client.ts (generateInsights export): FOUND
- vigil-pwa/src/components/ThoughtRow.tsx (therapyClassification badge): FOUND
- Commit cdc3cb9: FOUND
- Commit 3840eea: FOUND
- Commit c487d80: FOUND
- npm run build: PASSED
