# Phase 118: Production test-user cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 118-production-test-user-cleanup
**Areas discussed:** Execution surface, Transaction boundary, Pre-flight verification, Runbook artifact format (+ Delete-order follow-up)

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Execution surface | How DELETE runs against Railway prod (psql/migration/script) | ✓ |
| Transaction boundary | Single tx + dry-run, vs plain DELETEs, vs snapshot-then-delete | ✓ |
| Pre-flight verification | Row counts vs full smoke pass vs EXPLAIN | ✓ |
| Runbook artifact format | SQL/markdown/migration/script+md | ✓ |

**User's choice:** All four areas selected.

---

## Execution Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotent Node script | `vigil-core/scripts/cleanup-test-users.ts` via `railway run npx tsx`. Reuses Drizzle client, no DATABASE_URL on disk, idempotent. | ✓ |
| Drizzle migration .sql | Committed migration that runs on `npm run db:push`. Auditable but runs on every env. | |
| railway run psql + .sql | Saved SQL file executed via `railway run psql -f`. Simpler than Node, no TS. | |
| Direct psql with manual DATABASE_URL | Most flexible, highest drift risk. | |

**User's choice:** Idempotent Node script.
**Notes:** Aligns with the user's drift-prevention instinct (Phase 102 Anthropic key sprawl memory). Railway CLI injects DATABASE_URL at invocation; no secret on disk.

---

## Transaction Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Single tx + dry-run flag | One tx wraps all DELETEs. `--dry-run` rolls back, `--commit` swaps in COMMIT. Two-step human gate. | ✓ |
| Single tx, no dry-run | One tx, COMMIT on success. Simpler but loses the inspect-before-trigger gate. | |
| Snapshot-then-delete | Dump rows to JSON before delete. True rollback evidence; heavier artifact. | |

**User's choice:** Single tx + dry-run flag.
**Notes:** Two-step gate is the primary structural mechanism preventing accidental prod mutation. Snapshot-then-delete deemed overkill for 2 known rows.

---

## Pre-flight Verification

| Option | Description | Selected |
|--------|-------------|----------|
| ID + email match assertion | Assert `id IN (3,44)` returns exactly 2 rows AND emails match verbatim. Abort on mismatch. | ✓ |
| Match assertion + smoke pass | Above + automated seed-user smoke before delete (needs JWT). | |
| Match assertion + EXPLAIN | Above + EXPLAIN on each DELETE logged for forensics. | |

**User's choice:** ID + email match assertion.
**Notes:** Post-delete smoke pass per SC#4 is manual (runbook checklist), not automated in the script. Avoids long-lived JWT in CI.

---

## Runbook Artifact Format

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown runbook + script log | `118-RUNBOOK.md` (commands, counts, smoke, rollback) + `118-RUN-LOG.txt` (verbatim stdout) | ✓ |
| Markdown only | Just `118-RUNBOOK.md` with manually-typed counts. | |
| SQL trace dump | Markdown + raw `script`/`tee` of psql session. Heavier and noisier. | |

**User's choice:** Markdown runbook + script log.
**Notes:** Markdown is the human audit trail; .txt is machine-readable proof of what actually happened.

---

## Delete-order Follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit DELETE everywhere | Even cascade tables get explicit DELETE. Uniform row-count logging; survives schema flips. | ✓ |
| Rely on cascade where defined | Skip explicit DELETE for `password_reset_tokens` (cascade from users). Less code; counts via SELECT. | |

**User's choice:** Explicit DELETE everywhere.
**Notes:** Auditability + future-proof against `cascade → restrict` schema changes outweighs the modest verbosity cost.

---

## Claude's Discretion

- Exact log format inside `118-RUN-LOG.txt` (table / JSON lines / plain)
- Whether script is monolithic or split per-table internally
- Exit codes and error messages
- Whether to add npm script entries to `package.json`

## Deferred Ideas

- Generalized `delete-user.ts` script accepting any id (future ops-tooling phase)
- Automated post-delete smoke (requires CI JWT — out of scope)
- Soft-delete column on users (no current requirement)
- Snapshot-then-delete pattern (rejected as overkill for two known rows)
