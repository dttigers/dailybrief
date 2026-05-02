---
created: 2026-04-26T21:05:00.000Z
completed: 2026-05-02T22:30:00Z
title: gsd-tools milestone complete globs all phases — archives wrong content when prior milestone is paused
area: tooling
files:
  - $HOME/.claude/get-shit-done/bin/lib/core.cjs
  - $HOME/.claude/get-shit-done/bin/lib/milestone.cjs
---

## Resolution (2026-05-02)

Fix landed before v3.7 closeout (2026-05-06). The CLI no longer relies on STATE.md being in sync — caller passes the version arg explicitly. Two files changed in `$HOME/.claude/get-shit-done/bin/lib/`:

**`core.cjs`:**
- `extractCurrentMilestone(content, cwd, explicitVersion?)` — added optional 3rd param so callers can override the STATE.md fallback.
- `getMilestonePhaseFilter(cwd, explicitVersion?)` — rewritten to slice ONLY the target milestone's section (heading → next sibling vX.Y heading, or EOF), no longer uses `extractCurrentMilestone` (whose preamble can leak in-progress neighbor sections like v3.7 above v3.5).
- New phase pattern: tries bold-list (`**Phase 115:`) first since that's the milestone-scoped manifest format, falls back to heading (`### Phase 115:`) only if bold matches nothing — preserves backward compat with older project layouts.

**`milestone.cjs`:**
- `cmdMilestoneComplete` now passes `version` to `getMilestonePhaseFilter` explicitly.
- New empty-set guard: aborts with a clear error if no phases resolve for the version, instead of silently degrading to pass-all.
- ROADMAP archive is now scoped via `extractCurrentMilestone(roadmap, cwd, version)` instead of wholesale copy.

**Verified against current project state:**
- v3.7 explicit → 6 phases (115, 116, 116.1, 117, 118, 119) ✓
- v3.5 explicit → 5 phases (103-107) ✓ (no v3.7 leak)
- STATE.md fallback (no arg) → v3.7 phases ✓
- Bogus `v99.9` → empty-set guard fires with clear error, no side-effects (STATE/MILESTONES untouched) ✓

**Workflow contract items NOT in CLI scope** (handled by `/gsd-complete-milestone` workflow, not the CLI):
- ROADMAP.md backlog preservation + collapse to milestone grouping
- `git rm REQUIREMENTS.md`
- Git tag + commit

The 2026-04-26 incident's missed steps (REQUIREMENTS.md not deleted, ROADMAP.md not collapsed) were workflow-execution issues, not CLI bugs — Claude was driving and skipped those steps. Future closes that follow the workflow markdown should land all 8 closure tasks correctly.

**Note for next time:** the fix lives in `$HOME/.claude/get-shit-done/`, which is global tooling, not in this project's repo. Commits to this project's `.planning/` won't include the fix. The get-shit-done dir doesn't have its own git repo — if you want versioning/backup, set one up.

## Problem

`gsd-tools milestone complete v{X.Y}` archives the wrong phase content when an
earlier milestone (e.g., v3.5) is paused with phase directories still in
`.planning/phases/`. Empirically observed during v3.6 closeout on 2026-04-26:

Invocation:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs milestone complete v3.6 \
  --name "Multi-User Completion, Auth UX & Safari Parity"
```

Expected behavior: archive Phases 108-114 (the actual v3.6 phases per
ROADMAP.md) — 7 phases, 27 plans.

Actual behavior:
- Result reported `phases: 5, plans: 22, tasks: 43`
- Accomplishments extracted from Phases 103-107 SUMMARY.md files (v3.5,
  paused not shipped)
- ROADMAP.md was NOT collapsed (active v3.6 section still present alongside
  the new archive)
- REQUIREMENTS.md was NOT deleted
- MILESTONES.md got a v3.6 entry filled with v3.5 phase content
- The archive files at `.planning/milestones/v3.6-{ROADMAP,REQUIREMENTS}.md`
  contained the wholesale current `ROADMAP.md` / `REQUIREMENTS.md` rather
  than v3.6-scoped extracts

Root cause hypothesis: the CLI globs `.planning/phases/*-*/` for SUMMARY.md
files without filtering by the milestone version's phase range from
ROADMAP.md. The glob returns directories sorted lexicographically, so
phases 103-107 come first and the CLI's `phases: 5` count clamps before
reaching 108-114.

The user's project state hits this case naturally: v3.5 is paused
(blocked on G2 hardware UAT), so its 5 phase directories remain in
`.planning/phases/` even though v3.5 isn't ready to ship. v3.6 shipped
first and the CLI confused them.

## Solution

The CLI should resolve which phase directories belong to a given milestone
version by parsing ROADMAP.md (which already has explicit `## v3.6 Phases`
or `Phases X-Y` notation), not by globbing the phases directory.

Two implementation paths:

**Option A — parse ROADMAP.md milestone header for phase range:**
- Read the `- ✅/🚧 **v3.6 Multi-User Completion** — Phases 108-114 ...` line
- Extract `108-114`, build the phase-number set
- Filter phase directories by that set before reading SUMMARY.md files

**Option B — read frontmatter `milestone:` field from each SUMMARY.md:**
- Each SUMMARY.md frontmatter could include `milestone: v3.6`
- CLI globs all summaries but filters by frontmatter milestone tag
- Requires writer-side discipline (gsd-executor must populate the field)

Option A is simpler, no schema changes; Option B is more robust if SUMMARY.md
files ever migrate between milestones.

Either way, the CLI should:
1. Reject the invocation with a clear error if the resolved phase set is
   empty (don't silently fall back to glob)
2. Validate that the archived ROADMAP and REQUIREMENTS files contain
   v3.6-scoped content (the CLI currently appears to copy them wholesale)
3. Actually delete `.planning/REQUIREMENTS.md` after archival (workflow
   says it should, but the CLI didn't on this run)
4. Actually collapse the active milestone section in ROADMAP.md (also
   didn't happen on this run)

## Recovery procedure (for the next person who hits this)

The user manually recovered with:

1. `rm -f .planning/milestones/v3.6-{ROADMAP,REQUIREMENTS}.md` — delete
   the wrongly-archived files
2. Edit `MILESTONES.md` to replace the bogus v3.6 entry with one written
   by hand from the actual v3.6 SUMMARY.md content
3. Extract the v3.6 section from ROADMAP.md via
   `awk '/^## 🚧 v3.6/,/^## Backlog/'` and write to
   `milestones/v3.6-ROADMAP.md` with an archive header prepended
4. Copy current `REQUIREMENTS.md` to `milestones/v3.6-REQUIREMENTS.md`
   with an archive header prepended
5. Edit `ROADMAP.md`: change `🚧 v3.6 ... (in progress)` to
   `✅ v3.6 ... (shipped DATE)` in the Milestones header; add a
   `<details>` block for v3.6 under "## Completed Milestones"; delete
   the active v3.6 section (was lines 473-611, then 491-630 after the
   archive insertion)
6. Edit `PROJECT.md`: collapse v3.6 in-progress narrative to a single
   shipped one-liner; mark v3.6 reqs as Validated; remove the "v3.6 (in
   progress)" Active subsection
7. `rm .planning/REQUIREMENTS.md` (workflow contract: fresh for next
   milestone)
8. Update `STATE.md` frontmatter (milestone status → shipped, progress →
   100%) and body (Project Reference + Current Position sections)
9. `git tag -a v3.6` with a good annotation
10. Commit + push main + push tag

## Reference

- Failed invocation timestamp: 2026-04-26 ~14:20 (during /gsd-complete-milestone v3.6 closeout)
- Project state at the time: v3.5 phases (103-107) in .planning/phases/ paused;
  v3.6 phases (108-114) in .planning/phases/ shipping today
