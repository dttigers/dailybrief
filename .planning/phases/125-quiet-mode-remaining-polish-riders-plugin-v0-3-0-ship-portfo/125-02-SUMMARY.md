---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
plan: 02
subsystem: database
tags: [phase-125, wave-1, drizzle, migration, schema, postgres, quiet-mode, AGENT-HUD-03]

dependency_graph:
  requires:
    - phase: 121-agent-events-api-foundation-cross-user-isolation-lock
      provides: "users.id PK + per-userId scoping pattern (the quiet_mode column hangs off the same PK)"
    - phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo/01
      provides: "Wave-0 RED test files pin the shape Plans 03/05 will read against the new columns"
  provides:
    - "users.quiet_mode boolean NOT NULL DEFAULT false (per-user HUD DND filter state — D-05)"
    - "users.quiet_mode_since timestamptz NULL (carries {since: ISO} payload for quiet_mode_changed SSE frame — D-02)"
    - "drizzle/0019_add_users_quiet_mode.sql — idempotent migration auto-applied by Railway Dockerfile:18 on next deploy"
    - "drizzle/meta/0019_snapshot.json + journal idx 19 (drizzle-kit baseline for future column adds on users)"
  affects:
    - "Plan 125-03 — suppression queue reads no column directly but depends on the column existing for the /v1/quiet-mode round-trip wired in Plan 05"
    - "Plan 125-05 — GET/PUT /v1/quiet-mode route SELECTs users.quiet_mode + UPDATEs users.quiet_mode_since"
    - "Plan 125-06 — vigil-g2-plugin sse-client handler indirectly depends (no direct DB read; consumes the SSE frame emitted by the route)"

tech-stack:
  added: []
  patterns:
    - "Drizzle Pattern 1 (idempotent ADD COLUMN IF NOT EXISTS) — matches 0015/0017 precedent; re-run safe on partial-fail"
    - "Hand-edit drizzle-kit auto-named SQL (rename + IF NOT EXISTS guard) when generator output lacks idempotency guard — journal tag must match new filename stem"

key-files:
  created:
    - "vigil-core/drizzle/0019_add_users_quiet_mode.sql (12 lines — 6 comment, 4 SQL, 2 blank)"
    - "vigil-core/drizzle/meta/0019_snapshot.json (1789 lines — full schema-state baseline at idx 19)"
  modified:
    - "vigil-core/src/db/schema.ts (+4 lines; -0 lines — two column declarations inside users pgTable block)"
    - "vigil-core/drizzle/meta/_journal.json (+7 lines — new idx 19 entry with corrected tag)"

key-decisions:
  - "Renamed drizzle-kit auto-name 0019_neat_quicksilver.sql → 0019_add_users_quiet_mode.sql for human-readable migration names; updated _journal.json tag in lockstep so migrate.js still resolves the file by tag."
  - "Hand-edited generated SQL to use ADD COLUMN IF NOT EXISTS — drizzle-kit emits plain ADD COLUMN (Pattern 1 precedent in 0015/0017 calls for idempotency-guarded migrations; Railway partial-fail-on-restart needs re-run safety)."
  - "DID NOT run db:migrate-prod against Railway or any live DB. Per D-05 + plan spec, migration auto-applies on next Railway deploy via Dockerfile:18 CMD chain; Plan 05 integration tests + Wave 4 hardware retest validate live state."

patterns-established:
  - "Wave-1 schema migrations: schema.ts edit lands as a separate atomic commit BEFORE the generated migration SQL (allows reviewers to verify the Drizzle DSL is honest before reading the auto-emitted SQL)."
  - "Drizzle-kit rename protocol: when renaming an auto-generated SQL file, update the meta/_journal.json `tag` field to match the new filename stem; snapshot file 0019_snapshot.json stays at the auto-named numeric prefix."

requirements-completed: []  # AGENT-HUD-03 in plan frontmatter — but per 125-01-SUMMARY precedent, schema-only landing does NOT close AGENT-HUD-03. The requirement is satisfied collectively by Plans 03 (suppression queue) + 05 (endpoint) + 06 (plugin filter). Marking complete now would generate false-green REQUIREMENTS.md state.

metrics:
  duration: "~62 min wall (most of it absorbed by full-suite hang investigation — DEF-125-02-01)"
  duration_useful: "~8 min schema edit + drizzle-kit generate + hand-edit + targeted-test verify + commits"
  completed: "2026-05-10"
  tasks_completed: 2
  files_changed: 4
  schema_byte_delta: "+4 lines / 0 deletions on users pgTable"
  migration_sql_lines: 12
  drizzle_auto_diff_verdict: "clean — auto-diff included only the two intended ALTER TABLEs; no stale-migration leakage like Phase 121 P01"
  hand_edit_required: "Yes — rename + IF NOT EXISTS guard + journal tag patch"
---

# Phase 125 Plan 02: Wave-1 Drizzle migration for users.quiet_mode Summary

**Two-column schema delta (`users.quiet_mode boolean default false` + `users.quiet_mode_since timestamptz`) + idempotent ADD COLUMN IF NOT EXISTS migration 0019, hand-edited from drizzle-kit auto-output, ready for Railway auto-apply on next deploy.**

## Performance

- **Duration:** ~62 min wall (8 min useful work + 54 min absorbed by an unrelated full-suite-hang investigation — see DEF-125-02-01 in deferred-items.md)
- **Started:** 2026-05-10T17:12:05Z (Task 1 commit author timestamp)
- **Completed:** 2026-05-10T18:14:15Z
- **Tasks:** 2 (both atomic, both green)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **Schema source of truth declares the two new columns.** `vigil-core/src/db/schema.ts` users pgTable now carries `quietMode: boolean("quiet_mode").notNull().default(false)` and `quietModeSince: timestamp("quiet_mode_since", { withTimezone: true })`. TypeScript compiles cleanly (`tsc --noEmit` exit 0).
- **Idempotent migration committed.** `drizzle/0019_add_users_quiet_mode.sql` uses `ADD COLUMN IF NOT EXISTS` for both columns (Pattern 1, matches 0015/0017 precedent). Re-run safe on Railway partial-fail-on-restart.
- **Drizzle-kit journal + snapshot updated.** `_journal.json` has new idx 19 entry pointing at the renamed tag `0019_add_users_quiet_mode`; `0019_snapshot.json` is the new baseline for future column adds on `users`.
- **Auto-applies on Railway via Dockerfile:18 CMD chain.** No manual ops step required for prod rollout; verified by reading `vigil-core/Dockerfile` directly (RESEARCH §Pattern 1 reference).
- **No prod DB touched.** Per D-05 + plan spec; live validation defers to Plan 05 (integration test) + Wave 4 hardware retest.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend users table in schema.ts with quietMode + quietModeSince** — `c3fa8f9` (feat)
2. **Task 2: Generate 0019_add_users_quiet_mode.sql migration via drizzle-kit + verify idempotency** — `2086249` (feat)

**Plan metadata commit:** will land via the final docs commit (this SUMMARY + STATE/ROADMAP/REQUIREMENTS updates + deferred-items.md).

## Files Created/Modified

- `vigil-core/src/db/schema.ts` — Added `quietMode` (boolean NOT NULL default false) + `quietModeSince` (timestamptz nullable) inside the existing `users` pgTable. 4 insertions, 0 deletions. Imports unchanged (`boolean` + `timestamp` were already in the top import block).
- `vigil-core/drizzle/0019_add_users_quiet_mode.sql` — NEW. 12-line idempotent migration: 6-line comment header (Phase 125 / AGENT-HUD-03 / D-05 attribution), 2× `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements separated by `--> statement-breakpoint`.
- `vigil-core/drizzle/meta/0019_snapshot.json` — NEW. 1789-line drizzle-kit-generated full-schema baseline at migration idx 19. References both new columns under `tables.users.columns.quiet_mode` and `tables.users.columns.quiet_mode_since`.
- `vigil-core/drizzle/meta/_journal.json` — Appended idx 19 entry with `tag: "0019_add_users_quiet_mode"` (corrected from drizzle-kit's auto-name `0019_neat_quicksilver` after the SQL file was renamed).

## Decisions Made

- **Rename drizzle-kit auto-name to human-readable filename + patch journal tag in lockstep.** drizzle-kit emitted `0019_neat_quicksilver.sql`; renamed to `0019_add_users_quiet_mode.sql` for human-readable migration history. Updated `_journal.json` tag from `0019_neat_quicksilver` → `0019_add_users_quiet_mode` so `migrate.js` still resolves the file by tag. Snapshot file stays at numeric prefix `0019_snapshot.json` (snapshots are indexed by idx, not tag).
- **Hand-edit auto-output to add `IF NOT EXISTS` guard.** drizzle-kit's default `ADD COLUMN` is not idempotent; pattern reference 0015/0017 calls for `IF NOT EXISTS` so a partial-fail Railway restart can re-run safely. Hand-edit produces the Pattern 1 shape from RESEARCH §Code Examples (lines 274-289).
- **No live DB migration in this plan.** Per D-05 explicit + plan spec. Railway auto-applies on next deploy via Dockerfile:18; Plan 05 integration test + Wave 4 hardware retest exercise the live deploy. Local dev with running Postgres can `npm run db:migrate` manually if desired, but this plan does not require it.
- **Did NOT mark AGENT-HUD-03 complete in REQUIREMENTS.md.** Following 125-01-SUMMARY precedent — schema-only landing does not satisfy AGENT-HUD-03; it's satisfied collectively by Plans 03 (suppression queue) + 05 (endpoint) + 06 (plugin filter). Marking complete now would generate false-green REQUIREMENTS.md state. Plan 06 closure (the last plan in the chain) will mark AGENT-HUD-03 done.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] drizzle-kit emitted auto-name `0019_neat_quicksilver.sql` instead of plan-requested `0019_add_users_quiet_mode.sql`**

- **Found during:** Task 2 — `npm run db:generate` finished cleanly but produced auto-named file.
- **Issue:** Plan acceptance criterion explicitly required filename `0019_add_users_quiet_mode.sql`. drizzle-kit 0.31.x does not expose a CLI flag to override the auto-name in `generate` mode.
- **Fix:** `mv` rename + corresponding `_journal.json` tag patch from `0019_neat_quicksilver` → `0019_add_users_quiet_mode`. Snapshot file kept at `0019_snapshot.json` (drizzle-kit indexes snapshots by idx, not tag, so it resolves correctly without renaming).
- **Files modified:** Renamed `drizzle/0019_neat_quicksilver.sql` → `drizzle/0019_add_users_quiet_mode.sql`; patched one tag string in `drizzle/meta/_journal.json`.
- **Verification:** `grep -c "0019_add_users_quiet_mode" vigil-core/drizzle/meta/_journal.json` returns 1; SQL file resolves at the new path.
- **Committed in:** `2086249` (Task 2 commit).

**2. [Rule 1 — Bug] drizzle-kit auto-emitted `ADD COLUMN ... NOT NULL DEFAULT false` without `IF NOT EXISTS` guard**

- **Found during:** Task 2 — reading generated SQL before commit.
- **Issue:** Plan acceptance + Pattern 1 (RESEARCH §Code Examples) require `ADD COLUMN IF NOT EXISTS` for re-run safety. drizzle-kit's default output is `ALTER TABLE "users" ADD COLUMN "quiet_mode" boolean DEFAULT false NOT NULL;` — non-idempotent. Migration would fail on Railway restart-after-partial-fail.
- **Fix:** Hand-edited the SQL to the Pattern 1 shape with `IF NOT EXISTS` and the documented attribution header (Phase 125 / AGENT-HUD-03 / D-05). Matches 0015 + 0017 precedent verbatim.
- **Files modified:** `vigil-core/drizzle/0019_add_users_quiet_mode.sql` (replaced 2-line auto-output with 12-line idempotent migration).
- **Verification:** `grep -c 'ADD COLUMN IF NOT EXISTS "quiet_mode"' vigil-core/drizzle/0019_add_users_quiet_mode.sql` returns 1; same for `quiet_mode_since`. `grep -c "ALTER TABLE"` returns exactly 2 (no stale-migration leakage).
- **Committed in:** `2086249` (Task 2 commit, same as Deviation 1).

---

**Total deviations:** 2 auto-fixed (1 Rule 1 idempotency bug in generator output, 1 Rule 3 filename naming conflict)
**Impact on plan:** Both fixes were the plan's expected outcome — the plan template explicitly anticipated drizzle-kit output requiring hand-edit (RESEARCH §Pattern 1 + plan Task 2 step 2 "REPLACE drizzle-kit output if it lacks IF NOT EXISTS"). Not scope creep; just executing the documented escape hatch.

## Issues Encountered

### Full `vigil-core` test suite hangs on `cross-user-isolation.test.ts`

- **Logged as:** DEF-125-02-01 in `.planning/phases/125-…/deferred-items.md`
- **Symptom:** `cd vigil-core && npm test` runs >25 min without progressing. Cumulative CPU stays ~0.25s while elapsed time grows — hung event loop, classic open-DB-handle signature.
- **Pre-existing:** 125-01-SUMMARY.md flagged the same issue; this plan saw a longer hang (~25min+) than 125-01's 15min observation, suggesting the regression has grown.
- **Resolution:** Used the documented workaround — targeted regression smoke via `npx tsx --test <schema-importing files>` (7 files, 96 tests, 65 pass / 0 fail / 31 skipped in 22s). Plan acceptance was "regression smoke for schema typing"; targeted run satisfies it.
- **Scope:** Pre-existing pollution outside this plan's surface (2 columns + 1 migration SQL file). Not auto-fixed; logged for future cleanup wave per gsd-executor scope-boundary policy.

### Targeted test results (substitutes for full-suite acceptance)

```text
# Run 1 — schema-importing files
npx tsx --test \
  src/db/migrate.test.ts \
  src/routes/forgot-password.test.ts \
  src/routes/resend-verification.test.ts \
  src/routes/verify-email.test.ts \
  src/routes/brief-generate.test.ts \
  src/routes/reset-password.test.ts \
  src/services/brief-assembly-service.test.ts

ℹ tests 96
ℹ suites 14
ℹ pass 65
ℹ fail 0
ℹ cancelled 0
ℹ skipped 31
ℹ todo 0
ℹ duration_ms 22167.411816

# Run 2 — Wave-0 RED placeholders + bus + agent-stream (all dependents of users schema)
npx tsx --test \
  src/lib/__tests__/agent-events-bus.test.ts \
  src/routes/__tests__/agent-stream.test.ts \
  src/lib/quiet-mode-suppression.test.ts \
  src/routes/quiet-mode.test.ts

ℹ tests 39
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ skipped 12
ℹ duration_ms 1512.20402
```

Both runs exit 0 with zero failures. The 31 + 12 = 43 skipped tests are by-design Wave-0 RED placeholders (TODO(125-XX) skip reasons), plus pre-existing skipped-in-baseline tests (db-availability-gated runs that skip when no local Postgres).

## User Setup Required

None — schema migration only. Railway auto-applies on next deploy via the existing Dockerfile:18 CMD chain (`node dist/db/migrate.js && node dist/index.js`). Local dev with a running Postgres can run `cd vigil-core && npm run db:migrate` to apply now; this plan does not require it.

## Threat Flags

None. The added surface (boolean + nullable timestamp on a per-userId-scoped table) does NOT introduce new threat surface beyond what's already in the threat model (T-125-W1-01/02/03 — drift, DoS-on-deploy, info-disclosure-on-since). All three threats already had `mitigate` dispositions, and the mitigations landed:

- **T-125-W1-01 mitigated:** `grep -c "ALTER TABLE" 0019_*.sql` returns exactly 2 (only the two intended ALTERs; no stale-migration leakage).
- **T-125-W1-02 mitigated:** Both ALTERs use `IF NOT EXISTS`; default `false` for `quiet_mode` means no NULL backfill required.
- **T-125-W1-03 accepted:** Per threat register — public schema has no PII; `since` reveals only per-user-own-toggle state.

## Self-Check: PASSED

- File `vigil-core/src/db/schema.ts`: contains `quietMode: boolean("quiet_mode")` ✓
- File `vigil-core/src/db/schema.ts`: contains `quietModeSince: timestamp("quiet_mode_since"` ✓
- File `vigil-core/src/db/schema.ts`: still contains `passwordChangedAt: timestamp` (no accidental deletions) ✓
- File `vigil-core/drizzle/0019_add_users_quiet_mode.sql`: FOUND, 12 lines ✓
- File contains `ADD COLUMN IF NOT EXISTS "quiet_mode" boolean NOT NULL DEFAULT false` ✓
- File contains `ADD COLUMN IF NOT EXISTS "quiet_mode_since" timestamp with time zone` ✓
- File contains exactly 2 `ALTER TABLE` statements ✓
- File `vigil-core/drizzle/meta/_journal.json`: contains `0019_add_users_quiet_mode` (the corrected tag) ✓
- File `vigil-core/drizzle/meta/0019_snapshot.json`: FOUND, references `quiet_mode` (4 occurrences) ✓
- `cd vigil-core && npx tsc --noEmit -p tsconfig.json` exits 0 (no TypeScript regressions) ✓
- Commit `c3fa8f9` (Task 1) FOUND in `git log --oneline` ✓
- Commit `2086249` (Task 2) FOUND in `git log --oneline` ✓
- Targeted test runs (Run 1 + Run 2): exit 0, 0 failures ✓

## Next Phase Readiness

- **Plan 125-03 (suppression queue) is unblocked.** Already merged in parallel (commits `d2a1eef` + `0c145d6` landed between my Task 1 and Task 2 — Wave 1 parallelism). The queue implementation reads no column directly, but the round-trip wired in Plan 05 needs the column to exist.
- **Plan 125-05 (GET/PUT /v1/quiet-mode route) is unblocked.** The route handler `dbGet` / `dbSet` (RESEARCH lines 311-355) can now SELECT/UPDATE `users.quiet_mode` + `users.quiet_mode_since` via the Drizzle DSL.
- **Plan 125-06 (plugin filter) is indirectly unblocked.** Plugin reads no DB; it consumes the SSE `quiet_mode_changed` frame emitted by Plan 05's PUT handler.
- **Railway prod state:** Migration not yet applied. Will auto-apply on the next push-to-Railway via Dockerfile:18. Wave 4 hardware retest validates the live state end-to-end (toggle in PWA → HUD honors DND on G2).
- **No new dependencies, no new env vars, no operator action required for Wave 1.** Wave 4 brings the wallclock checkpoints (hardware retest + Even Hub submit + demo recording).

---
*Phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo*
*Plan: 02*
*Completed: 2026-05-10*
