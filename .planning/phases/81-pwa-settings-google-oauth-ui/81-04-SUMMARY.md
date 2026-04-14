---
phase: 81
plan: 04
subsystem: vigil-pwa
tags: [react, context, hooks, oauth, google-status, tdd]
dependency_graph:
  requires:
    - Phase 79 /v1/google/status endpoint
  provides:
    - GoogleStatusProvider (authenticated-Layout-scoped shared fetch)
    - useGoogleStatus() hook (status/isLoading/error/refetch)
    - getGoogleStatus() + GoogleStatus type in api/client
  affects:
    - vigil-pwa/src/App.tsx (wraps authenticated Layout)
tech_stack:
  added:
    - vitest@4.1.4
    - "@testing-library/react@16.3.2"
    - "@testing-library/dom@10.4.1"
    - jsdom@29
    - "@vitest/ui"
  patterns:
    - React Context for cross-component shared fetch (Layout + SettingsPage)
    - Cancelled-flag cleanup in useEffect (matches useWorkOrders)
    - refetchCount counter to trigger re-fetch from context consumers
    - 404-as-null vs error-as-string disambiguation
key_files:
  created:
    - vigil-pwa/src/hooks/GoogleStatusContext.tsx
    - vigil-pwa/src/hooks/useGoogleStatus.ts
    - vigil-pwa/src/hooks/useGoogleStatus.test.tsx
  modified:
    - vigil-pwa/src/App.tsx
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/package.json
    - vigil-pwa/package-lock.json
    - vigil-pwa/vite.config.ts
decisions:
  - "GoogleStatusProvider wraps authenticated Routes only, NOT AuthPage — prevents pre-auth fetch attempts (mitigates T-81-12)"
  - "useGoogleStatus throws when context undefined — developer-error guard for misuse"
  - "404 → status=null (disconnected), 500/network → error string — distinct UI states (RESEARCH.md Pitfall 6)"
  - "localStorage stubbed via vi.stubGlobal in tests — Node 24+ ships native localStorage that shadows jsdom window.localStorage"
metrics:
  completed: 2026-04-13
  tasks: 1
  files_created: 3
  files_modified: 5
requirements: [OAUTH-03]
---

# Phase 81 Plan 04: Google Status Shared Hook & Context Summary

**One-liner:** Shared React Context that fetches `/v1/google/status` once for both Layout gear dot and SettingsPage, with refetch + 404/500 state disambiguation.

## What Shipped

### 1. `GoogleStatusContext.tsx` — Provider + Hook

- Fetches `/v1/google/status` once on mount via `getGoogleStatus()` API client method
- Exposes `{ status, isLoading, error, refetch }` to descendants
- `status === null` ⇔ 404 (no token stored, disconnected)
- `error !== null` ⇔ 500/network/other — kept distinct from disconnected
- `refetch()` increments an internal `refetchCount` counter — `useEffect` re-runs, re-fetching
- `useGoogleStatus()` hook throws if called outside the provider (misuse guard)
- `useEffect` uses `cancelled` flag matching `useWorkOrders.ts` pattern for unmount safety

### 2. `useGoogleStatus.ts` — Re-export

Thin re-export of `useGoogleStatus` and `GoogleStatusProvider` from the `.tsx` file so consumers can import from `'./hooks/useGoogleStatus'` matching `useWorkOrders`/`useThoughts` naming.

### 3. `App.tsx` — Provider Mount

Wrapped the authenticated Routes branch in `<GoogleStatusProvider>`. The AuthPage branch is intentionally NOT wrapped — there is no bearer token yet and no UI consumes the status. Imports continue to come from `'react-router'` (not `'react-router-dom'`) per RESEARCH.md Pitfall 1.

### 4. `api/client.ts` — `getGoogleStatus()` + `GoogleStatus` type

Added minimal API client stub for `/v1/google/status`:
- `GoogleStatus = { calendar: 'connected'|'needs_auth', gmail: 'connected'|'needs_auth', email? }`
- Returns `null` on 404 (disconnected), throws on other non-ok responses
- Uses `vigilFetch` for bearer auth

This duplicates what Plan 03 will ship. When Plan 03 lands in the same wave, the duplicate will either resolve to the same implementation or need a small integration patch during verifier review.

### 5. Test suite (4 tests, all green)

- 404 → `status=null`, `error=null`
- `refetch()` triggers a second fetch and populates new status
- 500 → `error` contains status code, `status` stays null
- Hook outside provider → throws `/useGoogleStatus must be used within GoogleStatusProvider/`

## Deviations from Plan

### [Rule 3 - Blocker] Installed test infrastructure

- **Found during:** Task 1 setup
- **Issue:** Plan 01 of this wave ships the vitest/test-infra install, but plans in a parallel wave don't share state. `npm test` did not exist; vitest/@testing-library/react were not installed.
- **Fix:** Installed `vitest@4.1.4`, `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`, `jsdom@29`, `@vitest/ui`. Added `"test": "vitest"` script to `package.json`. Added `test: { environment: 'jsdom', globals: false }` block to `vite.config.ts`.
- **Files modified:** `vigil-pwa/package.json`, `vigil-pwa/package-lock.json`, `vigil-pwa/vite.config.ts`
- **Commit:** aa6ed51

### [Rule 3 - Blocker] Added `getGoogleStatus()` + type to api/client.ts

- **Found during:** Task 1 red-test run
- **Issue:** Plan 03 ships `getGoogleStatus()` and the `GoogleStatus` type on `api/client`. Running in parallel wave — that method did not exist when this plan ran. Cannot test a Context provider that imports a non-existent function.
- **Fix:** Added `GoogleStatus` type and `getGoogleStatus()` function at the end of `vigil-pwa/src/api/client.ts`, matching the shape specified in the CONTEXT.md (404 → null, thrown on 500/network).
- **Expected resolution:** Plan 03 may duplicate this change; verifier / orchestrator should reconcile when merging waves.
- **Commit:** aa6ed51

### [Rule 3 - Blocker] Test-time `localStorage` stub

- **Found during:** Task 1 green-test run
- **Issue:** Tests failed with `TypeError: localStorage.setItem is not a function`. Node 24+ ships a native `localStorage` that shadows jsdom's per-window `localStorage`. `getStoredKey()` in `api/client.ts` reads `localStorage.getItem('vigil_api_key')`, which `vigilFetch` is called with during the context fetch.
- **Fix:** Tests now `vi.stubGlobal('localStorage', ...)` with a `Map`-backed polyfill seeded with a test key in `beforeEach`. This keeps tests deterministic without depending on Node's storage quota flags.
- **Commit:** aa6ed51

## Verification

| Command | Result |
|---------|--------|
| `npx vitest run src/hooks/useGoogleStatus` | 4 passed (1 file) |
| `grep GoogleStatusProvider src/App.tsx` | matches at lines 38 + 51 (opening + closing wrap) |
| `grep "react-router-dom" src/App.tsx` | 0 matches (Pitfall 1 defeated) |
| `npm run build` | clean, 57 modules transformed, 299.88 kB bundle |
| `npx tsc --noEmit -p tsconfig.app.json` | no errors in new files (pre-existing errors in `client.ts import.meta.env`, `BriefHistoryPage.tsx`, `main.tsx` — out of scope) |

## Acceptance Criteria

- ✅ `GoogleStatusContext.tsx` exports `GoogleStatusProvider` and `useGoogleStatus`
- ✅ `App.tsx` contains `<GoogleStatusProvider>` wrapping the authenticated Layout only
- ✅ `App.tsx` has zero imports from `'react-router-dom'`
- ✅ `useGoogleStatus` throws when context is undefined
- ✅ `vitest run src/hooks/useGoogleStatus` exits 0 (4/4 tests green)
- ✅ Build clean

## Threat Flags

None. The new Context provider lives inside the authenticated Routes branch (mitigates T-81-12 per the plan's threat register). No new network surface — reuses existing `/v1/google/status` from Phase 79.

## Commit

- **aa6ed51** — feat(81-04): add GoogleStatusProvider context and useGoogleStatus hook

## Self-Check: PASSED

- ✅ `vigil-pwa/src/hooks/GoogleStatusContext.tsx` — found
- ✅ `vigil-pwa/src/hooks/useGoogleStatus.ts` — found
- ✅ `vigil-pwa/src/hooks/useGoogleStatus.test.tsx` — found
- ✅ Commit `aa6ed51` present in `git log`
