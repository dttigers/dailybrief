---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
plan: 04
subsystem: daemon-core
tags: [swift, spm, xctest, http-emitter, retry-backoff, ndjson-logging, bearer-masking, vigil-watch]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 00 Swift Package scaffold
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 01 EventTypes.swift — VigilPayload, VigilEvent, ParsedLine
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 03 Config.swift — WatchConfig, ConfigLoader
  - phase: 121-agent-events-api-foundation-cross-user-isolation-lock
    provides: POST /v1/agent-events endpoint + idempotency contract (D-C2 200-on-dup, D-A4 8 fields)

provides:
  - Logging.swift: EventLogLine struct + logEvent (stdout NDJSON) + logInfo/logWarn/logError (stderr [INFO]/[WARN]/[ERROR]) + maskBearer (T-122-01) + nowISO8601()
  - EmitterActor.swift: actor EmitterActor with HTTPClient protocol DI, enqueue/flushLoop/drain, exponential backoff, Retry-After parsing, 100-event FIFO queue with oldest-drop overflow, quarantine state
  - EmitterTests.swift: 15 XCTest cases covering all semantics — no real network required

affects:
  - 122-05 (milestone pattern matcher sits alongside emitter; SessionActor will call enqueue)
  - 122-06 (SessionActor calls EmitterActor.enqueue() for all 5 event types)
  - 122-08 (SIGTERM handler calls stopFlushLoop() + drain(deadlineSeconds: 5.0))
  - 122-09 (main.swift wires EmitterActor with DefaultHTTPClient + startFlushLoop)

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; Foundation URLSession used directly
  patterns:
    - HTTPClient protocol + DefaultHTTPClient adapter — testable URLSession abstraction without network
    - sleepFn injection in EmitterActor.init() — tests pass { _ in } for zero-delay backoff
    - Actor isolation: all mutable queue/quarantine state inside EmitterActor; public inspection via queueDepth()/isQuarantined()
    - static func backoffDelay(attempt:jitterFn:) — testable jitter injection separates math from randomness
    - static func parseRetryAfter(_:) — RFC 9110 §10.2.4 delta-seconds + HTTP-date both supported
    - NDJSON double-emit pattern: post_status=0 on enqueue, re-emit with actual HTTP status after postOnce()
    - maskBearer() NSRegularExpression applied to all stderr strings by logInfo/logWarn/logError

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Logging.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EmitterActor.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/EmitterTests.swift
  modified: []

key-decisions:
  - "HTTPClient + DefaultHTTPClient adapter: URLSession.ephemeral in production, StubHTTPClient in tests — no mocking framework required"
  - "sleepFn injected as (Duration) async throws -> Void: tests pass { _ in } to eliminate Task.sleep latency; production passes try await Task.sleep(for:)"
  - "NDJSON double-emit: first line (post_status=0) when event enters queue; second line with actual HTTP status after postOnce() — tail consumers see both enqueue and result"
  - "Requeue at BACK on exhausted attempts: per CONTEXT.md 'the event sits in the in-memory queue until the next emit triggers a fresh attempt sweep'; other events get a turn"
  - "nonisolated(unsafe) on stderrHandle: Swift compiler recognizes FileHandle as Sendable so annotation is redundant (warning only); left in place per plan spec + comment"
  - "200 OK treated as success (Phase 121 D-C2): idempotent duplicate at Postgres partial unique index level; daemon advances just like 201"

patterns-established:
  - "All log functions (logInfo/logWarn/logError) call maskBearer() before writing to stderr — T-122-01 closed by construction"
  - "EmitterActor.postOnce() is the single place Bearer token appears in an Authorization header; it is never passed to any log function"
  - "StubHTTPClient records all URLRequests in received[] — testBearerAuthHeaderSetOnRequest asserts the token is present on the wire"

requirements-completed: [AGENT-WATCH-03]

# Metrics
duration: 4min
completed: 2026-05-08
---

# Phase 122 Plan 04: HTTP Emitter + Logging Surface Summary

**Two-stream logging surface (stdout NDJSON + stderr text with bearer masking) and EmitterActor with locked retry/backoff/queue/drain semantics, URLSession dependency-injected behind HTTPClient protocol for deterministic test injection**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-08T22:00:47Z
- **Completed:** 2026-05-08T22:04:50Z
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- `Logging.swift`: `EventLogLine` Encodable struct with snake_case CodingKeys matching CONTEXT.md shape; `logEvent()` to stdout; `logInfo/logWarn/logError` to stderr with `[INFO]/[WARN]/[ERROR]` prefix; `maskBearer()` regex strips `Bearer <token>` from any string before stderr; `nowISO8601()` helper with fractional seconds + UTC Z
- `EmitterActor.swift`: Swift actor with `HTTPClient` protocol DI (`DefaultHTTPClient` uses `.ephemeral` URLSession); 100-event FIFO queue with oldest-dropped overflow; exponential backoff 1/2/4/8/16/32s capped at 32s with ±25% jitter; max 6 attempts per flush cycle then requeue at back; 429 honors `Retry-After` (RFC 9110 delta-seconds + HTTP-date); 4xx drops without retry; `drain(deadlineSeconds: 5.0)` best-effort flushes all queued events within wall-clock budget; quarantine state when `apiKey` is empty
- `EmitterTests.swift`: 15 XCTest cases; `StubHTTPClient` records all requests and returns scripted responses; zero real network I/O; `sleepFn: { _ in }` makes tests instantaneous

## Task Commits (vigil-watch repo)

Each task committed atomically in the vigil-watch repo:

1. **Task 4.1: Logging surface** - `2f7b468` (feat) — Logging.swift
2. **Task 4.2: EmitterActor** - `99d9064` (feat) — EmitterActor.swift
3. **Task 4.3: EmitterTests** - `987f47c` (test) — EmitterTests.swift

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Logging.swift` — two-stream logging surface; maskBearer() closes T-122-01
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EmitterActor.swift` — HTTP emitter actor with all CONTEXT.md retry/backoff/queue/drain semantics + HTTPClient protocol
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/EmitterTests.swift` — 15 XCTest cases; all green (55 total tests in suite)

## Decisions Made

- **HTTPClient protocol DI:** `StubHTTPClient` in tests returns scripted `(Data, URLResponse)` pairs without hitting any network. `DefaultHTTPClient` wraps `URLSession.ephemeral` (no persistent cookies/cache — correct for a daemon).
- **sleepFn injection:** Backoff sleep is passed as a closure, defaulting to `Task.sleep(for:)` in production. Tests pass `{ _ in }` to eliminate all delay — 15 EmitterTests complete instantaneously.
- **NDJSON double-emit pattern:** `enqueue()` logs `post_status=0` (queued); `postOnce()` re-logs with actual HTTP status. Downstream `tail` consumers can track event lifecycle from queue entry to HTTP outcome.
- **Requeue at BACK:** After 6 failed attempts, the event is appended to the back of the queue. This lets other events get processed and prevents one stuck event from blocking the whole queue.
- **200 = success:** Phase 121 D-C2 contract — the Postgres partial unique index silently dedupes duplicates with 200 OK. The daemon treats 200 identically to 201.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. The plan's reference implementation was complete and correct; no bugs discovered during implementation.

---

**Total deviations:** 0

## Known Stubs

None — EmitterActor is fully wired with real retry/backoff/queue/drain logic. No placeholder values in any data flow path. `DefaultHTTPClient` uses real URLSession; tests use `StubHTTPClient`. Bearer token flows through `Authorization` header only.

## Threat Surface Scan

**T-122-01 (bearer leak — Information disclosure):** CLOSED. `maskBearer()` applied to every string before reaching stderr in `logInfo/logWarn/logError`. `EmitterActor.postOnce()` sets `Authorization: Bearer \(config.apiKey)` in the request header only — apiKey is never passed to any log function. `testMaskBearerRedactsToken` pins this by construction. `testBearerAuthHeaderSetOnRequest` verifies the token IS present on the wire (correct auth, no leak to logs).

**T-122-RETRY (replay attacks):** Accepted per plan threat register. D-01 deterministic hash + Phase 121 partial unique index dedupe replays at the DB layer. No vigil-watch-side mitigation needed.

**T-122-NET (network DoS / memory exhaustion):** Accepted per plan threat register. 100-event cap bounds memory regardless of network duration. Quarantine state caps memory when api_key absent.

No new threat surface beyond the plan's threat model.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| Logging.swift exists | FOUND |
| `public struct EventLogLine` count=1 | FOUND |
| `public func logEvent` count=1 | FOUND |
| `public func logInfo` count=1 | FOUND |
| `public func logWarn` count=1 | FOUND |
| `public func logError` count=1 | FOUND |
| `public func maskBearer` count=1 | FOUND |
| `Bearer <redacted>` count>=1 | FOUND (2) |
| EmitterActor.swift exists | FOUND |
| `public actor EmitterActor` count=1 | FOUND |
| `public protocol HTTPClient: Sendable` count=1 | FOUND |
| `public static let queueCapacity = 100` count=1 | FOUND |
| `public static let maxAttempts` = 6 count=1 | FOUND |
| `public static func backoffDelay` count=1 | FOUND |
| `public static func parseRetryAfter` count=1 | FOUND |
| `Bearer ` count>=1 in EmitterActor.swift | FOUND (2) |
| `public func drain` count=1 | FOUND |
| `URLSession(configuration: .ephemeral)` count=1 | FOUND |
| EmitterTests.swift exists | FOUND |
| 15 `func test` methods | FOUND (15) |
| All named acceptance tests present | FOUND (all 11 checked) |
| `swift build` exits 0 | PASS |
| `swift test` exits 0 (55/55) | PASS |
| vigil-watch commit 2f7b468 | FOUND |
| vigil-watch commit 99d9064 | FOUND |
| vigil-watch commit 987f47c | FOUND |

---
*Phase: 122-vigil-watch-core-watcher-parser-emitter-config*
*Completed: 2026-05-08*
