---
status: pass
phase: 51-menu-bar-update-action
verifier: claude (gsd-verifier, re-verification after Plan 51-04 gap closure)
created: 2026-04-08T03:32:20Z
updated: 2026-04-08T00:00:00Z
must_haves_total: 4
must_haves_passed: 4
gaps_open: 0
requirements: [DEV-01, DEV-02, DEV-03, DEV-04]
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "Gap 1: install.sh subprocess kills the UpdateService parent process before handoff/trampoline can run"
  gaps_remaining: []
  regressions: []
---

# Phase 51 Verification Report

## Verdict: pass

Phase 51 — Menu Bar Update Action — is **complete**. The original blocking gap (install.sh `launchctl bootout` killing the UpdateService parent mid-lifecycle) has been closed by Plan 51-04, which replaced the install.sh subprocess with an inline `FileManager.copyItem` Swift helper. Live UAT on real hardware confirms the full lifecycle (build → mtime gate → inline install → writeHandoff → trampoline → exit(0) → respawn → consumeHandoff) executes end-to-end and surfaces `✓ Updated to {sha}` in the menu bar. All 5 ROADMAP success criteria are met. All 4 DEV-* requirements are satisfied.

## Phase Goal

> User can rebuild and reinstall the Vigil binaries without opening a terminal, with live status feedback in the menu bar.

**Status:** ✅ achieved end-to-end on real hardware (UAT 2026-04-08).

## ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | "Update Vigil" menu item appears in DailyBriefMonitor menu bar menu | ✅ pass | `Sources/DailyBriefMonitor/MenuBarView.swift:96-102` — `Button { updater.updateNow() } label: { Label(updateButtonLabel, …) }` wired into the dropdown next to Run Now. UAT confirmed visible. |
| 2 | Clicking triggers build + install of both binaries with no terminal | ✅ pass | `UpdateService.runUpdateLifecycle()` (lines 61-106): STEP 1 `swift build -c release`, STEP 3 `installBuiltBinaries()` copies both `DailyBrief` and `DailyBriefMonitor` from `.build/release` → `~/.local/bin` (lines 148-171). No terminal involvement. |
| 3 | In-progress / success / error-with-reason feedback inline during and after | ✅ pass | `MenuBarView.swift:142-180` — button label cycles `idle → Updating… → ✓ Up to date / ✓ Updated to {sha} / ✗ Build failed`; failure case (lines 105-118) renders inline `tail` + "Open Full Log" button. UAT Item 5 confirmed live. |
| 4 | LaunchAgent reloaded so new binary is active immediately | ✅ pass | `spawnDetachedReloadHelper()` (lines 217-237) writes `/tmp/vigil-reload.sh` with `launchctl kickstart -k gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor` and runs it detached; parent calls `exit(0)` (line 102). UAT: PID changed `43468 → 43870`, `runs` incremented `1 → 2`, `last exit code = 0`. |
| 5 | Repeated clicks with no changes → idempotent no-op | ✅ pass | `installedBinariesAreFresh()` (lines 176-184) — mtime gate returns `.upToDate` when installed binaries are newer-or-equal to build outputs. Returned at line 75 as `.upToDate` with no install / no respawn. UAT confirmed second click reports "Up to date". |

**Score:** 5/5 success criteria verified.

## Must-Haves Status

| # | Must-have | Source | Status | Evidence |
|---|-----------|--------|--------|----------|
| 1 | `RepoLocation` exposes compile-time repo root via `#filePath`, no hardcoded paths anywhere | DEV-01, Plan 51-01 | ✅ pass | `Sources/DailyBriefMonitor/RepoLocation.swift:15-19` — `URL(fileURLWithPath: #filePath)` walked up 3 directories. `StatusChecker` no longer references any hardcoded path. |
| 2 | `UpdateService` is `@Observable`, runs build → mtime gate → install → handoff → trampoline → exit lifecycle | DEV-02, Plan 51-02 + 51-04 | ✅ pass | `UpdateService.swift:3` `@Observable`. Lifecycle (lines 61-106) executes all 6 steps end-to-end. UAT proof: `runs=1→2`, `last exit code=(never exited)→0`, `update.log` contains `=== inline install` followed by `=== writeHandoff ===` in order, `last-update.json` written and consumed. |
| 3 | "Update Vigil" button mirrors "Run Now" verbatim, status row surfaces idle/running/upToDate/updated/failed states, failure mode shows tail + Open Full Log | DEV-03, Plan 51-03 | ✅ pass | `MenuBarView.swift:96-118, 142-180` — all 5 status cases mapped, button structure mirrors Run Now (lines 85-94 vs 96-102), failure tail + Open Full Log present. UAT Item 5 confirmed. |
| 4 | App-level `UpdateService` instantiation + one-shot `consumeHandoff()` on launch | DEV-04, Plan 51-03 | ✅ pass | `DailyBriefMonitorApp.swift:7,9,27-29` — `@State updater = UpdateService()`, `didConsumeHandoff` flag, `updater.consumeHandoff()` called once. UAT proof: `~/Library/Application Support/DailyBrief/last-update.json` was written by `writeHandoff()` and subsequently consumed/deleted by the relaunched instance, which then rendered `✓ Updated to dc68cc3` in the menu bar status row. |

**Score:** 4/4 must-haves verified.

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| DEV-01 | Single menu bar action rebuilds + reinstalls both binaries with no terminal | ✅ satisfied | SC#1+#2 above; `MenuBarView` button + `installBuiltBinaries()` cover both binaries in pure Swift. |
| DEV-02 | Update action reloads LaunchAgent so new binary is active immediately | ✅ satisfied | SC#4; `spawnDetachedReloadHelper()` + `launchctl kickstart -k`; UAT PID change 43468→43870. |
| DEV-03 | Inline status feedback (in-progress / success / error-with-reason) | ✅ satisfied | SC#3; 5 button label states + failure tail + Open Full Log button. UAT Item 5 confirmed. |
| DEV-04 | Idempotent — safe to click repeatedly; no-op when nothing changed | ✅ satisfied | SC#5; mtime gate (`installedBinariesAreFresh()`) returns `.upToDate` without install/respawn. |

## Gap 1 Closure

Original Gap 1 from the previous verification (`UpdateService.runUpdateLifecycle()` shelled out to `Scripts/install.sh`, whose `launchctl bootout` SIGTERM'd the parent process before `writeHandoff()` / `spawnDetachedReloadHelper()` / `exit(0)` could run) is now **CLOSED**.

### Closure Evidence

| Check | Pre-Plan-51-04 | Post-Plan-51-04 | Verdict |
|-------|----------------|-----------------|---------|
| `grep -c "install.sh" Sources/DailyBriefMonitor/UpdateService.swift` | 1 (subprocess call) | **0** (verified via Grep tool — zero literal `install.sh` references; only two comment-mentions of `install_sh` with underscore documenting why it must NOT be invoked) | ✅ closed |
| Menu bar status after click on real hardware | "Idle" / "Up to date" (handoff never written) | **`✓ Updated to dc68cc3`** | ✅ closed |
| `launchctl print` `runs` counter | `1` (never exited) | **`1 → 2`** (cleanly exited and respawned exactly once) | ✅ closed |
| `launchctl print` `last exit code` | `(never exited)` | **`0`** — direct proof `exit(0)` was reached | ✅ closed |
| `update.log` lifecycle markers | `=== swift build` only; no `install.sh` header, no handoff marker | **`=== inline install (cp .build/release → ~/.local/bin) ===` followed by `=== writeHandoff ===` in order** | ✅ closed |
| `~/Library/Application Support/DailyBrief/last-update.json` | Never created (`writeHandoff()` never reached) | **Written by parent, consumed and deleted by relaunched instance** | ✅ closed |
| `~/.local/bin/DailyBrief*` updated | Partial (install.sh's `cp -f` ran before SIGTERM) | **Both binaries copied via `FileManager.copyItem` from a single owning process** | ✅ closed |

### Code-Level Fix

`Sources/DailyBriefMonitor/UpdateService.swift` lines 79-87 (STEP 3) replaced the `runProcess(... installScript ...)` call with `installBuiltBinaries()` (lines 132-174), a pure Swift `FileManager.copyItem` helper that:

- Creates `~/.local/bin` via `FileManager.createDirectory(withIntermediateDirectories: true)` (parity with `mkdir -p`)
- For each of `DailyBrief` and `DailyBriefMonitor`: removes existing destination (parity with `cp -f`), then `copyItem(atPath:toPath:)`
- **Never touches launchctl** — the `/tmp/vigil-reload.sh` trampoline remains the sole owner of `launchctl kickstart -k`, preserving the D-02/D-03 invariant from `51-CONTEXT.md`

`Scripts/install.sh` lines 91-105 received a multi-line block-comment warning naming the exact failure mode for grep-discoverability by future maintainers. `install.sh` retains its terminal-only first-install role.

### Trampoline Invariant Restored

> **D-02/D-03 (locked):** Only `/tmp/vigil-reload.sh` may touch launchctl. The managed `com.jamesonmorrill.dailybriefmonitor` process must never call `launchctl bootout` or `launchctl bootstrap` on its own label.

- `UpdateService.swift` has zero launchctl references (verified)
- `installBuiltBinaries()` is pure FileManager Swift
- The only launchctl call is `launchctl kickstart -k gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor` inside the detached `/tmp/vigil-reload.sh` trampoline (line 222), which runs AFTER the parent has called `exit(0)`
- `Scripts/install.sh` has a prominent regression-guard warning above its bootout/bootstrap block

## Anti-Pattern Scan

Scanned `Sources/DailyBriefMonitor/UpdateService.swift`, `MenuBarView.swift`, `DailyBriefMonitorApp.swift`, `RepoLocation.swift`, and `Scripts/install.sh`. No TODO/FIXME/PLACEHOLDER markers. No empty stub returns. No hardcoded empty data flowing to UI. No console-only handlers. The fix is substantive, not a stub.

## UAT Checklist (post-51-04 re-verification)

| # | Item | Result |
|---|------|--------|
| 1 | `./Scripts/install.sh` clean bootstrap (terminal) | ✅ pass |
| 2 | Click Update Vigil with no source changes → "✓ Up to date" | ✅ pass |
| 3 | Touch source / force fall-through, click Update Vigil → "✓ Updated to {sha}" | ✅ pass (`✓ Updated to dc68cc3` rendered live) |
| 4 | `launchctl print` PID changes; `runs` increments; `last exit code = 0` | ✅ pass (`43468 → 43870`, `runs 1 → 2`, exit code 0) |
| 5 | Force build failure → "✗ Build failed" + inline tail + Open Full Log | ✅ pass |
| 6 | Mark `51-VALIDATION.md` rows green | ✅ pass (status: green, all 7 task rows + Wave 0 + Sign-Off green) |

## Commits Verified

- `821187a` — `fix(51-04): inline binary install in UpdateService — no install.sh subprocess`
- `dc68cc3` — `docs(51-04): warn against invoking install.sh from inside managed monitor process`
- `a1c7f5f` — `docs(51-04): complete gap closure plan summary`
- `d4c71af` — `docs(51): VALIDATION green, plan 51-04 complete in roadmap`

## Recommendation

**Phase 51 is complete. Ready to advance to Phase 52 (Projects Backend).**

- All 5 ROADMAP success criteria are met
- All 4 must-haves are green
- All 4 DEV-* requirements are satisfied
- The blocking Gap 1 is closed with hard launchd evidence (clean exit signature)
- The trampoline invariant (D-02/D-03) is now enforced by code structure (`UpdateService` has zero launchctl references; `install.sh` has a regression-guard warning naming the exact failure mode)
- `51-VALIDATION.md` is green and signed off

No outstanding gaps. No human verification items remain. No regressions detected.
