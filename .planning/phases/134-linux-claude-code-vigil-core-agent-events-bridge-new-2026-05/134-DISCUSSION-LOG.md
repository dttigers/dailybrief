# Phase 134: Linux Claude Code → vigil-core agent-events bridge (NEW 2026-05-18) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 134-Linux-Claude-Code-vigil-core-agent-events-bridge
**Mode:** `--auto` (operator authorized "work without stopping for clarifying questions" via session-level system reminder; pattern mirrors Phase 130's autonomous-discuss approach)
**Areas discussed (autonomous):** Hook language/layout, Hook protocol (STDIN JSON vs env var), Payload contract, Auth & fail-safe, Privacy redaction, Installer mechanics, Telemetry posture, Drift detector design

---

## Hook language + source layout

| Option | Description | Selected |
|--------|-------------|----------|
| Pure bash (runtime + installer) | Single-language; simplest; but JSON manipulation of `~/.claude/settings.json` is hostile in bash | |
| Pure node (runtime + installer) | Friendlier for JSON parse; but ~70 ms cold start adds latency to every hook fire vs bash's ~5 ms | |
| **Bash runtime + Node installer (split)** | Bash for fire-and-forget hooks (matches existing GSD hook style at `~/.claude/hooks/`; fast cold start; idiomatic curl + regex). Node for the one-shot installer that must parse/splice JSON without clobbering existing GSD entries. Single `install.sh` wrapper execs `node install.js`. | ✓ |
| TypeScript runtime via ts-node | Adds toolchain weight for a fire-and-forget hook; runtime startup unacceptably slow | |

**Recommended-default rationale:** Existing GSD hooks on this box are all bash with `node -e "..."` pipes for JSON parse — that's the canonical Linux Claude Code hook style. Phase 134 mirrors. The installer is one-shot and benefits from real JSON parse semantics, so node makes sense there. (See CONTEXT D-L1.)

**Source layout:**

| Option | Description | Selected |
|--------|-------------|----------|
| `tools/linux-claude-bridge/` | Too generic | |
| `scripts/linux-hooks/` | Implies one-off scripts, not installable artifacts | |
| `vigil-watch/linux/` | Falsely implies port of Swift daemon (different mechanics) | |
| **`vigil-linux-hooks/` (new top-level)** | Peer to `vigil-core/`, `vigil-pwa/`, `vigil-g2-plugin/`. Self-contained workspace with runtime hook, installer, tests, README. | ✓ |

---

## Hook protocol — session_id source

| Option | Description | Selected |
|--------|-------------|----------|
| `$CLAUDE_SESSION_ID` env var | REQUIREMENTS line hedged on this; not confirmed to exist in actual hook env | |
| **STDIN JSON envelope** | Verified canonical mechanism via existing GSD hooks (`gsd-phase-boundary.sh` reads STDIN JSON for `tool_input.file_path`). Researcher MUST verify the exact field name (`session_id` likely, snake_case). | ✓ |
| Fallback: PID-stamped UUID in `/tmp/` | Last-resort fallback if STDIN doesn't carry session_id. Stable per-session via cached file. | (fallback) |

**Recommended-default rationale:** REQUIREMENTS-line hedging suggests the spec author wasn't certain about env var existence. Empirical pattern in `~/.claude/hooks/` shows STDIN-JSON is the canonical input channel. Researcher MUST validate before plan authoring; ~5-min probe via a test hook. (See CONTEXT D-I1.)

---

## `/v1/agent-events` payload — required fields

| Option | Description | Selected |
|--------|-------------|----------|
| Send only ROADMAP-listed fields (`{session_id, event, message, timestamp}`) | Server would 400 — Phase 121 strict-mode requires 6 fields | |
| **Send ALL Phase 121 required fields** | `session_id`, `event`, `timestamp`, `label`, `host`, `client_event_id` + optional `message`. Strictly schema-compliant per `vigil-core/src/routes/agent-events.ts`. | ✓ |
| Extend Phase 121 KNOWN_FIELDS to add Linux-specific fields | Requires Phase 121 contract amendment + new migration; out of scope for 134 | |

**Recommended-default rationale:** ROADMAP example was INCOMPLETE — verified by reading `vigil-core/src/routes/agent-events.ts:34-43` `KNOWN_FIELDS` and required-field validation paths. Hook MUST emit all 6 required fields verbatim. (See CONTEXT D-P1..D-P5.)

---

## Auth + fail-safe (AGENT-LINUX-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Sync curl with `wait` | Adds up to 2 s latency to every Stop hook → operator-visible turn-boundary lag | |
| **Fire-and-forget curl + disown** | `curl … &; disown`. Hook exits instantly; curl runs detached with 2 s `--max-time`. Zero impact on Claude Code turn latency. | ✓ |
| Background queue daemon | Heavier; defeats "lightweight approach" framing in ROADMAP | |

**Recommended-default rationale:** "Hook MUST NOT block Claude Code session" is a hard requirement. Sync 2 s curl on every Stop event would add ~2 s latency to every assistant turn. Fire-and-forget is the only viable posture. (See CONTEXT D-A2.)

---

## Privacy redaction — denylist source-of-truth

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcode patterns in bash hook + Swift vigil-watch (no shared file) | Drift detector grep-pins both source files; works but cross-language source-of-truth is implicit | |
| **JSON file (`vigil-linux-hooks/redaction-patterns.json`) as canonical source** | Both bash hook AND future vigil-watch parser load patterns at runtime. Drift detector reads JSON + greps both source files. | ✓ |
| Single `.ts` module exported from `vigil-core/src/lib/` | TypeScript can't be loaded by Swift; not portable to vigil-watch's Mac codebase | |

**Recommended-default rationale:** Cross-language compatibility (bash hook + future Swift vigil-watch parser) requires a portable format. JSON is the obvious cross-language canonical source. Hook loads at startup via `node -e "JSON.parse(fs.readFileSync(...))"`; vigil-watch will use `JSONDecoder`. (See CONTEXT D-R1.)

**Redaction posture:**

| Option | Description | Selected |
|--------|-------------|----------|
| Substring-mask the matched secret | Reveals more prompt content; partial-leak edge cases | |
| **Replace entire message with `[redacted: contains sensitive pattern]`** | Binary "redacted vs visible" signal; HUD operator doesn't need prompt content, just session activity. | ✓ |

**Rationale:** HUD's purpose is "is Claude doing something?", not "what exactly is Claude doing?". Coarse-grained redaction is sufficient and avoids edge cases. (See CONTEXT D-R3.)

---

## Installer mechanics (AGENT-LINUX-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Append to `settings.json` via `jq` | Requires jq dependency; not always present on minimal Linux installs | |
| **Read/parse/splice/atomic-write via Node** | `JSON.parse` → modify → `JSON.stringify` → tmpfile + `fs.renameSync`. Idempotent via command-string regex match on existing entries. Node is already required by the existing GSD hook chain (`/usr/bin/node` invoked in settings.json). | ✓ |
| Generate `settings.json` from scratch on each install | DESTROYS existing GSD hooks; unacceptable | |

**Recommended-default rationale:** This Linux box ALREADY has 4 GSD hook entries in `~/.claude/settings.json` (`SessionStart`/`PostToolUse`/`PreToolUse`). Installer MUST splice without clobbering. Node-based JSON manipulation is the only safe path. (See CONTEXT D-N1..D-N3.)

---

## Telemetry posture

| Option | Description | Selected |
|--------|-------------|----------|
| Wire PostHog client-side from hook | Conflicts with "no stderr/stdout noise" requirement; adds dependency | |
| **No client-side telemetry; vigil-core observability covers receive side** | Hook is silent. Phase 121 server-side logs every `POST /v1/agent-events` for ops visibility. Optional `$VIGIL_AGENT_BRIDGE_DEBUG=1` writes to `/tmp/vigil-agent-bridge.log` for diagnosis. | ✓ |
| Crash-only log to `/tmp/` always-on | Would clutter `/tmp/` over time; no operator value | |

**Recommended-default rationale:** Fail-safe + zero-noise are hard requirements. Server-side observability is sufficient for diagnosing "is this firing?" questions. (See CONTEXT D-T1.)

---

## Claude's Discretion

Areas the planner/researcher resolves with sensible defaults (not user-blocking):

- Exact UUID generation source (`uuidgen` vs `/proc/sys/kernel/random/uuid` fallback)
- Hostname form (`hostname -s` short form preferred for HUD readability)
- Timestamp format (`date -Iseconds`)
- README content (operator install instructions, env var setup, troubleshooting)
- Bash hook script style conventions (mirror `gsd-session-state.sh`)
- vitest config integration path (root workspace vs `vigil-linux-hooks/`-local — preference root)

---

## Deferred Ideas

- Tool-step events (`PreToolUse`/`PostToolUse`) — Phase-135+ candidate (LINUX-ENRICH-01..03 working title)
- Offline queue / retry — LINUX-OFFLINE-01 candidate; not needed for Phase 134's "lightweight" framing
- Multi-operator support on the Linux box — not a real-world concern; deferred indefinitely
- Auto-update mechanism for the hook itself — manual re-install for now
- `SessionEnd` event — not yet in the Claude Code hook protocol
- Reply round-trip (Linux parity for Phase 133 G2-REPLY) — out of scope
- vigil-watch Linux daemon port — Phase-200+ if ever needed; hook approach intentionally lighter

## Cross-phase coordination notes

- **Phase 133 WATCH-ENRICH-03 denylist ordering** — if Phase 133 ships first, Phase 134 mirrors its denylist source. If Phase 134 ships first (current ROADMAP suggests this), Phase 134 owns `vigil-linux-hooks/redaction-patterns.json` and Phase 133 consumes it. Drift detector skips gracefully if the counterpart hasn't shipped.
- **Phase 121 `KNOWN_FIELDS` is frozen** — any future hook payload extension requires a Phase-121 contract amendment + migration. Phase 134 deliberately does NOT push for this.
