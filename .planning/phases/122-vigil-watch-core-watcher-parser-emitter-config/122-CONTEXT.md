# Phase 122: vigil-watch core — watcher + parser + emitter + config - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `vigil-watch` Swift daemon that observes `~/.claude/projects/`,
parses each new JSONL line into the 5 Vigil event types per the field-path
detection rules locked in Phase 120, persists per-file byte offsets so
restarts don't replay history, POSTs events to vigil-core's
`POST /v1/agent-events` with retry/backoff and a 100-event in-memory queue,
and reads `~/.config/vigil/watch.toml` on startup with first-run defaults.

This is the daemon-as-engine. **In scope:** FSEventStream watcher, JSONL
line parser, 5-event emission with timer-driven gap/silence/heartbeat
evaluation, retry/backoff emitter with offline queue + 5s SIGTERM drain,
TOML config loading with first-run create. Foreground-mode stdout/stderr
logging is in scope (only debug surface available before Phase 123).

**Deferred to Phase 123:** launchd plist install/uninstall, `vigil-watch`
CLI subcommands (`run --verbose`, `tail`, `test`, `install`, `uninstall`,
`status`), 24-hour soak under 30MB RSS.

**Deferred to Phase 124:** WebSocket fan-out of `agent-event` on
`/v1/agent-stream` (AGENT-API-03), G2 HUD consumption.

The `agent_events` table and `POST /v1/agent-events` endpoint already
exist (Phase 121, schema-pushed and verified live). This phase is the
first real producer.

</domain>

<decisions>
## Implementation Decisions

### Restart-safe event identity (Area 1)

- **D-01 (Strategy A — deterministic hash):** `client_event_id` is the
  hex-encoded prefix-36 of `sha256("\(sessionId)|\(jsonlByteOffset)|\(eventType)|\(ruleVersion)")`,
  shaped like a UUID string for compatibility with Phase 121's text
  column. This makes restart-replay safe: the same line at the same
  offset emitting the same event type produces the same `client_event_id`,
  so Postgres' partial unique index `(user_id, client_event_id) WHERE
  client_event_id IS NOT NULL` (Phase 121 D-A4) silently dedupes with
  200 OK. Zero new disk state required beyond `offsets.json`.

  **Rejected:** Strategy B (UUIDv4 + WAL persist-before-POST) — adds 2×
  fsync/event and a new failure mode for a problem Phase 121 already
  solved at the DB layer. Strategy C (UUIDv4, advance offsets only on
  2xx) — violates SC #3 because a crash between successful POST and
  `offsets.json` write produces duplicate rows on restart-replay.

  **Spec extension note:** Phase 121 D-C1 wording was "UUIDv4 per event."
  That wording addressed network retry semantics only. Strategy A still
  satisfies D-C1's intent ("same key survives retries"); the key is
  deterministic rather than random, which is irrelevant to Phase 121's
  contract — the partial unique index doesn't care whether the value is
  random or deterministic, only that it's stable across retries. The
  daemon-side change is from `UUID()` to a hash function call. No
  vigil-core changes required.

- **D-02 (ruleVersion stays at "v1", no DB schema change):** The
  `ruleVersion` is a Swift `let ruleVersion = "v1"` const inside the
  hash input. It is NOT exposed as a column on `agent_events`. Future
  parser fixes that ship without rewinding `offsets.json` only affect
  future lines — past lines are not re-parsed, so no re-emission
  collision is possible. The dial is reserved for **deliberate
  operator-initiated backfills**: bump locally, rewind offsets, replay,
  revert. Daemon logs at emit time are the audit trail for which rule
  version produced a given hash; no need to make it queryable.

  **Subtlety preserved:** if a rule fix changes which `eventType` a
  line emits (e.g., v1 misclassified `task_failed`, v2 emits
  `task_complete` for the same line), the hash naturally diverges
  because `eventType` is in the hash input. So even at v1, the same
  line at the same offset CAN coexist as two rows with different
  event types after a backfill — no rule-version bump needed for that
  case. The bump is only needed for backfills where the same logical
  event class changed in some other way (different message text format,
  different metadata).

### Detection thresholds (Area 2)

- **D-03 (`needs_input_gap_seconds = 10`, watch.toml default):** Gap
  threshold between `assistant` line carrying inner `tool_use` and the
  matching `user` line carrying `tool_result` (with same `tool_use_id`).
  Combined with `permissionMode != "bypassPermissions"` per Phase 120
  README. 10s balances false-positive rate (most legit tool calls
  complete <5s) against responsiveness (user notices glasses buzz
  before walking away). 5s risks false positives on `find /` /
  `npm install`-style legit-long calls; 15s is noticeably late.

- **D-04 (`task_complete_silence_seconds = 30`, watch.toml default):**
  Silence threshold after `assistant.message.stop_reason == "end_turn"`
  before emitting `task_complete`. Distinct from the locked `heartbeat`
  threshold of 60s so the two events don't fire on the same tick.
  UX progression: T+30 = "Claude done with this turn" (task_complete);
  T+60 = "session sitting idle" (heartbeat). 60s default would collide
  awkwardly; 90s feels laggy.

- **D-05 (locked thresholds carried verbatim from ROADMAP/REQUIREMENTS):**
  `needs_input_debounce_seconds = 30` (one needs_input per session per
  30s window — distinct from D-03's gap-before-fire); `heartbeat_seconds = 60`
  (silence threshold for heartbeat emission). All three thresholds plus
  D-03/D-04 are exposed in `watch.toml` for user tuning.

- **D-06 (timer-driven evaluation required):** All silence/gap-based
  events (`needs_input` after gap, `task_complete` after silence,
  `heartbeat` after silence) require per-session timer evaluation in
  the daemon — they cannot be lazy-evaluated on next JSONL append,
  because no further JSONL append arrives while the user is
  unresponsive (defeats the entire purpose). Implementation detail
  flagged for planner; not a user-visible decision.

### Milestone re-emission policy (Area 3)

- **D-07 (`(session_id, pattern_regex)` keyed dedupe):** Each
  `(sessionId, milestonePattern)` pair fires `milestone` exactly once
  per daemon lifetime per session. A new sessionId resets the dedupe
  state (same pattern matching in a fresh session DOES re-emit — this
  is the desired UX, otherwise the user gets buzzed once ever). Honors
  ROADMAP SC #2 ("milestone once per pattern per session") verbatim.

- **D-08 (Match-state persisted across restarts):** Phase 121's partial
  unique index dedupes at the LINE level (same offset, same hash) — it
  does NOT enforce "once per (session, pattern)." Two different lines
  in the same session matching the same pattern would produce two
  separate hashes and both rows would land. To honor SC #2 across
  daemon restarts, the daemon persists the
  `Set<(sessionId, patternRegex, firstMatchOffset)>` to disk and reloads
  on startup.

- **D-09 (Match-state lives in extended `offsets.json` schema):**
  Single file, single schema bump. `offsets.json` becomes:
  ```json
  {
    "schema_version": 2,
    "offsets": { "<jsonl-file-id>": <bytePos> },
    "milestones_emitted": {
      "<sessionId>": [
        { "pattern": "<regex>", "first_match_offset": <bytePos>, "emitted_at": "<ISO-8601>" }
      ]
    }
  }
  ```
  Atomic rename on update preserves consistency. One file to back up
  or inspect. Sessions older than 24h (matches Phase 121's GET sliding
  window) can be GC'd lazily on read or on a periodic timer.

- **D-10 (Conservative 6-pattern starter for `milestone_patterns`,
  case-insensitive by default):** First-run `watch.toml` ships with:
  ```toml
  milestone_patterns = [
    '^[✓✔] ',                                            # celebratory checkmark line-start
    '\b(all|every)\s+(tests?|checks?)\s+(pass|passed|passing)\b',  # test pass
    '\bbuild\s+(succeeded|successful|complete)\b',       # build pass
    '\b(plan|phase)\s+\d+(\.\d+)?(-\d+)?\s+complete\b',  # GSD plan/phase complete
    '\bdeployed\s+(to\s+\S+\s+)?successfully\b',         # deployment
    '\bPR\s+#\d+\s+(created|merged)\b',                  # GitHub PR
  ]
  ```
  Patterns are tuned for the user's actual workflow (GSD `plan/phase
  complete` matches Claude's GSD-skill responses verbatim; the others
  are common across dev projects). All patterns evaluated with implicit
  `(?i)` case-insensitive flag — daemon prepends `(?i)` to each pattern
  before compilation. User can opt out for a specific pattern with
  inline `(?-i)`. Empty `[]` was rejected (feature would be invisible
  until configured); aggressive 8-12 pattern starter was rejected
  (early false positives sour first impression).

### Claude's Discretion

- **Logging surface (foreground run):** Two streams. **stdout** = newline-
  delimited JSON, one line per emitted Vigil event (machine-parseable;
  Phase 123's `tail` builds on top easily). Each line shape: `{ts,
  session_id, event, message, label, host, exit_code, client_event_id,
  post_status}`. **stderr** = human-readable operational logs (`[INFO]`,
  `[WARN]`, `[ERROR]` prefix) for daemon lifecycle (startup, file
  watching, queue depth, network errors, retry attempts). Both visible
  when running `vigil-watch` in foreground; launchd captures them
  separately via `StandardOutPath = /tmp/vigil-watch.out` and
  `StandardErrorPath = /tmp/vigil-watch.err` in Phase 123. Apple OSLog
  is OUT — overkill for a single-user dev daemon and Phase 123 `tail`
  becomes a thin `tail -f` wrapper this way.

- **Swift package layout:** Single `Package.swift` at repo root,
  `Sources/VigilWatch/` for library code, `Sources/vigil-watch/main.swift`
  for the executable entry point. `Tests/VigilWatchTests/` for XCTest
  cases. Match standard Swift Package Manager convention.

- **Swift / library picks:** Latest stable Swift (5.10 / 6.0). Built-in
  `URLSession` for HTTP (no `AsyncHTTPClient` dependency — single-user
  daemon doesn't need its connection pooling). Built-in `Foundation`
  + `CoreServices` for `FSEventStream` (no third-party file-watching
  lib). Built-in `os.Logger` for stderr formatting if useful, otherwise
  raw `print(..., to: &stderr)`. Hand-rolled minimal TOML parser is
  acceptable since `watch.toml` schema is small and stable; if a
  third-party TOML lib is preferred, `LebJe/toml` is the lightest.
  Swift Concurrency (`actor` per session for timer state, `async/await`
  for HTTP); no Combine.

- **Atomic file writes for `offsets.json`:** write-temp-then-rename
  pattern. Write to `offsets.json.tmp` in the same directory, fsync,
  then `rename(2)` over `offsets.json`. macOS guarantees atomicity for
  same-filesystem rename. Any reader sees either the old complete file
  or the new complete file — never a torn write.

- **JSONL parsing robustness:** Read with a tail-style cursor, only
  parse complete `\n`-terminated lines. If a partial line is observed,
  hold the buffer and re-read on next FSEventStream tick. Skip and log
  any line that fails JSON parse (do NOT advance the offset past the
  bad line — leave it for re-attempt on next read). For the 7 known
  non-spec line types (`attachment`, `queue-operation`,
  `file-history-snapshot`, `last-prompt`, `ai-title`, `summary`,
  `system`), advance offset, do NOT emit.

- **Project-namespace enumeration:** Default `projects_dir = ~/.claude/projects/`
  (the parent), enumerate ALL subdirectories matching the
  `<cwd-encoded>/` shape per Phase 120 README's implementation note.
  watch.toml override is allowlist-style — if user sets
  `projects_dir = "~/.claude/projects/specific-namespace"`, only that
  namespace is watched.

- **HTTP retry/backoff:** Exponential with jitter — 1s, 2s, 4s, 8s,
  16s, 32s capped, ~25% jitter. Max 6 attempts before queueing for
  later (after which the event sits in the in-memory queue until the
  next emit triggers a fresh attempt sweep). Network errors retry;
  4xx (except 429) does NOT retry — log as drop-event with reason.
  429 retries with `Retry-After` header honored.

- **First-run `watch.toml` creation:** If file does not exist, write
  it with documented defaults (commented inline, not just key=value).
  Path is `~/.config/vigil/watch.toml` per REQUIREMENTS AGENT-WATCH-06;
  daemon creates `~/.config/vigil/` directory if needed. Failure to
  create the file is a fatal startup error — daemon exits with
  non-zero and stderr explanation.

- **Bearer key bootstrap:** `api_key` in watch.toml takes precedence;
  if blank or missing, daemon reads `VIGIL_API_KEY` env var (per
  AGENT-WATCH-06). If both are blank/missing, daemon logs the missing-
  credential error to stderr but continues running with a quarantine
  state — events accumulate in the in-memory queue (capped at 100,
  oldest dropped) until a key is provided via SIGHUP-reload or restart.
  The reasoning: a misconfig at install shouldn't crash the daemon and
  block launchd's `KeepAlive` from healing the situation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v3.8 Milestone Spec (load-bearing for entire milestone)
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` — full milestone spec.
  Phase 122 implements §"vigil-watch Daemon" (internal architecture,
  configuration TOML schema, runtime modes, retry/backoff, CLI surface
  scoping note).

### Phase 120 Day-1 findings (canonical detection rules)
- `https://github.com/dttigers/vigil-watch/blob/main/README.md` — public
  Day-1 findings document. Contains the **8-row JSONL line-type
  mapping table** (one row per assumed line type, status
  Confirmed/Corrected/Missing) AND the **inverse Vigil-event-keyed
  detection table** that is Phase 122's parser source-of-truth. Phase
  122's parser implementation reads this directly. Local checkout at
  `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/README.md`.
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/`
  — 16 raw JSONL excerpts grounding every detection rule. Read for
  edge-case understanding (e.g., `is_error: true` payload shape,
  `permissionMode` field locations).
- `.planning/phases/120-day-1-jsonl-schema-verification-detection-strategy-lock/120-CONTEXT.md`
  — Phase 120 decisions D-01..D-07; in particular D-06's pragmatic-
  fallback rule (Phase 122 inherits the `spec-correct-and-proceed`
  verdict — no fallback path needed).
- `.planning/phases/120-day-1-jsonl-schema-verification-detection-strategy-lock/120-03-SUMMARY.md`
  — final verdict and 4 implementation notes for Phase 122 (needs_input
  field path, task_failed field path, task_complete heuristic,
  project-namespace enumeration, line-type noise filtering).

### Phase 121 API contract (vigil-watch's only consumer-facing dependency)
- `.planning/phases/121-agent-events-api-foundation-cross-user-isolation-lock/121-CONTEXT.md`
  — D-A1..D-D2 lock the schema, payload shape, and idempotency contract.
  Phase 122 daemon must produce payloads matching D-A4 (8 fields including
  `client_event_id`) and dedupe contract D-C1..D-C3 (200 on dup, 201 on
  insert, `client_event_id` REQUIRED).
- `vigil-core/src/routes/agent-events.ts` — actual route source. Read
  to understand exact request/response shapes (KNOWN_FIELDS allowlist,
  VALID_EVENTS list, error envelope shape).
- `vigil-core/drizzle/0018_add_agent_events.sql` — table schema, CHECK
  constraint values verbatim, partial unique index predicate. Phase 122
  payload field order/names align with this.

### Phase 122 Requirements
- `.planning/REQUIREMENTS.md` — AGENT-WATCH-01 (FSEventStream + debounce),
  AGENT-WATCH-02 (parser + offsets.json), AGENT-WATCH-03 (POST + retry +
  queue + 5s SIGTERM drain), AGENT-WATCH-06 (watch.toml + env fallback).
- `.planning/ROADMAP.md` §"Phase 122" — 5 success criteria items.
  SC #3 (zero duplicate event rows after restart) is structurally tied
  to D-01 above.

### Project context
- `.planning/PROJECT.md` — Vigil project context, Key Decisions table,
  v3.8 milestone goals.
- `.planning/STATE.md` — current milestone state, deferred items.
- `.planning/codebase/STACK.md`, `STRUCTURE.md`, `CONVENTIONS.md` —
  for vigil-core consumer-side conventions only; vigil-watch is a
  fresh Swift codebase, so most CLAUDE.md guidance is vigil-core-only.

### Existing vigil-watch repo (Phase 120 deliverable)
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/` — Swift Package,
  MIT, public at `github.com/dttigers/vigil-watch`. Currently README +
  LICENSE + verification-log/ only. Phase 122 lands `Package.swift`,
  `Sources/`, `Tests/` — first real production code.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **None on the Swift side.** vigil-watch repo is fresh Swift Package
  with only README + LICENSE + verification-log/ at Phase 122 entry.
  All daemon code is new in this phase.
- **vigil-core route as integration test target:** `vigil-core` runs
  locally on port 3001 (per memory: iMac vigilcore launchd daemon).
  The smoke-test path for Phase 122 is `vigil-watch` → local vigil-core
  → live Postgres. No mocking needed.

### Established Patterns (carried forward)

- **`spec-correct-and-proceed` verdict:** Phase 120 confirmed JSONL
  approach is viable. NO fallback paths (notification observation, VS
  Code extension, process inspection) needed. Phase 122 implements the
  JSONL approach directly.
- **Field-path detection rules (JSONPath-style):** the canonical
  interface between schema-verification and parser-implementation.
  Phase 122 implements the inverse Vigil-event-keyed table verbatim.
- **Public repo + MIT default:** matches vigil-core / vigil-g2-plugin /
  vigil-watch posture. No deviation.
- **Composite-keyed idempotency at the API layer (Phase 121):** Phase
  122 leverages this — `client_event_id` is a payload-side concern;
  vigil-core's partial unique index handles dedupe centrally.
- **Drift detector pattern (Phase 121 D-T2):** Phase 122 SHOULD include
  a Swift-side drift test that locks the 5 `VALID_EVENTS` strings
  against Phase 121's `agent-events.ts` route source — if vigil-core
  ever renames an event, vigil-watch's test fails. Specific pattern:
  test reads `vigil-core/src/routes/agent-events.ts` from a sibling
  checkout via env var, regex-matches the `VALID_EVENTS` array, asserts
  Swift's `enum VigilEvent` cases are byte-identical strings.

### Integration Points

- **vigil-core API:** Phase 122 daemon POSTs to `${api_url}/v1/agent-events`
  with `Authorization: Bearer ${api_key}`. Default `api_url` is the
  Railway-deployed prod URL `https://api.vigilhub.io` (per memory:
  custom domain live since 2026-04-08). Local dev: override to
  `http://127.0.0.1:3001` via watch.toml.
- **macOS file system:** FSEventStream watches
  `~/.claude/projects/<cwd-encoded>/` recursively for new files and
  appends. `kFSEventStreamCreateFlagFileEvents` flag required for
  per-file granularity.
- **launchd (Phase 123, NOT this phase):** Phase 122 binary supports
  foreground run mode only. SIGTERM handling (5s queue drain + clean
  exit) is implemented in Phase 122 because launchd will deliver
  SIGTERM in Phase 123 — better to land it correct from day one.

</code_context>

<specifics>
## Specific Ideas

- **GSD plan/phase complete pattern (D-10):** the user's daily workflow
  is heavily GSD-driven. Including the regex
  `\b(plan|phase)\s+\d+(\.\d+)?(-\d+)?\s+complete\b` as a default
  milestone seed is high-signal because Claude's GSD skill responses
  literally say "Phase 121 complete" / "Plan 122-03 complete" verbatim.
  The user will get a buzz for every GSD milestone they hit, free of
  configuration cost.
- **Two-stage UX progression (D-04):** task_complete at T+30s and
  heartbeat at T+60s gives the user a meaningful sequence — first ping
  says "Claude is done with this turn" (might want to glance);
  second-tier ping at T+60 says "session is just sitting" (ambient
  awareness, ignorable). User explicitly traded against same-tick
  collision in the discussion.
- **Strategy A wins because Phase 121 already paid the dedupe cost:**
  the partial unique index is the Phase 121 contract; reusing it
  means zero new failure surface in Phase 122. The user explicitly
  endorsed leveraging existing infra over adding a WAL.

</specifics>

<deferred>
## Deferred Ideas

- **Logging surface deep-dive** — user explicitly skipped discussing
  this; Claude's discretion locked structured-JSONL-on-stdout +
  human-readable-on-stderr above. If Phase 123 finds the format
  insufficient (e.g., `tail` needs richer fields), iterate then.
- **OSLog integration** — explicitly OUT for now. Could add as Phase
  124+ rider if `Console.app` becomes a useful debug surface.
- **Cross-Mac verification on MacBook Pro** — already deferred to
  Phase 123 install-time per Phase 120 D-07. Phase 122 verifies on
  iMac only.
- **Per-event retry budget** — currently 6 attempts then queue. Could
  add per-event TTL (drop event after T hours regardless of attempts)
  for very-long-offline cases. Defer until empirical evidence shows
  the 100-event queue + indefinite retry is insufficient.
- **`detection_rule_version` column on agent_events** — D-02 explicitly
  rejected adding it now. If a future Phase 122.x parser fix demands
  re-emission alongside old emissions, revisit then with a real use
  case. (The current escape hatch — bump ruleVersion locally for a
  one-off backfill — is sufficient for the foreseeable case.)
- **Async TOML reload via SIGHUP** — Claude's discretion noted
  "SIGHUP-reload" as the path for fixing missing `api_key` without
  restart. Implementation is a Phase 123 follow-on if needed; Phase
  122 reads watch.toml at startup only.
- **Multi-daemon coexistence** — only one `vigil-watch` daemon should
  run per Mac at a time (offsets.json contention otherwise). Phase 123
  will enforce via launchd's exclusive label; Phase 122 documents the
  expectation but doesn't enforce.

</deferred>

---

*Phase: 122-vigil-watch-core-watcher-parser-emitter-config*
*Context gathered: 2026-05-08*
