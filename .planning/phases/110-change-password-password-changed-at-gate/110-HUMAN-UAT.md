---
status: partial
phase: 110-change-password-password-changed-at-gate
source: [110-VERIFICATION.md]
started: 2026-04-24T14:57:55Z
updated: 2026-04-24T14:57:55Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Cross-device session invalidation (D-19 payoff)
expected: Log into the same account on two devices (Device A + Device B) with valid JWTs. Change password on Device A. On Device B, the very next authenticated request returns 401 `{error: "Session expired"}` and the PWA force-navigates to `/auth`. Device A remains logged in with its fresh token.
result: [pending]

### 2. PWA change-password form visual/UX smoke
expected: Form expands INSIDE the Vigil Account section (not as a separate card). Eye-icon toggles (👁 / 🙈) reveal/hide typed characters. Success confirmation shows in teal/green; error (wrong current password) shows in red. Inputs disable during submit. `storeKey` runs before any navigation — Device A stays logged in with the new token.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
