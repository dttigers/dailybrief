---
slug: vigil-watch-silent-no-events
status: resolved
trigger: vigil-watch daemon up 28h+ but has emitted zero events; status shows last_event "(none yet)"
created: 2026-05-10
updated: 2026-05-10
host: jamesons-imac.local
---

# vigil-watch silent: daemon RUNNING but emits zero events

## Symptoms

- **Expected behavior:** vigil-watch tails `~/.claude/projects/*/*.jsonl`, parses appended lines into 5 Vigil event types (`needs_input`, `task_complete`, `task_failed`, `milestone`, `heartbeat`), and POSTs them to `https://api.vigilhub.io/v1/agent-events`. Local NDJSON log at `~/Library/Logs/Vigil/watch.out` mirrors each emit.
- **Actual behavior:** Daemon process is alive (pid 13139, RSS 5,532 KB, ELAPSED 1d 4h 10m, launchd state=running, last exit code = never exited). But:
  - `vigil-watch status` reports `last_event: (none yet)` and `queue_depth: 0`
  - `~/Library/Logs/Vigil/watch.out` has exactly 6 lines, all dated `2026-05-09T20:17:33Z` (UTC) — **before** the current daemon's reported start of `2026-05-09T21:04:06.038Z` (UTC). Those 6 lines are leftovers from a prior daemon run (log is append-mode).
  - Current daemon has emitted **zero** events in 28+ hours.
- **Error messages:** None. `~/Library/Logs/Vigil/watch.err` is empty (0 bytes). Silent failure.
- **Timeline:** Daemon installed/started 2026-05-09 ~15:04 MDT (21:04 UTC). Has been silent ever since. JSONL activity in `~/.claude/projects/-Users-jamesonmorrill-Desktop-Local-AI-dailybrief/` has been heavy across 7+ session files; most recent file `c1d71617-ca07-4695-ae62-dc2d7a1fd4b0.jsonl` modified 2026-05-10 19:16:35 MDT (minutes before this report).

## Resolution

### TWO interacting root causes

**Bug 1 — FSEventStream decode UB in `FSEventBridge.swift`** (silent event drop)

`Sources/VigilWatch/FSEventBridge.swift` builds the FSEventStreamCreateFlags bitmask **without** `kFSEventStreamCreateFlagUseCFTypes`. Without that flag, FSEvents delivers `eventPaths` to the callback as `const char *const *` (a C-array of NUL-terminated C strings), **not** a `CFArrayRef`. The line `unsafeBitCast(eventPaths, to: NSArray.self)` reinterprets the C-pointer-array's first 8 bytes as an Objective-C `isa` pointer. In production this yields a pointer whose ObjC class is whatever happens to sit at that address, almost always failing the subsequent `as? [String]` bridge → `[]` via the `?? []` fallback. Net effect: every FSEvent callback was invoked, computed `pathsArray = []`, iterated zero items, and updated nothing. The daemon main loop stayed alive (writes runtime-state.json) but the parse pipeline never fired.

A minimal Swift probe with the same broken pattern **segfaulted** on first event delivery (different memory layout under a tiny process surfaced the UB as a crash instead of a silent drop). The fixed probe — adding `kFSEventStreamCreateFlagUseCFTypes` to the flags + decoding via `Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue() as NSArray as? [String]` — received both append and create events flawlessly.

**Bug 2 — Daemon lifetime collapse in `Run.swift`** (live FSEvent stream invalidated)

Even after Bug 1 was fixed, live FSEvents still did not reach vigil-watch. Side-by-side comparison: a minimal probe replicating `FSEventBridge` + `Task` dispatch + `withCheckedContinuation` suspension received events; vigil-watch (using the same fixed Bridge) did not.

The reason: in `Sources/vigil-watch/Commands/Run.swift`, the `daemon` local was declared inside a `do { … } catch { … }` block with no use of `daemon` after the do-block. Swift release-mode optimizer detected this and deallocated `daemon` immediately upon exiting the do-block's brace — even though the surrounding async function suspended on `withCheckedContinuation` forever below. Deallocating `Daemon` ran `FSEventBridge.deinit`, which calls `FSEventStreamStop / Invalidate / Release` — silently killing live FSEvent delivery.

The illusion of "alive daemon" persisted because:
- The signal handler captured `daemon.emitter` strongly → emitter survived → EmitterActor's flushLoop kept draining queued events
- The 1Hz evaluator Task in `Daemon.start()` captured `pid`, `startedAt`, `writerRef` (RuntimeStateWriter) as locals → those references kept the snapshot loop alive, so `runtime-state.json` kept ticking
- Only the FSEvent pipeline died — the very pipeline that produces new work

So bootstrap-emitted events (gathered during `await watcher.bootstrap(...)`, before the lifetime collapse) successfully drained through the emitter; live FSEvents post-bootstrap went nowhere. This precisely matched the symptom: prior-daemon log lines all clustered within 500ms of startup (= bootstrap pass), then silence.

This bug shape is a cousin of `feedback_runloop_main_async_trap`: lifting top-level Swift daemon code into `func run() async` silently breaks longevity, but in a different way — there, the daemon exits cleanly; here, the daemon stays "up" but its event source is dead.

### Fixes applied

1. `Sources/VigilWatch/FSEventBridge.swift` — added `kFSEventStreamCreateFlagUseCFTypes` to the flags bitmask; rewrote the callback to decode `eventPaths` via `Unmanaged<CFArray>.fromOpaque(...).takeUnretainedValue() as NSArray as? [String]`. Documented "Pitfall 5" with full context.
2. `Sources/vigil-watch/Commands/Run.swift` — hoisted `let daemon: Daemon` declaration to outer scope (above the `do { … }`), and added a post-suspension `_ = daemon` reference to defeat release-mode dead-store elimination. Documented the lifetime-collapse pitfall in the file-header comment.
3. Rebuilt `swift build -c release` (Build complete! 3.22s, no errors).
4. Reinstalled binary at `/Users/jamesonmorrill/.local/bin/vigil-watch`.
5. Reloaded launchd daemon (`launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist`).

### Production verification (post-fix)

Live trigger: appended a synthetic assistant line "all checks passed — prod verify" to `~/.claude/projects/-Users-jamesonmorrill-Desktop-Local-AI-dailybrief/c1d71617-ca07-4695-ae62-dc2d7a1fd4b0.jsonl`. Within 4 seconds:

- `vigil-watch status` updated to `last_event: milestone on prod-verify-1778464243 at 2026-05-11T02:00:00.000Z`
- `watch.out` recorded BOTH the enqueue (`post_status: 0`) and the POST acknowledgment (`post_status: 201`) — proving the full pipeline: FSEvent → WatcherActor.handleFileEvent → readNewBytes → parseJSONLLine → MilestoneMatcher → EmitterActor.enqueue → flushLoop → POST `https://api.vigilhub.io/v1/agent-events` → 201 Created.

Foreground end-to-end test (`vigil-watch run --verbose`) with two live triggers separated by 5s each — both fired their milestone events within 5 seconds of the append:
- Trigger 1: "deployed to mars successfully" → milestone enqueue + POST 201 in <5s
- Trigger 2: "PR #5050 merged" → milestone enqueue + POST 201 in <5s

## Phase 123 process implications

The 24h soak operator artifact at `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` was never back-filled. Had it been run with even one live trigger, the FSEvent dead-channel would have surfaced immediately. **Recommendation:** the soak protocol should include an explicit "modify a JSONL during the daemon's lifetime and confirm a `task_failed`/`milestone` event flows to `watch.out` within 5 seconds" step, not just RSS/uptime measurement. RSS-and-uptime is a liveness check, not a functional check.

## Initial environment facts

- **Binary:** `/Users/jamesonmorrill/.local/bin/vigil-watch` (installed via `vigil-watch install`)
- **launchd plists loaded:**
  - `com.morrillholdings.vigil.watch` (pid 13139, running)
  - `com.morrillholdings.vigil.watch.sampler` (pid 0 — kicker)
- **Config file:** `~/.config/vigil/watch.toml` — api_url, api_key, projects_dir all set correctly
- **API key:** `vk_c9f87bb…` set, daemon NOT quarantined
- **Recent JSONL files (last 3h):**
  - `~/.claude/projects/-Users-jamesonmorrill-Desktop-Local-AI-dailybrief/c1d71617-…jsonl` (2026-05-10 19:16:35 MDT)
  - `dacca128-…jsonl`, `ade22012-…jsonl`, `e76d7182-…jsonl`, `bff7a5e9-…jsonl` (all 2026-05-10 17:46 MDT)
- **Phase context:** v3.8 milestone closed structurally (Phases 120-125, 43/43 plans). Phase 123 (vigil-watch shell + launchd + 24h soak) reported "passing" on RSS/uptime axes but operator soak verification artifact never back-filled.

## Current Focus

- **hypothesis:** RESOLVED — two interacting root causes (see Resolution section above).
- **next_action:** N/A — fix applied, production daemon verified live.

## Evidence

- timestamp: 2026-05-10T19:14 MDT
  fact: daemon launchd state = running, pid 13139, RSS 5,532 KB, ELAPSED 28h+
  source: `ps -p 13139 -o pid,etime,rss,state,command`
- timestamp: 2026-05-10T19:14 MDT
  fact: `vigil-watch status` reports `daemon: RUNNING / last_event: (none yet) / queue_depth: 0 / quarantined: false`
  source: `vigil-watch status`
- timestamp: 2026-05-10T19:15 MDT
  fact: `watch.out` has exactly 6 lines, all `ts=2026-05-09T20:17:33Z` (UTC), all from session ids `6cd672a6`, `c75d34b6`, `7ec0196a`, `b1bcc3c0`, `bff7a5e9` (×2 — one task_failed + one milestone), clustered within 500ms — characteristic bootstrap burst
  source: `tail -50 ~/Library/Logs/Vigil/watch.out`
- timestamp: 2026-05-10T19:15 MDT
  fact: log events at 20:17 UTC predate current daemon start at 21:04 UTC — current daemon's emissions = 0
  source: cross-reference `vigil-watch status` started_at vs log line timestamps
- timestamp: 2026-05-10T19:15 MDT
  fact: `watch.err` is empty (0 bytes)
  source: `tail -50 ~/Library/Logs/Vigil/watch.err`
- timestamp: 2026-05-10T19:22 MDT
  fact: `runtime-state.json` mtime is current (May 10 19:22) — proves the 1Hz evaluator loop is alive
  source: `ls -la ~/Library/Application\ Support/vigil-watch/`
- timestamp: 2026-05-10T19:22 MDT
  fact: `offsets.json` mtime is May 9 15:02 — the daemon has not called `atomicSave()` once since starting at 15:04
  source: `ls -la ~/Library/Application\ Support/vigil-watch/`
- timestamp: 2026-05-10T19:23 MDT
  fact: Of the 5 dailybrief JSONL files modified within the past 28h, 5/5 are UNTRACKED in offsets.json (including `c1d71617-…jsonl` modified 2.2 minutes before audit)
  source: `python3` cross-reference of `offsets.json.offsets` keys vs files newer than daemon start
- timestamp: 2026-05-10T19:24 MDT
  fact: Foreground daemon (`vigil-watch run --verbose`) emits all 6 backlog events at startup (bootstrap pass), but ALSO does not react to subsequent file modifications. Bug shape is NOT launchd-specific.
  source: `launchctl bootout` then ran FG daemon; appended synthetic line to active JSONL → 0 new emissions in 6s
- timestamp: 2026-05-10T19:27 MDT
  fact: `sample` of the running daemon shows ONLY 1 thread (main thread); no `com.morrillholdings.vigil.watch.fsevent` queue worker
  source: `sample <pid>` output
- timestamp: 2026-05-10T19:30 MDT
  fact: Minimal Swift FSEvent probe with the SAME flags+decode pattern as vigil-watch SEGFAULTED upon receiving a file event
  source: `/tmp/fseprobe2` — `Segmentation fault: 11` on first delivery
- timestamp: 2026-05-10T19:31 MDT
  fact: FIXED probe (with `kFSEventStreamCreateFlagUseCFTypes` + Unmanaged decode) receives events flawlessly (2 events: 1 append + 1 create)
  source: `/tmp/fseprobe_fixed` — `total events: 2` with correct file paths
- timestamp: 2026-05-10T19:43 MDT
  fact: After rebuilding vigil-watch with the Bridge fix, live FSEvents STILL did not reach the daemon. Parallel mini-probe (mimicking Daemon's Bridge + Task dispatch + withCheckedContinuation) DID receive the same FSEvent — proving the issue was downstream of the bridge code.
  source: `/tmp/fseprobe_mini` caught event; vigil-watch in the same window did not
- timestamp: 2026-05-10T19:50 MDT
  fact: After hoisting `let daemon: Daemon` out of the do-block in `Run.swift` and adding `_ = daemon` post-suspension, foreground daemon emits TWO live-triggered events within 5 seconds each, both POSTed to vigil-core with status 201.
  source: `/tmp/vw_FINAL.out` shows `final-x1-…` and `final-x2-…` events with `post_status: 201`
- timestamp: 2026-05-10T19:50 MDT
  fact: Production launchd daemon reloaded with fixed binary. Live synthetic append produced `last_event: milestone on prod-verify-1778464243` within 4 seconds; `post_status: 201` confirmed in watch.out.
  source: `vigil-watch status` + `tail -3 ~/Library/Logs/Vigil/watch.out`

## Eliminated

- **launchd permissions / TCC** — refuted by foreground daemon ALSO being silent
- **RunLoop suspension** — refuted by runtime-state.json being written every second
- **Stale per-file offsets wedged past current sizes** — refuted by `0 wedged` count and 5/5 UNTRACKED status of recent files
- **Parser silently dropping all lines** — refuted by foreground daemon successfully parsing 6 backlog files at bootstrap and emitting `task_failed` / `milestone` events
- **All sessions in bypass-permissions mode** — refuted by `task_failed` events flowing through bootstrap
- **projects_dir misresolution** — refuted by foreground daemon's bootstrap correctly reading from `/Users/jamesonmorrill/.claude/projects`
- **FSEvent not being delivered at the OS level** — refuted by the fixed probe receiving events for the exact same path during the exact same time window with the same+1 flag
- **fseventsd kernel issue** — refuted by `log show --predicate "process == 'fseventsd'"` showing healthy activity

## Specialist hint candidates

- **swift-concurrency** — applies (FSEventBridge bridges into actor world from a C callback; lifetime issue in async closure)
- **macos-fsevent** — applies (this is a direct FSEventStream API misuse)
- **swift-codable** — N/A
