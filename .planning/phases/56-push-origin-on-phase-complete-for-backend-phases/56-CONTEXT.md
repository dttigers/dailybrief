# Phase 56 Context — Push origin on phase-complete for backend phases

**Promoted from backlog 999.3 on 2026-04-08.**

## Why this exists

Surfaced from Phase 53-04 verification (2026-04-08). Local main was **68 commits ahead of origin/main**, including the entire Phase 52 backend (projects table + CRUD route) and the Phase 53-01 thoughts route changes.

Mac UI tested fine because the Mac binaries are built locally, but the moment the user clicked "+ New Project" in the dashboard, the API call hit api.vigilhub.io and got a 404 — because Railway was deploying from a 68-commits-stale origin/main that didn't have the projects route at all. Took ~10 minutes of investigation to root-cause (initially looked like a bug in the iOS client or the new sheet code from 53-04).

The current GSD `phase complete` step commits locally but never pushes — fine for Mac-only phases, dangerous for any phase that touches `vigil-core/`.

## What it would do

- Detect at phase-complete time whether any commits in the phase touched `vigil-core/` (or any other deploy-targeted subdir registered in `.planning/config.json`)
- If yes, either auto-push to origin or surface a blocking warning: "This phase modified vigil-core. Origin is N commits behind. Push before marking phase complete? [Y/n]"
- Optionally extend to: "Push and wait for Railway deploy to succeed before marking complete" so verification cycles always test against deployed code, not local-only code
- Configurable per-subdirectory in `.planning/config.json` (`deploy_targets: ["vigil-core"]`) so the rule only fires for paths that actually deploy

## Acceptance

- Completing a phase that modifies vigil-core triggers a push prompt (or auto-push) before the phase is marked complete in ROADMAP.md
- Completing a Mac-only phase has no behavior change
- The 53-04 scenario (verify a feature against a stale deployed backend) becomes structurally impossible

## Open questions for /gsd-discuss-phase

- Auto-push (faster, opinionated) vs. blocking prompt (safer, interrupts flow)
- Should this also wait on Railway deploy success, or just push? (waiting requires polling Railway CLI, adds complexity)
- Where does the `deploy_targets` config live — `.planning/config.json` workflow section, or a new top-level key?
- Does this generalize to any future deploy target (e.g. a Cloudflare Worker, an Even G2 plugin manifest), or stay vigil-core-specific for now?

## Sibling

Phase 55 (auto-run migrations on deploy) is the natural sibling — together they would make `git push` the single atomic action that lands code + schema on prod.
