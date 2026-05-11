---
phase: 126
slug: wide-release-auth-hardening
status: patterns-mapped
date: 2026-05-11
---

# Phase 126 — Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 14 (7 NEW, 7 MODIFIED)
**Analogs found:** 13 / 14 (1 file has no close analog — `vigil-core/src/lib/sentry.ts` partial via `posthog.ts`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality | `read_first` (executor) |
|-------------------|------|-----------|----------------|---------------|--------------------------|
| **NEW** `vigil-core/src/lib/turnstile.ts` | utility (lib helper, external API client) | request-response (outbound POST to Cloudflare) | `vigil-core/src/lib/quiet-mode-suppression.ts` (lib module shape) + inline `fetch` patterns from `vigil-core/src/services/email-service.ts` | role-match (lib shape) | `vigil-core/src/lib/quiet-mode-suppression.ts` |
| **NEW** `vigil-core/src/lib/turnstile.test.ts` | test (lib unit) | request-response (mocked fetch) | `vigil-core/src/lib/quiet-mode-suppression.test.ts` (only sibling lib test) | role-match | same file |
| **NEW** `vigil-core/src/lib/sentry.ts` | utility (analytics wrapper, init-once + capture) | event-driven (exception capture) | `vigil-core/src/analytics/posthog.ts` | exact (sibling wrapper, both wrap third-party error sinks) | `vigil-core/src/analytics/posthog.ts` |
| **NEW** `vigil-core/src/lib/sentry.test.ts` | test (lib unit) | event-driven (mock-based) | `vigil-core/src/lib/quiet-mode-suppression.test.ts` + `posthog.test.ts` (if exists) | role-match | same |
| **NEW** `vigil-core/src/middleware/require-verified-email.ts` | middleware | request-response (DB read + gate or next) | `vigil-core/src/middleware/auth.ts` (bearerAuth — closest sibling middleware doing DB read + gate) | exact (same role, same data flow) | `vigil-core/src/middleware/auth.ts` |
| **NEW** `vigil-core/src/middleware/require-verified-email.test.ts` | test (middleware unit) | request-response | `vigil-core/src/middleware/auth.test.ts` | exact | same |
| **NEW** `vigil-core/src/__tests__/mount-order.test.ts` (if absent) | test (source-content drift detector) | filesystem read + regex | `vigil-core/src/routes/forgot-password.test.ts:421-446` (AUTH-13-FP-CAP-IP-20 drift-detector block) | role-match | `vigil-core/src/routes/forgot-password.test.ts` |
| **NEW** `vigil-pwa/src/lib/api-error-codes.ts` | utility (PWA lookup table + resolver) | transform (code → UX) | none in PWA today — partial via `vigil-pwa/src/api/client.ts:905-988` (`ErrorClass` + `classifyFetchError`) | partial (same shape: structured error → bucket) | `vigil-pwa/src/api/client.ts:905-988` |
| **NEW** `vigil-pwa/src/lib/api-error-codes.test.ts` | test (PWA unit, vitest) | transform | `vigil-pwa/src/api/client.test.ts` | role-match | same |
| **NEW** `vigil-pwa/src/pages/PrivacyPolicyPage.tsx` | component (static legal page) | request-response (none — pure JSX) | `vigil-pwa/src/pages/ForgotPasswordPage.tsx` (closest layout + Tailwind classes match) | partial (same chrome, different body) | `vigil-pwa/src/pages/ForgotPasswordPage.tsx` |
| **NEW** `vigil-pwa/src/pages/TermsOfServicePage.tsx` | component (static legal page) | request-response (none) | same as Privacy | partial | same |
| **NEW** `vigil-pwa/src/components/TurnstileWidget.tsx` | component (thin React wrapper) | event-driven (onSuccess callback) | `vigil-pwa/src/components/OfflineBanner.tsx` (lightweight wrapper) | partial — RESEARCH §1 pattern dictates shape | `vigil-pwa/src/pages/AuthPage.tsx:135-187` (mount site) |
| **MODIFIED** `vigil-core/src/routes/auth.ts` | controller | request-response (CRUD-ish: POST register/login) | `vigil-core/src/routes/forgot-password.ts` (rate-limit pattern verbatim per D-03) + `vigil-core/src/routes/resend-verification.ts` (DI seam shape) | exact (forgot-password is canonical) | `vigil-core/src/routes/forgot-password.ts:40-104` |
| **MODIFIED** `vigil-core/src/routes/auth.test.ts` | test (route integration) | request-response | `vigil-core/src/routes/forgot-password.test.ts:421-446` (drift-detector block + per-IP cap behavior tests) | exact | same |
| **MODIFIED** `vigil-core/src/index.ts` | config (app composition + mount order) | event-driven (Hono middleware mounting) | self (lines 109-167 establish the mount-order convention) | exact — only one composition root | `vigil-core/src/index.ts:84,109-168,252-260` |
| **MODIFIED** `vigil-pwa/src/pages/AuthPage.tsx` | component (form controller) | request-response (POST register/login) | self + `vigil-pwa/src/pages/ForgotPasswordPage.tsx` (error rendering pattern at line 90-92) | exact (self) | `vigil-pwa/src/pages/AuthPage.tsx:41-107` |
| **MODIFIED** `vigil-pwa/src/App.tsx` | config (route table) | request-response (router) | self — lines 66-76 already register public auth routes | exact (self) | `vigil-pwa/src/App.tsx:56-107` |
| **MODIFIED** `vigil-pwa/src/main.tsx` | config (app entry, side-effect init) | event-driven (init-before-render) | self — line 4 establishes side-effect import convention for posthog | exact (self) | `vigil-pwa/src/main.tsx` |
| **MODIFIED** `vigil-pwa/src/components/ErrorBoundary.tsx` | component (error catcher) | event-driven (componentDidCatch → capture) | self — line 19-20 is the existing capture call site | exact (self) | `vigil-pwa/src/components/ErrorBoundary.tsx:19-21` |
| **MODIFIED** `vigil-core/package.json` | config (deps manifest) | n/a | self | exact | n/a — add `@sentry/node@^10.52.0` |
| **MODIFIED** `vigil-pwa/package.json` | config (deps manifest) | n/a | self — line 13-18 dependencies block | exact | add `@marsidev/react-turnstile@^1.5.2` + `@sentry/react@^10.52.0` |

## Pattern Assignments

### NEW `vigil-core/src/lib/turnstile.ts` (utility, request-response)

**Analog:** Module shape from `vigil-core/src/lib/quiet-mode-suppression.ts:1-50` (JSDoc-header + named-export convention). Outbound-fetch shape inferred from RESEARCH §1 (no in-tree analog for `fetch` to external API in `lib/`; closest is `services/sports-service.ts` but that's services/ not lib/).

**Module-header pattern** (mirror `quiet-mode-suppression.ts:1-17`):
```typescript
/**
 * Phase 126 (AUTH-126-02 / D-01): Cloudflare Turnstile siteverify helper.
 *
 * Server-side captcha verification. PWA receives a token from the Turnstile
 * widget; this module POSTs that token + TURNSTILE_SECRET_KEY to the Cloudflare
 * siteverify endpoint and returns a normalized {ok, errorCodes} shape.
 *
 * Failure-mode policy (CONTEXT D-01):
 *   - success: false → caller returns 400 CAPTCHA_FAILED
 *   - network/timeout → throws; caller returns 503 (DO NOT fail-open)
 *
 * DI seam: tests inject a stub via __setVerifyTurnstileTokenForTest pattern
 * (mirror auth.ts:32 __setSendEmailVerificationEmailForTest).
 */
```

**Imports/exports** (no in-tree analog for outbound fetch in lib/; use Node 18+ native `fetch` per RESEARCH §1):
```typescript
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// NOTE: hyphenated key "error-codes" — DO NOT camelCase (R4 in RESEARCH §Risks)
```

**DI-seam pattern** (mirror `vigil-core/src/routes/auth.ts:27-39` verbatim):
```typescript
// from auth.ts:27-39 — DI seam at module scope (NOT inside handler)
let sendEmailVerificationEmailFn = realSendEmailVerificationEmail;
export function __setSendEmailVerificationEmailForTest(
  fn: typeof realSendEmailVerificationEmail,
): void {
  sendEmailVerificationEmailFn = fn;
}
export function __resetSendEmailVerificationEmailForTest(): void {
  sendEmailVerificationEmailFn = realSendEmailVerificationEmail;
}
```

Apply the same shape to `verifyTurnstileToken` so route tests can inject without hitting Cloudflare.

---

### NEW `vigil-core/src/lib/sentry.ts` (utility, event-driven)

**Analog:** `vigil-core/src/analytics/posthog.ts` — exact sibling. Both wrap a third-party error/event sink, both have env-var-gated singleton + no-op when unset, both expose `captureException(userId, err, context)`.

**Singleton + env-gate pattern** (mirror `posthog.ts:66-80` verbatim):
```typescript
// from posthog.ts:66-80
// ── D-10: Key-absence gate. No environment-flag coupling. ────────────────────
// Local dev: POSTHOG_API_KEY unset → singleton is null → wrappers no-op.
// Railway prod: POSTHOG_API_KEY set → singleton is a real PostHog client.
const apiKey = process.env["POSTHOG_API_KEY"];

export const posthog: PostHog | null = apiKey
  ? new PostHog(apiKey, { ... })
  : null;
```

For Sentry: replace eager-singleton with `initSentry()` function + module-local `initialized` boolean (RESEARCH §2 mandates init BEFORE `new Hono()`; sibling lazy-init makes that ordering explicit).

**captureException signature** (mirror `posthog.ts:181-192` verbatim):
```typescript
// from posthog.ts:181-192
export function captureException(
  userId: number | string | null,
  err: unknown,
  context: Record<string, string | number | boolean | undefined> = {},
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  posthog?.captureException(
    error,
    userId == null ? "anonymous" : String(userId),
    context,
  );
}
```

Apply identical signature for `captureToSentry` — same arg shapes, same `instanceof Error` normalization, same null-singleton no-op.

**Property-name denylist awareness (Phase 103 D-01..D-04 carryforward):** Per RESEARCH §Conventions + R12, when building Sentry context objects do NOT use `content`, `body`, `text`, `message`, `description`, `title`, `note`, `transcript` as keys — prefer `route`/`method`/`userId` (which is what existing PostHog call site at `index.ts:255-258` uses). Document this in JSDoc on `captureToSentry`.

---

### NEW `vigil-core/src/middleware/require-verified-email.ts` (middleware, request-response)

**Analog:** `vigil-core/src/middleware/auth.ts` (bearerAuth) — exact match. Same role (middleware), same data flow (DB read of users table → gate-or-next decision), same Hono `MiddlewareHandler` type, same `c.get("userId")` consumer pattern.

**Imports pattern** (mirror `middleware/auth.ts:1-6`):
```typescript
// from middleware/auth.ts:1-6
import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
```

**MiddlewareHandler with DB-read + decision pattern** (mirror `middleware/auth.ts:115-145`):
```typescript
// from middleware/auth.ts:115-145 (the JWT-path passwordChangedAt gate is the
// CLOSEST analog: SELECT users WHERE id = userId, compare timestamp, decide)
if (!db) {
  return c.json({ error: "Database unavailable" }, 503);
}
const [user] = await db
  .select({ id: users.id, passwordChangedAt: users.passwordChangedAt })
  .from(users)
  .where(eq(users.id, userId))
  .limit(1);

if (!user) {
  return c.json({ error: "Invalid or expired token" }, 401);
}

const gateThreshold = Math.floor(user.passwordChangedAt.getTime() / 1000);
if (claims.iat < gateThreshold) {
  return c.json({ error: "Session expired" }, 401);
}
```

For Phase 126: select `emailVerifiedAt` + `createdAt` columns (not `passwordChangedAt`), compute `verifiedAfter = createdAt + 24h`, decide next() vs 403 EMAIL_NOT_VERIFIED. Use the EXACT same `if (!db) ... return c.json({error, code}, 503)` short-circuit shape.

**`c.get("userId")` consumer guarantee** (mirror `middleware/auth.ts:147`): the bearerAuth dispatcher sets `c.set("userId", userId)` BEFORE this middleware runs (mount-order constraint — see `index.ts` notes below). So `c.get("userId") as number` is safe — `userId` is guaranteed non-null at this code path (RESEARCH §Mount-Order Constraint).

**Bypass-list pattern** — NEW for Phase 126; no exact analog. Per RESEARCH AUTH-126-03:
```typescript
function isBypass(path: string): boolean {
  if (path === "/v1/health") return true;
  if (path.startsWith("/v1/auth/")) return true;
  return false;
}
```

Drift detector (RESEARCH AUTH-126-03 last bullet): test asserts both `/v1/health` AND `/v1/auth/` literals appear inside `isBypass` function body via `fs.readFileSync` regex.

---

### MODIFIED `vigil-core/src/routes/auth.ts` (controller, request-response)

**Analog:** `vigil-core/src/routes/forgot-password.ts` is the canonical Phase 117 AUTH-13 dual-counter implementation. Per CONTEXT D-03, **mirror verbatim**. Test scaffold copies from `forgot-password.test.ts:420-446`.

**Imports pattern** (mirror `forgot-password.ts:23-29` ordering: node → hono → drizzle → db → services):
```typescript
// from forgot-password.ts:23-29
import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import * as crypto from "node:crypto";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { verifyPassword } from "../utils/password.js";
import { sendPasswordResetEmail as realSendPasswordResetEmail } from "../services/email-service.js";
```

Phase 126 ADD: `import { verifyTurnstileToken as realVerifyTurnstileToken } from "../lib/turnstile.js";` at the existing import block (between line 7 and 8).

**Rate-limit constants pattern — VERBATIM from `forgot-password.ts:42-50`** (D-03 lock):
```typescript
// from forgot-password.ts:42-50 — copy LITERALLY; drift detector asserts
// the EXACT string `const RATE_LIMIT_MAX_IP = 20;` matches via regex.
// Phase 117 (AUTH-13 D-05): per-axis caps split. Per-IP raised 5 → 20 to
// tolerate household-NAT retry patterns. Per-email STAYS at 5 — that axis
// is the enum-safety defense (a single email getting 5+ attempts/hr is
// suspicious and the existing 200-enum-safe response shape masks it).
const RATE_LIMIT_MAX_IP = 20;                     // Phase 117 D-05: raised 5 → 20
const RATE_LIMIT_MAX_EMAIL = 5;                   // Phase 117 D-05: UNCHANGED — enum-safety guard
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;      // D-04: 1h sliding window
```

For Phase 126 register, rename internal Maps to namespace away from forgot-password (which lives in the same process) — RESEARCH AUTH-126-01 uses `registerIpBuckets` / `registerEmailBuckets`. Comments cite Phase 126 D-03 not Phase 117 D-05.

**In-memory Maps + setInterval sweep — VERBATIM from `forgot-password.ts:60-84`**:
```typescript
// from forgot-password.ts:60-84
// ── In-process sliding-window rate limit buckets (RESEARCH §Pattern-3) ──────
// Per-IP and per-email tracked independently; "whichever fires first" wins
// (D-04). Single-instance scale only — fine for v3.6 Railway deployment.
const ipBuckets = new Map<string, number[]>();
const emailBuckets = new Map<string, number[]>();

// Periodic sweep — drop entries whose newest timestamp is outside the window.
// .unref() so the timer doesn't keep the test process alive (matches
// rate-limit.ts:21 pattern).
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [k, arr] of ipBuckets) {
    const last = arr[arr.length - 1];
    if (arr.length === 0 || (last !== undefined && last < cutoff)) {
      ipBuckets.delete(k);
    }
  }
  for (const [k, arr] of emailBuckets) {
    const last = arr[arr.length - 1];
    if (arr.length === 0 || (last !== undefined && last < cutoff)) {
      emailBuckets.delete(k);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();
```

**`takeSlot` helper — VERBATIM from `forgot-password.ts:86-98`**:
```typescript
// from forgot-password.ts:86-98
// Phase 117 (AUTH-13 D-05): max is now a per-call parameter so per-IP and
// per-email axes can have different caps (20 vs 5).
function takeSlot(map: Map<string, number[]>, key: string, now: number, max: number): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (map.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= max) {
    map.set(key, arr);
    return false;
  }
  arr.push(now);
  map.set(key, arr);
  return true;
}

// Test-only helper. Must NOT be called from production code.
export function __resetBucketsForTest(): void {  // pattern from forgot-password.ts:100-104
  ipBuckets.clear();
  emailBuckets.clear();
}
```

Phase 126 ADD: export name MUST differ from `forgot-password.ts` export to avoid name-collision in test imports. RESEARCH names it `__resetRegisterBucketsForTest()` — apply that.

**Slot consumption inside handler — mirror `forgot-password.ts:133-142`**:
```typescript
// from forgot-password.ts:133-142
const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const now = nowFn();
const ipOk = takeSlot(ipBuckets, ip, now, RATE_LIMIT_MAX_IP);
const emailOk = email ? takeSlot(emailBuckets, email, now, RATE_LIMIT_MAX_EMAIL) : true;
if (!ipOk || !emailOk) {
  return c.json(ENUM_SAFE_BODY, 200);    // forgot-password: enum-safe 200
                                          // Phase 126: 429 + code:"RATE_LIMITED" + retry_after_seconds
}
```

For Phase 126 the response differs (RESEARCH AUTH-126-01: 429 not 200, structured `{error, code, retry_after_seconds}`), because /auth/register is NOT enumeration-protected (allowlist already exposes "this email isn't allowed" via 403 today).

**Existing error-shape upgrade (D-04 / AUTH-126-05) — every `c.json({error}, status)` call site in auth.ts**:

Current shape (auth.ts:95-187): `return c.json({ error: "..." }, status)`.
New shape: `return c.json({ error: "...", code: "..." }, status)`.

Mapping (RESEARCH AUTH-126-05 §Files to edit table):

| auth.ts line | Current | Add `code` |
|---|---|---|
| 96  | `{ error: "Registration not configured" }` (503) | (optional `SERVER_NOT_CONFIGURED` extension) |
| 103 | `{ error: "Invalid JSON body" }` (400) | `code: "INVALID_JSON"` (extension) |
| 111 | `{ error: "email and password are required" }` (400) | `code: "INVALID_REQUEST"` (extension) |
| 114 | `{ error: "Invalid email format" }` (400) | `code: "INVALID_EMAIL_FORMAT"` (LOCKED) |
| 117-120 | `Password must be N-N characters` (400) | split branch: `PASSWORD_TOO_SHORT` if < MIN, `PASSWORD_TOO_LONG` if > MAX (LOCKED) |
| 127 | `Registration is not open to this address` (403) | `code: "REG_NOT_ALLOWED"` (LOCKED) |
| 186 | `Unable to register with those credentials` (409) | `code: "EMAIL_TAKEN"` (LOCKED) |
| 195/203 | login JSON-body errors | `code: "INVALID_REQUEST"` (extension) |
| 221/226 | `Invalid credentials` (401) | `code: "INVALID_CREDENTIALS"` (LOCKED) |

**Backward-compat invariant** (CONTEXT D-04 + RESEARCH §Error-shape additivity): existing `error` strings stay BYTE-IDENTICAL. Only ADD `code`. Tests reading `body.error` keep passing.

**Allowlist sentinel `*` — AUTH-126-08** (modify `isAllowlistedEmail` at auth.ts:74-83):

Current (line 74-83):
```typescript
function isAllowlistedEmail(email: string): boolean {
  const list = process.env["VIGIL_ALLOWED_EMAILS"];
  if (!list) return false; // D-10 fail-closed
  const allowed = list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase()); // Pitfall 5
}
```

Single-line additive change (mirror RESEARCH AUTH-126-08 diff):
```typescript
  if (allowed.length === 0) return false;
  if (allowed.includes("*")) return true;          // Phase 126 (AUTH-126-08): wildcard kill-switch
  return allowed.includes(email.toLowerCase());
```

**DI-seam pattern for `verifyTurnstileToken`** (mirror `auth.ts:27-39` verbatim):
```typescript
// Apply same shape as __setSendEmailVerificationEmailForTest (auth.ts:27-39)
let verifyTurnstileTokenFn = realVerifyTurnstileToken;
export function __setVerifyTurnstileTokenForTest(fn: typeof realVerifyTurnstileToken): void {
  verifyTurnstileTokenFn = fn;
}
export function __resetVerifyTurnstileTokenForTest(): void {
  verifyTurnstileTokenFn = realVerifyTurnstileToken;
}
```

---

### MODIFIED `vigil-core/src/routes/auth.test.ts` (test, request-response)

**Analog:** `vigil-core/src/routes/forgot-password.test.ts:420-446` — the canonical Phase 117 drift-detector pattern.

**Drift-detector block — VERBATIM from `forgot-password.test.ts:420-446`**:
```typescript
// from forgot-password.test.ts:420-446
// ── AUTH-13-FP-CAP-IP-20: lock the per-IP cap constant ────────────────
it("AUTH-13-FP-CAP-IP-20: source file declares RATE_LIMIT_MAX_IP = 20 verbatim (drift detector)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "forgot-password.ts"), "utf8");
  assert.match(
    src,
    /const RATE_LIMIT_MAX_IP = 20;/,
    "forgot-password.ts must declare RATE_LIMIT_MAX_IP = 20 verbatim (Phase 117 AUTH-13 D-05 lock)",
  );
});

it("AUTH-13-FP-CAP-EMAIL-5: source file declares RATE_LIMIT_MAX_EMAIL = 5 verbatim (enum-safety lock)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "forgot-password.ts"), "utf8");
  assert.match(
    src,
    /const RATE_LIMIT_MAX_EMAIL = 5;/,
    "forgot-password.ts must declare RATE_LIMIT_MAX_EMAIL = 5 verbatim (Phase 117 AUTH-13 D-05 enum-safety guard)",
  );
});
```

For Phase 126: rename test IDs to `AUTH-126-CAP-IP-20` and `AUTH-126-CAP-EMAIL-5`; change `path.join(here, "forgot-password.ts")` → `path.join(here, "auth.ts")`; keep regex literals identical.

**Test app dispatch pattern** (mirror `auth.test.ts:26-40`):
```typescript
// from auth.test.ts:26-40 — the buildApp() + post() helper. Reuse for new tests.
function buildApp() {
  const app = new Hono();
  app.route("/v1", auth);
  return app;
}

async function post(path: string, body: unknown) {
  return buildApp().fetch(
    new Request(`http://x${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
```

For x-forwarded-for IP-cap tests, pass `headers: { "Content-Type": "application/json", "x-forwarded-for": "10.126.X.X" }` so per-IP bucket key differs across tests (test isolation — match `forgot-password.test.ts:454` pattern using `Math.random()` to pick a unique IP per test).

**`beforeEach` reset hook** (RESEARCH §R8 — mandatory):
```typescript
beforeEach(async () => {
  const { __resetRegisterBucketsForTest } = await import("./auth.js");
  __resetRegisterBucketsForTest();
});
```

Mirror the `forgot-password.test.ts` reset wiring (search the file for `__resetBucketsForTest` to find the equivalent block).

---

### MODIFIED `vigil-core/src/index.ts` (config, mount-order)

**Analog:** Self. The file establishes the mount-order convention (lines 109-168). No other in-tree analog.

**Sentry init placement — BEFORE `new Hono()`** (RESEARCH AUTH-126-04, LOAD-BEARING):
```typescript
// AT TOP of file, alongside other side-effect imports.
// Insert AFTER the JWT_SECRET / CORS guards at lines 67-82, BEFORE line 84.
import { initSentry, captureToSentry } from "./lib/sentry.js";
initSentry();  // BEFORE Hono construction so import-time errors are captured

export const app = new Hono();  // existing line 84 — unchanged
```

**Mount-order pattern — `app.use("/v1/*", requireVerifiedEmailWithGrace)`** (mirror existing dispatcher position at lines 159-168):

Current order (verbatim from `index.ts:121-181`):
```typescript
// secureHeaders (123) → timeout (129) → rateLimiter (132)
// → health route mount (135)
// → authRoutes mount (139) — register/login
// → forgotPassword/resetPassword/verifyEmail mounts (143-152)
// → bearerAuth DISPATCHER (159-168) — short-circuits public paths
// → metricsMiddleware (181)
// → protected route mounts (184+)
```

New mount: insert BETWEEN line 168 (closing brace of bearerAuth dispatcher) and line 181 (metricsMiddleware):
```typescript
// Phase 126 (AUTH-126-03 / D-02): email-verify gate with 24h grace.
// MUST mount AFTER the bearerAuth dispatcher above (line 159-168) so
// c.get("userId") is populated. MUST mount BEFORE the first protected
// route below so every /v1/* protected route inherits the gate. Mirror
// the Phase 124/125 mount-order comment block at lines 226-247.
app.use("/v1/*", requireVerifiedEmailWithGrace);
```

**onError extension pattern** (mirror `index.ts:252-260` existing block, ADD Sentry call):
```typescript
// from index.ts:252-260
app.onError((err, c) => {
  console.error("[vigil-core] unhandled error:", err);
  const userId = (c.get("userId") as number | undefined) ?? null;
  captureException(userId, err, {       // existing PostHog (preserve verbatim — CONTEXT line 138)
    route: c.req.path,
    method: c.req.method,
  });
  captureToSentry(userId, err, {        // Phase 126 (AUTH-126-04) — additive Sentry sink
    route: c.req.path,
    method: c.req.method,
  });
  return c.json({ error: "Internal server error" }, 500);
});
```

---

### NEW `vigil-pwa/src/lib/api-error-codes.ts` (utility, transform)

**Analog:** `vigil-pwa/src/api/client.ts:905-988` (`ErrorClass` type + `classifyFetchError` resolver). Same shape: structured-error-input → typed-bucket-output, with retryAfter forwarding.

**Type + resolver pattern** (mirror `client.ts:905-927`):
```typescript
// from client.ts:905-911 — discriminated union convention. Phase 126 uses
// a flat Record (lookup table) instead but the typed-shape principle holds.
export type ErrorClass =
  | { kind: 'auth' }
  | { kind: 'rate-limited'; retryAfter?: number }
  | { kind: 'upstream'; retryAfter?: number }
  | { kind: 'server' }
  | { kind: 'network' }

// from client.ts:928-988 — input: Response|Error|unknown; output: ErrorClass.
// Mirror for api-error-codes: input: {error?, code?}|null|undefined; output: ApiErrorUx.
```

**Resolver fallback semantic** (CONTEXT D-04 + RESEARCH AUTH-126-05): unknown codes fall back to raw `body.error` if present; missing both → fallback string. Apply via:
```typescript
export function resolveApiError(
  body: { error?: string; code?: string } | null | undefined,
  fallback: string,
): ApiErrorUx {
  if (body?.code && ERROR_CODE_MAP[body.code]) return ERROR_CODE_MAP[body.code];
  if (typeof body?.error === "string" && body.error.length > 0) return { message: body.error };
  return { message: fallback };
}
```

This matches `classifyFetchError` defense-in-depth pattern (`client.ts:928-988` tries header, then body field, then default bucket).

---

### MODIFIED `vigil-pwa/src/pages/AuthPage.tsx` (component, request-response)

**Analog:** Self. The four error-collapse sites (lines 53, 76-77, 86-87, 103) are the regression targets. R2 in RESEARCH §Risks: lines 53, 76-77, 86-87 need parse-and-resolve; line 103 (catch block) KEEPS `GENERIC_ERROR` because network throws have no body.

**Existing collapse pattern** (auth.ts:52-54):
```typescript
// from AuthPage.tsx:46-54 (login mode)
const res = await fetch(`${API_BASE}/v1/auth/login`, { ... });
if (!res.ok) {
  setError(GENERIC_ERROR);   // ← regression target
  return;
}
```

**New parse-and-resolve pattern** (RESEARCH AUTH-126-05 §Files to edit):
```typescript
if (!res.ok) {
  const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
  const ux = resolveApiError(body, GENERIC_ERROR);
  setError(ux.message);
  return;
}
```

Apply at three sites (lines 53, 76-77, 86-87). Line 103 (catch block) — DO NOT TOUCH; that path has no Response to parse.

**Form-field addition pattern** (mirror existing email/password field at lines 136-148):
```tsx
// from AuthPage.tsx:136-148
<label className="block text-sm text-gray-400 mb-2" htmlFor="email">
  Email
</label>
<input
  id="email"
  type="email"
  placeholder="you@example.com"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  autoComplete={isLogin ? 'email' : 'email'}
  className="w-full px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded text-white placeholder-gray-400 focus:outline-none focus:border-teal-600"
  disabled={loading}
/>
```

For Turnstile widget: mount BETWEEN password field (line 161 close) and Forgot-password link (line 165), GATED behind `!isLogin` (signup mode only per RESEARCH §Open-Q-3). Use same Tailwind spacing rhythm.

**Footer-link pattern** (mirror toggle-mode block at lines 188-196):
```tsx
// from AuthPage.tsx:188-196
<div className="mt-4 text-center">
  <button
    type="button"
    onClick={toggleMode}
    className="text-sm text-gray-400 hover:text-gray-200"
  >
    {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
  </button>
</div>
```

Apply same `<div className="mt-4 text-center"> <Link to=...> </Link> </div>` pattern for `/legal/privacy` + `/legal/terms` footer links. Use `text-sm text-gray-400 hover:text-gray-200` for visual consistency.

---

### MODIFIED `vigil-pwa/src/App.tsx` (config, router)

**Analog:** Self. Lines 66-76 already establish the pattern for sibling-of-auth public routes (forgot, reset, verify).

**Public-route sibling pattern** (mirror `App.tsx:66-76` verbatim):
```tsx
// from App.tsx:66-76
{/* Phase 112 (AUTH-10) — sibling unauthenticated routes for the forgot-
    password flow. OUTSIDE the protected Layout cluster (no isAuthenticated
    guard): users hitting reset links are by definition not logged in. */}
<Route path="/auth/forgot" element={<ForgotPasswordPage />} />
<Route path="/auth/reset" element={<ResetPasswordPage />} />
<Route path="/auth/verify" element={<VerifyEmailPage />} />
```

Phase 126 ADD (siblings, outside `isAuthenticated` guard):
```tsx
<Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
<Route path="/legal/terms" element={<TermsOfServicePage />} />
```

Vercel SPA rewrite already handles deep-linking (RESEARCH §R10 — `vercel.json` rewrites `/(.*)` → `/`).

---

### MODIFIED `vigil-pwa/src/main.tsx` (config, side-effect init)

**Analog:** Self — line 4 establishes the side-effect-import convention for analytics SDK init.

**Side-effect import pattern** (mirror `main.tsx:4`):
```typescript
// from main.tsx:4
import './analytics/posthog' // D-14: side-effect import — posthog.init() fires before React renders
```

Phase 126 ADD: Sentry init BEFORE `createRoot` per RESEARCH §2 + DSN env-gate:
```typescript
import * as Sentry from "@sentry/react";
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}
```

Place ABOVE existing line 4 (or right below — order between posthog and Sentry doesn't matter, only the BEFORE-createRoot constraint matters).

---

### MODIFIED `vigil-pwa/src/components/ErrorBoundary.tsx` (component, event-driven)

**Analog:** Self — line 19-21 already calls `captureException` from PostHog wrapper.

**Existing capture-from-boundary pattern** (mirror `ErrorBoundary.tsx:19-21`):
```typescript
// from ErrorBoundary.tsx:19-21
componentDidCatch(error: Error, _info: ErrorInfo): void {
  captureException(error, { boundary: 'root' }) // D-19
}
```

Phase 126: keep this line, ADD a Sentry sibling call:
```typescript
componentDidCatch(error: Error, _info: ErrorInfo): void {
  captureException(error, { boundary: 'root' })           // existing PostHog
  Sentry.captureException(error, { tags: { boundary: 'root' } })  // Phase 126 (AUTH-126-04)
}
```

Or — if a sibling helper is preferred — add `captureToSentry(error, context)` to a new file and call both from `componentDidCatch`. Planner discretion.

## Shared Patterns

### Mount-order convention (Phase 124/125 carryforward → Phase 126 D-02)
**Source:** `vigil-core/src/index.ts:159-168` (bearerAuth dispatcher) + `vigil-core/src/index.ts:181` (metricsMiddleware) + `vigil-core/src/index.ts:226-247` (Phase 124/125 mount-order comment block).

**Apply to:** `requireVerifiedEmailWithGrace` mount in `index.ts`, drift-detector test in `__tests__/mount-order.test.ts`.

Verbatim pattern (from `index.ts:159-168`):
```typescript
// Auth middleware — all /v1/* routes except /v1/health, register, login, and
// the Google OAuth callback require a valid API key.
app.use("/v1/*", async (c, next) => {
  if (c.req.path === "/v1/health") return next();
  if (c.req.path === "/v1/auth/google/callback") return next();
  if (c.req.path === "/v1/auth/register") return next();
  if (c.req.path === "/v1/auth/login") return next();
  if (c.req.path === "/v1/auth/forgot-password") return next();
  if (c.req.path === "/v1/auth/reset-password") return next();
  if (c.req.path === "/v1/auth/verify-email") return next();
  return bearerAuth(c, next);
});
```

For Phase 126: NEW middleware mounts AFTER this dispatcher (so `c.get("userId")` is set) and BEFORE the protected `app.route()` block starting at line 184. The bypass-list inside `requireVerifiedEmailWithGrace` itself (`isBypass`) is defense-in-depth — even if the dispatcher's exempt list grows, the middleware short-circuits independently.

**Drift-detector contract:** test asserts `app.use("/v1/*", requireVerifiedEmailWithGrace)` source position is AFTER the dispatcher (regex match indices on `index.ts` source) AND BEFORE the first protected `app.route("/v1", ...)` call. Source-content position check — same shape as the AUTH-126-CAP-IP-20 drift detector.

### Sliding-window rate-limit + in-memory Map (Phase 112/117 → Phase 126 D-03)
**Source:** `vigil-core/src/routes/forgot-password.ts:60-104` (canonical).
**Apply to:** new register rate-limit block in `vigil-core/src/routes/auth.ts`.

Already inlined verbatim above. Convention is: `Map<string, number[]>` keyed by IP-or-email, `setInterval(...).unref()` sweep, `takeSlot(map, key, now, max)` helper, `__resetBucketsForTest()` export. Phase 117 raised `RATE_LIMIT_MAX_IP` to 20 and held `RATE_LIMIT_MAX_EMAIL` at 5 — Phase 126 mirrors verbatim per D-03.

### Error-shape additivity (Phase 126 D-04)
**Source:** N/A — this is a NEW convention. The existing shape is `{error}` (auth.ts:96-186 everywhere). The new shape is `{error, code}` plus per-code metadata (`retry_after_seconds`, `verified_after_iso`).
**Apply to:** every `c.json({error}, status)` in `vigil-core/src/routes/auth.ts` + new middleware + new turnstile call sites.

**Locked enum (9 codes from CONTEXT D-04, growable per RESEARCH):**
`CAPTCHA_FAILED`, `RATE_LIMITED`, `REG_NOT_ALLOWED`, `INVALID_EMAIL_FORMAT`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `EMAIL_TAKEN`, `EMAIL_NOT_VERIFIED`, `INVALID_CREDENTIALS`.

**Drift detector:** `AUTH-126-ERROR-CODE-COVERAGE` test (RESEARCH AUTH-126-05) dispatches each failure path and asserts both `error: string` AND `code: string` keys present.

### DI seam at module scope (Phase 113 → Phase 126 AUTH-126-02)
**Source:** `vigil-core/src/routes/auth.ts:27-39` (`__setSendEmailVerificationEmailForTest`).
**Apply to:** `verifyTurnstileToken` in `auth.ts` (the call-site indirection) + the helper module itself in `vigil-core/src/lib/turnstile.ts`.

Pattern: `let realFn = importedReal; export function __setRealFnForTest(fn) { realFn = fn; } export function __resetRealFnForTest() { realFn = importedReal; }` at module scope, NOT inside the handler. Test-time patching is observable across ALL code paths that reference `realFn`.

### Sentry context property naming (Phase 103 D-01..D-04 collision avoidance)
**Source:** `vigil-core/src/analytics/posthog.ts:32-41` (`BLOCKED_PROPERTY_NAMES`).
**Apply to:** every `captureToSentry(userId, err, context)` call in `vigil-core/src/lib/sentry.ts` + existing call-site at `index.ts:255-258`.

When building Sentry `context` objects, avoid these PostHog-blocked property names: `content`, `body`, `text`, `message`, `description`, `title`, `note`, `transcript`. Prefer `route`, `method`, `userId`. The existing PostHog call site at `index.ts:255-258` uses `{route, method}` which is the correct shape; Sentry call site MUST mirror.

JSDoc must call this out per RESEARCH §R12.

### Fire-and-forget background pattern (existing — applies if any new code does async sends)
**Source:** `vigil-core/src/routes/forgot-password.ts:220-232` + `vigil-core/src/routes/auth.ts:60-72`.
**Apply to:** any new async work that should NOT block the request response (no current Phase 126 use case, but document for awareness).

```typescript
// from forgot-password.ts:230-232
sendEmailFn(user.email, resetUrl).catch((err) => {
  console.error("[forgot-password] email send failed (background):", err);
});
```

## No Analog Found

| File | Role | Data Flow | Reason | Planner Source |
|------|------|-----------|--------|----------------|
| `vigil-pwa/src/components/TurnstileWidget.tsx` | component | event-driven (3rd-party widget wrapper) | No existing 3rd-party widget wrapper in PWA. Closest is `OfflineBanner.tsx` (passive) — wrong shape. | RESEARCH §1 widget usage pattern + `@marsidev/react-turnstile` README |
| `vigil-pwa/src/pages/PrivacyPolicyPage.tsx` / `TermsOfServicePage.tsx` | component | static | No legal-page analog. Use `ForgotPasswordPage.tsx` Tailwind shell. | RESEARCH §3 hand-rolled recommendation + Tailwind classes from `min-h-screen bg-gray-900` shell |

## Wave 0 Test Files To Create

Per RESEARCH §Wave 0 Gaps — these have NO existing-test analog; copy structure from `vigil-core/src/routes/forgot-password.test.ts` (the most complete drift-detector + behavior test in-tree):

1. `vigil-core/src/lib/turnstile.test.ts` — siteverify URL literal drift detector + mocked-fetch behavior tests (DI seam)
2. `vigil-core/src/middleware/require-verified-email.test.ts` — grace-window state matrix (verified, in-grace, post-grace) + bypass-list assertions
3. `vigil-core/src/lib/sentry.test.ts` — DSN-unset no-op + `captureToSentry` shape
4. `vigil-core/src/__tests__/mount-order.test.ts` (if absent) — source-content regex against `index.ts` asserting mount positions
5. `vigil-pwa/src/lib/api-error-codes.test.ts` — vitest unit tests: known-code → mapped UX, unknown-code → raw error fallback, missing-body → fallback string
6. `vigil-pwa/src/pages/PrivacyPolicyPage.test.tsx` + `TermsOfServicePage.test.tsx` — vitest + testing-library MemoryRouter mount, assert substring "privacy" / "terms"

## Metadata

**Analog search scope:**
- `vigil-core/src/routes/` (auth.ts, forgot-password.ts, resend-verification.ts, verify-email.ts, reset-password.ts)
- `vigil-core/src/middleware/` (auth.ts, rate-limit.ts, metrics.ts)
- `vigil-core/src/lib/` (quiet-mode-suppression.ts, agent-events-bus.ts)
- `vigil-core/src/analytics/` (posthog.ts)
- `vigil-core/src/index.ts`
- `vigil-pwa/src/pages/` (AuthPage.tsx, ForgotPasswordPage.tsx, VerifyEmailPage.tsx)
- `vigil-pwa/src/components/` (ErrorBoundary.tsx)
- `vigil-pwa/src/api/client.ts` (905-988 ErrorClass)
- `vigil-pwa/src/main.tsx`, `App.tsx`
- `vigil-pwa/src/analytics/posthog.ts`

**Files scanned:** ~25
**Pattern extraction date:** 2026-05-11
**Cross-references:**
- CONTEXT.md D-01..D-04 (locked decisions)
- RESEARCH.md §Implementation Map (per-requirement diff shapes)
- RESEARCH.md §Conventions to Preserve (Phase 117 drift detectors, Phase 124/125 mount-order, Phase 113 DI seam, Phase 103 PostHog denylist)
