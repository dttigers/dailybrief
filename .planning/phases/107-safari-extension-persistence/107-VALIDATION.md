---
phase: 107
slug: safari-extension-persistence
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-20
---

# Phase 107 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated by planner from 107-RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | shell assertions (`plutil`, `grep`, `swift -e`, `xcodebuild`) — native macOS tools, no new framework |
| **Config file** | `scripts/verify-phase-107.sh` (Wave 0 creates it) |
| **Quick run command** | `scripts/verify-phase-107.sh --static` (plutil + grep only, no build) |
| **Full suite command** | `scripts/verify-phase-107.sh` (adds xcodebuild + SMAppService.mainApp.status probe) |
| **Estimated runtime** | ~30s quick, ~2min full (xcodebuild dominates) |

---

## Sampling Rate

- **After every task commit:** Run `scripts/verify-phase-107.sh --static`
- **After every plan wave:** Run `scripts/verify-phase-107.sh`
- **Before `/gsd-verify-work`:** Full suite green AND `107-HUMAN-UAT.md` frontmatter `status: ship-with-uat-pending`
- **Max feedback latency:** 30s (quick mode)

---

## Per-Task Verification Map

> Planner fills this table from the actual tasks it creates. Rows below are scaffolded from D-07 automated-check set in CONTEXT.md — planner adjusts Task ID column to match final plan decomposition.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 107-00-01 | 00 | 0 | EXT-01 | T-107-W0-01 | Wave 0 verify script exists and is executable | static | `test -x scripts/verify-phase-107.sh && bash -n scripts/verify-phase-107.sh` | ✅ | ✅ green |
| 107-00-02 | 00 | 0 | EXT-01 | — | Wave 0 HUMAN-UAT file present with ship-with-uat-pending status | static | `grep -q 'status: ship-with-uat-pending' .planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md` | ✅ | ✅ green |
| 107-01-01 | 01 | 1 | EXT-01 | T-107-01-01 | LSUIElement=true in container Info.plist | static | `plutil -extract LSUIElement raw "vigil-safari-extension/Vigil Capture/Info.plist" \| grep -q '^true$'` | ✅ | ✅ green |
| 107-02-01 | 02 | 2 | EXT-01 | T-107-02-01,T-107-02-02 | AppDelegate calls SMAppService.mainApp.register() with status-guard | static | `grep -q 'SMAppService.mainApp.register()' "vigil-safari-extension/Vigil Capture/AppDelegate.swift" && grep -q 'SMAppService.mainApp.status' "vigil-safari-extension/Vigil Capture/AppDelegate.swift"` | ✅ | ✅ green |
| 107-02-02 | 02 | 2 | EXT-01 | T-107-02-03,T-107-02-04 | First-launch NSAlert gated by UserDefaults with NSApp.activate | static | `grep -q 'firstLaunchAlertKey' "vigil-safari-extension/Vigil Capture/AppDelegate.swift" && grep -q 'NSApp.activate(ignoringOtherApps: true)' "vigil-safari-extension/Vigil Capture/AppDelegate.swift"` | ✅ | ✅ green |
| 107-03-01 | 03 | 2 | EXT-01 | — | Main.html persistence pill elements present | static | `grep -q 'id="persistence"' "vigil-safari-extension/Vigil Capture/Resources/Base.lproj/Main.html"` | ✅ | ✅ green |
| 107-03-02 | 03 | 2 | EXT-01 | — | Script.js showPersistence() function present | static | `grep -q 'function showPersistence' "vigil-safari-extension/Vigil Capture/Resources/Script.js"` | ✅ | ✅ green |
| 107-03-03 | 03 | 2 | EXT-01 | — | Style.css persistence-* visibility rules present | static | `grep -c 'body.persistence-' "vigil-safari-extension/Vigil Capture/Resources/Style.css" \| awk '$1 >= 4 { exit 0 } { exit 1 }'` | ✅ | ✅ green |
| 107-03-04 | 03 | 2 | EXT-01 | T-107-03-01 | ViewController imports ServiceManagement and bridges status to showPersistence | static | `grep -q 'import ServiceManagement' "vigil-safari-extension/Vigil Capture/ViewController.swift" && grep -q 'showPersistence' "vigil-safari-extension/Vigil Capture/ViewController.swift"` | ✅ | ✅ green |
| 107-04-01 | 04 | 3 | EXT-01 | — | Full harness (xcodebuild + post-launch SMAppService probe) green | integration | `bash scripts/verify-phase-107.sh --full` | ✅ | ✅ green |
| 107-04-02 | 04 | 3 | EXT-01 | — | Human eyeball: no visible window flash on first launch; NSAlert shows once | human | see 107-HUMAN-UAT.md Tests 3, 4 | ✅ | ⏳ ship-with-uat-pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `scripts/verify-phase-107.sh` — automated assertions for D-07 (plutil, grep, xcodebuild, swift -e probe of SMAppService.mainApp.status)
- [x] `.planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md` — SC#1 reboot-required check, frontmatter `status: ship-with-uat-pending` (matches 105-HUMAN-UAT.md shape)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Safari extension remains enabled after full macOS restart (not just Safari restart) | EXT-01 SC#1 | OS-level reboot cannot be automated safely from a user's dev machine | See `107-HUMAN-UAT.md` §"Reboot Verification": (1) quit Vigil Capture, (2) `sudo reboot`, (3) after login open Safari > Settings > Extensions, (4) confirm "Vigil Capture" toggle is ON without manual intervention |
| No visible window appears during first launch (eyeball check) | EXT-01 SC#2 | LSUIElement window suppression can be asserted in Info.plist but final "no flash" behavior is subjective | See `107-HUMAN-UAT.md` §"First-Launch Visual": launch the built `.app`, confirm only the NSAlert appears (no storyboard window flash) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (verify-phase-107.sh + 107-HUMAN-UAT.md)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick mode)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (ship-with-uat-pending — Test 1/2/5 reboot pending user action)
