# Path B — Per-Path D-V1 Mini-Verdict

Probe run: 2026-05-14T22:09:45+00:00
Script: .planning/spikes/128b-write-back/pathB-stream-json.sh
claude version: 2.1.141 (Claude Code)

## D-V1 Four-Step Gate

| Step | Description | Fresh session | Active session |
|------|-------------|---------------|----------------|
| 1    | Reply originates from a non-TTY writer process | ✓ (bash heredoc piped into claude stdin) | ✗ (no input channel — `-p` is print-and-exit) |
| 2    | String reaches input channel | ✓ (stdin of fresh claude subprocess) | ✗ (no active-session attach surface) |
| 3    | Claude processes as next user turn | ✓ (sentinel 1337 present in stream-json output) | ✗ (vacuous — no input was received) |
| 4    | Session continues healthy ≥60s | N/A (claude -p exits after single response — by design, not a failure) | ✗ (vacuous) |

## Mini-Verdict

**Fresh-session: PASS**
**Active-session: STRUCTURAL FAIL** (no input channel exists; not a defect of Path B but a property of `claude -p`).

**Per D-V2 bullet 1** ("Round-trip works ONLY on fresh `claude -p` sessions, NOT mid-interactive-session"):
Path B mini-verdict ⇒ **DEGRADE (fresh-only)**

## Evidence

- `pathB-fresh-out.jsonl` — full stream-json transcript (raw)
- `pathB-fresh-err.txt` — stderr (auth, permission, network errors if any)

## Cited

- CONTEXT D-V1 / D-V2 (verdict gates)
- CONTEXT D-O1 path (b) — "Likely PASSes for fresh sessions; the active-session question is whether stdin is re-readable mid-interactive (it almost certainly is NOT — `-p` is print-and-exit)"
- RESEARCH §"Path B" — predicted verdict DEGRADE (fresh-only) matches empirical result above
