---
phase: 113
plan: "04"
subsystem: vigil-pwa
tags: [auth, email-verification, pwa, react, vitest]
dependency_graph:
  requires:
    - "113-02"  # login response shape + GET /v1/auth/me endpoint
    - "113-03"  # POST /v1/auth/verify-email + POST /v1/auth/resend-verification
  provides:
    - "AUTH-11 PWA surface: /auth/verify route + Settings banner"
  affects:
    - "vigil-pwa/src/pages/VerifyEmailPage.tsx"
    - "vigil-pwa/src/pages/SettingsPage.tsx"
    - "vigil-pwa/src/pages/AuthPage.tsx"
    - "vigil-pwa/src/App.tsx"
tech_stack:
  added: []
  patterns:
    - "useMemo-at-render for token parsing (no useEffect — Apple Mail prefetch defense)"
    - "raw fetch() for unauthenticated POST (not vigilFetch — avoids 401 redirect handler)"
    - "vi.hoisted() for vitest mock factories that reference external spies"
    - "setTimeout spy capture pattern for 10s timer test without fake timers"
key_files:
  created:
    - "vigil-pwa/src/pages/VerifyEmailPage.tsx"
    - "vigil-pwa/src/pages/VerifyEmailPage.test.tsx"
  modified:
    - "vigil-pwa/src/pages/SettingsPage.tsx"
    - "vigil-pwa/src/pages/SettingsPage.test.tsx"
    - "vigil-pwa/src/pages/AuthPage.tsx"
    - "vigil-pwa/src/App.tsx"
decisions:
  - "vi.hoisted() required for vigilFetchSpy — vitest hoists vi.mock factories before module init; plain const declarations above vi.mock cause ReferenceError"
  - "setTimeout spy capture pattern used for 10s timer test — vi.useFakeTimers() mid-test breaks waitFor (which internally uses setTimeout); capturing the callback and invoking it directly avoids the deadlock"
  - "Pre-existing WR-03 SettingsPage.test.tsx:104 failure carried forward (not caused by this plan — documented in Phase 110 deferred-items.md)"
  - "TS2345 on vi.spyOn mockImplementation resolved by casting to any — vitest's NormalizedPrecedure type is overly restrictive for setTimeout overrides; runtime behavior is correct"
metrics:
  duration: "704 seconds (~12 min)"
  completed: "2026-04-25"
  tasks: 3
  files: 6
requirements:
  - AUTH-11
---

# Phase 113 Plan 04: PWA Email Verification Surface Summary

PWA email verification: VerifyEmailPage at /auth/verify with 4-state Confirm-gated POST (Apple Mail prefetch defense), Settings verify banner with 5-state Resend lifecycle, and AuthPage login response type extended with emailVerifiedAt field.

## What Was Built

**Task 1 — VerifyEmailPage + App.tsx route (AUTH-11-P)**

`vigil-pwa/src/pages/VerifyEmailPage.tsx` — new page at `/auth/verify`. Four terminal states per UI-SPEC:

- **MISSING_TOKEN** — rendered immediately on mount when `?token` is absent (no API call)
- **IDLE** — token present; renders "Verify your email" h1 + "Click the button below to confirm your email address." + "Confirm" button
- **SUCCESS** — after 200 from POST: "Email verified" h1 + "You can close this tab, or" + "Go to app" link to `/`; swapped in-place, no redirect, no URL change
- **ERROR** — 400/5xx/network all collapse to single-bucket "This link is no longer valid" + "Verification links expire after 24 hours and can only be used once." + "Request a new link" button + "Back to app" link

**Critical architecture (load-bearing):**
- `useEffect(` count in file: **0** — verified by `grep -c "useEffect(" src/pages/VerifyEmailPage.tsx`
- Token parsed at render time via `useMemo(() => searchParams.get('token'), [searchParams])`
- POST uses raw `fetch()` (not `vigilFetch`) — avoids 401-redirect handler on the unauthenticated endpoint
- "Request a new link" destination resolved at click time: `/settings` if `sessionStorage.getItem('vigil_jwt') !== null`, `/auth` otherwise

Route mounted in `App.tsx` at line 76, after `/auth/reset` (line 71) — sibling unauthenticated route outside the protected Layout cluster.

**11 vitest cases green:**
AUTH-11-P-MOUNT-NO-FETCH, AUTH-11-P-IDLE-RENDERS-COPY, AUTH-11-P-MISSING-TOKEN, AUTH-11-P2-CONFIRM-200, AUTH-11-P2-CONFIRM-400, AUTH-11-P2-CONFIRM-500, AUTH-11-P2-CONFIRM-NETWORK, AUTH-11-P2-RAW-FETCH, AUTH-11-P-LOGIN-DEST-LOGGED-IN, AUTH-11-P-LOGIN-DEST-LOGGED-OUT, AUTH-11-P-USES-USE-MEMO

**Task 2 — Settings verify banner + Resend lifecycle (AUTH-11-B)**

`vigil-pwa/src/pages/SettingsPage.tsx` — three coordinated changes:

1. **New state**: `meData` (local component state, no global store per D-28) + `resendState` (5-state union) + `resendSentTimerRef` (cleanup ref)
2. **New useEffect for `/v1/auth/me`** — fires on mount alongside the existing `/v1/me` useEffect. Both coexist by design (UI-SPEC §Notes-4). The `/v1/me` call is for PostHog identify and `accountEmail` display; the `/v1/auth/me` call is for the banner sentinel only.
3. **Verify banner JSX** — first child inside `<div className="p-4 max-w-2xl mx-auto text-gray-50">`, before the dismissible Google OAuth banner and before `<h1>Settings</h1>`. Rendered only when `meData?.emailVerifiedAt === null` (optional chaining short-circuits when `meData` is null during fetch — no banner flash on verified users).

Banner uses custom `@theme` tokens: `bg-warning-50 border-warning-400 text-warning-400` (NOT Tailwind built-in amber scale). Non-dismissible — no × control.

Resend button lifecycle (5 states):
- **idle**: "Resend" button enabled
- **sending**: "Sending…" disabled + aria-disabled
- **sent**: "Sent! Check your inbox." for 10s → returns to idle (resendSentTimerRef, cleanup on unmount)
- **rate_limited**: button hidden; inline "You've requested too many. Try again later." (terminal until page reload)
- **error**: "Could not send. Try again." inline + "Resend" button re-enabled

**11 vitest cases green** (10 new + 1 pre-existing WR-03 failure carries forward):
AUTH-11-B-VISIBLE-WHEN-UNVERIFIED, AUTH-11-B-HIDDEN-WHEN-VERIFIED, AUTH-11-B-HIDDEN-WHEN-FETCH-PENDING, AUTH-11-B-NO-DISMISS-CONTROL, AUTH-11-B2-RESEND-IDLE-LABEL, AUTH-11-B2-RESEND-SENDING, AUTH-11-B2-RESEND-SENT-200, AUTH-11-B2-RESEND-RATE-LIMITED, AUTH-11-B2-RESEND-NETWORK-ERROR, AUTH-11-B2-RESEND-5XX, AUTH-11-B-NEW-ME-CALL

**Task 3 — AuthPage login response type (D-26 additive)**

Two type annotations in `vigil-pwa/src/pages/AuthPage.tsx` updated from:
```
{ token: string; user: { id: number; email: string } }
```
to:
```
{ token: string; user: { id: number; email: string; emailVerifiedAt: string | null } }
```

Both login flow (line ~56) and post-register auto-login (line ~81) updated. No runtime behavior change — `onAuthSuccess` signature unchanged, `storeKey` flow unchanged. Type widening is the entire deliverable. AuthPage.test.tsx: 12/12 passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vitest mock hoisting: vigilFetchSpy ReferenceError**
- **Found during:** Task 1 — first test run
- **Issue:** `const vigilFetchSpy = vi.fn()` declared above `vi.mock('../api/client', ...)` factory causes `ReferenceError: Cannot access 'vigilFetchSpy' before initialization` because vitest hoists `vi.mock` calls to the top of the module before variable declarations execute.
- **Fix:** Used `vi.hoisted(() => ({ navigateSpy: vi.fn(), vigilFetchSpy: vi.fn() }))` to declare spies in the hoisted scope that vitest's transform preserves.
- **Files modified:** `vigil-pwa/src/pages/VerifyEmailPage.test.tsx`
- **Commit:** 91517f5

**2. [Rule 1 - Bug] TS2345 on vi.spyOn(window, 'setTimeout') mockImplementation**
- **Found during:** Task 2 — TypeScript check after implementation
- **Issue:** vitest's `NormalizedPrecedure` type constraint on `mockImplementation` rejects custom `setTimeout` implementation signatures; tsc errors with TS2345.
- **Fix:** Cast `mockImplementation as any` inline with comment explaining rationale. Runtime behavior unchanged — the callback capture works correctly.
- **Files modified:** `vigil-pwa/src/pages/SettingsPage.test.tsx`
- **Commit:** abd1934

**3. [Rule 1 - Bug] AUTH-11-B2-RESEND-SENT-200 timeout with vi.useFakeTimers()**
- **Found during:** Task 2 — test failure (5000ms timeout)
- **Issue:** `vi.useFakeTimers()` intercepts `setTimeout` used by `waitFor` internally, causing `waitFor` to never resolve when called after `vi.useFakeTimers()` is activated. Mid-test timer switching with `vi.advanceTimersByTime()` deadlocks the test runner.
- **Fix:** Used `vi.spyOn(window, 'setTimeout')` to capture the 10s callback reference, then invoke it directly via `act(() => { capturedCallback!() })` — avoids fake timer entirely, keeps the test using real async machinery.
- **Files modified:** `vigil-pwa/src/pages/SettingsPage.test.tsx`
- **Commit:** abd1934 (combined with TS fix)

### Pre-existing Issue (Carried Forward)

**SettingsPage.test.tsx:104 WR-03 failure:**
- Test: `SettingsPage > callback > shows error banner with decoded message when ?google_error=invalid_state`
- The test asserts raw code string `invalid_state` is rendered, but `GOOGLE_ERROR_MESSAGES` allowlist maps it to the friendly string "Connection attempt expired." — the implementation is intentionally correct, the test expectation is wrong.
- Already documented in `.planning/phases/110-change-password-password-changed-at-gate/deferred-items.md`
- Not caused by this plan — confirmed pre-existing.

## Test Count Delta

| File | Before | After | New Tests |
|------|--------|-------|-----------|
| VerifyEmailPage.test.tsx | 0 | 11 | +11 |
| SettingsPage.test.tsx | 7 | 17 | +10 (1 pre-existing fail) |
| AuthPage.test.tsx | 12 | 12 | 0 (no regressions) |
| **Total PWA suite** | **156** | **167** | **+11 green** |

Full suite: 166/167 passing (1 pre-existing WR-03 failure unrelated to this plan).

## Load-bearing Architecture Confirmation

- `grep -c "useEffect(" vigil-pwa/src/pages/VerifyEmailPage.tsx` → **0** (Apple Mail prefetch defense is enforced at code level)
- `grep -c "vigilFetch" vigil-pwa/src/pages/VerifyEmailPage.tsx` → **0** (raw fetch only for unauthenticated POST)
- Both `/v1/me` and `/v1/auth/me` useEffects coexist in SettingsPage (lines ~107 and ~125) — D-28 two-call pattern preserved
- Banner gate `meData?.emailVerifiedAt === null` at line 383; `<h1>Settings</h1>` at line 443 → banner renders before heading (verified by awk)
- `/auth/verify` route at line 76, `/auth/reset` at line 71 → correct sibling ordering in App.tsx

## Plan 05 Note

Plan 05 will exercise the full end-to-end flow against live Railway after deploy (register → receive email → click link → verify → banner disappears). The Confirm-gate is the final Apple Mail prefetch defense — Plan 05 manual UAT covers the "click email in inbox" leg.

## Self-Check: PASSED

- [x] `vigil-pwa/src/pages/VerifyEmailPage.tsx` exists
- [x] `vigil-pwa/src/pages/VerifyEmailPage.test.tsx` exists with 11 it() blocks
- [x] `vigil-pwa/src/pages/SettingsPage.tsx` — banner + resend + /v1/auth/me useEffect present
- [x] `vigil-pwa/src/pages/SettingsPage.test.tsx` — 10 new AUTH-11 tests added
- [x] `vigil-pwa/src/pages/AuthPage.tsx` — 2 emailVerifiedAt type annotations added
- [x] `vigil-pwa/src/App.tsx` — /auth/verify route mounted after /auth/reset
- [x] Commits: 91517f5, 840461a, 84781a4, abd1934 all present in git log
