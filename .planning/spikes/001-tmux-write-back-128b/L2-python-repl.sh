#!/usr/bin/env bash
# PHASE 128b SPIKE 001 — TOSSABLE.
#
# L2: tmux send-keys into an interactive REPL (python3) that has its own
# read-eval-print loop. This is closer to `claude`'s interactive shape —
# the REPL maintains state, prompts, and produces visible output we can
# verify via `tmux capture-pane`.
#
# PASS criteria: a Python expression sent via `tmux send-keys` is evaluated
# AND its result appears in the pane's captured output.

set -euo pipefail

SESSION="spike-128b-L2-$$"

cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
}
trap cleanup EXIT

# Spawn detached tmux session running python3
tmux new-session -d -s "$SESSION" -x 200 -y 50 "python3 -u -i"

# Wait for python prompt
sleep 0.5

# Send a unique computation
SENTINEL="MAGIC$$"
tmux send-keys -t "$SESSION" "print('${SENTINEL}-' + str(7*191))" Enter

# Let python evaluate
sleep 0.5

# Capture pane and check
CAP=$(tmux capture-pane -p -t "$SESSION")

echo "=== L2 RESULT ==="
echo "--- pane capture ---"
echo "$CAP"
echo "--- end capture ---"
EXPECTED="${SENTINEL}-1337"
if echo "$CAP" | grep -q "$EXPECTED"; then
  echo "L2: PASS — tmux send-keys delivered Python expression, REPL evaluated, result visible"
  echo "    expected output: $EXPECTED"
  exit 0
else
  echo "L2: FAIL — expected '$EXPECTED' not found in pane capture"
  exit 1
fi
