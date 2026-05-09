---
phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak
plan: 05
subsystem: infra
tags: [vigil-watch, soak, bash, awk, 24h-gate, verification, xctest, fixtures]

# Dependency graph
requires:
  - phase: 123-04
    provides: sampler launchd agent (StartInterval=300) appending CSV rows ts,pid,rss_kb,etime_seconds — soak-check.sh's input source
  - phase: 122
    provides: daemon being soaked + EmitterActor.currentSnapshot the runtime-state.json writer reflects
provides:
  - scripts/soak-check.sh — bash assertion enforcing all 5 D-09 gates (max RSS<30MB, span≥85800s, single PID, ≥1 sample, Core readback >0 sessions); --no-core-check flag for unit-test mode
  - 5 synthetic CSV fixtures (soak-good, soak-rss-too-high, soak-multi-pid, soak-short-span, soak-empty) pinning every failure mode
  - SoakCheckTests.swift — 5 XCTest cases asserting exit code + stderr error class via Process exec of bash + script + fixture
  - 123-VERIFICATION.md skeleton — soak-gate row pre-allocated for operator paste; AGENT-WATCH-04 / 05 / 07 gate rows pre-populated
  - Operator-driven 24h soak run deferred to `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` (D-10: cannot be auto-run)
affects:
  - Phase 123 closeout (gated on operator pasting soak-check.sh summary into 123-VERIFICATION.md)
  - Phase 124 (G2 Companion HUD launch — blocked on Phase 123 closeout)

# Tech tracking
tech-stack:
  added: []  # bash + awk + curl + jq are macOS toolchain; no SPM deps
  patterns:
    - bash assertion script with `set -euo pipefail` + per-gate explicit error message + summary table for VERIFICATION back-fill
    - --no-core-check flag pattern: production path requires VIGIL_API_KEY for live readback; unit-test path skips network entirely (sandbox-friendly, no key leak)
    - awk-based CSV aggregation with empty-pid-row tolerance — matches sampler's "daemon was not running" semantics
    - SwiftPM resource fixture lookup with repo-root fallback (Bundle.module + filesystem fallback) — defensive against tooling drift
    - Plan with `autonomous: false` final task → all autonomous prerequisites land + checkpoint deferred to todos (mode=yolo skip_checkpoints does NOT apply to wallclock-bound checkpoints)

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/scripts/soak-check.sh
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/SoakCheckTests.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/Fixtures/soak-good.csv
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/Fixtures/soak-rss-too-high.csv
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/Fixtures/soak-multi-pid.csv
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/Fixtures/soak-short-span.csv
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/Fixtures/soak-empty.csv
    - .planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-VERIFICATION.md
    - .planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md
  modified: []

key-decisions:
  - "Plan 05 final task (24h soak) deferred to operator todo per D-10 + Plan frontmatter `autonomous: false` — `mode: yolo / skip_checkpoints: true` only auto-skips confirmation gates; checkpoints whose payload requires real wall-clock time (24h is a hard physical constraint) are exempt"
  - "soak-check.sh refines RESEARCH §'soak-check.sh skeleton' line 822 LAST_TS calculation: `awk '$2 != \"\" {ts=$1} END {print ts}'` picks the last NON-EMPTY-pid row's timestamp, robust to trailing crash-rows where the daemon stopped mid-sample"
  - "--no-core-check flag is the single-source mechanism for sandbox testing — refinement called out in PATTERNS.md §SoakCheckTests; without the flag, VIGIL_API_KEY env is required for the curl readback (fail-fast if missing)"
  - "SoakCheckTests resolves fixtures via Bundle.module FIRST, falls back to repo-root filesystem path on lookup failure — defensive against SPM resource-bundling drift across toolchains; pattern lifted from scriptPath() symmetry"
  - "Pre-existing StateStoreTests.testRecordMilestoneRoundTrip carry-forward continues unchanged (149→154 passing, +5 SoakCheckTests; 1 pre-existing failure tracked in deferred-items.md from Plan 01 baseline)"
  - "Synthetic-CSV fixtures use full `ts,pid,rss_kb,etime_seconds` schema even though etime_seconds isn't currently checked by the script — preserves the raw CSV shape so future schema additions can ride-along without rewriting fixtures"
  - "soak-empty.csv has 3 rows with empty pid columns (NOT zero rows) — exercises the script's `$2 != \"\"` filter not just an empty-file edge case; daemon-never-running is a realistic 24h-window scenario worth pinning"
  - "VERIFICATION.md groups by requirement (AGENT-WATCH-04/05/07) not by plan number — when downstream phases close their gates the table reads naturally; cross-cutting items (Phase 122 carry-forward SIGSEGV, empty session_id drop rate) get answered structurally by the soak's PID-uniqueness assertion"

patterns-established:
  - "Wallclock-bound checkpoint deferral: when a plan has `autonomous: false` because its final task requires real wall-clock time, executor lands all autonomous prerequisites + writes a `.planning/todos/pending/` operator-action with the verbatim runbook + back-fill instructions, instead of stopping execution mid-plan"
  - "soak-check.sh PHASE 123 SOAK GATE: PASSED success marker as the verbatim VERIFICATION.md back-fill string — script's stdout becomes the audit trail, no separate report-writing step"
  - "Process-based bash testing in XCTest: `Process` + `/bin/bash` + script + fixture path + Pipe capture + waitUntilExit + exit-code assertion — no test-runner-deadlock risk because the script is short-lived (no `tail -f`)"

requirements-completed: [AGENT-WATCH-07]
# Note: AGENT-WATCH-07 is COMPLETE for the AUTONOMOUS portion. Final phase-close gate
# (operator paste of soak-check.sh summary into 123-VERIFICATION.md) is deferred to
# `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md`.

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 123 Plan 05: 24h Soak Gate Summary

**Bash assertion script (`scripts/soak-check.sh`) enforces 5 D-09 gates verbatim, 5 SoakCheckTests pin every failure mode against synthetic CSV fixtures, 123-VERIFICATION.md skeleton lays out the gates pre-allocated for operator back-fill — autonomous portion of AGENT-WATCH-07 complete; the actual 24h wallclock run is deferred to a pending operator todo.**

## Performance

- **Duration:** ~8 min (autonomous portion only — 24h soak is operator-driven and not counted)
- **Started:** 2026-05-09T19:53:00Z (approx)
- **Completed:** 2026-05-09T20:01:00Z (approx)
- **Tasks:** 3 autonomous + 1 deferred (`checkpoint:human-verify` Task 5.4 → operator todo)
- **Files created:** 9 (1 script, 1 test file, 5 CSV fixtures, 1 VERIFICATION skeleton, 1 operator-todo)

## Accomplishments

- `scripts/soak-check.sh` is the deterministic AGENT-WATCH-07 gate: exits 0 iff `max(rss_kb)<30000` AND `span≥85800s` AND single PID AND ≥1 non-empty row AND vigil-core /v1/agent-sessions returns >0 sessions
- `--no-core-check` flag enables sandbox-friendly testing without leaking VIGIL_API_KEY into XCTest harness; production path still demands the env var (fail-fast)
- 5 synthetic CSV fixtures pin every D-09 failure mode: rss-too-high (32MB), multi-pid (12345 → 67890), short-span (20h < 23h50m), empty (all-blank pid), good (24h+ single-PID 12.5MB)
- 5 SoakCheckTests exec `/bin/bash` against script + fixture, capture exit + stderr, assert error class — fail loudly if script's gate logic silently regresses
- `123-VERIFICATION.md` skeleton lays out every Phase 123 gate (AGENT-WATCH-04/05/07) with the soak-row pre-allocated for operator paste of the script's summary table
- The actual 24h wallclock soak run is captured as `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` with the verbatim runbook + back-fill steps — Phase 123 closeout is gated on operator executing this todo

## Task Commits

Each autonomous task committed atomically. Code commits in **vigil-watch repo**, planning artifacts in **dailybrief repo**:

1. **Task 5.1: scripts/soak-check.sh + chmod +x + smoke** — `cde254b` (feat) — *vigil-watch*
2. **Task 5.2: 5 fixture CSVs + SoakCheckTests** — `67ab62f` (test) — *vigil-watch*
3. **Task 5.3: 123-VERIFICATION.md skeleton** — folded into plan-metadata commit (planning artifact, dailybrief repo)
4. **Task 5.4: operator-driven 24h soak** — DEFERRED to `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` (D-10: cannot auto-run)

**Plan metadata commit (dailybrief):** This file + 123-VERIFICATION.md + STATE.md + ROADMAP.md + operator-todo.

## Files Created/Modified

**vigil-watch repo (code):**
- `scripts/soak-check.sh` — bash assertion script (80 lines): set -euo pipefail, 5 D-09 gates, --no-core-check flag, "PHASE 123 SOAK GATE: PASSED" success marker, summary table (max RSS / unique PIDs / uptime span / samples / Core sessions)
- `Tests/VigilWatchTests/SoakCheckTests.swift` — 5 XCTest cases: testGoodSoakPasses, testRSSAboveThresholdFails, testMultiplePIDsFails, testShortSpanFails, testEmptyCSVFails — Process exec + Pipe capture + exit code + stderr substring assertions
- `Tests/VigilWatchTests/Fixtures/soak-good.csv` — 5-row synthetic 24h+ span, single PID 12345, max RSS 12500 KB
- `Tests/VigilWatchTests/Fixtures/soak-rss-too-high.csv` — 3-row with one row at 32000 KB (RSS gate trips)
- `Tests/VigilWatchTests/Fixtures/soak-multi-pid.csv` — 4-row with PID transition 12345 → 67890 (single-PID gate trips)
- `Tests/VigilWatchTests/Fixtures/soak-short-span.csv` — 3-row with 20h span (span gate trips at < 85800s)
- `Tests/VigilWatchTests/Fixtures/soak-empty.csv` — 3-row with all-blank pid columns (≥1 non-empty row gate trips)

**dailybrief repo (planning artifacts):**
- `.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-VERIFICATION.md` — gate table for AGENT-WATCH-04/05/07 + operator procedure for soak run + soak-row placeholder
- `.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-05-SUMMARY.md` — this file
- `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` — operator-action runbook for the 24h soak gate
- `.planning/STATE.md` — position advance, decisions, session, deferred-item add
- `.planning/ROADMAP.md` — Phase 123 plan-progress row 05 → autonomous-portion done; full row → 4/5 → awaiting soak

## Decisions Made

See key-decisions in frontmatter — 8 substantive decisions captured. Headline:

1. **Wallclock-bound checkpoint deferral pattern.** When a plan's final checkpoint cannot be auto-skipped because its payload requires real wallclock time (24h is a hard physical constraint), executor lands all autonomous prerequisites + writes a `.planning/todos/pending/` operator-action with the runbook, instead of stopping execution mid-plan. This is consistent with `mode: yolo / skip_checkpoints: true` for confirmation gates while preserving the gate's actual real-world correctness signal.
2. **soak-check.sh refines RESEARCH skeleton.** The plan's RESEARCH skeleton (line 822) had `LAST_TS=$(awk -F, 'END {print $1}')` which would pick up trailing empty rows. Refinement: `awk -F, '$2 != "" {ts=$1} END {print ts}'` picks the last NON-EMPTY-pid row, robust to trailing crash rows. Same gate semantics, more correct calculation.
3. **--no-core-check is the test-time mechanism, not a config option.** Production path always demands VIGIL_API_KEY for the curl readback (fail-fast if missing); unit-test path skips network entirely. Single source of truth: the flag's presence.

## Threat-Mitigation Traces

This plan introduced no new threats per the Plan 05 `<threat_model>` block. Carry-forward dispositions held:

| Threat | Disposition | Status |
|--------|-------------|--------|
| Soak CSV log injection (rogue events causing parse failure mid-soak) | accept | Held — sampler is launchd-supervised, no user input enters the CSV; awk parser tolerates missing PID column explicitly |
| VIGIL_API_KEY exposed in `ps -E` while curl runs | accept | Held — same trust boundary as Plan 03 Test subcommand; curl runs ≤10s during gate check; macOS `ps` does not show env by default |

## Deviations from Plan

### Auto-fixed Issues

None during the autonomous portion. The `--no-core-check` refinement noted in the plan body was already part of the planned script body (D-09 specification with `if [ "$NO_CORE_CHECK" = "true" ]` branch), not a deviation.

### Deferred Items

**1. [Per Plan: Task 5.4 is `checkpoint:human-verify` with `gate=blocking`] 24h operator-driven soak run**
- **Plan-explicit:** Frontmatter `autonomous: false` with note "final task is checkpoint:human-verify (24h soak is operator-driven per D-10)"
- **Why deferred:** A 24h soak window cannot be simulated; it requires the operator's actual wallclock time + normal Claude Code daily-driver use over 24 hours
- **Tracking:** `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` with the verbatim runbook + back-fill steps + failure-mode triage
- **Phase 123 closeout gate:** Operator must execute the todo, paste the soak-check.sh summary verbatim into 123-VERIFICATION.md, flip the soak-row Status from `pending` to `PASSED`, then move the todo to `done/`. Phase 123 cannot close until this happens

---

**Total deviations:** 0 auto-fixed (autonomous portion landed first-try)
**Impact on plan:** Zero scope creep, zero architectural change. Plan's `autonomous: false` flag was honored verbatim — autonomous portion completed + final wallclock checkpoint deferred to operator todo.

## Issues Encountered

None — all 3 autonomous tasks landed first-try. SoakCheckTests passed 5/5 on first run; full suite 154/155 (1 pre-existing StateStoreTests.testRecordMilestoneRoundTrip carry-forward unchanged from Plan 01 baseline, tracked in `deferred-items.md`).

Pre-flight smoke against each fixture before writing tests confirmed:

| Fixture | Expected | Actual exit | Stderr classification |
|---------|----------|-------------|----------------------|
| soak-good.csv | 0 + "PHASE 123 SOAK GATE: PASSED" | 0 | (none) |
| soak-rss-too-high.csv | non-zero | 1 | "FAIL: max RSS 32000 >= 30000 KB" |
| soak-multi-pid.csv | non-zero | 1 | "FAIL: 2 distinct PIDs (KeepAlive should have held one)" |
| soak-short-span.csv | non-zero | 1 | "FAIL: span 72000s < 85800s (23h50m gate)" |
| soak-empty.csv | non-zero | 1 | "FAIL: no non-empty rows — daemon never sampled" |

Each fixture trips its intended D-09 gate, no others.

## User Setup Required

**Phase 123 closeout pending operator action.** This plan's autonomous portion is complete, but Phase 123 cannot close until the operator executes the 24h soak run.

Operator next action: see `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` for the verbatim runbook (build release → install → live 24h → run soak-check.sh → paste summary into 123-VERIFICATION.md → flip status → move todo to done/).

## Next Phase Readiness

**Phase 123 autonomous-portion COMPLETE; operator gate OPEN for closeout.**

Plan progression:
- Wave 1: Plans 01 + 02 ✓ (foundation)
- Wave 2: Plans 03 + 04 ✓ (subcommand bodies + launchd integration)
- Wave 3: Plan 05 ✓ (autonomous portion) + operator-driven 24h soak (DEFERRED)

After operator runs the soak gate and back-fills 123-VERIFICATION.md:
1. Phase 123 closes (5/5 plans, AGENT-WATCH-04 / 05 / 07 all PASSED with VERIFICATION evidence).
2. Phase 124 (G2 Companion HUD + WebSocket fan-out) unblocks — needs real events flowing through the daemon to render in dev.

If the soak gate fails on any of the 5 D-09 conditions, scope a Phase 123-gap plan via `/gsd-plan-phase 123 --gaps`. The failure mode itself is signal:
- max RSS gate → memory leak (investigate before phase close)
- distinct PIDs → KeepAlive bug or daemon crash (Phase 122 SIGSEGV flake suspect)
- span < 85800s → operator interrupted soak; rerun
- no non-empty rows → sampler launchd misconfig; check Plan 04 plist
- Core returned 0 sessions → auth drift between daemon and vigil-core

**Carry-forward (unchanged):** StateStoreTests.testRecordMilestoneRoundTrip pre-existing failure tracked in `deferred-items.md` — out of scope for Plan 05.

## Self-Check: PASSED

Verified post-write:

- [x] `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/scripts/soak-check.sh` exists, executable, contains "PHASE 123 SOAK GATE: PASSED" + "30000" + "85800" + "v1/agent-sessions" + "no-core-check" + "set -euo pipefail"
- [x] All 5 fixture CSVs exist under `Tests/VigilWatchTests/Fixtures/`
- [x] `Tests/VigilWatchTests/SoakCheckTests.swift` exists with 5 test functions (testGoodSoakPasses, testRSSAboveThresholdFails, testMultiplePIDsFails, testShortSpanFails, testEmptyCSVFails)
- [x] `swift test --filter SoakCheckTests` — 5/5 passing in 0.34s
- [x] Full suite — 154 passing of 155 (only pre-existing StateStoreTests.testRecordMilestoneRoundTrip carry-forward fails)
- [x] `.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-VERIFICATION.md` exists with AGENT-WATCH-04 / 05 / 07 sections + "PHASE 123 SOAK GATE: PASSED" placeholder + "Operator procedure" block
- [x] `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` exists with verbatim 8-step runbook
- [x] Commit `cde254b` exists in vigil-watch git log (Task 5.1 — soak-check.sh)
- [x] Commit `67ab62f` exists in vigil-watch git log (Task 5.2 — fixtures + SoakCheckTests)
- [x] No accidental file deletions in any task commit (checked via `git diff --diff-filter=D --name-only HEAD~1 HEAD`)

---
*Phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak*
*Completed: 2026-05-09 (autonomous portion; operator-driven 24h soak deferred)*
