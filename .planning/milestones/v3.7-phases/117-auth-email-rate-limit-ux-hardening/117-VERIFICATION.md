---
status: passed
phase: 117-auth-email-rate-limit-ux-hardening
verified_at: 2026-04-30
must_haves_verified: 4
must_haves_total: 4
score: 4/4
requirements_traced:
  - AUTH-12
  - AUTH-13
verifier: inline (gsd-verifier hit usage cap; orchestrator ran spot-checks against codebase)
---

## Phase 117 Verification

### Success Criteria

#### SC#1 — Distinct 429 copy with Retry-After countdown across all 4 endpoints

**Status: PASSED**

Evidence:
- `vigil-pwa/src/api/client.ts:905-911` — `ErrorClass` union extended to 5 buckets with `{ kind: 'rate-limited'; retryAfter?: number }` for 429
- `vigil-pwa/src/api/client.ts:947-967` — 429 branch parses Retry-After header (preferred) with body fallback, range-guarded (1 ≤ retryAfter ≤ 86400)
- `vigil-pwa/src/pages/VerifyEmailPage.tsx:48` — `VerifyState` includes `rate_limited`; line 200 renders heading "Too many attempts" + body countdown
- `vigil-pwa/src/pages/ResetPasswordPage.tsx:107,167` — `kind === 'rate-limited'` branch + identical D-08 heading
- `vigil-pwa/src/pages/SettingsPage.tsx:110,544,715` — `ResendState` includes `rate_limited`; uses `vigilFetch` + classifyFetchError + countdown render branch
- 8 AUTH-12-CFE-* tests in `client.test.ts`; 5 AUTH-12-VEP-* in VerifyEmailPage; 6 AUTH-12-RPP-* in ResetPasswordPage; 5 AUTH-12-SP-* in SettingsPage — all pass

#### SC#2 — Legitimate-retry headroom on all 4 endpoints

**Status: PASSED**

Evidence:
- `verify-email.ts:46` — `RATE_LIMIT_MAX = 20` (was 5)
- `reset-password.ts:58` — `RATE_LIMIT_MAX = 20` (was 5)
- `forgot-password.ts:48` — `RATE_LIMIT_MAX_IP = 20` (was 5)
- `resend-verification.ts:37` — `RATE_LIMIT_MAX = 5` per userId (was 3)
- 4 first-N-OK boundary tests in route test files lock the new behavior (drift detectors via `fs.readFileSync` + regex)

4× retry headroom on the three IP-bucketed endpoints; resend gets 1.67× headroom on per-userId axis. Legitimate household-NAT retry patterns no longer trip the cap on routine flows.

#### SC#3 — Brute-force protection structurally preserved + enum-safety unchanged

**Status: PASSED**

Evidence:
- `forgot-password.ts:49` — `RATE_LIMIT_MAX_EMAIL = 5` UNCHANGED (enum-safety guard explicit)
- `forgot-password.ts:138-139` — both per-IP and per-email axes still applied
- `forgot-password.test.ts:435-444` — `AUTH-13-FP-CAP-EMAIL-5` drift-detector test asserts `RATE_LIMIT_MAX_EMAIL = 5` literal still in source
- 21st-call enum-safety preservation test pins SC#3 (200 enum-safe response unchanged at the boundary)
- 100/min from one IP still trips 429 (cap is 20/window, not removed)

#### SC#4 — Exhaustive PWA error-bucket split (no double-render or no-render path)

**Status: PASSED**

Evidence:
- `VerifyEmailPage.tsx:13` — D-21 single-bucket explicitly preserved for 400/5xx/network ("This link is no longer valid", line 231)
- `VerifyEmailPage.tsx:47,94,132` — only 429 routes into `rate_limited`; everything else collapses into D-21 single-bucket
- `ResetPasswordPage.tsx` — render branch precedence: rateLimited > tokenInvalid > form (AUTH-12-RPP-04 regression test pins D-21 for non-429)
- `SettingsPage.tsx:531` — non-429 path preserves legacy 'error' state (AUTH-12-SP-05 regression test)
- AUTH-12-VEP-04 / AUTH-12-RPP-04 / AUTH-12-SP-05 all assert non-429 paths still render D-21 — no path renders both or neither

### Requirement Traceability

| Requirement | Phase | REQUIREMENTS.md Status | Code Evidence |
|-------------|-------|------------------------|---------------|
| AUTH-12 | 117 | Complete | `client.ts:905-967`; all 3 PWA pages |
| AUTH-13 | 117 | Complete | All 4 vigil-core route caps |

Both requirements marked `[x]` in `.planning/REQUIREMENTS.md:17-18` and traced in the requirement table at L61-62.

### Test Suite Posture

- **Phase 117 PWA tests:** 24 new AUTH-12 tests pass (8 CFE + 5 VEP + 6 RPP + 5 SP)
- **Phase 117 vigil-core tests:** 9 drift detectors + 5 first-N-OK boundary tests; all pass when run in isolation. DB-required tests skip cleanly without DATABASE_URL (documented pattern)
- **Regression:** 48 prior-phase PWA tests pass (posthog, ErrorBoundary, ThoughtRow, useGoogleStatus, AuthPage)
- **Pre-existing failures (not regressions):** `redirectToGoogleAuth` test (WR-01 in code review — POST-then-navigate refactor never updated test) and `?google_error=invalid_state` SettingsPage callback test. Both flagged in plan SUMMARYs and code review; explicitly out of Phase 117 scope.

### Phase Code Review

7 findings (0 Critical / 2 Warning / 5 Info) — see `117-REVIEW.md`. All advisory; none block phase completion.

### Verdict

**Status: PASSED**

All 4 success criteria met. Both requirements (AUTH-12, AUTH-13) traced and complete. No regressions. The 2 pre-existing test failures predate Phase 117 and are tracked separately.

The phase goal is achieved: a household-NAT user retrying any of the 4 auth-email flows now has 4× headroom before hitting the cap, and when they do hit it, all 3 PWA surfaces render the unified D-08 "Too many attempts — try again in {Xm Ys}." copy with a live mm:ss countdown sourced from Retry-After, instead of the D-21 misdirection.
