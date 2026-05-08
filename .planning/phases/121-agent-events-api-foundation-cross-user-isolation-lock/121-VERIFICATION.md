---
phase: 121-agent-events-api-foundation-cross-user-isolation-lock
verified: 2026-05-08T21:00:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Phase 121: Agent-events API Foundation + Cross-User Isolation Lock Verification Report

**Phase Goal:** POST /v1/agent-events + GET /v1/agent-sessions with W-01/W-02-style isolation test
**Verified:** 2026-05-08T21:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /v1/agent-events persists with user_id from bearer token, never from request body | VERIFIED | `agent-events.ts:91` uses `c.get("userId") as number`; KNOWN_FIELDS rejects any `userId` body key (line 114-123); D-D2.1 lock block pins this at integration tier |
| 2 | GET /v1/agent-sessions returns only caller's sessions; userB's sessions never appear in userA's response | VERIFIED | `dbListSessions(userId, ...)` takes userId as required param; raw SQL `WHERE user_id = ${userId}` (line 354); D-D2.2 lock block verifies at integration tier |
| 3 | Cross-user isolation test in canonical `cross-user-isolation.test.ts` locks structural guarantee | VERIFIED | 3 D-D2 it() blocks at lines 499, 587, 651 inside `describe("cross-user isolation (AUTH-05)")` wrapper; all 3 pass per verification transcript |
| 4 | Spec's example payload roundtrips on local dev with all fields preserved verbatim and timestamp parsed as ISO-8601 | VERIFIED | Plan 05 live smoke: first POST returned HTTP 201 with `eventTimestamp:"2026-05-08T18:34:12.000Z"` (verbatim from payload `"2026-05-08T18:34:12Z"`); second POST same CID returned HTTP 200 same row |
| 5 | agent_events table exists with 11 columns, CHECK constraint, composite index, per-user index, and partial unique index | VERIFIED | `schema.ts` defines all 11 columns; `0018_add_agent_events.sql` has CHECK (`'needs_input','task_complete','task_failed','milestone','heartbeat'`), `idx_agent_events_user_session_ts` with DESC, `idx_agent_events_user_id`, `uq_agent_events_user_client_event_id` WHERE `client_event_id IS NOT NULL`; BLOCKING migration gate confirmed applied |
| 6 | Route tests pass (24 cases, 0 failures) covering all POST/GET branches, idempotency, mass-assignment defense, and 2 drift detectors | VERIFIED | `agent-events.test.ts` exists (475 lines); 20 grep hits for `createAgentEventsRoute`/`VALID_EVENTS`/`DrizzleAgentEvent`; 20 grep hits for test names (AGENT-API-01/T, AGENT-API-02/T, DRIFT/T); Plan 05 transcript: `tests 24 | pass 24 | fail 0 | skip 0` |
| 7 | REQUIREMENTS.md traceability filled: AGENT-API-01 and AGENT-API-02 list satisfying plan IDs | VERIFIED | `REQUIREMENTS.md:85` row `AGENT-API-01 | Phase 121 | 121-01, 121-02, 121-03, 121-04, 121-05`; `REQUIREMENTS.md:86` row `AGENT-API-02 | Phase 121 | 121-02, 121-03, 121-04, 121-05` |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/routes/agent-events.ts` | POST + GET Hono sub-app with factory DI seam | VERIFIED | 405 lines; exports `createAgentEventsRoute`, `VALID_EVENTS`, `AgentEventType`, `AgentEventsDeps`, `AgentSessionRow`, production singleton as `agentEvents`; not a stub |
| `vigil-core/src/routes/agent-events.test.ts` | Pure-unit test suite (24 tests + 2 drift detectors) | VERIFIED | 475 lines; 16 POST tests (T1-T16), 6 GET tests (T1-T6), 2 drift detectors (DRIFT/T1-T2); uses factory DI, no live DB |
| `vigil-core/src/integration/cross-user-isolation.test.ts` | 3 new D-D2 it() blocks inside existing describe() | VERIFIED | 715 total lines; blocks at lines 499, 587, 651; all inside `describe("cross-user isolation (AUTH-05)")` wrapper (opened line 66, closed line 715); finally-cleanup by clientEventId confirmed |
| `vigil-core/src/db/schema.ts` | agentEvents pgTable with 11 columns + 2 indexes | VERIFIED | agentEvents table present with all 11 columns, `onDelete: "restrict"`, 2 in-Drizzle indexes; comment block references Phase 121/AGENT-API-01/D-A1-D-D2 |
| `vigil-core/drizzle/0018_add_agent_events.sql` | DDL with CHECK + composite DESC index + partial unique index | VERIFIED | Has `CHECK ("event" IN ('needs_input','task_complete','task_failed','milestone','heartbeat'))`, `idx_agent_events_user_session_ts` with `event_timestamp DESC`, `idx_agent_events_user_id`, `uq_agent_events_user_client_event_id` with `WHERE "client_event_id" IS NOT NULL`; all statements use `IF NOT EXISTS` |
| `vigil-core/src/db/types.ts` | DrizzleAgentEvent + NewAgentEvent inferred types | VERIFIED | Line 3 imports `agentEvents` from `./schema.js`; lines 24-25 export `DrizzleAgentEvent` and `NewAgentEvent` via `$inferSelect`/`$inferInsert` |
| `vigil-core/src/index.ts` | agentEvents route registered after bearerAuth + metricsMiddleware, before onError | VERIFIED | Import at line 43; `app.route("/v1", agentEvents)` at line 210; `app.onError` at line 214 (after); bearerAuth established at line 144; metricsMiddleware at line 158 (all before 210) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `agent-events.ts` | `agent_events` table | Drizzle insert + select | VERIFIED | `db.insert(agentEvents).values(row).onConflictDoNothing({target:[agentEvents.userId, agentEvents.clientEventId], where: sql\`...\`})` + `db.select().from(agentEvents).where(...)` |
| `agent-events.ts` | partial unique index | `onConflictDoNothing` where predicate | VERIFIED | Bug fixed in Plan 05: `where: sql\`${agentEvents.clientEventId} IS NOT NULL\`` added — matches partial index predicate, prevents Postgres 42P10 error |
| `index.ts` | `agent-events.ts` | import + app.route mount | VERIFIED | `import { agentEvents } from "./routes/agent-events.js"` at line 43; `app.route("/v1", agentEvents)` at line 210 |
| `agent-events.test.ts` | `agent-events.ts` | `import { createAgentEventsRoute, VALID_EVENTS }` | VERIFIED | Dynamic import at line 14; factory used in every test via `makeApp()` |
| `agent-events.test.ts` | `0018_add_agent_events.sql` | fs.readFileSync + regex (drift detector) | VERIFIED | DRIFT/T2 reads migration via path.join(here, "..", "..", "drizzle", "0018_add_agent_events.sql") and asserts CHECK constraint + partial unique index predicate verbatim |
| `cross-user-isolation.test.ts` | POST /v1/agent-events route | in-process app.fetch via src/index.ts | VERIFIED | Blocks use existing `post()` helper targeting `/v1/agent-events`; lazy import of `agentEvents` table for DB cross-checks |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| POST handler in `agent-events.ts` | `row` returned to client | `deps.dbInsertOrGet(newRow)` — production: `db.insert(agentEvents).values(row).returning()` | Yes — drizzle insert + RETURNING | FLOWING |
| GET handler in `agent-events.ts` | `sessions` array in response | `deps.dbListSessions(userId, sinceIso, SESSION_HARD_CAP)` — production: `db.execute(sql\`WITH latest_per_session...\`)` | Yes — Postgres DISTINCT ON CTE with real WHERE and LIMIT | FLOWING |

### Behavioral Spot-Checks

| Behavior | Evidence | Status |
|----------|----------|--------|
| POST 201 on first insert | Plan 05 smoke transcript: `HTTP_STATUS=201`, row body with `id:14`, all fields preserved | PASS |
| POST 200 on duplicate client_event_id | Plan 05 smoke transcript: `HTTP_STATUS=200`, same `id:14` returned | PASS |
| GET 200 with correct session shape | Plan 05 smoke transcript: `HTTP_STATUS=200`, `data[0].sessionId:"claude-smoke-test"`, `lastEvent.eventTimestamp:"2026-05-08T18:34:12.000Z"` | PASS |
| All 24 route tests pass | Plan 05 transcript: `tests 24 | pass 24 | fail 0 | skip 0` | PASS |
| All 3 D-D2 isolation blocks pass | Plan 05 transcript: D-D2.1, D-D2.2, D-D2.3 each shown with `checkmark` prefix | PASS |
| TypeScript compiles clean | Plan 05 transcript: `tsc exit: 0`; Plan 05 fixed pre-existing TS narrowing errors from Plan 03 | PASS |
| Build passes | Plan 05 transcript: `build exit: 0` | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| AGENT-API-01 | 121-01, 121-02, 121-03, 121-04, 121-05 | POST /v1/agent-events persists scoped per userId; cross-user isolation | SATISFIED | Schema (Plan 01), route (Plan 02), route tests (Plan 03), isolation lock (Plan 04), smoke verified (Plan 05) |
| AGENT-API-02 | 121-02, 121-03, 121-04, 121-05 | GET /v1/agent-sessions returns caller's sessions filtered by userId | SATISFIED | Route (Plan 02), GET test suite (Plan 03), D-D2.2 isolation lock (Plan 04), smoke verified (Plan 05) |

No orphaned requirements — REQUIREMENTS.md maps AGENT-API-01 and AGENT-API-02 to Phase 121 and both are satisfied. AGENT-API-03 maps to Phase 124 (deferred — not in scope for Phase 121).

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `agent-events.ts:209-212` | Redundant `Number.isFinite` check (isInteger implies isFinite) | Info | Harmless; identified in 121-REVIEW.md as IN-01 |
| `agent-events.ts:4,404` | `agentEvents` identifier reused for both Drizzle table (import) and Hono router (re-export) | Info | Brittle for maintainers; identified in 121-REVIEW.md as IN-02; non-blocking |
| `schema.ts:411-415` | Composite index declared without DESC in Drizzle schema while migration SQL has DESC; snapshot drift | Warning | Will cause spurious `drizzle-kit generate` reorder on next run; identified in 121-REVIEW.md as WR-01; not a runtime bug today |
| `agent-events.ts:126-203` | No length caps on user-controlled text fields (session_id, label, host, client_event_id, message) | Warning | Robustness gap; identified in 121-REVIEW.md as WR-02; single-user on-prem mitigates risk |
| `agent-events.ts:254-270` | GET `?since` accepts arbitrary past/future dates with no sanity bounds | Warning | Unbounded scan risk on large datasets; identified in 121-REVIEW.md as WR-03 |
| `agent-events.test.ts:416-428` | DRIFT/T1 per-value regex matches anywhere in file, not specifically inside VALID_EVENTS block | Warning | Drift detector weaker than advertised; identified in 121-REVIEW.md as WR-04; narrow block check at lines 430-446 IS sound |

All anti-patterns above were identified in the existing 121-REVIEW.md (0 critical, 4 warnings, 5 info). None constitute blockers. The REVIEW pre-dates this VERIFICATION and the code-review verdict was non-blocking.

Stub check: No stubs found. Both POST and GET handlers contain full production Drizzle implementations. The factory DI pattern enables testing without live DB — this is correct architecture, not a stub.

Mass-assignment check: `body.userId` or `body["userId"]` reference in production insertion logic: 0 matches (the only match is a comment string "NEVER trust req.body.userId"). KNOWN_FIELDS check at line 114 rejects any unlisted field before insertion logic is reached.

### Human Verification Required

None. All success criteria are mechanically verifiable: endpoint behavior verified by Plan 05 live smoke test transcript, test pass counts verified in transcript, artifact existence and content verified by direct file inspection. No visual, real-time, or external service behavior requires human judgment in this phase.

### Gaps Summary

No gaps. All 7 must-have truths are verified. Both required artifacts and all key links are substantive and wired. Data flows through to real Postgres queries. Tests pass per transcript evidence. Requirements AGENT-API-01 and AGENT-API-02 are fully satisfied.

Four code-review warnings (WR-01 through WR-04) exist but are non-blocking, scoped to future regressions or maintenance concerns, and pre-dated this verification in the 121-REVIEW.md. They do not block phase completion but are recommended for a future cleanup plan.

Key note: Plan 05 surfaced and fixed two real bugs during the verification gate:

1. TypeScript 5.9 strict narrowing errors in `agent-events.test.ts` (closure-assigned variables inferred as `never` after `assert.ok()`) — fixed with explicit type cast.
2. Postgres 42P10 partial-index ON CONFLICT predicate mismatch in `agent-events.ts` production singleton — `onConflictDoNothing` must include `where: sql\`${agentEvents.clientEventId} IS NOT NULL\`` to match the partial unique index. Without this fix, any duplicate POST in production would crash with a 500 rather than returning the idempotent 200. Fixed in commit `2fbe16d`.

Both bugs were found and fixed within the same phase. The final codebase state (post-fix) is what this verification reflects.

---

_Verified: 2026-05-08T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
