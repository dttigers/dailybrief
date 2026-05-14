# Spike Manifest

## Idea

Validate a 5th write-back path (`tmux send-keys` — Path E) for Phase 128b G2-REPLY-01, ahead of the planned empirical sweep of the 4 enumerated paths (A=JSONL, B=stream-json, C=FIFO/proc-fd, D=MCP). Motivated by an operator observation 2026-05-14: "is vigil-watch basically a tmux session? G2 is sort of a terminal." If Path E PASSes D-V1, it potentially short-circuits 3+ hours of 128b investigation and reframes the production shape from "invent a write-back primitive" to "use a battle-tested IPC + launcher wrapper".

## Requirements

(Tracked as they emerge from spiking. Non-negotiable for the real build.)

- **Claude Code must be launchable inside a tmux pane** — operator's launcher (e.g., `vigil-claude` wrapper) wraps `claude` in a uniquely-named tmux session. If absent, vigil-watch must detect and degrade to banner-ack-only.
- **The 5-string reply allowlist** (`yes`/`no`/`continue`/`abort`/`defer` — locked by G2-REPLY-04) is enforced at the writer-process call site BEFORE any `tmux send-keys` invocation. Drift-detector test pins this in Phase 133.
- **Writer process runs as operator's user.** No setuid, no ptrace, no root. tmux socket is `0700` to the user; Phase 133's writer-process has access without elevation.
- **Session-name discipline**: managed sessions use a known prefix (e.g., `vigil-claude-*`). Writer refuses send-keys to sessions outside the prefix (clobber-protection).

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | tmux-write-back-128b | standard | Given an active interactive `claude` session running inside tmux, when a separate non-TTY writer invokes `tmux send-keys`, then Claude processes the reply as the next user turn AND the session continues healthy ≥60s (128b D-V1 four-step PASS gate) | ✓ VALIDATED | 128b, write-back, tmux, claude-code, ipc, needs-input, g2-reply |
