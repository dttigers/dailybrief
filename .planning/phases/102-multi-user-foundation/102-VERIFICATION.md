---
phase: 102-multi-user-foundation
verified: 2026-04-18T23:45:00Z
status: passed
score: 5/5 roadmap success criteria verified; 40/40 plan-frontmatter must-haves verified
overrides_applied: 0
re_verification: null
---

# Phase 102: Multi-User Foundation Verification Report

**Phase Goal:** vigil-core has a users table with email/password auth and all data queries are scoped to the authenticated user.
**Verified:** 2026-04-18T23:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria — the contract)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | POST /v1/auth/register with email + password creates a new user row | ✓ VERIFIED | `vigil-core/src/routes/auth.ts:34-111` implements the full D-08/D-09/D-10/D-11 matrix; register handler calls `db.insert(users).values({email, passwordHash}).returning(...)` at lines 88-91; runtime evidence: live Railway curl #2 returned HTTP/2 201 with claim flow (Plan 05 summary). |
| 2 | POST /v1/auth/login returns a valid JWT usable for subsequent requests | ✓ VERIFIED | `vigil-core/src/routes/auth.ts:114-155` calls `signToken(user.id, user.email)` on success; `utils/jwt.ts:30-37` uses jose HS256 with 30d exp; runtime evidence: live Railway curl #4 returned 200 + JWT, curl #5 used that JWT on `/v1/summary` and got 200. |
| 3 | All existing thoughts/briefs/work orders/projects belong to seed user and return normally for seed-user auth | ✓ VERIFIED | Migration `drizzle/0012_multi_user_foundation.sql` backfills all 11 scoped tables to seed user (lines with DO-block UPDATE at schema.ts:44-57 logic); runtime evidence: live Railway curl #1 with existing seed `vk_94ec...` key returned 200 + summary data (D-03 preserved); Plan 04 integration test case 7 explicitly asserts seed vk_ key returns data. |
| 4 | A request authenticated as a different user returns only that user's data | ✓ VERIFIED | `vigil-core/src/integration/cross-user-isolation.test.ts` has 11 active `it()` cases with 11 `LEAK:` assertion messages; Plan 04 summary reports 11/11 GREEN against live Railway DB (userA + userB seeded, JWTs issued, every scoped surface exercised); 20 route files + 4 service files all reference `c.get("userId")` (verified by grep). |
| 5 | Headline: multi-user foundation (schema + crypto + auth + scoping + deploy) is live end-to-end | ✓ VERIFIED | Live production deploy to `https://api.vigilhub.io` on 2026-04-18; 5/5 go/no-go curls GREEN (vk_ 200, register 201 claim, conflict 409, login 200 + JWT, JWT /v1/summary 200); Railway boot logs show migrate-102-seed + migrator + schedulers all firing correctly (Plan 05 summary §"Railway Boot Logs"). |

**Score:** 5/5 roadmap success criteria verified.

### Must-Have Truths from Plan Frontmatter (40 total across 6 plans)

All frontmatter truths verified. Sample highlights:

| Plan | Truth | Status | Evidence |
|------|-------|--------|----------|
| 102-00 | Fail-by-default via real imports — module-resolution failure IS the RED signal | ✓ VERIFIED | 6 test files at declared paths; 49 active `it()`, 16 `it.skip`, 7 `LEAK:` messages (plan 00 summary) |
| 102-01 | users table exists with lowercase email + argon2id passwordHash | ✓ VERIFIED | `schema.ts:27-43` defines table; migration SQL line 21-28 creates it; live Railway user id=1 verified |
| 102-01 | 11 scoped tables have NOT NULL userId FK ON DELETE RESTRICT | ✓ VERIFIED | `grep -c "ADD COLUMN IF NOT EXISTS \"user_id\"" = 11`, `SET NOT NULL = 11`, `ON DELETE RESTRICT = 12` in 0012.sql; `grep -c 'onDelete: "restrict"' schema.ts = 11` |
| 102-01 | app_settings composite PK (user_id, key) | ✓ VERIFIED | `0012.sql:200 PRIMARY KEY ("user_id", "key")`; `schema.ts:290 primaryKey({columns: [table.userId, table.key]})` |
| 102-01 | Running migrate-102 twice is a no-op (idempotency) | ✓ VERIFIED | Plan 01 summary records idempotent second run on Railway prod; runtime_context notes `migrate-102 idempotent × 2 against Railway production DB` |
| 102-02 | @node-rs/argon2 installed, docker build succeeds on node:20-alpine | ✓ VERIFIED | `package.json` has `@node-rs/argon2: ^2.0.2`; 6 musl entries in package-lock.json; Plan 05 runtime Docker build succeeded + Railway deploy consumed it |
| 102-02 | OWASP 2024 argon2id params + 128-char DoS guard | ✓ VERIFIED | `utils/password.ts:13-22` pins `Algorithm.Argon2id`, `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`, `MAX_PASSWORD_BYTES = 128` |
| 102-02 | HS256-only JWT + 30d exp + JWT_SECRET boot-check | ✓ VERIFIED | `utils/jwt.ts:44 algorithms: ["HS256"]`, line 35 `setExpirationTime("30d")`, line 15 `if (s.length < 32) process.exit(1)` |
| 102-03 | bearerAuth dispatches vk_ / JWT / malformed | ✓ VERIFIED | `middleware/auth.ts:23-27 isVkKey + looksLikeJwt`, line 50/90/105 three-path dispatch, line 76/97 `c.set("userId", ...)` |
| 102-03 | CORS-safe exemption for /v1/auth/register + /v1/auth/login | ✓ VERIFIED | `index.ts:95 app.route("/v1", authRoutes)` before bearer, lines 104-106 narrow exemption list |
| 102-03 | export const app for integration tests | ✓ VERIFIED | `index.ts:61 export const app = new Hono()` |
| 102-03 | generate-key.ts requires --email | ✓ VERIFIED | Plan 03 summary records smoke test: missing --email exits 1 |
| 102-04 | 20 route files + 4 services scope by userId | ✓ VERIFIED | grep finds `c.get("userId")` in 20 routes + 4 services all threaded userId; full `npx tsc --noEmit` = 0 errors (Plan 04 summary) |
| 102-04 | Google OAuth state JWT carries userId | ✓ VERIFIED | `routes/google-auth.ts:68 SignJWT({ nonce, userId })`, lines 115-118 callback extracts `payload.userId` with positive-integer guard |
| 102-04 | Schedulers hard-scope to VIGIL_SEED_USER_EMAIL | ✓ VERIFIED | All 3 services at lines 110/127/222 call `.trim().toLowerCase()` on env var (post-6380c6c fix); 3 TODO(AUTH-06+) comments pinned |
| 102-05 | RUNBOOK.md with JWT_SECRET rotation playbook | ✓ VERIFIED | `vigil-core/RUNBOOK.md:25-46` has full rotation playbook including `openssl rand -hex 32` |
| 102-05 | Dockerfile CMD runs migrate-102-seed before migrate.js | ✓ VERIFIED | `Dockerfile:18 CMD ["sh", "-c", "node dist/scripts/migrate-102-seed.js && node dist/db/migrate.js && node dist/index.js"]` |
| 102-05 | Live production go/no-go curl returns 200 | ✓ VERIFIED | Runtime context: `All 5 go/no-go curls GREEN (vk_ backcompat + register + already-claimed 409 + login + JWT bearer 200)` |

All 40 plan-frontmatter truths verified via static code inspection + Plan summaries + runtime production evidence.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/db/schema.ts` | users table + 11 userId FKs + composite PK | ✓ VERIFIED | Exists; 11 `onDelete: "restrict"` matches; composite PK on app_settings at line 290; `uq_briefs_user_date`, `uq_oauth_tokens_user_provider` present |
| `vigil-core/drizzle/0012_multi_user_foundation.sql` | Single atomic idempotent migration | ✓ VERIFIED | 204 lines; 11 ADD COLUMN IF NOT EXISTS; 11 SET NOT NULL; 12 ON DELETE RESTRICT; 13 duplicate_object DO-blocks; composite PK statement present |
| `vigil-core/scripts/migrate-102-seed.ts` | Pre-migration seed helper with VIGIL_SEED_USER_EMAIL + placeholder hash | ✓ VERIFIED | Exists (61 lines); reads env var; placeholder hash matches PLACEHOLDER_HASH_PREFIX prefix in routes/auth.ts |
| `vigil-core/src/utils/password.ts` | argon2id wrapper with OWASP 2024 params + 128-char guard | ✓ VERIFIED | Exists (42 lines); Algorithm.Argon2id pinned; MAX_PASSWORD_BYTES=128; hashPassword throws on oversized, verifyPassword returns false on oversized/malformed |
| `vigil-core/src/utils/jwt.ts` | jose HS256 wrapper with boot-check + 30d exp | ✓ VERIFIED | Exists (53 lines); `algorithms: ["HS256"]` explicit; 30d exp; boot-check exits 1 on missing/too-short secret |
| `vigil-core/scripts/set-password.ts` | CLI for out-of-band password rotation | ✓ VERIFIED | Exists; `--email` + `--password` args; uses hashPassword; lowercases email |
| `vigil-core/src/middleware/auth.ts` | Three-path dispatcher with ContextVariableMap augmentation | ✓ VERIFIED | 106 lines; `declare module "hono"` augmentation; vk_/JWT/malformed branches; "Unrecognized token format" + "Server misconfiguration" error copy pinned |
| `vigil-core/src/routes/auth.ts` | Register + login with allowlist + claim-flow + timing-safe login | ✓ VERIFIED | 155 lines; exports PLACEHOLDER_HASH_PREFIX + auth router; all 6 required error copy strings present (503/400/403/409/401 matrix); DUMMY_HASH for timing-safe unknown-email |
| `vigil-core/src/index.ts` | app exported + auth routes mounted + CORS exemption | ✓ VERIFIED | `export const app = new Hono()` at line 61; `import { auth as authRoutes }` + `app.route("/v1", authRoutes)`; narrow exemption list (register, login, google/callback only) |
| `vigil-core/scripts/generate-key.ts` | Requires --email, sets api_keys.user_id | ✓ VERIFIED | Smoke-tested in Plan 03 summary: missing-email exits 1, unknown-email exits 1, valid email inserts row with user_id=1 |
| `vigil-core/src/integration/cross-user-isolation.test.ts` | Cross-user isolation integration tests | ✓ VERIFIED | 419 lines; 11 active `it()`, 11 `LEAK:` assertions, 0 `it.skip` — all TODOs converted to active in Plan 04 |
| `vigil-core/RUNBOOK.md` | Operational runbook with env + rotation playbook | ✓ VERIFIED | 115 lines; JWT_SECRET Rotation Playbook + env var table + deploy sequence + go/no-go curl + public endpoint inventory |
| `.planning/phases/102-multi-user-foundation/102-RUNBOOK.md` | Phase-specific deploy checklist | ✓ VERIFIED | 93 lines; Railway env config, scale-0 deploy, go/no-go curl, rollback plan |
| `vigil-core/Dockerfile` | CMD runs migrate-102-seed before migrate | ✓ VERIFIED | `CMD ["sh", "-c", "node dist/scripts/migrate-102-seed.js && node dist/db/migrate.js && node dist/index.js"]` |
| `vigil-core/tsconfig.scripts.json` | Narrow script compile for seed script only | ✓ VERIFIED | Exists (10 lines); `include: ["scripts/migrate-102-seed.ts"]` — set-password.ts + generate-key.ts correctly excluded from production image |
| `vigil-core/package.json` | @node-rs/argon2 dep + db:migrate-102 scripts + two-step build | ✓ VERIFIED | `@node-rs/argon2: ^2.0.2` present; db:migrate-102, db:migrate-102-prod, set-password scripts present; `build: "tsc && tsc -p tsconfig.scripts.json"` |
| `vigil-core/package-lock.json` | musl prebuilt pinned | ✓ VERIFIED | 6 `@node-rs/argon2-linux-.*-musl` entries |

All artifacts VERIFIED at all three structural levels (exists, substantive, wired) plus Level 4 data-flow where applicable (seed-user lookup reads real `users` table; JWT state carries real userId to oauthTokens upsert).

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `middleware/auth.ts` | `utils/jwt.ts` | `import { verifyToken }` | ✓ WIRED | Import at line 6; called at line 92 |
| `routes/auth.ts` | `utils/password.ts` + `utils/jwt.ts` | `import { hashPassword, verifyPassword, signToken }` | ✓ WIRED | hashPassword at insert, verifyPassword at login (timing-safe), signToken on success |
| `index.ts` | `routes/auth.ts` | `app.route("/v1", authRoutes)` before bearer middleware | ✓ WIRED | Mount order verified: cors → health → googleAuth → authRoutes → bearer middleware → protected routes |
| `scripts/migrate-102-seed.ts` | PLACEHOLDER_HASH_PREFIX in `routes/auth.ts` | Placeholder hash shares exact prefix `$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT0xERVJTQUxU` | ✓ WIRED | Full hash `...UExBQ0VIT0xERVJTQUxU$UExBQ0VIT0xERVJIQVNIUExBQ0VIT0xERVJIQVNIUExBQ0VIT0w` in seed script; prefix `$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT0xERVJTQUxU` in routes/auth.ts — claim-flow detection works |
| `services/generate-scheduler.ts` | users table | `VIGIL_SEED_USER_EMAIL` → `users.email` lookup via `.trim().toLowerCase()` | ✓ WIRED | Post-commit 6380c6c, all three services normalize env var identically to migrate-102-seed.ts |
| `routes/google-auth.ts` | oauth_tokens upsert | State JWT `{nonce, userId}` → `payload.userId` → `dbUpsertFn(..., userId)` | ✓ WIRED | SignJWT at line 68; verify at lines 115-118; composite target on conflict uses `(userId, provider)` per Plan 01 index |
| `Dockerfile` | migrate-102-seed → migrate → index | CMD chain runs seed before migrator | ✓ WIRED | Line 18; scripts/migrate-102-seed.ts ships to dist/ via tsconfig.scripts.json (plan-checker Warning 3 closed) |

All key links VERIFIED. The most critical link — placeholder-hash prefix sharing between seed script and routes/auth.ts — is byte-exact.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `routes/auth.ts` register/login | `user`, `created` | `db.select/insert/update from users` table | Yes — live Railway evidence: user id=1 claimed, password set, login returns real JWT | ✓ FLOWING |
| `middleware/auth.ts` vk_ path | `row.userId` | `db.select from apiKeys where keyHash = SHA256(token)` | Yes — 4 pre-existing api_keys rows all linked to user_id=1, live curl #1 returned summary data | ✓ FLOWING |
| `middleware/auth.ts` JWT path | `claims.sub` → `userId` | `verifyToken(token)` (jose HS256) | Yes — live curl #5 JWT from login succeeded on /v1/summary | ✓ FLOWING |
| `services/gmail-workorder-service.ts` | `seedUserId` | `users.email = VIGIL_SEED_USER_EMAIL.trim().toLowerCase()` | Yes — Plan 05 boot log "Imported 6 work order(s)" with seed userId on real Gmail data | ✓ FLOWING |
| `services/generate-scheduler.ts` | `seedUserId` | Same lookup pattern as gmail | Yes — scheduler started cleanly per boot log | ✓ FLOWING |
| Cross-user-isolation.test.ts integration | `userA`, `userB`, `tokenA`, `tokenB` | `db.insert(users) + signToken()` | Yes — 11/11 assertions pass against live Railway DB | ✓ FLOWING |

No HOLLOW, STATIC, or DISCONNECTED data paths. Every artifact that renders/returns user-scoped data traces back to a real DB query with userId bound.

### Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|----------|--------------------|--------|--------|
| Seed vk_ key still returns summary (D-03 backcompat) | `curl -H "Authorization: Bearer vk_94ec..." https://api.vigilhub.io/v1/summary` | HTTP/2 200 + seed-user data | ✓ PASS |
| Register claim flow (D-11) | `POST /v1/auth/register` on seed email with placeholder hash present | HTTP/2 201 + `{claimed: true}` | ✓ PASS |
| Register conflict (409 generic) | Second `POST /v1/auth/register` same email, different password | HTTP/2 409 `"Unable to register with those credentials"` | ✓ PASS |
| Login returns JWT | `POST /v1/auth/login` with claimed credentials | HTTP/2 200 + HS256 JWT (30d exp) | ✓ PASS |
| JWT-path /v1/summary | `GET /v1/summary` with bearer `<jwt-from-login>` | HTTP/2 200 | ✓ PASS |
| Migration idempotent | `npm run db:migrate-102` × 2 on Railway prod | Second run is a no-op | ✓ PASS |
| Test suite green | 220 pass / 0 fail / 17 skip | Clean | ✓ PASS |
| tsc clean | `npx tsc --noEmit` | 0 errors | ✓ PASS |
| Gmail importer seed-scoped | Post-deploy boot log | "Imported 6 work order(s)" with `userId: seedUserId=1` | ✓ PASS |
| 11/11 cross-user isolation | Live integration run against Railway DB | All 11 LEAK: assertions not fired; 11/11 pass | ✓ PASS |

Per the runtime_context directive, spot-checks are read from documented production evidence rather than re-executed. All 10 behaviors pass.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| AUTH-01 | 102-00, 102-01, 102-05 | System has a users table with email, hashed password, and profile fields | ✓ SATISFIED | `schema.ts:27-43` users table; `migrate.test.ts` asserts users table + lowercase email + argon2id placeholder hash; live Railway seed user id=1 verified |
| AUTH-02 | 102-00, 102-03, 102-05 | User can register with email and password (API endpoint) | ✓ SATISFIED | `routes/auth.ts:34-111` POST /v1/auth/register full matrix; live curl #2 returned 201 claim; curl #3 returned 409 conflict |
| AUTH-03 | 102-00, 102-02, 102-03, 102-05 | User can log in and receive a JWT token (API endpoint) | ✓ SATISFIED | `routes/auth.ts:114-155` POST /v1/auth/login timing-safe; `utils/jwt.ts` HS256 signing; live curl #4 returned 200 + JWT |
| AUTH-04 | 102-00, 102-01, 102-04, 102-05 | All data tables have userId foreign keys with existing data backfilled to seed user | ✓ SATISFIED | `0012.sql` adds NOT NULL userId FK to 11 tables with ON DELETE RESTRICT; DO-block backfills NULL rows to seed; live Railway DB: 0 NULL user_id across all tables; PWA vk_ key still works (curl #1) |
| AUTH-05 | 102-00, 102-03, 102-04, 102-05 | All API routes scope data queries to the authenticated user's userId | ✓ SATISFIED | 20 route files + 4 services reference `c.get("userId")` or threaded `userId` param; 11/11 cross-user-isolation.test.ts cases GREEN against live Railway DB; 7 `LEAK:` trap assertions armed |

All 5 requirement IDs SATISFIED. No ORPHANED or BLOCKED requirements. No unclaimed REQUIREMENTS.md mappings for this phase — REQUIREMENTS.md lists exactly AUTH-01..05 against Phase 102, all claimed by at least one plan.

### Anti-Patterns Found

None. Spot-check across key files finds no TODO/FIXME/placeholder that blocks goal:

- `TODO(AUTH-06+)` markers in 3 service files are explicit future-phase anchors (not stubs — the code behind them is fully wired for single-tenant seed-user behavior per RESEARCH Open Q4 resolution).
- `DUMMY_HASH` in `routes/auth.ts` is an intentional timing-safe correctness mechanism (documented in Plan 03 summary), not a stub — it's a format-valid argon2 hash used for unknown-email login to prevent user enumeration via response-time.
- `PLACEHOLDER_HASH_PREFIX` / `PLACEHOLDER_HASH` are intentional data-level state for the D-11 claim-flow, not code stubs.

Acknowledged deferrals (not gaps):
- Per-user scheduler fan-out (TODO AUTH-06+) — explicitly scoped out of Phase 102 per CONTEXT D-23 equivalent + RESEARCH Open Q4 resolution.
- PWA login UI — explicitly AUTH-06 per ROADMAP.md (Phase 102 is server-side only).
- Session revocation list — explicitly D-13 deferred; JWT_SECRET rotation playbook is the current mechanism, documented in RUNBOOK.md.

### Human Verification Required

None required. Phase 102 was gated by a blocking human-action checkpoint (Plan 05 Task 3) that the operator already completed with verbatim curl output recorded. The runtime_context explicitly states:

> Deployed live to Railway (https://api.vigilhub.io) on 2026-04-18; All 5 go/no-go curls GREEN; Schedulers verified live; Live Railway test suite 220 pass / 0 fail / 17 skip; tsc --noEmit 0 errors; migrate-102 idempotent × 2 against Railway production DB; D-03 no-regression invariant preserved.

This is authoritative production evidence. Automated static analysis plus the operator-witnessed deploy covers every aspect of the phase contract.

### Gaps Summary

No gaps. Phase goal achieved end-to-end:

- **Schema delivered:** users table + 11 userId FKs + composite PK on app_settings + per-user unique indexes all live on Railway.
- **Crypto primitives delivered:** argon2id password hashing with OWASP 2024 params, HS256 JWT with 30d exp, boot-time JWT_SECRET gate, docker-alpine musl-prebuilt Argon2 verified in production.
- **Auth endpoints delivered:** POST /v1/auth/register (full D-08/D-09/D-10/D-11 matrix) + POST /v1/auth/login (timing-safe, generic 401) live on api.vigilhub.io.
- **Route scoping delivered:** 20 route files + 4 service files use `c.get("userId")` or threaded userId; 11/11 cross-user isolation tests GREEN.
- **Production deploy delivered:** 5/5 go/no-go curls verified live; Gmail importer fired on real production data with correctly-scoped seed userId; vk_ backcompat preserved for every existing client (PWA, Monitor, G2, CLI, MacBook Pro).
- **Requirements closed:** AUTH-01..05 all SATISFIED per REQUIREMENTS.md traceability table.

Phase 102 is the cleanest goal-achievement verification in the milestone so far: every success criterion has both static code evidence and live production behavioral evidence.

---

*Verified: 2026-04-18T23:45:00Z*
*Verifier: Claude (gsd-verifier)*
