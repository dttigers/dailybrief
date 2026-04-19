---
phase: 99-brief-history-fix
plan: "01"
subsystem: vigil-core/db
tags: [schema, migration, postgres, drizzle, bytea]
dependency_graph:
  requires: []
  provides: [brief_pdfs-table, 0011-migration]
  affects: [vigil-core/src/db/schema.ts, vigil-core/drizzle/]
tech_stack:
  added: [drizzle customType for bytea]
  patterns: [sibling-table-for-binary-data, drizzle-migration-runner]
key_files:
  created:
    - vigil-core/drizzle/0011_dashing_redwing.sql
    - vigil-core/drizzle/meta/0009_snapshot.json
    - vigil-core/drizzle/meta/0010_snapshot.json
    - vigil-core/drizzle/meta/0011_snapshot.json
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/drizzle/meta/_journal.json
decisions:
  - "Used customType<{ data: Buffer; driverData: Buffer }> for bytea (Drizzle has no built-in bytea helper)"
  - "Kept brief_pdfs as sibling table (not column on briefs) per D-02 so SELECT * FROM briefs never pulls MB of binary"
  - "Repaired _journal.json by adding missing entries for 0008-0010 and creating missing 0009/0010 snapshots before generating 0011"
  - "Inserted missing __drizzle_migrations records for 0008-0010 (applied outside runner) so migrate.js only ran 0011"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 6
requirements_addressed: [BRIEF-01]
---

# Phase 99 Plan 01: Add brief_pdfs Schema and Migration — Summary

**One-liner:** Drizzle `brief_pdfs` sibling table with BYTEA column, customType wrapper, and FK to `briefs(id)` ON DELETE CASCADE; migration 0011 generated and applied to Railway Postgres.

## What Was Built

### Task 1: briefPdfs table in schema.ts

Added to `vigil-core/src/db/schema.ts`:

1. `customType` import added to the `drizzle-orm/pg-core` import block
2. `bytea` custom type wrapper defined immediately after imports (Drizzle v0.45 has no built-in bytea helper)
3. `briefPdfs` table exported after the existing `briefs` table, with columns per D-02:
   - `briefId` integer PRIMARY KEY — FK to `briefs.id` ON DELETE CASCADE
   - `bytes` bytea NOT NULL — PDF binary content
   - `contentType` text NOT NULL DEFAULT 'application/pdf'
   - `byteLength` integer NOT NULL — for fast list sizing without fetching bytes
   - `createdAt` timestamp with time zone NOT NULL DEFAULT now()
4. No indexes added (PK is the only access path — detail endpoint looks up by brief_id)
5. `pdfFilename` on `briefs` left untouched (nullable, dead-code transition; Plans 02-03 handle the write path and column cleanup)

TypeScript check (`npx tsc --noEmit`) passes with no errors.

### Task 2: Migration 0011 generated and applied

Generated `vigil-core/drizzle/0011_dashing_redwing.sql`:

```sql
CREATE TABLE "brief_pdfs" (
  "brief_id" integer PRIMARY KEY NOT NULL,
  "bytes" "bytea" NOT NULL,
  "content_type" text DEFAULT 'application/pdf' NOT NULL,
  "byte_length" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brief_pdfs" ADD CONSTRAINT "brief_pdfs_brief_id_briefs_id_fk" 
  FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE cascade ON UPDATE no action;
```

Migration applied locally against the Railway Postgres database. Confirmed via `information_schema.columns` query: all 5 columns present, FK `brief_pdfs_brief_id_briefs_id_fk` → `briefs.id` ON DELETE CASCADE confirmed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Repaired out-of-sync Drizzle migration journal**

- **Found during:** Task 2
- **Issue:** `_journal.json` only listed migrations 0000-0007 (8 entries) despite SQL files 0008-0010 existing on disk. Snapshots 0009 and 0010 were also missing from `drizzle/meta/`. Running `drizzle-kit generate` would have produced a new `0008_*.sql` conflicting with the existing file, and included changes from 0008-0010 that were already applied.
- **Root cause:** Migrations 0008-0010 were applied to the database directly (likely via `drizzle-kit push`) without going through the migration runner, leaving both the journal and `__drizzle_migrations` table out of sync.
- **Fix:**
  1. Added journal entries for idx 8-10 with correct tags and timestamps
  2. Created `0009_snapshot.json` (0008 snapshot + app_settings table)
  3. Created `0010_snapshot.json` (0009 snapshot + ai_cache table + full work_orders columns)
  4. Ran `drizzle-kit generate` — produced clean `0011_dashing_redwing.sql` with only `brief_pdfs`
  5. Inserted missing `__drizzle_migrations` records for 0008-0010 so `migrate.js` skipped them
  6. Ran `node dist/db/migrate.js` — applied only 0011, exited 0
- **Files modified:** `vigil-core/drizzle/meta/_journal.json`, `vigil-core/drizzle/meta/0009_snapshot.json` (new), `vigil-core/drizzle/meta/0010_snapshot.json` (new)
- **Commit:** 824b953

**2. [Rule 2 - Missing] work_orders snapshot columns**

- **Found during:** Task 2 (first generate attempt)
- **Issue:** The 0010 snapshot derived from 0008 was missing `notes`, `last_change_at`, `last_change_summary`, `archived_at` columns on `work_orders`. These columns exist in `schema.ts` and the live DB but were never in any migration SQL file — they were applied directly. The first generate attempt produced a migration that included these as ALTER TABLE adds, which would have failed on deploy.
- **Fix:** Added the 4 missing columns to the `0010_snapshot.json` `work_orders` table definition before re-running generate.
- **Commit:** 824b953

## Local DB Apply: SUCCEEDED

Migration `0011_dashing_redwing.sql` was applied to the Railway Postgres database. Table `brief_pdfs` confirmed with all 5 columns and FK constraint.

Note: `psql` is not available on this dev machine. Verification was done via Node.js + postgres-js driver querying `information_schema`.

## Known Stubs

None. This plan adds schema only — no data path wired yet. Plans 02 and 03 wire the write/read paths.

## Threat Flags

None. `brief_pdfs` is an internal table, no new network endpoints introduced by this plan.

## Self-Check: PASSED

- `vigil-core/src/db/schema.ts` — FOUND, contains `briefPdfs` export
- `vigil-core/drizzle/0011_dashing_redwing.sql` — FOUND
- `vigil-core/drizzle/meta/_journal.json` — FOUND, contains 0011 entry
- `vigil-core/drizzle/meta/0011_snapshot.json` — FOUND
- Commit `220b723` — feat(99-01): add briefPdfs table to Drizzle schema
- Commit `824b953` — feat(99-01): generate and apply migration 0011
