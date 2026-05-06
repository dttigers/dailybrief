---
phase: 117-auth-email-rate-limit-ux-hardening
plan: 02
subsystem: vigil-pwa/api
tags: [pwa, error-classification, rate-limit, retry-after, auth-12]
dependency-graph:
  requires:
    - "vigil-pwa/src/api/client.ts classifyFetchError + ErrorClass (Phase 116.1 Plan 03)"
    - "vigil-core/src/routes/verify-email.ts 429 + Retry-After header (Phase 113 + 117 Plan 01)"
  provides:
    - "ErrorClass extended to 5 buckets — { kind: 'rate-limited'; retryAfter?: number } added (AUTH-12 D-10)"
    - "classifyFetchError handles status === 429 with header-preferred-over-body retryAfter parsing"
    - "Header parser: strict delay-seconds only (RFC 7231 §7.1.3) — HTTP-date format rejected"
    - "Range guard 1 ≤ retryAfter ≤ 86400 mirrors Phase 116.1 502 bucket semantics"
    - "8 new AUTH-12-CFE-* tests in vigil-pwa/src/api/client.test.ts"
  affects:
    - "Phase 117 Plan 03 (VerifyEmailPage 429 countdown UI) — unblocked"
    - "Phase 117 Plan 04 (ResetPasswordPage 429 countdown UI) — unblocked"
    - "Phase 117 Plan 05 (SettingsPage Resend Verification 429 countdown UI) — unblocked"
tech-stack:
  added: []
  patterns:
    - "Header-preferred-over-body retryAfter source-of-truth ordering (HTTP spec compliance)"
    - "Strict parseInt validation: String(parsed) === headerRaw.trim() rejects non-delay-seconds values"
    - "TDD RED → GREEN flow with separate atomic commits"
key-files:
  created: []
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/api/client.test.ts
decisions:
  - "Phase 117-02: Header preferred over body for retryAfter — HTTP/1.1 RFC 7231 §7.1.3 specifies Retry-After as the canonical wire format; body fallback is defense-in-depth for hypothetical non-Hono future endpoints"
  - "Phase 117-02: HTTP-date Retry-After format rejected — accepted residual risk per Phase 116.1 precedent (502 bucket also numeric-only); auth routes only emit delay-seconds via String(retryAfterSec) so no real-world impact"
  - "Phase 117-02: 429 branch ordered BEFORE 502 in source — clean reading order; not load-bearing for correctness since separate status codes never collide"
metrics:
  duration: "~3.5 minutes"
  completed: "2026-04-30"
  tasks: 1
  files-modified: 2
  commits: 2
---

# Phase 117 Plan 02: PWA classifyFetchError rate-limited bucket Summary

Extended Phase 116.1's `classifyFetchError` helper with a 5th bucket — `rate-limited` — that fires on `status === 429` with retryAfter sourced from the `Retry-After` HTTP header (preferred per RFC 7231 §7.1.3) with fallback to the response body's `retryAfter` field. Mirrors the existing 502-branch range-guard semantics (1..86400 seconds) and rejects non-delay-seconds header formats (HTTP-date, decimals, trailing characters) via strict parseInt + equality check. Helper is now consumable by Plans 03/04/05 to drive the unified `"Too many attempts — try again in {countdown}."` UX across VerifyEmailPage, ResetPasswordPage, and SettingsPage.

## What Shipped

### ErrorClass union — 5 buckets (was 4)

```typescript
export type ErrorClass =
  | { kind: 'auth' }
  | { kind: 'rate-limited'; retryAfter?: number }   // Phase 117 (AUTH-12 D-10): NEW
  | { kind: 'upstream'; retryAfter?: number }        // Phase 116.1
  | { kind: 'server' }
  | { kind: 'network' }
```

### classifyFetchError 429 branch — header-preferred-over-body parsing

```typescript
if (res.status === 429) {
  // Try header first (HTTP-spec source of truth).
  const headerRaw = res.headers.get('Retry-After')
  if (headerRaw !== null) {
    const parsed = parseInt(headerRaw, 10)
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 86_400 && String(parsed) === headerRaw.trim()) {
      return { kind: 'rate-limited', retryAfter: parsed }
    }
  }
  // Header missing or invalid — fall back to body.retryAfter field.
  try {
    const body = await res.clone().json() as { error?: string; retryAfter?: unknown }
    const ra = body?.retryAfter
    if (typeof ra === 'number' && Number.isFinite(ra) && ra > 0 && ra <= 86_400) {
      return { kind: 'rate-limited', retryAfter: ra }
    }
  } catch { /* swallow body parse failure (T-117-02-03) */ }
  return { kind: 'rate-limited' }
}
```

The `String(parsed) === headerRaw.trim()` check is the linchpin of HTTP-date rejection: `parseInt("Wed, 21 Oct 2015...")` returns `NaN`, but more importantly `parseInt("120abc")` would return `120` — the equality check rejects that case so only pure delay-seconds tokens pass.

### Test count delta

| File                          | Existing | New | Total |
| ----------------------------- | -------- | --- | ----- |
| `client.test.ts`              | 17       | 8   | 25    |

8 new AUTH-12-CFE-* tests:

| Test ID                              | Scenario                                                                |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `AUTH-12-CFE-RL-01-HEADER-ONLY`      | 429 + `Retry-After: 120` → `{ kind: 'rate-limited', retryAfter: 120 }`  |
| `AUTH-12-CFE-RL-02-BODY-ONLY`        | 429 + body `retryAfter: 90` → `retryAfter: 90`                          |
| `AUTH-12-CFE-RL-03-BOTH-HEADER-WINS` | 429 + header(120) + body(90) → header wins, `retryAfter: 120`           |
| `AUTH-12-CFE-RL-04-NEITHER`          | 429 + neither → `{ kind: 'rate-limited' }` (no retryAfter)              |
| `AUTH-12-CFE-RL-05-HEADER-OUT-OF-RANGE` | 429 + `Retry-After: 100000` → range guard rejects, no retryAfter      |
| `AUTH-12-CFE-RL-06-HEADER-NEGATIVE`  | 429 + `Retry-After: -5` → range guard rejects, no retryAfter            |
| `AUTH-12-CFE-RL-07-HEADER-NON-NUMERIC` | 429 + HTTP-date string → rejected, no retryAfter                       |
| `AUTH-12-CFE-REGRESSION-OTHERS`      | 401/403/500/502+retryAfter/non-Response unchanged from Phase 116.1      |

## Note for downstream Phase 117 plans (03/04/05)

Import pattern:

```typescript
import { classifyFetchError, type ErrorClass } from '../api/client'

const cls = await classifyFetchError(response)
if (cls.kind === 'rate-limited') {
  const seconds = cls.retryAfter  // number | undefined
  // Drive countdown UI: if seconds defined, mm:ss live decrement;
  // if undefined, hide countdown chrome and re-enable Submit immediately.
}
```

Auth routes (`verify-email`, `reset-password`, `resend-verification`) currently emit only the `Retry-After` header — body `retryAfter` field is defense-in-depth for hypothetical future endpoints. RL-01-HEADER-ONLY and RL-04-NEITHER cover the actual server contract.

## Per-task summary

| Task | Name                                                                  | Commits                  | Files                                                                  |
| ---- | --------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| 1    | Extend ErrorClass + add 429 branch to classifyFetchError + 8 new tests | `b4befde` (RED), `6511901` (GREEN) | `vigil-pwa/src/api/client.ts`, `vigil-pwa/src/api/client.test.ts` |

## Verification Results

- `cd vigil-pwa && npx vitest run src/api/client.test.ts -t "classifyFetchError"`: **8 passed | 17 skipped** (all 8 new tests pass when run in isolation)
- `cd vigil-pwa && npx vitest run src/api/client.test.ts`: 24 passed | 1 failed | 25 total. The single failure is `redirectToGoogleAuth sets window.location.href to /v1/auth/google` — a **pre-existing flaky test** unrelated to this plan (verified by stashing changes and re-running RED-phase: same `redirectToGoogleAuth` test fails when re-run in isolation due to fetch mock state interacting with test order). Logged in Deferred Issues below.
- `cd vigil-pwa && npx tsc --noEmit -p tsconfig.app.json | grep client`: only pre-existing `import.meta.env` errors at `client.ts:3` (unrelated to my changes); no errors in or around `classifyFetchError`
- All 11 acceptance criteria verified via grep (4 buckets `kind: 'rate-limited'` references in client.ts, exactly 1 `res.status === 429`, 3 `Retry-After` references, all 8 test name greps return 1)

## Deviations from Plan

None — plan executed exactly as written. TDD RED → GREEN cycle followed atomically. No deviation rules triggered.

## Decisions Made

1. **Header preferred over body for retryAfter source-of-truth** — HTTP/1.1 RFC 7231 §7.1.3 makes `Retry-After` the canonical wire format. Body fallback is defense-in-depth for hypothetical future endpoints (e.g., a non-Hono service that doesn't emit the header). RL-03-BOTH-HEADER-WINS test pins this ordering against accidental future regression.
2. **HTTP-date Retry-After format rejected (delay-seconds only)** — Accepted residual risk per Phase 116.1 precedent (502 bucket also numeric-body-only). vigil-core auth routes emit `String(retryAfterSec)` exclusively, so no real-world impact. RL-07-HEADER-NON-NUMERIC test pins this rejection.
3. **429 branch ordered before 502 in source** — Clean reading order matches CONTEXT.md D-10's bucket-priority intent. Not load-bearing for correctness (status codes 429 and 502 never collide), but reduces cognitive load when reading the classifier top-to-bottom.

## Deferred Issues

- **`redirectToGoogleAuth sets window.location.href to /v1/auth/google` test flake** — pre-existing test failure unrelated to this plan. The test calls async `redirectToGoogleAuth()` without awaiting and without mocking `vigilFetch`, so the synchronous `expect(window.location.href).toMatch(...)` assertion races against the still-pending fetch promise. Failure surfaces inconsistently based on test execution order. Out of scope for Phase 117-02. Should be fixed by mocking fetch in the test (e.g., `vi.stubGlobal('fetch', ...)`) and awaiting the promise. Logged for a future cleanup phase.

## Known Stubs

None.

## Self-Check: PASSED

Verified all created/modified files exist, all 2 task commits exist in git log:
- `b4befde` (Task 1 RED) — test(117-02): add failing AUTH-12-CFE-* tests for rate-limited bucket
- `6511901` (Task 1 GREEN) — feat(117-02): implement rate-limited bucket on classifyFetchError

All 2 files modified (`vigil-pwa/src/api/client.ts`, `vigil-pwa/src/api/client.test.ts`), all expected. No missing items.
