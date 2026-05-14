#!/usr/bin/env bash
# PHASE 128b SPIKE 001 — TOSSABLE.
#
# L3: Drive a fresh interactive `claude` session running inside tmux, send
# a user prompt via `tmux send-keys` from outside, and verify Claude
# processed it (response visible in pane capture).
#
# This proves the BASIC mechanism — that Claude Code's interactive TUI
# accepts input from `tmux send-keys` exactly as if typed at the keyboard.
#
# Uses `--bare` (skip hooks/plugins/auto-memory) and `--model haiku`
# (cheap). The spike target session is intentionally isolated from the
# spike-runner's own session (D-T5 clobber-protection): unique session
# name, separate scratch cwd.
#
# PASS criteria: Claude's response contains the sentinel string we asked
# it to emit, proving the prompt was received and processed.

set -euo pipefail

SESSION="spike-128b-L3-$$"
# Sentinel design: ask Claude to compute an arithmetic result that does NOT
# appear in the prompt. This prevents false-positive matches against the
# echoed prompt text in the pane scrollback.
# 7 * 191 = 1337 ; we grep for "1337" which is NOT mentioned in the prompt.
SCRATCH=$(mktemp -d -t spike-128b-L3-XXXXXX)
LOG="${SCRATCH}/l3.log"

cleanup() {
  # Capture final pane before kill (preserved in LOG)
  tmux capture-pane -p -t "$SESSION" 2>/dev/null > "${LOG}.final" || true
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  echo "[L3] artifacts in: $SCRATCH"
}
trap cleanup EXIT

start_ts=$(date +%s)

# Launch claude interactively in a brand-new tmux session, in the scratch dir
# (to avoid touching this project's CLAUDE.md auto-discovery; --bare also
# disables it but belt-and-suspenders).
tmux new-session -d -s "$SESSION" -x 200 -y 50 -c "$SCRATCH" \
  "claude --model haiku"

echo "[L3] spawned claude session '$SESSION' in $SCRATCH"

# Wait for claude to render SOMETHING — either the workspace-trust dialog
# (fresh cwd) or the TUI input prompt (trusted cwd).
trust_dismissed=0
ready=0
for i in $(seq 1 60); do
  sleep 0.5
  CAP=$(tmux capture-pane -p -t "$SESSION" 2>/dev/null || true)

  # Case 1: workspace-trust dialog appeared. Dismiss it via send-keys Enter
  # (option 1 = "Yes, I trust this folder" is pre-selected). This is itself
  # a test of the write-back mechanism: an interactive dialog dismissed
  # from outside the pane via `tmux send-keys`.
  if [[ $trust_dismissed -eq 0 ]] && echo "$CAP" | grep -q "trust this folder"; then
    echo "[L3] workspace-trust dialog detected — dismissing via tmux send-keys Enter"
    tmux send-keys -t "$SESSION" Enter
    trust_dismissed=1
    sleep 1
    continue
  fi

  # Case 2: TUI input prompt is visible
  if echo "$CAP" | grep -qE "shift\+tab|auto mode|Bypassing|Welcome|Try|Ready|claude code v"; then
    ready=1
    echo "[L3] claude TUI ready after $((i*5/10))s (trust dismissed: $trust_dismissed)"
    break
  fi
done

if [[ $ready -eq 0 ]]; then
  echo "L3: FAIL — claude TUI did not become ready within 30s"
  echo "    trust_dismissed=$trust_dismissed"
  echo "    pane content:"
  tmux capture-pane -p -t "$SESSION" 2>/dev/null
  exit 1
fi

# Save the "before" pane state
tmux capture-pane -p -t "$SESSION" > "${LOG}.before"

# Send the user prompt via tmux send-keys. The prompt asks Claude to compute
# an answer (the answer is NOT in the prompt text), so a grep match against
# the answer in the pane proves Claude actually processed and replied.
PROMPT="Compute seven multiplied by one hundred ninety-one. Reply with only the resulting integer and nothing else (no commas, no words, no punctuation)."
EXPECTED="1337"
tmux send-keys -t "$SESSION" "$PROMPT"
sleep 0.3
tmux send-keys -t "$SESSION" Enter

echo "[L3] sent prompt; expected answer: $EXPECTED (NOT mentioned in prompt); waiting for response..."

# Poll capture-pane until the answer appears, or timeout. Snapshot the pane
# the instant we detect a match so the artifact is preserved across the TUI
# refresh.
got_response=0
for i in $(seq 1 90); do
  sleep 1
  CAP=$(tmux capture-pane -p -t "$SESSION" 2>/dev/null || true)
  # The expected answer must appear AND must not be the only number on a
  # line that happens to be in the prompt-area. Belt-and-suspenders: the
  # prompt text deliberately uses only English words for numbers, so the
  # digit string "1337" can only originate from Claude's output.
  if echo "$CAP" | grep -q "$EXPECTED"; then
    # Snapshot immediately to preserve evidence before TUI re-renders
    echo "$CAP" > "${LOG}.at-detection"
    got_response=1
    elapsed=$(( $(date +%s) - start_ts ))
    echo "[L3] expected answer '$EXPECTED' appeared after ${i}s polling (total ${elapsed}s wallclock)"
    break
  fi
done

# Capture the "after" pane state for forensic
tmux capture-pane -p -t "$SESSION" > "${LOG}.after"
# Also capture the full scrollback (more history)
tmux capture-pane -p -t "$SESSION" -S - > "${LOG}.full"

echo "=== L3 RESULT ==="
echo "--- before send-keys ---"
tail -20 "${LOG}.before"
echo "--- after send-keys ---"
tail -30 "${LOG}.after"
echo "--- end ---"

if [[ $got_response -eq 1 ]]; then
  echo "L3: PASS — Claude processed the tmux-injected prompt and emitted the computed answer"
  echo "    expected: $EXPECTED (NOT in prompt; can only come from Claude's response)"
  echo "    snapshot at detection: ${LOG}.at-detection"
  echo "    full transcript: ${LOG}.full"
  exit 0
else
  echo "L3: FAIL — expected answer '$EXPECTED' not seen within 90s"
  echo "    last pane state:"
  tail -30 "${LOG}.after"
  exit 1
fi
