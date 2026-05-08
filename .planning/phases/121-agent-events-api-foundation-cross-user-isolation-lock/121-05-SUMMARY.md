---
phase: 121-agent-events-api-foundation-cross-user-isolation-lock
plan: 05
subsystem: testing
tags: [verification, smoke-test, build, traceability, agent-events, postgres, partial-index]

# Dependency graph
requires:
  - phase: 121-plan-03
    provides: agent-events.test.ts (24 route-level tests) — verified passing here
  - phase: 121-plan-04
    provides: 3 D-D2 isolation lock blocks in cross-user-isolation.test.ts — verified passing here
  - phase: 121-plan-02
    provides: agent-events.ts route (POST + GET) + production singleton — bug fixed here
  - phase: 121-plan-01
    provides: 0018_add_agent_events.sql with partial unique index (user_id, client_event_id)
provides:
  - Phase 121 full verification: tsc clean, build clean, 24 route tests + 15 isolation tests all pass
  - Live smoke test confirmation: spec's example payload roundtrips with 201/200/200 status sequence
  - AGENT-API-01 + AGENT-API-02 traceability filled in REQUIREMENTS.md
  - ROADMAP.md Phase 121 marked 5/5 Complete 2026-05-08
affects:
  - 122 (vigil-watch — first real producer; confirms endpoint is live and correct before daemon builds)
  - 124 (WebSocket fan-out — reads agent_events; confirmed schema + isolation is correct)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TS 5.9 strict narrowing workaround: use explicit type cast (x as T) after assert.ok() on closure-assigned variables — non-null assertion (x!) produces 'never' when assert.ok() assertion signature intersects"
    - "Partial unique index + Drizzle onConflictDoNothing: must include WHERE predicate (sql`col IS NOT NULL`) to match partial index — PostgreSQL 42P10 otherwise"

key-files:
  created:
    - .planning/phases/121-agent-events-api-foundation-cross-user-isolation-lock/121-05-SUMMARY.md
  modified:
    - vigil-core/src/routes/agent-events.test.ts
    - vigil-core/src/routes/agent-events.ts
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "TS narrowing fix via explicit cast rather than null-coalescing — preserves original assertion intent while satisfying TS 5.9 strict control-flow narrowing; no runtime behavior change"
  - "onConflictDoNothing WHERE predicate is a real runtime requirement, not a style choice — PostgreSQL requires the WHERE clause to match a partial unique index in the ON CONFLICT target"
  - "Smoke test key generated fresh per run, deleted after — vk_5b048f prefix only; full key never committed or logged"

requirements-completed: [AGENT-API-01, AGENT-API-02]

# Metrics
duration: ~25min
completed: 2026-05-08
---

# Phase 121 Plan 05: Verification Gate Summary

**Phase 121 fully verified: tsc clean, 24 route tests + 15 isolation tests all pass, spec payload roundtrips 201/200/200 on live dev server, plus two pre-existing bugs found and fixed (TS 5.9 narrowing + Postgres partial-index ON CONFLICT mismatch)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-08T19:50:00Z
- **Completed:** 2026-05-08T20:10:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `npx tsc --noEmit` exits 0 — no TypeScript diagnostics
- `npm run build` exits 0 — both main and scripts tsconfig compile clean
- 24 route-level tests pass (agent-events.test.ts): 16 POST + 6 GET + 2 drift detectors
- 15 isolation tests pass (cross-user-isolation.test.ts): 12 existing + 3 new D-D2 blocks
- All 3 D-D2 blocks verified with `✔` prefix: D-D2.1, D-D2.2, D-D2.3
- Live smoke test: POST 201 on first, POST 200 on duplicate, GET 200 with correct data shape
- Smoke row deleted, dev server torn down, port 3001 freed
- REQUIREMENTS.md traceability filled: AGENT-API-01 (121-01..05), AGENT-API-02 (121-02..05)
- ROADMAP.md Phase 121 marked 5/5 Complete 2026-05-08

## Task Commits

1. **Task 1: Run route tests + integration tests + build, capture outputs** — `2fbe16d` (fix)
   - Pre-existing TS errors in agent-events.test.ts resolved (Rule 1 deviation)
   - Production bug in agent-events.ts resolved (Rule 1 deviation)

2. **Task 2: Live smoke test** — no separate commit (verification-only; no file changes)

3. **Task 3: Update REQUIREMENTS.md + ROADMAP.md** — `8448ec7` (docs)

## Verification Transcript

### Step 1: TypeScript check
```
npx tsc --noEmit
tsc exit: 0
```

### Step 2: Build
```
> vigil-core@0.2.0 build
> tsc && tsc -p tsconfig.scripts.json

build exit: 0
```

### Step 3: Route tests (24 tests)
```
✔ AGENT-API-01/T1..T16 (all POST branches)
✔ AGENT-API-02/T1..T6 (all GET branches)
✔ DRIFT/T1: agent-events.ts source declares the 5 VALID_EVENTS values verbatim
✔ DRIFT/T2: 0018_add_agent_events.sql CHECK constraint declares the 5 values verbatim

ℹ tests 24 | pass 24 | fail 0 | skip 0
route-tests exit: 0
```

### Step 4: Integration tests (15 tests including 3 D-D2 blocks)
```
✔ GET /v1/thoughts returns only caller's rows
✔ GET /v1/thoughts/:id — 404 for other user's id
✔ GET /v1/summary uses only caller's thoughts
✔ GET /v1/projects returns only caller's projects
✔ POST /v1/thoughts/bulk/delete with userB's ids deletes 0 rows
✔ POST /v1/links — cross-user link rejected
✔ seed user's existing vk_ key still returns seed-user data
✔ chat-sessions isolation
✔ brief-history isolation
✔ brief PDF isolation (W-02)
✔ work-orders isolation
✔ insights cache isolation
✔ POST /v1/agent-events: userA's POST cannot insert with userB's userId (D-D2.1)
✔ GET /v1/agent-sessions: userA's GET never returns userB's sessions (D-D2.2)
✔ Dedupe scope: userA's client_event_id collision with userB's UUID is allowed (D-D2.3)
✔ cross-user isolation (AUTH-05)

iso-tests exit: 0 (all tests passed; process held open by scheduler setInterval loops — known issue per STATE.md)
```

### Step 5: D-D2 block confirmation
```
  ✔ POST /v1/agent-events: userA's POST cannot insert with userB's userId (D-D2.1)
  ✔ GET /v1/agent-sessions: userA's GET never returns userB's sessions (D-D2.2)
  ✔ Dedupe scope: userA's client_event_id collision with userB's UUID is allowed (D-D2.3)
```

### Step 6: Live smoke test
```
Key prefix: vk_5b048... (generated fresh, deleted after)

POST /v1/agent-events (first):
{"id":14,"userId":1,"sessionId":"claude-smoke-test","event":"needs_input",
 "message":"Claude wants to run: rm -rf node_modules","label":"vigil-vscode-extension",
 "host":"Jamesons-iMac.local","exitCode":null,"eventTimestamp":"2026-05-08T18:34:12.000Z",
 "receivedAt":"2026-05-08T20:05:04.705Z","clientEventId":"smoke-1778270704-30454"}
HTTP_STATUS=201

POST /v1/agent-events (idempotent dup, same CID):
{"id":14,"userId":1, ...same body...}
HTTP_STATUS=200

GET /v1/agent-sessions:
{"data":[{"sessionId":"claude-smoke-test","label":"vigil-vscode-extension",
  "host":"Jamesons-iMac.local","lastEvent":{"event":"needs_input",
  "message":"Claude wants to run: rm -rf node_modules",
  "eventTimestamp":"2026-05-08T18:34:12.000Z"},"eventCount":1}]}
HTTP_STATUS=200

Cleanup: DELETE FROM agent_events WHERE client_event_id = 'smoke-1778270704-30454' → 1 row deleted
Post-cleanup count: SELECT COUNT(*) FROM agent_events WHERE client_event_id LIKE 'smoke-%' → 0
Port 3001: free
```

## Files Created/Modified

- `vigil-core/src/routes/agent-events.test.ts` — TS narrowing fix: replace `captured!.userId` with `(captured as NewAgentEvent).userId`; add `const cs = capturedSince as Date | null` before instanceof check
- `vigil-core/src/routes/agent-events.ts` — Add `where: sql\`${agentEvents.clientEventId} IS NOT NULL\`` to onConflictDoNothing target for partial index compatibility
- `.planning/REQUIREMENTS.md` — AGENT-API-01 and AGENT-API-02 traceability filled
- `.planning/ROADMAP.md` — Phase 121 plan list complete, progress 5/5, status Complete

## Decisions Made

1. **Explicit cast over non-null assertion for narrowing fix** — `(captured as NewAgentEvent)` is more explicit than `captured!` and is the correct approach when TypeScript's assertion narrowing from `assert.ok()` produces `never` for closure-assigned variables. No runtime difference.

2. **Smoke key generated fresh and deleted** — Rather than reusing a long-lived key, a new vk_ key was generated specifically for the smoke run and deleted afterward alongside the smoke row. This keeps the key surface minimal. Per T-121-V-01, only the 8-char prefix appears in logs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript narrowing errors in agent-events.test.ts (lines 128, 353)**
- **Found during:** Task 1 (tsc --noEmit step)
- **Issue:** Plan 04 flagged pre-existing TS errors from Plan 03 commit `5e31598`. TypeScript 5.9 strict control-flow narrowing infers `never` for variables assigned inside async closures when `assert.ok()` assertion signatures intersect. `captured!.userId` → error TS2339 on `never`. `capturedSince instanceof Date` → error TS2358 on `never`.
- **Fix:** Replaced `captured!.xxx` with `const cap = captured as NewAgentEvent; cap.xxx`. Added `const cs = capturedSince as Date | null;` before the instanceof check, changed `capturedSince!.toISOString()` to `cs.toISOString()`.
- **Files modified:** `vigil-core/src/routes/agent-events.test.ts`
- **Verification:** `npx tsc --noEmit` exits 0; all 24 tests still pass; test semantics unchanged
- **Committed in:** `2fbe16d`

**2. [Rule 1 - Bug] Fixed partial-index ON CONFLICT mismatch in agent-events.ts (production singleton)**
- **Found during:** Task 1 (integration tests D-D2.1 and D-D2.3 both failing with DrizzleQueryError: PostgreSQL error 42P10)
- **Issue:** `onConflictDoNothing({ target: [agentEvents.userId, agentEvents.clientEventId] })` without a `where` clause fails when the unique index is partial (`WHERE client_event_id IS NOT NULL`). PostgreSQL requires the WHERE predicate to be included in the ON CONFLICT target specification.
- **Fix:** Added `where: sql\`${agentEvents.clientEventId} IS NOT NULL\`` to the onConflictDoNothing config, matching the partial index predicate exactly.
- **Files modified:** `vigil-core/src/routes/agent-events.ts`
- **Verification:** All 3 D-D2 blocks now pass; idempotency smoke test (POST→200 on dup) also confirmed live
- **Committed in:** `2fbe16d`

---

**Total deviations:** 2 auto-fixed (Rule 1 — both real runtime bugs)
**Impact on plan:** Both fixes were required for the verification gate to pass. The TS fix unblocks `tsc --noEmit` (build gate). The partial-index fix unblocks D-D2.1 and D-D2.3 integration tests AND the live idempotency path — without it, any duplicate POST to the production singleton would crash with a 500 instead of returning 200.

## ROADMAP Success Criteria Verification

All 4 Phase 121 success criteria from ROADMAP §Phase 121 verified:

1. **POST persists with user_id from bearer (never body)** — D-D2.1 integration test passed: hostile `body.userId` is rejected as `unknown_field`; clean POST returns row with `userId` from bearer. Live smoke test confirmed `userId:1` (seed user) in response.

2. **GET returns only caller's sessions** — D-D2.2 integration test passed: direct DB insert of userB's session; userA's GET response contains zero of userB's rows.

3. **Cross-user isolation test exists in canonical file** — `vigil-core/src/integration/cross-user-isolation.test.ts` has 3 D-D2 blocks at lines ~438-661; all 3 pass.

4. **Spec's example payload roundtrips on local dev** — Live smoke test: `POST` with `session_id`, `event`, `message`, `timestamp`, `label`, `host`, `client_event_id` returned 201 with full row body including `eventTimestamp:"2026-05-08T18:34:12.000Z"` (ISO-8601 parsed verbatim).

## Known Stubs

None — this plan makes no new data-flow connections or UI changes.

## Threat Flags

None — verification-only plan with no new endpoints, auth paths, or schema changes introduced.

## Self-Check

Files created/modified:
- `vigil-core/src/routes/agent-events.test.ts` — FOUND
- `vigil-core/src/routes/agent-events.ts` — FOUND
- `.planning/REQUIREMENTS.md` — FOUND
- `.planning/ROADMAP.md` — FOUND
- `.planning/phases/121-agent-events-api-foundation-cross-user-isolation-lock/121-05-SUMMARY.md` — FOUND

Commits:
- `2fbe16d` — FOUND
- `8448ec7` — FOUND

Test results confirmed:
- `npx tsc --noEmit` exits 0 — VERIFIED
- `npm run build` exits 0 — VERIFIED
- Route tests: 24 pass, 0 fail — VERIFIED
- Isolation tests: 15 pass (including 3 D-D2), 0 fail — VERIFIED
- Smoke POST 201 — VERIFIED (`grep -c "HTTP_STATUS=201" /tmp/121-05-smoke-post1.log` = 1)
- Smoke dup POST 200 — VERIFIED (`grep -c "HTTP_STATUS=200" /tmp/121-05-smoke-post2.log` = 1)
- Smoke GET 200 + claude-smoke-test — VERIFIED
- Smoke row deleted — VERIFIED (COUNT = 0)
- Port 3001 freed — VERIFIED

## Self-Check: PASSED

---
*Phase: 121-agent-events-api-foundation-cross-user-isolation-lock*
*Completed: 2026-05-08*
