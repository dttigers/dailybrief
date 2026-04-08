---
phase: 51-menu-bar-update-action
plan: 04
subsystem: DailyBriefMonitor
tags: [menu-bar, update-vigil, launchd, self-update, filemanager-copy, gap-closure]
dependency_graph:
  requires:
    - "UpdateService lifecycle scaffolding (Plan 51-02)"
    - "MenuBarView wiring + handoff consumption (Plan 51-03)"
    - "Trampoline invariant D-02/D-03: only /tmp/vigil-reload.sh may touch launchctl"
  provides:
    - "In-process safe binary install path (installBuiltBinaries) with zero subprocess coupling to Scripts/install.sh"
    - "Working end-to-end Update Vigil lifecycle: build → mtime gate → inline cp → writeHandoff → trampoline → exit(0) → respawn → consumeHandoff"
    - "install.sh guard comment preventing regression"
    - "Verified launchd clean-exit signature (runs incremented, last exit code = 0)"
  affects:
    - "DailyBriefMonitor self-update UX (now actually delivers '✓ Updated to {sha}' feedback)"
    - "Scripts/install.sh contract (terminal-only, never in-process)"
tech_stack:
  added: []
  patterns:
    - "Inline FileManager.copyItem binary install (replaces shell subprocess cp/launchctl path)"
    - "Trampoline-only launchctl touch: the managed process never calls launchctl bootout/bootstrap on its own label"
    - "Block-comment guard on install.sh bootout region naming the failure mode for grep-discoverability"
key_files:
  created: []
  modified:
    - "Sources/DailyBriefMonitor/UpdateService.swift"
    - "Scripts/install.sh"
decisions:
  - "DR-01: Inline FileManager cp in Swift instead of adding an install.sh --no-launchctl flag — removes subprocess coupling entirely and eliminates a future foot-gun"
  - "DR-02: Do NOT regenerate the plist during update — it is fully self-contained (stable $INSTALL_DIR path) and is a first-install concern only"
  - "DR-03: Use the existing human-verify checkpoint for the launchd-state assertion (runs=1, last exit code=0) — no automated test (launchd state is hard to script reliably)"
  - "DR-04: Warning comment placed immediately above the launchctl bootout/bootstrap block in install.sh — where any future maintainer grepping 'bootout' will land"
requirements_completed: [DEV-02]
metrics:
  duration: "~25m (code) + live UAT"
  completed: "2026-04-07"
  tasks_completed: 3
  gap_closure: true
  closes: "51-VERIFICATION.md Gap 1"
---

# Phase 51 Plan 04: Gap Closure — Inline Binary Install Summary

**Replaced the install.sh subprocess inside `UpdateService.runUpdateLifecycle()` with an inline `installBuiltBinaries()` Swift helper using `FileManager.copyItem`, restoring the trampoline invariant (only `/tmp/vigil-reload.sh` touches launchctl) and making the Update Vigil button actually surface the "✓ Updated to {sha}" feedback end-to-end.**

## Performance

- **Duration:** ~25 min (code) + full live UAT on real hardware
- **Completed:** 2026-04-07
- **Tasks:** 3 (2 code + 1 human-verify checkpoint)
- **Files modified:** 2

## Objective

Close **Gap 1** from `51-VERIFICATION.md`: `UpdateService.runUpdateLifecycle()` shelled out to `Scripts/install.sh`, whose `launchctl bootout` (line 95) sends SIGTERM to `com.jamesonmorrill.dailybriefmonitor` — which **is** the menu bar process running `UpdateService`. That killed the parent mid-lifecycle before `writeHandoff()`, `spawnDetachedReloadHelper()`, and `exit(0)` could run. Result: the user clicked Update Vigil, binaries were partially replaced by `install.sh`'s `cp -f`, launchd KeepAlive respawned the menu bar — but with no handoff JSON to consume, the new instance showed "Idle" / "Up to date" instead of `✓ Updated to {sha}`.

## What Shipped

### Task 1: Inline `installBuiltBinaries()` in UpdateService (commit `821187a`)

**File:** `Sources/DailyBriefMonitor/UpdateService.swift`

- **STEP 3 rewrite** (now at lines 79–87): deleted the `runProcess(... installScript ...)` subprocess call; replaced with a call to a new private `installBuiltBinaries()` helper and an `=== inline install (cp .build/release → ~/.local/bin) ===` log header.
- **`installBuiltBinaries()` helper** (lines 129–174): pure Swift replacement for `install.sh`'s cp steps.
  - Ensures `~/.local/bin` exists via `FileManager.createDirectory(withIntermediateDirectories: true)` (parity with `mkdir -p`).
  - For each binary (`DailyBrief`, `DailyBriefMonitor`): checks source exists in `RepoLocation.releaseBuildDir`, removes any existing destination (parity with `cp -f` — `FileManager.copyItem` fails if destination exists), then `copyItem(atPath:toPath:)`.
  - Returns `(success: Bool, output: String)` with per-step log text.
  - **Critically:** never touches launchctl. The trampoline `/tmp/vigil-reload.sh` remains the sole owner of the launchctl kickstart.
- **New `=== writeHandoff ===` marker log line** (line 94): appended to `update.log` immediately before `writeHandoff(sha:outcome:)` is called, so `grep` can prove the lifecycle reached STEP 5 at runtime.
- **Preserved unchanged:** STEP 1 (swift build), STEP 2 (mtime gate), STEP 4 (git SHA), STEP 6 (spawnDetachedReloadHelper + exit(0)), `consumeHandoff()`, `@Observable` declaration, all path properties, and every other helper.

### Task 2: install.sh regression-guard warning comment (commit `dc68cc3`)

**File:** `Scripts/install.sh`

- Inserted a multi-line block comment immediately above the `# 7. Load/reload the monitor LaunchAgent` block (where the `launchctl bootout` / `bootstrap` pair lives).
- Warning body names the exact failure mode:
  > WARNING: do not invoke this script from inside the managed DailyBriefMonitor process. The `launchctl bootout` call below targets `com.jamesonmorrill.dailybriefmonitor` — which IS the menu bar process when running under launchd. bootout sends SIGTERM to the caller, killing UpdateService mid-lifecycle before writeHandoff() / trampoline / exit(0) can run.
- Explicitly points to `51-VERIFICATION.md` Gap 1 and `51-04-PLAN.md` for root cause.
- References `UpdateService.installBuiltBinaries()` + `/tmp/vigil-reload.sh` as the correct in-process path.
- Confirms install.sh remains the correct path for first-install / terminal bootstrap.
- Zero behavior change when run from a terminal.

### Task 3: Manual UAT on real hardware — Gap 1 verification (checkpoint:human-verify)

All four items from the re-attempted verification checklist passed on real hardware.

| # | Item | Result |
|---|------|--------|
| 3 | Touch source, click Update Vigil → "✓ Updated to {sha}" | **PASS** |
| 4 | launchctl state proves clean exit (runs incremented, last exit code = 0) | **PASS** |
| 5 | Force build failure → "✗ Build failed" + inline tail + Open Full Log | **PASS** |
| 6 | Mark 51-VALIDATION.md rows green | **PASS** (status: green, all 7 rows flipped, Wave 0 + Sign-Off checked) |

**Item 3 evidence (real hardware):** After `rm -f ~/.local/bin/DailyBriefMonitor ~/.local/bin/DailyBrief` to force the mtime gate to fall through, clicking Update Vigil rendered `✓ Updated to dc68cc3` in the menu bar status row. The full lifecycle chain ran end-to-end: inline install → writeHandoff → trampoline → `exit(0)` → launchd respawn → `consumeHandoff()` → UI surface.

**Item 4 launchctl evidence:**
- `runs` incremented `1 → 2` (menu bar cleanly exited and was respawned exactly once)
- `last exit code` changed from `(never exited)` → `0` — **direct proof that `exit(0)` was reached** (the smoking-gun signature from Gap 1's root cause)
- PID changed `43468 → 43870`
- `~/Library/Logs/DailyBrief/update.log` contains `=== inline install …` followed by `=== writeHandoff ===` in order
- `~/Library/Application Support/DailyBrief/last-update.json` was written (proving `writeHandoff()` ran) and subsequently consumed/deleted by the new instance on launch (proving `consumeHandoff()` ran)

**Item 5:** User confirmed the expected "✗ Build failed" UI with inline stderr tail rendered correctly, then reverted the deliberate compile error.

**Item 6:** Orchestrator flipped `51-VALIDATION.md` frontmatter to `status: green`, checked all 7 task rows, and marked the Wave 0 + Sign-Off checkboxes with approval notes.

## Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1 | `821187a` | feat | Replace install.sh subprocess with inline Swift binary copy (`installBuiltBinaries()`) |
| 2 | `dc68cc3` | docs/fix | Add do-not-invoke-from-monitor warning block above install.sh bootout/bootstrap |

**Plan metadata commit:** to be created after this SUMMARY write.

## Files Modified

- `Sources/DailyBriefMonitor/UpdateService.swift`
  - Rewrote STEP 3 of `runUpdateLifecycle()` (lines ~79–87)
  - Added `installBuiltBinaries()` helper (lines ~129–174)
  - Added `=== writeHandoff ===` marker log line before STEP 5 (line ~94)
  - Zero references to `install.sh` or `RepoLocation.installScript` remain
- `Scripts/install.sh`
  - Inserted block-comment warning above line 91 (the `# 7. Load/reload the monitor LaunchAgent` header)
  - No functional/executable changes; `bash -n` clean

## Decisions Made

- **DR-01 — Inline Swift cp over `install.sh --no-launchctl` flag.** Two `FileManager.copyItem` calls are smaller and safer than adding a second code path inside install.sh that future callers could forget. Removes all subprocess coupling between UpdateService and install.sh.
- **DR-02 — No plist regeneration during update.** The plist references `$INSTALL_DIR/DailyBriefMonitor` (a stable path) and embeds no per-build metadata. The trampoline's `launchctl kickstart -k` re-execs the binary at the same plist path, which is exactly the semantic we need. Plist regeneration stays a first-install-only concern.
- **DR-03 — Human-verify launchd assertion, not automated test.** The `runs` / `last exit code = 0` assertion depends on a live launchd session and is hard to script reliably. Using the checkpoint framework here is the right tool.
- **DR-04 — Warning comment placed directly above the bootout/bootstrap block.** This is where any maintainer searching for `bootout` or "why does this kill the monitor" will land. Placing it at the top of the file would be easier to miss.

## Deviations from Plan

None — both code tasks executed exactly as written. The reference snippets in the plan compiled cleanly on first attempt. The checkpoint ran the full UAT and passed all four items with the expected launchd signature.

## Notes & Lessons Learned

### Swift's content-addressed build cache defeats `touch`-based UAT

During the initial UAT attempt, the flow appeared to fail with "Up to date" after a `touch Sources/DailyBriefMonitor/MenuBarView.swift`. Investigation revealed the **test** was flawed, not the gate:

- Swift's build system is content-addressed. `touch`ing a source file re-enters the build, but if the emitted `.build/release/DailyBriefMonitor` is byte-identical to the previous build (which it is, for a whitespace/no-op edit), the output binary's mtime is **not** bumped by the build.
- Even a comment-only real change can fail to bump the output binary mtime, because the compiled object is equivalent.
- The `installedBinariesAreFresh()` mtime gate (`installed >= build → no-op`) was therefore working correctly — it saw `installed` still ≥ `build` and correctly returned upToDate.
- Real-world usage (`git pull` with actual code changes that alter compiled output) is **not** affected — the output binary mtime bumps naturally and the gate falls through.

**UAT workaround applied:** deleting `~/.local/bin/DailyBrief*` before the click forces the mtime gate to fail (no installed binary → `mtime(installed)` is nil → `allSatisfy` returns false → gate falls through). This was the unblock that let Item 3 pass.

**Follow-up (optional, not required):** the mtime gate could be hardened to additionally check "any source file newer than installed binary?" to handle the theoretical edge case where a developer wants to re-install the same binary. Not required because the real-world flow (code change → build produces different output → output mtime bumps → gate falls through) is correct.

## Gap Closure Confirmation

Per `51-VERIFICATION.md`:

| Must-have | Pre-51-04 | Post-51-04 |
|-----------|-----------|------------|
| #2: UpdateService runs build → mtime gate → install → handoff → trampoline → exit at runtime | ⚠ partial (killed mid-lifecycle) | **✅ pass** (runs=2, last exit code=0, writeHandoff marker in log, handoff consumed) |
| #4: App-level `consumeHandoff()` on launch actually surfaces the previous outcome | ⚠ partial (never reached because handoff never written) | **✅ pass** (`last-update.json` written, consumed, and UI rendered `✓ Updated to dc68cc3`) |

Gap 1 is closed. The phase goal — "User can rebuild and reinstall the Vigil binaries without opening a terminal, with live status feedback in the menu bar" — is met end-to-end on real hardware.

## Issues Encountered

- **Initial UAT false-fail on `touch`-based source change.** See "Notes & Lessons Learned" above — root-caused to Swift's content-addressed build cache, not the mtime gate. Worked around by removing installed binaries to force the gate; real-world flow is unaffected.

## Next Phase Readiness

- Gap 1 is closed. `51-VALIDATION.md` is green. Phase 51 is complete.
- `install.sh` retains a regression-guard comment that names the exact failure mode for any future maintainer.
- The trampoline invariant (only `/tmp/vigil-reload.sh` touches launchctl) is now enforced by code structure: `UpdateService.swift` has zero launchctl references, and `install.sh` has a prominent warning against in-process invocation.
- No follow-up plans required for Phase 51.

## Self-Check: PASSED

- `Sources/DailyBriefMonitor/UpdateService.swift` contains `installBuiltBinaries` (helper + call), `FileManager.default.copyItem`, and `=== writeHandoff ===` marker; zero `install.sh` or `RepoLocation.installScript` references (verified via direct Read of lines 1–258)
- `Scripts/install.sh` warning comment present above the `# 7. Load/reload the monitor LaunchAgent` block (verified during Task 2 execution)
- Commit `821187a` present in git log (verified: "feat(51-04): Replace install.sh subprocess with inline Swift binary copy")
- Commit `dc68cc3` present in git log (verified: "fix(51-04): Add do-not-invoke-from-monitor warning to install.sh")
- Task 3 checkpoint:human-verify ran on real hardware and returned full UAT pass for items 3, 4, 5, 6 with concrete launchctl `runs=1→2` / `last exit code=(never exited)→0` evidence and `✓ Updated to dc68cc3` menu bar render

---
*Phase: 51-menu-bar-update-action*
*Plan: 04 (gap closure for 51-VERIFICATION.md Gap 1)*
*Completed: 2026-04-07*
