---
phase: 51
plan: 03
subsystem: DailyBriefMonitor
tags: [menu-bar, update-vigil-button, swiftui, observable-binding, handoff-consumption]
one_liner: "Wired UpdateService into MenuBarView with Update Vigil button mirroring Run Now, status row, failure tail + Open Full Log; instantiated UpdateService at app root with one-shot handoff consumption"
dependency_graph:
  requires:
    - "UpdateService + UpdateStatus (Plan 51-02)"
    - "RepoLocation (Plan 51-01) — transitively via UpdateService"
  provides:
    - "Menu bar entry point: Update Vigil button"
    - "Live update status row at top of MenuBarExtra dropdown"
    - "Failure-mode inline stderr tail + Open Full Log action"
    - "Boot-time handoff consumption surfacing previous-process update outcome"
  affects:
    - "DailyBriefMonitor menu bar UX (new button + status row)"
    - "Post-update respawn UX (handoff JSON consumed once on launch)"
tech_stack:
  added: []
  patterns:
    - "SwiftUI @Bindable injection of @Observable service"
    - "@State + one-shot guard flag for View.onAppear side-effects (Pitfall 4)"
    - "Pattern matching on enum status to drive Label cycling"
    - "MenuBarExtra label-closure icon swap based on multiple service states"
key_files:
  created: []
  modified:
    - "Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift"
    - "Sources/DailyBriefMonitor/MenuBarView.swift"
decisions:
  - "D-04: consumeHandoff() gated by didConsumeHandoff @State flag — fires exactly once per process launch (View.onAppear fires repeatedly when MenuBarExtra opens/closes)"
  - "D-10: Update Vigil button mirrors Run Now structure verbatim (Label + disabled-while-running + icon swap); status row sits at top of dropdown parallel to Last run; verbatim labels: Update Vigil / Updating… / ✓ Up to date / ✓ Updated to {sha} / ✗ Build failed"
  - "D-12: Failure tail rendered with .font(.system(.caption2, design: .monospaced)), .textSelection(.enabled), red foreground over light-red background; Open Full Log button uses NSWorkspace.shared.open(URL(fileURLWithPath: updater.logFilePath))"
metrics:
  duration: "~5m"
  completed: "2026-04-07"
  tasks_completed: 2
  tasks_pending_human_verification: 1
requirements: [DEV-01, DEV-02, DEV-03, DEV-04]
---

# Phase 51 Plan 03: MenuBarView Wiring Summary

## One-liner
Bound `UpdateService` into the SwiftUI menu bar UI: an `Update Vigil` button mirrors `Run Now` pattern verbatim, a new `Update` status row sits at the top of the dropdown, failure mode shows an inline last-20-lines stderr tail plus an `Open Full Log` button, and `consumeHandoff()` is invoked exactly once per process launch from the app root so the post-respawn instance surfaces the previous run's `.updated(sha:)` outcome.

## What Shipped

### Task 1: `DailyBriefMonitorApp.swift` (modified, commit `40b5e30`)
- Added `@State private var updater = UpdateService()` alongside the existing `checker` declaration.
- Added `@State private var didConsumeHandoff = false` flag (Pitfall 4 gate — `View.onAppear` fires repeatedly when the MenuBarExtra dropdown opens/closes).
- Reformatted the `MenuBarView(...)` call site into multi-line argument form and added `updater: updater` as a new labeled parameter (after `checker:`, before `scheduler:`).
- Inside `.onAppear`, after the existing scheduler-init guard, added a one-shot block:
  ```swift
  if !didConsumeHandoff {
      didConsumeHandoff = true
      updater.consumeHandoff()
  }
  ```
- Added a new `else if updater.isRunning` branch to the MenuBarExtra `label:` HStack that swaps in `arrow.triangle.2.circlepath` while an update is in flight (D-10 title-bar feedback).
- Did NOT remove or reorder any existing parameter (`checker`, `scheduler`, `onDashboard`, `onCapture`, `onSettings` all preserved).

### Task 2: `MenuBarView.swift` (modified, commit `6a4af23`)
- Added `@Bindable var updater: UpdateService` immediately after `@Bindable var checker: StatusChecker`.
- New `Update` status row inserted at the top of the dropdown (between `Divider()` and the existing `Last run` row), parallel-structured to the Last run row with leading icon + caption labels (D-10).
- New `Update Vigil` button inserted between `Run Now` (lines 72–81 of pre-edit file) and `View Log`, mirroring Run Now verbatim:
  - `Button { updater.updateNow() } label: { Label(updateButtonLabel, systemImage: updateButtonIcon) }.disabled(updater.isRunning)`
  - Same Label structure, same disabled-while-running pattern, same icon-swap pattern.
- Failure UI (D-12) appears only when `updater.status` matches `.failed(let tail)`:
  - Inline `Text(tail)` with `.font(.system(.caption2, design: .monospaced))`, `.foregroundStyle(.red)`, `.lineLimit(20)`, `.textSelection(.enabled)`, `.padding(4)`, `.background(Color.red.opacity(0.08))`.
  - Followed by an `Open Full Log` button that calls `NSWorkspace.shared.open(URL(fileURLWithPath: updater.logFilePath))`.
- Added 4 private computed/view-builder properties driving the UI:
  - `updateButtonLabel: String` — switches over `updater.status`, returns the 5 verbatim D-10 labels.
  - `updateButtonIcon: String` — `arrow.triangle.2.circlepath` while running, otherwise `arrow.down.circle`.
  - `updateStatusText: String` — switches for the status-row caption (Idle / Updating… / Up to date / Installed: {sha} / Last attempt failed).
  - `updateStatusIcon: some View` (`@ViewBuilder`) — colored SF Symbol per status case.
- All existing buttons (`Dashboard`, `Quick Capture`, `Open Latest PDF`, `Run Now`, `View Log`, `Settings`, `Quit`) and the existing `statusIcon`/`formatNextRunTime` helpers are unchanged.

## Verification

### Automated (PASSED)
- `grep -F "@State private var updater = UpdateService()" Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` → 1 match
- `grep -Fc "didConsumeHandoff" Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` → 3 matches (declaration + check + assignment)
- `grep -F "updater.consumeHandoff()" Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` → 1 match
- `grep -F "updater: updater" Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` → 1 match (passed to MenuBarView)
- `grep -F "checker: checker" Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` → 1 match (existing wiring preserved)
- `grep -F "scheduler: scheduler" Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` → 1 match
- `grep -F "@Bindable var updater: UpdateService" Sources/DailyBriefMonitor/MenuBarView.swift` → 1 match
- `grep -F "Update Vigil" Sources/DailyBriefMonitor/MenuBarView.swift` → 2 matches (button label + comment)
- `grep -F "updater.updateNow()" Sources/DailyBriefMonitor/MenuBarView.swift` → 1 match
- `grep -F ".disabled(updater.isRunning)" Sources/DailyBriefMonitor/MenuBarView.swift` → 1 match
- `grep -F "Updating…" Sources/DailyBriefMonitor/MenuBarView.swift` → 2 matches (button label switch + status row switch)
- `grep -F "✓ Up to date" Sources/DailyBriefMonitor/MenuBarView.swift` → 1 match
- `grep -F "✓ Updated to" Sources/DailyBriefMonitor/MenuBarView.swift` → 1 match
- `grep -F "✗ Build failed" Sources/DailyBriefMonitor/MenuBarView.swift` → 1 match
- `grep -F "arrow.triangle.2.circlepath" Sources/DailyBriefMonitor/MenuBarView.swift` → matches (existing Run Now icon and updater icon-swap helper)
- `grep -F "Open Full Log" Sources/DailyBriefMonitor/MenuBarView.swift` → 2 matches (button label + comment)
- `grep -F "updater.logFilePath" Sources/DailyBriefMonitor/MenuBarView.swift` → 1 match
- `grep -F "case .failed(let tail)" Sources/DailyBriefMonitor/MenuBarView.swift` → 1 match
- `swift build -c release` → exit 0 (`Build complete! (50.74s)`)

### Build Warnings (carried over from Plan 02 — non-blocking)
The two pre-existing benign warnings from Plan 02 (`UpdateService.swift`) remain as documented in `51-02-SUMMARY.md`:
1. `try? handle.seekToEnd()` unused-result warning in `appendToUpdateLog()` — intentional best-effort.
2. `await MainActor.run { exit(0) }` "will never be executed" on the unreachable `return .updated(sha:)` after `exit(0)` — required by compiler flow analysis but unreachable by design.

Plan 03's edits introduced **zero new warnings**.

## Commits
| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1 | `40b5e30` | feat | instantiate UpdateService and consume handoff on launch |
| 2 | `6a4af23` | feat | add Update Vigil button and status row to MenuBarView |

## Deviations from Plan
None — both code-change tasks executed exactly as written. The plan's reference snippets compiled cleanly on first attempt; no NSString-style label fixes or ordering tweaks were needed. The combined-build acceptance gate from Task 2 passed on the first invocation after Task 2's edit.

## Pending: Task 3 — Human Verification (checkpoint:human-verify)

This plan is `autonomous: false`. Task 3 is a `checkpoint:human-verify` step that **must** be walked on real hardware by the user. It cannot be automated:

- Clicking the menu bar item and observing the dropdown is a UI action.
- Verifying `launchctl` PID changes after the detached reload helper fires requires observing a live launchd session.
- The mtime no-op gate, the failure-mode tail, and the `Open Full Log` button must be observed visually in the running app.

### Manual Verification Checklist (for the user)

Pre-condition: This worktree's `swift build -c release` is green. The compile gate is satisfied.

1. **Bootstrap the new binary one final time** from a terminal:
   ```bash
   cd "/Users/jamesonmorrill/Desktop/Local AI/dailybrief"
   ./Scripts/install.sh
   ```
   After this, terminals are no longer needed for updates.

2. **Verify menu item appears (DEV-01)**: Click the DailyBriefMonitor menu bar icon. Confirm:
   - "Update Vigil" button is present, between "Run Now" and "View Log"
   - New "Update" status row appears at the top of the dropdown (parallel to "Last run")

3. **Verify no-op path (DEV-04)**: Click "Update Vigil" with no source changes. Within ~2-3s, expect:
   - Button briefly shows "Updating…" then settles to "✓ Up to date"
   - `~/.local/bin/DailyBriefMonitor` mtime is UNCHANGED (`stat -f %m ~/.local/bin/DailyBriefMonitor` before and after)
   - Click again immediately → same "✓ Up to date" result

4. **Verify update path (DEV-01, DEV-02, DEV-03)**:
   - Make a trivial source change: `touch Sources/DailyBriefMonitor/MenuBarView.swift`
   - Capture pre-click PID: `launchctl print gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor | grep -i pid`
   - Click "Update Vigil"
   - Observe: title-bar icon swaps to spinning `arrow.triangle.2.circlepath`; button label "Updating…"
   - Wait ~10-30s for build + install + reload (menu bar may "blink" — acceptable per CONTEXT.md)
   - Reopen menu — confirm "✓ Updated to {sha}" appears (handoff JSON consumed on launch)
   - Verify new PID differs: `launchctl print gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor | grep -i pid`
   - Verify handoff file deleted: `ls ~/Library/Application\ Support/DailyBrief/last-update.json` should fail
   - Verify update.log appended: `tail -50 ~/Library/Logs/DailyBrief/update.log`

5. **Verify failure path (DEV-03)**:
   - Inject failure: `chmod -x Scripts/install.sh`
   - Click "Update Vigil"
   - Expect: "✗ Build failed", inline last-20-line stderr tail in red, "Open Full Log" button
   - Click "Open Full Log" → confirm `~/Library/Logs/DailyBrief/update.log` opens in default editor
   - Restore: `chmod +x Scripts/install.sh`
   - Click "Update Vigil" again → expect successful update

6. **Verify #filePath bake-in (RESEARCH A5)**:
   ```bash
   strings ~/.local/bin/DailyBriefMonitor | grep -F "$(pwd)"
   ```
   should show the repo path baked into the binary.

7. **Update VALIDATION.md**: Mark each row in the manual checklist as ✅ green or ❌ red and set `status: ready` in the frontmatter.

### Resume Signal
Per the plan: type "approved" if all 7 verification steps pass on real hardware, or describe the failure for revision.

## Threat Surface
No new trust boundaries introduced beyond what Plan 02 already accepted. The failure tail (T-51-03) is rendered inline in the dropdown but remains user-scoped to the active session — no information disclosure surface is added by this plan.

## Self-Check: PASSED

- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` exists and contains the new `updater`, `didConsumeHandoff`, `updater.consumeHandoff()`, and `updater: updater` strings (verified via grep above)
- `Sources/DailyBriefMonitor/MenuBarView.swift` exists and contains all 13 grep-target strings from the Task 2 acceptance criteria (verified via grep above)
- Commit `40b5e30` present in `git log` (verified via `git rev-parse --short HEAD` after Task 1 commit)
- Commit `6a4af23` present in `git log` (verified via `git rev-parse --short HEAD` after Task 2 commit)
- `swift build -c release` exits 0 with both modified files in tree (verified — `Build complete! (50.74s)`)
- Task 3 is correctly left as a pending human checkpoint per the plan's `autonomous: false` directive
