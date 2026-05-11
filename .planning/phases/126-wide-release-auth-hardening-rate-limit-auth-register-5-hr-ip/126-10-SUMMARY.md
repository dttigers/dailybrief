---
phase: 126
plan: 10
subsystem: vigil-pwa
tags: [auth, captcha, turnstile, error-ux, legal, signup]
dependency_graph:
  requires: [126-05, 126-07, 126-08]
  provides: [turnstile-widget-component, auth-page-error-ux, legal-footer-links]
  affects: [vigil-pwa/src/pages/AuthPage.tsx, vigil-pwa/src/components/TurnstileWidget.tsx]
tech_stack:
  added: ["@marsidev/react-turnstile (already installed by Plan 07)"]
  patterns: ["Cloudflare Turnstile controlled widget", "resolveApiError error-code UX mapping", "react-router v7 Link for internal navigation"]
key_files:
  created:
    - vigil-pwa/src/components/TurnstileWidget.tsx
  modified:
    - vigil-pwa/src/pages/AuthPage.tsx
decisions:
  - "Turnstile token reset on mode-toggle is implicit via React state: toggleMode() resets setError but not setTurnstileToken — the widget unmounts when signup mode is left, so token state becomes stale/irrelevant. Submit gate !isLogin && !turnstileToken ensures stale token never leaks into login flow."
  - "resolveApiError imported from lib/api-error-codes.ts (Plan 07 artifact) — no inline lookup table in AuthPage"
  - "Legal footer links use existing Line-2 Link import from react-router; zero new import lines added"
  - "R2 lock: catch-block setError(GENERIC_ERROR) preserved verbatim — network-level throws have no Response body"
metrics:
  duration: "2m 19s"
  completed: "2026-05-11T19:55:47Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 126 Plan 10: PWA Turnstile Widget + AuthPage Surgery Summary

Wired the Cloudflare Turnstile captcha widget into the PWA signup form, patched three error-collapse sites in AuthPage.tsx to use structured resolveApiError UX, and added legal footer links — closing the user-visible half of AUTH-126-02, AUTH-126-05, AUTH-126-06.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create TurnstileWidget.tsx wrapper component | b1f841c | vigil-pwa/src/components/TurnstileWidget.tsx (created) |
| 2 | Surgery on AuthPage.tsx — Turnstile, error sites, legal footer | 956de2a | vigil-pwa/src/pages/AuthPage.tsx (modified) |

## What Was Built

### TurnstileWidget.tsx (70 lines)

New file `vigil-pwa/src/components/TurnstileWidget.tsx`:

- Named import: `import { Turnstile } from "@marsidev/react-turnstile"`
- Props: `{ onToken: (token: string | null) => void }`
- Reads `import.meta.env.VITE_TURNSTILE_SITE_KEY` at render time
- Dev-safe fallback: when `VITE_TURNSTILE_SITE_KEY` missing, renders `<div className="text-yellow-500 text-sm">Captcha not configured</div>` instead of crashing or silently leaving submit permanently disabled
- Renders `<Turnstile siteKey={siteKey} onSuccess onError onExpire options={{ theme: "dark" }} />` inside `<div className="my-3">`
- onSuccess → `onToken(token)`, onError/onExpire → `onToken(null)`

### AuthPage.tsx changes (28 insertions, 5 deletions)

**EDIT 1 — Imports added:**
- `import { resolveApiError } from '../lib/api-error-codes'`
- `import TurnstileWidget from '../components/TurnstileWidget'`
- Existing `Link` import from `'react-router'` reused (no new import)

**EDIT 2 — State added:**
- `const [turnstileToken, setTurnstileToken] = useState<string | null>(null)`

**EDIT 3 — Turnstile widget render (signup only):**
- `{!isLogin && (<TurnstileWidget onToken={setTurnstileToken} />)}` — between password input and forgot-password link

**EDIT 4 — Submit button guard:**
- `disabled={loading || (!isLogin && !turnstileToken)}` — submit blocked until captcha solved in signup mode

**EDIT 5 — Signup POST body:**
- `JSON.stringify({ email: email.trim().toLowerCase(), password, turnstileToken })` — includes token
- Login POST unchanged: `JSON.stringify({ email: email.trim().toLowerCase(), password })` — no token

**EDIT 6 — 3 error-collapse sites fixed (R2 — NOT catch block):**

Site 1 (login mode `if (!res.ok)`):
```ts
const body = await res.json().catch(() => ({})) as { error?: string; code?: string }
const ux = resolveApiError(body, GENERIC_ERROR)
setError(ux.message)
```

Site 2 (signup register `if (!regRes.ok)`): same pattern on regRes

Site 3 (signup auto-login `if (!loginRes.ok)`): same pattern on loginRes

**EDIT 7 — Legal footer:**
```tsx
<div className="mt-4 text-center text-xs text-gray-500">
  <Link to="/legal/privacy" className="hover:text-gray-300">Privacy</Link>
  {' · '}
  <Link to="/legal/terms" className="hover:text-gray-300">Terms</Link>
</div>
```

## Verification Results

All plan acceptance criteria pass:

| Check | Result |
|-------|--------|
| `resolveApiError(` count ≥ 3 | 3 (three call sites) |
| `TurnstileWidget` count ≥ 2 | 2 (import + JSX) |
| `turnstileToken` count ≥ 3 | 3 (useState + onToken setter + POST body) |
| `/legal/privacy` count == 1 | 1 |
| `/legal/terms` count == 1 | 1 |
| `GENERIC_ERROR` count ≥ 2 (R2 lock) | 5 (constant decl + 3 fallback args + catch-block) |
| `react-router-dom` count == 0 | 0 — PASS |
| `from 'react-router'` count ≥ 1 | 2 |
| `@marsidev/react-turnstile` in TurnstileWidget.tsx ≥ 1 | 2 |
| `npx vite build` exits 0 | PASS (build in 407ms) |
| Login POST body excludes `turnstileToken` | CONFIRMED (line 53) |
| Catch-block preserves `setError(GENERIC_ERROR)` | CONFIRMED (line 111-112) |

## R2 Lock Confirmation

The catch-block at line 111 is UNTOUCHED:
```ts
} catch {
  setError(GENERIC_ERROR)
} finally {
```
This branch catches network-level throws where `res` doesn't exist — no Response body to parse. GENERIC_ERROR preserved verbatim per R2.

Verified via `git diff HEAD~1 HEAD` — catch block shows no changes.

## Router Package Confirmation

All imports use `'react-router'` (v7 single-package namespace). Zero `react-router-dom` references in AuthPage.tsx. Confirmed via `grep -c "react-router-dom" AuthPage.tsx → 0`.

The existing line-2 import `import { useNavigate, Link } from 'react-router'` was reused for the legal footer `<Link>` elements — no new import line needed.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. All changes are PWA-side rendering logic:

- TurnstileWidget.tsx: renders Cloudflare-managed iframe; no direct network calls from this file
- AuthPage.tsx signup POST now includes `turnstileToken` field — already expected by Plan 05's server-side gate

T-126-10-01 (bot bypass via DevTools): submit button disabled gate is defense-in-depth; server-side rate-limit + siteverify (Plan 05) is the primary gate.
T-126-10-07 (catch-block accidentally patched): R2 lock confirmed by grep count ≥ 2 on GENERIC_ERROR.
T-126-10-09 (react-router-dom import): zero references confirmed.

No new threat flags to add.

## Known Stubs

None. TurnstileWidget's "Captcha not configured" div is an intentional dev-safety fallback, not a stub blocking plan functionality — production always supplies VITE_TURNSTILE_SITEKEY via Vercel environment variables.

## Anchor

Plan 11 is the final operator-wallclock confirmation for AUTH-126-07 spend cap.

## Self-Check: PASSED

Files exist:
- vigil-pwa/src/components/TurnstileWidget.tsx — FOUND
- vigil-pwa/src/pages/AuthPage.tsx — FOUND (modified)

Commits exist:
- b1f841c — FOUND (feat(126-10): create TurnstileWidget.tsx...)
- 956de2a — FOUND (feat(126-10): wire Turnstile widget...)
