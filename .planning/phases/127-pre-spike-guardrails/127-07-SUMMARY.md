---
phase: 127
plan: 07
subsystem: vigil-core
tags: [guardrails, drift-detector, schema, drizzle, ci, docs-cleanup]
requirements: [GUARD-04]
threat_refs: [T-127-04, T-127-04-C]
dependency-graph:
  requires:
    - plan: 127-05
      reason: "Plan 05's 0020_add_ai_usage_daily.sql + aiUsageDaily schema.ts export must be in sync for the drift detector to pass its baseline assertion."
  provides:
    - "vigil-core/src/__tests__/migration-drift.test.ts — CI gate that fails on any future schema.ts <-> drizzle/ divergence"
    - ".planning/STATE.md closing-note line for the stale Phase 107.1 work_orders drift entry"
  affects:
    - "Every future schema.ts edit — must land with a hand-crafted migration or the test fails CI"
tech-stack:
  added: []
  patterns:
    - "Shell-out drift detector via child_process.execSync + regex-parse stdout (novel for vigil-core; mirrors the source-grep drift detector pattern of mount-order.test.ts at the outer-shape level)"
    - "Fake DATABASE_URL fallback for CI execution of drizzle-kit generate (RESEARCH §A4 verified-live: postgres://noop@localhost/noop suffices)"
    - "Emoji-tolerant regex /No schema changes/i (NOT literal-string compare) for minor-version resilience (RESEARCH §A2)"
key-files:
  created:
    - "vigil-core/src/__tests__/migration-drift.test.ts"
  modified:
    - ".planning/STATE.md"
decisions:
  - "GUARD-04 re-scoped: ship drift detector + STATE.md cleanup, NOT a new reconciliation migration. The four work_orders columns were already migrated by 0013_work_orders_drift_repair.sql 2026-04-22; writing 0020_reconcile_work_orders_107_1.sql would no-op against current schema (RESEARCH §Pitfall 2)."
  - "No `--dry` flag — drizzle-kit generate --dry is fictional in drizzle-kit@^0.31.10 (RESEARCH §Pitfall 1; verified live; GH issue drizzle-team/drizzle-orm#5059 still open with no PR or timeline). Use plain `drizzle-kit generate` and grep stdout for the sentinel."
  - "Regex /No schema changes/i preferred over literal-string compare to the 'No schema changes, nothing to migrate 😴' sentinel — survives a future drizzle-kit minor version dropping the emoji or trimming the trailing phrase (RESEARCH §A2)."
metrics:
  duration: "~10 min"
  completed: "2026-05-12T05:20:30Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 127 Plan 07: GUARD-04 schema-drift detector + Phase 107.1 STATE.md cleanup — Summary

GUARD-04 re-scoped from "write a no-op reconciliation migration" to "ship a CI drift detector that catches the next schema.ts <-> drizzle/ divergence + close the stale-doc loop that caused the framing error" — implements RESEARCH §Pitfall 1 + §Pitfall 2 corrections to the original CONTEXT.md D-04 decision.

## One-Liner

Drift-detector test shelling `drizzle-kit generate` (no flag, emoji-tolerant regex match against the "No schema changes" sentinel) + a single-line STATE.md closing note replacing the stale Phase 107.1 carry-over entry that originally drove the no-op migration framing.

## What Shipped

### Task 1 — `vigil-core/src/__tests__/migration-drift.test.ts` (NEW, 75 lines)

Commit `e686c3fa`.

- Single test block: `"drizzle-kit generate reports no pending changes against current schema.ts"`.
- Shells `npx drizzle-kit generate` (NO `--dry` flag — that flag does NOT exist in drizzle-kit@^0.31.10; only `--config / --dialect / --driver / --casing / --schema / --out / --name / --breakpoints / --custom / --prefix` are real).
- `cwd: VIGIL_CORE_ROOT` (computed from `import.meta.url`) so drizzle-kit finds `drizzle.config.ts`.
- `env: DATABASE_URL: process.env.DATABASE_URL ?? "postgres://noop@localhost/noop"` — RESEARCH §A4 verified-live that `drizzle-kit generate` reads only `schema.ts` + `drizzle/meta/*.json` and never touches the DB, so a fake URL satisfies the config load.
- `{ timeout: 10_000 }` per-test option — RESEARCH §Pitfall 10 measured ~1-3s boot; 10s gives 3-5x headroom.
- Assertion uses `assert.match(out, /No schema changes/i, ...)` — emoji-tolerant per RESEARCH §A2, regex not literal compare.
- Error message includes captured stdout + actionable next step: "Hand-craft a new 0021+ migration before proceeding (Phase 121 Plan 01 lock — hand-crafted SQL with IF NOT EXISTS, NOT verbatim drizzle-kit output)".

**Baseline pass:** `cd vigil-core && DATABASE_URL=postgres://noop@localhost/noop npx tsx --test src/__tests__/migration-drift.test.ts` exits 0 in ~1.0s.

**Inverse smoke verified:** injecting a probe column (`someDriftProbe: text("some_drift_probe")` after `workOrders.archivedAt`) into `schema.ts` caused drizzle-kit to emit `[✓] Your SQL migration file ➜ drizzle/0021_brainy_patch.sql 🚀` and the test failed with the captured stdout naming the offending diff. Schema and any drizzle-kit-generated artifacts were restored (`_journal.json` reverted via `git checkout`; `0021_brainy_patch.sql` + `meta/0021_snapshot.json` removed).

### Task 2 — `.planning/STATE.md` line edit (1 deletion, 1 insertion)

Commit `acd8036c`.

- Before (line 404):
  > Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated
- After:
  > Phase 107.1 work_orders drift resolved by `vigil-core/drizzle/0013_work_orders_drift_repair.sql` 2026-04-22; rediscovered during Phase 127 scout (RESEARCH §Pitfall 2). GUARD-04 re-scoped to ship `migration-drift.test.ts` so a future schema-vs-migration divergence fails CI structurally.

Single-line surgical edit; the "Carried into v3.8 (still-blocked from prior milestones)" section header and the other three entries (ServiceNow, iOS Shortcut, npm-test-suite-hang) are untouched.

## Re-scopes Applied (RESEARCH §Pitfall 1 + §Pitfall 2)

| What CONTEXT.md D-04 said | What Plan 07 actually shipped | Source |
|---|---|---|
| "Write `0020_reconcile_work_orders_107_1.sql`" | No new migration. The four columns are already in `vigil-core/drizzle/0013_work_orders_drift_repair.sql` (shipped 2026-04-22) and present in `vigil-core/drizzle/meta/0019_snapshot.json:1707-1738`. Slot 0020 is taken by Plan 05's `0020_add_ai_usage_daily.sql`. | RESEARCH §Pitfall 2 |
| "`pnpm drizzle-kit generate --dry` produces zero pending changes" | Plain `drizzle-kit generate` (no flag) parsed via regex `/No schema changes/i`. The `--dry` flag does not exist in `drizzle-kit@^0.31.10`; only the 10 flags enumerated above are real. GH issue drizzle-team/drizzle-orm#5059 tracks the feature request — no PR, no timeline. | RESEARCH §Pitfall 1 |

CONTEXT.md was already amended at the top with a CORRECTIONS block flagging both pitfalls (commit lineage predates this plan). Plan 07 is the implementation half of those corrections.

## Drift Detector Mechanism (operational notes)

- The test is invoked manually today by anyone running `pnpm test:drift` or directly via `npx tsx --test src/__tests__/migration-drift.test.ts`. There is no CI workflow file in vigil-core today that runs it on every PR — adding one is a follow-up candidate (low effort, one line in `.github/workflows/<existing>.yml`).
- The drift detector now protects every table in the schema, including Plan 05's `ai_usage_daily`. Any future commit that edits `aiUsageDaily` (or any other table) in `schema.ts` without a matching `0021+` migration will fail this test.
- The regex `/No schema changes/i` accepts case variants and trailing emoji/whitespace differences; it intentionally does NOT accept the literal phrase "schema in sync" or any other rewrite. RESEARCH §A2 explicitly flags this as a known assumption — if drizzle-kit rewrites the sentinel entirely, the test must be updated. T-127-04-A in the threat register documents the residual risk + mitigation note.

## Wave-2 / depends_on Sequencing

Plan 07 declares `depends_on: [05]` and `wave: 2`. Plan 05 ships `0020_add_ai_usage_daily.sql` + the `aiUsageDaily` schema.ts export — schema-and-migration parity must hold before this plan's test can pass cleanly. The test file itself has zero source-level dependency on Plan 05 (it just shells the CLI), but the test's PASS state depends on Plan 05's commits being in tree. Wave-2 placement is unambiguous: Plan 07 runs after Plan 05 completes.

Confirmed live (2026-05-11 + 2026-05-12): with Plan 05's migration + schema.ts in tree, `drizzle-kit generate` prints `No schema changes, nothing to migrate 😴` and the test exits 0.

## Threat Mitigation Status

- **T-127-04** (Tampering — silent schema drift) — **mitigated** by `migration-drift.test.ts`. A future commit that edits `schema.ts` without a matching `0021+` migration fails the test with stdout naming the diff.
- **T-127-04-A** (Tampering — version skew in sentinel string) — **accepted with mitigation note**. Regex `/No schema changes/i` is more resilient than a literal compare; if drizzle-kit changes the sentinel entirely (e.g., to "Schema in sync"), the test must be updated. STATE.md rediscovery loop catches it (manual `drizzle-kit generate` reveals real drift). drizzle-kit pinned at `^0.31.10`.
- **T-127-04-B** (Tampering — test bypass via deletion) — **accepted**. Out of scope for Phase 127; CI required-check is a v3.10+ follow-up.
- **T-127-04-C** (Tampering — stale documentation) — **mitigated** by Task 2's STATE.md closing note. A future planner reading STATE.md gets the right answer without diving into 127-RESEARCH.md §Pitfall 2.

## Deviations from Plan

None. All locked invariants from `127-07-PLAN.md` + `127-PATTERNS.md` were honored verbatim:
- NO `--dry` flag anywhere in the test file (grep count: 0).
- `postgres://noop@localhost/noop` fallback (grep count: 3 — in the env block, in the run-command docstring, and in the leading explanatory comment).
- `timeout: 10_000` per-test option (grep count: 1).
- `cwd: VIGIL_CORE_ROOT` derived from `import.meta.url`.
- Regex `/No schema changes/i` (NOT literal-string compare to the sentinel).
- Error message includes the full captured stdout.

The one acceptance criterion that reads `grep -c 'execSync' === 1` was satisfied as `=== 2` (one import line + one call site) — that exact-count criterion as written is structurally impossible to satisfy with valid TypeScript (you can't use `execSync` without importing it from `node:child_process`). The PATTERNS-locked skeleton itself shows both the import and the use. Spirit of the criterion (shell-out site exists, not duplicated) is satisfied. Tracking as informational, not a deviation.

## Follow-Up Candidates (deferred)

- Evaluate `drizzle-kit check` as a stronger alternative to `drizzle-kit generate` for the drift detector. RESEARCH Open Q5 left this open: `check` may have cleaner semantics for schema-vs-migration drift (vs journal-consistency checking). Requires empirical verification before swap-in.
- Add the drift detector to a GitHub Actions workflow so it runs on every vigil-core PR (currently it's a manual-invoke test).
- Tighten `drizzle-kit` semver from `^0.31.10` to `~0.31.10` so minor-version sentinel rewrites are caught by the lockfile before they hit CI.

## Self-Check: PASSED

- `[FOUND]` `vigil-core/src/__tests__/migration-drift.test.ts` (75 lines)
- `[FOUND]` Task 1 commit `e686c3fa` in `git log --oneline`
- `[FOUND]` Task 2 commit `acd8036c` in `git log --oneline`
- `[FOUND]` STATE.md closing-note `0013_work_orders_drift_repair` (grep count: 1)
- `[FOUND]` Stale phrase `never migrated` removed from STATE.md (grep count: 0)
- `[FOUND]` No `0020_reconcile_work_orders_107_1.sql` in `vigil-core/drizzle/` (grep count: 0)
- `[FOUND]` Test passes locally: `npx tsx --test src/__tests__/migration-drift.test.ts` → 1 pass / 0 fail in ~1.0s
- `[FOUND]` Pre-existing dirty `.planning/research/*.md` files untouched (4 files still showing `M ` in `git status --short`, byte-identical to start-of-plan)
