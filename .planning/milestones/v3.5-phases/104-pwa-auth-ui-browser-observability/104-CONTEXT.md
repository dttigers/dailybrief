# Phase 104: PWA Auth UI & Browser Observability - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

PWA client only: replace the API-key `AuthPage` with email+password login + signup forms (JWT stored in sessionStorage), show the authenticated user's email in the Settings page, initialize posthog-js with a key-absence gate, call `posthog.identify()` on auth success, and add a root-level React error boundary that captures to PostHog. Server-side PostHog, /v1/me, and all backend auth endpoints already shipped in Phases 102–103.

</domain>

<decisions>
## Implementation Decisions

### Auth form layout
- **D-01:** Login and Signup coexist on a **single `/auth` route** with a toggle link below the form (default: Login mode). Extends the existing `AuthPage.tsx` centered-card aesthetic — no new routes, no route config changes.
- **D-02:** The toggle link reads "Don't have an account? Sign up" (Login mode) / "Already have an account? Sign in" (Signup mode). Toggles `mode` state between `'login'` and `'signup'`.
- **D-03:** Signup form fields: email + password only (no confirm-password, no display name). Error message: single generic string for all 4xx — no user enumeration (locked in v3.5 STATE.md).
- **D-04:** After signup succeeds, the server's register response includes a JWT — store it immediately and redirect to `/` (same path as post-login). **No second login step.** Auto-login is the standard flow.
- **D-05:** No "Forgot Password" link — no email infrastructure in v3.5 (locked in STATE.md).

### Email display location
- **D-06:** Email is shown in the **Settings page only** as a new "Vigil Account" section — mirrors the existing Google card pattern (`bg-gray-900 border border-gray-900/40 rounded-lg p-5`). Header nav stays unchanged.
- **D-07:** The "Vigil Account" section calls `GET /v1/me` on mount to fetch `{ userId, email }`. Shows email as `text-gray-400 text-sm`. Includes a "Sign out" button that calls `clearKey()` + navigate('/auth').
- **D-08:** `/v1/me` is already shipped (Phase 103). No server changes needed.

### JWT storage migration
- **D-09:** New storage key is **`vigil_jwt`** in **`sessionStorage`**. The old `vigil_api_key` in `localStorage` is ignored and cleared on next visit (force re-login).
- **D-10:** `getStoredKey()` reads from `sessionStorage.getItem('vigil_jwt')`. `storeKey()` writes to `sessionStorage.setItem('vigil_jwt', ...)`. `clearKey()` removes both `vigil_jwt` from sessionStorage AND `vigil_api_key` from localStorage (one-time cleanup to avoid ghost state).
- **D-11:** `App.tsx` `isAuthenticated` initializer: `() => getStoredKey() !== null` — unchanged logic, now reads sessionStorage. On next visit after migration, old localStorage sessions return `null` → user sees login form. Clean break, no fallback auth path.

### PostHog browser setup
- **D-12:** posthog-js initialized as a **module-level singleton** in `vigil-pwa/src/analytics/posthog.ts`. Mirrors server-side `vigil-core/src/analytics/posthog.ts` shape. Exports: `posthog` (PostHog | null), `captureException(err, context?)`, `identifyUser(userId, email)`.
- **D-13:** Key-absence gate: `const posthog = import.meta.env.VITE_POSTHOG_KEY ? PostHog.init(...) : null`. Dev `.env.local` does NOT set `VITE_POSTHOG_KEY`. Vercel/Railway production sets it. No localStorage capture in dev.
- **D-14:** `posthog.init()` is called via the module import in `main.tsx` — before React renders. Ensures any errors during React startup are captured.
- **D-15:** `posthog.identify(userId, { email })` is called **immediately after auth success** in `App.tsx`'s `handleAuthSuccess()`. Also called in a `useEffect` on App mount when a JWT already exists (returning session) — calls `GET /v1/me` to get userId + email, then identifies.
- **D-16:** posthog-js `capture_pageview: false` — no automatic page-view events. Product events are Phase 105 scope (ANLY-02).

### Error boundary
- **D-17:** Single **root-level** `ErrorBoundary` class component wrapping the app in `main.tsx` (inside `BrowserRouter`, wrapping `App`).
- **D-18:** Fallback UI: `min-h-screen bg-gray-900 flex items-center justify-center` with a centered card showing "Something went wrong" heading + "Reload" button (`window.location.reload()`). Same dark-theme styling as AuthPage.
- **D-19:** `ErrorBoundary.componentDidCatch(error)` calls `captureException(error, { boundary: 'root' })` so React render errors land in PostHog (completes ANLY-01 browser half).

### Claude's Discretion
- posthog-js version pin — use latest stable `posthog-js@^1` (check npm at plan time).
- Exact posthog.init() options (api_host, autocapture, etc.) — disable autocapture for now; only manual captureException calls in scope.
- Whether to add a `usePostHog()` hook for future call sites — skip unless needed for error boundary wiring.
- Vitest test coverage strategy for error boundary — test that componentDidCatch calls captureException; mock posthog module.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 104 inputs
- `.planning/REQUIREMENTS.md` §Authentication UI (AUTH-06, AUTH-07) + §Analytics & Observability (ANLY-01 browser half) — authoritative requirement text and acceptance criteria.
- `.planning/ROADMAP.md` §Phase 104 — success criteria 1-5 (each has a literal verification step).
- `.planning/STATE.md` §Accumulated Context — v3.5 locked decisions (sessionStorage, generic error, no forgot-password).

### Existing PWA code (read before modifying)
- `vigil-pwa/src/pages/AuthPage.tsx` — current API-key form to replace with email+password + toggle.
- `vigil-pwa/src/api/client.ts` — `getStoredKey`, `storeKey`, `clearKey`, `vigilFetch`; storage migration lives here.
- `vigil-pwa/src/App.tsx` — auth gate, `handleAuthSuccess`, routing; identify() call lands here.
- `vigil-pwa/src/main.tsx` — posthog init + ErrorBoundary go here.
- `vigil-pwa/src/components/Layout.tsx` — nav structure; no changes needed (email goes to Settings only).
- `vigil-pwa/src/pages/SettingsPage.tsx` — existing Google card pattern to replicate for Vigil Account section.

### Phase 103 output (server endpoints in use)
- `vigil-core/src/routes/me.ts` — `GET /v1/me` returns `{ userId: string, email: string }`.
- `vigil-core/src/routes/auth.ts` — `POST /v1/auth/register` (returns JWT) + `POST /v1/auth/login` (returns JWT).

### PostHog browser docs
- posthog.com/docs/libraries/js — posthog-js init options, identify() signature, capture() API.
- posthog.com/docs/error-tracking — browser error capture integration pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **AuthPage.tsx centered-card pattern** — `min-h-screen flex items-center justify-center bg-gray-900`, `bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4`. Signup form reuses this exact layout.
- **teal-600 submit button** — `py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50`. Reuse for both Login and Signup submit buttons.
- **Google card section pattern** (SettingsPage.tsx) — `bg-gray-900 border border-gray-900/40 rounded-lg p-5` with `h2 text-lg font-medium` heading + `text-gray-400 text-sm` subtitle. Vigil Account section replicates this.
- **`vigilFetch`** — reads `getStoredKey()` for the Bearer token. Once `getStoredKey()` points to sessionStorage JWT, all existing API calls work unchanged.
- **`clearKey()` + `navigate('/auth')`** — Sign out pattern already used in Layout.tsx `handleSignOut`.

### Established Patterns
- **Form error state** — `useState<string | null>(null)` + `{error && <p className="mt-2 text-sm text-red-400">{error}</p>}`.
- **Loading state** — `disabled={loading}` on button + button text changes to loading label.
- **Dark theme** — bg-gray-900 base, text-gray-50/400 hierarchy, teal-600 accent, red-400 errors.
- **No toast for auth errors** — inline `text-red-400` below the relevant field (matches existing AuthPage pattern).

### Integration Points
- `vigil-pwa/src/api/client.ts` — change `localStorage` → `sessionStorage`, `'vigil_api_key'` → `'vigil_jwt'`, add clearKey localStorage cleanup.
- `vigil-pwa/src/pages/AuthPage.tsx` — new fields (email, password), mode toggle, calls `POST /v1/auth/login` and `POST /v1/auth/register` directly (not validateApiKey).
- `vigil-pwa/src/App.tsx` — `handleAuthSuccess` gains `posthog.identify()` call; new `useEffect` for returning session identification.
- `vigil-pwa/src/main.tsx` — import posthog.ts (side effect: init), wrap with ErrorBoundary.
- `vigil-pwa/src/pages/SettingsPage.tsx` — new "Vigil Account" section at top of page with `GET /v1/me` data.
- `vigil-pwa/src/analytics/posthog.ts` — NEW file. Module singleton + key-absence gate + captureException + identifyUser exports.

</code_context>

<specifics>
## Specific Ideas

- The POST /v1/auth/register and POST /v1/auth/login endpoints accept `{ email, password }` and return `{ token: string }`. The JWT goes into sessionStorage under `vigil_jwt`. `getStoredKey()` is the only place in client.ts that needs to know the key name — update once, everything downstream works.
- Success criterion #3 ("wrong email and wrong password display the identical generic error message") — both the 401 from login AND the 409/400 from register (duplicate email) should show the same string: something like "Invalid email or password. Please try again." — never expose which one was wrong.
- The error boundary test: trigger a component throw in a dev environment, confirm PostHog Cloud shows the event. Mirrors the server-side debug-throw verification pattern from Phase 103.
- `App.tsx` returning-session identify flow: `useEffect(() => { if (getStoredKey()) { vigilFetch('/v1/me').then(r => r.json()).then(({ userId, email }) => identifyUser(userId, email)) } }, [])` — runs once on mount.

</specifics>

<deferred>
## Deferred Ideas

- **Forgot Password flow** — explicitly out of scope for v3.5 (no email infrastructure). Phase 104 UI intentionally omits the link.
- **Email verification on signup** — AUTH-11 in v3.6 backlog.
- **Remember me / localStorage option** — not in scope; sessionStorage-only is the v3.5 decision.
- **Per-page error boundaries** — root-level only is sufficient for v3.5. Revisit if a page commonly throws recoverable errors.
- **posthog.capture() for product events** — ANLY-02/03 scope, Phase 105.
- **PostHog session replay** — not enabled; autocapture off.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 104-pwa-auth-ui-browser-observability*
*Context gathered: 2026-04-19*
