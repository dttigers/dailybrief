-- ── Phase 113: AUTH-11 users.email_verified_at column ─────────────────────
-- Backs the verify-email flow (Plans 02/03/04). Schema is permanent:
--   - NULL = unverified (banner sentinel for SettingsPage).
--   - Non-null TIMESTAMPTZ = verified at that moment.
--
-- D-02 backfill (SC#4 grandfathering): every pre-existing row gets
-- email_verified_at = created_at, so existing users (including the seed
-- user jamesonmorrill1@gmail.com) are NOT subjected to the banner after
-- the Railway deploy. Only users who register AFTER this migration
-- runs but BEFORE clicking their verify link will have NULL.
--
-- Re-run safe: ADD COLUMN uses IF NOT EXISTS; UPDATE filter
-- (WHERE email_verified_at IS NULL) is empty after first pass.

-- ── Step 1: ADD COLUMN ─────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
--> statement-breakpoint

-- ── Step 2: Backfill — grandfather all pre-existing rows as verified ───
UPDATE "users"
   SET "email_verified_at" = "created_at"
 WHERE "email_verified_at" IS NULL;
