---
phase: 78
slug: mac-cli-thin-client
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | swift test (Swift Package Manager) |
| **Config file** | `Package.swift` |
| **Quick run command** | `swift build` |
| **Full suite command** | `swift build && swift test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `swift build`
- **After every plan wave:** Run `swift build && swift test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 78-01-01 | 01 | 1 | CLI-01 | — | N/A | build | `swift build` | ✅ | ⬜ pending |
| 78-01-02 | 01 | 1 | CLI-01 | — | N/A | build | `swift build` | ✅ | ⬜ pending |
| 78-01-03 | 01 | 1 | CLI-02 | — | N/A | build | `swift build` | ✅ | ⬜ pending |
| 78-02-01 | 02 | 1 | CLI-03 | — | N/A | build | `swift build` | ✅ | ⬜ pending |
| 78-02-02 | 02 | 1 | CLI-03 | — | N/A | build | `swift build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF fetched from server and printed via lpr | CLI-01 | Requires running server and printer | Run `dailybrief generate`, verify PDF saved and print job queued |
| BriefScheduler auto-print fires correctly | CLI-02 | Requires scheduled trigger and printer | Wait for scheduled time or trigger manually via Monitor |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
