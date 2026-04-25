---
phase: 112
plan: 02
status: complete
started: 2026-04-24
completed: 2026-04-24
requirements:
  - AUTH-10
---

# Plan 112-02 — POST /v1/auth/forgot-password (SUMMARY)

## Outcome

Unauthenticated forgot-password endpoint shipped. 10/10 TDD tests pass. Cold smoke (RESEND_API_KEY + DATABASE_URL both unset) returns enumeration-safe 200 with the locked body shape — proves no startup crash + miss-path semantics work without DB.

## Files shipped

| File | Purpose |
|---|---|
| `vigil-core/src/routes/forgot-password.ts` | 219-line handler with DI seam (`createForgotPasswordRoute({ sendEmailFn?, nowFn? })`). DUMMY_HASH copied verbatim from `auth.ts:17`. In-process LRU + sliding-window rate limiter (per-IP + per-email maps, both 5/hour). |
| `vigil-core/src/routes/forgot-password.test.ts` | 10 enumerated test cases — body identity (Test 1, 2), timing parity (Test 3), DB hash storage (Test 4), invalidate-prior-tokens D-06 (Test 5), email-send wiring (Test 6), per-email rate limit (Test 7), per-IP rate limit (Test 8), invalid JSON (Test 9), missing field (Test 10). |
| `vigil-core/src/index.ts` | Mount `app.route("/v1", forgotPassword)` BEFORE bearerAuth. Added `/v1/auth/forgot-password` to the dispatcher exempt list. |

## Commits

- `ba74fcf test(112-02): add 10 RED-state tests for POST /v1/auth/forgot-password` (Task 1, original executor)
- `24b9dc9 feat(112-02): implement forgot-password handler + mount + timing-parity fix` (Task 2, continuation after API overload)

## Test results

```
▶ POST /v1/auth/forgot-password
  ✔ unknown email returns 200 with enum-safe body
  ✔ known email returns 200 with IDENTICAL enum-safe body
  ✔ hit-path and miss-path wall-clock times are within 1.5x (median of 3 runs)
  ✔ raw token never appears in DB; only SHA-256 hex hash is stored
  ✔ prior unused tokens for the user are invalidated when issuing a new one (D-06)
  ✔ hit-path calls sendPasswordResetEmail with the user's email and a reset URL containing the rawToken
  ✔ per-email rate limit fires after 5 requests within 1 hour for the same email
  ✔ per-IP rate limit fires after 5 requests within 1 hour from the same IP across DIFFERENT emails
  ✔ invalid JSON body returns 200 enum-safe (no shape leak)
  ✔ missing 'email' field returns 200 enum-safe (no shape leak)
```

10/10 pass. `npx tsc --noEmit` exits 0.

Last-run timing measurement: `hit=22.7ms miss=20.4ms ratio=1.11` — well within the 1.5x SC#1 threshold.

## Cold smoke (Task 3)

```
$ RESEND_API_KEY= DATABASE_URL= npx tsx scripts/cold-smoke.mjs
[vigil-core] DATABASE_URL not set — PostgreSQL features unavailable
status: 200
body: {"ok":true,"message":"If your account exists, a reset link has been sent."}
```

Confirms (a) no startup crash with both env vars unset and (b) miss-path returns enum-safe 200 even when DB lookup is impossible — key safety property for boot-time + accidental-prod scenarios.

## Gotchas + deviations from PLAN

### 1. API overload mid-execution → continuation

The original executor agent hit a transient `API Error: 529 Overloaded` after committing Task 1 (RED tests). The handler file was on disk but uncommitted; tests were failing with 503. Continuation agent failed to spawn (also 529). Orchestrator finished Task 2 + 3 inline — picking up exactly where the executor left off. Functionally equivalent to a single-agent run; the boundary is invisible in git history (one commit per task).

### 2. Null-DB defense in handler

Plan 02 didn't anticipate the test scenario where `DATABASE_URL` is unset (db is `null` in connection.ts). The original handler shipped a `503 Database unavailable` short-circuit — but that **breaks enumeration safety** (leaks DB availability through response shape) AND fails Test 1 ("unknown email returns 200"). Fix: when `db` is null, treat as miss-path → run dummy argon2 + return enum-safe 200. Two stacked benefits:
- Test 1 passes without DATABASE_URL (it doesn't need DB; "unknown" is "no user").
- Production defense in depth — even if DB ever flapped offline, response shape stays uniform.

### 3. Hit-path argon2 verify added for timing parity

Plan 02 originally drafted the dummy argon2 verify only on the miss path. Live measurement showed `@node-rs/argon2` is ~18-19ms (not 100-200ms as RESEARCH §A2 estimated — it uses native Rust), and the hit path's DB writes are ~5-10ms each. Without argon2 on the hit path, hit < miss → enumeration leak via timing.

Fix: hit path ALSO runs `verifyPassword("never-matches", DUMMY_HASH)` after the user lookup succeeds. Both paths now share the same dominant op. Measured ratio settled at ~1.1x.

### 4. Rate-limiter bucket reset in timing test

Test 3 (timing parity) makes 7 requests against the same handler instance (1 warmup + 3 hits + 3 misses). The per-IP rate limit fires after request #5 → calls 6+ short-circuit to ~0.4ms → median of misses gets dragged below the median of hits → ratio 56x (false positive).

Fix: `__resetBucketsForTest()` is now called inside `timeOne()` so each timed call sees a clean bucket. Real production calls don't do this — they accrue against the limit as designed.

### 5. Test-runner open handle (planner FLAG carried through)

The rate-limiter's `setInterval` is `.unref()`'d so the timer doesn't keep node alive. Despite that, `npx tsx --test src/routes/forgot-password.test.ts` doesn't exit cleanly after the suite completes — process hangs (likely the postgres-js connection pool keeping the loop alive). All tests run and report green; the hang is post-suite. `kill -9` is needed to stop the runner cleanly. Acceptable for now; future cleanup could close the DB pool in `after()`.

## Coverage of CONTEXT decisions

| Decision | Implementation |
|---|---|
| **D-03** (always-200 enum-safe body) | Single `ENUM_SAFE_BODY` constant, returned on hit/miss/rate-limit/parse-error/missing-field paths |
| **D-04** (per-email + per-IP, 5/hour each) | Two `Map<string, number[]>` buckets with sliding-window `takeSlot` helper |
| **D-05** (timing-attack mitigation) | `verifyPassword("never-matches", DUMMY_HASH)` on BOTH hit and miss paths |
| **D-06** (invalidate-prior-tokens, "most recent wins") | UPDATE-set-used_at-now on existing unused tokens BEFORE INSERT of new token |
| **D-07** (32 random bytes base64url) | `crypto.randomBytes(32).toString("base64url")` |
| **D-08** (SHA-256 hex hash storage) | `crypto.createHash("sha256").update(rawToken).digest("hex")` — 64-char hex written to `token_hash` column |
| **D-21** (VIGIL_APP_BASE_URL with fallback) | `process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io"` (matches Phase 111 smoke-test pattern) |

## Success Criteria (Plan 02 scope)

| ROADMAP SC# | Criterion | Status |
|---|---|---|
| 1 | Submitting a forgot-password request for an unknown email returns the same 200 response body and approximate response time as a known email | ✓ PASS — Test 1, 2 (body identity), Test 3 (timing within 1.5x ratio=1.11) |
| 5 | password_reset_tokens table stores token_hash (SHA-256), not the raw token | ✓ PASS (Plan 02 half — handler stores hash; raw token only in URL) — Test 4 |

Deferred to Plan 03: SC#3 (single-use claim), SC#4 (password_changed_at bump).
Deferred to Plan 05: SC#2 (e2e Gmail inbox + redirect to login).
