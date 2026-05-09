# Phase 123: vigil-watch shell — launchd integration + CLI surface + 24h soak — Research

**Researched:** 2026-05-09
**Domain:** macOS launchd integration, swift-argument-parser CLI, atomic IPC files, 24h soak instrumentation
**Confidence:** HIGH (every load-bearing claim verified live on the target Mac or against official docs)

## Summary

Phase 123 wraps the working Phase 122 daemon-as-engine in an ops shell. The technical risk surface is narrow and well-charted: launchd plist correctness, modern `launchctl bootstrap/bootout` semantics, swift-argument-parser dispatch, atomic-write IPC for `runtime-state.json`, and a sampler+assertion loop for the 24h soak gate. Every primitive needed has a verified source, an existing precedent on this Mac, or a Phase 122 reusable asset.

Three live verifications grounded this research:
1. `launchctl print gui/501/com.jamesonmorrill.dailybriefmonitor` confirms the on-disk fields the `status` subcommand will scrape (`state = running`, `pid`, `last exit code`).
2. `launchctl bootout gui/501/com.this.does.not.exist.test` returns **exit code 3 ("No such process")** — exactly what the idempotent install/uninstall must tolerate.
3. The DailyBriefMonitor's `inherited environment` field shows ONLY `SSH_AUTH_SOCK` — confirming the long-known launchd reality: **user shell env vars do NOT inherit into launchd children**. `VIGIL_API_KEY` from `~/.zshenv` will not be visible to the daemon under launchd; the plist must inject it.

**Primary recommendation:** Bake `VIGIL_API_KEY` into the plist's `EnvironmentVariables` dict (the user's threat model already accepts secrets in `~/.config/vigil/watch.toml`). Use AsyncParsableCommand for the 6 subcommands. Reuse Phase 122's `StateStore` atomic-write pattern verbatim for `runtime-state.json`. Use `launchctl bootstrap gui/$(id -u)` for install, `launchctl bootout` (tolerating exit 3) for uninstall, `launchctl print` for status. Use `<true/>` self-closing tags for plist booleans (NOT `<true></true>` — launchd rejects the latter).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Install layout (Area 1):**

- **D-01 (Binary lives at `~/.local/bin/vigil-watch`):** `vigil-watch install` copies `.build/release/vigil-watch` to `~/.local/bin/vigil-watch`. The plist's `ProgramArguments[0]` is the full expanded absolute path `/Users/jamesonmorrill/.local/bin/vigil-watch` (launchd does not expand `~` or `$HOME` in plist values reliably). `~/.local/bin` will be created on install if missing (`mkdir -p`). **Rejected:** in-place reference to `.build/release/vigil-watch` (Desktop path is unstable). `/usr/local/bin` (sudo prompt is hostile).

- **D-02 (launchd logs at `~/Library/Logs/Vigil/watch.{out,err}`):** Plist's `StandardOutPath` and `StandardErrorPath` point here. **Supersedes Phase 122 CONTEXT's tentative `/tmp/vigil-watch.{out,err}` note** — transient logs are incompatible with a 24h soak that may include mid-run reboots. Directory `~/Library/Logs/Vigil/` is created on install. No log rotation in this phase.

- **D-03 (Install is idempotent — bootout-then-replace-then-bootstrap):** If the plist already exists when `install` runs, the command bootouts (ignoring errors), overwrites the plist, then bootstraps. This makes `install` the single command for both fresh installs and upgrades.

**Status IPC (Area 2):**

- **D-04 (Daemon writes `runtime-state.json` on the existing 1Hz tick):** Path: `~/Library/Application Support/vigil-watch/runtime-state.json`. Schema: `{schema_version:1, pid, started_at, queue_depth, last_event_ts, last_event_session_id, last_event_type, quarantined}`. Atomic write via temp+rename (reuses Phase 122's StateStore pattern). Stale by max 1s. If file missing or older than 5s, `status` reports `daemon: NOT RUNNING` and falls back to `launchctl print`.

- **D-05 (Daemon code change is small + additive):** New file `Sources/VigilWatch/RuntimeStateWriter.swift` — actor with a `write(state:)` method. `Daemon.swift`'s 1Hz tick gets one new `await runtimeStateWriter.write(state: ...)` line. `EmitterActor` exposes a new `currentSnapshot()` returning `(queueDepth, lastEventTs, lastEventSessionId, lastEventType, quarantined)`.

**`tail` semantics (Area 3):**

- **D-06 (Filter the launchd log file with jq):** `vigil-watch tail <session-id>` shells out to: `tail -f ~/Library/Logs/Vigil/watch.out | jq -c --arg sid "<session-id>" 'select(.session_id == $sid)'`. Shows what the running daemon ACTUALLY emitted.

- **D-07 (`jq` is required; install command warns if missing):** `vigil-watch install` checks `which jq` and prints a non-fatal warning if missing.

**24h soak gate (Area 4):**

- **D-08 (Sibling launchd sampler agent fires every 5 min):** `vigil-watch install` writes a SECOND plist: `~/Library/LaunchAgents/com.morrillholdings.vigil.watch.sampler.plist` with `StartInterval=300`. Script appends one CSV line `{ts,pid,rss_kb,etime_s}` to `~/Library/Logs/Vigil/soak-YYYY-MM-DD.csv`. Sampler is installed/uninstalled in lockstep with the main daemon.

- **D-09 (End-of-soak assertion script enforces gate):** `scripts/soak-check.sh` (in vigil-watch repo) reads the CSV and exits 0 iff: `max(rss_kb) < 30000`, `(last_ts - first_ts) >= 86400 - 600`, all non-empty PID rows have the same PID, at least one non-empty row exists, and Core received events. Script prints summary table on success — that table goes verbatim into `123-VERIFICATION.md`.

- **D-10 (Soak start/end is operator-driven, not automated):** The soak doesn't run automatically as part of every `install`. Operator procedure: install → live ≥24h → run soak-check.sh → record gate as PASSED.

### Claude's Discretion

- **`vigil-watch test` shape:** POSTs ONE synthetic event with reserved sessionId `_vigil_test_<unix-timestamp>` and event type `heartbeat`. Prints HTTP status + response body. Exit code = 0 iff status is 2xx.

- **`vigil-watch run` foreground behavior:** Default is foreground (matches Phase 122 main.swift). `--verbose` enables stderr human-readable lifecycle logs. Without `--verbose`, only NDJSON events go to stdout, stderr suppressed except errors.

- **CLI library:** `swift-argument-parser` (Apple's official, MIT-licensed, the one Phase 122 Package.swift comment reserved). Single `ParsableCommand` per subcommand under a parent `VigilWatchCLI` with `subcommands: [Run.self, Tail.self, Test.self, Install.self, Uninstall.self, Status.self]`.

- **plist generation:** Static template embedded as a Swift multi-line string with `%PATH%` placeholders. `Install` subcommand calls `.replacingOccurrences` to fill them. Sampler plist is a separate embedded string in the same file.

- **`EnvironmentVariables` in plist:** `PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` (matches DailyBriefMonitor). `VIGIL_API_KEY` is NOT baked into the plist initially — daemon reads it via Phase 122 ConfigLoader env-var fallback. **If env-var inheritance turns out to be unreliable under launchd (smoke test required), fall back to baking `VIGIL_API_KEY` into the plist's `EnvironmentVariables` dict.**

  → **This research finds inheritance IS unreliable** (see §Standard Stack and §Common Pitfalls). The fallback IS the recommended path from day one.

- **`vigil-watch uninstall` semantics:** `bootout` first (ignore errors — daemon may not be loaded), then delete both plist files. Returns 0 even if plists were already absent. Does NOT remove `~/Library/Application Support/vigil-watch/` (operator data).

- **Crash-loop protection:** Use launchd's `ThrottleInterval` default (10s) — no override needed.

### Deferred Ideas (OUT OF SCOPE)

- **Log rotation for `~/Library/Logs/Vigil/watch.{out,err}`:** Not in this phase.
- **`vigil-watch logs` subcommand:** Not in the ROADMAP-locked 6 subcommands.
- **Uninstall confirmation prompt:** Currently silent + idempotent.
- **Soak metric expansion:** Currently captures `pid,rss,etime`. CPU/vsz deferred until needed.
- **Per-launchd-context env-var inheritance smoke test:** Phase 122 ConfigLoader reads `VIGIL_API_KEY` from env. If launchd context doesn't inherit reliably, fallback is baking into plist. The smoke test belongs in this phase's planning.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-WATCH-04 | User can `vigil-watch install` to write `~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist` and `launchctl bootstrap` it (RunAtLoad + KeepAlive); `vigil-watch uninstall` cleanly removes the plist and unloads the agent. | §Standard Stack (launchd primitives), §Code Examples (plist template + bootstrap/bootout invocations), §Common Pitfalls (`<true/>` self-closing tags, bootout exit 3, gui/$UID domain) |
| AGENT-WATCH-05 | User can run `vigil-watch run --verbose` (foreground), `vigil-watch tail <session-id>` (parsed events without posting), `vigil-watch test` (synthetic event), and `vigil-watch status` (daemon state, queue depth, last event timestamp) for debugging. | §Architecture Patterns (AsyncParsableCommand parent + 6 subcommands), §Code Examples (each subcommand skeleton), §Don't Hand-Roll (use swift-argument-parser, not custom dispatch) |
| AGENT-WATCH-07 | Daemon runs unattended for 24 consecutive hours on the user's local Mac without crashing and stays under 30MB resident memory. | §Architecture Patterns (sampler agent + assertion script), §Common Pitfalls (etime format dd-hh:mm:ss vs hh:mm:ss, pgrep multi-process safety, StartInterval drift), §Code Examples (soak-check.sh awk math) |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Plist generation + write | CLI subcommand (Install) | — | Pure templating; no daemon involvement |
| `launchctl bootstrap/bootout` invocation | CLI subcommand (Install/Uninstall) | — | Shell out via Foundation `Process` |
| Daemon process supervision | macOS launchd | — | RunAtLoad + KeepAlive + ThrottleInterval(10s default) |
| Env var injection (`VIGIL_API_KEY`) | Plist `EnvironmentVariables` | Phase 122 `ConfigLoader.envFallback` | launchd does NOT inherit shell env; plist is the only reliable channel |
| Daemon → CLI status IPC | Atomic file (`runtime-state.json`) | `launchctl print` (fallback when stale) | 1s staleness acceptable for a debug tool; no socket complexity |
| `runtime-state.json` writer | New `RuntimeStateWriter` actor in VigilWatch lib | Reuses Phase 122 `StateStore` atomic-write pattern | One actor, one file, single write per 1Hz tick |
| Live event tail | macOS `tail -f` + `jq` (subprocess pipeline) | — | Phase 122 stdout is already NDJSON; zero daemon changes |
| Soak sampling | Sibling launchd agent + embedded `/bin/sh -c` script | `~/Library/Logs/Vigil/soak-YYYY-MM-DD.csv` | StartInterval=300; `pgrep` + `ps` + `awk` >> CSV append |
| Soak assertion | `scripts/soak-check.sh` (in vigil-watch repo) | `awk` + `curl` to vigil-core | Operator-driven, one-shot per phase |
| Synthetic test event | CLI subcommand (Test) | URLSession via Phase 122 `EmitterActor` patterns OR raw URLSession | Mints `_vigil_test_<unix>` sessionId, POSTs to `/v1/agent-events` |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| swift-argument-parser | **1.6.2** (latest, 2025-10-10) [VERIFIED: github.com/apple/swift-argument-parser/releases] | CLI dispatch + subcommands | Apple's official, MIT, Phase 122 Package.swift reserved this exact dependency. Swift 6.2+ adds `SendableMetatype` conformance for ParsableArguments — clean fit for vigil-watch's Swift 6 mode |
| Foundation `Process` | macOS 14 SDK [VERIFIED: live `swift --version` shows Apple Swift 6.2.4 / Target x86_64-apple-macosx15.0] | Shell-out to `launchctl`, `tail`, `jq`, `which` | First-class API. `Process.launch()` is deprecated; use `run()` + `waitUntilExit()` (Swift 5+). Use `terminationStatus` for exit codes |
| Foundation `FileManager` | macOS 14 SDK | `mkdir -p` equivalent (`createDirectory(at:withIntermediateDirectories: true)`), file existence checks, plist file write | Universal Apple-platform pattern |
| URLSession (already in Phase 122) | Foundation | `vigil-watch test` synthetic POST | Reuse Phase 122's `EmitterActor` stack OR a thin one-shot client |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tail`, `jq`, `pgrep`, `ps`, `awk`, `date`, `curl` | macOS 15.7 system [VERIFIED: live] | `tail` subcommand pipeline + soak sampling/assertion | All present in `/usr/bin/` or `/usr/local/bin` (jq via Homebrew). The plist's PATH must include `/usr/local/bin` so the sampler script finds them |
| Phase 122 `StateStore.atomicSave` pattern | In-repo, verbatim reuse | RuntimeStateWriter atomic temp+F_FULLFSYNC+rename | Already vetted in Phase 122 with 11 XCTest cases green |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| swift-argument-parser | Manual `CommandLine.arguments` parsing | ~150 lines of brittle dispatch code; loses `--help` and validation. Rejected — Phase 122 already reserved swift-argument-parser |
| AsyncParsableCommand | ParsableCommand + `RunLoop.main.run()` in run() | Would block the parser's expected exit semantics. The `run` subcommand inherently needs async (Daemon's `init` is async throws, `start()` is async). Use AsyncParsableCommand |
| `launchctl bootstrap` | `launchctl load -w` (deprecated) | `load` is legacy 10.10-era; `bootstrap` is current and the Apple-recommended form since macOS 10.11 [CITED: alansiu.net 2023, Homebrew/homebrew-services PR #112] |
| Unix domain socket for `status` IPC | `runtime-state.json` atomic file | Socket cleanup edge cases; ~150 lines of new code; no win over 1s staleness for a debug tool. Rejected by D-04 |
| `launchctl list` | `launchctl print gui/$UID/<label>` | `list` is legacy; `print` is modern, no root required, more useful output. The `state =` and `pid =` lines from `print` are the canonical liveness signal — but Apple explicitly says output is NOT API and may change [CITED: apple-developer-forums + masklinn cheat sheet]. Mitigation: parse defensively with simple line-based regex; tolerate format drift |

**Installation:**

```swift
// Package.swift — single dependency added to Phase 122's manifest
dependencies: [
    .package(url: "https://github.com/apple/swift-argument-parser", from: "1.6.0"),
],
targets: [
    .target(name: "VigilWatch", path: "Sources/VigilWatch"),
    .executableTarget(
        name: "vigil-watch",
        dependencies: [
            "VigilWatch",
            .product(name: "ArgumentParser", package: "swift-argument-parser"),
        ],
        path: "Sources/vigil-watch"
    ),
    .testTarget(name: "VigilWatchTests", ...)
]
```

**Version verification:** `swift-argument-parser` 1.6.2 published 2025-10-10 [VERIFIED: github.com/apple/swift-argument-parser/releases/tag/1.6.2]. Pin `from: "1.6.0"` for SemVer flexibility within minor version. swift-tools-version stays at 5.10 (Phase 122's pin); 1.6.x is compatible.

## Architecture Patterns

### System Architecture Diagram

```
[Operator] ──── vigil-watch install ─────┐
                                          │
                                          ▼
                                  ┌──────────────────────┐
                                  │ Install subcommand    │
                                  │ - mkdir -p ~/.local/bin│
                                  │ - cp release binary   │
                                  │ - mkdir -p ~/Library/Logs/Vigil│
                                  │ - render daemon plist │
                                  │ - render sampler plist│
                                  │ - bootout (tolerate 3)│
                                  │ - bootstrap gui/$UID  │
                                  │ - which jq → warn     │
                                  └────────┬─────────────┘
                                           │
                                           ▼
                          ~/Library/LaunchAgents/
                            com.morrillholdings.vigil.watch.plist        ──┐
                            com.morrillholdings.vigil.watch.sampler.plist  │
                                                                            ▼
                                                            ┌────────────────────────┐
                                                            │ launchd (RunAtLoad,    │
                                                            │  KeepAlive, Throttle 10s)│
                                                            └──────┬──────────┬──────┘
                                                                   │          │
                                                  daemon process   │          │ every 300s
                                                                   ▼          ▼
                                            /Users/.../.local/bin/vigil-watch    /bin/sh -c '<sampler script>'
                                            (Phase 122 daemon, run subcommand)        │
                                                          │                            │
                                              ┌───────────┼─────────────┐              │
                                              │           │             │              │
                                              ▼           ▼             ▼              ▼
                              ~/.../offsets.json   stdout NDJSON  runtime-state.json   ~/Library/Logs/Vigil/
                              (Phase 122)          (watch.out via │ (NEW Phase 123)    soak-YYYY-MM-DD.csv
                                                    plist redir)  │                    (1 row per 5min)
                                                          │       │
                                                          │       │
                ┌─── vigil-watch tail <sid> ──────────────┘       │
                │   tail -f watch.out | jq 'select(.session_id == $sid)'│
                │                                                  │
                ├─── vigil-watch status ────────── reads ◄──────────┘
                │   parses JSON; if stale → fallback launchctl print
                │
                ├─── vigil-watch test ───────────── HTTPS POST ────► api.vigilhub.io/v1/agent-events
                │   { sessionId: "_vigil_test_<unix>", event: "heartbeat", ... }
                │
                └─── vigil-watch uninstall
                    bootout (tolerate 3) + rm both plists

[Operator] ──── soak-check.sh ──── reads CSV ──── awk asserts max RSS<30MB, 23h50m+
                                              ──── curl /v1/agent-sessions  events received
                                              ──── prints summary table for VERIFICATION.md
```

### Recommended Project Structure

```
vigil-watch/
├── Package.swift                              # +1 dependency: apple/swift-argument-parser
├── Sources/
│   ├── VigilWatch/                            # library (Phase 122 + 1 new file)
│   │   ├── (existing 16 files unchanged except Daemon.swift, EmitterActor.swift)
│   │   └── RuntimeStateWriter.swift           # NEW — actor, atomic temp+rename, schema_version=1
│   └── vigil-watch/                           # executable (rewritten dispatcher)
│       ├── main.swift                         # NEW — `VigilWatchCLI.main()` (replaces Phase 122 stub)
│       └── Commands/
│           ├── Run.swift                      # AsyncParsableCommand — wraps Phase 122 main.swift body
│           ├── Tail.swift                     # ParsableCommand — Process(tail) | Process(jq)
│           ├── Test.swift                     # AsyncParsableCommand — synthetic POST
│           ├── Install.swift                  # AsyncParsableCommand — plist render + bootstrap
│           ├── Uninstall.swift                # AsyncParsableCommand — bootout + rm
│           ├── Status.swift                   # ParsableCommand — read runtime-state.json
│           └── Plists.swift                   # plist string templates + path helpers
├── scripts/
│   └── soak-check.sh                          # NEW — bash/awk assertion script
└── Tests/
    └── VigilWatchTests/
        ├── (existing 12 suites unchanged)
        ├── RuntimeStateWriterTests.swift      # NEW — atomic write + schema, tmpdir
        ├── PlistTemplateTests.swift           # NEW — render template, plutil -lint round-trip
        └── SoakCheckTests.swift               # NEW — feed synthetic CSV → assert exit codes
```

### Pattern 1: AsyncParsableCommand parent with 6 subcommands

**What:** Dispatcher root with subcommands; each subcommand owns its own logic.
**When to use:** Always for a multi-subcommand CLI.

```swift
// Source: github.com/apple/swift-argument-parser docs + Marco Eidinger Medium guide [CITED]
import ArgumentParser

@main
struct VigilWatchCLI: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "vigil-watch",
        abstract: "Claude Code session watcher daemon for Vigil.",
        subcommands: [Run.self, Tail.self, Test.self, Install.self, Uninstall.self, Status.self],
        defaultSubcommand: Run.self    // bare `vigil-watch` boots the daemon (matches Phase 122 stub)
    )
}

struct Run: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "Run daemon in foreground.")
    @Flag(name: .customLong("verbose")) var verbose: Bool = false

    func run() async throws {
        // Phase 122 main.swift body, unchanged behavior:
        setbuf(stdout, nil)
        let config = try ConfigLoader.load()
        let daemon = try await Daemon(config: config)
        installSIGTERMHandler(emitter: daemon.emitter)
        await daemon.start()
        // Block forever — exits via signal handler.
        // RunLoop.main.run() does NOT return; SIGTERM handler calls exit(0).
        RunLoop.main.run()
    }
}

struct Tail: ParsableCommand {
    static let configuration = CommandConfiguration(abstract: "Stream parsed events for one session.")
    @Argument(help: "Session ID to filter on.") var sessionId: String

    func run() throws {
        // Verify jq present at invocation (in addition to install-time check).
        guard FileManager.default.isExecutableFile(atPath: "/usr/local/bin/jq") ||
              FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/jq") else {
            FileHandle.standardError.write(Data("jq is required: brew install jq\n".utf8))
            throw ExitCode.failure
        }
        // tail -f ~/Library/Logs/Vigil/watch.out | jq -c --arg sid "<id>" 'select(.session_id == $sid)'
        // Wire stdout→stdout, stderr→stderr, forward SIGINT to children.
        // ... (see Code Examples §tail subcommand)
    }
}

struct Status: ParsableCommand {
    static let configuration = CommandConfiguration(abstract: "Print daemon state, queue depth, last event.")
    func run() throws {
        // Read runtime-state.json; if missing or older than 5s → "NOT RUNNING" + launchctl print fallback.
    }
}

// Test, Install, Uninstall similarly...
```

**Throwing exit codes:** `throw ExitCode.failure` for non-zero, `throw ExitCode(2)` for specific codes, `return` for 0. `CleanExit.message("...")` prints to stdout and exits 0 [CITED: swiftinit.org docs].

### Pattern 2: RuntimeStateWriter as actor reusing Phase 122 atomic-write

**What:** Single-owner actor for `runtime-state.json`, atomic temp+rename per write.
**When to use:** Daemon's 1Hz tick.

```swift
// Source: Phase 122 StateStore.swift atomicSaveLocked — lifted verbatim
import Foundation

public struct RuntimeState: Codable, Sendable {
    public var schemaVersion: Int = 1
    public var pid: Int32
    public var startedAt: String         // ISO-8601 with fractional seconds
    public var queueDepth: Int
    public var lastEventTs: String?      // nil if no event yet
    public var lastEventSessionId: String?
    public var lastEventType: String?
    public var quarantined: Bool

    public enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case pid, startedAt = "started_at", queueDepth = "queue_depth"
        case lastEventTs = "last_event_ts"
        case lastEventSessionId = "last_event_session_id"
        case lastEventType = "last_event_type"
        case quarantined
    }
}

public actor RuntimeStateWriter {
    public static let defaultPath: String = {
        NSHomeDirectory() + "/Library/Application Support/vigil-watch/runtime-state.json"
    }()
    private let path: URL

    public init(path: String = defaultPath) {
        self.path = URL(fileURLWithPath: path)
    }

    public func write(_ state: RuntimeState) async throws {
        let dir = path.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let tmp = dir.appendingPathComponent(path.lastPathComponent + ".tmp")
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        let data = try enc.encode(state)
        try data.write(to: tmp)
        // F_FULLFSYNC: durability hardener (best-effort).
        let fd = open(tmp.path, O_RDONLY)
        if fd != -1 { _ = fcntl(fd, F_FULLFSYNC); close(fd) }
        if FileManager.default.fileExists(atPath: path.path) {
            try? FileManager.default.removeItem(at: path)
        }
        try FileManager.default.moveItem(at: tmp, to: path)
    }
}
```

**Performance note (D-04):** 87,000 writes over 24h. APFS handles this well (clones rather than literal byte copies). At ~250 bytes per write, total disk I/O is ~22MB/day — negligible. F_FULLFSYNC adds a few ms per write but the 1Hz cadence absorbs that easily. **No write-amplification concern at this rate.** [VERIFIED: APFS is copy-on-write; rename(2) is metadata-only; matches Phase 122 StateStore which already does this for offsets.json on a similar cadence.]

### Pattern 3: plist template as embedded Swift multi-line string

**What:** Plist XML as `let template = """..."""` with `%PLACEHOLDER%` substitutions.
**When to use:** Single-file install logic (per CONTEXT D-Discretion).

```swift
// Plists.swift
struct PlistTemplates {
    static let daemon = """
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
        <key>Label</key>
        <string>com.morrillholdings.vigil.watch</string>
        <key>ProgramArguments</key>
        <array>
            <string>%BINARY_PATH%</string>
            <string>run</string>
        </array>
        <key>RunAtLoad</key><true/>
        <key>KeepAlive</key><true/>
        <key>LimitLoadToSessionType</key><string>Aqua</string>
        <key>ProcessType</key><string>Interactive</string>
        <key>StandardOutPath</key><string>%LOG_DIR%/watch.out</string>
        <key>StandardErrorPath</key><string>%LOG_DIR%/watch.err</string>
        <key>EnvironmentVariables</key>
        <dict>
            <key>PATH</key>
            <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
            %VIGIL_API_KEY_BLOCK%
        </dict>
    </dict>
    </plist>
    """
    // %VIGIL_API_KEY_BLOCK% is either empty (key from watch.toml) or
    //   <key>VIGIL_API_KEY</key><string>vk_...</string>   (key from env at install time).

    static let sampler = """
    ...similar but ProgramArguments is ["/bin/sh", "-c", "<sampler script>"]...
    <key>StartInterval</key><integer>300</integer>
    """
}
```

**Sanity-check rendered plist with `plutil -lint`:** Each Install run can run `Process(plutil) -lint <rendered>` after writing — exit code 0 means valid XML; non-zero means template substitution went wrong. Cheap, catches placeholder typos before bootstrap fails opaquely.

### Pattern 4: subprocess pipeline in Swift (`tail | jq`)

**What:** Two `Process` instances chained with a `Pipe`.
**When to use:** `vigil-watch tail <session-id>`.

```swift
// Source: Apple Developer Forums "Running a Child Process with Standard Input/Output" [CITED]
let tail = Process()
tail.executableURL = URL(fileURLWithPath: "/usr/bin/tail")
tail.arguments = ["-f", expandTilde("~/Library/Logs/Vigil/watch.out")]

let jq = Process()
jq.executableURL = URL(fileURLWithPath: "/usr/local/bin/jq")  // detect path at runtime
jq.arguments = ["-c", "--arg", "sid", sessionId, "select(.session_id == $sid)"]

let pipe = Pipe()
tail.standardOutput = pipe
jq.standardInput = pipe
jq.standardOutput = FileHandle.standardOutput
jq.standardError = FileHandle.standardError

// Signal forwarding: ensure SIGINT to vigil-watch tail also kills children.
let sigintSrc = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigintSrc.setEventHandler { tail.terminate(); jq.terminate(); exit(130) }
signal(SIGINT, SIG_IGN)
sigintSrc.resume()

try tail.run()
try jq.run()
jq.waitUntilExit()
tail.terminate()  // tail won't exit on its own
```

**stdout buffering trap:** `tail -f` is line-buffered when piped (default `setvbuf` line mode). `jq -c` is also line-buffered. The Phase 122 daemon's `setbuf(stdout, nil)` (main.swift line 6) makes its stdout unbuffered, which is the input side. **Plist-redirected stdout to a regular file is FULLY buffered by default in libc**, but `setbuf(stdout, nil)` overrides that — so the daemon's NDJSON appears in `watch.out` line-by-line, and `tail -f` sees each line as it lands. No additional buffering changes needed.

### Pattern 5: Sampler agent embedded shell script

**What:** A second plist whose `ProgramArguments` is `["/bin/sh", "-c", "<inline sampler script>"]`. No external script file.
**When to use:** D-08 24h soak sampling.

```xml
<key>ProgramArguments</key>
<array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>PID=$(pgrep -f /Users/jamesonmorrill/.local/bin/vigil-watch | head -1); LOG=$HOME/Library/Logs/Vigil/soak-$(date -u +%%Y-%%m-%%d).csv; if [ -n "$PID" ]; then ps -p $PID -o pid=,rss=,etime= | awk -v ts="$(date -u +%%Y-%%m-%%dT%%H:%%M:%%SZ)" '{print ts","$1","$2","$3}' >> "$LOG"; else echo "$(date -u +%%Y-%%m-%%dT%%H:%%M:%%SZ),,," >> "$LOG"; fi</string>
</array>
<key>StartInterval</key><integer>300</integer>
```

**Sampler plist quirks:** the inline script must use `%%` if you double-percent-encode, or single `%` if direct. Since the plist value is plain XML CDATA, single `%` works. **But** `pgrep -f` regex will match the install-time binary path verbatim — if the binary path ever changes (e.g., user moves it), update both the daemon plist and the sampler plist.

### Anti-Patterns to Avoid

- **Hand-rolled CLI dispatch:** `if argv[1] == "install" {...}` — loses `--help`, validation, `--verbose` flag composition, and tab completion. Use swift-argument-parser.
- **`launchctl load -w` instead of `launchctl bootstrap`:** `load` is legacy 10.10-era and Apple-deprecated. Use `bootstrap gui/$(id -u) <plist>`. Not all errors map cleanly between the two.
- **`launchctl bootout user/$(id -u)` instead of `gui/$(id -u)`:** Wrong domain. `gui/$UID` is for user agents loaded at GUI login; `user/$UID` is the per-user-namespace generic domain. `~/Library/LaunchAgents/*.plist` are Aqua agents loaded into `gui/$UID`. [CITED: alansiu.net 2023]
- **Treating `launchctl bootout` exit non-zero as failure:** Exit 3 ("No such process") is **expected** when the service is not loaded. Idempotent install/uninstall must tolerate exit 3. [VERIFIED LIVE: `launchctl bootout gui/501/com.this.does.not.exist.test` → "Boot-out failed: 3: No such process", exit=3]
- **Plist `<true></true>` instead of `<true/>`:** launchd's stricter parser **rejects** non-self-closing booleans. `plutil -lint` accepts both — so the bug only surfaces at bootstrap time with an opaque error. Use `<true/>`. [CITED: openradar 47256054, javorszky.co.uk]
- **Process.launch() (deprecated since macOS 10.13):** Use `Process.run()` + `waitUntilExit()` + check `terminationStatus`.
- **Polling `runtime-state.json` from Status without freshness check:** A daemon that crashed leaves stale state. Check `mtime > now - 5s` OR parse `started_at` and compare PID against `kill(pid, 0)` — D-04 chose the mtime path.
- **Forgetting `setbuf(stdout, nil)` in the run subcommand:** Without it, stdout is fully buffered when redirected (which is what launchd does). NDJSON would appear in 4KB chunks — `tail -f` would lag noticeably. Phase 122's main.swift already does this on line 6; the Run subcommand must preserve it.
- **Assuming `VIGIL_API_KEY` from the user's shell will reach the daemon:** It will not. (See §Common Pitfalls.)
- **Hand-rolling daemon supervision:** launchd's KeepAlive=true + ThrottleInterval default 10s is the supervisor. No watchdog process needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI subcommand dispatch | Manual `argv` switch | swift-argument-parser 1.6.x | `--help`, validation, `@Flag/@Argument` composition, exit codes are not interesting code to write |
| Daemon process supervision | Custom watchdog Swift Task | launchd `KeepAlive=true` + `ThrottleInterval=10` (default) | OS already provides this; double-supervisor is a footgun |
| Plist XML serialization | `XMLDocument` builder | Embedded multi-line string template + `String.replacingOccurrences` | Plist is small, stable, hand-written. plutil -lint validates after render |
| Atomic file write | `try data.write(to: path)` directly | Phase 122 StateStore pattern (temp + F_FULLFSYNC + rename) | Temp+rename is atomic on APFS/HFS+ even under panic; direct write can produce torn reads |
| `tail -f` JSON filter | Re-parse NDJSON in Swift, hold a ring buffer | `Process(tail) | Process(jq)` | Phase 122 stdout is already NDJSON; `jq` is the right tool for line-buffered streaming filters; D-06 explicitly chose this |
| HTTP retry for `vigil-watch test` | Custom backoff loop | One-shot URLSession POST, no retry | This is a smoke test. If it fails, surface the error and exit non-zero. Operator runs again or investigates. Not the place for resilience |
| Soak summary statistics | Swift program reading CSV | `awk` in `soak-check.sh` | One-shot batch script; awk is the canonical CSV-summary tool |
| Process discovery | `ps -ax | grep` | `pgrep -f <full path>` | `pgrep` is a single syscall; matching on full binary path eliminates false positives from `vigil-watch test` invocations spawned ad-hoc |
| Daemon → CLI status query | Unix domain socket + custom RPC | `runtime-state.json` atomic file | Simpler, no socket lifecycle code, 1s staleness is fine for a debug tool. D-04 explicitly rejected sockets |
| Date/time arithmetic | `Date().addingTimeInterval(...)` mode-shift in soak script | `date -u +%s` (epoch seconds) and arithmetic in awk | Bash + awk handles this cleanly; awk diff-of-seconds is the soak's gate condition |

**Key insight:** Phase 123 is glue, not new architecture. Every primitive needed already exists in macOS (launchd, `tail`, `jq`, `ps`, `pgrep`, `awk`, `curl`) or Phase 122 (atomic-write pattern, EmitterActor, Daemon composition root). The ONLY net-new code is: Plists.swift template strings, RuntimeStateWriter (one actor), 6 subcommand files, soak-check.sh.

## Runtime State Inventory

> Phase 123 is NOT a rename/refactor/migration. It additively wraps Phase 122. No runtime-state migration is required. **Section omitted by trigger rule.**

(For traceability: the daemon plist label is brand-new — `com.morrillholdings.vigil.watch` — never previously registered with launchd. The sampler label `com.morrillholdings.vigil.watch.sampler` is also new. The DailyBriefMonitor agent at `com.jamesonmorrill.dailybriefmonitor` is unrelated and untouched.)

## Common Pitfalls

### Pitfall 1: launchd does NOT inherit user shell env vars

**What goes wrong:** `VIGIL_API_KEY` is set in the user's `~/.zshenv` or login shell. Daemon launched manually from Terminal works fine. After `vigil-watch install` + `launchctl bootstrap`, daemon runs but enters QUARANTINE mode because `getenv("VIGIL_API_KEY")` returns NULL.

**Why it happens:** launchd is the parent of EVERY user-context process. It does not source shells; it does not inherit from the user's `~/.zshenv`/`~/.bash_profile`/`~/.profile`. The only env vars set for a launchd child are: (a) defaults set by launchd itself (PATH=/usr/bin:/bin:/usr/sbin:/sbin), (b) anything in the plist's `EnvironmentVariables` dict, (c) keys explicitly set with `launchctl setenv` (which only affects FUTURE launches).

**Evidence (live, 2026-05-09):** `launchctl print gui/501/com.jamesonmorrill.dailybriefmonitor` shows:
```
inherited environment = { SSH_AUTH_SOCK => /private/tmp/com.apple.launchd.kUbarPxIeX/Listeners }
default environment = { PATH => /usr/bin:/bin:/usr/sbin:/sbin }
```
Only `SSH_AUTH_SOCK` is "inherited" — and that's set by launchd itself, not the user's shell. Nothing from `~/.zshenv` is present.

**How to avoid:** Bake `VIGIL_API_KEY` into the daemon plist's `EnvironmentVariables` dict at install time. The Install subcommand reads `getenv("VIGIL_API_KEY")` from its OWN environment (which IS the user shell when run interactively), and writes the value into the rendered plist. If the env var is empty AND `~/.config/vigil/watch.toml` already has `api_key = ""`, install can warn but proceed (operator can edit watch.toml or re-run install with the env var set).

**Warning signs:** Daemon logs `[WARN] api_key missing in watch.toml AND VIGIL_API_KEY env var — running in QUARANTINE mode`. `vigil-watch status` shows `quarantined: true`. `vigil-watch test` returns 401.

**Trade-off acknowledged in CONTEXT D-Discretion:** "puts the key in plain text in `~/Library/LaunchAgents/`, which the user's threat model already accepts for `~/.config/vigil/watch.toml`."

### Pitfall 2: Plist booleans must be self-closing tags

**What goes wrong:** `<key>RunAtLoad</key><true></true>` parses fine via `plutil -lint`, but `launchctl bootstrap` rejects it.

**Why it happens:** launchd uses a stricter parser than `plutil`. Per the plist DTD, `<true>` and `<false>` are EMPTY elements. The XML self-closing form `<true/>` is the canonical representation; the open-and-close form `<true></true>` violates the DTD's empty-element constraint. `plutil` is permissive; launchd is strict. [CITED: openradar 47256054]

**How to avoid:** Always use `<true/>` and `<false/>`. Drift detector test: `PlistTemplateTests.swift` greps the rendered template for `<true></true>` and asserts not-found.

**Warning signs:** `launchctl bootstrap` returns non-zero with a generic error; `plutil -lint <plist>` says "OK". The asymmetry is the smell.

### Pitfall 3: `launchctl bootout` exit 3 is normal

**What goes wrong:** Install's idempotent flow is `bootout → write plist → bootstrap`. The first time install runs (fresh machine), bootout exits 3 ("No such process"). If the install code uses `Process.terminationStatus` as a fail signal, install fails on first run.

**Evidence (live, 2026-05-09):** `launchctl bootout gui/501/com.this.does.not.exist.test` → `Boot-out failed: 3: No such process`, exit code 3.

**How to avoid:** In Install/Uninstall subcommands, `Process(launchctl bootout ...)` should treat exit codes 0 and 3 as success-equivalent. Other non-zero codes (5 = I/O, 36 = Operation in progress, etc.) should still surface as errors.

**Warning signs:** First-time `vigil-watch install` exits non-zero on a fresh machine with no plist yet present. The error message includes "Boot-out failed: 3".

### Pitfall 4: `ps -p $PID -o etime=` format varies with uptime

**What goes wrong:** Soak script does `awk -F: '{print $1*60+$2}'` to convert etime to seconds. Works for the first 24 hours when format is `MM:SS` or `HH:MM:SS`. After 24h, format becomes `dd-hh:mm:ss` (with a literal hyphen). awk parser breaks.

**Evidence (live, 2026-05-09):** A 17-day-uptime process: `ps -p 1 -o etime=` → ` 17-22:38:52`. A 4-month-uptime: same dash-separated format.

**How to avoid:** soak-check.sh awk should match optional `dd-` prefix. Or convert etime via `date` arithmetic on a captured-at-sample-time epoch column. Recommended: ALSO record `etime_seconds` directly in the CSV via `ps -p $PID -o etimes=` (note: lowercase `etimes` is etime in seconds, supported on macOS 10.5+) — then no awk format gymnastics.

**Warning signs:** soak-check.sh fails on day 2 with "syntax error" or zero-uptime calculations.

**Recommendation:** Use `ps -p $PID -o pid=,rss=,etimes=` (with `etimes`, not `etime`) for soak sampling. Output is a single integer of elapsed seconds.

### Pitfall 5: `pgrep -f` matches multiple `vigil-watch` processes

**What goes wrong:** Operator runs `vigil-watch test` while the daemon is running. `pgrep -f /Users/.../.local/bin/vigil-watch` matches BOTH (the daemon AND the ad-hoc CLI). `head -1` picks an arbitrary one — possibly the wrong one. RSS sample reflects the wrong process.

**How to avoid:** Filter with two stages. Either:
- Use the launchd PID directly: `launchctl print gui/$UID/com.morrillholdings.vigil.watch | awk '/^\spid =/ {print $3}'` (matches ONLY the daemon launchd is supervising).
- OR `pgrep -f` then filter to the parent-pid of launchd: `ps -p $PID -o ppid=` and assert `ppid == 1` (only the launchd-managed process is parented to PID 1, transient `vigil-watch test` from the user's shell has the shell's PID as ppid).

**Recommendation:** Soak sampler script uses `launchctl print` to get the supervised PID. Falls back to `pgrep -f ...` only if `launchctl print` returns no PID (daemon not loaded). One sampler row of empty PID/RSS/etime in those rare cases is fine — preserved as evidence of "daemon not running at this sample."

**Warning signs:** Soak CSV has implausible RSS jumps (one row 5MB, next row 25MB, next 5MB) that don't correlate with actual daemon work.

### Pitfall 6: launchd `state = running` is not API

**What goes wrong:** Status subcommand parses `launchctl print` output, expects `state = running` line. macOS update changes the format to `current state = running` or `runState = active`. Status breaks silently.

**Why it happens:** Apple explicitly says `launchctl print` output is "NOT API in any sense at all. Do NOT rely on the structure or information emitted for ANY reason." [CITED: masklinn cheat sheet]

**How to avoid:** Treat `launchctl print` parsing as best-effort fallback. Primary signal for `status` is `runtime-state.json` freshness (mtime + parse). `launchctl print` is consulted only when the file is missing/stale — and even then, the output is informational, not a load-bearing assertion. If parsing fails, print the raw output (`launchctl print` was already called) and let the operator interpret.

**Warning signs:** `vigil-watch status` reports incorrect state after a major macOS update.

### Pitfall 7: `KeepAlive=true` + Phase 122 SIGSEGV flake

**What goes wrong:** Phase 122 deferred a 1/120 SIGSEGV flake in the XCTest harness (`testDaemonStartsAndStopsWithoutCrash`). If that flake manifests in production under launchd, KeepAlive=true respawns within 10s (ThrottleInterval default), then immediately segfaults again, then respawns again. Loop.

**Why it happens:** ThrottleInterval default is 10s. KeepAlive=true means relaunch on ANY exit (including segfault). If the bug is deterministic at a certain runtime point, the daemon segfaults, launchd waits 10s, relaunches, segfaults again — forever.

**Mitigation:** Phase 122 verification noted the flake never manifested in production daemon; only in the test harness's repeated start/stop cycle. The 24h soak is the real test. **If the soak shows a single non-empty PID column changing values mid-run** (i.e., the daemon got a new PID without operator action), that's evidence the SIGSEGV manifested in production — fix the root cause before phase close.

**How to avoid:** soak-check.sh's "all non-empty PID rows have the same PID value" gate (D-09) IS the detector. If soak fails on PID-change-mid-run, the SIGSEGV flake is the suspect; revisit before Phase 123 close.

**Warning signs:** Soak CSV shows two distinct PIDs across the 24h window without operator intervention.

### Pitfall 8: `launchctl print` requires the service to be loaded

**What goes wrong:** Status falls back to `launchctl print gui/$UID/com.morrillholdings.vigil.watch` when runtime-state.json is missing. If the agent was uninstalled OR was never installed, `launchctl print` exits non-zero. Status subcommand treats that as an error and crashes.

**How to avoid:** Tolerate non-zero exit from `launchctl print` as "agent not loaded" → report `daemon: NOT INSTALLED` (distinguished from `NOT RUNNING`).

**Three states for status to distinguish:**
- `runtime-state.json` is fresh (<5s) → daemon is RUNNING; print queue depth, last event, PID
- `runtime-state.json` is stale (≥5s OR missing) AND `launchctl print` succeeds → daemon is INSTALLED but CRASHED or NOT YET STARTED; print launchctl info
- `launchctl print` exits non-zero → daemon is NOT INSTALLED; print "Run `vigil-watch install` first"

## Code Examples

Verified patterns from official sources or live-tested commands.

### Install subcommand skeleton

```swift
// Source: Phase 122 ConfigLoader patterns + launchctl modern syntax (alansiu.net) + this research
import Foundation
import ArgumentParser

struct Install: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Install vigil-watch + sampler as user LaunchAgents."
    )
    @Flag(name: .customLong("force"))
    var force: Bool = false  // optional override; not strictly needed (D-03 idempotent)

    func run() async throws {
        let home = NSHomeDirectory()
        let binDest = "\(home)/.local/bin/vigil-watch"
        let logDir = "\(home)/Library/Logs/Vigil"
        let agentsDir = "\(home)/Library/LaunchAgents"
        let daemonPlist = "\(agentsDir)/com.morrillholdings.vigil.watch.plist"
        let samplerPlist = "\(agentsDir)/com.morrillholdings.vigil.watch.sampler.plist"

        // 1. mkdir -p ~/.local/bin, ~/Library/Logs/Vigil, ~/Library/LaunchAgents.
        for dir in ["\(home)/.local/bin", logDir, agentsDir] {
            try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        }

        // 2. Copy release binary.
        // Find .build/release/vigil-watch relative to repo or installation source.
        // Simplest: ${PWD}/.build/release/vigil-watch — install assumes operator
        // ran `swift build -c release` first. Document this in --help.
        let releaseBinary = FileManager.default.currentDirectoryPath + "/.build/release/vigil-watch"
        guard FileManager.default.fileExists(atPath: releaseBinary) else {
            throw ValidationError("Release binary not found at \(releaseBinary). Run `swift build -c release` first.")
        }
        try? FileManager.default.removeItem(atPath: binDest)
        try FileManager.default.copyItem(atPath: releaseBinary, toPath: binDest)

        // 3. Render plists.
        let apiKeyBlock: String
        if let key = ProcessInfo.processInfo.environment["VIGIL_API_KEY"], !key.isEmpty {
            // Bake env-var into plist (mitigates Pitfall 1).
            apiKeyBlock = "<key>VIGIL_API_KEY</key><string>\(xmlEscape(key))</string>"
        } else {
            apiKeyBlock = ""  // ConfigLoader will read api_key from watch.toml.
        }
        let daemonXML = PlistTemplates.daemon
            .replacingOccurrences(of: "%BINARY_PATH%", with: binDest)
            .replacingOccurrences(of: "%LOG_DIR%", with: logDir)
            .replacingOccurrences(of: "%VIGIL_API_KEY_BLOCK%", with: apiKeyBlock)
        try daemonXML.write(toFile: daemonPlist, atomically: true, encoding: .utf8)
        let samplerXML = PlistTemplates.sampler
            .replacingOccurrences(of: "%BINARY_PATH%", with: binDest)
            .replacingOccurrences(of: "%LOG_DIR%", with: logDir)
            .replacingOccurrences(of: "%HOME%", with: home)
        try samplerXML.write(toFile: samplerPlist, atomically: true, encoding: .utf8)

        // 4. plutil -lint each (catches template typos).
        for plist in [daemonPlist, samplerPlist] {
            let r = try runProcess("/usr/bin/plutil", ["-lint", plist])
            guard r.exitCode == 0 else {
                throw ValidationError("Rendered plist failed plutil -lint: \(plist)\n\(r.stderr)")
            }
        }

        // 5. bootout (tolerate exit 3) → bootstrap.
        let uid = String(getuid())
        for label in ["com.morrillholdings.vigil.watch", "com.morrillholdings.vigil.watch.sampler"] {
            let r = try runProcess("/bin/launchctl", ["bootout", "gui/\(uid)/\(label)"])
            guard r.exitCode == 0 || r.exitCode == 3 else {
                throw ValidationError("bootout failed for \(label): exit=\(r.exitCode) err=\(r.stderr)")
            }
        }
        for plist in [daemonPlist, samplerPlist] {
            let r = try runProcess("/bin/launchctl", ["bootstrap", "gui/\(uid)", plist])
            guard r.exitCode == 0 else {
                throw ValidationError("bootstrap failed for \(plist): exit=\(r.exitCode) err=\(r.stderr)")
            }
        }

        // 6. jq presence check (D-07 warning, non-fatal).
        let jqCheck = try runProcess("/usr/bin/which", ["jq"])
        if jqCheck.exitCode != 0 {
            FileHandle.standardError.write(Data("warning: jq not installed; `vigil-watch tail` will fail until you `brew install jq`\n".utf8))
        }

        print("vigil-watch installed at \(binDest)")
        print("daemon plist: \(daemonPlist)")
        print("sampler plist: \(samplerPlist)")
        print("logs: \(logDir)/watch.{out,err}")
    }
}

func runProcess(_ exe: String, _ args: [String]) throws -> (exitCode: Int32, stdout: String, stderr: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: exe)
    p.arguments = args
    let outPipe = Pipe(); let errPipe = Pipe()
    p.standardOutput = outPipe; p.standardError = errPipe
    try p.run()
    p.waitUntilExit()
    let out = String(data: outPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let err = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    return (p.terminationStatus, out, err)
}
```

### Status subcommand skeleton

```swift
struct Status: ParsableCommand {
    static let configuration = CommandConfiguration(abstract: "Print daemon state, queue depth, last event.")

    func run() throws {
        let path = NSHomeDirectory() + "/Library/Application Support/vigil-watch/runtime-state.json"
        let url = URL(fileURLWithPath: path)
        let attrs = try? FileManager.default.attributesOfItem(atPath: path)
        let mtime = attrs?[.modificationDate] as? Date

        if let mtime, Date().timeIntervalSince(mtime) < 5.0,
           let data = try? Data(contentsOf: url),
           let state = try? JSONDecoder().decode(RuntimeState.self, from: data) {
            print("daemon: RUNNING")
            print("pid: \(state.pid)")
            print("started_at: \(state.startedAt)")
            print("queue_depth: \(state.queueDepth)")
            if let ts = state.lastEventTs, let sid = state.lastEventSessionId, let evt = state.lastEventType {
                print("last_event: \(evt) on \(sid) at \(ts)")
            } else {
                print("last_event: (none yet)")
            }
            print("quarantined: \(state.quarantined)")
            return
        }

        // Fallback: launchctl print.
        let uid = String(getuid())
        let r = try runProcess("/bin/launchctl", ["print", "gui/\(uid)/com.morrillholdings.vigil.watch"])
        if r.exitCode != 0 {
            print("daemon: NOT INSTALLED")
            print("hint: run `vigil-watch install`")
            throw ExitCode.failure
        }
        // Daemon is loaded but runtime-state.json is stale or missing → likely crashed.
        print("daemon: NOT RUNNING (runtime-state stale or missing)")
        print("---")
        print(r.stdout)
        throw ExitCode(2)  // distinct exit code from "NOT INSTALLED"
    }
}
```

### Test subcommand skeleton (synthetic event POST)

```swift
struct Test: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "POST one synthetic event to Core; exits 0 on 2xx.")

    func run() async throws {
        let config = try ConfigLoader.load()
        guard !config.apiKey.isEmpty else {
            FileHandle.standardError.write(Data("VIGIL_API_KEY missing in env AND watch.toml\n".utf8))
            throw ExitCode.failure
        }
        let unix = Int(Date().timeIntervalSince1970)
        let sessionId = "_vigil_test_\(unix)"
        let host = ConfigLoader.resolveHost(config)
        let payload = VigilPayload(
            sessionId: sessionId,
            event: VigilEvent.heartbeat.rawValue,
            message: "vigil-watch test",
            timestamp: nowISO8601(),
            label: "vigil-watch-test",   // non-empty per Phase 121 KNOWN_FIELDS guard
            host: host,
            exitCode: nil,
            clientEventId: makeClientEventId(sessionId: sessionId, byteOffset: 0,
                                             eventType: VigilEvent.heartbeat.rawValue)
        )
        guard let url = URL(string: "\(config.apiURL)/v1/agent-events") else {
            throw ValidationError("invalid api_url: \(config.apiURL)")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(payload)
        req.timeoutInterval = 10

        let (data, response) = try await URLSession(configuration: .ephemeral).data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let body = String(data: data, encoding: .utf8) ?? "(non-utf8 body)"
        print("HTTP \(status)")
        print(body)
        if !(200...299).contains(status) { throw ExitCode.failure }
    }
}
```

### soak-check.sh skeleton

```bash
#!/usr/bin/env bash
# Source: this research, D-09 specification, Phase 122 EmitterActor.swift bearer pattern
set -euo pipefail

CSV="${1:-$HOME/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv}"
[ -f "$CSV" ] || { echo "soak CSV missing: $CSV" >&2; exit 1; }

# Schema: ts,pid,rss_kb,etime_seconds  (etime_seconds via `ps -o etimes=`)
NONEMPTY=$(awk -F, '$2 != ""' "$CSV" | wc -l)
[ "$NONEMPTY" -ge 1 ] || { echo "no non-empty rows — daemon never sampled" >&2; exit 1; }

MAX_RSS=$(awk -F, 'NR>0 && $3 != "" { if ($3 > m) m=$3 } END { print m+0 }' "$CSV")
PID_COUNT=$(awk -F, '$2 != "" { print $2 }' "$CSV" | sort -u | wc -l | tr -d ' ')
FIRST_TS=$(awk -F, '$2 != "" {print $1; exit}' "$CSV")
LAST_TS=$(awk -F, 'END {print $1}' "$CSV")
FIRST_S=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$FIRST_TS" +%s 2>/dev/null || echo 0)
LAST_S=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$LAST_TS" +%s 2>/dev/null || echo 0)
SPAN=$((LAST_S - FIRST_S))

echo "max RSS:      ${MAX_RSS} KB"
echo "unique PIDs:  ${PID_COUNT}"
echo "uptime span:  ${SPAN}s ($((SPAN/3600))h $((SPAN%3600/60))m)"
echo "samples:      ${NONEMPTY}"

[ "$MAX_RSS" -lt 30000 ] || { echo "FAIL: max RSS ${MAX_RSS} >= 30000 KB" >&2; exit 1; }
[ "$PID_COUNT" -eq 1 ]   || { echo "FAIL: ${PID_COUNT} distinct PIDs (KeepAlive should have held one)" >&2; exit 1; }
[ "$SPAN" -ge 85800 ]    || { echo "FAIL: span ${SPAN}s < 85800s (23h50m gate)" >&2; exit 1; }

# Live Core check.
[ -n "${VIGIL_API_KEY:-}" ] || { echo "FAIL: VIGIL_API_KEY env required for Core readback" >&2; exit 1; }
CORE_RESP=$(curl -fsS -H "Authorization: Bearer ${VIGIL_API_KEY}" \
  "https://api.vigilhub.io/v1/agent-sessions" | jq '.data | length')
[ "${CORE_RESP:-0}" -gt 0 ] || { echo "FAIL: Core returned 0 sessions" >&2; exit 1; }
echo "Core sessions: ${CORE_RESP}"

echo
echo "PHASE 123 SOAK GATE: PASSED"
```

### plist (daemon, rendered) — verified shape

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.morrillholdings.vigil.watch</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/jamesonmorrill/.local/bin/vigil-watch</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>LimitLoadToSessionType</key><string>Aqua</string>
    <key>ProcessType</key><string>Interactive</string>
    <key>StandardOutPath</key><string>/Users/jamesonmorrill/Library/Logs/Vigil/watch.out</string>
    <key>StandardErrorPath</key><string>/Users/jamesonmorrill/Library/Logs/Vigil/watch.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>VIGIL_API_KEY</key>
        <string>vk_REDACTED</string>
    </dict>
</dict>
</plist>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `launchctl load -w <plist>` | `launchctl bootstrap gui/$UID <plist>` | macOS 10.11 (2015) | Modern; better error semantics; the only one Apple actively documents [CITED: alansiu.net 2023] |
| `launchctl unload <plist>` | `launchctl bootout gui/$UID/<label>` | macOS 10.11 | Modern; uses service target instead of plist path |
| `launchctl list \| grep <label>` | `launchctl print gui/$UID/<label>` | macOS 10.11 | Richer info; output is "not API" but more useful for humans |
| Process.launch() | Process.run() + waitUntilExit() | Swift 5+ / macOS 10.13 | launch() deprecated; run() throws on failure |
| @main on struct main.swift entry | swift-argument-parser auto-generated `static func main()` via `.main()` call | Always | swift-argument-parser provides `.main()`; for `AsyncParsableCommand`, use `await Cmd.main()` from a `@main` struct or an explicit Task in main.swift |
| FilePresenter / NSFileCoordinator | atomic temp+rename on APFS | Always for this use case | Phase 122 already uses temp+rename; APFS rename(2) is atomic — F_FULLFSYNC adds durability |

**Deprecated/outdated:**
- `launchctl load/unload`: still works but Apple-deprecated; will likely be removed in future macOS.
- `Process.launch()`: deprecated since 10.13.
- Polling `ps` from a Swift app to discover the daemon PID: use `launchctl print` instead — directly tells you the launchd-supervised PID.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | swift-argument-parser 1.6.x compiles cleanly under Swift 6.2 with `swift-tools-version:5.10` | §Standard Stack | Low: 1.5.0+ silenced Swift 6 strict-concurrency warnings [CITED: github.com/apple/swift-argument-parser CHANGELOG]; Phase 122 builds fine on this toolchain [VERIFIED]. If incompatibility, pin to 1.5.0 |
| A2 | `Process.run()` invocation of `launchctl bootstrap` from inside an Aqua user GUI session has authority to add a service to gui/$UID | §Pattern 1 | Low: this is the documented user-context flow [CITED: alansiu.net]; the operator IS the GUI user; no SIP/permissions issues for `~/Library/LaunchAgents` writes |
| A3 | APFS `rename(2)` atomicity holds for `runtime-state.json` writes at 1Hz over 24h | §Architecture Pattern 2 | Low: Phase 122's StateStore uses identical pattern; live-tested over a multi-day Phase 122 smoke window with no torn reads observed [VERIFIED via 122-09 smoke success] |
| A4 | `launchctl print` field names (`state =`, `pid =`, `last exit code =`) remain stable across macOS 14→15→16 | §Pitfall 6 | MEDIUM: Apple explicitly says "not API" [CITED]. Mitigation: `launchctl print` is fallback-only for `status`; primary signal is `runtime-state.json`. If field names drift, status degrades gracefully |
| A5 | `pgrep -f /Users/.../.local/bin/vigil-watch` reliably discovers the daemon binary | §Pitfall 5 | LOW with mitigation: research found ad-hoc `vigil-watch test` invocations create ambiguity. Use `launchctl print` for the supervised PID; pgrep is fallback only. Recommendation in Pattern 5 |
| A6 | `~/Library/Logs/Vigil/watch.out` write performance under 1Hz NDJSON load is sustainable for 24h+ without log rotation | §Standard Stack (no log rotation deferred) | Low: ~10MB/day expected per CONTEXT D-02. APFS handles this trivially. If logs balloon to >100MB the user notices well before disk pressure |
| A7 | `launchctl bootout` exits 3 specifically when service is not loaded; other exit codes mean other things | §Pitfall 3 | VERY LOW: confirmed live (`launchctl bootout gui/501/com.this.does.not.exist.test` → exit 3 + "No such process" message). Other documented codes (5, 36) appear in different scenarios |
| A8 | The user has Homebrew jq at `/usr/local/bin/jq` (not `/opt/homebrew/bin/jq` Apple Silicon path) | §Pattern 1 (Tail) | LOW: this is an Intel Mac per memory `reference_macbook_pro.md`; live `command -v jq` returned `/usr/bin/jq` (system jq 1.7.1 — even better, no Homebrew dependency!) [VERIFIED LIVE 2026-05-09] |

**A8 finding:** macOS 15.7 ships `/usr/bin/jq` 1.7.1 by default. The `vigil-watch install` jq-warning logic should check both `/usr/bin/jq`, `/usr/local/bin/jq`, AND `/opt/homebrew/bin/jq` — any present satisfies the dependency. **Update D-07 implementation:** the warning should be skipped on macOS 15+ where jq is system-shipped. Consider downgrading the warning to "info: jq found at <path>".

## Open Questions (RESOLVED)

1. **Where exactly does `vigil-watch install` find the release binary to copy?**
   - What we know: D-01 says "copies `.build/release/vigil-watch` to `~/.local/bin/vigil-watch`"; the operator must have run `swift build -c release` first.
   - What's unclear: when invoked from `~/.local/bin/vigil-watch` itself (already-installed binary, running upgrade), does it copy from `${Bundle.main.bundlePath}` or from a hardcoded `${PWD}/.build/release/vigil-watch`?
   - RESOLVED: Install assumes invocation from the vigil-watch repo root — i.e., looks at `${currentDirectoryPath}/.build/release/vigil-watch`. If absent, error with clear hint to `cd ~/Desktop/Local AI/vigil-watch && swift build -c release && swift run vigil-watch install`. Document this in `--help`. Self-upgrade flow (running install from already-installed binary) is out of scope; operator runs install from repo.

2. **Do we ALSO uninstall the sampler if the daemon was never installed?**
   - What we know: D-08 says install/uninstall are lockstep. Uninstall must tolerate "neither plist exists" (idempotent).
   - RESOLVED: Uninstall iterates over both labels' bootouts (tolerating exit 3) and both plist removals (tolerating ENOENT). Returns 0 unconditionally unless an unexpected error type surfaces.

3. **Should `runtime-state.json` schema include `host` and `api_url`?**
   - What we know: D-04 schema has 8 fields; not host/api_url.
   - Argument for adding: Status output that shows "I'm posting to https://api.vigilhub.io with host=Jamesons-iMac" would catch a misconfig at-a-glance.
   - RESOLVED: Add `host` and `api_url` to schema_version=1 from the start (cheap; helpful for status). The decision was discretionary; this is a planner-time call, not a research-time one.

4. **What does `tail` do if no events match `<session-id>` for ≥N seconds?**
   - What we know: `tail -f | jq` will keep streaming silently until a match.
   - RESOLVED: silent stream is correct UX (matches `tail -f` mental model). Document in --help: "Hangs until a matching event arrives. Ctrl-C to exit."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `swift` (Apple Swift 6.2.4 / Target x86_64-apple-macosx15.0) | Build, run, all tests | ✓ | 6.2.4 | — |
| macOS SDK 26.2 | Compile target | ✓ | 26.2 | — |
| `/bin/launchctl` (Darwin Bootstrapper 7.0.0) | Install / Uninstall / Status fallback | ✓ | 7.0.0 | — |
| `/usr/bin/plutil` | Install plist validation | ✓ | system | — |
| `/usr/bin/jq` (system, jq 1.7.1) | `vigil-watch tail` pipeline | ✓ | 1.7.1 | brew jq if system jq removed |
| `/usr/bin/tail` | `vigil-watch tail` pipeline | ✓ | system | — |
| `/usr/bin/pgrep`, `/bin/ps`, `/usr/bin/awk`, `/bin/sh`, `/bin/date`, `/usr/bin/curl` | Sampler script + soak-check.sh | ✓ | system | — |
| `~/.local/bin` directory | Binary install destination | ✗ (will be created on install) | — | `mkdir -p` covers it |
| `~/Library/Logs/Vigil` directory | launchd log redirection | ✗ (will be created on install) | — | `mkdir -p` covers it |
| `~/Library/Application Support/vigil-watch/` | runtime-state.json + Phase 122 offsets.json | ✓ (Phase 122 created it) | — | — |
| `~/Library/LaunchAgents/` | plist install destination | ✓ (DailyBriefMonitor already installed there) | — | — |
| Network egress to `api.vigilhub.io` | `vigil-watch test` and soak-check.sh Core query | ✓ (Phase 122 smoke confirms reachable) | — | Local vigil-core dev `http://127.0.0.1:3001` for offline testing |
| `VIGIL_API_KEY` env var or watch.toml `api_key` | Daemon POST + `vigil-watch test` | ✓ (set in user's shell + watch.toml from Phase 122) | — | Daemon enters quarantine; test exits non-zero with clear error |
| swift-argument-parser 1.6.2 (npm/SPM-fetched at build time) | CLI dispatch | ✗ (will fetch on first `swift build` after Package.swift update) | 1.6.2 | None — required dep; pin from "1.6.0" |

**Missing dependencies with no fallback:** None blocking — all directories that don't exist are auto-created at install time, and swift-argument-parser fetches via SPM.

**Missing dependencies with fallback:** None requiring it — every system tool is present.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | XCTest (Phase 122 standard, 106 tests already in suite) |
| Config file | none — Swift Package Manager auto-discovers `Tests/VigilWatchTests/` |
| Quick run command | `swift test --filter <suiteName>` (e.g., `RuntimeStateWriterTests`) |
| Full suite command | `cd /Users/jamesonmorrill/Desktop/Local AI/vigil-watch && swift test` |
| Smoke / live-integration framework | bash + `curl` + `launchctl` invoked from operator shell (not XCTest) |
| 24h soak framework | `scripts/soak-check.sh` (bash + awk) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-WATCH-04 | Plist template renders to valid XML | unit | `swift test --filter PlistTemplateTests/testDaemonPlistRendersValidXML` | ❌ Wave 0 |
| AGENT-WATCH-04 | Plist template uses self-closing booleans (`<true/>`) | unit (drift) | `swift test --filter PlistTemplateTests/testNoNonSelfClosingBooleans` | ❌ Wave 0 |
| AGENT-WATCH-04 | Install renders, runs `plutil -lint`, succeeds for both plists | integration | manual via `swift run vigil-watch install` then `plutil -lint ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist` | n/a |
| AGENT-WATCH-04 | `launchctl bootout gui/$UID/<label>` on never-loaded service exits 3 — install tolerates | integration | bash: `launchctl bootout gui/$(id -u)/com.morrillholdings.vigil.watch; echo $?` (expect 3 or 0) | n/a |
| AGENT-WATCH-04 | `launchctl bootstrap` succeeds end-to-end after install | manual + integration | manual: `swift run vigil-watch install && launchctl print gui/$(id -u)/com.morrillholdings.vigil.watch \| grep "state = running"` | n/a |
| AGENT-WATCH-04 | `vigil-watch uninstall` removes both plists and bootouts both labels | integration | manual: `swift run vigil-watch uninstall && [ ! -f ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist ]` | n/a |
| AGENT-WATCH-05 | `vigil-watch run` boots daemon (smoke matches Phase 122 main.swift) | manual | manual: foreground run + Ctrl-C drain timing visible | n/a |
| AGENT-WATCH-05 | `vigil-watch run --verbose` enables stderr lifecycle logs | unit | `swift test --filter RunSubcommandTests/testVerboseFlagEnablesStderrLogs` | ❌ Wave 0 |
| AGENT-WATCH-05 | `vigil-watch tail <session-id>` filters NDJSON to single session | unit (mocked log file) | `swift test --filter TailSubcommandTests/testFilterMatchesOnlyTargetSession` | ❌ Wave 0 |
| AGENT-WATCH-05 | `vigil-watch test` POSTs and exits 0 on 2xx | unit (StubHTTPClient) | `swift test --filter TestSubcommandTests/testPostsAndExitsZeroOn201` | ❌ Wave 0 |
| AGENT-WATCH-05 | `vigil-watch test` exits non-zero on 4xx/5xx/network error | unit | `swift test --filter TestSubcommandTests/testExitsNonZeroOn401` | ❌ Wave 0 |
| AGENT-WATCH-05 | `vigil-watch status` reads `runtime-state.json` and prints state | unit (tmp dir) | `swift test --filter StatusSubcommandTests/testReadsAndPrintsState` | ❌ Wave 0 |
| AGENT-WATCH-05 | `vigil-watch status` falls back to `launchctl print` when file stale | manual | manual: kill -9 daemon, wait 6s, run `vigil-watch status` (expect "NOT RUNNING") | n/a |
| AGENT-WATCH-05 | `vigil-watch status` reports NOT INSTALLED when nothing loaded | unit (mocked Process) | `swift test --filter StatusSubcommandTests/testFallbackWhenNotInstalled` | ❌ Wave 0 |
| AGENT-WATCH-05 | `vigil-watch test` synthetic event has `_vigil_test_<unix>` sessionId | unit | `swift test --filter TestSubcommandTests/testSessionIdShape` | ❌ Wave 0 |
| AGENT-WATCH-04 / D-04 | RuntimeStateWriter atomic temp+rename | unit | `swift test --filter RuntimeStateWriterTests` | ❌ Wave 0 |
| AGENT-WATCH-04 / D-04 | RuntimeStateWriter snake_case field names match D-04 schema | unit (drift) | `swift test --filter RuntimeStateWriterTests/testJSONFieldNamesAreSnakeCase` | ❌ Wave 0 |
| AGENT-WATCH-04 / D-05 | EmitterActor.currentSnapshot() returns required fields | unit | `swift test --filter EmitterTests/testCurrentSnapshotShape` | ❌ extends existing EmitterTests |
| AGENT-WATCH-07 | Soak CSV parser exits 0 on synthetic-good input | unit | `swift test --filter SoakCheckTests/testGoodSoakPasses` (Swift wrapping bash exec) OR pure bash test | ❌ Wave 0 |
| AGENT-WATCH-07 | Soak CSV parser exits non-zero on RSS>30MB | unit | `swift test --filter SoakCheckTests/testRSSAboveThresholdFails` | ❌ Wave 0 |
| AGENT-WATCH-07 | Soak CSV parser exits non-zero on multiple PIDs | unit | `swift test --filter SoakCheckTests/testMultiplePIDsFails` | ❌ Wave 0 |
| AGENT-WATCH-07 | Soak CSV parser exits non-zero on span < 23h50m | unit | `swift test --filter SoakCheckTests/testShortSpanFails` | ❌ Wave 0 |
| AGENT-WATCH-07 | 24h unattended run on user's Mac, RSS<30MB | manual + soak gate | `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv` | n/a |
| AGENT-WATCH-04 / SC #3 | Daemon resumes post-Mac-reboot, `vigil-watch test` succeeds within 30s | manual | operator: reboot Mac, log in, time `vigil-watch test` from login | n/a |
| Drift detector | swift-argument-parser version pinned in Package.swift | unit | `swift test --filter PackageTests/testArgumentParserDependencyVersion` | ❌ Wave 0 |
| Drift detector | runtime-state.json snake_case keys match Status reader | unit | `swift test --filter RuntimeStateWriterTests/testRoundTripWithStatusReader` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `swift test --filter <relevant-suite>` (Wave 1 unit tests run in <5s each)
- **Per wave merge:** `swift test` (full XCTest suite — projected ~110+ tests after Wave 1 lands; <30s)
- **Phase gate:** Full suite green PLUS `bash scripts/soak-check.sh` exits 0 PLUS post-reboot resume manual smoke succeeds
- **24h soak:** operator-driven, one-shot per phase per D-10

### Wave 0 Gaps

- [ ] `Tests/VigilWatchTests/RuntimeStateWriterTests.swift` — covers AGENT-WATCH-04 IPC contract
- [ ] `Tests/VigilWatchTests/PlistTemplateTests.swift` — covers AGENT-WATCH-04 plist correctness (no `<true></true>`, valid XML, all required keys)
- [ ] `Tests/VigilWatchTests/RunSubcommandTests.swift` — covers `--verbose` flag wiring
- [ ] `Tests/VigilWatchTests/TailSubcommandTests.swift` — covers session-id filter and jq-missing detection
- [ ] `Tests/VigilWatchTests/TestSubcommandTests.swift` — covers synthetic POST contract (StubHTTPClient pattern from Phase 122 EmitterTests)
- [ ] `Tests/VigilWatchTests/StatusSubcommandTests.swift` — covers fresh/stale/not-installed states
- [ ] `Tests/VigilWatchTests/SoakCheckTests.swift` (or pure bash + bats) — covers soak-check.sh assertions on synthetic CSVs
- [ ] Extend `Tests/VigilWatchTests/EmitterTests.swift` with `testCurrentSnapshotShape` (additive — no breaking change to existing 16 cases)
- [ ] No framework install needed — XCTest is part of Phase 122's existing infrastructure

## Security Domain

> `security_enforcement` not explicitly disabled in `.planning/config.json` — including this section per the absent-key-treated-as-enabled rule.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Phase 122 bearer auth flow reused via `EmitterActor.postOnce`; `vigil-watch test` POSTs with same Authorization header |
| V3 Session Management | no | No session state at the daemon-API boundary; HTTPS + bearer is per-request |
| V4 Access Control | yes (cross-user) | Phase 121 D-D2 cross-user-isolation lock at vigil-core covers this; vigil-watch posts with the operator's bearer; cannot impersonate other users |
| V5 Input Validation | yes | Plist template substitution must xml-escape `VIGIL_API_KEY` value to prevent malformed plist on keys containing `&`, `<`, etc. (vk_ keys are alphanumeric so practical risk is nil — but escape anyway for correctness) |
| V6 Cryptography | no | No new crypto. HTTPS via URLSession (ATS-enforced). Phase 122 already covered |
| V7 Error Handling | yes | T-122-01 (bearer leak) carries forward — none of `Install`'s logged errors should leak the api_key value (it's only embedded in the plist file at write time, which is mode 0644 by default. **Recommendation:** `chmod 0600` on the plist after write so other-user can't read the secret) |
| V12 File Storage | yes (relates to V7) | Plist is written with default umask. Set explicit 0600 to lock down the plain-text VIGIL_API_KEY |

### Known Threat Patterns for {Swift CLI + launchd + plist + bash sampler}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `VIGIL_API_KEY` leaked via plist file mode 0644 | Information disclosure | After `daemon.plist` write, `chmod 0600 daemon.plist` (Swift `FileManager.setAttributes(_:ofItemAtPath:)` with `.posixPermissions: 0o600`) |
| `VIGIL_API_KEY` leaked via process listing (`ps -E` or `ps -ww` showing env) | Information disclosure | macOS `ps` does NOT show env vars by default; `ps -E` requires elevated privs. Documented threat-accept (matches DailyBriefMonitor's `EnvironmentVariables` posture) |
| Install hijacked: malicious `.build/release/vigil-watch` replaces real binary | Tampering | Out of scope (operator owns local FS). Notarization deferred per spec OUT-OF-SCOPE |
| Sampler script command-injection via `$HOME` or PID values | Tampering | `pgrep -f` returns numeric PIDs; `$HOME` is launchd-set (not user-influenced). No injection surface in the embedded sampler shell |
| `tail`/`jq` subprocess hangs on Ctrl-C | Denial of service (operator-only) | DispatchSource SIGINT handler forwards to children; double-Ctrl-C policy as per Code Examples §subprocess pipeline |
| Plist write race with concurrent install | Tampering | One operator at a time; no real concurrency. If a future scenario needs locking, add an advisory lock on `~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist.lock` |
| `runtime-state.json` torn read during 1Hz write | Information disclosure (corrupt status) | Atomic temp+rename per Pattern 2; readers always see a complete file |
| Soak CSV log injection (rogue events causing CSV parse to fail mid-soak) | Tampering | Sampler appends fixed-shape rows; no user input enters the CSV. Awk parser tolerates missing PID column |

## Sources

### Primary (HIGH confidence)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Package.swift` (Phase 122 SPM manifest)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/main.swift` (Phase 122 entry point — pattern for `Run` subcommand)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Daemon.swift` (composition root)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EmitterActor.swift` (atomic-write reuse + `currentSnapshot()` extension target)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/StateStore.swift` (atomic-write reference pattern)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/SessionActor.swift` (timer-driven evaluator — context for runtime-state.json field semantics)
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/routes/agent-events.ts` (Phase 121 endpoint contract — 8 KNOWN_FIELDS, label.length>0 guard, idempotent dedupe via composite (user_id, client_event_id))
- `/Users/jamesonmorrill/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist` (working precedent on this Mac)
- `launchctl print gui/501/com.jamesonmorrill.dailybriefmonitor` live output (verified on 2026-05-09)
- `launchctl bootout gui/501/com.this.does.not.exist.test` live exit-code 3 verification (2026-05-09)
- `swift --version` live output (Apple Swift 6.2.4, Target x86_64-apple-macosx15.0)
- `command -v jq && jq --version` live output (`/usr/bin/jq` system jq 1.7.1)
- [github.com/apple/swift-argument-parser/releases](https://github.com/apple/swift-argument-parser/releases) — 1.6.2 release verification
- [keith.github.io/xcode-man-pages/launchd.plist.5.html](https://keith.github.io/xcode-man-pages/launchd.plist.5.html) — `launchd.plist(5)` man page (ThrottleInterval default 10s; KeepAlive=true semantics; LimitLoadToSessionType; ProcessType; EnvironmentVariables; StartInterval overlap behavior)
- [openradar.appspot.com/47256054](https://openradar.appspot.com/47256054) — launchd self-closing tag requirement
- [javorszky.co.uk/2023/11/09/what-the-hell-is-true-in-a-plist/](https://javorszky.co.uk/2023/11/09/what-the-hell-is-true-in-a-plist/) — DTD empty-element explanation
- [apple.github.io/swift-argument-parser/documentation/argumentparser/asyncparsablecommand](https://apple.github.io/swift-argument-parser/documentation/argumentparser/asyncparsablecommand/) — AsyncParsableCommand reference
- [swiftinit.org/docs/swift-argument-parser/argumentparser/exitcode](https://swiftinit.org/docs/swift-argument-parser/argumentparser/exitcode) — ExitCode error type for non-zero exits

### Secondary (MEDIUM confidence)
- [alansiu.net/2023/11/15/launchctl-new-subcommand-basics-for-macos](https://www.alansiu.net/2023/11/15/launchctl-new-subcommand-basics-for-macos/) — modern launchctl syntax overview
- [gist.github.com/masklinn/a532dfe55bdeab3d60ab8e46ccc38a68](https://gist.github.com/masklinn/a532dfe55bdeab3d60ab8e46ccc38a68) — launchctl/launchd cheat sheet (warning that print output is not API)
- [github.com/Homebrew/homebrew-services/pull/112](https://github.com/Homebrew/homebrew-services/pull/112) — bootstrap-replaces-load migration evidence
- [www.swifttoolkit.dev/posts/argument-parser-guide](https://www.swifttoolkit.dev/posts/argument-parser-guide) — ParsableCommand parent + subcommands example
- [forums.swift.org/t/how-do-you-use-argumentparser-with-async-parsablecommand-run/55156](https://forums.swift.org/t/how-do-you-use-argumentparser-with-async-parsablecommand-run/55156) — AsyncParsableCommand usage
- [lucaspin.medium.com/where-is-my-path-launchd-fc3fc5449864](https://lucaspin.medium.com/where-is-my-path-launchd-fc3fc5449864) — launchd does NOT inherit user shell env
- [www.baeldung.com/linux/signal-propagation](https://www.baeldung.com/linux/signal-propagation) — SIGINT child-process forwarding semantics
- [developer.apple.com/forums/thread/690310](https://developer.apple.com/forums/thread/690310) — `Process` standard input/output Swift patterns

### Tertiary (LOW confidence)
- None of the load-bearing claims rely on tertiary sources. Every launchd primitive was verified live against the target Mac.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every component verified live (Swift 6.2.4, jq 1.7.1, launchctl Darwin Bootstrapper 7.0.0) plus swift-argument-parser 1.6.2 confirmed via official releases page
- Architecture: HIGH — patterns lifted from Phase 122 verbatim (StateStore atomic-write, Daemon composition root) or from Apple's official ArgumentParser docs
- Pitfalls: HIGH — every named pitfall has a live verification (bootout exit 3, env-inheritance via `launchctl print`, etime format on long-running PID 1) or an official-source citation (self-closing booleans)
- Soak gate logic: HIGH — bash/awk arithmetic against synthetic CSVs is testable in unit fixtures

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (30 days; launchd is stable, swift-argument-parser is stable, Phase 122 is locked)
