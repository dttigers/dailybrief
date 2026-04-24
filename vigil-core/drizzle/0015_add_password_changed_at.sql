-- ── Phase 110: AUTH-09 password_changed_at column ──────────────────────────
-- Adds the timestamp the bearerAuth JWT-iat gate (Plan 02 D-05) reads and the
-- /v1/auth/change-password endpoint (Plan 02 D-11) writes.
--
-- 5-step backfill template (Phase 102 / Phase 108 pattern; Steps 4 and 5 —
-- FK and index — are NOT needed here because the column is a scalar timestamp,
-- not a reference. D-01 explicitly says no separate index — gate reads happen
-- by PK which is already indexed):
--   Step 1: ADD COLUMN nullable
--   Step 2: backfill existing rows from created_at (D-03 semantic: "password
--           was set at account creation"); guarantees jwt.iat >= floor(ts/1000)
--           for every prior JWT, so the strict-less-than gate (D-05) keeps
--           every prior session valid on deploy
--   Step 3: SET NOT NULL
--
-- Re-run safe: ADD COLUMN IF NOT EXISTS, backfill is WHERE-NULL filtered,
-- SET NOT NULL is a no-op on already-NOT-NULL columns.

-- ── Step 1: ADD COLUMN nullable ──────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone;
--> statement-breakpoint

-- ── Step 2: backfill NULL rows from created_at (D-03) ─────────────────────
UPDATE "users" SET "password_changed_at" = "created_at" WHERE "password_changed_at" IS NULL;
--> statement-breakpoint

-- ── Step 3: SET NOT NULL ─────────────────────────────────────────────────
ALTER TABLE "users" ALTER COLUMN "password_changed_at" SET NOT NULL;
