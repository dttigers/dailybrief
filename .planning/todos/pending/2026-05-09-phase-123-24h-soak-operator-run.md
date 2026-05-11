---
title: Phase 123 — execute 24h soak run + back-fill 123-VERIFICATION.md
phase: 123
plan: 05
priority: high
source: Phase 123 Plan 05 — checkpoint:human-verify (Task 5.4)
created: 2026-05-09
gates: [AGENT-WATCH-07]
blocking_for: [Phase 123 closeout, Phase 124 launch]
---

## What this is

The autonomous portion of Plan 123-05 is complete: `scripts/soak-check.sh` is committed, 5 SoakCheckTests pin every failure mode against synthetic CSV fixtures, and `123-VERIFICATION.md` skeleton is in place with the soak-gate row pre-allocated. The actual 24h soak gate (D-10) is operator-driven and cannot be automated — it requires a real-wallclock 24h window with normal Claude Code use.

This todo tracks the operator-driven step.

## Why deferred

Per CONTEXT D-10 + Plan 05 frontmatter (`autonomous: false`): the soak run is one-shot per phase, requires the operator's actual Claude Code daily-driver use, and cannot be simulated. `mode: yolo / skip_checkpoints: true` only auto-skips confirmation gates — checkpoints whose payload requires real-world wall-clock time are exempt.

## Operator procedure (verbatim from Plan 123-05 Task 5.4 `<how-to-verify>`)

### 1. Build release binary (in vigil-watch repo)

```bash
cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch"
swift build -c release
```

### 2. Install daemon + sampler

```bash
swift run vigil-watch install
```

Expected: "vigil-watch installed at /Users/jamesonmorrill/.local/bin/vigil-watch ..." + both plist paths + log dir.

### 3. Confirm both plists are loaded and daemon is running

```bash
ls -la ~/Library/LaunchAgents/com.morrillholdings.vigil.watch*.plist
# expect: TWO plist files, both -rw-------  (mode 0600 — T-123-01 mitigation)

launchctl print gui/$(id -u)/com.morrillholdings.vigil.watch | grep "state ="
# expect: state = running

launchctl print gui/$(id -u)/com.morrillholdings.vigil.watch.sampler | grep "state ="
# expect: state = ... (sampler runs every 5min, will toggle between running/idle)

vigil-watch status
# expect: daemon: RUNNING + queue_depth + ...

vigil-watch test
# expect: HTTP 201 (or 200 if dedup) + body
```

### 4. Wait at least 6 minutes for sampler to fire once (StartInterval=300s)

```bash
ls -la ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv
cat ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv
# expect: at least 1 line with format ts,pid,rss,etime_seconds
```

### 4.5. (LOAD-BEARING) Functional probe — confirm daemon actually emits events

> **Why this exists:** the original soak protocol measured only RSS + uptime + sampler-row-count. The vigil-watch-silent-no-events bug (debug session `vigil-watch-silent-no-events`, fixed 2026-05-10) proved a daemon can pass all three liveness checks for 28h+ while emitting zero events — the FSEvent pipeline silently died at bootstrap exit due to a release-mode lifetime collapse + an UnsafeBitCast UB in FSEventBridge. RSS+uptime is a liveness check; this is a functional check.

Pick a recent JSONL file (most recent session in `~/.claude/projects/`), and append a synthetic milestone-pattern line:

```bash
RECENT=$(find ~/.claude/projects -name '*.jsonl' -mmin -180 -type f | head -1)
echo "$RECENT"
# expect: a path to a JSONL file modified in the last 3 hours

LOG_BEFORE=$(wc -l < ~/Library/Logs/Vigil/watch.out 2>/dev/null || echo 0)

# Append a synthetic line that matches the default milestone regex
# (matches "build succeeded" pattern). Use an assistant-shape envelope.
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
cat >> "$RECENT" <<EOF
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"soak probe: build succeeded — functional verification"}],"stop_reason":"end_turn"},"timestamp":"$NOW","sessionId":"soak-probe-$(date +%s)","uuid":"soak-probe-$(uuidgen)","version":"soak"}
EOF

# Wait up to 10 seconds for the event to flow through the pipeline
for i in {1..10}; do
  sleep 1
  LOG_AFTER=$(wc -l < ~/Library/Logs/Vigil/watch.out 2>/dev/null || echo 0)
  if [ "$LOG_AFTER" -gt "$LOG_BEFORE" ]; then
    echo "PASS — daemon emitted $((LOG_AFTER - LOG_BEFORE)) event(s) within ${i}s"
    tail -1 ~/Library/Logs/Vigil/watch.out
    break
  fi
done

# If we got here without breaking, daemon is silent
if [ "$LOG_AFTER" -le "$LOG_BEFORE" ]; then
  echo "FAIL — daemon did not emit any event within 10s of JSONL append"
  echo "→ DO NOT proceed to step 5. Investigate before starting the 24h window."
  echo "→ Likely candidates: FSEventStream dead, daemon lifetime collapse, parser drop"
  echo "→ Reference: .planning/debug/vigil-watch-silent-no-events.md"
fi
```

- **PASS** → daemon is functionally alive; proceed to step 5
- **FAIL** → daemon passed liveness but is functionally dead; **do not start the soak window.** Open a `/gsd-debug` session with these symptoms before continuing.

### 5. (LOAD-BEARING) Live for 24+ hours with normal Claude Code use

- Use Claude Code in VS Code as you normally would.
- Daemon stays running; sampler captures one row every 5 min.
- DO NOT manually `kill` or `launchctl bootout` mid-run (would invalidate the gate).
- Optional: do a `vigil-watch status` ad-hoc to spot-check liveness.
- **Recommended:** re-run the Step 4.5 functional probe at least once during the window (e.g., 12h in) to catch mid-soak regressions where the daemon goes silent partway through.

### 6. After ≥24 hours, run the soak gate

```bash
cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch"
bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv
```

(Note: if the soak spans midnight UTC, the CSV file is whichever date matches the soak start day; pass the explicit path.)

- **Exit 0** + summary table + "PHASE 123 SOAK GATE: PASSED" → liveness side of AGENT-WATCH-07 satisfied; proceed to step 6.5.
- **Non-zero exit** → which gate failed? FAIL message identifies it.
  - "max RSS >= 30000 KB" → memory leak; investigate before phase close
  - "distinct PIDs" → daemon crashed-and-respawned (Phase 122 SIGSEGV flake suspect, Pitfall 7); investigate
  - "span < 85800s" → soak ran less than 23h50m; rerun
  - "no non-empty rows" → sampler never executed; check `launchctl print gui/$UID/com.morrillholdings.vigil.watch.sampler`
  - "Core returned 0 sessions" → daemon was running but never posted to Core (auth issue?); check `~/Library/Logs/Vigil/watch.err`

### 6.5. (LOAD-BEARING) End-of-soak functional probe

Re-run the functional probe from step 4.5. This catches the case where the daemon was functionally alive at soak start but went silent partway through (the `vigil-watch-silent-no-events` bug shape that would have shipped invisibly otherwise).

```bash
# Same probe as step 4.5 — append synthetic milestone line, expect event within 10s
RECENT=$(find ~/.claude/projects -name '*.jsonl' -mmin -180 -type f | head -1)
LOG_BEFORE=$(wc -l < ~/Library/Logs/Vigil/watch.out 2>/dev/null || echo 0)
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
cat >> "$RECENT" <<EOF
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"soak end probe: build succeeded — final verification"}],"stop_reason":"end_turn"},"timestamp":"$NOW","sessionId":"soak-probe-end-$(date +%s)","uuid":"soak-probe-end-$(uuidgen)","version":"soak"}
EOF

for i in {1..10}; do
  sleep 1
  LOG_AFTER=$(wc -l < ~/Library/Logs/Vigil/watch.out 2>/dev/null || echo 0)
  if [ "$LOG_AFTER" -gt "$LOG_BEFORE" ]; then
    echo "PASS — end-of-soak functional probe succeeded in ${i}s"
    break
  fi
done

if [ "$LOG_AFTER" -le "$LOG_BEFORE" ]; then
  echo "FAIL — daemon went silent during soak (passed RSS+uptime, failed functional)"
  echo "→ Phase 123 gate is NOT satisfied even though soak-check.sh exited 0"
  echo "→ Open /gsd-debug session before back-filling 123-VERIFICATION.md"
fi
```

- **PASS both step 6 and step 6.5** → AGENT-WATCH-07 fully satisfied; proceed to step 7.
- **PASS step 6, FAIL step 6.5** → daemon was alive but stopped working; do NOT mark the gate passed. Scope a `/gsd-plan-phase 123 --gaps` plan instead.

### 7. Paste the summary table verbatim into 123-VERIFICATION.md

Location: `.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-VERIFICATION.md` under the "soak-check.sh output" section — replace the placeholder block.

Update the same file's `status:` frontmatter to `passed`, fill in the soak-run start/end UTC timestamps, flip the gate row's `Status` from `pending` to `PASSED`, and tick the sign-off checkboxes.

### 8. Tear down (optional)

- The sampler agent stays installed (passive) so future soak runs are self-serve. Run `vigil-watch uninstall` only if you want the daemon to stop running.
- Operator data preserved under `~/Library/Application Support/vigil-watch/` and `~/Library/Logs/Vigil/`.

## Phase 123 closeout flow

Once this todo completes:

1. Move this file to `.planning/todos/done/`.
2. Update STATE.md: status `executing` → `phase complete` for Phase 123.
3. Update ROADMAP.md Phase 123 row: `4/5 In progress` → `5/5 Complete` + completed date.
4. Run `/gsd-verify-work` against Phase 123 to confirm artifact integrity.
5. Phase 124 (G2 Companion HUD + WebSocket fan-out) is then unblocked.

## Failure path

If the soak gate fails on any of the 5 D-09 conditions, scope a Phase 123-gap plan via `/gsd-plan-phase 123 --gaps` to address the specific failure mode. Do NOT silently re-run; the failure mode is itself signal (memory leak, KeepAlive bug, sampler misconfig, auth drift).
