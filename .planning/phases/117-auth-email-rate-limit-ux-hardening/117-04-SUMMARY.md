---
phase: 117-auth-email-rate-limit-ux-hardening
plan: 04
subsystem: vigil-pwa/pages
tags: [pwa, reset-password, rate-limit, countdown, auth-12]
dependency-graph:
  requires:
    - "vigil-pwa/src/api/client.ts classifyFetchError + ErrorClass rate-limited bucket (Phase 117 Plan 02)"
    - "vigil-core/src/routes/reset-password.ts 429 + Retry-After header (Phase 112 + 117 Plan 01)"
  provides:
    - "ResetPasswordPage rate_limited render branch with D-08 unified copy + live mm:ss countdown"
    - "Per-page countdownTimerRef + cleanup-on-unmount useEffect (mirrors Plan 03 + Phase 116.1 SettingsPage)"
    - "newPw state preservation contract across rate_limited → idle transition (AUTH-12-RPP-06 pinned)"
    - "Render branch precedence: rateLimited > tokenInvalid > form"
    - "5 new AUTH-12-RPP-* tests + 1 renamed legacy 429 test (legacy inline-banner test deleted in favor of new contract)"
  affects:
    - "Phase 117 Plan 05 (SettingsPage Resend Verification 429 countdown UI) — pattern locked across both Plan 03 and Plan 04 now; Plan 05 mirrors verbatim"
tech-stack:
  added: []
  patterns:
    - "Render branch precedence: rateLimited (NEW Phase 117) checked BEFORE tokenInvalid (D-20) — 429 wins over D-20 single-bucket because they describe orthogonal failure modes"
    - "newPw state intentionally NOT cleared during 429 path → form re-renders with typed password preserved when countdown hits 0"
    - "Cleanup-only useEffect preserves D-18 form-submit gate (Apple Mail pre-fetch defense) — never fires fetch"
    - "act-wrapped vi.advanceTimersByTime for React state-update flushing (codebase-canonical, matches Plan 03 + SettingsPage)"
    - "Heading + body D-08 split locked across 2 pages now (verbatim across Plan 03 VerifyEmailPage + Plan 04 ResetPasswordPage)"
key-files:
  created: []
  modified:
    - vigil-pwa/src/pages/ResetPasswordPage.tsx
    - vigil-pwa/src/pages/ResetPasswordPage.test.tsx
decisions:
  - "Phase 117-04: render branch precedence rateLimited > tokenInvalid > form — 429 takes structural precedence over D-20 single-bucket because the user might tokenInvalid AND get 429 in a single session (e.g., second 429 burst after first 400; flag both, 429 wins for UX clarity)"
  - "Phase 117-04: newPw state preserved across rate_limited → idle (AUTH-12-RPP-06) — UX contract: user types password, hits 429, waits out countdown, re-clicks Submit without retyping; T-117-04-01 STRIDE Information Disclosure mitigated because state lives only in-memory and is discarded on tab close"
  - "Phase 117-04: rate_limited render shows ONLY 'Back to login' link (no Submit button in the rate-limited UX) — simpler than embedding a disabled-Submit; user waits for countdown OR navigates away; mirrors the tokenInvalid-unmounts-form pattern"
  - "Phase 117-04: D-08 heading+body split is now verbatim across Plan 03 VerifyEmailPage + Plan 04 ResetPasswordPage (single source-of-truth string across the app); Plan 05 must use the same exact copy"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-30"
  tasks: 1
  files-modified: 2
  commits: 2
---

# Phase 117 Plan 04: ResetPasswordPage 429 rate-limited bucket + countdown UX Summary

Added the 4th visual state to ResetPasswordPage: `rate_limited` (alongside existing token-missing-at-mount, form-rendered, and tokenInvalid). When POST /v1/auth/reset-password returns 429, the page renders Phase 117 D-08 unified copy "Too many attempts" + "Try again in {Xm Ys}." with a live mm:ss countdown sourced from the Retry-After header (parsed via `classifyFetchError` from Plan 02). When the countdown reaches 0, the form re-renders with the password input AND Submit button — the user's typed password is **preserved** across the rate_limited → idle transition (no retyping required). Per CONTEXT.md D-11 + D-20, the 4xx-other-than-429 path STILL renders the existing "This link is no longer valid" UX; per D-06, the countdown pattern mirrors Plan 03 VerifyEmailPage exactly (which mirrors Phase 116.1 SettingsPage). The legacy Phase 112 inline 429 error banner ("Too many attempts. Please try again in a moment.") is fully removed.

## What Shipped

### Visual state matrix — 4 states (was 3)

| State | Trigger | UX |
| ----- | ------- | -- |
| `tokenInvalid` initial | URL has no `?token` query param | "This link is no longer valid" + Request a new link |
| `form` (default) | URL has token, pre-submit (or post-countdown idle return) | "Set a new password" + password input + Submit |
| `tokenInvalid` post-submit | 400 from server (D-20 single-bucket: invalid/expired/used) | "This link is no longer valid" + Request a new link |
| `rate_limited` (NEW Phase 117) | 429 from server | "Too many attempts" + "Try again in Xm Ys." + "Back to login" |

### Render branch precedence

```typescript
if (rateLimited) {  /* NEW Phase 117 — checked FIRST */ }
if (tokenInvalid) { /* D-20 single-bucket */ }
return <form>...   /* default */
```

**Order matters:** `rateLimited` is checked BEFORE `tokenInvalid` because the user might toggle into both states across a session (e.g., a 429 burst follows a 400 attempt, or vice versa). When both flags are true, the rate-limited UX wins because it's actionable (countdown will resolve) whereas tokenInvalid is terminal-for-this-link.

### D-08 copy — verbatim across Plan 03 + Plan 04

```jsx
<h1>Too many attempts</h1>
<p aria-live="polite">
  {hasCountdown
    ? `Try again in ${minutes}m ${seconds}s.`
    : 'Try again later.'}
</p>
```

This is now the single source-of-truth string across `VerifyEmailPage.tsx` (Plan 03) and `ResetPasswordPage.tsx` (Plan 04). Plan 05 (SettingsPage Resend Verification button) must use the same exact heading + body strings for D-08/D-09 unification.

### Password preservation contract (AUTH-12-RPP-06)

The newPw state is **intentionally NOT cleared** in the 429 branch of `handleSubmit`. When the countdown hits 0, the form re-renders with the password input still populated. User can immediately re-click Submit without retyping.

**Why this matters:** Without preservation, a user who's typed a complex 16-char password loses it to a 429 (which can fire from a household-NAT IP that someone else just used for a reset attempt — see Phase 117-01 D-03 cap-raise rationale). Forcing retyping on rate-limit is hostile UX, especially on mobile.

**STRIDE mitigation (T-117-04-01):** newPw is React state — never written to localStorage/sessionStorage. State lives only in-memory while the tab is open; closing the tab discards it. AUTH-12-RPP-06 explicitly asserts the value IS preserved (intentional UX, documented).

### Countdown lifecycle

```typescript
// On 429 + retryAfter present:
setRateLimited(true)
setRetryCountdown(seconds)
const timerId = window.setInterval(() => {
  setRetryCountdown((cur) => {
    if (cur === null || cur <= 1) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
      setRateLimited(false)  // ← form returns; newPw preserved
      return null
    }
    return cur - 1
  })
}, 1000)
countdownTimerRef.current = timerId

// On unmount:
useEffect(() => {
  return () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }
}, [])
```

Mirrors Plan 03 VerifyEmailPage countdown lifecycle verbatim — same setInterval shape, same cleanup-on-unmount, same tick-to-zero state transition.

### Test count delta

| File | Existing | New | Total | Notes |
| ---- | -------- | --- | ----- | ----- |
| `ResetPasswordPage.test.tsx` | 7 | 5 | 12 | 1 legacy test renamed (the old 429 inline-banner test became AUTH-12-RPP-01 with updated assertions) |

5 new AUTH-12-RPP-* tests + 1 renamed:

| Test ID | Scenario |
| ------- | -------- |
| `AUTH-12-RPP-01-429-RENDERS-COUNTDOWN` | 429 + Retry-After: 120 → "Too many attempts" + "2m 0s" body + form unmounts (renames legacy 429-inline-banner test) |
| `AUTH-12-RPP-02-COUNTDOWN-TICKS` | 1s ticks decrement; form returns at zero with newPw preserved |
| `AUTH-12-RPP-03-NO-RETRYAFTER-FALLBACK` | 429 sans Retry-After header → "Too many attempts" without mm:ss substring |
| `AUTH-12-RPP-04-400-RENDERS-LEGACY-INVALID-TOKEN` | 400 still renders D-20 "This link is no longer valid" (regression pin) |
| `AUTH-12-RPP-05-CLEANUP-ON-UNMOUNT` | Unmount mid-countdown → no setState-after-unmount warnings |
| `AUTH-12-RPP-06-PASSWORD-PRESERVED-ACROSS-429-IDLE` | Typed password preserved across rate_limited → idle |

## Note for downstream Phase 117 plan (05)

**Pattern is now locked across 2 pages — Plan 05 mirrors verbatim.** The only contract differences for Plan 05 (SettingsPage):

1. **Bearer auth:** SettingsPage's Resend Verification button is bearerAuth'd, so Plan 05 will use **`vigilFetch`** (not raw fetch). vigilFetch returns Response which classifyFetchError consumes the same way.
2. **In-page button, not form unmount:** SettingsPage doesn't navigate away from the rate_limited state — it shows the rate-limited copy near the Resend button (or replaces the button's surrounding state). Adapt the JSX placement accordingly; the countdown lifecycle + heading/body D-08 copy stay identical.
3. **Per-button state isolation:** SettingsPage may have multiple rate-limit-able buttons. Each needs its own countdownTimerRef + retryCountdown, not a shared global state.

## Per-task summary

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | Add rate_limited state + countdown logic + 1 renamed test + 5 AUTH-12-RPP-* tests | `0378558` (RED), `81073a5` (GREEN) | `vigil-pwa/src/pages/ResetPasswordPage.tsx`, `vigil-pwa/src/pages/ResetPasswordPage.test.tsx` |

## Verification Results

- `cd vigil-pwa && npx vitest run src/pages/ResetPasswordPage.test.tsx`: **12 passed | 0 failed** (6 pre-existing + 5 new AUTH-12-RPP-* + 1 renamed)
- `cd vigil-pwa && npx vitest run src/pages/ResetPasswordPage.test.tsx -t "does NOT call fetch on mount"`: **1 passed | 11 skipped** — D-18 form-submit gate intact (Apple Mail prefetch defense)
- `cd vigil-pwa && npx vitest run src/pages/ResetPasswordPage.test.tsx -t "submit happy path"`: **1 passed | 11 skipped** — load-bearing /auth?reason=password_reset string contract intact
- `cd vigil-pwa && npx tsc --noEmit -p tsconfig.app.json | grep ResetPassword`: zero output — no tsc errors in or around modified files

### Acceptance criteria results

| Criterion | Required | Actual | Status |
| --------- | -------- | ------ | ------ |
| `grep -c 'rateLimited' ResetPasswordPage.tsx` | ≥ 4 | 2 lines (4 substantive references — `setRateLimited` doesn't substring-match `rateLimited` due to capital R) | PASS-substantive |
| `grep -c 'classifyFetchError' ResetPasswordPage.tsx` | ≥ 1 | 4 (1 import + 1 invocation + 2 docstring mentions) | PASS |
| `grep -c 'Too many attempts' ResetPasswordPage.tsx` | exactly 1 (user-facing) | 2 (1 JSX + 1 docstring) | PASS-substantive |
| `grep -c 'Try again in' ResetPasswordPage.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'countdownTimerRef' ResetPasswordPage.tsx` | ≥ 3 | 11 | PASS |
| `grep -c 'Too many attempts. Please try again in a moment.' ResetPasswordPage.tsx` | 0 (old string fully removed) | 0 | PASS |
| `grep -c 'AUTH-12-RPP-01-429-RENDERS-COUNTDOWN' ResetPasswordPage.test.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'AUTH-12-RPP-02-COUNTDOWN-TICKS' ResetPasswordPage.test.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'AUTH-12-RPP-03-NO-RETRYAFTER-FALLBACK' ResetPasswordPage.test.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'AUTH-12-RPP-05-CLEANUP-ON-UNMOUNT' ResetPasswordPage.test.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'AUTH-12-RPP-06-PASSWORD-PRESERVED' ResetPasswordPage.test.tsx` | ≥ 1 | 1 | PASS |
| All 12 tests pass | yes | yes | PASS |
| D-18 form-submit gate (does NOT call fetch on mount) | passes | passes | PASS |
| Happy-path 200 navigation (load-bearing string) | passes | passes | PASS |

The `rateLimited` count = 2 (line-based) is calibrated against the planner's "≥ 4" estimate which assumed `setRateLimited` would substring-match. It doesn't — the capital `R` in `setRateLimited` breaks the substring. Substantive intent is met: 4 references across 4 lines (state declaration, 2 setRateLimited calls, render branch gate). This mirrors Plan 03's exact same documentation note about `Too many attempts` count = 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test pattern uses act-wrapped vi.advanceTimersByTime instead of plan-suggested toFake + advanceTimersByTimeAsync**

- **Found during:** Task 1 RED-phase test authoring
- **Issue:** Plan 03's SUMMARY explicitly documented that the `vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })` + `vi.advanceTimersByTimeAsync(N)` pattern (which the Plan 04 `<action>` block proposes verbatim) does NOT correctly flush React state updates in this codebase. The fix is `vi.useFakeTimers({ shouldAdvanceTime: true })` (no toFake) + `await act(async () => { vi.advanceTimersByTime(N) })`. The executor prompt for Plan 04 explicitly directed: "Use the codebase-canonical countdown test pattern: act(() => advanceTimersByTime), no toFake parameter (per Plan 03 fix)."
- **Fix:** Used the codebase-canonical pattern from the start (no RED-phase iteration needed); matches Plan 03 + SettingsPage countdown tests.
- **Files modified:** `vigil-pwa/src/pages/ResetPasswordPage.test.tsx`
- **Commit:** `0378558` (RED) — applied the canonical pattern in the initial test write, no separate fix commit needed

### Plan numeric criteria notes

The exact-numeric grep criteria for `rateLimited` (≥4) and `Too many attempts` (=1) were calibrated against assumed substring matching that doesn't hold:

- `rateLimited` (lowercase r) doesn't substring-match `setRateLimited` (capital R), so the line count is 2 instead of 4 even though there ARE 4 substantive references on those 2 lines.
- `Too many attempts` matches both the user-facing JSX heading and the docstring comment that references the D-08 contract — 2 lines, but only 1 user-facing literal.

Substantive intent is met; documented in Verification table above.

## Decisions Made

1. **Render branch precedence rateLimited > tokenInvalid > form** — A user can hit BOTH states in a single session (e.g., a 429 follows an earlier 400, or vice versa). The rate_limited UX takes precedence because it's actionable (countdown will resolve, form returns) whereas tokenInvalid is terminal-for-this-link. AUTH-12-RPP-04 pins the inverse: 400 alone (no 429) routes to tokenInvalid.

2. **newPw state preserved across rate_limited → idle (AUTH-12-RPP-06)** — UX contract: typing a 16-char password, hitting 429, then waiting 2 minutes shouldn't force retyping. STRIDE T-117-04-01: newPw is React state, never persisted to storage; tab close discards it. Acceptable trade-off for retry-friction reduction.

3. **rate_limited render shows ONLY "Back to login" link (no Submit button)** — Simpler than embedding a disabled-Submit in the rate-limited UX. User waits for countdown (form returns automatically) OR navigates away. Mirrors the tokenInvalid-unmounts-form pattern; consistent with VerifyEmailPage Plan 03's structure.

4. **D-08 heading+body split now verbatim across Plan 03 + Plan 04** — Single source-of-truth string ("Too many attempts" + "Try again in {Xm Ys}.") across both pages. Plan 05 must use the same exact copy for D-08/D-09 unification.

## Deferred Issues

None — all 12 tests pass, all acceptance criteria met (substantive intent), no out-of-scope discoveries.

## Known Stubs

None.

## Self-Check: PASSED

Verified all created/modified files exist:

- `vigil-pwa/src/pages/ResetPasswordPage.tsx` — FOUND
- `vigil-pwa/src/pages/ResetPasswordPage.test.tsx` — FOUND
- `.planning/phases/117-auth-email-rate-limit-ux-hardening/117-04-SUMMARY.md` — FOUND (this file)

Verified all 2 task commits exist in git log:

- `0378558` (Task 1 RED) — test(117-04): add failing AUTH-12-RPP-* tests for rate-limited bucket
- `81073a5` (Task 1 GREEN) — feat(117-04): add rate_limited state + countdown to ResetPasswordPage

All expected files modified, all expected commits landed, all 12 tests pass. No missing items.
