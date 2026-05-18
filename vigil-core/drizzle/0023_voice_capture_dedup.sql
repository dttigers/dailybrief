-- ── Phase 130 Plan 02: VOICE-05 voice_captures dedup table ────────────────
-- New `voice_captures` sibling table with FK to thoughts.id.
-- Composite partial unique index (user_id, client_capture_id) WHERE NOT NULL.
-- Mirrors 0021_add_work_orders_client_capture_id.sql SVCNOW-04 dedup pattern.
-- Re-run safe: IF NOT EXISTS throughout.
--
-- Purpose: enables server-side idempotent dedup of G2 voice offline-queue
-- retries from the plugin. UUID generated client-side at `safeAudioControl(true)`
-- time; (user_id, client_capture_id) composite index enforces per-user dedup
-- at DB level (race-condition-safe — N concurrent inserts with same
-- client_capture_id, only one wins).
--
-- Schema decision (CONTEXT D-U4 + RESEARCH Gray Area #2):
-- Sibling table over thoughts.client_capture_id column. `thoughts` is
-- polymorphic (source in {'g2_voice', 'voice', 'camera', 'text', ...}); adding
-- a `client_capture_id` column only for G2 voice would leave 90%+ of rows
-- NULL. The sibling table also provides a natural home for per-recording
-- telemetry metadata without polluting `thoughts`.
--
-- W-01 invariant: every query on voice_captures MUST filter
-- eq(voiceCaptures.userId, userId). This is enforced in application code
-- (routes/voice-transcribe.ts) and verified by the cross-user-isolation test.
--
-- Requirement: VOICE-05
-- Phase: 130-voice-capture-full-implementation-scope-locked-by-128a

CREATE TABLE IF NOT EXISTS "voice_captures" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "thought_id" integer REFERENCES "thoughts"("id") ON DELETE SET NULL,
  "client_capture_id" text NOT NULL,
  "queued_at" timestamptz NOT NULL DEFAULT now(),
  "retry_count" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint

-- PARTIAL UNIQUE on (user_id, client_capture_id) — VOICE-05 dedupe key.
-- Composite scope is LOAD-BEARING — single-column unique would cross-contaminate users.
-- Mirrors uq_work_orders_user_client_capture_id pattern from 0021_add_work_orders_client_capture_id.sql.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_voice_captures_user_client_capture_id"
  ON "voice_captures" ("user_id", "client_capture_id")
  WHERE "client_capture_id" IS NOT NULL;
