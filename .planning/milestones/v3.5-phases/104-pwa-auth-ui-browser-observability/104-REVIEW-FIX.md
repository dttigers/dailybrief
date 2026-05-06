---
phase: 104-pwa-auth-ui-browser-observability
fixed_at: 2026-04-19T16:23:00Z
review_path: .planning/phases/104-pwa-auth-ui-browser-observability/104-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 104: Code Review Fix Report

**Fixed at:** 2026-04-19T16:23:00Z
**Source review:** .planning/phases/104-pwa-auth-ui-browser-observability/104-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `API_BASE` duplicated in `AuthPage.tsx` and `client.ts`

**Files modified:** `vigil-pwa/src/api/client.ts`, `vigil-pwa/src/pages/AuthPage.tsx`
**Commit:** 085ae02
**Applied fix:** Exported `API_BASE` from `client.ts` (was module-private `const`) and replaced the duplicated literal in `AuthPage.tsx` with a named import. The fallback-host logic now lives in a single place, eliminating the drift hazard. Verified via `npx tsc --noEmit` (no new errors in the two modified files; pre-existing TS6305 project-build diagnostics ignored per the scoping rule).

### WR-02: PostHog `identifyUser` fires twice under StrictMode / multiple entry points

**Files modified:** `vigil-pwa/src/analytics/posthog.ts`
**Commit:** a19efa0
**Applied fix:** Added a module-local `lastIdentifiedId` guard inside `identifyUser(userId, email)`. When the same userId is passed twice (StrictMode double-invocation, `/v1/me` hydration racing `handleAuthSuccess`, or HMR re-evaluation), the second call returns early before hitting `ph?.identify(...)`. Kept the `ph?.` optional chain so the function stays a no-op when `VITE_POSTHOG_KEY` is absent — existing `posthog.test.ts` cases still pass the "no-op when ph is null" assertion because the guard sits before the `ph?.` dereference. Verified via `npx tsc --noEmit` (no errors in `posthog.ts`).

### WR-03: `useGoogleStatus.test.tsx` overrides `sessionStorage` globally without teardown

**Files modified:** `vigil-pwa/src/hooks/useGoogleStatus.test.tsx`
**Commit:** f0ca099
**Applied fix:** Removed the per-test `vi.stubGlobal('sessionStorage', ...)` Map shim and switched to `sessionStorage.setItem('vigil_jwt', 'test-key')` which now writes to the shared `memorySessionStorage` installed by `setup.ts` (per-worker `globalThis`/`window` property). Added an `afterEach` that calls `sessionStorage.removeItem('vigil_jwt')` so the token does not leak into unauthenticated-path tests in sibling suites. Imported `afterEach` from `vitest`. Verified by running `npx vitest run src/hooks/useGoogleStatus.test.tsx` — all 4 tests pass.

---

_Fixed: 2026-04-19T16:23:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
