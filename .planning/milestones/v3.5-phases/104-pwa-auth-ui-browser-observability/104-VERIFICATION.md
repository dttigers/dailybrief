---
phase: 104-pwa-auth-ui-browser-observability
verified: 2026-04-19T22:15:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verified_at_checkpoint: 2026-04-19T22:07:03Z
human_verifier: user (typed "approved" after gap fix commit e26d221)
---

# Phase 104: PWA Auth UI & Browser Observability — Verification Report

**Phase Goal:** PWA visitors can sign up and log in with email/password, and browser-side errors are tracked in PostHog
**Verified:** 2026-04-19T22:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A new user can complete the signup form (email + password) and land on the dashboard authenticated — no page reload or manual key entry required | ✓ VERIFIED | AuthPage.tsx (L45-69) implements two-step signup: POST /v1/auth/register → POST /v1/auth/login → storeKey(token) → onAuthSuccess(userId, email) → navigate('/'). No page reload, no manual key entry. Confirmed by human checkpoint on 2026-04-19. |
| 2 | An existing user can log in with email + password and is redirected to the dashboard with their email visible in the header or settings area | ✓ VERIFIED | AuthPage.tsx login path (L31-44) POSTs to /v1/auth/login, stores token, calls onAuthSuccess, navigates to /. SettingsPage.tsx (L215-231) renders "Vigil Account" card with email fetched from GET /v1/me. Confirmed by human checkpoint. |
| 3 | Wrong email and wrong password both display the identical generic error message — no user enumeration possible | ✓ VERIFIED | AuthPage.tsx hoists `GENERIC_ERROR = 'Invalid email or password. Please try again.'` at module scope (L11). All !res.ok branches on both /v1/auth/login (L37-40) and /v1/auth/register (L52-55, L62-65) set the identical string. Catch block (L71-72) also uses the same constant. Grep confirms no alternative error strings in AuthPage.tsx. Human confirmed identical strings for both 401 (wrong password) and 401 (wrong email) paths. |
| 4 | React render errors caught by the error boundary appear in PostHog — verified by triggering a test throw | ✓ VERIFIED | ErrorBoundary.tsx (L19-21) componentDidCatch calls captureException(error, { boundary: 'root' }). posthog.ts captureException (L14-20) wraps non-Error throws and forwards to ph.captureException. main.tsx (L12-14) wraps App in ErrorBoundary inside BrowserRouter. Side-effect import order verified: posthog at L4 BEFORE App at L6. Human verified test throw produced PostHog exception event. |
| 5 | JWT is stored in sessionStorage, not localStorage — confirmed in DevTools Application tab | ✓ VERIFIED | client.ts (L1-13) STORAGE_KEY='vigil_jwt', getStoredKey reads sessionStorage, storeKey writes sessionStorage. clearKey removes sessionStorage['vigil_jwt'] AND legacy localStorage['vigil_api_key']. No remaining localStorage.getItem/setItem in client.ts (only legacy-cleanup removeItem). Human confirmed DevTools Application → SessionStorage shows `vigil_jwt`, LocalStorage clean. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-pwa/src/api/client.ts` | sessionStorage JWT storage + signOut helper | ✓ VERIFIED | Contains 'vigil_jwt', sessionStorage.getItem/setItem, clearKey with legacy cleanup, signOut() dispatching 'vigil:signout' CustomEvent |
| `vigil-pwa/src/pages/AuthPage.tsx` | email+password form with login/signup toggle | ✓ VERIFIED | Default mode='login', mode toggle button, two-step signup flow, hardcoded GENERIC_ERROR, onAuthSuccess?(userId, email) signature |
| `vigil-pwa/src/analytics/posthog.ts` | posthog-js singleton with null-guard wrappers | ✓ VERIFIED | `ph` typed PostHog \| null, key-absence gate on VITE_POSTHOG_KEY, memory persistence, autocapture:false, capture_pageview:false, captureException + identifyUser exported |
| `vigil-pwa/src/components/ErrorBoundary.tsx` | React error boundary wired to PostHog | ✓ VERIFIED | Class component with getDerivedStateFromError + componentDidCatch calling captureException(err, { boundary: 'root' }). Fallback UI: "Something went wrong" + Reload button — no stack trace leaked |
| `vigil-pwa/src/main.tsx` | posthog init ordering + ErrorBoundary wrap | ✓ VERIFIED | Line 4: `import './analytics/posthog'` (side-effect) BEFORE Line 6: `import App`. ErrorBoundary wraps App inside BrowserRouter (lines 11-15) |
| `vigil-pwa/src/App.tsx` | identifyUser wiring + signout listener | ✓ VERIFIED | handleAuthSuccess(userId, email) calls identifyUser immediately (L25). Mount useEffect (L31-39) checks getStoredKey, fetches /v1/me, calls identifyUser. Second useEffect (L45-51) listens for 'vigil:signout' and flips isAuthenticated=false |
| `vigil-pwa/src/pages/SettingsPage.tsx` | Vigil Account section with /v1/me + Sign out | ✓ VERIFIED | "Vigil Account" section is first card (L215-231), fetches /v1/me (L65-81), displays accountEmail, Sign out button calls signOut()+navigate('/auth') |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| client.ts | sessionStorage | getStoredKey() → sessionStorage.getItem('vigil_jwt') | ✓ WIRED (L5) |
| AuthPage.tsx | client.ts | storeKey(token) after login/register success | ✓ WIRED (L42, L67) |
| ErrorBoundary.tsx | analytics/posthog.ts | captureException(error, { boundary: 'root' }) in componentDidCatch | ✓ WIRED (L20) |
| main.tsx | analytics/posthog.ts | side-effect import before createRoot | ✓ WIRED (L4 before L6 App import) |
| App.tsx | analytics/posthog.ts | identifyUser in handleAuthSuccess + mount useEffect | ✓ WIRED (L25, L36) |
| App.tsx | client.ts | getStoredKey + vigilFetch('/v1/me') in mount useEffect | ✓ WIRED (L32, L33) |
| SettingsPage.tsx | /v1/me | vigilFetch('/v1/me') on mount | ✓ WIRED (L66) |
| Layout.tsx + SettingsPage.tsx | client.signOut() | sign-out side effects centralized | ✓ WIRED (Layout L3, L52; SettingsPage L14, L226) |
| window 'vigil:signout' | App.tsx setIsAuthenticated(false) | CustomEvent bus keeps auth state in sync with storage | ✓ WIRED (client.ts L31 dispatches, App.tsx L49 listens) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| AuthPage.tsx | email/password form state | User input via onChange (L95, L108) → submit → fetch(/v1/auth/login or /register) | Yes — credentials posted, real JWT received | ✓ FLOWING |
| AuthPage.tsx | token/user from response | `(await res.json()) as { token, user }` (L41, L66) | Yes — real JWT stored via storeKey; user.id/email passed to onAuthSuccess | ✓ FLOWING |
| SettingsPage.tsx | accountEmail | vigilFetch('/v1/me').then(r.json()).setAccountEmail(data.email) (L74-75) | Yes — server returns real email from authenticated /v1/me (shipped in Phase 103) | ✓ FLOWING |
| App.tsx | identifyUser call | userId/email from handleAuthSuccess args + /v1/me response | Yes — real userId + email sent to PostHog | ✓ FLOWING |
| ErrorBoundary.tsx | error | componentDidCatch(error) React-provided Error from child throw | Yes — real Error objects forwarded to captureException | ✓ FLOWING |
| posthog.ts | ph singleton | `posthog.init(key, ...)` when VITE_POSTHOG_KEY present; null otherwise | Conditional — null in dev/test (by design, key-absence gate); active in production | ✓ FLOWING (null-guarded as designed) |

No HOLLOW_PROP findings. Every dynamic surface resolves to a real data source (user input, authenticated API response, React error propagation).

### Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|----------|-------------------|--------|--------|
| `npm test` runs full vitest suite | Orchestrator regression gate reports 124 passed / 1 failed | Only pre-existing SettingsPage invalid_state failure remains | ✓ PASS |
| posthog-js dependency installed | `package.json` line 14 contains `"posthog-js": "^1.369.3"` | Dependency present | ✓ PASS |
| `vigil_jwt` is the only JWT key in code | Grep for 'vigil_api_key' in src returns only 2 expected hits (LEGACY_KEY definition + legacy cleanup) | Correct | ✓ PASS |
| No TODO/FIXME/HACK markers in Phase 104 source | Grep on AuthPage.tsx, posthog.ts, ErrorBoundary.tsx | No matches (only HTML input `placeholder=` attributes, not stub comments) | ✓ PASS |
| Commit trail matches summary | All 7 commits (068c936, e28bc14, 2f5f6d6, 33d430f, f216c46, 5cd23b5, e26d221) present in git log | Traceable | ✓ PASS |
| SC#1–5 human-approved | User typed "approved" at checkpoint 2026-04-19T22:07:03Z after e26d221 fix | Live browser verification complete | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-06 | 104-01, 104-02, 104-03 | PWA visitor can sign up with email + password and is logged in on success | ✓ SATISFIED | AuthPage.tsx signup mode (L45-70) posts to /v1/auth/register then /v1/auth/login, stores JWT via storeKey (sessionStorage), calls onAuthSuccess, navigates to dashboard. Human-verified SC#1. REQUIREMENTS.md marks complete. |
| AUTH-07 | 104-01, 104-02, 104-03 | PWA visitor can log in with existing email + password and is redirected to the dashboard | ✓ SATISFIED | AuthPage.tsx login mode (L31-44) posts to /v1/auth/login, stores JWT, navigates to '/'. Email displayed in Settings via Vigil Account card (L215-231). Human-verified SC#2. REQUIREMENTS.md marks complete. |
| ANLY-01 (browser half) | 104-01, 104-02, 104-03 | PWA exceptions are automatically captured in PostHog | ✓ SATISFIED | ErrorBoundary.componentDidCatch → captureException → ph.captureException. posthog.ts singleton with `persistence: 'memory'` (T-104-02-04), `autocapture: false` (T-104-02-03). identifyUser wired in both fresh-auth and returning-session code paths (App.tsx L25, L36). Human-verified SC#4. Server half completed in Phase 103. REQUIREMENTS.md marks ANLY-01 complete. |

**No orphaned requirements.** REQUIREMENTS.md traceability table lists AUTH-06, AUTH-07, ANLY-01 against Phase 104 — all three appear in every plan's frontmatter and all three are satisfied.

### Anti-Patterns Found

None. The only grep hits for "placeholder" in AuthPage.tsx are HTML input `placeholder=` attributes ("you@example.com", "••••••••") — legitimate UX affordance, not stub markers. No TODO/FIXME/HACK, no empty returns, no static empty arrays flowing to render, no console.log-only handlers, no fetches with ignored responses. The generic-error string is intentionally hardcoded as a module constant (T-104-02-01 user-enumeration mitigation).

### Human Verification Required

None — all live-in-browser behaviors (SC#1 signup flow, SC#2 login flow + email in Settings, SC#3 identical-error enumeration check, SC#4 PostHog exception capture with test throw, SC#5 DevTools SessionStorage confirmation) were completed during the Task 3 checkpoint on 2026-04-19 and approved by the user after the sign-out auth-state-desync gap was fixed inline via commit e26d221.

### Gaps Summary

None. All five roadmap success criteria are satisfied with verifiable code paths, all three requirement IDs are implemented and traceable, all key links are wired, all data flows from real sources, no anti-patterns found, commit chain is intact, and the human checkpoint was approved.

The one failing test in the regression gate (`SettingsPage invalid_state banner`) is pre-existing from before Phase 104 Plan 01 and is documented as out-of-scope in all three Phase 104 plan summaries. It is not a Phase 104 gap.

### Plan-Scoped Discoveries Worth Noting (not gaps)

- **UAT-found sign-out desync was fixed inline under Plan 03 scope** — the fix (signOut helper + vigil:signout CustomEvent bus) added 3 new unit tests, centralized sign-out side effects, and passed human re-verification. This is recorded as a Rule-1 auto-fixed deviation in 104-03-SUMMARY.md and did not escalate.
- **onAuthSuccess signature expansion** from `() => void` to `(userId, email) => void` in Plan 02 allowed Plan 03 to wire identifyUser without touching AuthPage again — clean dependency flow.
- **posthog.init `?? null` guard** handles builds where the SDK returns undefined — defensive against Pitfall 6 from RESEARCH.md.

---

*Verified: 2026-04-19T22:15:00Z*
*Verifier: Claude (gsd-verifier)*
