# Phase 51: Menu Bar Update Action - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 51-menu-bar-update-action
**Areas discussed:** Self-Reload Strategy, Idempotency Detection, Repo Path Discovery

---

## Area Selection

Six gray areas were surfaced in analysis:
1. Build invocation strategy
2. Self-reload strategy
3. Status feedback UX
4. Idempotency / change detection
5. Error surfacing
6. Repo path discovery

User confirmed focusing on **#2, #4, #6**. Areas #1, #3, #5 used recommended defaults (shell out to `install.sh`; status row + icon swap mirroring "Run Now"; last 20 stderr lines + `update.log` file).

---

## Self-Reload Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| A. Detached helper + KeepAlive respawn | Write status, spawn detached `sh -c "sleep 1 && launchctl kickstart -k"`, exit. LaunchAgent respawns new binary. ~1s menu bar blink. | ✓ |
| B. `posix_spawn` re-exec | Spawn new binary directly, exit. Fastest but races with launchd. | |
| C. "Restart required" two-click flow | User clicks once to install, again to restart. Zero magic but violates "immediately active". | |
| D. `launchctl kickstart -k` from within monitor | One system call, launchd SIGTERMs self. Same race as A. | |

**User's choice:** A — "i dont mind a blink, a is good"

### Sub-decision: A1 vs A2

| Option | Description | Selected |
|--------|-------------|----------|
| A1. Shell helper file at `/tmp/vigil-reload.sh` | Tiny script spawned detached, explicit `exit(0)` from monitor. Deterministic timing. | ✓ |
| A2. `launchctl kickstart -k` + wait for SIGTERM | No temp file; relies on launchd killing monitor "soon". | |

**User's choice:** A1 — "a1"
**Notes:** Explicit `exit(0)` gives deterministic control of when status writes are flushed to the handoff file before the old process dies.

---

## Idempotency / "Nothing Changed" Detection

| Option | Description | Selected |
|--------|-------------|----------|
| A. Git SHA only | Compare `git rev-parse HEAD` against stored last-installed SHA. Ignores uncommitted edits — bad for dev workflow. | |
| B. Git SHA + dirty flag | SHA + `git status --porcelain` hash. Dirty state always rebuilds. | |
| C. SwiftPM + binary mtime | Always run `swift build -c release` (SwiftPM no-ops when unchanged). Compare `.build/release/*` mtime to `~/.local/bin/*`. Skip cp+reload if installed is newer. | ✓ |

**User's choice:** C — "c"
**Notes:** Trusts SwiftPM's own change detection, handles dirty edits naturally without extra state tracking. Git SHA still recorded for display only ("Installed: abc1234 • 2s ago"), not for the decision.

---

## Repo Path Discovery

| Option | Description | Selected |
|--------|-------------|----------|
| A. Hardcoded constant | `let repoPath = "~/Desktop/Local AI/dailybrief"`. Zero drift, breaks silently if repo moves. | |
| B. `#filePath` compile-time derivation | Walk up 3 levels from `#filePath`. Self-correcting on next build. No config, no drift. | ✓ |
| C. Settings field | User-editable path with hardcoded default. Adds to the drift surface flagged in `project_secret_drift.md`. | |

**User's choice:** B — "i like b"
**Notes:** Only option that cannot drift — the path is whatever directory contained the source file when `swift build` ran, which is by definition the repo being rebuilt. Also unifies the existing hardcoded fallback in `StatusChecker.swift:19`.

---

## Claude's Discretion

Areas where user deferred to recommended defaults (no interactive discussion):
- **Build invocation strategy** — Shell out to `Scripts/install.sh`, do not reimplement in Swift.
- **Status feedback UX** — Match existing "Run Now" pattern: disabled-while-running button, spinning icon, status row at top of dropdown mirroring "Last run".
- **Error surfacing** — Full stdout/stderr to `~/Library/Logs/DailyBrief/update.log`; last 20 lines inline on failure; "Open Full Log" button via `NSWorkspace`.

## Deferred Ideas

- Auto-update checks / polling for new commits
- Rollback to previous binary on failed reload
- Version pinning / release channels
- Update notifications outside of click-initiated flow
- `update.log` rotation / retention
- `.app` bundle self-update (explicitly deferred project-wide)
