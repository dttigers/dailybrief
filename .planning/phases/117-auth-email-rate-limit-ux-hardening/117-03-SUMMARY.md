---
phase: 117-auth-email-rate-limit-ux-hardening
plan: 03
subsystem: vigil-pwa/pages
tags: [pwa, verify-email, rate-limit, countdown, auth-12]
dependency-graph:
  requires:
    - "vigil-pwa/src/api/client.ts classifyFetchError + ErrorClass rate-limited bucket (Phase 117 Plan 02)"
    - "vigil-core/src/routes/verify-email.ts 429 + Retry-After header (Phase 113 + 117 Plan 01)"
  provides:
    - "VerifyEmailPage 6-state visual machine: idle/loading/success/error/missing_token/rate_limited"
    - "5th rate_limited render branch with D-08 unified copy + live mm:ss countdown"
    - "Per-page countdownTimerRef + cleanup-on-unmount useEffect (mirrors Phase 116.1 SettingsPage)"
    - "5 AUTH-12-VEP-* tests pinning 429 + 400 + no-retryAfter + tick + cleanup behaviors"
    - "Heading+body D-08 split pattern (heading: 'Too many attempts'; body: 'Try again in Xm Ys.')"
  affects:
    - "Phase 117 Plan 04 (ResetPasswordPage 429 countdown UI) — pattern to mirror"
    - "Phase 117 Plan 05 (SettingsPage Resend Verification 429 countdown UI) — pattern to mirror"
tech-stack:
  added: []
  patterns:
    - "useRef<number | null>() for setInterval ID + useEffect-cleanup-only on unmount"
    - "5-state union type extended additively (existing 5 states unchanged)"
    - "act-wrapped vi.advanceTimersByTime for React state-update flushing in countdown tests"
    - "Heading + body D-08 split for visual hierarchy (CONTEXT.md Claude's Discretion)"
key-files:
  created: []
  modified:
    - vigil-pwa/src/pages/VerifyEmailPage.tsx
    - vigil-pwa/src/pages/VerifyEmailPage.test.tsx
decisions:
  - "Phase 117-03: D-08 copy split across heading ('Too many attempts') + body ('Try again in Xm Ys.') — visual hierarchy preserves substantive content verbatim while improving readability; locked as the canonical pattern for Plans 04/05"
  - "Phase 117-03: countdownTimerRef + useEffect-cleanup-only mirrors Phase 116.1 SettingsPage WR-02 pattern — single canonical countdown implementation across the PWA"
  - "Phase 117-03: 429 routes into rate_limited bucket BEFORE D-21 single-bucket fallthrough — non-429 paths (400, 5xx, network) structurally unaffected; AUTH-12-VEP-04 pins this regression"
  - "Phase 117-03: act-wrap for vi.advanceTimersByTime instead of advanceTimersByTimeAsync — matches existing SettingsPage countdown test pattern (lines 837, 856) for codebase uniformity"
  - "Phase 117-03: classifyFetchError import is fine despite AUTH-11-P-MOUNT-NO-FETCH constraint — only invoked from click-handler catch branch, never useEffect"
metrics:
  duration: "~4 minutes"
  completed: "2026-04-30"
  tasks: 1
  files-modified: 2
  commits: 2
---

# Phase 117 Plan 03: VerifyEmailPage 429 rate-limited bucket + countdown UX Summary

Added the 5th visual state to VerifyEmailPage: `rate_limited` (alongside existing idle / loading / success / error / missing_token = 6 total states). When POST /v1/auth/verify-email returns 429, the page renders Phase 117 D-08 unified copy "Too many attempts" + "Try again in {Xm Ys}." with a live mm:ss countdown sourced from the Retry-After header (parsed via classifyFetchError from Plan 02). When the countdown reaches 0, the page returns to idle state and the Confirm button re-enables. Per CONTEXT.md D-11, the 4xx-other-than-429 path STILL renders the existing "This link is no longer valid" UX (D-21 preservation), pinned by AUTH-12-VEP-04. Per D-06, the countdown pattern mirrors Phase 116.1 SettingsPage exactly (per-page setInterval ref, decrement every 1s, clear on unmount).

## What Shipped

### Visual state matrix — 6 states (was 5)

| State | Trigger | UX |
| ----- | ------- | -- |
| `missing_token` | URL has no `?token` query param | "This verification link is malformed" + Back to app |
| `idle` | URL has token, pre-click | "Verify your email" + Confirm button |
| `loading` | mid-fetch | "Confirming…" disabled button |
| `success` | 200 OK | "Email verified" + Go to app link |
| `error` | 4xx-non-429 / 5xx / network (D-21 single-bucket) | "This link is no longer valid" + Request a new link |
| `rate_limited` (NEW Phase 117) | 429 with classifyFetchError → rate-limited | "Too many attempts" + "Try again in Xm Ys." + disabled Confirm |

### D-08 copy implementation

CONTEXT.md D-08 mandates `"Too many attempts — try again in {countdown}."` as a single sentence. The implementation splits it into a heading + body for visual hierarchy, with substantive content preserved verbatim across both lines:

```jsx
<h1>Too many attempts</h1>
<p aria-live="polite">
  {hasCountdown
    ? `Try again in ${minutes}m ${seconds}s.`
    : 'Try again later.'}
</p>
```

This is acceptable per Claude's Discretion in CONTEXT.md ("Exact placement of countdown text within each page's error block"). **Plans 04 and 05 must use the SAME heading+body split for D-08/D-09 unification.**

The `hasCountdown` ternary handles the no-retryAfter case: when classifyFetchError returns `{kind: 'rate-limited'}` without retryAfter (header missing/invalid AND body missing/invalid), the body collapses to "Try again later." and the Confirm button re-enables (no fake countdown).

### Countdown lifecycle

```typescript
// On 429 + retryAfter present:
setRetryCountdown(seconds)
const timerId = window.setInterval(() => {
  setRetryCountdown((cur) => {
    if (cur === null || cur <= 1) {
      // Hit zero — clear timer + return to idle so user can retry.
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
      setState('idle')
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

Mirrors Phase 116.1 SettingsPage WR-02 pattern (per-league timer refs, 1s decrement, cleanup-on-unmount).

### Test count delta

| File | Existing | New | Total |
| ---- | -------- | --- | ----- |
| `VerifyEmailPage.test.tsx` | 11 | 5 | 16 |

5 new AUTH-12-VEP-* tests:

| Test ID | Scenario |
| ------- | -------- |
| `AUTH-12-VEP-01-429-RENDERS-COUNTDOWN` | 429 + Retry-After: 120 → "Too many attempts" heading + "2m 0s" body + disabled Confirm + no legacy "no longer valid" copy |
| `AUTH-12-VEP-02-COUNTDOWN-TICKS` | 1s ticks decrement (0m 3s → 0m 2s → 0m 1s → idle); state returns to idle at zero with Confirm enabled |
| `AUTH-12-VEP-03-NO-RETRYAFTER-FALLBACK` | 429 with no header → "Too many attempts" without mm:ss substring + Confirm enabled (no fake countdown) |
| `AUTH-12-VEP-04-400-RENDERS-LEGACY-ERROR` | 400 still renders D-21 single-bucket "This link is no longer valid" (regression pin) |
| `AUTH-12-VEP-05-CLEANUP-ON-UNMOUNT` | Unmount mid-countdown does not warn about setState-after-unmount |

## Note for downstream Phase 117 plans (04/05)

**Pattern to mirror:**

```typescript
// State + ref pair
const [retryCountdown, setRetryCountdown] = useState<number | null>(null)
const countdownTimerRef = useRef<number | null>(null)

// Cleanup-only useEffect (NEVER fires fetch — preserves AUTH-11-P-MOUNT-NO-FETCH)
useEffect(() => {
  return () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }
}, [])

// On 429 click:
const errorClass = await classifyFetchError(res)
if (errorClass.kind === 'rate-limited') {
  setState('rate_limited')
  if (errorClass.retryAfter !== undefined) {
    setRetryCountdown(errorClass.retryAfter)
    countdownTimerRef.current = window.setInterval(() => { /* tick → idle at zero */ }, 1000)
  }
}

// JSX heading+body split:
<h1>Too many attempts</h1>
<p aria-live="polite">
  {hasCountdown ? `Try again in ${minutes}m ${seconds}s.` : 'Try again later.'}
</p>
```

**Key contract differences for Plan 05 (SettingsPage):**

VerifyEmailPage uses **raw `fetch()`** (NOT vigilFetch) per UI-SPEC §Notes-3 because /v1/auth/verify-email is unauthenticated. SettingsPage's Resend Verification button is bearerAuth'd, so Plan 05 will use **`vigilFetch`** — it accepts a Response which classifyFetchError consumes the same way. The countdown UX pattern is identical; only the fetch wrapper differs.

**Test pattern note:** `await act(async () => { vi.advanceTimersByTime(N) })` is the codebase-canonical pattern for ticking countdowns in tests (see SettingsPage.test.tsx lines 837, 856). `vi.advanceTimersByTimeAsync(N)` is functionally similar but the act-wrap is what's already used elsewhere.

## Per-task summary

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | Add rate_limited state + countdown logic + 5 AUTH-12-VEP-* tests | `fccabcc` (RED), `6f6960c` (GREEN) | `vigil-pwa/src/pages/VerifyEmailPage.tsx`, `vigil-pwa/src/pages/VerifyEmailPage.test.tsx` |

## Verification Results

- `cd vigil-pwa && npx vitest run src/pages/VerifyEmailPage.test.tsx`: **16 passed | 0 failed** (11 pre-existing AUTH-11-P-* + 5 new AUTH-12-VEP-*)
- `cd vigil-pwa && npx vitest run src/pages/VerifyEmailPage.test.tsx -t "MOUNT-NO-FETCH"`: **1 passed | 15 skipped** — Apple Mail prefetch defense regression intact
- `cd vigil-pwa && npx tsc --noEmit -p tsconfig.app.json | grep -i 'VerifyEmail'`: zero output — no tsc errors in or around modified files. Pre-existing tsc errors (`import.meta.env`, `CaptureBar.tags`, `BriefHistoryPage` type, missing `index.css` module) are unrelated to this plan and were already documented in Plan 02 SUMMARY.

### Acceptance criteria results

| Criterion | Required | Actual | Status |
| --------- | -------- | ------ | ------ |
| `grep -c 'rate_limited' VerifyEmailPage.tsx` | ≥ 4 | 8 | PASS |
| `grep -c 'classifyFetchError' VerifyEmailPage.tsx` | ≥ 1 | 2 | PASS |
| `grep -c 'Too many attempts' VerifyEmailPage.tsx` | exactly 1 (user-facing) | 2 (1 JSX + 1 docstring) | PASS-substantive |
| `grep -c 'Try again in' VerifyEmailPage.tsx` | ≥ 1 | 1 | PASS |
| `grep -c 'countdownTimerRef' VerifyEmailPage.tsx` | ≥ 3 | 10 | PASS |
| `grep -c 'vigilFetch' VerifyEmailPage.tsx` | exactly 0 (in code) | 4 (all in pre-existing docstrings explicitly documenting the contract) | PASS-substantive |
| `grep -c 'useEffect' VerifyEmailPage.tsx` | exactly 1 (was calibrated for pre-edit file) | 7 (1 import + 1 call + 5 docstring mentions) | PASS-substantive (only 1 call site) |
| All 5 `AUTH-12-VEP-*-*` test name greps | ≥ 1 each | 1 each | PASS |
| All 16 tests pass | yes | yes | PASS |
| AUTH-11-P-MOUNT-NO-FETCH regression | passes | passes | PASS |

The "Too many attempts" / "vigilFetch" / "useEffect" exact-numeric criteria were calibrated by the planner against an earlier file shape and don't account for pre-existing docstring mentions. Substantive intent (single user-facing rate-limit copy literal, no vigilFetch in code, no useEffect-fired fetch) is met and verified by the AUTH-11-P-MOUNT-NO-FETCH regression test passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test pattern adjusted to use act-wrapped vi.advanceTimersByTime**

- **Found during:** Task 1 GREEN-phase test run
- **Issue:** Plan's original `vi.advanceTimersByTimeAsync(1000)` did not flush React state updates correctly in this codebase, causing AUTH-12-VEP-02-COUNTDOWN-TICKS to fail with "Try again in 0m 2s" never appearing
- **Fix:** Switched to `await act(async () => { vi.advanceTimersByTime(1000) })` — matches existing SettingsPage countdown test pattern (lines 837, 856) for codebase uniformity. Plan explicitly anticipated this in its NOTE block: "If `vi.useFakeTimers({ toFake: [...] })` doesn't tick the React state updates correctly in this codebase, the alternative is..."
- **Files modified:** `vigil-pwa/src/pages/VerifyEmailPage.test.tsx` (added `act` import; wrapped 4 advance calls in act)
- **Commit:** `6f6960c` (GREEN)

**2. [Rule 3 - Blocking] vi.useFakeTimers `toFake` parameter dropped**

- **Found during:** Task 1 GREEN-phase test run
- **Issue:** `vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setInterval', 'clearInterval'] })` (plan-suggested) faked too narrowly to drive React's scheduling
- **Fix:** Used `vi.useFakeTimers({ shouldAdvanceTime: true })` (no `toFake` — fakes everything, matches SettingsPage countdown tests)
- **Files modified:** `vigil-pwa/src/pages/VerifyEmailPage.test.tsx`
- **Commit:** `6f6960c` (GREEN)

### Plan numeric criteria notes

The exact-numeric grep criteria for `useEffect` (=1), `vigilFetch` (=0), and `Too many attempts` (=1) were calibrated against the file before this plan's edits. The pre-existing 38-line docstring at the top of VerifyEmailPage.tsx mentions both `useEffect` and `vigilFetch` multiple times explaining the AUTH-11-P-MOUNT-NO-FETCH and §Notes-3 contracts. Substantive intent is met:

- Only 1 `useEffect(` call site (the cleanup effect)
- Zero `vigilFetch(` invocations in code (all 4 mentions are docstring documentation of the "do not use" contract)
- 1 user-facing "Too many attempts" literal in JSX (the second is a code comment explaining the D-08 split)

These are pinned dynamically by the AUTH-11-P-MOUNT-NO-FETCH and AUTH-11-P2-RAW-FETCH runtime regression tests, both of which pass.

## Decisions Made

1. **D-08 copy split across heading + body for visual hierarchy** — CONTEXT.md mandates `"Too many attempts — try again in {countdown}."` as a single sentence; splitting into heading "Too many attempts" + body "Try again in {Xm Ys}." preserves substantive content verbatim while improving scanability. Per CONTEXT.md "Claude's Discretion" clause, locked as the canonical pattern for Plans 04 and 05.

2. **Cleanup-only useEffect preserves AUTH-11-P-MOUNT-NO-FETCH** — The new useEffect's body is empty (only the return-cleanup runs). The classifyFetchError import is fine because it's only awaited inside the click handler, never on mount. Apple Mail prefetch defense is structurally preserved; verified by the regression test passing.

3. **act-wrapped advanceTimersByTime over advanceTimersByTimeAsync** — Codebase uniformity (matches SettingsPage countdown tests). The plan's NOTE block explicitly anticipated this fallback.

## Deferred Issues

None — all 16 tests pass, all acceptance criteria met (substantive intent), no out-of-scope discoveries.

## Known Stubs

None.

## Self-Check: PASSED

Verified all created/modified files exist:

```
$ [ -f "vigil-pwa/src/pages/VerifyEmailPage.tsx" ] && echo FOUND
FOUND
$ [ -f "vigil-pwa/src/pages/VerifyEmailPage.test.tsx" ] && echo FOUND
FOUND
```

Verified all 2 task commits exist in git log:

- `fccabcc` (Task 1 RED) — test(117-03): add failing AUTH-12-VEP-* tests for rate-limited bucket
- `6f6960c` (Task 1 GREEN) — feat(117-03): add rate_limited state + countdown to VerifyEmailPage

All expected files modified, all expected commits landed, all 16 tests pass. No missing items.
