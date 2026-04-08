# Phase 56: Push origin on phase-complete for backend phases — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `git push origin main` a structural side-effect of `gsd phase complete` whenever the completed phase's commits touched a registered deploy target. The 53-04 foot-gun (local main 68 commits ahead of origin, Mac UI tested against a stale deployed backend, 404 on "+ New Project" because the projects route didn't exist on Railway yet) becomes structurally impossible for any path listed in `workflow.deploy_targets`.

**In scope:**
- Config key `workflow.deploy_targets: string[]` in `.planning/config.json`
- Detection logic in `cmdPhaseComplete` (phase.cjs) that greps phase commits for deploy-target path prefixes
- Auto-push when matched; loud log line; push failure fails phase-complete
- Populate vigil-core as the initial deploy target for this project

**Out of scope:**
- Waiting for Railway deploy success (see D-04, deferred)
- Migration-on-deploy hardening (Phase 55's deferred D-04, still deferred)
- Retroactive push of the 68-commit backlog — already pushed as of 2026-04-07
- Any generalization beyond the `deploy_targets` list (no magic auto-detection of deployable dirs)
- Non-main branches — solo-dev workflow ships from main; cross-branch semantics deferred

</domain>

<decisions>
## Implementation Decisions

### Config & scope
- **D-01:** Add `workflow.deploy_targets: string[]` to `.planning/config.json`. Default is empty array (no-op for every project except ones that opt in). For dailybrief, set to `["vigil-core"]`. A path prefix matches if any commit in the phase range modified a file under that directory — recursive, not glob.
- **D-05:** Key goes under the existing `workflow` section, NOT a new top-level `deploy` key. Rationale: single new feature, fits alongside `use_worktrees` and `_auto_chain_active`. No reason to create a new namespace yet.

### Hook point
- **D-02:** Logic lives inside `cmdPhaseComplete` in `~/.claude/get-shit-done/bin/lib/phase.cjs` (line ~905 today). Direct modification of the global GSD install. Reapply via `/gsd-reapply-patches` skill after any `gsd-update`. This covers all phase-complete entry points (execute-phase.md, transition.md, autonomous.md) with one edit — project-local hooks would miss at least two of those paths.
- **Rationale:** project-local post-commit hook was rejected because it fires on every commit (noisy) and has to re-derive "am I in a phase right now?" from commit message patterns. GSD workflow-file edit was rejected because the three entry points (execute/transition/autonomous) would each need the same block. The CLI layer is the single chokepoint.

### Trigger semantics
- **D-03:** Auto-push without prompting. Print a prominent line like `◆ Pushed N commits to origin — Railway will redeploy` when the push happens. If the push fails (network, non-fast-forward, auth), that failure is a **loud** error and blocks phase-complete — do NOT silently swallow and mark the phase done anyway. The whole point of the phase is to make "phase complete" and "prod has the code" mean the same thing.
- **Fast-forward safety:** handled by git itself. `git push origin main` without `--force` errors on non-FF and surfaces naturally. No extra pre-check needed — a real diverged state means the solo-dev user has to manually reconcile, which is the correct behavior.
- **No prompt variant:** explicitly rejected. A blocking `[Y/n]` would be answered "Y" every time; the interruption adds nothing.

### Wait-for-deploy
- **D-04:** Phase 56 does NOT wait for Railway to finish deploying. Push and return. The 53-04 root cause was "commits never reached origin", not "commits reached origin but deploy was racing" — fixing push alone closes the real gap observed. Deploy-wait polling is architecturally separate and gets deferred. Trigger to revisit: the first time verification actually runs against a still-deploying backend and produces a false negative.

### Related cleanup (in-phase)
- **D-06:** ROADMAP.md Phase 56 entry currently reads "Depends on Phase 55 (sibling — together they make `git push` the single atomic action)." This dependency is stale — Phase 55 closed as NO-OP. Remove the dependency line during this phase. (This closes the loop on Phase 55 D-07, which explicitly deferred this cleanup until Phase 56 entered its own cycle.)

### Claude's Discretion
- Exact shell-out vs. `simple-git`/child_process choice for running `git log --name-only <range>` and `git push origin main` — planner picks whatever matches existing patterns in phase.cjs.
- The precise position of the push block inside `cmdPhaseComplete` (before or after STATE.md writes) — planner decides. Strong lean: AFTER state writes are committed locally, BEFORE returning success, so STATE.md is included in the push.
- Log line wording — just make it prominent, include commit count and target directory names.
- How to surface `git push` stderr on failure — planner picks the cleanest error propagation pattern used elsewhere in gsd-tools.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### GSD tool source of truth
- `~/.claude/get-shit-done/bin/lib/phase.cjs` §`cmdPhaseComplete` (line ~905) — the function being modified. Read the whole function to understand the current commit range / STATE update sequence before inserting the push block.
- `~/.claude/get-shit-done/bin/gsd-tools.cjs:677` — dispatch site for `phase complete`.
- `~/.claude/get-shit-done/workflows/execute-phase.md:1090` — one of the call sites (execute-phase invokes phase complete).
- `~/.claude/get-shit-done/workflows/transition.md:166` — second call site.
- `~/.claude/get-shit-done/workflows/autonomous.md` — third call site (autonomous phase loop).

### Project config
- `.planning/config.json` — current shape. The `workflow` section already exists; new `deploy_targets` key goes there.
- Existing keys under `workflow`: `_auto_chain_active`, `use_worktrees`. Pattern to match.

### Related phase context
- `.planning/phases/55-auto-run-drizzle-migrations-on-railway-deploy/55-CONTEXT.md` §D-07 — explicitly defers "Phase 56 ROADMAP dependency cleanup" to this phase. That cleanup is D-06 in this file.
- `.planning/ROADMAP.md` — Phase 55 now says `**Status**: NO-OP (verified 2026-04-08)`. Phase 56 entry still has the stale sibling dependency line — needs editing per D-06.

### Historical evidence of the bug
- The Phase 53-04 verification session (2026-04-08) is the real-world reproduction: local main was 68 commits ahead of origin/main, including the entire Phase 52 backend + Phase 53-01 thoughts route. Mac UI tested fine locally; `+ New Project` hit api.vigilhub.io → 404. Root-cause investigation took ~10 minutes because the symptom looked like an iOS client or sheet bug.

### User memory (read for cross-session context)
- `project_railway_deploy.md` — Railway service layout, custom domain, auto-deploy behavior. Confirms: pushing to origin IS sufficient to trigger a Railway redeploy. The push is the atomic action; Railway's side of the pipeline is already wired.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`cmdPhaseComplete` commit-range logic** (phase.cjs ~line 850+) — already knows the phase's commit range to compute `summaryCount`, `planCount`, etc. The same range is what the deploy-target check needs: `git log --name-only <range>` filtered by `deploy_targets` prefixes.
- **`writeStateMd` + surrounding commit pattern in phase.cjs** — existing pattern for "modify state, commit, continue". The push block should run AFTER this so STATE.md is part of what gets pushed.
- **Config read helpers** — `gsd-tools config-get` already resolves keys like `workflow.deploy_targets` cleanly (warning surfaces for unknown keys but array values pass through).

### Established Patterns
- **Global GSD install, project overrides** — the user already modifies `~/.claude/get-shit-done/` and uses `gsd-reapply-patches` after updates. Adding one more patched function here is consistent.
- **Empty default = no-op for other projects** — matches how `use_worktrees` works (off by default, opt-in per project).
- **Warning-on-unknown-key** — gsd-tools already warns on unknown config keys; adding `deploy_targets` to the known-keys list avoids a new warning on every command.

### Integration Points
- `.planning/config.json` — new key in existing `workflow` section.
- `phase.cjs cmdPhaseComplete` — insertion point for the push block.
- `bin/lib/commands.cjs` or wherever the known-keys list lives — register `workflow.deploy_targets` so it doesn't trip the unknown-key warning.
- ROADMAP.md — single-line edit for D-06 (stale sibling dependency removal).

### Constraint to respect
- **Don't break Mac-only phases.** The check must be a strict match on `deploy_targets` path prefixes. A phase that only touched `JarvisCore/` or `DailyBrief/` must produce ZERO behavior change. Verify with a direct test: run phase-complete on a commit range that touched only Mac paths, confirm no `git push` fires.

</code_context>

<specifics>
## Specific Ideas

- The phrase "◆ Pushed N commits to origin — Railway will redeploy" (or similar prominent line) in phase-complete stdout. User pattern-matches on this style of log output during busy executions.
- The detection command is effectively: `git log --name-only --pretty=format: <phase_start>..<phase_end> | grep -E '^(target1/|target2/)'`. Planner can refine.
- Phase 53-04 incident is the "why this exists" story. Don't let it get watered down in the plan — the 10 minutes of misdiagnosis is the concrete pain.

</specifics>

<deferred>
## Deferred Ideas

### Wait-for-Railway deploy polling
Push + poll `railway status --json` until latest deployment is SUCCESS or FAILED, block phase-complete during the ~60-120s wait. Adds a hard railway-CLI dependency to phase-complete for any project with deploy_targets. **Trigger to revisit:** first time verification produces a false negative because it raced a still-deploying backend. Until then, the push alone is the fix.

### Migration-on-deploy hardening (preDeployCommand)
Inherited defer from Phase 55 D-04. Moving migrate from Dockerfile CMD into `vigil-core/railway.json preDeployCommand` so a failed migration surfaces as a clean failed deploy instead of a crash-looping container. **Trigger to revisit:** first prod migration failure incident.

### Cross-branch / feature-branch push semantics
Phase 56 assumes solo-dev main-branch workflow. If a team starts using feature branches, the logic needs a PR-creation step instead of direct push. Not relevant today.

### Auto-detection of deployable dirs
Instead of an explicit `deploy_targets` list, could scan for `Dockerfile`, `railway.json`, `wrangler.toml`, etc. and treat containing dirs as deploy targets automatically. Magic, fragile, rejected for v1. Explicit config is honest.

### Dry-run mode
`gsd phase complete --dry-run` showing what would be pushed without pushing. Nice-to-have, not blocking. Defer unless a bug shows up that needs it.

</deferred>

---

*Phase: 56-push-origin-on-phase-complete-for-backend-phases*
*Context gathered: 2026-04-08*
*Supersedes the backlog seed file (999.3 promotion)*
