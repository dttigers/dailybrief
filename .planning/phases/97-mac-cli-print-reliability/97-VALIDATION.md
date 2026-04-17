---
phase: 97
slug: mac-cli-print-reliability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 97 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (Swift Package) |
| **Config file** | Package.swift (test target: DailyBriefMonitorTests) |
| **Quick run command** | `swift test --filter StatusCheckerTests` |
| **Full suite command** | `swift test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `swift test --filter StatusCheckerTests`
- **After every plan wave:** Run `swift test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 97-01-01 | 01 | 1 | FIX-03 | — | N/A | unit | `swift test --filter PrintServiceTests` | ❌ W0 | ⬜ pending |
| 97-01-02 | 01 | 1 | FIX-03 | — | N/A | unit | `swift test --filter StatusCheckerTests` | ✅ | ⬜ pending |
| 97-01-03 | 01 | 1 | FIX-03 | — | N/A | manual | `dailybrief doctor` | — | ⬜ pending |
| 97-01-04 | 01 | 1 | FIX-03 | — | N/A | manual | physical paper measurement | — | ⬜ pending |
| 97-01-05 | 01 | 1 | FIX-03 | — | N/A | manual | log inspection + full chain | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `Tests/DailyBriefTests/PrintServiceTests.swift` — covers PrintService throw-on-failure + printer reachability check
- [ ] `Tests/DailyBriefTests/` directory — test target may need to be added to Package.swift if it doesn't exist

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 100% scale print output | FIX-03 (D-07) | Physical paper measurement required | Print test page, measure output against 3.75" x 7.5" PDF dimensions |
| Full chain scheduled run | FIX-03 (D-01) | Requires Monitor + LaunchAgent + physical printer | Wait for scheduled fire, check log output + physical print |
| Monitor red badge on failure | FIX-03 (D-03/D-04) | Visual UI verification | Pause printer, run CLI, observe Monitor menu bar badge |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
