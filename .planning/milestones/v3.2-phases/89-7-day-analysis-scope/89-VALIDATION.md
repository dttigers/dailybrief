---
phase: 89
slug: 7-day-analysis-scope
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vigil-core/vitest.config.ts |
| **Quick run command** | `cd vigil-core && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd vigil-core && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-core && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd vigil-core && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 89-01-01 | 01 | 1 | SCOPE-01 | — | N/A | integration | `cd vigil-core && npx vitest run` | ❌ W0 | ⬜ pending |
| 89-01-02 | 01 | 1 | SCOPE-02 | — | N/A | integration | `cd vigil-core && npx vitest run` | ❌ W0 | ⬜ pending |
| 89-01-03 | 01 | 1 | SCOPE-03 | — | N/A | integration | `cd vigil-core && npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for SCOPE-01, SCOPE-02, SCOPE-03 — verify 7-day window scoping per endpoint
- [ ] Fixtures for mock DB with thoughts at various timestamps

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Analyzing last 7 days" subheading visible | SCOPE-01 | Visual UI check | Open Insights/Therapy pages, confirm subheading appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
