# Spike Conventions

Patterns that emerged across the spike sessions. New spikes follow these unless the question requires otherwise.

## Stack

- **Scripts**: POSIX bash with `set -euo pipefail`. No `npm install`, no virtualenvs, no Docker. Tools already on PATH (`tmux`, `claude`, standard Unix).
- **Scratch dirs**: `mktemp -d -t spike-NNN-LAYER-XXXXXX` so each run is isolated and postmortem-able. `/tmp/` is the host's reaper-managed scratch — preserve evidence into `.planning/spikes/NNN-name/evidence/` before the trap-cleanup runs.

## Structure

```
.planning/spikes/NNN-descriptive-name/
├── README.md                  # frontmatter + Research + Investigation Trail + Verdict
├── L1-<short-name>.sh         # layered investigation, fast-to-fail first
├── L2-<short-name>.sh
├── L3-<short-name>.sh
├── L4-<short-name>.sh
└── evidence/                  # preserved artifacts (pane snapshots, tool output, etc.)
    ├── L3-...txt
    └── L4-...txt
```

Layered scripts (`L1` … `LN`) are preferred over a single monolithic spike script. Each layer is a separable test that can be re-run independently. Risk-order the layers: cheapest sanity first, most expensive/highest-cost last.

## Patterns

### Tossable headers

Every spike script starts with the TOSSABLE banner (Phase 128a precedent):

```bash
#!/usr/bin/env bash
# PHASE 128b SPIKE NNN — TOSSABLE. Phase <productionization-phase> owns
# the real implementation; this file is spike-only and SHOULD BE DELETED
# after the verdict is committed.
```

### Clobber-protection (tmux + Claude Code)

Spike code that drives `claude` or `tmux` MUST NOT touch the spike-runner's own session:

- Use unique tmux session names: `SESSION="spike-NNN-L{N}-$$"`.
- Use scratch cwd: `mktemp -d`, not the project root.
- For `claude`: drop `--bare` (it strips OAuth/keychain); use `--model haiku` for cost.
- Refuse to write to a session whose ID equals `$CLAUDE_SESSION_ID` if set (D-T5 from 128b CONTEXT).

### False-positive-resistant sentinels

A sentinel that appears in BOTH the prompt and the response is useless — `grep` matches the echoed prompt, not the model's reply. Pattern:

> Ask the model to COMPUTE a value whose answer does NOT appear in the prompt text. Example: "Compute seven multiplied by one hundred ninety-one. Reply with only the resulting integer." → grep for `1337`.

Or: provide an input and ask for a transformation whose output is predictable but distinct from the input.

### Snapshot at moment of detection

TUI applications (`claude`, `python -i`, anything using the alt-screen / scroll-region) can re-render and erase evidence from `tmux capture-pane`. Pattern:

```bash
for i in $(seq 1 N); do
  sleep 1
  CAP=$(tmux capture-pane -p -t "$SESSION")
  if echo "$CAP" | grep -q "$EXPECTED"; then
    echo "$CAP" > "${LOG}.at-detection"   # ← preserve evidence NOW
    break
  fi
done
```

End-of-run scrollback dumps lose the response if the TUI re-renders before cleanup. Always snapshot at detection.

### Evidence preservation

After a spike PASSes, copy the at-detection artifacts into `.planning/spikes/NNN-name/evidence/` before the trap-cleanup deletes the scratch dir. Keep raw pane captures (not just success/fail logs) so future readers can re-verify the verdict.

## Tools & Libraries

- `tmux 3.4` (host-installed) — `new-session -d`, `send-keys`, `capture-pane -p [-S -]`, `kill-session`. The `-S socket` flag is required on macOS where `$TMPDIR` is not `/tmp`.
- `claude 2.1.141` — `--model haiku` for cheap interactive testing. Default permission-mode triggers a dialog on tool use (perfect for `needs_input` testing).
- No external dependencies beyond host tools. Spikes that need MCP / SDK should pull them from `npm`/`pip` ad-hoc inside the spike dir, not into the project.
