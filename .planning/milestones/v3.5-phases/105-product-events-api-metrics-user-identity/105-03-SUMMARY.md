---
phase: 105-product-events-api-metrics-user-identity
plan: 03
subsystem: observability
tags: [posthog, identify, person-properties, me-endpoint, anly-04, tdd]

# Dependency graph
requires:
  - phase: 105-product-events-api-metrics-user-identity
    provides: "identifyUser(userId, properties) wrapper exported from vigil-core/src/analytics/posthog.ts (Plan 105-01)"
  - phase: 103-capture-repair-server-observability-foundations
    provides: "/v1/me handler with MeDeps dep-injection pattern, D-16 {userId,email} response shape, D-18 401 invalid_user on missing row, D-17 bearerAuth → seed user mapping for vk_ clients"
  - phase: 102-multi-user-foundation
    provides: "users.createdAt column on the users table (Drizzle schema, no new migration required)"
provides:
  - "Server-side PostHog person-properties identify: {email, createdAt} on every successful GET /v1/me"
  - "MeDeps.userLookupFn widened to {id, email, createdAt} — additive, production is the only consumer"
  - "MeDeps.identifyFn optional spy hook — injectable for unit tests, defaults to the posthog wrapper"
affects:
  - "PWA App.tsx (Phase 104 D-15): server-side identify now stacks on top of the client-side identifyUser(userId, email) — last-write-wins, same userId, no race"
  - "Mac app + CLI (vk_ path): every /v1/me call refreshes the seed user's PostHog person record via the Phase 103 D-17 mapping — no new code path"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-dep spy injection: MeDeps.identifyFn defaults to the posthog wrapper, tests inject a recording fn — keeps production path untouched while making call-shape assertions trivial"
    - "Defensive try/catch around analytics call sites — analytics failures MUST NEVER break a real response (T-105-20 mitigation)"
    - "ISO-string serialization at the wrapper boundary (row.createdAt.toISOString()) — PostHog person property is a stable string, not a Date, matching Phase 103 response-serialization convention"

key-files:
  created: []
  modified:
    - "vigil-core/src/routes/me.ts"
    - "vigil-core/src/routes/me.test.ts"

key-decisions:
  - "Used optional identifyFn on MeDeps rather than module-level mocking — keeps the spy injection in the same shape as the existing userLookupFn dep (follows createProcessPhotoRouter pattern)"
  - "Imported Hono at the top of me.test.ts via the existing import statement (used require() in the plan draft — replaced with the top-level ESM import already present since Phase 103)"
  - "createdAt serialized with .toISOString() at the call site (not inside the wrapper) — matches PostHog's string-property convention + keeps the wrapper signature unchanged from Plan 01"
  - "Defensive try/catch wraps identify call — Plan 01's wrapper is already null-guarded, but a hypothetical SDK throw must never break the D-16 200 response"
  - "MeDeps.userLookupFn return type widened additively (added createdAt); existing callers (production defaultDeps) updated in-place, no external consumers to migrate"

patterns-established:
  - "Dep-injected analytics spy pattern for route files: extend MeDeps-style interfaces with an optional identifyFn / trackFn field, default to the wrapper, inject a recording function from tests. Reusable for any future /route that emits analytics on a success path."

requirements-completed: [ANLY-04]

# Metrics
duration: 2m 37s
completed: 2026-04-20
---

# Phase 105 Plan 03: /v1/me Server-Side identifyUser Summary

**Every successful GET /v1/me now emits one PostHog identify call with the authenticated user's `{email, createdAt}` person properties; vk_ legacy clients flow through the existing Phase 103 seed-user mapping so Mac/CLI calls refresh the seed user's PostHog record on every request — no new code path, no response-shape regression, no analytics-induced failure mode.**

## Performance

- **Duration:** 2m 37s
- **Started:** 2026-04-20T02:23:59Z
- **Completed:** 2026-04-20T02:26:36Z
- **Tasks:** 1 (TDD — RED + GREEN commits)
- **Files modified:** 2 (`me.ts`, `me.test.ts`)

## Accomplishments

- **MeDeps widened (additively):** `userLookupFn` return type now `{ id: number; email: string; createdAt: Date } | null`. Optional `identifyFn?: typeof identifyUser` added so tests can inject a spy; production default is the Plan 01 wrapper.
- **Default Drizzle select projects createdAt:** `.select({ id: users.id, email: users.email, createdAt: users.createdAt })` — column exists on the users table since Phase 102, no migration needed.
- **Identify call placed inside the success path** (me.ts lines 107-117, between the `if (!row)` 401 guard and the `return c.json(...)` 200 response). Wrapped in defensive try/catch that logs to `console.error` and continues — the D-16 200 response can never be broken by an analytics throw.
- **Property shape is exactly two keys:** `{ email: row.email, createdAt: row.createdAt.toISOString() }`. No PII beyond what's already on the users row (D-09). ISO-string serialization at the call site keeps the wrapper signature byte-identical to Plan 01.
- **Response body shape is UNCHANGED:** `c.json({ userId: String(row.id), email: row.email }, 200)` — `createdAt` travels to PostHog person properties only, never into the API response. D-16 preserved (regression-tested).
- **No identify pollution on error paths:** 401 (missing row / userId guard rejection) and 503 (db unavailable) paths return before reaching the identify call. Three negative tests assert this.
- **vk_ legacy clients covered by existing mapping:** bearerAuth three-path dispatcher (Phase 103 D-17) resolves vk_ → seed user id before `/me` sees the request. The handler treats all authenticated paths identically. Test 5 asserts identify fires with the resolved seed userId.
- **5 new tests added, all 8 me.test.ts tests pass, TypeScript clean.**

## Task Commits

1. **RED — failing tests for identify emission contract:** `9db634f` (`test(105-03): add failing tests for /v1/me identifyUser emission`) — 5 new tests under `describe("GET /v1/me — D-09..D-11 identifyUser emission")`. 2 of 5 failed as expected (identify-call assertions), 3 passed incidentally (negative-path tests passed because the nonexistent identifyFn never fires, and the response-shape test passes unchanged).
2. **GREEN — wire identifyUser in me.ts:** `27526d9` (`feat(105-03): wire posthog identifyUser into /v1/me (ANLY-04)`) — widened MeDeps, added identifyFn default, extended defaultDeps Drizzle select with createdAt, inserted identify call in success path inside a try/catch.

_No REFACTOR commit — the implementation was minimal and type-safe on first pass; no cleanup pass needed._

## Files Modified

- **`vigil-core/src/routes/me.ts`** (+40 / -5):
  - Added `import { identifyUser } from "../analytics/posthog.js";`.
  - Widened `MeDeps.userLookupFn` return type to include `createdAt: Date`.
  - Added optional `identifyFn?: typeof identifyUser` on `MeDeps`.
  - Default Drizzle `.select(...)` projection extended with `createdAt: users.createdAt`.
  - `defaultDeps` declares `identifyFn: identifyUser` so production uses the wrapper.
  - `createMeRouter` now binds `const identify = deps.identifyFn ?? identifyUser;` once at router-build time.
  - Success path calls `identify(row.id, { email: row.email, createdAt: row.createdAt.toISOString() })` inside a try/catch that logs non-fatal failures via `console.error` and continues to the 200 response.
  - Local `row` type widened to match the new MeDeps shape.
- **`vigil-core/src/routes/me.test.ts`** (+110 / -1):
  - Pulled `createMeRouter` into the dynamic-import destructure (was previously `const { me } = ...`).
  - Appended `describe("GET /v1/me — D-09..D-11 identifyUser emission")` with 5 new `it` tests.
  - Added `buildAppWithSpyDeps` helper that mounts `createMeRouter` with an injected `userLookupFn` + recording `identifyFn` and mocks `c.set("userId", ...)` via a fake middleware.

## The 5 New Tests

1. **`calls identifyUser with {email, createdAt} on successful lookup (D-09)`** — Asserts `identifyFn` fires exactly once, receives userId=1, and carries `{email: "user@example.com", createdAt: "2026-01-15T12:00:00.000Z"}`.
2. **`does NOT call identifyUser when row is missing (D-18 401 invalid_user)`** — `lookupResult: null`, status=401, identify-call count=0. Anonymous identify pollution blocked.
3. **`does NOT call identifyUser when userId guard rejects (no row lookup attempted)`** — `userId: null`, status=401, identify-call count=0. Defensive-recheck guard short-circuits before lookup.
4. **`response shape is unchanged (D-16)`** — Asserts `Object.keys(body).sort() === ["email", "userId"]` and `body.createdAt === undefined`. Regression test: createdAt must NEVER leak into the API response.
5. **`vk_ → seed user attribution: identify fires with the resolved seed userId (D-11)`** — Simulates the Phase 103 D-17 mapping outcome (userId=1 = seed user) and asserts identify fires with that resolved userId. Documents that there is NO separate vk_ code path needed in this handler.

## Decisions Made

See frontmatter `key-decisions`. All decisions were pre-locked in 105-CONTEXT.md §D-09..D-11; the plan's action block was followed with one small substitution noted below.

## Deviations from Plan

**Plan draft used `require("hono")` inside the test helper; replaced with the top-level ESM `import { Hono } from "hono"` that was already at line 3 of me.test.ts since Phase 103.** The test file runs under tsx's ESM test runner and `require` is not available in that context. This is a cosmetic/mechanical fix — the plan text's behavioural intent (build a fresh Hono app with injected deps) is preserved exactly.

No other deviations. All 3 edits from the action block (`me.ts` import + MeDeps widening + identifyFn injection, `me.test.ts` destructure update, `me.test.ts` 5-test append) landed as specified. Property shape (`{email, createdAt}`), call site placement (before the 200 c.json), try/catch wrap, response-body preservation, and MeDeps default wiring all match the plan verbatim.

## Verification

**Automated verification (plan's `<verify>` + `<acceptance_criteria>`):**

```
$ cd vigil-core && npx tsx --test src/routes/me.test.ts
▶ GET /v1/me — D-16/D-17/D-18                                     (2 tests) ✔
▶ GET /v1/me with injected db (dep-injection pattern)             (1 test)  ✔
▶ GET /v1/me — D-09..D-11 identifyUser emission                   (5 tests) ✔
ℹ tests 8   ℹ pass 8   ℹ fail 0   ℹ duration_ms 992.05

$ cd vigil-core && npx tsx --test src/analytics/posthog.test.ts
▶ redactEvent — D-12 sensitive-route allowlist                    (4 tests) ✔
▶ trackEvent / captureException — D-10 null-guard                 (5 tests) ✔
▶ BLOCKED_PROPERTY_NAMES — D-04 denylist literal                  (2 tests) ✔
▶ trackEvent — D-01..D-03 property guard (shim path)              (4 tests) ✔
▶ identifyUser — D-09..D-11 wrapper export                        (4 tests) ✔
ℹ tests 19   ℹ pass 19   ℹ fail 0   ℹ duration_ms 384.87

$ cd vigil-core && npx tsc --noEmit
(zero errors; exit 0)
```

**Acceptance-criteria greps (all passing):**

- `grep -c 'import { identifyUser } from "../analytics/posthog.js";' me.ts` = **1** ✔
- `grep -c "identifyFn" me.ts` = **3** (interface field, default wiring, factory-body binding) ✔ (≥3 required)
- `grep -c "createdAt: row.createdAt.toISOString()" me.ts` = **1** ✔ (exactly 1 required)
- `grep -cE "createdAt: Date" me.ts` = **2** (interface return type + local `row` type) ✔ (≥2 required)
- `grep -c "createdAt: users.createdAt" me.ts` = **1** ✔ (≥1 required)
- `grep -c "c.json({ userId: String(row.id), email: row.email }" me.ts` = **1** ✔ — and the line does NOT include `createdAt`
- `grep -cE "identifyUser|identify\b" me.ts` = **11** ✔ (≥4 required)
- Identify call IS wrapped in try/catch: `awk` confirms surrounding `try {` and `} catch (err) {` frames
- Response body shape unchanged — D-16 `{userId: string, email: string}` preserved

**Behavioural assertions (from `<verify>`):**

- Every successful /v1/me triggers one identify call with userId + {email, createdAt} (Test 1).
- vk_ → seed user: identify fires with resolved seed userId (Test 5, covers D-11 without a new code path).
- POSTHOG_API_KEY unset → identify is no-op via Plan 01's null guard — confirmed indirectly (production default `identifyFn = identifyUser`, and all 4 identifyUser wrapper tests in posthog.test.ts already cover the shim path).
- Missing users row → no identify call (Test 2).
- userId guard rejection → no identify call (Test 3).

## Threat Flags

None. All new surface (identify call, MeDeps widening) was pre-enumerated in the plan's `<threat_model>` (T-105-17..T-105-24). No new network endpoints, auth paths, file access, or schema changes were introduced. `createdAt` is the only new field crossing the app→PostHog boundary, and it's explicit per D-09 (accept: T-105-22).

## Issues Encountered

**Plan-draft `require()` → ESM import substitution (cosmetic).** The plan's test helper used CommonJS `require("hono")`; the file is ESM-only under tsx --test. Swapped to the existing top-level `import { Hono } from "hono"` with no behavioural change. Logged above under Deviations for full trace.

**Pre-existing dirty tree items** (`.planning/HANDOFF.json` deletion, `vigil-pwa/src/index.css` modification, `vigil-pwa/.env.local.bak` untracked) were NOT swept into either Plan 105-03 commit. They belong to unrelated user work and will remain in the working tree until the user addresses them separately.

## Known Stubs

None. The only `placeholder` hit in the touched files is the pre-existing Phase 103 scaffold test name `"placeholder — Plan 03 must expose createMeRouter({userLookupFn})"` which is a meaningful test (asserts the `me` export exists) — not a new stub introduced by this plan.

## Next Phase Readiness

- **ANLY-04 closed.** All four Phase 105 ROADMAP success criteria now have working code: SC#1 (capture-funnel events, Plan 02), SC#2 (API metrics middleware, Plan 02), SC#3 (per-route metrics with status/latency/route, Plan 02), SC#4 (user identity via server-side identify, Plan 03). Plan 01's BLOCKED_PROPERTY_NAMES guard backstops SC#4's "no user-generated strings" rule wrapper-wide.
- **PWA identify stacks cleanly.** Phase 104 D-15's client-side `identifyUser(userId, email)` on app mount + sign-in still fires. Server-side identify in Plan 105-03 adds `createdAt` for cohort analysis. Same userId → last-write-wins → no race.
- **Mac/CLI vk_ attribution confirmed** via the existing Phase 103 D-17 seed-user mapping — every Mac app + CLI call that hits `/v1/me` (which is on every client's auth check path) refreshes the seed user's PostHog person record for free.
- **User-side PostHog Cloud verification deferred.** Per the plan's output spec: after Phase 105 ships, the user should verify in PostHog Cloud that the seed user's person record shows `email` + `createdAt` and that userId attribution matches across `api_request`, `thought_created`, `brief_generated` events (cross-validates Plans 01 + 02 + 03). This is a manual dashboard check — not a code gate.
- **No blockers carried forward.** Phase 105 code-side complete.

## Self-Check: PASSED

- `vigil-core/src/routes/me.ts` — FOUND (modified, 128 lines, identify call at lines 107-117)
- `vigil-core/src/routes/me.test.ts` — FOUND (modified, 183 lines, 5 new identify-emission tests at lines 74-183)
- Commit `9db634f` — FOUND (`test(105-03): add failing tests for /v1/me identifyUser emission`)
- Commit `27526d9` — FOUND (`feat(105-03): wire posthog identifyUser into /v1/me (ANLY-04)`)
- All 8 me.test.ts tests passing; all 19 posthog.test.ts tests passing
- TypeScript clean (`npx tsc --noEmit` returns zero errors)
- Response body shape unchanged (D-16 regression test passes)
- No identify pollution on error paths (3 negative tests pass)

---
*Phase: 105-product-events-api-metrics-user-identity*
*Completed: 2026-04-20*
