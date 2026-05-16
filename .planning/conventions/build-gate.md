---
convention: build-gate
status: active
effective: 2026-05-16
origin: Phase 129 / GAP-129-H
canonical_authors: [Phase 129 / Plan 12]
applies_to: every PLAN.md whose files_modified includes any .ts / .tsx / .js / .jsx file (test files INCLUDED)
enforcement: structural (planners + executors); future gsd-sdk validator out of scope
fix_commits_that_revealed_the_gap: [ca91f60, 57d7996]
---

# Build-Gate Convention (BLOCKING — required for all TypeScript-touching plans)

**Status:** Active since 2026-05-16. Origin: Phase 129 gap closure (GAP-129-H — Plan 129-02 shipped TypeScript build-breakers that the per-plan test suite did not catch).

## The Rule

Every PLAN.md whose `files_modified` frontmatter includes **any** TypeScript or JavaScript file (`.ts`, `.tsx`, `.js`, `.jsx` — production source AND test files alike) **MUST** include, as its FINAL task before SUMMARY.md authoring, a `[BLOCKING] full workspace build` task. The task runs the workspace's canonical full-coverage build command (see "Canonical Command" below) and the command **must exit 0** before the SUMMARY is written. SUMMARY.md authoring is **gated** on the task's success — if the build fails, the plan is incomplete and the executor's atomic close-out invariant forbids writing SUMMARY.md until the build is green. There is no `--no-verify`-equivalent escape hatch; the task is `[BLOCKING]` and cannot be skipped by `workflow.auto_advance` settings, by `yolo` mode, or by any other auto-approval flow.

## Why (GAP-129-H origin)

Plan 129-02 (G2-LIFECYCLE-01/02/03 — screen state restore) shipped two TypeScript build-breakers that survived the executor's verify command and that landed in `main` before they were caught:

1. `vigil-g2-plugin/src/main.ts` called `navigateTo()` from inside `restoreScreenFn` at three call sites — but the `navigateTo` symbol was never imported into `main.ts`. `tsc` would have failed with `error TS2304: Cannot find name 'navigateTo'`.
2. `vigil-g2-plugin/src/lib/launch-source-helpers.ts` imported `TTL_MS` from `./screen-state-restore` but never referenced it. With `strict` / `noUnusedLocals` enabled, `tsc` would have failed.

Both errors are exactly the class of error `tsc` catches in one second. They survived plan 129-02 because the executor's per-plan verify command was scoped to **only the test files the plan authored**:

```text
cd vigil-g2-plugin && npx tsx --test "src/lib/__tests__/screen-state-restore.test.ts" "src/__tests__/main.test.ts"
```

`tsx --test` only type-checks the files it executes (and their transitive imports). It did NOT exercise the restore code path (`restoreScreenFn` is invoked via `pickInitialScreen`, which the unit tests stubbed). The build-breakers were invisible at plan-close time and shipped into `main` at commit `2029746` (the 129-02 metadata commit). They were discovered on 2026-05-16 when the operator attempted to dev-sideload the plugin onto a real iPhone Even Hub for UAT — `npm run build` (which the sideload script invokes) failed immediately. The fixes landed in two follow-up commits:

- `ca91f60` — `fix(129-02): add missing navigateTo import + drop unused TTL_MS — TS build was broken`
- `57d7996` — `chore(g2-plugin): add dev-sideload script + qrcode-terminal devDep` (separate concern but in the same session)

The class-of-failure: **plan-scoped tests are not a substitute for a full workspace `tsc` pass.** Future plans must close this verification gap by running the FULL workspace build, not just the tests the plan happens to author. This convention is the canonical fix.

## Canonical Command

The canonical command is **workspace-specific** — there is no single repo-root command that builds every TypeScript surface in this monorepo, because the repo is NOT a true npm workspaces monorepo (per Phase 107.1 D-13: "thin orchestrator only").

**Verified state of `package.json` files (as of 2026-05-16):**

| Path | Has `scripts.build`? | Command |
|------|----------------------|---------|
| `/package.json` (repo root) | **NO** | Only `scripts.dev`. The root is a thin orchestrator; there is no workspace-wide `npm run build`. |
| `vigil-g2-plugin/package.json` | YES | `"build": "tsc && vite build"` |
| `vigil-core/package.json` | check before authoring a plan that touches it | (check `cd vigil-core && npm pkg get scripts.build`) |
| `vigil-pwa/package.json` | check before authoring a plan that touches it | (check `cd vigil-pwa && npm pkg get scripts.build`) |
| `vigil-watch/Package.swift` (Swift SPM) | N/A — Swift toolchain | `cd vigil-watch && swift build` |
| `vigil-extension/` | **No package.json — flat `.js`/`.html`/`.css` Chrome extension** | Use `npx tsc --noEmit` over any TypeScript test files + `node --check` over each modified `.js` file (Plan 129-07 Task 4 is the reference implementation of this pattern) |
| `vigil-safari-extension/` | **No package.json — flat JS, Xcode-driven** | Same `node --check` pattern as `vigil-extension/` |

**Implication for planners:** The build-gate task command depends on which sub-workspace the plan touches:

- Plan touches `vigil-g2-plugin/src/**/*.ts` only → `cd vigil-g2-plugin && npm run build`
- Plan touches `vigil-core/src/**/*.ts` only → `cd vigil-core && npm run build` (verify the script exists first)
- Plan touches `vigil-pwa/src/**/*.ts` only → `cd vigil-pwa && npm run build` (verify the script exists first)
- Plan touches `vigil-extension/*.js` (flat Chrome extension) → composite `npx tsc --noEmit` over test files + `node --check` over each modified `.js` file (see Plan 129-07 Task 4 for the verbatim composite command)
- Plan touches multiple sub-workspaces → chain the commands with `&&` so the gate fails if ANY sub-workspace fails to build

**The convention defines the RULE; the planner writes the actual command per the surface their plan touches.** When a sub-workspace adds, removes, or changes its `scripts.build`, the planner updates the gate task in the same plan that changed the script — same way function signatures are kept in sync with their docs (T-129-47 disposition).

## Exceptions

The build-gate is NOT required when:

1. **Doc-only plans** — `files_modified` contains ONLY `.md`, `.txt`, `.json` (non-code config), or other non-source files. Example: Plan 129-11 (UAT runbook authoring only).
2. **SQL-only plans** — `files_modified` contains ONLY a `.sql` migration file with NO corresponding TypeScript schema update. If a TypeScript `schema.ts` is touched too, the gate IS required.
3. **Pure asset / binary plans** — image, font, audio, video assets only.
4. **Process / convention plans** — plans that author rules, runbooks, or governance documents and do not touch source. Example: THIS plan, 129-12, is itself exempt because its `files_modified` is `[.planning/conventions/build-gate.md, .planning/STATE.md, .claude/get-shit-done/build-gate-task-template.md or .planning/templates/build-gate-task.md]` — zero source files.

**All other plans** (any TypeScript / JavaScript source touched, INCLUDING test files, INCLUDING storybook fixtures, INCLUDING type-only `.d.ts` files) **MUST** include the gate. Test files alone are NOT an exception — the 129-02 incident was a missing import in production source, but the same gap exists if a test file fails to type-check.

## Task Template

Planners copy-paste the following XML snippet into a PLAN.md as the LAST `<task>` element before the `</tasks>` closing tag. Customize the items marked `{...}`:

```xml
<task type="auto">
  <name>Task N: [BLOCKING] full workspace build — gate before SUMMARY</name>
  <files></files>
  <read_first>
    - .planning/conventions/build-gate.md (the canonical rule — origin GAP-129-H)
    - {sub-workspace}/package.json (verify scripts.build is still the canonical command)
  </read_first>
  <action>
    Run the canonical full-workspace TypeScript build for the sub-workspace this plan modifies. This is a verification-only task — no source files are modified. The rule and rationale live in `.planning/conventions/build-gate.md`.

    Build command (this repo, verified against `{sub-workspace}/package.json` at plan-author time):

    `cd {sub-workspace} && npm run build`

    (Adapt for multi-workspace plans by chaining with `&&`. For flat-JS surfaces like `vigil-extension/`, substitute the composite `npx tsc --noEmit` + per-file `node --check` pattern documented in `.planning/conventions/build-gate.md` Section "Canonical Command".)

    If the build fails, the plan is incomplete. The executor MUST NOT author SUMMARY.md until the build is green. Fix the breakage (deviation Rule 1 / 3 — bug or blocker), commit the fix, then re-run this task.
  </action>
  <verify>
    <automated>cd {sub-workspace} && npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `cd {sub-workspace} && npm run build` exits 0.
    - No `error TS` strings appear in stdout/stderr.
    - No `warning:` strings related to unused imports or missing references (if the workspace's tsconfig enables `noUnusedLocals` / `noUnusedParameters`).
  </acceptance_criteria>
  <done>
    Full workspace build is clean. Safe to author SUMMARY.md.
  </done>
</task>
```

**Placeholder reminders:**

- `Task N` — replace with the actual task index (e.g., `Task 4`, `Task 6`, etc. — always the last task before SUMMARY).
- `{sub-workspace}` — the directory whose `package.json` owns the `scripts.build` to run. Multi-workspace plans chain commands.
- The example uses `npm run build`. If the sub-workspace uses a different toolchain (Swift SPM → `swift build`, flat Chrome extension → composite `tsc --noEmit` + `node --check`), substitute accordingly. The verbatim command MUST match what `{sub-workspace}/package.json` actually defines on the day the plan is authored.

## Enforcement

The convention is currently **structural**:

- **Planners** include the build-gate task in every TypeScript-touching PLAN.md they author (the Task Template above is copy-pasteable).
- **Executors** run the gate task before authoring SUMMARY.md (the `[BLOCKING]` prefix in the task name is the convention-side signal; executors honor it as a hard gate per the atomic-close-out invariant in `execute-plan.md`).
- **Reviewers** check during plan-review that any PLAN.md with TypeScript files in `files_modified` includes the gate task as its last entry.

The rule is NOT enforced by `gsd-sdk` validators today. Future enhancement (out of scope for Plan 129-12): add a `verify.plan-has-build-gate` validator that:

1. Parses PLAN.md frontmatter `files_modified`.
2. Filters to entries ending in `.ts`, `.tsx`, `.js`, `.jsx`.
3. If non-empty, parses the `<tasks>` block and confirms the final task name matches `/^Task \d+: \[BLOCKING\] full workspace build/`.
4. Emits an error if the gate is missing.

This is a forward-looking note, not a deliverable of this convention.

## Phase 129 Gap-Closure Plans That Walk the Talk

The following gap-closure plans in Phase 129 already adopt the build-gate convention:

- **Plan 129-07** (`129-07-PLAN.md`) — Task 4 is `[BLOCKING] Verify full vigil-extension + Safari lock-step build passes (build-gate)`, running a composite `npx tsc --noEmit` over the relocated test files + `node --check` over each modified `.js` file in `vigil-extension/` and `vigil-safari-extension/`. This is the canonical example of the flat-JS extension build-gate pattern.
- **Plan 129-08** (`129-08-PLAN.md`) — depends_on `[129-12]` and Task 2 acceptance includes `cd vigil-extension/... && npx tsc --noEmit` for the flat-JS popup setup work.
- **Plan 129-09** (`129-09-PLAN.md`) — Task 2 verify automated includes `npm run build` against `vigil-g2-plugin`; line 238 of the plan ends `... && npm run build` and the acceptance criteria explicitly call out "build-gate process from plan 129-12".
- **Plan 129-10** (`129-10-PLAN.md`) — Task 3 and Task 5 verify commands run `cd vigil-g2-plugin && npm run build`; the threat-register entry T-129-43 explicitly names "Build-gate from 129-12 catches TypeScript errors before SUMMARY" and lists the build-gate as the mitigation.
- **Plan 129-13** (`129-13-PLAN.md`) — phase-close meta-plan; verifies all of the above by `grep`-ing for build-gate task adoption across the gap-closure plan set.

These five plans were authored with the build-gate task in mind — they are the first concrete instances of the rule in active use. The Phase 129 close-out is also the first plan-set in repo history where every TypeScript-touching gap-closure plan ships with a `[BLOCKING] ... build` gate task.

## Cross-References

- **STATE.md (Decisions / Accumulated Context)** — see `.planning/STATE.md`, "Decisions" section under "Accumulated Context", for the high-level lessons-learned entry that points back to this document.
- **Phase 129 UAT-RESULTS.md** — see `.planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RESULTS.md`, section "GAP-129-H", for the original gap record discovered during operator UAT on 2026-05-16.
- **Phase 129 gap-closure plans** — `129-07-PLAN.md`, `129-08-PLAN.md`, `129-09-PLAN.md`, `129-10-PLAN.md`, `129-13-PLAN.md` (the "walk the talk" set).
- **Reusable task template (alternate location)** — `.planning/templates/build-gate-task.md` (fallback location; `.claude/get-shit-done/` does not exist in this repo, so the template is hosted here — see the README at `.planning/templates/` for discoverability).
- **Origin fix commits** — `ca91f60` (the `navigateTo` + `TTL_MS` fix), `57d7996` (the dev-sideload script that surfaced the build-breakage). Both landed 2026-05-16 in the same operator session.
- **Atomic close-out invariant** — see `$HOME/.claude/get-shit-done/workflows/execute-plan.md`, `<atomic_close_out_invariant>`, for the executor-side rule that gates SUMMARY.md on prior-task success.

---

**Maintenance note:** If any sub-workspace renames its `scripts.build`, removes its `package.json`, or moves to a different build toolchain, update Section "Canonical Command" of this document in the same commit that changes the workspace. The Task Template's example command must also be kept in sync — same maintenance discipline as keeping a function signature aligned with its doc-comment.
