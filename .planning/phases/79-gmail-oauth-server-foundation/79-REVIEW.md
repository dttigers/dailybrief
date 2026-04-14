---
phase: 79-gmail-oauth-server-foundation
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - vigil-core/package.json
  - vigil-core/src/db/schema.ts
  - vigil-core/src/index.ts
  - vigil-core/src/routes/google-auth.test.ts
  - vigil-core/src/routes/google-auth.ts
  - vigil-core/src/routes/google-status.test.ts
  - vigil-core/src/routes/google-status.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 79: Code Review Report

**Reviewed:** 2026-04-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This phase adds dual-scope Google OAuth (calendar + Gmail) to vigil-core: a `/auth/google` initiation route, a `/auth/google/callback` exchange route, and a `/google/status` read endpoint. The architecture is solid — DI factory pattern makes both routes fully unit-testable without real Google API or DB calls, JWT state nonce mitigates CSRF, and AES-256-GCM encrypts the refresh token before storage. Tests cover the key happy and error paths.

Three warnings and three info items were found. No critical security vulnerabilities. The most actionable issue is a schema drift: migration `0008` added `account_email` to `oauth_tokens` but `schema.ts` does not declare it, which will cause Drizzle type-checking to miss the column and makes drizzle-kit generate incorrect future diffs.

---

## Warnings

### WR-01: `account_email` column exists in migration but is absent from `schema.ts`

**File:** `vigil-core/src/db/schema.ts:174-190`

**Issue:** Migration `0008_add_oauth_scopes_and_account_email.sql` runs `ALTER TABLE "oauth_tokens" ADD COLUMN "account_email" text;` but the `oauthTokens` table definition in `schema.ts` has no `accountEmail` field. This means:
1. Drizzle-ORM will never select/insert `account_email` even when the caller intends to.
2. `drizzle-kit generate` will produce a *second* migration that drops the column, corrupting prod data.
3. The commit message (`feat(79.1-02): persist OAuth scopes + account_email in callback`) implies the callback should write this field — it currently does not.

**Fix:**
```typescript
// vigil-core/src/db/schema.ts — inside oauthTokens
accountEmail: text("account_email"),
```

Also update `google-auth.ts` `dbUpsertFn` to populate `accountEmail` from the token info endpoint (or pass it through `dbUpsertFn`'s signature).

---

### WR-02: Fallback scope assignment when `tokens.scope` is absent silently grants full scope credit

**File:** `vigil-core/src/routes/google-auth.ts:137`

**Issue:** Line 137 falls back to `REQUESTED_SCOPES` when Google returns no `scope` string:
```typescript
const grantedScopes = tokens.scope?.split(" ") ?? REQUESTED_SCOPES;
```
If Google omits `scope` from the token response (which can happen in some error paths or older API versions), the DB row will be written with both scopes even though they were never actually granted. The status endpoint will then report `gmail=connected` for an account that never consented to Gmail access, causing downstream Gmail calls to fail with a confusing 403 rather than a re-auth prompt.

**Fix:** Default to an empty array instead of `REQUESTED_SCOPES`:
```typescript
const grantedScopes = tokens.scope?.split(" ") ?? [];
```
Downstream callers already handle `needs_auth` gracefully; the safe-fail direction is "prompt re-auth" not "assume connected."

---

### WR-03: `GOOGLE_OAUTH_STATE_SECRET` and `GOOGLE_TOKEN_ENCRYPTION_KEY` are accessed with `!` non-null assertion at runtime without a startup validation guard

**File:** `vigil-core/src/routes/google-auth.ts:55`, `vigil-core/src/routes/google-auth.ts:98`

**Issue:** Both env vars are accessed as `process.env["..."]!` inside request handlers. If either is missing in production, the server starts successfully, then throws an unhandled error on the first OAuth request. The token-crypto utility does validate `GOOGLE_TOKEN_ENCRYPTION_KEY` at call time (throws a descriptive error), but `GOOGLE_OAUTH_STATE_SECRET` has no such guard — a missing secret causes `TextEncoder().encode(undefined)` which produces a zero-length key, signing JWTs that pass `jwtVerify` trivially (jose will reject them, but the error is opaque).

**Fix:** Add startup validation in `src/index.ts` alongside the existing `testConnection()` call:
```typescript
// index.ts — after testConnection()
const REQUIRED_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_OAUTH_STATE_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[vigil-core] Missing required env var: ${key}`);
    process.exit(1);
  }
}
```

---

## Info

### IN-01: `googleStatus` route is registered after the auth middleware skip-list, meaning it requires a Bearer token despite being a status endpoint the PWA needs during OAuth flow

**File:** `vigil-core/src/index.ts:107`

**Issue:** `app.route("/v1", googleStatus)` appears on line 107, after the auth middleware is registered at line 76. The skip-list on line 78 only exempts `/v1/auth/google*`. The `/v1/google/status` path is not exempted, so any unauthenticated PWA request (e.g., checking connection status before the user has an API key) will get a 401. This may be intentional — verify whether the PWA sends a Bearer token when polling `/google/status`. If not, add it to the skip-list:
```typescript
if (c.req.path.startsWith("/v1/google/status")) return next();
```

---

### IN-02: Test file sets env vars at module top-level, which can leak state between test runs in parallel mode

**File:** `vigil-core/src/routes/google-auth.test.ts:7-13`

**Issue:** `process.env["GOOGLE_CLIENT_ID"] = "test-client-id"` etc. are set at module scope (not inside each test or a `beforeEach`). Node's `--test` runner is currently serial by default, so this is safe today. If `--experimental-test-sharding` or parallel mode is added, these mutations will bleed across test files. Not a bug now, but worth noting before the test suite grows.

**Fix:** Move env var assignments into a `before` hook or wrap in a test helper that restores originals after each test.

---

### IN-03: Redundant `uniqueIndex` on `oauthTokens.provider` duplicates the `.unique()` constraint on the column itself

**File:** `vigil-core/src/db/schema.ts:178`, `vigil-core/src/db/schema.ts:187-189`

**Issue:** The `provider` column is declared `.notNull().unique()` (line 178), which Drizzle translates to a unique constraint in the DDL. The table initializer also adds an explicit `uniqueIndex("uq_oauth_tokens_provider").on(table.provider)` (lines 187-189). This results in two unique indexes on the same column in Postgres, doubling the write overhead for every upsert into this table.

**Fix:** Remove either the inline `.unique()` on the column or the explicit `uniqueIndex` in the table init block. Given the upsert targets `oauthTokens.provider` as the conflict target, the named index is more explicit and easier to introspect — keep the `uniqueIndex` and drop the `.unique()`:
```typescript
provider: text("provider").notNull(), // uniqueIndex handles uniqueness
```

---

_Reviewed: 2026-04-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
