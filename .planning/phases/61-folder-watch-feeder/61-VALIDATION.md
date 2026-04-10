---
phase: 61
slug: folder-watch-feeder
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (Swift) |
| **Config file** | Package.swift (DailyBriefMonitorTests target) |
| **Quick run command** | `swift test --filter DailyBriefMonitorTests` |
| **Full suite command** | `swift test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `swift test --filter DailyBriefMonitorTests`
- **After every plan wave:** Run `swift test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | WATCH-01 | — | N/A | unit | `swift test --filter FolderWatcherServiceTests` | ❌ W0 | ⬜ pending |
| 61-01-02 | 01 | 1 | WATCH-02 | — | N/A | unit | `swift test --filter FolderWatcherServiceTests` | ❌ W0 | ⬜ pending |
| 61-01-03 | 01 | 1 | WATCH-03 | — | N/A | unit | `swift test --filter FolderWatcherServiceTests` | ❌ W0 | ⬜ pending |
| 61-01-04 | 01 | 1 | WATCH-04 | — | N/A | unit | `swift test --filter FolderWatcherServiceTests` | ❌ W0 | ⬜ pending |
| 61-01-05 | 01 | 1 | WATCH-06 | — | N/A | unit | `swift test --filter FolderWatcherServiceTests` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `Tests/DailyBriefMonitorTests/FolderWatcherServiceTests.swift` — stubs for WATCH-01 through WATCH-06
- [ ] Test fixtures for mock file system operations

*Existing infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DispatchSource fires on real file drop | WATCH-01 | Requires actual filesystem event | Drop image into watched dir, verify upload starts |
| Retry on file move-back | WATCH-06 | Requires manual file manipulation | Move failed file out then back, verify re-trigger |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
