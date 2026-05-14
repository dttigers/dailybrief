# Path D — Per-Path D-V1 Mini-Verdict

Probe run: 2026-05-14T22:35:36+00:00
Script: .planning/spikes/128b-write-back/pathD-mcp-probe.sh
MCP server: .planning/spikes/128b-write-back/pathD-mcp-server.mjs
claude version: 2.1.141 (Claude Code)
SDK availability: 1 (scratch-installed (ad-hoc; stub copied to /tmp/spike-128b-D-wFSnOi/sdk-install/pathD-mcp-server.mjs))

## D-V1 Four-Step Gate (Fresh Session, Claude-pulls model)

| Step | Description | Verdict |
|------|-------------|---------|
| 1    | Reply originates from non-TTY writer | ✓ (env VIGIL_BUFFERED_REPLY=VIGIL-SPIKE-OK-1337 set by probe; server reads from env) |
| 2    | String reaches input channel | ✓ if step 3 ✓ (tool-result is the input channel from MCP server → Claude) |
| 3    | Claude processes as next user turn | ✓ (distinctive sentinel VIGIL-SPIKE-OK-1337 present in stdout — see pathD-fresh-out.txt) |
| 4    | Session continues healthy ≥60s | N/A (claude -p exits after single response — by design) |

## D-V1 Four-Step Gate (Active Session)

| Step | Description | Verdict |
|------|-------------|---------|
| 1    | Reply originates from non-TTY writer | ✓ (server emits a tool result) |
| 2    | String reaches input channel | ✗ STRUCTURAL — MCP tools are tools Claude CALLS, not channels that PUSH to Claude. Vigil cannot force a tool call mid-turn from outside the process. |
| 3    | Claude processes as next user turn | ✗ vacuous (no input received) |
| 4    | Session continues healthy ≥60s | ✗ vacuous |

## Mini-Verdict

**DEGRADE (inverted model — fresh-session-only via prompted tool-call)**

Per CONTEXT line 222 (Deferred Idea — "MCP server-as-prompter UX"):
The interesting v3.10+ variant is "Claude pulls from a `vigil_check_external_reply` tool when it's about to ask the operator" — but that requires Claude to be prompt-conditioned to call the tool before every `needs_input`, which is NOT the round-trip the spike is testing.

## Evidence

- `pathD-mcp-config.json` — the mcp-config wiring the server stub to claude -p
- `pathD-fresh-out.txt` — raw stdout from `claude -p --mcp-config ...` (full transcript including tool invocations)
- `pathD-mcp-server.mjs` — the ~30 LOC stdio MCP server stub
- `pathD-sdk-install-err.txt` — stderr from npx attempt (only present if SDK fetch failed)

## Cited

- CONTEXT D-O1 path (d) — "MCP tools are tools Claude CALLS, not channels that PUSH to Claude. The injection model is inverted."
- CONTEXT line 222 — Deferred MCP-as-prompter UX for v3.10+
- RESEARCH §"Path D" — predicted DEGRADE (inverted model)
- RESEARCH §"Environment Availability" — INCONCLUSIVE fallback if SDK fetch fails
