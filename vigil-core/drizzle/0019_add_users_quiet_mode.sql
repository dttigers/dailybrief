-- Phase 125 (AGENT-HUD-03 / D-05): users.quiet_mode boolean for HUD DND filter.
-- D-05 explicit: "default false" — no backfill needed beyond the column DEFAULT.
-- Optional users.quiet_mode_since timestamptz carries the {since: ISO} payload
-- emitted on quiet_mode_changed SSE frames. NULL when quiet_mode = false.
--
-- Re-run safe: ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "quiet_mode" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "quiet_mode_since" timestamp with time zone;
