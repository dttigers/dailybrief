---
phase: 55
status: PASSED
outcome: NO-OP
date: 2026-04-08
---

# Phase 55 Verification — NO-OP Outcome

Phase 55's stated goal — "schema changes to vigil-core land on Railway Postgres automatically when a commit is pushed, eliminating the manual `npx tsx src/db/migrate.ts` step" — was already met before this phase began. The implementation lives in `vigil-core/Dockerfile:17` (commit `3ffa8ce`, Phase 39-01, 2026-04-05) via the CMD chain `sh -c "node dist/db/migrate.js && node dist/index.js"`. This was verified live twice: first during `/gsd-discuss-phase` on 2026-04-08, and again during this plan execution on 2026-04-08. No code was written in this phase. See `55-CONTEXT.md D-01` for the full decision record.

## Success Criteria

The three criteria from ROADMAP.md, reproduced verbatim, with satisfaction notes:

1. **Pushing a commit that introduces a new drizzle migration causes Railway to apply it before the new code starts serving traffic**

   **Satisfied by:** `vigil-core/Dockerfile:17` — the chained CMD `sh -c "node dist/db/migrate.js && node dist/index.js"` runs `node dist/db/migrate.js` first on every container start. The new image is built from the pushed commit (including any new migration SQL files in `./drizzle/`), migrate runs before `node dist/index.js` starts, so traffic only flows once migrations are applied.

2. **A migration that fails on prod fails the deploy loud — no half-migrated database, no successful boot against an out-of-date schema**

   **Satisfied by:** Shell `&&` semantics at `vigil-core/Dockerfile:17` — if `node dist/db/migrate.js` exits non-zero, `node dist/index.js` never runs and the container exits immediately, which Railway surfaces as a crashed deploy. The old container continues serving until the new one replaces it; a crash means replacement never happens, so the old schema keeps serving. (Note: loudness could be improved by moving to `preDeployCommand` — deferred to D-04 below.)

3. **Re-deploys without new migrations are still safe (drizzle migrator is already idempotent)**

   **Satisfied by:** Drizzle's `__drizzle_migrations` tracking table — re-running migrate is a no-op when all migrations are already applied. Observed live in the railway logs: `NOTICE: relation "__drizzle_migrations" already exists, skipping`. Each migration file is tracked by name and only applied once.

## Re-verification Recipe

To re-verify that migrations are still running on every Railway deploy:

```
cd vigil-core && railway logs --deployment | tail -50
```

All three of the following literal strings must appear in the output:

- `[migrate] Running migrations...`
- `[migrate] Migrations complete`
- `Vigil Core API running on port 8080`

If any of the three strings is absent, the NO-OP premise has changed — reopen via `/gsd-discuss-phase 55 --refresh`.

### Captured log excerpt — 2026-04-08 (this plan execution)

```
Starting Container
[vigil-core] PostgreSQL connection verified
[migrate] Running migrations...
{
  severity_local: 'NOTICE',
  severity: 'NOTICE',
  code: '42P06',
  message: 'schema "drizzle" already exists, skipping',
  file: 'schemacmds.c',
  line: '132',
  routine: 'CreateSchemaCommand'
}
{
  severity_local: 'NOTICE',
  severity: 'NOTICE',
  code: '42P07',
  message: 'relation "__drizzle_migrations" already exists, skipping',
  file: 'parse_utilcmd.c',
  line: '208',
  routine: 'transformCreateStmt'
}
[migrate] Migrations complete
Vigil Core API running on port 8080
```

Grep count for all three required strings: `3` (all present).

### Captured log excerpt — 2026-04-08 (prior discuss-phase session)

```
Starting Container
[vigil-core] PostgreSQL connection verified
[migrate] Running migrations...
  NOTICE: schema "drizzle" already exists, skipping
  NOTICE: relation "__drizzle_migrations" already exists, skipping
[migrate] Migrations complete
Vigil Core API running on port 8080
```

## Deferred

### D-04: preDeployCommand hardening

Move `node dist/db/migrate.js` out of the Dockerfile CMD into a `vigil-core/railway.json` `deploy.preDeployCommand`. Benefits: migration failure surfaces as a failed deploy in the Railway dashboard instead of a flapping container; old container keeps serving until the new migration succeeds (zero downtime); cleaner rollback path. Cost: half-day phase, real risk of breaking a setup that demonstrably works. **Trigger to revisit:** the first time a migration actually fails in prod and the restart-loop becomes an incident.

### D-05: CI migration check

Run `node dist/db/migrate.js` against an ephemeral Postgres in CI before allowing a merge. Catches migration bugs at PR time. **Blocked on:** vigil-core has no CI yet. Belongs in a future "CI scaffolding" phase, not v2.3.
