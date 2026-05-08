---
phase: 121-agent-events-api-foundation-cross-user-isolation-lock
plan: 01
subsystem: database
tags: [drizzle, postgres, migration, schema, agent-events, partial-index]

# Dependency graph
requires:
  - phase: 120-day-1-jsonl-schema-verification-detection-strategy-lock
    provides: spec-correct-and-proceed verdict locking the 5 event types and 7-field payload contract
provides:
  - agent_events Postgres table with 11 columns, CHECK constraint, 2 regular indexes, 1 partial unique index
  - DrizzleAgentEvent + NewAgentEvent TypeScript inferred types exported from db/types.ts
  - 0018_add_agent_events.sql migration applied to local DB (BLOCKING gate unblocked)
affects:
  - 121-02 (POST /v1/agent-events route — needs live table + types)
  - 121-03 (GET /v1/agent-sessions route — needs live table + composite index)
  - 121-04 (cross-user isolation tests — needs live table + partial unique index)
  - 122 (vigil-watch daemon — produces events into this table)
  - 124 (WebSocket fan-out — reads from this table)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial unique index WHERE clause enforced in SQL only (drizzle-orm@0.45.2 limitation) — same pattern as 0016 CHECK constraint"
    - "Two-timestamp design: event_timestamp (daemon source-of-truth) + received_at (DB insert clock) for forensic observability"
    - "Composite partial unique (user_id, client_event_id) WHERE client_event_id IS NOT NULL — composite scope is load-bearing for cross-user isolation (D-D2 block 3)"

key-files:
  created:
    - vigil-core/drizzle/0018_add_agent_events.sql
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/db/types.ts
    - vigil-core/drizzle/meta/_journal.json
    - vigil-core/drizzle/meta/0018_snapshot.json

key-decisions:
  - "Drizzle-kit auto-generated SQL replaced entirely with hand-crafted SQL — auto-generated included previously applied migrations (0016 + 0017) from a full-schema diff rather than incremental diff"
  - "ON DELETE RESTRICT (not CASCADE) on user_id FK — events are append-only audit trail, matching thoughts/projects/work_orders pattern"
  - "IF NOT EXISTS guards on all DDL statements for idempotent re-run safety"
  - "partial unique index composite scope (user_id, client_event_id) vs single-column — load-bearing for cross-user dedup isolation (D-D2 block 3)"

patterns-established:
  - "SQL-only CHECK constraint with comment calling it out (drizzle-orm@0.45.2 limitation) — see passwordResetTokens analog"
  - "SQL-only partial unique index — new pattern, no existing migration used it; documented in migration header for future phases"
  - "Migration rename from auto-slug to descriptive name + journal update — standard convention per 0008/0009/0010"

requirements-completed: [AGENT-API-01]

# Metrics
duration: 4min
completed: 2026-05-08
---

# Phase 121 Plan 01: Schema Push — agent_events Table Summary

**Postgres agent_events table materialized with 11-column schema, CHECK on event (5 values), composite partial unique index for cross-user-safe idempotency, and Drizzle-inferred types — local DB migration gate unblocked for Plans 02/03/04**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-08T19:22:44Z
- **Completed:** 2026-05-08T19:26:00Z
- **Tasks:** 4 (including 1 BLOCKING DB gate)
- **Files modified:** 4

## Accomplishments

- `agentEvents` Drizzle table appended to schema.ts with all 11 columns, 2 indexes, load-bearing comment block referencing Phase 121/AGENT-API-01/D-A1-A4/D-C1/D-D2 block 3
- `DrizzleAgentEvent` + `NewAgentEvent` exported from db/types.ts (inferred, no hand-written DTOs per D-Discretion)
- `0018_add_agent_events.sql` hand-crafted with CHECK constraint + partial unique index `WHERE client_event_id IS NOT NULL` + DESC modifier on composite index — all features drizzle-kit cannot auto-emit
- Local Postgres has live `agent_events` table; CHECK constraint verified active; partial unique index verified with `pg_get_indexdef` showing `WHERE (client_event_id IS NOT NULL)`
- `npm run db:migrate` idempotent — second run is a no-op (IF NOT EXISTS guards throughout)

## Task Commits

1. **Task 1: Add agentEvents table to schema.ts** - `a3089a9` (feat)
2. **Task 2: DrizzleAgentEvent + NewAgentEvent types** - `9b387c7` (feat)
3. **Task 3: Generate + hand-edit 0018 migration SQL** - `4a9439e` (feat)
4. **Task 4: Apply migration (BLOCKING gate)** - no separate commit (DB-only operation)

## Files Created/Modified

- `vigil-core/src/db/schema.ts` - agentEvents pgTable appended after passwordResetTokens (47 lines added)
- `vigil-core/src/db/types.ts` - DrizzleAgentEvent + NewAgentEvent type exports added
- `vigil-core/drizzle/0018_add_agent_events.sql` - Hand-crafted migration SQL with CHECK, DESC composite index, partial unique index
- `vigil-core/drizzle/meta/_journal.json` - Updated tag from auto-slug to `0018_add_agent_events`
- `vigil-core/drizzle/meta/0018_snapshot.json` - Drizzle snapshot (auto-generated, committed as-is)

## Decisions Made

1. **Drizzle-kit auto-SQL replaced entirely** — The auto-generated `0018_spooky_retro_girl.sql` included previously applied 0016 + 0017 migrations from a full-schema re-diff (drizzle diffed against its meta snapshot state, which showed those tables as missing because an earlier snapshot file didn't exist). Replaced with a clean, focused hand-crafted SQL per the plan spec.

2. **No zod dependency added** — Plan 01 is schema-only; the zod-vs-manual-validation decision is relevant for Plan 02 (route implementation). D-Discretion and the Pattern Map's discrepancy #2 note that zod is not installed — Plans 02/03 will adopt manual `typeof` validation per the established codebase pattern.

3. **Journal rename from auto-slug to descriptive name** — Standard convention (see 0008_add_oauth_scopes, 0009_add_app_settings) post-Phase 79.1. Both the `.sql` file and the `_journal.json` `tag` field updated to `0018_add_agent_events`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Auto-generated SQL included previously-applied migrations**
- **Found during:** Task 3 (Generate + hand-edit migration SQL)
- **Issue:** drizzle-kit's `db:generate` emitted `0018_spooky_retro_girl.sql` that re-declared the `password_reset_tokens` table and `ALTER TABLE users ADD COLUMN email_verified_at` — both from previously applied migrations 0016/0017. This would cause `npm run db:migrate` to fail on `ERROR: relation already exists`.
- **Fix:** Replaced auto-generated SQL entirely with the hand-crafted spec from the plan. The auto-generated SQL was only used as a starting reference to confirm drizzle picked up the right FK direction; all content was replaced.
- **Files modified:** `vigil-core/drizzle/0018_add_agent_events.sql`
- **Verification:** `npm run db:migrate` succeeded on first run; second run is a no-op.
- **Committed in:** `4a9439e` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in generated output)
**Impact on plan:** Auto-fix essential — without it the migration would have failed trying to create tables that already exist. No scope creep.

## Issues Encountered

None — plan executed cleanly once the auto-generated SQL bug was caught and replaced.

## Known Stubs

None — this is a schema/migration plan with no UI rendering or data flow stubs.

## Threat Flags

None — all threat model mitigations (T-121-01 through T-121-05) verified:
- T-121-01 (CHECK clause integrity): grep-verified `CHECK ("event" IN ('needs_input','task_complete','task_failed','milestone','heartbeat'))` present in SQL
- T-121-02 (cross-user isolation): composite partial unique index `(user_id, client_event_id)` confirmed with `pg_get_indexdef` showing correct predicate
- T-121-03/04/05: accepted per threat register, no new unplanned surface introduced

## Next Phase Readiness

- Plans 02/03/04 are now unblocked — `agent_events` table exists in local Postgres with all required constraints
- `DrizzleAgentEvent` + `NewAgentEvent` types importable from `@vigil-core/db/types.ts` for route implementation
- Railway prod will get the migration at next deploy (auto-migrate hook from Phase 55)
- Plans 02/03 should adopt manual `typeof` validation (not zod) per Pattern Map discrepancy #2

---
*Phase: 121-agent-events-api-foundation-cross-user-isolation-lock*
*Completed: 2026-05-08*
