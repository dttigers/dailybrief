---
phase: 112
plan: 04
status: complete
started: 2026-04-25
completed: 2026-04-25
duration_min: 7
requirements:
  - AUTH-10
tags: [pwa, react, react-router, auth, ui, wave-3]
depends_on: [112-02, 112-03]
provides:
  - "PWA forgot-password flow end-to-end (3 surfaces: Forgot link on AuthPage, /auth/forgot, /auth/reset)"
  - "?reason=password_reset banner on AuthPage (load-bearing string contract with ResetPasswordPage success path)"
  - "Form-submit gate on ResetPasswordPage — defense in depth vs Apple Mail link pre-fetch (D-18)"
key-files:
  created:
    - vigil-pwa/src/pages/ForgotPasswordPage.tsx
    - vigil-pwa/src/pages/ForgotPasswordPage.test.tsx
    - vigil-pwa/src/pages/ResetPasswordPage.tsx
    - vigil-pwa/src/pages/ResetPasswordPage.test.tsx
  modified:
    - vigil-pwa/src/pages/AuthPage.tsx
    - vigil-pwa/src/pages/AuthPage.test.tsx
    - vigil-pwa/src/App.tsx
key-decisions:
  - "Mirrored existing AuthPage.test.tsx Object.defineProperty(window, 'location') pattern in the new password_reset banner test for file consistency. Phase 110 flagged this anti-pattern but the existing tests work; replacing them is out of scope for plan 04."
  - "Added a sibling describe block 'AuthPage — Forgot password link (AUTH-10 D-14)' covering both visibility cases (login mode shows link, signup mode hides it). This goes beyond the plan's behavior block (which only specified the banner test) but pins the D-14 visibility rule at test level — cheap insurance."
  - "Used useMemo for the token query-param read in ResetPasswordPage. searchParams object is reference-stable per react-router useSearchParams contract, so this is functionally a passthrough — but keeps the intent explicit (read once, cache; never re-read on re-render)."
metrics:
  tasks: 4
  files: 7
  tests: 23
  tests_passing: 23
  ts_errors: 0
---

# Phase 112 Plan 04: PWA Forgot-Password Pages Summary

Three PWA surfaces ship the user-visible half of AUTH-10 — Forgot link + reason banner on AuthPage, new ForgotPasswordPage at /auth/forgot, new ResetPasswordPage at /auth/reset with form-submit-only token POST (Apple Mail pre-fetch defense in depth).

## Outcome

PWA forgot-password flow end-to-end: user clicks "Forgot password?" on /auth → enters email at /auth/forgot → receives email (Phase 111) → clicks link → lands on /auth/reset?token=… → enters new password → form POSTs to /v1/auth/reset-password (Plan 03) → on 200 navigates to /auth?reason=password_reset → AuthPage renders the success banner → user signs in with new password.

23 new tests pass (4 ForgotPasswordPage + 7 ResetPasswordPage + 3 new AuthPage cases on top of 9 existing). All copy verbatim per UI-SPEC §Copywriting-Contract. Reason-string contract `password_reset` honored exactly between producer (ResetPasswordPage's navigate) and consumer (AuthPage's readPasswordResetFlag).

## Files Shipped

| File | Purpose |
|---|---|
| `vigil-pwa/src/pages/ForgotPasswordPage.tsx` | 109-line two-state component (form / submitted). Single email input, bare fetch to POST /v1/auth/forgot-password with `email.trim().toLowerCase()`. D-03 enumeration safety enforced PWA-side: branches only on HTTP status, never on body. |
| `vigil-pwa/src/pages/ForgotPasswordPage.test.tsx` | 4 tests — form initial render, lowercased+trimmed submit + 200 success, 429 error, network error. |
| `vigil-pwa/src/pages/ResetPasswordPage.tsx` | 160-line three-state component (form / invalid-token / submitting). useSearchParams reads `?token=` at mount. NO useEffect — form-submit gate is the second defense layer against Apple Mail pre-fetch (Phase 111's tracking-disable is the first). 200 → navigate('/auth?reason=password_reset'). 400 → single-bucket invalid-token UX. |
| `vigil-pwa/src/pages/ResetPasswordPage.test.tsx` | 7 tests — invalid UX on missing token, form on present token, NO fetch on mount (D-18 pin), 200 → navigate, 400 → invalid UX, 429 → inline error, eye-toggle flips input type. |
| `vigil-pwa/src/pages/AuthPage.tsx` | Modified — new readPasswordResetFlag helper + passwordReset state + banner JSX (mirrors session_expired Tailwind classes verbatim) + Forgot password? Link below password input only when isLogin. toggleMode extended to clear both flags. |
| `vigil-pwa/src/pages/AuthPage.test.tsx` | Extended — three new tests across two describe blocks (password_reset banner; Forgot link visibility on login vs signup mode). |
| `vigil-pwa/src/App.tsx` | Modified — two new sibling routes /auth/forgot + /auth/reset placed between existing /auth route and catch-all /*. OUTSIDE the protected Layout cluster (no isAuthenticated guard). |

## Commits

| SHA | Type | Description |
|---|---|---|
| `8d03f46` | test | add 4 RED-state tests for ForgotPasswordPage |
| `16bebc3` | feat | implement ForgotPasswordPage at /auth/forgot |
| `74579ae` | test | add 7 RED-state tests for ResetPasswordPage |
| `1353c63` | feat | implement ResetPasswordPage at /auth/reset |
| `f33a384` | test | extend AuthPage tests for password_reset banner + Forgot link |
| `5bd6aed` | feat | add Forgot password link + ?reason=password_reset banner to AuthPage |
| `9e46d5d` | feat | wire /auth/forgot + /auth/reset routes in App.tsx |

7 commits (TDD-paired test+impl on each new component, then routes wiring last).

## Test Results

```
✓ src/pages/ForgotPasswordPage.test.tsx  (4 tests)   157ms
✓ src/pages/ResetPasswordPage.test.tsx   (7 tests)   210ms
✓ src/pages/AuthPage.test.tsx           (12 tests)   623ms
                                        ─────────
                                         23 tests   ALL PASS
```

Full PWA suite: 144/145 pass. The 1 failure is `SettingsPage.test.tsx:104` (WR-03 invalid_state assertion) — pre-existing and documented in Phase 110 deferred-items.md / load-bearing constraint #6 of this plan. Not caused by Plan 04 changes; verified via git diff (no SettingsPage.* files touched).

## Verbatim-Copy Audit

All 22 strings from UI-SPEC §Copywriting-Contract present in the right files:

| Element | File | grep -c |
|---|---|---|
| "Forgot password?" | AuthPage.tsx | 2 (link text + comment) |
| "Password reset successfully. Please sign in with your new password." | AuthPage.tsx | 1 |
| "Reset your password" | ForgotPasswordPage.tsx | 1 |
| "Enter your email address and we'll send you a link to reset your password." | ForgotPasswordPage.tsx | 1 |
| "Email" (label) | ForgotPasswordPage.tsx | 1 |
| "Send reset link" | ForgotPasswordPage.tsx | 1 |
| "Sending…" | ForgotPasswordPage.tsx | 1 |
| "Check your inbox" | ForgotPasswordPage.tsx | 1 |
| "If your account exists, a reset link has been sent. The link expires in 1 hour." (D-16) | ForgotPasswordPage.tsx | 1 |
| "Back to login" | both | ≥1 each |
| "Something went wrong. Please try again in a moment." | ForgotPasswordPage.tsx | 1 |
| "Set a new password" | ResetPasswordPage.tsx | 1 |
| "Choose a new password for your Vigil account." | ResetPasswordPage.tsx | 1 |
| "New password" (label) | ResetPasswordPage.tsx | 1 |
| "Reset password" | ResetPasswordPage.tsx | 1 |
| "Resetting…" | ResetPasswordPage.tsx | 1 |
| "Too many attempts. Please try again in a moment." | ResetPasswordPage.tsx | 1 |
| "Something went wrong. Try again." | ResetPasswordPage.tsx | 1 |
| "This link is no longer valid" (D-20) | ResetPasswordPage.tsx | 1 |
| "Reset links expire after 1 hour and can only be used once." (D-20) | ResetPasswordPage.tsx | 1 |
| "Request a new link" (D-20) | ResetPasswordPage.tsx | 1 |
| aria "Show password" / "Hide password" | ResetPasswordPage.tsx | 2 (one in template literal) |

## Load-Bearing Constraints — All Honored

| Constraint | How Honored |
|---|---|
| #1 NO useEffect-driven fetch on ResetPasswordPage mount | `grep -c useEffect src/pages/ResetPasswordPage.tsx` returns **0**. Test "does NOT call fetch on mount (D-18 form-submit gate)" pins this. Token is parsed via useMemo(searchParams.get('token')) — pure function, no side effects. |
| #2 ?reason=password_reset is exact-string contract | ResetPasswordPage's success path: `navigate('/auth?reason=password_reset')`. AuthPage's reader: `URLSearchParams(...).get('reason') === 'password_reset'`. Both string literals match byte-for-byte. |
| #3 Routes outside Layout cluster | App.tsx places `<Route path="/auth/forgot">` and `<Route path="/auth/reset">` between the existing `/auth` route and the catch-all `/*`. Verified via awk ordering check: `auth:58 forgot:69 catch-all:72`. No `isAuthenticated` guard on the new routes. |
| #4 Phase 110 storeKey() pattern preserved in App.tsx | Only ADDED two sibling routes + two imports. Did NOT touch the existing `/auth` route element (still wraps Navigate-on-authed + AuthPage on unauthed) or the catch-all that hosts the protected Layout. The vigil:signout listener and the auth-aware redirector are untouched. |
| #5 Pre-existing dirty `vigil-pwa/src/index.css` | Did NOT touch. No CSS changes — all styling via existing Tailwind classes. |
| #6 Pre-existing SettingsPage.test.tsx:104 WR-03 flake | Did NOT touch. Verified the same single-test failure exists post-Plan-04 (1 failed | 144 passed); ratio unchanged from Phase 110 baseline. |

## D-18 Form-Submit Gate — Defense in Depth

Two layers protect against Apple Mail / Outlook auto-pre-fetch from burning the reset token:

1. **Phase 111 — domain layer.** Resend account has click_tracking + open_tracking disabled, so emails contain the verbatim app.vigilhub.io URL with no tracking redirect. The link in the user's inbox is the literal reset URL.
2. **Plan 04 — page layer.** ResetPasswordPage parses `?token=` at mount but does NOT POST until the user clicks the form's submit button. The "does NOT call fetch on mount" test asserts no fetch fires within 30ms of mounting with a valid token URL.

If layer 1 ever regresses (Resend setting change, domain swap, etc.), layer 2 still prevents tokens from being silently consumed by inbox preview engines. Tests pin both layers (Phase 111 has the email-template smoke; Plan 04 has the no-fetch-on-mount unit test).

## D-20 Single-Bucket Error UX

ResetPasswordPage maps three distinct server failure modes to one indistinguishable UX:

| Server response | PWA UX |
|---|---|
| 400 `{ error: "Invalid or expired token" }` (token doesn't exist) | "This link is no longer valid" (D-20) |
| 400 `{ error: "Invalid or expired token" }` (token expired) | "This link is no longer valid" (D-20) |
| 400 `{ error: "Invalid or expired token" }` (token already used) | "This link is no longer valid" (D-20) |
| Mount with no `?token=` query param | "This link is no longer valid" (D-20) |

User cannot distinguish which sub-bucket fired. This is the security feature, not a bug — it prevents an attacker from inferring whether they hit a real-but-stale token vs a random guess. Test "submit returns 400 → renders invalid-token UX" pins this for the API failure case; test "renders invalid-token UX when ?token is missing at mount" pins it for the no-token case.

## App.tsx Diff

```diff
 import AuthPage from './pages/AuthPage'
+import ForgotPasswordPage from './pages/ForgotPasswordPage'
+import ResetPasswordPage from './pages/ResetPasswordPage'
 ...
       <Route
         path="/auth"
         element={
           isAuthenticated
             ? <Navigate to="/" replace />
             : <AuthPage onAuthSuccess={handleAuthSuccess} />
         }
       />
+      {/* Phase 112 (AUTH-10) — sibling unauthenticated routes for the forgot-
+          password flow. OUTSIDE the protected Layout cluster (no isAuthenticated
+          guard): users hitting reset links are by definition not logged in, or
+          about to be logged out by the password change. */}
+      <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
+      <Route path="/auth/reset" element={<ResetPasswordPage />} />
       <Route
         path="/*"
```

## AuthPage.tsx Diff (semantic summary)

1. Import: `import { useNavigate, Link } from 'react-router'` (added Link).
2. New helper: `function readPasswordResetFlag(): boolean { ... === 'password_reset' }` — mirrors `readSessionExpiredFlag()` shape verbatim.
3. New state: `const [passwordReset, setPasswordReset] = useState<boolean>(readPasswordResetFlag)`.
4. `toggleMode` extended: also calls `setPasswordReset(false)`.
5. New banner JSX after the existing `sessionExpired` banner — same Tailwind classes (`mb-4 rounded border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-sm text-teal-200`), same `role="status"`, copy "Password reset successfully. Please sign in with your new password."
6. New "Forgot password?" Link below the password input, gated on `isLogin && (...)`. Right-aligned via `mt-2 flex justify-end`. `text-sm text-teal-400 hover:text-teal-300`. Anchors to `/auth/forgot`.

Existing session_expired banner unchanged. Existing tests (12 cases) all still pass — no regression.

## Notes for Plan 05 (Live UAT)

The user-facing flow surfaces ship in Plan 04. Plan 05's live UAT exercises:

1. **Real email delivery** — POST /v1/auth/forgot-password against Railway, real Gmail inbox, DKIM/SPF/DMARC pass.
2. **Real link click + page render** — link in email lands on app.vigilhub.io/auth/reset?token=… → ResetPasswordPage renders form (token-present case).
3. **Real password reset + login** — submit form → server claims token (Plan 03 atomic) + bumps password_changed_at → PWA navigates to /auth?reason=password_reset → AuthPage renders banner → user signs in with new password → success.
4. **Cross-device JWT invalidation** — Tab A logged in BEFORE reset; Tab B does the reset; Tab A's next authenticated fetch returns 401 'Session expired' → vigilFetch's global handler navigates Tab A to /auth?reason=session_expired. This pins SC#4 — the AUTH-09 / Phase 110 bearerAuth iat-gate fires automatically because Plan 03's password update bumps password_changed_at.

UI surfaces tested by Plan 04 but NOT exercised end-to-end:
- The form-submit gate (D-18) cannot be UAT'd via human click — it's a unit-test-only assertion. Phase 111's tracking-disabled at the Resend domain is the live equivalent and was UAT'd in Phase 111's smoke send.
- D-20 single-bucket UX behavior under real expired/used token states. Plan 05 should manually expire a token (UPDATE the row) and retry to prove the bucket collapses correctly in production.

## Self-Check: PASSED

**Files exist:**
- `vigil-pwa/src/pages/ForgotPasswordPage.tsx` — FOUND
- `vigil-pwa/src/pages/ForgotPasswordPage.test.tsx` — FOUND
- `vigil-pwa/src/pages/ResetPasswordPage.tsx` — FOUND
- `vigil-pwa/src/pages/ResetPasswordPage.test.tsx` — FOUND
- `vigil-pwa/src/pages/AuthPage.tsx` — FOUND (modified)
- `vigil-pwa/src/pages/AuthPage.test.tsx` — FOUND (modified)
- `vigil-pwa/src/App.tsx` — FOUND (modified)

**Commits exist (verified via `git log --oneline | grep`):**
- `8d03f46` test(112-04): add 4 RED-state tests for ForgotPasswordPage — FOUND
- `16bebc3` feat(112-04): implement ForgotPasswordPage at /auth/forgot — FOUND
- `74579ae` test(112-04): add 7 RED-state tests for ResetPasswordPage — FOUND
- `1353c63` feat(112-04): implement ResetPasswordPage at /auth/reset — FOUND
- `f33a384` test(112-04): extend AuthPage tests for password_reset banner + Forgot link — FOUND
- `5bd6aed` feat(112-04): add Forgot password link + ?reason=password_reset banner to AuthPage — FOUND
- `9e46d5d` feat(112-04): wire /auth/forgot + /auth/reset routes in App.tsx — FOUND
