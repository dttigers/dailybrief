# Phase 104: PWA Auth UI & Browser Observability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 104-pwa-auth-ui-browser-observability
**Areas discussed:** Auth form layout, Email display location, JWT storage migration, PostHog browser setup

---

## Auth form layout

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle on one page | Single card with Login/Signup toggle link below the form. Default to Login. Keeps existing minimal-card aesthetic, zero routing changes. | ✓ |
| Two separate routes | /auth/login and /auth/signup as distinct pages. | |
| You decide | Claude picks the simpler implementation. | |

**User's choice:** Toggle on one page
**Notes:** Auto-login after signup — register endpoint returns JWT, store it, redirect to /. No second login step.

---

## Post-signup destination

| Option | Description | Selected |
|--------|-------------|----------|
| Directly to dashboard | Auto-login on successful register. Register endpoint returns a JWT; store it and redirect to /. | ✓ |
| Back to login form | Show 'Account created — sign in now' message. Requires a second login step. | |
| You decide | Claude picks the standard flow. | |

**User's choice:** Directly to dashboard

---

## Email display location

| Option | Description | Selected |
|--------|-------------|----------|
| Settings page only | Add a 'Vigil Account' section to SettingsPage showing the email — mirrors the existing Google card pattern. Header stays clean. | ✓ |
| Nav header only | Small gray email text next to the existing 'Sign out' button in Layout.tsx. | |
| Both header + settings | Email in nav AND a Vigil Account card in Settings. | |
| You decide | Claude picks the simpler option. | |

**User's choice:** Settings page only
**Notes:** Mirrors Google card pattern in SettingsPage.

---

## JWT storage migration

| Option | Description | Selected |
|--------|-------------|----------|
| Force re-login | Check sessionStorage for JWT. Old localStorage key is ignored and cleared. User sees login form. Clean break. | ✓ |
| Silent fallback: keep using vk_ key | Check sessionStorage first, then fall back to localStorage vk_ key. Delays migration. | |
| Auto-detect + migrate | Exchange vk_ key for JWT via a new exchange endpoint. Adds server-side scope. | |

**User's choice:** Force re-login
**Notes:** vigil_jwt key in sessionStorage. clearKey() also removes old vigil_api_key from localStorage.

---

## JWT storage key name

| Option | Description | Selected |
|--------|-------------|----------|
| vigil_jwt | Clear, distinct from the old vigil_api_key. | ✓ |
| vigil_api_key (same key, different storage) | Minimal code change but confusingly uses 'api_key' for a JWT. | |

**User's choice:** vigil_jwt

---

## PostHog browser init pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Module-level singleton | posthog.ts module exports a singleton initialized at import time — mirrors server-side pattern. Null when VITE_POSTHOG_KEY is unset. | ✓ |
| React context/Provider | Wrap App in a PostHogProvider. More React-idiomatic. Adds Provider layer. | |

**User's choice:** Module-level singleton

---

## posthog.identify() timing

| Option | Description | Selected |
|--------|-------------|----------|
| Immediately after auth success | Call identify() inside handleAuthSuccess in App.tsx right after storing the JWT. | ✓ |
| On App mount if JWT exists | useEffect: if JWT present, call GET /v1/me and identify(). | |

**User's choice:** Immediately after auth success
**Notes:** Also called on mount for returning sessions (useEffect that calls GET /v1/me if JWT exists).

---

## PostHog init location

| Option | Description | Selected |
|--------|-------------|----------|
| main.tsx | Init before the React app renders — captures any errors during React startup. | ✓ |
| App.tsx useEffect | Init lazily after first render. May miss startup errors. | |

**User's choice:** main.tsx

---

## Error boundary fallback UI

| Option | Description | Selected |
|--------|-------------|----------|
| Full-page centered message | Dark bg-gray-900 page with 'Something went wrong' and a Reload button. Same visual style. | ✓ |
| Compact inline card | Contained error card replacing only the crashed section. | |
| You decide | Claude picks the simpler option. | |

**User's choice:** Full-page centered message

---

## Error boundary placement

| Option | Description | Selected |
|--------|-------------|----------|
| Root level only | Single ErrorBoundary wrapping the entire app in main.tsx. Simple — one component, one test. | ✓ |
| Per-page + root | Each route page wrapped individually, plus a root fallback. More granular. | |

**User's choice:** Root level only

---

## Claude's Discretion

- posthog-js version pin
- posthog.init() options (api_host, autocapture settings)
- Whether to add a usePostHog() hook
- Vitest test strategy for error boundary

## Deferred Ideas

- Forgot Password flow (v3.6 AUTH-10)
- Email verification on signup (v3.6 AUTH-11)
- Remember me / localStorage option
- Per-page error boundaries
- posthog.capture() for product events (Phase 105 ANLY-02/03)
- PostHog session replay
