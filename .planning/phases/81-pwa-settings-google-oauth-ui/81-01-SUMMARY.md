---
phase: 81
plan: 01
subsystem: vigil-pwa
tags: [test-harness, vitest, rtl, tdd, red-stubs]
requires: []
provides:
  - vitest + RTL + jsdom installed in vigil-pwa
  - vitest.config.ts with jsdom environment
  - src/test/setup.ts with jest-dom matchers and fetch shim
  - Stub tests for SettingsPage, Layout, api client, useGoogleStatus (16 red tests)
  - npm scripts test / test:watch / test:ui
affects:
  - vigil-pwa/package.json (new scripts + devDeps)
tech-stack:
  added:
    - vitest@^2
    - "@testing-library/react@^16"
    - "@testing-library/user-event@^14"
    - "@testing-library/jest-dom@^6"
    - "@testing-library/dom@^10"
    - jsdom@^25
  patterns:
    - TDD RED stubs with `expect.fail()` messages pointing at downstream plans
    - vitest.config.ts separate from vite.config.ts so PWA plugin does not load during tests
key-files:
  created:
    - vigil-pwa/vitest.config.ts
    - vigil-pwa/src/test/setup.ts
    - vigil-pwa/src/pages/SettingsPage.test.tsx
    - vigil-pwa/src/components/Layout.test.tsx
    - vigil-pwa/src/api/client.test.ts
    - vigil-pwa/src/hooks/useGoogleStatus.test.ts
  modified:
    - vigil-pwa/package.json
    - vigil-pwa/package-lock.json
decisions:
  - vitest over jest — native ESM + Vite plugin reuse + TypeScript zero-config
  - Separate vitest.config.ts so vite-plugin-pwa does not execute under tests
  - `expect.fail('Plan NN: ...')` style for red stubs — self-documents which plan flips each test
metrics:
  completed: 2026-04-13
  tasks: 2
  duration_minutes: 5
---

# Phase 81 Plan 01: Nyquist Validation Harness Summary

Installed vitest + React Testing Library + jsdom in vigil-pwa and committed 16 intentionally-red stub tests so Wave 1/2 plans can flip red → green as they implement Google OAuth UI.

## What shipped

- **Task 1 (eb8e5a0):** vitest@^2, @testing-library/react@^16, user-event, jest-dom, jsdom@^25 installed as devDependencies. Added `test`, `test:watch`, `test:ui` scripts. Created `vitest.config.ts` (jsdom + setupFiles) and `src/test/setup.ts` (jest-dom matchers, cleanup, fetch shim). `npx vitest --version` → `vitest/2.1.9`.
- **Task 2 (4955d47):** Four stub test files committed — all tests intentionally call `expect.fail()` with messages pointing at the plan that will implement each feature. Test names match the verification map: `empty`, `connected`, `scope gap`, `disconnect`, `callback`, `gear`, plus api/client and useGoogleStatus hook coverage.

Stub file breakdown:
| File | Describe blocks | Tests |
|------|-----------------|-------|
| `src/pages/SettingsPage.test.tsx` | empty, connected, scope gap, disconnect, callback | 6 |
| `src/components/Layout.test.tsx` | gear | 3 |
| `src/api/client.test.ts` | getGoogleStatus, disconnectGoogle, redirectToGoogleAuth | 4 |
| `src/hooks/useGoogleStatus.test.ts` | (default) | 3 |
| **Total** | **6 describes** | **16 red tests** |

## Verification

- `cd vigil-pwa && npx vitest --version` → `vitest/2.1.9 darwin-x64 node-v25.2.1`
- `cd vigil-pwa && npx vitest run` executes 16 tests across 4 files, all fail with the expected `expect.fail()` messages
- `grep -c "describe" src/pages/SettingsPage.test.tsx` → 6 (above required 5)
- Named test patterns (`empty|connected|scope gap|disconnect|callback|gear`) appear 62 times in verbose output — well above the ≥6 floor in plan verify step

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing `@testing-library/dom` peer dependency**
- **Found during:** Task 2 verify step
- **Issue:** `@testing-library/react@^16` peer-depends on `@testing-library/dom@^10` but npm didn't auto-install it in this workspace; vitest reported `Cannot find module '@testing-library/dom'` when loading any test that imports RTL.
- **Fix:** `npm install -D @testing-library/dom@^10.4.1` — unblocks RTL, required for downstream Wave 1/2 plans that will actually render components.
- **Files modified:** `vigil-pwa/package.json`, `vigil-pwa/package-lock.json`
- **Commit:** folded into Task 2 (`4955d47`)

## Deferred Issues

- **Pre-existing TS errors** in `vigil-pwa/src/api/client.ts` (import.meta.env) and other files are out of scope for this plan (existed before the harness install). They surface when running `npx tsc -p tsconfig.app.json --noEmit` but are unrelated to the test harness. Logging here so a future plan can address them; did not attempt to fix per scope boundary.

## Known Stubs

All 16 tests in the four new files are intentional red stubs. This is the plan's explicit Wave 0 contract — downstream Wave 1/2 plans (03, 04, 05, 06) will replace each `expect.fail(...)` with a real assertion as they implement the corresponding feature. These are not accidental stubs; they are the deliverable.

## Self-Check: PASSED

Created files verified present on disk:
- FOUND: vigil-pwa/vitest.config.ts
- FOUND: vigil-pwa/src/test/setup.ts
- FOUND: vigil-pwa/src/pages/SettingsPage.test.tsx
- FOUND: vigil-pwa/src/components/Layout.test.tsx
- FOUND: vigil-pwa/src/api/client.test.ts
- FOUND: vigil-pwa/src/hooks/useGoogleStatus.test.ts

Commits verified:
- FOUND: eb8e5a0 (Task 1)
- FOUND: 4955d47 (Task 2)
