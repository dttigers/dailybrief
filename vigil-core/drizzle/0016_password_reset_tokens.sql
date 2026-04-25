-- ── Phase 112: AUTH-10 password_reset_tokens table ──────────────────────────
-- Backs the forgot-password / reset-password endpoints (Plans 02/03).
-- Phase 113 (AUTH-11) reuses this table with type='email_verify'; the CHECK
-- constraint is pre-locked here so 113 doesn't need to revisit the migration.
--
-- Atomic single-use claim (CONTEXT D-02 / Phase 112 RESEARCH §Pattern-2):
--   UPDATE password_reset_tokens
--      SET used_at = now()
--    WHERE token_hash = $1
--      AND type = $2
--      AND used_at IS NULL
--      AND expires_at > now()
--   RETURNING user_id;
-- 0 rows → invalid/expired/used (Plan 03 returns 400). 1 row → claimed.
-- PG row-lock on the matched row serializes concurrent claims; only the first
-- statement sees used_at IS NULL true. No transaction wrapper needed.
--
-- Re-run safe: every statement uses IF NOT EXISTS. Re-running npm run db:migrate
-- on an already-migrated DB is a no-op.

-- ── Step 1: CREATE TABLE with all columns + CHECK constraint ────────────────
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id"          serial PRIMARY KEY,
  "user_id"     integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash"  text NOT NULL,
  "type"        text NOT NULL CHECK ("type" IN ('password_reset','email_verify')),
  "expires_at"  timestamp with time zone NOT NULL,
  "used_at"     timestamp with time zone,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── Step 2: UNIQUE index on token_hash (lookup key for atomic claim) ────────
CREATE UNIQUE INDEX IF NOT EXISTS "idx_prt_token_hash"
  ON "password_reset_tokens" ("token_hash");
--> statement-breakpoint

-- ── Step 3: composite index on (user_id, type) — supports D-06 invalidate-prior
-- "UPDATE ... SET used_at=now() WHERE user_id=$1 AND type='password_reset'
--  AND used_at IS NULL" before issuing a fresh token.
CREATE INDEX IF NOT EXISTS "idx_prt_user_id_type"
  ON "password_reset_tokens" ("user_id", "type");
--> statement-breakpoint

-- ── Step 4: index on expires_at (cleanup-friendly; rare query path) ─────────
CREATE INDEX IF NOT EXISTS "idx_prt_expires_at"
  ON "password_reset_tokens" ("expires_at");
