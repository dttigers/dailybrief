---
phase: 112
plan: 03
status: complete
started: 2026-04-25
completed: 2026-04-25
duration_min: 9
requirements:
  - AUTH-10
tags: [auth, route, hono, atomic-claim, password-changed-at, wave-2]
depends_on: [112-01]
provides:
  - "POST /v1/auth/reset-password endpoint"
  - "single-use atomic claim semantics (SC#3)"
  - "password_changed_at bump on reset → JWT invalidation via Phase 110 gate (SC#4)"
key-files:
  created:
    - vigil-core/src/routes/reset-password.ts
    - vigil-core/src/routes/reset-password.test.ts
  modified:
    - vigil-core/src/index.ts
key-decisions:
  - "Drizzle Proxy pattern in mock-DB-throw test — counts update() calls, routes #1 to real DB and throws on #2 (cleaner than the call-counter object pattern in the plan skeleton)"
  - "Retry-After header floor=1 — Math.max(1, Math.ceil(...)) so the header is never 0 even when the bucket is at the boundary"
  - "Test-runner post-suite hang accepted (same as 112-02) — tests all complete and report green; force-kill needed to exit cleanly. Documented in Self-Check section."
metrics:
  tasks: 3
  files: 3
  tests: 12
  tests_passing: 12
  ts_errors: 0
---

# Phase 112 Plan 03: POST /v1/auth/reset-password Summary

Atomic single-use UPDATE-RETURNING reset-password endpoint with strict claim → password update → 200 ordering and password_changed_at bump that invalidates pre-reset JWTs via the existing Phase 110 bearerAuth gate.

## Outcome

Closes the backend half of AUTH-10. The unauthenticated `POST /v1/auth/reset-password` endpoint:
1. Performs the D-02 atomic UPDATE-RETURNING claim against `password_reset_tokens` (FIRST DB op).
2. On 1-row claim, updates `users.password_hash` + `password_changed_at` + `updated_at` in that strict order.
3. Returns `200 { ok, message }` — no JWT, no auto-login (D-12).

12/12 TDD tests pass against live local PG. Live curl smoke confirms route is mounted and reachable.

## Files Shipped

| File | Purpose |
|---|---|
| `vigil-core/src/routes/reset-password.ts` | 213-line handler with DI seam (`createResetPasswordRoute({ dbOverride?, nowFn? })`). Per-IP rate limiter (5/h sliding window). MIN/MAX_PASSWORD constants kept in sync with `auth.ts:19-20`. |
| `vigil-core/src/routes/reset-password.test.ts` | 12 enumerated test cases — 200 success body (T1), passwordChangedAt bump (T2), new-hash verifies (T3), no-JWT in response (T4), single-use SC#3 (T5), expiry (T6), unknown token (T7), length validation BEFORE claim (T8/T9), per-IP rate limit (T10), **D-11 ordering pin** (T11), missing field (T12). |
| `vigil-core/src/index.ts` | +2 lines: `import { resetPassword } from "./routes/reset-password.js"`, `app.route("/v1", resetPassword)` BEFORE the bearerAuth dispatcher, and `if (c.req.path === "/v1/auth/reset-password") return next()` in the dispatcher exempt block. |

## Commits

| SHA | Type | Description |
|---|---|---|
| `d7b942f` | test | add 12 RED-state tests for POST /v1/auth/reset-password |
| `02eb8b6` | feat | implement POST /v1/auth/reset-password handler |
| `a59759e` | feat | mount resetPassword router + extend dispatcher exempt list |

## Test Results

```
▶ POST /v1/auth/reset-password
  ✔ valid token + valid new password returns 200 success body (126.13ms)
  ✔ successful reset bumps users.password_changed_at (74.55ms)
  ✔ successful reset stores a new password_hash that verifyPassword accepts (88.40ms)
  ✔ D-12 success response contains NO JWT and NO token (45.03ms)
  ✔ single-use: second claim with same token returns 400 'Invalid or expired token' (46.99ms)
  ✔ expired token returns 400 'Invalid or expired token' (25.19ms)
  ✔ unknown / random token returns 400 'Invalid or expired token' (1.86ms)
  ✔ newPassword < 12 chars returns 400 with length error AND token is NOT burned (45.60ms)
  ✔ newPassword > 128 chars returns 400 AND token is NOT burned (23.44ms)
  ✔ per-IP rate limit (5/h) — 6th call from same IP returns 429 (5.67ms)
  ✔ D-11 ordering: mock DB throws on user.update — token IS burned (accepted failure mode) (49.54ms)
  ✔ missing 'token' or 'newPassword' field returns 400 (0.86ms)
✔ POST /v1/auth/reset-password (535.03ms)
```

12/12 ✔ pass. `tsc --noEmit` exits 0.

## D-11 Ordering Proof (Test 11 — load-bearing)

The plan's load-bearing test pins the constraint that the atomic claim happens BEFORE the password update. If the password update throws, the token IS already burned (used_at non-NULL) — accepted failure mode per CONTEXT D-11 last paragraph.

**Test approach:** A `Proxy(realDb, ...)` mock counts `update()` calls. Call #1 (the password_reset_tokens claim) routes through the real DB and succeeds. Call #2 (the users update) synchronously throws `Error("simulated PG failure on user update (D-11 ordering test)")`.

**Assertion (verbatim from test):**
```typescript
assert.ok(res.status >= 500, `expected 5xx after user.update throw, got ${res.status}`);

// Verify token IS burned — the FIRST step succeeded against the REAL DB.
const [row] = await realDb.select({ usedAt: passwordResetTokens.usedAt })
  .from(passwordResetTokens)
  .where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
assert.notEqual(row!.usedAt, null,
  "D-11 acceptance: token IS burned even when step 2 fails");
```

**Result:** ✔ pass — both assertions hold. The simulated PG failure stack trace appears in the test output (expected — it's the throw inside the mock; Hono's default `onError` returns 500 to the client). Token row's `used_at` is non-NULL, confirming step 1 committed against the real DB before step 2 threw.

## index.ts Diff

```diff
 import { forgotPassword } from "./routes/forgot-password.js";
+import { resetPassword } from "./routes/reset-password.js";
 ...
 // Phase 112 Plan 02 — forgot-password is unauthenticated ...
 app.route("/v1", forgotPassword);
+
+// Phase 112 Plan 03 — reset-password is unauthenticated (the opaque token
+// IS the auth credential). Mount BEFORE bearerAuth and exempt the path below.
+app.route("/v1", resetPassword);
 ...
 app.use("/v1/*", async (c, next) => {
   ...
   if (c.req.path === "/v1/auth/forgot-password") return next(); // Plan 02 ADDED
+  if (c.req.path === "/v1/auth/reset-password") return next();  // Plan 03 ADDED
   return bearerAuth(c, next);
 });
```

3 line additions, no modifications. Zero merge risk with Plan 02's edits — different anchor lines.

## Live Curl Smoke

Dev server started with `npx tsx src/index.ts` against local PG.

```
$ curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST \
    http://localhost:3001/v1/auth/reset-password \
    -H "Content-Type: application/json" \
    -d '{"token":"bogus-no-match","newPassword":"ValidNewPass123!"}'

{"error":"Invalid or expired token"}
HTTP_STATUS:400
```

Confirms (a) route is mounted before bearerAuth, (b) dispatcher exempt is in place (no 401), (c) D-10 atomic-claim 0-row branch returns the verbatim 400 body end-to-end against the live DB.

## SC#4 — passwordChangedAt Bump (cross-phase regression deferred to Plan 05)

Test 2 in this plan asserts that `users.password_changed_at` is bumped on a successful reset. The Phase 110 bearerAuth iat-gate (`vigil-core/src/middleware/auth.ts:110-145`) reads this column on every JWT request and rejects pre-bump JWTs with `401 { error: "Session expired" }`. **No new gate code in this plan** — the gate fires automatically.

The full cross-phase regression (issue JWT at T0 → reset at T1 → call /v1/me at T2 → 401) is out of scope for this plan and queued for Plan 05's manual UAT (cross-device check-in).

## Coverage of CONTEXT decisions

| Decision | Implementation |
|---|---|
| **D-09** (body shape) | Field guards: `typeof token === "string" && typeof newPassword === "string"` (else 400 "token and newPassword are required") |
| **D-10** (atomic UPDATE-RETURNING claim) | `db.update(passwordResetTokens).set({usedAt}).where(and(eq tokenHash, eq type, isNull usedAt, gt expiresAt sql\`now()\`)).returning({userId})`. PG row-lock makes WHERE+SET atomic. 0-row → 400 "Invalid or expired token" verbatim. |
| **D-11** (state-mutation order) | Length validation → atomic claim → user update → 200. Test 11 pins the ordering at the contract level. |
| **D-12** (success response shape) | `{ ok: true, message: "Password reset successful. You can now log in." }`. Test 4 asserts `Object.keys === ["message", "ok"]`. |
| **D-13** (per-IP rate limit, 5/h sliding window) | `takeSlot(ip, now)` returns 429 + Retry-After (floor=1s) on excess. Test 10 pins. |
| **T-112-03-07** (length validation BEFORE claim) | Length check appears BEFORE `db.update(passwordResetTokens)`. `awk` ordering check passes. Tests 8 + 9 pin token-not-burned-on-validation-failure. |

## Notes for Plan 04 (PWA)

The PWA's `ResetPasswordPage` consumes:

- **On 200:** body shape is `{ ok: true, message: "Password reset successful. You can now log in." }`. Plan 04 reads the 200 status (body content optional) and navigates to `/auth?reason=password_reset` — the PWA's existing `?reason=session_expired` banner machinery (Phase 110 D-19) renders the password-reset banner case.
- **On 400:** body shape is `{ error: "Invalid or expired token" }` for ALL three failure modes (invalid / expired / used). Plan 04 collapses all three into the D-20 single-bucket UX: heading "This link is no longer valid", body "Reset links expire after 1 hour and can only be used once.", primary CTA → `/auth/forgot`, secondary → `/auth`. Do NOT branch on the error string — the server intentionally hides which sub-bucket fired.
- **On 429:** body `{ error: "Too many requests" }` + `Retry-After` header. Plan 04 should render a generic "Try again later" toast.
- **On 500:** the D-11 accepted failure mode (token burned, password not changed). User must request a fresh link — same UX as 400. Plan 04 may treat 5xx the same as 400.

## Deviations from RESEARCH §Pattern-5

1. **Mock-DB shape in Test 11 uses Proxy not bag-of-functions.** RESEARCH §Pattern-5 didn't address how to mock Drizzle's chainable API for selective failure injection. The plan skeleton suggested a manual-fluent-object approach. I switched to `new Proxy(realDb, { get(target, prop) { if (prop === "update") return countingHandler; return Reflect.get(target, prop); } })` — cleaner and propagates all other methods (select/insert/delete) without explicit binding. Functionally identical.

2. **Retry-After header floor=1.** RESEARCH didn't specify behavior at the bucket boundary. The handler uses `Math.max(1, Math.ceil((oldest + window - now) / 1000))` so the header never returns 0 (which some HTTP clients treat as "retry immediately" or skip). Defensive-default; production semantics unaffected for any non-edge case.

No other deviations from the plan or RESEARCH §Pattern-5.

## Self-Check: PASSED

**Files exist:**
- `vigil-core/src/routes/reset-password.ts` — FOUND
- `vigil-core/src/routes/reset-password.test.ts` — FOUND
- `vigil-core/src/index.ts` — FOUND (modified)

**Commits exist (verified via `git log --oneline | grep`):**
- `d7b942f` test(112-03): add 12 RED-state tests — FOUND
- `02eb8b6` feat(112-03): implement handler — FOUND
- `a59759e` feat(112-03): mount + dispatcher exempt — FOUND

**Test runner post-suite hang:** Same Plan 02 issue carries forward. The `tsx --test` process does not exit cleanly after the suite reports green — postgres-js connection pool keeps the event loop alive. All 12 ✔ marks render before the hang; the suite is functionally complete and the runner needs `kill -9` to release. Acceptable for now; future cleanup could close the DB pool in a global `after()` hook.
