---
phase: 76
slug: brief-assembly-endpoint
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) via tsx |
| **Config file** | None — uses `npx tsx --test "src/**/*.test.ts"` |
| **Quick run command** | `cd vigil-core && npx tsx --test "src/**/*.test.ts"` |
| **Full suite command** | `cd vigil-core && npx tsx --test "src/**/*.test.ts"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-core && npx tsx --test "src/**/*.test.ts"`
- **After every plan wave:** Run `cd vigil-core && npx tsx --test "src/**/*.test.ts"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 76-01-01 | 01 | 1 | BRIEF-01 | — | POST returns PDF binary with correct content-type | unit | `cd vigil-core && npx tsx --test src/services/brief-assembly-service.test.ts` | No W0 | pending |
| 76-01-02 | 01 | 1 | BRIEF-02 | — | Partial failure still returns complete PDF | unit | `cd vigil-core && npx tsx --test src/services/brief-assembly-service.test.ts` | No W0 | pending |
| 76-02-01 | 02 | 2 | BRIEF-03 | — | PDF saved with storage_key in response | unit | `cd vigil-core && npx tsx --test src/routes/brief-generate.test.ts` | No W0 | pending |
| 76-02-02 | 02 | 2 | BRIEF-04 | — | GET /brief/:date returns stored PDF | unit | `cd vigil-core && npx tsx --test src/routes/brief-generate.test.ts` | No W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/services/brief-assembly-service.test.ts` — stubs for BRIEF-01, BRIEF-02
- [ ] `vigil-core/src/routes/brief-generate.test.ts` — stubs for BRIEF-03, BRIEF-04

*Existing node:test + tsx infrastructure covers framework needs. No vitest config required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF opens correctly in Preview | BRIEF-01 | Binary format visual verification | Generate brief, download PDF, open in Preview app |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
