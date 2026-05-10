---
phase: 124
plan: 04
subsystem: vigil-g2-plugin
tags: [g2-polish-07, home-overflow, drift-detector, screenshot-equality, partial-deferral]
status: partial
requirements: [G2-POLISH-07]

dependency-graph:
  requires:
    - "Phase 124 Plan 01 (plugin tsx + node:test infra)"
  provides:
    - "4-line Home body invariant (drift-tested)"
    - "buildHomeScreen / rebuildHomeScreen single-parameter (summary) public API"
  affects:
    - "vigil-g2-plugin/src/main.ts call site"
    - "vigil-g2-plugin/src/navigation.ts case Screen.HOME"

tech-stack:
  added: []
  patterns:
    - "Phase 123 Plan 03 source-content drift-detector pattern (fs.readFileSync + regex, comment-stripped)"
    - "Phase 124 D-13 atomic-revert plan structure (single behavior change in one commit)"
    - "Phase 123 Plan 05 wallclock/operator deferral pattern (autonomous prerequisites land + operator-action todo with full runbook)"

key-files:
  created:
    - "vigil-g2-plugin/src/screens/__tests__/home.test.ts"
    - ".planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md"
  modified:
    - "vigil-g2-plugin/src/screens/home.ts"
    - "vigil-g2-plugin/src/main.ts"
    - "vigil-g2-plugin/src/navigation.ts"

decisions:
  - "Task 3 (D-14 byte-identical PNG comparison) deferred to operator per the wallclock/physical-host carve-out; partial SUMMARY shipped with autonomous prerequisites (Tasks 1 & 2) committed atomically."
  - "Drift-detector tests strip line + block comments before substring assertion so a doc-comment mention of DIVIDER / affirmation cannot mask a real code regression — mirrors Phase 123 Plan 03 idiom."
  - "Imports preserved per call-site usage: fetchAffirmation kept in navigation.ts (still used by case Screen.AFFIRMATION); only main.ts's fetchAffirmation import is dropped (Home was its only consumer there)."

metrics:
  started: 2026-05-10T01:02:12Z
  completed: 2026-05-10T01:06:33Z
  duration_minutes: 4.3
  tasks_completed: 2
  tasks_total: 3
  task_3_status: deferred-to-operator
  files_changed: 4
  tests_added: 4
  tests_passing: 6
  tsc_clean: true
---

# Phase 124 Plan 04: G2 Home Overflow Polish (G2-POLISH-07) Summary

**Status:** PARTIAL — Tasks 1 and 2 complete and committed atomically. Task 3 (D-14 byte-identical PNG verification) deferred to operator per the wallclock/physical-host checkpoint carve-out. The structural fix is shipped; operator confirmation is the layered-on validation gate.

## One-liner

4-line Home body trim (drops inline affirmation + DIVIDER) + drift-detector lock for the 210px container regression — structural fix landed in 2 atomic commits, byte-identical sim PNG verification handed to operator.

## What got built

### Task 1 — `cf4984e` — `fix(124-04): trim Home body to 4 lines + drop affirmation parameter`

The home body content array shrunk from 7 entries to 4:

```typescript
// BEFORE (7 entries, overflowed 210px container per Phase 106
// HARDWARE-DIVERGENCE Divergence 4):
const bodyContent = [
  `* ${pendingCount} tasks pending`, '',
  'TOP PRIORITY:', topPriority, '',
  DIVIDER, affirmation.affirmation,
].join('\n')

// AFTER (4 entries, fits cleanly inside 210−16=194px usable height):
const bodyContent = [
  `* ${pendingCount} tasks pending`, '',
  'TOP PRIORITY:', topPriority,
].join('\n')
```

Cascading API change: `buildHomeContainers` / `buildHomeScreen` /
`rebuildHomeScreen` all dropped their `affirmation: VigilAffirmation`
parameter. Two call sites updated:

- `main.ts`: `Promise.all([fetchSummary(), fetchAffirmation()])` collapsed
  to a bare `await fetchSummary()`. The `fetchAffirmation` import was
  dropped from `main.ts` (Home was its only consumer there).
- `navigation.ts:case Screen.HOME`: same simplification. The
  `fetchAffirmation` import on `navigation.ts` was preserved because
  `case Screen.AFFIRMATION` still uses it.

Inside `home.ts`, the unused `VigilAffirmation` type import and the
`DIVIDER` constant import were removed. One doc-comment in the body
still references "DIVIDER" as English prose explaining what was removed
— this is documentation, not a code reference, and the drift detector
strips comments before its substring check.

### Task 2 — `3a67c41` — `test(124-04): drift detector locks 4-line Home body invariant`

Source-content drift detector at `vigil-g2-plugin/src/screens/__tests__/home.test.ts`. Pattern is mirrored exactly from Phase 123 Plan 03's
DriftDetectorTests: read `home.ts` via `fs.readFileSync`, strip line +
block comments first, then assert structural invariants via regex
substring matches.

Four tests, all green:

| # | Test | What it locks |
|---|------|---------------|
| 1 | `bodyContent array has exactly 4 entries` | Future ride-alongs cannot grow the body past 4 lines |
| 2 | `home.ts does not reference DIVIDER` (excluding comments) | The DIVIDER row cannot reappear as code |
| 3 | `home.ts does not reference affirmation parameter` | Neither `affirmation.affirmation` field access nor `: VigilAffirmation` parameter type can drift back |
| 4 | `buildHomeScreen takes one parameter (summary)` | Public API signature pinned to single-arg shape |

Tests run offline in <2ms each — no SDK exercise, no network, no Vite
involvement. Catches regressions at `npm test` time before they reach
hardware.

Closes T-124-04-01 (Tampering: home body content drifts back to overflow
shape on a future ride-along) — per the threat register's "mitigate"
disposition, the drift detector is the structural lock; future ride-
alongs that try to regrow the body trip the test before merge.

### Task 3 — D-14 byte-identical PNG verification — DEFERRED TO OPERATOR

**Why deferred:**

The verification gate is two consecutive `VITE_SCREENSHOT_MODE`
captures of the home screen producing byte-identical PNGs. The pipeline
requires:

1. `npm run build` (autonomous — possible)
2. Launch `evenhub-simulator` GUI desktop app (autonomous-impossible —
   GUI app, no headless mode in `--help`)
3. Manually navigate to Home screen
4. Manually click the 📸 capture button
5. Manually save the PNG file
6. Repeat 2–5 a second time
7. Run `cmp` to compare

Steps 2–5 are GUI-only operator actions. Per memory
`feedback_wallclock_checkpoint_exempt`, yolo mode
(`parallelization.skip_checkpoints: true`) does NOT bypass physical-host
actions or sim-screenshot pipelines requiring real environment setup.

**Operator runbook:**

Full runbook with verbatim shell commands and pass/fail handling lives at:

```
.planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md
```

Operator pastes the resulting `cmp` output (exit code + stdout) into the
"Task 3 D-14 verification" section of this SUMMARY.md when ready. If
PASS — Plan 04 closes; STATE.md advances. If FAIL — log a blocker and
either ride a fix into 124-04 or escalate to Phase 125 per D-14
deferred-item carve-out.

**Why structurally safe to defer:**

The PNG-equality gate is a CONFIRMATION layer over a structurally-
correct fix that's already shipped:

- Task 1's `bodyContent` literally has 4 entries — verifiable by reading
  `home.ts`. Math says 4 lines × default line-height fits cleanly inside
  210−16=194px usable container height. Overflow is structurally
  impossible at the container level.
- Task 2's drift detector means any future ride-along that grows
  `bodyContent` past 4 entries trips at `npm test` before merge.

This mirrors the Phase 123 Plan 05 pattern (24h soak — autonomous
prerequisites landed, `.planning/todos/pending/` operator-action with
full runbook + back-fill steps held the wallclock-bound gate). Plan
ships in `partial` state, not failed.

## Verification (autonomous portions)

```
$ cd vigil-g2-plugin
$ npx tsc --noEmit 2>&1 | grep -E 'src/(screens/home|main|navigation)\.ts'
(no output — zero errors in target files)

$ npx tsc --noEmit 2>&1
src/__tests__/smoke.test.ts(3,22): error TS2307: Cannot find module 'node:test' or its corresponding type declarations.
src/__tests__/smoke.test.ts(4,20): error TS2307: Cannot find module 'node:assert/strict' or its corresponding type declarations.
(2 pre-existing errors from Plan 01 baseline — out of scope; node types not in tsconfig include for tests)

$ npm test
✔ smoke: node:test runner executes
✔ smoke: TypeScript types compile under tsx loader
✔ G2-POLISH-07 drift: bodyContent array has exactly 4 entries
✔ G2-POLISH-07 drift: home.ts does not reference DIVIDER (excluding comments)
✔ G2-POLISH-07 drift: home.ts does not reference affirmation parameter
✔ G2-POLISH-07 drift: buildHomeScreen takes one parameter (summary)
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

## Task 3 D-14 verification (TO BE FILLED BY OPERATOR)

```
$ cd /tmp/vigil-124-04-png
$ cmp home-capture-1.png home-capture-2.png
< paste exact stdout >
< exit code = ? >
```

Outcome (tick one):

- [ ] PASS — full PNG byte-identical
- [ ] PASS — body-region crop byte-identical (header HH:MM drift)
- [ ] FAIL — investigation needed; details: <add>

Hardware retest:

- [ ] Deferred (operator unable to access glasses today; logged in STATE.md)
- [ ] Verified (operator on G2 glasses on <date>)

## Deviations from Plan

None during Tasks 1 and 2 — plan executed exactly as written. The
deferral of Task 3 is an explicit plan-spec carve-out (`autonomous:
false` in frontmatter, executor prompt directive: "if VITE_SCREENSHOT_MODE
pipeline can run in CI/headless... otherwise STOP and surface a clear
operator checkpoint... write a partial SUMMARY.md noting 'Task 3
deferred to operator'"), not a deviation.

### Auth gates encountered

None.

### Out-of-scope discoveries

The pre-existing 2 `tsc --noEmit` errors in `src/__tests__/smoke.test.ts`
(missing `node:test` / `node:assert/strict` types) are Plan 01 baseline
artifacts — not caused by Plan 04 changes. Plan 01's `tsconfig.json`
left `@types/node` outside the test-file include scope; resolution is
out-of-scope per executor scope-boundary rules. Logged as informational;
not adding to deferred-items.md unless Phase 124 Plan 05+ inherits the
problem.

## Self-Check

### Files claimed created (verifying existence)

```
$ test -f vigil-g2-plugin/src/screens/__tests__/home.test.ts && echo FOUND
FOUND
$ test -f .planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md && echo FOUND
FOUND
```

### Commits claimed (verifying)

```
$ git log --oneline | grep -E '(cf4984e|3a67c41)'
3a67c41 test(124-04): drift detector locks 4-line Home body invariant
cf4984e fix(124-04): trim Home body to 4 lines + drop affirmation parameter
```

## Self-Check: PASSED

All claimed files exist; both claimed commits present in `git log`.
Partial-status flagged honestly — autonomous portion (Tasks 1 + 2) is
complete and verified; Task 3 is structurally documented as
operator-deferred per the wallclock/physical-host carve-out, with full
runbook preserved in pending todos and a single inline section
(`Task 3 D-14 verification`) ready for the operator to fill in.
