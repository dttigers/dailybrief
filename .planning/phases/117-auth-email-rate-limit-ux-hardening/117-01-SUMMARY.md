---
phase: 117-auth-email-rate-limit-ux-hardening
plan: 01
subsystem: vigil-core/auth
tags: [auth, rate-limit, server, security]
dependency-graph:
  requires:
    - vigil-core/src/routes/verify-email.ts (Phase 113)
    - vigil-core/src/routes/reset-password.ts (Phase 112)
    - vigil-core/src/routes/resend-verification.ts (Phase 113)
    - vigil-core/src/routes/forgot-password.ts (Phase 112)
  provides:
    - "verify-email per-IP cap raised 5 → 20 (AUTH-13 D-03)"
    - "reset-password per-IP cap raised 5 → 20 (AUTH-13 D-03)"
    - "resend-verification per-userId cap raised 3 → 5 (AUTH-13 D-04)"
    - "forgot-password per-IP cap raised 5 → 20, per-email UNCHANGED at 5 (AUTH-13 D-05)"
    - "8 new drift-detector + first-N-OK + enum-safety tests across 4 routes"
  affects:
    - "Phase 117 SC#2 (legitimate retry patterns no longer trip rate-limit)"
    - "Phase 117 SC#3 (enumeration safety on forgot-password preserved)"
    - "Downstream Phase 117 plans (PWA 429 bucket UX) — server response shape unchanged"
tech-stack:
  added: []
  patterns:
    - "Drift-detector tests via fs.readFileSync + regex match against source constant declaration"
    - "Per-axis rate-limit caps via takeSlot(map, key, now, max) signature change"
key-files:
  created: []
  modified:
    - vigil-core/src/routes/verify-email.ts
    - vigil-core/src/routes/verify-email.test.ts
    - vigil-core/src/routes/reset-password.ts
    - vigil-core/src/routes/reset-password.test.ts
    - vigil-core/src/routes/resend-verification.ts
    - vigil-core/src/routes/resend-verification.test.ts
    - vigil-core/src/routes/forgot-password.ts
    - vigil-core/src/routes/forgot-password.test.ts
decisions:
  - "Phase 117-01: split forgot-password's single RATE_LIMIT_MAX into RATE_LIMIT_MAX_IP (20) + RATE_LIMIT_MAX_EMAIL (5) — required because the existing takeSlot helper is shared across both axes; chose per-call max parameter over duplicating the helper to keep the sliding-window invariant single-sourced"
  - "Phase 117-01: drift-detector test pattern (fs.readFileSync + regex match) preferred over runtime-introspection (e.g., importing the constant) — runtime constants can be transformed by minifiers/bundlers, but the source file is the single source of truth for policy review"
  - "Phase 117-01: Test 7 (forgot-password per-email cap) loop bound left at 6 verbatim — only doc-update applied. Locks the per-email cap at 5 via the existing assertion sendSpy.callCount() <= 5. Phase 117 D-05 enum-safety guard."
metrics:
  duration: "~6 minutes"
  completed: "2026-04-30"
  tasks: 4
  files-modified: 8
  commits: 4
---

# Phase 117 Plan 01: Auth-email rate-limit cap raises (server-side) Summary

Raised per-route rate-limit caps on the 4 auth-email endpoints per CONTEXT.md D-03/D-04/D-05 so legitimate household-NAT retry patterns (~4 users × 5 retries/hr ≈ 20) no longer trip 429, while preserving brute-force protection (20/hr per-IP still hard-blocks 100/min abuse) and forgot-password's enum-safety contract (per-email cap unchanged at 5, response body string unchanged).

## What Shipped

### New cap constants per route

| Route                  | Old             | New                                     | Rationale                                                                                  |
| ---------------------- | --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `verify-email`         | per-IP `5`      | per-IP `20`                             | D-03 — 256-bit token entropy makes brute-force infeasible regardless; cap is belt-and-suspenders |
| `reset-password`       | per-IP `5`      | per-IP `20`                             | D-03 — mirrors verify-email cap policy verbatim (same threat profile)                       |
| `resend-verification`  | per-userId `3`  | per-userId `5`                          | D-04 — per-userId axis (bearer-known); 5/hr accommodates spam-folder retry flow              |
| `forgot-password`      | single `5` (both axes) | per-IP `20` + per-email `5`     | D-05 — per-email STAYS at 5 (enum-safety guard); per-IP raised. takeSlot signature widened. |

### Test count delta per file

| File                                      | Existing | New | Total |
| ----------------------------------------- | -------- | --- | ----- |
| `verify-email.test.ts`                    | 11       | 2   | 13    |
| `reset-password.test.ts`                  | 12       | 2   | 14    |
| `resend-verification.test.ts`             | 8        | 2   | 10    |
| `forgot-password.test.ts`                 | 10       | 3   | 13    |
| **Total**                                 | **41**   | **9** | **50** |

New tests:
- 4 drift-detector tests (one per route) — read source via `fs.readFileSync` and regex-match the cap constant declaration. Locks cap value against accidental future drift.
- 4 first-N-OK tests — assert that the first N requests from a fresh IP/userId all return non-429.
- 1 forgot-password-specific enum-safety preservation test — asserts the 21st call from the same IP STILL returns 200 enum-safe (not 429), pinning Phase 117 SC#3.

### Forgot-password takeSlot signature change

```typescript
// Before:
function takeSlot(map: Map<string, number[]>, key: string, now: number): boolean {
  ...
  if (arr.length >= RATE_LIMIT_MAX) { ... }  // single hardcoded cap
}

// After (Phase 117 D-05):
function takeSlot(map: Map<string, number[]>, key: string, now: number, max: number): boolean {
  ...
  if (arr.length >= max) { ... }             // per-call cap
}

// Call sites:
const ipOk = takeSlot(ipBuckets, ip, now, RATE_LIMIT_MAX_IP);          // 20
const emailOk = email ? takeSlot(emailBuckets, email, now, RATE_LIMIT_MAX_EMAIL) : true;  // 5
```

### Forgot-password response body string — UNCHANGED (D-05 / SC#3)

The 200 enum-safe response body literal `"If your account exists, a reset link has been sent."` is byte-for-byte unchanged. Verified by:
- `grep -c '"If your account exists, a reset link has been sent."' vigil-core/src/routes/forgot-password.ts` returns 1
- New `AUTH-13-FP-ENUM-SAFE-PRESERVED` test asserts the 21st POST from a single IP returns 200 with this exact body (NOT 429). Triple-redundant defense:
  1. Per-email cap at 5 catches enum-probing attempts on a single address
  2. Per-IP cap at 20 catches enum-probing distributed across emails from one IP
  3. Both axes resolve to the same 200-enum-safe response — rate-limit never surfaces as a distinct status code

## Note for downstream Phase 117 plans (PWA 429 bucket UX)

Server endpoints are unchanged in 429-response-shape:
- `verify-email`, `reset-password`, `resend-verification` still return `{error: "Too many requests"}` with `Retry-After` header on 429
- `forgot-password` still returns 200 enum-safe (no 429 ever surfaces) — PWA forgot-password flow does NOT need a 429 bucket per CONTEXT D-01/D-02

## Per-task summary

| Task | Name                                                       | Commit    | Files                                                                                                  |
| ---- | ---------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| 1    | Raise verify-email cap to 20                               | `1cf291e` | `vigil-core/src/routes/verify-email.ts`, `vigil-core/src/routes/verify-email.test.ts`                  |
| 2    | Raise reset-password cap to 20                             | `d6175eb` | `vigil-core/src/routes/reset-password.ts`, `vigil-core/src/routes/reset-password.test.ts`              |
| 3    | Raise resend-verification cap to 5                         | `8e05061` | `vigil-core/src/routes/resend-verification.ts`, `vigil-core/src/routes/resend-verification.test.ts`    |
| 4    | Split forgot-password caps (per-IP=20, per-email=5)        | `a9672d5` | `vigil-core/src/routes/forgot-password.ts`, `vigil-core/src/routes/forgot-password.test.ts`            |

## Verification Results

- `cd vigil-core && npx tsx --test src/routes/verify-email.test.ts src/routes/reset-password.test.ts src/routes/resend-verification.test.ts src/routes/forgot-password.test.ts`: **50 tests, 26 pass, 24 skipped (DB-required), 0 fail**
- `cd vigil-core && npx tsc --noEmit`: exits 0
- All 11 acceptance criteria across the 4 tasks verified via grep

## Deviations from Plan

None — plan executed exactly as written. TDD RED → GREEN cycle followed for all 4 tasks. No deviation rules triggered (no Rule 1/2/3/4 fixes needed).

## Decisions Made

1. **Drift-detector strategy: fs.readFileSync + regex over runtime introspection** — Source-level matching catches drift before bundling/minification could obscure it; matches the threat model (T-117-01-01: "cap value drifts in source code").
2. **Forgot-password takeSlot per-call max parameter (vs duplicate helper)** — Single source of truth for sliding-window logic; one-line signature change cleaner than two near-identical helpers.
3. **Test 7 (forgot-password per-email cap) loop bound stays at 6** — The test's `<= 5` assertion combined with the new `RATE_LIMIT_MAX_EMAIL = 5` constant pins per-email at 5. Doc-only update preserves the existing behavioral assertion.

## Known Stubs

None.

## Self-Check: PASSED

Verified all created/modified files exist, all 4 task commits exist in git log:
- `1cf291e` (Task 1) — feat(117-01): raise verify-email rate-limit cap 5 → 20
- `d6175eb` (Task 2) — feat(117-01): raise reset-password rate-limit cap 5 → 20
- `8e05061` (Task 3) — feat(117-01): raise resend-verification rate-limit cap 3 → 5
- `a9672d5` (Task 4) — feat(117-01): split forgot-password caps per-IP=20 / per-email=5

All 8 files modified, all expected. No missing items.
