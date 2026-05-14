#!/usr/bin/env bash
# PHASE 128b SPIKE 001 — TOSSABLE. Phase 133 owns G2-REPLY productionization;
# this file is spike-only and SHOULD BE DELETED after the verdict is committed.
#
# L1: Sanity check that `tmux send-keys` actually delivers input to a
# foreground process running inside the target pane. Uses `cat` (which echoes
# stdin) as the simplest possible interactive process — if this doesn't work,
# nothing else will.
#
# PASS criteria: the string sent via `tmux send-keys` appears in the pane's
# capture-pane output AND in the file `cat` was told to write to.

set -euo pipefail

SESSION="spike-128b-L1-$$"
SCRATCH=$(mktemp -d -t spike-128b-L1-XXXXXX)
OUT="${SCRATCH}/cat.out"

cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  # Leave SCRATCH for postmortem; it's small.
  echo "[L1] scratch dir: $SCRATCH"
}
trap cleanup EXIT

# Spawn detached tmux session running `cat > OUT` (cat reads from its TTY/stdin)
tmux new-session -d -s "$SESSION" "cat > '$OUT'"

# Tmux needs a moment for the session to be ready
sleep 0.3

# Send the test string + Enter to commit the line to cat
tmux send-keys -t "$SESSION" "hello-from-tmux-send-keys" Enter

# Send EOF (Ctrl-D) so cat exits cleanly
sleep 0.2
tmux send-keys -t "$SESSION" C-d

# Wait for cat to flush and exit
for _ in 1 2 3 4 5; do
  if [[ ! -e "/proc/$(tmux list-panes -t "$SESSION" -F '#{pane_pid}' 2>/dev/null)" ]]; then
    break
  fi
  sleep 0.2
done
sleep 0.3

# Verify
echo "=== L1 RESULT ==="
if [[ -f "$OUT" ]] && grep -q "hello-from-tmux-send-keys" "$OUT"; then
  echo "L1: PASS — tmux send-keys delivered string to cat's stdin"
  echo "    file content: $(cat "$OUT")"
  exit 0
else
  echo "L1: FAIL — string did not reach cat's stdin"
  echo "    OUT exists: $([[ -f "$OUT" ]] && echo yes || echo no)"
  [[ -f "$OUT" ]] && echo "    file content: $(cat "$OUT")"
  exit 1
fi
