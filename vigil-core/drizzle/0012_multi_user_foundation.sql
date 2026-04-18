-- ── Phase 102: Multi-User Foundation ────────────────────────────────────────
-- Single transaction; drizzle-orm/postgres-js/migrator wraps the whole file.
-- Re-run safety: every statement uses IF NOT EXISTS / ON CONFLICT / DO-block guards.
--
-- Prerequisite: scripts/migrate-102-seed.ts MUST run before this migration to
--   (a) create the users table (mirror of Step 1 below so the INSERT lands), and
--   (b) INSERT the seed user row (ON CONFLICT DO NOTHING), and
--   (c) ALTER DATABASE ... SET vigil.seed_email = '<email>' so the DO-block in Step 4 can read it.
--
-- Expected caller: `npm run db:migrate-102` (see package.json) which invokes
-- migrate-102-seed.ts FIRST, then runs the drizzle migrator against all files
-- including this one.

-- ── Step 1: create users table (idempotent; migrate-102-seed.ts already ran this) ──
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_email" ON "users" USING btree ("email");
--> statement-breakpoint

-- ── Step 2: drop old unique constraints/indexes that need to become composite ──
-- (These must be dropped BEFORE the unique-composite indexes are created.)
ALTER TABLE "briefs" DROP CONSTRAINT IF EXISTS "briefs_date_unique";
--> statement-breakpoint
ALTER TABLE "oauth_tokens" DROP CONSTRAINT IF EXISTS "oauth_tokens_provider_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_ai_cache_type";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_briefs_date";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_oauth_tokens_provider";
--> statement-breakpoint

-- ── Step 3: add user_id nullable to all 11 scoped tables (Pitfall 2: nullable first, then backfill, then SET NOT NULL) ──
ALTER TABLE "api_keys"      ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "thoughts"      ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "projects"      ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "briefs"        ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "brief_pdfs"    ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "thought_links" ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "work_orders"   ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "oauth_tokens"  ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "ai_cache"      ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
ALTER TABLE "app_settings"  ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint

-- ── Step 4: backfill all NULL user_id to the seed user (inserted by migrate-102-seed.ts) ──
-- Reads vigil.seed_email GUC set by migrate-102-seed.ts via ALTER DATABASE; falls back to default.
DO $$
DECLARE seed_id integer;
BEGIN
  SELECT id INTO seed_id FROM users
    WHERE email = LOWER(COALESCE(current_setting('vigil.seed_email', true), 'jamesonmorrill1@gmail.com'))
    LIMIT 1;
  IF seed_id IS NULL THEN
    RAISE EXCEPTION 'Seed user not found -- migrate-102-seed.ts must run first';
  END IF;
  UPDATE "api_keys"      SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "thoughts"      SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "projects"      SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "briefs"        SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "brief_pdfs"    SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "thought_links" SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "chat_sessions" SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "work_orders"   SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "oauth_tokens"  SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "ai_cache"      SET user_id = seed_id WHERE user_id IS NULL;
  UPDATE "app_settings"  SET user_id = seed_id WHERE user_id IS NULL;
END $$;
--> statement-breakpoint

-- ── Step 5: SET NOT NULL + add ON DELETE RESTRICT FK + index on each of the 11 tables ──
-- Each FK ADD is wrapped in DO/EXCEPTION WHEN duplicate_object so the migration
-- is re-runnable (Postgres has no ADD CONSTRAINT IF NOT EXISTS for FKs).

ALTER TABLE "api_keys"      ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_user_id" ON "api_keys" ("user_id");
--> statement-breakpoint

ALTER TABLE "thoughts"      ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thoughts_user_id" ON "thoughts" ("user_id");
--> statement-breakpoint

ALTER TABLE "projects"      ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_user_id" ON "projects" ("user_id");
--> statement-breakpoint

ALTER TABLE "briefs"        ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "briefs" ADD CONSTRAINT "briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_briefs_user_id" ON "briefs" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_briefs_user_date" ON "briefs" ("user_id", "date");
--> statement-breakpoint

ALTER TABLE "brief_pdfs"    ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brief_pdfs" ADD CONSTRAINT "brief_pdfs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_brief_pdfs_user_id" ON "brief_pdfs" ("user_id");
--> statement-breakpoint

ALTER TABLE "thought_links" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "thought_links" ADD CONSTRAINT "thought_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thought_links_user_id" ON "thought_links" ("user_id");
--> statement-breakpoint

ALTER TABLE "chat_sessions" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_user_id" ON "chat_sessions" ("user_id");
--> statement-breakpoint

ALTER TABLE "work_orders"   ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_work_orders_user_id" ON "work_orders" ("user_id");
--> statement-breakpoint

ALTER TABLE "oauth_tokens"  ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_tokens_user_id" ON "oauth_tokens" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_oauth_tokens_user_provider" ON "oauth_tokens" ("user_id", "provider");
--> statement-breakpoint

ALTER TABLE "ai_cache"      ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_cache" ADD CONSTRAINT "ai_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_cache_user_id" ON "ai_cache" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_cache_user_type" ON "ai_cache" ("user_id", "type");
--> statement-breakpoint

-- ── Step 6: app_settings composite PK swap (Pitfall 3) ────────────────────
ALTER TABLE "app_settings"  ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_settings_user_id" ON "app_settings" ("user_id");
--> statement-breakpoint
ALTER TABLE "app_settings" DROP CONSTRAINT IF EXISTS "app_settings_pkey";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("user_id", "key");
EXCEPTION
  WHEN invalid_table_definition THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;
