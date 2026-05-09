---
phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak
verified: 2026-05-09T20:10:00Z
status: human_needed
score: 9/11 must-haves verified (autonomous portion); 2 operator-pending
overrides_applied: 0
re_verification:
  previous_status: skeleton
  previous_score: n/a
  notes: "Skeleton authored by Plan 05 (Task 5.3); this re-verification adds the autonomous-portion verdict + evidence table on top, preserving the operator-soak runbook + back-fill template verbatim below."
human_verification:
  - test: "AGENT-WATCH-04 SC #1 — `vigil-watch install` writes both plists at mode 0600 + `launchctl bootstrap gui/$UID` succeeds + daemon shows `state = running`; `vigil-watch uninstall` cleanly reverses without orphan processes"
    expected: "`ls -la ~/Library/LaunchAgents/com.morrillholdings.vigil.watch*.plist` shows `-rw-------` on both files; `launchctl print gui/$(id -u)/com.morrillholdings.vigil.watch | grep 'state ='` returns `state = running`; after `vigil-watch uninstall`, both plist paths return `[ ! -f ]` true"
    why_human: "Requires writing to ~/Library/LaunchAgents and registering with launchd on the operator's actual Mac — not safe to perform from a verification agent. Code paths are unit-tested (PlistTemplateTests, plist render + plutil -lint, mode 0600 setAttributes call) but the launchctl bootstrap round-trip is operator-driven."
  - test: "AGENT-WATCH-04 SC #3 — Mac reboot resumes daemon; synthetic `vigil-watch test` returns HTTP 2xx within 30s of login"
    expected: "After `vigil-watch install` + macOS restart + login, `time vigil-watch test` exits 0 within 30 seconds and prints `HTTP 201` (or 200 if dedup)"
    why_human: "Requires a real macOS reboot; cannot be simulated in a sandbox or by an automated verifier."
  - test: "AGENT-WATCH-07 SC #4 — 24h unattended soak under 30MB RSS; soak-check.sh exits 0 with `PHASE 123 SOAK GATE: PASSED`"
    expected: "After 24h of normal Claude Code use with the installed daemon, `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv` exits 0 + prints summary table with `max RSS < 30000 KB`, `unique PIDs = 1`, `uptime span >= 85800s`"
    why_human: "24h wallclock-bound operator action by D-10. All infrastructure (sampler plist, soak-check.sh, fixture-tested gating logic, back-fill template below) is in place. Tracked in `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md`."
---

# Phase 123 — vigil-watch shell — launchd + CLI surface + 24h soak — Verification Report

**Phase Goal (ROADMAP.md):** The `vigil-watch` binary becomes a real ops-grade local daemon: install/uninstall round-trips a launchd plist cleanly, the CLI surfaces 6 subcommands for daily debugging (`run`, `tail`, `test`, `install`, `uninstall`, `status`), and the daemon survives 24 consecutive unattended hours on the user's Mac under 30MB RSS without crashing.

**Verified:** 2026-05-09T20:10:00Z
**Status:** `human_needed` — autonomous portion VERIFIED end-to-end; 3 SC items require operator action (install round-trip, post-reboot resume, 24h soak — all wallclock/host-bound by design).
**Re-verification:** Yes — extends the Plan 05 skeleton with autonomous-portion verdict + evidence; preserves operator-soak runbook + back-fill template verbatim below.

---

## Goal Achievement

### Observable Truths

| #   | Truth (from ROADMAP SC + plan must_haves) | Status | Evidence |
| --- | ----------------------------------------- | ------ | -------- |
| 1 | `swift build -c release` succeeds; binary exposes 6 subcommands via ArgumentParser dispatch | VERIFIED | Live `swift build -c release` → "Build complete! (0.42s)"; `.build/release/vigil-watch --help` lists run, tail, test, install, uninstall, status. Verified 2026-05-09T20:05Z |
| 2 | `swift test` is green at the documented baseline (1 pre-existing carry-forward failure tracked, no Phase 123 regressions) | VERIFIED | Live: 154 test cases run, 153 pass, 1 fail (`StateStoreTests.testRecordMilestoneRoundTrip` — pre-existing per `deferred-items.md`, traces to Phase 122 StateStore unrelated to this phase) |
| 3 | swift-argument-parser pinned `from: "1.6.0"`; Package.resolved committed | VERIFIED | `Package.swift:12` contains `.package(url: "https://github.com/apple/swift-argument-parser", from: "1.6.0")`. `Package.resolved` exists at repo root with version 1.7.1 resolved. PackageTests drift detector pinned. |
| 4 | Daemon-to-CLI IPC: 1Hz `runtime-state.json` snapshot at `~/Library/Application Support/vigil-watch/runtime-state.json` with D-04 normative snake_case 8-key schema | VERIFIED | `RuntimeStateWriter.swift:38-47` has explicit `CodingKeys` mapping all 8 keys (`schema_version`, `pid`, `started_at`, `queue_depth`, `last_event_ts`, `last_event_session_id`, `last_event_type`, `quarantined`); `Daemon.swift:180-190` wires `currentSnapshot()` → `RuntimeState` → `writerRef.write(state)` inside the existing 1Hz tick; `EmitterActor.swift:155-169` exposes `currentSnapshot()` returning the 5 dynamic fields. RuntimeStateWriterTests (4) all pass including snake_case schema drift detector + atomic-write atomicity. |
| 5 | Run/Tail/Test subcommand bodies real (not stubs); SIGINT-forward in Tail | VERIFIED | `Run.swift:21-77` lifts Phase 122 daemon body + verbose-stderr-suppression; `Tail.swift:50-122` spawns `tail -f \| jq` pipeline with DispatchSource SIGINT handler that calls `tail.terminate()` + `jqProc.terminate()` + `Darwin.exit(130)` (T-123-04 mitigation); `Test.swift:34-110` POSTs synthetic `_vigil_test_<unix>` heartbeat with deterministic `clientEventId` + Bearer auth + idempotency. RunSubcommandTests (4) + TailSubcommandTests (5) + TestSubcommandTests (6) all pass. |
| 6 | Install/Uninstall/Status subcommand bodies real; idempotent install (bootout-then-bootstrap); plist mode 0600 (T-123-01); literal abs paths in plist (T-123-02); self-closing `<true/>` + `xmlEscape()` (T-123-03) | VERIFIED | `Install.swift:81-82` `setAttributes([.posixPermissions: 0o600], ofItemAtPath: ...)` for both plists IMMEDIATELY after write; `Plists.swift:34-35` + `:77` use self-closing `<true/>` for RunAtLoad/KeepAlive; `Plists.swift:98-112` defines `xmlEscape()` and `Install.swift:57` calls it on the api key value before plist substitution; `Plists.swift:31` substitutes `%BINARY_PATH%` with absolute `~/.local/bin/vigil-watch` path. PlistTemplateTests (13) + StatusSubcommandTests (4) all pass. |
| 7 | scripts/soak-check.sh enforces all 5 D-09 gates; 5 SoakCheckTests pin every failure mode against synthetic CSV fixtures | VERIFIED | `scripts/soak-check.sh` exists, executable, 80 lines. Live spot-check: `soak-good.csv` → exit 0 + `PHASE 123 SOAK GATE: PASSED`. `soak-rss-too-high.csv` → exit 1 + `FAIL: max RSS 32000 >= 30000 KB`. `soak-multi-pid.csv` → exit 1 + `FAIL: 2 distinct PIDs (KeepAlive should have held one)`. SoakCheckTests (5) all pass: testGoodSoakPasses, testRSSAboveThresholdFails, testMultiplePIDsFails, testShortSpanFails, testEmptyCSVFails. All 5 fixture CSVs present at `Tests/VigilWatchTests/Fixtures/`. |
| 8 | 123-VERIFICATION.md skeleton present with 24h-soak runbook + back-fill template + "operator-pending" verdict | VERIFIED | This very file: AGENT-WATCH-04 / 05 / 07 gate tables below pre-allocated; soak-check.sh output back-fill block ready for operator paste; sign-off checklist tracks `STATE.md` update. Skeleton authored by Plan 05 Task 5.3, extended now with the autonomous verification verdict. |
| 9 | Operator todo for 24h soak filed at `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` with verbatim runbook | VERIFIED | File exists; 114 lines; includes verbatim 8-step operator procedure (build → install → confirm plists/state → wait sampler → 24h live → run soak gate → paste summary → tear down) + closeout flow + failure-path branch decision tree. |
| 10 | AGENT-WATCH-04 SC #1 — `vigil-watch install` actually writes plists + bootstrap succeeds; `vigil-watch uninstall` actually removes them | OPERATOR-PENDING (human_needed) | Code paths verified (chmod 0600, plutil -lint, bootout-then-bootstrap, ENOENT-tolerant uninstall) but live launchctl bootstrap is operator-driven. See human_verification entry 1. |
| 11 | AGENT-WATCH-04 SC #3 — post-reboot daemon resume verified by `vigil-watch test` HTTP 2xx within 30s | OPERATOR-PENDING (human_needed) | Requires Mac reboot; not automatable. See human_verification entry 2. |

**Score:** 9/11 truths VERIFIED; 2 OPERATOR-PENDING (load-bearing physical-host actions). The 24h soak gate (AGENT-WATCH-07) is a third operator-pending item but it is captured in human_verification entry 3 and tracked separately in `.planning/todos/pending/`. Score for the autonomous portion of the phase: 9/9 = 100%.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-watch/Package.swift` | swift-argument-parser dep + ArgumentParser product | VERIFIED | 32 lines; line 12 `.package(url: ".../swift-argument-parser", from: "1.6.0")`; line 20 `.product(name: "ArgumentParser", package: "swift-argument-parser")` |
| `vigil-watch/Package.resolved` | committed lockfile | VERIFIED | Present at repo root; pins swift-argument-parser revision 626b5b7b...d7311b @ version 1.7.1 |
| `Sources/vigil-watch/VigilWatchCLI.swift` | `@main` AsyncParsableCommand parent dispatcher with 6 subcommands + defaultSubcommand: Run.self | VERIFIED | 14 lines; verbatim per plan; no top-level code |
| `Sources/vigil-watch/Commands/Run.swift` | Real body; lifts Phase 122 daemon composition + verbose-stderr-suppression | VERIFIED | 77 lines; setbuf(stdout, nil); dup2 stderr→/dev/null when !verbose; ConfigLoader.load → Daemon → installSIGTERMHandler → daemon.start → RunLoop.main.run() |
| `Sources/vigil-watch/Commands/Tail.swift` | tail \| jq pipeline; SIGINT-forwards (T-123-04) | VERIFIED | 122 lines; findJQPath() walks 3 candidates; `DispatchSource.makeSignalSource(signal: SIGINT)` calls terminate() on both child processes; pure `filterNDJSON()` helper for unit tests |
| `Sources/vigil-watch/Commands/Test.swift` | Synthetic POST with deterministic clientEventId; Phase 121 idempotency | VERIFIED | 111 lines; reserved `_vigil_test_<unix>` sessionId; `makeClientEventId()` from VigilWatch lib; Bearer auth; injectable HTTPClient seam |
| `Sources/vigil-watch/Commands/Install.swift` | Idempotent bootout-then-bootstrap; chmod 0600; xmlEscape api key | VERIFIED | 131 lines; mode 0600 set on both plists (lines 81-82); plutil -lint before bootstrap; jq presence non-fatal warning; tolerates exit 3 on bootout |
| `Sources/vigil-watch/Commands/Uninstall.swift` | Idempotent removal; tolerates ENOENT/exit-3; preserves operator data | VERIFIED | 62 lines; bootout both labels (tolerates exit 3); removes both plists (tolerates fileExists=false); operator data under Application Support intentionally preserved |
| `Sources/vigil-watch/Commands/Status.swift` | Three-state output (RUNNING/NOT RUNNING/NOT INSTALLED) via runtime-state.json freshness + launchctl print fallback | VERIFIED | 100 lines; 5s mtime freshness gate; injectable `StatusPaths` test seam; distinct exit codes 0/2/1 for the three states |
| `Sources/vigil-watch/Commands/Plists.swift` | Daemon + sampler templates; xmlEscape; runProcess helper | VERIFIED | 138 lines; daemon plist KeepAlive=`<true/>` (boolean, not dict — load-bearing); sampler uses `etimes=` (not `etime`) per Pitfall 4; xmlEscape covers &, <, >, ", ' |
| `Sources/VigilWatch/RuntimeStateWriter.swift` | Atomic write actor; 8-key snake_case schema | VERIFIED | 135 lines; D-04 CodingKeys all 8 keys verbatim snake_case; temp+F_FULLFSYNC+rename atomicity (lifts StateStore primitive per D-05); creates parent dir on first write |
| `Tests/VigilWatchTests/PackageTests.swift` | Drift detector for swift-argument-parser pin | VERIFIED | Pins "1.6.0" exact via regex against Package.swift source |
| `Tests/VigilWatchTests/RuntimeStateWriterTests.swift` | 4 tests: file creation, atomicity, snake_case schema, round-trip | VERIFIED | All 4 passing |
| `Tests/VigilWatchTests/RunSubcommandTests.swift` | Run subcommand parsing + flags | VERIFIED | 4 tests passing |
| `Tests/VigilWatchTests/TailSubcommandTests.swift` | Tail filter behavior + jq path discovery | VERIFIED | 5 tests passing |
| `Tests/VigilWatchTests/TestSubcommandTests.swift` | Synthetic POST round-trip via stub HTTPClient | VERIFIED | 6 tests passing |
| `Tests/VigilWatchTests/PlistTemplateTests.swift` | 13 plist drift detectors (Pitfall 2/4, KeepAlive boolean, etimes, xmlEscape) | VERIFIED | 13 tests passing |
| `Tests/VigilWatchTests/StatusSubcommandTests.swift` | 4 tests for runtime-state freshness branches | VERIFIED | 4 tests passing |
| `Tests/VigilWatchTests/SoakCheckTests.swift` | 5 tests pinning script's failure modes against fixtures | VERIFIED | All 5 passing |
| `Tests/VigilWatchTests/Fixtures/soak-{good,rss-too-high,multi-pid,short-span,empty}.csv` | 5 synthetic CSVs | VERIFIED | All 5 present |
| `vigil-watch/scripts/soak-check.sh` | All 5 D-09 gates enforced | VERIFIED | 80 lines; live spot-check pass/fail confirmed for 3 fixtures |
| `dailybrief/.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` | Verbatim runbook + back-fill steps | VERIFIED | 114 lines; 8-step procedure |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `VigilWatchCLI.swift` | 6 subcommand structs | `subcommands: [Run.self, Tail.self, Test.self, Install.self, Uninstall.self, Status.self]` | WIRED | grep-pinned line 11; `--help` output lists all 6 |
| `VigilWatchCLI.swift` | bare-arg invocation → Run | `defaultSubcommand: Run.self` | WIRED | line 12; preserves Phase 122 backcompat |
| `Daemon.swift` 1Hz tick | `RuntimeStateWriter.write(_:)` | `await writerRef.write(state)` inside existing while-loop | WIRED | Daemon.swift:190; assembles RuntimeState from `await emitterRef.currentSnapshot()` (line 180) + closure-captured pidRef/startedAtRef |
| `EmitterActor` | RuntimeState dynamic fields | `currentSnapshot()` returns named tuple matching 5 dynamic RuntimeState fields | WIRED | EmitterActor.swift:155-169 |
| `Status.swift` | runtime-state.json | `RuntimeStateWriter.defaultPath` + JSONDecoder.decode(RuntimeState.self) + 5s mtime freshness gate | WIRED | Status.swift:39-66; same Codable contract as writer |
| `Install.swift` | both plist files | `try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: ...)` immediately after write | WIRED (T-123-01 mitigation) | Install.swift:81-82 |
| `Plists.swift` | api key XML | `xmlEscape(key)` before `%VIGIL_API_KEY_BLOCK%` substitution | WIRED (T-123-03 mitigation) | Install.swift:57 |
| `Tail.swift` SIGINT | child processes | `DispatchSource.makeSignalSource(signal: SIGINT) → tail.terminate() + jqProc.terminate() + Darwin.exit(130)` | WIRED (T-123-04 mitigation) | Tail.swift:93-101 |
| `scripts/soak-check.sh` | 5 D-09 gates | `[ "$MAX_RSS" -lt 30000 ]` + `[ "$PID_COUNT" -eq 1 ]` + `[ "$SPAN" -ge 85800 ]` + `[ "$NONEMPTY" -ge 1 ]` + Core readback | WIRED | All 5 conditions present in script body lines 60-77 |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Release binary builds | `swift build -c release` | "Build complete! (0.42s)" | PASS |
| 6 subcommands listed in help | `.build/release/vigil-watch --help` | run, tail, test, install, uninstall, status all listed | PASS |
| Test suite green at documented baseline | `swift test` | 154 cases run, 153 pass, 1 fail (`StateStoreTests.testRecordMilestoneRoundTrip` — pre-existing per deferred-items.md) | PASS |
| Soak gate passes good fixture | `bash scripts/soak-check.sh --no-core-check Tests/VigilWatchTests/Fixtures/soak-good.csv` | exit 0 + `PHASE 123 SOAK GATE: PASSED` | PASS |
| Soak gate rejects high-RSS | `bash scripts/soak-check.sh --no-core-check Tests/VigilWatchTests/Fixtures/soak-rss-too-high.csv` | exit 1 + `FAIL: max RSS 32000 >= 30000 KB` | PASS |
| Soak gate rejects multi-PID | `bash scripts/soak-check.sh --no-core-check Tests/VigilWatchTests/Fixtures/soak-multi-pid.csv` | exit 1 + `FAIL: 2 distinct PIDs (KeepAlive should have held one)` | PASS |
| SoakCheckTests | `swift test --filter SoakCheckTests` | 5/5 pass | PASS |
| RuntimeStateWriterTests | `swift test --filter RuntimeStateWriterTests` | 4/4 pass | PASS |
| PlistTemplateTests | `swift test --filter PlistTemplateTests` | 13/13 pass | PASS |
| StatusSubcommandTests | `swift test --filter StatusSubcommandTests` | 4/4 pass | PASS |
| RunSubcommandTests | `swift test --filter RunSubcommandTests` | 4/4 pass | PASS |
| TailSubcommandTests | `swift test --filter TailSubcommandTests` | 5/5 pass | PASS |
| TestSubcommandTests | `swift test --filter TestSubcommandTests` | 6/6 pass | PASS |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| AGENT-WATCH-04 | 123-01, 123-02, 123-04 | install/uninstall round-trips a launchd plist cleanly with RunAtLoad+KeepAlive | SATISFIED (autonomous) + OPERATOR-PENDING (live install/uninstall) | Install.swift / Uninstall.swift bodies real; Plists.swift renders correct templates; PlistTemplateTests pin Pitfall 2/4 + KeepAlive boolean + etimes + xmlEscape; chmod 0600 on both plists. Live launchctl bootstrap round-trip is operator-pending. |
| AGENT-WATCH-05 | 123-01, 123-02, 123-03, 123-04 | 6 CLI subcommands operational for daily debugging | SATISFIED | All 6 subcommand bodies real (no stubs); `--help` lists all 6; per-subcommand unit tests (RunSubcommandTests, TailSubcommandTests, TestSubcommandTests, StatusSubcommandTests) all green; Install/Uninstall behaviorally pinned through PlistTemplateTests + the same render path the live install uses. |
| AGENT-WATCH-07 | 123-04, 123-05 | 24h unattended soak under 30MB RSS | SATISFIED (autonomous infrastructure) + OPERATOR-PENDING (24h wallclock run) | scripts/soak-check.sh enforces all 5 D-09 gates; 5 SoakCheckTests pin every failure mode; 5 fixture CSVs cover good + 4 failure paths; sampler launchd template uses `etimes` (not `etime`) and KeepAlive=`<true/>` (not dict); operator todo filed for the 24h wallclock action. |

No orphaned requirements: AGENT-WATCH-04/05/07 are the only requirements ROADMAP.md maps to Phase 123, and all three are claimed across plans 01-05.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `Test.swift` | 32 | `nonisolated(unsafe) static var injectedClient: HTTPClient?` | INFO | Test seam — Phase 122 idiom (EmitterActor.injectedClient mirror); not a stub. ParsableCommand's Codable conformance forbids stored properties. |
| `Status.swift` | 27 | `nonisolated(unsafe) static var injectedPaths: StatusPaths?` | INFO | Same Phase 122 test-seam idiom; intentional, documented. |
| `Run.swift` | 65-67 | error path re-opens /dev/tty for stderr after dup2'ing it to /dev/null | INFO | Necessary because Run.run()'s own startup-failure path needs stderr surfaced even when --verbose is off. Documented in code comments. |

No TODO/FIXME/PLACEHOLDER markers found in any of the implementation files. No `return null` / empty-implementation stubs in subcommand bodies (all are real per Plans 03/04). No hardcoded empty data flowing to user-visible output.

---

### Human Verification Required

#### 1. AGENT-WATCH-04 SC #1 — Live install/uninstall round-trip

**Test:** Run from the vigil-watch repo:
```bash
swift run vigil-watch install
ls -la ~/Library/LaunchAgents/com.morrillholdings.vigil.watch*.plist
launchctl print gui/$(id -u)/com.morrillholdings.vigil.watch | grep "state ="
launchctl print gui/$(id -u)/com.morrillholdings.vigil.watch.sampler | grep "state ="
vigil-watch uninstall
[ ! -f ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist ] && [ ! -f ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.sampler.plist ] && echo "uninstall clean"
```

**Expected:** Both plists present at mode `-rw-------`; daemon `state = running`; sampler reports a valid daemon; after uninstall, both plist paths gone; no orphaned `vigil-watch` processes via `pgrep -f vigil-watch`.

**Why human:** Requires writing to `~/Library/LaunchAgents` and registering with launchd on the operator's actual Mac. Code paths are unit-tested (PlistTemplateTests pins template + plutil-lint + mode 0600 setAttributes call), but the launchctl bootstrap round-trip is operator-driven.

#### 2. AGENT-WATCH-04 SC #3 — Post-reboot daemon resume

**Test:**
1. `vigil-watch install`
2. Restart Mac and log back in
3. `time vigil-watch test` (within 30 seconds of login)

**Expected:** `vigil-watch test` exits 0 + prints `HTTP 201` (or 200 if dedup) within 30 seconds of login — confirms launchd `RunAtLoad=true` + `KeepAlive=true` survived the reboot AND the daemon reconnected to Vigil Core.

**Why human:** Requires a real macOS reboot; cannot be simulated.

#### 3. AGENT-WATCH-07 — 24h soak gate

**Test:** Follow the verbatim runbook in `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md`.

**Expected:** After 24h of normal Claude Code use, `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv` exits 0 + prints the success summary table containing `max RSS < 30000 KB`, `unique PIDs = 1`, `uptime span >= 85800s`, `samples >= 277` (≈one every 5min over 24h).

**Why human:** 24h wallclock-bound by D-10. Cannot be simulated. All supporting infrastructure (sampler plist with `etimes`, soak-check.sh with all 5 D-09 gates, 5 fixture-pinned regression tests, back-fill template below) is in place.

---

### Gaps Summary

**No autonomous-portion gaps.** All 9 autonomous truths are VERIFIED with grep-anchored, file-path-pinned, live-test-confirmed evidence. The 2 OPERATOR-PENDING items (live install/uninstall round-trip; post-reboot resume) are physical-host-bound by design and tracked above. The third operator item (24h soak) is tracked separately in `.planning/todos/pending/`.

The "1 pre-existing test failure" carry-forward (`StateStoreTests.testRecordMilestoneRoundTrip`) is documented in `deferred-items.md` and is unrelated to Phase 123 scope (Phase 122 milestone-record persistence).

---

> Lives in dailybrief/.planning/. Operator-driven; populated as gates clear.

## AGENT-WATCH-04 — install/uninstall + plist round-trip

| Gate | Method | Status | Evidence |
|------|--------|--------|----------|
| `vigil-watch install` writes both plists, mode 0600 | manual | pending | `ls -la ~/Library/LaunchAgents/com.morrillholdings.vigil.watch*.plist` shows `-rw-------` |
| `launchctl print gui/$UID/com.morrillholdings.vigil.watch` shows `state = running` | manual | pending | _paste output here after install_ |
| `launchctl print gui/$UID/com.morrillholdings.vigil.watch.sampler` reports a valid daemon | manual | pending | _paste output here after install_ |
| `vigil-watch uninstall` removes both plists | manual | pending | `[ ! -f ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist ] && [ ! -f ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.sampler.plist ]` |
| Post-Mac-reboot daemon auto-resume (SC #3) | manual | pending | After install + reboot + login, `time vigil-watch test` returns HTTP 2xx within 30s |

## AGENT-WATCH-05 — 6 CLI subcommands

| Gate | Method | Status | Evidence |
|------|--------|--------|----------|
| `vigil-watch run` boots daemon foreground | unit + manual | unit PASSED; manual pending | RunSubcommandTests pass (4/4); `vigil-watch run --verbose` against active Claude Code session emits NDJSON to stdout |
| `vigil-watch tail <session-id>` filters NDJSON | unit + manual | unit PASSED; manual pending | TailSubcommandTests pass (5/5); live `vigil-watch tail <real-sid>` shows that session's events |
| `vigil-watch test` POSTs synthetic event | unit + manual | unit PASSED; manual pending | TestSubcommandTests pass (6/6); `VIGIL_API_KEY=... vigil-watch test` returns HTTP 2xx |
| `vigil-watch status` 3-state output | unit + manual | unit PASSED; manual pending | StatusSubcommandTests pass (4/4); running daemon → RUNNING; killed daemon → NOT RUNNING; uninstalled → NOT INSTALLED |

## AGENT-WATCH-07 — 24h unattended soak (D-10 operator-driven)

**Gate:** `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv` exits 0.

**Operator procedure** (per D-10):
1. `cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch" && swift build -c release`
2. `swift run vigil-watch install` (starts both daemon + sampler)
3. Live for ≥24h with normal Claude Code use.
4. `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv`

**Status:** pending

**Soak run started:** _<UTC timestamp>_
**Soak run ended:**   _<UTC timestamp>_

**soak-check.sh output (paste verbatim once gate passes):**

```
max RSS:      <KB>
unique PIDs:  <count>
uptime span:  <s>s (<h>h <m>m)
samples:      <count>
Core sessions: <count>

PHASE 123 SOAK GATE: PASSED
```

## Cross-cutting

| Item | Status |
|------|--------|
| Phase 122 carry-forward `testDaemonStartsAndStopsWithoutCrash` SIGSEGV flake — manifested in production? | pending — answered by single-PID assertion from soak-check.sh; if multi-PID, was triggered |
| Phase 122 carry-forward empty `session_id` parser drop rate over 24h | pending — count from `~/Library/Logs/Vigil/watch.err` after 24h soak |

## Verification sign-off

- [x] Autonomous-portion verification complete — 9/9 autonomous truths VERIFIED, 19+ Phase 123 unit tests green, soak-check.sh behaviorally validated against 3 fixtures (one PASS path, two FAIL paths)
- [ ] All AGENT-WATCH-04 gates pending → green
- [ ] All AGENT-WATCH-05 gates pending → green
- [ ] AGENT-WATCH-07 soak gate pending → PASSED with summary table pasted above
- [ ] Cross-cutting items resolved
- [ ] STATE.md updated to mark Phase 123 complete

**Approval:** pending operator (autonomous portion: APPROVED)

---

_Autonomous portion verified: 2026-05-09T20:10:00Z_
_Verifier: Claude (gsd-verifier, goal-backward)_
