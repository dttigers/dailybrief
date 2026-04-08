---
phase: 51
plan: 02
subsystem: DailyBriefMonitor
tags: [update-service, observable, install-script, launchd-reload, handoff-json]
one_liner: "@Observable UpdateService wrapping swift build + install.sh with mtime gate, handoff JSON, and detached launchd self-reload"
dependency_graph:
  requires:
    - "RepoLocation.path / installScript / releaseBuildDir (Plan 51-01)"
  provides:
    - "UpdateStatus enum (idle/running/upToDate/updated(sha)/failed(tail))"
    - "UpdateService.updateNow() — full update lifecycle entry point"
    - "UpdateService.consumeHandoff() — boot-time handoff JSON reader"
    - "UpdateService observable state (status, isRunning, lastOutcomeAt, lastSHA)"
    - "UpdateService.logFilePath — accessor for ~/Library/Logs/DailyBrief/update.log"
  affects:
    - "Plan 51-03 MenuBarView will bind Update Vigil button to this service"
tech_stack:
  added: []
  patterns:
    - "Swift @Observable + @unchecked Sendable (mirrors StatusChecker)"
    - "Process spawn with merged stdout/stderr Pipe + readDataToEndOfFile"
    - "Detached child process via FileHandle.nullDevice stdio (no waitUntilExit)"
    - "mtime comparison with equality bias (>=) for fresh-binary gate"
    - "JSON handoff file in ~/Library/Application Support for cross-process state"
key_files:
  created:
    - "Sources/DailyBriefMonitor/UpdateStatus.swift"
    - "Sources/DailyBriefMonitor/UpdateService.swift"
  modified: []
decisions:
  - "D-01: install.sh wrapped via /bin/bash + RepoLocation.installScript argv (no shell interpolation)"
  - "D-02: Detached helper + exit(0) lets launchd KeepAlive (SuccessfulExit=false) respawn the new binary"
  - "D-03: Helper script body is exactly 'sleep 1' + 'launchctl kickstart -k gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor'"
  - "D-04: Handoff JSON payload is {sha, timestamp, outcome} written to ~/Library/Application Support/DailyBrief/last-update.json"
  - "D-05: swift build -c release runs first; failure short-circuits before install.sh"
  - "D-06: mtime gate uses installed >= build (equality bias toward 'up to date')"
  - "D-07: git SHA captured via 'git rev-parse --short HEAD' for display only"
  - "D-10: UpdateStatus has 5 cases driving Plan 03 button labels (presentation lives in MenuBarView)"
  - "D-11: Merged stdout+stderr appended to ~/Library/Logs/DailyBrief/update.log with ISO8601 stamp"
  - "D-12: Last 20 lines of merged output captured for inline failure display via lastNLines()"
metrics:
  duration: "~6m"
  completed: "2026-04-07"
requirements: [DEV-01, DEV-02, DEV-03, DEV-04]
---

# Phase 51 Plan 02: UpdateService Lifecycle Summary

## One-liner
Built `UpdateService` — an `@Observable` Swift class that wraps `swift build -c release`, Scripts/install.sh, mtime no-op gating, git SHA capture, update.log streaming, handoff JSON, and a detached `/tmp/vigil-reload.sh` trampoline that survives `exit(0)` so launchd can respawn the freshly-installed binary.

## What Shipped

### Task 1: `UpdateStatus.swift` (new, commit `0d109f5`)
- New `enum UpdateStatus: Equatable` in `Sources/DailyBriefMonitor/UpdateStatus.swift`.
- 5 cases:
  - `.idle` — initial state
  - `.running` — build/install in flight
  - `.upToDate` — mtime gate said no-op
  - `.updated(sha: String)` — fresh binary installed, awaiting respawn
  - `.failed(tail: String)` — last 20 lines of merged stderr for inline display
- `Equatable` conformance enables SwiftUI diffing in Plan 03.
- Zero presentation logic — Plan 03 (MenuBarView) owns label formatting per D-10.

### Task 2: `UpdateService.swift` (new, commit `641ee0b`)
- New `@Observable final class UpdateService: @unchecked Sendable` mirroring StatusChecker's pattern (lines 91-120).
- Observable surface: `status`, `isRunning`, `lastOutcomeAt`, `lastSHA`, `logFilePath`.
- Public API: `updateNow()` (button entry point), `consumeHandoff()` (called by AppDelegate on launch in Plan 03).
- Full lifecycle in `runUpdateLifecycle()` private async method:
  1. **swift build -c release** via `/usr/bin/env swift build -c release` (D-05) — failure short-circuits with `lastNLines(buildResult.output, 20)` (D-12).
  2. **mtime gate** — `installedBinariesAreFresh()` zips build dir vs `~/.local/bin/` for both DailyBrief and DailyBriefMonitor binaries; `installed >= build` is the freshness predicate (D-06, Pitfall 2).
  3. **install.sh** invoked via `/bin/bash` + `RepoLocation.installScript` argv — failure short-circuits with stderr tail (D-01).
  4. **git SHA** captured via `/usr/bin/git rev-parse --short HEAD` with `currentDirectoryURL = RepoLocation.path` (D-07, Pitfall 6).
  5. **handoff JSON** — `writeHandoff(sha:outcome:)` calls `createDirectory(withIntermediateDirectories: true)` first because `~/Library/Application Support/DailyBrief/` doesn't pre-exist (Pitfall 5), then writes `{sha, timestamp, outcome}` (D-04).
  6. **detached reload helper** — `spawnDetachedReloadHelper()` writes a 3-line bash script (`#!/bin/bash` + `sleep 1` + `launchctl kickstart -k gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor`) to `/tmp/vigil-reload.sh`, chmods 0755, spawns it via Process with all three stdio handles set to `FileHandle.nullDevice`, and **does not call** `waitUntilExit()` (D-02, D-03, Pitfall 1).
  7. **exit(0) on MainActor** — launchd's KeepAlive (`SuccessfulExit=false`) respawns the new binary (D-02).
- `consumeHandoff()` reads `~/Library/Application Support/DailyBrief/last-update.json`, deletes it BEFORE any error handling (Pitfall 4), and routes the parsed `outcome` ("updated" / "upToDate" / "failed") into the matching `UpdateStatus` case.
- `appendToUpdateLog()` opens an append handle, seeks to end, writes ISO8601-stamped chunks; falls back to first-time `write(to:atomically:)` if the file doesn't exist yet (D-11).
- `runProcess()` helper merges stderr into stdout, sets `currentDirectoryURL` per call, and uses `readDataToEndOfFile()` after `waitUntilExit()` (safe because install.sh output is < 10 KB per RESEARCH).

## Verification
- `swift build -c release` → exit 0 (Task 1 + Task 2, second build is incremental at 24s)
- `grep -F "@Observable" Sources/DailyBriefMonitor/UpdateService.swift` → 1 match
- `grep -F "final class UpdateService" Sources/DailyBriefMonitor/UpdateService.swift` → 1 match
- `grep -F "func updateNow" Sources/DailyBriefMonitor/UpdateService.swift` → 1 match
- `grep -F "func consumeHandoff" Sources/DailyBriefMonitor/UpdateService.swift` → 1 match
- `grep -F "RepoLocation.installScript" Sources/DailyBriefMonitor/UpdateService.swift` → 1 match (D-01)
- `grep -F "im >= bm" Sources/DailyBriefMonitor/UpdateService.swift` → 1 match (D-06 equality bias)
- `grep -F "rev-parse"` and `grep -F -- "--short"` → both match (D-07)
- `grep -F "FileHandle.nullDevice" Sources/DailyBriefMonitor/UpdateService.swift` → 3 matches (stdin/stdout/stderr per Pitfall 1)
- `grep -F "launchctl kickstart -k gui/" Sources/DailyBriefMonitor/UpdateService.swift` → 1 match (D-02/D-03)
- `grep -F "sleep 1" Sources/DailyBriefMonitor/UpdateService.swift` → 1 match (D-03)
- `grep -F "Application Support/DailyBrief"` → 3 matches (D-04 handoff dir + path + dir constants)
- `grep -F "withIntermediateDirectories: true"` → 1 match (Pitfall 5 mkdir -p)
- `grep -F "exit(0)" Sources/DailyBriefMonitor/UpdateService.swift` → 4 occurrences (one is the `exit(0)` call, three are doc references)
- `grep -F "update.log"` → 1 match (D-11)
- `grep -F "lastNLines"` → 3 matches (def + 2 call sites for D-12)

## Commits
| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1 | `0d109f5` | feat | add UpdateStatus enum for update flow state |
| 2 | `641ee0b` | feat | implement UpdateService update lifecycle |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NSString string-literal initializer required `string:` label**
- **Found during:** Task 2 build verification
- **Issue:** `NSString("~/.local/bin/\($0)")` failed with `error: missing argument label 'string:' in call`. Swift's `NSString` does not accept a bare positional `String` argument; it requires `NSString(string: ...)`. The plan's reference snippet used the bare form.
- **Fix:** Changed to `NSString(string: "~/.local/bin/\($0)").expandingTildeInPath` in `installedBinariesAreFresh()`.
- **Files modified:** `Sources/DailyBriefMonitor/UpdateService.swift` (1 line)
- **Commit:** Folded into `641ee0b` (single Task 2 commit)
- **Notes:** All other NSString uses in the file already followed the StatusChecker convention `NSString("...").expandingTildeInPath` at the top-level constant declarations, where Swift's bridging accepts the literal — only the inline `.map` closure needed the explicit label. No other NSString usages required adjustment.

### Compiler Warnings (non-blocking)
The build emits two benign warnings — neither is a bug nor a missing requirement, so they remain as-is:
- `try? handle.seekToEnd()` unused-result warning in `appendToUpdateLog()` — intentional best-effort error swallowing matching the surrounding `try?` pattern.
- `await MainActor.run { exit(0) }` "will never be executed" warning on the unreachable `return .updated(sha:)` after exit(0) — the return is required by the compiler for async function flow analysis but is unreachable by design.

These match the plan's intended structure and the surrounding StatusChecker style. Logging them here per "Deferred Issues" tracking.

## Self-Check: PASSED
- `Sources/DailyBriefMonitor/UpdateStatus.swift` exists (verified via Write tool + build success)
- `Sources/DailyBriefMonitor/UpdateService.swift` exists (verified via Write tool + build success)
- Commit `0d109f5` present in `git log` (verified via `git rev-parse --short HEAD` after commit)
- Commit `641ee0b` present in `git log` (verified via `git rev-parse --short HEAD` after commit)
- `swift build -c release` exits 0 with both files in tree
- All 17 grep-based acceptance criteria from Task 2 verified (rev-parse + --short matched separately due to shell arg parsing of bare `--short` token)

## Downstream Hooks for Plan 03 (MenuBarView)
- Instantiate as `@State private var updateService = UpdateService()` (or similar @Observable binding)
- Call `updateService.consumeHandoff()` once in AppDelegate `applicationDidFinishLaunching` to surface post-respawn `.updated(sha:)` state
- Bind "Update Vigil" button label/state to `updateService.status` switch (`.idle` → "Update Vigil", `.running` → "Updating…" disabled, etc.)
- Show `lastNLines` tail in dropdown when `status` is `.failed(let tail)`
- "Open update log" menu item should use `updateService.logFilePath`
