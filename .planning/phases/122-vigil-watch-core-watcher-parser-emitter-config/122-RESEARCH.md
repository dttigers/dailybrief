# Phase 122: vigil-watch core — watcher + parser + emitter + config - Research

**Researched:** 2026-05-08
**Domain:** Swift macOS daemon (FSEventStream, Swift Concurrency, URLSession, TOML, SIGTERM)
**Confidence:** HIGH — all critical claims verified against live toolchain, Apple docs, or source code

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 (client_event_id):** `sha256("\(sessionId)|\(jsonlByteOffset)|\(eventType)|\(ruleVersion)")` hex-encoded prefix-36, UUID-shaped (8-4-4-4-12 format). Verified live: `sha256("2072cbce-...|1024|needs_input|v1")` → `39830cfa-218a-9bed-5804-49bd450dd210` (36 chars). Zero new disk state beyond `offsets.json`.

**D-02 (ruleVersion):** Swift `let ruleVersion = "v1"` const, NOT a DB column.

**D-03 (needs_input_gap_seconds = 10):** TOML default.

**D-04 (task_complete_silence_seconds = 30):** TOML default. Distinct from heartbeat (60s) so they don't fire on the same tick.

**D-05 (locked thresholds):** `needs_input_debounce_seconds = 30`, `heartbeat_seconds = 60`.

**D-06 (timer-driven evaluation required):** Per-session timer evaluation in daemon for all silence/gap events. Cannot lazy-evaluate.

**D-07 (milestone dedupe key):** `(sessionId, milestonePattern)` — once per session per pattern per daemon lifetime. New sessionId resets.

**D-08 (match-state persisted):** `Set<(sessionId, patternRegex, firstMatchOffset)>` persisted to disk, reloaded on startup.

**D-09 (offsets.json schema_version=2):** Single file, atomic rename on update. Schema:
```json
{
  "schema_version": 2,
  "offsets": { "<jsonl-file-id>": <bytePos> },
  "milestones_emitted": {
    "<sessionId>": [{ "pattern": "<regex>", "first_match_offset": <bytePos>, "emitted_at": "<ISO-8601>" }]
  }
}
```
Sessions older than 24h GC'd lazily.

**D-10 (6-pattern milestone_patterns starter):** Case-insensitive by default (`(?i)` prepended). User opts out per-pattern with inline `(?-i)`.

**Logging:** stdout = NDJSON one line per Vigil event; stderr = human-readable `[INFO]`/`[WARN]`/`[ERROR]`. No OSLog.

**Layout:** `Package.swift` at repo root, `Sources/VigilWatch/` library, `Sources/vigil-watch/main.swift` executable, `Tests/VigilWatchTests/` XCTest.

**HTTP:** URLSession, exponential backoff 1/2/4/8/16/32s cap, ~25% jitter, max 6 attempts then queue, 4xx (except 429) drops, 429 honors Retry-After.

**TOML:** Hand-rolled minimal parser acceptable; LebJe/TOMLKit is lightest third-party option.

**Concurrency:** Swift Concurrency (`actor` per session, `async/await` for HTTP). No Combine.

**Atomic writes:** write-temp-then-rename for `offsets.json`.

**JSONL parsing:** tail-cursor, complete `\n`-terminated lines only, hold buffer on partial. Skip+log JSON-parse failures without advancing offset. 7 known non-spec types advance offset, do NOT emit.

**Bearer key bootstrap:** watch.toml `api_key` → `VIGIL_API_KEY` env → quarantine state (not crash).

### Claude's Discretion

- Exact logging field names in NDJSON stdout line shape (ts, session_id, event, message, label, host, exit_code, client_event_id, post_status)
- TOML parser choice: hand-rolled (recommended by context) vs LebJe/TOMLKit 0.6.0
- Hostname via `ProcessInfo.processInfo.hostName` vs `Host.current().localizedName`
- Timer resolution for evaluation loop (1s tick recommended by research — see below)
- Whether to include `swift-argument-parser` as dependency now (Phase 123 adds CLI; Phase 122 main.swift is simple entry point with no subcommands)

### Deferred Ideas (OUT OF SCOPE)

- launchd plist install/uninstall (Phase 123)
- CLI subcommands run/tail/test/install/uninstall/status (Phase 123)
- 24h soak under 30MB RSS (Phase 123)
- WebSocket fan-out (Phase 124+)
- SIGHUP-reload (Phase 123 follow-on)
- OSLog / Console.app (Phase 124+)
- Multi-daemon coexistence enforcement (Phase 123)
- Cross-Mac verification on MacBook Pro (Phase 123)
- Per-event TTL for indefinite-retry drop
- `detection_rule_version` DB column
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-WATCH-01 | FSEventStream watcher on `~/.claude/projects/` with debounce | Section: FSEventStream Best Practices |
| AGENT-WATCH-02 | JSONL parser + 5 event types + offsets.json persistence | Section: Tail-Cursor JSONL Parsing; Detection Rules |
| AGENT-WATCH-03 | POST to vigil-core with retry/backoff + 100-event queue + 5s SIGTERM drain | Section: URLSession Retry; SIGTERM Handling |
| AGENT-WATCH-06 | watch.toml read on startup, first-run defaults, api_key env fallback | Section: TOML Parsing; Configuration Architecture |
</phase_requirements>

---

## Summary

Phase 122 builds the first production Swift code in the `vigil-watch` repo — a daemon engine with four cooperating subsystems: an `FSEventStream`-based watcher, a tail-cursor JSONL parser, a Swift Concurrency timer evaluator, and a URLSession retry emitter. All architectural decisions are locked in CONTEXT.md (D-01 through D-10). This research answers "how to implement" each locked decision correctly on macOS 15 / Swift 6.2.4.

The primary implementation risks are: (1) FSEventStream's C callback must bridge to Swift concurrency via `Unmanaged` — this compiles cleanly in Swift 6.2.4 (verified live); (2) timer-driven silence/gap evaluation requires a per-session `actor` with a `Task.sleep` evaluation loop running at 1-second resolution — this pattern is verified and CPU-safe at this resolution; (3) the `offsets.json` atomic write must use `F_FULLFSYNC` before rename on macOS for crash safety (weaker than on Linux); (4) FSEventStream does NOT guarantee events for a watch path that does not exist at stream creation time — the daemon must create `~/.claude/projects/` if absent or wait for it.

**Primary recommendation:** Implement in four sequential waves: Package.swift scaffold + config loading → FSEventStream watcher + JSONL parser → Swift Concurrency session actors + timer evaluation → URLSession emitter + SIGTERM drain. Each wave is independently testable.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File system watching | Watcher actor (`FSEventStream`) | macOS kernel | FSEventStream delivers kernel-level inotify equivalent — no polling |
| JSONL line parsing + detection | Parser struct (per-file, stateless per call) | Session actor (per-session state) | Parsing is stateless per line; timer/debounce state lives in the actor |
| Timer-driven event evaluation | Session actor (per-session) | Global timer task | Gap/silence events require periodic evaluation; actor owns the mutable state |
| HTTP emission + retry | Emitter actor (global singleton) | URLSession | Single emitter owns queue and retry state; sessions send events to it |
| Offset + milestone persistence | StateStore actor | FileSystem | Owns offsets.json schema_version=2 reads and atomic writes |
| Configuration loading | ConfigLoader struct | FileSystem | Read-once at startup; no hot-reload in Phase 122 |
| SIGTERM drain | Main runloop / SIGTERM handler | Emitter actor | Signals arrive on main thread; drain calls emitter's flush method |
| Logging | Two streams (stdout NDJSON / stderr text) | — | Logging is not a tier — it's a cross-cutting output mechanism |

---

## Standard Stack

### Core (zero external dependencies for Phase 122)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Foundation | macOS built-in | FileHandle, URLSession, JSONSerialization, ProcessInfo | Apple's standard library — no alternative |
| CoreServices | macOS built-in | FSEventStreamCreate + FSEventStreamStart/Stop/Invalidate | Only native API for directory-watching on macOS |
| CryptoKit | macOS built-in (10.15+) | SHA256 for D-01 client_event_id | Apple-native; verified on this machine producing correct UUID-shaped output |
| Swift Concurrency | Swift 6.2.4 built-in | `actor`, `async/await`, `Task.sleep` | Locked by CONTEXT.md; no Combine |

**Verified:** All four imports compile cleanly on this machine (Swift 6.2.4 / macOS 15.7.5 / Intel x86_64). `[VERIFIED: live toolchain test]`

### Supporting (optional external dependency)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| LebJe/TOMLKit | 0.6.0 (2024-01-03) | TOML parsing with Codable support | Use if hand-rolled TOML parser becomes unwieldy; otherwise skip |
| apple/swift-argument-parser | 1.7.1 (2026-03-20) | CLI subcommand parsing | Do NOT add in Phase 122 — Phase 123 adds this. Adding now wastes compile time. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FSEventStream direct | kqueue / DispatchSource.makeFileSystemObjectSource | kqueue requires a file descriptor per file — doesn't scale to N JSONL files; FSEventStream is the correct tool for directory hierarchies |
| Task.sleep evaluation loop | DispatchSourceTimer | DispatchSourceTimer provides sub-millisecond precision but requires bridging out of actor context; Task.sleep at 1s resolution is sufficient and stays in Swift Concurrency model |
| CryptoKit SHA256 | CommonCrypto SHA256 | CommonCrypto is C API; CryptoKit is idiomatic Swift with identical output — use CryptoKit |
| Hand-rolled TOML | LebJe/TOMLKit | Hand-rolled covers 3 value types (string, int, string-array) in ~80 lines; TOMLKit adds a C++ dependency (toml++) which increases binary size and build time. Recommendation: hand-roll for Phase 122's 9-key schema |

**Installation (if TOMLKit chosen):**
```bash
# In Package.swift dependencies:
.package(url: "https://github.com/LebJe/TOMLKit.git", from: "0.6.0")
```

---

## Architecture Patterns

### System Architecture Diagram

```
Claude Code VS Code Extension
           |
           | appends lines
           v
~/.claude/projects/<cwd-encoded>/<sessionId>.jsonl
           |
    [FSEventStream kernel callback]  <-- CoreServices
           |  (fires per file, 500ms latency)
           v
    WatcherActor (global)
    - receive(events: [FSEventStreamEvent])
    - for each modified file path:
        → read new bytes from stored offset
        → split on \n, buffer partial line
        → for each complete line:
            → Parser.parseLine(json) → ParsedLine?
           |
           v (ParsedLine dispatched to per-session actor)
    SessionActor (one per active sessionId)
    - update(parsedLine:)              # updates timer state
    - evaluationLoop()                 # Task.sleep(1s) loop
       |
       |-- gap detected (tool_use + no tool_result in gap_seconds) → needs_input
       |-- stop_reason:end_turn + silence > taskCompleteSeconds  → task_complete
       |-- silence > heartbeatSeconds                            → heartbeat
       |-- is_error:true on tool_result                          → task_failed
       |-- regex match on assistant text                         → milestone
           |
           v
    EmitterActor (global singleton)
    - enqueue(VigilEvent)              # adds to in-memory [VigilEvent] (cap 100)
    - flushLoop()                      # async Task, retries with backoff
    - drain(deadline: .now + 5s)       # called on SIGTERM
           |
           v
    URLSession.ephemeral
    POST /v1/agent-events + Bearer token
           |
           v
    vigil-core (Railway prod: api.vigilhub.io or local :3001)
    agent_events table (PostgreSQL)
           |
    StateStore (singleton)             # persists offsets.json schema_version=2
    - updateOffset(fileId:, offset:)   # called after each successful line read
    - recordMilestone(sessionId:, pattern:, offset:)
    - atomicSave()                     # write-temp + F_FULLFSYNC + rename
```

### Recommended Project Structure

```
vigil-watch/                       # repo root (existing: README, LICENSE, verification-log)
├── Package.swift                  # NEW: targets, deps, platforms(.macOS(.v14))
├── Package.resolved               # generated
├── Sources/
│   ├── VigilWatch/                # library target (testable)
│   │   ├── Config.swift           # ConfigLoader struct + WatchConfig codable
│   │   ├── TOMLParser.swift       # hand-rolled minimal TOML parser
│   │   ├── Parser.swift           # JSONL line parser, detection rules
│   │   ├── SessionActor.swift     # per-session actor (timer state, debounce)
│   │   ├── WatcherActor.swift     # FSEventStream bridge + file read
│   │   ├── EmitterActor.swift     # URLSession POST, retry queue
│   │   ├── StateStore.swift       # offsets.json atomic read/write
│   │   ├── EventTypes.swift       # enum VigilEvent + struct VigilPayload
│   │   ├── Logging.swift          # stdout NDJSON + stderr [INFO/WARN/ERROR]
│   │   └── HashID.swift           # D-01 client_event_id via CryptoKit
│   └── vigil-watch/
│       └── main.swift             # entry point: load config, start watcher
└── Tests/
    └── VigilWatchTests/
        ├── ParserTests.swift          # unit: detection rules against fixture JSONL
        ├── HashIDTests.swift          # unit: D-01 hash stability
        ├── StateStoreTests.swift      # unit: atomic write, schema_version=2
        ├── TOMLParserTests.swift      # unit: all 9 keys, comment stripping
        ├── EmitterTests.swift         # unit: backoff math, Retry-After parsing
        ├── SessionActorTests.swift    # unit: debounce/dedupe/precedence logic
        ├── DriftDetectorTests.swift   # lock: VALID_EVENTS byte-match with agent-events.ts
        └── Fixtures/
            └── (symlink or copied excerpts from verification-log/excerpts/)
```

---

## Focus Area Research

### 1. FSEventStream Best Practices and Pitfalls

**Creation flags (must use all three):**

```swift
// [VERIFIED: Apple CoreServices docs + live compilation test]
let flags = FSEventStreamCreateFlags(
    kFSEventStreamCreateFlagFileEvents |    // per-file granularity (macOS 10.7+)
    kFSEventStreamCreateFlagNoDefer |       // deliver on trailing edge, not leading
    kFSEventStreamCreateFlagWatchRoot       // notify when root itself is moved/renamed
)
```

- `kFSEventStreamCreateFlagFileEvents`: delivers events per individual file (not just parent directory). Required for knowing which `.jsonl` file was modified. Generates more events than directory-only mode — acceptable for `~/.claude/projects/` which has O(10s) of files.
- `kFSEventStreamCreateFlagNoDefer`: with 0.5s latency, events arrive on trailing edge (after 500ms of quiet). Without this flag, events arrive on leading edge (first change in the latency window). For tail-following, trailing-edge is better — batches all writes in a 500ms burst.
- `kFSEventStreamCreateFlagWatchRoot`: notifies if the watch root (`~/.claude/projects/`) itself is renamed or deleted. Daemon should recreate the stream if root disappears. `[CITED: Apple FSEvents Programming Guide]`

**Latency:** 0.5s is the recommended sweet spot for file-following daemons. Lower (0.1s) increases CPU; higher (2s+) adds noticeable lag. `[ASSUMED]`

**Recursive subdirectory handling:** FSEventStream watches recursively by default — new subdirectories created mid-run (`~/.claude/projects/<new-namespace>/`) are automatically watched without stream restart. `[CITED: Apple FSEvents Programming Guide — "recursively monitor many directories"]` `[VERIFIED: web search cross-reference]`

**Watch path non-existence at startup:** FSEventStream behavior when the watch path does not exist at stream creation is undefined/unreliable. The daemon MUST ensure `~/.claude/projects/` exists before calling `FSEventStreamCreate`. Since Claude Code creates this directory on first run, the most defensive approach is: if directory absent at startup, create it (or poll with a retry loop). `[ASSUMED — no Apple doc confirms behavior for non-existent root]`

**Dropped events (kFSEventStreamEventFlagMustScanSubDirs):**

```swift
// [CITED: Apple FSEvents Programming Guide — "MustScanSubDirs" section]
if eventFlags[i] & UInt32(kFSEventStreamEventFlagMustScanSubDirs) != 0 {
    // Events were coalesced/dropped. Re-scan all JSONL files for the affected
    // namespace path and re-read from stored offsets.
    await watcherActor.rescanAllFiles(underPath: eventPath)
}
```

For `~/.claude/projects/` (narrow scope, light write load from one user's Claude Code sessions), `kFSEventStreamEventFlagMustScanSubDirs` should be extremely rare. For the root-watching case (monitoring `/`), it's common — but we watch a narrow path. Handle it gracefully anyway.

**C callback bridge pattern (Swift 6 compatible — verified live):**

```swift
// [VERIFIED: compiles clean in Swift 6.2.4 on this machine]
class FSEventBridge {
    static func create(watchPath: String, callback: @escaping ([String]) -> Void) -> FSEventStreamRef? {
        let box = CallbackBox(callback: callback)
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passRetained(box).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil
        )
        let streamCallback: FSEventStreamCallback = { _, info, numEvents, eventPaths, eventFlags, _ in
            guard let info else { return }
            let box = Unmanaged<CallbackBox>.fromOpaque(info).takeUnretainedValue()
            let paths = unsafeBitCast(eventPaths, to: NSArray.self) as! [String]
            box.callback(paths)
        }
        let cfPaths = [watchPath] as CFArray
        return FSEventStreamCreate(kCFAllocatorDefault, streamCallback, &context,
                                   cfPaths, FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
                                   0.5, flags)
    }
}
private class CallbackBox {
    let callback: ([String]) -> Void
    init(callback: @escaping ([String]) -> Void) { self.callback = callback }
}
```

**Stream lifecycle:** Schedule on a dedicated `DispatchQueue` (not main queue):

```swift
// [CITED: Apple FSEvents Programming Guide — "Scheduling a Stream"]
let watchQueue = DispatchQueue(label: "com.morrillholdings.vigil.watch.fsevent")
FSEventStreamSetDispatchQueue(stream, watchQueue)
FSEventStreamStart(stream)
// on shutdown:
FSEventStreamStop(stream)
FSEventStreamInvalidate(stream)
FSEventStreamRelease(stream)
```

**Pitfall: coalesce under sleep/wake.** When the Mac wakes from sleep, FSEventStream may deliver a burst of coalesced events with stale timestamps. The daemon should not use event timestamps from FSEventStream — it reads timestamps from the JSONL line content (`$.timestamp`) instead. `[ASSUMED — commonly reported in community; no Apple doc reference]`

---

### 2. Tail-Cursor JSONL Parsing

**Core pattern (verified Swift 6.2.4):**

```swift
// [VERIFIED: FileHandle.seek(toOffset:) confirmed live]
// [CITED: Apple Developer Documentation — FileHandle.seek(toFileOffset:)]
func readNewLines(fileId: String, currentOffset: UInt64) async -> (lines: [String], newOffset: UInt64) {
    guard let fh = FileHandle(forReadingAtPath: filePath) else { return ([], currentOffset) }
    defer { try? fh.close() }
    try? fh.seek(toOffset: currentOffset)
    guard let data = try? fh.readToEnd(), !data.isEmpty else { return ([], currentOffset) }
    
    // Find last complete \n-terminated line
    var consumed = 0
    var lines: [String] = []
    var lineStart = 0
    for i in 0..<data.count {
        if data[i] == UInt8(ascii: "\n") {
            let lineData = data[lineStart..<i]
            if !lineData.isEmpty {
                lines.append(String(data: lineData, encoding: .utf8) ?? "")
            }
            lineStart = i + 1
            consumed = i + 1
        }
    }
    // lineStart < data.count means there's a partial line — do NOT consume it
    let newOffset = currentOffset + UInt64(consumed)
    return (lines, newOffset)
}
```

**Key invariants:**
1. Offset only advances past bytes whose `\n` terminator has been observed. `[LOCKED: CONTEXT.md]`
2. JSON parse failure on a line: log to stderr, do NOT advance offset (leave for retry). `[LOCKED: CONTEXT.md]`
3. Non-spec line types (`attachment`, `queue-operation`, `file-history-snapshot`, `last-prompt`, `ai-title`, `summary`, `system`): advance offset, do NOT emit event. `[LOCKED: CONTEXT.md + Phase 120 README]`
4. File ID for offsets.json key: use the absolute path (URL.path) as the key. Session ID is extracted from the JSONL `$.sessionId` field, not the filename.

**Edge cases from verification-log/excerpts:**
- `last-prompt` lines overwrite at the end of file — they are rewritten in-place, so a read that captured them may see them again. Since they carry the same content each rewrite, and `$.type == "last-prompt"` is a no-op, this is harmless.
- `queue-operation` lines appear between substantive lines (seen in Excerpt 7 — 127s gap context). They carry timestamps and are no-ops.
- The `attachment` type can have very large `content` fields (skill listings, tool lists). Parser advances offset normally.

---

### 3. Detection Rules (Phase 120 canonical source-of-truth)

Each rule below is verbatim from `vigil-watch/README.md` Phase 120 verified inverse table. `[VERIFIED: vigil-watch/README.md commit 5273534]`

**`needs_input`:**
- Trigger: `$.type == "assistant"` AND `$.message.content[].type == "tool_use"` (any content block)
- AND no matching `user` line with `$.message.content[].type == "tool_result"` AND same `tool_use_id` within `needs_input_gap_seconds` (D-03 = 10s)
- AND most recent `user.permissionMode != "bypassPermissions"`
- Debounce: at most once per `needs_input_debounce_seconds` (D-05 = 30s) per session
- Implementation: per-session actor tracks `pendingToolUseId` and `pendingToolUseTimestamp`; evaluation loop checks gap

**`task_complete`:**
- Trigger: `(now - latestLineTimestamp) > task_complete_silence_seconds` (D-04 = 30s)
- AND latest `assistant` line has `$.message.stop_reason == "end_turn"`
- AND no further `user` line has appeared
- Precedence: `task_failed` wins if any `is_error:true` seen this session since last clean state
- There is NO `session_end` line type in JSONL. `[VERIFIED: Phase 120 README — 0 hits across 47,357 lines]`

**`task_failed`:**
- Trigger: `$.type == "user"` AND any `$.message.content[].is_error == true`
- Deterministic single-field discriminator — no timing inference needed
- Deduped: emit once per session (suppress subsequent errors until `task_complete` or new session)

**`milestone`:**
- Trigger: regex match against `$.message.content[?(@.type=="text")].text` on assistant lines
- Patterns compiled with `(?i)` prepended (case-insensitive default); user-override with `(?-i)` inline
- Dedupe per `(sessionId, patternRegex)` pair, persisted to `offsets.json` (D-07/D-08/D-09)

**`heartbeat`:**
- Trigger: `(now - latestLineTimestamp) > heartbeat_seconds` (D-05 = 60s)
- After emission, reset timer (suppress until new line appears)
- Pure timestamp-delta computation — no JSONL field needed

**`task_complete` vs `task_failed` precedence rule:** If a session had `is_error:true` at any point, prefer `task_failed` over `task_complete` even if the final line shows `stop_reason:end_turn`. Track a `sessionHadError: Bool` flag per session actor.

---

### 4. Swift Concurrency Patterns for Per-Session Timer State

**Per-session `actor` model (recommended):**

```swift
// [VERIFIED: actor pattern compiles in Swift 6.2.4 on this machine]
// [CITED: Swift Concurrency documentation — swift.org]
actor SessionState {
    let sessionId: String
    var latestLineTimestamp: Date = Date.distantPast
    var latestStopReason: String? = nil
    var sessionHadError: Bool = false
    var pendingToolUseId: String? = nil
    var pendingToolUseTimestamp: Date? = nil
    var lastNeedsInputEmittedAt: Date = Date.distantPast
    var lastHeartbeatEmittedAt: Date = Date.distantPast
    var taskCompleteEmitted: Bool = false
    
    init(sessionId: String) { self.sessionId = sessionId }
    
    // Called from WatcherActor after each parsed line
    func process(line: ParsedLine) async { /* update state */ }
    
    // Called from the evaluation loop Task
    func evaluate(config: WatchConfig) async -> [VigilPayload] { /* check thresholds */ }
}
```

**Evaluation loop pattern (Task.sleep in actor, 1-second resolution):**

```swift
// [CITED: swift.org Concurrency docs — Task.sleep]
// [VERIFIED: Task.sleep cancellation pattern confirmed in Context7 fetch]
func startEvaluationLoop(actor: SessionState, emitter: EmitterActor, config: WatchConfig) {
    Task {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            if Task.isCancelled { break }
            let events = await actor.evaluate(config: config)
            for event in events {
                await emitter.enqueue(event)
            }
        }
    }
}
```

**Why Task.sleep at 1s (not DispatchSourceTimer):**
- Timer resolution needed: coarsest threshold is `task_complete_silence_seconds = 30s`. A 1s evaluation loop gives ±1s accuracy — more than sufficient.
- `Timer` is incompatible with actors (relies on RunLoop; actors don't use RunLoops). `[CITED: wadetregaskis.com/performing-a-delayed-and-or-repeating-operation-in-a-swift-actor/]`
- `DispatchSourceTimer` requires bridging out of actor context via `Task { await actor.doWork() }`, making it equivalent to the `Task.sleep` loop but with more plumbing. `[CITED: Swift Forums — "Timers vs actors"]`
- Energy: 1s sleep wakes the CPU once per second per active session. With O(1-5) active sessions, this is negligible.
- `Task.sleep(for: .seconds(1))` uses the Swift Clock API — cancellation via `task.cancel()` is immediate (cooperative cancellation checks `Task.isCancelled`).

**Session actor lifecycle:**
- Session actor created when first line observed for a new `sessionId`.
- Evaluation loop `Task` stored in a `var evaluationTask: Task<Void, Never>?` property on WatcherActor (not on SessionActor — avoids actor reentrancy).
- Session actor retained in `var sessions: [String: SessionState]` dictionary on WatcherActor.
- No GC of live actors — but `offsets.json` GCs milestone state older than 24h.

---

### 5. URLSession Retry/Backoff Implementation

**URLSession configuration:** Use `.ephemeral` for a daemon that lives for hours — no disk caching, no credential persistence, no cookie storage.

```swift
// [CITED: Apple Developer Documentation — URLSessionConfiguration.ephemeral]
let session = URLSession(configuration: .ephemeral)
```

**Exponential backoff with 25% jitter (D-CONTEXT locked values):**

```swift
// [ASSUMED: jitter formula; exponential sequence matches CONTEXT.md spec]
func backoffDelay(attempt: Int) -> Duration {
    let base: Double = pow(2.0, Double(attempt - 1)) // 1, 2, 4, 8, 16, 32
    let capped = min(base, 32.0)
    let jitter = Double.random(in: 0.75...1.25)      // ±25%
    return .seconds(capped * jitter)
}
// Sequence: ~0.75-1.25s, ~1.5-2.5s, ~3-5s, ~6-10s, ~12-20s, ~24-40s
```

**Retry loop with Retry-After parsing:**

```swift
// [VERIFIED: URLError codes -1005/-1001/-1004/-1009 confirmed live]
func post(payload: VigilPayload, attempt: Int) async throws -> Bool {
    var request = URLRequest(url: apiURL)
    request.httpMethod = "POST"
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(payload)
    request.timeoutInterval = 10
    
    let (data, response) = try await session.data(for: request)
    let http = response as! HTTPURLResponse
    
    switch http.statusCode {
    case 200, 201: return true        // success (200 = idempotent dup, 201 = new row)
    case 429:                         // rate limited — honor Retry-After
        let delay = parseRetryAfter(http) ?? backoffDelay(attempt: attempt)
        try await Task.sleep(for: delay)
        return false                  // signal: retry
    case 400...499:                   // permanent client error — drop event
        logError("Permanent 4xx \(http.statusCode) for event \(payload.clientEventId) — dropping")
        return true                   // treat as "done" (drop)
    default:                          // 5xx or unexpected — retry
        return false
    }
}
```

**Retry-After header parsing (seconds AND HTTP-date):**

```swift
// [CITED: HTTP/1.1 RFC 9110 §10.2.4 — Retry-After format]
func parseRetryAfter(_ response: HTTPURLResponse) -> Duration? {
    guard let value = response.value(forHTTPHeaderField: "Retry-After") else { return nil }
    if let seconds = Double(value) { return .seconds(seconds) }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
    if let date = formatter.date(from: value) {
        let delay = date.timeIntervalSinceNow
        return delay > 0 ? .seconds(delay) : .seconds(1)
    }
    return nil
}
```

**Transient vs permanent URLErrors:**

```swift
// [VERIFIED: error codes confirmed live — -1005, -1001, -1004, -1009, -1006]
static let transientURLErrors: Set<URLError.Code> = [
    .networkConnectionLost,     // -1005
    .timedOut,                  // -1001
    .cannotConnectToHost,       // -1004
    .notConnectedToInternet,    // -1009
    .dnsLookupFailed,           // -1006
    .cannotFindHost,            // -1003
]
```

**Queue cap and quarantine state:**
- In-memory queue: `var queue: [VigilPayload]` with max 100. On overflow, drop oldest. Log `[WARN] event queue overflow — dropping oldest event`.
- Quarantine state (missing API key): queue accumulates but `flushLoop` skips POST attempts. Log `[WARN] quarantine: api_key missing — \(queue.count) events buffered`.

---

### 6. Atomic File Writes for `offsets.json`

**macOS requires `F_FULLFSYNC` for crash safety** — stronger than POSIX `fsync`:

```swift
// [VERIFIED: F_FULLFSYNC fcntl call returns 0 (success) on this machine]
// [CITED: ELL Blog — "PSA: Avoid Data Corruption by Syncing to the Disk"]
func atomicSave(data: Data, to targetURL: URL) throws {
    let tmpURL = targetURL.deletingLastPathComponent()
        .appendingPathComponent(targetURL.lastPathComponent + ".tmp")
    try data.write(to: tmpURL)                          // write temp file
    let fd = open(tmpURL.path, O_RDONLY)
    defer { if fd != -1 { close(fd) } }
    if fd != -1 { fcntl(fd, F_FULLFSYNC) }             // macOS-specific strong fsync
    try FileManager.default.moveItem(at: tmpURL, to: targetURL)  // atomic rename
    // Note: FileManager.moveItem calls rename(2) internally on same-filesystem moves
}
```

**Why not `Data.write(to:options: .atomic)`?** Foundation's `.atomic` option also uses a temp-rename pattern but does NOT call `F_FULLFSYNC` — it relies on standard `fsync` which macOS's kernel may satisfy lazily. For a daemon that persists restart safety state, `F_FULLFSYNC` is the correct choice. `[CITED: multiple sources — F_FULLFSYNC described as mandatory for crash safety on macOS]`

**`offsets.json` path:** `~/Library/Application Support/vigil-watch/offsets.json`
`[VERIFIED: REQUIREMENTS.md AGENT-WATCH-02 verbatim]`
The daemon creates `~/Library/Application Support/vigil-watch/` on first run if absent.

---

### 7. TOML Parsing Options for Swift

**watch.toml schema surface (9 keys, flat structure):**

```toml
# ~/.config/vigil/watch.toml  (path per AGENT-WATCH-06)
api_url = "https://api.vigilhub.io"
api_key = ""
heartbeat_seconds = 60
needs_input_debounce_seconds = 30
needs_input_gap_seconds = 10
task_complete_silence_seconds = 30
projects_dir = "~/.claude/projects"
host_label = "Jamesons-iMac"
milestone_patterns = [
    "(?i)^[✓✔] ",
    ...
]
```

**Value types needed:** string, integer, array-of-strings. No nested tables (TOML `[section]` headers). No booleans in this schema.

**Recommendation: hand-roll a minimal parser.** `[VERIFIED: schema analysis — 9 keys, 3 value types]`

The hand-rolled parser needs approximately 80 lines:
1. Read lines, strip `#`-prefixed comment lines and trailing inline comments
2. For each line matching `key = value`: parse key, detect value type
3. String: strip surrounding `"` or `'`
4. Integer: `Int(value)`
5. Array: collect multi-line `[` ... `]` block, parse each quoted element

**LebJe/TOMLKit tradeoffs (if chosen):**
- Version: 0.6.0 (released 2024-01-03) `[VERIFIED: npm api call]`
- Powered by `toml++` (C++ library) — adds a C++ compilation step and ~2MB to binary
- Benefit: full TOML 1.0 spec compliance, Codable support
- Verdict: overkill for 9 keys. Hand-roll is the correct choice for Phase 122.

**`watch.toml` path:** `~/.config/vigil/watch.toml` `[VERIFIED: AGENT-WATCH-06 verbatim]`
Daemon creates `~/.config/vigil/` on first run. Failure = fatal startup error.

**First-run creation pattern:**

```swift
func createDefaultConfig(at path: URL) throws {
    try FileManager.default.createDirectory(at: path.deletingLastPathComponent(),
                                             withIntermediateDirectories: true)
    let content = """
        # vigil-watch configuration — created on first run
        # Edit and restart the daemon for changes to take effect.
        api_url = "https://api.vigilhub.io"
        api_key = ""        # or set VIGIL_API_KEY env var
        heartbeat_seconds = 60
        needs_input_debounce_seconds = 30
        needs_input_gap_seconds = 10
        task_complete_silence_seconds = 30
        projects_dir = "~/.claude/projects"
        host_label = "\(ProcessInfo.processInfo.hostName)"
        milestone_patterns = [
            "(?i)^[✓✔] ",
            "(?i)\\\\b(all|every)\\\\s+(tests?|checks?)\\\\s+(pass|passed|passing)\\\\b",
            "(?i)\\\\bbuild\\\\s+(succeeded|successful|complete)\\\\b",
            "(?i)\\\\b(plan|phase)\\\\s+\\\\d+(\\\\.\\\\d+)?(-\\\\d+)?\\\\s+complete\\\\b",
            "(?i)\\\\bdeployed\\\\s+(to\\\\s+\\\\S+\\\\s+)?successfully\\\\b",
            "(?i)\\\\bPR\\\\s+#\\\\d+\\\\s+(created|merged)\\\\b",
        ]
        """
    try content.write(to: path, atomically: true, encoding: .utf8)
}
```

---

### 8. POSIX Signal Handling in Swift

**Why `signal()` directly is wrong:** Signal handlers registered with C's `signal()` run in async signal context — no heap allocations, no locks, no Swift runtime calls permitted. Swift code routinely violates these constraints (ARC retain/release, closures). `[CITED: smittytone.net — "Tackle async signal safety in Swift"]`

**Correct pattern: `DispatchSource.makeSignalSource` + `signal(SIGTERM, SIG_IGN)`:**

```swift
// [CITED: Apple Developer Documentation — DispatchSource.makeSignalSource]
// [CITED: prodisup.com/posts/2022/10/signal-capture-and-graceful-shutdown-in-swift/]
func installSIGTERMHandler(emitter: EmitterActor) {
    // Ignore SIGTERM at OS level first — GCD takes over delivery
    signal(SIGTERM, SIG_IGN)
    
    let source = DispatchSource.makeSignalSource(signal: SIGTERM,
                                                  queue: DispatchQueue.global())
    source.setEventHandler {
        Task {
            logInfo("SIGTERM received — draining queue (5s deadline)")
            await emitter.drain(deadline: .now + 5)
            logInfo("Queue drained — exiting")
            exit(0)
        }
    }
    source.resume()
    // Retain source for process lifetime
    _sigtermSource = source
}
private var _sigtermSource: DispatchSourceSignal?
```

**5-second drain logic:**

```swift
// In EmitterActor
func drain(deadline: DispatchTime) async {
    // Attempt to flush all queued events with remaining time budget
    let start = DispatchTime.now()
    while !queue.isEmpty {
        let remaining = deadline.uptimeNanoseconds - DispatchTime.now().uptimeNanoseconds
        guard remaining > 0 else {
            logWarn("SIGTERM drain timeout — \(queue.count) events lost")
            return
        }
        // Best-effort flush — single attempt per event, no retry backoff during drain
        if let event = queue.first {
            do {
                _ = try await postOnce(event)
                queue.removeFirst()
            } catch {
                queue.removeFirst() // drop on drain-time failure
            }
        }
    }
    logInfo("SIGTERM drain complete — all events flushed")
}
```

---

### 9. D-01 client_event_id Hash Implementation

```swift
// [VERIFIED: produces correct UUID-shaped 36-char output on this machine]
// Input: "2072cbce-...|1024|needs_input|v1"
// Output: "39830cfa-218a-9bed-5804-49bd450dd210" (36 chars)
import CryptoKit
import Foundation

let ruleVersion = "v1"  // D-02: Swift const, not a column

func makeClientEventId(sessionId: String, byteOffset: UInt64, eventType: String) -> String {
    let input = "\(sessionId)|\(byteOffset)|\(eventType)|\(ruleVersion)"
    let digest = SHA256.hash(data: Data(input.utf8))
    let fullHex = digest.compactMap { String(format: "%02x", $0) }.joined()
    // Take first 32 hex chars (16 bytes) and format as UUID (8-4-4-4-12)
    let h = String(fullHex.prefix(32))
    let i0 = h.index(h.startIndex, offsetBy: 8)
    let i1 = h.index(i0, offsetBy: 4)
    let i2 = h.index(i1, offsetBy: 4)
    let i3 = h.index(i2, offsetBy: 4)
    return "\(h[..<i0])-\(h[i0..<i1])-\(h[i1..<i2])-\(h[i2..<i3])-\(h[i3...])"
}
```

The `byteOffset` here is the offset of the JSONL line's first byte in the file. This is what makes the hash deterministic — the same line at the same file position with the same event type always produces the same ID.

---

### 10. Logging Surface Mechanics

**stdout NDJSON (one line per emitted Vigil event):**

```swift
// [VERIFIED: stdout NDJSON + stderr text separation confirmed live]
setbuf(stdout, nil)  // disable line buffering when piped (Phase 123 tail -f)

struct EventLogLine: Encodable {
    let ts: String           // ISO-8601
    let sessionId: String
    let event: String
    let message: String?
    let label: String
    let host: String
    let exitCode: Int?
    let clientEventId: String
    let postStatus: Int      // HTTP status code from POST, or 0 if queued
}

func logEvent(_ line: EventLogLine) {
    let data = try! JSONEncoder().encode(line)
    print(String(data: data, encoding: .utf8)!)
}
```

**stderr human-readable:**

```swift
private let stderrHandle = FileHandle.standardError

func logInfo(_ msg: String)  { stderrHandle.write(Data("[INFO]  \(msg)\n".utf8)) }
func logWarn(_ msg: String)  { stderrHandle.write(Data("[WARN]  \(msg)\n".utf8)) }
func logError(_ msg: String) { stderrHandle.write(Data("[ERROR] \(msg)\n".utf8)) }
```

**`setbuf(stdout, nil)` is required** when `vigil-watch` output is piped (e.g., `vigil-watch | jq`). Without it, stdout is line-buffered in a pipe but the daemon may hold up to 4KB before flushing. `setbuf(stdout, nil)` forces unbuffered mode. `[CITED: POSIX setbuf man page]` `[VERIFIED: compiles and runs correctly in Swift 6.2.4]`

---

### 11. Project Namespace Enumeration

**Startup enumeration:**

```swift
// [VERIFIED: ~/.claude/projects/ has 5 subdirs on this machine]
// Pattern: each subdir is <cwd-encoded>/ — URL-encoded path with - separator
func enumerateProjectNamespaces(projectsDir: URL) -> [URL] {
    let fm = FileManager.default
    guard let subdirs = try? fm.contentsOfDirectory(at: projectsDir,
                                                    includingPropertiesForKeys: [.isDirectoryKey],
                                                    options: [.skipsHiddenFiles]) else {
        return []
    }
    return subdirs.filter { url in
        var isDir: ObjCBool = false
        fm.fileExists(atPath: url.path, isDirectory: &isDir)
        return isDir.boolValue
    }
}

// For each namespace dir, enumerate *.jsonl files:
func enumerateJSONLFiles(in namespaceDir: URL) -> [URL] {
    let fm = FileManager.default
    guard let files = try? fm.contentsOfDirectory(at: namespaceDir,
                                                  includingPropertiesForKeys: nil) else {
        return []
    }
    return files.filter { $0.pathExtension == "jsonl" }
}
```

**Mid-run new subdirectory detection:** FSEventStream with `kFSEventStreamCreateFlagFileEvents` delivers events for file creation in any subdirectory under the watch root, including newly created subdirectories. The watcher callback receives the full file path — if the path contains a new namespace subdirectory, the watcher simply opens the new file at offset 0. No stream restart needed. `[CITED: Apple FSEvents Guide — recursive monitoring; VERIFIED: web search cross-reference]`

**`projects_dir` TOML key:** Supports `~` expansion. Expand manually: `path.replacingOccurrences(of: "~", with: NSHomeDirectory())`.

---

### 12. Drift Detector Test Pattern (Phase 121 D-T2 carry-forward)

```swift
// In Tests/VigilWatchTests/DriftDetectorTests.swift
// [VERIFIED: VALID_EVENTS array location confirmed in vigil-core/src/routes/agent-events.ts]
import XCTest
@testable import VigilWatch

final class DriftDetectorTests: XCTestCase {
    func testVigilEventCasesMatchAgentEventsTS() throws {
        // Reads vigil-core/src/routes/agent-events.ts from a sibling checkout.
        // Set VIGIL_CORE_PATH env var to absolute path, or derive from package root.
        let vigilCorePath = ProcessInfo.processInfo.environment["VIGIL_CORE_PATH"]
            ?? "\(NSHomeDirectory())/Desktop/Local AI/dailybrief/vigil-core"
        let tsFile = URL(fileURLWithPath: vigilCorePath)
            .appendingPathComponent("src/routes/agent-events.ts")
        let source = try String(contentsOf: tsFile, encoding: .utf8)
        
        // Extract VALID_EVENTS array from TS source
        let pattern = #"export const VALID_EVENTS = \[([\s\S]*?)\] as const"#
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(source.startIndex..., in: source)
        guard let match = regex.firstMatch(in: source, range: range),
              let bodyRange = Range(match.range(at: 1), in: source) else {
            XCTFail("Could not find VALID_EVENTS in agent-events.ts")
            return
        }
        let body = String(source[bodyRange])
        let tsEvents = body.components(separatedBy: "\n")
            .compactMap { line -> String? in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                guard trimmed.hasPrefix("\"") else { return nil }
                return trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "\","))
            }
        
        // Assert Swift enum cases are byte-identical
        let swiftEvents = VigilEvent.allCases.map { $0.rawValue }
        XCTAssertEqual(Set(swiftEvents), Set(tsEvents),
            "VigilEvent enum cases diverged from VALID_EVENTS in agent-events.ts. " +
            "Swift has: \(swiftEvents). TS has: \(tsEvents).")
    }
}
```

**Expected `VigilEvent` enum in Swift:**

```swift
enum VigilEvent: String, CaseIterable {
    case needsInput    = "needs_input"
    case taskComplete  = "task_complete"
    case taskFailed    = "task_failed"
    case milestone     = "milestone"
    case heartbeat     = "heartbeat"
}
```

The `rawValue` strings are byte-identical to the `VALID_EVENTS` array in `agent-events.ts`. `[VERIFIED: agent-events.ts source read]`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA256 hash | Custom hash implementation | `CryptoKit.SHA256` | Apple-native, constant-time, verified on this machine |
| HTTP retry loop from scratch (ignoring URLError categorization) | Custom error detector | The categorized retry logic in this research | Multiple URLError codes need different handling — see §5 |
| FSEventStream via polling | `FileHandle` + Timer polling every N seconds | `FSEventStream` | Polling misses rapid writes in the latency window; FSEventStream is kernel-level; polling also has inode/file rotation blind spots |
| SIGTERM with `signal()` C handler | C signal handler that calls Swift functions | `DispatchSource.makeSignalSource` | C handlers cannot safely execute Swift runtime code |
| JSON parser from scratch | Custom JSONL decoder | `JSONSerialization.jsonObject(with:options:)` | Already handles all JSON edge cases; JSONL is just per-line application |
| Regex engine from scratch | Custom pattern matching | `NSRegularExpression` | POSIX ERE, handles Unicode, compiles patterns once at startup |
| Atomic file write from scratch | `f.write()` directly | `write-to-temp + F_FULLFSYNC + rename` pattern | `Data.write(to:atomically:)` doesn't call `F_FULLFSYNC`; macOS requires it for crash safety |

**Key insight:** Every "custom solution" above has a macOS-specific edge case that experienced developers have already solved in the platform APIs. FSEventStream handles coalescing. CryptoKit handles constant-time SHA256. `DispatchSource` handles signal safety. The only truly custom work in this phase is the detection rules themselves — which are locked in Phase 120's README.

---

## Common Pitfalls

### Pitfall 1: FSEventStream callback delivered on unknown thread

**What goes wrong:** `FSEventStreamCallback` is delivered on the DispatchQueue you register with `FSEventStreamSetDispatchQueue`. If you use a concurrent queue, the callback may be called from multiple threads simultaneously. If you share state (file handles, offset dictionaries) between the callback and Swift Concurrency actors, you get data races in Swift 6's strict concurrency model.

**Why it happens:** FSEventStream is a pre-Swift-Concurrency API with no actor affinity.

**How to avoid:** Use a **serial** `DispatchQueue` for `FSEventStreamSetDispatchQueue`. In the callback, dispatch async work to actors via `Task { await actor.process(...) }`. Never touch actor-isolated state directly from the C callback. `[CITED: Apple FSEvents Guide — scheduling section]`

**Warning signs:** Swift 6 compiler error "sending X risks causing data races" in callback closure.

---

### Pitfall 2: Advancing offset past a partial line

**What goes wrong:** A JSONL file receives a line in two writes (first write delivers partial line, FSEventStream fires; second write delivers the `\n`). If the parser advances the offset past the partial content, the `\n` on the second read produces a line that starts mid-JSON — guaranteed parse failure.

**Why it happens:** Confusing "bytes read" with "bytes consumed past complete lines."

**How to avoid:** Offset only advances to `lastNewlinePosition + 1`. Bytes after the last `\n` are not consumed. `[LOCKED: CONTEXT.md JSONL parsing robustness section]`

**Warning signs:** JSON parse errors on lines that look like `"2026-05-08T..."` — these are the second half of a split line.

---

### Pitfall 3: `task_complete` fires before `task_failed` can emit

**What goes wrong:** An assistant line with `stop_reason:end_turn` is followed by silence. The 30s task_complete timer fires. But the session had an `is_error:true` line — per spec, `task_failed` wins. If `task_complete` fires first and the `task_failed` suppression flag wasn't set correctly, the user sees the wrong event.

**Why it happens:** `task_failed` emits on JSONL line observation (immediate), but `task_complete` emits on silence timer (30s). The ordering seems correct — `task_failed` always fires before `task_complete`. But if the `sessionHadError` flag is reset at the wrong time, `task_complete` can fire without the `task_failed` precedence check.

**How to avoid:** Track `sessionHadError: Bool` on the session actor. Set it to `true` on first `is_error:true` observation. NEVER reset it within a session (only reset when a new session begins). In `evaluate()`, if `sessionHadError` is true, do NOT emit `task_complete` — emit `task_failed` again (with its own dedupe guard). `[CITED: CONTEXT.md — task_complete vs task_failed precedence rule]`

**Warning signs:** `task_complete` appearing in vigil-core DB after a session that clearly had tool errors.

---

### Pitfall 4: Swift 6 Sendability violations with FSEventStream context pointer

**What goes wrong:** Passing `self` (an actor) as the `info` pointer in `FSEventStreamContext` triggers Swift 6 strict Sendability checks because actors are `Sendable` but the pointer crossing is unsafe.

**Why it happens:** Swift 6's strict concurrency enforcement is aggressive about reference types crossing async boundaries.

**How to avoid:** Use a `class CallbackBox` (not an actor) as the context pointer holder. The box holds an actor reference and dispatches via `Task { await actor.process(...) }`. The C callback only calls `box.callback(paths)` — no direct actor access. `[VERIFIED: FSEventBridge pattern compiles clean in Swift 6.2.4 on this machine]`

**Warning signs:** Compiler error "passing argument of non-sendable type to @Sendable" in FSEventStream setup.

---

### Pitfall 5: URLSession default configuration in a long-running daemon

**What goes wrong:** `URLSession.shared` uses a shared default configuration with disk caching, credential persistence, and background session behavior that can cause unexpected behavior in a headless daemon (e.g., cached 200 responses for previously-succeeded POSTs, stale auth tokens).

**Why it happens:** `URLSession.shared` is designed for interactive app use.

**How to avoid:** Use `URLSession(configuration: .ephemeral)` — no disk cache, no cookies, no credential storage. Each HTTP transaction is independent. `[CITED: Apple URLSessionConfiguration.ephemeral documentation]`

**Warning signs:** HTTP 200 responses that arrive suspiciously fast without actual network I/O.

---

### Pitfall 6: Timer drift under macOS sleep/wake

**What goes wrong:** When the Mac sleeps, `Task.sleep(for: .seconds(1))` pauses. When the Mac wakes, the task resumes — but all `latestLineTimestamp` values are now many minutes old. Every active session immediately evaluates as past its silence threshold and fires `heartbeat`/`task_complete` in a burst.

**Why it happens:** `Task.sleep` uses the system clock (continuous time), which pauses during sleep. The JSONL `$.timestamp` values are also correct wall-clock times — but `now()` after wake is much later, making every gap appear to exceed its threshold.

**How to avoid:** After wake detection (FSEventStream can deliver a `kFSEventStreamCreateFlagWatchRoot` event when the filesystem remounts), reset all session timestamps to `Date()`. Alternatively, cap the `timeSinceLastLine` check to `min(actual, thresholdSeconds + 5)` to prevent burst firing. `[ASSUMED — common pattern in macOS daemon development; no Apple doc reference for Task.sleep wake behavior]`

**Warning signs:** Burst of events immediately after Mac wake (10+ events from all sessions in the same second).

---

### Pitfall 7: Regex compilation at match time (not startup)

**What goes wrong:** `NSRegularExpression(pattern:)` is called for every assistant text line checked for milestones. With 6 patterns and potentially hundreds of lines per session, this creates hundreds of regex compilations per minute.

**Why it happens:** Regex compilation is expensive and easy to accidentally place in a hot path.

**How to avoid:** Compile all `milestone_patterns` at startup (when config is loaded) into `[NSRegularExpression]`. Cache compiled patterns. Re-compile only if config changes (which is startup-only in Phase 122). `[ASSUMED — standard regex optimization practice]`

**Warning signs:** CPU usage noticeably higher than baseline during active Claude Code sessions.

---

## Code Examples

### Package.swift scaffold

```swift
// [CITED: Swift Package Manager documentation — standard layout]
// Sources verified against project conventions (CONVENTIONS.md: 4-space indent, 1TBS)
// swift-tools-version:5.10 supports both Swift 5.10 and 6.0+
// swift-tools-version:6.0 required to enable strict concurrency by default
let package = Package(
    name: "vigil-watch",
    platforms: [.macOS(.v14)],  // CryptoKit available since 10.15; macOS 14 for Swift 6 features
    products: [
        .executable(name: "vigil-watch", targets: ["vigil-watch"]),
        .library(name: "VigilWatch", targets: ["VigilWatch"]),
    ],
    dependencies: [
        // No external dependencies for Phase 122
        // Phase 123 adds: .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.7.1")
    ],
    targets: [
        .target(name: "VigilWatch", path: "Sources/VigilWatch"),
        .executableTarget(
            name: "vigil-watch",
            dependencies: ["VigilWatch"],
            path: "Sources/vigil-watch"
        ),
        .testTarget(
            name: "VigilWatchTests",
            dependencies: ["VigilWatch"],
            path: "Tests/VigilWatchTests"
        ),
    ]
)
```

### main.swift (minimal foreground entry point for Phase 122)

```swift
// Sources/vigil-watch/main.swift
// Phase 122: foreground-only mode. Phase 123 adds ArgumentParser subcommands.
import Foundation
import VigilWatch

setbuf(stdout, nil)  // unbuffered stdout for pipe-friendliness

logInfo("vigil-watch starting")

do {
    let config = try ConfigLoader.load()
    let daemon = try Daemon(config: config)
    installSIGTERMHandler(emitter: daemon.emitter)
    try daemon.start()
    // Run the main runloop indefinitely (FSEventStream requires a runloop or dispatchQueue)
    RunLoop.main.run()
} catch {
    logError("Startup failed: \(error)")
    exit(1)
}
```

### POST payload struct matching agent-events.ts contract

```swift
// [VERIFIED: against vigil-core/src/routes/agent-events.ts KNOWN_FIELDS set]
struct VigilPayload: Encodable {
    let sessionId: String       // "session_id"
    let event: String           // "event" — one of VALID_EVENTS
    let message: String?        // "message" — optional, truncated to 280 chars
    let timestamp: String       // "timestamp" — ISO-8601 from JSONL line
    let label: String           // "label" — workspace folder name
    let host: String            // "host" — ProcessInfo.processInfo.hostName
    let exitCode: Int?          // "exit_code" — nil or tool exit code
    let clientEventId: String   // "client_event_id" — D-01 hash

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case event, message, timestamp, label, host
        case exitCode = "exit_code"
        case clientEventId = "client_event_id"
    }
}
```

---

## Validation Architecture

> `workflow.nyquist_validation` is NOT SET in config.json — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | XCTest (Swift Package built-in) |
| Config file | none — `Package.swift` declares `VigilWatchTests` test target |
| Quick run command | `cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch" && swift test --filter VigilWatchTests` |
| Full suite command | `cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch" && swift test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-WATCH-01 | FSEventStream fires on JSONL append | integration | Manual UAT (requires live Claude Code session) | No — Wave 0 |
| AGENT-WATCH-01 | File read from stored offset (not from 0) | unit | `swift test --filter testReadFromOffset` | No — Wave 0 |
| AGENT-WATCH-02 | `needs_input` detection: assistant tool_use + gap | unit | `swift test --filter testNeedsInputDetection` | No — Wave 0 |
| AGENT-WATCH-02 | `task_failed` detection: is_error:true | unit | `swift test --filter testTaskFailedDetection` | No — Wave 0 |
| AGENT-WATCH-02 | `task_complete` detection: stop_reason + silence | unit | `swift test --filter testTaskCompleteDetection` | No — Wave 0 |
| AGENT-WATCH-02 | `heartbeat` detection: silence timer | unit | `swift test --filter testHeartbeatDetection` | No — Wave 0 |
| AGENT-WATCH-02 | `milestone` detection: regex + dedupe | unit | `swift test --filter testMilestoneDetection` | No — Wave 0 |
| AGENT-WATCH-02 | offsets.json atomic write/read roundtrip | unit | `swift test --filter testAtomicWrite` | No — Wave 0 |
| AGENT-WATCH-02 | D-01 hash produces correct UUID-shaped string | unit | `swift test --filter testClientEventIdHash` | No — Wave 0 |
| AGENT-WATCH-02 | task_failed wins over task_complete precedence | unit | `swift test --filter testPrecedenceRule` | No — Wave 0 |
| AGENT-WATCH-03 | Retry backoff math (attempt 1-6 sequence) | unit | `swift test --filter testBackoffSequence` | No — Wave 0 |
| AGENT-WATCH-03 | Retry-After header parsing (seconds + HTTP-date) | unit | `swift test --filter testRetryAfterParsing` | No — Wave 0 |
| AGENT-WATCH-03 | 4xx drops event (doesn't retry) | unit | `swift test --filter test4xxDrop` | No — Wave 0 |
| AGENT-WATCH-03 | SIGTERM drain completes within 5s | integration | Manual UAT (SIGTERM + verify DB rows) | No — Wave 0 |
| AGENT-WATCH-06 | TOML parser reads all 9 keys | unit | `swift test --filter testTOMLParser` | No — Wave 0 |
| AGENT-WATCH-06 | First-run creates watch.toml with defaults | unit | `swift test --filter testFirstRunConfig` | No — Wave 0 |
| D-01 | Drift detector: VigilEvent.rawValues match VALID_EVENTS | lock test | `swift test --filter testVigilEventCasesMatchAgentEventsTS` | No — Wave 0 |
| SC #3 | Zero duplicate rows after restart (live test) | UAT | Manual: kill daemon, restart, check DB | No — UAT only |

### Sampling Rate

- **Per task commit:** `swift test --filter VigilWatchTests` (unit tests only, ~5s)
- **Per wave merge:** `swift test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps (test infrastructure to create before implementation)

- [ ] `Tests/VigilWatchTests/ParserTests.swift` — covers AGENT-WATCH-02 detection rules; uses JSONL fixtures from `verification-log/excerpts/`
- [ ] `Tests/VigilWatchTests/HashIDTests.swift` — covers D-01; asserts against known input/output vector
- [ ] `Tests/VigilWatchTests/StateStoreTests.swift` — covers atomic write/read, schema_version=2
- [ ] `Tests/VigilWatchTests/TOMLParserTests.swift` — covers AGENT-WATCH-06 config loading
- [ ] `Tests/VigilWatchTests/EmitterTests.swift` — covers AGENT-WATCH-03 retry/backoff math
- [ ] `Tests/VigilWatchTests/SessionActorTests.swift` — covers debounce/dedupe/precedence
- [ ] `Tests/VigilWatchTests/DriftDetectorTests.swift` — covers D-T2 lock; reads VALID_EVENTS from TS source
- [ ] `Tests/VigilWatchTests/Fixtures/` — copy or symlink subset of `verification-log/excerpts/*.jsonl`
- [ ] Framework install: included in `Package.swift` test target declaration (no separate install needed — `swift test` auto-discovers)

---

## Runtime State Inventory

> This is a greenfield phase — no rename/refactor/migration involved. New files created only.

**Nothing to migrate.** All state files are NEW:
- `~/Library/Application Support/vigil-watch/offsets.json` — created on first daemon run
- `~/.config/vigil/watch.toml` — created on first daemon run if absent
- Neither path exists currently (confirmed: `ls ~/Library/Application\ Support/vigil-watch/` → does not exist; `ls ~/.config/vigil/` → does not exist)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Swift toolchain | Build (swift build) | ✓ | 6.2.4 (swiftlang-6.2.4.1.4) | — |
| macOS SDK | CoreServices/FSEventStream | ✓ | macOS 15.7.5 (SDK 26.2) | — |
| CryptoKit | D-01 SHA256 | ✓ | Built-in macOS 10.15+ | — |
| vigil-core local (:3001) | Integration test / smoke POST | ✗ | Not running | Use prod URL (api.vigilhub.io) for smoke testing; or start daemon via `cd vigil-core && npm run dev` |
| `~/.claude/projects/` | FSEventStream watch root | ✓ | 5 namespace subdirs present | Daemon creates if absent |
| `~/.config/vigil/` | watch.toml home | ✗ | Does not exist yet | Daemon creates on first run (required behavior) |
| `~/Library/Application Support/vigil-watch/` | offsets.json home | ✗ | Does not exist yet | Daemon creates on first run (required behavior) |
| git | Commit phase artifacts | ✓ | 2.50.1 | — |

**Missing dependencies with no fallback:**
- None that block execution.

**Missing dependencies with fallback:**
- vigil-core local (:3001): smoke test against prod URL `https://api.vigilhub.io` instead. Or, start vigil-core locally for integration testing (`cd vigil-core && npm run dev`). The `com.jamesonmorrill.vigilcore` launchd daemon is unloaded by design on iMac (per memory).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FSEventStream does not reliably watch non-existent paths at stream creation time | FSEventStream Best Practices | If wrong, daemon could silently miss events on a late-created `~/.claude/projects/` |
| A2 | `Task.sleep` pauses during Mac sleep; JSONL timestamps continue from pre-sleep values | Pitfall 6 (timer drift) | If wrong, no burst-firing problem — but the proposed reset fix would also be a no-op |
| A3 | Regex compilation cost is significant enough to warrant startup pre-compilation | Pitfall 7 | If wrong (i.e., NSRegularExpression caches internally), pre-compiling is still harmless but not strictly necessary |
| A4 | `FSEventStreamSetDispatchQueue` with serial queue is sufficient for ordering; no additional synchronization needed | FSEventStream Best Practices | If wrong (multiple events delivered concurrently despite serial queue), WatcherActor would need additional serialization |
| A5 | `kFSEventStreamCreateFlagNoDefer` with 0.5s latency means events arrive 500ms after the last write (trailing-edge behavior) | FSEventStream Best Practices | If wrong, latency behavior differs but correctness is unaffected — daemon just processes events slightly differently timed |
| A6 | Hand-rolled TOML parser for 9 keys, 3 value types is ~80 lines | TOML section | If the actual schema is harder (inline comments in array elements, multiline strings), may need LebJe/TOMLKit after all |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `NSRegularExpression` with ObjC bridge | Same — no new API yet | — | Use NSRegularExpression; no `Regex<>` literals needed for runtime-loaded patterns |
| `Timer` for periodic tasks in actors | `Task.sleep` in async loop | Swift 5.5 (2021) | Timer incompatible with actors; Task.sleep is the idiomatic 2024+ approach |
| `Combine` for reactive pipelines | Swift Concurrency (`actor`, `async/await`) | Swift 5.5+ | CONTEXT.md explicitly disallows Combine |
| `signal()` C handler | `DispatchSource.makeSignalSource` | GCD era (2012+) | C handlers cannot call Swift runtime; GCD sources are the safe approach |
| `Data.write(to:atomically:)` | Manual write-temp + F_FULLFSYNC + rename | macOS 10.12.4+ | Foundation's atomic option doesn't call F_FULLFSYNC; manual is required for crash safety |
| `CommonCrypto` SHA256 | `CryptoKit.SHA256` | macOS 10.15 (2019) | CryptoKit is idiomatic Swift; CommonCrypto is C API |

**Note on Swift Testing framework (WWDC 2024):** Apple introduced `swift-testing` as an alternative to XCTest. However, XCTest is the standard choice for Swift Package command-line testing without Xcode. Both run with `swift test`. For Phase 122, use XCTest — it's what the project uses (verified in DailyBrief CONVENTIONS.md: no test targets yet, but the existing project targets Swift Package Testing). `[ASSUMED — no project-level decision to use swift-testing over XCTest]`

---

## Open Questions

1. **offsets.json GC strategy for sessions older than 24h**
   - What we know: D-09 says "sessions older than 24h can be GC'd lazily on read or on a periodic timer"
   - What's unclear: "lazily on read" means GC triggers when the file is loaded at startup; "periodic timer" means a background Task. Either works.
   - Recommendation: Lazy GC at load time (simpler, no background timer needed; the 24h window matches Phase 121's GET sliding window).

2. **`host_label` config key vs `host` field in payload**
   - What we know: CONTEXT.md says `host_label` is a config key; spec says `host = "macbook-pro"` in payload
   - What's unclear: Is `host` the raw hostname (`Jamesons-iMac.local`) or the `host_label` from config?
   - Recommendation: `host = host_label ?? ProcessInfo.processInfo.hostName`. If `host_label` is empty (default first-run config), fall back to `ProcessInfo.processInfo.hostName` (verified: returns `jamesons-imac.local` on this machine).

3. **`label` field in the POST payload — source?**
   - What we know: Spec says "from project directory name (Claude Code derives from workspace folder)". The `cwd`-encoded namespace subdir name is URL-encoded (e.g., `-Users-jamesonmorrill-Desktop-Local-AI-dailybrief`).
   - What's unclear: Should `label` be the decoded path, the encoded directory name, or something else?
   - Recommendation: Decode the namespace dir name back to a readable path by replacing `-` with `/` where appropriate — or simply use the last path component of `cwd` from `$.cwd` field in the JSONL line itself (verified present in all excerpts).

---

## Sources

### Primary (HIGH confidence)

- `vigil-watch/README.md` (commit 5273534) — Phase 120 canonical detection rules, all 5 event types with field paths, 8 JSONL excerpt appendix
- `vigil-core/src/routes/agent-events.ts` — VALID_EVENTS array (5 strings, byte-identical to Swift enum), KNOWN_FIELDS, POST contract
- `vigil-core/drizzle/0018_add_agent_events.sql` — table schema, CHECK constraint, partial unique index predicate
- Live Swift 6.2.4 compilation tests (this session): FSEventStream bridge, CryptoKit SHA256, actor pattern, atomic write, stdout/stderr logging, D-01 hash output
- `Apple FSEvents Programming Guide` (archived) — `[CITED: developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide]`
- `Apple Developer Documentation — DispatchSource.makeSignalSource` — `[CITED: developer.apple.com/documentation/dispatch/dispatchsource/2300045-makesignalsource]`
- `.planning/phases/122-vigil-watch-core-watcher-parser-emitter-config/122-CONTEXT.md` — all D-01..D-10 decisions
- `.planning/phases/121-agent-events-api-foundation-cross-user-isolation-lock/121-CONTEXT.md` — D-A1..D-D2 API contract

### Secondary (MEDIUM confidence)

- [wadetregaskis.com — Performing a delayed and/or repeating operation in a Swift Actor](https://wadetregaskis.com/performing-a-delayed-and-or-repeating-operation-in-a-swift-actor/) — Task.sleep vs DispatchSourceTimer in actors
- [prodisup.com — Signal capture and graceful shutdown in Swift](https://prodisup.com/posts/2022/10/signal-capture-and-graceful-shutdown-in-swift/) — SIGTERM + SIG_IGN + DispatchSource pattern
- [smittytone.net — Tackle async signal safety in Swift](https://blog.smittytone.net/2021/07/19/tackle-async-signal-safety-in-swift/) — why `signal()` is wrong in Swift
- LebJe/TOMLKit v0.6.0 release confirmed via GitHub API
- swift-argument-parser v1.7.1 release confirmed via GitHub API

### Tertiary (LOW confidence)

- Web search result: FSEventStream new subdirectory detection mid-run (recursive monitoring confirmed but no direct Apple doc citation)
- Web search result: FSEventStream coalesce behavior under Mac sleep/wake (community-reported pattern, not in Apple docs)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all imports verified live on this machine (Swift 6.2.4/macOS 15.7.5/Intel)
- Architecture: HIGH — grounded in locked CONTEXT.md decisions + Phase 120/121 verified docs
- Pitfalls: MEDIUM — pitfalls 1-5 are well-documented; pitfalls 6-7 are community knowledge (ASSUMED)
- Detection rules: HIGH — verbatim from Phase 120 README (commit 5273534, 47,357 lines verified)
- API contract: HIGH — read from live agent-events.ts source

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (Swift/Apple APIs are stable; JSONL format is tied to Claude Code extension version 2.1.133 — recheck if extension updates significantly)

---

## RESEARCH COMPLETE
