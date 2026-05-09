---
phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak
plan: 02
subsystem: infra
tags: [vigil-watch, swift, runtime-state, ipc, atomic-write, emitter, daemon, status, snake-case-codable, f-fullfsync]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: StateStore.swift atomic write pattern (temp+F_FULLFSYNC+rename) lifted verbatim into RuntimeStateWriter; EmitterActor with public read-only accessor idiom (queueDepth/isQuarantined) extended with currentSnapshot(); Daemon composition root with 1Hz evaluation tick where the new write call is appended; nowISO8601() helper used for startedAt capture
provides:
  - public actor RuntimeStateWriter with public func write(_ state: RuntimeState) throws — atomic-write IPC writer for the 1Hz runtime-state.json snapshot file at ~/Library/Application Support/vigil-watch/runtime-state.json
  - public struct RuntimeState (Codable, Sendable, Equatable) — D-04 NORMATIVE schema with explicit CodingKeys producing snake_case JSON keys (schema_version, pid, started_at, queue_depth, last_event_ts, last_event_session_id, last_event_type, quarantined)
  - EmitterActor.currentSnapshot() public accessor returning (queueDepth, lastEventTs, lastEventSessionId, lastEventType, quarantined) — 5-tuple matching RuntimeState's dynamic fields
  - EmitterActor.lastEnqueuedEvent private state tracking the most-recently enqueued payload (updated unconditionally at enqueue entry, even for events dropped by FIFO overflow)
  - Daemon.runtimeStateWriter / Daemon.startedAt / Daemon.pid immutable instance properties, initialized at Daemon.init alongside resolvedHost
  - Additive 1Hz tick wiring in Daemon.start() — captures writerRef/pidRef/startedAtRef as locals, assembles RuntimeState from the emitter snapshot, calls try? await writerRef.write(state) at the end of the existing while-loop body
  - 4 RuntimeStateWriterTests cases (file creation, atomicity, snake_case schema drift detector, full round-trip) + 1 new EmitterTests.testCurrentSnapshotShape case
affects: [123-03 Run subcommand foreground daemon body — first runtime-state.json gets written within 1s of Run starting, 123-04 Status subcommand reads runtime-state.json and uses the same RuntimeState struct via the same CodingKeys, 123-05 24h soak gate verifies runtime-state.json freshness as one liveness signal]

# Tech tracking
tech-stack:
  added: []  # No new dependencies; reuses Foundation, JSONEncoder, FileManager, fcntl/F_FULLFSYNC
  patterns:
    - "atomic-write IPC file pattern: temp + data.write(to:) + fcntl(F_FULLFSYNC) + moveItem (rename(2)) — lifted verbatim from Phase 122 StateStore.atomicSaveLocked() into RuntimeStateWriter.write(_:) per D-05"
    - "snake_case JSON via explicit CodingKeys enum on Codable struct — drift-detected at test time by raw-string substring match against the rendered file (testJSONFieldNamesAreSnakeCase pins all 8 keys verbatim)"
    - "actor public read-only accessor returning a named tuple of inspection state — sibling of existing queueDepth() / isQuarantined() accessors (Phase 122 idiom extended)"
    - "Daemon composition-root capture-at-init for closure-captured immutable fields (pid, startedAt) — mirrors Phase 122 Plan 09 resolvedHost capture pattern"
    - "1Hz tick best-effort write semantics: try? await writerRef.write(state) — transient write failures drop one snapshot, daemon liveness preserved"

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/RuntimeStateWriter.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/RuntimeStateWriterTests.swift
  modified:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EmitterActor.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Daemon.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/EmitterTests.swift

key-decisions:
  - "RuntimeStateWriter.write(_:) is `throws` not `async throws` — actor isolation already serializes calls, the body itself awaits nothing. Mirrors Phase 122 StateStore.atomicSave() shape; callers `await` because of the actor boundary, not because of internal async work."
  - "lastEnqueuedEvent updated at the TOP of enqueue(_:) BEFORE the FIFO overflow drop — even an event that gets dropped on overflow still updates the snapshot. The 'last activity' signal is more useful than 'last event that survived'."
  - "Daemon's pid/startedAt are immutable instance `let`s captured ONCE at init — closure-captured into the evaluationTask via local `let pidRef = self.pid` aliases. Mirrors the Phase 122 Plan 09 'resolvedHost capture-at-init' pattern from the Plan 09 SUMMARY explicitly noted in CONTEXT D-05."
  - "RuntimeStateWriter creates its own parent dir on first write (not relying on StateStore.loadOrCreate having run first) — defensive for tests that pass a tmpdir path; in production both writers share `~/Library/Application Support/vigil-watch/` so the second mkdir is a no-op."
  - "Daemon's 1Hz tick write is `try? await writerRef.write(state)` (not `try`) — IO failure must not crash the daemon. Daemon liveness > snapshot freshness; the next tick will try again."

patterns-established:
  - "IPC via atomic-write JSON file: writer-side actor with temp+F_FULLFSYNC+rename, reader-side decodes the same Codable struct — closes the Daemon → CLI gap without sockets, HTTP, or shared memory. Status subcommand (Plan 04) consumes it as a file mtime + decode pair."
  - "Drift-detection of NORMATIVE JSON keys via raw-string substring match — testJSONFieldNamesAreSnakeCase pins all 8 D-04 keys; any rename here breaks `swift test` before it can break the cross-process Status reader contract."
  - "Additive Daemon hook idiom: new properties at init, new local captures before existing Task closure, new lines at the END of the existing while-loop body. Single `Task.sleep(for: .seconds(1))` count preserved (=1), no second timer added."

requirements-completed: [AGENT-WATCH-04, AGENT-WATCH-05]

# Metrics
duration: ~5 min
completed: 2026-05-09
---

# Phase 123 Plan 02: RuntimeStateWriter + Daemon 1Hz IPC Snapshot Summary

**Daemon now emits an atomic snake_case JSON snapshot to `~/Library/Application Support/vigil-watch/runtime-state.json` once per second (D-04/D-05), pinned by 4 RuntimeStateWriterTests + 1 new EmitterTests case, all green; full test suite 116/117 with the 1 pre-existing StateStoreTests.testRecordMilestoneRoundTrip failure carried verbatim from Plan 01**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-09T18:42:28Z
- **Completed:** 2026-05-09T18:47:17Z
- **Tasks:** 3 (1 standard + 2 TDD)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `Sources/VigilWatch/RuntimeStateWriter.swift` — public actor `RuntimeStateWriter` with `write(_:) throws`, plus `public struct RuntimeState` (Codable/Sendable/Equatable) with 8-field D-04 schema and explicit CodingKeys producing verbatim snake_case JSON
- Atomic write pattern lifted verbatim from Phase 122 `StateStore.atomicSaveLocked()` — temp file + `data.write(to:)` + `fcntl(F_FULLFSYNC)` + `FileManager.moveItem` rename(2). Same APFS-atomicity guarantee.
- `EmitterActor.currentSnapshot()` accessor + `private var lastEnqueuedEvent: VigilPayload?` tracking — 5-tuple matches RuntimeState's dynamic fields. Tracking updates BEFORE the FIFO overflow drop so the snapshot reflects last activity even when the queue is full.
- `Daemon.runtimeStateWriter` / `Daemon.startedAt` / `Daemon.pid` immutable instance properties initialized at init alongside `resolvedHost`; the existing 1Hz `evaluationTask` while-loop body gains a single new tail block that calls `await emitterRef.currentSnapshot()`, assembles `RuntimeState`, and calls `try? await writerRef.write(state)`. No new timer; single `Task.sleep(for: .seconds(1))` count preserved.
- 4 new `RuntimeStateWriterTests` cases pin: file creation, no `.tmp` left behind, raw-string drift detector for the 8 D-04 keys (`schema_version`, `pid`, `started_at`, `queue_depth`, `last_event_ts`, `last_event_session_id`, `last_event_type`, `quarantined`), and full encode→write→decode round-trip with `RuntimeState: Equatable`.
- 1 new `EmitterTests.testCurrentSnapshotShape` case covering the empty-state branch (queueDepth=0, three lastEvent fields nil, quarantined=false) and post-enqueue branch (depth=1, sessionId/event/timestamp from the enqueued payload).
- Full `swift test` suite: 116 passing of 117 (1 pre-existing `StateStoreTests.testRecordMilestoneRoundTrip` failure documented in deferred-items.md from Plan 01, NOT caused by this plan). Plan 01 baseline 111 passing → Plan 02 116 passing (delta = +5: 4 RuntimeStateWriterTests + 1 EmitterTests case).
- `swift build -c release` green — Plan 04 install command will copy this binary.

## Task Commits

Each task was committed atomically. TDD tasks have separate test (RED gate) and feat (GREEN gate) commits.

1. **Task 2.1 RED — RuntimeStateWriter failing tests** — `e12bc8f` (test)
2. **Task 2.1 GREEN — RuntimeStateWriter implementation** — `13c41fd` (feat)
3. **Task 2.2 RED — testCurrentSnapshotShape failing test** — `d9915cd` (test)
4. **Task 2.2 GREEN — EmitterActor.currentSnapshot() + lastEnqueuedEvent** — `ca0102e` (feat)
5. **Task 2.3 — Wire RuntimeStateWriter into Daemon's 1Hz tick** — `ab8e663` (feat)

(Code commits land in `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/`. Planning artifacts — this SUMMARY + STATE.md + ROADMAP.md updates — commit in the dailybrief repo separately at the end.)

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/RuntimeStateWriter.swift` — NEW — RuntimeState struct + RuntimeStateWriter actor + RuntimeStateWriterError enum
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/RuntimeStateWriterTests.swift` — NEW — 4 XCTest cases pinning the IPC contract
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EmitterActor.swift` — MODIFIED — added `private var lastEnqueuedEvent`, single new line in `enqueue(_:)` body to track it, added `public func currentSnapshot()` accessor
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Daemon.swift` — MODIFIED — added 3 immutable properties (runtimeStateWriter, startedAt, pid), initialized in init, captured into evaluationTask closure; appended ~12 lines to the 1Hz tick body for the snapshot write
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/EmitterTests.swift` — MODIFIED — appended `testCurrentSnapshotShape` (16 → 17 cases)

## Decisions Made

See `key-decisions` in frontmatter. Highlights:

- **`throws` not `async throws`** for `RuntimeStateWriter.write(_:)` — actor isolation already serializes; the body awaits nothing. Identical shape to `StateStore.atomicSave()`.
- **`lastEnqueuedEvent` updated BEFORE FIFO drop** — last activity > last surviving event for snapshot semantics.
- **Capture-at-init for pid/startedAt** — mirrors Phase 122 Plan 09 `resolvedHost` pattern; closure captures only need `let` references over `self`.
- **`try?` on the 1Hz write** — daemon liveness > snapshot freshness; transient IO failure drops one snapshot only.
- **Defensive parent-dir mkdir** in `RuntimeStateWriter.write(_:)` — does not depend on `StateStore.loadOrCreate` having run first; benign no-op in production where both writers share the parent dir.

## Deviations from Plan

None - plan executed exactly as written.

The plan's `<action>` block in Task 2.1 explicitly anticipated the actor-isolation question ("the writer's `write` method is non-async-throws-only … inside the actor it's a synchronous method") and the resolution matches that note verbatim. No Rule 1/2/3 fixes triggered.

## Issues Encountered

- Plan 01 deferred test `StateStoreTests.testRecordMilestoneRoundTrip` was already failing on the baseline. Out-of-scope per Plan 02; tracked in `deferred-items.md` from Plan 01. 4 XCTAssertEqual lines in that single test case account for the "4 failures" XCTest summary line, but the unique failing test count is 1 — verified via `git status` and `swift test 2>&1 | grep "Test Case.*failed" | sort -u`.

## User Setup Required

None - no external service configuration required. The runtime-state.json file is created automatically by the daemon's parent-directory mkdir in `RuntimeStateWriter.write(_:)`. No user action needed before Plan 03 launches the daemon in foreground via the Run subcommand.

## Next Phase Readiness

- **Plan 04 (Status subcommand)** is unblocked: it can read `~/Library/Application Support/vigil-watch/runtime-state.json` and decode `RuntimeState` via the same Codable struct. The drift-detector test (`testJSONFieldNamesAreSnakeCase`) will catch any divergent rename here at `swift test` time.
- **Plan 03 (Run/Tail/Test bodies)** is unblocked independently: Run wires up the existing Daemon composition root, which now writes `runtime-state.json` automatically via the wired-in 1Hz tick.
- **Plan 05 (24h soak gate)** can sample `runtime-state.json` mtime as one daemon-liveness signal alongside the planned launchctl + RSS sampler.

No blockers introduced.

---
*Phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak*
*Completed: 2026-05-09*

## Self-Check: PASSED

**Files verified to exist on disk:**
- FOUND: /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/RuntimeStateWriter.swift
- FOUND: /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/RuntimeStateWriterTests.swift
- FOUND: /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EmitterActor.swift
- FOUND: /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Daemon.swift
- FOUND: /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/EmitterTests.swift

**Commits verified in vigil-watch repo:**
- FOUND: e12bc8f (test 123-02 — RuntimeStateWriter RED gate)
- FOUND: 13c41fd (feat 123-02 — RuntimeStateWriter GREEN gate)
- FOUND: d9915cd (test 123-02 — testCurrentSnapshotShape RED gate)
- FOUND: ca0102e (feat 123-02 — currentSnapshot() GREEN gate)
- FOUND: ab8e663 (feat 123-02 — Daemon 1Hz wiring)

## TDD Gate Compliance

This plan has two TDD-marked tasks (Task 2.1 and Task 2.2). Both followed the RED → GREEN cycle in separate atomic commits:

| Task | RED commit (test) | GREEN commit (feat) | REFACTOR |
|------|-------------------|---------------------|----------|
| 2.1 RuntimeStateWriter | `e12bc8f` | `13c41fd` | n/a (clean implementation, no refactor commit) |
| 2.2 EmitterActor.currentSnapshot() | `d9915cd` | `ca0102e` | n/a |

For each task, the test commit was verified to fail (`swift test` → "cannot find RuntimeStateWriter / RuntimeState in scope" / "no member currentSnapshot") before the feat commit landed and produced 4/4 (Task 2.1) and 17/17 (Task 2.2) green.

Task 2.3 is `type="auto"` (not `tdd="true"`) and has only the single feat commit `ab8e663` — correctly per its plan declaration.

