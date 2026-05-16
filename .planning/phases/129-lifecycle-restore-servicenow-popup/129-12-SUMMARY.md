---
phase: 129-lifecycle-restore-servicenow-popup
plan: 12
subsystem: process / governance
tags: [process, build-gate, convention, gap-closure, no-code]
dependency_graph:
  requires: []
  provides: [build-gate-convention, build-gate-task-template, build-gate-decision-log]
  affects: [every future TypeScript-touching PLAN.md, Phase 129 gap-closure plans 129-07/08/09/10/13]
tech_stack:
  added: []
  patterns: [process-convention-document, reusable-task-template, lessons-learned-state-log]
key_files:
  created:
    - .planning/conventions/build-gate.md
    - .planning/templates/build-gate-task.md
  modified:
    - .planning/STATE.md
key_decisions:
  - "D-AUTO-01: Template hosted at `.planning/templates/build-gate-task.md` (NOT `.claude/get-shit-done/build-gate-task-template.md` as the plan's primary preference) — verified `.claude/get-shit-done/` does not exist in this repo (only `.claude/settings.local.json` is present). The plan's read_first explicitly authorized this fallback. Updated convention doc Cross-References to point at the actual location proactively in Task 1's authoring, so no separate Task 1 edit was needed."
  - "D-AUTO-02: Canonical build command in Section 'Canonical Command' is WORKSPACE-SPECIFIC rather than a single repo-root command — verified the repo-root `package.json` has only `scripts.dev` (no `scripts.build`), per Phase 107.1 D-13 ('thin orchestrator only'). The convention parameterizes the command per sub-workspace (`vigil-g2-plugin` has `tsc && vite build`; `vigil-extension/` is flat JS with no package.json so it uses the composite `tsc --noEmit` + `node --check` pattern from Plan 129-07 Task 4)."
  - "D-AUTO-03: New 'Recent (v3.9 in-flight):' subsection inserted at the top of STATE.md Decisions (above the existing 'Recent (v3.8 in-flight):'). Phase 129 lives in the v3.9 phase table, not v3.8 — current milestone frontmatter shows `milestone: v3.9`. Matches the existing bullet style verbatim (`[Phase N / Plan M]: ...`)."
requirements_completed: []
gap_closure: true
gaps_closed: [GAP-129-H]
metrics:
  duration_minutes: 3
  duration: "3 min"
  start: "2026-05-16T16:52:31Z"
  completed_date: "2026-05-16"
  tasks_completed: 3
  files_created: 2
  files_modified: 1
deviations:
  count: 0
  rule_1_bug: 0
  rule_2_missing_critical: 0
  rule_3_blocker: 0
  rule_4_architectural: 0
  note: "Zero deviations. The plan explicitly anticipated the directory-fallback case (`.claude/get-shit-done/` not existing → fall back to `.planning/templates/`) and the workspace-specific build command case (root package.json has no scripts.build). Both pre-anticipated cases are documented in this SUMMARY as decisions (D-AUTO-01, D-AUTO-02), not deviations, because the plan's read_first and instructions explicitly authorized them."
---

# Phase 129 Plan 12: Build-Gate Convention + Reusable Task Template + STATE.md Lessons-Learned Summary

Closes GAP-129-H (process gap, severity high) by formalizing the BLOCKING full-workspace `npm run build` rule as a canonical convention document, a copy-paste XML task template, and a STATE.md Decisions entry — preventing the class-of-failure where plan 129-02 shipped TypeScript build-breakers (missing `navigateTo` import + unused `TTL_MS` import) because plan-scoped `tsx --test` did not exercise full `tsc`. The gap-closure plans 129-07, 129-08, 129-09, 129-10, and 129-13 already walk the talk by including the gate as their final task.

## What Was Built

### Task 1: `.planning/conventions/build-gate.md` (NEW, 8 sections, 160 lines)

**Path:** `.planning/conventions/build-gate.md`
**Commit:** `8f23d90`

The canonical rule document. Eight sections:

1. **The Rule** — every PLAN.md whose `files_modified` includes any `.ts` / `.tsx` / `.js` / `.jsx` file MUST include `[BLOCKING] full workspace build` as its final task before SUMMARY authoring; SUMMARY is gated on the task's success; no auto-approve / yolo / workflow.auto_advance escape hatch.
2. **Why (GAP-129-H origin)** — two-paragraph explanation citing plan 129-02's specific failures (`main.ts` calling `navigateTo()` without importing it at 3 call sites in `restoreScreenFn`; `launch-source-helpers.ts` importing unused `TTL_MS`), the per-plan verify command that missed them (`cd vigil-g2-plugin && npx tsx --test "src/lib/__tests__/screen-state-restore.test.ts" "src/__tests__/main.test.ts"`), and the dev-sideload session on 2026-05-16 that revealed the breakage (fix commits `ca91f60` + `57d7996`).
3. **Canonical Command** — workspace-specific because the repo-root `package.json` has only `scripts.dev` (no `scripts.build`). Records the verified state of each `package.json`: `vigil-g2-plugin` has `"build": "tsc && vite build"`; `vigil-extension/` is flat JS with NO `package.json` and uses the composite `tsc --noEmit` + per-file `node --check` pattern; `vigil-watch/` uses Swift SPM (`swift build`). Multi-workspace plans chain commands with `&&`.
4. **Exceptions** — doc-only plans, SQL-only plans (no TS schema update), pure asset plans, process/convention plans (like Plan 129-12 itself).
5. **Task Template** — embedded XML snippet with `Task N`, `{sub-workspace}` placeholders. Fenced as `xml` code block for copy-paste fidelity.
6. **Enforcement** — currently structural (planner-included, executor-honored, reviewer-checked); future `gsd-sdk verify.plan-has-build-gate` validator is forward-looking but out of scope.
7. **Phase 129 Gap-Closure Plans That Walk the Talk** — concrete reference list: 129-07 Task 4 (composite flat-JS), 129-08 (depends_on 129-12 + tsc --noEmit acceptance), 129-09 Task 2 (npm run build), 129-10 Tasks 3 + 5 (npm run build + T-129-43 names build-gate as mitigation), 129-13 (phase-close meta-plan that greps for adoption).
8. **Cross-References** — links to STATE.md Decisions, UAT-RESULTS.md GAP-129-H, the gap-closure plan set, the template (Section "Task Template" cross-reference points at `.planning/templates/build-gate-task.md`), fix commits, and `execute-plan.md` atomic close-out invariant.

**Acceptance criteria — all PASS:**
- File exists. PASS.
- 8 `## ` sections (≥6 required). PASS.
- 5 GAP-129-H references (≥1 required). PASS.
- 22 `npm run build`/`tsc` references (≥2 required). PASS.
- Fenced XML code block present. PASS.
- Canonical command in Section "Canonical Command" matches verified `package.json` state (root `scripts.dev` only; `vigil-g2-plugin` `scripts.build` = `tsc && vite build`). PASS.

### Task 2: `.planning/templates/build-gate-task.md` (NEW, fenced XML snippet + usage notes)

**Path:** `.planning/templates/build-gate-task.md`
**Commit:** `0424df5`

Reusable copy-paste template. Sections:

- **The Template** — the verbatim XML snippet from Section "Task Template" of the convention doc, in a fenced `xml` block.
- **Placeholders to Customize** — three-row table (`Task N`, `{sub-workspace}`, build command).
- **Multi-Workspace Plans** — chaining example for plans touching multiple workspaces.
- **Non-`npm run build` Toolchains** — substitution guidance for flat Chrome extension (composite `tsc --noEmit` + `node --check`), Swift SPM (`swift build`), Safari extension.
- **When NOT to Include This Task** — cross-reference to convention doc's Exceptions section.
- **Cross-References** — canonical rule, origin gap, fix commits, walk-the-talk examples.

**Fallback location used** — `.claude/get-shit-done/` does NOT exist in this repo (only `.claude/settings.local.json` is present). The plan's read_first explicitly authorized this fallback and required updating the convention doc's cross-reference to point at the actual location. I pre-emptively pointed the convention doc at `.planning/templates/build-gate-task.md` during Task 1 authoring (no extra Task 1 edit needed). See Decision D-AUTO-01.

**Acceptance criteria — all PASS:**
- File exists at fallback location. PASS.
- Fenced XML code block present (2 fenced blocks in total). PASS.
- References `.planning/conventions/build-gate.md` as canonical rule (8 mentions). PASS.
- Convention doc Cross-References section points at the actual template location (2 cross-references). PASS.

### Task 3: STATE.md Decisions — "Recent (v3.9 in-flight):" entry

**Path:** `.planning/STATE.md` (modified)
**Commit:** `9017af1`

Inserted a new "Recent (v3.9 in-flight):" subsection above the existing "Recent (v3.8 in-flight):" subsection (line 198 → 200). The new subsection contains one bullet:

> `- [Phase 129 / GAP-129-H]: BLOCKING full-workspace npm run build is now required as the final task of any PLAN.md producing TypeScript source changes, before SUMMARY.md is authored. Origin: plan 129-02's missing navigateTo import (3 call sites in restoreScreenFn) + unused TTL_MS import shipped because plan-scoped tests (tsx --test on the test files) did not exercise full tsc. Fix commits ca91f60 (missing import + dropped unused import) and 57d7996 (qrcode-terminal devDep + dev-sideload script that surfaced the breakage). Canonical rule: .planning/conventions/build-gate.md. Reusable task template: .planning/templates/build-gate-task.md (also referenced by the convention doc's Section "Task Template"). Phase 129 gap-closure plans 129-07, 129-08, 129-09, 129-10, and 129-13 walk the talk by including the [BLOCKING] full workspace build task as their final task before SUMMARY.`

Phase 129 lives in the v3.9 phase table per STATE.md frontmatter (`milestone: v3.9`), so the new subsection heading reflects v3.9 not v3.8 (see Decision D-AUTO-03). Style matches the existing `[Phase N / Plan M]: ...` bullet convention.

**Acceptance criteria — all PASS:**
- STATE.md contains ≥1 new line referencing `GAP-129-H` or `build-gate`. PASS (one bullet, both terms).
- New entry references `.planning/conventions/build-gate.md`. PASS.
- New entry references fix commits `ca91f60` and `57d7996`. PASS.
- New entry uses bullet formatting consistent with existing Decisions section. PASS (`- [Phase N / GAP-N]:` matches the `- [Phase N / Plan M]:` style verbatim).
- Frontmatter is unchanged. PASS (frontmatter starts unchanged; only Decisions section modified).
- No other sections of STATE.md modified. PASS (`git diff --stat` reports `1 file changed, 4 insertions(+)` — one subsection heading, blank line, entry bullet, blank line).

## Plan-Level Verification — all PASS

Per the plan's `<verification>` block:

| Check | Result |
|-------|--------|
| `test -f .planning/conventions/build-gate.md` | PASS |
| Convention doc has ≥6 `## ` sections | PASS (8 sections) |
| Convention doc references `GAP-129-H` | PASS (5 mentions) |
| Convention doc references canonical build command | PASS (22 `npm run build`/`tsc` mentions) |
| Reusable template exists at get-shit-done OR planning/templates location | PASS (planning/templates fallback) |
| STATE.md has new decision-line cross-referencing convention doc | PASS |
| `grep -c 'npm run build' 129-09-PLAN.md` ≥ 1 | PASS (2 mentions) |
| `grep -c 'npm run build' 129-10-PLAN.md` ≥ 1 | PASS (13 mentions) |

## Decisions Made

- **D-AUTO-01:** Template hosted at `.planning/templates/build-gate-task.md` (fallback) — `.claude/get-shit-done/` directory does not exist in this repo. Plan explicitly authorized this fallback in Task 2's read_first ("if it does not exist, the executor places the template file at a sibling location like `.planning/templates/build-gate-task.md` and updates the convention doc's cross-reference accordingly"). The convention doc's Cross-References section was pre-emptively pointed at this location during Task 1 authoring, so no separate Task 1 edit was needed (the planner's anticipated Task-1-update-step was absorbed into Task 1 itself, saving a round-trip).
- **D-AUTO-02:** Canonical build command in Section "Canonical Command" is workspace-specific, not a single repo-root command. Repo-root `package.json` has only `scripts.dev` (per Phase 107.1 D-13: "NOT a workspaces monorepo — thin orchestrator only"). The convention parameterizes the command per sub-workspace; for `vigil-extension/` (which has NO `package.json`) the canonical command is the composite `npx tsc --noEmit` + per-file `node --check` pattern from Plan 129-07 Task 4.
- **D-AUTO-03:** New "Recent (v3.9 in-flight):" subsection in STATE.md Decisions inserted above the existing "Recent (v3.8 in-flight):". Phase 129 is a v3.9 phase per STATE.md frontmatter (`milestone: v3.9`). Bullet style matches the existing `[Phase N / Plan M]: ...` convention.

## Deviations from Plan

None — plan executed exactly as written.

The plan's read_first explicitly anticipated two cases that materialized:

1. `.claude/get-shit-done/` directory might not exist → fall back to `.planning/templates/`. ✓ Materialized; fallback used; cross-reference updated proactively.
2. Repo-root `package.json` might not have a full-coverage `scripts.build` → record the actual canonical command per workspace. ✓ Materialized; per-workspace commands recorded.

Both pre-anticipated cases are documented as decisions (D-AUTO-01, D-AUTO-02), not deviations, because the plan's instructions explicitly authorized them. **Total deviations: 0.** Impact: none.

## Authentication Gates

None encountered.

## Walk-the-Talk Confirmation

Per the plan's success criteria — "gap-closure plans 129-09 and 129-10 already adopt the gate; STATE.md surfaces it as a permanent lessons-learned item; future phases inherit the convention" — verified by inspection:

- **129-07-PLAN.md Task 4** (line 397) — name literally begins `[BLOCKING] Verify full vigil-extension + Safari lock-step build passes (build-gate)`. Runs composite `npx tsc --noEmit` + per-file `node --check`. **Reference implementation of the flat-JS extension build-gate pattern.**
- **129-08-PLAN.md** — `depends_on: [129-12]`; Task 2 acceptance includes `npx tsc --noEmit`.
- **129-09-PLAN.md Task 2** — verify automated ends with `... && npm run build`; acceptance criteria explicitly call out "build-gate process from plan 129-12".
- **129-10-PLAN.md Tasks 3 and 5** — both run `cd vigil-g2-plugin && npm run build`; threat-register entry T-129-43 names "Build-gate from 129-12 catches TypeScript errors before SUMMARY" as a mitigation; `depends_on: [129-09, 129-12]`.
- **129-13-PLAN.md** (phase-close meta-plan) — references the build-gate adoption across the gap-closure set.

**Confirmation: the convention is walk-the-talked by 129-07, 129-08, 129-09, 129-10, and 129-13.** All five plans were authored during the same gap-closure sweep with the build-gate task in mind. Plan 129-12 (this plan) is the canonical rule document those plans cross-reference.

## Issues Encountered

None.

## Deferred Issues

None.

## Next Phase Readiness

Plan 129-12 is purely a process / governance plan with zero source-code changes — there is no runtime impact and no blocker for any downstream plan. Plans 129-07 through 129-13 in the same phase already adopt the convention. Future TypeScript-touching plans in any phase inherit the rule via the convention doc + template + STATE.md cross-reference.

The plan's success criteria are met:

- Build-gate rule documented (`.planning/conventions/build-gate.md`). ✓
- Build-gate rule discoverable (linked from STATE.md Decisions; cross-referenced by gap-closure plans). ✓
- Build-gate rule copy-pasteable (`.planning/templates/build-gate-task.md`). ✓
- Walk-the-talk by 129-07/08/09/10/13. ✓
- STATE.md surfaces it as a permanent lessons-learned item. ✓
- Future phases inherit the convention (the rule is discoverable via `.planning/conventions/` directory, which this plan also creates as the home for process-level conventions). ✓

## Self-Check: PASSED

Verified:

- `[ -f .planning/conventions/build-gate.md ]` → exists (Task 1 commit `8f23d90`).
- `[ -f .planning/templates/build-gate-task.md ]` → exists (Task 2 commit `0424df5`).
- `git log --oneline | grep -c '(129-12)'` → returns 3 (one commit per task; SUMMARY commit will be the 4th).
- `grep -q 'GAP-129-H' .planning/STATE.md` → returns 0 (match found; Task 3 commit `9017af1`).
- All three commits are visible in `git log --oneline -5`:
  - `9017af1 docs(129-12): record build-gate lessons-learned in STATE.md Decisions`
  - `0424df5 docs(129-12): author reusable build-gate task template`
  - `8f23d90 docs(129-12): author build-gate convention document — closes GAP-129-H`
- Plan-level `<verification>` block: all 8 checks PASS.
- All three tasks' `<acceptance_criteria>` lists: all PASS.
- Zero deviations.

**Duration:** 3 min (2026-05-16T16:52:31Z → 2026-05-16T16:55:53Z).
**Tasks completed:** 3 / 3.
**Files created:** 2.
**Files modified:** 1.
**Gap closed:** GAP-129-H.
