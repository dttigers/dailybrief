-- Phase 107.1 gap repair: add schema.ts columns missing from prior migrations.
-- schema.ts src/db/schema.ts:245-249 declared these columns but no 0012 migration
-- ever included them, so production (Railway) and every fresh local vigil_dev
-- crashes on any INSERT/SELECT that references them. Tracked in deferred-items.md.

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "last_change_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "last_change_summary" text;
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
