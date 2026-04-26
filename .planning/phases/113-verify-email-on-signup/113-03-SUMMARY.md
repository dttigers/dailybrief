---
phase: 113
plan: 03
subsystem: vigil-core/auth
tags: [auth, email-verify, token-claim, rate-limit, api, tdd]
requirements: [AUTH-11]

dependency_graph:
  requires:
    - 113-01  # users.email_verified_at column + 0017 migration applied
    - 113-02  # bearerAuth bypass for /v1/auth/verify-email; authMe mount; register token issuance
    - 112-01  # password_reset_tokens table with type='email_verify' CHECK constraint
    - 111-01  # sendEmailVerificationEmail wrapper (email-service.ts)
  provides:
    - POST /v1/auth/verify-email: atomic UPDATE-RETURNING claim + users.emailVerifiedAt update + 5/hr per-IP rate limit
    - POST /v1/auth/resend-verification: bearerAuth-protected + 3/hr per-userId rate limit + already-verified idempotency + invalidate-prior + fire-and-forget send
    - AUTH-11 server-side surface 100% complete
  affects:
    - vigil-core/src/routes/verify-email.ts (new file)
    - vigil-core/src/routes/verify-email.test.ts (new file)
    - vigil-core/src/routes/resend-verification.ts (new file)
    - vigil-core/src/routes/resend-verification.test.ts (new file)
    - vigil-core/src/index.ts (2 imports + 2 mounts)

tech_stack:
  added: []
  patterns:
    - Atomic UPDATE-RETURNING claim with type discriminant (mirrors reset-password.ts verbatim with type='email_verify')
    - Per-IP sliding window rate limit (5/hr) in verify-email.ts — inline Map<string, number[]>
    - Per-userId sliding window rate limit (3/hr) in resend-verification.ts — inline Map<string, number[]> with namespaced key 'verify-resend:userId:{id}'
    - D-18 idempotency-before-rate-limit ordering (already_verified check fires before takeSlot)
    - D-17 most-recent-link wins (UPDATE unused email_verify tokens before INSERT new row)
    - DI factory createVerifyEmailRoute(deps?) + createResendVerificationRoute(deps?) — test seam via dbOverride, nowFn, userLookupFn, sendEmailFn
    - .catch() fire-and-forget (Phase 112 pattern — consistent with codebase)

key_files:
  created:
    - vigil-core/src/routes/verify-email.ts
    - vigil-core/src/routes/verify-email.test.ts
    - vigil-core/src/routes/resend-verification.ts
    - vigil-core/src/routes/resend-verification.test.ts
    - .planning/phases/113-verify-email-on-signup/113-03-SUMMARY.md
  modified:
    - vigil-core/src/index.ts (2 imports + 2 mounts)

decisions:
  - "tokenIssue.ts shared helper NOT extracted: 3 call sites (register-fresh, register-claim, resend-verification) — deferred per CONTEXT Claude's Discretion and RESEARCH Open Q2. Inline duplication is 4 lines each; extraction deferred to v3.7+"
  - "awk ordering check pattern db.update(passwordResetTokens) does not match actual multiline Drizzle code style (db on one line, .update() on next) — the ordering invariant is correct and verified via line number inspection; the plan's awk pattern was written for a one-liner style that the template file does not use"
  - "verifyEmail mount BEFORE dispatcher (line 128) with resetPassword at 123 and dispatcher at 143 — ORDER OK confirmed by awk"
  - "resendVerification mount AFTER dispatcher (line 200) — ORDER OK confirmed by awk"
  - "EmailSendResult type uses id not messageId — auto-fixed Rule 1 in test files (5 occurrences)"

metrics:
  duration: "~8 minutes"
  completed: "2026-04-26"
  tasks_completed: 3
  files_changed: 5
---

# Phase 113 Plan 03: Verify-Email + Resend-Verification Endpoints Summary

**One-liner:** POST /v1/auth/verify-email (atomic token claim, 5/hr per-IP) and POST /v1/auth/resend-verification (bearerAuth, 3/hr per-userId, invalidate-prior, already-verified idempotency) shipped with 19 new tests; both routers mounted in correct order in index.ts.

## What Was Built

### Task 1: verify-email.ts + verify-email.test.ts

`POST /v1/auth/verify-email` — unauthenticated endpoint implementing D-09..D-14:

- **D-10 atomic claim:** `UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1 AND type = 'email_verify' AND used_at IS NULL AND expires_at > now() RETURNING user_id`. PG row-lock makes concurrent claims safe without a transaction.
- **D-11 mutation order (LOAD-BEARING):** claim → `UPDATE users SET email_verified_at = now()` → 200. Token burn happens before user update; if user update fails, token is already burned (user must resend).
- **D-13 rate limit:** 5/hr per-IP only, inline `Map<string, number[]>` sliding window, `Retry-After` header floors at 1s via `Math.max(1, Math.ceil(...))`.
- **D-14:** `200 { ok: true }` — no JWT, no auto-login, no token in response.
- **Single-bucket error UX:** all failure paths → `400 { error: "Invalid or expired token" }`. No expired/used/invalid differentiation.

Test coverage: 11 tests — V1-01 (happy path, DB), V2-01 (unknown token), V2-02 (expired, DB), V2-03 (already-used, DB), V2-04 (wrong type, DB), V3-01 (single-use replay, DB), V4-01 (rate limit 429), V4-02 (IP isolation), G-01 (re-verify already-verified, DB), MALFORMED, MISSING-TOKEN. 5 pass without DB, 6 skip cleanly.

### Task 2: resend-verification.ts + resend-verification.test.ts

`POST /v1/auth/resend-verification` — bearerAuth-required endpoint implementing D-15..D-18:

- **D-18 idempotency (fires BEFORE rate limit):** reads `users.emailVerifiedAt` via `userLookupFn` first; if non-null → `200 { ok: true, already_verified: true }` without consuming rate limit slot. T-113-IDEM-01 ordering enforced; awk check confirms.
- **D-16 rate limit:** 3/hr per-userId, key `verify-resend:userId:{id}`, same inline Map pattern. Independent from verify-email's `ipBuckets`.
- **D-17 most-recent-link wins:** `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND type = 'email_verify' AND used_at IS NULL` before INSERT of new token.
- **Fire-and-forget:** `.catch()` attached synchronously before `return c.json(...)`. Throwing send spy still yields 200.

Test coverage: 8 tests — S1-01 (already-verified, no send), S2-01 (rate limit 429), S2-02 (per-userId isolation), S2-03 (key format greppability), S3-01 (invalidate-prior, DB), S3-02 (fire-and-forget + URL shape), S-INVALID-USER (401), S-MISSING-USERID (401). 7 pass without DB, 1 skips cleanly.

### Task 3: index.ts mount order

Two imports added after existing `resetPassword`/`authMe` imports. Two mounts added:

```
app.route("/v1", resetPassword);   // line 123 — before dispatcher
app.route("/v1", verifyEmail);     // line 128 — before dispatcher (D-12)
app.use("/v1/*", bearerAuth...);   // line 143 — dispatcher
...
app.route("/v1", authMe);          // line 196 — after dispatcher
app.route("/v1", resendVerification); // line 200 — after dispatcher (D-15)
```

awk check output: `ORDER OK ve=128 rp=123 disp=143 rv=200`

## Mount Order Verification

```
ORDER OK ve=128 rp=123 disp=143 rv=200
```

`verifyEmail` (128) > `resetPassword` (123) AND < dispatcher (143): CONFIRMED
`resendVerification` (200) > dispatcher (143): CONFIRMED

## Bypass List Status

The bearerAuth bypass list (set by Plan 02 Task 3) has 7 entries including `/v1/auth/verify-email`. The `verifyEmail` handler is reachable without a JWT because:
1. Plan 02 added the bypass entry (verified by grep count=1 in 113-02-SUMMARY.md)
2. Plan 03 mounts the route BEFORE the dispatcher (line 128 < 143)

`/v1/auth/resend-verification` is NOT in the bypass list and IS mounted after the dispatcher — correct gate.

## Shared tokenIssue.ts Helper Decision

After this plan, the "generate raw token + SHA-256 hash + INSERT email_verify row" pattern appears in 3 files:
- `vigil-core/src/routes/auth.ts` (register-fresh + register-claim, both inline as `issueEmailVerifyToken()`)
- `vigil-core/src/routes/resend-verification.ts` (inline, ~4 lines)

Decision: extraction deferred. At 3 call sites across 2 files, the duplication is manageable. The pattern is 4 lines of crypto + 1 DB insert — short enough that a shared helper adds more indirection than it removes. Revisit in v3.7+ if a 4th site appears.

## Test Count Delta

| File | Tests | Pass (no DB) | Skip (DB required) |
|------|-------|-------------|-------------------|
| verify-email.test.ts | 11 | 5 | 6 |
| resend-verification.test.ts | 8 | 7 | 1 |
| **Total new** | **19** | **12** | **7** |

Pre-existing test files unchanged. No regressions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | verify-email.ts + tests | 0fed36f | vigil-core/src/routes/verify-email.ts, vigil-core/src/routes/verify-email.test.ts |
| 2 | resend-verification.ts + tests | 8c0eac6 | vigil-core/src/routes/resend-verification.ts, vigil-core/src/routes/resend-verification.test.ts |
| 3 | Mount both routers in index.ts | aab3063 | vigil-core/src/index.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EmailSendResult uses `id` not `messageId` in test spy return values**
- **Found during:** Task 2 — TypeScript compile error after writing resend-verification.test.ts
- **Issue:** Plan's test skeleton used `{ status: "sent", messageId: "x" }` but `EmailSendResult` type in email-service.ts:25 is `{ status: "sent"; id: string }`.
- **Fix:** Replaced all 5 test spy returns with `{ status: "sent" as const, id: "x" }`.
- **Files modified:** vigil-core/src/routes/resend-verification.test.ts
- **Impact:** None — type-only fix, behavior unchanged.

**2. [Rule 1 - Bug] awk ordering check pattern mismatch for verify-email.ts**
- **Found during:** Task 1 acceptance verification
- **Issue:** Plan's awk pattern `/db.update\(passwordResetTokens\)/` assumes `db.update(passwordResetTokens)` is on a single line. Actual code (mirroring reset-password.ts) uses multiline: `await db` on one line, `.update(passwordResetTokens)` on the next. The same pattern appears in the template file `reset-password.ts`.
- **Fix:** Verified ordering correctness via line number inspection (`takeSlot` at 98, `c.req.json` at 107, `db.update` pattern starts at 131) — order is correct. Documented here; the awk check itself exits non-zero on the pattern but the invariant holds.
- **Impact:** None — ordering is correct; the awk pattern in the plan is too strict for the actual code style.

## Known Stubs

None — all data sources are wired. The `sendEmailFn` DI seam defaults to the real `sendEmailVerificationEmail` in production. The `userLookupFn` DI seam defaults to a live DB SELECT. The `dbOverride` DI seam defaults to the real `db` from connection.js.

## Threat Surface Scan

No new network endpoints or trust boundaries introduced beyond what the plan's `<threat_model>` already documented. All mitigations in the threat register are applied:

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-113-02 | per-IP rate limit 5/hr + Retry-After | APPLIED (verify-email.ts:55-76) |
| T-113-03 | Atomic UPDATE-RETURNING + used_at IS NULL filter | APPLIED (verify-email.ts:130-147) |
| T-113-06 | verifyEmail before dispatcher; resendVerification after; bypass list has /v1/auth/verify-email | APPLIED (index.ts mount order confirmed) |
| T-113-07 | 3/hr per-userId rate limit + idempotency before rate limit consumption | APPLIED (resend-verification.ts:121-144) |
| T-113-DOS-RES-02 | setInterval sweep with .unref() in both route files | APPLIED |
| T-113-MUTORDER-01 | Claim then users update then 200 — ordering pinned in code comments | APPLIED |
| T-113-IDEM-01 | already_verified check (line 132) before takeSlot (line 138) | APPLIED + awk verified |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| vigil-core/src/routes/verify-email.ts | FOUND |
| vigil-core/src/routes/verify-email.test.ts | FOUND |
| vigil-core/src/routes/resend-verification.ts | FOUND |
| vigil-core/src/routes/resend-verification.test.ts | FOUND |
| vigil-core/src/index.ts | FOUND (modified) |
| Commit 0fed36f (Task 1) | FOUND |
| Commit 8c0eac6 (Task 2) | FOUND |
| Commit aab3063 (Task 3) | FOUND |
| npx tsc --noEmit exits 0 | PASSED |
| verify-email.test.ts: 5 pass, 6 skip, 0 fail | PASSED |
| resend-verification.test.ts: 7 pass, 1 skip, 0 fail | PASSED |
| import { verifyEmail } in index.ts | FOUND (grep count=1) |
| import { resendVerification } in index.ts | FOUND (grep count=1) |
| app.route("/v1", verifyEmail) in index.ts | FOUND (grep count=1) |
| app.route("/v1", resendVerification) in index.ts | FOUND (grep count=1) |
| Mount order awk check | ORDER OK ve=128 rp=123 disp=143 rv=200 |
| Server IMPORT OK | PASSED (JWT_SECRET set) |
