---
phase: 75
slug: pdf-generation-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test + node:assert/strict |
| **Config file** | vigil-core/package.json (test script) |
| **Quick run command** | `npx tsx --test vigil-core/src/services/pdf-service.test.ts` |
| **Full suite command** | `npx tsx --test vigil-core/src/services/pdf-service.test.ts` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx --test vigil-core/src/services/pdf-service.test.ts`
- **After every plan wave:** Run `npx tsx --test vigil-core/src/services/pdf-service.test.ts`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 75-01-01 | 01 | 1 | PDF-01 | — | N/A | unit | `npx tsx --test vigil-core/src/services/pdf-service.test.ts` | ❌ W0 | ⬜ pending |
| 75-01-02 | 01 | 1 | PDF-05 | — | N/A | unit | `npx tsx --test vigil-core/src/services/pdf-service.test.ts` | ❌ W0 | ⬜ pending |
| 75-02-01 | 02 | 2 | PDF-02 | — | N/A | unit | `npx tsx --test vigil-core/src/services/pdf-service.test.ts` | ❌ W0 | ⬜ pending |
| 75-02-02 | 02 | 2 | PDF-03 | — | N/A | unit | `npx tsx --test vigil-core/src/services/pdf-service.test.ts` | ❌ W0 | ⬜ pending |
| 75-02-03 | 02 | 2 | PDF-04 | — | N/A | unit | `npx tsx --test vigil-core/src/services/pdf-service.test.ts` | ❌ W0 | ⬜ pending |
| 75-02-04 | 02 | 2 | PDF-06 | — | N/A | unit | `npx tsx --test vigil-core/src/services/pdf-service.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/services/pdf-service.test.ts` — test stubs for PDF-01 through PDF-06
- [ ] `pdfkit` + `@types/pdfkit` — npm install
- [ ] `vigil-core/assets/fonts/Inter-Regular.ttf` + `Inter-Medium.ttf` — font files

*Existing node:test infrastructure covers test runner needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF visual layout fidelity | PDF-02, PDF-03, PDF-04 | Visual rendering quality requires human eye check | Open generated PDF in Preview, compare section placement against Swift reference output |
| Notebook glue-in fit | PDF-05 | Physical dimension check | Print PDF, verify it fits inside 8"x4" notebook with margins |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
