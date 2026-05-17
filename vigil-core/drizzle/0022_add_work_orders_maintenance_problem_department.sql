-- ── Phase 129.1: WO-MANUAL-03 maintenance_problem + department ────────────
-- Adds two nullable text columns to work_orders that flow through the
-- /v1/work-orders/sync route's strict 12-field sanitizer (Phase 129.1 plan 01)
-- and are populated downstream by the screenshot endpoint (SCAP-*, plan 03)
-- and the PWA manual-create form (plan 05).
--
-- Re-run safe: IF NOT EXISTS on each ALTER (mirrors 0021 pattern). Drizzle's
-- auto-generated form omits IF NOT EXISTS; we add it back deliberately so the
-- migration is idempotent (Risk 8 in RESEARCH — Railway deploy applies migration
-- on boot before route code references the new columns; re-run safety matters).
--
-- Existing rows unaffected: nullable text, no default → metadata-only change
-- in Postgres (no table rewrite, no row scan).
--
-- Both columns are operator-typed business-context strings (not PII / not
-- query keys). No index added — see RESEARCH §5 (Risk Register).
--
-- Requirement: WO-MANUAL-03 (with SCAP-* downstream in 129.1-03 / 129.1-05)
-- Phase: 129.1-svcnow-revert-screenshot-pipeline

-- ── Step 1: Add nullable maintenance_problem column ─────────────────────────
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "maintenance_problem" text;
--> statement-breakpoint

-- ── Step 2: Add nullable department column ──────────────────────────────────
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "department" text;
