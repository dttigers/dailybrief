---
phase: 123
slug: vigil-watch-shell-launchd-integration-cli-surface-24h-soak
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 123 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth: `123-RESEARCH.md` §"Validation Architecture" (do not duplicate; cross-reference).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (Phase 122 standard, 106 tests already in suite) |
| **Config file** | none — Swift Package Manager auto-discovers `Tests/VigilWatchTests/` |
| **Quick run command** | `swift test --filter <SuiteName>` (e.g. `RuntimeStateWriterTests`) |
| **Full suite command** | `cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch" && swift test` |
| **Smoke / live-integration framework** | bash + `curl` + `launchctl` invoked from operator shell (not XCTest) |
| **24h soak framework** | `scripts/soak-check.sh` (bash + awk) in vigil-watch repo |
| **Estimated full-suite runtime** | <30s (projected post-Wave 1; ~110+ tests) |

---

## Sampling Rate

- **After every task commit:** Run `swift test --filter <relevant-suite>` (Wave 1 unit suites <5s each)
- **After every plan wave:** Run `cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch" && swift test` (full XCTest)
- **Phase gate (before /gsd-verify-work):** Full suite green PLUS `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv` exits 0 PLUS post-reboot resume manual smoke succeeds
- **24h soak:** operator-driven, one-shot per phase (per CONTEXT D-10)
- **Max feedback latency:** 30s (full suite cap)

---

## Per-Task Verification Map

> Plan IDs / Task IDs are TBD until planner runs. The per-task table below is filled in by the planner; the rows here pre-allocate verification rows from RESEARCH §"Phase Requirements → Test Map" so the planner can drop them into individual plans.

| Behavior | Requirement | Test Type | Automated Command | File Exists | Status |
|----------|-------------|-----------|-------------------|-------------|--------|
| Plist template renders to valid XML | AGENT-WATCH-04 | unit | `swift test --filter PlistTemplateTests/testDaemonPlistRendersValidXML` | ❌ W0 | ⬜ pending |
| Plist template uses self-closing booleans (`<true/>`) — drift detector | AGENT-WATCH-04 | unit | `swift test --filter PlistTemplateTests/testNoNonSelfClosingBooleans` | ❌ W0 | ⬜ pending |
| Install renders + `plutil -lint` clean for both plists | AGENT-WATCH-04 | integration (manual) | `swift run vigil-watch install && plutil -lint ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist` | n/a | ⬜ pending |
| `launchctl bootout` on never-loaded service exits 3; install tolerates | AGENT-WATCH-04 | integration (manual) | `launchctl bootout gui/$(id -u)/com.morrillholdings.vigil.watch; echo $?` (expect 3 or 0) | n/a | ⬜ pending |
| `launchctl bootstrap` succeeds end-to-end | AGENT-WATCH-04 | manual + integration | `swift run vigil-watch install && launchctl print gui/$(id -u)/com.morrillholdings.vigil.watch \| grep "state = running"` | n/a | ⬜ pending |
| `vigil-watch uninstall` removes both plists + bootouts both labels | AGENT-WATCH-04 | integration (manual) | `swift run vigil-watch uninstall && [ ! -f ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist ]` | n/a | ⬜ pending |
| `vigil-watch run` boots daemon (smoke matches Phase 122 main.swift) | AGENT-WATCH-05 | manual | foreground run + Ctrl-C drain timing visible | n/a | ⬜ pending |
| `vigil-watch run --verbose` enables stderr lifecycle logs | AGENT-WATCH-05 | unit | `swift test --filter RunSubcommandTests/testVerboseFlagEnablesStderrLogs` | ❌ W0 | ⬜ pending |
| `vigil-watch tail <session-id>` filters NDJSON to single session | AGENT-WATCH-05 | unit (mocked log file) | `swift test --filter TailSubcommandTests/testFilterMatchesOnlyTargetSession` | ❌ W0 | ⬜ pending |
| `vigil-watch test` POSTs and exits 0 on 2xx | AGENT-WATCH-05 | unit (StubHTTPClient) | `swift test --filter TestSubcommandTests/testPostsAndExitsZeroOn201` | ❌ W0 | ⬜ pending |
| `vigil-watch test` exits non-zero on 4xx/5xx/network error | AGENT-WATCH-05 | unit | `swift test --filter TestSubcommandTests/testExitsNonZeroOn401` | ❌ W0 | ⬜ pending |
| `vigil-watch status` reads `runtime-state.json` and prints state | AGENT-WATCH-05 | unit (tmp dir) | `swift test --filter StatusSubcommandTests/testReadsAndPrintsState` | ❌ W0 | ⬜ pending |
| `vigil-watch status` falls back to `launchctl print` when file stale | AGENT-WATCH-05 | manual | `kill -9 <pid>; sleep 6; vigil-watch status` (expect "NOT RUNNING") | n/a | ⬜ pending |
| `vigil-watch status` reports NOT INSTALLED when nothing loaded | AGENT-WATCH-05 | unit (mocked Process) | `swift test --filter StatusSubcommandTests/testFallbackWhenNotInstalled` | ❌ W0 | ⬜ pending |
| `vigil-watch test` synthetic event has `_vigil_test_<unix>` sessionId | AGENT-WATCH-05 | unit | `swift test --filter TestSubcommandTests/testSessionIdShape` | ❌ W0 | ⬜ pending |
| RuntimeStateWriter atomic temp+rename | AGENT-WATCH-04 / D-04 | unit | `swift test --filter RuntimeStateWriterTests` | ❌ W0 | ⬜ pending |
| RuntimeStateWriter snake_case field names match D-04 schema (drift) | AGENT-WATCH-04 / D-04 | unit | `swift test --filter RuntimeStateWriterTests/testJSONFieldNamesAreSnakeCase` | ❌ W0 | ⬜ pending |
| `EmitterActor.currentSnapshot()` returns required fields | AGENT-WATCH-04 / D-05 | unit | `swift test --filter EmitterTests/testCurrentSnapshotShape` | ❌ extends EmitterTests | ⬜ pending |
| Soak CSV parser exits 0 on synthetic-good input | AGENT-WATCH-07 | unit | `swift test --filter SoakCheckTests/testGoodSoakPasses` (or pure bash test) | ❌ W0 | ⬜ pending |
| Soak CSV parser exits non-zero on RSS>30MB | AGENT-WATCH-07 | unit | `swift test --filter SoakCheckTests/testRSSAboveThresholdFails` | ❌ W0 | ⬜ pending |
| Soak CSV parser exits non-zero on multiple PIDs | AGENT-WATCH-07 | unit | `swift test --filter SoakCheckTests/testMultiplePIDsFails` | ❌ W0 | ⬜ pending |
| Soak CSV parser exits non-zero on span < 23h50m | AGENT-WATCH-07 | unit | `swift test --filter SoakCheckTests/testShortSpanFails` | ❌ W0 | ⬜ pending |
| 24h unattended run on user's Mac, RSS<30MB | AGENT-WATCH-07 | manual + soak gate | `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv` | n/a | ⬜ pending |
| Daemon resumes post-Mac-reboot, `vigil-watch test` succeeds within 30s | AGENT-WATCH-04 / SC #3 | manual | reboot Mac, log in, time `vigil-watch test` from login (expect <30s) | n/a | ⬜ pending |
| swift-argument-parser version pinned in Package.swift | drift detector | unit | `swift test --filter PackageTests/testArgumentParserDependencyVersion` | ❌ W0 | ⬜ pending |
| runtime-state.json snake_case round-trips writer→reader | drift detector | unit | `swift test --filter RuntimeStateWriterTests/testRoundTripWithStatusReader` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Plan/Wave columns will be assigned by the planner — every row above must be claimed by exactly one plan task.*

---

## Wave 0 Requirements

- [ ] `Tests/VigilWatchTests/RuntimeStateWriterTests.swift` — covers AGENT-WATCH-04 IPC contract
- [ ] `Tests/VigilWatchTests/PlistTemplateTests.swift` — covers AGENT-WATCH-04 plist correctness (no `<true></true>`, valid XML, all required keys)
- [ ] `Tests/VigilWatchTests/RunSubcommandTests.swift` — covers `--verbose` flag wiring
- [ ] `Tests/VigilWatchTests/TailSubcommandTests.swift` — covers session-id filter and jq-missing detection
- [ ] `Tests/VigilWatchTests/TestSubcommandTests.swift` — covers synthetic POST contract (StubHTTPClient pattern from Phase 122 EmitterTests)
- [ ] `Tests/VigilWatchTests/StatusSubcommandTests.swift` — covers fresh / stale / not-installed states
- [ ] `Tests/VigilWatchTests/SoakCheckTests.swift` (or pure bash + bats) — covers `soak-check.sh` assertions on synthetic CSVs
- [ ] Extend `Tests/VigilWatchTests/EmitterTests.swift` with `testCurrentSnapshotShape` (additive — no breaking change to existing 16 cases)
- [ ] No framework install needed — XCTest is part of Phase 122's existing infrastructure

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `launchctl bootstrap` end-to-end with running daemon | AGENT-WATCH-04 | Touches user's real launchd domain (`gui/$UID`) — cannot be sandboxed in CI; must run on the operator's Mac | `swift run vigil-watch install && launchctl print gui/$(id -u)/com.morrillholdings.vigil.watch \| grep "state = running"` |
| `vigil-watch run` foreground smoke (parses live JSONL + emits events) | AGENT-WATCH-05 | Requires real Claude Code session on disk producing live JSONL writes | `vigil-watch run --verbose` while a Claude Code session is active; observe NDJSON event lines on stdout |
| `vigil-watch status` fallback when `runtime-state.json` is stale | AGENT-WATCH-05 | Race only reproducible with a real running daemon then `kill -9` | `kill -9 $(pgrep -f vigil-watch); sleep 6; vigil-watch status` → expect "daemon: NOT RUNNING" |
| Post-Mac-reboot daemon auto-resume (SC #3) | AGENT-WATCH-04 / SC #3 | Reboot is a real OS event; cannot be simulated in CI | After `vigil-watch install`, reboot Mac, log in, `time vigil-watch test` — expect 2xx within 30s of login |
| 24h unattended soak (SC #4) | AGENT-WATCH-07 | Must observe real wallclock + real-user Claude Code mix on the operator's Mac | Per CONTEXT D-10: install daemon + sampler → live ≥24h with normal Claude Code use → `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv` exits 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
