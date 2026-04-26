---
phase: 113
plan: 02
subsystem: vigil-core/auth
tags: [auth, email-verify, token-issuance, api, tdd]
requirements: [AUTH-11]

dependency_graph:
  requires:
    - 113-01  # users.email_verified_at column must exist (schema + migration applied)
    - 112-01  # password_reset_tokens table with type='email_verify' CHECK constraint
    - 111-01  # sendEmailVerificationEmail wrapper (email-service.ts)
    - 110-02  # bearerAuth iat gate (middleware/auth.ts) — unchanged, resend+/me auto-protected
  provides:
    - register handler: email_verify token row + fire-and-forget sendEmailVerificationEmail (D-06/D-07/D-08)
    - login response: emailVerifiedAt as ISO string or null (D-26, additive)
    - GET /v1/auth/me: { id: number, email, emailVerifiedAt } (D-27, bearerAuth-protected)
    - bearerAuth bypass: /v1/auth/verify-email publicly reachable (D-12) — Plan 03 handler slot ready
  affects:
    - vigil-core/src/routes/auth.ts (register + login extended)
    - vigil-core/src/routes/auth-me.ts (new file — GET /v1/auth/me)
    - vigil-core/src/index.ts (1 bypass line + 1 import + 1 mount)
    - vigil-pwa (Plan 04 reads /v1/auth/me + login emailVerifiedAt for banner)

tech_stack:
  added: []
  patterns:
    - DI factory pattern (createAuthMeRouter + injected userLookupFn)
    - Module-scope DI seam (__setSendEmailVerificationEmailForTest) for fire-and-forget spy testing
    - .catch() fire-and-forget (Phase 112 pattern — NOT queueMicrotask, consistent with codebase)
    - issueEmailVerifyToken() helper: randomBytes(32) base64url + SHA-256 hex + INSERT email_verify row
    - Defensive userId guard (Number.isInteger + > 0) in /auth/me (mirrors me.ts:77)

key_files:
  created:
    - vigil-core/src/routes/auth-me.ts
    - vigil-core/src/routes/auth-me.test.ts
    - .planning/phases/113-verify-email-on-signup/113-02-SUMMARY.md
  modified:
    - vigil-core/src/routes/auth.ts (token issuance + DI seam + login emailVerifiedAt)
    - vigil-core/src/routes/auth.test.ts (8 new AUTH-11 tests)
    - vigil-core/src/index.ts (1 import, 1 bypass, 1 mount)

decisions:
  - "issueEmailVerifyToken() kept inline in auth.ts (not extracted to shared tokenIssue.ts): only 2 call sites in this plan (fresh-register + claim-flow); extraction deferred until Plan 03 adds a 3rd site in resend-verification — matches CONTEXT Claude's Discretion and RESEARCH Open Q2 resolution"
  - ".catch() fire-and-forget used (not queueMicrotask): consistent with Phase 112 forgot-password.ts:221-223; both are semantically equivalent for fire-and-forget; RESEARCH Open Q1 confirmed this choice"
  - "auth-me.ts created as separate file (not extending me.ts): RESEARCH Pitfall 2 — me.ts returns { userId: string, email } consumed by App.tsx PostHog identify; auth-me.ts returns { id: number, email, emailVerifiedAt }; incompatible shapes at incompatible paths"
  - "Bypass list now has 7 entries (health, google/callback, register, login, forgot-password, reset-password, verify-email) — confirmed by grep"
  - "emailVerifiedAt ?? undefined pattern used in login test seedLoginTestUser to handle null vs undefined for Drizzle insert values"

metrics:
  duration: "~7 minutes"
  completed: "2026-04-26"
  tasks_completed: 3
  files_changed: 5
---

# Phase 113 Plan 02: Server-Side Email Verification Surface Summary

**One-liner:** Register handler issues SHA-256-hashed email_verify token + .catch() fire-and-forget email; login response adds emailVerifiedAt; new GET /v1/auth/me returns 3-field minimal shape; bearerAuth bypass list extended for Plan 03's verify-email handler slot.

## What Was Built

Three touch sites wired, all tested:

1. **Register handler (auth.ts):** Both fresh-register and claim-flow branches now issue an `email_verify` token row in `password_reset_tokens` before returning 201. The claim-flow has the D-07 null-guard: `existing.emailVerifiedAt === null` skips the token + send for already-verified seed users (post-0017-backfill). Fire-and-forget uses `.catch()` (Phase 112 pattern) so Resend network latency never blocks the 201 response.

2. **Login response (auth.ts):** `emailVerifiedAt` added as ISO string or null to the user object — additive, backwards-compatible. PWA Plan 04 reads this on login to render the Settings banner without a second round-trip.

3. **GET /v1/auth/me (auth-me.ts):** New file, new path, new shape — `{ id: number, email, emailVerifiedAt }`. Distinct from `/v1/me` which returns `{ userId: string, email }` for App.tsx PostHog. DI factory + production singleton pattern mirrors me.ts exactly.

4. **index.ts wiring:** 1 import (`authMe`), 1 bypass line (`/v1/auth/verify-email`), 1 protected mount (`app.route("/v1", authMe)` after bearerAuth dispatcher).

## Token Issuance Helper Signature

For Plan 03 reuse decision:

```typescript
// vigil-core/src/routes/auth.ts (module-private)
async function issueEmailVerifyToken(userId: number, now: number): Promise<string>
// Returns: rawToken (base64url, 43 chars) — caller passes to fireVerifyEmailInBackground()
// Side effect: inserts password_reset_tokens row with type='email_verify', expires_at = now + 24h
```

**Plan 03 reuse note:** This helper is currently module-private in `auth.ts`. Plan 03's `resend-verification.ts` needs the same pattern. Options:
- **Option A (recommended):** Duplicate inline in `resend-verification.ts` — same 4-line pattern, still only 3 total call sites (register-fresh, register-claim, resend). Matches RESEARCH Open Q2 "inline duplication for Phase 113."
- **Option B:** Extract to `src/utils/tokenIssue.ts` — cleaner but adds a shared file across 3 routes. Worth doing if a 4th site appears (verify-email doesn't need it — it claims, not issues).

## Shared tokenIssue.ts Helper Decision

Per CONTEXT Claude's Discretion and RESEARCH Open Q2: **deferred**. At 2 call sites (both in the same file), extraction would be premature. Plan 03 adds a 3rd site in a different file — if that happens, the plan executor for Plan 03 should evaluate extraction then. Documented here for continuity.

## Bypass List Count

After this plan, the bearerAuth bypass list in `index.ts` has **7 entries**:
1. `/v1/health`
2. `/v1/auth/google/callback`
3. `/v1/auth/register`
4. `/v1/auth/login`
5. `/v1/auth/forgot-password` (Phase 112)
6. `/v1/auth/reset-password` (Phase 112)
7. `/v1/auth/verify-email` (this plan — D-12)

`/v1/auth/resend-verification` and `/v1/auth/me` are NOT in the bypass list (bearerAuth required per D-15 and D-27).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend register handler + login response | 34ee8ff | vigil-core/src/routes/auth.ts, vigil-core/src/routes/auth.test.ts |
| 2 | Create GET /v1/auth/me route + tests | 99252ef | vigil-core/src/routes/auth-me.ts, vigil-core/src/routes/auth-me.test.ts |
| 3 | Wire bearerAuth bypass + mount authMe | f88b686 | vigil-core/src/index.ts |

## Test Count Delta

| File | Tests Before | Tests After | Delta |
|------|-------------|-------------|-------|
| auth.test.ts | 24 | 32 | +8 (AUTH-11-R-01..05, AUTH-11-L-01..03) |
| auth-me.test.ts | 0 (new) | 5 | +5 (AUTH-11-ME-01..05) |
| **Total new tests** | | | **+13** |

All 13 new tests pass (or skip gracefully when DATABASE_URL is absent — DB-dependent tests use `t.skip("DATABASE_URL not set")`). Pre-existing tests remain green (no regressions).

Note on skipped DB tests: The local dev environment (DATABASE_URL not set) skips all DB-integration tests. These will run green on Railway's CI or when DATABASE_URL is pointed at the local Postgres instance from Phase 107.1.

## Pre-existing Flaky Tests Observed

None. The existing test suite hung on first run but this is a known pre-existing issue (STATE.md Blockers: `cross-user-isolation.test.ts` imports `../index.js` which spawns generate-scheduler setInterval loops). Individual file runs via `npx tsx --test <file>` are clean.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Plan-specified patterns applied verbatim

- `.catch()` fire-and-forget: matches forgot-password.ts:221-223 exactly (RESEARCH Open Q1 resolution)
- DI seam `__setSendEmailVerificationEmailForTest`: module-scope mutable `let` variable, exported for test patching, reset via `__resetSendEmailVerificationEmailForTest` in `beforeEach`
- `auth-me.ts` as separate file: RESEARCH Pitfall 2 respected — `me.ts` untouched

## Threat Surface Scan

| Threat ID | Mitigation Applied | Status |
|-----------|-------------------|--------|
| T-113-06 | Bypass list extended by exactly 1 entry (/v1/auth/verify-email); /v1/auth/resend-verification and /v1/auth/me NOT bypassed | APPLIED |
| T-113-08 | D-07 conditional `existing.emailVerifiedAt === null` skips token+send for post-backfill seed user; TEST AUTH-11-R-05 pins it | APPLIED |
| T-113-IDOR-01 | userId read ONLY from c.get("userId") in auth-me.ts (never from body/query); TEST AUTH-11-ME-04 verifies defensive guard | APPLIED |
| T-113-LEAK-01 | D-27 minimal field set: only id, email, emailVerifiedAt; TEST AUTH-11-ME-05 asserts Object.keys(body).sort() === ["email","emailVerifiedAt","id"] | APPLIED |
| T-113-FAF-01 | .catch() attached synchronously before c.json returns; TEST AUTH-11-R-03 verifies synchronously-throwing spy still yields 201 | APPLIED |

## Known Stubs

None — all data sources are wired. The `sendEmailVerificationEmailFn` DI seam defaults to the real `sendEmailVerificationEmail` in production (lazy null-init in email-service.ts handles missing RESEND_API_KEY gracefully via `status: "skipped_no_key"`).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| vigil-core/src/routes/auth.ts | FOUND (modified) |
| vigil-core/src/routes/auth.test.ts | FOUND (extended with 8 AUTH-11 tests) |
| vigil-core/src/routes/auth-me.ts | FOUND (created) |
| vigil-core/src/routes/auth-me.test.ts | FOUND (created with 5 AUTH-11-ME tests) |
| vigil-core/src/index.ts | FOUND (3 lines added) |
| Commit 34ee8ff (Task 1) | FOUND |
| Commit 99252ef (Task 2) | FOUND |
| Commit f88b686 (Task 3) | FOUND |
| npx tsc --noEmit exits 0 | PASSED |
| auth.test.ts: 8 pass, 0 fail | PASSED |
| auth-me.test.ts: 5 pass, 0 fail | PASSED |
| /v1/auth/verify-email in bypass list | FOUND (grep count=1) |
| import { authMe } in index.ts | FOUND (grep count=1) |
| app.route("/v1", authMe) in index.ts | FOUND (grep count=1) |
| verify-email bypass AFTER reset-password bypass | PASSED (awk order check) |
| authMe mount AFTER bearerAuth dispatcher | PASSED (awk order check) |
| Bypass list now has 7 entries | CONFIRMED |
