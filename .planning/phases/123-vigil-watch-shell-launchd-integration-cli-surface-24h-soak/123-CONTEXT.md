# Phase 123: vigil-watch shell — launchd integration + CLI surface + 24h soak - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap the working Phase 122 daemon-as-engine in an ops-grade shell:

1. **launchd integration** — `vigil-watch install` writes
   `~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist` and
   `launchctl bootstrap`s it; `vigil-watch uninstall` cleanly reverses both.
   `RunAtLoad=true`, `KeepAlive=true` (verbatim from ROADMAP SC #1).
2. **CLI surface** — six top-level subcommands via `swift-argument-parser`:
   `run`, `tail`, `test`, `install`, `uninstall`, `status`. (Phase 122
   `Package.swift` already comments that swift-argument-parser is
   reserved for this phase.)
3. **24h soak gate** — daemon survives 24 unattended hours under 30MB RSS
   on the user's Mac without crashing, with a defensible verification
   artifact (not just eyeballing).

**In scope:** plist generation, launchd bootstrap/bootout, CLI subcommands,
runtime-state.json writer (small additive change to Phase 122 daemon),
soak-sampler launchd agent + assertion script.

**Out of scope (deferred to Phase 124):** WebSocket fan-out of
`agent-event` on `/v1/agent-stream` (AGENT-API-03), G2 Companion HUD.

**Out of scope (deferred to Phase 125):** Quiet mode (DND), plugin v0.3.0
ship, portfolio demo.

**Phase 122 deferred items the soak resolves:**
- `testDaemonStartsAndStopsWithoutCrash` SIGSEGV flake (1/120 in XCTest
  harness, never observed in production daemon) — soak quantifies
  whether it manifests in real run. If it does, sized as a follow-up;
  if it doesn't, closed with documented rationale.
- Empty `session_id` lines slip through Parser → 400 + drop at vigil-core.
  Soak's vigil-core query at end gives empirical drop count over 24h;
  fix sized only if rate is non-trivial.

</domain>

<decisions>
## Implementation Decisions

### Install layout (Area 1)

- **D-01 (Binary lives at `~/.local/bin/vigil-watch`):** `vigil-watch install`
  copies `.build/release/vigil-watch` to `~/.local/bin/vigil-watch`. Matches
  the existing `~/.local/bin/DailyBriefMonitor.app/...` precedent on this
  Mac. Durable across repo moves (the vigil-watch repo lives at
  `~/Desktop/Local AI/vigil-watch/` — Desktop is hostile for production
  paths). No sudo required. The plist's `ProgramArguments[0]` is the full
  expanded absolute path `/Users/jamesonmorrill/.local/bin/vigil-watch`
  (launchd does not expand `~` or `$HOME` in plist values reliably).
  `~/.local/bin` will be created on install if missing (`mkdir -p`).

  **Rejected:** in-place reference to `.build/release/vigil-watch`
  (Desktop path is unstable; if the repo ever moves the daemon breaks
  silently and `KeepAlive` retries forever against a missing binary).
  `/usr/local/bin` (sudo prompt during install is hostile, no benefit
  for a single-user daemon).

- **D-02 (launchd logs at `~/Library/Logs/Vigil/watch.{out,err}`):**
  Plist's `StandardOutPath` and `StandardErrorPath` point here. Durable
  across reboots (critical for diagnosing an overnight crash that
  triggered a system reboot). Mirrors DailyBriefMonitor's
  `~/Library/Logs/DailyBrief/` pattern. **Supersedes Phase 122 CONTEXT's
  tentative `/tmp/vigil-watch.{out,err}` note** — that hint was made
  before the soak gate was sized; transient logs are incompatible with
  a 24h soak that may include mid-run reboots.

  Directory `~/Library/Logs/Vigil/` is created on install if missing.
  No log rotation in this phase — daemon emits ~1 line/event NDJSON,
  expected volume <10MB/day; size-based rotation can be a future
  ride-along if log volume surprises.

- **D-03 (Install is idempotent — bootout-then-replace-then-bootstrap):**
  If the plist already exists when `install` runs, the command:
  1. `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist`
     (ignore errors if not loaded).
  2. Overwrite the plist file.
  3. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist`.

  This makes `install` the single command for both fresh installs and
  upgrades. **Rejected:** refuse if already installed (forces user to
  remember to run `uninstall` first — friction with no safety win).
  Refuse-replace-bootstrap means upgrades are atomic; the daemon is
  briefly stopped (≤2s window) but `KeepAlive` semantics resume on the
  new binary.

### Status IPC (Area 2)

- **D-04 (Daemon writes `runtime-state.json` on the existing 1Hz tick):**
  Path: `~/Library/Application Support/vigil-watch/runtime-state.json`
  (parent dir already used by Phase 122's `offsets.json`). Schema:
  ```json
  {
    "schema_version": 1,
    "pid": 12345,
    "started_at": "2026-05-09T14:23:00Z",
    "queue_depth": 7,
    "last_event_ts": "2026-05-09T14:25:42Z",
    "last_event_session_id": "abc123",
    "last_event_type": "needs_input",
    "quarantined": false
  }
  ```
  Atomic write via temp+rename (reuses Phase 122's StateStore.swift
  F_FULLFSYNC pattern). Written every 1 second on the existing
  `Daemon.swift` evaluation tick — no new timer, no new Task.

  `status` reads the file and pretty-prints. Stale by max 1s
  (imperceptible). If the file is missing or older than 5 seconds,
  `status` reports `daemon: NOT RUNNING` and falls back to
  `launchctl print gui/$UID/com.morrillholdings.vigil.watch` to
  distinguish "daemon never started" from "daemon crashed mid-run."

  **Rejected:** Unix domain socket query (~150 lines of new code,
  socket cleanup edge cases, no win over 1s staleness for a debug
  tool). launchctl-only heuristics (no queue depth — loses the most
  useful data point for an offline-queue runaway).

- **D-05 (Daemon code change is small + additive):** New file
  `Sources/VigilWatch/RuntimeStateWriter.swift` — actor with a
  `write(state:)` method. `Daemon.swift`'s 1Hz tick gets one new
  `await runtimeStateWriter.write(state: ...)` line at the end of
  the loop body. `EmitterActor` exposes a new `currentSnapshot()`
  returning `(queueDepth, lastEventTs, lastEventSessionId,
  lastEventType, quarantined)`. No new dependencies, no new actors
  beyond the writer itself.

### `tail` semantics (Area 3)

- **D-06 (Filter the launchd log file with jq):** `vigil-watch tail
  <session-id>` shells out to:
  ```bash
  tail -f ~/Library/Logs/Vigil/watch.out | jq -c --arg sid "<session-id>" 'select(.session_id == $sid)'
  ```
  (or the Swift equivalent via `Process` invoking `tail` and `jq`).
  Shows what the running daemon ACTUALLY emitted — ground truth for
  "is the daemon seeing this session correctly?" Phase 122's stdout is
  already NDJSON with `session_id` field, so zero daemon changes are
  needed.

  **Limitation acknowledged:** if the daemon is not running via
  launchd AND not foregrounded with output redirected to the log file,
  `tail` shows nothing. Acceptable for a debug tool — when the daemon
  is down, `status` is the right command, not `tail`.

  **Rejected:** Re-parse live JSONL (duplicates parser logic at the
  call-site, shows hypothetical events rather than actual emissions —
  worse for production debugging). Auto-detect both modes (overkill
  complexity for a debug tool).

- **D-07 (`jq` is required; install command warns if missing):**
  `tail` invokes `jq` directly. macOS doesn't ship `jq` by default.
  `vigil-watch install` checks `which jq` and prints a warning (not
  fatal) if missing: "warning: jq not installed; `vigil-watch tail`
  will fail until you `brew install jq`." User has Homebrew in
  /usr/local/bin per environment so the brew step is one line.

### 24h soak gate (Area 4)

- **D-08 (Sibling launchd sampler agent fires every 5 min):**
  `vigil-watch install` writes a SECOND plist:
  `~/Library/LaunchAgents/com.morrillholdings.vigil.watch.sampler.plist`,
  which uses `StartInterval=300` to fire a tiny shell script every
  5 minutes. Script appends one CSV line `{ts,pid,rss_kb,etime_s}` to
  `~/Library/Logs/Vigil/soak-YYYY-MM-DD.csv` via:
  ```bash
  PID=$(pgrep -f /Users/jamesonmorrill/.local/bin/vigil-watch | head -1)
  if [ -n "$PID" ]; then
    ps -p $PID -o pid=,rss=,etime= | awk -v ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{print ts","$1","$2","$3}' >> ...
  else
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),,," >> ...
  fi
  ```
  Empty PID/RSS columns mark sampling intervals where the daemon was
  not running — preserved as evidence of crashes. Sampler is
  installed/uninstalled in lockstep with the main daemon (single
  `vigil-watch install` command brings both up; `uninstall` brings
  both down).

- **D-09 (End-of-soak assertion script enforces gate):**
  `scripts/soak-check.sh` (in vigil-watch repo, NOT the dailybrief
  repo) reads the CSV and exits 0 iff:
  - `max(rss_kb) < 30000` (≤30MB resident — ROADMAP SC #4)
  - `(last_ts - first_ts) >= 86400 - 600` (≥23h50m of sampling — slack
    for the 5min cadence missing the exact 24h mark)
  - All non-empty PID rows have the same PID value (no crash-restart
    cycle — KeepAlive shouldn't have triggered)
  - At least one non-empty row exists (sampler ran at all)
  - Final live check: `curl -s -H "Authorization: Bearer $VIGIL_API_KEY"
    https://api.vigilhub.io/v1/agent-sessions | jq '. | length' > 0`
    (Core received events from the daemon)

  Verification gate for Phase 123 SC #4 is "running `soak-check.sh
  ~/Library/Logs/Vigil/soak-YYYY-MM-DD.csv` exits 0." Script prints
  a summary table on success (max RSS, mean RSS, uptime, total
  samples, agent_events count) — that table goes verbatim into
  `123-VERIFICATION.md`.

- **D-10 (Soak start/end is operator-driven, not automated):** The
  soak doesn't run automatically as part of every `install`. Operator
  procedure:
  1. `vigil-watch install` (starts both daemon and sampler).
  2. Live for ≥24h with normal Claude Code use.
  3. `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv`.
  4. If exits 0: `123-VERIFICATION.md` records the gate as PASSED with
     the script's summary table.

  This is a one-shot gate per phase. After verification, the sampler
  agent stays installed (passive), but its CSV doesn't need to be
  consulted again. `vigil-watch uninstall` removes both.

### Claude's Discretion

- **`vigil-watch test` shape:** POSTs ONE synthetic event with a
  reserved sessionId of the shape `_vigil_test_<unix-timestamp>` and
  event type `heartbeat` (least-noisy classification, doesn't trigger
  HUD banners in Phase 124). Prints HTTP status + response body to
  stdout. Exit code = 0 iff status is 2xx. The reserved sessionId
  prefix `_vigil_test_` is documented so the user can grep it out of
  agent-events queries; no server-side filtering — keeps the test
  honest end-to-end.

- **`vigil-watch run` foreground behavior:** Default is foreground
  (matches Phase 122 main.swift behavior). `--verbose` enables stderr
  human-readable lifecycle logs (the `[INFO]/[WARN]/[ERROR]` stream
  Phase 122 already implements). Without `--verbose`, only NDJSON
  events go to stdout, stderr is suppressed except errors. Useful for
  piping `vigil-watch run | jq '.event'` ad-hoc.

- **CLI library:** `swift-argument-parser` (Apple's official CLI
  library, MIT-licensed, the one Phase 122 Package.swift comment
  reserved). Single `ParsableCommand` per subcommand under a parent
  `VigilWatchCLI: ParsableCommand` with `subcommands: [Run.self,
  Tail.self, Test.self, Install.self, Uninstall.self, Status.self]`.

- **plist generation:** Static template embedded as a Swift
  multi-line string `let plistTemplate = """..."""` with `%PATH%`
  placeholders for the binary path, log paths, env vars. `Install`
  subcommand calls `String(format:)` (or simple `.replacingOccurrences`)
  to fill them, then writes the result. Not a separate template file —
  one file to grep for plist contents. Sampler plist is a separate
  embedded string in the same file.

- **`EnvironmentVariables` in plist:** `PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
  (matches DailyBriefMonitor; ensures `jq`, `curl`, etc. are findable
  if the daemon ever shells out, which it currently doesn't but might).
  `VIGIL_API_KEY` is NOT baked into the plist — daemon reads it via
  the Phase 122 ConfigLoader env-var fallback, which works in launchd
  context because launchd processes inherit the user's session env.
  If env-var inheritance turns out to be unreliable under launchd
  (smoke test required), fall back to baking `VIGIL_API_KEY` into the
  plist's `EnvironmentVariables` dict (acknowledging that it puts the
  key in plain text in `~/Library/LaunchAgents/`, which the user's
  threat model already accepts for `~/.config/vigil/watch.toml`).

- **`vigil-watch uninstall` semantics:** `bootout` first (ignore
  errors — daemon may not be loaded), then delete both plist files,
  then `mkdir -p`-the-log-dir-but-don't-delete-it (logs are evidence,
  user can `rm` manually). Returns 0 even if the plists were already
  absent (idempotent). Does NOT remove `~/Library/Application Support/vigil-watch/`
  (offsets, milestones, runtime-state — operator data).

- **Crash-loop protection:** Use launchd's `ThrottleInterval` default
  (10s) — no override needed. If the daemon segfaults at startup
  repeatedly, launchd's default throttle prevents a CPU-burning loop.

- **Uninstall before reinstall on plist change:** Already handled by
  D-03 (install is bootout-then-replace-then-bootstrap).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v3.8 milestone spec (load-bearing)
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` — full milestone spec.
  Phase 123 implements §"vigil-watch Daemon" → "CLI surface" subsection
  (the 6 subcommands) and §"Operational" → "launchd integration."

### Phase 122 carry-forward (the engine this phase wraps)
- `.planning/phases/122-vigil-watch-core-watcher-parser-emitter-config/122-CONTEXT.md`
  — D-01..D-10 lock the daemon's internal architecture. Phase 123's
  `runtime-state.json` writer hooks into the existing 1Hz evaluation
  tick (CONTEXT D-06 timer-driven evaluation).
- `.planning/phases/122-vigil-watch-core-watcher-parser-emitter-config/122-VERIFICATION.md`
  — locked artifact list for the working daemon (Daemon.swift,
  EmitterActor.swift, etc.); `runtime-state.json` writer is additive
  to this list, not replacing.
- `.planning/phases/122-vigil-watch-core-watcher-parser-emitter-config/122-09-SUMMARY.md`
  — composition root patterns (resolvedHost capture at init,
  installSIGTERMHandler signature). Phase 123 `install` subcommand
  uses the same composition root for `run` (no behavioral change to
  the daemon's runtime when launched via `run`).

### Phase 121 API contract (the soak's end-of-run readback)
- `vigil-core/src/routes/agent-events.ts` and
  `vigil-core/src/routes/agent-sessions.ts` — `vigil-watch test`
  POST contract (8 fields including `client_event_id`) and the
  `GET /v1/agent-sessions` query the soak's assertion script issues.
- `.planning/phases/121-agent-events-api-foundation-cross-user-isolation-lock/121-CONTEXT.md`
  — D-A4 / D-C1..D-C3 (idempotency contract) constrain
  `vigil-watch test`'s synthetic event shape.

### Phase 123 requirements + roadmap
- `.planning/REQUIREMENTS.md` — AGENT-WATCH-04 (install/uninstall
  + plist round-trip), AGENT-WATCH-05 (6 CLI subcommands),
  AGENT-WATCH-07 (24h unattended < 30MB RSS).
- `.planning/ROADMAP.md` §"Phase 123" — 4 success criteria items,
  bundle ID `com.morrillholdings.vigil.watch` verbatim,
  `RunAtLoad=true`/`KeepAlive=true` verbatim.

### Local existing-pattern references (read for analog, not copy-paste)
- `~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist`
  — working precedent for a user launchd agent on this machine.
  Patterns to mirror: `LimitLoadToSessionType=Aqua`,
  `ProcessType=Interactive`, `~/Library/Logs/<App>/` log path,
  `EnvironmentVariables` block with `PATH`. Patterns NOT to mirror:
  `KeepAlive=<dict><SuccessfulExit>false</SuccessfulExit></dict>` —
  Phase 123 ROADMAP SC #1 says `KeepAlive=true` (boolean, restart on
  any exit including clean ones). Read but adapt verbatim from
  ROADMAP, not from this plist.

### vigil-watch repo (the actual code being modified)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Package.swift`
  — current SPM manifest. Phase 123 adds
  `apple/swift-argument-parser` to `dependencies`, and that's the only
  Package.swift change.
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/main.swift`
  — current entry point (Phase 122 stub). Phase 123 replaces with a
  `swift-argument-parser` dispatch shell that delegates to subcommands;
  the existing setbuf+ConfigLoader+Daemon+SIGTERM+RunLoop logic moves
  into the `Run` subcommand verbatim.
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Daemon.swift`
  — Phase 122 composition root. Phase 123 adds one `await
  runtimeStateWriter.write(...)` call inside the existing 1Hz tick.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 122 `StateStore.swift` atomic-write pattern (`F_FULLFSYNC` +
  temp+rename):** `RuntimeStateWriter.swift` reuses this verbatim. One
  pattern, two writers in the daemon.
- **Phase 122 1Hz evaluation tick in `Daemon.swift`:** Already exists,
  drives all timer-based events. The `runtime-state.json` write is one
  extra `await` at the end of the existing loop body — no new timer.
- **Phase 122 `EmitterActor` queue + lastEvent tracking:** Already
  knows queue depth and the last-emitted event. Phase 123 adds a
  `currentSnapshot()` accessor (read-only, ~10 lines).
- **DailyBriefMonitor plist as analog:** Patterns for
  `LimitLoadToSessionType=Aqua`, `ProcessType=Interactive`,
  `~/Library/Logs/` paths, `EnvironmentVariables` are precedent on
  this Mac. Adapt, don't copy.

### Established Patterns
- **Atomic file writes (Phase 122):** Every disk-persisted state file
  in vigil-watch uses temp+fsync+rename. Phase 123's
  `runtime-state.json` and the soak CSV (sampler) follow the same.
  CSV uses `>>` append (atomic for line-sized writes on macOS HFS+/APFS
  — single `write(2)` for ~80 bytes is atomic) — no temp+rename
  needed.
- **NDJSON to stdout (Phase 122):** Phase 123 `tail` subcommand
  consumes this verbatim. No format change to the daemon's stdout.
- **Package.swift convention:** `Sources/VigilWatch/` library +
  `Sources/vigil-watch/` executable. Phase 123 keeps this; subcommand
  files live at `Sources/vigil-watch/Commands/{Run,Tail,Test,Install,
  Uninstall,Status}.swift`. The library doesn't grow new public API
  surface beyond `RuntimeStateWriter`.

### Integration Points
- **Daemon → runtime-state.json:** New writer instantiated in
  `Daemon.init`, fed by `EmitterActor.currentSnapshot()`. Single new
  call site in the 1Hz tick.
- **Status subcommand → runtime-state.json + launchctl:** Reads the
  state file (with 5s freshness check); falls back to `launchctl print`
  for the launchd-managed-state distinction.
- **Install subcommand → launchd:** Shells out to `launchctl bootout`
  / `bootstrap` via `Process`. Deterministic exit codes (verify with
  `launchctl print` after bootstrap; if not loaded, exit 1).
- **Sampler plist → ps:** Tiny shell script (embedded in the sampler
  plist's `ProgramArguments` as `["/bin/sh", "-c", "..."]`) does
  `pgrep -f` + `ps -o` + `awk` + `>>`. No external script file.

</code_context>

<specifics>
## Specific Ideas

- **Bundle IDs are namespaced under `com.morrillholdings.vigil.watch`:**
  Main daemon: `com.morrillholdings.vigil.watch`. Sampler:
  `com.morrillholdings.vigil.watch.sampler`. Both plists live at
  `~/Library/LaunchAgents/<id>.plist`.
- **`vigil-watch test` reserved sessionId convention:** Prefix
  `_vigil_test_` (underscore prefix to distinguish from real Claude
  Code session UUIDs). User can `WHERE session_id NOT LIKE '_vigil_test_%'`
  in any future agent_events query to filter out test events.
- **Log directory `~/Library/Logs/Vigil/`:** All vigil-watch-managed
  log/data files live under this path. Daemon stdout (`watch.out`),
  daemon stderr (`watch.err`), soak CSVs (`soak-YYYY-MM-DD.csv`).
  Operator data (offsets, milestones, runtime-state) stays under
  `~/Library/Application Support/vigil-watch/` per Phase 122 D-09.

</specifics>

<deferred>
## Deferred Ideas

- **Log rotation for `~/Library/Logs/Vigil/watch.{out,err}`:** Not
  in this phase. If 24h soak shows log volume >50MB/day or growing
  unbounded, future ride-along to add `newsyslog` integration or a
  size-based rotation step in the sampler.
- **`vigil-watch logs` subcommand:** Not in the ROADMAP-locked 6
  subcommands. If `tail -f ~/Library/Logs/Vigil/watch.out | jq` UX
  proves clunky in practice, a future phase could add a 7th `logs`
  subcommand that bundles the tail+jq invocation. Out of scope here.
- **Uninstall confirmation prompt:** Currently `uninstall` is silent
  + idempotent. If a future phase ever stores irreversible state in
  `~/Library/Application Support/vigil-watch/` (e.g., bearer
  credentials inline), revisit to add a `--force` requirement.
- **Soak metric expansion:** Currently soak captures `pid,rss,etime`.
  Future phases that worry about CPU drift could add `pcpu` (% CPU)
  and `vsz` (virtual size). Out of scope until there's a reason.
- **Per-launchd-context env-var inheritance smoke test:** Phase 122
  ConfigLoader reads `VIGIL_API_KEY` from env. If launchd context
  doesn't inherit `VIGIL_API_KEY` reliably, fallback is baking it
  into plist `EnvironmentVariables`. The smoke test belongs in this
  phase's planning, but the fallback (plain-text key in plist) only
  triggers if smoke fails — not pre-decided here.

</deferred>

---

*Phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak*
*Context gathered: 2026-05-09*
