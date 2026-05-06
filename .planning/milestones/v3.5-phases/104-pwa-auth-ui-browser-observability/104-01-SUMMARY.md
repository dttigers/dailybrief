---
phase: 104-pwa-auth-ui-browser-observability
plan: 01
subsystem: testing

tags: [vitest, react-testing-library, sessionStorage, jwt, tdd, red-phase]

# Dependency graph
requires:
  - phase: 100-multi-user-foundation
    provides: POST /v1/auth/login + POST /v1/auth/register server endpoints (LoginResponse, RegisterResponse shapes)
provides:
  - sessionStorage memory shim in global test setup (separate store from localStorage, T-104-W0-01 isolation)
  - RED test scaffolds for AUTH-06 login + AUTH-06 signup + AUTH-07 onAuthSuccess + generic-error enforcement
  - RED test scaffold for ANLY-01 ErrorBoundary captureException(err, { boundary: 'root' }) contract
  - RED test scaffolds for posthog null-guard behaviors (ph=null, no-op, non-Error wrapping)
  - vigil_jwt / sessionStorage storage-key migration across 3 existing test files
affects: [104-02-pwa-auth-ui-implementation, 104-03-browser-observability, 105, 106, 107]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RED-before-GREEN TDD: failing test stubs committed in Plan 01 drive implementation in Plans 02/03 (Nyquist compliance)"
    - "Separate memory-storage instances for localStorage vs sessionStorage in test shim (prevents cross-contamination)"
    - "Exact-string assertions on generic auth error messages to prevent user-enumeration regressions (T-104-W0-02)"

key-files:
  created:
    - vigil-pwa/src/pages/AuthPage.test.tsx
    - vigil-pwa/src/components/ErrorBoundary.test.tsx
    - vigil-pwa/src/analytics/posthog.test.ts
  modified:
    - vigil-pwa/src/test/setup.ts
    - vigil-pwa/src/api/client.test.ts
    - vigil-pwa/src/hooks/useGoogleStatus.test.tsx
    - vigil-pwa/src/pages/SettingsPage.test.tsx

key-decisions:
  - "Reused createMemoryStorage() factory (identical signature) for sessionStorage shim with a SEPARATE Map-backed store instance — sharing memoryLocalStorage would let writes bleed across APIs in tests (T-104-W0-01)"
  - "Migrated existing client.test.ts/useGoogleStatus.test.tsx/SettingsPage.test.tsx to sessionStorage+vigil_jwt now even though client.ts still reads localStorage — accepts 3 intentionally RED tests until Plan 02, avoids churning tests twice"
  - "posthog.test.ts uses dynamic `await import('./posthog')` inside each test so module loading happens inside the assertion scope (supports future per-test mock isolation)"

patterns-established:
  - "Test-storage shim isolation: each Web Storage API gets its own memory Map to mirror browser semantics"
  - "RED stub convention: use `describe` + `it` exactly matching the post-implementation contract; failures come from missing UI elements or missing modules, not from deliberate sentinel failures"
  - "Auth generic-error assertion: tests must hard-code the full generic string — any drift triggers a red test"

requirements-completed: [AUTH-06, AUTH-07, ANLY-01]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 104 Plan 01: RED Test Scaffold Summary

**sessionStorage memory-storage shim + 11 RED test stubs covering AUTH-06 login/signup, AUTH-07 onAuthSuccess, ANLY-01 ErrorBoundary capture, and posthog null-guard semantics — Nyquist gate for Plans 02/03.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-19T21:30:13Z
- **Completed:** 2026-04-19T21:33:17Z
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- sessionStorage memory shim installed in global test setup using a SEPARATE `createMemoryStorage()` instance (not the localStorage Map) — mitigation for T-104-W0-01 cross-contamination threat
- AuthPage.test.tsx scaffold: 7 tests covering login-mode form elements, mode toggle, JWT-in-sessionStorage write, onAuthSuccess callback, and exact-string generic-error assertion for both login 401 and signup 409 (T-104-W0-02)
- ErrorBoundary.test.tsx scaffold: renders-children, fallback-UI with Reload button, and `captureException(err, { boundary: 'root' })` spy contract for ANLY-01
- posthog.test.ts scaffold: ph=null assertion, captureException/identifyUser no-op semantics, non-Error throw wrapping (string/number/null)
- 3 existing tests migrated to sessionStorage + vigil_jwt — tests now encode the post-Plan-02 contract

## Task Commits

Each task was committed atomically:

1. **Task 1: sessionStorage shim + migrate 3 existing test files** - `068c936` (test)
2. **Task 2: RED stubs for AuthPage/ErrorBoundary/posthog** - `e28bc14` (test)

## Files Created/Modified

**Created:**
- `vigil-pwa/src/pages/AuthPage.test.tsx` — 7 RED tests encoding post-Plan-02 login/signup contract
- `vigil-pwa/src/components/ErrorBoundary.test.tsx` — 3 RED tests encoding post-Plan-03 error-boundary contract
- `vigil-pwa/src/analytics/posthog.test.ts` — 3 RED tests encoding post-Plan-03 null-guard contract

**Modified:**
- `vigil-pwa/src/test/setup.ts` — added memorySessionStorage via shared `createMemoryStorage()` factory
- `vigil-pwa/src/api/client.test.ts` — both describe blocks swapped to sessionStorage/vigil_jwt
- `vigil-pwa/src/hooks/useGoogleStatus.test.tsx` — stubbed global swapped from `localStorage` to `sessionStorage`, Map key swapped to `vigil_jwt`
- `vigil-pwa/src/pages/SettingsPage.test.tsx` — beforeEach swapped to sessionStorage/vigil_jwt

## Test Suite State

Pre-plan baseline: 1 failure (SettingsPage `?google_error=invalid_state` banner assertion).

Post-plan state: **11 failing / 105 passing** across 13 test files. Breakdown of failures:

- **7** AuthPage.test.tsx — RED as designed (AuthPage still renders API-key field, not email+password)
- **1** ErrorBoundary.test.tsx — module-not-found (Plan 03 creates the component)
- **1** posthog.test.ts — module-not-found (Plan 03 creates the module)
- **3** client.test.ts Bearer-header assertions — temporarily RED because client.ts still reads `localStorage.getItem('vigil_api_key')` while tests now write to `sessionStorage`. Plan 02 points client.ts at sessionStorage/vigil_jwt, flipping these back to GREEN.
- **1** pre-existing SettingsPage `invalid_state` banner (carry from before Plan 01)

All 108 pre-Plan-01 passing tests still pass (the 3 client.test.ts tests that now fail were passing before the storage swap — this is the expected cost of migrating tests one plan ahead of implementation).

## Decisions Made

- **Migrated existing tests ahead of client.ts implementation** — accepts 3 intentional RED tests in Plan 01 to avoid churning the same files twice. Plan 02 flips them back to GREEN by updating client.ts storage key.
- **Used shared `createMemoryStorage()` factory** — sessionStorage shim mirrors localStorage shim exactly except for the Map instance, keeping the setup file compact and the behavior symmetric.
- **Dynamic `import('./posthog')` inside each test** — lets future tests mock module init with different env vars without hoisted-import pitfalls.
- **Tests encode the exact generic error string** — `'Invalid email or password. Please try again.'` — if any future implementation diverges (e.g., distinguishes "user not found" vs "wrong password"), tests catch the user-enumeration regression immediately (T-104-W0-02).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02 (AUTH-06 implementation) can begin immediately. When it ships:
  - `client.ts` points at sessionStorage/vigil_jwt → the 3 client.test.ts Bearer tests flip GREEN
  - AuthPage renders email+password+mode-toggle and calls `/v1/auth/login` + `/v1/auth/register` → all 7 AuthPage.test.tsx assertions flip GREEN
- Plan 03 (ANLY-01/posthog + ErrorBoundary) can begin immediately. When it ships:
  - `vigil-pwa/src/analytics/posthog.ts` created with ph, captureException, identifyUser → 3 posthog.test.ts assertions flip GREEN
  - `vigil-pwa/src/components/ErrorBoundary.tsx` created with componentDidCatch → captureException wiring → 3 ErrorBoundary.test.tsx assertions flip GREEN
- Pre-existing SettingsPage `invalid_state` banner failure is unrelated to Phase 104 scope — deferred to future plan.

---
*Phase: 104-pwa-auth-ui-browser-observability*
*Completed: 2026-04-19*

## Self-Check: PASSED

Verified before state updates:
- `vigil-pwa/src/test/setup.ts` — FOUND (contains `sessionStorage`, `memorySessionStorage`)
- `vigil-pwa/src/api/client.test.ts` — FOUND (4 `vigil_jwt`, 0 `vigil_api_key`, 2 `sessionStorage.setItem`)
- `vigil-pwa/src/hooks/useGoogleStatus.test.tsx` — FOUND (1 `'vigil_jwt'`, 0 `'vigil_api_key'`, 1 `stubGlobal('sessionStorage'`)
- `vigil-pwa/src/pages/SettingsPage.test.tsx` — FOUND (1 `sessionStorage.setItem('vigil_jwt'`)
- `vigil-pwa/src/pages/AuthPage.test.tsx` — FOUND (2 `vigil_jwt`, 2 `sessionStorage.getItem`, 2 exact-match error strings)
- `vigil-pwa/src/components/ErrorBoundary.test.tsx` — FOUND (2 `captureException`, 1 `boundary: 'root'`)
- `vigil-pwa/src/analytics/posthog.test.ts` — FOUND (2 `toBeNull`)
- Commit `068c936` — FOUND in git log
- Commit `e28bc14` — FOUND in git log
- Final `npm test`: 11 failed / 105 passed (116) — matches plan expectation
