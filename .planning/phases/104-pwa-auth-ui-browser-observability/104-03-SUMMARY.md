---
phase: 104-pwa-auth-ui-browser-observability
plan: 03
subsystem: auth

tags: [pwa, react, auth, jwt, sessionStorage, posthog, identify, settings, sign-out, event-bus, tdd]

# Dependency graph
requires:
  - phase: 103-multi-user-foundation
    provides: GET /v1/me endpoint (Bearer JWT → { userId, email })
  - phase: 104-02
    provides: sessionStorage vigil_jwt persistence, AuthPage onAuthSuccess(userId,email) callback, posthog.identifyUser wrapper, clearKey with legacy cleanup
provides:
  - App.tsx identifyUser wiring on both fresh auth and returning-session mount (ANLY-01 closed end-to-end in the browser)
  - SettingsPage Vigil Account section at top of Settings content — email from GET /v1/me + Sign out button
  - signOut() helper + 'vigil:signout' CustomEvent bus in api/client.ts — single source of truth for sign-out side effects, keeps App.tsx isAuthenticated in sync with sessionStorage state
  - 3 new unit tests covering signOut storage clear + event dispatch + listener-observable cleared state
affects: [105-product-events, 106-g2-resubmit, 107-ext-persistence]

# Tech tracking
tech-stack:
  added: []  # no new dependencies — all work built on Plan 02's posthog-js + existing react-router
  patterns:
    - "Global event bus for cross-component auth-state sync: dispatch CustomEvent on window, listeners flip React state — decouples low-level storage mutation (api/client) from high-level component state (App.tsx) without prop-drilling or context"
    - "Silent-failure observability: /v1/me fetch on mount uses `.catch(() => {})` (App) and silent-set-loading-false (Settings) — best-effort identify + email display never block the UI or surface errors"
    - "Route-guard desync is a distinct failure mode from storage state: clearing sessionStorage is necessary but not sufficient — React state mirroring storage must be synchronized explicitly when storage is mutated from outside the owning component"

key-files:
  created: []
  modified:
    - vigil-pwa/src/App.tsx
    - vigil-pwa/src/pages/SettingsPage.tsx
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/api/client.test.ts

key-decisions:
  - "Returning-session identify swallows errors silently — a 401 from /v1/me on mount does NOT force logout. The vigilFetch auth guard on protected routes handles stale-JWT redirect when the user next navigates to a protected page (per 104-03 T-104-03-01 mitigation)"
  - "Sign-out side effects centralized in api/client.ts signOut() — clears JWT + dispatches 'vigil:signout' CustomEvent on window. Layout.tsx and SettingsPage.tsx now call signOut() instead of inline clearKey(), so any future sign-out trigger gets the same behavior for free"
  - "'vigil:signout' chosen over React Context for cross-component auth state sync — App.tsx is a single listener, no tree-wide re-render is desirable, and the event bus is already the dead-simplest way to keep storage state and component state in lockstep without pulling in a global store"
  - "UAT-found sign-out desync fixed inline rather than deferred — the Plan-03 checkpoint would have marked SC#2 and SC#6 as regressions without it; adding the event bus kept commit scope tight (5 files, +82/-5) and shipped with test coverage"

patterns-established:
  - "window CustomEvent as a lightweight auth-state event bus — handlers mount in useEffect, listeners cleaned up on unmount; no external dep, no context provider boilerplate"
  - "signOut() as the canonical sign-out API — any call site that needs to sign the user out imports from api/client, never mutates storage directly"

requirements-completed: [AUTH-06, AUTH-07, ANLY-01]

# Metrics
duration: 24m 9s
completed: 2026-04-19
---

# Phase 104 Plan 03: PWA Auth UI + Browser Observability (Settings + Identify Wiring) Summary

**App.tsx identify wiring on fresh auth + returning-session mount, SettingsPage Vigil Account card with /v1/me email + Sign out, plus a UAT-found event-bus fix for sign-out auth-state desync — Phase 104 closes with all 5 success criteria human-verified.**

## Performance

- **Duration:** 24m 9s (includes ~15 min of human verification + gap-fix cycle)
- **Started:** 2026-04-19T21:42:54Z (first plan commit)
- **Completed:** 2026-04-19T22:07:03Z (gap-fix commit)
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 5

## Accomplishments

- **ANLY-01 closed end-to-end in the browser.** `handleAuthSuccess(userId, email)` now calls `identifyUser` immediately after `setIsAuthenticated`, and a mount-time `useEffect` identifies returning sessions by reading sessionStorage and fetching `/v1/me`. PostHog now attributes events to a real user identity in both new-login and reopened-tab paths.
- **Settings now shows the signed-in user.** "Vigil Account" is the first card on the Settings page, rendering the user's email from `/v1/me` and exposing a Sign out button. Loading state is "Loading…"; failure state is silent (no banner, empty email per D-07).
- **Sign-out auth-state desync fixed.** UAT caught that signing out from Settings cleared `vigil_jwt` but left App.tsx's `isAuthenticated=true`, which bounced the user off `/auth` back to `/` and surfaced a "401 fetch thoughts" error instead of the login form. The fix centralizes sign-out in `signOut()` and dispatches a `vigil:signout` CustomEvent that App listens for and uses to flip `isAuthenticated` false.
- **Test suite state:** 124 passed / 1 pre-existing failed — 3 new tests added for `signOut`, the single failure is the pre-existing `SettingsPage invalid_state` banner (tracked separately, out of Phase 104 scope, unchanged since Plan 01).
- **All 5 phase success criteria human-verified:** (1) new user signup → dashboard, (2) existing user login → dashboard, (3) generic error string identical for wrong-email and wrong-password paths, (4) React render error appears as PostHog exception, (5) `vigil_jwt` in SessionStorage, nothing in LocalStorage. SC#6 (Vigil Account email + working Sign out) now also passes after the gap fix.

## Task Commits

Each task was committed atomically. The gap-fix is a fourth commit scoped under this plan because it closes the human-verification gate:

1. **Task 1: Wire identifyUser in App.tsx (auth success + mount)** — `f216c46` (feat)
2. **Task 2: Vigil Account section in SettingsPage** — `5cd23b5` (feat)
3. **Task 3: Human verification checkpoint** — user-run, no code commit (verifier typed "approved" after gap fix)
4. **Gap fix: Sign-out auth-state sync via vigil:signout event + 3 new tests** — `e26d221` (fix)

_Note: the gap fix is a UAT-discovered deviation handled inline under Rule 1 (Bug). See "Deviations from Plan" below._

## Files Created/Modified

**Modified:**
- `vigil-pwa/src/App.tsx` — added `identifyUser` + `vigilFetch` imports, changed `handleAuthSuccess` signature to `(userId, email) => void` and wired identifyUser call, added returning-session mount useEffect, added `vigil:signout` window listener that sets `isAuthenticated=false`
- `vigil-pwa/src/pages/SettingsPage.tsx` — added `useNavigate`, `vigilFetch`, `signOut` imports; added `accountEmail` + `accountLoading` state with /v1/me fetch effect; inserted Vigil Account card at top of content area with email display, Loading… state, and Sign out button (`onClick={() => { signOut(); navigate('/auth') }}`)
- `vigil-pwa/src/api/client.ts` — added `signOut()` helper that calls `clearKey()` then dispatches `new CustomEvent('vigil:signout')` on window
- `vigil-pwa/src/components/Layout.tsx` — replaced inline `clearKey()` in handleSignOut with `signOut()` call (single source of truth)
- `vigil-pwa/src/api/client.test.ts` — added 3 new tests: signOut clears storage, signOut dispatches CustomEvent on window, listeners observe cleared storage when event fires

## Decisions Made

- **Silent failure on /v1/me during mount identify** — chose a bare `.catch(() => {})` in App.tsx's returning-session useEffect over forcing a logout on 401. Rationale: observability is best-effort (per 104-RESEARCH open question #2) and the vigilFetch auth guard already handles stale-JWT redirects on the next protected-route navigation. Aggressive logout-on-mount would have kicked valid users out whenever /v1/me hiccuped transiently.
- **Centralized signOut() helper instead of scattered clearKey() calls** — during the gap fix, rather than adding an event dispatch at each call site (Layout + SettingsPage), the sign-out sequence (storage clear + event dispatch) was moved into `api/client.ts`. Any future sign-out trigger (menu item, keyboard shortcut, inactivity timeout) imports `signOut` and gets the correct behavior for free.
- **CustomEvent bus over React Context for sign-out** — App.tsx is the sole consumer of the isAuthenticated-sync signal. Introducing an AuthContext would have required a provider + consumer refactor across the app tree for a single state mutation; the window CustomEvent is zero-dep, zero-boilerplate, and scoped to exactly the side effect it covers. If more components need auth state later, they can listen to the same event.
- **Gap fix committed under the 104-03 scope** — the UAT-discovered bug is a direct consequence of Plan 03's Sign-out implementation (nothing pre-existing called `clearKey` and navigated away during normal user flow before this plan). Keeping the fix under this plan's commit scope preserves traceability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sign-out auth-state desync between sessionStorage and App.tsx isAuthenticated**
- **Found during:** Task 3 (human verification checkpoint, SC#6)
- **Issue:** Signing out from Settings ran `clearKey()` + `navigate('/auth')`, which cleared `vigil_jwt` from sessionStorage but left `isAuthenticated=true` in App.tsx's state. The `/auth` route guard `isAuthenticated ? <Navigate to="/" /> : <AuthPage />` then bounced the user straight back to `/`. Dashboard mounted without a JWT and rendered "Failed to fetch thoughts: 401" instead of the login form the user expected.
- **Fix:** Introduced a `signOut()` helper in `api/client.ts` that calls `clearKey()` then dispatches `new CustomEvent('vigil:signout')` on window. App.tsx mounts a `vigil:signout` listener that sets `isAuthenticated=false`, so the /auth redirect now sticks. Layout.tsx and SettingsPage.tsx updated to call `signOut()` instead of inline `clearKey()`.
- **Files modified:** `vigil-pwa/src/api/client.ts`, `vigil-pwa/src/App.tsx`, `vigil-pwa/src/components/Layout.tsx`, `vigil-pwa/src/pages/SettingsPage.tsx`, `vigil-pwa/src/api/client.test.ts`
- **Verification:** 3 new unit tests cover signOut storage clear, CustomEvent dispatch shape, and cross-listener observation. Full suite: 124 passed / 1 pre-existing failed. Human reran SC#2 and SC#6 manually and typed "approved".
- **Committed in:** `e26d221` (fix: sync isAuthenticated on sign-out via vigil:signout event)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug, UAT-surfaced)
**Impact on plan:** The bug was a direct consequence of Plan 03's Sign-out addition — SettingsPage introduced the first normal-flow call to `clearKey()`+`navigate('/auth')`. Without the fix, SC#6 would have been a hard regression. Scope stayed tight (5 files, +82/-5 excluding tests). No schema changes, no new deps, no architectural deviation — just the minimum plumbing to keep storage state and React state synchronized on sign-out.

## Issues Encountered

- **UAT bug on SC#6 (sign-out redirect loop)** — surfaced during human verification, fixed inline as described above. Resolution added a missing-critical event bus for auth-state sync; the test suite now has explicit coverage so a regression will be caught automatically rather than relying on a UAT pass.

## User Setup Required

None — no external service configuration required. In production, the same `VITE_POSTHOG_KEY` used by Plan 02 now attributes identified users to real userId + email in PostHog Cloud; no additional env vars or dashboard configuration.

## Next Phase Readiness

- **Phase 104 is complete.** All three plans (01 RED scaffolds, 02 implementation, 03 Settings + identify wiring + gap fix) are landed. All 5 phase success criteria human-verified on 2026-04-19.
- **Plan 105 (product events)** can begin immediately. What's newly available for it:
  - `identifyUser(userId, email)` is already called on both new login and returning-session mount — any `trackEvent()` calls in subsequent plans will automatically attribute to the correct user.
  - `signOut()` exists as the canonical sign-out helper; any inactivity-timer or "sign out other sessions" feature in later plans imports from `api/client`.
  - `vigil:signout` CustomEvent is a reusable signal for any component that needs to react to auth-state teardown (e.g., flushing in-memory caches, aborting in-flight requests).
- **Pre-existing SettingsPage `invalid_state` banner failure** still unresolved — unchanged since Plan 01 baseline. Tracked as out-of-scope for Phase 104 per prior SUMMARIES; a future cleanup plan will address it.
- **Threat flags:** no new trust boundaries introduced beyond those declared in PLAN.md `<threat_model>`. T-104-03-01 through T-104-03-05 all mitigated or accepted as designed. The new `vigil:signout` event carries no payload data, so no information-disclosure surface was added.

---
*Phase: 104-pwa-auth-ui-browser-observability*
*Completed: 2026-04-19*

## Self-Check: PASSED

Verified before state updates:
- `vigil-pwa/src/App.tsx` — FOUND (identifyUser at lines 4/25/36, vigilFetch at line 33, vigil:signout listener at lines 45/49/50)
- `vigil-pwa/src/pages/SettingsPage.tsx` — FOUND (Vigil Account at line 218, vigilFetch('/v1/me') at line 66, signOut import at line 14, signOut() at line 226)
- `vigil-pwa/src/api/client.ts` — FOUND (signOut helper at line 29, vigil:signout CustomEvent dispatch at line 31)
- `vigil-pwa/src/components/Layout.tsx` — FOUND (signOut import + call)
- `vigil-pwa/src/api/client.test.ts` — FOUND (3 new tests under `describe('api/client signOut', ...)` at line 139)
- Commit `f216c46` — FOUND in git log (Task 1: App.tsx identifyUser wiring)
- Commit `5cd23b5` — FOUND in git log (Task 2: SettingsPage Vigil Account section)
- Commit `e26d221` — FOUND in git log (Gap fix: vigil:signout event bus + 3 tests)
- Test suite state (per prior executor run, unchanged): 124 passed / 1 pre-existing failed (SettingsPage invalid_state banner — out of Phase 104 scope)
