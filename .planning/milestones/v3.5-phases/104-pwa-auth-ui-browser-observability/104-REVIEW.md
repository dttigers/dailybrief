---
phase: 104-pwa-auth-ui-browser-observability
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - vigil-pwa/src/App.tsx
  - vigil-pwa/src/analytics/posthog.ts
  - vigil-pwa/src/analytics/posthog.test.ts
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/api/client.test.ts
  - vigil-pwa/src/components/ErrorBoundary.tsx
  - vigil-pwa/src/components/ErrorBoundary.test.tsx
  - vigil-pwa/src/components/Layout.tsx
  - vigil-pwa/src/hooks/useGoogleStatus.test.tsx
  - vigil-pwa/src/main.tsx
  - vigil-pwa/src/pages/AuthPage.tsx
  - vigil-pwa/src/pages/AuthPage.test.tsx
  - vigil-pwa/src/pages/SettingsPage.tsx
  - vigil-pwa/src/pages/SettingsPage.test.tsx
  - vigil-pwa/src/test/setup.ts
  - vigil-pwa/package.json
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 104: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 104 ships the PWA auth UI (login/signup), sign-out wiring, root ErrorBoundary, and PostHog-based browser observability. The implementation is cohesive and addresses prior-phase pitfalls explicitly (the JWT-after-signout route bounce is fixed via `vigil:signout` CustomEvent, OAuth error codes are passed through an allowlist, and PostHog is configured with `persistence: 'memory'` to avoid localStorage writes).

No Critical security issues found. The login credential path is a plain `fetch` over HTTPS with a generic error response (no user enumeration), and the JWT is stored in `sessionStorage` per the documented auth migration. The ErrorBoundary correctly reports to PostHog and recovers via reload.

Three Warnings concern correctness/maintainability: (1) `API_BASE` is duplicated between `client.ts` and `AuthPage.tsx` and will silently diverge if either is edited; (2) the `posthog` module-level `init()` call runs at import time with no guard against SSR or double-import, which combined with React 19 StrictMode (double-mount `useEffect`) can produce two `identifyUser` calls per session — harmless but wasteful; (3) the `useGoogleStatus` test stubs `sessionStorage` globally without restoring it, risking cross-test contamination if other suites rely on the shimmed `memorySessionStorage` from `setup.ts`.

Info items cover dead-code, redundant comments, a React-hooks-exhaustive-deps suppression, and a minor accessibility nit on the AuthPage error message. None block shipping.

## Warnings

### WR-01: `API_BASE` duplicated in `AuthPage.tsx` and `client.ts`

**File:** `vigil-pwa/src/pages/AuthPage.tsx:9`
**Issue:** The `API_BASE` constant is redefined inside `AuthPage.tsx` with identical logic to `client.ts:3`:
```ts
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? (import.meta.env.DEV ? '' : 'https://api.vigilhub.io')
```
This is a drift hazard — a future change to the fallback host (e.g. a staging override, or dropping the DEV branch) must be made in two places or login/signup will silently call a different origin than the rest of the app. Note also that `vigilFetch()` is not reusable here because pre-auth requests carry no bearer, but the URL-building logic could be shared.

**Fix:** Export `API_BASE` from `client.ts` and import it in `AuthPage.tsx`:
```ts
// client.ts
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? (import.meta.env.DEV ? '' : 'https://api.vigilhub.io')

// AuthPage.tsx
import { storeKey, API_BASE } from '../api/client'
```
Or add a small `unauthedFetch(path, init)` helper in `client.ts` and use it for `/v1/auth/login` and `/v1/auth/register`.

### WR-02: PostHog init fires at import time — no StrictMode / double-import guard

**File:** `vigil-pwa/src/analytics/posthog.ts:5-12`
**Issue:** `posthog.init()` runs at module-evaluation time as a side effect of `import './analytics/posthog'` in `main.tsx:4`. Vite dev-mode HMR can re-evaluate the module on edit, and in production bundlers occasionally hoist modules in ways that re-run top-level code. More importantly, `App.tsx` mounts under `<StrictMode>` (main.tsx:10) which intentionally double-invokes `useEffect` bodies in dev — so the `identifyUser()` calls in `App.tsx:31-39` and `App.tsx:23-26` will fire twice on every dev session, and PostHog will see two `$identify` events in a row. This is benign in prod (StrictMode double-mount is dev-only) but can mask "why did I get two identify events" during debugging, and makes the "identify on mount" path sensitive to future refactors.

`posthog-js` internally debounces repeat `init()` calls via its singleton, so a second `init()` is mostly idempotent — the concern is the `identify` call pattern, not `init` itself.

**Fix:** Either (a) accept StrictMode double-fire as normal and add a one-line comment in `App.tsx:31` so future readers don't chase it, or (b) gate `identifyUser` on a module-local `alreadyIdentified` ref:
```ts
// posthog.ts
let lastIdentifiedId: string | null = null
export function identifyUser(userId: string, email: string): void {
  if (lastIdentifiedId === userId) return
  lastIdentifiedId = userId
  ph?.identify(userId, { email })
}
```
Option (b) also protects against the edge case where both the `/v1/me` fetch AND `handleAuthSuccess` fire for the same session (which can happen if a user logs in and the effect hasn't unmounted yet).

### WR-03: `useGoogleStatus.test.tsx` overrides `sessionStorage` globally without teardown

**File:** `vigil-pwa/src/hooks/useGoogleStatus.test.tsx:17-25`
**Issue:** The test uses `vi.stubGlobal('sessionStorage', { ... })` with an ad-hoc Map-backed shim, but `vi.unstubAllGlobals()` is only called in the *next* test's `beforeEach`, not in an `afterEach`. If this test file runs before other suites in the same worker (e.g. `client.test.ts` which reads `sessionStorage.getItem('vigil_jwt')` via `getStoredKey()`), the shim persists into `client.test.ts`'s `beforeEach`, which sets `sessionStorage.setItem('vigil_jwt', 'test-key')` on a stub that's been replaced rather than the `memorySessionStorage` from `setup.ts`. Vitest normally isolates workers but with `--pool=threads` and file reordering this is fragile.

The `beforeEach` also seeds the Map with `['vigil_jwt', 'test-key']` *every* test, so even tests that exercise the unauthenticated path see a key — masking any bug where `getGoogleStatus()` is called without auth.

**Fix:** Add an `afterEach` and rely on `setup.ts`'s `memorySessionStorage` instead of a local Map:
```ts
beforeEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.setItem('vigil_jwt', 'test-key')
})
afterEach(() => {
  sessionStorage.removeItem('vigil_jwt')
})
```
The `setup.ts` shim is already installed on both `globalThis` and `window`, so no manual `vi.stubGlobal('sessionStorage', ...)` is needed in this file.

## Info

### IN-01: Dead-code fallback in `posthog.ts` — `posthog.init()` returns `PostHog`, never null

**File:** `vigil-pwa/src/analytics/posthog.ts:11`
**Issue:** The `?? null` after `posthog.init(...)` suggests `init()` might return a falsy value. Per `posthog-js` type `init(token, config?, name?): PostHog` (non-nullable), this branch is unreachable. Not a bug, but confusing.
**Fix:** Drop the `?? null`, or add a comment noting it's a defensive cast against future API changes.

### IN-02: `autoComplete={isLogin ? 'email' : 'email'}` is a no-op ternary

**File:** `vigil-pwa/src/pages/AuthPage.tsx:96`
**Issue:** Both branches return `'email'` — the ternary is vestigial. (The password autocomplete directly below uses `current-password` vs `new-password` correctly, line 109.)
**Fix:** Simplify to `autoComplete="email"`.

### IN-03: `react-hooks/exhaustive-deps` suppressed on SettingsPage callback effect

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:98-99`
**Issue:** The `eslint-disable-next-line react-hooks/exhaustive-deps` comment suppresses the missing-deps warning for `[searchParams, refetch]`. The comment above explains why (D-11 / Pitfall 4: "read params ONCE on mount"), but if `useSearchParams` ever emits a new reference or `refetch` gets stabilized differently, the suppression hides the signal. React's own docs prefer a `useRef`-guarded `hasRun` flag over `exhaustive-deps` suppression.
**Fix:** Replace the suppression with a ref guard:
```ts
const hasProcessedCallbackRef = useRef(false)
useEffect(() => {
  if (hasProcessedCallbackRef.current) return
  hasProcessedCallbackRef.current = true
  // ... existing body
}, [searchParams, refetch])
```

### IN-04: `AuthPage` error paragraph lacks `role="alert"`

**File:** `vigil-pwa/src/pages/AuthPage.tsx:113-115`
**Issue:** The error message `<p className="mt-2 text-sm text-red-400">{error}</p>` is announced to sighted users via color but not to screen-reader users on state change. Compare to `SettingsPage.tsx:195` which uses `role="alert"` on its banner.
**Fix:** Add `role="alert"` or `aria-live="polite"`:
```tsx
{error && (
  <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>
)}
```

### IN-05: `putTaskStatusFilter` is fire-and-forget but not marked `void`-returning

**File:** `vigil-pwa/src/api/client.ts:708-713`
**Issue:** The function signature is `Promise<void>` but the body doesn't `await` or `return` the `vigilFetch` call — it attaches a `.catch()` and returns synchronously. Callers that `await` this will resolve immediately (correct), but anyone reading the signature assumes it roundtrips. Minor but easy to miss.
**Fix:** Either `return vigilFetch(...)` to actually await the PUT, or change the signature to `void` and document fire-and-forget intent:
```ts
export function putTaskStatusFilter(filter: TaskStatusFilterValue): void {
  vigilFetch('/v1/settings/task-status-filter', { ... }).catch(() => { /* fire-and-forget */ })
}
```
Out of phase-104 scope strictly — this lives in `client.ts` which was touched for `signOut()` — flagged because the full file is in the review set.

### IN-06: `ErrorBoundary` swallows `errorInfo` parameter

**File:** `vigil-pwa/src/components/ErrorBoundary.tsx:19-21`
**Issue:** `componentDidCatch(error, _info)` receives a React `ErrorInfo` with `componentStack` but only passes `{ boundary: 'root' }` to `captureException`. The component stack is often more useful than the raw Error for diagnosing render-time crashes, and PostHog's error tracking supports additional properties.
**Fix:** Forward the component stack:
```ts
componentDidCatch(error: Error, info: ErrorInfo): void {
  captureException(error, { boundary: 'root', componentStack: info.componentStack ?? '' })
}
```
Note: `componentStack` can be null in some edge cases, hence the `?? ''`.

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
