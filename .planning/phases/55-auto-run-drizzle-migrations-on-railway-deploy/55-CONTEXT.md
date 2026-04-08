# Phase 55: Auto-run drizzle migrations on Railway deploy — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning (NO-OP phase — see decision below)

<domain>
## Phase Boundary

Originally scoped as: "make schema changes to vigil-core land on Railway Postgres automatically when a commit is pushed, eliminating the manual `npx tsx src/db/migrate.ts` step."

**Discovered during discuss-phase scout (2026-04-08):** the literal goal is **already met and has been since Phase 39-01 (2026-04-05)**. The Dockerfile production CMD chains migrate before start, and Railway's container logs verify it runs on every deploy.

This phase is therefore reframed as a **verification + cleanup** phase, not a new-feature phase.

</domain>

<decisions>
## Implementation Decisions

### Phase fate
- **D-01:** Phase 55 is closed as **NO-OP**. No new code, no railway.json, no preDeployCommand. The functionality the phase was scoped to deliver already exists in [vigil-core/Dockerfile:17](vigil-core/Dockerfile#L17) (commit `3ffa8ce`, Phase 39-01).
- **D-02:** The phase is NOT removed from ROADMAP.md — it stays as a record of the investigation, so future sessions don't re-surface the same false belief from elsewhere.
- **D-03:** A single "verify + document" plan will be created in `/gsd-plan-phase 55`. Acceptance is just the verification log + the corrected memory + a one-line ROADMAP note.

### Failure semantics (deferred, not implemented)
- **D-04:** Moving migrate from Dockerfile CMD into a `vigil-core/railway.json` `preDeployCommand` is **deferred** — not part of this phase. Reason: the current setup demonstrably works, and no migration failure has actually been observed in prod. Per the user's debugging-style principle ("don't patch symptoms, don't pre-emptively patch nothing"), this stays as a noted future hardening, not a v2.3 deliverable.
- **D-05:** Same for CI-side migration testing against ephemeral Postgres — deferred to a future "CI scaffolding" phase. No CI exists in vigil-core today, so this would be net-new infrastructure outside this phase's scope.

### Memory correction
- **D-06:** `project_railway_deploy.md` was edited in this discuss step to remove the wrong claim ("migrations are NOT auto-applied on deploy"). The corrected memory now records: (1) the chained CMD has been live since 2026-04-05; (2) Railway logs verify it; (3) the 53-04 incident's real cause was Phase 56's territory (push origin), not missing migrations; (4) the failure-mode hardening (preDeployCommand) is noted but not yet built.

### Phase 56 dependency note
- **D-07:** `ROADMAP.md` currently says Phase 56 "Depends on Phase 55 (sibling)." That dependency is now meaningless — Phase 56 stands alone since 55 is no-op. This will be cleaned up when Phase 56 enters its own discuss/plan cycle, NOT in this phase. (Out of scope here.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source-of-truth files
- `vigil-core/Dockerfile` — line 17, the chained CMD that already runs migrations on every container start. Authoritative.
- `vigil-core/src/db/migrate.ts` — the production migration runner. Uses `drizzle-orm/postgres-js/migrator` (runtime dep), not drizzle-kit.
- `vigil-core/drizzle.config.ts` — drizzle-kit config used for `db:generate` (writes SQL to `./drizzle/`). Migration files generated here are what `migrate.ts` consumes at deploy time.
- `vigil-core/package.json` §scripts — `db:generate`, `db:migrate-prod`, `db:push`, `db:studio`.

### Sibling phase context (read for cross-references)
- `.planning/phases/56-push-origin-on-phase-complete-for-backend-phases/56-CONTEXT.md` — the OTHER half of the 53-04 misdiagnosis. Phase 56 is the real bug; Phase 55 was a phantom.

### User memory (corrected this session)
- `project_railway_deploy.md` — Railway service config, manual migration recipe, custom domain. Updated 2026-04-08 to correct the migrations claim.

### Verification evidence
- Railway log excerpt captured during this discuss step (in `55-DISCUSSION-LOG.md`):
  ```
  [vigil-core] PostgreSQL connection verified
  [migrate] Running migrations...
  [migrate] Migrations complete
  Vigil Core API running on port 8080
  ```
  Recipe to re-verify: `cd vigil-core && railway logs --deployment | tail -50`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (already doing the work)
- **`vigil-core/Dockerfile` CMD chain** ([line 17](vigil-core/Dockerfile#L17)): `sh -c "node dist/db/migrate.js && node dist/index.js"` — the entire phase goal in one line of Dockerfile.
- **`vigil-core/src/db/migrate.ts`** — runtime-safe migrator using `drizzle-orm/postgres-js/migrator` instead of drizzle-kit. Logs `[migrate] Running migrations... / [migrate] Migrations complete`. Reads `DATABASE_URL` from env.
- **Drizzle's `__drizzle_migrations` tracking table** — built-in idempotency. Re-running migrate on every container start is a no-op when nothing has changed. Verified live.

### Established Patterns
- **Build → migrate → start, all in one container.** No separate release container, no Railway build hook beyond the Dockerfile. Simple, working, and load-bearing.
- **DATABASE_URL injection from Railway service binding** — handled by Railway's Postgres plugin, no manual config in vigil-core.

### Integration Points (where the phase would touch — but doesn't, because no-op)
- `vigil-core/Dockerfile` — would be modified IF we picked the failure-semantics improvement (we didn't).
- `vigil-core/railway.json` — does not exist; would be created IF we moved migrate into a preDeployCommand (we didn't).

</code_context>

<specifics>
## Specific Ideas

The user explicitly asked me to verify Railway logs live before scoping the phase. That verification (Option A in the discuss prompt) is what surfaced the truth. The principle that drove it lives in `feedback_debugging_style.md`: "investigate to root cause, verify assumptions live, don't patch symptoms."

This phase is the textbook case for that principle: the phase was filed because of a felt symptom (53-04 deploy weirdness), the diagnosis was wrong (blamed missing migrations), and one `railway logs` call to verify the assumption collapsed the entire phase.

</specifics>

<deferred>
## Deferred Ideas

### Failure-semantics hardening — preDeployCommand
Move `node dist/db/migrate.js` out of the Dockerfile CMD into a `vigil-core/railway.json` `deploy.preDeployCommand`. Benefits: migration failure surfaces as a failed deploy in the Railway dashboard instead of a flapping container; old container keeps serving until the new migration succeeds (zero downtime); cleaner rollback path. Cost: half-day phase, real risk of breaking a setup that demonstrably works. **Trigger to revisit:** the first time a migration actually fails in prod and the restart-loop becomes an incident.

### CI migration check
Run `node dist/db/migrate.js` against an ephemeral Postgres in CI before allowing a merge. Catches migration bugs at PR time. **Blocked on:** vigil-core has no CI yet. Belongs in a future "CI scaffolding" phase, not v2.3.

### Phase 56 dependency cleanup
The ROADMAP.md entry for Phase 56 still says "Depends on Phase 55 (sibling — together they make `git push` the single atomic action)." That's now outdated since 55 is no-op. Will be cleaned up when 56 enters its own discuss/plan cycle. Do not touch in this phase.

</deferred>

---

*Phase: 55-auto-run-drizzle-migrations-on-railway-deploy*
*Context gathered: 2026-04-08*
*Outcome: NO-OP — phase goal already implemented in Phase 39-01, verified live*
