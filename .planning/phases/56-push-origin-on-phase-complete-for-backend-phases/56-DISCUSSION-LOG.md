# Phase 56: Push origin on phase-complete — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 56-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 56-push-origin-on-phase-complete-for-backend-phases
**Areas discussed:** Deploy scope + config, Hook point, Trigger semantics, Wait-for-Railway

---

## Gray area selection

User asked: "Which gray areas for Phase 56 do you want to discuss?"
Answer: "Deploy scope + config, any of the others as well if you think it needed"

Claude's call: discussed all four because each could materially change the shape of the phase (hook point = architecture, trigger = UX, wait = scope boundary).

---

## Area 1: Deploy scope + config

| Option | Description | Selected |
|--------|-------------|----------|
| `workflow.deploy_targets` array (Recommended) | Add to .planning/config.json under existing workflow section. Generalized from day one. | ✓ |
| Hard-code 'vigil-core' | phase.cjs literally checks for vigil-core/ prefix. Simplest, but next deploy target needs code change. | |
| New top-level `deploy` key | `{ "deploy": { "targets": [...] } }` sibling to workflow. More room to grow, adds new namespace for one feature. | |

**User's choice:** workflow.deploy_targets array
**Notes:** Generalization chosen up front — 3 extra lines and future Cloudflare Worker / G2 registry targets are a free append.

---

## Area 2: Hook point

| Option | Description | Selected |
|--------|-------------|----------|
| Modify `~/.claude/get-shit-done/bin/lib/phase.cjs` (Recommended) | CLI-layer edit inside `cmdPhaseComplete`. Single chokepoint — covers execute-phase, transition, autonomous. Reapply via `/gsd-reapply-patches` after GSD updates. | ✓ |
| Project-local git post-commit hook | `.git/hooks/post-commit` in dailybrey only. Doesn't touch GSD. Fires on every commit — noisy, has to re-derive phase context. | |
| Edit `execute-phase.md` workflow | Orchestration-layer edit. Misses transition.md and autonomous.md paths without duplication. | |

**User's choice:** Modify phase.cjs directly
**Notes:** Consistent with existing pattern — user already patches GSD and reapplies after updates. Other two options were rejected for different reasons (noise and coverage gaps).

---

## Area 3: Trigger semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-push, log loudly (Recommended) | `git push origin main` immediately. Prominent stdout line. Push failure blocks phase-complete LOUD. No prompt. | ✓ |
| Blocking prompt [Y/n] | Safer but answered "Y" every time — pure friction. | |
| Auto-push only if fast-forward, else warn | Push only when local is FF of origin AND has deploy-target commits. Mostly theoretical for solo dev. | |

**User's choice:** Auto-push, log loudly
**Notes:** Fast-forward safety handled by git itself — non-FF surfaces naturally via push error. Push failure being a LOUD phase-complete failure is core to the fix: the point is to make "phase complete" and "prod has the code" mean the same thing.

---

## Area 4: Wait-for-Railway deploy

| Option | Description | Selected |
|--------|-------------|----------|
| No — just push (Recommended) | Phase 56 ships only the push. 53-04 root cause was unpushed commits, not racing deploys. | ✓ |
| Yes — push + poll `railway status --json` | Block phase-complete ~60-120s until deploy is SUCCESS/FAILED. Adds railway CLI dependency. | |
| Yes — print deploy URL, no polling | Cheap compromise with almost zero structural safety over option 1. | |

**User's choice:** Just push
**Notes:** Deploy-wait polling deferred to future phase. Trigger to revisit: first time verification runs against a still-deploying backend and produces a false negative.

---

## Claude's Discretion

Areas where Claude has flexibility downstream (captured in CONTEXT.md decisions):

- Exact shell-out mechanism for `git log` and `git push` (match existing phase.cjs patterns)
- Position of push block inside `cmdPhaseComplete` (strong lean: after STATE.md write, before return)
- Log line wording (prominent, include commit count + target dir names)
- Error propagation pattern for `git push` stderr on failure

---

## Deferred Ideas

Noted in CONTEXT.md `<deferred>` section:

- Wait-for-Railway deploy polling (scope-boundary separation)
- Migration-on-deploy preDeployCommand hardening (inherited defer from Phase 55 D-04)
- Cross-branch / feature-branch push semantics (solo-dev workflow today)
- Auto-detection of deployable dirs (magic, fragile — explicit config preferred)
- `--dry-run` mode (not blocking)

---

*Audit log generated: 2026-04-08*
