# Phase 123: vigil-watch shell — launchd integration + CLI surface + 24h soak — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 17 (10 to CREATE, 5 to MODIFY, 2 reference-only)
**Analogs found:** 17 / 17 (100% coverage — Phase 123 is glue, every primitive has prior art)

> All paths are absolute. Code being modified lives in **`/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/`** (NOT the dailybrief repo, which holds planning only).

---

## File Classification

### To CREATE

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `Sources/VigilWatch/RuntimeStateWriter.swift` | actor (library) | atomic file-I/O, write-only on 1Hz tick | `Sources/VigilWatch/StateStore.swift` | exact (same role, same data flow, same atomicity primitive) |
| `Sources/vigil-watch/Commands/Run.swift` | CLI subcommand (AsyncParsableCommand) | composition-root invocation + RunLoop block | `Sources/vigil-watch/main.swift` | exact (same body, just relocated under subcommand) |
| `Sources/vigil-watch/Commands/Tail.swift` | CLI subcommand (ParsableCommand) | subprocess pipeline (Process → Pipe → Process) streaming stdin/stdout | `Sources/VigilWatch/SignalHandling.swift` (DispatchSource SIGINT) + Pattern 4 in RESEARCH.md | role-match (no in-repo Process pipeline analog yet) |
| `Sources/vigil-watch/Commands/Test.swift` | CLI subcommand (AsyncParsableCommand) | one-shot HTTPS POST request-response | `Sources/VigilWatch/EmitterActor.swift` (`postOnce`, `DefaultHTTPClient`) | exact (same URLSession + Authorization header + JSONEncoder pattern) |
| `Sources/vigil-watch/Commands/Install.swift` | CLI subcommand (AsyncParsableCommand) | shell-out + file-template-render + idempotent state mutation | `Sources/VigilWatch/Config.swift` (ConfigLoader.load — mkdir-then-write-defaults) + RESEARCH.md Code Examples §Install skeleton | role-match (no in-repo subprocess-shellout analog; ConfigLoader covers the file-template half) |
| `Sources/vigil-watch/Commands/Uninstall.swift` | CLI subcommand (AsyncParsableCommand) | shell-out + idempotent file deletion | `Install.swift` (mirror image; same `runProcess`, same exit-3-tolerance) | role-match (mirrors Install pattern) |
| `Sources/vigil-watch/Commands/Status.swift` | CLI subcommand (ParsableCommand) | atomic file-read + freshness check + shell-out fallback | `Sources/VigilWatch/StateStore.swift` (file mtime + JSONDecoder roundtrip) | role-match (read-side mirror of RuntimeStateWriter; same JSON schema) |
| `Sources/vigil-watch/Commands/Plists.swift` | template constants (struct with static `let`) | static string templates with `%PLACEHOLDER%` substitution | `Sources/VigilWatch/Config.swift` (`ConfigLoader.defaultTOMLBody` multi-line literal) | exact (same multi-line-string template idiom) |
| `scripts/soak-check.sh` | bash assertion script | batch CSV parse + awk math + curl readback | RESEARCH.md Code Examples §soak-check.sh | no in-repo analog (first bash script in the repo) |
| `Tests/VigilWatchTests/RuntimeStateWriterTests.swift` | XCTest suite | tmpdir setup + atomic write/read roundtrip + schema assertions | `Tests/VigilWatchTests/StateStoreTests.swift` | exact (identical role + data flow; lifts setUp/tearDown verbatim) |
| `Tests/VigilWatchTests/PlistTemplateTests.swift` | XCTest suite | string-render + regex assertions + plutil shell-out | `Tests/VigilWatchTests/StateStoreTests.swift` (raw-content assertions) + `DriftDetectorTests.swift` (regex parse + drift assertions) | role-match (composite of two test analogs) |
| `Tests/VigilWatchTests/RunSubcommandTests.swift` | XCTest suite | parser-flag wiring assertion via `parse([...])` | `Tests/VigilWatchTests/PackageScaffoldTests.swift` (sentinel) + RESEARCH.md §Validation Architecture (test rows 977–987) | role-match (no existing CLI parser test; ArgumentParser exposes `.parse()` for unit tests) |
| `Tests/VigilWatchTests/TailSubcommandTests.swift` | XCTest suite | mocked log-file fixture + jq-presence-check + Process invocation | `Tests/VigilWatchTests/StateStoreTests.swift` (tmpdir fixture pattern) | role-match (tmpdir fixture lifted; subprocess assertion novel) |
| `Tests/VigilWatchTests/TestSubcommandTests.swift` | XCTest suite | StubHTTPClient injection + status-code branching + session-id shape assertion | `Tests/VigilWatchTests/EmitterTests.swift` | exact (StubHTTPClient pattern lifted verbatim — same `script:`, `received:`, status branches) |
| `Tests/VigilWatchTests/StatusSubcommandTests.swift` | XCTest suite | tmpdir fixture for runtime-state.json + 3-state assertions | `Tests/VigilWatchTests/StateStoreTests.swift` (tmpdir + JSON-write fixture) | role-match (read-side mirror of RuntimeStateWriterTests) |
| `Tests/VigilWatchTests/SoakCheckTests.swift` | XCTest suite (Process wraps bash) | synthetic CSV fixtures + bash exec + exit-code assertions | `Tests/VigilWatchTests/DriftDetectorTests.swift` (XCTSkip-when-missing pattern) + RESEARCH.md §Validation Architecture rows 988–991 | role-match (Process-wraps-external-tool pattern from DriftDetectorTests) |
| `Tests/VigilWatchTests/PackageTests.swift` | XCTest suite (drift detector) | regex-grep Package.swift + version-pin assertion | `Tests/VigilWatchTests/DriftDetectorTests.swift` | exact (drift-detector role; same regex-against-source-file pattern) |

### To MODIFY

| Modified File | Role | Data Flow | Reference Pattern | Match Quality |
|---------------|------|-----------|-------------------|---------------|
| `Package.swift` | SPM manifest | static dependency declaration | RESEARCH.md §Standard Stack lines 137–151 | exact (single dependency added; targets section gets `.product(name: "ArgumentParser", ...)`) |
| `Sources/vigil-watch/main.swift` | executable entry point | `@main` dispatcher → `await VigilWatchCLI.main()` | Current `main.swift` body (existing 25-line composition-root scaffold) | exact (body relocates verbatim into `Run.swift`; new main.swift is ~5 lines) |
| `Sources/VigilWatch/Daemon.swift` | composition root | 1Hz tick — additive single-line write | Itself, lines 149–159 (existing evaluationTask Task + while loop) | exact (one-line additive insertion at end of loop body) |
| `Sources/VigilWatch/EmitterActor.swift` | actor | accessor extension — read-only `currentSnapshot()` | Itself, lines 140–141 (existing `queueDepth()` + `isQuarantined()` accessors) | exact (same idiom: actor public func returning value) |
| `Tests/VigilWatchTests/EmitterTests.swift` | XCTest suite | additive test case extension | Itself (existing 16 cases) | exact (one new `func testCurrentSnapshotShape()` appended) |

### Reference-only (read but NOT modified)

| File | Purpose |
|------|---------|
| `~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist` | Working precedent for user launchd agent on this Mac. Mirror most of it; **NOT** the `KeepAlive=<dict>` form (Phase 123 ROADMAP SC #1 demands `KeepAlive=true` boolean) |
| `Sources/VigilWatch/SignalHandling.swift` | DispatchSource SIGINT pattern for Tail subcommand child-process forwarding |

---

## Pattern Assignments

### `Sources/VigilWatch/RuntimeStateWriter.swift` (actor, atomic file-I/O)

**Analog:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/StateStore.swift`
**Why:** RuntimeStateWriter and StateStore are siblings — both single-owner actors persisting JSON via temp+F_FULLFSYNC+rename. RuntimeStateWriter is StateStore's simpler twin (no GC, no schema-mismatch error, no in-memory dict — just write).

**Imports + Codable struct pattern** (StateStore.swift:1, 16–39):
```swift
import Foundation

public struct StateFile: Codable, Sendable {
    public var schemaVersion: Int
    public var offsets: [String: UInt64]
    public var milestonesEmitted: [String: [MilestoneRecord]]

    public enum CodingKeys: String, CodingKey {
        case schemaVersion   = "schema_version"
        case offsets
        case milestonesEmitted = "milestones_emitted"
    }
    // ...
}
```
**Apply to RuntimeStateWriter:** Define `public struct RuntimeState: Codable, Sendable` with explicit `CodingKeys` for snake_case field names (`schema_version`, `started_at`, `queue_depth`, `last_event_ts`, `last_event_session_id`, `last_event_type`, `quarantined`). Match D-04 schema in CONTEXT.md lines 99–108.

**Default-path lazy static** (StateStore.swift:71–73):
```swift
public static let defaultStatePath: String = {
    NSHomeDirectory() + "/Library/Application Support/vigil-watch/offsets.json"
}()
```
**Apply:** Same idiom; path is `NSHomeDirectory() + "/Library/Application Support/vigil-watch/runtime-state.json"`. Same parent dir (already created by Phase 122's StateStore on first daemon start).

**Atomic save core pattern** (StateStore.swift:211–252) — **lift verbatim**:
```swift
private func atomicSaveLocked() throws {
    let dir = path.deletingLastPathComponent()
    let tmp = dir.appendingPathComponent(path.lastPathComponent + ".tmp")

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

    let data: Data
    do { data = try encoder.encode(state) }
    catch { throw StateStoreError.writeFailed("encode: \(error)") }

    do { try data.write(to: tmp) }
    catch { throw StateStoreError.writeFailed("write temp: \(error)") }

    // F_FULLFSYNC: macOS-specific stronger fsync. Error intentionally ignored.
    let fd = open(tmp.path, O_RDONLY)
    if fd != -1 { _ = fcntl(fd, F_FULLFSYNC); close(fd) }

    do {
        if FileManager.default.fileExists(atPath: path.path) {
            try? FileManager.default.removeItem(at: path)
        }
        try FileManager.default.moveItem(at: tmp, to: path)
    } catch {
        throw StateStoreError.writeFailed("rename: \(error)")
    }
}
```
**Apply:** Single `public func write(_ state: RuntimeState) async throws` — encodes, temp+F_FULLFSYNC+rename, ensures parent dir exists with `createDirectory(at:withIntermediateDirectories: true)` (StateStore.swift:108–114). No in-memory state cached on the actor (each call re-encodes the passed struct — simpler than StateStore which holds `var state`).

**Init pattern with test path injection** (StateStore.swift:89–92):
```swift
public init(path: String = defaultStatePath, initialState: StateFile? = nil) {
    self.path = URL(fileURLWithPath: path)
    self.state = initialState ?? StateFile()
}
```
**Apply:** `public init(path: String = defaultPath)` — tests pass tmpdir path; production uses default.

---

### `Sources/vigil-watch/Commands/Run.swift` (AsyncParsableCommand, RunLoop block)

**Analog:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/main.swift`
**Why:** Phase 122's main.swift body is the entire `Run.run()` body verbatim. Phase 123 only relocates it inside an `AsyncParsableCommand`.

**Body to relocate** (main.swift:1–25, full file):
```swift
// Phase 122 — vigil-watch foreground daemon.
import Foundation
import VigilWatch

setbuf(stdout, nil)   // unbuffered stdout for pipe-friendly NDJSON tailing (RESEARCH.md §10)

logInfo("vigil-watch starting (Phase 122)")

Task {
    do {
        let config = try ConfigLoader.load()
        let daemon = try await Daemon(config: config)
        installSIGTERMHandler(emitter: daemon.emitter)
        await daemon.start()
        logInfo("vigil-watch running — Ctrl-C to exit")
    } catch {
        logError("startup failed: \(error)")
        exit(1)
    }
}

RunLoop.main.run()
```
**Apply to Run.swift:** Same body inside `func run() async throws`. Move `setbuf(stdout, nil)` to FIRST line of `run()` body (RESEARCH.md "stdout buffering trap" — must preserve under launchd redirection). Add `@Flag(name: .customLong("verbose")) var verbose: Bool = false`. When `!verbose`, redirect stderr to `/dev/null` OR a sentinel that suppresses logInfo/logWarn (planner picks the cleaner mechanism — the Logging.swift `logInfo`/`logWarn` go to FileHandle.standardError, so the cleanest path is to dup2 stderr to /dev/null at the top of the unverbose Run path before any log calls fire, or wrap each log function in a verbose-flag check).

**Critical preserve-as-is:** `RunLoop.main.run()` does NOT return; SIGTERM handler from `installSIGTERMHandler` calls `exit(0)`. AsyncParsableCommand's `run()` is allowed to never return.

---

### `Sources/vigil-watch/Commands/Tail.swift` (ParsableCommand, subprocess pipeline)

**Analog (in-repo):** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/SignalHandling.swift` (DispatchSource SIGINT pattern)
**Analog (research-cited):** RESEARCH.md §Pattern 4 lines 422–448 (Process | Process pipeline)

**DispatchSource SIGINT pattern** (SignalHandling.swift:43–55):
```swift
let intr = DispatchSource.makeSignalSource(signal: SIGINT, queue: DispatchQueue.global())
intr.setEventHandler {
    Task {
        logInfo("SIGINT received — draining queue (5s deadline)")
        _ = await emitter.drain(deadlineSeconds: 5.0)
        logInfo("vigil-watch exiting")
        exit(0)
    }
}
intr.resume()
_sigintSource = intr
```
**Apply to Tail.swift:** Same shape, but `setEventHandler` body calls `tail.terminate(); jq.terminate(); exit(130)` (130 = standard SIGINT exit code). Hold the DispatchSource alive in a local — it must outlive the closure.

**Subprocess pipeline** (RESEARCH.md §Pattern 4 lines 422–448):
```swift
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

try tail.run()
try jq.run()
jq.waitUntilExit()
tail.terminate()
```
**Apply:** jq path detection — try `/usr/bin/jq` first (system jq 1.7.1 on macOS 15+ per RESEARCH.md A8), fall back to `/usr/local/bin/jq`, then `/opt/homebrew/bin/jq`. If none found, emit error to stderr and `throw ExitCode.failure` (RESEARCH.md §Pattern 1 lines 286–292).

**`@Argument` pattern** (RESEARCH.md §Pattern 1 lines 282–284):
```swift
struct Tail: ParsableCommand {
    static let configuration = CommandConfiguration(abstract: "Stream parsed events for one session.")
    @Argument(help: "Session ID to filter on.") var sessionId: String
    func run() throws { ... }
}
```

---

### `Sources/vigil-watch/Commands/Test.swift` (AsyncParsableCommand, one-shot POST)

**Analog:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EmitterActor.swift` (lines 205–231, `postOnce`)
**Why:** `Test` is `EmitterActor.postOnce` minus the queue and retry — same URLSession+Authorization+JSONEncoder, exit-on-status.

**Authorization + URLRequest pattern** (EmitterActor.swift:205–231):
```swift
public func postOnce(_ payload: VigilPayload) async throws -> (status: Int, retryAfter: Duration?) {
    guard let url = URL(string: "\(config.apiURL)/v1/agent-events") else {
        throw URLError(.badURL)
    }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONEncoder().encode(payload)
    req.timeoutInterval = 10

    let (_, response) = try await http.data(for: req)
    guard let httpResponse = response as? HTTPURLResponse else {
        throw URLError(.badServerResponse)
    }
    // ...
    return (httpResponse.statusCode, retryAfter)
}
```
**Apply:** Same URLRequest construction. Use `URLSession(configuration: .ephemeral)` directly (no need for the EmitterActor's HTTPClient protocol — `Test` is one-shot). Match RESEARCH.md §Test subcommand skeleton (lines 762–802) for the full template.

**Synthetic-payload shape (CONTEXT D-Discretion):**
- `sessionId = "_vigil_test_\(Int(Date().timeIntervalSince1970))"`
- `event = VigilEvent.heartbeat.rawValue`
- `label = "vigil-watch-test"` (non-empty per Phase 121 KNOWN_FIELDS guard)
- `host = ConfigLoader.resolveHost(config)`
- `clientEventId = makeClientEventId(sessionId:, byteOffset: 0, eventType: ...)` (Phase 122's hashing helper)

**Exit-code shape:** `if !(200...299).contains(status) { throw ExitCode.failure }`. Print `HTTP \(status)` then body to stdout BEFORE the throw — operator wants visibility on failure.

**ConfigLoader.load() reuse** (Config.swift:118):
```swift
let config = try ConfigLoader.load()
```
Reused as-is. If `config.apiKey.isEmpty`, write to stderr and `throw ExitCode.failure`.

---

### `Sources/vigil-watch/Commands/Install.swift` (AsyncParsableCommand, shell-out + render)

**Analog (in-repo):** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Config.swift` (lines 118–168, `ConfigLoader.load`)
**Analog (research):** RESEARCH.md §Code Examples lines 614–712 (full Install skeleton)

**mkdir-then-write pattern** (Config.swift:120–139):
```swift
let url = URL(fileURLWithPath: path)
let dir = url.deletingLastPathComponent()
let fm = FileManager.default

// Create parent dir if needed.
if !fm.fileExists(atPath: dir.path) {
    do {
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
    } catch {
        throw ConfigError.cannotCreateDirectory(dir.path + ": \(error)")
    }
}
// Create defaults file if absent.
if !fm.fileExists(atPath: url.path) {
    do {
        try defaultTOMLBody.write(to: url, atomically: true, encoding: .utf8)
    } catch {
        throw ConfigError.cannotWriteDefaults(url.path + ": \(error)")
    }
}
```
**Apply:** Loop over `["\(home)/.local/bin", logDir, agentsDir]` for mkdir; render plists via `String.replacingOccurrences` then `write(toFile: atomically: true, encoding: .utf8)`.

**Process runner** (RESEARCH.md §Install skeleton lines 700–711):
```swift
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
**Apply:** Lift verbatim. Place in shared file (Plists.swift or a new ProcessRunner.swift) so Install/Uninstall/Status all share it.

**Bootout-tolerate-3 + bootstrap pattern** (RESEARCH.md §Install skeleton lines 672–685):
```swift
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
```
**Apply:** Exit code 3 ("No such process") is success-equivalent for bootout (RESEARCH.md Pitfall 3, verified live 2026-05-09). Other non-zero codes throw.

**VIGIL_API_KEY plist injection** (RESEARCH.md §Install skeleton lines 645–656):
```swift
let apiKeyBlock: String
if let key = ProcessInfo.processInfo.environment["VIGIL_API_KEY"], !key.isEmpty {
    apiKeyBlock = "<key>VIGIL_API_KEY</key><string>\(xmlEscape(key))</string>"
} else {
    apiKeyBlock = ""
}
let daemonXML = PlistTemplates.daemon
    .replacingOccurrences(of: "%BINARY_PATH%", with: binDest)
    .replacingOccurrences(of: "%LOG_DIR%", with: logDir)
    .replacingOccurrences(of: "%VIGIL_API_KEY_BLOCK%", with: apiKeyBlock)
```
**Apply:** Mitigates Pitfall 1 (launchd does NOT inherit shell env). XML-escape the key value (RESEARCH.md §Security Domain V5).

**Post-write security hardening** (RESEARCH.md §Security Domain line 1035):
```swift
// chmod 0600 on rendered plist (contains plain-text VIGIL_API_KEY)
try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: daemonPlist)
```

---

### `Sources/vigil-watch/Commands/Uninstall.swift` (mirror of Install)

**Analog:** `Install.swift` (sibling — same `runProcess`, same exit-3-tolerance, same labels)

**Pattern:** For each label in `["com.morrillholdings.vigil.watch", "com.morrillholdings.vigil.watch.sampler"]`:
1. `launchctl bootout gui/$UID/<label>` (tolerate exit 0 OR 3 — same gate as Install).
2. `try? FileManager.default.removeItem(atPath: <plist>)` (tolerate ENOENT).

Returns 0 unconditionally per CONTEXT D-Discretion ("returns 0 even if the plists were already absent"). Does NOT remove `~/Library/Application Support/vigil-watch/` (operator data per CONTEXT).

---

### `Sources/vigil-watch/Commands/Status.swift` (ParsableCommand, file-read + fallback)

**Analog:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/StateStore.swift` (lines 124–143, file-read + decode + validate)
**Analog (research):** RESEARCH.md §Code Examples lines 717–756 (full Status skeleton)

**Read + decode pattern** (StateStore.swift:124–143):
```swift
let data: Data
do { data = try Data(contentsOf: path) }
catch { throw StateStoreError.decodeFailed("read: \(error)") }

let decoded: StateFile
do { decoded = try JSONDecoder().decode(StateFile.self, from: data) }
catch { throw StateStoreError.decodeFailed("decode: \(error)") }
```
**Apply:** Same read+decode for `runtime-state.json` → `RuntimeState`. Add freshness check via `FileManager.attributesOfItem(atPath:)[.modificationDate]` and compare to `Date().timeIntervalSince(mtime) < 5.0` (CONTEXT D-04).

**Three-state output** (RESEARCH.md Pitfall 8 lines 596–601):
- `runtime-state.json` fresh (<5s) → `daemon: RUNNING` + queue depth + last event + PID
- Stale OR missing AND `launchctl print` succeeds → `daemon: NOT RUNNING` + raw `launchctl print` output, `throw ExitCode(2)`
- `launchctl print` exits non-zero → `daemon: NOT INSTALLED` + hint, `throw ExitCode.failure`

---

### `Sources/vigil-watch/Commands/Plists.swift` (template constants)

**Analog:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Config.swift` (lines 69–108, `defaultTOMLBody` multi-line literal)
**Why:** Same idiom — multi-line Swift string literal as template, with placeholder substitutions at use site.

**Multi-line template idiom** (Config.swift:69–108):
```swift
public static let defaultTOMLBody: String = """
# vigil-watch configuration — created on first run
# ...
api_url = "https://api.vigilhub.io"
api_key = ""
# ...
"""
```
**Apply:** Two static templates per RESEARCH.md §Pattern 3 lines 376–411:
- `PlistTemplates.daemon` — placeholders `%BINARY_PATH%`, `%LOG_DIR%`, `%VIGIL_API_KEY_BLOCK%`
- `PlistTemplates.sampler` — placeholders `%BINARY_PATH%`, `%LOG_DIR%`, `%HOME%`

**Critical:** Use `<true/>` self-closing tags, NOT `<true></true>` (RESEARCH.md Pitfall 2 — launchd's parser is stricter than plutil's). PlistTemplateTests.swift greps for `<true></true>` and asserts not-found.

**Sampler embedded shell script** (RESEARCH.md §Pattern 5 lines 458–465):
```xml
<key>ProgramArguments</key>
<array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>PID=$(pgrep -f /Users/jamesonmorrill/.local/bin/vigil-watch | head -1); LOG=$HOME/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv; if [ -n "$PID" ]; then ps -p $PID -o pid=,rss=,etimes= | awk -v ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{print ts","$1","$2","$3}' >> "$LOG"; else echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),,," >> "$LOG"; fi</string>
</array>
<key>StartInterval</key><integer>300</integer>
```
**Apply:** Use `etimes` (lowercase-s suffix) NOT `etime` — RESEARCH.md Pitfall 4: `etime` format breaks after 24h (`dd-hh:mm:ss`); `etimes` is integer seconds and stable forever.

**Apply:** RESEARCH.md Pitfall 5 mitigation — sampler should prefer `launchctl print gui/$UID/com.morrillholdings.vigil.watch | awk '/^\spid =/ {print $3}'` over `pgrep -f`. Falls back to `pgrep -f` only if `launchctl print` returns no PID. (Optional refinement; planner can keep simple `pgrep -f` form if simpler is preferred.)

---

### `scripts/soak-check.sh` (bash + awk assertion)

**Analog:** RESEARCH.md §Code Examples lines 808–845 (full skeleton)
**No in-repo analog** — first bash script in vigil-watch repo.

**Pattern (lift verbatim from RESEARCH.md, with minor refinements):**
```bash
#!/usr/bin/env bash
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

**Gates verbatim from CONTEXT D-09:**
- `max(rss_kb) < 30000` (≤30MB)
- `(last_ts - first_ts) >= 86400 - 600` (≥23h50m)
- All non-empty PID rows share one PID (KeepAlive integrity)
- ≥1 non-empty row (sampler ran at all)
- vigil-core returned ≥1 session

Set `chmod +x scripts/soak-check.sh` after creation. Make sure `set -euo pipefail` is present (script must fail loudly on any error per ROADMAP SC #4).

---

### `Tests/VigilWatchTests/RuntimeStateWriterTests.swift`

**Analog:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/StateStoreTests.swift`
**Why:** Identical role — both test atomic-write actors. Lift setUp/tearDown verbatim.

**setUp/tearDown pattern** (StateStoreTests.swift:19–31):
```swift
private var tempDir: URL!
private var statePath: String!

override func setUpWithError() throws {
    tempDir = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("statestore-tests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    statePath = tempDir.appendingPathComponent("offsets.json").path
}

override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: tempDir)
}
```
**Apply:** Replace `offsets.json` with `runtime-state.json`; everything else identical.

**Roundtrip pattern** (StateStoreTests.swift:60–72):
```swift
func testUpdateOffsetAndAtomicSaveRoundTrip() async throws {
    let store = StateStore(path: statePath)
    try await store.loadOrCreate()

    await store.updateOffset(filePath: "/tmp/test.jsonl", offset: 1024)
    try await store.atomicSave()

    let store2 = StateStore(path: statePath)
    try await store2.loadOrCreate()
    let offset = await store2.getOffset(filePath: "/tmp/test.jsonl")
    XCTAssertEqual(offset, 1024, "Offset should round-trip through disk exactly")
}
```
**Apply:** Test cases per RESEARCH.md §Validation Architecture rows 984–986:
- `testWriteCreatesFileAtTargetPath`
- `testWriteIsAtomicTempThenRename` (assert no `.tmp` left over)
- `testJSONFieldNamesAreSnakeCase` (read raw bytes, assert literal `"schema_version"`, `"started_at"`, etc.)
- `testRoundTripWithStatusReader` (drift detector — write via Writer, read via Status's reader, assert byte-identical fields)

**Snake-case-bytes assertion** (StateStoreTests.swift:104–107):
```swift
let raw = try String(contentsOf: URL(fileURLWithPath: statePath), encoding: .utf8)
XCTAssertTrue(raw.contains("\"schema_version\" : 2"),
              "Disk content should contain literal '\"schema_version\" : 2'. Got:\n\(raw)")
```
**Apply:** Same form for `runtime-state.json` field names.

---

### `Tests/VigilWatchTests/PlistTemplateTests.swift`

**Analogs:**
1. `Tests/VigilWatchTests/StateStoreTests.swift:104–107` — raw-content assertions
2. `Tests/VigilWatchTests/DriftDetectorTests.swift:14–58` — regex parse + drift-detection idiom

**DriftDetector regex pattern** (DriftDetectorTests.swift:26–34):
```swift
let pattern = #"export const VALID_EVENTS = \[([\s\S]*?)\] as const"#
let regex = try NSRegularExpression(pattern: pattern)
let nsRange = NSRange(source.startIndex..., in: source)
guard let match = regex.firstMatch(in: source, range: nsRange),
      let bodyRange = Range(match.range(at: 1), in: source) else {
    XCTFail("Could not locate ...")
    return
}
```
**Apply:** Test cases per RESEARCH.md §Validation Architecture rows 969–970:
- `testDaemonPlistRendersValidXML` — render template with stub values, write to tmpdir, shell out `Process(plutil, [-lint, path])`, assert exit 0
- `testNoNonSelfClosingBooleans` — render template, assert `!rendered.contains("<true></true>")` AND `!rendered.contains("<false></false>")` (RESEARCH.md Pitfall 2)
- `testDaemonPlistContainsRequiredKeys` — assert presence of `Label`, `ProgramArguments`, `RunAtLoad`, `KeepAlive`, `LimitLoadToSessionType`, `ProcessType`, `StandardOutPath`, `StandardErrorPath`, `EnvironmentVariables`
- `testSamplerPlistContainsStartInterval` — assert `<key>StartInterval</key><integer>300</integer>`
- `testKeepAliveIsBooleanTrueNotDict` — assert `<key>KeepAlive</key><true/>`, NOT `<key>KeepAlive</key><dict>` (ROADMAP SC #1; differs from DailyBriefMonitor analog)
- `testApiKeyBlockRendersWhenEnvSet` / `testApiKeyBlockEmptyWhenEnvUnset`

**plutil shell-out pattern (lift from RESEARCH.md §Install skeleton lines 664–670):**
```swift
for plist in [daemonPlist, samplerPlist] {
    let r = try runProcess("/usr/bin/plutil", ["-lint", plist])
    guard r.exitCode == 0 else { ... }
}
```

---

### `Tests/VigilWatchTests/RunSubcommandTests.swift`

**Analog (in-repo):** `Tests/VigilWatchTests/PackageScaffoldTests.swift` (sentinel form — Wave-0 scaffolding)
**Analog (pattern):** ArgumentParser docs — `Run.parse([...])` static initializer

**Test idiom (research-derived):**
```swift
import XCTest
import ArgumentParser
@testable @_implementationOnly import struct vigil_watch.Run  // module name from Package.swift target
// OR if Run is internal — make it public or @testable

func testVerboseFlagDefaultIsFalse() throws {
    let cmd = try Run.parse([])
    XCTAssertFalse(cmd.verbose)
}

func testVerboseFlagEnabledByLongOption() throws {
    let cmd = try Run.parse(["--verbose"])
    XCTAssertTrue(cmd.verbose)
}
```
**Apply:** Test cases per RESEARCH.md §Validation Architecture row 977. NOTE: Importing the executable target (`vigil-watch`) into tests requires either:
- Making the target a library + thin executable shim (recommended for testability)
- OR using `@testable import` if the executable target is structured as a Swift module (modern SPM allows this)

**Planner decision:** Re-organize `Sources/vigil-watch/` so subcommands are `public struct`s in a testable location. The simplest path: leave them in `Sources/vigil-watch/Commands/` and use `@testable import vigil_watch` (SPM supports `@testable` for executable targets). Planner verifies this builds; if it doesn't, the fallback is moving subcommands into the `VigilWatch` library target (cleaner).

---

### `Tests/VigilWatchTests/TailSubcommandTests.swift`

**Analog:** `Tests/VigilWatchTests/StateStoreTests.swift` (tmpdir fixture pattern)

**Pattern:** Create tmpdir, write a fake `watch.out` with N NDJSON lines (some matching the target session_id, some not), invoke the subprocess pipeline, capture stdout, assert filtering correctness.

**Test cases per RESEARCH.md §Validation Architecture row 978:**
- `testFilterMatchesOnlyTargetSession` — fixture log has 5 lines, 2 with `session_id: "abc"`, 3 with `session_id: "xyz"`; tail filter for "abc" emits exactly 2 lines
- `testJqMissingDetected` — temporarily move /usr/bin/jq aside (or use a `@_spi` jq-path injection), assert ExitCode.failure with stderr message

**Caveat:** Tail's subprocess pipeline involves `tail -f` (which doesn't exit on its own). Tests need a strategy: either (a) use a finite log file + `tail` (no `-f`) for unit testing the filter logic isolated from streaming, or (b) write a small wrapper that exposes a `filter(input: String, sessionId: String) -> [String]` testable function and test it directly, separate from the Process-pipeline integration. **Planner picks the cleaner path.**

---

### `Tests/VigilWatchTests/TestSubcommandTests.swift`

**Analog:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/EmitterTests.swift`
**Why:** Identical pattern — StubHTTPClient drives deterministic responses; assertions on exit code + request shape.

**StubHTTPClient pattern** (EmitterTests.swift:9–38) — **lift verbatim**:
```swift
final class StubHTTPClient: HTTPClient, @unchecked Sendable {
    struct Response {
        let status: Int
        let headers: [String: String]
        let body: Data
    }
    var script: [Response]
    var received: [URLRequest] = []
    let lock = NSLock()
    init(script: [Response]) { self.script = script }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        lock.lock(); defer { lock.unlock() }
        received.append(request)
        guard !script.isEmpty else { throw URLError(.networkConnectionLost) }
        let next = script.removeFirst()
        let url = request.url ?? URL(string: "https://example.test")!
        let resp = HTTPURLResponse(url: url, statusCode: next.status,
                                   httpVersion: "HTTP/1.1", headerFields: next.headers)!
        return (next.body, resp)
    }
}
```
**Apply:** Same StubHTTPClient. **Required:** `Test` subcommand must accept an injected `HTTPClient` (default `DefaultHTTPClient()`) so tests can replace it. This is the same dependency-injection idiom EmitterActor uses (EmitterActor.swift:63–67).

**Bearer-header assertion pattern** (EmitterTests.swift:181–193):
```swift
func testBearerAuthHeaderSetOnRequest() async throws {
    let stub = StubHTTPClient(script: [
        .init(status: 201, headers: [:], body: Data())
    ])
    let emitter = EmitterActor(config: makeConfig(apiKey: "vk_test_xyz"), http: stub,
                               sleepFn: { _ in })
    _ = try await emitter.postOnce(makePayload())
    XCTAssertEqual(stub.received.count, 1)
    let auth = stub.received[0].value(forHTTPHeaderField: "Authorization")
    XCTAssertEqual(auth, "Bearer vk_test_xyz",
                   "Authorization header must be Bearer <apiKey>")
}
```

**Test cases per RESEARCH.md §Validation Architecture rows 979–980, 983:**
- `testPostsAndExitsZeroOn201` (StubHTTPClient scripts 201 → assert no throw)
- `testExitsNonZeroOn401` (StubHTTPClient scripts 401 → assert `ExitCode.failure`)
- `testSessionIdShape` (assert request body's sessionId matches `^_vigil_test_\d+$`)
- `testBearerHeaderSet` (lift the EmitterTests assertion)
- `testEmptyApiKeyExitsBeforePost` (config with apiKey="" → assert no request hits stub)

---

### `Tests/VigilWatchTests/StatusSubcommandTests.swift`

**Analog:** `Tests/VigilWatchTests/StateStoreTests.swift` (tmpdir fixture + raw JSON write)

**Pattern:** tmpdir fixture for `runtime-state.json`. Three states tested:
1. Fresh file (mtime now) → `Status.run()` reads + prints state, exits 0
2. Stale file (mtime 10s ago via `setAttributes([.modificationDate: ...], ofItemAtPath:)`) → falls back, asserts `ExitCode(2)` + raw launchctl output (or skip launchctl branch by injecting a stub)
3. Missing file + launchctl returns non-zero → `ExitCode.failure` + `NOT INSTALLED`

**Raw-JSON-write fixture** (StateStoreTests.swift:34–38):
```swift
private func writeRawJSON(_ dict: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: dict, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: URL(fileURLWithPath: statePath))
}
```
**Apply:** Same idiom for synthetic `runtime-state.json` fixtures.

**mtime manipulation:**
```swift
try FileManager.default.setAttributes(
    [.modificationDate: Date().addingTimeInterval(-10)],
    ofItemAtPath: statePath
)
```

**Test cases per RESEARCH.md §Validation Architecture rows 981–982:**
- `testReadsAndPrintsState`
- `testStaleFileFallsBackToLaunchctl`
- `testFallbackWhenNotInstalled`

---

### `Tests/VigilWatchTests/SoakCheckTests.swift`

**Analog:** `Tests/VigilWatchTests/DriftDetectorTests.swift`
**Why:** DriftDetectorTests already shells out to a sibling artifact (vigil-core's TS file) via FileManager + skip-when-missing. SoakCheckTests follows the same idiom — Process exec of `bash scripts/soak-check.sh <fixture-csv>`.

**XCTSkip-when-missing pattern** (DriftDetectorTests.swift:20–23):
```swift
guard FileManager.default.fileExists(atPath: tsFile.path) else {
    throw XCTSkip("VIGIL_CORE_PATH not pointing at a vigil-core checkout " +
                  "(\(tsFile.path) missing). Set VIGIL_CORE_PATH to skip-or-run.")
}
```
**Apply:** Skip if `scripts/soak-check.sh` is missing (Process invocation will fail otherwise).

**Pattern:**
```swift
private func runSoakCheck(csvFixture: String) -> (exitCode: Int32, stdout: String, stderr: String) {
    let scriptPath = repoRoot() + "/scripts/soak-check.sh"
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/bash")
    p.arguments = [scriptPath, csvFixture]
    let outPipe = Pipe(); let errPipe = Pipe()
    p.standardOutput = outPipe; p.standardError = errPipe
    try? p.run()
    p.waitUntilExit()
    // ...
}
```

**Test cases per RESEARCH.md §Validation Architecture rows 988–991:**
- `testGoodSoakPasses` (synthetic CSV: same PID, RSS<30MB, span≥23h50m, ≥1 row → exit 0)
- `testRSSAboveThresholdFails` (RSS=35000 → exit 1)
- `testMultiplePIDsFails` (two distinct PIDs → exit 1)
- `testShortSpanFails` (span<23h50m → exit 1)
- `testEmptyCSVFails` (zero non-empty rows → exit 1)

**Live Core readback caveat:** soak-check.sh's final `curl` to vigil-core requires `VIGIL_API_KEY` and network. Tests should EITHER (a) set `VIGIL_API_KEY=""` in the test env to force the script's "FAIL: VIGIL_API_KEY env required" path, OR (b) refactor soak-check.sh to accept a `--no-core-check` flag for unit-test mode (recommended; cleaner).

---

### `Tests/VigilWatchTests/PackageTests.swift` (drift detector)

**Analog:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/DriftDetectorTests.swift`
**Why:** Identical role — drift detection between source files. PackageTests asserts the swift-argument-parser version pin in `Package.swift` is the expected `from: "1.6.0"`.

**Drift-detector core pattern** (DriftDetectorTests.swift:14–58) — same shape:
```swift
func testArgumentParserDependencyVersion() throws {
    let pkgPath = repoRoot() + "/Package.swift"
    let source = try String(contentsOf: URL(fileURLWithPath: pkgPath), encoding: .utf8)

    // Match: .package(url: "...swift-argument-parser", from: "1.6.0")
    let pattern = #".package\(url:\s*"https://github\.com/apple/swift-argument-parser",\s*from:\s*"(\d+\.\d+\.\d+)"\)"#
    let regex = try NSRegularExpression(pattern: pattern)
    let nsRange = NSRange(source.startIndex..., in: source)
    guard let match = regex.firstMatch(in: source, range: nsRange),
          let versionRange = Range(match.range(at: 1), in: source) else {
        XCTFail("Could not locate swift-argument-parser dependency in Package.swift")
        return
    }
    let pinned = String(source[versionRange])
    XCTAssertEqual(pinned, "1.6.0",
                   "swift-argument-parser version drifted from RESEARCH.md §Standard Stack pin (1.6.0)")
}
```

---

### `Package.swift` (MODIFY — add dependency)

**Reference pattern:** RESEARCH.md §Standard Stack lines 137–151

**Current state** (Package.swift:11–14):
```swift
dependencies: [
    // Phase 122: zero external dependencies (CONTEXT.md "Swift / library picks").
    // Phase 123 will add swift-argument-parser; do NOT add it here.
],
```
**After modification:**
```swift
dependencies: [
    .package(url: "https://github.com/apple/swift-argument-parser", from: "1.6.0"),
],
```

**Targets section** — add `.product` to the executable target:
```swift
.executableTarget(
    name: "vigil-watch",
    dependencies: [
        "VigilWatch",
        .product(name: "ArgumentParser", package: "swift-argument-parser"),
    ],
    path: "Sources/vigil-watch"
),
```

**Keep `swift-tools-version:5.10`** (line 1) — Phase 122's pin; swift-argument-parser 1.6.x supports it (RESEARCH.md A1).

---

### `Sources/vigil-watch/main.swift` (MODIFY — gut + dispatch shell)

**Current body** (main.swift:1–25, full file): see Run.swift section above for the existing 25 lines.

**After modification (~5 lines):**
```swift
import ArgumentParser

@main
struct VigilWatchCLI: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "vigil-watch",
        abstract: "Claude Code session watcher daemon for Vigil.",
        subcommands: [Run.self, Tail.self, Test.self, Install.self, Uninstall.self, Status.self],
        defaultSubcommand: Run.self
    )
}
```
The 25 lines of body move verbatim into `Run.run()`. `defaultSubcommand: Run.self` preserves Phase 122's behavior (bare `vigil-watch` boots the daemon).

---

### `Sources/VigilWatch/Daemon.swift` (MODIFY — additive 1Hz tick line)

**Current 1Hz tick** (Daemon.swift:147–159):
```swift
let registryRef = self.registry
let emitterRef = self.emitter
let cfg = config
evaluationTask = Task {
    while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1))
        if Task.isCancelled { break }
        let sessions = await registryRef.allSessions()
        for s in sessions {
            let events = await s.evaluate(now: Date(), config: cfg)
            for e in events { await emitterRef.enqueue(e) }
        }
    }
}
```

**After modification:** Add `let runtimeStateWriter = RuntimeStateWriter()` to `init` (instance property). Inside the while loop, after the events are enqueued, add:
```swift
let snapshot = await emitterRef.currentSnapshot()
let state = RuntimeState(
    pid: Int32(ProcessInfo.processInfo.processIdentifier),
    startedAt: startedAtISO8601,            // captured at init
    queueDepth: snapshot.queueDepth,
    lastEventTs: snapshot.lastEventTs,
    lastEventSessionId: snapshot.lastEventSessionId,
    lastEventType: snapshot.lastEventType,
    quarantined: snapshot.quarantined
)
try? await runtimeStateWriter.write(state)
```
**Capture `startedAt` at `Daemon.init`** (single capture, immutable for process lifetime — same idiom as `resolvedHost` capture, Daemon.swift:51).

---

### `Sources/VigilWatch/EmitterActor.swift` (MODIFY — additive accessor)

**Existing accessors** (EmitterActor.swift:140–141):
```swift
public func queueDepth() -> Int { queue.count }
public func isQuarantined() -> Bool { quarantined }
```

**Pattern to add** — same idiom (actor public func returning value):
```swift
/// Returns a snapshot of the emitter's current observable state for runtime-state.json writing.
/// Read-only accessor; does not mutate queue or any internal state.
public func currentSnapshot() -> (queueDepth: Int, lastEventTs: String?, lastEventSessionId: String?, lastEventType: String?, quarantined: Bool) {
    return (
        queueDepth: queue.count,
        lastEventTs: lastEnqueuedEvent?.timestamp,
        lastEventSessionId: lastEnqueuedEvent?.sessionId,
        lastEventType: lastEnqueuedEvent?.event,
        quarantined: quarantined
    )
}
```
**Required addition:** Track `private var lastEnqueuedEvent: VigilPayload?` — set inside `enqueue(_:)` before the FIFO drop check (so the snapshot reflects the most-recently-enqueued event even if it was later dropped from the queue). Update on every enqueue.

---

### `Tests/VigilWatchTests/EmitterTests.swift` (MODIFY — additive test case)

**Pattern:** Append one new test case to the existing 16. Reuse the existing `makePayload()` and `makeConfig()` helpers (EmitterTests.swift:45–63).

**New test case:**
```swift
func testCurrentSnapshotShape() async {
    let stub = StubHTTPClient(script: [])
    let emitter = EmitterActor(config: makeConfig(), http: stub, sleepFn: { _ in })

    // Empty state: depth=0, all event fields nil.
    let empty = await emitter.currentSnapshot()
    XCTAssertEqual(empty.queueDepth, 0)
    XCTAssertNil(empty.lastEventTs)
    XCTAssertNil(empty.lastEventSessionId)
    XCTAssertNil(empty.lastEventType)
    XCTAssertFalse(empty.quarantined)

    // After one enqueue: depth=1, event fields populated.
    await emitter.enqueue(makePayload(eventId: "evt-1"))
    let withOne = await emitter.currentSnapshot()
    XCTAssertEqual(withOne.queueDepth, 1)
    XCTAssertEqual(withOne.lastEventSessionId, "sess-1")
    XCTAssertEqual(withOne.lastEventType, VigilEvent.heartbeat.rawValue)
    XCTAssertNotNil(withOne.lastEventTs)
}
```

---

## Shared Patterns

### Atomic file write (temp + F_FULLFSYNC + rename)

**Source:** `Sources/VigilWatch/StateStore.swift:211–252`
**Apply to:** `RuntimeStateWriter.swift` (every `write(_:)` call)

The pattern: encode → write to `<path>.tmp` → `fcntl(fd, F_FULLFSYNC)` → `rename(2)` (via `FileManager.moveItem`). APFS guarantees rename atomicity; F_FULLFSYNC is a durability hardener. Phase 122 has already vetted this pattern over multi-day smoke runs.

### Process subprocess runner (shell-out helper)

**Source:** RESEARCH.md §Code Examples lines 700–711 (no in-repo analog yet — this becomes the new shared helper)

```swift
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
**Apply to:** Install (launchctl + plutil + which jq), Uninstall (launchctl), Status (launchctl print). **Place in:** Plists.swift (or a new `Sources/vigil-watch/Commands/ProcessRunner.swift` — planner picks).

### XCTest tmpdir fixture (setUp/tearDown)

**Source:** `Tests/VigilWatchTests/StateStoreTests.swift:19–31`
**Apply to:** RuntimeStateWriterTests, PlistTemplateTests, TailSubcommandTests, StatusSubcommandTests, SoakCheckTests

Universal pattern for any test that writes to disk: tmpdir under `NSTemporaryDirectory()/<suite-uuid>/`, removed in `tearDownWithError`.

### StubHTTPClient (HTTPClient injection)

**Source:** `Tests/VigilWatchTests/EmitterTests.swift:9–38`
**Apply to:** TestSubcommandTests

Required precondition: `Test` subcommand must accept an injected `HTTPClient` (default `DefaultHTTPClient()`). Uses the same `script: [Response]` + `received: [URLRequest]` pattern as EmitterActor's HTTPClient protocol.

### Drift-detector regex test

**Source:** `Tests/VigilWatchTests/DriftDetectorTests.swift:14–58`
**Apply to:** PlistTemplateTests (test required keys), PackageTests (test version pin), RuntimeStateWriterTests (test snake_case field names)

Pattern: NSRegularExpression against source-file content, fail if regex doesn't match expected shape.

### XCTSkip-when-missing for cross-repo dependencies

**Source:** `Tests/VigilWatchTests/DriftDetectorTests.swift:20–23`
**Apply to:** SoakCheckTests (skip if `scripts/soak-check.sh` is missing on a fresh checkout)

```swift
guard FileManager.default.fileExists(atPath: artifact) else {
    throw XCTSkip("artifact missing: \(artifact)")
}
```

### Bearer-leak masking (T-122-01)

**Source:** `Sources/VigilWatch/Logging.swift:62–66` (`maskBearer`)
**Apply to:** Install (any error log path that might surface VIGIL_API_KEY), Test (HTTP error logs), Status (no exposure expected — runtime-state.json doesn't contain keys, but defense in depth)

`logInfo`/`logWarn`/`logError` already pipe through `maskBearer` (Logging.swift:74–76). Any direct `print()` or `FileHandle.standardError.write()` in new subcommands should pass error strings through `maskBearer()` first.

---

## No Analog Found

| File / Concern | Reason | Mitigation |
|----------------|--------|------------|
| `scripts/soak-check.sh` | First bash script in vigil-watch repo | Lift verbatim from RESEARCH.md §Code Examples. Reference: macOS `date -u -j -f` + `awk` arithmetic patterns are well-established |
| Tail subcommand subprocess pipeline (Process \| Pipe \| Process) | No multi-process pipeline elsewhere in the daemon (EmitterActor uses URLSession; no `Process` chains) | Use RESEARCH.md §Pattern 4 + Apple Developer Forums citation. SignalHandling.swift covers the SIGINT-forwarding half |
| ArgumentParser-specific test idiom (`Cmd.parse([...])`) | Phase 122 has no CLI library tests; PackageScaffoldTests is a sentinel | RESEARCH.md §Validation Architecture rows 977 lays out the expected calls. Planner verifies `@testable import` of executable target works in SPM |

---

## Metadata

**Analog search scope:**
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/` (16 files, all read or grepped)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/main.swift`
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/` (12 files, key analogs read in full)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Package.swift`
- `~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist` (reference-only)

**Files read in detail:**
- StateStore.swift (286 lines) — atomic-write canonical
- Daemon.swift (171 lines) — composition root + 1Hz tick site
- EmitterActor.swift (272 lines) — HTTPClient + postOnce + currentSnapshot extension target
- main.swift (25 lines) — Run subcommand body source
- Config.swift (182 lines) — multi-line template idiom
- SignalHandling.swift (55 lines) — DispatchSource SIGINT pattern
- Logging.swift (84 lines) — maskBearer + nowISO8601
- EmitterTests.swift (252 lines) — StubHTTPClient pattern
- StateStoreTests.swift (273 lines) — tmpdir fixture + roundtrip + raw-bytes assertion
- DriftDetectorTests.swift (58 lines) — drift-detector regex pattern
- PackageScaffoldTests.swift (9 lines) — sentinel form
- Package.swift (29 lines) — SPM manifest

**Pattern extraction date:** 2026-05-09
**Phase:** 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak

---

*Pattern map ready for planner. Every CREATED file has a verbatim-liftable analog excerpt; every MODIFIED file has a concrete reference site. Phase 123 is glue, not new architecture — this map confirms it.*
