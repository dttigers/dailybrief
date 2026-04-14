# Phase 79: Gmail OAuth Server Foundation - Research

**Researched:** 2026-04-13
**Domain:** Google OAuth 2.0 / Hono / jose JWT / Drizzle schema migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use `jose` library (ESM-native, zero dependencies) — not `jsonwebtoken`. Aligns with Hono's modern ESM stack.
- **D-02:** JWT state token payload contains: random nonce + 5-minute expiry + intended redirect_uri. The callback validates all three fields.
- **D-03:** Signing secret is a dedicated `GOOGLE_OAUTH_STATE_SECRET` env var in Railway. No derivation from other secrets. Must be verified in Railway before deploy.
- **D-04:** Add a `scopes` jsonb column to the `oauth_tokens` table. Record the granted scopes at authorization time. The `/v1/google/status` endpoint reads this column — no API call needed.
- **D-05:** Single `provider='google'` row. One Google account for both Calendar and Gmail. No multi-account support needed.
- **D-06:** Status response shape: `{ calendar: 'connected'|'needs_auth', gmail: 'connected'|'needs_auth' }`. Per-scope status derived from the stored scopes column.
- **D-07:** After OAuth callback, redirect to `PWA_URL?google_connected=true` (or `?google_error=...`). Same pattern as current calendar flow.
- **D-08:** Unify the auth route — rename `calendar-auth.ts` to `google-auth.ts`. Single `/auth/google` entry point and `/auth/google/callback` handler for both scopes.
- **D-09:** Always request both scopes together: `calendar.readonly` + `gmail.readonly`. Single consent screen, `prompt: 'consent'` forces re-grant. No incremental authorization.
- **D-10:** When an existing calendar-only token is detected (scope gap), the status endpoint reports `gmail: 'needs_auth'`. The PWA (Phase 81) will show a "re-connect Google" button.

### Claude's Discretion

- Error handling patterns and HTTP status codes for the status endpoint
- Test structure (unit tests for JWT sign/verify, integration tests for the callback flow)
- Migration approach for adding the `scopes` column (Drizzle migration)
- Whether to store the account email in the token row for display in status

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OAUTH-04 | Server uses signed JWT state parameter for OAuth CSRF protection (replaces in-memory nonce) | jose SignJWT/jwtVerify API verified; `jose` is NOT yet installed in vigil-core; install step required in Wave 0 |
</phase_requirements>

---

## Summary

Phase 79 makes three discrete, composable changes to the existing Google OAuth infrastructure in `vigil-core`:

1. **JWT nonce** — replace the in-memory `Map<string, number>` in `calendar-auth.ts` with a signed JWT (via `jose`) that encodes the nonce and expiry, eliminating the Railway rolling-deploy problem.
2. **Scope expansion** — add `gmail.readonly` to the scope list and store granted scopes in a new `scopes` jsonb column on `oauth_tokens`.
3. **Status endpoint** — add `GET /v1/google/status` that reads the `scopes` column and returns per-scope connection state without an outbound API call.

The primary risk is the `jose` library not yet being installed (`npm view jose` returns 6.2.2, but `import('jose')` fails in the vigil-core environment). This is a hard blocker for the JWT implementation and must be resolved in Wave 0 before any other work begins.

**Primary recommendation:** Install `jose@6`, replace the in-memory nonce with `SignJWT`/`jwtVerify` using `GOOGLE_OAUTH_STATE_SECRET`, add the `scopes` column via Drizzle migration, then expose `GET /v1/google/status`. All changes are confined to `calendar-auth.ts` (renamed to `google-auth.ts`), `schema.ts`, and a new `google-status.ts` route file.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jose` | 6.2.2 | JWT sign/verify for OAuth state nonce | ESM-native, zero deps, chosen by D-01 |
| `hono` | 4.7.x (installed) | HTTP routing | Already in use |
| `google-auth-library` | 10.6.x (installed) | OAuth2Client for token exchange/refresh | Already in use |
| `drizzle-orm` | 0.45.2 (installed) | Schema definition and migrations | Already in use |

[VERIFIED: npm registry — `jose` latest is 6.2.2]
[VERIFIED: codebase — vigil-core/package.json shows hono ^4.7.0, google-auth-library ^10.6.2, drizzle-orm ^0.45.2]

### Not Installed (Wave 0 action required)

| Library | Status | Install Command |
|---------|--------|-----------------|
| `jose` | NOT installed — import fails at runtime | `npm install jose` in `vigil-core/` |

[VERIFIED: import test in vigil-core confirms `ERR_MODULE_NOT_FOUND` for jose]

**Installation:**

```bash
cd vigil-core && npm install jose
```

---

## Architecture Patterns

### Existing Project Structure (relevant subset)

```
vigil-core/src/
├── routes/
│   ├── calendar-auth.ts          # RENAME to google-auth.ts (this phase)
│   ├── calendar.ts               # Unchanged (calendar data route)
│   └── google-status.ts          # NEW (this phase) — GET /v1/google/status
├── services/
│   └── calendar-service.ts       # Pattern to follow for DI factory
├── db/
│   └── schema.ts                 # Add scopes column to oauthTokens (this phase)
├── utils/
│   └── token-crypto.ts           # Reuse as-is for refresh token encryption
└── index.ts                      # Update: swap calendarAuth import for googleAuth
vigil-core/drizzle/
├── 0007_melted_silhouette.sql    # Latest migration (created oauth_tokens)
└── 0008_*.sql                    # NEW migration for scopes column (this phase)
```

### Pattern 1: JWT State Nonce (replaces in-memory Map)

**What:** Generate a signed HS256 JWT as the OAuth `state` parameter. The callback verifies the JWT signature, nonce, and expiry without any shared mutable state.

**When to use:** Whenever CSRF state must survive process restarts (Railway rolling deploys).

```typescript
// Source: jose@6 official API (verified via WebFetch)
import { SignJWT, jwtVerify } from "jose";

// ── Sign (in GET /auth/google) ────────────────────────────────────────────────
async function createStateJwt(nonce: string, redirectUri: string): Promise<string> {
  const secret = new TextEncoder().encode(
    process.env["GOOGLE_OAUTH_STATE_SECRET"]!
  );
  return new SignJWT({ nonce, redirectUri })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

// ── Verify (in GET /auth/google/callback) ────────────────────────────────────
async function verifyStateJwt(
  token: string
): Promise<{ nonce: string; redirectUri: string } | null> {
  try {
    const secret = new TextEncoder().encode(
      process.env["GOOGLE_OAUTH_STATE_SECRET"]!
    );
    const { payload } = await jwtVerify(token, secret, {
      // No issuer/audience needed for this use case
    });
    return {
      nonce: payload["nonce"] as string,
      redirectUri: payload["redirectUri"] as string,
    };
  } catch {
    // ERR_JWT_EXPIRED, ERR_JWS_INVALID, or malformed
    return null;
  }
}
```

[CITED: https://github.com/panva/jose/blob/main/docs/jwt/sign/classes/SignJWT.md]
[CITED: https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md]

**Key detail:** The `state` URL param passed to Google is the JWT string itself (base64url-encoded, ~180–220 chars). Google echoes it back in the callback. No server-side storage required.

### Pattern 2: DI Factory (follow calendar-auth.ts / calendar-service.ts)

**What:** Export a `create*Router(deps?)` factory function. Production code calls it with no args; tests inject mocks via the deps object.

**When to use:** Every new route file in this project follows this pattern.

```typescript
// Source: vigil-core/src/routes/calendar-auth.ts (verified via Read)
export interface GoogleAuthDeps {
  getTokenFn?: (client: OAuth2Client, code: string) => Promise<{ tokens: Tokens }>;
  dbUpsertFn?: (...) => Promise<void>;
  // Remove stateStore — replaced by JWT; add signStateFn / verifyStateFn for test injection
  signStateFn?: (nonce: string, redirectUri: string) => Promise<string>;
  verifyStateFn?: (token: string) => Promise<{ nonce: string; redirectUri: string } | null>;
}
```

### Pattern 3: Drizzle Migration for scopes Column

**What:** Add a nullable `jsonb` column `scopes` to the `oauth_tokens` table. Existing rows have `NULL` (treated as scope gap — both scopes show `needs_auth`).

**When to use:** Any schema change. Always run `drizzle-kit generate` after editing `schema.ts`.

```typescript
// schema.ts addition (inside oauthTokens pgTable definition)
scopes: jsonb("scopes").$type<string[]>(),
// No .notNull() — NULL means "not yet recorded" (legacy calendar-only tokens)
```

```sql
-- Generated migration (0008_*.sql) will look like:
ALTER TABLE "oauth_tokens" ADD COLUMN "scopes" jsonb;
```

**Migration workflow:**

```bash
cd vigil-core
npx drizzle-kit generate   # creates 0008_*.sql
npx drizzle-kit migrate    # applies to local DB
# On Railway: db:migrate-prod runs via dist/db/migrate.js at deploy time
```

[VERIFIED: drizzle-kit 0.31.10 is in devDependencies; journal at 0007 is the current baseline]

### Pattern 4: GET /v1/google/status Route

**What:** A new protected route (behind bearer auth middleware) that reads the `scopes` column from `oauth_tokens` and returns per-scope status.

**When to use:** Any client wanting to know if re-authorization is needed before initiating an OAuth flow.

```typescript
// vigil-core/src/routes/google-status.ts
import { Hono } from "hono";
import { db } from "../db/connection.js";
import { oauthTokens } from "../db/schema.js";
import { eq } from "drizzle-orm";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const googleStatus = new Hono();

googleStatus.get("/google/status", async (c) => {
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const rows = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ calendar: "needs_auth", gmail: "needs_auth" }, 200);
  }

  const scopes: string[] = rows[0].scopes ?? [];

  return c.json({
    calendar: scopes.includes(CALENDAR_SCOPE) ? "connected" : "needs_auth",
    gmail: scopes.includes(GMAIL_SCOPE) ? "connected" : "needs_auth",
  }, 200);
});
```

**HTTP status decisions (Claude's discretion):**
- Row exists but scope gap: `200 OK` with `needs_auth` value — not a 4xx (the endpoint succeeded; the auth state is the data)
- No row: `200 OK` with both `needs_auth` — same reasoning
- DB unavailable: `503` — infra failure

### Anti-Patterns to Avoid

- **In-memory Map for OAuth state:** Dies on Railway rolling deploy. This phase exists to eliminate it. [VERIFIED: existing code at calendar-auth.ts:35]
- **jsonwebtoken library:** CommonJS-only, incompatible with this project's `"type": "module"`. D-01 locked `jose`. [VERIFIED: STATE.md blocker note]
- **Making an outbound API call in /google/status:** D-04 explicitly forbids this — read the scopes column only.
- **Storing raw refresh tokens:** Already handled by `token-crypto.ts`. Do not bypass `encryptToken` / `decryptToken`.
- **Separate gmail-auth route:** D-08 forbids this. Single unified `/auth/google` entry point.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT sign/verify | Custom HMAC + base64url encoding | `jose` SignJWT / jwtVerify | Timing-safe comparison, standard error codes, expiry handling |
| Token encryption/decryption | New AES implementation | Existing `token-crypto.ts` | Already audited, already used |
| OAuth token exchange | Raw HTTP POST to token endpoint | `google-auth-library` OAuth2Client | Handles edge cases, token refresh |
| Drizzle migration SQL | Hand-written ALTER TABLE | `drizzle-kit generate` | Keeps meta snapshots in sync; manual SQL will desync the journal |

---

## Common Pitfalls

### Pitfall 1: jose Not Installed

**What goes wrong:** Build/runtime error `ERR_MODULE_NOT_FOUND: Cannot find package 'jose'`
**Why it happens:** `jose` is a new dependency — not in `package.json` yet. [VERIFIED: import test]
**How to avoid:** Wave 0 task: `cd vigil-core && npm install jose` before any JWT code is written.
**Warning signs:** TypeScript compile error `Cannot find module 'jose'` even after code is written.

### Pitfall 2: JWT String Exceeds Google's state Parameter Limit

**What goes wrong:** Google silently truncates or rejects state parameters that are too long.
**Why it happens:** HS256 JWTs with a small payload are ~180–220 bytes base64url. Google's limit is not officially documented but is reliably safe up to 512 bytes.
**How to avoid:** Keep the JWT payload minimal: `{ nonce, redirectUri }` + standard claims. No extra data.
**Warning signs:** Callback receives a truncated or missing state value despite the initiation succeeding.

### Pitfall 3: Drizzle Meta Snapshot Desync

**What goes wrong:** Running `drizzle-kit migrate` fails with snapshot mismatch error.
**Why it happens:** Editing `schema.ts` without running `drizzle-kit generate` first means the journal and SQL file don't exist. Or: hand-writing a `.sql` without updating the meta snapshot.
**How to avoid:** Always `drizzle-kit generate` first, then `drizzle-kit migrate`. Never hand-edit drizzle/meta/*.json.
**Warning signs:** `drizzle-kit migrate` errors about missing migration entries.

### Pitfall 4: Existing Calendar-Only Tokens 403 on Gmail

**What goes wrong:** Code attempts a Gmail API call with a refresh token that only had `calendar.readonly` scope — receives `403 insufficientPermissions`.
**Why it happens:** The old token was granted before `gmail.readonly` was added to the scope list.
**How to avoid:** `GET /v1/google/status` detects this case via the `scopes` column (NULL or missing gmail scope) and returns `gmail: 'needs_auth'`. Phase 79 does NOT make Gmail API calls — only Phase 80 does. The status endpoint is the early-warning mechanism.
**Warning signs:** `scopes` column is NULL for an existing token row (expected for pre-Phase-79 tokens).

### Pitfall 5: GOOGLE_OAUTH_STATE_SECRET Not Set in Railway

**What goes wrong:** `jwtVerify` throws immediately because `GOOGLE_OAUTH_STATE_SECRET` is undefined; the sign call would use an empty-string secret.
**Why it happens:** The env var is new — not yet provisioned in Railway.
**How to avoid:** Add a startup guard (throw early if env var is missing). Document in STATE.md pending todos. **Verify in Railway console before deploying.**
**Warning signs:** Oauth initiation returns a 500 instead of a redirect.

### Pitfall 6: OAuth Callback Query Param Name Change

**What goes wrong:** Existing tests and PWA code expect `?calendar_error=` and `?calendar_connected=`. D-07 changes the success param to `?google_connected=true`.
**Why it happens:** Renaming the route and scope requires renaming the redirect params for consistency.
**How to avoid:** Update the existing `calendar-auth.test.ts` (renamed to `google-auth.test.ts`) to assert `google_error` and `google_connected` instead of `calendar_error`. Phase 81 is responsible for PWA-side param handling.
**Warning signs:** Test assertions for `calendar_error` pass when they should fail.

### Pitfall 7: index.ts Auth Middleware Exclusion Path

**What goes wrong:** `GET /v1/google/status` gets intercepted by the bearer auth middleware skip condition that only exempts `/v1/auth/google*` — leaving status behind auth.
**Why it happens:** `/v1/google/status` is a DIFFERENT path from `/v1/auth/google`. Status should be protected (needs bearer auth), but this must be intentional — document it.
**How to avoid:** Status IS protected (D-06 implies the PWA reads it — the PWA has an API key). No exclusion needed. Register googleStatus AFTER the auth middleware in index.ts.
**Warning signs:** `/v1/google/status` returns 401 in PWA when it should return data.

---

## Code Examples

### JWT Sign (GET /auth/google initiation)

```typescript
// Source: jose@6 SignJWT API (verified via WebFetch 2026-04-13)
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(
  process.env["GOOGLE_OAUTH_STATE_SECRET"]!
);

const stateJwt = await new SignJWT({ nonce: randomBytes(16).toString("hex") })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(secret);

// Pass stateJwt directly as the `state` param to generateAuthUrl
const url = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
  state: stateJwt,
});
```

### JWT Verify (GET /auth/google/callback)

```typescript
// Source: jose@6 jwtVerify API (verified via WebFetch 2026-04-13)
import { jwtVerify } from "jose";

async function verifyStateJwt(token: string): Promise<boolean> {
  try {
    const secret = new TextEncoder().encode(
      process.env["GOOGLE_OAUTH_STATE_SECRET"]!
    );
    await jwtVerify(token, secret); // throws on expiry or invalid sig
    return true;
  } catch {
    return false;
  }
}
```

### Scopes Upsert (at callback token storage)

```typescript
// After token exchange, extract granted scopes from OAuth2Client token info
// google-auth-library does not return scopes directly from getToken —
// scopes come from the id_token or must be derived from what we requested.
// SAFE APPROACH: Store the scopes we requested (since prompt: 'consent' forces full grant).
const grantedScopes = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

await db
  .insert(oauthTokens)
  .values({
    provider: "google",
    encryptedRefreshToken: encrypted,
    accessToken: tokens.access_token ?? "",
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    calendarSelections: [],
    scopes: grantedScopes,
  })
  .onConflictDoUpdate({
    target: oauthTokens.provider,
    set: {
      encryptedRefreshToken: encrypted,
      accessToken: tokens.access_token ?? "",
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: grantedScopes,
      updatedAt: new Date(),
    },
  });
```

### Drizzle Schema Addition

```typescript
// vigil-core/src/db/schema.ts — add to oauthTokens pgTable
// Source: existing schema.ts pattern (verified via Read)
scopes: jsonb("scopes").$type<string[]>(),
// Nullable: NULL = legacy token, no scope info recorded
```

---

## Scope Storage Design: Important Implementation Note

The `google-auth-library` `getToken()` response (`tokens` object) does not reliably return the `scope` field in all environments. The safest approach for this phase (confirmed by D-09 — always request both scopes together with `prompt: 'consent'`) is to **store the requested scope list** at callback time rather than parsing a scope field from the token response. If `prompt: 'consent'` is enforced, the granted scopes equal the requested scopes.

[ASSUMED: google-auth-library getToken() scope field reliability. If scope field IS present in the response, prefer reading from it for correctness. Add a check: `const grantedScopes = tokens.scope?.split(' ') ?? requestedScopes;`]

---

## Runtime State Inventory

> This is a rename/refactor phase — renaming `calendar-auth.ts` to `google-auth.ts` and updating import references.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing `oauth_tokens` row with `provider='google'`, no `scopes` column yet | Drizzle migration adds nullable column; existing row has NULL scopes (treated as scope gap) |
| Live service config | Railway env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` — all existing. New: `GOOGLE_OAUTH_STATE_SECRET` | Must add `GOOGLE_OAUTH_STATE_SECRET` in Railway console before deploy |
| OS-registered state | None | None |
| Secrets/env vars | `GOOGLE_OAUTH_STATE_SECRET` is new — not yet in Railway or any `.env` | Add to Railway + local `.env` for dev |
| Build artifacts | None — TypeScript compilation handles the rename cleanly | None beyond import updates in index.ts |

[VERIFIED: schema.ts — `oauth_tokens` table confirmed, no `scopes` column exists]
[VERIFIED: index.ts:72 — `calendarAuth` import from `calendar-auth.ts` is the rename target]
[ASSUMED: Railway console env var state — not verified live; listed in STATE.md as pending todo]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 25.2.1 | — |
| `jose` npm package | JWT nonce | Yes (registry) | 6.2.2 | — |
| `jose` (installed) | JWT nonce | NO — not in node_modules | — | None — must install |
| `drizzle-kit` | Schema migration | Yes (devDep) | 0.31.10 | — |
| Railway `GOOGLE_OAUTH_STATE_SECRET` | JWT signing | Unknown | — | None — blocks deploy |
| Local `.env` `GOOGLE_OAUTH_STATE_SECRET` | Local dev/test | Unknown | — | Generate with `openssl rand -hex 32` |

**Missing dependencies with no fallback:**
- `jose` must be installed (`npm install jose` in `vigil-core/`) before JWT code can run
- `GOOGLE_OAUTH_STATE_SECRET` must be added to Railway before production deploy

**Missing dependencies with fallback:**
- Local dev `GOOGLE_OAUTH_STATE_SECRET`: generate with `openssl rand -hex 32` and add to local env

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | None — discovered via glob pattern in `npm test` |
| Quick run command | `cd vigil-core && npm test` |
| Full suite command | `cd vigil-core && npm test` |

[VERIFIED: package.json — `"test": "tsx --test \"src/**/*.test.ts\""` — uses Node built-in test runner with tsx]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OAUTH-04 | JWT state is signed with GOOGLE_OAUTH_STATE_SECRET | unit | `cd vigil-core && npm test` | ❌ Wave 0 (new test file) |
| OAUTH-04 | JWT state validates correctly in callback (valid sig, not expired) | unit | `cd vigil-core && npm test` | ❌ Wave 0 |
| OAUTH-04 | Expired JWT state fails callback with google_error=invalid_state | unit | `cd vigil-core && npm test` | ❌ Wave 0 |
| OAUTH-04 | Tampered JWT state fails callback with google_error=invalid_state | unit | `cd vigil-core && npm test` | ❌ Wave 0 |
| OAUTH-04 | GET /auth/google includes both calendar.readonly and gmail.readonly scopes | unit | `cd vigil-core && npm test` | ❌ Wave 0 (update existing) |
| D-04/D-06 | GET /v1/google/status returns `{calendar:'connected', gmail:'connected'}` when both scopes stored | unit | `cd vigil-core && npm test` | ❌ Wave 0 |
| D-04/D-06 | GET /v1/google/status returns `{calendar:'connected', gmail:'needs_auth'}` for legacy calendar-only token | unit | `cd vigil-core && npm test` | ❌ Wave 0 |
| D-04/D-06 | GET /v1/google/status returns both needs_auth when no row exists | unit | `cd vigil-core && npm test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd vigil-core && npm test`
- **Per wave merge:** `cd vigil-core && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vigil-core/src/routes/google-auth.test.ts` — new test file covering JWT sign/verify, scope inclusion, callback flow, error redirects (replaces/extends `calendar-auth.test.ts`)
- [ ] `vigil-core/src/routes/google-status.test.ts` — covers D-04/D-06 status response shapes
- [ ] `jose` npm install — required before any test that imports google-auth.ts can run

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | Yes — OAuth state parameter is a one-time CSRF token | jose JWT with exp claim + HS256 signature |
| V4 Access Control | Yes — `/v1/google/status` behind bearer auth | Existing bearerAuth middleware |
| V5 Input Validation | Yes — state JWT from Google callback | jwtVerify throws on tampered/expired tokens |
| V6 Cryptography | Yes — JWT signing | jose HS256 with 256-bit secret; never hand-roll |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF via forged OAuth state | Spoofing | JWT signed with GOOGLE_OAUTH_STATE_SECRET; verify in callback |
| State fixation (replay) | Elevation | JWT has 5-min expiry; jwtVerify rejects expired tokens automatically |
| Secret leakage in logs | Information Disclosure | Never log state JWT or token values (follow T-74-08 pattern from calendar-service.ts) |
| Scope inflation | Elevation of Privilege | `gmail.readonly` is restricted (not sensitive) — no CASA audit; app stays in Testing mode |
| Token storage in plaintext | Information Disclosure | `token-crypto.ts` AES-256-GCM already handles this; no changes needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `google-auth-library` getToken() may not return a `scope` field reliably — safer to store requested scopes | Scope Storage Design | If scope field IS present and differs from requested (e.g., user de-selected a scope in consent UI), we'd store incorrect data. Mitigation: check `tokens.scope` first, fall back to requested list |
| A2 | `GOOGLE_OAUTH_STATE_SECRET` is not yet set in Railway console | Environment Availability | If it IS already set (e.g., from a prior experiment), the Wave 0 provisioning task is a no-op but still safe |
| A3 | Google accepts JWT strings as the OAuth `state` parameter (base64url, ~200 chars) | Architecture Patterns — Pitfall 2 | Google's state param length limit is not officially documented. If it truncates at <200 chars, a different nonce strategy (short random ID + server-side JWT cache) would be needed. Low risk for typical HS256 JWT size. |

---

## Open Questions

1. **Does google-auth-library `getToken()` return a `scope` field in the token response?**
   - What we know: The OAuth 2.0 spec allows (but does not require) `scope` in the token response.
   - What's unclear: Whether Google's token endpoint includes it consistently.
   - Recommendation: Code defensively — `const scopes = tokens.scope?.split(' ') ?? requestedScopeList`. Test with a real OAuth flow during manual verification.

2. **Google OAuth consent screen re-verification after adding gmail.readonly?**
   - What we know: `gmail.readonly` is a restricted scope. Adding a new scope may require users to re-consent. STATE.md notes: "Google OAuth consent screen may need re-verification after adding gmail.readonly scope."
   - What's unclear: Whether the consent screen itself needs Google review (it does NOT for restricted scopes in Testing mode with <100 users).
   - Recommendation: App stays in Testing/personal-use mode — no review needed. The `prompt: 'consent'` in D-09 forces re-consent at the user level regardless.

---

## Sources

### Primary (HIGH confidence)

- `vigil-core/src/routes/calendar-auth.ts` — existing OAuth flow, in-memory nonce pattern (Read tool)
- `vigil-core/src/db/schema.ts` — `oauthTokens` table definition, current column list (Read tool)
- `vigil-core/src/services/calendar-service.ts` — DI factory pattern (Read tool)
- `vigil-core/src/utils/token-crypto.ts` — AES-256-GCM encrypt/decrypt (Read tool)
- `vigil-core/src/index.ts` — Route registration, auth middleware exclusion paths (Read tool)
- `vigil-core/package.json` — Installed dependencies confirmed (Read tool)
- npm registry — `jose` version 6.2.2 (Bash: `npm view jose version`)
- `jose` import test — confirms NOT installed in vigil-core node_modules (Bash)

### Secondary (MEDIUM confidence)

- jose SignJWT API documentation (WebFetch: github.com/panva/jose) — HS256 sign pattern
- jose jwtVerify API documentation (WebFetch: github.com/panva/jose) — verify with error codes

### Tertiary (LOW confidence)

- Google OAuth state parameter length tolerance — not officially documented; practical limit inferred from common usage patterns [ASSUMED]

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all versions verified via npm registry and codebase inspection
- Architecture: HIGH — patterns copied directly from existing verified code
- JWT API: MEDIUM — verified via official jose docs (WebFetch), not Context7
- Pitfalls: HIGH — most derived from verified code inspection (existing in-memory nonce, import failures)
- Scope storage: MEDIUM — one assumption about google-auth-library response shape

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (jose is stable; Google OAuth API stable)
