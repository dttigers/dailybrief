---
phase: 77
slug: pwa-brief-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — vigil-pwa has no test runner; Wave 0 deferred |
| **Config file** | none |
| **Quick run command** | `npx tsc --noEmit` (type-check only) |
| **Full suite command** | `npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx tsc --noEmit && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 77-01-01 | 01 | 1 | PWA-01 | — | N/A | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 77-01-02 | 01 | 1 | PWA-02 | — | N/A | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 77-01-03 | 01 | 1 | PWA-03 | — | N/A | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 77-02-01 | 02 | 2 | PWA-01 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 77-02-02 | 02 | 2 | PWA-02 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 77-02-03 | 02 | 2 | PWA-03 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The PWA has no test framework and adding one is deferred to a dedicated testing phase — consistent with the zero-test pattern across the entire vigil-pwa codebase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generate button calls API and shows spinner | PWA-01 | Requires running Phase 76 API server | Click "Generate Today's Brief", verify spinner appears and PDF loads |
| PDF renders inline in iframe | PWA-02 | Browser-specific iframe rendering | After generation, verify PDF is visible in the iframe without downloading |
| Download button saves PDF with correct filename | PWA-03 | Requires browser download dialog | Click "Download PDF", verify file saves as `vigil-brief-YYYY-MM-DD.pdf` |
| Past brief PDF preview | PWA-02 | Requires stored brief data | Click a past brief in list, verify PDF loads in iframe |
| Tab renamed to "Briefs" | — | Visual check | Navigate to Layout, verify tab label reads "Briefs" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
