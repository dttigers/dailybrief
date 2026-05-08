# Phase 122: vigil-watch core — watcher + parser + emitter + config - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 122-vigil-watch-core-watcher-parser-emitter-config
**Areas discussed:** Restart-safe event identity, Detection thresholds (concrete numbers), Milestone seed patterns

---

## Restart-safe event identity

### Sub-question 1: Event-identity strategy

| Option | Description | Selected |
|--------|-------------|----------|
| A — Deterministic hash | client_event_id = sha256(sessionId\|jsonlOffset\|eventType\|ruleVersion). Restart-safe via Postgres partial unique index. ruleVersion knob for intentional re-emits. No new disk state. | ✓ |
| B — UUIDv4 + WAL persist-before-POST | Generate UUID, fsync to a small WAL file before POST attempt, fsync ack after 2xx. Real UUIDs in DB. Adds 2× fsync per event + WAL corruption failure mode. | |
| C — UUIDv4, offsets advance only on 2xx | Simplest code. Crash between POST and offsets-write → restart re-emits with NEW UUID → duplicate row. Violates SC #3. | |

**User's choice:** A — Deterministic hash (recommended)
**Notes:** Phase 121 already paid the dedupe cost via the partial unique index `(user_id, client_event_id) WHERE client_event_id IS NOT NULL`. Strategy A reuses that contract with zero new failure surface. Phase 121 D-C1 wording ("UUIDv4") was about retry semantics; the partial unique index doesn't care whether the value is random or deterministic.

### Sub-question 2: Rule-version handling

| Option | Description | Selected |
|--------|-------------|----------|
| Stay at v1 indefinitely | Once a line is emitted at v1, the key is locked. Future parser fixes only affect future lines. | |
| Bump on parser-logic fixes | Phase 122.x increments to v2 with a detection_rule_version column on agent_events. | |
| Stay at v1 — DB schema unchanged | ruleVersion lives only inside the daemon's hash input as a const; not queryable. Operator-bumps locally for backfills. | ✓ |

**User's choice:** Stay at v1 — DB schema unchanged (after asking "Thoughts?")
**Notes:** Recommended Option 3 because the dial is most useful for deliberate operator-initiated backfills, not routine parser fixes. Once offsets.json advances past byte X, that line is never re-parsed. Adding a column to a brand-new Phase 121 schema for hypothetical future need is the wrong shape. If a rule fix changes which eventType a line emits, the hash naturally diverges (eventType is in the hash input) — the rule-version dial is only needed for backfills where the same logical event class changed in some other way. User confirmed: "Yes — lock Option 3."

---

## Detection thresholds (concrete numbers)

### Sub-question 1: needs_input_gap_seconds default

| Option | Description | Selected |
|--------|-------------|----------|
| 10s | Balanced. False positives rare; glasses buzz before user notices the prompt. | ✓ |
| 5s | Faster. Risk of false positives on legit long tool calls. | |
| 15s | Conservative. Glasses buzz noticeably late. | |

**User's choice:** 10s (recommended)
**Notes:** In default permissionMode, every tool call requires user approval. 1-2s gap = "user clicked Approve immediately"; 10s+ gap = "user didn't see the prompt." 10s balances false-positive rate against responsiveness.

### Sub-question 2: task_complete_silence_seconds default (heartbeat is locked at 60s)

| Option | Description | Selected |
|--------|-------------|----------|
| 30s | Distinct from heartbeat. UX: T+30 'Claude done with turn' → T+60 'session idle.' Two-stage progression. | ✓ |
| 45s | Middle ground; less collision risk with heartbeat but still a clear 'Claude done' signal. | |
| 60s | Same as heartbeat. Both events fire on same tick — likely awkward. | |

**User's choice:** 30s (recommended)
**Notes:** Heartbeat is at 60s per ROADMAP. Two-stage progression gives a meaningful sequence — first ping says "Claude is done with this turn"; second-tier ping at T+60 says "session is just sitting."

### Sub-question 3: milestone re-emission keying

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm — (session_id, pattern) keyed | Roadmap SC §2 verbatim. Cross-session reset is the natural behavior. Match-state held in daemon RAM, persisted across restarts. | (asked for recommendation) |
| Reconsider — globally once per pattern | Same pattern across sessions only fires once total per daemon lifetime. | |

**User's choice:** "what would you recommend?"
**Notes:** Recommended (session_id, pattern_regex) keyed because the global option would mean the user gets buzzed once ever for the lifetime of the daemon — useless. Each new Claude Code session is typically a new task, so a fresh "build successful" matching the pattern in a fresh session is real signal. Surfaced subtlety: Phase 121's partial unique index dedupes at the LINE level (same offset, same hash) — different lines = different hashes = both land. So Phase 121's dedupe alone won't enforce SC #2; match-state persistence is required. User confirmed: "Yes — lock + persist match-state (recommended)" and "Extend offsets.json (recommended)" for storage location.

---

## Milestone seed patterns

### Sub-question 1: First-run default for milestone_patterns

| Option | Description | Selected |
|--------|-------------|----------|
| B — 6-pattern conservative starter | Ships with checkmark line-start, test-pass, build-pass, GSD plan/phase complete, deployment, PR# created/merged. | ✓ |
| B — with adjustments | User would tell me which patterns to add/drop. | |
| A — empty [] | Pure 'you teach me.' Feature silent until configured. Cleanest but risks invisibility. | |

**User's choice:** B — 6-pattern conservative starter (recommended)
**Notes:** Tuned for the user's actual workflow. The GSD plan/phase complete pattern is high-signal because Claude's GSD skill responses literally say "Phase 121 complete" / "Plan 122-03 complete" verbatim — user gets a buzz for every GSD milestone they hit, free of configuration cost. Aggressive 8-12 pattern starter rejected — early false positives sour first impression.

### Sub-question 2: Case-sensitivity default for milestone matching

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — case-insensitive | Apply (?i) implicitly on every milestone_pattern regex. 'Build Succeeded' / 'BUILD succeeded' all match without authoring three patterns. | ✓ |
| No — case-sensitive, user adds (?i) themselves | Strict match. More work. | |

**User's choice:** Yes — case-insensitive (recommended)
**Notes:** User can opt out with inline `(?-i)` for a specific pattern.

---

## Areas declined for discussion (Claude's discretion locked in CONTEXT.md)

- **Logging surface during foreground run** — User explicitly skipped (4th original gray area). Locked: stdout = newline-delimited JSON of emitted Vigil events; stderr = human-readable [INFO]/[WARN]/[ERROR] operational logs. Apple OSLog explicitly OUT.

## Claude's Discretion (locked in CONTEXT.md without user discussion)

- Logging surface (stdout JSONL of events + stderr human-readable operational logs)
- Swift package layout (single Package.swift, Sources/VigilWatch/ + Sources/vigil-watch/main.swift, Tests/VigilWatchTests/)
- Library picks (URLSession, Foundation/CoreServices, os.Logger or raw stderr, hand-rolled or LebJe/toml for TOML)
- Atomic file writes via write-temp-then-rename
- JSONL parsing robustness (tail cursor, only parse complete \n-terminated lines, skip 7 known non-spec line types)
- Project-namespace enumeration (default ~/.claude/projects/, allowlist override via watch.toml)
- HTTP retry/backoff (exponential with jitter — 1/2/4/8/16/32s capped, ~25% jitter, max 6 attempts, then queue)
- First-run watch.toml creation (write with documented inline-commented defaults)
- Bearer key bootstrap (api_key in TOML > VIGIL_API_KEY env var > quarantine state with stderr log)
- Drift-detector test (lock 5 VALID_EVENTS strings against vigil-core/src/routes/agent-events.ts via env-var sibling-checkout regex match)

## Deferred Ideas (captured in CONTEXT.md `<deferred>` section)

- Logging surface deep-dive (revisit if Phase 123 `tail` finds the format insufficient)
- OSLog integration (Phase 124+ rider if Console.app becomes a useful debug surface)
- Cross-Mac verification on MacBook Pro (already deferred to Phase 123 install-time per Phase 120 D-07)
- Per-event retry budget / TTL (defer until empirical evidence shows 100-event queue + indefinite retry insufficient)
- `detection_rule_version` column on agent_events (revisit only if a future Phase 122.x demands automatic re-emission)
- Async TOML reload via SIGHUP (Phase 123 follow-on if needed)
- Multi-daemon coexistence enforcement (Phase 123 via launchd exclusive label)
