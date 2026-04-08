# Phase 51: Menu Bar Update Action - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a "Update Vigil" menu item to DailyBriefMonitor that rebuilds both Swift binaries (DailyBrief CLI + DailyBriefMonitor), reinstalls them to `~/.local/bin/`, reloads the DailyBriefMonitor LaunchAgent, and reports status inline — replacing the terminal-based `Scripts/install.sh` dev loop.

**In scope:** One menu item, two binaries, one LaunchAgent reload, inline feedback, idempotent no-op detection.

**Out of scope (future phases):** Auto-update checks, version pinning, rollback, update notifications when not clicked, remote update fetching, .app bundle packaging.

</domain>

<decisions>
## Implementation Decisions

### Build Invocation Strategy
- **D-01:** Shell out to `Scripts/install.sh` as the single source of truth. Do NOT reimplement build/install logic in Swift. The existing script is already idempotent and battle-tested — wrapping it avoids duplicated logic and drift between CLI install and menu install paths. (Claude's Discretion — user did not flag this for discussion; recommended default applies.)

### Self-Reload Strategy
- **D-02:** Use detached shell helper + LaunchAgent KeepAlive respawn (option A1).
- **D-03:** After `Scripts/install.sh` completes successfully, the monitor:
  1. Writes a status-handoff file (e.g. `~/Library/Application Support/DailyBrief/last-update.json`) containing `{sha, timestamp, outcome}` so the new instance can display "✅ Updated to {sha}" on launch
  2. Writes a tiny `/tmp/vigil-reload.sh` helper: `sleep 1 && launchctl kickstart -k gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor`
  3. Spawns the helper detached (`Process()` with `stdin/stdout` disconnected, no `waitUntilExit`)
  4. Calls `exit(0)` on the monitor
  5. launchd KeepAlive respawns the new binary within ~1s — visible menu bar "blink" is acceptable
- **D-04:** On launch, the new monitor instance reads the handoff file and surfaces the outcome in the menu dropdown. File is deleted after display.

### Idempotency / "Nothing Changed" Detection
- **D-05:** Trust SwiftPM as the source of truth for source-level change detection. The update flow always invokes `swift build -c release` — SwiftPM's own incremental build handles the expensive check natively (fast no-op when nothing changed, ~1-2s).
- **D-06:** After build completes, compare `mtime` of `.build/release/DailyBriefMonitor` (and `.build/release/DailyBrief`) against `~/.local/bin/DailyBriefMonitor` (and `~/.local/bin/DailyBrief`). If both installed binaries are newer-or-equal → skip `cp` + LaunchAgent reload, report "✓ Up to date — no changes". If either is newer in `.build/` → proceed with install + reload.
- **D-07:** Git SHA (`git rev-parse --short HEAD`) is recorded and displayed as a human-readable label in the menu ("Installed: abc1234 • 2s ago") but is NOT used for the no-op decision. This keeps dirty-working-tree edits always eligible for rebuild without extra logic.

### Repo Path Discovery
- **D-08:** Derive repo root at compile time via Swift's `#filePath` literal. Create a new file (e.g. `Sources/DailyBriefMonitor/RepoLocation.swift`) exposing a constant that walks up three directory levels from `#filePath` to reach the repo root. This bakes the correct path into the binary at build time — if the repo is ever moved, the next `./Scripts/install.sh` rebuilds with the new path automatically. Zero config, zero drift surface.
- **D-09:** Delete the existing hardcoded fallback at [StatusChecker.swift:19](Sources/DailyBriefMonitor/StatusChecker.swift#L19) (`~/Desktop/Local AI/dailybrief/.build/release/DailyBrief`) and replace its candidates array logic to derive dev-build paths from `RepoLocation.path`. Single source of truth for "where is the repo".

### Status Feedback UX
- **D-10:** Match the existing "Run Now" / StatusChecker pattern in [MenuBarView.swift](Sources/DailyBriefMonitor/MenuBarView.swift): (Claude's Discretion — user deferred to recommended default.)
  - Menu bar title icon: swap to rotating `arrow.triangle.2.circlepath` while updating, then back to default on success or error dot on failure
  - Dropdown menu: disable "Update Vigil" button while running (mirrors "Run Now" behavior at [MenuBarView.swift:72-81](Sources/DailyBriefMonitor/MenuBarView.swift#L72-L81)); button label cycles through "Updating…" → "✓ Up to date" / "✓ Updated to abc1234" / "✗ Build failed"
  - Status row at top of dropdown (parallel to existing "Last run" row) shows last update outcome until next action

### Error Surfacing
- **D-11:** Write full stdout+stderr of `install.sh` to `~/Library/Logs/DailyBrief/update.log` (append, rotate on size later if needed). (Claude's Discretion — user deferred to recommended default.)
- **D-12:** On failure, show the last 20 lines of stderr inline in the menu dropdown (truncated tail) with an "Open Full Log" button that opens the log file in the default text editor via `NSWorkspace.shared.open`.

### Claude's Discretion
- How to structure the new Swift types (e.g. `UpdateService`, `RepoLocation`, `UpdateStatus`) — planner/executor decide.
- Process invocation details (Foundation `Process` vs async wrapper) — use existing [StatusChecker.swift:89-118](Sources/DailyBriefMonitor/StatusChecker.swift#L89-L118) pattern as the template.
- Exact icon glyphs and colors beyond those listed in D-10.
- Whether the handoff file uses JSON, a plist, or UserDefaults — whichever fits best.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Build & Install
- `Scripts/install.sh` — The script the menu action wraps. Already idempotent; handles `swift build -c release`, binary copy to `~/.local/bin/`, LaunchAgent plist generation, and `launchctl bootout` + `bootstrap`. Read it end-to-end before planning.

### Existing Monitor Patterns (to mirror)
- `Sources/DailyBriefMonitor/StatusChecker.swift` §89-118 — `@Observable` pattern for running external processes with `isRunning` flag, `Task.detached`, exit code capture, MainActor state updates. The update service should mirror this shape.
- `Sources/DailyBriefMonitor/StatusChecker.swift` §15-25 — Current hardcoded repo-path fallback that D-09 replaces.
- `Sources/DailyBriefMonitor/MenuBarView.swift` §72-81 — "Run Now" button pattern (disabled-while-running, icon swap, label change) that D-10 mirrors for "Update Vigil".

### Project-Level
- `.planning/PROJECT.md` — Confirms `.app` packaging is deferred; shell-script install is sufficient while user is the sole dev+user. This phase keeps that constraint.
- `.planning/REQUIREMENTS.md` §DEV-01/02/03/04 — The four acceptance criteria this phase satisfies.
- `.planning/ROADMAP.md` §Phase 51 — The 5 success criteria (menu item exists, triggers build+install without terminal, inline status feedback, LaunchAgent reload, idempotent no-op).

### LaunchAgent Context
- `~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist` — The plist `Scripts/install.sh` generates. `KeepAlive` with `SuccessfulExit: false` is what makes D-02's self-reload strategy work — exiting cleanly triggers respawn.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **StatusChecker process-running pattern** — [Sources/DailyBriefMonitor/StatusChecker.swift:89-118](Sources/DailyBriefMonitor/StatusChecker.swift#L89-L118): `@Observable` class, `Task.detached`, `Process()` with `Pipe`, `waitUntilExit()`, MainActor state sync. The new `UpdateService` should follow this shape exactly for consistency.
- **`Scripts/install.sh`** — Already does the entire build+install+reload dance. The update service's job is to wrap it and stream its output, not replace it.
- **MenuBarView "Run Now" button** — [Sources/DailyBriefMonitor/MenuBarView.swift:72-81](Sources/DailyBriefMonitor/MenuBarView.swift#L72-L81): exact template for the "Update Vigil" button (disabled-while-running, spinning icon, label change).

### Established Patterns
- `@Observable` service + SwiftUI `@Bindable` view injection — used by StatusChecker/BriefScheduler, should be used for the new update service.
- `NSString.expandingTildeInPath` for file paths — established convention, avoid `URL(fileURLWithPath:)` for path strings that will be passed to shell.
- `NSWorkspace.shared.open(URL(fileURLWithPath:))` for opening files in default handler — used by "Open Latest PDF" and "View Log".
- Detached task + MainActor hop pattern for background work that updates `@Observable` state.

### Integration Points
- `MenuBarView.body` — Add the new button between "Run Now" and "View Log" or near "Settings"; wire to new service.
- `DailyBriefMonitorApp` or `AppDelegate` — Instantiate the new `UpdateService` at the same level as `StatusChecker` and pass to `MenuBarView`.
- New file `Sources/DailyBriefMonitor/RepoLocation.swift` — `#filePath`-derived repo-root constant (D-08), consumed by both the new update service and the refactored `StatusChecker.init` (D-09).
- New file `Sources/DailyBriefMonitor/UpdateService.swift` — The `@Observable` service wrapping `install.sh` invocation, stdout/stderr capture, mtime comparison, handoff file write, and reload trigger.
- Handoff file path: `~/Library/Application Support/DailyBrief/last-update.json` (create directory if missing).
- Update log path: `~/Library/Logs/DailyBrief/update.log` (directory already exists from existing monitor logging).

</code_context>

<specifics>
## Specific Ideas

- The menu bar "blink" during self-reload is acceptable and explicit — user confirmed they don't mind it. Don't over-engineer to avoid it.
- Git SHA display format: `"Installed: abc1234 • 2s ago"` — short SHA + relative time, matches dev muscle memory.
- Single-user reality: user is sole dev+user. Do not add a Settings field for repo path (would be config theater and adds to the secret-drift surface the user has explicitly flagged as a recurring problem).
- Dirty working tree (`git status --porcelain` non-empty) is the user's *normal* state — rebuild decisions must never penalize it. That's why SwiftPM+mtime (D-05/D-06), not git SHA, is the decision mechanism.

</specifics>

<deferred>
## Deferred Ideas

- Auto-update checks (polling or scheduled) — future phase if the menu action proves useful.
- Rollback to previous binary on failed reload — not needed while single-user and reinstall is fast.
- Version pinning / release channels — premature for a single-developer tool.
- Update notifications when new commits land on `main` — future quality-of-life, out of scope.
- Rotating `update.log` by size — add when the file actually grows large; premature now.
- `.app` bundle packaging so the monitor can self-update as a true app — explicitly deferred project-wide.
- Log rotation / retention for `update.log` — not worth solving until it's a real problem.

</deferred>

---

*Phase: 51-menu-bar-update-action*
*Context gathered: 2026-04-07*
