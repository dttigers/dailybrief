---
phase: 126
plan: 04
subsystem: vigil-core/middleware
tags: [auth, email-verification, middleware, hono, grace-window, AUTH-126-03, D-02, D-04, INVALID_TOKEN_SUBJECT]
requires:
  - "vigil-core/src/middleware/auth.ts (bearerAuth runs before this — sets c.set('userId'))"
  - "vigil-core/src/db/schema.ts users.emailVerifiedAt (Phase 113 migration 0017) + users.createdAt"
  - "vigil-core/src/db/connection.ts db singleton"
provides:
  - "requireVerifiedEmailWithGrace MiddlewareHandler (Hono) — Plan 06 will mount in index.ts"
  - "__setUserLookupForTest / __resetUserLookupForTest DI seam — mirror of auth.ts:32 pattern"
  - "INVALID_TOKEN_SUBJECT extension code (D-04 additivity) — Plan 07 will map in PWA ERROR_CODE_MAP"
affects:
  - "/v1/* surface gating once Plan 06 mounts the middleware between bearerAuth dispatcher and metricsMiddleware"
tech-stack:
  patterns:
    - "Hono MiddlewareHandler with DB-read + decision (mirror auth.ts:115-145)"
    - "Module-scope let + __setXForTest DI seam (mirror auth.ts:32 sendEmailVerificationEmailFn)"
    - "Drift-detector source-content literals locked: /v1/health, /v1/auth/, INVALID_TOKEN_SUBJECT, GRACE_WINDOW_MS"
key-files:
  created:
    - "vigil-core/src/middleware/require-verified-email.ts (213 lines)"
  modified:
    - "vigil-core/src/middleware/require-verified-email.test.ts (DI seam import + buildApp injection + cleanup reset)"
decisions:
  - "DI seam __setUserLookupForTest added — Wave 0 test as-shipped expected user data injection via buildApp(injectedUser) but had no path to the middleware's DB read; seam mirrors auth.ts:32 pattern (Rule 3 reconciliation, no architectural change)"
  - "JSDoc rewording to avoid the password-change-column token verbatim — R5 lock treats any reference (incl. comments) as forbidden, mirrors Phase 126 Plan 01 comment-vs-grep reconciliation precedent"
  - "Bypass list uses exact-match for /v1/health (T-126-04-05 prevents /v1/health/admin path-crafting) and startsWith for /v1/auth/ (prefix owned by auth.ts route mounts)"
  - "INVALID_TOKEN_SUBJECT (extension) NOT INVALID_CREDENTIALS (locked, login-only) for the defensive !user branch — conflating would surface 'Invalid email or password' to a structurally-broken-session user (T-126-04-07 mitigation)"
metrics:
  duration: "~3min"
  tasks_completed: 1
  files_created: 1
  files_modified: 1
  date: 2026-05-11
---

# Phase 126 Plan 04: require-verified-email middleware Summary

24h grace email-verification middleware with createdAt-anchored window, structured 403 EMAIL_NOT_VERIFIED body, and new INVALID_TOKEN_SUBJECT extension code for the defensive token-subject-not-found branch.

## What Shipped

**Single Hono `MiddlewareHandler`** (`requireVerifiedEmailWithGrace`) at `vigil-core/src/middleware/require-verified-email.ts` (213 lines) implementing the D-02 soft-to-strict transition:

| Path | Behavior |
|------|----------|
| `/v1/health` (exact) | Bypass — next() unconditionally |
| `/v1/auth/*` (prefix) | Bypass — next() unconditionally (so users can reach `/v1/auth/resend-verification` from the 403 state) |
| Verified user (`emailVerifiedAt !== null`) | next() regardless of `createdAt` age |
| Unverified user, `now < createdAt + 24h` | next() (within grace) |
| Unverified user, `now >= createdAt + 24h` | 403 `{error, code: "EMAIL_NOT_VERIFIED", verified_after_iso}` |
| User row missing (defensive) | 401 `{error, code: "INVALID_TOKEN_SUBJECT"}` (D-04 extension) |
| `!db` | 503 `{error, code: "SERVER_NOT_CONFIGURED"}` |

## Verification Results

| Gate | Expected | Got | Status |
|------|----------|-----|--------|
| `npx tsx --test src/middleware/require-verified-email.test.ts` | 0 fails | 8/8 PASS | GREEN |
| `grep -c 'GRACE_WINDOW_MS'` | ≥2 | 2 | OK |
| `grep -c '"/v1/health"'` | ≥1 | 2 | OK |
| `grep -c '"/v1/auth/"'` | ≥1 | 2 | OK |
| `! grep 'passwordChangedAt'` (R5 lock) | 0 | 0 | r5_ok |
| `grep -c '"INVALID_TOKEN_SUBJECT"'` | 1 | 1 | OK |
| `! grep '"INVALID_CREDENTIALS"'` (D-04 lock) | 0 | 0 | d04_ok |
| `grep -c '"EMAIL_NOT_VERIFIED"'` | 1 | 1 | OK |
| `npx tsc --noEmit` | 0 errors | 0 errors | OK |

### Wave 0 test transition

8/8 GREEN (4 behavior + 2 bypass + 2 drift-detector + 1 cleanup):

```
✔ AUTH-126-VERIFY-PASS-VERIFIED         verified user → 200
✔ AUTH-126-VERIFY-PASS-IN-GRACE         5min-ago unverified → 200
✔ AUTH-126-VERIFY-GATE-POST-GRACE       25h-ago unverified → 403 EMAIL_NOT_VERIFIED + verified_after_iso
✔ AUTH-126-VERIFY-BYPASS-HEALTH         /v1/health bypass
✔ AUTH-126-VERIFY-BYPASS-RESEND         /v1/auth/resend-verification bypass
✔ AUTH-126-VERIFY-BYPASS                drift: /v1/health AND /v1/auth/ source literals
✔ cleanup: restore real DB lookup
✔ AUTH-126-VERIFY-TOKEN-SUBJECT-CODE    drift: INVALID_TOKEN_SUBJECT source literal
```

## Confirmed Invariants

- **Anchor: `createdAt` (NOT the password-change column) per R5.** The grace window uses `users.createdAt.getTime() + GRACE_WINDOW_MS`. The R5 drift detector forbids any reference to the password-change column literal in this file — the JSDoc references it only as "Phase 110 AUTH-09 password-change timestamp" / "the password-change column" / etc., never the verbatim symbol.
- **D-04 enum extension: `INVALID_TOKEN_SUBJECT` added** (NEW extension code per D-04 additivity). The locked enum (`CAPTCHA_FAILED`, `RATE_LIMITED`, `REG_NOT_ALLOWED`, `INVALID_EMAIL_FORMAT`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `EMAIL_TAKEN`, `EMAIL_NOT_VERIFIED`, `INVALID_CREDENTIALS`) is preserved unchanged; `INVALID_TOKEN_SUBJECT` extends it. `INVALID_CREDENTIALS` is forbidden in this file (login-only reservation).
- **No `/v1/agent-stream` bypass** — vigil-watch is operator-only, the operator's account is verified-from-day-zero (Phase 113 backfill), and any future divergence surfaces the same EMAIL_NOT_VERIFIED 403 the PWA sees. Documented in module-header JSDoc.
- **Mount-order anchor preserved for Plan 06** — module-header JSDoc states: bearerAuth dispatcher → requireVerifiedEmailWithGrace → metricsMiddleware → protected /v1/* route mounts. `c.get("userId")` consumed as `number` per the bearerAuth-runs-first contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `__setUserLookupForTest` / `__resetUserLookupForTest` DI seam to middleware + import to test file**

- **Found during:** Task 1 verification (Wave 0 test run after first write)
- **Issue:** The Wave 0 test file (`require-verified-email.test.ts`) was shipped with a `buildApp(injectedUser)` factory whose only injection was `c.set("userId", injectedUser.id)`. The test did NOT instantiate a real `db`, did NOT stub `db`, and did NOT call any `__setXForTest` function — meaning the middleware's `!db` short-circuit returned 503 instead of the expected 200/403. The test cannot reach GREEN without a way to inject the user lookup.
- **Fix:** Added a module-scope DI seam to the middleware mirroring the auth.ts:32 `sendEmailVerificationEmailFn` pattern verbatim — `userLookupFn` defaults to `realLookupUserById` (the production drizzle SELECT), and tests reassign it via `__setUserLookupForTest`. The test's `buildApp` now calls the setter at the top of every build to install an in-memory fake keyed on `injectedUser`. A final `cleanup: restore real DB lookup` `it()` block calls `__resetUserLookupForTest()` so suite ordering doesn't leak the fake into other test files.
- **Files modified:** `vigil-core/src/middleware/require-verified-email.ts`, `vigil-core/src/middleware/require-verified-email.test.ts`
- **Commit:** `faa6847`
- **Rationale:** This is a pure structural reconciliation. The seam mirrors an existing in-tree pattern (auth.ts:32), keeps the production code path unchanged (the default `userLookupFn` calls the real drizzle SELECT), and reaches the Wave 0 RED→GREEN transition the plan explicitly requires. Zero architectural change; the user-lookup function shape (`(userId) => Promise<VerifyEmailUserRow | null | "db-unavailable">`) is intentional — it lets the seam represent both the "db unavailable" and "row not found" branches the middleware needs to distinguish.

**2. [Rule 3 - Blocking] JSDoc reworded to avoid the password-change-column literal token**

- **Found during:** Task 1 verification (R5 grep check failed after first write)
- **Issue:** Initial JSDoc explained "anchor at createdAt, NOT passwordChangedAt" using the verbatim token three times. The R5 drift detector (`! grep -q 'passwordChangedAt' src/middleware/require-verified-email.ts && echo "r5_ok"`) treats any reference (including comments) as a violation.
- **Fix:** Reworded JSDoc to convey the same semantic ("never at the Phase 110 AUTH-09 password-change timestamp", "the password-change column token") without using the verbatim symbol. R5 lock now reads `r5_ok`. Mirrors Phase 126 Plan 01 comment-vs-grep reconciliation precedent (executor decisions log).
- **Files modified:** `vigil-core/src/middleware/require-verified-email.ts`
- **Commit:** `faa6847`

No architectural changes. No scope creep. Zero out-of-scope work.

## Authentication Gates

None — this plan creates a middleware that itself is part of the auth chain. No external auth required during execution.

## Anchor

> Plan 06 mounts `app.use("/v1/*", requireVerifiedEmailWithGrace)` in `vigil-core/src/index.ts` between the bearerAuth dispatcher (lines 159-168) and `metricsMiddleware` (line 181). Plan 07 maps `INVALID_TOKEN_SUBJECT` in the PWA `ERROR_CODE_MAP` at `vigil-pwa/src/lib/api-error-codes.ts` with copy "Session expired — please sign in again." + CTA to `/auth`.

## Self-Check: PASSED

- `vigil-core/src/middleware/require-verified-email.ts` — FOUND (213 lines)
- `vigil-core/src/middleware/require-verified-email.test.ts` — FOUND (modified)
- Commit `faa6847` — verified in `git log --oneline -2`
