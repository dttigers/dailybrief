---
phase: 81
plan: 05
subsystem: vigil-pwa
tags: [pwa, layout, oauth-ui, react-router-v7, tdd]
dependency_graph:
  requires:
    - 81-01 (vitest harness + stub Layout.test.tsx)
    - 81-03 (api/client.ts GoogleStatus type + getGoogleStatus)
    - 81-04 (GoogleStatusProvider + useGoogleStatus re-export)
  provides:
    - Gear icon entry point to /settings in Layout header
    - Red status dot surfacing scope-gap state (D-03)
  affects:
    - vigil-pwa/src/components/Layout.tsx
tech_stack:
  added: []
  patterns:
    - Context-consumed status (no duplicate fetch in Layout)
    - Inline SVG cog (no icon library per D-12)
    - TDD RED → GREEN (2 commits)
key_files:
  created: []
  modified:
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/components/Layout.test.tsx
decisions:
  - Placed gear immediately left of Sign Out inside a flex row (keeps Sign Out unchanged per D-02/D-14)
  - data-testid="google-status-dot" used for test targeting (plan-specified)
  - Inline cleanup + unstubAllGlobals in test afterEach to prevent cross-test fetch-stub leakage
metrics:
  duration_minutes: ~6
  completed: 2026-04-13
---

# Phase 81 Plan 05: Layout Gear Icon Summary

Gear icon linking to `/settings` with overlay red dot driven by the shared `useGoogleStatus()` context lands in the PWA header, giving the user a persistent, at-a-glance indicator that a Google scope needs re-auth without duplicating the status fetch.

## What Shipped

- **Layout.tsx:** Added `import { useGoogleStatus } from '../hooks/useGoogleStatus'`, computed `needsAttention = !status || status.calendar === 'needs_auth' || status.gmail === 'needs_auth'`, and rendered a `<Link to="/settings" aria-label="Settings">` with the inline SVG cog. A `<span data-testid="google-status-dot" aria-label="needs attention">` overlays the gear (absolute top-right) only when `needsAttention` is true. The existing Sign Out button is wrapped alongside the gear in a `flex items-center gap-3` row — preserved per D-02/D-14.
- **Layout.test.tsx:** Plan 01 stub (`expect.fail`) flipped to three real tests covering: needs_auth scope → dot present, both connected → dot absent, 404 null status → dot present. Uses `MemoryRouter + GoogleStatusProvider` with stubbed global `fetch`. `afterEach` cleans up DOM + unstubs globals to avoid cross-test leakage.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 RED | Replace stub with failing gear tests | `7f48d7b` |
| 1 GREEN | Implement gear + dot in Layout | `0456380` |

## Verification

- `cd vigil-pwa && npx vitest run src/components/Layout.test.tsx` → **3/3 green**
- `cd vigil-pwa && npm run build` → clean (Vite build + PWA precache)
- `grep 'to="/settings"'` Layout.tsx → present
- `grep 'react-router-dom'` Layout.tsx → zero occurrences (Pitfall 1)
- `grep 'Sign out'` Layout.tsx → present (Sign Out preserved)

## Deviations from Plan

None in scope. Plan executed as specified.

**Out-of-scope observation (not fixed):** `npx tsc --noEmit` surfaces pre-existing `TS6305` errors for stale `.d.ts` artifacts across unrelated files (UploadPage, WorkOrdersPage, test/setup). These are not caused by this plan's changes (Layout.tsx itself has no TS errors) and `npm run build` passes cleanly. Logged here for awareness — should be cleared by a future `rm -rf dist/` or tsconfig build-info reset during a dedicated chore pass.

## Known Stubs

None. All rendering paths wire to live data via `useGoogleStatus`.

## Threat Flags

None. Red-dot info disclosure and inline-SVG tampering already catalogued as `accept` in the plan's threat model; no new surface introduced.

## Self-Check: PASSED

- FOUND: `vigil-pwa/src/components/Layout.tsx` (modified, contains `to="/settings"`, gear SVG, dot, needsAttention)
- FOUND: `vigil-pwa/src/components/Layout.test.tsx` (3 real tests, no expect.fail stubs)
- FOUND commit `7f48d7b` (test RED)
- FOUND commit `0456380` (feat GREEN)
- Sign Out button preserved in Layout.tsx
- No `react-router-dom` occurrences in Layout.tsx
