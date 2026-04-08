---
phase: 53
slug: projects-dashboard-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Populated by the planner from RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | (planner fills from RESEARCH.md — likely `node --test` or smoke `curl` for vigil-core; `swift test` or manual launch for Mac) |
| **Config file** | (planner fills) |
| **Quick run command** | (planner fills) |
| **Full suite command** | (planner fills) |
| **Estimated runtime** | (planner fills) |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** (planner fills)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills from RESEARCH.md Validation Architecture) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] (planner fills — test stubs / smoke harness)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (planner fills — SwiftUI behaviors that need launch+click verification) | | | |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency reasonable
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
