# Phase 55 Verification Report

**Phase:** 55 — Auto-run drizzle migrations on Railway deploy
**Outcome type:** NO-OP
**Report date:** 2026-04-08
**Overall verdict:** PARTIAL

---

## Success Criteria — Per-Criterion Verdict

### Criterion 1: Pushing a commit that introduces a new drizzle migration causes Railway to apply it before the new code starts serving traffic

**Verdict: SATISFIED**

Evidence: `vigil-core/Dockerfile:17` (confirmed present, line 17 reads exactly):
```
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
```
Shell `&&` guarantees migrate runs and exits 0 before `node dist/index.js` is invoked. The new container image includes any migration SQL files committed to `./drizzle/`. Live Railway log captured 2026-04-08 confirms the sequence:
```
[migrate] Running migrations...
[migrate] Migrations complete
Vigil Core API running on port 8080
```
`vigil-core/src/db/migrate.ts:15` calls `migrate(db, { migrationsFolder: "./drizzle" })` using the `drizzle-orm/postgres-js/migrator` runtime path (not drizzle-kit), which is correct for production.

---

### Criterion 2: A migration that fails on prod fails the deploy loud — no half-migrated database, no successful boot against an out-of-date schema

**Verdict: PARTIALLY SATISFIED**

What is true:
- `vigil-core/migrate.ts:8-9` calls `process.exit(1)` if `DATABASE_URL` is unset — hard exit before any migration runs.
- Shell `&&` semantics at `Dockerfile:17` mean: if `node dist/db/migrate.js` exits non-zero (due to a migration error thrown by drizzle's migrator), `node dist/index.js` never starts. The container exits non-zero immediately. No half-booted API server.
- drizzle's migrator runs migrations inside a transaction per file (drizzle-orm default); a failure rolls back the in-progress migration so the DB does not end up half-migrated.

What is NOT true (the "loud" gap):
- The failure surface is a **crash-looping container**, not a clean "deploy rejected" signal. Railway will restart the container, which means it crash-loops rather than holding the old container steady and quarantining the new one. The old container is gone by the time the new one starts (Railway swaps containers, it does not run them in parallel). This means a failed migration produces a brief outage, not a zero-downtime rejection.
- A `vigil-core/railway.json` `preDeployCommand` would quarantine the new container before the old one is terminated, achieving zero-downtime rejection. That pattern does not exist in the codebase — `vigil-core/railway.json` does not exist.
- `55-CONTEXT.md D-04` explicitly names this gap and defers it: trigger is "the first time a migration actually fails in prod and the restart-loop becomes an incident."

Summary for criterion 2: "no successful boot against an out-of-date schema" — TRUE. "fails loud" — partially true (Railway surfaces it as a crashed deploy, but via crash-loop rather than clean deploy rejection). The "no half-migrated database" claim is supported by drizzle transaction semantics, though this relies on drizzle internals rather than explicit test evidence.

---

### Criterion 3: Re-deploys without new migrations are still safe (drizzle migrator is already idempotent)

**Verdict: SATISFIED**

Evidence: Live railway log from 2026-04-08 (captured in `55-VERIFICATION.md`):
```
{
  message: 'schema "drizzle" already exists, skipping',
  ...
}
{
  message: 'relation "__drizzle_migrations" already exists, skipping',
  ...
}
[migrate] Migrations complete
```
drizzle's `__drizzle_migrations` tracking table is created once and each migration file is recorded by name. Re-running on a fully-migrated database produces only NOTICE-level skips and exits 0. Observed live, not inferred.

---

## Artifact Existence Checks

| Artifact | Expected | Present | Check |
|----------|----------|---------|-------|
| `vigil-core/Dockerfile:17` | CMD chain `migrate.js && index.js` | YES | Confirmed at line 17, exact text matches |
| `.planning/ROADMAP.md` — Phase 55 NO-OP status line | `**Status**: NO-OP (verified 2026-04-08)...` | YES | `grep -c` returns `1` |
| `.planning/phases/55-.../55-VERIFICATION.md` | `outcome: NO-OP` + all 5 required strings | YES | Plan's own verify command prints `ALL FIVE PRESENT` |
| `.planning/phases/55-.../55-01-SUMMARY.md` | Summary of verify+document actions | YES | File present, documents commits `4f15368` and `1adcc5a` |
| `.planning/phases/55-.../55-01-PLAN.md` | NO-OP plan with 3 tasks | YES | File present |
| `.planning/phases/55-.../55-CONTEXT.md` | Decision record (D-01 through D-07) | YES | File present |

---

## git log Confirmation — No vigil-core/ Files Touched

Command run: `git log --oneline 03a57a9..HEAD -- vigil-core/`
(03a57a9 = "docs(55): discuss-phase — phase closes as NO-OP, premise was wrong" — the discuss-phase commit that opened the phase)

Output: empty — zero commits.

All Phase 55 commits (`4f15368`, `1adcc5a`, `27412cf`, `03a57a9`, `a7b6267`) have messages prefixed `docs(55)` and touched only `.planning/` files. No `vigil-core/` path appears in any of them.

---

## Overall Verdict: PARTIAL

**Criteria 1 and 3: SATISFIED** — migration auto-apply and idempotency are live and verified by Railway log evidence.

**Criterion 2: PARTIALLY SATISFIED** — failed migrations do prevent the API from booting against an out-of-date schema (the `&&` chain ensures this), but the failure mode is a crash-looping container rather than a zero-downtime deploy rejection. The old container is not preserved during the restart window. This is a known, explicitly deferred gap (D-04 in `55-CONTEXT.md`): moving migrate to `preDeployCommand` in `vigil-core/railway.json` would close it. Trigger: first prod migration failure incident.

**NO vigil-core/ code was modified by this phase.** The phase correctly closed as NO-OP documentation only.

---

_Verified: 2026-04-08_
_Verifier: Claude (gsd-verifier)_
