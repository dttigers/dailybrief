---
status: gaps_found
phase: 51-menu-bar-update-action
verifier: human (manual UAT during execute-phase checkpoint)
created: 2026-04-08T03:32:20Z
updated: 2026-04-08T03:32:20Z
must_haves_total: 4
must_haves_passed: 3
gaps_open: 1
requirements: [DEV-01, DEV-02, DEV-03, DEV-04]
---

# Phase 51 Verification Report

## Verdict: gaps_found

Plan-level execution completed (3/3 plans, all atomic commits, build green), but live human testing during the Plan 51-03 `checkpoint:human-verify` task uncovered an architectural bug in the update flow that prevents the phase goal — "menu bar one-click update with surfaced outcome" — from being met. The build/wire half is correct; the runtime control flow is broken.

## Must-Haves Status

| # | Must-have | Source | Status | Notes |
|---|-----------|--------|--------|-------|
| 1 | `RepoLocation` exposes compile-time repo root via `#filePath`, no hardcoded paths anywhere | DEV-01, Plan 51-01 | ✅ pass | `Sources/DailyBriefMonitor/RepoLocation.swift` exists; `StatusChecker` no longer references `~/Desktop/Local AI/dailybrief` |
| 2 | `UpdateService` is `@Observable`, runs build → mtime gate → install → handoff → trampoline → exit lifecycle | DEV-02, Plan 51-02 | ⚠ partial | All steps exist in source, but the install→handoff→trampoline→exit chain is **never reached at runtime** because step 3 (install.sh subprocess) kills the parent process before runProcess returns. See Gap 1. |
| 3 | "Update Vigil" button mirrors "Run Now" verbatim, status row surfaces idle/running/upToDate/updated/failed states, failure mode shows tail + Open Full Log | DEV-03, Plan 51-03 | ✅ pass (UI level) | Code-review of `MenuBarView.swift` confirms all 5 status cases mapped, button structure mirrors Run Now, failure UI present. UI cannot be exercised end-to-end due to Gap 1. |
| 4 | App-level `UpdateService` instantiation + one-shot `consumeHandoff()` on launch | DEV-04, Plan 51-03 | ⚠ partial | Code is correct (`didConsumeHandoff` flag, `consumeHandoff()` call wired in `DailyBriefMonitorApp.swift`). Cannot be exercised because handoff JSON is never written (Gap 1 prevents `writeHandoff()` from being called). |

## Gaps

### Gap 1: install.sh subprocess kills the UpdateService parent process before handoff/trampoline can run

**Severity:** blocking — defeats the entire phase goal. The user clicks "Update Vigil", the binary IS replaced and respawned, but the user sees no `✓ Updated to {sha}` feedback because the structured update path never completes.

**Discovered by:** Manual UAT during Plan 51-03 checkpoint:human-verify, 2026-04-08 03:23 UTC.

**Symptom (user-visible):**
- Click "Update Vigil" with a real source change present
- Spinner appears, ~60s pass, menu bar app silently respawns
- New menu bar instance shows "Idle" / "Up to date" — no `✓ Updated to {sha}`
- Subsequent clicks always return "Up to date"

**Root cause:**

`UpdateService.runUpdateLifecycle()` shells out to `Scripts/install.sh` via `runProcess()`. `install.sh` contains (lines 95-96):

```bash
launchctl bootout "gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$MONITOR_PLIST"
```

The `bootout` line tells launchd to terminate `com.jamesonmorrill.dailybriefmonitor` — which is the process **currently running `UpdateService`**. launchd sends SIGTERM to the menu bar process, killing it (and its child `install.sh` along with it, before `install.sh` reaches the `bootstrap` line).

The function dies between `=== swift build -c release ===` (logged ✓) and `=== Scripts/install.sh ===` (never logged). `writeHandoff()`, `spawnDetachedReloadHelper()`, and `exit(0)` are never called. launchd's `KeepAlive=SuccessfulExit:false` then respawns the menu bar with the freshly-cp'd binary (because `install.sh` did get as far as `cp -f` before `bootout`), but the new instance has no handoff JSON to consume.

**Hard evidence collected during UAT:**
- `launchctl print gui/$UID/com.jamesonmorrill.dailybriefmonitor` reports `runs = 1`, `last exit code = (never exited)` — the menu bar has never called `exit(0)`
- `/tmp/vigil-reload.sh` does not exist — `spawnDetachedReloadHelper()` has never run
- `~/Library/Application Support/DailyBrief/` directory does not exist — `writeHandoff()` has never run
- `~/.local/bin/DailyBriefMonitor` mtime is ~13s newer than `.build/release/DailyBriefMonitor` — `install.sh`'s `cp -f` did partially execute
- `update.log` contains zero `=== Scripts/install.sh ===` headers across all click attempts

**Architectural mistake:**

The phase's design intent (D-02/D-03) was that the menu bar process should **never touch its own launchd job directly**. The detached `/tmp/vigil-reload.sh` trampoline exists precisely so the launchctl bootout/bootstrap happens after the menu bar has called `exit(0)` and is gone. Plan 51-02 then turned around and shelled out to `install.sh`, which violates that invariant on lines 95-96. The plan description "wraps `Scripts/install.sh` exactly the way StatusChecker wraps the CLI binary" was misleading — `StatusChecker` wraps a binary that exits cleanly, not a script that bootouts its own caller.

This was missed during research, planning, and code review. None of the plan files document the fact that `install.sh`'s tail does launchctl operations on the very label that hosts `UpdateService`.

**Required fix (sketch — actual plan should validate and refine):**

`UpdateService.runUpdateLifecycle()` must stop calling `install.sh` and instead inline the parts that are safe to run from inside the managed process:

1. `swift build -c release` (already correct)
2. mtime gate check (already correct)
3. `cp -f .build/release/DailyBrief ~/.local/bin/DailyBrief`
4. `cp -f .build/release/DailyBriefMonitor ~/.local/bin/DailyBriefMonitor`
5. capture git SHA (already correct)
6. `writeHandoff(...)` (already correct)
7. `spawnDetachedReloadHelper()` (already correct — the trampoline is the ONLY thing that should touch launchctl)
8. `exit(0)` (already correct)

The trampoline (`/tmp/vigil-reload.sh`) already calls `launchctl kickstart -k`, which is the safe respawn primitive. `install.sh` should remain as the bootstrap/first-install path used from terminal; it should not be invoked from inside the managed process.

**Open questions for the gap-closure plan to resolve:**
- Should `install.sh` get a `--no-launchctl` flag so the function can still reuse it (DRY), or should the cp logic be inlined in Swift (simpler)?
- Does the plist need updating during a normal update, or only during first install? (If never during update, the inline-cp approach is strictly simpler.)
- Should the gap-closure plan also add a regression test that asserts `runs = 1, last exit code = 0` after one successful update click?
- Should `Scripts/install.sh` add a `# WARNING: do not invoke from inside the managed process` comment to prevent reintroduction?

**Files to read during gap-closure planning:**
- `Sources/DailyBriefMonitor/UpdateService.swift` (lines 60-106 — the lifecycle)
- `Scripts/install.sh` (lines 91-96 — the launchctl bootout/bootstrap that's the foot-gun)
- `.planning/phases/51-menu-bar-update-action/51-RESEARCH.md` (what the design expected)
- `.planning/phases/51-menu-bar-update-action/51-02-PLAN.md` (the plan that introduced the bug)

## Human Verification Items

The following items from Plan 51-03's human-verify checkpoint were attempted; only the bootstrap step passed.

| # | Item | Result |
|---|------|--------|
| 1 | `./Scripts/install.sh` clean bootstrap | ⚠ Initial run hit `Bootstrap failed: 5` (transient launchctl race); manual retry succeeded. Backlog item: add retry loop to `install.sh:96`. |
| 2 | Click Update Vigil with no source changes → "✓ Up to date" | ✅ pass |
| 3 | Touch source, click Update Vigil → "✓ Updated to {sha}" | ❌ fail (Gap 1) |
| 4 | `launchctl list \| grep dailybrief` PID changes across update | ⚠ PID does change, but not via the trampoline path — via install.sh's bootout side-effect |
| 5 | Force build failure → "✗ Build failed" + inline tail + Open Full Log | ⏸ not attempted (blocked by Gap 1) |
| 6 | Mark `51-VALIDATION.md` rows green | ⏸ not attempted |

## Recommendation

Run `/gsd-plan-phase 51 --gaps` to spec the fix described in Gap 1. The fix is contained to `UpdateService.swift` (~30 lines changed) and should be re-verifiable by repeating the human UAT checklist above.
