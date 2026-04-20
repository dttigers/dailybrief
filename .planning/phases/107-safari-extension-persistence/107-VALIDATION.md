---
phase: 107
slug: safari-extension-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 107-00-01 | 00 | 0 | EXT-01 | — | Wave 0 verify script exists | static | `test -x scripts/verify-phase-107.sh` | ❌ W0 | ⬜ pending |
| 107-01-01 | 01 | 1 | EXT-01 | — | LSUIElement=true in container Info.plist | static | `plutil -extract LSUIElement raw "vigil-safari-extension/Vigil Capture/Info.plist" \| grep -q true` | ✅ | ⬜ pending |
| 107-01-02 | 01 | 1 | EXT-01 | — | Deployment target ≥ 13.0 (SMAppService.mainApp requires macOS 13) | static | `grep -E 'MACOSX_DEPLOYMENT_TARGET = 1[3-9]' "vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj"` | ✅ | ⬜ pending |
| 107-02-01 | 02 | 2 | EXT-01 | — | AppDelegate calls SMAppService.mainApp.register() with status-guard | static | `grep -E 'SMAppService\.mainApp\.(status\|register)' "vigil-safari-extension/Vigil Capture/AppDelegate.swift"` | ✅ | ⬜ pending |
| 107-02-02 | 02 | 2 | EXT-01 | — | First-launch NSAlert shown once via UserDefaults flag | static | `grep -E 'firstLaunch.*Alert.*(Shown\|shown)' "vigil-safari-extension/Vigil Capture/AppDelegate.swift"` | ✅ | ⬜ pending |
| 107-03-01 | 03 | 2 | EXT-01 | — | Main.html persistence pill element present | static | `grep -q 'id="persistence"' "vigil-safari-extension/Vigil Capture/Base.lproj/Main.html"` | ✅ | ⬜ pending |
| 107-03-02 | 03 | 2 | EXT-01 | — | Script.js showPersistence() function present | static | `grep -q 'function showPersistence' "vigil-safari-extension/Vigil Capture/Resources/Script.js"` | ✅ | ⬜ pending |
| 107-04-01 | 04 | 3 | EXT-01 | — | Built app launches without visible window and SMAppService.mainApp.status reads .enabled | integration | `scripts/verify-phase-107.sh --runtime` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-phase-107.sh` — automated assertions for D-07 (plutil, grep, xcodebuild, swift -e probe of SMAppService.mainApp.status)
- [ ] `.planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md` — SC#1 reboot-required check, frontmatter `status: ship-with-uat-pending` (matches 105-HUMAN-UAT.md shape)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Safari extension remains enabled after full macOS restart (not just Safari restart) | EXT-01 SC#1 | OS-level reboot cannot be automated safely from a user's dev machine | See `107-HUMAN-UAT.md` §"Reboot Verification": (1) quit Vigil Capture, (2) `sudo reboot`, (3) after login open Safari > Settings > Extensions, (4) confirm "Vigil Capture" toggle is ON without manual intervention |
| No visible window appears during first launch (eyeball check) | EXT-01 SC#2 | LSUIElement window suppression can be asserted in Info.plist but final "no flash" behavior is subjective | See `107-HUMAN-UAT.md` §"First-Launch Visual": launch the built `.app`, confirm only the NSAlert appears (no storyboard window flash) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (verify-phase-107.sh + 107-HUMAN-UAT.md)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick mode)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
