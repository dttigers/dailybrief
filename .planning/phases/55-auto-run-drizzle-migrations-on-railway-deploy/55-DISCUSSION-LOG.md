# Phase 55: Auto-run drizzle migrations on Railway deploy — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered and the codebase findings that reframed the phase.

**Date:** 2026-04-08
**Phase:** 55-auto-run-drizzle-migrations-on-railway-deploy
**Areas discussed:** Premise verification, Phase fate, Memory correction
**Mode:** Standard discuss (no advisor mode, no batch, no analyze)

---

## Pre-discussion scout findings

Before identifying gray areas, the workflow's `scout_codebase` step looked at the existing vigil-core deploy setup. Two findings collapsed the phase before any gray-area discussion could begin:

### Finding 1 — Dockerfile already chains migrate before start

[vigil-core/Dockerfile:17](vigil-core/Dockerfile#L17):
```dockerfile
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
```

Git history (`git log --oneline -- vigil-core/Dockerfile`):
- `3ffa8ce` (2026-04-05, Phase 39-01) — "feat(39-01): add programmatic migration script and update Dockerfile CMD"
- `3365770` (earlier) — "feat(39-01): add Dockerfile and .dockerignore for vigil-core"

Diff that introduced the chain:
```diff
-CMD ["node", "dist/index.js"]
+CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
```

`vigil-core/src/db/migrate.ts` uses `drizzle-orm/postgres-js/migrator` (a runtime dep), not drizzle-kit. So the migrator works inside the production image without devDeps — no separate release container needed.

### Finding 2 — The user's memory says the opposite

`project_railway_deploy.md` line 24 (last touched 2026-04-08, the same day Phase 55 was filed):
> **Migrations are NOT auto-applied on deploy** (no Procfile, no railway.json, no release hook — Railway just runs `npm start`).

Direct contradiction with the source tree.

### Finding 3 — Cross-reference with the 53-04 incident

`56-CONTEXT.md` (the sibling phase, also promoted from backlog this session) captures the actual 53-04 failure mode: **"Local main was 68 commits ahead of origin/main, including the entire Phase 52 backend (projects table + CRUD route)."** Railway was building from a stale `origin/main` that didn't contain the projects migration file at all. So even with the migrate-on-start chain firing perfectly, there was nothing to migrate. The "missing migration" was the conflated symptom of a "missing push."

### Conclusion

The phase was filed against a misdiagnosis. The premise — "migrations don't auto-run on Railway" — is false in the source tree. Surfaced this to the user instead of running the standard gray-area discussion.

---

## Premise verification

| Option | Description | Selected |
|--------|-------------|----------|
| Check Railway logs now | Run `railway logs --deployment` from vigil-core to verify whether `[migrate] Running migrations...` appears in recent container starts | ✓ |
| Trust the Dockerfile is working | Assume CMD chain has been firing since 04-05 without verifying live | |
| Trust the memory, ignore the Dockerfile | Investigate why CMD might not be honored on Railway | |
| I already know the answer | User overrides with direct knowledge | |

**User's choice:** Check Railway logs now
**Notes:** Aligned with `feedback_debugging_style.md` — "investigate to root cause, verify assumptions live, don't patch symptoms." Don't scope a phase against an assumption the source tree contradicts.

### Verification result

Command: `cd vigil-core && railway logs --deployment | tail -80`

Live log excerpt:
```
Starting Container
[vigil-core] PostgreSQL connection verified
[migrate] Running migrations...
  NOTICE: schema "drizzle" already exists, skipping
  NOTICE: relation "__drizzle_migrations" already exists, skipping
[migrate] Migrations complete
Vigil Core API running on port 8080
```

**Authoritative result:** Migrations DO run on every Railway container start. The Dockerfile CMD chain works. The memory was stale and wrong. Phase 55's stated goal is already met.

---

## Phase fate

| Option | Description | Selected |
|--------|-------------|----------|
| Close 55 as no-op | Fix the stale memory, write a tiny CONTEXT.md, mark phase complete with a single 'verify + correct memory' plan. Frees scope for Phase 56. | ✓ |
| Keep 55, scope to failure-semantics upgrade | Move migrate from Dockerfile CMD into railway.json preDeployCommand. Real benefit but real risk of breaking working setup. Half-day phase. | |
| Keep 55, scope to CI migration check | Add CI step that runs migrations against ephemeral Postgres before merging. Bigger scope — needs CI scaffolding. | |
| Keep 55, scope to all of the above | Maximalist — failure semantics + CI check + memory fix. 1–2 days. | |

**User's choice:** Close 55 as no-op (Recommended)
**Notes:** Aligns with the user-profile principle "ship daily, don't pre-emptively patch nothing." The failure-semantics improvement and CI check are captured as deferred ideas in CONTEXT.md so they can be resurrected if a migration actually fails in prod.

---

## Memory correction

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, fix it now | Edit `project_railway_deploy.md` in this turn so the wrong claim doesn't propagate to another phase or session | ✓ |
| Wait until Phase 55 plan | Bundle the memory fix with whatever Phase 55 ends up doing | |

**User's choice:** Yes, fix it now
**Notes:** Memory file was edited in this discuss step. The corrected version records: (1) the chained CMD has been live since 2026-04-05; (2) Railway logs verify it; (3) the 53-04 incident's real cause was Phase 56's territory; (4) the failure-mode hardening is noted as deferred.

---

## Standard gray areas — NOT ASKED

The workflow's `present_gray_areas` step would normally generate 3-4 phase-specific gray areas (railway.json release command vs start wrapper, failure handling, CI integration). All three of those questions were rendered moot by the verification result and the phase-fate decision. No AskUserQuestion was issued for them.

This is intentional. A discuss-phase that runs the gray-area dance against a phase that doesn't actually need to exist would produce a CONTEXT.md full of decisions for nothing — the kind of process theater the user explicitly dislikes.

---

*End of discussion log.*
