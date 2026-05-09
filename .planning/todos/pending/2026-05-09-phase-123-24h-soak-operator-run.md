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

### 5. (LOAD-BEARING) Live for 24+ hours with normal Claude Code use

- Use Claude Code in VS Code as you normally would.
- Daemon stays running; sampler captures one row every 5 min.
- DO NOT manually `kill` or `launchctl bootout` mid-run (would invalidate the gate).
- Optional: do a `vigil-watch status` ad-hoc to spot-check liveness.

### 6. After ≥24 hours, run the soak gate

```bash
cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch"
bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv
```

(Note: if the soak spans midnight UTC, the CSV file is whichever date matches the soak start day; pass the explicit path.)

- **Exit 0** + summary table + "PHASE 123 SOAK GATE: PASSED" → AGENT-WATCH-07 satisfied.
- **Non-zero exit** → which gate failed? FAIL message identifies it.
  - "max RSS >= 30000 KB" → memory leak; investigate before phase close
  - "distinct PIDs" → daemon crashed-and-respawned (Phase 122 SIGSEGV flake suspect, Pitfall 7); investigate
  - "span < 85800s" → soak ran less than 23h50m; rerun
  - "no non-empty rows" → sampler never executed; check `launchctl print gui/$UID/com.morrillholdings.vigil.watch.sampler`
  - "Core returned 0 sessions" → daemon was running but never posted to Core (auth issue?); check `~/Library/Logs/Vigil/watch.err`

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
