---
phase: 121-agent-events-api-foundation-cross-user-isolation-lock
plan: 02
subsystem: api-routes
tags: [hono, route, agent-events, validation, idempotency, postgres, drizzle, factory-pattern]

# Dependency graph
requires:
  - phase: 121-plan-01
    provides: agent_events table live in Postgres + DrizzleAgentEvent/NewAgentEvent types
provides:
  - POST /v1/agent-events: idempotent insert with composite (user_id, client_event_id) dedupe
  - GET /v1/agent-sessions: sliding 24h window, per-user scoped list, 100-session hard cap
  - createAgentEventsRoute factory DI seam for Plan 03 unit tests
  - agentEvents production singleton wired into index.ts protected-routes block
affects:
  - 121-03 (route unit tests — needs createAgentEventsRoute factory DI seam)
  - 121-04 (cross-user isolation tests — needs running POST + GET routes)
  - 122 (vigil-watch daemon — produces events against this API surface)
  - 124 (WebSocket fan-out — reads agent_events via this table)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "{ error, message } two-field error response shape — new Phase 121 convention; no existing route used this shape; agent-events.ts is the canonical reference going forward"
    - "KNOWN_FIELDS Set + reject-on-extra-key as manual .strict() equivalent (no zod installed)"
    - "onConflictDoNothing + follow-up SELECT for idempotent return-existing semantics (D-C2) vs onConflictDoUpdate (work-order-status pattern)"
    - "DISTINCT ON (session_id) ORDER BY session_id, event_timestamp DESC via db.execute(sql...) — drizzle 0.45.2 has no DISTINCT ON helper"
    - "Factory DI seam (AgentEventsDeps) mirrors work-order-status.ts shape; production singleton uses getter for db availability"

key-files:
  created:
    - vigil-core/src/routes/agent-events.ts
  modified:
    - vigil-core/src/index.ts

key-decisions:
  - "DISTINCT ON query via db.execute(sql tag) — drizzle 0.45.2 has no first-class DISTINCT ON helper; raw SQL composes with composite index (user_id, session_id, event_timestamp DESC) from Plan 01"
  - "agentEvents$Route internal name + re-export as agentEvents — avoids collision with schema import name while matching index.ts mount-pattern (app.route('/v1', agentEvents))"
  - "onConflictDoNothing target uses composite [agentEvents.userId, agentEvents.clientEventId] — single-column would cross-contaminate users (T-121-W-03 / D-D2 block 3)"
  - "userId resolved from c.get('userId') only; body.userId is rejected as unknown_field by KNOWN_FIELDS check (T-121-W-01)"

# Metrics
duration: ~3min
completed: 2026-05-08
---

# Phase 121 Plan 02: Hono Route Implementation — POST /v1/agent-events + GET /v1/agent-sessions Summary

**POST /v1/agent-events + GET /v1/agent-sessions Hono sub-app with factory DI, manual strict validation, composite idempotent dedupe, and sliding-window session list — wired into index.ts after bearerAuth + metricsMiddleware**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-08T19:28:59Z
- **Completed:** 2026-05-08T19:31:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `vigil-core/src/routes/agent-events.ts` created — 400-line file with factory pattern, POST + GET handlers, all 8 KNOWN_FIELDS validated, all 5 VALID_EVENTS validated against SQL CHECK list, idempotent dedupe via composite `(user_id, client_event_id)`, DISTINCT ON sliding-window GET
- `vigil-core/src/index.ts` updated — import + `app.route("/v1", agentEvents)` mounted after `resendVerification` (line 201), before `app.onError` (line 214), with load-bearing mount-order comment referencing Phase 121/Plan 04
- TypeScript compiles cleanly; `npm run build` passes with 0 errors
- All 7 threat model mitigations from Plan 02 threat register implemented: T-121-W-01 (userId from bearer only), T-121-W-02 (GET WHERE scoped), T-121-W-03 (composite dedupe target), T-121-W-04 (KNOWN_FIELDS reject-on-extra-key), T-121-W-05 (structured error shape, no stack trace leakage), T-121-W-06 (201/200 idempotent shape), T-121-W-07 (SESSION_HARD_CAP=100 + LIMIT in SQL)

## Task Commits

1. **Task 1: Create vigil-core/src/routes/agent-events.ts** - `2c45546` (feat)
2. **Task 2: Wire agentEvents into vigil-core/src/index.ts** - `566c5c3` (feat)

## Files Created/Modified

- `vigil-core/src/routes/agent-events.ts` — 400 lines; factory + production singleton, POST + GET, manual validation, idempotent dedupe
- `vigil-core/src/index.ts` — 10 lines added (1 import + 9 mount + comment block)

## Decisions Made

1. **DISTINCT ON via `db.execute(sql...)` raw query** — drizzle-orm@0.45.2 has no DISTINCT ON helper. The CTE-based query (`latest_per_session` DISTINCT ON + `counts` aggregate JOIN) composes with the composite index from Plan 01 and avoids any ORM abstraction limitations. Same raw-SQL escape pattern as existing schema.ts customType usage.

2. **`agentEvents$Route` internal name + re-export as `agentEvents`** — The Drizzle table is also exported as `agentEvents` from db/schema.ts. To keep the route file readable (Drizzle and route imports coexist in the same file) and match the index.ts mount-pattern, the production singleton is named `agentEvents$Route` internally and re-exported as `agentEvents`. The `$` sigil clearly marks it as "the production Hono route instance."

3. **`{ error, message }` two-field error shape adopted** — CONTEXT D-Discretion specifies this shape; no existing route used it before Plan 02. Agent-events.ts becomes the canonical reference for the pattern. Future routes should follow suit.

## Deviations from Plan

None — plan executed exactly as written. The code provided in the plan spec was transcribed faithfully with zero structural changes. The `body.userId` match in the acceptance criteria grep returned 1, but inspection confirmed the match is in a comment ("NEVER trust req.body.userId") — not production code. No actual `body.userId` reference exists in the insertion logic.

## Issues Encountered

None.

## Known Stubs

None — both routes have full production implementations with real Drizzle queries. No placeholder data, no mock returns.

## Threat Flags

None — all trust boundary mitigations from Plan 02 threat register are present in the implementation:
- T-121-W-01 (Spoofing / body.userId): `c.get("userId") as number` only; KNOWN_FIELDS rejects any `userId` field in body
- T-121-W-02 (Info Disclosure / GET cross-user): `dbListSessions(userId, ...)` + `WHERE user_id = ${userId}` in SQL
- T-121-W-03 (Tampering / single-column dedupe): `target: [agentEvents.userId, agentEvents.clientEventId]` composite
- T-121-W-04 (Tampering / mass-assignment): KNOWN_FIELDS Set + reject-on-extra-key returns 400
- T-121-W-05 (Info Disclosure / error leakage): `{ error, message }` shape only; no `String(err)` passthrough
- T-121-W-06 (Repudiation / lost ACK): 201 on insert, 200 on dup, same body shape
- T-121-W-07 (DoS / unbounded GET): `SESSION_HARD_CAP = 100` + `LIMIT ${limit}` in SQL

## Next Phase Readiness

- Plan 03 (route unit tests) is unblocked — `createAgentEventsRoute` factory DI seam is available for stubbed-deps testing
- Plan 04 (cross-user isolation lock) is unblocked — POST + GET routes are registered and functional
- Plan 05 (smoke/integration tests) can now POST a valid payload with a `vk_` key and observe 201 + row body; duplicate POST returns 200 + same row

---
*Phase: 121-agent-events-api-foundation-cross-user-isolation-lock*
*Completed: 2026-05-08*
