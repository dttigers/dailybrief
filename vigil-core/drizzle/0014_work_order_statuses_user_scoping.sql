-- ── Phase 108: W-01 work_order_statuses user scoping ──────────────────────
-- Reverses Phase 102 D-23 (which decided this table stays unscoped).
-- Adds user_id FK, backfills from vigil.seed_email GUC, swaps sole-PK on
-- case_number for composite (user_id, case_number), adds per-user index.
--
-- Re-run safe: every statement uses IF NOT EXISTS / DROP IF EXISTS /
--   EXCEPTION WHEN duplicate_object guards.
--
-- Prerequisite: migrate-102-seed.ts has already run (seeds user row + sets
--   vigil.seed_email GUC via ALTER DATABASE). Use `npm run db:migrate-102`
--   (NOT `npm run db:migrate`) for a fresh local DB — the drizzle migrator
--   picks up this 0014 file automatically after the seed script runs.

-- ── Step 1: ADD COLUMN nullable ──────────────────────────────────────────
ALTER TABLE "work_order_statuses" ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint

-- ── Step 2: backfill NULL rows to seed user via vigil.seed_email GUC ──────
DO $$
DECLARE seed_id integer;
BEGIN
  SELECT id INTO seed_id FROM users
    WHERE email = LOWER(COALESCE(current_setting('vigil.seed_email', true), 'jamesonmorrill1@gmail.com'))
    LIMIT 1;
  IF seed_id IS NULL THEN
    RAISE EXCEPTION 'Seed user not found -- migrate-102-seed.ts must run first';
  END IF;
  UPDATE "work_order_statuses" SET user_id = seed_id WHERE user_id IS NULL;
END $$;
--> statement-breakpoint

-- ── Step 3: SET NOT NULL ─────────────────────────────────────────────────
ALTER TABLE "work_order_statuses" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint

-- ── Step 4: ADD FK to users(id) ON DELETE RESTRICT ────────────────────────
DO $$ BEGIN
  ALTER TABLE "work_order_statuses" ADD CONSTRAINT "work_order_statuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ── Step 5: CREATE INDEX on user_id alone (list-by-user queries) ──────────
CREATE INDEX IF NOT EXISTS "idx_work_order_statuses_user_id" ON "work_order_statuses" ("user_id");
--> statement-breakpoint

-- ── Step 6: PK swap — drop sole-PK on case_number, add composite (user_id, case_number) ──
ALTER TABLE "work_order_statuses" DROP CONSTRAINT IF EXISTS "work_order_statuses_pkey";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "work_order_statuses" ADD CONSTRAINT "work_order_statuses_pkey" PRIMARY KEY ("user_id", "case_number");
EXCEPTION
  WHEN invalid_table_definition THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;
