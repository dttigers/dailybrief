# Phase 113: Verify Email on Signup — Research

**Researched:** 2026-04-25
**Domain:** Auth token flow, Drizzle + Postgres migration, Hono route mounting, React PWA state
**Confidence:** HIGH — all findings verified directly against live codebase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration (D-01 through D-05):** Add `email_verified_at TIMESTAMPTZ NULL` via `IF NOT EXISTS` ALTER TABLE; backfill all pre-existing rows to `created_at` in same migration; no index; filename `0017_users_email_verified_at.sql`; Drizzle schema sync adds nullable `emailVerifiedAt` column alongside `passwordChangedAt`.

**Token issuance hook in register (D-06 through D-08):** `crypto.randomBytes(32).toString('base64url')` + SHA-256 hex → INSERT into `password_reset_tokens` with `type='email_verify'` and 24h expiry → fire-and-forget via `queueMicrotask(async () => { try { await sendEmailVerificationEmail(...); } catch (err) { console.error(...); } })` after `c.json({...}, 201)` returns. Claim-flow branch (placeholder hash) also issues token but only if `emailVerifiedAt IS NULL`.

**Verify endpoint (D-09 through D-14):** `POST /v1/auth/verify-email`; unauthenticated; body `{ token: string }`; atomic UPDATE-RETURNING with `type='email_verify'` filter; 0 rows → 400; 1 row → UPDATE users SET email_verified_at = now(); 200 `{ ok: true }`. Rate limit: 5/hour per-IP only. In bearerAuth bypass list.

**Resend endpoint (D-15 through D-18):** `POST /v1/auth/resend-verification`; bearerAuth required; body empty; rate limit 3/hour per userId (key `verify-resend:userId:{id}`); invalidate prior unused `email_verify` tokens before issuing new; if already verified return `200 { ok: true, already_verified: true }`.

**PWA verify page (D-19 through D-21):** Route `/auth/verify`; static — no fetch on mount (Apple Mail prefetch safety); token from `?token=...`; Confirm button triggers POST; 200 → swap in-place to success state with link "Go to app" → "/"; missing token → error; all POST failures → single-bucket "This link is no longer valid" state.

**Settings banner (D-22 through D-25):** Only on `/settings` top; amber/yellow background; text with email; Resend button with 4 lifecycle states (idle/sending/sent-10s/rate-limited/error); non-dismissible; re-renders on every Settings mount from fresh `/v1/auth/me` call.

**Login response + /me endpoint (D-26 through D-28):** Extend login response to `{ token, user: { id, email, emailVerifiedAt } }`; new `GET /v1/auth/me` route at `vigil-core/src/routes/auth.ts` returning `{ id, email, emailVerifiedAt }`; Settings fetches `/v1/auth/me` on mount in local component state only.

### Claude's Discretion

- Exact wording of success/error copy (load-bearing structure is locked)
- Migration filename if 0017 is taken
- Whether to extract a shared `tokenIssue.ts` helper for generate-raw + hash + insert (used 3+ places after this phase)
- Test file layout (match existing conventions)
- HTTP status codes for resend: 200 success, 429 rate-limited, 401 no JWT, 200 already-verified
- Whether to add `getMe` as a method on `vigilFetch` or call directly from SettingsPage
- Whether to log PostHog `email_verified` event on successful verify

### Deferred Ideas (OUT OF SCOPE)

- Email change flow (AUTH-12) — explicit roadmap deferral to v3.7
- Hard-block on unverified users — banner is non-blocking
- Custom branded `/auth/verify` landing page (logo, hero illustration)
- Resend webhook ingestion (bounce/complaint events)
- Confirmation email "your email was verified"
- Shell-level banner on every authed page — Settings-only
- WebSocket push of verify state
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-11 | A newly-registered user receives a verification email at signup, sees a non-blocking banner in the PWA until verified, can click the verification link to clear the banner (token expires 24 hours, single-use), and can resend the verification email (rate-limited 3/hour) — users who registered before AUTH-11 shipped are grandfathered as verified on deploy | All locked decisions address each clause; migration D-02 backfill is the grandfathering mechanism; D-19 Confirm-gate satisfies prefetch-safety; D-22/D-28 satisfy the Settings-only banner requirement |
</phase_requirements>

---

## Summary

Phase 113 adds email verification on top of an already-complete auth stack (Phases 110–112). Every dependency is already shipped: `password_reset_tokens` table with `type='email_verify'` CHECK constraint (Phase 112), `sendEmailVerificationEmail` wrapper (Phase 111), bearerAuth bypass-list pattern (Phase 110), sliding-window rate limiter, and fire-and-forget email send pattern. This phase is additive: one migration, two new server routes, one extended server route and one extended login response, one extended existing `/v1/me`-family endpoint, one new PWA page, and one PWA Settings banner.

The two highest-risk items are (1) the **`/v1/auth/me` endpoint conflicts with the existing `/v1/me` route** — both return user identity, but they have incompatible response shapes and the new endpoint must live at a different path; and (2) the **fire-and-forget pattern in the register handler** — the CONTEXT specifies `queueMicrotask` but the existing Phase 112 pattern uses `.catch()` on the returned promise (not `queueMicrotask`). Research confirms both patterns are safe in Node.js; the `.catch()` approach is already tested, and the planner must pick one consistently.

The grandfathering backfill (D-02) is the single most critical migration safety step for the Railway deploy. The `/auth/verify` page must never trigger a fetch on mount (Apple Mail Privacy Protection prefetch behavior — confirmed iOS 15.4+/macOS 12.3+).

**Primary recommendation:** Mirror Phase 112 patterns exactly. Use `.catch()` fire-and-forget (not `queueMicrotask` — it is not used anywhere in the codebase). Create `GET /v1/auth/me` as a new route file `auth-me.ts` alongside auth.ts rather than extending the existing `/v1/me` at `me.ts` — the response shapes differ and merging would break existing consumers.

---

## Standard Stack

### Core (all already in vigil-core deps — no new installs needed)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `crypto` (Node built-in) | node:crypto | randomBytes + SHA-256 | [VERIFIED: live code — forgot-password.ts:195-196] |
| `drizzle-orm` | already in package.json | DB queries, UPDATE-RETURNING | [VERIFIED: live code — reset-password.ts:161-171] |
| `hono` | already in package.json | Route registration, middleware | [VERIFIED: live code — index.ts] |
| `sendEmailVerificationEmail` | Phase 111 shipped | Fire-and-forget email send | [VERIFIED: live code — email-service.ts:227-252] |

### Supporting

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `node:test` + `assert` | Node built-in | vigil-core unit tests | [VERIFIED: existing test pattern — forgot-password.test.ts:31] |
| `vitest` + `@testing-library/react` | existing in vigil-pwa | PWA page tests | [VERIFIED: ResetPasswordPage.test.tsx:1] |
| `react-router` `useSearchParams` | existing in vigil-pwa | Read `?token=` on verify page | [VERIFIED: existing pattern — ResetPasswordPage.tsx, ForgotPasswordPage.tsx] |

**Installation:** No new packages required. All dependencies are already present.

---

## Architecture Patterns

### Token Generation (mirror Phase 112 exactly)

```typescript
// Source: vigil-core/src/routes/forgot-password.ts:195-196
const rawToken = crypto.randomBytes(32).toString("base64url");   // 43 chars, 256-bit entropy
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");  // stored in DB
```

### Atomic Claim Pattern (UPDATE-RETURNING with type filter)

```typescript
// Source: vigil-core/src/routes/reset-password.ts:159-171 — mirror with type='email_verify'
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const claimed = await db
  .update(passwordResetTokens)
  .set({ usedAt: new Date(now) })
  .where(
    and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      eq(passwordResetTokens.type, "email_verify"),   // <-- Phase 113 type discriminant
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, sql`now()`),
    ),
  )
  .returning({ userId: passwordResetTokens.userId });

if (claimed.length === 0) {
  return c.json({ error: "Invalid or expired token" }, 400);
}
```

### Fire-and-Forget Email Send (existing codebase pattern — NOT queueMicrotask)

```typescript
// Source: vigil-core/src/routes/forgot-password.ts:221-223
// IMPORTANT: The codebase uses .catch() NOT queueMicrotask. D-08 specifies queueMicrotask
// but it is not used anywhere in the codebase. Both are safe. Use .catch() for consistency.
sendEmailFn(user.email, verifyUrl).catch((err) => {
  console.error("[register] email send failed (background):", err);
});
return c.json({ ...responseBody }, 201);
```

**Note on D-08 vs live pattern:** CONTEXT D-08 specifies `queueMicrotask(async () => { ... })`. The existing Phase 112 code uses `sendEmailFn(...).catch(...)` called synchronously before the return — the `.catch()` is attached synchronously but the send promise resolves after the response is sent. Both achieve fire-and-forget semantics. The planner should use whichever is consistent with Phase 112; `.catch()` is the existing live pattern.

### Rate Limiter (in-process sliding window — existing pattern)

```typescript
// Source: vigil-core/src/routes/reset-password.ts:48-87 (per-IP shape)
// For resend (D-16): key = "verify-resend:userId:{id}", max=3, window=1h
// The existing in-process Map pattern is the right model; no import from rate-limit.ts needed.
// Note: rate-limit.ts (src/middleware/rate-limit.ts) is a global middleware, not a per-endpoint
// helper. Phase 112 uses inline Maps for per-endpoint rate limiting — follow that pattern.
```

### bearerAuth Bypass List (index.ts lines 127-134)

```typescript
// Source: vigil-core/src/index.ts:127-134
app.use("/v1/*", async (c, next) => {
  if (c.req.path === "/v1/health") return next();
  if (c.req.path === "/v1/auth/google/callback") return next();
  if (c.req.path === "/v1/auth/register") return next();
  if (c.req.path === "/v1/auth/login") return next();
  if (c.req.path === "/v1/auth/forgot-password") return next();
  if (c.req.path === "/v1/auth/reset-password") return next();
  if (c.req.path === "/v1/auth/verify-email") return next();  // <-- Phase 113 ADD
  return bearerAuth(c, next);
});
```

### Route Mounting Order (critical — must mount unauthenticated routes BEFORE bearerAuth dispatcher)

```typescript
// Source: vigil-core/src/index.ts:110-134
// Pattern: unauthenticated routes mounted BEFORE the bearerAuth dispatcher block
app.route("/v1", verifyEmail);           // <-- mount before dispatcher
// ... then the dispatcher block ...
app.use("/v1/*", async (c, next) => { ... });  // dispatcher
// ... then protected routes ...
app.route("/v1", resendVerification);    // <-- mount AFTER dispatcher (bearerAuth required)
app.route("/v1", authMe);               // <-- mount AFTER dispatcher (GET /v1/auth/me, bearerAuth)
```

### DI Factory Pattern (test seam — existing pattern)

```typescript
// Source: vigil-core/src/routes/forgot-password.ts:98-108
// All three new route files should export createXxxRoute(deps?) factory + default singleton.
// Tests use the factory; production singleton is imported by index.ts.
export interface VerifyEmailDeps {
  sendEmailFn?: typeof sendEmailVerificationEmail;
  nowFn?: () => number;
}
export function createVerifyEmailRoute(deps?: VerifyEmailDeps): Hono { ... }
export const verifyEmail = createVerifyEmailRoute();
```

### PWA Verify Page (static, no fetch on mount — critical)

```typescript
// Source: vigil-pwa/src/pages/ResetPasswordPage.tsx (D-18 form-submit gate — same principle)
// ResetPasswordPage uses useMemo(searchParams.get('token')) at mount with NO useEffect fetch.
// VerifyPage must follow the same pattern: parse token on mount, no API call until Confirm click.
// Test: 'does NOT call fetch on mount' assertion (see ResetPasswordPage.test.tsx:53-59)
```

### Recommended Project Structure (new files)

```
vigil-core/src/
├── routes/
│   ├── verify-email.ts           # POST /v1/auth/verify-email (unauthenticated)
│   ├── verify-email.test.ts      # unit + integration tests
│   ├── resend-verification.ts    # POST /v1/auth/resend-verification (bearerAuth)
│   ├── resend-verification.test.ts
│   └── auth-me.ts                # GET /v1/auth/me (bearerAuth, new — distinct from /v1/me)
vigil-core/drizzle/
│   └── 0017_users_email_verified_at.sql  # migration (next free after 0016)
vigil-pwa/src/pages/
│   ├── VerifyEmailPage.tsx        # /auth/verify route
│   └── VerifyEmailPage.test.tsx
```

### Anti-Patterns to Avoid

- **Modifying `/v1/me`:** The existing `GET /v1/me` at `me.ts` returns `{ userId: string, email: string }`. App.tsx and SettingsPage both consume this shape. D-27 creates a separate `GET /v1/auth/me` returning `{ id: number, email: string, emailVerifiedAt: string | null }`. Do NOT merge these — the response shapes differ and App.tsx's PostHog identify would break if the shape changed.
- **Fetching on verify page mount:** Any `useEffect` that fires an API call on mount will burn the token before the user clicks Confirm. Confirmed failure mode from Apple Mail Privacy Protection.
- **Using `queueMicrotask` (inconsistency):** Unless intentionally standardizing on it, use the existing `.catch()` fire-and-forget pattern for consistency with Phase 112.
- **Missing `---> statement-breakpoint` between SQL statements in migration:** The 0016 migration uses this Drizzle directive between every statement. 0017 must follow the same format or drizzle-kit migrate will fail.

---

## Critical Integration Point: `/v1/me` vs `/v1/auth/me`

**This is the highest-complexity integration concern for planning.**

| Route | File | Response Shape | Consumers | Phase |
|-------|------|---------------|-----------|-------|
| `GET /v1/me` | `me.ts` | `{ userId: string, email: string }` | App.tsx:37, SettingsPage.tsx:100 | 103 |
| `GET /v1/auth/me` | `auth-me.ts` (NEW) | `{ id: number, email: string, emailVerifiedAt: string \| null }` | SettingsPage (new banner call D-28) | 113 |

D-28 says Settings calls `/v1/auth/me` on mount for the banner. The existing Settings code already calls `/v1/me` for the `accountEmail` display. After Phase 113, Settings will have TWO `/me` calls on mount: the existing `/v1/me` for `accountEmail` and the new `/v1/auth/me` for the banner. The planner may want to consolidate — but this is Claude's Discretion territory (D-28 says "smallest possible PWA change"). The simplest approach is to add a second `useEffect` for `/v1/auth/me` alongside the existing one. [VERIFIED: SettingsPage.tsx:89-107 shows existing /v1/me call pattern]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Source |
|---------|-------------|-------------|--------|
| Token entropy | Custom PRNG | `crypto.randomBytes(32).toString('base64url')` | [VERIFIED: forgot-password.ts:195] |
| Token storage security | Plain text in DB | SHA-256 hex of raw token | [VERIFIED: reset-password.ts:159] |
| Atomic single-use claim | Transaction + SELECT + UPDATE | `UPDATE ... RETURNING` WHERE clause | [VERIFIED: reset-password.ts:161-171] |
| Email send | Direct Resend SDK call | `sendEmailVerificationEmail(to, verifyUrl)` | [VERIFIED: email-service.ts:227] |
| Rate limiting | Custom throttle | In-process Map + sliding window (per Phase 112) | [VERIFIED: reset-password.ts:48-87] |
| SQL migration | drizzle-kit generate | Hand-authored idempotent SQL with `IF NOT EXISTS` | [VERIFIED: 0016_password_reset_tokens.sql] |

---

## Common Pitfalls

### Pitfall 1: Apple Mail prefetch burns the token on verify page load
**What goes wrong:** If the PWA fetches `/v1/auth/verify-email` automatically when the page mounts (e.g., in a `useEffect`), Apple Mail's Privacy Protection proxy hits the link first and burns the token. The real user's click then sees "This link is no longer valid."
**Why it happens:** iOS 15.4+/macOS 12.3+ prefetches all links in an email through Apple's edge proxy with a generic browser UA.
**How to avoid:** No fetch on mount. Parse `?token=...` via `useSearchParams` at render time; fire the POST only on Confirm button click. [VERIFIED: CONTEXT D-19]
**Warning signs:** If tests use `useEffect` to trigger the verify POST, that's the bug.

### Pitfall 2: Wrong route for /v1/auth/me — conflict with existing /v1/me
**What goes wrong:** Extending `me.ts` to add `emailVerifiedAt` changes the response shape of `GET /v1/me`. App.tsx:37 reads `{ userId: string; email: string }` — adding `emailVerifiedAt` is additive and safe, but the path `/v1/me` vs `/v1/auth/me` is a distinct URL. Creating the new endpoint at `/v1/me` would shadow the protected existing `/v1/me`.
**How to avoid:** Create a new `auth-me.ts` file with route `GET /auth/me` mounted as `app.route("/v1", authMe)` → resolves to `/v1/auth/me`. Do NOT modify `me.ts` or its `/v1/me` path. [VERIFIED: me.ts:73 registers `/me`, app.route("/v1", me) → `/v1/me`]

### Pitfall 3: Migration ordering — must use `-->` statement-breakpoint
**What goes wrong:** Drizzle's migration runner uses the `-->` statement-breakpoint comment to split multi-statement SQL files. Missing it causes only the first statement to execute silently.
**How to avoid:** Copy the exact format from `0016_password_reset_tokens.sql` — every `CREATE INDEX` or `ALTER TABLE` statement is followed by `--> statement-breakpoint`. [VERIFIED: 0016_password_reset_tokens.sql:31,35,42,47]

### Pitfall 4: Drizzle journal ordering — `when` timestamp must be monotonically increasing
**What goes wrong:** State.md records: "Rule 3 auto-fix bumped 0015 when=1777267200000 to exceed Phase 108 0014 when=1777180800000 — drizzle-kit migrate orders by when not idx." Hand-authored migrations need `when` > previous migration's `when` in `_journal.json`.
**How to avoid:** When hand-adding the 0017 migration to `_journal.json`, use `Date.now()` at time of authoring for the `when` field, verified to be > the 0016 `when` value. [VERIFIED: STATE.md Phase 110 decisions block]

### Pitfall 5: D-07 claim-flow parity — seed user already has email_verified_at set after migration
**What goes wrong:** After the 0017 migration, the backfill sets `email_verified_at = created_at` for all existing users including the seed user. If the claim-flow check for `emailVerifiedAt IS NULL` is missing, the seed user's claim triggers a redundant verify email send.
**How to avoid:** D-07 requires the claim-flow to check `existing.emailVerifiedAt == null` before issuing a new token. After the migration, the seed user has a non-null `emailVerifiedAt` so the check correctly skips the email. [VERIFIED: CONTEXT D-07, schema.ts shows emailVerifiedAt column not yet present]

### Pitfall 6: Rate limit key format for resend — userId, not IP
**What goes wrong:** D-16 specifies rate limit key `verify-resend:userId:{id}` — but the existing `takeSlot` implementations in forgot-password.ts and reset-password.ts use plain IP/email strings as keys, not prefixed.
**How to avoid:** The key format `verify-resend:userId:{id}` is defined in CONTEXT. Use this exact format so keys from different endpoints don't collide in the same in-process Map. [VERIFIED: CONTEXT D-16]

### Pitfall 7: AuthPage login response shape — additive `emailVerifiedAt` field
**What goes wrong:** AuthPage.tsx:56/81 destructures the login response as `{ token: string; user: { id: number; email: string } }`. When D-26 adds `emailVerifiedAt` to the login response, this destructure still works (TypeScript won't complain about extra fields) — but if the PWA needs to store or forward `emailVerifiedAt`, the destructure type needs updating.
**How to avoid:** Update the TypeScript type annotation in AuthPage to `{ token: string; user: { id: number; email: string; emailVerifiedAt: string | null } }`. The existing auto-login-after-register flow (register → login) means the user gets a JWT with emailVerifiedAt=null immediately after registration. [VERIFIED: AuthPage.tsx:56,81]

### Pitfall 8: Test suite hang — existing vigil-core issue
**What goes wrong:** STATE.md records: "Pre-existing npm test suite hang in vigil-core: imports ../index.js which spawns generate-scheduler (60s) + gmail-workorders (5m) setInterval loops at module load, keeping the tsx child process alive after the final assertion."
**How to avoid:** Run individual test files via `npx tsx --test src/routes/verify-email.test.ts` not `npm test` during development. Force-kill with SIGINT after suite completes green. New test files must NOT import from `../index.js`. [VERIFIED: STATE.md Blockers/Concerns]

---

## Code Examples

### 0017 Migration (verified template from 0016)

```sql
-- ── Phase 113: AUTH-11 users.email_verified_at column ─────────────────────────

-- ── Step 1: ADD COLUMN ─────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
--> statement-breakpoint

-- ── Step 2: Backfill — grandfather all pre-existing rows as verified ─────────
-- Safe to re-run: second pass finds no NULL rows (WHERE IS NULL filter).
-- After this migration, email_verified_at IS NULL is only true for users
-- who registered AFTER migration but before clicking verify.
UPDATE "users"
   SET "email_verified_at" = "created_at"
 WHERE "email_verified_at" IS NULL;
```

### Drizzle Schema Addition (schema.ts alongside passwordChangedAt)

```typescript
// Source: vigil-core/src/db/schema.ts:44-46 — add after passwordChangedAt
// Phase 113 (AUTH-11 D-05): emailVerifiedAt column. NULL = unverified (banner sentinel).
// Non-null timestamp = verified at that moment.
// 0017 migration backfills existing rows to created_at (grandfathering).
emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
```

### Register Handler Token Issuance (additions to auth.ts fresh-register branch)

```typescript
// After successful INSERT into users (returning id + email):
// D-06 steps 1-4 happen synchronously before returning 201.
// D-08 fire-and-forget happens after c.json() is called.
const rawToken = crypto.randomBytes(32).toString("base64url");
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
await db.insert(passwordResetTokens).values({
  userId: created.id,
  tokenHash,
  type: "email_verify",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),  // 24h
});
const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";
const verifyUrl = `${origin}/auth/verify?token=${rawToken}`;
// Fire-and-forget — matches Phase 112 D-21 pattern (forgot-password.ts:221-223)
sendEmailVerificationEmail(email, verifyUrl).catch((err) => {
  console.error("[register] email send failed (background):", err);
});
return c.json({ id: created.id, email: created.email }, 201);
```

### Resend Verification Route Shape

```typescript
// POST /v1/auth/resend-verification — bearerAuth required, userId from JWT
export function createResendVerificationRoute(deps?: ResendVerificationDeps): Hono {
  const router = new Hono();
  router.post("/auth/resend-verification", async (c) => {
    const userId = c.get("userId");
    const now = nowFn();

    // D-18: idempotency — already verified?
    if (!db) return c.json({ error: "Database unavailable" }, 503);
    const [user] = await db
      .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return c.json({ error: "invalid_user" }, 401);
    if (user.emailVerifiedAt !== null) {
      return c.json({ ok: true, already_verified: true });
    }

    // D-16: rate limit 3/hour per userId
    const slot = takeResendSlot(`verify-resend:userId:${userId}`, now);
    if (!slot.ok) {
      c.header("Retry-After", String(slot.retryAfterSec));
      return c.json({ error: "Too many requests" }, 429);
    }

    // D-17: invalidate prior unused email_verify tokens
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date(now) })
      .where(and(
        eq(passwordResetTokens.userId, userId),
        eq(passwordResetTokens.type, "email_verify"),
        isNull(passwordResetTokens.usedAt),
      ));

    // Issue new token + fire-and-forget send
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash,
      type: "email_verify",
      expiresAt: new Date(now + 24 * 60 * 60 * 1000),
    });
    const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";
    const verifyUrl = `${origin}/auth/verify?token=${rawToken}`;
    sendEmailFn(user.email, verifyUrl).catch((err) => {
      console.error("[resend-verification] email send failed (background):", err);
    });
    return c.json({ ok: true });
  });
  return router;
}
```

### GET /v1/auth/me Route Shape

```typescript
// New file: vigil-core/src/routes/auth-me.ts
// Returns { id, email, emailVerifiedAt } — distinct from /v1/me → { userId, email }
// D-27: minimal field set, bearerAuth required, fresh DB read
router.get("/auth/me", async (c) => {
  const userId = c.get("userId");
  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "invalid_user" }, 401);
  return c.json({
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  });
});
```

### PWA VerifyEmailPage (no fetch on mount pattern)

```typescript
// Source pattern: vigil-pwa/src/pages/ResetPasswordPage.tsx (D-18 gate)
// useMemo or direct call at render time — NOT useEffect
import { useState } from 'react'
import { useSearchParams, Link } from 'react-router'
import { API_BASE } from '../api/client'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')  // read at render, no useEffect
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  // NO useEffect that triggers a fetch here — Apple Mail prefetch defense
  async function handleConfirm() {
    setState('loading')
    try {
      const res = await fetch(`${API_BASE}/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        setState('success')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }
  // ...
}
```

**Note on `vigilFetch` vs raw `fetch` for verify-email POST:** The verify-email endpoint is unauthenticated. `vigilFetch` always attaches `Authorization: Bearer {key}` when a JWT is in sessionStorage. If the user is logged in while clicking the verify link, `vigilFetch` would send the JWT — the server should tolerate extra bearer tokens on the bypass-listed endpoint (Hono bypass happens before bearerAuth, so the header is ignored). However, using raw `fetch()` is cleaner and avoids the `vigilFetch` 401 redirect handler firing on any non-Session-expired 401. Use raw `fetch()` for the `/v1/auth/verify-email` POST. Use `vigilFetch` for `/v1/auth/resend-verification` (bearerAuth required) and `/v1/auth/me` (bearerAuth required). [VERIFIED: CONTEXT §Integration Points — PWA vigilFetch 401 handler]

---

## Runtime State Inventory

This is an additive phase — no rename or refactor. No runtime state migration required beyond the SQL migration.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | users table — all rows; password_reset_tokens — 0 `email_verify` rows exist yet | ADD COLUMN via 0017 migration; backfill via UPDATE WHERE NULL |
| Live service config | Railway env vars: `VIGIL_APP_BASE_URL` already set (Phase 111); `RESEND_API_KEY` already set (Phase 111) | None — existing env vars are sufficient |
| OS-registered state | None | None verified |
| Secrets/env vars | No new env vars required | None |
| Build artifacts | `vigil-pwa/tsconfig.tsbuildinfo` — will regenerate on next build | Normal build artifact, no action |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (Railway) | 0017 migration + all DB ops | Yes — Railway | 15.x | N/A — required |
| `DATABASE_URL` env var | vigil-core integration tests | Yes — .env | — | Tests skip with `t.skip()` |
| `RESEND_API_KEY` | Fire-and-forget email sends | Yes — Railway (Phase 111) | — | Graceful skip (email-service lazy null-init) |
| `VIGIL_APP_BASE_URL` | verifyUrl construction | Yes — Railway (Phase 111) | — | Falls back to `https://app.vigilhub.io` hardcoded default |
| `JWT_SECRET` | bearerAuth (resend + /me) | Yes — Railway | — | Server refuses to boot without it |

**Missing dependencies:** None blocking. All Phase 113 dependencies were installed in Phases 110–112.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| vigil-core framework | Node.js built-in `node:test` + `assert/strict` |
| vigil-pwa framework | vitest + @testing-library/react |
| vigil-core quick run | `cd vigil-core && npx tsx --test src/routes/verify-email.test.ts` |
| vigil-core full suite | `cd vigil-core && npm test` (note: force-kill after green — known hang) |
| vigil-pwa quick run | `cd vigil-pwa && npx vitest run src/pages/VerifyEmailPage.test.tsx` |
| vigil-pwa full suite | `cd vigil-pwa && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-11-M | 0017 migration adds `email_verified_at` column; backfill sets existing users to `created_at` | integration (DB) | `npx tsx --test src/routes/verify-email.test.ts` | ❌ Wave 0 |
| AUTH-11-R | `POST /register` issues `email_verify` token row; fire-and-forget send called | unit (DI spy) | `npx tsx --test src/routes/auth.test.ts` | ✅ (extend) |
| AUTH-11-V1 | `POST /v1/auth/verify-email` with valid token → 200 `{ ok: true }` + `email_verified_at` set | integration (DB) | `npx tsx --test src/routes/verify-email.test.ts` | ❌ Wave 0 |
| AUTH-11-V2 | `POST /v1/auth/verify-email` with expired/used/invalid token → 400 | unit (mock DB) | `npx tsx --test src/routes/verify-email.test.ts` | ❌ Wave 0 |
| AUTH-11-V3 | `POST /v1/auth/verify-email` single-use: second claim with same raw token → 400 | integration (DB) | `npx tsx --test src/routes/verify-email.test.ts` | ❌ Wave 0 |
| AUTH-11-V4 | `POST /v1/auth/verify-email` rate limit 5/hour per-IP → 429 after 5 | unit (no DB) | `npx tsx --test src/routes/verify-email.test.ts` | ❌ Wave 0 |
| AUTH-11-S1 | `POST /v1/auth/resend-verification` already verified → 200 `{ already_verified: true }` | unit (mock DB) | `npx tsx --test src/routes/resend-verification.test.ts` | ❌ Wave 0 |
| AUTH-11-S2 | `POST /v1/auth/resend-verification` rate limit 3/hour per userId → 429 after 3 | unit (no DB) | `npx tsx --test src/routes/resend-verification.test.ts` | ❌ Wave 0 |
| AUTH-11-S3 | `POST /v1/auth/resend-verification` invalidates prior unused tokens before issuing new | integration (DB) | `npx tsx --test src/routes/resend-verification.test.ts` | ❌ Wave 0 |
| AUTH-11-ME | `GET /v1/auth/me` returns `{ id, email, emailVerifiedAt }` with correct null/non-null | unit (DI) | `npx tsx --test src/routes/auth-me.test.ts` | ❌ Wave 0 |
| AUTH-11-L | Login response includes `emailVerifiedAt` field | unit (extend auth.test.ts) | `npx tsx --test src/routes/auth.test.ts` | ✅ (extend) |
| AUTH-11-P | PWA `/auth/verify` page does NOT fetch on mount (prefetch defense) | unit (vitest) | `npx vitest run src/pages/VerifyEmailPage.test.tsx` | ❌ Wave 0 |
| AUTH-11-P2 | PWA `/auth/verify` Confirm button → POST → 200 → success state rendered in-place | unit (vitest) | `npx vitest run src/pages/VerifyEmailPage.test.tsx` | ❌ Wave 0 |
| AUTH-11-B | PWA Settings banner visible when `emailVerifiedAt === null`; hidden when non-null | unit (vitest) | `npx vitest run src/pages/SettingsPage.test.tsx` | ✅ (extend) |
| AUTH-11-B2 | Resend button lifecycle states (idle → sending → sent-10s → rate-limited) | unit (vitest) | `npx vitest run src/pages/SettingsPage.test.tsx` | ✅ (extend) |
| AUTH-11-G | Grandfathering: pre-migration users skip banner (emailVerifiedAt = created_at not null) | integration (DB) | `npx tsx --test src/routes/verify-email.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** quick run of the relevant test file (e.g., `npx tsx --test src/routes/verify-email.test.ts`)
- **Per wave merge:** `cd vigil-core && npm test` (force-kill after green) + `cd vigil-pwa && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vigil-core/src/routes/verify-email.test.ts` — covers AUTH-11-M, AUTH-11-V1–V4, AUTH-11-G
- [ ] `vigil-core/src/routes/resend-verification.test.ts` — covers AUTH-11-S1–S3
- [ ] `vigil-core/src/routes/auth-me.test.ts` — covers AUTH-11-ME
- [ ] `vigil-pwa/src/pages/VerifyEmailPage.test.tsx` — covers AUTH-11-P, AUTH-11-P2
- [ ] Extend `vigil-core/src/routes/auth.test.ts` — add AUTH-11-R (token issued) and AUTH-11-L (login response shape)
- [ ] Extend `vigil-pwa/src/pages/SettingsPage.test.tsx` — add AUTH-11-B, AUTH-11-B2

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Token is 256-bit entropy via `crypto.randomBytes(32)` — brute force infeasible |
| V3 Session Management | partial | No auto-login after verify (D-14); no JWT in response |
| V4 Access Control | yes | Resend and /me require bearerAuth; verify-email is unauthenticated (token IS auth) |
| V5 Input Validation | yes | Token body validated as `string` before SHA-256 hash lookup; no SQL injection surface (parameterized Drizzle queries) |
| V6 Cryptography | yes | SHA-256 for token storage (never store raw token in DB — D-08); never hand-roll hash |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token reuse (replay attack) | Tampering | `used_at IS NULL` in UPDATE-RETURNING; atomic PG row-lock |
| Token brute-force | Tampering | 256-bit entropy (infeasible) + 5/hour per-IP rate limit on verify endpoint |
| Apple Mail prefetch burns token | Spoofing | Confirm-click gate on `/auth/verify` page — no fetch on mount |
| Resend spam flooding | DoS | 3/hour per-userId rate limit |
| Unverified user bypass | Tampering | Banner is non-blocking by design (SC#2); no hard-block exists in this phase |
| Info leak on verify failure | Information Disclosure | Single-bucket 400 "Invalid or expired token" — no expired/used/invalid differentiation |
| PII in logs | Information Disclosure | `sendEmailVerificationEmail` internally uses `hashRecipient()` for PostHog — raw email only goes to Resend SDK boundary (email-service.ts:143-149) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GET-based verify endpoint (burnable by prefetch) | POST-based with Confirm-click gate | iOS 15.4+/macOS 12.3+ (Apple Mail Privacy Protection) | Locked in D-19 |
| click_tracking per-send flag | Disabled at domain level in Resend dashboard | Resend SDK v6 removed per-send flags | Phase 111 Plan 01 handled; email-service.ts comment documents this at line 7 |
| Auto-login after email verify | No auto-login (CVE pattern — referrer leak) | OWASP recommendation | REQUIREMENTS.md Out of Scope table |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 0017 is the next free migration number | Standard Stack / Migration | Filename collision — pick next free via `ls vigil-core/drizzle/*.sql \| sort` at implementation time [VERIFIED: current highest is 0016] |
| A2 | `sendEmailVerificationEmail` is exported as a top-level named export (not factory-only) | Code Examples | Import path in register handler would fail — [VERIFIED: email-service.ts:284 `export const sendEmailVerificationEmail = singleton.sendEmailVerificationEmail`] |
| A3 | Phase 112 ships before 113 executes (password_reset_tokens table exists) | Standard Stack | 0017 migration or INSERT would fail — [VERIFIED: CONTEXT depends_on:112; STATE.md shows 112 completed] |

**All other claims in this research were verified directly against live source files.**

---

## Open Questions (RESOLVED)

1. **`queueMicrotask` vs `.catch()` fire-and-forget (D-08 vs live pattern)** — **RESOLVED:** Plans use `.catch()` throughout for consistency with Phase 112 live code. Both are semantically equivalent for fire-and-forget; `.catch()` is the established codebase pattern. Documented inline in Plan 02 Task 1.
   - What we know: D-08 specifies `queueMicrotask`. Phase 112 live code uses `.catch()` on the promise directly before returning.
   - What's unclear: Whether the planner should introduce `queueMicrotask` to match D-08 literally, or use `.catch()` for consistency with Phase 112.
   - Recommendation: Use `.catch()` pattern (Phase 112 live code) for codebase consistency unless the user wants to standardize on `queueMicrotask`. Both are safe — `queueMicrotask` only affects microtask scheduling order, not the correctness of the fire-and-forget semantics. Document the choice in a comment.

2. **Shared `tokenIssue.ts` helper (Claude's Discretion)** — **RESOLVED:** Plans choose inline duplication for Phase 113 (per Claude's Discretion in CONTEXT.md). Helper extraction deferred to a future refactor phase once all 4 call sites have shipped and stabilized — premature consolidation risks coupling unrelated lifecycles.
   - What we know: After Phase 113, the pattern `randomBytes(32) → base64url → SHA-256 → INSERT password_reset_tokens` appears in register (fresh), register (claim), forgot-password, and resend-verification — 4 call sites.
   - What's unclear: Whether the duplication warrants a helper yet.
   - Recommendation: Extract a shared helper `issueToken(db, userId, type, ttlMs): Promise<string>` that returns the rawToken. Reduces copy-paste errors across 4 sites and makes future maintenance (e.g., changing token entropy) a single-file change.

3. **Auth.ts register handler integration test scope** — **RESOLVED:** Plans extend the existing `auth.test.ts` with a new `describe()` block, matching the recommendation. Single-file convention preserved.
   - What we know: The existing `auth.test.ts` has unit tests for register. Phase 113 adds token issuance + fire-and-forget to the register handler.
   - What's unclear: Whether to add the new assertions into `auth.test.ts` or create a new `register-verify.test.ts`.
   - Recommendation: Extend `auth.test.ts` with a `describe("register → email_verify token issuance (AUTH-11)")` block — keeps the single-file convention for the register route tests.

---

## Sources

### Primary (HIGH confidence — verified against live source files)
- `vigil-core/src/routes/forgot-password.ts` — fire-and-forget pattern, token generation, rate limit shape
- `vigil-core/src/routes/reset-password.ts` — atomic UPDATE-RETURNING claim, DI factory pattern, rate limit shape
- `vigil-core/src/routes/auth.ts` — register handler, claim-flow logic, login response shape
- `vigil-core/src/routes/me.ts` — existing `/v1/me` route response shape `{ userId, email }`
- `vigil-core/src/middleware/auth.ts` — bearerAuth bypass list structure
- `vigil-core/src/index.ts` — route mounting order, bypass list, existing `me` import at line 186
- `vigil-core/src/services/email-service.ts` — `sendEmailVerificationEmail` at line 227
- `vigil-core/src/db/schema.ts` — `users` table shape, `passwordResetTokens` table with type CHECK
- `vigil-core/drizzle/0016_password_reset_tokens.sql` — migration template including `-->` statement-breakpoint format
- `vigil-pwa/src/pages/ResetPasswordPage.tsx` (pattern) — form-submit gate (no fetch on mount)
- `vigil-pwa/src/pages/AuthPage.tsx` — login response consumer shape
- `vigil-pwa/src/pages/SettingsPage.tsx` — existing `/v1/me` call at line 92, banner and inline state patterns
- `vigil-pwa/src/api/client.ts` — `vigilFetch` 401 handler behavior
- `vigil-pwa/src/App.tsx` — route structure, `/auth/forgot` and `/auth/reset` as sibling unauthenticated routes pattern

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — confirmed Phase 112 complete, drizzle journal `when` ordering pitfall
- `.planning/phases/112-forgot-password-email-flow/112-CONTEXT.md` — D-01–D-21 pattern references
- `.planning/phases/111-transactional-email-infrastructure-resend-dns/111-CONTEXT.md` — D-10 swallow-failure rule

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages are existing project deps verified in live code
- Architecture patterns: HIGH — all patterns verified from live Phase 112 implementations
- Pitfalls: HIGH — Pitfalls 1/2/3/4 are verified from STATE.md Phase 110/112 decisions; Pitfall 8 from STATE.md Blockers
- Migration shape: HIGH — 0016 SQL verified as template; column addition pattern confirmed

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (stable stack — only changes if Drizzle or Hono minor versions upgrade)
