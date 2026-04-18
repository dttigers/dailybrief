# Phase 102: Multi-User Foundation - Research

**Researched:** 2026-04-18
**Domain:** Hono + Drizzle + PostgreSQL auth (JWT + argon2), multi-tenant row scoping
**Confidence:** HIGH (most decisions already locked in CONTEXT.md; research verifies technical specifics against installed deps and live Railway environment)

## Summary

Phase 102 is almost entirely constrained by the 23 locked decisions in CONTEXT.md. The research job is to nail down three categories of technical specifics: (1) which exact libraries + import paths to use, (2) the precise shape of the Drizzle migration (nullable → backfill → NOT NULL), and (3) an exhaustive per-route audit of the scoping surface so AUTH-05 can be converted directly into a task list.

Two live-environment discoveries reshape the default recommendations:

1. **`jose ^6.2.2` is already installed AND already in production use** in `src/routes/google-auth.ts` for Google OAuth state JWTs (HS256 via `SignJWT` + `jwtVerify`). This is the canonical path — do not introduce `hono/jwt` (which currently has an RS256→HS256 confusion CVE in versions < 4.11.4; local install is 4.12.10, clean, but the pattern is already solved with jose).
2. **Railway deploys via `node:20-alpine` (musl)**. The traditional `argon2` npm package ships glibc-only prebuilt binaries and has historically been the source of Alpine deploy failures. **`@node-rs/argon2` ships `@node-rs/argon2-linux-x64-musl` prebuilt binaries**, is ~10x smaller on disk, and has zero native-build step. CONTEXT.md D-16 says "argon2 npm package" — recommend the planner flip this to `@node-rs/argon2` before implementation, or explicitly verify the current `argon2` package build on the Dockerfile.

**Primary recommendation:** Use `jose` for JWT (already installed, already used), `@node-rs/argon2` for password hashing (musl-native), a single custom-SQL Drizzle migration for the 11-table backfill with explicit `ALTER ... IF NOT EXISTS` + `INSERT ... ON CONFLICT DO NOTHING` for idempotency, and a `detectTokenType()` helper in the existing `bearerAuth` middleware that routes `vk_`-prefixed tokens to the SHA256 lookup path and JWT-shaped tokens (two dots, segment 0 base64url-decodes to `{"alg":"HS256",...}`) to `jwtVerify`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `bearerAuth` middleware stays; `api_keys` gets `user_id` FK; looked-up row sets `c.set('userId', ...)`.
- **D-02:** Same middleware detects JWT vs `vk_`; both paths set `c.get('userId')` identically.
- **D-03:** Zero breakage for Monitor, G2, CLI, MacBook Pro, PWA — all existing `vk_` keys linked to seed user.
- **D-04:** Seed user email from `VIGIL_SEED_USER_EMAIL`, default `jamesonmorrill1@gmail.com`.
- **D-05:** Single Drizzle migration: create users table → insert seed user with placeholder password → add nullable `user_id` to every data table → backfill NULLs to seed → `ALTER COLUMN user_id SET NOT NULL`.
- **D-06:** Migration idempotent via `INSERT ... ON CONFLICT (email) DO NOTHING` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **D-07:** Scoped tables: `thoughts`, `projects`, `briefs`, `briefPdfs`, `thoughtLinks`, `chatSessions`, `workOrders`, `oauthTokens`, `appSettings`, `aiCache`, `apiKeys`. Unscoped: `workOrderStatuses`.
- **D-08/09/10:** `POST /v1/auth/register` checks `VIGIL_ALLOWED_EMAILS` allowlist; 403 generic msg if not allowed; 503 if allowlist unset (fail-closed).
- **D-11:** Registering seed email over placeholder password = claim account; any other existing email = 409 Conflict.
- **D-12/13:** 30-day JWT, stateless, no refresh, no revocation list. Global invalidation = rotate `JWT_SECRET`.
- **D-14:** Claims = `sub` (userId number), `email`, `iat`, `exp`. No roles this phase.
- **D-15:** HS256 only.
- **D-16:** argon2id via `argon2` npm package. OWASP 2024 params: `memoryCost: 19456, timeCost: 2, parallelism: 1`. **[RESEARCH COLLISION — see "Don't Hand-Roll" and "Common Pitfalls" below. Recommend flipping to `@node-rs/argon2` for Alpine/musl compatibility.]**
- **D-17:** No bcrypt compat layer.
- **D-18/19/20:** `JWT_SECRET` required at boot, min 32 bytes, fail-fast exit. Document in runbook.
- **D-21:** Every route handler uses `c.get('userId')` in `where` clauses.
- **D-22:** Route-level scoping (not DB RLS). Test with 2-user cross-user leakage assertion.
- **D-23:** Reference tables (workOrderStatuses, plus any others found at plan time) stay unscoped.

### Claude's Discretion

- File layout for auth routes (single `routes/auth.ts` vs split).
- Error message wording (as long as no user-existence leak; generic "Invalid credentials").
- Logging verbosity (no plaintext passwords).
- Whether to put `email` in JWT payload (recommend yes).

### Deferred Ideas (OUT OF SCOPE)

- Refresh tokens, password reset, PWA login UI, profile editing, admin invite, rate limiting on register/login, per-session revocation, roles/scopes in JWT, `vk_` deprecation.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | users table with email, hashed password, profile fields | Drizzle schema addition — see "Standard Stack" + migration template in "Code Examples" |
| AUTH-02 | Register endpoint | Allowlist check (D-08/09/10) + argon2id hash + seed-user claim-flow logic (see "Code Examples — Register route with claim semantics") |
| AUTH-03 | Login endpoint returning JWT | `jose.SignJWT` with HS256, 30d exp, claims per D-14 |
| AUTH-04 | userId FK on all data tables, backfill to seed | Single custom-SQL Drizzle migration; per-table ALTER + UPDATE + SET NOT NULL — see "Code Examples — Migration" |
| AUTH-05 | All routes scope queries to `c.get('userId')` | Complete route-by-route audit in "Architecture Patterns — Route Scoping Audit" |

## Standard Stack

### Core

| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `jose` | `^6.2.2` installed, `6.2.2` latest on npm (2026-03-18) | JWT sign/verify (HS256) | **Already installed and in use** in `src/routes/google-auth.ts`. Pinned via `TextEncoder` pattern. Zero new dep. [VERIFIED: `npm view jose version`; grep of src shows existing `SignJWT`+`jwtVerify` usage] |
| `@node-rs/argon2` | `2.0.2` latest on npm (2025-05-04) | argon2id password hashing | **Prebuilt musl binaries** (`@node-rs/argon2-linux-x64-musl`) — zero-compile on `node:20-alpine`. No node-gyp. 476KB vs argon2's 3.7MB. Pure Rust binding. [VERIFIED: npm registry; Dockerfile uses `node:20-alpine`] [CITED: https://www.npmjs.com/package/@node-rs/argon2] |
| `drizzle-orm` | `^0.45.2` installed | Schema + query builder | Already the ORM. New `users` table follows existing `pgTable` pattern. [VERIFIED: package.json] |
| `drizzle-kit` | `^0.31.10` installed | Migration tooling | Use `drizzle-kit generate` for schema changes; **fall back to manually editing the generated `.sql` for backfill + NOT NULL steps** (kit can't generate the UPDATE + ALTER NOT NULL sequence on its own). [CITED: https://orm.drizzle.team/docs/kit-custom-migrations] |

**Alternative considered and rejected for password hashing:**

| Instead of | Could Use | Tradeoff | Verdict |
|------------|-----------|----------|---------|
| `@node-rs/argon2` | `argon2` (ranisalt/node-argon2 `^0.44.0`) | Mature, more GitHub stars. **But** ships glibc-only prebuilt binaries; historically fails to install on Alpine (see node-argon2 issues #223, #301). Requires python + build-essential + libc6-dev in Docker layer for musl environments, OR switching base image to Debian slim. | **Reject.** CONTEXT.md D-16 names `argon2`; recommend the planner override D-16 after a 5-minute spike test. If the planner keeps `argon2`, MUST test the install on the actual Dockerfile — not just on the dev macOS machine. |

**Alternative considered and rejected for JWT:**

| Instead of | Could Use | Tradeoff | Verdict |
|------------|-----------|----------|---------|
| `jose` | `hono/jwt` (built into Hono) | Zero dep. Used by many Hono tutorials. **But** Hono < 4.11.4 had an HS256↔RS256 algorithm-confusion CVE (CVE-2026-22817, CVSS 8.2). Current vigil-core Hono is 4.12.10 — patched — but the codebase already uses `jose` for Google OAuth state JWTs, so staying with one JWT lib is cleaner. | **Reject.** Consistency wins; `jose` is already the canonical JWT library in this codebase. [CITED: Hono security advisory; src/routes/google-auth.ts:4] |

**Installation:**

```bash
cd vigil-core
npm install @node-rs/argon2
# jose is already a dep — no install needed
```

**Version verification:**

```bash
npm view @node-rs/argon2 version  # => 2.0.2 (2025-05-04)
npm view jose version             # => 6.2.2 (2026-03-18)
```

## Architecture Patterns

### Recommended File Layout

```
vigil-core/src/
├── middleware/
│   └── auth.ts                 # EXTENDED — adds JWT path + setUserId; same function signature
├── routes/
│   ├── auth.ts                 # NEW — POST /v1/auth/register + POST /v1/auth/login (single file, per CONTEXT.md Claude's Discretion)
│   └── {all existing routes}   # EDITED — each adds `.where(eq(table.userId, c.get('userId')))` to every query
├── db/
│   └── schema.ts               # EDITED — adds users table, adds userId column to 11 tables
├── utils/
│   ├── jwt.ts                  # NEW — signToken/verifyToken wrappers around jose with JWT_SECRET boot check
│   └── password.ts             # NEW — hash/verify wrappers around @node-rs/argon2 with OWASP params
└── scripts/
    └── set-password.ts         # NEW — out-of-band password-set helper for seed user (see D-05)

vigil-core/drizzle/
└── 0012_multi_user_foundation.sql  # NEW — single migration with all schema + backfill steps
```

### Pattern 1: Token-Type Detection in bearerAuth

**What:** One middleware, two auth paths. Detect `vk_` prefix cheaply; everything else is tried as a JWT. Set `userId` on Hono context identically from both paths.

**When to use:** Every request into `/v1/*` except `/v1/health`, `/v1/auth/google*`, and the new `/v1/auth/register` + `/v1/auth/login`.

**Detection rule (unambiguous):**

- `vk_` keys are exactly `vk_` + 64 hex chars (see `scripts/generate-key.ts:21` — 32 random bytes → 64 hex). **They contain zero dots.**
- JWTs have exactly two dots (`header.payload.signature`).
- A string cannot satisfy both constraints → detection is deterministic.

**Defensive check:** If a token is neither — starts with `vk_` but has dots, OR has != 2 dots and doesn't start with `vk_` — reject as malformed (401) without doing either lookup. This protects against log-poisoning and odd client bugs.

### Pattern 2: Single Shared Context Key

**What:** Every scoped query reads `c.get('userId')` (`number`). Set once by middleware; never read `Authorization` header twice.

**Type augmentation** (in `src/middleware/auth.ts` or a new `src/types/hono-env.ts`):

```typescript
// Augment Hono's Variables so TypeScript knows c.get('userId') returns number
declare module "hono" {
  interface ContextVariableMap {
    userId: number;
  }
}
```

### Pattern 3: Migration in Expand-Contract Shape

**What:** Add nullable column → backfill → add NOT NULL. Must be one SQL file so it runs atomically per `db/migrate.ts`'s loop.

**Why single file:** `drizzle-orm/postgres-js/migrator` runs each `.sql` in a single transaction. If we split into 0012, 0013, 0014, then Railway's restart-on-deploy cycle could leave the DB in a half-migrated state if deploy fails between them.

### Pattern 4: Claim-Account via Register

**What:** `POST /v1/auth/register` with seed email + password overwrites the placeholder hash for that one existing user. Every other existing email returns 409 Conflict. No existence leak — both cases return the same generic "Registration failed" wording, differentiated only by HTTP status (403 not allowed / 409 conflict / 201 success).

**Why not leak existence:** OWASP Cheat Sheet (Authentication) flags "email already registered" as a user-enumeration vector. But the claim-flow has a built-in leak anyway: the seed email IS the app's hardcoded default, so its existence is public knowledge. Still, the planner should use the same generic error for 403 AND 409, so adding a second allowlisted user in the future doesn't create asymmetric error signals.

### Anti-Patterns to Avoid

- **Using Drizzle's ORM-level userId defaulting:** Do not set `userId: c.get('userId')` in a schema `$default`. That's runtime-call-site coupling; one missed route → silent cross-user leak. Per D-22, scoping is the route's explicit responsibility.
- **Checking JWT shape with `jwt.decode(tok, {complete:true})` before verify:** Decoding an unverified JWT reveals no secret but also tells you nothing useful — just use the two-dot check for routing, then call `jwtVerify` as the sole trust boundary.
- **Storing `vk_` keys differently per user:** Do NOT add a per-user prefix to `vk_` keys. `api_keys.userId` is a FK only — the `keyHash` lookup stays as-is.
- **Issuing JWTs in the register response:** CONTEXT.md says register returns success, login returns the JWT. Keeping register → 201 + user body, login → 200 + token matches REST convention and mirrors the "you registered, now log in" flow a future PWA screen will use.

### Route Scoping Audit (AUTH-05 task-list source)

Every file under `vigil-core/src/routes/` that queries a scoped table needs a `.where(..., eq(table.userId, c.get('userId')))` addition. The audit below enumerates every query site verified from grep.

| File | Scoped Tables Touched | Query Sites Needing `userId` Scope | Gotchas |
|------|----------------------|-----------------------------------|---------|
| `summary.ts` | thoughts, thoughtLinks | 5 queries (lines 17, 23, 41, 59, 77) | `linkedCount` query is `count(distinct sourceThoughtId)` from `thoughtLinks` — needs JOIN to thoughts OR direct `thoughtLinks.userId` filter (thoughtLinks gets its own `userId` per D-07) |
| `thoughts.ts` | thoughts, projects, appSettings | 6+ queries (lines 217, 223, 253, 298 insert, 353, 398, 433 update, 455, 467 delete) | `projects` FK check at line 400 — scope the existence check too, else userA could reference userB's projectId |
| `projects.ts` | projects | All CRUD (list, get, create, update, delete) | Straight scope by `userId` on every query. `created` insert must set `userId: c.get('userId')`. |
| `bulk.ts` | thoughts | 5 sites (lines 40, 85, 137, 189, 213) | `inArray(thoughts.id, ids)` + userId scope — prevents "userA sends userB's ids and bulk-deletes them" attack |
| `tags.ts` | thoughts | 8 sites across GET/POST/DELETE/GET /tags | Pure per-thought ops; add userId to every `from(thoughts).where(...)` |
| `links.ts` | thoughts, thoughtLinks | 7 sites — link create checks both thoughts exist; list joins from both sides | CRITICAL: when creating a link, check BOTH source and target `userId === c.get('userId')` — prevents linking userA's thought to userB's thought. `thoughtLinks.userId` is redundant-but-safe belt-and-suspenders. |
| `brief.ts` | thoughts | 9 sites (lines 17–143) — pulls thoughts for the rendered brief | All scoped by userId. The brief becomes per-user data. |
| `brief-history.ts` | briefs | 4 sites (56 insert, 115, 121, 153) | briefs.userId — a user only sees their own brief history |
| `brief-generate.ts` | briefs, briefPdfs, thoughts | 4+ sites; transaction wraps insert briefs + briefPdfs | briefPdfs.userId is denormalized (same as parent briefs.userId) — set it at insert time |
| `chat-sessions.ts` | chatSessions | 4+ (list line 20, get 43, create, update, delete) | Per-user chat sessions |
| `chat.ts` | thoughts (context injection), chatSessions (session) | Embedded in chat flow; scope both reads | Context is per-user; never inject userB's thoughts into userA's chat |
| `work-orders.ts` | workOrders (+ workOrderStatuses read-only) | Upsert (sync) + list + archive + unarchive + delete | workOrders.userId per D-07. workOrderStatuses stays global per D-23. |
| `work-order-status.ts` | workOrderStatuses (unscoped) | No userId needed | Unscoped per D-23 |
| `insights.ts` | aiCache, appSettings, thoughts | 4 sites (16, 42, 58, 143 insert) | `aiCache.userId` — don't cache userA's insights and serve them to userB. `appSettings` carries `user_timezone`; becomes per-user. |
| `therapy.ts` | aiCache, appSettings, thoughts | 6 sites (28, 136, 152, 216, 256, 272, 326) | Same per-user caching concern as insights. |
| `export.ts` | thoughts | 1 site (158) | Straight scope |
| `settings.ts` | appSettings | All reads/writes of print_schedule, generate_schedule, user_timezone, task_status_filter | appSettings goes from global to per-user: every `(key)` primary key becomes `(userId, key)` composite. See "Pitfall 3" below. |
| `triage.ts` | thoughts | Reads thought to re-triage, updates same | Scope the read; scope the update. Already goes through auth, so userId is available. |
| `affirmation.ts` | (no DB tables scoped — pure Claude call) | — | No change |
| `prioritize.ts` | aiCache | Cache key for work order prioritization | aiCache.userId needed |
| `process-photo.ts` | thoughts | Creates thought after OCR | Set userId on insert |
| `process-audio.ts` | thoughts | Creates thought after transcription | Set userId on insert |
| `describe-image.ts` | (no DB writes; stateless call) | — | No change |
| `sports.ts` | (no scoped tables) | — | Unchanged |
| `calendar.ts` | oauthTokens (indirectly via service) | Google Calendar service uses the single oauthTokens row | oauthTokens.userId per D-07; the service needs to take userId as a param now |
| `google-auth.ts` | oauthTokens | Insert/upsert on callback | **Gotcha:** Google OAuth callback has NO bearer auth (excluded in index.ts:91). The callback's only user identity signal is the encrypted state JWT it issued 5 minutes ago. **Planner must decide:** either (a) include userId in the OAuth state JWT at `/auth/google` initiation, or (b) require the user to be logged in BEFORE initiating OAuth (simplest — redirect to login if not). Recommend (a) — put `userId` into the state JWT claims alongside the nonce. |
| `google-status.ts` | oauthTokens | List + delete by provider | Scope both by userId |
| `health.ts` | (public, no auth) | — | Unchanged |

**Audit summary:** 20 route files need userId scoping changes; 5 are unchanged. Total scoped-query sites ≈ 70. The Google OAuth callback is the single non-trivial design decision — **flag for the planner.**

**Services also needing userId threading** (not routes, but they read/write scoped data):

| Service | File | Change |
|---------|------|--------|
| `createBriefAssemblyService` | `src/services/brief-assembly-service.ts` | `assembleAndRender(dateStr, userId)` — every query inside takes userId |
| `createGenerateScheduler` | `src/services/generate-scheduler.ts` | **Scheduler decision:** at current scale, cron the assembly ONCE per seed user. For future multi-user: loop over all users at tick time, or store schedule per-user (D-21 says appSettings becomes per-user anyway). **Planner flag:** the scheduler currently has no notion of user — decide this at plan time. |
| `createGmailWorkOrderService` | `src/services/gmail-workorder-service.ts` | Same — currently reads the single `oauthTokens.provider='google'` row. After per-user oauthTokens, must loop OR scope to seed user only. At current scale, scoping to seed user is fine. |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom scrypt/PBKDF2 wrapper | `@node-rs/argon2` | Edge cases: salt generation, timing-safe compare, parameter encoding into the hash string. argon2 encodes params inline in the output (`$argon2id$v=19$m=19456,t=2,p=1$salt$hash`) so future param bumps remain verify-compatible. |
| JWT sign/verify | Custom HMAC | `jose.SignJWT` + `jose.jwtVerify` | Edge cases: algorithm confusion (CVE-2026-22817 class), `exp` vs `iat` clock drift, base64url vs base64, RS256 public-key-masquerading-as-HMAC-secret. `jose` is audited and used in millions of requests via Auth0/Clerk/Next-auth. |
| Email allowlist parsing | Custom split | Plain `.split(',').map(s => s.trim().toLowerCase())` | This is trivial — but do lowercase-normalize on both sides (env AND submitted email) per "Pitfall 5" below. |
| Token-type detection | Custom JWT parser | 2-dot string check | A malformed JWT should go through `jwtVerify` and fail there, not be rejected pre-emptively. Over-eager pre-validation is a footgun. |
| Migration idempotency | Ad-hoc `IF NOT EXISTS` patterns | Drizzle's migration journal + raw-SQL custom migration with `IF NOT EXISTS` guards on ALTER ADD COLUMN | The migration journal (`drizzle/meta/_journal.json`) already prevents double-runs of the same migration; the `IF NOT EXISTS` guards are defense-in-depth for "someone manually ran the SQL on a staging branch." |

**Key insight:** Three token classes — `vk_` SHA256 keys, JWTs with HS256, argon2id passwords — have three very different cryptographic treatments. Never reuse code between them. The auth middleware is the only place that sees all three (it dispatches between paths 1 and 2; path 3 is only touched in `/auth/register` and `/auth/login`).

## Common Pitfalls

### Pitfall 1: argon2 npm package fails on `node:20-alpine`
**What goes wrong:** `npm ci --omit=dev` in the production Dockerfile stage fails with `sharp-like` native build errors because the `argon2` package tries to download a glibc binary and fall back to `node-gyp`, which requires `python3 + make + g++` not present in `node:20-alpine`.
**Why it happens:** `argon2` (ranisalt/node-argon2) ships prebuilt binaries only for glibc-based Linux. Alpine uses musl libc.
**How to avoid:** Use `@node-rs/argon2` which ships `@node-rs/argon2-linux-x64-musl` as a separate optional-dep npm package. Zero build step. [CITED: https://github.com/ranisalt/node-argon2/issues/223]
**Warning signs:** `node-pre-gyp ERR!` in Railway build logs. `gyp ERR! stack Error: not found: make` in local `docker build` tests.

### Pitfall 2: Migration partial-success leaves DB in mixed state
**What goes wrong:** The multi-step migration (add column → backfill → SET NOT NULL) runs on Railway, `ADD COLUMN` + `UPDATE` succeed for 6 tables, then `ALTER COLUMN user_id SET NOT NULL` fails on the 7th because the backfill missed some rows (e.g., a row inserted between the UPDATE and the ALTER by a still-running scheduler). Migration fails; DB has 7 nullable userId columns + 6 that are NOT NULL.
**Why it happens:** `drizzle-orm/postgres-js/migrator` runs each `.sql` file in a single transaction, BUT only if the file as a whole is valid. If we split into separate files, no transaction binds them.
**How to avoid:**
1. **Single .sql file** containing all 11 tables' worth of ADD COLUMN / UPDATE / SET NOT NULL. Drizzle runs the whole file in one transaction.
2. **Stop the schedulers before deploy:** Phase 102 deploy should scale Railway to 0 replicas, run the migration manually via `npm run db:migrate-prod`, verify, then scale back to 1. The schedulers (generate-scheduler, gmail-workorders) write to scoped tables; they must not run during migration.
3. **Alternative for true zero-downtime:** Run migration #1 (add nullable + backfill) in deploy N, then migration #2 (SET NOT NULL) in deploy N+1 after confirming no NULL userIds remain. At current user count (1), this overkill; take the 30-second downtime.

### Pitfall 3: appSettings per-user primary key change
**What goes wrong:** `appSettings.key` is currently a `text` PRIMARY KEY (singleton rows per setting — `print_schedule`, `user_timezone`, etc.). Adding `userId` makes `key` no longer unique across rows (userA and userB both have `print_schedule`). Adding `userId` nullable + backfilling doesn't help — the PK constraint still says `key` is unique.
**Why it happens:** appSettings' schema was designed for singleton global config. Multi-user requires composite PK `(userId, key)`.
**How to avoid:** The migration for appSettings needs to be:
```sql
ALTER TABLE app_settings ADD COLUMN user_id INTEGER REFERENCES users(id);
UPDATE app_settings SET user_id = (SELECT id FROM users WHERE email = $seed_email) WHERE user_id IS NULL;
ALTER TABLE app_settings DROP CONSTRAINT app_settings_pkey;
ALTER TABLE app_settings ADD PRIMARY KEY (user_id, key);
ALTER TABLE app_settings ALTER COLUMN user_id SET NOT NULL;
```
Planner must call this out as its own migration step. Other tables use a `serial` PK and are simpler. Same consideration applies to `workOrders` (PK is `caseNumber`) — multiple users could theoretically have the same caseNumber from different ServiceNow instances. Current single-tenant assumption says caseNumbers are globally unique, but the composite PK is the correct model.

**Warning signs:** `ERROR: duplicate key value violates unique constraint "app_settings_pkey"` on second user.

### Pitfall 4: vk_ key with no userId after backfill
**What goes wrong:** After migration, every `api_keys` row has userId = seed user. But if anyone runs `scripts/generate-key.ts` between the schema deploy and the backfill completing (rare window), the new key has NULL userId. `bearerAuth` then calls `c.set('userId', null)`, and all downstream scoped queries silently return empty results — looks like "user has no data" instead of "auth broken."
**Why it happens:** The `generate-key.ts` script needs updating to require `--user-id` or `--email` arg and set `apiKeys.userId` explicitly.
**How to avoid:**
1. Make `apiKeys.userId` NOT NULL after backfill (D-05 covers this).
2. Update `scripts/generate-key.ts` to take `--email` and look up the userId at script time. Fail-loud if the user doesn't exist.
3. In `bearerAuth`, defensively: if the looked-up apiKeys row has NULL userId (shouldn't happen post-migration, but...), return 500 with "Server misconfiguration" — fail loud, not silent.

### Pitfall 5: Email case-sensitivity in allowlist
**What goes wrong:** User registers as `Jamesonmorrill1@Gmail.com` but allowlist env is `jamesonmorrill1@gmail.com`. Registration rejected. OR: user registers as lowercase, allowlist has uppercase, rejected.
**Why it happens:** Email addresses are case-insensitive in the local part per RFC 5321 de-facto (though formally only case-insensitive in the domain), but string comparison doesn't know that.
**How to avoid:**
1. Normalize BOTH sides: lowercase the submitted email AND the split allowlist entries before comparison.
2. **Also store emails in the DB as lowercase** (normalize at insert time). Put a `CHECK (email = LOWER(email))` constraint if paranoid, or just document the convention.
3. Same treatment for the seed user: if `VIGIL_SEED_USER_EMAIL` is set to mixed-case, lowercase it before the seed insert.

### Pitfall 6: JWT_SECRET rotation breaks all active sessions
**What goes wrong:** You rotate `JWT_SECRET` on Railway (intentional: global revocation). Every outstanding JWT on any client instantly 401s. The PWA, Mac dashboard, G2 plugin, Monitor, CLI all need to re-authenticate. But at the current state, only the PWA *could* have a JWT; the others use `vk_` keys which are unaffected by JWT_SECRET rotation. **Known rotation procedure for this phase:**
1. PWA is still on `vk_` keys (per CONTEXT.md §specifics — no PWA UI changes this phase). **So JWT_SECRET rotation today has zero client impact.**
2. After AUTH-06 ships (PWA switches to JWT), rotation becomes a user-visible event and needs coordination.
**How to avoid:** Document the rotation playbook in `vigil-core/RUNBOOK.md` or the CONTEXT.md §canonical_refs as part of this phase:
```
# JWT_SECRET rotation (global invalidation)
1. Generate new secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
2. Update Railway env var
3. Trigger redeploy
4. Expected impact: all currently-issued JWTs fail on next request; clients re-login
5. Duration: ~30s deploy cycle; users see 1-2 failed requests
```

### Pitfall 7: ON DELETE CASCADE vs RESTRICT on userId FK
**What goes wrong:** DELETE FROM users WHERE id = $seed_id; → cascades through 11 tables → ~137+ thoughts and all briefs/projects/chat sessions vanish without a backup.
**Why it happens:** FK declaration `.references(() => users.id, { onDelete: "cascade" })` does exactly what it says.
**How to avoid:** Use `{ onDelete: "restrict" }` (the default) for the userId FK on every scoped table. Prevents accidental mass deletion. At current size, the seed user has ~137 thoughts, ~N projects, brief history, etc. — cascade would be catastrophic. Manual user deletion becomes a deliberate multi-step ritual (explicit delete of data tables first, then user), which is correct for a personal tool.
**Warning signs:** If planner's migration template copies the `projects.id` → `thoughts.projectId` pattern (which uses `{ onDelete: "set null" }`), that's fine for projectId but WRONG for userId. userId is mandatory (NOT NULL); nulling on delete would fail the NOT NULL constraint. Use `restrict`.

### Pitfall 8: Hono CORS + unauthenticated auth routes
**What goes wrong:** PWA at `app.vigilhub.io` tries to POST to `/v1/auth/register`; browser preflight OPTIONS request hits the bearer auth middleware; middleware rejects → preflight fails → POST never fires. Same issue as `/v1/health` already solved in `src/index.ts:89-93`.
**How to avoid:** Add `/v1/auth/register` and `/v1/auth/login` to the bearerAuth exclusion list (alongside `/v1/health` and `/v1/auth/google*`). Pattern already exists:
```typescript
app.use("/v1/*", async (c, next) => {
  if (c.req.path === "/v1/health") return next();
  if (c.req.path.startsWith("/v1/auth/google")) return next();
  if (c.req.path === "/v1/auth/register") return next();  // NEW
  if (c.req.path === "/v1/auth/login") return next();     // NEW
  return bearerAuth(c, next);
});
```

### Pitfall 9: Password length limits and argon2 performance
**What goes wrong:** User registers with a 10KB password (malicious or accidental). argon2 hashes it anyway; server pegged for ~3 seconds; 100 concurrent registrations = DoS.
**How to avoid:** Enforce `password.length <= 128` (a reasonable passphrase limit, still well above anything a human types) in the register endpoint. Return 400 "Password too long" before invoking argon2.
**Also:** enforce min length 8-12 (OWASP allows 8 but longer is better) — but the core defense is the max, not the min.

## Code Examples

### Schema: users table + apiKeys.userId

```typescript
// vigil-core/src/db/schema.ts — NEW table

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_users_email").on(table.email),
  ],
);

// apiKeys gets userId — illustrative for all 11 scoped tables
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),  // ← Pitfall 7
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("uq_api_keys_key_hash").on(table.keyHash),
    index("idx_api_keys_user_id").on(table.userId),
  ],
);
```

### Migration file: `drizzle/0012_multi_user_foundation.sql` (custom SQL)

```sql
-- Source: https://orm.drizzle.team/docs/kit-custom-migrations
-- Single transaction; drizzle-orm/postgres-js/migrator wraps the whole file.

-- Step 1: create users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_email" ON "users" USING btree ("email");

-- Step 2: seed user (placeholder password — will be overwritten by register/claim flow)
-- Placeholder is a valid argon2id hash of random bytes so accidental login attempts fail safely.
-- Generated fresh per deploy in a prior script step OR hardcoded here as a known-bad hash.
INSERT INTO "users" ("email", "password_hash")
VALUES (
  LOWER(COALESCE(current_setting('vigil.seed_email', true), 'jamesonmorrill1@gmail.com')),
  '$argon2id$v=19$m=19456,t=2,p=1$PLACEHOLDER_MUST_BE_REPLACED$PLACEHOLDER_HASH'
)
ON CONFLICT ("email") DO NOTHING;

-- NOTE: current_setting() approach requires SET vigil.seed_email = '...' to be run before migration.
-- ALTERNATIVE (simpler): write the migration as a .ts file that reads process.env directly,
-- inserts via Drizzle, then runs the raw SQL below. Planner picks.

-- Step 3: add user_id to 11 scoped tables (IF NOT EXISTS guards make it idempotent)
ALTER TABLE "api_keys"      ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "thoughts"      ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "projects"      ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "briefs"        ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "brief_pdfs"    ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "thought_links" ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "work_orders"   ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "oauth_tokens"  ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "ai_cache"      ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "app_settings"  ADD COLUMN IF NOT EXISTS "user_id" integer;

-- Step 4: backfill all NULL user_id to the seed user
WITH seed AS (SELECT id FROM users WHERE email = LOWER(COALESCE(current_setting('vigil.seed_email', true), 'jamesonmorrill1@gmail.com')))
UPDATE "api_keys"      SET user_id = (SELECT id FROM seed) WHERE user_id IS NULL;
-- repeat WITH/UPDATE for each of the 11 tables. Inline or via a DO block — planner chooses.

-- Step 5: add FK constraint + NOT NULL + index
ALTER TABLE "api_keys" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "api_keys" ADD CONSTRAINT IF NOT EXISTS "api_keys_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS "idx_api_keys_user_id" ON "api_keys" ("user_id");
-- repeat for each of the 11 tables.

-- Step 6: SPECIAL — app_settings composite PK (Pitfall 3)
ALTER TABLE "app_settings" DROP CONSTRAINT IF EXISTS "app_settings_pkey";
ALTER TABLE "app_settings" ADD PRIMARY KEY ("user_id", "key");
```

**Alternative cleaner approach — use a `.ts` migration file:**

Drizzle allows `.ts` migration files that can read env vars directly. Create `scripts/migrate-102.ts` that runs Drizzle against the DB, reads `VIGIL_SEED_USER_EMAIL` from `process.env`, generates the argon2id placeholder hash, inserts the seed user, then runs the raw ALTER statements via `db.execute(sql\`...\`)`. More readable, less `current_setting` magic. **Planner recommended approach.**

### JWT wrapper (`src/utils/jwt.ts`)

```typescript
// Source: https://github.com/panva/jose (jose v6 API)
import { SignJWT, jwtVerify } from "jose";

const SECRET = (() => {
  const s = process.env["JWT_SECRET"];
  if (!s || s.length < 32) {
    console.error("FATAL: JWT_SECRET must be set and at least 32 characters");
    process.exit(1);
  }
  return new TextEncoder().encode(s);
})();

export interface JwtClaims {
  sub: string;       // userId as string (JWT spec says sub is string)
  email: string;
  iat: number;
  exp: number;
}

export async function signToken(userId: number, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("30d")   // D-12
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, SECRET, {
    algorithms: ["HS256"],      // ← explicit; defeats algorithm-confusion attacks
  });
  // Cast-and-check; throws if shape is wrong
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Malformed JWT payload");
  }
  return payload as JwtClaims;
}
```

### Password wrapper (`src/utils/password.ts`)

```typescript
// Source: https://www.npmjs.com/package/@node-rs/argon2
import { hash, verify, Algorithm } from "@node-rs/argon2";

// OWASP 2024 params per CONTEXT.md D-16
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,   // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length > 128) throw new Error("Password too long");   // Pitfall 9
  return hash(plaintext, OPTIONS);
}

export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  if (plaintext.length > 128) return false;  // timing-safe on long input
  try {
    return await verify(stored, plaintext);
  } catch {
    return false;  // malformed hash, unsupported algorithm, etc.
  }
}
```

### Middleware extension (`src/middleware/auth.ts`)

```typescript
// EXTENDED version — preserves vk_ SHA256 path, adds JWT path
import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { apiKeys } from "../db/schema.js";
import { verifyToken } from "../utils/jwt.js";

// Hono context type augmentation — lives here or in src/types/hono-env.ts
declare module "hono" {
  interface ContextVariableMap {
    userId: number;
  }
}

function looksLikeJwt(token: string): boolean {
  // JWTs: exactly two dots. vk_ keys: zero dots. Unambiguous.
  return token.split(".").length === 3 && !token.startsWith("vk_");
}

export const bearerAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.slice(7);
  if (!token) return c.json({ error: "Missing or invalid Authorization header" }, 401);
  if (!db) return c.json({ error: "Database unavailable" }, 503);

  // Path 1: vk_ key → SHA256 hash lookup
  if (token.startsWith("vk_")) {
    const keyHash = crypto.createHash("sha256").update(token).digest("hex");
    const [row] = await db
      .select({ id: apiKeys.id, userId: apiKeys.userId })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
      .limit(1);
    if (!row) return c.json({ error: "Invalid API key" }, 401);
    if (row.userId == null) {
      // Pitfall 4 — defensive; should not happen post-migration
      console.error("[auth] api_key row has NULL userId — migration incomplete?");
      return c.json({ error: "Server misconfiguration" }, 500);
    }
    c.set("userId", row.userId);
    // fire-and-forget lastUsedAt update
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).then(() => {}).catch(() => {});
    return next();
  }

  // Path 2: JWT
  if (looksLikeJwt(token)) {
    try {
      const claims = await verifyToken(token);
      const userId = Number(claims.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        return c.json({ error: "Invalid token subject" }, 401);
      }
      c.set("userId", userId);
      return next();
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  }

  // Path 3: neither — reject
  return c.json({ error: "Unrecognized token format" }, 401);
};
```

### Register route with claim semantics (`src/routes/auth.ts`)

```typescript
// Pseudocode-ish — real impl also needs input validation (email format, password length).
// Generic error messages per Pitfall (user-existence leak).
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";

const PLACEHOLDER_HASH_PREFIX = "$argon2id$v=19$m=19456,t=2,p=1$PLACEHOLDER";
// Detect placeholder without invoking argon2.verify (faster + explicit).
// Alternative: store a `password_claimed` boolean column. Simpler but adds schema.

function isAllowlistedEmail(email: string): boolean {
  const list = process.env["VIGIL_ALLOWED_EMAILS"];
  if (!list) return false;  // D-10 fail-closed
  const allowed = list.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}

export const auth = new Hono();

auth.post("/auth/register", async (c) => {
  if (!process.env["VIGIL_ALLOWED_EMAILS"]) {
    return c.json({ error: "Registration not configured" }, 503);  // D-10
  }
  const { email: rawEmail, password } = await c.req.json();
  if (typeof rawEmail !== "string" || typeof password !== "string") {
    return c.json({ error: "Invalid request" }, 400);
  }
  if (password.length < 12 || password.length > 128) {
    return c.json({ error: "Password must be 12-128 characters" }, 400);
  }
  const email = rawEmail.toLowerCase().trim();

  if (!isAllowlistedEmail(email)) {
    return c.json({ error: "Registration is not open to this address" }, 403);  // D-08
  }

  const [existing] = await db!.select().from(users).where(eq(users.email, email)).limit(1);

  if (!existing) {
    // Fresh registration (won't happen at current single-user posture, but code is ready).
    const passwordHash = await hashPassword(password);
    const [created] = await db!.insert(users).values({ email, passwordHash }).returning();
    return c.json({ id: created.id, email: created.email }, 201);
  }

  // User exists — is this a claim-flow for the seed user?
  if (existing.passwordHash.startsWith(PLACEHOLDER_HASH_PREFIX)) {
    // D-11 — overwrite placeholder with real password
    const passwordHash = await hashPassword(password);
    await db!.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, existing.id));
    return c.json({ id: existing.id, email: existing.email, claimed: true }, 201);
  }

  // Existing user with real password → conflict. Generic message; no existence leak.
  return c.json({ error: "Unable to register with those credentials" }, 409);
});

auth.post("/auth/login", async (c) => {
  const { email: rawEmail, password } = await c.req.json();
  if (typeof rawEmail !== "string" || typeof password !== "string") {
    return c.json({ error: "Invalid request" }, 400);
  }
  const email = rawEmail.toLowerCase().trim();
  const [user] = await db!.select().from(users).where(eq(users.email, email)).limit(1);

  // Timing-safe: always run verifyPassword even if user not found (constant-time defense).
  const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$abc$abc";
  const stored = user?.passwordHash ?? dummyHash;
  const ok = await verifyPassword(password, stored);

  if (!user || !ok) {
    return c.json({ error: "Invalid credentials" }, 401);  // generic for both cases
  }
  // Reject placeholder — seed user must claim via register first
  if (user.passwordHash.startsWith(PLACEHOLDER_HASH_PREFIX)) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await signToken(user.id, user.email);
  return c.json({ token, user: { id: user.id, email: user.email } });
});
```

### Cross-user isolation integration test

```typescript
// tests/integration/cross-user-isolation.test.ts
import { test, expect } from "vitest";  // or tsx --test
import { db } from "../src/db/connection";
import { users, thoughts } from "../src/db/schema";
import { signToken } from "../src/utils/jwt";

test("userA cannot see userB's thoughts via GET /v1/thoughts", async () => {
  // Arrange: two users, one thought each
  const [userA] = await db!.insert(users).values({ email: "a@test.local", passwordHash: "..." }).returning();
  const [userB] = await db!.insert(users).values({ email: "b@test.local", passwordHash: "..." }).returning();
  await db!.insert(thoughts).values({ userId: userA.id, content: "userA secret", source: "text", cloudKitRecordID: "a-1" });
  await db!.insert(thoughts).values({ userId: userB.id, content: "userB secret", source: "text", cloudKitRecordID: "b-1" });

  const tokenA = await signToken(userA.id, userA.email);
  const res = await fetch("http://localhost:3001/v1/thoughts", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const body = await res.json();

  // Assert: userA sees only their row
  expect(body.data).toHaveLength(1);
  expect(body.data[0].content).toBe("userA secret");
  expect(body.data.every((t: any) => t.content !== "userB secret")).toBe(true);
});
```

**Minimum test surface for high confidence:**
1. Thoughts list isolation (above)
2. Thoughts GET-by-id cross-user 404
3. Projects list isolation
4. Project FK check: userA updating a thought with userB's projectId returns 400
5. Link create: userA can't link their thought to userB's thought
6. Bulk delete: `POST /v1/thoughts/bulk/delete` with userB's ids returns 0 deleted
7. Brief history: only user's own briefs returned
8. Existing `vk_` key flow: smoke test with seed user's vk_ key still returns data

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt | argon2id (OWASP winner of PHC) | 2015 (PHC), OWASP recommended since ~2017 | argon2 is the unambiguous current default; bcrypt still acceptable but not recommended for new projects |
| `jsonwebtoken` npm | `jose` | ~2021–2023 for TS-first projects | `jsonwebtoken` is callback-based, no TS types built-in, older ESM story. `jose` is native ESM, first-class TS, and handles algorithm-confusion edge cases by default. |
| Refresh tokens for long sessions | Long-lived JWT + rotate secret for global revoke | Pragmatic small-scale pattern | Acceptable at < 10 users. Add refresh tokens when shortening JWT lifetime below 1 day. |
| Row-Level Security via DB | Route-level scoping | Application dependent | PG RLS is more bulletproof but requires setting session user per request — complex on a connection-pooled driver. Route scoping is simpler and matches current Drizzle usage. CONTEXT.md D-22 picks this. |

**Deprecated/outdated in this domain:**

- `jsonwebtoken` v8 and below — CVEs around algorithm confusion and weak key handling.
- MD5/SHA1 for password storage — ancient but worth mentioning for completeness.
- Storing JWT secrets in source control — every linter flags this; `JWT_SECRET` lives in Railway env only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Railway's Dockerfile uses `node:20-alpine` with glibc issues for `argon2` npm package | Pitfall 1 | LOW — the Dockerfile is in the repo and confirmed. Risk only if user later swaps to Debian slim, in which case both `argon2` and `@node-rs/argon2` work. [VERIFIED: Dockerfile read] |
| A2 | Seed user's row count is around 137 thoughts | Pitfall 7, summary | LOW — from memory note "jamesonmorrill1@gmail.com" is the sole Vigil user. Backfill is fast regardless. Even at 10,000 rows per table, UPDATE + SET NOT NULL is sub-second on Railway Postgres. [ASSUMED — not verified with a live query, but migration performance is not sensitive to this number at these scales] |
| A3 | Hono `4.12.10` (installed) does not have the CVE-2026-22817 algorithm-confusion vulnerability | Standard Stack — JWT rejection | LOW — fix landed in 4.11.4 per advisory. [CITED: security search result] [VERIFIED via node -e: installed version is 4.12.10] |
| A4 | `drizzle-orm/postgres-js/migrator` wraps each `.sql` file in a single transaction | Pitfall 2 | MEDIUM — Drizzle docs imply this but not all DDL statements are transaction-capable in Postgres (e.g., `CREATE INDEX CONCURRENTLY` can't run in a tx). For this migration, every statement IS tx-safe (ALTER, UPDATE, ADD CONSTRAINT), so even if wrapping isn't guaranteed, behavior is correct. [ASSUMED from general knowledge; NOT verified in Drizzle source] |
| A5 | Google OAuth callback currently runs without bearer auth and will need userId injection via state JWT | Route Scoping Audit — google-auth.ts row | MEDIUM — confirmed by grep of `index.ts:91`. But the design choice (state JWT userId vs "require login first") is deferred to the planner; either path works. [VERIFIED: src/index.ts grep] |
| A6 | `appSettings.key` primary-key change from singleton to `(userId, key)` composite is correct for multi-user | Pitfall 3 | LOW — alternative would be to duplicate settings per user via a different schema, but composite PK is the PG-idiomatic choice. [ASSUMED — planner could pick differently] |
| A7 | Placeholder argon2id hash string prefix (`$argon2id$v=19$m=19456,t=2,p=1$PLACEHOLDER`) can be detected by `startsWith` check | Code Examples — Register route | LOW — the hash format is standardized and self-describing. Alternative: add `password_claimed BOOLEAN` column. Planner picks. [ASSUMED] |

## Open Questions (RESOLVED)

All four open questions were resolved by the orchestrator before plan creation. Resolutions are baked into the plan files.

1. **D-16 library choice: `argon2` vs `@node-rs/argon2`** — **RESOLVED: `@node-rs/argon2`** (Plan 02 Task 1). Musl-prebuilt binaries avoid node-gyp on Railway's `node:20-alpine`. `docker build .` smoke-test gates the commit. CONTEXT.md D-16 updated to reflect this.
2. **Single migration file vs multi-step** — **RESOLVED: single atomic `.sql` file with `IF NOT EXISTS` + `duplicate_object` DO-blocks** (Plan 01 Task 2). Drizzle's standard 0012_multi_user_foundation.sql with explicit transactional semantics. Paired with a `.ts` helper (`scripts/migrate-102-seed.ts`) that runs first for the seed-user insert via ORM (clean type-safe path).
3. **OAuth state JWT userId injection (Google callback)** — **RESOLVED: path a — state JWT carries `{nonce, userId}`; callback verifies and extracts** (Plan 04 Task 3). Less invasive than flipping `/auth/google` initiation behind bearer. Preserves the current 5-Mac-client redirect flow.
4. **Per-user schedulers (generate-scheduler, gmail-workorders)** — **RESOLVED: hard-scope to seed user via `VIGIL_SEED_USER_EMAIL` for this phase** (Plan 04 Task 3); `TODO(AUTH-06+)` markers for future per-user fan-out.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (local dev) | `npm ci`, `tsx`, `drizzle-kit generate` | ✓ | (project uses `tsx ^4.19.0`) | — |
| npm | package install | ✓ | 11.11.0 | — |
| Docker (to test Dockerfile locally) | Verifying argon2 install on alpine | likely ✓ (user has it per past memory notes) | — | Planner spike-test on Railway deploy logs instead |
| PostgreSQL (local) | Running migration locally before Railway push | ✓ (per CONTEXT.md §code_context `testConnection`) | — | — |
| `jose` (installed) | JWT sign/verify | ✓ | 6.2.2 | — |
| `@node-rs/argon2` (NOT installed) | Password hashing | ✗ | — | `argon2` (already NOT installed either; fresh install either way) |
| `drizzle-kit` | Migration scaffolding | ✓ | 0.31.10 | — |

**Missing dependencies with no fallback:** None — every required package is installable from npm.

**Missing dependencies with fallback:**
- `@node-rs/argon2` (recommended) vs `argon2` (CONTEXT.md D-16 default). Either works functionally; the musl constraint drives the recommendation. Both need `npm install` in this phase.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` via `tsx --test` (vigil-core convention per package.json `scripts.test`) |
| Config file | none — `tsx --test "src/**/*.test.ts"` discovers tests by glob |
| Quick run command | `cd vigil-core && npm test -- src/middleware/auth.test.ts` |
| Full suite command | `cd vigil-core && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | users table exists with email unique constraint, passwordHash column | integration (live DB) | `npm test -- src/db/schema.test.ts` (new) | ❌ Wave 0 |
| AUTH-02 | POST /v1/auth/register: allowlist 403, unconfigured 503, new-user 201, claim 201, conflict 409 | integration | `npm test -- src/routes/auth.test.ts` (new) | ❌ Wave 0 |
| AUTH-03 | POST /v1/auth/login: valid creds → JWT w/ correct claims; invalid creds → 401 generic; placeholder-hash → 401 | integration | `npm test -- src/routes/auth.test.ts` | ❌ Wave 0 |
| AUTH-04 | Migration runs idempotently twice; all 11 tables have NOT NULL userId after; seed user row exists with placeholder hash | integration (live DB) | `npm test -- src/db/migrate.test.ts` (new) | ❌ Wave 0 |
| AUTH-05 | Two-user cross-query isolation: userA cannot see userB's thoughts/projects/briefs/links/chat/work-orders via any endpoint | integration | `npm test -- src/integration/cross-user-isolation.test.ts` (new) | ❌ Wave 0 |
| AUTH-05 | `vk_` key flow still works: seed user's existing key returns their data under /v1/summary, /v1/thoughts | smoke (external) | `API_KEY=vk_... npm run smoke-test` (existing) | ✓ exists |
| AUTH-05 | Malformed token → 401 ("Unrecognized token format") | unit | `npm test -- src/middleware/auth.test.ts` | ❌ Wave 0 |
| Auth middleware | Token-type detection: vk_ → SHA256 path; JWT → jose path; neither → 401 | unit | `npm test -- src/middleware/auth.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- src/middleware/auth.test.ts src/routes/auth.test.ts` (fast, < 5 sec)
- **Per wave merge:** `npm test` (full suite, ~30 sec) + `npm run smoke-test` against local dev server
- **Phase gate:** Full suite green + `curl https://api.vigilhub.io/v1/summary -H "Authorization: Bearer vk_..."` returns data before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/middleware/auth.test.ts` — covers token-type detection + both auth paths (AUTH-05 middleware half)
- [ ] `src/routes/auth.test.ts` — covers AUTH-02 + AUTH-03 (register/login endpoints)
- [ ] `src/db/migrate.test.ts` — covers AUTH-04 (migration idempotency + schema state after)
- [ ] `src/integration/cross-user-isolation.test.ts` — covers AUTH-05 (the headline cross-user test)
- [ ] `src/utils/jwt.test.ts` — covers signToken/verifyToken (unit for the wrapper)
- [ ] `src/utils/password.test.ts` — covers hashPassword/verifyPassword (unit for the wrapper)
- [ ] Add `vitest` or stick with `node:test`? — existing tests use `node:test` per tsx convention. Stay with it.
- [ ] Test DB setup: tests currently run against a live DB (per calendar.test.ts pattern). Confirm Phase 102 tests do the same — mock only what's necessary.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | **yes** | argon2id for password (D-16), JWT for session (D-12/15), env allowlist for registration (D-08/10) |
| V3 Session Management | **yes** | Stateless JWT (D-12); no refresh token = longest-path global invalidation is JWT_SECRET rotation (D-13 / Pitfall 6) |
| V4 Access Control | **yes** | Route-level scoping by `c.get('userId')` (D-22); userId FK on all scoped tables (D-07); FK existence checks (e.g., projectId) must also scope by userId |
| V5 Input Validation | **yes** | Email format + lowercase normalize (Pitfall 5); password length bounds 12–128 (Pitfall 9); request body schema validation via explicit destructure |
| V6 Cryptography | **yes** | `jose` for JWT (never hand-roll HMAC); `@node-rs/argon2` for passwords (never hand-roll KDF); `node:crypto.randomBytes` for the placeholder hash salt and any new random values |
| V7 Error Handling & Logging | **yes** | Generic "Invalid credentials" for wrong-email and wrong-password (no enumeration — Anti-Pattern + Pattern 4); no plaintext passwords in logs (D-discretion) |
| V10 Malicious Code | low | No user-supplied code execution. Registration email input is stored, not evaluated. |

### Known Threat Patterns for Node.js + Hono + Drizzle + Postgres

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection | Tampering | Drizzle's parameterized queries (already in place everywhere; verify no `sql\`...\${userInput}\`` in new code) |
| JWT algorithm confusion (HS/RS) | Spoofing | `jose.jwtVerify(token, secret, { algorithms: ["HS256"] })` — explicit allow-list of alg |
| User enumeration via register/login | Information Disclosure | Generic error messages across 400/401/403/409; timing-safe verify (dummy hash on user-not-found — Code Examples) |
| Cross-user data leak | Information Disclosure | Every query carries `eq(table.userId, c.get('userId'))`; cross-user integration test (AUTH-05 headline) |
| Brute-force password guessing | Spoofing | **Deferred** — CONTEXT.md §deferred calls out rate limiting. At current single-user + env-allowlist posture, this is acceptable; deferred to AUTH-08. argon2id's cost parameters slow individual guesses by design. |
| JWT theft via XSS | Spoofing | **Deferred** — PWA storage for JWT is AUTH-06 territory; Phase 102 backend doesn't dictate storage strategy. Recommend `httpOnly` cookie or in-memory + silent refresh when AUTH-06 lands. |
| Email allowlist bypass via unicode/case | Spoofing | Lowercase normalize both sides (Pitfall 5); reject emails containing `\u0000` or control chars at input validation; optionally strip Unicode "homoglyph" chars, but at single-user scale, overkill |
| Placeholder-password login | Spoofing | Explicit check in login endpoint (Code Examples) — if stored hash starts with placeholder prefix, return generic 401 regardless of input |
| ON DELETE CASCADE data loss | Tampering (self) | Use `ON DELETE RESTRICT` on userId FK (Pitfall 7) |

## Runtime State Inventory

> Applicable for Phase 102 because a userId FK backfill is a data migration, not just a schema change.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Every row in `thoughts`, `projects`, `briefs`, `brief_pdfs`, `thought_links`, `chat_sessions`, `work_orders`, `oauth_tokens`, `app_settings`, `ai_cache`, `api_keys` needs userId backfilled to seed user | **Data migration** — single SQL file, Section 3 of the migration (see Code Examples) |
| Live service config | (none) — no n8n / Datadog / external service holds user identity today | — |
| OS-registered state | Mac launchd plists (DailyBriefMonitor.app), Monitor process, Monitor config files under `~/.config/dailybrief/config.json` — all hold a `vk_` key, NOT a user identity. After migration, the same `vk_` key works (it now has userId populated in the DB). Zero client-side change needed. | **No action required** — verified by CONTEXT.md §specifics: "Zero changes required in this phase" |
| Secrets/env vars | New required env: `JWT_SECRET` (Railway + local `.env`); new optional env: `VIGIL_SEED_USER_EMAIL`, `VIGIL_ALLOWED_EMAILS`. Existing `GOOGLE_TOKEN_ENCRYPTION_KEY` unchanged. | **Code edit + deploy step** — document in runbook; fail-fast in boot. See Pitfall 6 for rotation playbook. |
| Build artifacts / installed packages | `vigil-core/node_modules/@node-rs/argon2` — NEW dep. Must appear in package-lock.json and in the rebuilt Docker image. Local dev on macOS will pull `@node-rs/argon2-darwin-arm64` or `darwin-x64`; Railway will pull the musl variant. No conflict. | **Install step** — `npm install @node-rs/argon2` runs in Plan 01; Dockerfile's `npm ci --omit=dev` step auto-picks the musl binary per platform |

## Project Constraints (from CLAUDE.md)

**No CLAUDE.md present** in `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/` (checked via Glob). Project constraints are derived from `.planning/PROJECT.md` §Constraints + §Key Decisions and the CONTEXT.md locked decisions above.

Relevant project constraints that shape this phase:
- **Database:** PostgreSQL on Railway (Drizzle ORM, tsvector FTS). No SQLite anywhere. [PROJECT.md line 161]
- **API framework:** Hono (no Express). [PROJECT.md line 190]
- **Auth pattern (existing):** SHA-256 hashed bearer tokens with `vk_` prefix. [PROJECT.md line 199] This phase extends — does not replace.
- **Migration pattern:** Programmatic on deploy via `drizzle-orm/postgres-js/migrator`. [PROJECT.md line 201]
- **Single-instance deployment:** No multi-replica concurrency concerns this phase. [PROJECT.md line 201]
- **Personal tool posture:** Manual env allowlist is the registration gate — not CAPTCHA, not rate limiting. [CONTEXT.md D-09/10]

## Sources

### Primary (HIGH confidence)

- **Codebase direct read** — verified against:
  - `vigil-core/src/db/schema.ts` (12 existing tables, enumerated)
  - `vigil-core/src/middleware/auth.ts` (existing bearerAuth shape + extension points)
  - `vigil-core/src/routes/google-auth.ts:4-63` (jose + SignJWT HS256 pattern already in use)
  - `vigil-core/src/utils/token-crypto.ts` (env-var fail-fast pattern to copy for JWT_SECRET)
  - `vigil-core/src/db/migrate.ts` (postgres-js migrator — single tx per file)
  - `vigil-core/Dockerfile` (node:20-alpine → musl constraint)
  - `vigil-core/scripts/generate-key.ts` (vk_ = "vk_" + 64 hex, zero dots)
  - `vigil-core/package.json` (jose 6.2.2 already installed; no argon2 yet)
  - `vigil-core/drizzle/000{0,3,11}_*.sql` (prior migration shape reference)
- **npm registry** — `npm view` for version currency:
  - `jose@6.2.2` (2026-03-18)
  - `@node-rs/argon2@2.0.2` (2025-05-04)
  - `argon2@0.44.0` (2025-08-10)
  - `hono@4.12.14` latest; 4.12.10 installed (past CVE-2026-22817 fix)
- `.planning/phases/102-multi-user-foundation/102-CONTEXT.md` — 23 locked decisions
- `.planning/PROJECT.md` — project-level constraints + Key Decisions table

### Secondary (MEDIUM confidence — WebSearch verified with primary sources)

- [OWASP Password Storage Cheat Sheet — Argon2id parameters](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — OWASP recommends minimum `m=19456 KiB, t=2, p=1` for Argon2id (matches CONTEXT.md D-16)
- [@node-rs/argon2 npm page](https://www.npmjs.com/package/@node-rs/argon2) — prebuilt musl binary availability + size comparison
- [node-argon2 issue #223 — Alpine/musl compatibility](https://github.com/ranisalt/node-argon2/issues/223) — historical record of traditional `argon2` package failing on Alpine
- [Hono JWT Auth Middleware docs](https://hono.dev/docs/middleware/builtin/jwt) — reference for why we're NOT using it
- [Drizzle Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations) — pattern for empty migration files + custom SQL for backfill + NOT NULL
- [jose library](https://github.com/panva/jose) — canonical JOSE/JWT library for Node.js; SignJWT + jwtVerify API shape
- [Hono security advisory / CVE-2026-22817 search](https://dev.to/hari_prakash_b0a882ec9225/jwt-algorithm-confusion-attack-two-active-cves-in-2026-7bc) — RS256/HS256 confusion patched in Hono 4.11.4

### Tertiary (informational)

- PHC (Password Hashing Competition) — argon2id winner, 2015
- JWT RFC 7519 — claim names (`sub`, `iat`, `exp`)

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — every dep is verified installed or verified on npm registry; the jose/hono choices are settled by what's already in the codebase.
- Architecture: **HIGH** — route scoping audit is grep-verified across 20+ files; middleware extension pattern copies the existing google-auth.ts shape.
- Migration pattern: **MEDIUM-HIGH** — the expand-contract shape is standard; the single-file-vs-multi-file decision is documented with tradeoffs; `__drizzle_migrations` transactionality assumption noted as A4.
- Pitfalls: **HIGH** — the 9 pitfalls are all either observed in the codebase (token format, vk_ shape, appSettings PK, ON DELETE CASCADE pattern already used elsewhere) or directly sourced from the Alpine/argon2 GitHub issue record.
- Security: **HIGH** — argon2id params match OWASP 2024; JWT algorithm pinning is literally the documented fix for the Hono CVE class; user-enumeration defenses are OWASP cheat-sheet standard.
- Test strategy: **MEDIUM** — minimum test surface is defined; the cross-user isolation test shape is concrete. Gap: the test DB bootstrap pattern (fixture vs live DB) needs a plan-time decision depending on how existing tests like `calendar.test.ts` handle it.

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days for stable — JWT/argon2 ecosystem is slow-moving; Hono is fast-moving and bears a re-check if we revisit)

---

*Phase: 102-multi-user-foundation*
