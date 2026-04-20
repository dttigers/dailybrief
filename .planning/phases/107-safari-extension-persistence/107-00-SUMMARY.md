---
phase: 107-safari-extension-persistence
plan: 00
subsystem: testing
tags: [bash, plutil, xcodebuild, smappservice, sfltool, human-uat]

requires:
  - phase: 105-product-events-api-metrics-user-identity
    provides: "HUMAN-UAT.md shape (frontmatter + Current Test / Tests / Summary / Gaps body) reused verbatim"
provides:
  - "Scripts/verify-phase-107.sh — one-shot 6-check verification harness (--static / --runtime / --full modes)"
  - "107-HUMAN-UAT.md — 5 pending SC#1 reboot + SC#2 no-window-flash tracker"
affects: [107-01, 107-02, 107-03, 107-04]

tech-stack:
  added: []
  patterns:
    - "Verification harness lands BEFORE implementation (RED-by-default at phase level, not just plan level)"
    - "HUMAN-UAT.md with status=ship-with-uat-pending for reboot-gated SCs — mirrors 105 shape"

key-files:
  created:
    - Scripts/verify-phase-107.sh
    - .planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md
  modified: []

key-decisions:
  - "Script committed under Scripts/ (canonical git-tracked casing), not scripts/ as plan referenced — macOS case-insensitive fs masked the difference; SCRIPT_DIR resolves at runtime so path references inside the script are unaffected"
  - "--static mode is default when no arg passed (matches plan spec — fastest feedback loop for Plans 01-03 executors)"

patterns-established:
  - "Phase-level verify script: Scripts/verify-phase-{N}.sh convention — can extend to future phases with automated + human-UAT gates"
  - "Runtime RED at harness level: Checks 1/3/4 currently fail (exit 1); turn green as Plans 01-03 land their implementation"

requirements-completed: []  # EXT-01 tracked across the full phase; Plan 00 is scaffold only, not a requirement-completing plan

duration: 2m
completed: 2026-04-20
---

# Phase 107 Plan 00: Wave 0 Verification Harness Summary

**Verification scaffold lands BEFORE implementation: Scripts/verify-phase-107.sh (6 automated D-07 checks across 3 modes) + 107-HUMAN-UAT.md (5 pending SC#1 reboot + SC#2 no-window-flash tests, ship-with-uat-pending gate).**

## Performance

- **Duration:** 2m
- **Started:** 2026-04-20T18:49:56Z
- **Completed:** 2026-04-20T18:52:36Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Executable `Scripts/verify-phase-107.sh` (148 lines, `set -euo pipefail`, bash -n clean) implements 6 D-07 automated checks — plutil LSUIElement, MACOSX_DEPLOYMENT_TARGET, SMAppService register+status guard, first-launch NSAlert pattern, xcodebuild Debug build, post-launch sfltool/launchctl probe
- Three modes: `--static` (default, < 10s, checks 1-4), `--runtime` (xcodebuild + SMAppService probe, checks 5-6), `--full`/no-arg-pass-through (all 6)
- `--static` run today exits 1 as designed: Check 2 PASSES (MACOSX_DEPLOYMENT_TARGET=15.7 already in pbxproj from prior phases); Checks 1/3/4 FAIL because LSUIElement + AppDelegate body land in Plans 01-03
- `.planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md` with `status: ship-with-uat-pending` tracks the two SCs that can't be automated: SC#1 (physical reboot persistence + Login Items entry + end-to-end post-reboot capture) and SC#2 (first-launch NSAlert + no window flash, subsequent-launch no NSAlert)
- 5/5 tests start as `result: pending`, `total: 5`, Summary/Gaps sections match 105-HUMAN-UAT.md shape verbatim

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Scripts/verify-phase-107.sh with --static and --runtime modes** — `36e6903` (feat)
2. **Task 2: Create 107-HUMAN-UAT.md with SC#1 reboot + SC#2 no-window-flash pending entries** — `513ca96` (docs)

## Files Created/Modified
- `Scripts/verify-phase-107.sh` — executable 148-line bash harness with 3 modes and 6 D-07 checks (148 insertions)
- `.planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md` — ship-with-uat-pending tracker, 5 pending tests, matches 105 shape (46 insertions)

## Decisions Made
- **Scripts/ vs scripts/ path:** PLAN.md referenced `scripts/verify-phase-107.sh` but the canonical git-tracked directory is `Scripts/` (capital S); macOS HFS+/APFS case-insensitivity masked this in local checkouts. Committed under `Scripts/` to keep git consistent with existing bootstrap.sh/build.sh/install.sh/etc. Script uses runtime `SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )` so casing does not affect behavior.
- **Default mode = --static:** Matches plan spec (fastest feedback loop for Wave 1-3 executors). `--runtime` and `--full` require xcodebuild (~2 min) so gated to post-build verification in Plan 04.
- **No pre-Plan-01 auto-fix for pitfall 4/5:** Plan 00 establishes the harness only. Per RESEARCH Pitfall 4/5, any sandbox/launchd cache error surfaced by Check 6 is routed to Plan 05 (entitlements fallback), not patched inline.

## Deviations from Plan

**None — plan executed exactly as written.**

The Scripts/ vs scripts/ casing is a documentation-level path note (macOS case-insensitive fs makes `scripts/verify-phase-107.sh` and `Scripts/verify-phase-107.sh` resolve to the same inode locally); git normalizes to the tracked `Scripts/` casing. No action was needed beyond staging under the correct casing. Not classified as a Rule 1-3 auto-fix — the file content matches the plan spec verbatim.

## Verification

**Script acceptance criteria (all pass):**
- `test -x Scripts/verify-phase-107.sh` → 0
- `bash -n Scripts/verify-phase-107.sh` → 0
- `grep -q 'plutil -extract LSUIElement raw'` → 0
- `grep -q 'SMAppService.mainApp.register()'` → 0
- `grep -q 'SMAppService.mainApp.status'` → 0
- `grep -qE 'firstLaunch[A-Za-z]*Alert'` → 0
- `grep -qE 'MACOSX_DEPLOYMENT_TARGET = 1[3-9]'` → 0
- `grep -q 'xcodebuild build'` → 0
- `grep -q 'sfltool dumpbtm'` → 0
- `grep -qE 'case "?\$MODE"?'` → 0
- `bash Scripts/verify-phase-107.sh --static` → exit 1 (expected: Check 2 PASS, Checks 1/3/4 FAIL pre-implementation)

**HUMAN-UAT acceptance criteria (all pass):**
- File exists at `.planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md` → 0
- `grep -q 'status: ship-with-uat-pending'` → 0
- `grep -q 'phase: 107-safari-extension-persistence'` → 0
- `grep -qE '^### 1\. Reboot persistence'` → 0
- `grep -qE '^### 3\. First-launch NSAlert'` → 0
- `grep -q 'result: pending'` → 0
- `grep -q 'total: 5'` → 0
- `grep -cE '^### [0-9]+\.'` → 5
- `grep -c '^## '` → 4 (Current Test / Tests / Summary / Gaps)
- `head -7 | grep -c '^---$'` → 2 (YAML frontmatter delimiters)

## Pre-implementation Check Status

| Check | Status today | Turns green in |
|-------|--------------|----------------|
| 1. LSUIElement=true | FAIL | Plan 01 (Info.plist edit) |
| 2. MACOSX_DEPLOYMENT_TARGET ≥ 13 | PASS | Already passes — project-level setting is 15.7 |
| 3. SMAppService.mainApp.register() + .status | FAIL | Plan 02 (AppDelegate body) |
| 4. firstLaunch NSAlert + UserDefaults | FAIL | Plan 03 (first-launch UX) |
| 5. xcodebuild Debug build | UNREACHABLE | Plan 04 (full build) |
| 6. sfltool/launchctl post-launch probe | UNREACHABLE | Plan 04 (runtime verification) |

## Issues Encountered

None.

## Next Phase Readiness

- **Wave 1 (Plan 01)** can start against the harness immediately — every implementation plan's verification step runs `bash Scripts/verify-phase-107.sh --static` and watches failures turn to passes.
- **Wave 3 (Plan 04)** gates on `--runtime` (xcodebuild + SMAppService probe); if sfltool/launchctl returns no `io.vigilhub.extension` row, route to Plan 05 entitlements fallback per RESEARCH Pitfall 4/5.
- **Ship gate (Phase 107 complete):** Automated checks 1-6 all green AND user eventually updates `107-HUMAN-UAT.md` → `status: complete` after reboot-UAT.

## Self-Check: PASSED

- `Scripts/verify-phase-107.sh` → FOUND (148 lines, executable, bash -n clean)
- `.planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md` → FOUND (46 lines, matches 105 shape)
- Commit `36e6903` → FOUND (Task 1: feat(107-00) verify-phase-107.sh)
- Commit `513ca96` → FOUND (Task 2: docs(107-00) 107-HUMAN-UAT.md)
- Script `--static` exit code 1, Check 2 PASS, Checks 1/3/4 FAIL → matches plan verification spec verbatim
- No new untracked generated files introduced by Plan 00 tasks

---
*Phase: 107-safari-extension-persistence*
*Completed: 2026-04-20*
