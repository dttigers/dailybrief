---
phase: 117-auth-email-rate-limit-ux-hardening
plan: 05
subsystem: vigil-pwa/pages
tags: [pwa, settings, resend-verification, rate-limit, countdown, auth-12]
dependency-graph:
  requires:
    - "vigil-pwa/src/api/client.ts classifyFetchError + ErrorClass rate-limited bucket (Phase 117 Plan 02)"
    - "vigil-core/src/routes/resend-verification.ts 429 + Retry-After header (Phase 113 + 117 Plan 01)"
    - "vigil-pwa/src/pages/SettingsPage.tsx existing AUTH-11 D-25 ResendState lifecycle (Phase 113)"
    - "vigil-pwa/src/pages/SettingsPage.tsx existing Phase 116.1 per-league countdown pattern (independent reference)"
  provides:
    - "SettingsPage Resend-verification button rate_limited rendering with D-08 unified copy"
    - "resendRetryCountdown state + resendCountdownTimerRef — INDEPENDENT of per-league sports countdowns"
    - "handleResendClick 429 branch consumes classifyFetchError to source Retry-After"
    - "Cleanup-only useEffect for resend countdown timer on unmount"
    - "5 new AUTH-12-SP-* tests + 1 renamed AUTH-11-B2-RESEND-RATE-LIMITED (D-08 copy update)"
    - "Phase 117 closeout — 3-of-3 PWA pages now render distinct 429 UX (VerifyEmailPage Plan 03 + ResetPasswordPage Plan 04 + SettingsPage Plan 05)"
  affects:
    - "AUTH-12 contract satisfied end-to-end across all 3 affected PWA pages"
    - "Phase 117 SC#1 (3-of-3 PWA distinct 429 copy) fully satisfied"
    - "Phase 117 SC#4 (PWA error-bucket split exhaustive) fully satisfied"
tech-stack:
  added: []
  patterns:
    - "Inline single-line D-08 copy variation (vs heading+body split on VerifyEmailPage/ResetPasswordPage) — same substantive content, fits the in-banner real estate"
    - "Per-feature countdown ref isolation — resendCountdownTimerRef (single value) coexists alongside existing per-league countdownTimersRef (Record per league) via different ref names"
    - "Recovery-on-zero state machine — resendState 'rate_limited' → countdown 0 → setResendState('idle') (was previously terminal until page reload)"
    - "act-wrapped vi.advanceTimersByTime + userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) for tick tests (codebase-canonical, matches Phase 116.1 + Plans 03/04)"
key-files:
  created: []
  modified:
    - vigil-pwa/src/pages/SettingsPage.tsx
    - vigil-pwa/src/pages/SettingsPage.test.tsx
decisions:
  - "Phase 117-05: D-08 copy variation — inline single-line form 'Too many attempts — try again in {Xm Ys}.' fits the verify-email banner real estate (no heading hierarchy to inhabit). VerifyEmailPage/ResetPasswordPage's heading+body split is structurally inappropriate for this micro-UI. Substantive content is verbatim per CONTEXT.md Claude's Discretion clause"
  - "Phase 117-05: resendCountdownTimerRef + resendRetryCountdown live ALONGSIDE existing per-league countdownTimersRef + retryCountdowns (different names, different shapes) — structurally independent so Phase 116.1 sports system is untouched. Acceptance grep verifies retryCountdowns count unchanged"
  - "Phase 117-05: existing AUTH-11-B2-RESEND-RATE-LIMITED test asserted the OLD copy verbatim — renamed (kept its ID for git-blame continuity) and updated assertion to D-08 'Too many attempts — try again later.' (no-Retry-After fallback). T-117-05-03 anticipated this; one-line update closes the regression"
  - "Phase 117-05: ResendState 'rate_limited' is no longer terminal — recovers to 'idle' when countdown hits 0. AUTH-12-SP-02 pins this. Improvement aligned with D-09 visual unification (VerifyEmailPage/ResetPasswordPage both recover the same way)"
  - "Phase 117-05: button stays HIDDEN in rate_limited state (matches pre-Phase-117 behavior). The render branch shows only the rate-limit copy span, not a disabled button. Recovery happens via setResendState('idle') flipping the render to the default Resend button"
metrics:
  duration: "~4 minutes"
  completed: "2026-04-30"
  tasks: 1
  files-modified: 2
  commits: 2
---

# Phase 117 Plan 05: SettingsPage Resend-verification 429 countdown UX Summary

Added the Phase 117 D-08 unified copy + live mm:ss countdown to SettingsPage's verify-email banner Resend button. When POST /v1/auth/resend-verification returns 429, the rate_limited render branch swaps the legacy terminal "You've requested too many. Try again later." for the new "Too many attempts — try again in {Xm Ys}." with a live countdown sourced from the Retry-After header (parsed via `classifyFetchError` from Plan 02). When the countdown reaches 0, resendState returns to 'idle' and the Resend button re-enables. Per CONTEXT.md D-08, the substantive content is verbatim across all 3 affected PWA pages (VerifyEmailPage Plan 03, ResetPasswordPage Plan 04, this plan), with the SettingsPage variation being inline-single-line vs heading+body to fit the in-banner real estate. Per CONTEXT.md D-15, the new resendCountdownTimerRef + resendRetryCountdown state is STRUCTURALLY INDEPENDENT from the existing Phase 116.1 per-league sports countdowns (different ref names, different shapes — single value vs Record-per-league). The AUTH-11 verify-email banner visibility logic (`meData?.emailVerifiedAt === null` gate) is UNCHANGED.

## What Shipped

### State + ref additions

```typescript
// Phase 117 (AUTH-12 D-06/D-09): Retry-After countdown for the 'rate_limited'
// ResendState. INDEPENDENT of the Phase 116.1 per-league countdowns (those use
// retryCountdowns/countdownTimersRef Records). Single value here — there is
// only one /v1/auth/resend-verification endpoint, not a per-league axis.
const [resendRetryCountdown, setResendRetryCountdown] = useState<number | null>(null)
const resendCountdownTimerRef = useRef<number | null>(null)
```

These live alongside (not inside) the existing Phase 116.1 sports system:

| State / ref | Owner | Shape | Purpose |
| ----------- | ----- | ----- | ------- |
| `retryCountdowns` (existing) | Phase 116.1 sports | `Record<League, number \| null>` | Per-league sports retry timer |
| `countdownTimersRef` (existing) | Phase 116.1 sports | `Record<League, number \| null>` | Per-league setInterval IDs |
| `resendRetryCountdown` (NEW) | Phase 117 AUTH-12 | `number \| null` | Single resend timer countdown value |
| `resendCountdownTimerRef` (NEW) | Phase 117 AUTH-12 | `number \| null` | Single setInterval ID for resend timer |

### handleResendClick 429 branch

```typescript
if (res.status === 429) {
  setResendState('rate_limited')
  const errorClass = await classifyFetchError(res)
  if (errorClass.kind === 'rate-limited' && errorClass.retryAfter !== undefined) {
    const seconds = errorClass.retryAfter
    setResendRetryCountdown(seconds)
    if (resendCountdownTimerRef.current !== null) {
      window.clearInterval(resendCountdownTimerRef.current)
    }
    const timerId = window.setInterval(() => {
      setResendRetryCountdown((cur) => {
        if (cur === null || cur <= 1) {
          if (resendCountdownTimerRef.current !== null) {
            window.clearInterval(resendCountdownTimerRef.current)
            resendCountdownTimerRef.current = null
          }
          setResendState('idle')  // re-enable button when countdown completes
          return null
        }
        return cur - 1
      })
    }, 1000)
    resendCountdownTimerRef.current = timerId
  }
  return
}
```

### Render branch (D-08 inline single-line variation)

```jsx
{resendState === 'rate_limited' ? (
  <span className="text-xs text-red-400" aria-live="polite">
    {(() => {
      if (resendRetryCountdown !== null && resendRetryCountdown > 0) {
        const minutes = Math.floor(resendRetryCountdown / 60)
        const seconds = resendRetryCountdown % 60
        return `Too many attempts — try again in ${minutes}m ${seconds}s.`
      }
      return 'Too many attempts — try again later.'
    })()}
  </span>
) : ...}
```

The SettingsPage banner is a tight in-banner micro-UI with no `<h1>` to inhabit, so the heading+body split used by VerifyEmailPage / ResetPasswordPage is structurally inappropriate. The single-sentence form is verbatim per CONTEXT.md D-08's spec string.

### Cleanup-only useEffect

```typescript
useEffect(() => {
  return () => {
    if (resendCountdownTimerRef.current !== null) {
      window.clearInterval(resendCountdownTimerRef.current)
      resendCountdownTimerRef.current = null
    }
  }
}, [])
```

Mirrors the existing `cpSuccessTimerRef` (Phase 110 WR-02) and `resendSentTimerRef` (Phase 113 D-25) cleanup patterns.

### Test count delta

| File | Existing | New | Renamed | Total | Notes |
| ---- | -------- | --- | ------- | ----- | ----- |
| `SettingsPage.test.tsx` | 36 | 5 | 1 | 42 | AUTH-11-B2-RESEND-RATE-LIMITED renamed (kept ID) with updated D-08 copy assertion |

5 new AUTH-12-SP-* tests + 1 updated:

| Test ID | Scenario |
| ------- | -------- |
| `AUTH-11-B2-RESEND-RATE-LIMITED` (renamed) | 429 with NO Retry-After header → "Too many attempts — try again later." (D-08 fallback copy); button hidden |
| `AUTH-12-SP-01-RESEND-429-RENDERS-COUNTDOWN` | 429 + Retry-After: 120 → "Too many attempts — try again in 2m 0s."; button hidden |
| `AUTH-12-SP-02-RESEND-COUNTDOWN-TICKS` | 1s ticks (3s → 2s → 0s) → resendState returns to 'idle' at zero with Resend button re-enabled |
| `AUTH-12-SP-03-RESEND-NO-RETRYAFTER-FALLBACK` | 429 with no Retry-After header → D-08 fallback copy without mm:ss substring |
| `AUTH-12-SP-04-RESEND-5XX-RENDERS-LEGACY-ERROR` | 503 → existing 'Could not send. Try again.' state preserved (D-11 non-429 unchanged) |
| `AUTH-12-SP-05-RESEND-CLEANUP-ON-UNMOUNT` | Unmount mid-countdown → no setState-after-unmount warnings |

## Phase 117 closeout

With this plan, AUTH-12 is satisfied end-to-end across all 3 affected PWA pages:

| Page | Endpoint | Plan | Status |
| ---- | -------- | ---- | ------ |
| `VerifyEmailPage` | POST /v1/auth/verify-email | 117-03 | Heading+body D-08 split; recover-on-zero |
| `ResetPasswordPage` | POST /v1/auth/reset-password | 117-04 | Heading+body D-08 split; newPw preserved across recovery |
| `SettingsPage` (Resend) | POST /v1/auth/resend-verification | 117-05 (this plan) | Inline single-line D-08; recover-on-zero |

Phase 117 SC#1 (3-of-3 PWA distinct 429 copy) and SC#4 (PWA error-bucket split exhaustive) fully satisfied.

## Per-task summary

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | Add resendRetryCountdown state + countdown logic + 5 AUTH-12-SP-* tests + 1 renamed | `88079db` (RED), `69b2e2d` (GREEN) | `vigil-pwa/src/pages/SettingsPage.tsx`, `vigil-pwa/src/pages/SettingsPage.test.tsx` |

## Verification Results

- `cd vigil-pwa && npx vitest run src/pages/SettingsPage.test.tsx`: **41 passed | 1 failed (42 total)**. The single failure is `shows error banner with decoded message when ?google_error=invalid_state` — a **pre-existing test failure unrelated to this plan**. Verified by stashing my changes and re-running in isolation: same test fails. Out of scope for Phase 117-05; logged in Deferred Issues.
- `cd vigil-pwa && npx tsc --noEmit -p tsconfig.app.json | grep SettingsPage`: zero output — no tsc errors in or around modified files. Pre-existing tsc errors (`import.meta.env`, `CaptureBar.tags`, `BriefHistoryPage` type, missing `index.css` module) unrelated to this plan, documented in Plans 02/03/04 SUMMARYs.

### Acceptance criteria results

| Criterion | Required | Actual | Status |
| --------- | -------- | ------ | ------ |
| `grep -c 'resendRetryCountdown' SettingsPage.tsx` | ≥ 4 | 5 | PASS |
| `grep -c 'resendCountdownTimerRef' SettingsPage.tsx` | ≥ 4 | 10 | PASS |
| `grep -c 'Too many attempts — try again in' SettingsPage.tsx` | exactly 1 | 1 | PASS |
| `grep -c 'Too many attempts — try again later.' SettingsPage.tsx` | exactly 1 | 1 | PASS |
| `grep -c "You've requested too many. Try again later." SettingsPage.tsx` | 0 (old copy removed) | 0 | PASS |
| `grep -c 'classifyFetchError' SettingsPage.tsx` | ≥ 2 | 5 | PASS |
| `grep -c 'AUTH-12-SP-01-RESEND-429-RENDERS-COUNTDOWN' SettingsPage.test.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'AUTH-12-SP-02-RESEND-COUNTDOWN-TICKS' SettingsPage.test.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'AUTH-12-SP-03-RESEND-NO-RETRYAFTER-FALLBACK' SettingsPage.test.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'AUTH-12-SP-04-RESEND-5XX-RENDERS-LEGACY-ERROR' SettingsPage.test.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'AUTH-12-SP-05-RESEND-CLEANUP-ON-UNMOUNT' SettingsPage.test.tsx` | ≥ 1 | 1 | PASS |
| Per-league sports countdowns regression-safe (`retryCountdowns` count unchanged) | yes | 5 (same as pre-edit) | PASS |
| Per-league sports `countdownTimersRef` count unchanged | yes | 11 (same as pre-edit) | PASS |
| All AUTH-11-B2-RESEND-* lifecycle tests still pass for non-429 paths | yes | yes | PASS |
| All 5 new AUTH-12-SP-* tests pass | yes | yes | PASS |
| `cd vigil-pwa && npx tsc --noEmit -p tsconfig.app.json` (this file) | clean | clean | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing AUTH-11-B2-RESEND-RATE-LIMITED test asserted the OLD copy verbatim**

- **Found during:** Task 1 RED-phase test write
- **Issue:** The plan's `<behavior>` section claimed "UPDATE 0 existing tests (none of the existing AUTH-11-D-25 resend tests assert the OLD copy verbatim)" but the existing AUTH-11-B2-RESEND-RATE-LIMITED test at lines 317-347 of `SettingsPage.test.tsx` does in fact assert `screen.getByText("You've requested too many. Try again later.")` verbatim.
- **Fix:** Updated the test's copy assertion to the new D-08 fallback string `"Too many attempts — try again later."` (no Retry-After header → fallback form). Kept the test ID `AUTH-11-B2-RESEND-RATE-LIMITED` for git-blame continuity (Plan 04 took the same approach renaming-not-creating). Test still asserts button-hidden behavior which is preserved by the implementation.
- **Files modified:** `vigil-pwa/src/pages/SettingsPage.test.tsx`
- **Commit:** `88079db` (RED)
- **Anticipated by:** Threat T-117-05-03 in the plan's threat register ("If any existing test asserted the OLD copy verbatim, it must be updated.")

### Plan note adjustments

- **Plan SP-03 wording**: Plan said "Resend button NOT disabled (no countdown)." but with the existing render branch the button is HIDDEN entirely in `rate_limited` state (current AUTH-11-B2-RESEND-RATE-LIMITED test asserts `not.toBeInTheDocument()`). The new implementation preserves this — when no Retry-After is parseable, no countdown is set up and resendState stays `rate_limited` (terminal until next interaction) with the button hidden. The test asserts only the copy + no-mm:ss-substring, which is the substantive intent. Substantive intent is met.

- **Plan SP-05 `vi.useFakeTimers({ toFake: [...] })`**: Per Plan 03's documented fix and this plan's `<critical_constraints>`, used `vi.useFakeTimers({ shouldAdvanceTime: true })` (no `toFake`) + `await act(async () => { vi.advanceTimersByTime(N) })` instead. Codebase-canonical pattern, matches the existing Phase 116.1 / Phase 115 SettingsPage countdown tests in this very file.

- **Plan's `makeRouteMatcher` example**: Did not introduce that helper — instead reused the existing `renderPage({ fetchImpl })` pattern that the file's other 30+ tests use. This is the explicit `<NOTE>` in the plan's action block: "REUSE the existing pattern — do NOT introduce a new mocking style." Built `makeResendFetchImpl` as a small per-describe helper that returns a `fetchImpl` compatible with `renderPage`.

## Decisions Made

1. **D-08 copy variation: inline single-line form** — VerifyEmailPage / ResetPasswordPage use the heading + body split form (`<h1>Too many attempts</h1>` + `<p>Try again in Xm Ys.</p>`) for visual hierarchy. SettingsPage's resend-verification copy lives INLINE inside the verify-email banner — a tight micro-UI with no `<h1>` to inhabit. The single-sentence form `"Too many attempts — try again in {Xm Ys}."` matches the D-08 spec verbatim and fits the inline-banner real estate. CONTEXT.md Claude's Discretion clause explicitly authorizes this variation: "Exact placement of countdown text within each page's error block — UI designer's call during planning, anchored by the Phase 116.1 SettingsPage style."

2. **resendRetryCountdown / resendCountdownTimerRef are STRUCTURALLY INDEPENDENT from per-league sports countdowns** — Different ref NAMES (`resendCountdownTimerRef` vs `countdownTimersRef`), different SHAPES (`number | null` vs `Record<League, number | null>`), different LIFECYCLES. T-117-05-02 mitigated by acceptance grep verifying `retryCountdowns` count unchanged (5) and `countdownTimersRef` count unchanged (11). Phase 116.1 sports system is untouched.

3. **ResendState 'rate_limited' is no longer terminal — recovers to 'idle' on countdown completion** — Improvement aligned with D-09 visual unification (VerifyEmailPage/ResetPasswordPage Confirm/Submit buttons both recover the same way). When the countdown hits 0, the timer's tick callback calls `setResendState('idle')`, which flips the render branch back to the default Resend button. AUTH-12-SP-02 pins this behavior.

4. **classifyFetchError is invoked from a click-handler, NOT useEffect** — Same mount-safety pattern as Plan 03 VerifyEmailPage. The classifier import is fine because it's only awaited inside `handleResendClick`, never at mount. The new cleanup useEffect's body is empty (only the return-cleanup runs).

5. **Renamed AUTH-11-B2-RESEND-RATE-LIMITED instead of creating an entirely new test** — Preserves git-blame continuity for the test's evolution. The test still covers the same scenario (429 with no Retry-After header) and asserts the same button-hidden behavior, just with the updated D-08 copy. Mirrors Plan 04's approach renaming the legacy ResetPasswordPage 429 inline-banner test.

## Deferred Issues

- **`shows error banner with decoded message when ?google_error=invalid_state` test failure** — Pre-existing test failure unrelated to this plan. Verified by stashing my changes and re-running in isolation: same test fails. Likely a flaky interaction with how the GoogleStatusContext resolves on mount when `/v1/google/status` returns 404 simultaneously with the OAuth callback param being parsed. Out of scope for Phase 117-05. Should be investigated in a future cleanup phase.

## Known Stubs

None.

## Threat Flags

None — no new security-relevant surface introduced. The new state/ref pair is local to the SettingsPage component closure and does not cross any trust boundary. classifyFetchError is reused as-is from Plan 02 (no API changes). resendCountdownTimerRef and resendRetryCountdown are React in-memory state, never persisted.

## Self-Check: PASSED

Verified all created/modified files exist:

- `vigil-pwa/src/pages/SettingsPage.tsx` — FOUND
- `vigil-pwa/src/pages/SettingsPage.test.tsx` — FOUND
- `.planning/phases/117-auth-email-rate-limit-ux-hardening/117-05-SUMMARY.md` — FOUND (this file)

Verified all 2 task commits exist in git log:

- `88079db` (Task 1 RED) — test(117-05): add failing AUTH-12-SP-* tests for resend countdown
- `69b2e2d` (Task 1 GREEN) — feat(117-05): add resend-verification countdown to SettingsPage rate_limited state

All expected files modified, all expected commits landed, 41/42 tests pass (1 pre-existing failure unrelated to this plan, documented in Deferred Issues). No missing items.
