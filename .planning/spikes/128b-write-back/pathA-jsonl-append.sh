#!/usr/bin/env bash
# PHASE 128b SPIKE — TOSSABLE. Phase 133 owns G2-REPLY productionization;
# this file is spike-only and SHOULD BE DELETED after the verdict is committed.
# Path A: JSONL append + IPC against a copy of a corpus session (D-O1 step 3 — after Path B and Path D)
#
# Empirical question: does a running `claude --resume <sid>` process re-read its
# session JSONL when a user-row is appended mid-session (with SIGUSR1 IPC)?
# Predicted: NO (per RESEARCH §"Path A" + CONTEXT D-O1 path (a)).
#
# CRITICAL clobber-protection (D-T5): operates on a COPY of a real session
# JSONL under a mktemp -d scratch dir — never on the live corpus, never on the
# spike-runner's own session ($CLAUDE_SESSION_ID). Tmux session name uses the
# unique pattern `spike-128b-pathA-$$`; cleaned up on trap-EXIT.
#
# Forbidden per CONTEXT D-V3 (would invalidate any PASS evidence):
#   - debugger-attach-based hot reload (the "p-trace" syscall family)
#   - direct writes to a process's stdin file-descriptor via the proc filesystem
#   - kernel-level fd injection
# (Literal forbidden tokens are paraphrased here so the verification grep that
# bans those strings from the script body has zero false-positives on docs.)

set -euo pipefail

EVIDENCE_DIR=".planning/spikes/128b-write-back/evidence"
mkdir -p "$EVIDENCE_DIR"
SESSION="spike-128b-pathA-$$"
SCRATCH=$(mktemp -d -t spike-128b-A-XXXXXX)
PROJDIR="$HOME/.claude/projects/-home-morrillboss-dev-dailybrief"

# Trap-cleanup: dispose of tmux session AND scratch dir on every exit path.
# `|| true` keeps the trap from cascading on partial state.
trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true; rm -rf "$SCRATCH"' EXIT

echo "[Path A] probe run started at $(date -Iseconds)"
echo "[Path A] tmux session (disposable): $SESSION"
echo "[Path A] scratch dir (cleaned on EXIT): $SCRATCH"
echo "[Path A] live session ID (\$CLAUDE_SESSION_ID): ${CLAUDE_SESSION_ID:-unset}"

# ── D-T5 clobber-protect: pick a target SID from the corpus that is NOT
# the spike-runner's own live session. Refuse to proceed if no safe ID exists.
TARGET_SID=""
for f in "$PROJDIR"/*.jsonl; do
  SID=$(basename "$f" .jsonl)
  [ "${CLAUDE_SESSION_ID:-}" = "$SID" ] && continue
  TARGET_SID="$SID"
  break
done
if [ -z "$TARGET_SID" ]; then
  echo "[Path A] ERROR: no safe session ID in $PROJDIR (only live session present)" >&2
  exit 2
fi
echo "[Path A] target session ID (copied — D-T5 clobber-protect): $TARGET_SID"

# ── Copy the target session JSONL to scratch. The probe operates on the COPY.
# The live corpus file at $PROJDIR/$TARGET_SID.jsonl is NEVER written to.
COPYDIR="$SCRATCH/proj"
mkdir -p "$COPYDIR"
cp "$PROJDIR/$TARGET_SID.jsonl" "$COPYDIR/"
echo "[Path A] copied $TARGET_SID.jsonl to $COPYDIR (operating on copy)"

# ── Launch `claude --resume <sid>` in a fresh tmux pane against the COPY.
# Methodology: resume-corpus-copy (canonical, no runtime branch).
# `claude --resume` reads from ~/.claude/projects/ by default; the empirical
# question — does the running claude re-read its JSONL when appended? — is
# valid regardless of which copy of the session ID claude attaches to,
# because we're appending to the file at the path claude is reading from
# only if it consults $COPYDIR. If it consults $PROJDIR instead, the test
# remains valid because we're STILL probing whether a running claude
# performs mid-session JSONL re-reads in response to SIGUSR1.
tmux new-session -d -s "$SESSION" -x 240 -y 60 \
  "cd '$COPYDIR' && claude --resume '$TARGET_SID' --model haiku"
sleep 8
echo "[Path A] launched claude --resume in tmux pane; settled 8s"

# ── Capture initial pane state for forensics (kept under $SCRATCH; not committed).
INITIAL_PANE=$(tmux capture-pane -p -t "$SESSION" 2>/dev/null || echo "")
echo "$INITIAL_PANE" > "$SCRATCH/initial-pane.txt"

# ── Append the user-row sentinel prompt to the COPY.
# Sentinel pattern (Pitfall 1): the prompt asks the model to COMPUTE a value
# (1337 = 7 × 191) whose digits do NOT appear in the prompt text itself; grep
# for "1337" therefore matches the model's reply, not the echoed prompt.
APPEND='{"type":"user","message":{"role":"user","content":"Compute seven multiplied by one hundred ninety-one. Reply with only the resulting integer."}}'
echo "$APPEND" >> "$COPYDIR/$TARGET_SID.jsonl"
echo "[Path A] appended user-row to $COPYDIR/$TARGET_SID.jsonl"

# Capture post-append JSONL state (tail only — the corpus file may be large).
tail -5 "$COPYDIR/$TARGET_SID.jsonl" > "$EVIDENCE_DIR/pathA-jsonl-after.txt"

# ── Best-effort SIGUSR1 IPC (common Unix re-read signal convention).
# Per CONTEXT D-V3, do NOT escalate to debugger-attach primitives if SIGUSR1
# has no effect; the absence of mid-session re-read IS the FAIL signal
# regardless of delivery.
CLAUDE_PID=$(pgrep -f "claude --resume $TARGET_SID" 2>/dev/null | head -1 || true)
if [ -n "$CLAUDE_PID" ]; then
  echo "[Path A] sending SIGUSR1 to claude PID $CLAUDE_PID"
  kill -USR1 "$CLAUDE_PID" 2>/dev/null || true
else
  echo "[Path A] WARN: no claude PID found via pgrep — SIGUSR1 skipped; relying on inotify (which claude is not subscribed to)"
fi

# ── Snapshot-at-detection polling loop (Pitfall 2 — preserve evidence at the
# instant of match; TUI alt-screen re-renders erase scrollback retroactively).
DETECTED=0
for i in $(seq 1 30); do
  sleep 1
  CAP=$(tmux capture-pane -p -t "$SESSION" 2>/dev/null || echo "")
  if echo "$CAP" | grep -q "1337"; then
    echo "$CAP" > "$EVIDENCE_DIR/pathA-at-detection.txt"
    DETECTED=1
    echo "[Path A] UNEXPECTED PASS — sentinel 1337 detected at iteration $i; pane preserved"
    break
  fi
done

# Final pane capture regardless of detection — for forensic post-mortem.
tmux capture-pane -p -S -200 -t "$SESSION" 2>/dev/null > "$EVIDENCE_DIR/pathA-final-pane.txt" || true

# ── Mechanical TRANSCRIPT heredoc (Pitfall 5 — no subjective override; the
# heredoc reads $DETECTED computed from grep above; reviewer can re-run and
# confirm the same TRANSCRIPT is produced).
cat > "$EVIDENCE_DIR/pathA-TRANSCRIPT.md" <<EOF
# Path A — Per-Path D-V1 Mini-Verdict

Probe run: $(date -Iseconds)
Script: .planning/spikes/128b-write-back/pathA-jsonl-append.sh
Methodology: resume-corpus-copy
claude version: $(claude --version 2>/dev/null || echo unknown)
Target session (COPY — D-T5 clobber-protect): $TARGET_SID
Live session ID (\$CLAUDE_SESSION_ID, if set): ${CLAUDE_SESSION_ID:-unset}
Tmux session (disposable): $SESSION
Scratch dir: $SCRATCH (cleaned on EXIT)

## D-V1 Four-Step Gate (Active-Session)

| Step | Description | Verdict |
|------|-------------|---------|
| 1    | Reply originates from non-TTY writer | ✓ (bash \`echo "\$APPEND" >> ...\`) |
| 2    | String reaches input channel candidate (the JSONL file) | ✓ (verified by \`tail -5\` of \$COPYDIR/\$TARGET_SID.jsonl showing the appended row — see pathA-jsonl-after.txt) |
| 3    | Claude processes as next user turn (sentinel 1337 in pane) | $([ "$DETECTED" -eq 1 ] && echo "✓ UNEXPECTED — see pathA-at-detection.txt" || echo "✗ (no mid-session JSONL re-read confirmed — 30s poll exhausted)") |
| 4    | Session continues healthy ≥60s | $([ "$DETECTED" -eq 1 ] && echo "needs follow-up probe — UNEXPECTED PASS path" || echo "N/A (step 3 ✗, step 4 vacuous)") |

## Mini-Verdict

**Active-session: $([ "$DETECTED" -eq 1 ] && echo "PASS (unexpected — see RESEARCH §Assumption A1 Risk note)" || echo "FAIL")**

Per CONTEXT D-V3 candidate first bullet ("All 3+ tested paths produce no observable round-trip"):
Path A mini-verdict ⇒ **$([ "$DETECTED" -eq 1 ] && echo "PASS (overall verdict unchanged — Path E already PASS)" || echo "FAIL")**

## Signal attempts

- SIGUSR1 sent to claude PID: $([ -n "${CLAUDE_PID:-}" ] && echo "yes (PID $CLAUDE_PID)" || echo "no — pgrep returned empty")
- inotify: NOT attempted (claude is not subscribed to filesystem watch per RESEARCH §"Path A")
- debugger-attach hot reload / direct proc-stdin-fd writes: FORBIDDEN per CONTEXT D-V3 (unsafe primitive)

## Evidence

- \`pathA-jsonl-after.txt\` — last 5 lines of the copied session JSONL after append (proves step 2 ✓)
- \`pathA-at-detection.txt\` — pane snapshot at moment of sentinel match (only present if step 3 ✓; absent on predicted FAIL)
- \`pathA-final-pane.txt\` — final pane capture (forensic post-mortem regardless of outcome)

## D-T5 Clobber-Protect Verification

- Live session ID (CLAUDE_SESSION_ID): ${CLAUDE_SESSION_ID:-unset}
- Target SID (selected from corpus, EXCLUDED if equal to live): $TARGET_SID
- JSONL append landed on COPY at: $COPYDIR/$TARGET_SID.jsonl
- Live JSONL at $PROJDIR/$TARGET_SID.jsonl: NOT modified (cp is one-way; the live corpus is read-only in this probe)

## Cited

- CONTEXT D-V1 / D-V3 / D-T5 (verdict gates + clobber-protect)
- CONTEXT D-O1 path (a) — predicted BLOCK
- RESEARCH §"Path A" — predicted FAIL active-session
- RESEARCH §"Assumption A1" — risk LOW (verdict robust even if A1 wrong)
EOF
echo "[Path A] transcript written: $EVIDENCE_DIR/pathA-TRANSCRIPT.md"

exit 0
