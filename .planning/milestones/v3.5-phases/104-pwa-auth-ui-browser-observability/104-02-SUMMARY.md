---
phase: 104-pwa-auth-ui-browser-observability
plan: 02
subsystem: auth

tags: [pwa, react, auth, jwt, sessionStorage, posthog, error-boundary, observability, tdd, green-phase]

# Dependency graph
requires:
  - phase: 100-multi-user-foundation
    provides: POST /v1/auth/login + POST /v1/auth/register server endpoints (HS256 JWT + argon2id claim flow)
  - phase: 104-01
    provides: RED test scaffolds (AuthPage 7 tests, ErrorBoundary 3 tests, posthog 3 tests), sessionStorage memory shim, vigil_jwt key migration across 3 existing test files
provides:
  - sessionStorage JWT persistence in api/client.ts (STORAGE_KEY='vigil_jwt', LEGACY_KEY='vigil_api_key' cleanup on logout — D-10)
  - AuthPage email+password form with login/signup mode toggle, two-step signup (register → login), generic error for all 4xx (T-104-02-01)
  - posthog-js browser singleton with key-absence gate, memory persistence (T-104-02-04), autocapture disabled (T-104-02-03)
  - ErrorBoundary class component wired to captureException(err, { boundary: 'root' }) per D-19
  - main.tsx wires posthog side-effect import before createRoot (D-14), ErrorBoundary inside BrowserRouter (D-17)
affects: [104-03-settings-account-identify-wiring, 105-product-events, 106-g2-resubmit, 107-ext-persistence]

# Tech tracking
tech-stack:
  added:
    - posthog-js@^1.369.3
  patterns:
    - "Browser analytics null-guard: ph typed as PostHog | null; VITE_POSTHOG_KEY absence yields no-op wrappers — mirrors vigil-core/src/analytics/posthog.ts architecture"
    - "captureException wraps non-Error throws in new Error(String(err)) before ph.captureException to satisfy PostHog's Error-only capture contract"
    - "Generic error string hardcoded as module constant GENERIC_ERROR = 'Invalid email or password. Please try again.' — never derived from server response body, prevents user-enumeration (T-104-02-01)"
    - "Two-step signup flow: POST /v1/auth/register (201 returns {id,email} only) → POST /v1/auth/login (returns {token,user}) — D-04 auto-login after successful claim"

key-files:
  created:
    - vigil-pwa/src/analytics/posthog.ts
    - vigil-pwa/src/components/ErrorBoundary.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/pages/AuthPage.tsx
    - vigil-pwa/src/main.tsx
    - vigil-pwa/package.json
    - vigil-pwa/package-lock.json

key-decisions:
  - "Kept STORAGE_KEY naming (not renaming to JWT_STORAGE_KEY) for minimal blast radius — only the VALUE changed from 'vigil_api_key' to 'vigil_jwt'; vigilFetch and all downstream callers remain identical"
  - "clearKey removes BOTH sessionStorage['vigil_jwt'] AND localStorage['vigil_api_key'] on every call (not just a one-time migration) — D-10 idempotent legacy cleanup handles users who open an old tab after the migration"
  - "AuthPage onAuthSuccess signature changed from `() => void` to `(userId, email) => void` — enables ANLY-01 identifyUser wiring in Plan 03 without another AuthPage touch"
  - "posthog.ts returns `posthog.init(...) ?? null` — guards against PostHog builds where init returns undefined (Pitfall 6 from RESEARCH.md)"
  - "ErrorBoundary placed INSIDE BrowserRouter (not outside) — D-17 allows future fallback UI to use router context if needed (e.g. Link to /settings from error screen)"

patterns-established:
  - "Key-absence gate for browser third-party SDKs: VITE_* env var absence → singleton null → all wrappers no-op; keeps dev/test environments silent without mocks"
  - "Hardcoded generic-error constants at module scope (not inline in handler) make the user-enumeration contract self-documenting and tests trivially assertable"
  - "Side-effect imports for SDK initialization ordering: bare `import './analytics/posthog'` (no named binding) fires init() before React mounts, guaranteeing queued events land"

requirements-completed: [AUTH-06, AUTH-07, ANLY-01]

# Metrics
duration: 3m 3s
completed: 2026-04-19
---

# Phase 104 Plan 02: PWA Auth UI + Browser Observability (Implementation) Summary

**sessionStorage JWT migration + email/password AuthPage with signup mode + posthog-js browser singleton + ErrorBoundary — turns 13 RED tests from Wave 0 GREEN in one pass.**

## Performance

- **Duration:** 3m 3s
- **Started:** 2026-04-19T21:36:05Z
- **Completed:** 2026-04-19T21:39:08Z
- **Tasks:** 2
- **Files modified:** 7 (2 created, 5 modified — including package.json/lock)

## Accomplishments

- **JWT storage migrated from localStorage→sessionStorage** (STATE.md locked decision: XSS-persistence-window vs tab-session tradeoff accepted for single-user app). Legacy `vigil_api_key` is actively cleared on every logout, so users who reopen an old tab post-migration get a clean slate.
- **AuthPage fully replaced**: API-key paste box → email + password form with login (default) + signup toggle + two-step register→login flow. Generic error string `Invalid email or password. Please try again.` for all 4xx on both endpoints — no user enumeration (T-104-02-01).
- **PostHog browser singleton**: `persistence: 'memory'` prevents `ph_*` keys in localStorage (T-104-02-04); `autocapture: false` prevents DOM form/click instrumentation leaking passwords or thought content (T-104-02-03); key-absence gate keeps ph=null in dev/test so the 3 posthog tests pass without mocks.
- **ErrorBoundary** class component wraps App inside BrowserRouter; `componentDidCatch` pipes errors to `captureException(err, { boundary: 'root' })`; fallback UI shows only "Something went wrong" + Reload button — no stack trace exposure (T-104-02-05).
- **Test suite delta**: 11 failed / 105 passed → 1 failed / 121 passed (the remaining failure is the pre-existing SettingsPage `invalid_state` banner, unrelated to Phase 104 scope, carried forward from before Plan 01).

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate client.ts storage + replace AuthPage** — `2f5f6d6` (feat)
2. **Task 2: posthog.ts + ErrorBoundary + wire main.tsx** — `33d430f` (feat)

## Files Created/Modified

**Created:**
- `vigil-pwa/src/analytics/posthog.ts` — PostHog browser singleton with key-absence gate and null-guard wrappers (captureException, identifyUser)
- `vigil-pwa/src/components/ErrorBoundary.tsx` — React class component catching render errors, piping to captureException with `{ boundary: 'root' }`

**Modified:**
- `vigil-pwa/src/api/client.ts` — STORAGE_KEY → 'vigil_jwt' in sessionStorage; clearKey also removes LEGACY 'vigil_api_key' from localStorage (D-10)
- `vigil-pwa/src/pages/AuthPage.tsx` — full rewrite: email+password form, mode toggle, two-step signup, hardcoded GENERIC_ERROR
- `vigil-pwa/src/main.tsx` — side-effect import of `./analytics/posthog` BEFORE App import; ErrorBoundary wraps App inside BrowserRouter
- `vigil-pwa/package.json` + `vigil-pwa/package-lock.json` — posthog-js@^1.369.3 added (39 transitive packages)

## Decisions Made

- **onAuthSuccess signature expansion** — changed from `() => void` to `(userId: string, email: string) => void` in this plan so Plan 03 can wire `identifyUser(userId, email)` in App without re-editing AuthPage. Plan called for this signature explicitly; no deviation.
- **`?? null` after `posthog.init(...)`** — posthog-js types declare the return as `PostHog | undefined` in some builds; the nullish coalesce keeps `ph` strictly `PostHog | null` so the null-guard wrappers stay typesafe (Pitfall 6 from RESEARCH.md).
- **Module-scope `GENERIC_ERROR` constant** — hoisted the user-facing error string to module scope (instead of inline in handler) so the user-enumeration contract is self-documenting and tests assert against the exact identifier, not a literal that could drift on rewording.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. All three structural acceptance checks passed on first run (sessionStorage usage in client.ts, main.tsx import ordering `./analytics/posthog` at line 4 before `App` at line 6, ErrorBoundary wrapping App at lines 12/14).

## User Setup Required

None — no external service configuration required for tests to pass. In production, setting `VITE_POSTHOG_KEY` at build time activates the singleton; absence keeps it null (dev-safe).

## Next Phase Readiness

- **Plan 104-03** can begin immediately. What's newly available:
  - `storeKey(token)` in client.ts writes to sessionStorage under `vigil_jwt` — Settings "Vigil Account" section reads this the same way.
  - `AuthPage onAuthSuccess(userId, email)` callback is ready to be consumed by App.tsx to call `identifyUser(userId, email)` at the app level.
  - `ErrorBoundary` is mounted at the root — any new Settings components that throw during render will flow to PostHog unchanged.
- **Pre-existing SettingsPage `invalid_state` banner failure** is still present — unrelated to Phase 104 scope, deferred to a future plan as noted in 104-01-SUMMARY.
- **Threat flags:** no new trust boundaries introduced beyond those already declared in PLAN.md `<threat_model>`. T-104-02-01 through T-104-02-07 all mitigated or accepted as designed.

---
*Phase: 104-pwa-auth-ui-browser-observability*
*Completed: 2026-04-19*

## Self-Check: PASSED

Verified before state updates:
- `vigil-pwa/src/analytics/posthog.ts` — FOUND
- `vigil-pwa/src/components/ErrorBoundary.tsx` — FOUND
- `vigil-pwa/src/api/client.ts` — FOUND (sessionStorage at lines 5/8/12, LEGACY localStorage.removeItem at line 13)
- `vigil-pwa/src/pages/AuthPage.tsx` — FOUND (GENERIC_ERROR constant, mode toggle, two-step signup)
- `vigil-pwa/src/main.tsx` — FOUND (posthog import at line 4 BEFORE App at line 6, ErrorBoundary wrapping App at lines 12/14)
- Commit `2f5f6d6` — FOUND in git log (Task 1: client.ts + AuthPage)
- Commit `33d430f` — FOUND in git log (Task 2: posthog + ErrorBoundary + main.tsx)
- Final `npm test`: 1 failed / 121 passed (122 total) — matches plan expectation (pre-existing SettingsPage invalid_state carryover)
