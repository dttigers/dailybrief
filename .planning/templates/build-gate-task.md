---
template: build-gate-task
status: active
canonical_rule: .planning/conventions/build-gate.md
applies_to: any PLAN.md whose files_modified includes any .ts / .tsx / .js / .jsx file
location_rationale: |
  The canonical .claude/get-shit-done/ template directory does not exist in this repo.
  This template is hosted under .planning/templates/ as the fallback location per
  Plan 129-12 Task 2's directory-availability rule. The .planning/conventions/build-gate.md
  Cross-References section points here.
origin: Phase 129 / Plan 12 / GAP-129-H
---

# Build-Gate Task Template (reusable across plans)

Drop the XML snippet below into any PLAN.md as the **LAST `<task>` element** before the closing `</tasks>` tag — but only when the plan's `files_modified` includes TypeScript or JavaScript source (production or test). See `.planning/conventions/build-gate.md` for the canonical rule, the rationale (GAP-129-H), the exceptions (doc-only / SQL-only / process plans), and the per-workspace canonical commands.

## The Template

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

## Placeholders to Customize

| Placeholder | Replace with | Notes |
|-------------|--------------|-------|
| `Task N` | The actual task index (`Task 4`, `Task 6`, etc.) | Must be the LAST task before `</tasks>`. |
| `{sub-workspace}` | The directory whose `package.json` owns `scripts.build` | Examples: `vigil-g2-plugin`, `vigil-core`, `vigil-pwa`. |
| `npm run build` command | Whatever `{sub-workspace}/package.json` actually defines | Verify by running `cd {sub-workspace} && npm pkg get scripts.build` on plan-author day. |

## Multi-Workspace Plans

When a plan modifies more than one sub-workspace, chain the build commands with `&&` so the gate fails if ANY sub-workspace fails to build:

```xml
<verify>
  <automated>cd vigil-core && npm run build && cd ../vigil-pwa && npm run build</automated>
</verify>
```

## Non-`npm run build` Toolchains

Some surfaces in this repo do NOT have `npm run build`:

- **`vigil-extension/`** (flat Chrome extension, no `package.json`) — use the composite pattern from Plan 129-07 Task 4: `npx tsc --noEmit` over the TypeScript test files + `node --check` over each modified `.js` file.
- **`vigil-safari-extension/`** (flat Safari extension, Xcode-driven) — same composite pattern.
- **`vigil-watch/`** (Swift SPM) — use `cd vigil-watch && swift build` instead.

For these surfaces, replace the `<automated>` body with the composite command appropriate for the toolchain. The `[BLOCKING]` task-name prefix and the SUMMARY-gating semantics are unchanged.

## When NOT to Include This Task

Per `.planning/conventions/build-gate.md` Section "Exceptions", the gate is NOT required when the plan's `files_modified` contains:

- Only `.md` / `.txt` / non-code config files (doc-only plans like 129-11).
- Only `.sql` migrations with NO corresponding `schema.ts` update.
- Only image / font / audio / video assets.
- Only `.planning/` governance files (process-only plans like 129-12).

All other plans MUST include the gate, including plans that only modify test files.

## Cross-References

- **Canonical rule** — `.planning/conventions/build-gate.md`
- **Origin gap** — `.planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RESULTS.md` (GAP-129-H section)
- **Fix commits** — `ca91f60` and `57d7996` (the two commits that revealed the gap on 2026-05-16)
- **Walk-the-talk examples** — `129-07-PLAN.md` Task 4, `129-09-PLAN.md` Task 2, `129-10-PLAN.md` Tasks 3 and 5
