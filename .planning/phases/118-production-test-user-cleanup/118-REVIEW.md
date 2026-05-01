---
phase: 118-production-test-user-cleanup
reviewed: 2026-04-30T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - vigil-core/scripts/cleanup-test-users.ts
  - vigil-core/tsconfig.scripts.json
  - vigil-core/package.json
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 118: Code Review Report

**Reviewed:** 2026-04-30
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

The Phase 118 cleanup script is well-engineered for a one-shot prod-mutation
tool. The safety architecture is the strongest part of the change:

- D-01 (DATABASE_URL hard-stop) correctly leverages `db === null` from
  `connection.ts` — the guard at line 152 is sound because `connection.ts:15`
  exports `null` when `DATABASE_URL` is unset.
- D-02 (single-transaction dry-run-via-throw) uses a custom `DryRunRollback`
  error class, narrowed in the catch block — clean separation between
  intentional rollback and genuine failures.
- D-03 (pre-flight email assertion before any DELETE) defends against id drift.
- D-05 (explicit DELETE per table even where `cascade` is defined) future-proofs
  against schema flips.
- Argv parsing rejects unknown flags AND mutually-exclusive `--dry-run`/`--commit`
  combos before any DB work.

No critical bugs or security issues found. One Warning (minor — connection
pool not gracefully closed) and four Info-level items, the most notable of
which is a dead-code/DRY issue: the `TARGET_IDS` and `EXPECTED_EMAILS`
constants are declared at the top of the file but **`TARGET_IDS` is never
referenced** — every WHERE clause uses the literal `[3, 44]` instead. This is
benign today but would silently betray a future maintainer who edits
`TARGET_IDS` and assumes the DELETEs follow.

## Warnings

### WR-01: Postgres connection pool never closed before `process.exit`

**File:** `vigil-core/scripts/cleanup-test-users.ts:343`
**Issue:** The script calls `process.exit(0)` at the end of `main()` without
calling `closeConnection()` (exported by `src/db/connection.ts:31`). The
`postgres` client opened on `connection.ts:12` keeps an event-loop handle
open; without `process.exit()` the script would hang indefinitely. The current
code works because the hard exit forcibly tears down the pool, but this
pattern means:

1. In-flight queries (none here, but a future maintainer adding telemetry
   after the transaction would be surprised) get killed mid-flight.
2. PostHog or other async observability appended later would lose its final
   flush.
3. Any future refactor that removes `process.exit(0)` would cause the script
   to hang forever in CI (Railway run waits for stdout EOF).

**Fix:** Replace `process.exit(0)` with an explicit close + natural exit, and
mirror the same in the failure paths:

```ts
import { db, closeConnection } from "../src/db/connection.js";

// at end of main()
await closeConnection();
// no process.exit — let the event loop drain naturally on success.

// in catch block (genuine failure)
} else {
  console.error("Transaction FAILED — ROLLED BACK. No prod mutation.");
  console.error(err);
  await closeConnection();
  process.exit(1);
}
```

For now the existing behavior is acceptable (script runs once, hard-exits),
but a `// TODO: graceful close` comment near line 343 would warn future
editors not to remove `process.exit(0)` without adding `closeConnection()`.

## Info

### IN-01: `TARGET_IDS` constant declared but never referenced

**File:** `vigil-core/scripts/cleanup-test-users.ts:60`
**Issue:** `const TARGET_IDS = [3, 44] as const;` is declared at line 60 but
never used. Every query (the pre-flight at line 171 and all 14 DELETEs at
lines 209, 217, 225, 233, 241, 249, 257, 265, 273, 281, 289, 297, 305, 313)
uses the literal `[3, 44]` instead. This means:

- A future operator who updates `TARGET_IDS` to add a third test-user id
  will see no behavior change — every `inArray(...)` still hard-codes
  `[3, 44]`. Silent latent bug.
- DRY violation: the magic literal is repeated 15 times.

**Fix:** Either delete the unused constant, or (preferred) thread it through
every `inArray()` call:

```ts
const TARGET_IDS = [3, 44] as const;

// pre-flight
.where(inArray(users.id, TARGET_IDS as unknown as number[]))

// each delete
.where(inArray(thoughtLinks.userId, TARGET_IDS as unknown as number[]))
// ...etc for all 14 deletes
```

The `as unknown as number[]` cast is needed because drizzle's `inArray`
expects `number[]`, not `readonly [3, 44]`. Alternatively drop `as const`:

```ts
const TARGET_IDS: number[] = [3, 44];
```

This eliminates the cast and matches `EXPECTED_EMAILS` (which uses a plain
`Record<number, string>`).

### IN-02: `EXPECTED_EMAILS` and `TARGET_IDS` could drift

**File:** `vigil-core/scripts/cleanup-test-users.ts:60-64`
**Issue:** The two constants encode the same information (which ids to
target) in two shapes. If a third test user were ever added, an operator
must update both `TARGET_IDS` and `EXPECTED_EMAILS` AND the literal `[3, 44]`
in 15 places (per IN-01). Drift risk.

**Fix:** Collapse to a single source of truth:

```ts
const TARGETS = {
  3: "upper@case.com",
  44: "test+phase104@local.test",
} as const;

const TARGET_IDS = Object.keys(TARGETS).map(Number);
const EXPECTED_EMAILS: Record<number, string> = TARGETS;
```

Then `TARGET_IDS` derives from `TARGETS` automatically.

### IN-03: `tsconfig.scripts.json` rebuilds `src/**/*` redundantly

**File:** `vigil-core/tsconfig.scripts.json:9`
**Issue:** `include: ["scripts/migrate-102-seed.ts", "scripts/cleanup-test-users.ts", "src/**/*"]`
re-compiles every file under `src/` into `dist/scripts/src/...`. The main
`tsconfig.json` already emits `src/**/*` to `dist/`, so the second pass is
duplicate work and produces shadowed `.js` files at `dist/scripts/src/db/...`.

The duplication is required only because `cleanup-test-users.ts` imports
relative paths like `../src/db/connection.js` and the scripts compile must
resolve those imports. But that doubles the build output footprint.

Additionally, **`cleanup-test-users.ts` has no compiled-prod npm script** —
both `cleanup:test-users:dry-run` (line 23) and `cleanup:test-users:commit`
(line 24) in `package.json` invoke `tsx` directly, never `node dist/...`.
Compiling the file at all is unnecessary unless a future "cleanup-prod" entry
is added. The Phase 118 design intentionally runs via `railway run npx tsx`,
so the compile is dead build output today.

**Fix (low priority):** If `tsx` is the only intended invocation path, drop
`scripts/cleanup-test-users.ts` from `tsconfig.scripts.json` `include` and
keep the file out of the build. The `migrate-102-seed.ts` entry stays
because `db:migrate-102-prod` (line 16) genuinely needs the compiled artifact.

If a future "compiled cleanup" path is desired, leave the include and add a
note explaining why both `tsx` and compiled paths exist.

### IN-04: Schema-drift footgun has no programmatic guard

**File:** `vigil-core/scripts/cleanup-test-users.ts:32-36, 105-120`
**Issue:** The `TABLE_ORDER` array and the 14 explicit `tx.delete(...)` calls
hard-code the current set of user-scoped tables. The header comment (lines
32–36) calls this out, but there is no runtime check. If a future migration
adds a 15th user-scoped table (e.g., `user_preferences`) and someone forgets
to update this script, a re-run would:

- Pass the pre-flight (users 3 + 44 still match).
- Fail the final `tx.delete(users)` if the new table has `restrict` FK
  (good — script aborts loudly).
- Silently leave orphans if the new table has `cascade` FK (bad — orphans
  in the new table get cascade-deleted but rows in OTHER tables that
  reference the orphaned children remain). Less likely but possible.

**Fix (deep refactor, optional):** Add a startup check that introspects
`information_schema.columns` for any column named `user_id` and warns if it
is not in `TABLE_ORDER`:

```ts
const knownTables = new Set(TABLE_ORDER);
const found = await db.execute<{ table_name: string }>(sql`
  SELECT DISTINCT table_name
  FROM information_schema.columns
  WHERE column_name = 'user_id'
    AND table_schema = 'public'
`);
const unknown = found.filter((r) => !knownTables.has(r.table_name));
if (unknown.length > 0) {
  console.error(`Schema drift detected: ${unknown.map(r => r.table_name).join(", ")}`);
  console.error("Update TABLE_ORDER and add a tx.delete() call before running.");
  process.exit(1);
}
```

This converts the doc-only warning into a hard guard. Skipping for v1 is
acceptable — Phase 118 already executed cleanly and the runbook covers post-
cleanup orphan verification — but worth queuing if this script is ever
generalized beyond a one-shot.

---

_Reviewed: 2026-04-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
