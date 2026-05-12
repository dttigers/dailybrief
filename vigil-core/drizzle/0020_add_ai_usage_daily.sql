-- Phase 127 GUARD-03 (D-03.1 + Pitfall 9): per-user daily AI spend watermark.
-- Composite PK (user_id, usage_date) is the W-01 cross-user-isolation pattern
-- (Phase 121 D-D2 lock). Daily rollover happens naturally by usage_date — no
-- cron, no nightly job. The src/lib/ai-budget.ts helpers read/write this
-- table via requireAiBudget() (pre-flight throw on cap exceed) and
-- withBudgetTracking() (post-call accumulator via INSERT … ON CONFLICT
-- DO UPDATE).
--
-- Precision (12,6) — Pitfall 9 override of CONTEXT D-03.1's (10,4).
-- Sub-cent precision lets a single chat turn (100 in + 50 out @ $3/$15 per 1M
-- = $0.00105) accumulate without rounding to zero.
--
-- onDelete: CASCADE — user hard-delete sweeps the throwaway daily-spend rows.
--
-- Re-run safe: CREATE TABLE / INDEX IF NOT EXISTS is idempotent (Railway
-- partial-fail-on-restart pattern — Phase 125 Plan 02 lock).

CREATE TABLE IF NOT EXISTS "ai_usage_daily" (
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "usage_date" date NOT NULL,
  "usd_estimate" numeric(12,6) NOT NULL DEFAULT '0',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "usage_date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_daily_date" ON "ai_usage_daily" ("usage_date");
