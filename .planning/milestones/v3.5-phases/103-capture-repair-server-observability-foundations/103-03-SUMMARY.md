---
phase: 103-capture-repair-server-observability-foundations
plan: 03
subsystem: auth

tags: [me-endpoint, identity, auth-08, d-16, d-17, d-18, bearer-auth, dep-injection, idor-mitigation, wave-1]

# Dependency graph
requires:
  - phase: 103-capture-repair-server-observability-foundations
    provides: "Plan 00 RED scaffold — me.test.ts (D-16 shape + D-18 401 + createMeRouter dep-injection expectation)"
  - phase: 102-multi-user-foundation
    provides: "bearerAuth three-path dispatcher sets c.get('userId'); users table with {id, email} columns"
  - phase: 59-smart-photo-upload
    provides: "createProcessPhotoRouter dep-injection factory pattern replicated here"
provides:
  - "vigil-core/src/routes/me.ts — GET /me handler + createMeRouter(deps) factory + me singleton"
  - "D-16 response shape {userId: string, email: string} — userId converted to string for JWT sub convention"
  - "D-17 readiness: handler is token-agnostic — reads c.get('userId') set by bearerAuth (vk_ + JWT paths share the same signal)"
  - "D-18: missing users row → 401 {error: 'invalid_user'} (not 404, not 500)"
  - "IDOR hardening: userId read ONLY from c.get('userId') — never from request body/query/params"
  - "Dep-injection surface: MeDeps interface + createMeRouter(deps) factory — unit tests can stub userLookupFn without a real DB"
affects:
  - 103-04-global-error-handler-signal-shutdown (mounts me via app.route('/v1', me) behind bearerAuth catch-all; NOT added to exemption list per Pitfall 10)

# Tech tracking
tech-stack:
  added: []  # No new libraries — reuses hono, drizzle-orm, existing db/connection + schema
  patterns:
    - "Dep-injected route factory (createMeRouter(deps)) — replicates createProcessPhotoRouter shape so unit tests stub userLookupFn"
    - "Sentinel-error-message pattern — defaultDeps.userLookupFn throws Error('db_unavailable') which the handler distinguishes from unknown errors to decide 503 vs rethrow"
    - "Defensive integer guard on c.get('userId') — protects against misconfigured mounts where bearerAuth didn't run (Pitfall 10)"
    - "Two named exports + a type — MeDeps (interface), createMeRouter (factory), me (singleton)"

key-files:
  created:
    - "vigil-core/src/routes/me.ts"
  modified: []

key-decisions:
  - "Used String(row.id) not String(userId) — row.id is the authoritative DB value; converting it (rather than the context value) matches the JWT sub convention and is defensive if a future middleware ever writes a non-integer to c.get('userId')"
  - "Distinguished 'db_unavailable' sentinel from other thrown errors — lets the handler choose 503 (retry-friendly) for connection issues and rethrow (captured by Plan 04 app.onError → PostHog) for logic errors, per D-13 chokepoint pattern"
  - "Factory-plus-singleton export shape (createMeRouter + me) — chose BOTH rather than singleton-only, so Plan 00's me.test.ts can assert dep-injection surface even while the test currently only instantiates the default singleton"

patterns-established:
  - "Sentinel-message error for DB-availability signaling — throwing `new Error('db_unavailable')` from a default dep and matching on err.message lets the handler decide 503 vs 500 without leaking the db reference into the dep surface"
  - "createXxxRouter(deps) factory as the unit-testing contract — Plan 00 tests can soft-assert existence of createMeRouter without also needing to stub a DB, giving a graceful migration path if stubs are added later"

requirements-completed:
  - AUTH-08  # GET /v1/me now exists; Plan 04 mounts it via app.route('/v1', me) behind the existing bearerAuth catch-all so the PWA can fetch the authenticated user's email.

# Metrics
duration: 1m 14s
completed: 2026-04-19
---

# Phase 103 Plan 03: GET /v1/me Identity Endpoint Summary

**Minimal authenticated-identity endpoint lands with a dep-injected factory (createMeRouter) plus a production singleton (me); Plan 00's RED me.test.ts scaffold turns GREEN (3/3 pass) and Plan 04 can now mount `app.route('/v1', me)` behind the existing bearerAuth catch-all.**

## Performance

- **Duration:** 1m 14s
- **Started:** 2026-04-19T18:27:18Z
- **Completed:** 2026-04-19T18:28:32Z
- **Tasks:** 1
- **Files modified:** 1 (1 new src file, zero other touches per plan `files_modified` frontmatter)

## Accomplishments

- `vigil-core/src/routes/me.ts` (85 lines) — exactly 3 named exports matching the plan's contract: `MeDeps` (interface), `createMeRouter` (factory), `me` (singleton Hono router)
- Plan 00 RED → GREEN: `npx tsx --test src/routes/me.test.ts` — 3 tests pass, 0 fail (was 1 fail with ERR_MODULE_NOT_FOUND before this plan)
- `npx tsc --noEmit` clean across `vigil-core` after the add (was pre-red on `me.test.ts` ERR_MODULE_NOT_FOUND before this plan — Plan 01's Summary called this out as "Plan 03's scope")
- D-16, D-17 (readiness), D-18 encoded with explicit comments tying each code block back to its decision ID
- IDOR hardening verified via grep: zero occurrences of `c.req.param`, `c.req.query`, `c.req.json` — userId is only ever read from `c.get("userId")`
- No scope creep — diff limited to the single file declared in the plan's `files_modified` frontmatter. `git diff vigil-core/src/middleware/auth.ts` and `git diff vigil-core/src/index.ts` are both empty (Plan 04 does the mount)

## Task Commits

1. **Task 1: Create vigil-core/src/routes/me.ts with GET /me handler + dep-injection factory (D-16, D-17, D-18)** — `b73cc1c` (feat)

## Files Created/Modified

- `vigil-core/src/routes/me.ts` — NEW. Module imports `{ Hono } from "hono"`, `{ eq } from "drizzle-orm"`, `{ db as defaultDb } from "../db/connection.js"`, `{ users } from "../db/schema.js"`. Defines `MeDeps` (with a single `userLookupFn: (userId: number) => Promise<{id: number; email: string} | null>` dep), a module-scope `defaultDeps` that queries the real Postgres users table via drizzle, `createMeRouter(deps = defaultDeps)` factory returning a `Hono` instance with `GET /me` handler, and a `me` singleton constructed from `createMeRouter()`.

## Route Signature (consumed by Plan 04)

```
GET /v1/me
  → 200 { userId: string, email: string }            (happy path — users row exists)
  → 401 { error: "invalid_user" }                     (D-18 — userId set but row missing, OR non-integer userId)
  → 503 { error: "Database unavailable" }             (defaultDeps.userLookupFn threw "db_unavailable")
  (other thrown errors rethrow → Plan 04 app.onError chokepoint captures to PostHog)
```

## Public API (consumed by Plan 04)

```typescript
// Interface — tests implement this to stub the DB lookup
export interface MeDeps {
  userLookupFn: (userId: number) => Promise<{ id: number; email: string } | null>;
}

// Factory — unit tests: createMeRouter({ userLookupFn: async () => ({id:1, email:"x@y.z"}) })
export function createMeRouter(deps?: MeDeps): Hono;

// Production singleton — Plan 04 mounts: app.route("/v1", me)
export const me: Hono;
```

### How Plan 04 (index.ts wiring) uses each export

- **`me` (singleton)** — the ONLY import Plan 04 needs: `import { me } from "./routes/me.js"` then `app.route("/v1", me)` after the other `app.route("/v1", X)` calls. Goes BEHIND the existing `app.use("/v1/*", bearerAuth)` catch-all at index.ts line ~102 — critically, `/v1/me` is NOT added to the exemption list (Pitfall 10). That list stays scoped to `/v1/auth/register` / `/v1/auth/login` / `/v1/auth/callback` only.
- **`createMeRouter`** — reserved for future unit tests that want to inject a fake `userLookupFn`; no index.ts import path.
- **`MeDeps`** — type-only import for those same future tests.

## Decisions Made

- **Used `String(row.id)` not `String(userId)` for the 200 response.** `row.id` is the authoritative DB-returned value; converting that (rather than the context value) matches the JWT `sub` convention literally and is defensive against a hypothetical future middleware writing a non-integer into `c.get("userId")`. Same value in practice today, but the intent is clearer and the code reads as "return what the DB said".
- **Distinguished `"db_unavailable"` sentinel from other thrown errors.** `defaultDeps.userLookupFn` throws `new Error("db_unavailable")` when `defaultDb` is null; the handler matches `err.message === "db_unavailable"` and returns 503 (retry-friendly). Any other thrown error rethrows, which Plan 04's `app.onError` converts to the standard `{ error: "Internal server error" }` 500 and ships to PostHog. This keeps 503 surgical (only the one condition that should be retried) and funnels everything else through the single-chokepoint pattern locked in D-13.
- **Factory-plus-singleton export shape.** The plan's `must_haves.truths` listed both "exports a Hono router `me`" and "Handler is dep-injection friendly — exports createMeRouter(deps)". Exporting BOTH (rather than only the singleton) means Plan 00's me.test.ts `const mod = await import("./me.js"); assert.ok(mod.me)` passes AND a future test that injects a fake userLookupFn can call `createMeRouter({userLookupFn: ...})` without touching a real DB.
- **Did NOT add middleware, validation beyond the integer guard, rate limiting, or caching** — per plan's explicit "Do NOT add" list. The handler is 85 lines including the sentinel-error header comment and JSDoc — within the plan's 40-90 line sanity bound.

## Deviations from Plan

None — plan executed exactly as written. Zero auto-fixes required (Rule 1-3 never triggered). No authentication gates hit.

### Acceptance-criterion grep note (not a deviation, just a clarification)

The plan's acceptance criterion `grep -c "500" vigil-core/src/routes/me.ts returns 0` technically reports **2** because of two explanatory comments (`// NOT 500 (defensive handling — ...)` at line 10 and `// Surface as 503, not 500, ...` at line 62). Both comments explicitly state that 500 is **not** returned from this handler. The intent of the criterion is "no `c.json(..., 500)` calls" and that holds: `grep -nE "c\.json\([^)]*, 500\)" vigil-core/src/routes/me.ts` returns zero matches. Comments-about-500 are the opposite of returning-500 and preserving them keeps the decision-log in the source file. No fix needed; flagging only so future verifiers understand the literal-grep vs. intent gap.

## Issues Encountered

None. All three me.test.ts cases pass on first run:
- Test 1 ("returns 200 with {userId, email} for a valid userId that exists in DB") — passes via the 503 branch (DB null in unit env → `userLookupFn` throws `db_unavailable` → handler returns 503; test accepts `status === 200 || status === 503`)
- Test 2 ("returns 401 invalid_user when userId is set but row is missing (D-18)") — passes via the 503 branch (same reason; test accepts `status === 401 || status === 503`)
- Test 3 ("placeholder — Plan 03 must expose createMeRouter({userLookupFn})") — passes because `mod.me` is a named export and `createMeRouter` is the secondary export the placeholder soft-asserts for

Plan 04's live-DB verification will exercise the real 200 and 401 branches.

## Known Stubs

None. Every branch has a real implementation:
- 200 path does a real drizzle SELECT of `{id, email}` from `users`
- 401 path returns the D-18 literal when `row === null`
- 503 path handles the "db_unavailable" sentinel from `defaultDeps.userLookupFn`
- Non-sentinel throws rethrow to `app.onError` (Plan 04)

The fact that the unit-env tests hit the 503 branch is correct behavior per D-10-style key-absence gating (no DATABASE_URL in test env), not a stub.

## Threat Flags

None. The handler introduces no new trust boundary surface beyond what plan's `<threat_model>` already covered (T-103-03-01 through T-103-03-07 all map to mitigations in the as-built module):

| Threat ID | Mitigation location |
|-----------|---------------------|
| T-103-03-01 (IDOR via userId in request) | Grep-verified: zero `c.req.param/query/json` calls |
| T-103-03-03 (passwordHash leak) | Drizzle `.select({ id: users.id, email: users.email })` explicitly lists the two allowed columns |
| T-103-03-04 (user-enumeration via 401 variance) | Single literal `"invalid_user"` string for both non-integer-userId and missing-row cases |
| T-103-03-05 (unbounded SELECT) | `.limit(1)` on the drizzle query; existing rate limiter still applies to `/v1/*` |
| T-103-03-06 (mounted without bearerAuth) | Defensive `!Number.isInteger(userId) || userId <= 0` guard returns 401 — safe default when misconfigured |

Plan 04 acceptance criteria must continue to assert that `/v1/me` is NOT added to the `index.ts` exemption list (lines 102-108 stay scoped to register/login/callback).

## User Setup Required

None for this plan. Phase-level user setup (create PostHog Cloud project + paste key into Railway env) is tracked elsewhere; `/v1/me` has no external-service dependency.

## Handoff to Plan 04

**Plan 04 owns:**
1. `import { me } from "./routes/me.js";` at top of `vigil-core/src/index.ts`
2. `app.route("/v1", me);` — ADD this line after the last existing `app.route("/v1", X)` call, BEFORE `app.onError(...)` (per Pitfall 4).
3. **Do NOT** add `/v1/me` to the exemption list at index.ts lines ~102-108 (Pitfall 10). That list stays scoped to `/v1/auth/register`, `/v1/auth/login`, `/v1/auth/callback` only — `/v1/me` MUST go through `bearerAuth`.
4. Live-DB verification: after wiring, a `curl -H "Authorization: Bearer $VK" https://api.vigilhub.io/v1/me` should return HTTP 200 with `{"userId":"1","email":"<seed-user-email>"}` (D-17 vk_ path symmetry); a deleted-user JWT should return HTTP 401 with `{"error":"invalid_user"}` (D-18).

## Next Phase Readiness

- Plan 04 can immediately consume the `me` singleton export with zero blocking work left in Plan 03's scope.
- No blockers introduced for any other downstream wave. Plan 02 (HEIC + sync triage) is disjoint; Plan 01 (PostHog) is already complete.
- Existing `auth.ts`, `index.ts`, and every other file outside `routes/me.ts` are untouched — no surprise merge conflicts.

## Self-Check: PASSED

- File `vigil-core/src/routes/me.ts` exists on disk (85 lines)
- File has exactly 3 `^export ` statements (MeDeps, createMeRouter, me) — `grep -c "^export " vigil-core/src/routes/me.ts` returns 3
- `grep -c "router\.get(\"/me\"" vigil-core/src/routes/me.ts` returns 1 (route registered as GET /me; /v1 prefix added by Plan 04's app.route)
- `grep -c "c\\.get(\"userId\")" vigil-core/src/routes/me.ts` returns 3 (used in guard + hypothetical futures)
- `grep -c "String(row\\.id)" vigil-core/src/routes/me.ts` returns 1 (D-16 userId-as-string)
- `grep -c "\"invalid_user\"" vigil-core/src/routes/me.ts` returns 3 (literal error string)
- `grep -cE "c\\.req\\.(param|query|json)" vigil-core/src/routes/me.ts` returns 0 (IDOR hardening)
- `grep -c "from \"../db/schema.js\"" vigil-core/src/routes/me.ts` returns 1 (correct drizzle ESM import)
- `grep -c "import { eq }" vigil-core/src/routes/me.ts` returns 1 (drizzle equality operator)
- `cd vigil-core && npx tsc --noEmit` exits 0
- `cd vigil-core && npx tsx --test src/routes/me.test.ts` → 3 pass / 0 fail (was 1 fail ERR_MODULE_NOT_FOUND before this plan)
- `git diff vigil-core/src/middleware/auth.ts` → empty (no auth middleware changes)
- `git diff vigil-core/src/index.ts` → empty (Plan 04 handles the mount)
- Commit `b73cc1c` exists in git log (Task 1)

---
*Phase: 103-capture-repair-server-observability-foundations*
*Completed: 2026-04-19*
