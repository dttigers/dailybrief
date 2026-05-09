---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
verified: 2026-05-09T10:45:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
deferred:
  - truth: "testDaemonStartsAndStopsWithoutCrash SIGSEGV flake in test harness"
    addressed_in: "Phase 123"
    evidence: "Phase 123 success criteria: 'daemon survives 24 unattended hours on the user Mac under 30MB RSS without crashing'; operator decision documented in 122-09-SUMMARY.md Deferred Gaps table — repro rate <1/120, does not affect production daemon, only XCTest harness repeated start/stop"
  - truth: "Empty session_id lines slip through Parser → 400 + drop at vigil-core (data quality)"
    addressed_in: "Phase 123"
    evidence: "Phase 123 launchd + 24h soak will quantify frequency in practice; fix sized once empirical data is available; server's KNOWN_FIELDS guard correctly rejects, daemon's drop-on-4xx behavior is correct — operator decision documented in 122-09-SUMMARY.md Deferred Gaps table"
gaps: []
---

# Phase 122: vigil-watch core — watcher + parser + emitter + config Verification Report

**Phase Goal:** A locally-built `vigil-watch` Swift binary observes `~/.claude/projects/` via FSEventStream, parses each new JSONL line into the 5 Vigil event types per the detection rules locked in Phase 120, persists per-file byte offsets so daemon restarts don't replay history, POSTs events to Vigil Core with retry/backoff and a 100-event offline queue, and reads `~/.config/vigil/watch.toml` on startup.
**Verified:** 2026-05-09T10:45:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `swift build -c release` exits 0 — binary is buildable | VERIFIED | `Build complete! (0.23s)` — confirmed live |
| 2 | Parser emits all 5 Vigil event types per Phase 120 detection rules; byte offsets persisted in offsets.json schema_version=2 so restarts don't replay | VERIFIED | `SessionActor.swift` + `StateStore.swift` implement all 5 rules and D-09 schema; `StateStoreTests` (11 tests), `SessionActorTests` (17 tests), `ParserTests` (11 tests) all green |
| 3 | Emitter POSTs with retry/backoff (exp+jitter, 6 attempts, 429 Retry-After), 100-event FIFO queue with oldest-drop overflow, 5s SIGTERM drain | VERIFIED | `EmitterActor.swift` implements all three; `EmitterTests` (16 tests) green; quarantine fix (`6a2a00b`) correctly guards drain path |
| 4 | TOML config loaded from `~/.config/vigil/watch.toml` on startup; first-run creates defaults with all 8 keys; `api_key` falls back to `VIGIL_API_KEY` env var | VERIFIED | `Config.swift` `ConfigLoader.load()` implements full precedence chain; `ConfigTests` (10 tests) green including `testFirstRunCreatesDefaultsAtTempPath` and `testApiKeyEnvFallback` |
| 5 | `VigilEvent.allCases.map(\.rawValue)` is byte-identical to `VALID_EVENTS` in vigil-core `agent-events.ts` | VERIFIED | `DriftDetectorTests.testVigilEventCasesMatchAgentEventsTS` ran against live source and passed 1/1; both define exactly the 5 values: `needs_input`, `task_complete`, `task_failed`, `milestone`, `heartbeat` |

**Score:** 5/5 truths verified

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `testDaemonStartsAndStopsWithoutCrash` SIGSEGV flake (1/120 test runs) | Phase 123 | Operator decision: does not affect production daemon; 24h soak in Phase 123 will determine severity |
| 2 | Empty `session_id` lines slip through Parser → 400 drop at vigil-core | Phase 123 | 1 event dropped across full smoke window; correct behavior (server and daemon both handle correctly); fix sized after 24h soak data |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `/vigil-watch/Package.swift` | SPM manifest with VigilWatch library, vigil-watch executable, VigilWatchTests, platforms [.macOS(.v14)], resources [.copy("Fixtures")] | VERIFIED | Exists, matches scaffold verbatim including `resources: [.copy("Fixtures")]` |
| `/vigil-watch/Sources/VigilWatch/EventTypes.swift` | VigilEvent enum (5 cases), VigilPayload (8 fields), ParsedLine, deriveLabel helper | VERIFIED | All types present; `VigilEvent` rawValues byte-identical to vigil-core VALID_EVENTS |
| `/vigil-watch/Sources/VigilWatch/EmitterActor.swift` | URLSession retry/backoff, 100-event queue, 5s drain, quarantine guard | VERIFIED | Full implementation including quarantine-honoring `drain()` (post-smoke fix `6a2a00b`) |
| `/vigil-watch/Sources/VigilWatch/Config.swift` | WatchConfig + ConfigLoader with first-run create, env fallback, 8 TOML keys | VERIFIED | Full implementation with all D-03/D-04/D-05/D-10 defaults |
| `/vigil-watch/Sources/VigilWatch/StateStore.swift` | offsets.json schema_version=2, milestones_emitted, F_FULLFSYNC atomic write, 24h GC | VERIFIED | Full D-09 implementation; actor; atomic write via temp+fsync+rename |
| `/vigil-watch/Sources/VigilWatch/SessionActor.swift` | 5 detection rules, task_failed/task_complete precedence, needs_input debounce, label derivation | VERIFIED | All rules implemented; post-smoke fix `c3de707` landed label derivation with sticky semantics |
| `/vigil-watch/Sources/VigilWatch/FSEventBridge.swift` | Swift 6 safe FSEventStream wrapper, kFSEventStreamCreateFlagFileEvents, CallbackBox pattern | VERIFIED | Exists; correct flags; Unmanaged CallbackBox bridges C pointer safely |
| `/vigil-watch/Sources/VigilWatch/WatcherActor.swift` | Tail-cursor reads, partial-line buffer, namespace enumeration, lineHandler injection | VERIFIED | Full implementation; partial-buffer invariant simplified via post-smoke fix `a69414b` |
| `/vigil-watch/Sources/VigilWatch/Daemon.swift` | Composition root wiring all subsystems, 1Hz evaluation Task, start/stop lifecycle | VERIFIED | `public final class Daemon` with all 6 subsystem references and 1Hz tick |
| `/vigil-watch/Sources/vigil-watch/main.swift` | Real entry point: setbuf+ConfigLoader+Daemon+installSIGTERMHandler+RunLoop.main.run() | VERIFIED | Plan 00 stub replaced in commit `12e762a`; all 6 elements present |
| `/vigil-watch/Tests/VigilWatchTests/DriftDetectorTests.swift` | Reads agent-events.ts live, asserts byte-identical VALID_EVENTS | VERIFIED | VIGIL_CORE_PATH defaults to sibling monorepo; test ran and passed |
| `Tests/VigilWatchTests/Fixtures/` (6 files) | Phase 120 corpus fixtures: needs_input, tool_result_success, tool_result_error, assistant_end_turn, user_default_permission, non_spec_lines | VERIFIED | All 6 files present; non_spec_lines.jsonl = 7 lines confirmed |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.swift` | `ConfigLoader.load()` | direct call | WIRED | `let config = try ConfigLoader.load()` |
| `main.swift` | `Daemon(config:)` | async init | WIRED | `let daemon = try await Daemon(config: config)` |
| `main.swift` | `installSIGTERMHandler(emitter:)` | direct call | WIRED | `installSIGTERMHandler(emitter: daemon.emitter)` |
| `main.swift` | `RunLoop.main.run()` | direct call | WIRED | required for FSEventStream + DispatchSource |
| `Daemon.init` | `StateStore` | instantiation | WIRED | `store.loadOrCreate()` → milestones hydration |
| `Daemon.init` | `MilestoneMatcher(priorEmissions:)` | D-08 hydration | WIRED | `await store.priorEmissions()` feeds matcher |
| `Daemon.lineHandler` | `SessionRegistry.getOrCreate(sessionId:)` | closure capture | WIRED | all line types routed to session state |
| `SessionState.process(line:)` | `EmitterActor.enqueue(_:)` | returned events | WIRED | immediate-fire events (task_failed) enqueued |
| `MilestoneMatcher.scanForFirstTimeMatches(line:)` | `EmitterActor.enqueue(_:)` | milestone hits loop | WIRED | milestone payloads assembled and enqueued |
| `WatcherActor` | `StateStore` | offset read/write | WIRED | `getOffset` / `updateOffset` on every line |
| `FSEventBridge` | `WatcherActor.handleFileEvents(paths:)` | callback→Task | WIRED | `Task { await watcherActor.handleFileEvents(paths:) }` |
| `EmitterActor.postOnce` | `vigil-core /v1/agent-events` | URLSession POST | WIRED | `Bearer \(config.apiKey)` header; live smoke PASS |
| `EmitterActor.drain()` | quarantine guard | `guard !quarantined` | WIRED | post-smoke fix `6a2a00b` — prevents empty-bearer POSTs on SIGTERM |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SessionActor.process(line:)` | `ParsedLine` | `WatcherActor` tail-cursor reads from real JSONL files | Yes — reads disk bytes from stored offset | FLOWING |
| `EmitterActor` | `VigilPayload` queue | `SessionState` + `MilestoneMatcher` | Yes — populated from real parsed JSONL events | FLOWING |
| `StateStore` | `offsets.json` | updated per complete line consumed | Yes — F_FULLFSYNC atomic writes to disk | FLOWING |
| `ConfigLoader` | `WatchConfig` | `~/.config/vigil/watch.toml` or defaults | Yes — reads/creates real TOML file | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Release build succeeds | `swift build -c release` | `Build complete! (0.23s)` | PASS |
| Full test suite | `swift test` | 111 tests, 0 failures, 0 unexpected | PASS |
| Drift detector vs live vigil-core | `swift test --filter DriftDetectorTests` | 1/1 passed; Set equality confirmed | PASS |
| 6 Phase 120 fixture files present and non-empty | `ls Fixtures/` | All 6 files listed | PASS |
| non_spec_lines.jsonl has exactly 7 lines | `wc -l non_spec_lines.jsonl` | `7` | PASS |
| Package.swift has resources: [.copy("Fixtures")] | grep on Package.swift | Present | PASS |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AGENT-WATCH-01 | 122-00, 122-08, 122-09 | FSEventStream watcher, debounce rapid-fire writes per file | SATISFIED | `FSEventBridge.swift` + `WatcherActor.swift`; kFSEventStreamCreateFlagFileEvents + 0.5s latency; WatcherActorTests 10/10 green |
| AGENT-WATCH-02 | 122-00..09 | JSONL parser + 5 event types + offsets.json persisted per file | SATISFIED | `Parser.swift` + `SessionActor.swift` + `StateStore.swift`; D-09 schema_version=2; ParserTests + SessionActorTests + StateStoreTests all green |
| AGENT-WATCH-03 | 122-00, 122-04, 122-09 | POST with bearer, retry/backoff, 100-event queue, 5s SIGTERM drain | SATISFIED | `EmitterActor.swift` full implementation + quarantine fix; EmitterTests 16/16 green; DaemonIntegrationTests drain timing 4/4 green |
| AGENT-WATCH-06 | 122-00, 122-03, 122-09 | watch.toml on startup, first-run defaults, VIGIL_API_KEY fallback | SATISFIED | `Config.swift` ConfigLoader; ConfigTests 10/10 green including first-run and env-fallback tests |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | No stubs, placeholders, or TODO markers found in production source | — | — |

Scanned all 15 `.swift` files in `Sources/VigilWatch/` and `Sources/vigil-watch/`. No `return null`, `TODO`, `FIXME`, `PLACEHOLDER`, `return []` with no data source, or hardcoded-empty props found. Three post-smoke bug fixes were patched before phase close (commits `6a2a00b`, `a69414b`, `c3de707`).

---

## Human Verification Required

None. All 5 success criteria are verifiable programmatically via the swift test suite and codebase inspection. The live integration smoke test (smoke #1–#6 in 122-09-SUMMARY.md) was performed by the executor before phase close and is documented with pass/fail evidence. The two deferred items (SIGSEGV flake, empty session_id) are accepted by operator and tracked for Phase 123.

---

## Gaps Summary

No gaps. All phase-122 success criteria are met:

1. `swift build -c release` exits 0 (verified live).
2. All 5 Vigil event types are emitted by the correct detection rules (111 XCTest cases; all green).
3. offsets.json schema_version=2 with milestones_emitted persists across daemon restarts (StateStore + StateStoreTests).
4. EmitterActor implements the full retry/backoff/queue/drain contract including quarantine (EmitterTests 16/16; DaemonIntegrationTests 4/4).
5. ConfigLoader reads watch.toml with first-run creation and VIGIL_API_KEY fallback (ConfigTests 10/10).
6. DriftDetectorTests confirms VigilEvent enum is byte-identical to vigil-core VALID_EVENTS (live run: 1/1).

The two deferred items (SIGSEGV flake in test harness, empty-session_id data-quality edge case) are explicitly accepted by the operator and written into Phase 123's scope per the deferred-gaps decision in 122-09-SUMMARY.md. They are not phase-blockers.

---

_Verified: 2026-05-09T10:45:00Z_
_Verifier: Claude (gsd-verifier)_
