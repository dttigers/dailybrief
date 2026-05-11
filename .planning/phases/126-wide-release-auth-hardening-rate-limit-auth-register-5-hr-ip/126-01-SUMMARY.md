---
phase: 126
plan: 01
subsystem: vigil-core + vigil-pwa
tags: [auth, captcha, sentry, email-verify, error-codes, legal, wave-0, tdd-red, scaffold, drift-detector]
requires:
  - phase-117/auth-13-fp-cap-ip-20 (drift-detector pattern via fs.readFileSync + regex)
  - phase-124/mount-order-convention (Hono middleware order — bearerAuth → verify → protected)
  - phase-113/di-seam-pattern (__setXForTest / __resetXForTest at module scope)
provides:
  - vigil-core/src/lib/turnstile.test.ts — siteverify URL drift + 4 behavior cases (AUTH-126-02)
  - vigil-core/src/lib/sentry.test.ts — DSN-unset no-op + captureToSentry shape (AUTH-126-04)
  - vigil-core/src/middleware/require-verified-email.test.ts — 24h grace matrix + bypass + INVALID_TOKEN_SUBJECT (AUTH-126-03)
  - vigil-core/src/__tests__/mount-order.test.ts — initSentry/Hono + verify/bearer/protected position locks
  - vigil-pwa/src/lib/api-error-codes.test.ts — resolveApiError + 9-key LOCKED enum (AUTH-126-05)
  - vigil-pwa/src/pages/PrivacyPolicyPage.test.tsx — substring + heading lock (AUTH-126-06)
  - vigil-pwa/src/pages/TermsOfServicePage.test.tsx — substring + heading lock (AUTH-126-06)
affects: []
tech-stack:
  added: []
  patterns:
    - "RED-by-construction Wave 0 stubs: import the not-yet-existing production module so test failure documents what Wave 1 must build"
    - "Source-content drift detector via fs.readFileSync + assert.match (mirrors Phase 117 AUTH-13-FP-CAP-IP-20)"
    - "Mount-order lock via assert.ok(source.indexOf(A) < source.indexOf(B)) — Phase 124 carry-forward"
    - "vigil-pwa router imports always from 'react-router' v7 (single-package namespace), never 'react-router-dom'"
key-files:
  created:
    - vigil-core/src/lib/turnstile.test.ts
    - vigil-core/src/lib/sentry.test.ts
    - vigil-core/src/middleware/require-verified-email.test.ts
    - vigil-core/src/__tests__/mount-order.test.ts
    - vigil-pwa/src/lib/api-error-codes.test.ts
    - vigil-pwa/src/pages/PrivacyPolicyPage.test.tsx
    - vigil-pwa/src/pages/TermsOfServicePage.test.tsx
  modified: []
decisions:
  - Wave 0 ships RED-by-construction tests only; zero production files touched
  - Drift detectors mirror Phase 117 fs.readFileSync + regex idiom — survives bundler/minifier transforms and locks literal source strings
  - PWA tests import from 'react-router' (v7 single-package namespace), never 'react-router-dom' — vigil-pwa/package.json line 17 confirms; plan verify command grep -q 'react-router-dom' returns non-match
  - LOCKED enum (9 codes from D-04) pinned in api-error-codes.test.ts so future planners can extend but cannot remove
metrics:
  duration: 4m
  completed: 2026-05-11
---

# Phase 126 Plan 01: Wave 0 Test Scaffolds Summary

Landed seven RED-by-construction test files covering AUTH-126-02 through AUTH-126-06 — every Wave 1+ task in Phase 126 now has a real `<verify>` target to flip GREEN. Zero production files modified; failures document what Wave 1 must build.

## What Shipped

### Task 1 — vigil-core Wave 0 stubs (commit 481231f)

Four `node:test` files. Each imports a not-yet-existing production module so module-resolution failure IS the Wave 0 RED signal.

| Test file | Cases | Targets |
|-----------|-------|---------|
| `vigil-core/src/lib/turnstile.test.ts` | 5 | AUTH-126-02 (Plan 02): siteverify URL drift detector + success / failure / network-throw / missing-secret behaviors. Pins hyphenated `"error-codes"` key (RESEARCH R4). |
| `vigil-core/src/lib/sentry.test.ts` | 5 | AUTH-126-04 (Plan 03): DSN-unset no-op, captureToSentry tolerates Error + non-Error + missing ctx; JSDoc denylist drift detector locks `route`/`method` keyword presence (Phase 103 PostHog blocked-property carry-forward). |
| `vigil-core/src/middleware/require-verified-email.test.ts` | 7 | AUTH-126-03 (Plan 04): 24h grace matrix (verified / in-grace / post-grace), `/v1/health` + `/v1/auth/` bypass, drift detectors for both bypass literals AND the `INVALID_TOKEN_SUBJECT` extension code (distinct from D-04 `INVALID_CREDENTIALS` which is login-only). |
| `vigil-core/src/__tests__/mount-order.test.ts` | 3 | Source-content asserts against `vigil-core/src/index.ts`: `initSentry()` precedes `new Hono()`; `requireVerifiedEmailWithGrace` mounts AFTER the `bearerAuth(c, next)` dispatcher and BEFORE the first protected `app.route("/v1", summary…)` registration. Until Wave 1+2 land all three indexOf calls return -1; failure message reads naturally. |

### Task 2 — vigil-pwa Wave 0 stubs (commit af533af)

Three `vitest` files. PWA convention: imports use `'react-router'` v7 (single-package namespace).

| Test file | Cases | Targets |
|-----------|-------|---------|
| `vigil-pwa/src/lib/api-error-codes.test.ts` | 6 | AUTH-126-05 (Plan 07): `resolveApiError` mapping for CAPTCHA_FAILED / RATE_LIMITED / REG_NOT_ALLOWED (with ctaLabel + ctaHref present), unknown-code raw-error fallback (forward-compat), empty / null body default fallback, and the 9-key LOCKED enum (CONTEXT D-04) — `AUTH-126-CODE-MAP-LOCKED-ENUM` count is exactly 1 per plan acceptance. |
| `vigil-pwa/src/pages/PrivacyPolicyPage.test.tsx` | 2 | AUTH-126-06 (Plan 10): `MemoryRouter` mount + substring "privacy" (case-insensitive) + heading-present. |
| `vigil-pwa/src/pages/TermsOfServicePage.test.tsx` | 2 | AUTH-126-06 (Plan 10): same shape, substring "terms". |

## Confirmed RED State

### vigil-core (4 files)

```
test at src/lib/turnstile.test.ts:1:1
✖ src/lib/turnstile.test.ts (405.141ms) — 'test failed'
test at src/lib/sentry.test.ts:1:1
✖ src/lib/sentry.test.ts (411.196ms) — 'test failed'
test at src/middleware/require-verified-email.test.ts:1:1
✖ src/middleware/require-verified-email.test.ts (441.214ms) — 'test failed'
test at src/__tests__/mount-order.test.ts:1:1
✖ AUTH-126-MOUNT-SENTRY-BEFORE-HONO ... ✖ AUTH-126-MOUNT-VERIFY-AFTER-BEARER ... ✖ AUTH-126-MOUNT-VERIFY-BEFORE-PROTECTED
```

(mount-order.test.ts fails at the assert site because index.ts indexOf returns -1; the other three fail at the top-level `await import("./<module>.js")` because the production module does not yet exist.)

### vigil-pwa (3 files)

```
FAIL  src/lib/api-error-codes.test.ts — Failed to resolve import "./api-error-codes"
FAIL  src/pages/PrivacyPolicyPage.test.tsx — Failed to resolve import "./PrivacyPolicyPage"
FAIL  src/pages/TermsOfServicePage.test.tsx — Failed to resolve import "./TermsOfServicePage"
Test Files  3 failed (3)
```

## AUTH-126-* Test IDs Registered

**80 total `AUTH-126-*` occurrences across 7 files** (≥ 20 plan-verify minimum).

### vigil-core

- `AUTH-126-TURNSTILE-URL` — siteverify URL drift detector
- `AUTH-126-TURNSTILE-OK` — success path
- `AUTH-126-TURNSTILE-FAIL` — error-codes propagation
- `AUTH-126-TURNSTILE-NETWORK-THROWS` — fail-closed on network failure
- `AUTH-126-TURNSTILE-MISSING-SECRET` — misconfig throws synchronously
- `AUTH-126-SENTRY-NO-DSN-NOOP`
- `AUTH-126-SENTRY-NO-DSN-CAPTURE-NOOP`
- `AUTH-126-SENTRY-WITH-DSN-INIT`
- `AUTH-126-SENTRY-CAPTURE-SHAPE`
- `AUTH-126-SENTRY-PROPNAMES` — JSDoc denylist drift
- `AUTH-126-VERIFY-PASS-VERIFIED`
- `AUTH-126-VERIFY-PASS-IN-GRACE`
- `AUTH-126-VERIFY-GATE-POST-GRACE`
- `AUTH-126-VERIFY-BYPASS-HEALTH`
- `AUTH-126-VERIFY-BYPASS-RESEND`
- `AUTH-126-VERIFY-BYPASS` — drift detector (both `/v1/health` + `/v1/auth/` literals)
- `AUTH-126-VERIFY-TOKEN-SUBJECT-CODE` — `INVALID_TOKEN_SUBJECT` extension code drift detector
- `AUTH-126-MOUNT-SENTRY-BEFORE-HONO`
- `AUTH-126-MOUNT-VERIFY-AFTER-BEARER`
- `AUTH-126-MOUNT-VERIFY-BEFORE-PROTECTED`

### vigil-pwa

- `AUTH-126-CODE-MAP-CAPTCHA`
- `AUTH-126-CODE-MAP-RATE-LIMITED`
- `AUTH-126-CODE-MAP-REG-NOT-ALLOWED`
- `AUTH-126-CODE-MAP-UNKNOWN-FALLS-BACK-RAW`
- `AUTH-126-CODE-MAP-EMPTY-FALLS-BACK-DEFAULT`
- `AUTH-126-CODE-MAP-LOCKED-ENUM` — 9-key D-04 lock
- `AUTH-126-PRIVACY-RENDERS`
- `AUTH-126-PRIVACY-HEADING`
- `AUTH-126-TERMS-RENDERS`
- `AUTH-126-TERMS-HEADING`

## Wave 1 Must Turn These GREEN

The seven test files form the executable acceptance contract for Wave 1:

- **Plan 126-02** must create `vigil-core/src/lib/turnstile.ts` exporting `verifyTurnstileToken` (+ DI seam helpers) that satisfies the 5 turnstile tests.
- **Plan 126-03** must create `vigil-core/src/lib/sentry.ts` exporting `initSentry` + `captureToSentry` and wire `initSentry()` BEFORE `new Hono()` in `src/index.ts`.
- **Plan 126-04** must create `vigil-core/src/middleware/require-verified-email.ts` exporting `requireVerifiedEmailWithGrace` with the bypass list literals + `INVALID_TOKEN_SUBJECT` short-circuit code; mount-order.test.ts gates the position in `index.ts`.
- **Plan 126-07** must create `vigil-pwa/src/lib/api-error-codes.ts` exporting `resolveApiError` + `ERROR_CODE_MAP` containing all 9 LOCKED keys.
- **Plan 126-10** must create `vigil-pwa/src/pages/{PrivacyPolicyPage,TermsOfServicePage}.tsx` rendering the appropriate substring + heading.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed literal `react-router-dom` token from PWA test header comments**

- **Found during:** Task 2 verification
- **Issue:** Plan acceptance command `! grep -q "react-router-dom" src/pages/PrivacyPolicyPage.test.tsx src/pages/TermsOfServicePage.test.tsx` requires zero matches. My initial test-file header comments included the literal token (`"... uses 'react-router' v7 (single-package namespace), NOT 'react-router-dom'"`) as documentation. The grep matched the cautionary comment, blocking the plan-level verify.
- **Fix:** Rewrote the convention comment to omit the literal `react-router-dom` token while preserving the intent: `"vigil-pwa uses 'react-router' v7 (single-package namespace)"`. The actual import statement (`from 'react-router'`) was already correct.
- **Files modified:** `vigil-pwa/src/pages/PrivacyPolicyPage.test.tsx`, `vigil-pwa/src/pages/TermsOfServicePage.test.tsx`
- **Commit:** af533af (folded into Task 2 commit; fix landed before staging)

**2. [Rule 3 - Blocking] Reworded comment-bullet to drop literal `AUTH-126-CODE-MAP-LOCKED-ENUM` from the file-header comment block**

- **Found during:** Task 2 verification
- **Issue:** Plan acceptance criterion requires `grep -c "AUTH-126-CODE-MAP-LOCKED-ENUM" src/lib/api-error-codes.test.ts == 1`. My initial header listed the test ID both in the comment block (documentation) and in the `it()` description, yielding count = 2.
- **Fix:** Rewrote the file-header bullet from `"AUTH-126-CODE-MAP-LOCKED-ENUM: all 9 LOCKED keys present"` to `"locked-enum case: all 9 LOCKED keys present"`. The `it()` description retains the verbatim test ID, so count == 1.
- **Files modified:** `vigil-pwa/src/lib/api-error-codes.test.ts`
- **Commit:** af533af (folded into Task 2 commit; fix landed before staging)

Both deviations are Rule 3 (blocking issue preventing acceptance gate from passing) and reconcile the plan's strict grep contracts with the executor's tendency to over-document. Neither changes test semantics. Zero architectural changes, zero scope creep.

## Authentication Gates

None — Wave 0 ships test files only; no live auth required.

## Known Stubs

None unexpected. The seven test files are *intentionally* RED-by-construction — they fail at module resolution because Wave 1 has not yet created the production modules. This is the plan's stated success criterion (`<success_criteria>` line 259: "Every test file fails RED (production module not yet created) — this is intentional").

## Self-Check: PASSED

**Files** — verified via `[ -f path ]`:

- FOUND: vigil-core/src/lib/turnstile.test.ts
- FOUND: vigil-core/src/lib/sentry.test.ts
- FOUND: vigil-core/src/middleware/require-verified-email.test.ts
- FOUND: vigil-core/src/__tests__/mount-order.test.ts
- FOUND: vigil-pwa/src/lib/api-error-codes.test.ts
- FOUND: vigil-pwa/src/pages/PrivacyPolicyPage.test.tsx
- FOUND: vigil-pwa/src/pages/TermsOfServicePage.test.tsx
- FOUND: .planning/phases/126-wide-release-auth-hardening-rate-limit-auth-register-5-hr-ip/126-01-SUMMARY.md

**Commits** — verified via `git log --all --oneline | grep`:

- FOUND: 481231f — test(126-01): add vigil-core Wave 0 RED scaffolds
- FOUND: af533af — test(126-01): add vigil-pwa Wave 0 RED scaffolds

All success criteria satisfied:
- [x] All seven test files exist
- [x] Every test file fails RED (production module not yet created) — confirmed by `npx tsx --test` + `npx vitest run`
- [x] AUTH-126-* test IDs searchable by grep across the corpus (80 occurrences total)
- [x] No production files modified
- [x] All PWA test imports use `'react-router'` v7 (verified grep contract)
