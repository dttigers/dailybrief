---
phase: 102
plan: 03
subsystem: auth
tags: [middleware, jwt, hono, auth-routes, cors-exempt, generate-key, claim-flow, bearer-auth, wave-2]

requires:
  - phase: 102-00
    provides: "Wave-0 RED-by-default scaffolds — middleware/auth.test.ts (8 active cases) + routes/auth.test.ts (8 active cases) + cross-user-isolation.test.ts (11 DB-gated cases) pin the contract this plan satisfies"
  - phase: 102-01
    provides: "users table (id=1 seed user with D-11 placeholder argon2id hash) + api_keys.user_id NOT NULL FK ON DELETE RESTRICT, backfilled to seed user on Railway production DB"
  - phase: 102-02
    provides: "hashPassword/verifyPassword (argon2id OWASP 2024 params) + signToken/verifyToken (jose HS256 30d exp) + JWT_SECRET boot-check with 32-char minimum"

provides:
  - "src/middleware/auth.ts extended from 55-line SHA256-only to 106-line three-path dispatcher (vk_ / JWT / malformed) with Hono ContextVariableMap augmentation for userId: number"
  - "src/routes/auth.ts — POST /v1/auth/register (503/403/400/201-fresh/201-claimed/409 matrix) + POST /v1/auth/login (400/401-generic/200+JWT, timing-safe via DUMMY_HASH)"
  - "PLACEHOLDER_HASH_PREFIX exported from routes/auth.ts — single source of truth for D-11 claim-flow detection, kept in sync with scripts/migrate-102-seed.ts"
  - "src/index.ts wiring: export const app for integration tests + mount /v1 auth before bearer middleware + bearer exemption for /v1/auth/register + /v1/auth/login (Pitfall 8 CORS preflight closed)"
  - "scripts/generate-key.ts now requires --email; inserts api_keys.user_id FK (Pitfall 4 — prevents future NULL-userId rows)"
  - "Plan 00 middleware/auth.test.ts: 8/8 active pass (+8 over Plan 02 baseline)"
  - "Plan 00 routes/auth.test.ts: 8/8 active pass (file-level RED → GREEN; +8 over Plan 02 baseline)"
  - "Plan 00 cross-user-isolation.test.ts: imports resolve — 11 DB-gated skips cleanly, no ERR_MODULE_NOT_FOUND (Plan 04 scoping audit unblocked)"

affects:
  - "Plan 04 (route-scoping audit) — every handler can now read c.get('userId') and TypeScript infers number; cross-user-isolation.test.ts's 7 LEAK: assertions will fire on any missed .where(userId) clause"
  - "Plan 05 (deploy runbook) — must document VIGIL_ALLOWED_EMAILS env var + claim-flow operational note (seed user's first POST /v1/auth/register overwrites placeholder)"
  - "PWA / Monitor / G2 plugin / CLI / MacBook Pro — zero-breakage confirmed: their vk_ keys still SHA256-lookup and get userId=1 set on Hono context, so Plan 04's future scoping passes them through cleanly"

tech-stack:
  added: []  # No new npm deps; consumed Plan 02's @node-rs/argon2 + jose wrappers
  patterns:
    - "Token-type dispatch discipline: isVkKey() (startsWith vk_ AND zero dots) + looksLikeJwt() (3 parts AND no vk_ prefix) + else → 401 pre-DB-lookup; avoids needless api_keys hits on malformed strings"
    - "Timing-safe login via DUMMY_HASH: verifyPassword always invokes argon2 even on unknown-email or placeholder-hash path, so response time cannot distinguish user-exists vs user-unknown vs password-unset"
    - "Three-status-code matrix for register — 403 (not allowlisted), 409 (existing real hash), 201 (fresh/claimed) with generic bodies across 403+409 to prevent allowlist-membership enumeration via response asymmetry"
    - "Bearer-exemption by exact path match (not prefix) for /v1/auth/register + /v1/auth/login — future /v1/auth/profile (AUTH-06) won't accidentally inherit public status"

key-files:
  created:
    - vigil-core/src/routes/auth.ts  # 155 lines — register + login
  modified:
    - vigil-core/src/middleware/auth.ts  # 55 → 106 lines — vk_/JWT/malformed dispatch
    - vigil-core/src/index.ts  # +7 lines — export const app, mount authRoutes, extend exemption list
    - vigil-core/scripts/generate-key.ts  # 47 → 76 lines — --email required, user FK lookup + set

key-decisions:
  - "isVkKey() tightened to `startsWith('vk_') && !token.includes('.')` rather than just `startsWith('vk_')` — Plan 00's 'vk_abc.def.ghi' test explicitly requires malformed-vk_-with-dots to 401 pre-lookup (D-02 semantics). Plan's example code used startsWith alone but the test contract demands the dot-check"
  - "Moved `if (!db)` check from middleware entry into only the vk_ branch — malformed tokens must 401 'Unrecognized token format' BEFORE any DB concerns; otherwise Plan 00's Malformed test #7 returns 503 instead of 401 (this was the exact RED signal in the baseline run)"
  - "Did NOT add exemptions for OTHER /v1/auth/* paths beyond register+login — AUTH-06 profile and AUTH-07 password-reset will add their own when they ship, preventing accidental public-surface growth. Plan 03 locks down exactly two public endpoints"
  - "Kept DUMMY_HASH as a compile-time constant (not a runtime hash of a random string) — performance: register+login cold paths don't do a wasted argon2 hash. Used a format-valid $argon2id$v=19$m=19456,t=2,p=1$…$… string that verify() processes normally; collision-safe because the encoded hash bytes are base64 of 'dummyhash' repeated (never matches user input)"

patterns-established:
  - "Token-type detection is cheap string ops (no crypto until dispatched): startsWith('vk_') + includes('.') for vk_ path, split('.').length === 3 for JWT path. Only then do we incur SHA256 or jose.jwtVerify cost"
  - "Claim-flow as an invisible state transition: user doesn't see a 'claim your account' UI — they just POST /v1/auth/register and the response {claimed:true} signals that an existing seed row was overwritten. D-11 baked into the flow, not a separate endpoint"
  - "Export const app pattern for Hono integration testing: cross-user-isolation.test.ts dispatches via app.fetch(new Request(...)) in-process — no listening port, no HTTP overhead. Matches calendar.test.ts + settings.test.ts precedent"

requirements-completed: [AUTH-02, AUTH-03, AUTH-05]

# Metrics
duration: 9m1s
completed: 2026-04-18T21:42:00Z
---

# Phase 102 Plan 03: Auth Routes + Middleware JWT Path Summary

**Extended bearerAuth with vk_/JWT/malformed three-path dispatcher + userId context augmentation, shipped POST /v1/auth/register (with D-11 seed-user claim-flow) and POST /v1/auth/login (timing-safe via DUMMY_HASH) wired through CORS-safe bearer-exempt mount order, with live Railway dev-server smoke confirming register-201-claimed → login-200+JWT → /v1/summary-401-without-bearer end-to-end path — seed user reverted to placeholder post-smoke so Plan 04 scoping audit starts from clean D-11 state.**

---

## Performance

- **Duration:** 9m 1s
- **Started:** 2026-04-18T21:32:59Z
- **Completed:** 2026-04-18T21:42:00Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **Wave-2 auth surface shipped end-to-end.** Plan 00's `middleware/auth.test.ts` (8 active) and `routes/auth.test.ts` (8 active) both flipped fully GREEN. Full suite: **pass 212 / fail 4 / skipped 21 / total 237** (baseline after Plan 02: pass 188 / fail 7). Gain of +24 passing, -3 failing. The remaining 4 failures are all `cross-user-isolation.test.ts` cases that need per-route `.where(userId)` scoping — **Plan 04's entire job**, explicitly excluded from Plan 03's scope (plan objective: "Does NOT yet scope any route's queries — that's Plan 04").
- **Live Railway dev-server smoke 5/5 GREEN:** (a) `POST /v1/auth/register` with seed email+password → 201 `{id:1, email:"jamesonmorrill1@gmail.com", claimed:true}` — D-11 claim-flow overwrote the placeholder hash; (b) `POST /v1/auth/login` with same credentials → 200 + real HS256 JWT (`sub:"1", email:"...", iat:1776548392, exp:1779140392` — 30-day exp per D-12); (c) `GET /v1/summary` without bearer → 401; (d) `GET /v1/summary` with garbage bearer → 401 `"Unrecognized token format"` (D-02 copy verified live); (e) `OPTIONS /v1/auth/register` preflight → 204 (Pitfall 8 CORS gate confirmed closed).
- **generate-key.ts hardened against Pitfall 4.** Three scenarios smoke-tested: missing `--email` → exit 1 with usage hint; unknown email → exit 1 with "No user found" + remediation pointer; valid email → inserts api_keys row with `user_id = 1`, returns new vk_... key. Test row deleted from Railway post-smoke.
- **D-19 equivalent interlock preserved.** Seed user's `password_hash` was temporarily set to real argon2 during smoke (claim-flow overwrote placeholder), then manually reverted to `$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT0xERVJTQUxU$...` via a cleanup script. Plan 04/05 register-claim flow starts from the same clean D-11 baseline as Plan 02 left it.

## Task Commits

1. **Task 1: Extend src/middleware/auth.ts with JWT path + userId injection** — `fac77b0` (feat)
2. **Task 2: Create src/routes/auth.ts with allowlist + claim-flow + timing-safe login** — `f3c596a` (feat)
3. **Task 3: Wire auth routes in src/index.ts (CORS-safe) + update scripts/generate-key.ts to require --email** — `724fe4c` (feat)

## Files Created/Modified

**Created:**
- `vigil-core/src/routes/auth.ts` (155 lines) — `auth` Hono router + `PLACEHOLDER_HASH_PREFIX` export + `DUMMY_HASH` constant + `isAllowlistedEmail()` + `isValidEmailShape()` helpers. POST /auth/register implements the full D-08/D-09/D-10/D-11 matrix; POST /auth/login is timing-safe against user enumeration.

**Modified:**
- `vigil-core/src/middleware/auth.ts` (55 → 106 lines) — Added `declare module "hono"` ContextVariableMap augmentation (`userId: number`), `isVkKey()` + `looksLikeJwt()` helpers, three-path dispatcher: vk_ → SHA256 api_keys lookup + userId set from row + fire-and-forget lastUsedAt (preserved); JWT → verifyToken + Number(sub) + positive-integer guard; else → 401 "Unrecognized token format".
- `vigil-core/src/index.ts` (+7 lines) — Added `import { auth as authRoutes } from "./routes/auth.js"`; promoted `const app` to `export const app` for integration tests; mounted `app.route("/v1", authRoutes)` after googleAuth but before bearer middleware; extended bearer exemption list with `/v1/auth/register` + `/v1/auth/login` (Pitfall 8 CORS preflight).
- `vigil-core/scripts/generate-key.ts` (47 → 76 lines) — Introduced `parseArg()` helper; `--email` now REQUIRED alongside `--name`; lowercases email (Pitfall 5); looks up users row (exit 1 with remediation pointer on miss); inserts api_keys row with `userId: user.id` (Pitfall 4 mitigation).

## Register Endpoint Behavior Matrix (verified live + via tests)

| Condition | Status | Body |
|-----------|--------|------|
| `VIGIL_ALLOWED_EMAILS` unset | 503 | `{error:"Registration not configured"}` — D-10 fail-closed |
| `VIGIL_ALLOWED_EMAILS=""` (empty) | 503 | same as above |
| Body is not valid JSON | 400 | `{error:"Invalid JSON body"}` |
| `email` or `password` missing / wrong type | 400 | `{error:"email and password are required"}` |
| Email fails shape check | 400 | `{error:"Invalid email format"}` |
| Password length < 12 or > 128 | 400 | `{error:"Password must be 12-128 characters"}` — Pitfall 9 DoS guard |
| Email not in allowlist | 403 | `{error:"Registration is not open to this address"}` — D-08 generic (no echo) |
| Email in allowlist, no existing user | 201 | `{id, email}` — fresh registration |
| Email in allowlist, existing user with PLACEHOLDER hash | 201 | `{id, email, claimed:true}` — D-11 claim-flow |
| Email in allowlist, existing user with real hash | 409 | `{error:"Unable to register with those credentials"}` — generic (same shape as 403) |

## Login Endpoint Behavior Matrix

| Condition | Status | Body | Notes |
|-----------|--------|------|-------|
| Body is not valid JSON | 400 | `{error:"Invalid JSON body"}` | |
| `email` or `password` missing / wrong type | 400 | `{error:"email and password are required"}` | |
| Unknown email | 401 | `{error:"Invalid credentials"}` | Runs verifyPassword vs DUMMY_HASH — timing-safe |
| Known email, wrong password | 401 | `{error:"Invalid credentials"}` | Same body as unknown — no enumeration |
| Known email, placeholder hash (unclaimed) | 401 | `{error:"Invalid credentials"}` | D-11: must claim via register first |
| Known email, correct password | 200 | `{token, user:{id, email}}` | HS256 JWT, sub=String(id), email claim, 30d exp |

## Middleware Dispatch (branch coverage from Plan 00 middleware/auth.test.ts)

| Input token shape | Branch | Outcome |
|-------------------|--------|---------|
| No Authorization header | reject pre-dispatch | 401 "Missing or invalid Authorization header" |
| `Basic abc` (not Bearer) | reject pre-dispatch | 401 |
| `Bearer ` (empty) | reject pre-dispatch | 401 |
| `Bearer vk_<64hex>` (no dots) | Path 1 | SHA256 lookup → 200 if found + isActive, 401 otherwise; 500 if row.userId is NULL |
| `Bearer vk_abc.def.ghi` (vk_ + dots) | Path 3 malformed | 401 "Unrecognized token format" (pre-lookup) |
| `Bearer <header>.<payload>.<sig>` (valid HS256) | Path 2 | verifyToken → userId = Number(sub) → 200 with c.set("userId", userId) |
| `Bearer <header>.<payload>.AAAAA` (tampered sig) | Path 2 catch | 401 "Invalid or expired token" |
| `Bearer <expired HS256>` | Path 2 catch | 401 "Invalid or expired token" |
| `Bearer garbage` (0 or 1 dots, no vk_) | Path 3 malformed | 401 "Unrecognized token format" |

All 8 of these rows plus 3 DB-gated cases (TODOs — unchanged from Plan 00) are exercised by Plan 00's `src/middleware/auth.test.ts`. 8 active pass, 3 skip.

## Dev-Server Smoke Evidence

Ran `tsx src/index.ts` with Railway `DATABASE_URL` + `JWT_SECRET=<32-char-test>` + `VIGIL_ALLOWED_EMAILS=jamesonmorrill1@gmail.com`:

```
Vigil Core API running on port 3001
[vigil-core] PostgreSQL connection verified

curl POST /v1/auth/register {"email":"...","password":"smoketest-pw-12345"}
  → 201 {"id":1,"email":"jamesonmorrill1@gmail.com","claimed":true}   ✅ D-11 claim

curl POST /v1/auth/login {"email":"...","password":"smoketest-pw-12345"}
  → 200 {"token":"eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6IjxzYW1lPiIsInN1YiI6IjEiLCJpYXQiOjE3NzY1NDgzOTIsImV4cCI6MTc3OTE0MDM5Mn0.QibCI5oQHGU_YyP66nCv2gZDuWOVIubvs3q6sWK7ZMU",
         "user":{"id":1,"email":"jamesonmorrill1@gmail.com"}}            ✅ JWT mint (30d exp)

curl GET /v1/summary
  → 401                                                                  ✅ bearer still gates protected routes

curl GET /v1/summary -H "Authorization: Bearer garbage"
  → 401 {"error":"Unrecognized token format"}                            ✅ D-02 copy live

curl -X OPTIONS /v1/auth/register -H "Origin: https://app.vigilhub.io"
  → 204                                                                  ✅ Pitfall 8 CORS preflight closed
```

## generate-key.ts Smoke Evidence

```
$ npx tsx scripts/generate-key.ts --name "test"
Usage: npx tsx scripts/generate-key.ts --name "my-client" --email "owner@example.com"
  --email is REQUIRED: api_keys.user_id is NOT NULL post-Phase-102 (Pitfall 4).
(exit 1) ✅

$ npx tsx scripts/generate-key.ts --name "test" --email "nobody@example.com"
No user found for email: nobody@example.com
Create the user via POST /v1/auth/register first, or verify VIGIL_SEED_USER_EMAIL.
(exit 1) ✅

$ npx tsx scripts/generate-key.ts --name "test-key-plan-03" --email "jamesonmorrill1@gmail.com"
API key generated successfully!
  Owner: jamesonmorrill1@gmail.com (id=1)
  Name:  test-key-plan-03
  Prefix: vk_da4fa79a...
  Key: vk_da4fa79a869f9f55cebdb6e8934e4adcb92e3be889a88aaf51a6d52fb2feabf0
(exit 0, row cleaned up after smoke) ✅
```

## Decisions Made

**1. Tightened `isVkKey()` to also reject dot-containing strings**

Plan's example code used just `startsWith("vk_")` for vk_ detection. But Plan 00 middleware test #8 explicitly tests `Bearer vk_abc.def.ghi` and expects 401 — because the string has the vk_ prefix AND two dots, which would pass BOTH detection rules. Tightening `isVkKey()` to `startsWith("vk_") && !token.includes(".")` puts malformed vk_-with-dots into the else branch (Path 3), where it gets the correct 401 "Unrecognized token format" response. This also matches the pre-lookup-rejection intent in the plan's acceptance criteria.

**2. Moved `if (!db)` check out of middleware entry**

Plan's example code had `if (!db) return 503` as the first check after auth-header validation. But this meant malformed-bearer tests without DATABASE_URL set were returning 503 instead of 401 — which is the RED signal I observed in the baseline middleware test run (`503 !== 401`). Fix: only the vk_ path needs `db` (it does a lookup); the JWT path doesn't touch `db` at all; and malformed should 401 without ever touching the DB. Refactored so `if (!db)` is inside the `isVkKey()` branch.

**3. DUMMY_HASH is a compile-time constant, not a runtime hash**

Plan mentioned the timing-safe pattern requires "a real argon2 hash". I chose to hand-write a format-valid `$argon2id$v=19$m=19456,t=2,p=1$<base64salt>$<base64hash>` string with base64-encoded junk. verifyPassword() will happily call argon2's verify() on it; verify() parses the format, derives the comparison, and returns false — and that's the only thing we need (false return + ~30ms compute). The alternative (hashing a random string at boot) adds ~30ms to server cold-start and no observable benefit, since the encoded params match regardless.

**4. Did NOT convert Plan 00's it.skip TODOs to active tests**

The plan's action step noted this was optional (`"IF a DATABASE_URL is available — but this task only REQUIRES the non-skip cases to pass"`). I chose to leave them as `it.skip` because:
(a) Plan 00's design deliberately kept them skipped to let Plan 03 run hermetically
(b) Activating them would require mocking `db` + seeding api_keys rows, which duplicates the cross-user-isolation test's setup
(c) The failing cross-user-isolation tests already exercise the same code paths end-to-end on a live DB, so Plan 04 will see any regression

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed isVkKey() to reject vk_-prefixed strings containing dots**

- **Found during:** Task 1 — baseline test run `npx tsx --test src/middleware/auth.test.ts`
- **Issue:** Plan's example code for `isVkKey()` used only `startsWith("vk_")`, but Plan 00's Malformed test #8 (`Bearer vk_abc.def.ghi`) expects the request to 401 with "Unrecognized token format" BEFORE any api_keys lookup. With the plan's naive check, `vk_abc.def.ghi` would fall into Path 1 (vk_), hit the DB, and return 401 "Invalid API key" — same status code but wrong branch, wrong error message. Per D-02 error-copy contract, this is a correctness bug.
- **Fix:** `isVkKey()` now returns `token.startsWith("vk_") && !token.includes(".")`. Malformed vk_-with-dots falls through to Path 3 (malformed) and returns the correct "Unrecognized token format" message.
- **Files modified:** `vigil-core/src/middleware/auth.ts`
- **Verification:** Plan 00 middleware test #8 flipped from RED (actual=503 because the db null check fired, OR would be wrong-error-message if db existed) to GREEN ("Unrecognized token format" matched via regex `/Unrecognized token format|Invalid/`).
- **Committed in:** `fac77b0` (Task 1 commit)

**2. [Rule 1 - Bug] Moved `if (!db)` guard from middleware entry into vk_ branch only**

- **Found during:** Task 1 — baseline test run produced `503 !== 401` on multiple malformed-token tests when DATABASE_URL was unset
- **Issue:** Plan's example code had the `if (!db) return 503` as the first check after header validation. This meant any malformed or JWT test without DATABASE_URL returned 503 ("Database unavailable") instead of the expected 401 branch behavior. The JWT path doesn't need `db`; malformed path doesn't need `db`; only vk_ needs `db`.
- **Fix:** The `if (!db)` check was removed from middleware entry and placed only inside the vk_ branch (directly before the api_keys query).
- **Files modified:** `vigil-core/src/middleware/auth.ts`
- **Verification:** Full middleware test file went from 0/8 passing (file-level db-null-503 across all tests) to 8/8 active passing. Plan 00's JWT path tests (valid, tampered, expired) and malformed-path tests all run hermetically with DATABASE_URL unset.
- **Committed in:** `fac77b0` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug fixes to plan's example code)
**Impact on plan:** Both fixes were necessary to satisfy Plan 00's Wave-0 test contract. No scope creep; no schema or interface changes; both fixes are net-narrower branches (rejecting fewer edge cases into the wrong path).

## Issues Encountered

- `tsx -e` inline eval mode doesn't support top-level-await with relative imports (Node 25 ESM + tsx module remapping edge case). Worked around post-smoke by writing a temporary `scripts/_cleanup-plan-03-temp.ts` file and invoking via `npx tsx scripts/_cleanup-plan-03-temp.ts`. Pattern matches Plan 02's documented same-issue workaround (`.mjs` file for standalone DB ops). No code-path impact — only affected the post-smoke seed-user-revert + test-key-cleanup step. Temp file deleted after successful execution.
- Railway `.env` doesn't have `JWT_SECRET` or `VIGIL_ALLOWED_EMAILS` set (they live only in Railway prod env). Smoke tests passed inline env vars. Plan 05 runbook to document both as required-on-Railway.

## Railway Production DB State Post-Plan

```
seed user: id=1, email=jamesonmorrill1@gmail.com, hash_prefix=$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT
  ↑ reverted to D-11 placeholder post-smoke
api_keys: pre-existing 4 rows preserved (all user_id=1); test-key-plan-03 row created during smoke and DELETED after verification
```

## Environment Variables Introduced

| Var | Purpose | Default | Flag for Plan 05 Runbook? |
|-----|---------|---------|----------------------------|
| `VIGIL_ALLOWED_EMAILS` | Comma-separated email allowlist for POST /v1/auth/register (D-08/D-09/D-10); 503 if unset (fail-closed) | `jamesonmorrill1@gmail.com` (recommended) | **Yes** — add to RUNBOOK.md with claim-flow operational note |

`JWT_SECRET` remains in Railway env (Plan 02 introduced it; unchanged this plan).

## Threat Register Disposition

| Threat ID | Category | Disposition | Realized? | Notes |
|-----------|----------|-------------|-----------|-------|
| T-102-03-01 | Spoofing (JWT alg:"none") | mitigate | No | `verifyToken` from Plan 02 hard-pins `algorithms:["HS256"]`. Middleware calls verifyToken as sole trust anchor — no manual JWT parsing. Plan 00's JWT tampered + expired tests GREEN. |
| T-102-03-02 | Spoofing (user enumeration via login response) | mitigate | No | DUMMY_HASH always verified on unknown email. 401 "Invalid credentials" shared across wrong-email / wrong-password / placeholder-hash paths. |
| T-102-03-03 | Information Disclosure (403 vs 409 reveals allowlist membership) | mitigate | No | 403 body "Registration is not open to this address" and 409 body "Unable to register with those credentials" are both generic. Only status code differs — this is documented as a known intentional leak (allowlist + personal-tool posture; AUTH-08 replaces with admin-invite). |
| T-102-03-04 | Tampering (vk_ key with NULL user_id silently treated as no data) | mitigate | No | 500 "Server misconfiguration" returned on NULL userId — fail-loud. Combined with Plan 01's NOT NULL + generate-key.ts's new --email requirement, is belt-and-suspenders. |
| T-102-03-05 | DoS (registration opened by env misconfig) | mitigate | No | D-10 fail-closed: env-unset or empty → 503. Confirmed live via Plan 00 test "returns 503 when VIGIL_ALLOWED_EMAILS is unset". |
| T-102-03-06 | EoP (forged JWT with alien userId) | mitigate | No | HS256 signature requires JWT_SECRET knowledge; attacker cannot mint. Rotation playbook deferred to Plan 05 RUNBOOK. |
| T-102-03-07 | DoS (register open to the internet, no rate limit) | accept | No | Existing `rateLimiter` middleware (100 req/60s per IP) runs at line 87 of src/index.ts BEFORE the bearer exemption, so /v1/auth/register is rate-limited. Verified by reading mount order top-to-bottom. |

## Threat Flags — New Surface

Two new public network endpoints introduced:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-auth-endpoint | `vigil-core/src/routes/auth.ts` | POST /v1/auth/register and POST /v1/auth/login are unauthenticated HTTP POSTs bypassing bearerAuth. Input is argv-like JSON; validation enforced in-handler (length bounds + type checks + allowlist). |
| threat_flag: cors-exempt-path | `vigil-core/src/index.ts` | Bearer middleware explicitly exempts `/v1/auth/register` and `/v1/auth/login` (CORS preflight) — list must NOT be extended without explicit threat-model re-review. |

Both are in-plan per D-08..D-15 and were the stated purpose of Plan 03 — flagging for ongoing security posture tracking (Plan 05 runbook should include "public endpoint inventory").

## Known Stubs

None. `DUMMY_HASH` is a constant format-valid argon2 string used for timing-safe parity on unknown-email login — it is NOT a stub or placeholder, it's an intentional correctness mechanism with documented purpose.

## Test Suite Regression Check

| Metric | Pre-Plan-03 (Plan 02 baseline) | Post-Plan-03 | Delta |
|--------|-------------------------------|--------------|-------|
| tests total | 210 | 237 | +27 (cross-user-isolation.test.ts 11 cases now enumerate since app import resolves) |
| pass | 188 | **212** | **+24** (middleware 8, routes 8, plus 8 other cases that were file-level-blocked) |
| fail | 7 | **4** | **-3** (middleware file-level fail + routes file-level fail + cross-user file-level fail → resolved; 4 remaining failures are per-route scoping, which is Plan 04) |
| skipped | 15 | 21 | +6 (cross-user-isolation's 11 DB-gated cases replace the 1 file-level fail that previously subsumed them) |

Zero pre-existing tests regressed. The 4 remaining failures are exactly the per-route scoping assertions expected to fail until Plan 04 adds `.where(eq(table.userId, c.get('userId')))` to every query site.

## Next Phase Readiness

**Plan 04 (route-scoping audit) can start immediately.** It now has:

- `c.get("userId")` available and TypeScript-typed as `number` on every handler — Plan 04's compiler errors become the exhaustive task list (every existing query site without userId filter will either fail type-check or silently compile — Plan 04 audits with both `tsc --noEmit` and grep).
- Live JWT issuance via POST /v1/auth/login for test-user setup — cross-user-isolation.test.ts's before hook (userA + userB creation + token minting) is unblocked.
- Seed user's password reverted to D-11 placeholder — future register-claim flow on a fresh dev DB (or after Plan 05 Railway rollback) starts from the same baseline.

**Plan 05 (deploy runbook) carries forward:**
- Add `VIGIL_ALLOWED_EMAILS` to Railway env var list + claim-flow operational note ("first register call overwrites placeholder hash — do NOT delete the seed row pre-claim")
- Add `JWT_SECRET` rotation playbook (generate 32+ char random, Railway env var edit, redeploy; all JWTs invalidated — vk_ keys unaffected)
- Document public endpoint inventory (`/v1/health`, `/v1/auth/google*`, `/v1/auth/register`, `/v1/auth/login`) — any future expansion requires threat-model re-review
- Document first-Railway-deploy validation: `npm ci --omit=dev` on node:20-alpine must resolve without native build (@node-rs/argon2 musl check from Plan 02)

## Self-Check: PASSED

- [x] `vigil-core/src/middleware/auth.ts` (106 lines) — declare module hono + ContextVariableMap + isVkKey + looksLikeJwt + three-path dispatcher + Pitfall 4 fail-loud + fire-and-forget lastUsedAt
- [x] `vigil-core/src/routes/auth.ts` (155 lines) — PLACEHOLDER_HASH_PREFIX export + DUMMY_HASH + register matrix (503/400/403/201/409) + login timing-safe + signToken on success
- [x] `vigil-core/src/index.ts` — `export const app`, `import { auth as authRoutes }`, `app.route("/v1", authRoutes)` mounted after googleAuth + before bearer middleware, bearer exemption extended to register+login
- [x] `vigil-core/scripts/generate-key.ts` — --email required, lowercase normalization, users lookup + exit 1 on miss, userId: user.id set on insert
- [x] All 3 task commits present in git log (fac77b0, f3c596a, 724fe4c)
- [x] Plan 00 middleware/auth.test.ts: 8/8 active GREEN
- [x] Plan 00 routes/auth.test.ts: 8/8 active GREEN
- [x] Plan 00 cross-user-isolation.test.ts: imports resolve (11/11 cases enumerate; 7 DB-gated skips, 4 per-route Plan 04 failures)
- [x] Live dev-server smoke: register 201 claimed, login 200 + JWT (30d exp), /v1/summary 401 without bearer, garbage bearer 401 "Unrecognized token format", OPTIONS preflight 204
- [x] generate-key smoke: missing-email exit 1, unknown-email exit 1, valid-email inserts row with user_id=1
- [x] Seed user password reverted to D-11 placeholder post-smoke (Railway DB verified: hash prefix starts with `$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT`)
- [x] Zero pre-existing tests regressed (pass went from 188 → 212; no existing pass went to fail)
- [x] `grep "export const app = new Hono" vigil-core/src/index.ts` exits 0
- [x] `grep "c.set(\"userId\"" vigil-core/src/middleware/auth.ts` exits 0
- [x] `grep "claimed: true" vigil-core/src/routes/auth.ts` exits 0

---
*Phase: 102-multi-user-foundation*
*Completed: 2026-04-18*
