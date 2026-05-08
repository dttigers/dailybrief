-- ── Phase 121: AGENT-API-01 + AGENT-API-02 agent_events table ─────────────
-- Backs POST /v1/agent-events and GET /v1/agent-sessions (Plans 02/03/04).
-- Phase 122 vigil-watch daemon will be the first real producer; Phase 124
-- WebSocket fan-out (AGENT-API-03) will read this table.
--
-- Two-timestamp hygiene (D-A1):
--   - event_timestamp: source of truth from daemon payload (ordering key)
--   - received_at:    DB insert time (default now()) — clock-skew forensics
--
-- CHECK constraint on `event` enforces the 5-value list verbatim per D-A2.
-- Drizzle-orm@0.45.2 has no column-level CHECK helper, so this lives in SQL
-- only — same pattern as 0016_password_reset_tokens.sql:26.
--
-- Idempotency (D-C1 + D-D2 block 3): partial unique index on
--   (user_id, client_event_id) WHERE client_event_id IS NOT NULL
-- Composite scope is LOAD-BEARING — single-column would let userA's POST
-- collide with userB's UUID and silently 200-dedupe across users. The
-- cross-user isolation test block 3 pins exactly this invariant.
--
-- Re-run safe: every statement uses IF NOT EXISTS. Re-running npm run db:migrate
-- on an already-migrated DB is a no-op.

-- ── Step 1: CREATE TABLE with all columns + CHECK constraint ──────────────
CREATE TABLE IF NOT EXISTS "agent_events" (
  "id"               serial PRIMARY KEY,
  "user_id"          integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "session_id"       text NOT NULL,
  "event"            text NOT NULL CHECK ("event" IN ('needs_input','task_complete','task_failed','milestone','heartbeat')),
  "message"          text,
  "label"            text NOT NULL,
  "host"             text NOT NULL,
  "exit_code"        integer,
  "event_timestamp"  timestamp with time zone NOT NULL,
  "received_at"      timestamp with time zone DEFAULT now() NOT NULL,
  "client_event_id"  text
);
--> statement-breakpoint

-- ── Step 2: composite index — serves GET /v1/agent-sessions "latest event per session per user" (D-A3 idx 1)
-- DESC on event_timestamp lets PG do an index-only scan for DISTINCT ON / window queries.
CREATE INDEX IF NOT EXISTS "idx_agent_events_user_session_ts"
  ON "agent_events" ("user_id", "session_id", "event_timestamp" DESC);
--> statement-breakpoint

-- ── Step 3: per-user index — write-side scoping safety + symmetry (D-A3 idx 2)
CREATE INDEX IF NOT EXISTS "idx_agent_events_user_id"
  ON "agent_events" ("user_id");
--> statement-breakpoint

-- ── Step 4: PARTIAL UNIQUE on (user_id, client_event_id) — D-A4 + D-C1 + D-D2 block 3 dedupe key
-- Composite scope is LOAD-BEARING — see header comment. Single-column unique would cross-contaminate.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_events_user_client_event_id"
  ON "agent_events" ("user_id", "client_event_id")
  WHERE "client_event_id" IS NOT NULL;
