-- ── Phase 129: SVCNOW-04 client_capture_id dedup ──────────────────────────
-- Adds client_capture_id column + (user_id, client_capture_id) partial unique
-- index to work_orders for popup-submission idempotency.
-- Mirrors 0018_add_agent_events.sql partial-unique-index pattern (Phase 121).
-- Re-run safe: IF NOT EXISTS throughout.
--
-- Purpose: enables server-side idempotent dedup of multi-tab + corporate-VPN-retry
-- POSTs from the ServiceNow extension popup. UUID generated client-side;
-- (user_id, client_capture_id) composite index enforces per-user dedup at DB level
-- (race-condition-safe — N concurrent inserts with same client_capture_id, only one wins).
--
-- Known pre-existing limitation: case_number remains globally unique (single-column PK
-- introduced in 0005 migration; not fixed in this phase per RESEARCH Probe 5).
-- client_capture_id dedup is per-user only and does NOT fix the cross-user stomp issue.
--
-- Requirement: SVCNOW-04
-- Phase: 129-lifecycle-restore-servicenow-popup

-- ── Step 1: Add nullable client_capture_id column ─────────────────────────
ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "client_capture_id" text;
--> statement-breakpoint

-- ── Step 2: PARTIAL UNIQUE on (user_id, client_capture_id) — SVCNOW-04 dedupe key
-- Composite scope is LOAD-BEARING — single-column unique would cross-contaminate users.
-- Mirrors uq_agent_events_user_client_event_id pattern from 0018_add_agent_events.sql.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_work_orders_user_client_capture_id"
  ON "work_orders" ("user_id", "client_capture_id")
  WHERE "client_capture_id" IS NOT NULL;
