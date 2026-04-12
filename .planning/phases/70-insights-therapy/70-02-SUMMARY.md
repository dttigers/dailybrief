---
phase: 70-insights-therapy
plan: "02"
subsystem: vigil-pwa
tags: [therapy, pwa, ai, session-prep, patterns]
dependency_graph:
  requires: [insights-api-client, therapy-api-client]
  provides: [therapy-page, therapy-nav-tab]
  affects: [vigil-pwa]
tech_stack:
  added: []
  patterns: [react-hook-state, vite-pwa, dark-theme-slate]
key_files:
  created:
    - vigil-pwa/src/hooks/useTherapy.ts
    - vigil-pwa/src/pages/TherapyPage.tsx
  modified:
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/App.tsx
decisions:
  - useTherapy keeps analyzePatterns and generatePrep as separate async functions so each section has independent loading state
  - Prep items sorted client-side by urgency (high > medium > low) rather than relying on API order
  - Pattern confidence shown as percentage in top-right for visual parity with InsightsPage
metrics:
  duration: ~10 minutes
  completed: "2026-04-12"
  tasks_completed: 2
  files_changed: 4
---

# Phase 70 Plan 02: Therapy Page Summary

Therapy page with pattern analysis and session prep — users preparing for therapy can view recurring emotional patterns across their classified thoughts and generate urgency-sorted session prep with AI-suggested focus.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useTherapy hook and TherapyPage | 68a26a2 | vigil-pwa/src/hooks/useTherapy.ts, vigil-pwa/src/pages/TherapyPage.tsx |
| 2 | Add Therapy nav tab and route | 2cd3922 | vigil-pwa/src/components/Layout.tsx, vigil-pwa/src/App.tsx |

## What Was Built

### Task 1 — useTherapy Hook and TherapyPage

**useTherapy hook** (`vigil-pwa/src/hooks/useTherapy.ts`):
- `analyzePatterns()`: fetches up to 200 thoughts, filters to `therapyClassification !== null`, enforces 5-thought minimum, calls `getTherapyPatterns`, stores results
- `generatePrep()`: filters to `therapyClassification === 'bringToTherapist'`, passes existing patterns as context to `generateTherapyPrep`, stores prep
- Independent loading states (`isLoadingPatterns`, `isLoadingPrep`) so both sections operate independently
- `therapyThoughtCount` tracks how many therapy-classified thoughts were found

**TherapyPage** (`vigil-pwa/src/pages/TherapyPage.tsx`):
- Section 1 (Patterns): Analyze Patterns button, empty/loading/error states, pattern cards with theme, description, frequency count, trend (green/slate/red text), confidence percentage
- Section 2 (Session Prep): Generate Prep button, suggested focus highlighted box (indigo tint), overall theme pills, prep items sorted high > medium > low urgency with color-coded badges
- Single shared error banner at top covers both sections

### Task 2 — Nav Tab and Route

- `Layout.tsx`: `{ label: 'Therapy', to: '/therapy' }` appended after Insights in TABS array
- `App.tsx`: `TherapyPage` imported and rendered at `/therapy` route inside the authenticated Layout

Nav order: Thoughts | Work Orders | Projects | Chat | Insights | Therapy

## Deviations from Plan

None — plan executed exactly as written.

## Verification

Build output:
```
dist/assets/index-i9n6Pq54.js   274.34 kB │ gzip: 84.14 kB
built in 234ms
```

Build succeeded. TypeScript stale `.d.ts` TS6305 errors are pre-existing build artifacts (same as plan 01), not new type errors.

## Known Stubs

None. Both buttons call live backend endpoints (`/v1/therapy/patterns` and `/v1/therapy/prep`). Empty states display before any API call is made, which is correct UX behavior.

## Threat Surface Scan

No new network endpoints or auth paths introduced in this plan. The PWA calls `/v1/therapy/patterns` and `/v1/therapy/prep` via the existing `vigilFetch` helper which attaches the stored bearer token on every request — satisfying T-70-03 and T-70-04 from the plan's threat model.

## Self-Check: PASSED

- vigil-pwa/src/hooks/useTherapy.ts: FOUND
- vigil-pwa/src/pages/TherapyPage.tsx: FOUND
- vigil-pwa/src/components/Layout.tsx (Therapy tab): FOUND
- vigil-pwa/src/App.tsx (/therapy route): FOUND
- Commit 68a26a2: FOUND
- Commit 2cd3922: FOUND
- npm run build: PASSED
