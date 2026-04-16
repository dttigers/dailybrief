---
phase: 90
slug: server-side-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 90 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (PWA), manual curl/httpie (API) |
| **Config file** | `vigil-pwa/vitest.config.ts` (if exists) or "none — Wave 0 installs" |
| **Quick run command** | `cd vigil-pwa && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd vigil-pwa && npx vitest run && cd ../vigil-core && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-pwa && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd vigil-pwa && npx vitest run && cd ../vigil-core && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 90-01-01 | 01 | 1 | PERSIST-01 | — | N/A | integration | `curl -s http://localhost:3001/v1/insights/cache` | ❌ W0 | ⬜ pending |
| 90-01-02 | 01 | 1 | PERSIST-02 | — | N/A | integration | `curl -s http://localhost:3001/v1/therapy/cache?type=patterns` | ❌ W0 | ⬜ pending |
| 90-01-03 | 01 | 1 | PERSIST-03 | — | N/A | integration | `curl -s http://localhost:3001/v1/therapy/cache?type=prep` | ❌ W0 | ⬜ pending |
| 90-02-01 | 02 | 2 | PERSIST-01 | — | N/A | manual | Browser: revisit Insights page, verify cached display | ❌ W0 | ⬜ pending |
| 90-02-02 | 02 | 2 | PERSIST-02 | — | N/A | manual | Browser: revisit Therapy page, verify cached patterns | ❌ W0 | ⬜ pending |
| 90-02-03 | 02 | 2 | PERSIST-03 | — | N/A | manual | Browser: revisit Therapy page, verify cached prep | ❌ W0 | ⬜ pending |
| 90-03-01 | 03 | 2 | PERSIST-04 | — | N/A | manual | Browser: close PWA, reopen, verify Chat auto-resumes | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

*Server-side cache endpoints can be verified with curl. PWA behavior requires manual browser testing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cached Insights display instantly on revisit | PERSIST-01 | Requires browser rendering + visual check | 1. Generate Insights 2. Navigate away 3. Return — verify instant display + Regenerate button |
| Cached Therapy patterns display instantly | PERSIST-02 | Requires browser rendering + visual check | 1. Generate patterns 2. Navigate away 3. Return — verify instant display + Regenerate button |
| Cached Therapy prep displays instantly | PERSIST-03 | Requires browser rendering + visual check | 1. Generate prep 2. Navigate away 3. Return — verify instant display + Regenerate button |
| Regenerate replaces content with spinner then new results | PERSIST-01/02/03 | Requires visual animation check | Click Regenerate on any page — old content disappears, spinner shows, new results appear |
| Chat auto-resumes most recent session | PERSIST-04 | Requires PWA close/reopen cycle | Close PWA tab, reopen — verify last chat session loads with prior messages |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
