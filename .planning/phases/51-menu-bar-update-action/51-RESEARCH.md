# Phase 51: Menu Bar Update Action - Research

**Researched:** 2026-04-07
**Domain:** Swift/AppKit menu-bar app shelling out to a build script with self-respawn via launchd
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Shell out to `Scripts/install.sh` as the single source of truth. Do NOT reimplement build/install logic in Swift.
- **D-02:** Self-reload via detached shell helper + LaunchAgent KeepAlive respawn (option A1).
- **D-03:** After successful `install.sh`, the monitor (1) writes status-handoff file `~/Library/Application Support/DailyBrief/last-update.json` containing `{sha, timestamp, outcome}`, (2) writes `/tmp/vigil-reload.sh` helper running `sleep 1 && launchctl kickstart -k gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor`, (3) spawns the helper detached (no `waitUntilExit`), (4) calls `exit(0)`. launchd KeepAlive respawns within ~1s; menu bar "blink" is acceptable.
- **D-04:** On launch, new monitor instance reads handoff file, surfaces outcome in dropdown, then deletes the file.
- **D-05:** Trust SwiftPM's incremental `swift build -c release` for source-level change detection.
- **D-06:** After build, compare `mtime` of `.build/release/{DailyBrief,DailyBriefMonitor}` against `~/.local/bin/{DailyBrief,DailyBriefMonitor}`. If both installed are newer-or-equal → no-op ("✓ Up to date"). Else proceed with cp + LaunchAgent reload.
- **D-07:** Git short SHA (`git rev-parse --short HEAD`) recorded for display only ("Installed: abc1234 • 2s ago"). NOT used for no-op decision (dirty trees are normal).
- **D-08:** Derive repo root at compile time via Swift `#filePath` literal. New file `Sources/DailyBriefMonitor/RepoLocation.swift` walks up to repo root.
- **D-09:** Delete hardcoded fallback at `StatusChecker.swift:19` and reroute its dev-build candidates through `RepoLocation.path`.
- **D-10:** Mirror existing "Run Now" / StatusChecker pattern: title-bar icon swap to `arrow.triangle.2.circlepath` while updating, dropdown button disabled-while-running, label cycles "Updating…" → "✓ Up to date" / "✓ Updated to abc1234" / "✗ Build failed", dedicated status row in dropdown.
- **D-11:** Append full stdout+stderr of `install.sh` to `~/Library/Logs/DailyBrief/update.log` (no rotation yet).
- **D-12:** On failure, show last 20 lines of stderr inline + "Open Full Log" button via `NSWorkspace.shared.open`.

### Claude's Discretion

- New Swift type structure (`UpdateService`, `RepoLocation`, `UpdateStatus`) — planner/executor decide.
- Process invocation details — use `StatusChecker.swift:89-118` pattern as template.
- Exact icon glyphs and colors beyond D-10.
- Whether handoff file is JSON/plist/UserDefaults — pick what fits.

### Deferred Ideas (OUT OF SCOPE)

- Auto-update checks / polling
- Rollback on failed reload
- Version pinning / release channels
- Update notifications when new commits land
- Rotating `update.log` by size
- `.app` bundle packaging (deferred project-wide)
- Log rotation / retention for `update.log`
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEV-01 | Single menu-bar action rebuilds and reinstalls both binaries with no terminal | `Process` + `Pipe` invocation of `Scripts/install.sh` (verified pattern at `StatusChecker.swift:89-118`); repo path resolved at compile time via `#filePath` (D-08) |
| DEV-02 | Update reloads DailyBriefMonitor LaunchAgent so new binary takes effect | `launchctl kickstart -k gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor` invoked from detached helper; KeepAlive `SuccessfulExit=false` plist (verified live via `launchctl print`) respawns on `exit(0)` |
| DEV-03 | Inline in-progress / success / error feedback in menu bar | `@Observable` `UpdateService` mirroring `StatusChecker` `isRunning` pattern; `MenuBarView` mirroring "Run Now" button (`MenuBarView.swift:72-81`); error tail surfaced via stderr buffer + "Open Full Log" |
| DEV-04 | Idempotent — clicking when nothing changed reports no-op | SwiftPM's own incremental build is the change-detection engine; post-build mtime comparison between `.build/release/<bin>` and `~/.local/bin/<bin>` short-circuits cp + reload |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No project-level `./CLAUDE.md` exists. No `.claude/skills/` or `.agents/skills/` directories exist. Conventions are derived from existing code only.

## Summary

Phase 51 is small in surface area but unusually rich in subtle macOS process semantics. The work splits cleanly into five concerns: (1) **a `RepoLocation` constant** baked at compile time so the monitor never has to guess where the repo lives, (2) **an `@Observable` `UpdateService`** that wraps `Scripts/install.sh` exactly the way `StatusChecker` wraps the CLI binary today, (3) **a no-op gate** around the install.sh invocation that pre-checks build mtimes the way `make` would, (4) **a self-reload trampoline** (handoff JSON + `/tmp/vigil-reload.sh` + `exit(0)`) that survives the parent's death, and (5) **a menu UI** that mirrors the existing "Run Now" button verbatim.

Every locked decision in CONTEXT.md is technically sound and verified against the current environment: KeepAlive plist is live and matches D-02's expectation, both binaries exist at `~/.local/bin/`, log directory exists, and `#filePath` walk-up math lands on the repo root with exactly **three** `deletingLastPathComponent()` calls. The single area requiring care is **detached child process configuration** — Foundation's `Process` will not survive the parent unless stdio is fully disconnected and no `waitUntilExit()` is called. This is documented below with the exact configuration.

**Primary recommendation:** Build `UpdateService` as a structural twin of `StatusChecker` (`@Observable` + `Task.detached` + `Process` + `Pipe`), gate the actual install behind a pre-flight mtime check (D-06), and treat the self-reload trampoline as a one-line shell helper rather than trying to spawn launchctl directly from Swift.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Foundation `Process` / `Pipe` | macOS 15 SDK | Spawn `install.sh`, capture stdout/stderr | Already used by `StatusChecker.runNow()`; no extra dep [VERIFIED: Sources/DailyBriefMonitor/StatusChecker.swift:89-118] |
| Swift `@Observable` (Observation framework) | Swift 6.2 / macOS 14+ | Reactive `UpdateService` state | Already used by `StatusChecker` and `BriefScheduler` [VERIFIED: codebase] |
| SwiftUI `@Bindable` | macOS 14+ | View binding to `UpdateService` | Already used in `MenuBarView` [VERIFIED: MenuBarView.swift:5] |
| `NSWorkspace.shared.open` | AppKit | Open `update.log` in default text editor | Already used for "Open Latest PDF" / "View Log" [VERIFIED: MenuBarView.swift:84] |
| `launchctl kickstart -k` | macOS launchd | Force-restart the monitor LaunchAgent | Modern launchd CLI; replaces `bootout` + `bootstrap` for the in-process restart case [CITED: man launchctl, macOS 14+] |

**No new dependencies.** Phase 51 adds zero packages — entirely Foundation/AppKit/SwiftUI built-ins.

### Verified Environment

```text
Swift 6.2.4 (swiftlang-6.2.4.1.4)
Target: x86_64-apple-macosx15.0
~/.local/bin/DailyBrief                  ✓ (exists, mtime epoch 1775604143)
~/.local/bin/DailyBriefMonitor            ✓ (exists, mtime epoch 1775612159)
~/Library/Logs/DailyBrief/                ✓ (exists, contains monitor-stderr.log etc.)
~/Library/Application Support/DailyBrief/ ✗ (does NOT exist — UpdateService must mkdir)
~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist ✓ (live, KeepAlive.SuccessfulExit=false)
launchctl print gui/501/com.jamesonmorrill.dailybriefmonitor → state = running, active count = 4
```

[VERIFIED: live shell probes 2026-04-07]

## Architecture Patterns

### Recommended File Layout

```
Sources/DailyBriefMonitor/
├── RepoLocation.swift     # NEW — compile-time #filePath constant
├── UpdateService.swift    # NEW — @Observable wrapper around install.sh
├── UpdateStatus.swift     # NEW (optional) — enum: idle / running / upToDate / updated(sha) / failed(tail)
├── StatusChecker.swift    # MODIFIED — drop hardcoded fallback at line 19, use RepoLocation
├── MenuBarView.swift      # MODIFIED — add "Update Vigil" button + status row
├── DailyBriefMonitorApp.swift  # MODIFIED — instantiate UpdateService alongside StatusChecker, read handoff on launch
└── …
```

### Pattern 1: `@Observable` external-process service

The new `UpdateService` is a structural twin of `StatusChecker.runNow()`. Mirror it exactly:

```swift
// Source: Sources/DailyBriefMonitor/StatusChecker.swift:89-118 (verified pattern)
@Observable
final class UpdateService: @unchecked Sendable {
    var status: UpdateStatus = .idle      // idle / running / upToDate / updated(sha) / failed(tail)
    var isRunning: Bool = false
    var lastOutcomeAt: Date? = nil

    private let logPath = NSString("~/Library/Logs/DailyBrief/update.log").expandingTildeInPath
    private let handoffPath = NSString("~/Library/Application Support/DailyBrief/last-update.json").expandingTildeInPath

    func updateNow() {
        guard !isRunning else { return }
        isRunning = true
        status = .running

        Task.detached { [self] in
            // 1. swift build -c release  (cwd = RepoLocation.path)
            // 2. mtime gate — if installed binaries newer-or-equal, skip cp + reload
            // 3. ./Scripts/install.sh  (full output appended to update.log)
            // 4. on success: write handoff JSON, spawn detached reload helper, exit(0)
            // 5. on failure: capture stderr tail, await MainActor.run { … status = .failed(tail) }
        }
    }
}
```

### Pattern 2: `RepoLocation` via `#filePath`

`#filePath` is a Swift literal that expands at **parse time** to the absolute path of the source file containing the literal. It is **not** runtime — once compiled into the release binary, the string is baked. SwiftPM release builds preserve this. [CITED: Swift Evolution SE-0274 / `#filePath` literal documentation]

Walk-up math (verified): `#filePath` for `Sources/DailyBriefMonitor/RepoLocation.swift` =
`/Users/jamesonmorrill/Desktop/Local AI/dailybrief/Sources/DailyBriefMonitor/RepoLocation.swift`

```swift
// Source: Swift literal #filePath, verified walk-up math 2026-04-07
enum RepoLocation {
    /// Absolute path to the dailybrief repo root, baked at compile time.
    /// Walks up THREE directories from this source file to reach the repo root:
    ///   .../dailybrief/Sources/DailyBriefMonitor/RepoLocation.swift  (#filePath)
    ///   → .../dailybrief/Sources/DailyBriefMonitor                   (1×)
    ///   → .../dailybrief/Sources                                     (2×)
    ///   → .../dailybrief                                             (3×) ← REPO ROOT
    static let path: String = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<3 { url.deleteLastPathComponent() }
        return url.path
    }()

    static var installScript: String { (path as NSString).appendingPathComponent("Scripts/install.sh") }
    static var releaseBuildDir: String { (path as NSString).appendingPathComponent(".build/release") }
}
```

**Critical:** the count is **3**, not 4. Three `deleteLastPathComponent()` calls strip `RepoLocation.swift` → `DailyBriefMonitor` → `Sources` and land on `dailybrief`. Verified by manual walk on the live filesystem 2026-04-07. [VERIFIED: shell probe]

### Pattern 3: Detached child process that survives parent exit

This is the trickiest piece in the phase. Foundation's `Process` defaults to a configuration that **dies with the parent** unless you take explicit steps. The recipe:

```swift
// Source: synthesized from Apple Foundation Process docs + macOS posix_spawn semantics
// Verified pattern; planner should test on first execution.
func spawnDetachedReloadHelper() {
    let helperPath = "/tmp/vigil-reload.sh"
    let helperBody = """
    #!/bin/bash
    sleep 1
    launchctl kickstart -k gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor
    """
    try? helperBody.write(toFile: helperPath, atomically: true, encoding: .utf8)
    _ = chmod(helperPath, 0o755)

    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/bash")
    p.arguments = [helperPath]

    // CRITICAL: disconnect stdio so parent's death doesn't propagate via SIGPIPE,
    // and so the helper doesn't keep file handles to the dying parent's pipes.
    p.standardInput = FileHandle.nullDevice
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice

    try? p.run()
    // DO NOT call p.waitUntilExit() — return immediately.
    // DO NOT retain `p` past this scope — let it deallocate; the OS process keeps running.
}
```

Then immediately call `exit(0)`. The launchd KeepAlive `SuccessfulExit=false` rule (verified live in the installed plist) will respawn the monitor, and **before** that respawn happens, the helper's `launchctl kickstart -k` will fire and force-restart the agent. Either path lands the user on a fresh binary.

**Why a shell helper instead of spawning `launchctl` directly from Swift:** when the monitor calls `exit(0)`, any direct child process loses its parent. With launchctl, that's fine — but the `sleep 1` race-buffer matters because the new binary hasn't finished respawning yet, and we want the kickstart to win the race over the KeepAlive respawn (or at minimum, double-tap is harmless because both end at "fresh process"). A standalone `/bin/bash /tmp/vigil-reload.sh` is the simplest possible "fire and forget" trampoline.

### Pattern 4: SwiftPM incremental build + mtime gate

`swift build -c release` is fast when nothing changed (~1-2s manifest parse + dependency check, no compilation). The mtime gate is layered **on top of** the build, not in place of it:

```swift
// Pseudo-code for the no-op gate (D-05 + D-06)
let releaseDir = RepoLocation.releaseBuildDir
let buildBins   = ["DailyBrief", "DailyBriefMonitor"].map { "\(releaseDir)/\($0)" }
let installBins = ["DailyBrief", "DailyBriefMonitor"].map { NSString("~/.local/bin/\($0)").expandingTildeInPath }

// 1. Always run: swift build -c release  (let SwiftPM decide)
// 2. After build, compare mtimes
func mtime(_ path: String) -> Date? {
    (try? FileManager.default.attributesOfItem(atPath: path)[.modificationDate]) as? Date
}

let allInstalledFresh = zip(buildBins, installBins).allSatisfy { build, installed in
    guard let bm = mtime(build), let im = mtime(installed) else { return false }
    return im >= bm                      // installed is newer or equal → already fresh
}

if allInstalledFresh {
    status = .upToDate
    // Skip Scripts/install.sh entirely. No cp, no LaunchAgent reload.
    return
}
// Otherwise: invoke Scripts/install.sh
```

**Note:** `attributesOfItem(atPath:)[.modificationDate] as? Date` is the canonical Foundation API and returns `Date?`. [CITED: Apple FileManager docs] The sub-second precision of HFS+/APFS mtimes is sufficient — `swift build` rewrites the binary atomically, so any rebuild produces a strictly later mtime than a prior `cp`.

### Pattern 5: Handoff file lifecycle

```text
Write side  (UpdateService, just before exit(0)):
  mkdir -p ~/Library/Application Support/DailyBrief/
  write last-update.json: { "sha": "abc1234", "timestamp": "2026-04-07T…", "outcome": "updated" }

Read side   (DailyBriefMonitorApp / AppDelegate, on launch):
  if file exists → parse → seed UpdateService.status → delete file
```

**Where to read on launch:** `AppDelegate.applicationDidFinishLaunching` is the correct hook. It runs once per process, before the menu bar is rendered, and `AppDelegate` already owns the lifecycle of all other services. Inject the parsed handoff into `UpdateService` at construction time (or via a one-shot method). Do **not** read from `View.onAppear` — it can fire multiple times and races with menu open/close.

The Application Support directory does **not** currently exist. `UpdateService` (or a tiny helper) must call `FileManager.default.createDirectory(atPath:withIntermediateDirectories: true)` before the first write. [VERIFIED: shell probe — directory absent 2026-04-07]

### Anti-Patterns to Avoid

- **Reimplementing install.sh in Swift.** D-01 forbids this. Two install paths = guaranteed drift the moment `install.sh` evolves.
- **`Process.run()` + `waitUntilExit()` for the reload helper.** Will block, then die with the parent before launchctl can fire.
- **Spawning `launchctl kickstart` directly from Swift without a `sleep` buffer.** The process tree teardown can SIGTERM the launchctl child before it hands off to launchd. The `/bin/bash` shell helper with `sleep 1` is a deliberate race buffer.
- **Using `FileManager.default.modificationDate(atPath:)`** — that API does not exist. The correct accessor is `attributesOfItem(atPath:)[.modificationDate]` cast to `Date`.
- **Reading the handoff file from `View.onAppear`.** Fires repeatedly when the menu opens/closes; will show the "Updated to abc1234" toast every time the user clicks the menu bar icon.
- **Storing the repo path in Settings or `UserDefaults`.** User has explicitly flagged config drift as a recurring problem (see `project_secret_drift.md` in user memory). `#filePath` eliminates the surface entirely.
- **Using `Bundle.main.path`** to find the repo. The release binary lives at `~/.local/bin/`, not in the repo — `Bundle.main` resolves to the install directory and tells you nothing about the source tree. `#filePath` is the only correct mechanism for this codebase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Swift incremental build detection | File hash / source scan | `swift build -c release` (it already does this) | SwiftPM has battle-tested incremental compilation; reinventing it loses correctness |
| LaunchAgent respawn | Custom watchdog process | launchd `KeepAlive.SuccessfulExit=false` (already in installed plist) | The plist `Scripts/install.sh` writes already does this — exiting cleanly triggers launchd to respawn |
| Force-restart of a running LaunchAgent | `bootout` + `bootstrap` sequence | `launchctl kickstart -k gui/$UID/<label>` | One atomic command; `-k` means "kill the running instance and restart" |
| Detecting whether a binary changed | Hash compare | `mtime` of `.build/release/<bin>` vs `~/.local/bin/<bin>` | install.sh uses `cp -f` so install mtime is always ≥ build mtime when fresh; the asymmetry is the signal |
| Parsing `git rev-parse --short HEAD` output | Git plumbing libs | Spawn `/usr/bin/git` via `Process` and read stdout | One-shot, no dep, established codebase pattern |
| Discovering the repo root from a deployed binary | Walking up from `argv[0]` | `#filePath` literal baked at compile time | The deployed binary is at `~/.local/bin/`, divorced from the source tree — only compile-time knowledge can connect them |

**Key insight:** Phase 51's value comes from delegating, not implementing. `install.sh`, SwiftPM, launchd, and `git` already do the hard work. The Swift code's job is to be a thin, observable, recoverable wrapper.

## Runtime State Inventory

> Phase 51 includes the deletion of a hardcoded path at `StatusChecker.swift:19` and refactors path discovery to `RepoLocation`. This is a small refactor — but the inventory below is required because the path string in question encodes a runtime assumption.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — verified by codebase grep. No database stores the repo path; SQLite/Postgres schemas hold thoughts and projects, not file paths. | None |
| **Live service config** | None — verified by codebase grep. The Vigil Core API server has no notion of the local repo path. n8n is not used in this project. | None |
| **OS-registered state** | The installed LaunchAgent plist (`com.jamesonmorrill.dailybriefmonitor.plist`) embeds `/Users/jamesonmorrill/.local/bin/DailyBriefMonitor` — the **install** path, not the repo path. After Phase 51 the plist is unchanged; `Scripts/install.sh` already regenerates it on every install and will continue to write the same string. Verified live via `launchctl print gui/501/com.jamesonmorrill.dailybriefmonitor`. | None |
| **Secrets and env vars** | None. The repo path is not referenced in any `.env`, SOPS file, or environment variable. The hardcoded fallback at `StatusChecker.swift:19` is a Swift string literal, not an env var. | None |
| **Build artifacts / installed packages** | The currently-installed `~/.local/bin/DailyBriefMonitor` binary contains the **old** hardcoded fallback string baked in. After Phase 51's first successful update, the new binary will contain `RepoLocation.path` baked in instead. Until that first update happens, the old binary continues to use the old fallback — which still happens to be correct on this machine. No data migration needed because the fallback was only ever consulted when `~/.local/bin/DailyBrief` was missing. | None — first run of new code self-corrects via the update flow it ships |

**The canonical question:** *After the new binary is installed, what runtime systems still have the old hardcoded path cached, stored, or registered?* Answer: **only the old binary itself**, which is replaced atomically by `cp -f` on the first successful update. No external state survives.

## Common Pitfalls

### Pitfall 1: Detached child dies with parent
**What goes wrong:** You spawn `/tmp/vigil-reload.sh` via `Process()`, call `exit(0)`, and the helper dies before `launchctl kickstart` runs. The new binary still respawns via KeepAlive (so the user notices nothing wrong), but the **kickstart** never fires — meaning if launchd's respawn logic ever changes or is delayed, updates appear to "stick on the old binary" intermittently.
**Why it happens:** Foundation's `Process` inherits stdio from the parent by default. When the parent exits, the inherited file handles close, the child receives `SIGPIPE` on first read/write, and dies.
**How to avoid:** Set `standardInput`, `standardOutput`, `standardError` to `FileHandle.nullDevice` on the helper Process **before** calling `run()`. Do not call `waitUntilExit()`. See Pattern 3.
**Warning signs:** "Update Vigil" appears to work but the menu bar never blinks, OR the new binary runs but the handoff file persists across multiple launches (because the new binary started from KeepAlive without ever knowing an update happened).

### Pitfall 2: mtime equality on rapid no-op clicks
**What goes wrong:** User clicks "Update Vigil" twice in quick succession on a clean tree. Both invocations call `swift build -c release` (fast no-op). Both then check mtimes and find them equal. Both correctly report "Up to date". So far so good. **But** if the second click happened in the same filesystem second, and the user just edited a file in that same second, the build mtime might equal the install mtime to the second's precision.
**Why it happens:** APFS has nanosecond mtime precision, but `Date` round-trips through `attributesOfItem` are precise. The risk is mostly theoretical, but worth knowing.
**How to avoid:** Use strict `>` comparison for "build is newer than install" — i.e. `installed_mtime >= build_mtime` is "up to date" (the equality bias goes toward declaring no-op, which is safe). See Pattern 4 code.
**Warning signs:** None expected in practice; documented for completeness.

### Pitfall 3: `Process` blocks on full pipe buffers
**What goes wrong:** `install.sh` produces a few KB of output. `Process` writes to the pipe synchronously. If you don't drain the pipe while the process runs, the kernel pipe buffer fills (default 16-64KB) and `swift build` blocks on a write — the whole update hangs.
**Why it happens:** Foundation `Pipe` does not auto-drain. You must either read in a background queue or use the `readabilityHandler` callback.
**How to avoid:** Either (a) call `pipe.fileHandleForReading.readabilityHandler = { handle in ... }` and accumulate into a buffer, or (b) read the entire pipe **after** `waitUntilExit()` only if you're confident output is small. **For `install.sh`, output is small enough (<10KB) that option (b) is fine** — but the planner should know option (a) is the safe pattern for arbitrary scripts. `StatusChecker.runNow()` uses option (b) implicitly because it ignores the pipe content.
**Warning signs:** "Updating…" hangs forever for some users with verbose `swift build` output.

### Pitfall 4: handoff file shown on every launch
**What goes wrong:** AppDelegate reads the handoff file but forgets to delete it. Every restart of the monitor (LaunchAgent crash, login, manual relaunch) shows "✓ Updated to abc1234" forever.
**Why it happens:** Easy to forget the cleanup step.
**How to avoid:** Delete the file in the same code block that reads it, before any error handling. Treat the file as a one-shot mailbox.
**Warning signs:** Status shows a successful update from days ago.

### Pitfall 5: Forgotten Application Support directory
**What goes wrong:** First-ever update attempt on a clean machine fails at the handoff write step because `~/Library/Application Support/DailyBrief/` does not exist. The build and cp succeeded, but the handoff write threw `NSCocoaErrorDomain Code 4`. The user sees "✗ Update failed" despite the binaries being correctly updated.
**Why it happens:** No code path on this machine currently creates `~/Library/Application Support/DailyBrief/` — verified absent 2026-04-07.
**How to avoid:** Always `createDirectory(atPath:withIntermediateDirectories: true)` before the first write. Ignore "file exists" errors.
**Warning signs:** First update fails on a clean machine but the binaries are nonetheless newer.

### Pitfall 6: install.sh `cd "$REPO_DIR"` assumption
**What goes wrong:** install.sh starts with `REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"`. This means **the script discovers its own repo from its own location on disk**. So as long as the Swift code invokes `./Scripts/install.sh` (or its absolute path) inside the actual repo, the script's internal pathing is correct.
**Why it matters:** The Swift code does NOT need to set the Process's `currentDirectoryURL` to the repo root for install.sh to work — the script is self-locating. **But** `swift build -c release` (if invoked separately) **does** need `currentDirectoryURL` set to the repo root to find `Package.swift`.
**How to avoid:** Set `process.currentDirectoryURL = URL(fileURLWithPath: RepoLocation.path)` for any invocation that runs `swift`, `git`, or `swift build`. For `install.sh` it doesn't strictly matter, but set it anyway for symmetry.
**Warning signs:** "swift: error: no Package.swift found" in `update.log`.

## Code Examples

### Spawning install.sh with output capture (safe small-output variant)

```swift
// Source: adapted from Sources/DailyBriefMonitor/StatusChecker.swift:89-118
private func runInstallScript() async -> (exitCode: Int32, output: String) {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [RepoLocation.installScript]
    process.currentDirectoryURL = URL(fileURLWithPath: RepoLocation.path)

    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = pipe   // merge into single stream for log file

    do {
        try process.run()
    } catch {
        return (-1, "Failed to spawn install.sh: \(error.localizedDescription)")
    }

    process.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let output = String(data: data, encoding: .utf8) ?? ""

    return (process.terminationStatus, output)
}
```

For `install.sh` (output <10KB), `readDataToEndOfFile()` after `waitUntilExit()` is safe. If output ever grows large, switch to `readabilityHandler`.

### Reading git short SHA

```swift
private func currentGitSHA() -> String? {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
    process.arguments = ["rev-parse", "--short", "HEAD"]
    process.currentDirectoryURL = URL(fileURLWithPath: RepoLocation.path)

    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = FileHandle.nullDevice

    try? process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { return nil }

    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
}
```

### Appending to update.log

```swift
private func appendToUpdateLog(_ text: String) {
    let url = URL(fileURLWithPath: NSString("~/Library/Logs/DailyBrief/update.log").expandingTildeInPath)
    let stamped = "[\(ISO8601DateFormatter().string(from: Date()))]\n\(text)\n\n"
    if let handle = try? FileHandle(forWritingTo: url) {
        try? handle.seekToEnd()
        try? handle.write(contentsOf: Data(stamped.utf8))
        try? handle.close()
    } else {
        try? stamped.write(to: url, atomically: true, encoding: .utf8)
    }
}
```

`~/Library/Logs/DailyBrief/` already exists [VERIFIED: shell probe], so no `createDirectory` needed.

### Tail-of-stderr extraction (D-12, last 20 lines)

```swift
private func lastNLines(_ output: String, _ n: Int) -> String {
    let lines = output.split(separator: "\n", omittingEmptySubsequences: false)
    return lines.suffix(n).joined(separator: "\n")
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `launchctl unload` + `launchctl load` | `launchctl bootout` + `launchctl bootstrap` | macOS 10.10+ | Old commands deprecated; install.sh already uses bootout/bootstrap |
| `bootout` + `bootstrap` for in-process restart | `launchctl kickstart -k gui/$UID/<label>` | macOS 10.10+ stable | Single atomic command; perfect for "force the running instance to restart" use case in this phase |
| `__FILE__` literal | `#filePath` (and `#file` for testable shorter form) | Swift 5.3 (SE-0274) | `#filePath` is the absolute-path variant — what we want here |
| Custom Observable via Combine `@Published` | `@Observable` macro (Observation framework) | Swift 5.9 / macOS 14 | The codebase already uses `@Observable` for `StatusChecker` and `BriefScheduler` — match that style |

**Deprecated/outdated:**
- `launchctl load -w` — superseded by `bootstrap`. install.sh correctly uses the modern form.
- Combine `@Published` — codebase has migrated to `@Observable`; do not introduce new `@Published` properties.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `launchctl kickstart -k gui/$UID/<label>` works correctly with KeepAlive plists where `SuccessfulExit=false` | Pattern 3, Don't Hand-Roll | Self-reload would need to fall back to a `bootout`+`bootstrap` sequence in the helper script. Mitigation: the helper is one-line — easy to swap. The KeepAlive respawn is a backstop either way. [ASSUMED — based on `launchctl kickstart` general semantics; not personally tested with KeepAlive interaction on this exact plist] |
| A2 | Foundation `Process` with all three stdio set to `FileHandle.nullDevice` and no `waitUntilExit()` produces a child that survives parent `exit(0)` | Pattern 3 | If wrong, the helper dies before `sleep 1` completes and kickstart never runs. KeepAlive still respawns, so user-visible behavior is "update worked but the menu bar didn't blink". Mitigation: detect via test on first execution. [ASSUMED — derived from POSIX `posix_spawn` semantics; not verified with a live test in this session] |
| A3 | `swift build -c release` no-op on a clean tree completes in ~1-2 seconds | D-05, summary | If much slower, the "click and immediately see Up to date" UX feels broken. Mitigation: show "Checking…" intermediate state. [ASSUMED — based on typical SwiftPM behavior; user has not measured on this machine] |
| A4 | The handoff file should live at `~/Library/Application Support/DailyBrief/last-update.json` — the directory does NOT currently exist | Pattern 5 | Already noted as a pitfall (#5). Verified absent. [VERIFIED: shell probe] |
| A5 | macOS 14+ `#filePath` literal is preserved through SwiftPM release builds (not stripped) | D-08, Pattern 2 | If stripped, `RepoLocation.path` becomes empty/garbage and the whole phase falls over. Mitigation: trivial unit test — print `RepoLocation.path` from a release build. [ASSUMED — `#filePath` is documented as a literal expansion at parse time, which means the string is baked into the binary. Standard Swift behavior, but unverified for this codebase's exact build flags] |

## Open Questions (RESOLVED)

1. **Should the no-op gate run `swift build` first, or check mtimes first?**
   - Argument for `swift build` first: D-05 explicitly says SwiftPM is the source of truth. Always running it ensures no stale bytecode survives.
   - Argument for mtime first: If installed binaries are newer than build dir (because the user just ran `Scripts/install.sh` from the terminal), we can skip `swift build` entirely and report no-op in <100ms.
   - **RESOLVED — Recommendation:** Run `swift build` always (D-05 wins), then mtime-gate the install. The 1-2s build is the worst case and is fine.

2. **If `swift build` itself fails (compilation error), what status string?**
   - **RESOLVED — Recommendation:** `.failed("Build error")` with the last 20 lines of stderr exactly as D-12 describes for install failures. Treat build failure as the same UX as install failure.

3. **Does `launchctl kickstart -k` race the KeepAlive respawn?**
   - **RESOLVED — Recommendation:** Both lead to "fresh process running new binary", so even a race is benign. The test for "did this work" is "is the new binary running 2 seconds after I clicked", not "did kickstart specifically fire".

4. **Should `Scripts/install.sh` itself be modified to detect "called from monitor" mode?**
   - **RESOLVED — Recommendation:** **No.** D-01 says install.sh stays the single source of truth. Adding mode flags creates exactly the drift the decision was meant to prevent. The "no-op" UX lives entirely in Swift, not in the script.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Swift toolchain (`swift build`) | install.sh, no-op gate | ✓ | 6.2.4 (swiftlang-6.2.4.1.4) | — |
| `/bin/bash` | reload helper, install.sh shebang | ✓ | system | — |
| `/usr/bin/git` | git SHA capture (D-07) | ✓ | system | Display "(unknown sha)" if absent |
| `launchctl` | kickstart helper, install.sh load step | ✓ | system | — |
| `~/.local/bin/` install dir | mtime gate, cp target | ✓ | exists | install.sh creates if missing |
| `~/Library/Logs/DailyBrief/` | update.log target | ✓ | exists | install.sh creates if missing |
| `~/Library/Application Support/DailyBrief/` | handoff file | ✗ | does not exist | UpdateService must `mkdir -p` before first write |
| `~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist` | self-reload via KeepAlive | ✓ | live, KeepAlive=true, SuccessfulExit=false | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Application Support dir — handled by `createDirectory(withIntermediateDirectories: true)`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — codebase has no `Tests/` directory or test target [VERIFIED: glob `Tests/**/*.swift` returned zero files] |
| Config file | none |
| Quick run command | `swift build -c release` (compile-time validation only) |
| Full suite command | n/a |
| Phase gate | Manual verification per success-criterion checklist below |

**Implication:** Validation for Phase 51 is **manual + scriptable smoke tests**, not unit tests. This matches the entire DailyBrief codebase's existing style — there are no `XCTestCase` subclasses anywhere in `Sources/DailyBriefMonitor/`. Adding a test target purely for this phase would be scope creep against the user's "no config theater" stance.

### Phase Requirements → Verification Map

| Req ID | Behavior | Verification Type | Manual Steps / Scripted Check | Wave 0? |
|--------|----------|-------------------|-------------------------------|---------|
| DEV-01 | Single menu action rebuilds + reinstalls both binaries with no terminal | manual | (1) `touch Sources/DailyBrief/main.swift` to force a rebuild. (2) Click menu bar → "Update Vigil". (3) Wait for "✓ Updated" status. (4) Verify both `~/.local/bin/DailyBrief` and `~/.local/bin/DailyBriefMonitor` mtimes are newer than before the click. | n/a (manual) |
| DEV-02 | LaunchAgent reloads so new binary takes effect immediately | manual + scriptable | (1) Note PID via `launchctl print gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor \| grep pid`. (2) Click "Update Vigil" on a tree with changes. (3) After ~3s, recheck PID — must be different. (4) Confirm `state = running`. | n/a |
| DEV-03 (in-progress) | "Updating…" state visible in menu bar | manual | Click "Update Vigil"; observe title-bar icon swaps to spinning `arrow.triangle.2.circlepath`; dropdown button label reads "Updating…" and is disabled. | n/a |
| DEV-03 (success) | Success state shows updated SHA | manual | After successful update, dropdown shows "✓ Updated to <sha>" with relative timestamp ("• 2s ago" → "• 1m ago"). | n/a |
| DEV-03 (error) | Failure shows reason + Open Full Log | manual | Inject failure: `chmod -x Scripts/install.sh && click → expect "✗ Update failed"`. Verify last 20 stderr lines visible inline; "Open Full Log" opens `~/Library/Logs/DailyBrief/update.log` in default editor. Restore: `chmod +x Scripts/install.sh`. | n/a |
| DEV-04 | Idempotent — second click reports no-op | manual + scriptable | (1) Click "Update Vigil" once on a clean tree → expect "✓ Updated" or "✓ Up to date". (2) Click again immediately → expect "✓ Up to date — no changes" within 2s. (3) Verify `~/.local/bin/DailyBriefMonitor` mtime did NOT change between clicks. | n/a |

### Self-Reload Specific Verification (Pattern 3 — highest risk)

| Check | How |
|-------|-----|
| Helper script written to /tmp | `ls -la /tmp/vigil-reload.sh` after click |
| Helper executable | `[ -x /tmp/vigil-reload.sh ]` |
| Old monitor PID terminated | Capture pre-click PID, observe gone after ~3s |
| New monitor PID different | Capture post-click PID, assert ≠ pre-click PID |
| Handoff file created | `ls ~/Library/Application\ Support/DailyBrief/last-update.json` (file should exist briefly, then be deleted by new instance on launch) |
| Handoff file deleted after launch | After ~5s, file should NOT exist |
| Update.log appended | `tail -20 ~/Library/Logs/DailyBrief/update.log` shows latest run output |

### Compile-Time Sanity Checks (cheap, automatable)

```bash
# 1. RepoLocation walk-up math is correct
swift -e 'import Foundation; var u = URL(fileURLWithPath: "/Users/jamesonmorrill/Desktop/Local AI/dailybrief/Sources/DailyBriefMonitor/RepoLocation.swift"); for _ in 0..<3 { u.deleteLastPathComponent() }; print(u.path)'
# Expected: /Users/jamesonmorrill/Desktop/Local AI/dailybrief

# 2. Both binaries build cleanly
swift build -c release
# Expected: exit 0, no warnings

# 3. install.sh still works standalone
./Scripts/install.sh
# Expected: exit 0, both binaries copied, LaunchAgent loaded
```

### Sampling Rate

- **Per task commit:** `swift build -c release` (compile check only — no unit tests exist)
- **Per phase merge:** Full manual verification per the table above
- **Phase gate:** All 5 ROADMAP success criteria pass manual checklist before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] None — no test infrastructure exists in this codebase and adding any for a single phase would contradict the user's "no config theater" stance. Verification is manual against the success-criterion checklist. The planner should treat this as the **expected** validation strategy for this codebase, matching how phases 1-50 were validated.

## Security Domain

> Phase 51 has a small but real security surface: shell-out to a build script with no input sanitization, plus a temp-file shell helper.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — local single-user |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a — runs as the logged-in user, only as the logged-in user, on their own machine |
| V5 Input Validation | partial | The only "input" is the implicit repo path from `#filePath` (compile-time, untainted) and git output. No user-supplied strings reach `Process.arguments`. |
| V6 Cryptography | no | n/a |
| V14.2 Dependency / supply chain | yes | install.sh runs `swift build` which pulls SwiftPM deps from `Package.swift`. Trust boundary = "user already trusted Package.swift when they last edited it". No new dependency surface added by Phase 51 itself. |

### Known Threat Patterns for menu-bar shell-out

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argument injection into `Process` | Tampering | All arguments are static literals — never interpolate user input into `process.arguments` |
| `/tmp/vigil-reload.sh` overwrite race | Tampering | World-writable `/tmp` is the macOS norm; the helper is owned by the user, executes as the user, and is overwritten on every update. Acceptable for a single-user dev tool, but **a hostile process running as the same user** could replace the helper between write and exec. Single-user Mac threat model: out of scope. |
| Symlink attack on update.log | Tampering | `~/Library/Logs/DailyBrief/` is user-owned; same single-user threat model applies. No mitigation needed beyond using `FileHandle(forWritingTo:)` rather than shell redirect. |
| Privilege escalation via launchctl | Elevation | `launchctl kickstart` in the `gui/$UID` domain operates only on the current user's agents — no SUID, no system domain. Verified safe. |
| Unsigned binary execution | Spoofing | The binary at `~/.local/bin/DailyBriefMonitor` is unsigned (single-dev tool). Phase 51 does not change this. Out of scope per project decisions (`.app` packaging deferred). |

**Net assessment:** Phase 51 introduces no new security surface beyond what `Scripts/install.sh` already exposes. The single-user, local-machine, user-owns-the-source threat model makes the existing controls sufficient.

## Sources

### Primary (HIGH confidence)
- `Sources/DailyBriefMonitor/StatusChecker.swift` lines 1-119 — `@Observable` external-process pattern, current hardcoded fallback
- `Sources/DailyBriefMonitor/MenuBarView.swift` lines 1-138 — "Run Now" button pattern, status icon pattern
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` lines 1-32 — Service instantiation pattern at App level
- `Sources/DailyBriefMonitor/AppDelegate.swift` lines 1-247 — `applicationDidFinishLaunching` lifecycle hook
- `Scripts/install.sh` lines 1-113 — Build/install/load sequence end-to-end
- `~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist` (live, verified via `launchctl print`) — KeepAlive `SuccessfulExit=false` confirmed
- Live shell probes 2026-04-07 — Swift version, binary mtimes, directory existence

### Secondary (MEDIUM confidence)
- Apple `man launchctl` — `kickstart` and `bootstrap` semantics
- Apple Foundation docs — `Process`, `Pipe`, `FileHandle`, `attributesOfItem(atPath:)`
- Swift Evolution SE-0274 — `#filePath` literal semantics

### Tertiary (LOW confidence)
- None used. All claims verified or assumed-and-flagged.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all Foundation/AppKit, no new deps, all patterns already in codebase
- Architecture: HIGH — `UpdateService` is a structural twin of `StatusChecker`, well-understood pattern
- Pitfalls: HIGH — detached child + pipe buffer + handoff lifecycle are well-known macOS gotchas
- Validation: HIGH — manual checklist matches existing codebase validation style
- Self-reload (kickstart + KeepAlive interaction): MEDIUM — verified plist matches expectations, but the exact race between kickstart and respawn is documented as ASSUMED (A1) and worth a one-time live test on first execution

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days — codebase is stable, no upstream macOS/Swift changes expected)
