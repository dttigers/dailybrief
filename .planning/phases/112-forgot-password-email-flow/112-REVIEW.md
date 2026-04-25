---
phase: 112-forgot-password-email-flow
reviewed: 2026-04-25T22:50:05Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - vigil-core/drizzle/0016_password_reset_tokens.sql
  - vigil-core/drizzle/meta/_journal.json
  - vigil-core/scripts/smoke-test-forgot-password.ts
  - vigil-core/src/db/schema.ts
  - vigil-core/src/index.ts
  - vigil-core/src/routes/forgot-password.test.ts
  - vigil-core/src/routes/forgot-password.ts
  - vigil-core/src/routes/reset-password.test.ts
  - vigil-core/src/routes/reset-password.ts
  - vigil-pwa/src/App.tsx
  - vigil-pwa/src/pages/AuthPage.test.tsx
  - vigil-pwa/src/pages/AuthPage.tsx
  - vigil-pwa/src/pages/ForgotPasswordPage.test.tsx
  - vigil-pwa/src/pages/ForgotPasswordPage.tsx
  - vigil-pwa/src/pages/ResetPasswordPage.test.tsx
  - vigil-pwa/src/pages/ResetPasswordPage.tsx
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 112: Code Review Report

**Reviewed:** 2026-04-25T22:50:05Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 112 (AUTH-10 forgot-password email flow) is well-engineered with clear awareness of its threat model. CONTEXT decisions (D-03 enumeration safety, D-05 timing parity, D-10 atomic claim, D-11 ordering, D-18 Apple-Mail pre-fetch defense, D-20 single-bucket UX) are pinned at both code and test level. The intentional "burned token on user-update failure" semantic (D-11) is correctly implemented and pinned by Test 11. The PWA's `?reason=password_reset` exact-string contract is honored on both producer (`ResetPasswordPage`) and consumer (`AuthPage`) sides. Migration is re-run safe with `IF NOT EXISTS` and the type CHECK pre-locks Phase 113's `email_verify` column shape.

Two warnings worth surfacing:

1. **Hit-path latency leak via Resend network round-trip (WR-01).** The forgot-password handler `await`s `sendEmailFn(...)` inline on the hit path. In production this is a network call to Resend (typically 50-300ms). The miss path runs only the local argon2 dummy (~100-200ms). On a fast-Resend / slow-argon2 instance the paths approximate; but on most production runs the hit path is meaningfully slower because it stacks DB writes + argon2 + Resend on top of the same argon2 the miss path runs alone. The smoke-test threshold of 2x acknowledges this implicitly. Consider fire-and-forget email send for tighter D-05 parity.
2. **`x-forwarded-for` is trusted without proxy verification (WR-02).** Both rate limiters key on the first comma-segment of `x-forwarded-for`. An attacker can spoof this header by sending arbitrary values, allocating themselves unlimited per-IP buckets. Mitigated in practice because Railway's proxy adds the header (and a legitimate client can't reach the origin without going through it), but if the origin is ever exposed directly (Tailscale, local dev, future infra change) the per-IP cap becomes trivially bypassable.

Neither blocks ship. Five info items below cover style, dead-branch defensiveness, and minor test tightening.

## Critical Issues

(none)

## Warnings

### WR-01: Hit-path response time depends on Resend round-trip — D-05 timing parity weakens in production

**File:** `vigil-core/src/routes/forgot-password.ts:213`
**Issue:**
The hit path awaits `sendEmailFn(user.email, resetUrl)` synchronously before returning the enum-safe body. In tests `sendEmailFn` is a mocked `async () => ({status:'sent'})` that resolves immediately, so the timing test (Plan 02 Test 3) sees parity within 1.5x. In production, `sendEmailFn` is `realSendPasswordResetEmail`, which calls Resend over the network — typically 50-300ms, occasionally seconds on Resend latency spikes. The miss path runs only one argon2 verify (~100-200ms). Result: the hit path stacks `argon2 (~150ms) + 2 DB writes (~5-10ms) + Resend (~100-300ms)` ≈ 250-500ms; the miss path runs `argon2 (~150ms)` alone. This is a measurable enumeration leak over the wire — the smoke test's tolerance ratio of 2.0x is a tell that the team already noticed.

This is a behavioral regression vs the file's own comment at line 174 ("wall-clock dominates the response time on BOTH paths") — wall-clock is dominated by argon2 *only when Resend is fast*, and Resend latency is not bounded by code in this file.

**Fix:**
Detach the email send from the response path so wall-clock is bounded by local ops (argon2 + DB) on both paths:

```typescript
// Replace the awaited call at line 213:
//   await sendEmailFn(user.email, resetUrl);

// With fire-and-forget (errors logged inside email-service via captureException):
sendEmailFn(user.email, resetUrl).catch((err) => {
  // Already captured inside email-service per existing convention; this catch
  // is just to keep Node's unhandledRejection from firing.
  console.error("[forgot-password] email send failed (background):", err);
});
```

Tradeoff: the user gets the 200 enum-safe body before the email is actually queued. If Resend is hard-down, the user sees success but never gets an email. This matches D-03 intent (response shape doesn't reflect email-send outcome) and is the standard pattern for password-reset endpoints. Document the change in CONTEXT D-05 / RESEARCH §A2 if accepted.

Alternative: leave the await but cap the email-send operation with a short timeout (e.g., `Promise.race([sendEmailFn(...), sleep(50ms)])`) so the response time floor is dominated by argon2 regardless of Resend health. Less surgical than fire-and-forget.

### WR-02: `x-forwarded-for` is trusted without verifying the request came through Railway's proxy

**File:** `vigil-core/src/routes/forgot-password.ts:127`, `vigil-core/src/routes/reset-password.ts:109-110`
**Issue:**
Both routes derive the per-IP rate-limit key from the first comma-segment of the `x-forwarded-for` header:

```typescript
const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
```

There's no validation that the request actually arrived through a trusted reverse proxy. Any client can set `x-forwarded-for: 1.2.3.4` on each request, and each spoofed value gets its own 5/h bucket — bypassing the per-IP cap entirely. For forgot-password this defeats D-04's "per-IP" axis (the per-email axis still caps per-victim). For reset-password it's worse: the ONLY rate limit (D-13) is per-IP, so spoofing trivially unlocks unlimited token-guess attempts. Token entropy (256 bits) makes this academic for password_reset, but Phase 113 will reuse the same handler shape for `email_verify` and may pin shorter-lived assumptions.

This is mitigated in production today because Railway's edge proxy is the only ingress, and Railway always overwrites or appends to `x-forwarded-for`. But:
- Local dev / Tailscale exposure (Phase 107.2) does NOT go through Railway's proxy
- A future direct-bind regression (e.g., `VIGIL_BIND_HOST=0.0.0.0` outside Railway) would expose this directly
- Defense-in-depth says don't trust client-supplied headers

**Fix:**
Two layers, pick one:

(a) Use Hono's `c.env`/connection-info to fall back to the actual TCP peer when no trusted proxy is configured:

```typescript
// Pseudo — adapt to Hono's actual connection-info accessor:
const trustProxy = process.env.TRUST_PROXY === "1"; // set true on Railway
const ip = trustProxy
  ? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  : (c.env?.incoming?.socket?.remoteAddress ?? "unknown");
```

(b) Read the LAST segment of `x-forwarded-for` instead of the first (the rightmost hop is the trusted proxy's perspective; client-supplied hops are leftmost):

```typescript
const xff = c.req.header("x-forwarded-for");
const segments = xff?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const ip = segments[segments.length - 1] ?? "unknown";
```

Option (b) is the lightest-touch fix and standard practice when you control exactly one trusted hop in front of the app. Document the assumption (Railway is the only ingress).

## Info

### IN-01: `useMemo` over `searchParams.get('token')` is unnecessary

**File:** `vigil-pwa/src/pages/ResetPasswordPage.tsx:30`
**Issue:**
`useMemo(() => searchParams.get('token'), [searchParams])` memoizes a `Map.get`-style call on a stable URLSearchParams instance. The wrapping doesn't save measurable work — it just adds a hook dependency for the linter to track and another step for future readers to parse.

**Fix:**
```typescript
const token = searchParams.get('token');
```

Drop the `useMemo` import too if it's not used elsewhere.

### IN-02: Test 7 (per-email rate limit) accepts `<= 5` calls instead of `=== 5`

**File:** `vigil-core/src/routes/forgot-password.test.ts:374-376`, `408-413`
**Issue:**
Both rate-limit tests assert `sendSpy.mock.callCount() <= 5` rather than the exact expected value. A future regression that drops `sendEmailFn` calls entirely (e.g., handler short-circuits before the send) would still pass these assertions. The intent is "exactly the cap fires", not "at most the cap fires".

**Fix:**
Tighten to exact equality where the test owns the rate-limit state:

```typescript
// Test 7 — per-email cap
assert.equal(sendSpy.mock.callCount(), 5, "exactly 5 calls (cap fires on 6th)");

// Test 8 — per-IP cap (same change)
```

Both `__resetBucketsForTest()` runs at the top of `beforeEach`, so the count is deterministic.

### IN-03: Empty-string `x-forwarded-for` falls through to `""` bucket instead of `"unknown"`

**File:** `vigil-core/src/routes/forgot-password.ts:127`, `vigil-core/src/routes/reset-password.ts:110`
**Issue:**
`c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"` — if the header is set but empty (or just whitespace/commas), the chain produces `""`, which is not nullish, so the `?? "unknown"` fallback doesn't trigger. The bucket key becomes the empty string. Functionally equivalent to "unknown" (both are shared buckets), but the inconsistency is mildly confusing in logs and tests.

**Fix:**
```typescript
const ipRaw = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
const ip = ipRaw && ipRaw.length > 0 ? ipRaw : "unknown";
```

Pure cosmetics — drop into the same fix as WR-02 if you take that path.

### IN-04: `if (!db)` unreachable branch in `forgot-password.ts` calls argon2 and returns 200

**File:** `vigil-core/src/routes/forgot-password.ts:165-169`
**Issue:**
The branch is documented as unreachable ("Unreachable in practice; keeps TS happy without a non-null assertion") but it still executes a `verifyPassword` (~150ms) and a 200 enum-safe response. If the branch ever DID fire (e.g., a future refactor narrows `db` to null between line 146 and 165), it would silently mask a real bug as a successful-looking enum-safe response.

**Fix:**
Either:

(a) Use a non-null assertion at line 182 (`db!.update(...)` etc.) and drop the dead branch entirely — `user` only exists if `db` was non-null on the lookup, so the assertion is safe.

(b) Replace the unreachable branch with an explicit invariant violation that surfaces in logs:

```typescript
if (!db) {
  console.error("[forgot-password] invariant violation: user found but db null");
  return c.json(ENUM_SAFE_BODY, 200);
}
```

Either keeps the file shorter and the invariant explicit. Lowest priority — current code is correct, just defensive in a way that hides bugs if they ever arise.

### IN-05: Test 11 in `reset-password.test.ts` — `eslint-disable` comment hides type unsafety in the Proxy mock

**File:** `vigil-core/src/routes/reset-password.test.ts:388-406`
**Issue:**
The Proxy-based DB mock uses `// eslint-disable-next-line @typescript-eslint/no-explicit-any` twice, with `any` for both the proxy target and the inner `target.update(table)` call. The shape works for the test's purpose, but the `any`-everywhere leaves no compile-time guard against drizzle API changes. If Drizzle renames or restructures `.update()` chain methods in a future bump, this test would silently start passing for the wrong reason (returning whatever the Proxy `get` falls back to).

**Fix:**
Type the mock against `typeof defaultDb` instead of `any`:

```typescript
const realDb = db;
let updateCalls = 0;
const mockDb = new Proxy(realDb, {
  get(target, prop, receiver) {
    if (prop === "update") {
      return (table: Parameters<typeof target.update>[0]) => {
        updateCalls++;
        if (updateCalls === 1) return target.update(table);
        throw new Error("simulated PG failure on user update (D-11 ordering test)");
      };
    }
    return Reflect.get(target, prop, receiver);
  },
}) as typeof defaultDb;
```

Drops both `eslint-disable` comments. Cosmetic.

---

_Reviewed: 2026-04-25T22:50:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
