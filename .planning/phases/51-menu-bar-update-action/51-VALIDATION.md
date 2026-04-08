---
phase: 51
slug: menu-bar-update-action
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no `Tests/` directory exists in repo (confirmed by 51-RESEARCH.md). Validation is `swift build -c release` + manual checklist, matching how phases 1-50 were validated. |
| **Config file** | none |
| **Quick run command** | `swift build -c release 2>&1` |
| **Full suite command** | `swift build -c release && ./Scripts/install.sh` |
| **Estimated runtime** | ~5–15s incremental, ~60s clean |

---

## Sampling Rate

- **After every task commit:** Run `swift build -c release` (compile gate)
- **After every plan wave:** Run `swift build -c release && ./Scripts/install.sh` (compile + install gate)
- **Before `/gsd-verify-work`:** Manual checklist below must be green end-to-end on hardware
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

> Filled in by planner. Each task with code changes must have either an `<automated>` block (compile/grep/file-exists) or a manual checklist entry below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | DEV-01..04  | —          | N/A             | compile   | `swift build -c release` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Confirm `~/Library/Application Support/DailyBrief/` creation logic exists in plan (handoff dir does NOT pre-exist — verified by research A1)
- [ ] Confirm `launchctl print gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor` returns `state = running` before phase begins (baseline)

*No test framework to install. Existing `swift build` infrastructure covers all compile-level verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Update Vigil" menu item appears in DailyBriefMonitor menu | DEV-01 | macOS menu bar UI cannot be unit tested without test infra | After install, click menu bar icon → confirm "Update Vigil" item present between/near "Run Now" and "View Log" |
| Clicking "Update Vigil" rebuilds + reinstalls without terminal | DEV-02 | End-to-end Process spawn + install.sh + LaunchAgent reload | Make trivial source edit → click "Update Vigil" → wait → confirm new binary mtime in `~/.local/bin/` and `launchctl print` shows respawn |
| Inline status feedback (in-progress / success / error) | DEV-03 | Visual UI behavior across icon swap, label cycle, status row | Click "Update Vigil" → observe rotating icon → button label "Updating…" → final "✓ Updated to {sha}" or "✗ Build failed"; on failure observe last-20-line stderr tail + "Open Full Log" button |
| LaunchAgent reload makes new binary active immediately | DEV-02, DEV-04 | launchctl kickstart × KeepAlive race (research A1) | After successful update, `ps -ef | grep DailyBriefMonitor` shows new PID; menu bar icon "blinks" then returns; new instance reads handoff file and surfaces "✅ Updated to {sha}" |
| Idempotent no-op when nothing changed | DEV-04 | Requires sequential clicks to verify mtime gate | Click "Update Vigil" twice in a row with no source edits → second click reports "✓ Up to date — no changes" without copying binaries or kickstarting LaunchAgent |
| Detached helper survives parent exit (research A2) | DEV-02 | Cannot mock; must verify on real launchd | After click, observe new monitor PID respawned by launchd within ~2s; helper script `/tmp/vigil-reload.sh` cleaned up or harmless if left |
| `#filePath` resolves to repo root in release binary (research A5) | DEV-02 | SwiftPM compile-time path embedding | `strings ~/.local/bin/DailyBriefMonitor | grep -F "$(pwd)"` shows the repo path baked into binary |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (compile gate) or Wave 0 dependencies
- [ ] Sampling continuity: every code-change task ends with `swift build -c release`
- [ ] Wave 0 baseline check completed (handoff dir, LaunchAgent state)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s for incremental compile
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills task map

**Approval:** pending
