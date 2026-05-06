# Phase 104: PWA Auth UI & Browser Observability - Research

**Researched:** 2026-04-19
**Domain:** React PWA — email/password auth forms, sessionStorage JWT, posthog-js browser integration, React error boundary
**Confidence:** HIGH (all critical claims verified against live codebase and npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Login and Signup coexist on a single `/auth` route with a toggle link below the form (default: Login mode). Extends the existing `AuthPage.tsx` centered-card aesthetic — no new routes, no route config changes.
- **D-02:** Toggle reads "Don't have an account? Sign up" / "Already have an account? Sign in". Toggles `mode` state `'login'` | `'signup'`.
- **D-03:** Signup fields: email + password only. Generic error string for all 4xx — no user enumeration.
- **D-04:** After signup succeeds, store JWT immediately and redirect to `/`. No second login step.
- **D-05:** No "Forgot Password" link.
- **D-06:** Email shown in Settings page only as "Vigil Account" section (`bg-gray-900 border border-gray-900/40 rounded-lg p-5`).
- **D-07:** "Vigil Account" section calls `GET /v1/me` on mount. Shows email as `text-gray-400 text-sm`. "Sign out" button: `clearKey()` + `navigate('/auth')`.
- **D-08:** `/v1/me` already shipped (Phase 103). No server changes.
- **D-09:** New storage key: `vigil_jwt` in `sessionStorage`. Old `vigil_api_key` in `localStorage` ignored and cleared.
- **D-10:** `getStoredKey()` reads `sessionStorage.getItem('vigil_jwt')`. `storeKey()` writes `sessionStorage.setItem('vigil_jwt', ...)`. `clearKey()` removes both.
- **D-11:** `isAuthenticated` initializer: `() => getStoredKey() !== null`. Old localStorage sessions return null → login form. Clean break, no fallback.
- **D-12:** posthog-js initialized as module-level singleton in `vigil-pwa/src/analytics/posthog.ts`. Exports: `posthog` (PostHog | null), `captureException(err, context?)`, `identifyUser(userId, email)`.
- **D-13:** Key-absence gate: `VITE_POSTHOG_KEY ? PostHog.init(...) : null`. Dev `.env.local` does NOT set key. Production sets it.
- **D-14:** `posthog.init()` called via module import in `main.tsx` — before React renders.
- **D-15:** `posthog.identify(userId, { email })` called immediately after auth success in `App.tsx handleAuthSuccess()`. Also in `useEffect` on App mount for returning sessions (calls `GET /v1/me`).
- **D-16:** `capture_pageview: false`. No automatic pageview events.
- **D-17:** Single root-level `ErrorBoundary` class component in `main.tsx` (inside `BrowserRouter`, wrapping `App`).
- **D-18:** Fallback UI: `min-h-screen bg-gray-900 flex items-center justify-center` with "Something went wrong" + "Reload" button.
- **D-19:** `ErrorBoundary.componentDidCatch(error)` calls `captureException(error, { boundary: 'root' })`.

### Claude's Discretion
- posthog-js version pin — use latest stable `posthog-js@^1`.
- Exact `posthog.init()` options — disable autocapture for now.
- Whether to add `usePostHog()` hook — skip unless needed.
- Vitest test coverage strategy for error boundary.

### Deferred Ideas (OUT OF SCOPE)
- Forgot Password flow
- Email verification on signup (AUTH-11 v3.6)
- Remember me / localStorage option
- Per-page error boundaries
- `posthog.capture()` for product events (ANLY-02/03, Phase 105)
- PostHog session replay
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-06 | PWA visitor can sign up with email + password and is logged in on success (JWT stored, subsequent API calls authenticated) | AuthPage.tsx replacement with mode toggle; POST /v1/auth/register → auto-login via POST /v1/auth/login; storeKey() → sessionStorage |
| AUTH-07 | PWA visitor can log in with existing email + password and is redirected to the dashboard | AuthPage.tsx login form; POST /v1/auth/login returns `{ token, user }` → storeKey() → navigate('/') |
| ANLY-01 (browser half) | Browser exceptions captured in PostHog (stack traces, userId when available) | posthog-js module singleton; ErrorBoundary.componentDidCatch → captureException(); posthog.identify on auth |
</phase_requirements>

---

## Summary

Phase 104 is a pure PWA client change. The server-side is fully shipped: `POST /v1/auth/register`, `POST /v1/auth/login`, and `GET /v1/me` all exist on Railway. The PWA work has three independent threads: (1) replace the API-key AuthPage with an email+password form with login/signup toggle, (2) migrate storage from `localStorage/vigil_api_key` to `sessionStorage/vigil_jwt`, and (3) add posthog-js browser observability with a root error boundary.

The most important finding for planning is a **server contract mismatch in D-04**: `POST /v1/auth/register` does NOT return a JWT token — it returns `{ id, email }` (201). Only `POST /v1/auth/login` returns `{ token, user }`. The implementation plan for signup must call login immediately after a successful register response to obtain the JWT. This is a straightforward two-step sequence, not a server change.

The second important finding is that all existing test files use `localStorage.setItem('vigil_api_key', 'test-key')` to authenticate test requests, and the test setup at `src/test/setup.ts` only shims `localStorage` — not `sessionStorage`. Both must be updated as part of the storage migration plan.

**Primary recommendation:** Plan four tasks — (1) storage migration in client.ts + test updates, (2) AuthPage replacement with mode toggle, (3) posthog.ts singleton + ErrorBoundary in main.tsx, (4) Vigil Account section in SettingsPage.tsx. Run `npm test` in vigil-pwa after each task.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| posthog-js | ^1.369.3 | Browser-side analytics, error capture, identify | Project already uses posthog-node server-side; same vendor, same PostHog Cloud project |
| react | ^19.2.5 (already installed) | React error boundary class component | Built-in; no new dep |
| react-router | ^7.14.0 (already installed) | `navigate('/auth')` on sign-out | Already used throughout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | ^16.3.2 (already installed) | Unit-test error boundary and auth forms | Phase test tasks |
| vitest | ^2.1.9 (already installed) | Test runner | All tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| posthog-js singleton module | @posthog/react PostHogProvider | Provider adds React context overhead and requires wrapping App; singleton matches server-side posthog.ts pattern already in codebase |
| Manual two-step register→login | Server adds JWT to register response | Server change requires coordinating vigil-core deploy; two-step is simpler and fully in-scope |

**Installation:**
```bash
cd vigil-pwa && npm install posthog-js
```

**Version verification:** `npm view posthog-js version` returned `1.369.3` published `2026-04-18`. [VERIFIED: npm registry]

---

## Architecture Patterns

### Recommended Project Structure (new files only)
```
vigil-pwa/src/
├── analytics/
│   └── posthog.ts          # NEW — module singleton + captureException + identifyUser
├── components/
│   └── ErrorBoundary.tsx   # NEW — root-level class component
├── pages/
│   └── AuthPage.tsx        # MODIFY — replace API-key form with email+password + toggle
├── api/
│   └── client.ts           # MODIFY — localStorage→sessionStorage, vigil_api_key→vigil_jwt
├── App.tsx                 # MODIFY — identifyUser call in handleAuthSuccess + mount effect
├── main.tsx                # MODIFY — import posthog.ts (side effect init), wrap ErrorBoundary
└── pages/
    └── SettingsPage.tsx    # MODIFY — add Vigil Account section at top
```

### Pattern 1: posthog-js Module Singleton (key-absence gate)
**What:** Module-level initialization with a null guard. Mirrors the existing `vigil-core/src/analytics/posthog.ts` shape.
**When to use:** Any time posthog API is called — all callers check null before calling.
**Example:**
```typescript
// Source: posthog.com/docs/libraries/js + server-side posthog.ts pattern [VERIFIED: WebFetch + codebase]
import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined

export const ph = key
  ? posthog.init(key, {
      api_host: 'https://us.i.posthog.com',
      capture_pageview: false,    // D-16: no automatic pageviews
      autocapture: false,          // D-12 discretion: manual capture only
      persistence: 'memory',       // no localStorage writes in prod (privacy + session scope)
    })
  : null

export function captureException(err: unknown, context: Record<string, string | boolean | number | undefined> = {}): void {
  const error = err instanceof Error ? err : new Error(String(err))
  ph?.captureException(error, context)
}

export function identifyUser(userId: string, email: string): void {
  ph?.identify(userId, { email })
}
```

**Critical note on `persistence`:** posthog-js defaults to `localStorage+cookie` — this writes PostHog-specific data (distinct ID, session info) to localStorage even when the JWT is in sessionStorage. Set `persistence: 'memory'` to avoid any localStorage writes in dev or prod. [VERIFIED: posthog.com/docs/libraries/js/config]

### Pattern 2: React Error Boundary Class Component
**What:** Class component that catches render-phase errors, calls captureException, shows fallback UI.
**When to use:** Wrap entire App in main.tsx.
**Example:**
```typescript
// Source: React docs + posthog.com/docs/error-tracking/capture [VERIFIED: WebFetch]
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { captureException } from '../analytics/posthog'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    captureException(error, { boundary: 'root' })  // D-19
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4 text-center">
            <h1 className="text-2xl font-medium text-white mb-4">Something went wrong</h1>
            <button
              className="py-2 px-4 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
```

### Pattern 3: AuthPage Mode Toggle
**What:** Single component with `mode: 'login' | 'signup'` state. Login calls `POST /v1/auth/login`. Signup calls `POST /v1/auth/register` then `POST /v1/auth/login` (two-step — see D-04 gap below).
**When to use:** Single `/auth` route per D-01.
**Key logic:**
```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  setLoading(true)
  setError(null)
  try {
    if (mode === 'login') {
      const res = await vigilFetch('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      if (!res.ok) {
        setError('Invalid email or password. Please try again.')
        return
      }
      const { token } = await res.json() as { token: string }
      storeKey(token)
      onAuthSuccess?.()
      navigate('/')
    } else {
      // Signup: two-step (register does NOT return a token — see Critical Finding below)
      const regRes = await vigilFetch('/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      if (!regRes.ok) {
        setError('Invalid email or password. Please try again.')
        return
      }
      // Auto-login after registration (D-04 intent)
      const loginRes = await vigilFetch('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      if (!loginRes.ok) {
        setError('Invalid email or password. Please try again.')
        return
      }
      const { token } = await loginRes.json() as { token: string }
      storeKey(token)
      onAuthSuccess?.()
      navigate('/')
    }
  } catch {
    setError('Invalid email or password. Please try again.')
  } finally {
    setLoading(false)
  }
}
```

### Pattern 4: Storage Migration in client.ts
**What:** Change `STORAGE_KEY` constant, swap `localStorage` → `sessionStorage`, add legacy cleanup in `clearKey()`.
```typescript
const STORAGE_KEY = 'vigil_jwt'
const LEGACY_KEY = 'vigil_api_key'

export const getStoredKey = (): string | null =>
  sessionStorage.getItem(STORAGE_KEY)

export const storeKey = (key: string): void => {
  sessionStorage.setItem(STORAGE_KEY, key)
}

export const clearKey = (): void => {
  sessionStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_KEY)  // D-10: one-time cleanup
}
```

### Pattern 5: identifyUser on Mount (returning session)
**What:** `useEffect` in App.tsx that calls `/v1/me` once if already authenticated, to identify returning users in PostHog.
```typescript
// In App.tsx
useEffect(() => {
  if (!getStoredKey()) return
  vigilFetch('/v1/me')
    .then(r => r.json())
    .then(({ userId, email }: { userId: string; email: string }) => {
      identifyUser(userId, email)
    })
    .catch(() => { /* silent — observability best-effort */ })
}, [])
```

### Anti-Patterns to Avoid
- **Calling `posthog.init()` inside a React component or useEffect:** Module-level init fires once at import time. React StrictMode double-invokes effects but NOT module-level code — the singleton approach is safe. [VERIFIED: React docs behavior]
- **Using `persistence: 'localStorage+cookie'` (the posthog-js default):** This writes PostHog metadata to localStorage even when your app uses sessionStorage for auth. It pollutes DevTools and breaks the "sessionStorage only" expectation. Use `'memory'` for this single-user private app. [VERIFIED: posthog.com/docs/libraries/js/config]
- **Importing `posthog` from the module and calling methods directly at call sites:** Match the server-side pattern — expose only `captureException` and `identifyUser` wrappers. Call sites never touch the singleton.
- **Showing different errors for wrong email vs wrong password:** The server already returns 401 for both login misses. The UI MUST show the same generic string regardless of 4xx status. [VERIFIED: STATE.md locked decision]
- **Storing JWT in localStorage:** Locked to sessionStorage per STATE.md. [VERIFIED: STATE.md]

---

## Critical Finding: D-04 Server Contract Mismatch

**CONTEXT.md D-04 states:** "After signup succeeds, the server's register response includes a JWT — store it immediately."

**ACTUAL behavior (verified in `vigil-core/src/routes/auth.ts`):**
- `POST /v1/auth/register` returns `{ id, email }` with status 201 — NO JWT [VERIFIED: codebase read]
- `POST /v1/auth/login` returns `{ token, user: { id, email } }` — JWT is here [VERIFIED: codebase read]
- `signToken()` is called ONLY in the login handler (line 153), never in register [VERIFIED: codebase grep]

**Impact:** The signup flow requires two HTTP calls:
1. `POST /v1/auth/register` → success (201) or error (4xx)
2. On 201: `POST /v1/auth/login` with same credentials → get `{ token }`

**This is not a blocker** — it is a straightforward two-step in the client, all within the existing auth endpoint surface. No server changes needed for Phase 104.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser error reporting | Custom window.onerror handler | posthog-js `captureException()` | posthog-js handles stack normalization, session context, user identity; hand-rolled solution misses unhandled promise rejections |
| React render error catch | Try/catch around render | React `ErrorBoundary` class component | React render is synchronous and cannot be wrapped in try/catch from outside; only class component lifecycle `componentDidCatch` hooks into the error boundary mechanism |
| PostHog null-safe calls | `if (posthog) posthog.X()` at every call site | Wrapper functions `captureException()`/`identifyUser()` | Pattern from server-side posthog.ts — centralizes null check, keeps call sites clean |

---

## Common Pitfalls

### Pitfall 1: posthog-js `persistence` Default Writes to localStorage
**What goes wrong:** posthog-js defaults to `persistence: 'localStorage+cookie'`. Even with no `capture_pageview` or `autocapture`, it writes a `ph_<key>_posthog` object to localStorage on init. This breaks the "sessionStorage only" DevTools verification in success criterion #5.
**Why it happens:** The library uses localStorage for its own distinct_id and session tracking.
**How to avoid:** Set `persistence: 'memory'` in `posthog.init()` options.
**Warning signs:** DevTools Application → Local Storage shows `ph_*` keys after init.
[VERIFIED: posthog.com/docs/libraries/js/config]

### Pitfall 2: Test Suite Uses localStorage for Auth — Must Update for sessionStorage Migration
**What goes wrong:** `client.test.ts`, `useGoogleStatus.test.tsx`, and `SettingsPage.test.tsx` all use `localStorage.setItem('vigil_api_key', 'test-key')` to prime auth for `vigilFetch`. After the storage migration, `getStoredKey()` reads from `sessionStorage.getItem('vigil_jwt')` — these tests will fail with unauthenticated requests.
**How to avoid:** When migrating `client.ts`, update ALL test `beforeEach` blocks and the test setup shim. The existing `setup.ts` only shims `localStorage` — add a matching `sessionStorage` shim.
**Files to update:**
- `src/test/setup.ts` — add `sessionStorage` memory shim
- `src/api/client.test.ts` — change `localStorage.setItem('vigil_api_key', ...)` → `sessionStorage.setItem('vigil_jwt', ...)`
- `src/hooks/useGoogleStatus.test.tsx` — change the stubbed `localStorage` Map key
- `src/pages/SettingsPage.test.tsx` — change `localStorage.setItem('vigil_api_key', ...)`
[VERIFIED: codebase grep of all test files]

### Pitfall 3: register Response Shape — "token" Key Does Not Exist
**What goes wrong:** If the plan assumes `const { token } = await registerRes.json()`, `token` will be `undefined` and `storeKey(undefined)` stores the string `"undefined"` in sessionStorage, making `getStoredKey() !== null` true but all API calls fail with 401.
**How to avoid:** Treat the 201 register response as a signal-only — do NOT destructure `token`. Call login separately.
[VERIFIED: codebase read of `vigil-core/src/routes/auth.ts`]

### Pitfall 4: `App.tsx` StrictMode Double-Invocation of useEffect
**What goes wrong:** The returning-session `useEffect` that calls `/v1/me` + `identifyUser` runs twice in development StrictMode. Two `identify()` calls for the same user are harmless in PostHog, but it means two API calls on every dev reload.
**How to avoid:** No mitigation needed — double-call is harmless. Do not add `useRef` guards that might prevent the identify from running in production.
[ASSUMED — StrictMode behavior is stable in React 19]

### Pitfall 5: AuthPage Receives `onAuthSuccess` Prop — Must Also Call `identifyUser` There
**What goes wrong:** `App.tsx handleAuthSuccess()` sets `isAuthenticated(true)`. If `identifyUser()` is only called in the mount `useEffect` (which runs on page load, not on auth success), then users who log in during a session will not be identified until they reload.
**How to avoid:** Call `identifyUser(userId, email)` directly in the login/signup success path in `AuthPage.tsx`, or better: pass userId+email back to `App.tsx handleAuthSuccess(userId, email)` and call `identifyUser` there. The login response body contains `{ token, user: { id, email } }` — parse the user for identification. [VERIFIED: codebase read of auth.ts login response]

### Pitfall 6: posthog-js `init()` Returns the Singleton — TypeScript Type
**What goes wrong:** `posthog.init()` returns the `PostHog` instance (the singleton). The variable declared as `const ph = posthog.init(...)` has type `PostHog`. However, `import.meta.env.VITE_POSTHOG_KEY` may be typed as `string | undefined` by Vite — the null-branch must also type-check.
**How to avoid:** The module should be typed as `PostHog | null`:
```typescript
import posthog, { type PostHog } from 'posthog-js'
export const ph: PostHog | null = key ? posthog.init(key, options) : null
```
[VERIFIED: posthog-js npm module type exports]

---

## Code Examples

### posthog-js Initialization (vigil-pwa/src/analytics/posthog.ts)
```typescript
// Source: posthog.com/docs/libraries/js — singleton import pattern [CITED: posthog.com/docs/libraries/js]
import posthog, { type PostHog } from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined

export const ph: PostHog | null = key
  ? posthog.init(key, {
      api_host: 'https://us.i.posthog.com',
      capture_pageview: false,
      autocapture: false,
      persistence: 'memory',   // Pitfall 1 prevention — no localStorage writes
    })
  : null

export function captureException(
  err: unknown,
  context: Record<string, string | boolean | number | undefined> = {},
): void {
  const error = err instanceof Error ? err : new Error(String(err))
  ph?.captureException(error, context)
}

export function identifyUser(userId: string, email: string): void {
  ph?.identify(userId, { email })
}
```

### main.tsx After Phase 104
```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './analytics/posthog'   // side-effect import — calls posthog.init before React renders (D-14)
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
```

### Login Response Shape (confirmed from server source)
```typescript
// POST /v1/auth/login returns: [VERIFIED: vigil-core/src/routes/auth.ts line 154]
type LoginResponse = {
  token: string
  user: { id: number; email: string }
}

// POST /v1/auth/register returns (NO token): [VERIFIED: vigil-core/src/routes/auth.ts line 93]
type RegisterResponse = {
  id: number
  email: string
  claimed?: true  // present only in seed-user claim flow
}
```

### sessionStorage Shim for Test Setup
```typescript
// Add to src/test/setup.ts alongside the existing localStorage shim
const memorySessionStorage = createMemoryStorage()  // reuse existing createMemoryStorage()
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: memorySessionStorage,
})
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: memorySessionStorage,
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API key auth (string stored in localStorage) | JWT in sessionStorage | Phase 104 | Clears on tab close (intended); requires re-login on new tab |
| No browser error tracking | posthog-js captureException | Phase 104 (ANLY-01 browser half) | React render errors now appear in PostHog alongside server errors |
| Anonymous users in PostHog | Identified users via posthog.identify() | Phase 104 (ANLY-04) | Events attribute to userId for cross-session analysis |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | posthog-js `persistence: 'memory'` prevents all localStorage writes | Pitfall 1, Code Examples | If wrong: ph_* keys appear in localStorage, breaking DevTools verification. Mitigation: verify in browser after init. |
| A2 | React StrictMode double-invokes `useEffect` but NOT module-level code | Pitfall 4, Pattern 1 | If wrong: posthog.init() called twice. Posthog-js guards against double-init internally via the singleton pattern. |
| A3 | `posthog.identify(userId, { email })` is the correct v1 signature | Code Examples | posthog-js v1 docs not fully scraped; second arg is `properties`. If wrong: email may not attach. Verify at runtime. |
| A4 | The existing pre-failing SettingsPage test (`invalid_state` banner) is unrelated to Phase 104 | Test section | If wrong: Phase 104 test baseline is broken before starting. Verification: `npm test` baseline shows 1 failure, 108 passing. |

---

## Open Questions

1. **Should `identifyUser` be called from AuthPage or App.tsx?**
   - What we know: Login response contains `{ token, user: { id, email } }` — user data is available right after login.
   - What's unclear: D-15 says `handleAuthSuccess()` in App.tsx, but AuthPage is where the user data is available.
   - Recommendation: Pass `userId` and `email` back to `App.tsx` by expanding `onAuthSuccess(userId: string, email: string)` prop signature. App.tsx calls `identifyUser(userId, email)`. This keeps PostHog coupling out of AuthPage and in App.tsx where the CONTEXT says it belongs.

2. **Should `GET /v1/me` 401 on mount trigger immediate sign-out?**
   - What we know: If a JWT is stored but `/v1/me` returns 401 (user deleted), the returning-session identify flow silently fails.
   - What's unclear: Whether to force re-auth or just skip identification.
   - Recommendation: Silent skip for Phase 104 (observability is best-effort). The `vigilFetch` auth guard already redirects to `/auth` on 401 for protected routes when the user actually navigates.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| posthog-js | ANLY-01 browser capture | Not installed | — (latest: 1.369.3) | — (must install) |
| Node.js | `npm install`, vitest | Available | v25.2.1 | — |
| npm | Package install | Available | (via Node 25) | — |
| Vitest | Test suite | Available | ^2.1.9 (installed) | — |
| VITE_POSTHOG_KEY (Vercel env var) | posthog-js init in prod | Unknown | — | key-absence gate → no-op in dev |

**Missing dependencies with no fallback:**
- `posthog-js` — must `npm install posthog-js` in vigil-pwa before any posthog.ts code can be written.

**Missing dependencies with fallback:**
- `VITE_POSTHOG_KEY` — not set in dev `.env.local` by design (D-13). The key-absence gate (`key ? posthog.init(...) : null`) means the module works correctly without it. Production Vercel env var must be configured separately by the user.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 + @testing-library/react 16.3.2 |
| Config file | `vigil-pwa/vitest.config.ts` |
| Quick run command | `cd vigil-pwa && npm test` |
| Full suite command | `cd vigil-pwa && npm test` (single suite — no separate full run) |

**Baseline (pre-Phase 104):** 1 failing test (SettingsPage `invalid_state` banner — pre-existing, unrelated), 108 passing. [VERIFIED: npm test run]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-06 | signup form submits, stores JWT, redirects to `/` | unit | `cd vigil-pwa && npm test` | ❌ Wave 0: `src/pages/AuthPage.test.tsx` |
| AUTH-06 | wrong credentials show generic error | unit | `cd vigil-pwa && npm test` | ❌ Wave 0 |
| AUTH-07 | login form submits, stores JWT in sessionStorage, redirects | unit | `cd vigil-pwa && npm test` | ❌ Wave 0 |
| AUTH-06/07 | `getStoredKey()` reads sessionStorage `vigil_jwt` | unit | `cd vigil-pwa && npm test` | ❌ Wave 0: update `src/api/client.test.ts` |
| AUTH-06/07 | `clearKey()` removes both `vigil_jwt` and `vigil_api_key` | unit | `cd vigil-pwa && npm test` | ❌ Wave 0 |
| ANLY-01 | `ErrorBoundary.componentDidCatch` calls `captureException` | unit | `cd vigil-pwa && npm test` | ❌ Wave 0: `src/components/ErrorBoundary.test.tsx` |
| ANLY-01 | `captureException` no-ops when `ph` is null | unit | `cd vigil-pwa && npm test` | ❌ Wave 0: `src/analytics/posthog.test.ts` |
| SC#5 | JWT stored in sessionStorage not localStorage | manual | DevTools Application tab | N/A |
| SC#4 | React render errors appear in PostHog | manual | Trigger test throw in dev | N/A |

### Sampling Rate
- **Per task commit:** `cd vigil-pwa && npm test`
- **Per wave merge:** `cd vigil-pwa && npm test`
- **Phase gate:** Full suite green (with pre-existing 1 failure accepted as known) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vigil-pwa/src/pages/AuthPage.test.tsx` — covers AUTH-06 + AUTH-07 form behavior
- [ ] `vigil-pwa/src/components/ErrorBoundary.test.tsx` — covers ANLY-01 boundary capture
- [ ] `vigil-pwa/src/analytics/posthog.test.ts` — covers captureException null-guard + identifyUser null-guard
- [ ] Update `vigil-pwa/src/test/setup.ts` — add `sessionStorage` shim alongside existing `localStorage` shim
- [ ] Update `vigil-pwa/src/api/client.test.ts` — migrate from `localStorage.setItem('vigil_api_key', ...)` to `sessionStorage.setItem('vigil_jwt', ...)`
- [ ] Update `vigil-pwa/src/hooks/useGoogleStatus.test.tsx` — update stubbed Map key
- [ ] Update `vigil-pwa/src/pages/SettingsPage.test.tsx` — update auth setup

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT in sessionStorage; generic error messages (no enumeration) |
| V3 Session Management | yes | sessionStorage (tab-scoped); `clearKey()` removes on sign-out |
| V4 Access Control | no | Auth gate already implemented in App.tsx |
| V5 Input Validation | yes | email/password inputs — server validates format; client validates non-empty only |
| V6 Cryptography | no | JWT signing is server-side (already shipped Phase 102/103) |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User enumeration via auth errors | Information Disclosure | Generic message "Invalid email or password" for all 4xx — locked in STATE.md |
| XSS token theft | Elevation of Privilege | sessionStorage (not localStorage) limits exposure to same-tab XSS; no token in URL |
| PostHog injecting user data | Information Disclosure | `identifyUser(userId, email)` — only userId+email, never thought content; property allowlist from STATE.md applies |
| Double-init of posthog.init() | Integrity | Module-level singleton prevents second init in the same module scope |

---

## Sources

### Primary (HIGH confidence)
- `vigil-core/src/routes/auth.ts` — confirmed register returns `{ id, email }` (no JWT), login returns `{ token, user }`
- `vigil-core/src/analytics/posthog.ts` — server-side singleton pattern to mirror
- `vigil-pwa/src/api/client.ts` — current storage constants and functions
- `vigil-pwa/src/test/setup.ts` — confirmed sessionStorage shim is absent
- `vigil-pwa/src/pages/AuthPage.tsx`, `App.tsx`, `SettingsPage.tsx`, `main.tsx` — current code to modify
- npm registry: `posthog-js@1.369.3` published 2026-04-18

### Secondary (MEDIUM confidence)
- posthog.com/docs/libraries/js — init pattern, singleton import, `capture_pageview` option
- posthog.com/docs/libraries/js/config — `persistence` options confirmed (`memory`, `localStorage`, `sessionStorage`, etc.)
- posthog.com/docs/error-tracking/capture — `captureException(error, properties)` signature

### Tertiary (LOW confidence)
- None — all critical claims verified against codebase or official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — posthog-js version verified against npm registry; React/vitest already installed
- Architecture: HIGH — all modified files read; server contracts verified in source code
- Pitfalls: HIGH — test file grep found all 4 files needing storage key updates; register response shape confirmed in source
- Critical Finding (D-04 gap): HIGH — confirmed by reading auth.ts and grepping for `signToken`

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (posthog-js API is stable in ^1; server endpoints immutable for Phase 104 scope)
