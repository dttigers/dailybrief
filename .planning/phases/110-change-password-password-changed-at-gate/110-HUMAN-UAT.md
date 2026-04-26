---
status: verified
phase: 110-change-password-password-changed-at-gate
source: [110-VERIFICATION.md]
started: 2026-04-24T14:57:55Z
updated: 2026-04-26T18:20:00Z
test_1_status: PASS
test_2_status: PASS
---

## Current Test

[all tests complete — verified 2026-04-26]

## Tests

### 1. Cross-device session invalidation (D-19 payoff)
expected: Log into the same account on two devices (Device A + Device B) with valid JWTs. Change password on Device A. On Device B, the very next authenticated request returns 401 `{error: "Session expired"}` and the PWA force-navigates to `/auth`. Device A remains logged in with its fresh token.
result: passed
notes: User confirmed live (2026-04-24). Changed password on Device B — Device B stayed logged in with fresh token (D-17 ordering correct). Device A was kicked to login screen on its next authenticated fetch (D-19 gate correct). Security contract satisfied.

### 2. PWA change-password form visual/UX smoke
expected: Form expands INSIDE the Vigil Account section (not as a separate card). Eye-icon toggles (👁 / 🙈) reveal/hide typed characters. Success confirmation shows in teal/green; error (wrong current password) shows in red. Inputs disable during submit. `storeKey` runs before any navigation — initiating device stays logged in with the new token.
result: passed
notes: Verified live 2026-04-26 against deploy `44cb338`. Form expanded inline inside Vigil Account section (no separate card/modal). Eye icons toggled visibility on all three inputs. Wrong-current-password path rendered the expected red error; happy path rendered the teal success state. D-17 confirmed once more — initiating device stayed logged in with the new token (no /auth bounce). Reset to original password successfully via same flow.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

### G-01: No banner/context on AuthPage after forced sign-out (UX)
status: resolved
discovered: 2026-04-24 during live UAT Test 1
observation: Device A was correctly kicked to `/auth` after password change on Device B (security contract satisfied), but arrived with no visible reason — user sees the sign-in screen with no banner/toast explaining why.
resolution: `vigilFetch` 401 handler now redirects to `/auth?reason=session_expired` (commit 4f78224). AuthPage reads the query param on mount and renders a teal info banner: "Your session expired. Please sign in again." — self-clearing when user toggles login/signup mode (commit 719eab6). Covered by 2 new AuthPage tests + updated D-19 test (commit 730ce21).
