---
phase: 56-push-origin-on-phase-complete-for-backend-phases
plan: "01"
subsystem: gsd-tools
tags: [gsd-tools, git, deploy, phase-complete, vigil-core]
dependency_graph:
  requires: []
  provides: [auto-push-on-phase-complete]
  affects: [phase.cjs, config.cjs, core.cjs, .planning/config.json, ROADMAP.md]
tech_stack:
  added: []
  patterns: [maybePushPhaseCommits helper pattern, loadConfig deploy_targets surfacing]
key_files:
  created:
    - /Users/jamesonmorrill/.claude/get-shit-done/tests/phase-complete-push.sh
  modified:
    - /Users/jamesonmorrill/.claude/get-shit-done/bin/lib/phase.cjs
    - /Users/jamesonmorrill/.claude/get-shit-done/bin/lib/config.cjs
    - /Users/jamesonmorrill/.claude/get-shit-done/bin/lib/core.cjs
    - /Users/jamesonmorrill/Desktop/Local AI/dailybrief/.planning/config.json
    - /Users/jamesonmorrill/Desktop/Local AI/dailybrief/.planning/ROADMAP.md
decisions:
  - "loadConfig surfaces deploy_targets as a top-level flattened field (matching existing workflow.* pattern) — config.workflow.deploy_targets in JSON maps to cfg.deploy_targets in the returned object"
  - "maybePushPhaseCommits uses git log --grep with ERE non-digit boundary to match phase commits without false-positives on 3-digit phase numbers"
  - "Push failure calls error() (process.exit(1)) not bare throw — matches gsd-tools loud-failure convention used everywhere else in phase.cjs"
  - "STATE.md write happens before push; STATE.md bump from THIS phase-complete will be pushed by the NEXT phase that touches a deploy target (acceptable per D-04)"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-08T20:40:24Z"
  tasks_completed: 5
  files_modified: 6
---

# Phase 56 Plan 01: Push origin on phase-complete for backend phases — Summary

**One-liner:** Auto-push to origin/main on phase-complete when the phase touched a `workflow.deploy_targets` directory, with zero behavior change for Mac-only phases — closes the 53-04 foot-gun (local main 68 commits ahead of origin, stale Railway deploy, false "iOS sheet bug" diagnosis).

## What Landed

### phase.cjs — `maybePushPhaseCommits` helper + call site

New function `maybePushPhaseCommits(cwd, phaseNum)` inserted above `cmdPhaseComplete` in `~/.claude/get-shit-done/bin/lib/phase.cjs`. Wired into `cmdPhaseComplete` after `writeStateMd()` and before building the `result` object.

**Behavior:**
- `deploy_targets` empty or missing → `{ pushed: false, reason: 'no_targets' }` — no git commands run
- Deploy targets set but phase commits touched only non-target paths → `{ pushed: false, reason: 'no_matching_files' }` — no push (B6: Mac-only zero-behavior-change guarantee)
- Phase commits touched a target path → `git push origin main` runs once; stdout gets prominent `◆ Pushed N commits to origin/main — Railway will redeploy` line
- Push failure → `error(e.message)` → `process.exit(1)` — blocks phase-complete from returning success (D-03 loud failure, no swallowing)

Commit-range detection: `git log --grep="\(${phaseNum}[^0-9]" --extended-regexp` — the `[^0-9]` boundary prevents false-matching future 3-digit phases like `feat(560):`.

`maybePushPhaseCommits` is exported from `module.exports` for testability (required by Task 5 harness).

### config.cjs — `workflow.deploy_targets` registered in VALID_CONFIG_KEYS

Added `'workflow.deploy_targets'` to the `VALID_CONFIG_KEYS` Set after `'workflow.use_worktrees'`. Eliminates the unknown-key warning on `gsd-tools config-get workflow.deploy_targets`.

### core.cjs — `deploy_targets` surfaced in `loadConfig` return value

`loadConfig` returns a flattened config object (it does NOT preserve nested `workflow.*` sub-keys). Added `deploy_targets` to the return object alongside other `workflow.*` fields:

```js
deploy_targets: (() => {
  const val = get('deploy_targets', { section: 'workflow', field: 'deploy_targets' });
  return Array.isArray(val) ? val : [];
})(),
```

`maybePushPhaseCommits` reads `cfg.deploy_targets` (not `cfg.workflow.deploy_targets`).

### .planning/config.json — dailybrief opts into `["vigil-core"]`

```json
"workflow": {
  "_auto_chain_active": false,
  "use_worktrees": true,
  "deploy_targets": ["vigil-core"]
}
```

Commit: `96099ac`

### ROADMAP.md — D-06 cleanup (stale Phase 55 sibling dependency)

Phase 56 entry `**Depends on**:` line changed from:
> Phase 55 (sibling — together they make `git push` the single atomic action that lands code + schema on prod)

To:
> None

Phase 55 closed as NO-OP (2026-04-08). The dependency was stale. Closes Phase 55 D-07.

Commit: `9a5ec39`

### Harness test — `~/.claude/get-shit-done/tests/phase-complete-push.sh`

Executable script (no commit — lives in GSD install). Builds an ephemeral bare git repo, exercises `maybePushPhaseCommits` in isolation, verifies both:

- **Scenario A (Mac-only):** commits under `JarvisCore/` + `DailyBrief/` → `pushed: false`, origin HEAD unchanged
- **Scenario B (vigil-core):** commit under `vigil-core/src/` → `pushed: true`, origin HEAD advanced

To re-run: `bash ~/.claude/get-shit-done/tests/phase-complete-push.sh`

**Harness output:**
```
PASS scenario A: Mac-only phase → no push (zero behavior change)
PASS scenario B: vigil-core phase → push fired, origin advanced

ALL SCENARIOS PASSED
```

## Commits (dailybrief repo)

| Hash | Message |
|------|---------|
| `96099ac` | feat(56-01): add workflow.deploy_targets to dailybrief config |
| `9a5ec39` | docs(56-01): remove stale Phase 55 dependency from ROADMAP (closes Phase 55 D-07) |

GSD install files (`phase.cjs`, `config.cjs`, `core.cjs`, harness) were edited in-place — no commit (they live outside the dailybrief git repo).

## Important Operational Notes

1. **Run `/gsd-reapply-patches` after `gsd-update`** — the edits to `phase.cjs`, `config.cjs`, and `core.cjs` are loose patches in `~/.claude/get-shit-done/`. Any GSD version update that overwrites these files will lose the changes. Reapply via the `/gsd-reapply-patches` skill.

2. **STATE.md timing:** `writeStateMd()` runs BEFORE the push block. The STATE.md bump written by THIS phase-complete invocation is a local-only write at the time of the push — it has NOT been committed yet, so it will NOT be included in this push. It will be pushed by the NEXT phase-complete that fires a push (or manually). This is acceptable: the goal is shipping CODE changes, not shipping STATE.md in perfect lockstep.

3. **Self-test:** This phase's own commits only touch `.planning/` — no `vigil-core/` files. When the orchestrator runs `gsd phase complete` for Phase 56, `maybePushPhaseCommits` will take the B2 path (`no_matching_files`) and print nothing. If you see a "Pushed N commits" line during Phase 56 completion, stop and check the prefix-match logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `loadConfig` flattens config — `cfg.workflow.deploy_targets` is always undefined**

- **Found during:** Task 5 harness (Scenario B failed with `pushed: false, reason: no_targets`)
- **Issue:** The plan's pseudocode read `cfg.workflow.deploy_targets`, but `loadConfig` in `core.cjs` returns a flattened object with no `workflow` sub-key — only individual flattened fields (`research`, `plan_checker`, etc.). `cfg.workflow` is always `undefined`.
- **Fix:** (a) Added `deploy_targets` to `loadConfig`'s return object in `core.cjs` following the exact same pattern as other `workflow.*` fields. (b) Updated `maybePushPhaseCommits` to read `cfg.deploy_targets` (flattened) instead of `cfg.workflow.deploy_targets`.
- **Files modified:** `~/.claude/get-shit-done/bin/lib/core.cjs`, `~/.claude/get-shit-done/bin/lib/phase.cjs`

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or auth surfaces beyond the `git push` already documented in the plan's threat model (T-56-01 through T-56-06).

## Self-Check: PASSED

- [x] `~/.claude/get-shit-done/bin/lib/phase.cjs` — exists, contains `maybePushPhaseCommits`
- [x] `~/.claude/get-shit-done/bin/lib/config.cjs` — contains `'workflow.deploy_targets'`
- [x] `~/.claude/get-shit-done/bin/lib/core.cjs` — contains `deploy_targets` in loadConfig return
- [x] `.planning/config.json` — `workflow.deploy_targets: ["vigil-core"]`
- [x] `.planning/ROADMAP.md` — Phase 56 `**Depends on**: None`
- [x] `~/.claude/get-shit-done/tests/phase-complete-push.sh` — exists, executable, both scenarios pass
- [x] Commit `96099ac` — verified in git log
- [x] Commit `9a5ec39` — verified in git log
