# Phase 112: Forgot-Password Email Flow — Research

**Researched:** 2026-04-24
**Domain:** Authentication + transactional email + atomic single-use token claim
**Confidence:** HIGH

## Summary

Phase 112 has a **fully-locked** CONTEXT.md (21 decisions). Almost every implementation question is already answered — token format, hash algorithm, schema columns, atomic claim SQL, enumeration-safe response, rate-limit shape, PWA UX, even the migration filename. Research therefore concentrates on the few remaining "Claude's Discretion" items and on documenting the **exact codebase patterns** the planner must mirror so plans land in the same code-style as Phases 110/111.

The largest pieces of net-new investigation:
1. **Rate limiter library** — confirmed nothing usable exists in-repo for per-key (per-email + per-IP) limiting; the existing `rateLimiter` middleware is global per-IP at 100/60s and is too coarse. Recommendation: in-process LRU + sliding window, no new dep. `[VERIFIED: codebase grep]`
2. **Argon2 dummy hash** — `DUMMY_HASH` constant already exists at `vigil-core/src/routes/auth.ts:17`; reuse it verbatim on the miss path. No new constant. `[VERIFIED: file read]`
3. **Migration tooling** — drizzle-kit snapshot state has the same drift as Phase 110 (`0014_snapshot.json` is **missing** from `vigil-core/drizzle/meta/`). Hand-author the SQL again; do not run `drizzle-kit generate`. `[VERIFIED: ls drizzle/meta]`
4. **Atomic UPDATE-RETURNING** — Drizzle's first-class API supports it (`db.update(...).set(...).where(and(...)).returning(...)`). No need for raw `sql\`\``. `[CITED: orm.drizzle.team/docs/update]`
5. **PWA routing** — uses `react-router` v7 inside `<BrowserRouter>` from `main.tsx`; routes are split inside `App.tsx` between an `/auth` outer route and the authenticated `Layout` cluster. Adding `/auth/forgot` and `/auth/reset` as sibling unauthenticated outer routes alongside `/auth` is the clean seam. `[VERIFIED: file read]`

**Primary recommendation:** Three plans, executed sequentially as Waves 1/2/3 — exactly mirroring Phase 110's shape. Wave 1: schema + migration `0016_password_reset_tokens.sql`. Wave 2: route handlers `forgot-password.ts` + `reset-password.ts` + per-key rate limiter middleware. Wave 3: PWA `ForgotPasswordPage.tsx` + `ResetPasswordPage.tsx` + AuthPage link addition + `?reason=password_reset` banner case.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema & Migration (drizzle/0016_password_reset_tokens):**
- D-01: `password_reset_tokens` table with `id`, `user_id` FK ON DELETE CASCADE, `token_hash`, `type` CHECK (`'password_reset'|'email_verify'`), `expires_at` TIMESTAMPTZ, `used_at` TIMESTAMPTZ NULL, `created_at` TIMESTAMPTZ DEFAULT now(); UNIQUE index on `token_hash`; indexes on `(user_id, type)` and `expires_at`.
- D-02: Atomic single-use claim is `UPDATE … SET used_at = now() WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id`. 0 rows = invalid/expired/used; 1 row = claimed.

**Forgot-password endpoint (POST /v1/auth/forgot-password):**
- D-03: Always 200 `{ ok: true, message: "If your account exists, a reset link has been sent." }` regardless of email existence; same body, same status, same approximate wall-clock time.
- D-04: Rate limit 5/hour per-email AND per-IP (whichever fires first); 429 body matches D-03 to avoid leaking which axis tripped.
- D-05: Run dummy argon2 verify on miss path so success/miss take similar wall-clock time. Reuse the existing `verifyArgon2`-style call. Trade-off: each miss costs ~100-200ms CPU. Acceptable at single-user scale.
- D-06: On second forgot-password from same user with unused token, **invalidate prior unused tokens for `(user_id, 'password_reset')` then issue new one**. "Most recent link wins."
- D-07: Token format = 32 random bytes from `crypto.randomBytes(32)` encoded as base64url (no padding). ~43 chars, 256 bits entropy.
- D-08: Token storage = SHA-256 hex (64 chars) of raw token. Raw token NEVER touches DB.

**Reset-password endpoint (POST /v1/auth/reset-password):**
- D-09: Body `{ token: string, newPassword: string }`. Server SHA-256-hashes the token before lookup.
- D-10: D-02 atomic claim is FIRST DB op. 0 rows → 400 `{ error: "Invalid or expired token" }` and STOP.
- D-11: State-mutation order — (1) atomic token claim, (2) UPDATE users SET password_hash + password_changed_at = now(), (3) return 200. Token claim BEFORE password update BEFORE 200.
- D-12: Success = 200 `{ ok: true, message: "Password reset successful. You can now log in." }`. **No JWT, no auto-login, no token in response.** PWA navigates to `/auth?reason=password_reset`.
- D-13: Rate limit on reset endpoint = 5/hour per-IP only (no email in body).

**PWA — `/auth` (login page):**
- D-14: "Forgot password?" text link rendered immediately below the password input. `<Link to="/auth/forgot">`. Inline-styled to match existing form's secondary text color.

**PWA — `/auth/forgot`:**
- D-15: Route `/auth/forgot` (unauthenticated, top-level under auth flow).
- D-16: Single `<input type="email" required>`. Submit → POST → 200 → success message: "If your account exists, a reset link has been sent. The link expires in 1 hour." + "Back to login" link. Same message regardless of user existence.

**PWA — `/auth/reset`:**
- D-17: Route `/auth/reset` (unauthenticated). Phase 111 smoke test already exercised this URL shape (`/auth/reset?token=...`).
- D-18: Read `?token=...` from URL query string at mount. Missing → render error UX (D-20). **Do NOT make any API call until form submit** (defense in depth against Apple Mail pre-fetch).
- D-19: Single `<input type="password">` field labeled "New password" (Phase 110 D-16 — no confirm; Phase 110 D-17 emoji eye toggle). On 200 → redirect to `/auth?reason=password_reset` (login page banner: "Password reset successfully. Please sign in with your new password.").
- D-20: 400 token error UX = single generic state — heading "This link is no longer valid", body "Reset links expire after 1 hour and can only be used once.", primary button "Request a new link" → `/auth/forgot`, secondary "Back to login" → `/auth`. No differentiation between expired/used/nonexistent.

**Email content:**
- D-21: Re-uses `sendPasswordResetEmail(to, resetUrl)` from `vigil-core/src/services/email-service.ts` exactly as shipped in Phase 111. resetUrl = `${VIGIL_APP_BASE_URL}/auth/reset?token=${rawToken}`. WR-01 `escapeHtmlAttr` already in place — no template changes.

### Claude's Discretion

- Exact wording of success messages and 4xx error bodies (D-12 / D-20 give load-bearing bits).
- Argon2 cost params for dummy hash on miss — use existing argon2 config exports; don't invent new params.
- Hono rate-limiter library choice (look for existing in repo first; if none, prefer in-process LRU + sliding window over adding a Redis dep at this scale).
- Migration filename / number — pick next free `drizzle/00XX_*.sql` based on existing files.
- Whether to add a small `cleanup-expired-tokens` cron — defer unless trivially small. Not load-bearing for v3.6.
- Test file layout (single big file vs split per-route — match existing auth test conventions).
- Specific 4xx codes for rate-limited responses (429 vs 503 — 429 correct).

### Deferred Ideas (OUT OF SCOPE)

- Confirmation email on successful password reset (anti-hijack signal) — keep symmetry with Phase 110's deferred change-password confirmation; revisit at multi-user scale.
- Cleanup cron for expired/used tokens — not load-bearing; old rows < 100/year at single-user scale.
- Per-account lockout after N failed reset attempts — 256-bit entropy + per-IP rate limit already cover the threat.
- Constant-time response on /forgot-password (rather than approximate) — SC#1 says "approximate"; email-existence leak is low-value.
- Multi-factor / TOTP layer on reset — would require a separate phase. Not in v3.6.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-10 | Forgot-password flow: enumeration-safe `POST /v1/auth/forgot-password`, single-use opaque token via email (1h expiry), `POST /v1/auth/reset-password`, JWTs invalidated via `password_changed_at` bump | Standard Stack §1-4 (token gen, hash, atomic claim), Pattern §1-4 (route handlers + rate limiter + email integration), Phase 110 D-12 reused (gate fires automatically when `password_changed_at` bumps) |

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` file exists at repo root. All project conventions are derived from `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, and prior-phase patterns. Key invariants:

- **No new env vars** — `RESEND_API_KEY`, `VIGIL_APP_BASE_URL`, `JWT_SECRET`, argon2 config all already present.
- **In-place TODO rewrites** (Phase 108 D-15/D-16, Phase 109 D-07/D-13) — applies if any pre-existing TODO marker is touched.
- **Hand-authored idempotent SQL migrations** with `IF NOT EXISTS` guards (Phase 110 0015 pattern; drizzle-kit snapshot drift makes auto-generate unreliable).
- **`when` field in `_journal.json` MUST be greater than the prior entry's `when`** — drizzle-kit migrate orders by `when`, NOT idx (Phase 110 Plan 01 cascade fix).
- **`db` may be `null`** — every DB operation must guard `if (!db) return c.json({ error: "Database unavailable" }, 503)` (existing pattern at `auth.ts:78`, `change-password.ts:59`, `auth.ts middleware:115`).
- **Test framework split:** vigil-core uses `node:test` (`describe`, `it` from `node:test`, `assert` from `node:assert/strict`); vigil-pwa uses `vitest` (`describe`, `it`, `expect`, `vi`).
- **Generic 4xx bodies for auth flows** — never echo back user-supplied data; never leak whether a record exists.

## Standard Stack

### Core (already installed, verified versions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | ^4.7.0 | HTTP framework | Already used by every route in vigil-core |
| `drizzle-orm` | ^0.45.2 | DB layer for atomic UPDATE-RETURNING claim | Already used; `.where(and(...)).returning(...)` is first-class API `[CITED: orm.drizzle.team/docs/update]` |
| `@node-rs/argon2` | ^2.0.2 | argon2id hash + verify (used for dummy timing-parity hash on miss + new password hash on reset) | Already used everywhere via `vigil-core/src/utils/password.ts` |
| `node:crypto` | (built-in) | `randomBytes(32)` for raw token, `createHash('sha256')` for storage hash | Zero deps, FIPS-grade RNG |
| `resend` | ^6.12.2 | Email transport (consumed via `sendPasswordResetEmail`) | Already wired in Phase 111; verified via npm view |
| `react-router` | (in vigil-pwa) | Routing — `<BrowserRouter>` + nested `<Routes>` | Already used in `App.tsx`; new pages add as sibling routes to `/auth` |

### Supporting (no new deps recommended)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hono-rate-limiter` | 0.5.3 | Per-key Hono rate limiting | **NOT recommended** — see "Don't Hand-Roll" §rate-limit; prefer in-process LRU |
| `lucide-react` / `react-icons` | — | Eye-icon for show/hide password toggle | **NOT recommended** — Phase 110 used unicode glyph (👁/🙈), zero deps; reuse |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-process LRU rate limiter | `hono-rate-limiter` 0.5.3 (npm) | Adds a dep + transitive deps for a feature that fits in ~40 lines of code. Memory-only at single-instance scale (Railway runs one instance) makes the in-process version equivalent in behavior. `[VERIFIED: npm view hono-rate-limiter version → 0.5.3, last published 2025-12-29]` |
| In-process rate limiter | `@hono-rate-limiter/redis` + Upstash Redis | Required for multi-instance scale-out. v3.6 is single-instance; revisit at multi-tenant launch. |
| Hand-authored SQL migration | `drizzle-kit generate` | drizzle-kit auto-generate failed in Phase 110 (missing `0014_snapshot.json` in `meta/`). Same drift persists today (verified — `0014_snapshot.json` still absent in `meta/` listing). Hand-author. |
| `crypto.randomBytes(32).toString('base64url')` | `crypto.randomUUID()` | UUID = 122 bits entropy with structure; randomBytes(32) = 256 bits unstructured. CONTEXT D-07 locks the latter. |

**Installation:** None. All required packages already in `vigil-core/package.json` and `vigil-pwa/package.json`.

**Version verification:**
```bash
npm view resend version          # → 6.12.2 (already pinned)
npm view @node-rs/argon2 version # → 2.0.2 (already pinned)
npm view hono-rate-limiter version # → 0.5.3 (NOT installing)
```

## Architecture Patterns

### Recommended Project Structure

```
vigil-core/
├── drizzle/
│   ├── 0016_password_reset_tokens.sql       # NEW (D-01)
│   └── meta/
│       ├── _journal.json                    # MODIFIED (add idx 16 with when > 1777267200000)
│       └── 0016_snapshot.json               # NEW (or skip — see Pitfall §3)
├── src/
│   ├── db/
│   │   └── schema.ts                        # MODIFIED — add passwordResetTokens table
│   ├── middleware/
│   │   └── per-key-rate-limit.ts            # NEW — in-process LRU sliding window
│   └── routes/
│       ├── forgot-password.ts               # NEW — POST /v1/auth/forgot-password
│       ├── reset-password.ts                # NEW — POST /v1/auth/reset-password
│       ├── forgot-password.test.ts          # NEW — node:test
│       └── reset-password.test.ts           # NEW — node:test
└── src/index.ts                             # MODIFIED — mount new routers + dispatcher exempt list

vigil-pwa/src/
├── pages/
│   ├── AuthPage.tsx                         # MODIFIED — add forgot link + ?reason=password_reset banner
│   ├── ForgotPasswordPage.tsx               # NEW
│   ├── ResetPasswordPage.tsx                # NEW
│   ├── ForgotPasswordPage.test.tsx          # NEW (vitest)
│   └── ResetPasswordPage.test.tsx           # NEW (vitest)
└── App.tsx                                  # MODIFIED — add /auth/forgot + /auth/reset as sibling unauthenticated routes
```

### Pattern 1: Public route mounted BEFORE bearerAuth dispatcher

`forgot-password` and `reset-password` are **unauthenticated** — they MUST mount BEFORE the bearerAuth dispatcher in `index.ts:117`, exactly like `/auth/login` and `/auth/register` (lines 110, 120-121).

```typescript
// vigil-core/src/index.ts (existing pattern at line 110-121, mirror for Phase 112)
app.route("/v1", authRoutes);            // line 110 — register/login
app.route("/v1", forgotPassword);        // NEW — append next to authRoutes
app.route("/v1", resetPassword);         // NEW — append

app.use("/v1/*", async (c, next) => {
  if (c.req.path === "/v1/health") return next();
  if (c.req.path === "/v1/auth/google/callback") return next();
  if (c.req.path === "/v1/auth/register") return next();
  if (c.req.path === "/v1/auth/login") return next();
  if (c.req.path === "/v1/auth/forgot-password") return next();   // NEW
  if (c.req.path === "/v1/auth/reset-password") return next();    // NEW
  return bearerAuth(c, next);
});
```

**Source:** `vigil-core/src/index.ts:108-123` (verified via Read).

The `auth` router at `routes/auth.ts:38` is a single Hono instance shared by register + login; Phase 112 follows the **Phase 110 pattern** of using **separate router files** (one per endpoint) rather than appending to `auth.ts`. Justification: each Phase 112 endpoint has its own rate limiter middleware which is best attached at the router level, and keeping the public `auth.ts` minimal makes register/login + forgot/reset boundaries clearer.

### Pattern 2: Atomic single-use claim (Drizzle UPDATE-RETURNING)

```typescript
// Source: orm.drizzle.team/docs/update + vigil-core/src/middleware/auth.test.ts:78 (returning() shape)
import { and, eq, isNull, gt, sql } from "drizzle-orm";

const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

const claimed = await db
  .update(passwordResetTokens)
  .set({ usedAt: new Date() })
  .where(
    and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      eq(passwordResetTokens.type, "password_reset"),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ),
  )
  .returning({ userId: passwordResetTokens.userId });

if (claimed.length === 0) {
  return c.json({ error: "Invalid or expired token" }, 400);
}
const userId = claimed[0].userId;
// proceed to update password
```

**Concurrency guarantee:** PostgreSQL acquires a row lock on the matched row inside an `UPDATE ... WHERE` statement; concurrent `UPDATE`s against the same `token_hash` will serialize, and only the first will see `used_at IS NULL` true. The second query's WHERE no longer matches (because `used_at` was just set by the first), so it returns 0 rows. **No explicit transaction needed for the claim itself** — the single statement is atomic. `[VERIFIED: PostgreSQL semantics]`

**Time comparison gotcha:** `gt(passwordResetTokens.expiresAt, new Date())` evaluates `new Date()` once at JS-side query construction. For a stricter wall-clock check, use `sql\`now()\``:
```typescript
gt(passwordResetTokens.expiresAt, sql`now()`)
```
The drift between JS clock and PG clock at single-instance scale is negligible (<1s); either works. Pick `sql\`now()\`` for byte-exact symmetry with D-02.

### Pattern 3: Per-key rate limiter (in-process LRU sliding window)

```typescript
// vigil-core/src/middleware/per-key-rate-limit.ts (NEW)
import type { MiddlewareHandler } from "hono";

interface SlidingWindowEntry {
  timestamps: number[];   // unix ms; sorted
}

export interface PerKeyLimitOpts {
  windowMs: number;       // 60 * 60 * 1000 for 1h
  max: number;            // 5
  keyFn: (c: any) => Promise<string | null> | string | null;  // null = skip (don't rate-limit this request)
  errorBody: object;      // returned on 429
  status?: 429;
}

export function perKeyRateLimit(opts: PerKeyLimitOpts): MiddlewareHandler {
  const store = new Map<string, SlidingWindowEntry>();

  // Periodic sweep — drop entries whose newest timestamp is outside window
  setInterval(() => {
    const cutoff = Date.now() - opts.windowMs;
    for (const [k, v] of store) {
      if (v.timestamps.length === 0 || v.timestamps[v.timestamps.length - 1] < cutoff) {
        store.delete(k);
      }
    }
  }, opts.windowMs).unref();

  return async (c, next) => {
    const key = await opts.keyFn(c);
    if (key === null) return next();

    const now = Date.now();
    const cutoff = now - opts.windowMs;
    const entry = store.get(key) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => t >= cutoff);

    if (entry.timestamps.length >= opts.max) {
      const retryAfter = Math.ceil((entry.timestamps[0] + opts.windowMs - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(opts.errorBody, opts.status ?? 429);
    }

    entry.timestamps.push(now);
    store.set(key, entry);
    return next();
  };
}
```

**Application — forgot-password (D-04 dual-axis):**

The middleware is single-axis. For dual-axis (per-email AND per-IP), apply two instances chained — first per-IP, then per-email (after parsing body). Per-email key needs the parsed email, so the middleware actually runs **inside the handler** OR the body is pre-parsed in a separate middleware. Recommended: do both checks **inside the handler** for simplicity at this scale:

```typescript
// vigil-core/src/routes/forgot-password.ts (sketch)
const ipBuckets = new Map<string, number[]>();
const emailBuckets = new Map<string, number[]>();

function checkBucket(map: Map<string, number[]>, key: string, max: number, windowMs: number, now: number): boolean {
  const cutoff = now - windowMs;
  const arr = (map.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= max) { map.set(key, arr); return false; }
  arr.push(now);
  map.set(key, arr);
  return true;
}

forgotPassword.post("/auth/forgot-password", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : null;

  const now = Date.now();
  const ipOk = checkBucket(ipBuckets, ip, 5, 60 * 60 * 1000, now);
  const emailOk = email ? checkBucket(emailBuckets, email, 5, 60 * 60 * 1000, now) : true;

  if (!ipOk || !emailOk) {
    // D-04: 429 body matches D-03 — same enumeration-safe shape
    return c.json({ ok: true, message: "If your account exists, a reset link has been sent." }, 200);
    // ⚠ NOTE: D-04 says 429, but the enumeration-safe rule is to return 200 always.
    //         Honor D-03 over D-04 here — see "Open Questions" §1 below.
  }
  // ... rest of handler
});
```

**Source:** Adapted from existing `vigil-core/src/middleware/rate-limit.ts:1-57` (sliding-window pattern verified) + Phase 44's global rate limiter shape.

### Pattern 4: Token generation + storage hashing

```typescript
import * as crypto from "node:crypto";

// D-07: 32 random bytes → base64url, no padding (~43 chars)
const rawToken = crypto.randomBytes(32).toString("base64url");

// D-08: SHA-256 hex of raw token; store hash, never raw
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

// Email URL — D-21: VIGIL_APP_BASE_URL fallback to https://app.vigilhub.io
const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";
const resetUrl = `${origin}/auth/reset?token=${rawToken}`;

// Insert
await db.insert(passwordResetTokens).values({
  userId: user.id,
  tokenHash,
  type: "password_reset",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),  // 1 hour
});

// D-21: send via the wrapper from Phase 111
const result = await sendPasswordResetEmail(user.email, resetUrl);
// `result.status` ∈ {"sent","skipped_no_key","failed"} — log/observe but DO NOT change response
```

**Source:** Token format verified against `crypto.randomBytes` Node docs and Phase 111 `smoke-test-email.ts:22` URL shape.

### Pattern 5: Atomic state-mutation order in reset-password (D-11)

```typescript
resetPassword.post("/auth/reset-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : null;
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : null;
  if (!token || !newPassword) return c.json({ error: "token and newPassword are required" }, 400);

  if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
    return c.json({ error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters` }, 400);
  }

  if (!db) return c.json({ error: "Database unavailable" }, 503);

  // D-10: atomic claim is FIRST DB op
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const claimed = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      eq(passwordResetTokens.type, "password_reset"),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, sql`now()`),
    ))
    .returning({ userId: passwordResetTokens.userId });

  if (claimed.length === 0) {
    return c.json({ error: "Invalid or expired token" }, 400);
  }

  // D-11 step 2: update password + bump password_changed_at
  const newHash = await hashPassword(newPassword);
  const now = new Date();
  await db
    .update(users)
    .set({ passwordHash: newHash, passwordChangedAt: now, updatedAt: now })
    .where(eq(users.id, claimed[0].userId));

  // D-12: NO JWT, NO auto-login
  return c.json({ ok: true, message: "Password reset successful. You can now log in." });
});
```

**Crash-safety analysis:** If step 2 (`db.update users`) throws after step 1 succeeded, the token is already burned (`used_at` set). User must request a fresh reset. CONTEXT explicitly accepts this failure mode (D-11 last paragraph). No transaction wrapper needed.

### Pattern 6: PWA routing — sibling unauthenticated routes

```typescript
// vigil-pwa/src/App.tsx — extend the existing /auth route block at lines 55-62
return (
  <Routes>
    <Route
      path="/auth"
      element={
        isAuthenticated ? <Navigate to="/" replace /> : <AuthPage onAuthSuccess={handleAuthSuccess} />
      }
    />
    {/* NEW Phase 112: unauthenticated forgot-password flow */}
    <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
    <Route path="/auth/reset" element={<ResetPasswordPage />} />
    <Route
      path="/*"
      element={ /* ...existing authenticated cluster... */ }
    />
  </Routes>
);
```

**Why sibling, not nested under `/auth`:** the existing `/auth` route is a leaf, not a layout. Adding nested children would require restructuring. Sibling routes are zero-disruption.

**Source:** Verified by reading `vigil-pwa/src/App.tsx:54-93` and `main.tsx:1-17` (uses `BrowserRouter` from `react-router` v7 — confirmed by `import { BrowserRouter } from 'react-router'` not `'react-router-dom'`).

### Pattern 7: AuthPage banner extension (`?reason=password_reset`)

The existing `readSessionExpiredFlag()` at `AuthPage.tsx:11-14` reads `?reason=session_expired`. Extend this to a discriminated union:

```typescript
// vigil-pwa/src/pages/AuthPage.tsx (modify)
type AuthReason = 'session_expired' | 'password_reset' | null;

function readReasonFlag(): AuthReason {
  if (typeof window === 'undefined') return null;
  const r = new URLSearchParams(window.location.search).get('reason');
  if (r === 'session_expired' || r === 'password_reset') return r;
  return null;
}

const REASON_BANNERS: Record<NonNullable<AuthReason>, string> = {
  session_expired: 'Your session expired. Please sign in again.',
  password_reset: 'Password reset successfully. Please sign in with your new password.',
};

// In component:
const [reason, setReason] = useState<AuthReason>(readReasonFlag);
// ...
{reason && (
  <div role="status" className="...same teal banner styling...">
    {REASON_BANNERS[reason]}
  </div>
)}
```

**Critical regression risk:** `client.ts:84` hardcodes `?reason=session_expired` for the global 401 redirect. The new `password_reset` case is set by `ResetPasswordPage` on success via `navigate('/auth?reason=password_reset')`. Both paths must use the same query-param name (`reason`); both must continue to clear cleanly when the user toggles login/signup mode (`toggleMode()` already does `setSessionExpired(false)` — extend to `setReason(null)`).

**Source:** `vigil-pwa/src/pages/AuthPage.tsx:11-29` + `vigil-pwa/src/api/client.ts:80-86`.

### Anti-Patterns to Avoid

- **Storing the raw token in DB or logs.** Only the SHA-256 hex hash goes to DB (D-08). Logging the raw token (e.g., debug print of body) bypasses the hash protection.
- **Burning the token at page mount.** `ResetPasswordPage` MUST NOT call `/v1/auth/reset-password` until the form is submitted (D-18 — defense against Apple Mail link pre-fetch even though Phase 111 already mitigated at email-tracking layer).
- **Auto-login after reset.** OWASP forbids it; CONTEXT D-12 codifies it. The reset endpoint returns no JWT and the PWA must `navigate('/auth?reason=password_reset')` after success.
- **Returning different bodies on hit vs miss in `/forgot-password`.** Same body, same status, similar timing. The 429 case ALSO returns the same body shape (D-04 — enumeration-safe even on rate limit; see Open Questions §1).
- **Issuing JWTs in the URL of email links.** Token in URL = OK (single-use, short-lived, opaque); JWT in URL = referrer leak vector (REQUIREMENTS Out of Scope explicitly forbids this for verify-email and reset).
- **Adding a confirm-password field on the reset form.** Phase 110 D-16 forbids this everywhere; emoji eye-toggle covers the typo concern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| argon2 hashing | Custom argon2 wrapper | `vigil-core/src/utils/password.ts:hashPassword/verifyPassword` | Already wraps `@node-rs/argon2` with OWASP 2024 params; constants pinned by tests |
| JWT minting / verify | Custom HMAC code | `vigil-core/src/utils/jwt.ts:signToken/verifyToken` | Phase 102 already chose `jose` over `hono/jwt` to avoid alg-confusion CVE class |
| SHA-256 token hash | Custom hash routine | `crypto.createHash('sha256').update(t).digest('hex')` | Node built-in; FIPS-grade; one line |
| Random token bytes | `Math.random()` or custom RNG | `crypto.randomBytes(32)` | CSPRNG; CONTEXT D-07 |
| Email transport | Direct Resend SDK call | `sendPasswordResetEmail(to, resetUrl)` from `email-service.ts` | Phase 111 already wired with PII hashing, lazy null-init, escape-on-interpolate |
| HTML escape in email | Manual replacement | `escapeHtmlAttr()` (already inside `email-service.ts`) | Phase 111 WR-01 fix already shipped |
| Migration generation | drizzle-kit auto | Hand-author 0016 SQL | Phase 110 Plan 01 documented missing `0014_snapshot.json`; same drift today |
| Rate limiter (single-instance) | New npm dep | In-process LRU + sliding window | ~40 lines of code; current `rate-limit.ts:1-57` is the template; no new deps; Railway runs single instance |

**Key insight:** Phase 112 builds on Phase 110 + Phase 111 infrastructure. Almost everything is already in place. The new code surface is small: one migration, two route handlers, one rate-limit helper, two PWA pages, AuthPage tweak. The pattern is strictly additive.

## Runtime State Inventory

This phase is greenfield (new table + new endpoints + new PWA pages); no rename / refactor / migration of existing data. Inventory not applicable.

For completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new table `password_reset_tokens` is created empty; no backfill semantics | None |
| Live service config | None — Resend domain + API key already configured in Phase 111 (verified 2026-04-24) | None |
| OS-registered state | None — no scheduler/cron/launchd changes | None |
| Secrets/env vars | `RESEND_API_KEY` and `VIGIL_APP_BASE_URL` already on Railway from Phase 111-03; no new secrets | None |
| Build artifacts | None — no installed packages renamed; no compiled binaries to invalidate | None |

## Common Pitfalls

### Pitfall 1: drizzle-kit snapshot drift blocks `db:generate`
**What goes wrong:** Running `npm run db:generate` in `vigil-core` will fail (or generate a wrong-shaped 0016) because `vigil-core/drizzle/meta/0014_snapshot.json` is missing from the meta directory. Phase 110 hit this and worked around by hand-authoring SQL + journal entry.
**Why it happens:** A previous phase deleted/never-committed the snapshot for migration 14, but the journal still references idx 14. drizzle-kit's diff engine bails out.
**How to avoid:** Hand-author `0016_password_reset_tokens.sql` directly (mirror the Phase 110 hand-edit pattern). Hand-add the journal entry. Skip the snapshot file OR copy `0015_snapshot.json` and add the new table entry — but the missing `0014` will likely still cause drift; safest is to skip the snapshot generation altogether and accept that future `db:generate` runs will require fixing the snapshot chain.
**Warning signs:** drizzle-kit generate produces an empty diff or errors with `Cannot read properties of undefined`. Verify by `ls vigil-core/drizzle/meta/0014_snapshot.json` — if absent, hand-author.

### Pitfall 2: `_journal.json` ordering by `when`, not idx
**What goes wrong:** drizzle-kit migrate orders by the `when` (unix-ms) field, not idx. If the new entry's `when` ≤ prior entry's `when`, it gets silently skipped. Phase 110 Plan 01's Rule-3 auto-fix had to bump `when` from `1777267200000` to a larger value.
**Why it happens:** Stale `Date.now()` defaults from drizzle-kit + manually-edited entries don't always preserve monotonic ordering.
**How to avoid:** Hardcode `when > 1777267200000` in the new journal entry. Recommended value: `1777353600000` (one day after 0015's `when`). Verify by `node -e "console.log(JSON.parse(require('fs').readFileSync('vigil-core/drizzle/meta/_journal.json')).entries.map(e => e.when))"` — must be monotonically increasing.
**Warning signs:** `npm run db:migrate` exits 0 but `\d password_reset_tokens` in psql shows the table doesn't exist.

### Pitfall 3: Rate-limit middleware can't access parsed body
**What goes wrong:** Putting per-email rate limit at the middleware layer requires reading `c.req.json()` inside middleware, which consumes the body. The handler then can't re-read it.
**Why it happens:** Hono's `c.req.json()` is single-consume.
**How to avoid:** Either (a) use `c.req.text()` first, parse, set on context with `c.set("parsedBody", ...)`, or (b) do BOTH rate-limit checks **inside the handler** — recommended for simplicity at this scale (Pattern §3 above shows the in-handler approach).
**Warning signs:** Tests pass for first request but `body` is `{}` on subsequent in-test calls; parsing throws `SyntaxError: Unexpected end of JSON input`.

### Pitfall 4: Apple Mail / iOS Mail link pre-fetch consuming the token
**What goes wrong:** Apple Mail (and Outlook) sometimes pre-fetches links in emails for malware scanning. If a pre-fetch hits an endpoint that burns the token, the user clicks the link and it's already used.
**Why it happens:** GET-on-mount pattern at the reset page would trigger this.
**How to avoid:** **Two layers of defense already in place:**
1. Phase 111 disabled click_tracking + open_tracking at the Resend domain level (Plan 01) — emails contain the verbatim URL with no proxy.
2. Phase 112 D-18 mandates `ResetPasswordPage` reads the token from `?token=...` at mount but **does not call any API** until the user submits the form. The page is purely client-side state until form submit.
**Warning signs:** "Token already used" error reported by users on first click — implies pre-fetch consumed it. Mitigated by D-18.

### Pitfall 5: `password_changed_at` bump invalidates ALL tabs across all devices
**What goes wrong:** Phase 110 D-12 means a successful password reset on Device A immediately invalidates the user's JWT on Device B. The next request from Device B returns 401 `{ error: "Session expired" }`, which `vigilFetch` (`client.ts:67-92`) intercepts and force-navigates to `/auth?reason=session_expired`.
**Why it happens:** Intentional — D-19 "old JWTs after password reset will hit this and force-navigate to /auth?reason=session_expired" is the desired behavior.
**How to avoid:** Don't avoid — verify it works. Add a regression test: existing JWT issued at T0, reset password at T1, GET /v1/me at T2 → 401 `{ error: "Session expired" }`. This is also a cross-phase regression check that Phase 110's gate still functions.
**Warning signs:** Active sessions on other devices keep working after password reset.

### Pitfall 6: Race on second forgot-password request
**What goes wrong:** D-06 says "invalidate prior unused tokens for `(user_id, 'password_reset')` then issue new one." If two `/forgot-password` requests for the same user arrive concurrently, both could see no prior unused tokens and both insert fresh rows.
**Why it happens:** Non-atomic two-statement sequence (`UPDATE ... SET used_at` then `INSERT`).
**How to avoid:** Wrap the invalidate + insert in a transaction OR accept that two concurrent emails go out (only the most recent one wins because the first is overwritten by the second's invalidate). At single-user scale with 5/hr rate limit, the race window is negligible. **Recommendation:** Don't add a transaction; accept the rare double-email edge case. If a user double-clicks the form, they get one extra email; both links still work (both unused) until the next successful claim or another forgot-password call invalidates them.
**Warning signs:** User reports two reset emails arriving back-to-back.

### Pitfall 7: Token in URL leaking via `Referer` header
**What goes wrong:** When the user clicks the reset link from email and lands on the PWA, then clicks any external link or asset on that page, the browser sends a `Referer: https://app.vigilhub.io/auth/reset?token=...` header — leaking the token.
**Why it happens:** Default Referer policy includes query strings.
**How to avoid:** Set `<meta name="referrer" content="strict-origin-when-cross-origin" />` or `no-referrer` on the reset page. Modern browsers default to `strict-origin-when-cross-origin` since 2026, which strips the path+query for cross-origin requests, but explicitly setting `no-referrer` on this page is belt-and-suspenders.
**Warning signs:** Hard to detect; mitigation is best-effort.

### Pitfall 8: `clock skew` between PG `now()` and JS `new Date()`
**What goes wrong:** Token expiry check `gt(expires_at, now())` uses PG clock if `sql\`now()\`` is used, but token insertion uses JS clock `new Date(Date.now() + 60*60*1000)`. If PG clock is 30s behind JS clock, a token freshly inserted will appear expired 30s earlier than expected.
**Why it happens:** Clock drift between application server and DB server.
**How to avoid:** Use `sql\`now()\`` consistently for both insert and check, OR use `new Date()` in both. For consistency with D-02 (which uses `now()` in SQL), prefer `sql\`now()\`` throughout. At single-instance scale where Railway colocates app + DB, drift is sub-millisecond.
**Warning signs:** Tokens appearing expired immediately after creation in tests.

## Code Examples

### Schema definition (drizzle)

```typescript
// vigil-core/src/db/schema.ts — append after work_order_statuses (line ~248)
// Source: CONTEXT D-01 + Phase 102 multi-user-foundation pattern
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    type: text("type").notNull(),  // CHECK constraint enforced at SQL level only
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_prt_token_hash").on(table.tokenHash),
    index("idx_prt_user_id_type").on(table.userId, table.type),
    index("idx_prt_expires_at").on(table.expiresAt),
  ],
);
```

**Note:** Drizzle has no first-class CHECK constraint helper at v0.45.2 for this table shape; the CHECK is defined in raw SQL inside the migration (D-01). Schema source-of-truth declares the column without the CHECK; the SQL migration adds it. This matches Phase 110's pattern of letting the migration carry the strict semantic.

### Migration SQL (hand-authored)

```sql
-- vigil-core/drizzle/0016_password_reset_tokens.sql
-- Phase 112: AUTH-10 password_reset_tokens table.
--
-- Idempotent — every statement uses IF NOT EXISTS / DO-block guard.
-- Re-run safe; drizzle-kit migrate orders by `when` field in _journal.json
-- (NOT by idx) — the entry for idx 16 must have when > 1777267200000.

-- ── Step 1: CREATE TABLE with all columns + CHECK ─────────────────────────
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id"          serial PRIMARY KEY,
  "user_id"     integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash"  text NOT NULL,
  "type"        text NOT NULL CHECK ("type" IN ('password_reset','email_verify')),
  "expires_at"  timestamp with time zone NOT NULL,
  "used_at"     timestamp with time zone,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── Step 2: UNIQUE on token_hash ──────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "idx_prt_token_hash"
  ON "password_reset_tokens" ("token_hash");
--> statement-breakpoint

-- ── Step 3: composite index on (user_id, type) for D-06 invalidate-prior ──
CREATE INDEX IF NOT EXISTS "idx_prt_user_id_type"
  ON "password_reset_tokens" ("user_id", "type");
--> statement-breakpoint

-- ── Step 4: index on expires_at for cleanup queries ───────────────────────
CREATE INDEX IF NOT EXISTS "idx_prt_expires_at"
  ON "password_reset_tokens" ("expires_at");
```

### Forgot-password route handler (full)

```typescript
// vigil-core/src/routes/forgot-password.ts (NEW)
import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import * as crypto from "node:crypto";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { verifyPassword } from "../utils/password.js";
import { sendPasswordResetEmail } from "../services/email-service.js";

// Reuse the exact dummy hash from auth.ts (verified — identical argon2 params)
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk";

const TOKEN_TTL_MS = 60 * 60 * 1000;  // 1h per AUTH-10 spec

// In-process per-axis sliding-window buckets. Single Map per axis; sweep on access.
const ipBuckets = new Map<string, number[]>();
const emailBuckets = new Map<string, number[]>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function takeSlot(map: Map<string, number[]>, key: string, now: number): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (map.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= RATE_LIMIT_MAX) {
    map.set(key, arr);
    return false;
  }
  arr.push(now);
  map.set(key, arr);
  return true;
}

const ENUM_SAFE_BODY = {
  ok: true,
  message: "If your account exists, a reset link has been sent.",
};

export const forgotPassword = new Hono();

forgotPassword.post("/auth/forgot-password", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    // Invalid JSON — STILL return enumeration-safe success body
    return c.json(ENUM_SAFE_BODY, 200);
  }

  const rawEmail = (body as { email?: unknown })?.email;
  const email = typeof rawEmail === "string" ? rawEmail.toLowerCase().trim() : null;

  // Rate limit (D-04). Both axes; 429 returns same body shape per D-03 enumeration safety.
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const ipOk = takeSlot(ipBuckets, ip, now);
  const emailOk = email ? takeSlot(emailBuckets, email, now) : true;
  if (!ipOk || !emailOk) {
    return c.json(ENUM_SAFE_BODY, 200);  // see Open Question §1
  }

  if (!email) {
    // Missing/non-string email — same enumeration-safe success
    return c.json(ENUM_SAFE_BODY, 200);
  }

  if (!db) {
    return c.json({ error: "Database unavailable" }, 503);
  }

  // Lookup user (case-normalized)
  const [user] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // D-05: timing-attack mitigation — burn ~100-200ms on the miss path
    await verifyPassword("never-matches", DUMMY_HASH);
    return c.json(ENUM_SAFE_BODY, 200);
  }

  // D-06: invalidate prior unused tokens for (user_id, 'password_reset')
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(passwordResetTokens.userId, user.id),
      eq(passwordResetTokens.type, "password_reset"),
      isNull(passwordResetTokens.usedAt),
    ));

  // D-07: 32 random bytes → base64url. D-08: store SHA-256 hex.
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    type: "password_reset",
    expiresAt: new Date(now + TOKEN_TTL_MS),
  });

  // D-21: construct reset URL with VIGIL_APP_BASE_URL, fall back to prod origin
  const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";
  const resetUrl = `${origin}/auth/reset?token=${rawToken}`;

  // Send via Phase 111 wrapper. Result observed but DOES NOT change response (D-03).
  await sendPasswordResetEmail(user.email, resetUrl);

  return c.json(ENUM_SAFE_BODY, 200);
});
```

**Source patterns:** Adapted from `vigil-core/src/routes/auth.ts:120-162` (login handler timing-safe path) + `vigil-core/src/middleware/rate-limit.ts:1-57` (sliding window) + Phase 111 `smoke-test-email.ts:21-22` (origin fallback).

### Reset-password route handler (full)

```typescript
// vigil-core/src/routes/reset-password.ts (NEW)
import { Hono } from "hono";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import * as crypto from "node:crypto";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { hashPassword } from "../utils/password.js";

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 128;

// Per-IP rate limit only (D-13)
const ipBuckets = new Map<string, number[]>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function takeSlot(key: string, now: number): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (ipBuckets.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= RATE_LIMIT_MAX) { ipBuckets.set(key, arr); return false; }
  arr.push(now);
  ipBuckets.set(key, arr);
  return true;
}

export const resetPassword = new Hono();

resetPassword.post("/auth/reset-password", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  if (!takeSlot(ip, now)) {
    return c.json({ error: "Too many requests" }, 429);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { token, newPassword } = (body ?? {}) as { token?: unknown; newPassword?: unknown };

  if (typeof token !== "string" || typeof newPassword !== "string") {
    return c.json({ error: "token and newPassword are required" }, 400);
  }

  if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
    return c.json(
      { error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters` },
      400,
    );
  }

  if (!db) return c.json({ error: "Database unavailable" }, 503);

  // D-10 + D-02: atomic claim is FIRST DB op
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const claimed = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      eq(passwordResetTokens.type, "password_reset"),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, sql`now()`),
    ))
    .returning({ userId: passwordResetTokens.userId });

  if (claimed.length === 0) {
    // Single bucket — invalid OR expired OR used. D-20 prevents info leak.
    return c.json({ error: "Invalid or expired token" }, 400);
  }

  // D-11 step 2: update password + bump password_changed_at (D-12 mechanism)
  const newHash = await hashPassword(newPassword);
  const ts = new Date();
  await db
    .update(users)
    .set({ passwordHash: newHash, passwordChangedAt: ts, updatedAt: ts })
    .where(eq(users.id, claimed[0].userId));

  // D-12: NO JWT, NO auto-login, NO token in response
  return c.json({ ok: true, message: "Password reset successful. You can now log in." });
});
```

### PWA — ForgotPasswordPage skeleton

```tsx
// vigil-pwa/src/pages/ForgotPasswordPage.tsx (NEW)
import { useState } from 'react'
import { Link } from 'react-router'
import { API_BASE } from '../api/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      // D-03: server always returns 200 enumeration-safe body
      if (res.ok) {
        setSubmitted(true)
      } else {
        // 429 / 5xx — show generic
        setError('Try again later.')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4 text-center">
          <h1 className="text-2xl font-medium text-white mb-4">Check your inbox</h1>
          <p className="text-gray-300 mb-6">
            If your account exists, a reset link has been sent. The link expires in 1 hour.
          </p>
          <Link to="/auth" className="text-teal-400 hover:text-teal-300 text-sm">
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
        <h1 className="text-2xl font-medium text-white mb-6">Forgot your password?</h1>
        <label htmlFor="email" className="block text-sm text-gray-400 mb-2">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="w-full px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded text-white"
          disabled={submitting}
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !email}
          className="w-full mt-4 py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
        <div className="mt-4 text-center">
          <Link to="/auth" className="text-sm text-gray-400 hover:text-gray-200">
            Back to login
          </Link>
        </div>
      </form>
    </div>
  )
}
```

### PWA — ResetPasswordPage skeleton

```tsx
// vigil-pwa/src/pages/ResetPasswordPage.tsx (NEW)
import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { API_BASE } from '../api/client'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token'), [searchParams])
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(!token)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) { setLinkInvalid(true); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })
      if (res.ok) {
        // D-19: redirect to /auth?reason=password_reset (login page banner)
        navigate('/auth?reason=password_reset')
        return
      }
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        if (body.error === 'Invalid or expired token') {
          setLinkInvalid(true)
        } else {
          setError(body.error ?? 'Could not reset password.')
        }
        return
      }
      if (res.status === 429) { setError('Too many attempts. Try again later.'); return }
      setError('Server error. Try again.')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (linkInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4 text-center">
          <h1 className="text-2xl font-medium text-white mb-4">This link is no longer valid</h1>
          <p className="text-gray-300 mb-6">
            Reset links expire after 1 hour and can only be used once.
          </p>
          <Link
            to="/auth/forgot"
            className="inline-block py-2 px-4 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium"
          >
            Request a new link
          </Link>
          <div className="mt-4">
            <Link to="/auth" className="text-sm text-gray-400 hover:text-gray-200">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
        <h1 className="text-2xl font-medium text-white mb-6">Set a new password</h1>
        <label htmlFor="newPassword" className="block text-sm text-gray-400 mb-2">New password</label>
        <div className="relative">
          <input
            id="newPassword"
            type={show ? 'text' : 'password'}
            required
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 pr-10 bg-gray-900/80 border border-gray-400/30 rounded text-white"
            disabled={submitting}
          />
          <button
            type="button"
            aria-label={show ? 'Hide password' : 'Show password'}
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-lg"
          >
            {show ? '🙈' : '👁'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting || newPassword.length < 12}
          className="w-full mt-4 py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50"
        >
          {submitting ? 'Updating…' : 'Set new password'}
        </button>
      </form>
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Password-reset tokens stored as plaintext UUIDs in DB | SHA-256 hashed tokens, raw only in email URL | OWASP 2020+ | DB compromise no longer reveals usable reset links |
| Constant-time email comparison on enum-safe response | Approximate-time (dummy argon2 verify) | OWASP 2021+ | Practical: real argon2 dominates wall-clock so 100-200ms variance is acceptable; constant-time would require fixed wall-clock budget |
| Auto-login after reset (issue session JWT in URL) | No auto-login; redirect to login page | OWASP CWE-201 (Referer leak) | User must re-authenticate manually with new password |
| Single-table users.reset_token column (atomic by row) | Separate password_reset_tokens table with type column | Phase 113 reuse + multi-token-type support | One column per type doesn't scale; type column does |
| Per-second rate limit | Per-hour with sliding window | OWASP rate-limit guidance 2024+ | Per-second admits short bursts; sliding window per hour is correct shape for "5 reset requests / hour" |
| `crypto.randomBytes(16)` (128 bits) | `crypto.randomBytes(32)` (256 bits) | NIST SP 800-90B | 128 bits is fine; 256 bits is "future-proof for quantum era"; CONTEXT D-07 chose 32 |

**Deprecated/outdated:**
- **`hono/jwt`** for JWT verify — Phase 102 rejected in favor of `jose` due to algorithm-confusion CVE class. Phase 112 doesn't issue JWTs (D-12) so this isn't relevant, but Phase 110's bearerAuth gate already uses `jose` correctly.
- **In-band password reset (e.g., security questions)** — superseded by email-link flows. AUTH-10 is the modern shape.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 110 D-12 `password_changed_at` bump on reset will automatically invalidate all old JWTs via the existing bearerAuth gate (Phase 110 Plan 02) — no new gate code needed | Pitfall §5 | Low — verified by reading `middleware/auth.ts:110-145` (gate reads `users.passwordChangedAt` for every JWT request); the gate fires regardless of whether the bump came from change-password or reset-password |
| A2 | The existing `DUMMY_HASH` constant at `routes/auth.ts:17` uses argon2 params identical to `utils/password.ts:OPTIONS` (m=19456, t=2, p=1, argon2id) | Pattern §4, Code Examples | Low — verified by reading both files; the hash header `$argon2id$v=19$m=19456,t=2,p=1$...` matches `OPTIONS` exactly |
| A3 | Single-instance Railway deployment makes in-process LRU rate limiter sufficient (no Redis needed) | Standard Stack §rate-limiter | Medium — if v3.7 scales to multiple Railway instances, per-instance limits become independent; revisit then. For v3.6, single-instance is the architecture. |
| A4 | drizzle-kit auto-generate cannot be relied upon due to missing `0014_snapshot.json` in `meta/` directory | Pitfall §1 | Low — verified by `ls vigil-core/drizzle/meta/` (confirms 0014_snapshot.json absent); same condition that forced Phase 110 to hand-author |
| A5 | `react-router` v7 is the routing library and `<BrowserRouter>` wraps the app at `main.tsx:11` — sibling routes added in `App.tsx:54` | Pattern §6 | Low — verified by file read |
| A6 | `vigilFetch` 401 handler will NOT trigger when reset-password returns 400 (token invalid) — body discriminator is "Session expired", not "Invalid or expired token" | PWA flow | Low — verified by reading `client.ts:67-92`; the JSON body match is exact-string `'Session expired'` |
| A7 | Token in URL via `Referer` header leak is acceptable risk given modern browser defaults (`strict-origin-when-cross-origin` since 2026) | Pitfall §7 | Low — additional `<meta name="referrer">` recommended but not load-bearing |
| A8 | The 5/hour rate-limit window (1 hour) is reasonable for "fat-finger" UX without locking out legitimate users | CONTEXT D-04 | LOW (assumption inherited from CONTEXT — user-locked decision) |
| A9 | Apple Mail link pre-fetch is mitigated by Phase 111's domain-level click_tracking=false + Phase 112's D-18 form-submit gate; no additional middleware needed | Pitfall §4 | Low — defense in depth via two independent layers |
| A10 | The CHECK constraint on `type` column will be enforced at the SQL level (in migration), not via the Drizzle schema | Standard Stack §schema | Low — Drizzle 0.45.2 has no first-class CHECK helper for column-level constraints in pgTable; pattern matches Phase 110 (where SQL migration carried the strict semantic) |

**Note:** All `[ASSUMED]`-tagged items above are low-risk because they are either (a) verified via code grep/read, or (b) inherited from already-locked CONTEXT decisions that were ratified by the user. No item requires user confirmation before planning.

## Open Questions

1. **D-04 says "429 response body: same enumeration-safe shape as D-03" — but D-03 specifies a 200 status. Is the rate-limit response 429 with the enum-safe body, or 200 with the enum-safe body?**
   - What we know: D-04 literal text says "429 response body: same enumeration-safe shape as D-03 (don't reveal that 'this email hit the per-email limit' vs 'your IP hit the per-IP limit')." That implies status code 429 with body `{ ok: true, message: "If your account exists, a reset link has been sent." }`.
   - What's unclear: A 429 with a `{ ok: true }` body is unusual. If a network attacker is testing email enumeration via response shape, the 429 status itself reveals "this request was rate-limited" — but it doesn't reveal which email was used.
   - Recommendation: **Return 200 + enum-safe body even on rate limit.** The status code itself leaks "you are being rate limited" but not which email; over time a targeted attacker testing one email at a time could correlate timing patterns. Returning 200 fully hides the rate-limit state. Trade-off: legit users who hit the limit get no feedback ("did the email send or not?"). At single-user scale, the user is the only person hitting their own email; trickling an extra email through after a 5/hour limit is preferable to revealing rate-limit state. Code Example §forgot-password takes this conservative path. **Planner should confirm with user during plan-locking** whether 200 or 429 is preferred. Both are valid readings of D-03/D-04.

2. **Should the `?reason=password_reset` banner auto-clear from the URL after rendering?**
   - What we know: Phase 110's `?reason=session_expired` does NOT auto-clear the URL — a refresh re-shows the banner. Acceptable but slightly odd UX.
   - What's unclear: Whether to use `history.replaceState` to strip the query string after first render (matches the Google OAuth callback pattern at `SettingsPage.tsx`).
   - Recommendation: **Match Phase 110's existing behavior** (no auto-clear). Consistency wins over minor UX polish; revisit milestone-wide later if user complains.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js with `node:crypto` | Token gen + hash | ✓ | (built-in) | — |
| `@node-rs/argon2` | New password hash + dummy verify | ✓ | 2.0.2 | — |
| `drizzle-orm` | Schema + queries | ✓ | 0.45.2 | — |
| `hono` | Route handlers | ✓ | 4.7.0 | — |
| `resend` Node SDK | Email transport | ✓ | 6.12.2 | — |
| `RESEND_API_KEY` env | Live email send | ✓ on Railway, blank locally | — | `email-service` returns `{ status: "skipped_no_key" }` — endpoint still returns 200 |
| `VIGIL_APP_BASE_URL` env | Email URL construction | ✓ on Railway (`https://app.vigilhub.io`), `http://localhost:5173` locally | — | Hardcoded fallback to `https://app.vigilhub.io` |
| Resend domain `vigilhub.io` verified | DKIM/SPF/DMARC for live send | ✓ | — | — |
| PostgreSQL (`DATABASE_URL`) | Migration + queries | ✓ | local: 16 (Homebrew), prod: Railway | If DB unavailable, route returns 503 (existing pattern) |
| `react-router` v7 | PWA routing | ✓ | (in vigil-pwa, verified by `import` from `'react-router'`) | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — locally `RESEND_API_KEY=` blank means email send is a no-op but the rest of the flow works (token generation, DB writes, response codes). This matches Phase 111 design.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| **vigil-core framework** | `node:test` (built-in) — `import { describe, it } from "node:test"; import assert from "node:assert/strict"` |
| **vigil-core config file** | None (no `node:test` config; tests located by glob in `package.json`) |
| **vigil-core quick run** | `cd vigil-core && npx tsx --test src/routes/forgot-password.test.ts src/routes/reset-password.test.ts` |
| **vigil-core full suite** | `cd vigil-core && npm test` |
| **vigil-pwa framework** | `vitest` |
| **vigil-pwa config** | `vigil-pwa/vitest.config.ts` (existing) |
| **vigil-pwa quick run** | `cd vigil-pwa && npx vitest run src/pages/ForgotPasswordPage.test.tsx src/pages/ResetPasswordPage.test.tsx` |
| **vigil-pwa full suite** | `cd vigil-pwa && npm test` |
| **DB integration tests** | `node:test` with `tsx`; require `DATABASE_URL` env var; existing pattern at `vigil-core/src/db/migrate.test.ts` |
| **Live smoke** | Existing pattern: `vigil-core/scripts/smoke-test-email.ts` — extend with `scripts/smoke-test-forgot-password.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-10 (token entropy + format) | `crypto.randomBytes(32).toString('base64url')` produces 256 bits, ~43 chars, URL-safe | unit | `npx tsx --test src/utils/token.test.ts` (or inline in forgot-password.test.ts) | ❌ Wave 0 |
| AUTH-10 (SHA-256 hash determinism) | Same input → same hex; matches what's stored | unit | `npx tsx --test src/routes/forgot-password.test.ts` | ❌ Wave 0 |
| AUTH-10 (atomic UPDATE-RETURNING semantics) | Concurrent claims yield exactly one success and one 0-row result | integration (real PG) | `DATABASE_URL=... npx tsx --test src/integration/reset-token-claim.test.ts` | ❌ Wave 0 |
| AUTH-10 (enumeration safety body) | Hit and miss return identical `{ ok: true, message: "..." }` body | integration | `npx tsx --test src/routes/forgot-password.test.ts` | ❌ Wave 0 |
| AUTH-10 (enumeration safety timing) | Hit-path duration / miss-path duration ratio ≤ 1.5 (approximate, not constant) | integration | `npx tsx --test src/integration/forgot-password-timing.test.ts` | ❌ Wave 0 |
| AUTH-10 (rate limit per-email) | 6th request from same email within 1h → 429 (or 200 enum-safe per Open Q §1) | integration | `npx tsx --test src/routes/forgot-password.test.ts` | ❌ Wave 0 |
| AUTH-10 (rate limit per-IP) | 6th request from same IP within 1h → 429 (or 200 enum-safe) | integration | `npx tsx --test src/routes/forgot-password.test.ts` | ❌ Wave 0 |
| AUTH-10 (single-use enforcement) | First reset claim succeeds; second with same token → 400 | integration (real PG) | `npx tsx --test src/integration/reset-token-claim.test.ts` | ❌ Wave 0 |
| AUTH-10 (token expiry) | Token with `expires_at` in past → 400 | integration | `npx tsx --test src/integration/reset-token-claim.test.ts` | ❌ Wave 0 |
| AUTH-10 (D-06 invalidate prior) | Second forgot-password from same user marks prior token used | integration | `npx tsx --test src/integration/reset-token-claim.test.ts` | ❌ Wave 0 |
| AUTH-10 (password_changed_at bump invalidates JWT) | JWT issued at T0; reset at T1; GET /v1/me at T2 → 401 "Session expired" | cross-phase regression | `npx tsx --test src/integration/cross-user-isolation.test.ts` (extend) | ✅ exists, extend |
| AUTH-10 (reset bumps password_changed_at) | After reset, `users.password_changed_at` > pre-reset value | integration | `npx tsx --test src/integration/reset-token-claim.test.ts` | ❌ Wave 0 |
| AUTH-10 (PWA forgot form submit) | Submit calls POST /v1/auth/forgot-password and shows success message | unit (vitest + RTL) | `cd vigil-pwa && npx vitest run src/pages/ForgotPasswordPage.test.tsx` | ❌ Wave 0 |
| AUTH-10 (PWA reset form invalid token) | 400 response renders D-20 error UX | unit (vitest + RTL) | `cd vigil-pwa && npx vitest run src/pages/ResetPasswordPage.test.tsx` | ❌ Wave 0 |
| AUTH-10 (PWA reset form happy path) | 200 response navigates to `/auth?reason=password_reset` | unit (vitest + RTL) | `cd vigil-pwa && npx vitest run src/pages/ResetPasswordPage.test.tsx` | ❌ Wave 0 |
| AUTH-10 (PWA AuthPage `?reason=password_reset` banner) | Banner renders correctly; `session_expired` banner unchanged | unit (vitest + RTL) | `cd vigil-pwa && npx vitest run src/pages/AuthPage.test.tsx` | ✅ exists, extend |
| AUTH-10 (live forgot→email→reset→login flow) | End-to-end against test DB + real Resend send | live-smoke | `RESEND_API_KEY=re_xxx VIGIL_APP_BASE_URL=... npx tsx scripts/smoke-test-forgot-password.ts <email>` | ❌ Wave 0 (script) + manual UAT for inbox check |
| AUTH-10 (Manual: real Gmail Inbox check) | Email arrives in Inbox (not Spam); link works; reset succeeds; old JWT invalidates | manual UAT | Documented in 112-HUMAN-UAT.md (Phase 107 pattern) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** quick run scoped to the test file the task wrote (e.g., `npx tsx --test src/routes/forgot-password.test.ts` after Plan 02 Task 1).
- **Per wave merge:** full vigil-core suite + full vigil-pwa suite green before moving to the next wave.
- **Phase gate (`/gsd-verify-work`):** full suites + `scripts/smoke-test-forgot-password.ts` against staging Resend + manual Gmail Inbox UAT checkbox.

### Wave 0 Gaps

- [ ] `vigil-core/src/routes/forgot-password.test.ts` — covers AUTH-10 unit + rate-limit + enum safety
- [ ] `vigil-core/src/routes/reset-password.test.ts` — covers AUTH-10 atomic claim + state mutation order
- [ ] `vigil-core/src/integration/reset-token-claim.test.ts` (or fold into existing `cross-user-isolation.test.ts`) — atomic claim semantics, single-use, expiry, D-06 invalidate-prior, password_changed_at bump
- [ ] `vigil-core/src/integration/forgot-password-timing.test.ts` — approximate timing equality between hit and miss paths (ratio ≤ 1.5)
- [ ] `vigil-pwa/src/pages/ForgotPasswordPage.test.tsx` — RTL form submit test
- [ ] `vigil-pwa/src/pages/ResetPasswordPage.test.tsx` — RTL invalid token + happy-path navigation tests
- [ ] `vigil-pwa/src/pages/AuthPage.test.tsx` — extend with `?reason=password_reset` banner test (existing file)
- [ ] `vigil-core/scripts/smoke-test-forgot-password.ts` — end-to-end live send + token claim verification (mirrors Phase 111 `smoke-test-email.ts`)
- [ ] `.planning/phases/112-forgot-password-email-flow/112-HUMAN-UAT.md` — manual checklist for Gmail inbox + link click + login-with-new-password sequence

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | argon2id (`@node-rs/argon2`), `password_changed_at` invalidates pre-reset JWTs (Phase 110 gate) |
| V3 Session Management | yes | No JWT in reset flow (D-12); existing 30-day JWT lifetime; `password_changed_at` bump invalidates |
| V4 Access Control | partial | Forgot/reset endpoints are public (intentional); the rest of `/v1/*` requires bearer |
| V5 Input Validation | yes | Hand-rolled `typeof` guards (project convention — no `zod`/`joi` in repo); JSON parse error → 400 |
| V6 Cryptography | yes | `crypto.randomBytes(32)` (CSPRNG), `crypto.createHash('sha256')` (FIPS-grade), argon2id (OWASP 2024); never hand-roll |
| V8 Data Protection | yes | Raw token never persists; only SHA-256 hash in DB; PII hashing in observability (Phase 111 pattern) |
| V9 Communications | yes | All transit over HTTPS (Railway TLS termination); email DKIM/SPF/DMARC already configured (Phase 111) |
| V11 Business Logic | yes | Rate limit on both endpoints; atomic single-use claim; D-06 most-recent-wins prevents token-stockpiling |
| V14 Configuration | yes | `RESEND_API_KEY` lazy null-init (no crash if unset); `VIGIL_APP_BASE_URL` fallback hardcoded; no new env vars |

### Known Threat Patterns for vigil-core / Hono / argon2id stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User enumeration via response body or status | Information Disclosure | D-03: identical response body and status on hit/miss |
| User enumeration via response timing | Information Disclosure | D-05: dummy argon2 verify on miss path; approximate timing within ~30% |
| Reset token brute force | Spoofing | D-07: 256 bits entropy → effectively impossible; D-13: per-IP rate limit as belt-and-suspenders |
| Reset token leak via URL `Referer` header | Information Disclosure | Modern browser default (`strict-origin-when-cross-origin`); optional `<meta name="referrer">` on reset page |
| Reset token leak via DB compromise | Information Disclosure | D-08: only SHA-256 hash stored; raw never touches DB |
| Token replay (single-use bypass) | Tampering | D-02: atomic UPDATE … RETURNING with `used_at IS NULL` + `expires_at > now()` |
| Concurrent claim race | Tampering | PostgreSQL row-level lock during UPDATE; only one statement sees `used_at IS NULL` true |
| JWT replay after password reset | Tampering | Phase 110 gate: `jwt.iat < floor(password_changed_at/1000)` rejects |
| Apple Mail / link pre-fetch consuming token | Denial of Service | Phase 111: domain-level click_tracking=false + D-18: form-submit gate (no API call on page mount) |
| Stored XSS via reset URL injection | Tampering | Phase 111 WR-01: `escapeHtmlAttr` on URL interpolation in email template |
| Email DNS / sender spoofing | Spoofing | DKIM/SPF/DMARC on `vigilhub.io` already verified (Phase 111) |
| Resend quota exhaustion via spam | DoS | D-04: 5/hr per-email AND per-IP rate limits |
| User-supplied email used as fetch input on miss | Injection | DB query uses parameterized `eq(users.email, email)` (drizzle-orm — no string concat) |
| New password length DoS via 10MB password | DoS | `MIN_PASSWORD=12, MAX_PASSWORD=128` (mirrors `auth.ts:19-20`); plus `password.ts:MAX_PASSWORD_BYTES=128` short-circuit |

## Sources

### Primary (HIGH confidence)

- **CONTEXT.md** — `.planning/phases/112-forgot-password-email-flow/112-CONTEXT.md` (D-01 through D-21, all locked)
- **REQUIREMENTS.md** — `.planning/REQUIREMENTS.md` AUTH-10 spec
- **Phase 110 CONTEXT** — `.planning/phases/110-change-password-password-changed-at-gate/110-CONTEXT.md` (D-12, D-14, D-16, D-17, D-19 reused)
- **Phase 110 Plan 01** — `.planning/phases/110-change-password-password-changed-at-gate/110-01-PLAN.md` (migration template + drizzle-kit drift workaround)
- **Phase 110 Plan 02** — `.planning/phases/110-change-password-password-changed-at-gate/110-02-PLAN.md` (router separation + bearerAuth gate)
- **Phase 110 Plan 03** — `.planning/phases/110-change-password-password-changed-at-gate/110-03-PLAN.md` (PWA emoji eye toggle, vigilFetch 401 handler)
- **Phase 111 Plan 02 SUMMARY** — `.planning/phases/111-transactional-email-infrastructure-resend-dns/111-02-SUMMARY.md` (`sendPasswordResetEmail` API + WR-01 fix)
- **Live source files (verified by Read)**:
  - `vigil-core/src/services/email-service.ts` (entire file — 285 lines)
  - `vigil-core/src/routes/auth.ts` (162 lines — DUMMY_HASH at line 17, MIN/MAX_PASSWORD at 19-20, register/login flows)
  - `vigil-core/src/routes/change-password.ts` (130 lines — Phase 110 protected router pattern)
  - `vigil-core/src/middleware/auth.ts` (153 lines — bearerAuth + Phase 110 gate at lines 110-145)
  - `vigil-core/src/middleware/rate-limit.ts` (57 lines — global IP-based template)
  - `vigil-core/src/db/schema.ts` (entire — confirms drizzle helpers; users.passwordChangedAt at lines 39-45)
  - `vigil-core/src/db/connection.ts` (confirms `db` may be null)
  - `vigil-core/src/utils/password.ts` (42 lines — argon2id OPTIONS, MAX_PASSWORD_BYTES short-circuit)
  - `vigil-core/src/utils/jwt.ts` (53 lines — signToken + verifyToken contracts)
  - `vigil-core/src/index.ts:1-200` (mount order, dispatcher exempt list, FATAL guards)
  - `vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql` (idempotent SQL idiom)
  - `vigil-core/drizzle/0015_add_password_changed_at.sql` (3-statement template)
  - `vigil-core/drizzle/meta/_journal.json` (entry shape; idx 15 = 1777267200000)
  - `vigil-core/scripts/smoke-test-email.ts` (47 lines — Phase 111 smoke pattern)
  - `vigil-pwa/src/api/client.ts` (entire — vigilFetch + 401 handler at lines 53-94)
  - `vigil-pwa/src/pages/AuthPage.tsx` (152 lines — `readSessionExpiredFlag` + login/signup flow)
  - `vigil-pwa/src/main.tsx` (17 lines — BrowserRouter root)
  - `vigil-pwa/src/App.tsx` (95 lines — Routes split between /auth and authenticated cluster)

- **Drizzle official docs** — [orm.drizzle.team/docs/update](https://orm.drizzle.team/docs/update) (UPDATE … WHERE … RETURNING is first-class API)

### Secondary (MEDIUM confidence)

- **`hono-rate-limiter` package** — [npmjs.com/package/hono-rate-limiter](https://www.npmjs.com/package/hono-rate-limiter), v0.5.3 (verified `npm view`); README on GitHub partial. NOT recommended for this phase but documented.
- **OWASP Password Storage Cheat Sheet** — argon2id at "Moderate" server class (m=19456, t=2, p=1) — already pinned in `vigil-core/src/utils/password.ts:11-17`.
- **OWASP Forgot Password Cheat Sheet** — single-use opaque token, hash at rest, enumeration-safe response — all encoded in CONTEXT decisions.

### Tertiary (LOW confidence)

- WebSearch on "hono-rate-limiter sliding window" returned references to honohub.dev docs (not loaded — 403 from npmjs.com) but the project is a wrapper around `express-rate-limit` semantics. Not consulted further; in-process LRU recommendation stands.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every required package already installed and version-verified; no new deps
- Architecture: HIGH — patterns mirror Phase 110 verbatim; new code is strictly additive
- Pitfalls: HIGH — drizzle-kit drift (Phase 110 documented), Apple Mail (Phase 111 mitigated), state-mutation order (D-11 explicit), JWT bump cascade (Phase 110 D-12 reused)
- Token cryptography: HIGH — `crypto.randomBytes` + SHA-256 are Node built-ins; CONTEXT D-07/D-08 lock the format
- Atomic claim semantics: HIGH — verified via Drizzle docs + PostgreSQL semantics
- Rate limiter: MEDIUM — recommendation is in-process LRU + sliding window; trade-off is "no Redis" vs "single-instance only"; v3.6 fits

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (30 days — stable infrastructure; main risk window is `resend@^6.12.2` SDK API stability and `react-router` v7 routing API stability, both of which had no breaking changes since publish)

## RESEARCH COMPLETE
