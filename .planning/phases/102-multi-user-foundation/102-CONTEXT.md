# Phase 102: Multi-User Foundation - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

vigil-core adds a `users` table with email/argon2id-password auth, issues JWTs on login, and every existing data query is scoped to the authenticated user's `userId`. All current `vk_...` API keys keep working — they get an owner (seed user) and route through the same scoping. No PWA UI work, no password-reset flow, no refresh tokens, no admin invites — those belong to AUTH-06/07/08 in later phases.

**Delivers:**
- `users` table (AUTH-01)
- `POST /v1/auth/register` gated by allowlist (AUTH-02)
- `POST /v1/auth/login` returning JWT (AUTH-03)
- `userId` FK on every data table, backfilled to seed user (AUTH-04)
- Every existing route scopes queries by authenticated userId (AUTH-05)

**Does NOT deliver:** PWA login screens, refresh tokens, password reset, profile editing, admin-invite flow, CAPTCHA/rate-limiting for registration.

</domain>

<decisions>
## Implementation Decisions

### Auth token strategy (vk_ key coexistence)
- **D-01:** Keep the existing `bearerAuth` middleware active. Add `userId` FK column to `api_keys` table. On each request, bearerAuth resolves `userId` from the looked-up api_key row and stashes it on the Hono context (`c.set('userId', ...)`).
- **D-02:** Add a parallel JWT path — the same middleware detects JWT-shaped tokens (three dot-separated segments) vs `vk_` prefix and routes to either JWT verification or api_keys lookup. Both paths set `c.get('userId')` identically so downstream route code never branches on auth method.
- **D-03:** Zero breakage for Monitor (iMac), G2 plugin, CLI, MacBook Pro, or PWA's current `vk_` key storage. Every existing caller continues to work because every `vk_` key gets linked to the seed user by migration.

### Seed user + backfill migration
- **D-04:** Seed user identity driven by `VIGIL_SEED_USER_EMAIL` env var. Default value `jamesonmorrill1@gmail.com` baked into the migration code.
- **D-05:** Migration is a single Drizzle migration that:
  1. Creates `users` table (`id`, `email` unique, `password_hash`, `created_at`, `updated_at`).
  2. Inserts seed user row with email = env var value. Password hash is set to a random-bytes argon2id placeholder — user MUST re-set via the Phase 102 register/login flow OR via an out-of-band `npm run set-password` helper (included in this phase).
  3. Adds nullable `user_id INTEGER REFERENCES users(id)` to every data table.
  4. Backfills all NULL `user_id` values to the seed user's id (one `UPDATE ... WHERE user_id IS NULL` per table).
  5. Alters every `user_id` column to `NOT NULL`.
- **D-06:** Migration is idempotent (safe to run twice): `INSERT ... ON CONFLICT (email) DO NOTHING` for the seed user insert, and each `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guard.
- **D-07:** Tables receiving `userId` FK: `thoughts`, `projects`, `briefs`, `briefPdfs`, `thoughtLinks`, `chatSessions`, `workOrders`, `oauthTokens`, `appSettings`, `aiCache`, `apiKeys`. The pure-reference tables (`workOrderStatuses`) stay global. Planner must verify this list against the live schema at plan time.

### Registration policy
- **D-08:** `POST /v1/auth/register` checks `VIGIL_ALLOWED_EMAILS` env var (comma-separated list). If the submitted email is not in the allowlist, return 403 with a generic "Registration is not open to this address" message — do NOT echo the list back.
- **D-09:** Default `VIGIL_ALLOWED_EMAILS` = `jamesonmorrill1@gmail.com` (matches seed user). Expanding the allowlist requires a Railway env var edit + redeploy — deliberately manual, matching current "personal tool" posture.
- **D-10:** If `VIGIL_ALLOWED_EMAILS` is unset or empty, registration endpoint returns 503 "Registration not configured" to avoid an accidentally-open service after a botched env pull. Fail-closed.
- **D-11:** Registering the seed email when a seed row already exists (with placeholder password) should **overwrite** the placeholder password with the user-supplied one — this is the intended "claim your account" path. Any other registration attempt on an existing email returns 409 Conflict.

### JWT lifetime + revocation
- **D-12:** JWTs are stateless. Lifetime: **30 days** (`exp = iat + 2592000` seconds). No refresh tokens.
- **D-13:** No server-side revocation list. Global invalidation is done by rotating `JWT_SECRET` — acceptable at current user count (~1–5). A future phase (AUTH-07/08) can add per-session revocation if needed.
- **D-14:** JWT claims: `sub` (userId as number), `email`, `iat`, `exp`. No roles/scopes this phase — authorization is binary "authenticated as someone = see your own data."
- **D-15:** JWT signing alg: **HS256** (symmetric, one secret, zero key-management ceremony). Not RS256 — no public-key consumers yet.

### Password hashing
- **D-16:** **argon2id** via the `argon2` npm package. Default parameters: `memoryCost: 19456 KiB, timeCost: 2, parallelism: 1` (OWASP 2024 recommendation).
- **D-17:** No bcrypt compatibility layer — no prior password hashes exist to migrate from.

### JWT secret
- **D-18:** New env var `JWT_SECRET`. Must be set at boot. Server refuses to start if unset (log FATAL, exit 1) — same posture as `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- **D-19:** Minimum length 32 bytes (256 bits). Boot check enforces this and exits on violation.
- **D-20:** Railway + local `.env` both need this set before Phase 102 deploys. Planner's first task: document the env var in the phase runbook.

### Route scoping (AUTH-05)
- **D-21:** Every route handler that reads/writes user-owned data MUST use `c.get('userId')` in its query `where` clause. Planner enumerates the full route list and audits each one.
- **D-22:** Query scoping is the route's responsibility, not an ORM-level row-level-security mechanism. Drizzle-native `.where(eq(thoughts.userId, userId))` at every query site. Cross-user leakage risk mitigated by a test that creates two users and asserts userA cannot see userB's rows.
- **D-23:** `workOrderStatuses` and any other reference tables (enumerated at plan time) stay unscoped.

### Claude's Discretion
- File/module layout for auth routes (single `routes/auth.ts` vs split into `register.ts` + `login.ts`) — planner picks.
- Specific error message wording (as long as it doesn't leak user existence — generic "Invalid credentials" for both wrong-email and wrong-password cases).
- Logging verbosity for register/login (minimum: failed attempts, success; no plaintext passwords ever).
- Whether to include `email` in the JWT payload (recommended yes for client display, but not security-critical).

</decisions>

<specifics>
## Specific Ideas

- **Registration claim flow for seed user:** When you (jamesonmorrill1@gmail.com) first call `POST /v1/auth/register` with a password, it should overwrite the placeholder hash and "claim" your existing data. Not a new account — the seed row already exists. This must be tested explicitly.
- **Current PWA storage:** `vigil_api_key` in localStorage holds a `vk_...` key. After Phase 102, the PWA continues to work without changes — its existing key is linked to the seed user, so all scoped queries return your data. The PWA will learn about JWT in a later phase (AUTH-06).
- **Monitor / G2 plugin / CLI:** All use `vk_...` keys from `~/.config/dailybrief/config.json`, plist, or env. Zero changes required in this phase — their keys get a userId transparently.
- **Operational safety net:** Before merging Phase 102, verify that `curl https://api.vigilhub.io/v1/summary -H "Authorization: Bearer vk_94ec..."` still returns data. This is the go/no-go signal on deploy day.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth middleware (current state)
- `vigil-core/src/middleware/auth.ts` — Existing bearerAuth; Phase 102 extends this, does NOT replace it
- `vigil-core/src/index.ts` §CORS + bearer mount — Where the middleware is wired; Phase 102 may need to expose register/login as CORS-allowed unauthenticated routes

### Database schema
- `vigil-core/src/db/schema.ts` — All 12 tables; Phase 102 adds `users`, adds `userId` to 11 others, leaves `workOrderStatuses` unscoped
- `vigil-core/src/db/connection.ts` — DB bootstrap; planner verifies migration runner behavior on Railway vs local
- `vigil-core/src/db/migrate.ts` — Existing migration entry point

### Env var conventions
- `vigil-core/src/utils/token-crypto.ts` — Reference pattern for "env var required at boot, fail-fast if missing, minimum-length check" (from GOOGLE_TOKEN_ENCRYPTION_KEY). Phase 102 applies same pattern to JWT_SECRET.

### Project constraints
- `.planning/PROJECT.md` §Key Decisions — Check for prior auth-related decisions
- `.planning/REQUIREMENTS.md` AUTH-01..AUTH-08 — Full requirement text; AUTH-06/07/08 are deferred to later phases
- `.planning/phases/101-context-menu/101-VERIFICATION.md` — Previous phase's regression/integration posture; Phase 102 must not break any of those verifications

### Memory / operational context
- User's memory note "Anthropic key sprawl": Key config drift is the default failure — Phase 102 must NOT add a new must-be-kept-in-sync secret without explicit runbook updates. JWT_SECRET is a new one; document it in the phase runbook.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bearerAuth` middleware in `middleware/auth.ts`: extend to resolve userId; keep the same function signature
- `db` (Drizzle ORM instance) in `db/connection.ts`: already exported, just add `users` table to the schema
- `GOOGLE_TOKEN_ENCRYPTION_KEY` boot check pattern in `utils/token-crypto.ts`: copy this exact shape for `JWT_SECRET`
- `corsOrigins` already supports the PWA and LAN dev — register/login routes inherit it for free

### Established Patterns
- **Env var fail-fast:** FATAL log + exit on missing required secrets. JWT_SECRET and VIGIL_SEED_USER_EMAIL follow suit.
- **SHA256 hash lookup for tokens:** existing `vk_` keys hash with SHA256 (not password-grade). New JWT path uses HS256 + JWT_SECRET. Passwords use argon2id. Three different token classes, three different cryptographic treatments — planner must not confuse them.
- **Drizzle schema-first migrations:** schema.ts is source of truth; `drizzle-kit generate` produces SQL migration files. Phase 102 generates one new migration.
- **Hono `c.set / c.get` for request-scoped data:** existing routes use `c.get('user')` nowhere today but the pattern is standard Hono; introduce `c.get('userId')` as the contract for every scoped route.

### Integration Points
- **Every route that queries thoughts/projects/briefs/etc.** must gain a `where userId = ?` clause. Planner enumerates these from `routes/` dir.
- **Migration runner** on Railway deploy: the migration must be auto-applied. Today's `migrate.ts` runs on boot (per convention) — verify this in plan.
- **PWA AuthPage** ([vigil-pwa/src/pages/AuthPage.tsx:45-52](vigil-pwa/src/pages/AuthPage.tsx#L45-L52)): unchanged in this phase. Still accepts `vk_` keys. Phase AUTH-06 changes it to support email/password login.

</code_context>

<deferred>
## Deferred Ideas

These came up during analysis but are explicitly out of scope for Phase 102. Capture for future phase planning.

- **Refresh tokens** — Not needed at 30-day JWT lifetime. If a future phase shortens lifetime for security reasons, add refresh tokens then. (Would add `refresh_tokens` table, `/v1/auth/refresh` endpoint, rotation logic.)
- **Password reset flow** — `AUTH-07` territory. Email-based reset needs an email sender (SMTP/SendGrid) + reset_tokens table. Not this phase.
- **PWA login UI (email/password)** — `AUTH-06`. Phase 102 keeps PWA on `vk_` key; subsequent phase swaps to JWT-based email/password login.
- **Profile editing / change password** — `AUTH-07`. Separate endpoint + PWA UI.
- **Admin invite flow** — `AUTH-08`. Invite tokens + email delivery; would replace the env allowlist as the registration gate.
- **Rate limiting / CAPTCHA on register/login** — Needed before opening registration publicly. Today's env allowlist makes this unnecessary. Add alongside `AUTH-08` if going public.
- **Per-session revocation** — Not needed at current user count. Adds a `sessions` or `token_revocations` table and a middleware check. Future phase if user count > ~10.
- **Roles / scopes in JWT** — No authorization model beyond "authenticated = own data" this phase. Add `role` claim + middleware when a second tier of access emerges (e.g., admin dashboard).
- **Deprecation of `vk_` keys** — Keep them live indefinitely. If/when the user count grows, reconsider whether personal access tokens should be reissued through a UI.

</deferred>

---

*Phase: 102-multi-user-foundation*
