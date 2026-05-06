---
phase: 118-production-test-user-cleanup
plan: 01
subsystem: ops
tags: [drizzle, postgres, ops-tooling, transactions, dry-run]

# Dependency graph
requires:
  - phase: 102-multi-user-foundation
    provides: users table + 12 user-scoped tables with FK onDelete:restrict (script must DELETE children-first)
  - phase: 108-work-order-status-userid
    provides: work_order_statuses composite PK (userId, caseNumber)
  - phase: 112-forgot-password
    provides: password_reset_tokens table (cascade FK, but explicit DELETE per D-05)
  - phase: 113-verify-email
    provides: email_verified_at column (no schema impact on cleanup)
provides:
  - Idempotent cleanup script targeting id=3 + id=44 across 14 user-scoped tables
  - Two-step gate (--dry-run default, --commit explicit) with single-tx ROLLBACK/COMMIT semantics
  - D-03 pre-flight email assertion as defense against id drift
  - Reusable pattern for future one-shot ops scripts (children-first DELETE order, explicit DELETE per D-05)
affects:
  - 118-02-prod-execution-runbook (invokes this script via railway run for dry-run + commit captures)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One-shot ops script: scripts/{verb}-{noun}.ts with --dry-run-by-default + --commit gate"
    - "Throw-inside-tx ROLLBACK trigger via custom DryRunRollback error class"
    - "Pre-flight assertion BEFORE entering db.transaction() — abort path is unconditional"
    - "tsconfig.scripts.json widened rootDir to project root + include src/**/* — scripts that import from ../src/ now type-check cleanly"

key-files:
  created:
    - vigil-core/scripts/cleanup-test-users.ts
  modified:
    - vigil-core/tsconfig.scripts.json
    - vigil-core/package.json

key-decisions:
  - "tsconfig.scripts.json rootDir widened to ./ (was ./scripts) so scripts importing from ../src/ type-check cleanly — restores parity between scripts/ and src/"
  - "Optional npm scripts (cleanup:test-users:dry-run / :commit) added without --env-file=.env — preserves D-01 (Railway CLI is the only DATABASE_URL injection mechanism)"
  - "DryRunRollback custom error class (not a generic throw) — type-narrowable in catch block, distinct from genuine tx failures"
  - "Hard-coded 14 table DELETE order in source (not derived from schema) — runbook explicitness; future schema additions MUST update this script (header docblock notes the contract)"
  - "Explicit DELETE on password_reset_tokens despite cascade FK (D-05) — uniform per-table row counting, robust under future cascade→restrict flips"

patterns-established:
  - "Pre-flight gate before db.transaction(): SELECT, assert count + per-row equality, exit 1 on mismatch BEFORE issuing any DELETE"
  - "Banner+table stdout shape (TABLE / ROWS DELETED / TOTAL) parseable into runbook RUN-LOG.txt"
  - "Argv flag parsing matches existing scripts (process.argv.includes / parseArg) — no commander/yargs dependency"
  - "Both-flag rejection + unknown-flag rejection — explicit non-zero exit with actionable error message"

requirements-completed: [OPS-01]

# Metrics
duration: 3min
completed: 2026-04-30
---

# Phase 118 Plan 01: Cleanup Script Summary

**Idempotent two-step cleanup script (`vigil-core/scripts/cleanup-test-users.ts`) deleting test users id=3 + id=44 and all child rows across 14 user-scoped tables, with D-03 pre-flight email assertion gating a single-transaction --dry-run/--commit ROLLBACK/COMMIT gate.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-30T22:58:21Z
- **Completed:** 2026-04-30T23:01:00Z
- **Tasks:** 1
- **Files modified:** 3 (1 created, 2 updated)

## Accomplishments

- `vigil-core/scripts/cleanup-test-users.ts` created — 355-line idempotent cleanup script implementing all four locked decisions (D-01 DATABASE_URL gate, D-02 tx ROLLBACK/COMMIT, D-03 pre-flight email assertion, D-05 explicit DELETE per table)
- `tsconfig.scripts.json` widened so scripts importing from `../src/` type-check cleanly under `npx tsc --noEmit -p tsconfig.scripts.json` (was rootDir: ./scripts, now rootDir: ./ + include src/**/*)
- Optional `cleanup:test-users:dry-run` and `cleanup:test-users:commit` npm scripts added (intentionally NO `--env-file=.env` — preserves D-01 Railway CLI as sole DATABASE_URL source)
- All 6 plan automated greps PASS, all 4 runtime acceptance gates PASS (both-flags rejected, unknown-flag rejected, missing-DATABASE_URL rejected with railway-run guidance, type-check clean exit 0)

## Task Commits

1. **Task 1: Write cleanup-test-users.ts with safety mechanisms** — `a78d7be` (feat)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified

- `vigil-core/scripts/cleanup-test-users.ts` — Created. Cleanup script: pre-flight email assertion, single db.transaction() wrapping 14 children-first DELETEs, DryRunRollback class triggers ROLLBACK on dry-run, banner+table stdout output for RUN-LOG capture.
- `vigil-core/tsconfig.scripts.json` — Modified. rootDir widened to project root; include adds `scripts/cleanup-test-users.ts` and `src/**/*` so the new script's `../src/db/connection.js` and `../src/db/schema.js` imports resolve under `tsc --noEmit`.
- `vigil-core/package.json` — Modified. Added `cleanup:test-users:dry-run` and `cleanup:test-users:commit` npm scripts (no `--env-file=.env` per D-01).

## Decisions Made

- **tsconfig.scripts.json widening (deviation Rule 3):** the existing config had `rootDir: ./scripts` which only worked for `migrate-102-seed.ts` (no `../src/` imports). Widened rootDir to project root and added `src/**/*` to include so the cleanup script's `../src/db/connection.js` import type-checks. Plan called for `tsc --noEmit -p tsconfig.scripts.json` to exit 0 — without this fix, that automated check would fail.
- **DryRunRollback custom error class** chosen over generic `throw new Error(...)` so the catch block can `instanceof`-narrow and distinguish the dry-run path from any genuine tx failure. Type-safe and readable.
- **Hard-coded 14 table DELETE order in source** (rather than deriving from schema) per D-05 rationale: runbook explicitness, robust under future cascade→restrict flips, header docblock documents the schema-drift contract for future migrations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsconfig.scripts.json rootDir blocked `../src/` imports**

- **Found during:** Task 1 (running plan's automated `tsc --noEmit -p tsconfig.scripts.json` check)
- **Issue:** The existing `tsconfig.scripts.json` had `rootDir: ./scripts`, meaning the new script's `import { db } from "../src/db/connection.js"` triggered TS6059 "File … is not under 'rootDir'". Plan's automated verify command would have failed even though the script itself was correct.
- **Fix:** Widened `rootDir` to `./` (project root) and extended `include` to add `src/**/*` so transitively-imported source files resolve under the same project. Pre-existing `migrate-102-seed.ts` continues to work (it was always self-contained, no `../src/` imports).
- **Files modified:** `vigil-core/tsconfig.scripts.json`
- **Verification:** `npx tsc --noEmit -p tsconfig.scripts.json` exits 0 (was: 2 TS6059 errors)
- **Committed in:** `a78d7be` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy plan's own automated verification gate. No scope creep — purely an unblocking config widening that preserves existing script behavior.

## Issues Encountered

None beyond the deviation noted above.

## User Setup Required

None at this plan boundary. Plan 02 will document the `railway run npx tsx scripts/cleanup-test-users.ts --dry-run` then `--commit` operator workflow as the runbook.

## Next Phase Readiness

- **Plan 02 (118-02-prod-execution-runbook)** is now unblocked. The cleanup script is in place, type-checks clean, rejects all the structural error paths (both flags, unknown flag, missing DB), and is ready for `railway run` invocation against prod.
- **D-01 invariant preserved:** no `DATABASE_URL` introduced to local disk. The added npm scripts intentionally omit `--env-file=.env` so Plan 02's `railway run` injection remains the sole path.
- **Idempotency:** a successful `--commit` followed by a re-run will log `0 rows` for every table. Plan 02 should consider running a post-commit re-invocation as part of the runbook to attest idempotency.
- **Schema drift detection:** the script's header docblock notes that future schema additions MUST update this script's table list. If a 15th user-scoped table lands without a corresponding update, orphans would surface only on hypothetical id reuse — low severity for v3.7 closeout but documented as a known limitation (T-118-01-06 in plan threat model).

## Self-Check: PASSED

**Files exist:**
- `vigil-core/scripts/cleanup-test-users.ts` — FOUND
- `vigil-core/tsconfig.scripts.json` — FOUND (modified)
- `vigil-core/package.json` — FOUND (modified)

**Commits exist:**
- `a78d7be` (Task 1: feat(118-01) add idempotent cleanup-test-users script) — FOUND in `git log`

**Acceptance criteria checks (all PASS):**
- TypeScript compile clean: `npx tsc --noEmit -p tsconfig.scripts.json` → exit 0
- Both-flag rejection: `--dry-run --commit` → exit 1 with "Cannot pass both" message
- Unknown-flag rejection: `--bogus-flag` → exit 1 with "Unknown flag" message
- Missing DATABASE_URL: → exit 1 with "Use 'railway run …' per D-01" guidance
- File contains literal `[3, 44]` — confirmed (lines 60, 170, plus 14 DELETE call sites)
- File contains literal `upper@case.com` — confirmed (line 62 + 3 doc/log refs)
- File contains literal `test+phase104@local.test` — confirmed (line 63 + 3 doc/log refs)
- File contains literal `db.transaction(` — confirmed (line 204)
- File imports all 14 schema exports + db from `../src/db/connection.js` — confirmed
- Pre-flight `.from(users)` (line 170) appears textually BEFORE `db.transaction(` (line 204) — confirmed

---
*Phase: 118-production-test-user-cleanup*
*Completed: 2026-04-30*
