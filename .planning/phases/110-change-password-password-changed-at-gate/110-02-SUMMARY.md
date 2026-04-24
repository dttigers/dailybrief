---
phase: 110-change-password-password-changed-at-gate
plan: 02
subsystem: auth
tags: [auth, middleware, endpoint, jwt, gate, change-password, wave-2]

# Dependency graph
requires:
  - phase: 110-change-password-password-changed-at-gate
    plan: 01
    provides: users.password_changed_at TIMESTAMPTZ NOT NULL column + D-03 created_at backfill on all pre-migration rows
  - phase: 109-per-user-scheduler-fan-out
    provides: prioritize.ts canonical protected-router pattern mirrored by change-password.ts (index.ts:151 D-09 anchor)
  - phase: 102-multi-user-foundation
    provides: HS256 JWT + argon2id password helpers, bearerAuth three-path dispatcher, /auth/register + /auth/login contracts reused verbatim in D-11/D-13
provides:
  - POST /v1/auth/change-password protected endpoint (8-step D-11 flow, D-14 signToken-after-update ordering pinned by test)
  - bearerAuth Path 2 iat-gate — strict-less-than `claims.iat < Math.floor(user.passwordChangedAt.getTime()/1000)` with distinct "Session expired" 401 body
  - Phase 110 security primitive — every JWT request now validates against the user's latest password-change timestamp; pre-change tokens bounce with a routable error body
  - D-07 missing-user 401 branch returning the verbatim "Invalid or expired token" body (symmetric with verifyToken catch — no new surface for user-deletion enumeration)
affects:
  - 110-03 (PWA change-password form + global 401 "Session expired" handler consumes the exact body this plan emits)
  - 112-forgot-password-email-flow (reset-password handler will update passwordChangedAt using the same `db.update(users).set({ passwordHash, passwordChangedAt: new Date() })` pattern)
  - all authenticated JWT paths (gate runs on every Path 2 request; one extra PK-indexed SELECT per JWT call — negligible at current scale)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Protected-router Option A (Phase 109 prioritize.ts template verbatim): NEW file vigil-core/src/routes/change-password.ts exporting `changePassword` Hono router, mounted in index.ts AFTER the global bearerAuth dispatcher so `c.get(\"userId\")` is guaranteed non-null — no per-handler null-check needed"
    - "D-14 load-bearing ordering: `await db.update(...)` strictly precedes `await signToken(...)` in the same handler body. Strict-less-than gate (D-05) means the freshly-issued JWT's `iat` must be >= the just-written `passwordChangedAt` second; writing first guarantees this monotonically"
    - "Locally-duplicated validation constants to decouple protected router from public router (MIN_PASSWORD/MAX_PASSWORD). Literal string `Password must be 12-128 characters` pinned by CP-CHG-03 test so future refactors can't drift"

key-files:
  created:
    - vigil-core/src/routes/change-password.ts
  modified:
    - vigil-core/src/middleware/auth.ts
    - vigil-core/src/middleware/auth.test.ts
    - vigil-core/src/index.ts
    - vigil-core/src/routes/auth.ts
    - vigil-core/src/routes/auth.test.ts
    - vigil-core/src/integration/cross-user-isolation.test.ts

key-decisions:
  - "Reconciled CONTEXT §specifics line 135 wording bug: the gate uses strict less-than (`claims.iat < gateThreshold`), so `iat == gateThreshold` PASSES. CP-GATE-02 asserts this verbatim with a reconciliation note in both the test description and comment block — live-code semantics are the contract, not the prose."
  - "CP-GATE-04 reframed as 'vk_ unaffected by gate REJECTION' (observable behavior: passwordChangedAt 1y in the future still returns 200 for a vk_ key). The 'no DB read on Path 1' claim is anchored in the source code (gate SELECT lives inside `if (looksLikeJwt(token))`) — the test cannot prove the negative without db.select spy infrastructure."
  - "Rule 3 cascade: Plan 01 made `passwordChangedAt` NOT NULL with no DEFAULT. Four call sites (`routes/auth.ts` register, `routes/auth.ts` claim-flow update, `cross-user-isolation.test.ts` seeds A + B, the pre-existing middleware happy-path test) had to be updated to either set `passwordChangedAt` at insert time or skip when DATABASE_URL is unset. The claim-flow update now bumps passwordChangedAt too — defensive, because a claim IS a password set."

patterns-established:
  - "When adding a NOT NULL column without a DEFAULT to an existing table, every `.insert(table).values({...})` call site surfaces as a TS error. The fix policy is semantic: set the column to the value that makes the row valid at creation time (passwordChangedAt = new Date() for a register, = seed time for a test seed)."
  - "The D-14 ordering pin in CP-CHG-06 is the canonical template for future gate+write handlers (e.g., Phase 112 reset-password): assert `iat >= floor(gateField/1000)` + a follow-up authenticated request that would 401 if ordering is wrong."

requirements-completed: [AUTH-09]

# Metrics
duration: 13min
completed: 2026-04-24
---

# Phase 110 Plan 02: bearerAuth iat-gate + POST /v1/auth/change-password Summary

**Added the passwordChangedAt iat-gate to bearerAuth Path 2 (strict-less-than with distinct "Session expired" 401 body) and shipped POST /v1/auth/change-password on a NEW protected router mounted after the bearerAuth dispatcher, with D-14 ordering (signToken strictly after db.update) pinned by test and zero modifications to the existing public auth router.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-04-24T01:21:02Z
- **Completed:** 2026-04-24T01:34:12Z
- **Tasks:** 3/3
- **Files created:** 1 (change-password.ts)
- **Files modified:** 6 (middleware/auth.ts, middleware/auth.test.ts, index.ts, routes/auth.ts, routes/auth.test.ts, integration/cross-user-isolation.test.ts)

## Accomplishments

- `bearerAuth` Path 2 now reads `users.passwordChangedAt` immediately after `verifyToken()` and before `c.set("userId", userId)`. Gate rejects with `{ error: "Session expired" }` (D-08) when `claims.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)`. Missing-user row returns the verbatim `{ error: "Invalid or expired token" }` body used by verifyToken failure (D-07, response-surface symmetric).
- `vk_` Path 1 is structurally untouched — the gate lives inside `if (looksLikeJwt(token))` and vk_ requests never enter it. CP-GATE-04 demonstrates the observable behavior: even with `passwordChangedAt` 1 year in the future, a vk_ request still returns 200.
- NEW file `vigil-core/src/routes/change-password.ts` exporting a `changePassword` Hono router implementing the 8-step D-11 flow. `MIN_PASSWORD=12` and `MAX_PASSWORD=128` are duplicated locally (not imported from routes/auth.ts) to decouple this protected router from the public router.
- `vigil-core/src/index.ts` mount line registered at line 159 (adjacent to `prioritize` at line 152, strictly after the bearerAuth dispatcher at line 116). The existing public `auth` router is unchanged — register/login stay public.
- D-14 ordering is enforced in the handler body (line 114 `await db.update(...)` precedes line 126 `await signToken(...)`) and pinned by CP-CHG-06 which asserts `iat >= floor(refreshed.passwordChangedAt/1000)` plus a follow-up authenticated request that would fail with 401 if the ordering is reversed.
- 5 gate tests (CP-GATE-01..05) and 6 change-password tests (CP-CHG-01..06) — all pass on a live DB; all skip cleanly when `DATABASE_URL` is unset, matching the existing Phase 102 skip pattern.

## bearerAuth Gate Diff Snippet (middleware/auth.ts)

```typescript
  // ── Path 2: JWT ───────────────────────────────────────────────────────────
  if (looksLikeJwt(token)) {
    try {
      const claims = await verifyToken(token);
      const userId = Number(claims.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        return c.json({ error: "Invalid token subject" }, 401);
      }

      // Phase 110 (AUTH-09 D-05/D-06/D-07/D-08): password_changed_at iat gate.
      // Gate runs only on Path 2 (JWT). vk_ keys (Path 1) are structurally
      // unaffected — no passwordChangedAt read on this branch (D-06).
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

      c.set("userId", userId);
      return next();
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  }
```

The `if (looksLikeJwt(token))` block opens at line 90 and closes at line 140. The gate SELECT (line 106) and rejection (line 132) both live strictly inside this block — vk_ Path 1 (lines 50-87) is structurally unreachable by this code.

## NEW routes/change-password.ts Handler Shape

```typescript
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 128;

export const changePassword = new Hono();

changePassword.post("/auth/change-password", async (c) => {
  const userId = c.get("userId") as number;
  // ... JSON parse, body validation, SELECT user, verify current,
  //     length validation, same-as-current check, hashPassword ...

  // D-14 ORDERING: db.update MUST commit BEFORE signToken.
  const now = new Date();
  await db
    .update(users)
    .set({ passwordHash: newPasswordHash, passwordChangedAt: now, updatedAt: now })
    .where(eq(users.id, user.id));

  const token = await signToken(user.id, user.email);
  return c.json({ token, user: { id: user.id, email: user.email } });
});
```

D-14 ordering line numbers (verbatim grep output):
- Line 114: `await db` (the UPDATE — `.update(users).set(...).where(...)` continues through line 123)
- Line 126: `const token = await signToken(user.id, user.email);`

## index.ts Mount Snippet

```typescript
app.route("/v1", prioritize);              // line 152 — D-09 anchor from Phase 109
// Phase 110 (AUTH-09 D-09): change-password is a NEW protected router.
// Mounted AFTER the bearerAuth dispatcher at line 116 (mirrors prioritize
// pattern). The handler does `c.get("userId") as number` and the dispatcher
// guarantees that's non-null. Do NOT move this above line 116 — would create
// a silent auth bypass (see WR-02 mount-order comment at lines 124-130).
app.route("/v1", changePassword);          // line 159 — NEW mount
app.route("/v1", describeImage);
```

Position verification: `grep -n 'app.route("/v1", changePassword);' src/index.ts | awk -F: '{ print ($1 > 116 ? "OK after bearerAuth (line " $1 ")" : "FAIL") }'` returns `OK after bearerAuth (line 159)`.

## Confirmation: Existing Public auth Router Unchanged

- `grep -c "change-password" vigil-core/src/routes/auth.ts` returns `0` — no leakage into the public router.
- `grep -c "auth.post" vigil-core/src/routes/auth.ts` returns `2` — still only register + login; change-password is NOT here.
- The existing `export const auth = new Hono()` at line 38 and its mount at `index.ts:109` (BEFORE the bearerAuth dispatcher) are structurally unchanged. Register and login remain PUBLIC as intended.

**Note:** `routes/auth.ts` was modified for the Rule 3 cascade (Plan 01 NOT NULL column) but NOT for the change-password endpoint itself — the only changes are the two existing `.insert(users).values({...})` call sites now including `passwordChangedAt: new Date()` and the claim-flow update bumping passwordChangedAt alongside updatedAt. Neither adds or removes a route handler.

## Test Results

### CP-GATE-01..05 (middleware/auth.test.ts) — all 5 pass on live DB

| Test | Assertion | Duration |
|---|---|---|
| CP-GATE-01 | Stale JWT (iat < floor(passwordChangedAt/1000)) → 401 "Session expired" | 34ms |
| CP-GATE-02 | Equal-iat (iat == floor(ts/1000)) → 200 (strict-less-than means equality passes) | 16ms |
| CP-GATE-03 | Fresh JWT (iat > floor(ts/1000)) → 200 | 8ms |
| CP-GATE-04 | vk_ key with passwordChangedAt 1y in future → still 200 (gate REJECTION unaffected) | 19ms |
| CP-GATE-05 | Deleted user (row removed mid-session) → 401 "Invalid or expired token" (D-07) | 19ms |

### CP-CHG-01..06 (routes/auth.test.ts) — all 6 pass on live DB

| Test | Assertion | Duration |
|---|---|---|
| CP-CHG-01 | Success: 200 + { token, user } + DB row updated; verifyToken on returned token matches userId | 129ms |
| CP-CHG-02 | Wrong currentPassword → 401 "Invalid credentials" (D-11 step 2 verbatim) | 63ms |
| CP-CHG-03 | newPassword length 11 → 400 "Password must be 12-128 characters" (pins literal string) | 50ms |
| CP-CHG-04 | Same-as-current newPassword → 400 "New password must differ from current" (D-12) | 67ms |
| CP-CHG-05 | Malformed JSON body → 400 "Invalid JSON body" (D-10) | 28ms |
| CP-CHG-06 | D-14 ORDERING PIN: iat >= floor(passwordChangedAt/1000) AND follow-up request does not bounce 401 | 132ms |

### Skip-mode (no DATABASE_URL) — CI-safe

- `npm test` (default invocation, no --env-file) runs 40 tests: 15 pass, 25 skip (all CP-GATE + CP-CHG + claim-flow tests that need live DB), 0 fail.
- Build exits 0 (`npm run build`).

### Known pre-existing hang

Full-suite runs against the live DB eventually hang after all assertions complete — this is the pre-existing `npm test` hang documented in STATE.md blockers (scheduler setInterval keeps event loop alive after test). The individual test files each exit cleanly after the final assertion passes. This plan did NOT introduce the hang and does NOT attempt to fix it — scoped to deferred items.

## Reconciliation: CONTEXT §specifics line 135 wording bug

CONTEXT §specifics line 135 reads "strict less-than" but then asserts that `iat == floor(passwordChangedAt/1000)` returns 401 — internally inconsistent. The live code in `middleware/auth.ts` uses `if (claims.iat < gateThreshold)` (NOT `<=`), so equality means `iat < threshold` is FALSE and the gate does NOT reject.

**CP-GATE-02 reflects actual live-code semantics:** equality PASSES with status 200 from the probe handler. The test description and inline comment both spell out the reconciliation so a future reader doesn't mistake the CONTEXT prose for the contract. D-14 ordering (signToken AFTER db.update commits) makes the equality case practically unreachable in production, but the gate enforces strict `<` and the test pins that exact behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01 NOT NULL column cascade across existing insert call sites**
- **Found during:** Task 1 (first `npm run build`)
- **Issue:** Plan 01 added `passwordChangedAt` as NOT NULL with no DEFAULT. TypeScript error TS2769 surfaced at four sites — `routes/auth.ts` register (line 91), `routes/auth.ts` claim-flow update (didn't set passwordChangedAt despite being a password set), `cross-user-isolation.test.ts` seed A (line 78), seed B (line 82). The pre-existing middleware happy-path test (`JWT path: valid HS256 token → 200`) also failed at runtime when the gate added a DB SELECT — the test had no DATABASE_URL and fell through to 503 "Database unavailable".
- **Fix:**
  - `routes/auth.ts` register: `values({ email, passwordHash, passwordChangedAt: new Date() })` — semantically "password set at account creation".
  - `routes/auth.ts` claim-flow: bump both `passwordChangedAt` and `updatedAt` to `now` — defensive; a claim IS a password set, so any pre-claim JWT should gate-bounce.
  - `cross-user-isolation.test.ts`: seeds A + B set `passwordChangedAt: new Date()` so fresh JWTs in the test body (minted via `signToken` after the inserts) have `iat > floor(passwordChangedAt/1000)` and pass the gate.
  - `middleware/auth.test.ts` happy-path: skip without DATABASE_URL, seed a throwaway user with `passwordChangedAt = 1h ago`, then run the 200 assertion with a live DB.
- **Files modified:** `vigil-core/src/routes/auth.ts`, `vigil-core/src/middleware/auth.test.ts`, `vigil-core/src/integration/cross-user-isolation.test.ts`
- **Verification:** `npm run build` exits 0 after the fixes. `npx tsx --env-file=.env --test src/middleware/auth.test.ts` has JWT happy-path pass at 56ms on live DB.
- **Committed in:** `c5c679a` (Task 1 commit)

**2. [Rule 3 - Blocking] apiKeys insert in CP-GATE-04 missing keyPrefix**
- **Found during:** Task 3 (first `npm run build` after appending tests)
- **Issue:** `apiKeys` table has `keyPrefix TEXT NOT NULL` (schema.ts line 126). The CP-GATE-04 test's `.insert(apiKeys).values({ name, userId, keyHash, isActive })` omitted keyPrefix → TS2769 overload mismatch.
- **Fix:** Added `keyPrefix: rawKey.slice(0, 12)` to the values object (first 12 chars of the raw key — matches the keyPrefix conventions used elsewhere in the codebase for audit logs).
- **Files modified:** `vigil-core/src/middleware/auth.test.ts`
- **Verification:** Build clean after fix. CP-GATE-04 passes on live DB at 19ms.
- **Committed in:** `69031ba` (Task 3 commit)

**Scope boundary respected:** Both Rule 3 fixes are directly caused by this plan's changes (the gate's new DB SELECT) or the prior plan's schema change (NOT NULL column). Neither touches unrelated surface — the 4-line `routes/auth.ts` insert additions and the 2-line `cross-user-isolation.test.ts` seed update are the minimal semantic fix.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — Blocking)
**Impact on plan:** Both blockers unblocked the plan's prescribed build + test acceptance criteria. Zero scope creep — the routes/auth.ts changes are 4 new lines (2 inserts + 1 bumped field in claim-flow). The claim-flow bump is a semantic defensiveness win: a claim IS a password set and should gate any pre-claim JWTs.

## Issues Encountered

- **Pre-existing `npm test` full-suite hang.** Documented in STATE.md blockers ("scheduler setInterval loops keep event loop alive after test"). This plan does NOT attempt to fix it — tests run fine individually (`npx tsx --env-file=.env --test <file>`) and the skip-mode `npm test` invocation completes in ~1.0s with 0 failures. The hang only manifests when live-DB + full-suite invocations are chained.
- **CONTEXT §specifics line 135 wording bug.** Reconciled in-code via CP-GATE-02 description + comment block. No PLAN or CONTEXT edit was needed — the reconciliation is self-contained in the test suite so a future reader encounters it in the same file as the live-code semantics.

## User Setup Required

None — no external service configuration. The endpoint is live locally via `npm run dev` (no new env vars, no new DNS, no new provider accounts). Railway production will pick up the gate + endpoint on the next deploy via the existing CI/CD hook.

## Next Phase Readiness

- **Plan 03 (PWA change-password form + global 401 handler)** can now start. The endpoint returns the exact response shape (`{ token, user: { id, email } }`) the form expects, and the gate's `{ error: "Session expired" }` body is the routable discriminator the global fetch wrapper (D-19) will detect.
- **Phase 112 (forgot-password reset flow)** will write to `passwordChangedAt` using the same `db.update(users).set({ passwordHash, passwordChangedAt: new Date() })` pattern — the gate already enforces invalidation for that path automatically.
- **Concern carry-forward:** Railway prod DB parity already verified post-Plan-01 (column lives on prod via the migrate hook). No additional prod-deploy verification is needed from this plan beyond the normal Railway health check after push.

## Self-Check: PASSED

- **Files verified:**
  - `vigil-core/src/middleware/auth.ts` — FOUND (`grep "Math.floor(user.passwordChangedAt.getTime() / 1000)"` returns 1)
  - `vigil-core/src/routes/change-password.ts` — FOUND (new file, `export const changePassword = new Hono()` present)
  - `vigil-core/src/index.ts` — FOUND (mount at line 159, import present)
  - `vigil-core/src/middleware/auth.test.ts` — FOUND (5 CP-GATE tests present)
  - `vigil-core/src/routes/auth.test.ts` — FOUND (6 CP-CHG tests present, D-14 ORDERING PIN asserted)
  - `vigil-core/src/routes/auth.ts` — FOUND (Rule 3 fix landed, still 2 auth.post handlers)
  - `vigil-core/src/integration/cross-user-isolation.test.ts` — FOUND (Rule 3 fix landed, seeds set passwordChangedAt)

- **Commits verified (git log --oneline | grep):**
  - `c5c679a` — FOUND (Task 1: gate + Rule 3 fixes)
  - `2359cc0` — FOUND (Task 2: change-password.ts + index.ts mount)
  - `69031ba` — FOUND (Task 3: 5 gate tests + 6 change-password tests)

- **Live DB verified:** All 5 CP-GATE-* and all 6 CP-CHG-* tests pass on live DB (`npx tsx --env-file=.env --test`). Build exits 0. Skip-mode npm test (no --env-file) runs 40 tests, 15 pass, 25 skip, 0 fail.

---
*Phase: 110-change-password-password-changed-at-gate*
*Plan: 02*
*Completed: 2026-04-24*
