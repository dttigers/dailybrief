---
spike: 128b-write-back
name: 128b-write-back
type: phase-spike
validates: "Empirical record for G2-REPLY-01 enumerated paths (a) JSONL append, (b) stream-json, (d) MCP — completing the 3-of-4 success criterion. Path E (tmux send-keys) is owned by sibling spike 001-tmux-write-back-128b/."
verdict: in-progress
related: [phase-128b, spike-001-tmux-write-back-128b]
tags: [128b, write-back, jsonl, stream-json, mcp, claude-code]
---

# Spike 128b: Write-back path empirical sweep (paths A/B/D)

## Sibling spike

[spike 001 — tmux-write-back-128b](../001-tmux-write-back-128b/README.md) — Path E was VALIDATED on 2026-05-14 in spike 001. This dir holds the per CONTEXT D-A1 empirical record for the four enumerated paths (a)/(b)/(c)/(d) that completes the G2-REPLY-01 "at least 3 of 4" success criterion.

## Layout

```
.planning/spikes/128b-write-back/
├── README.md                    # this file
├── pathB-stream-json.sh         # Path B probe (this plan, 128b-01)
├── pathA-jsonl-append.sh        # Path A probe (created in plan 128b-02)
├── pathD-mcp-probe.sh           # Path D probe driver (created in plan 128b-03)
├── pathD-mcp-server.mjs         # Path D MCP server stub (created in plan 128b-03)
└── evidence/                    # raw probe outputs + per-path TRANSCRIPT.md mini-verdicts
```

## Phase 128b artifacts

- [.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-CONTEXT.md](../../phases/128b-g2-reply-01-write-back-path-spike/128b-CONTEXT.md) — locked decisions (D-V1..V4, D-O1..O4, D-A1..A4, D-G1..G4, D-T1..T5)
- [.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-RESEARCH.md](../../phases/128b-g2-reply-01-write-back-path-spike/128b-RESEARCH.md) — per-path methodology + concrete probe commands
- [.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-VALIDATION.md](../../phases/128b-g2-reply-01-write-back-path-spike/128b-VALIDATION.md) — spike validation strategy
- 128b-SPIKE-DECISION.md — verdict aggregation (created in plan 128b-05)
- 128b-MEASUREMENTS.md — per-path wallclock + cost log (created in plan 128b-06)

## How to run

```bash
# From repo root:
bash .planning/spikes/128b-write-back/pathB-stream-json.sh   # Path B (this plan)
bash .planning/spikes/128b-write-back/pathA-jsonl-append.sh  # Path A (plan 128b-02)
bash .planning/spikes/128b-write-back/pathD-mcp-probe.sh     # Path D (plan 128b-03)
```

Each probe writes its own evidence files into `evidence/` and appends a per-path `path{X}-TRANSCRIPT.md` with the mechanical D-V1 mini-verdict.

## Conventions

See [../CONVENTIONS.md](../CONVENTIONS.md) for the four spike-code mandates: TOSSABLE header on every script, unique tmux session names for clobber-protection, computed sentinels resistant to prompt-echo false positives, and snapshot-at-detection for TUI-rendered output.
