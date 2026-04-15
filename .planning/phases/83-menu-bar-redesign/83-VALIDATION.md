---
phase: 83
slug: menu-bar-redesign
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 83 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test via tsx (vigil-core); vite build (vigil-pwa); swift build (Swift targets) |
| **Config file** | N/A (node:test via tsx); vigil-pwa/vite.config.ts |
| **Quick run command** | `cd vigil-core && npm test` |
| **Full suite command** | `cd vigil-core && npm test && cd ../vigil-pwa && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-core && npm test -- --run`
- **After every plan wave:** Run full suite + `swift build -c release`
- **Before `/gsd-verify-work`:** Full suite must be green + Swift build clean
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 83-01-01 | 01 | 1 | SC-1 | — | N/A | manual | `defaults read com.jamesonmorrill.dailybriefmonitor LSUIElement` | ✅ | ⬜ pending |
| 83-02-01 | 02 | 2 | SC-3 | — | N/A | unit | `cd vigil-core && node --test src/routes/settings.test.ts 2>&1` | ❌ W0 | ⬜ pending |
| 83-03-01 | 03 | 3 | SC-4 | — | N/A | manual | Launch app, verify menu shows schedule time | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/routes/app-settings.test.ts` — stubs for print-schedule GET/PUT

*Existing Swift build infrastructure covers all Swift verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No Dock icon on launch | SC-1 | macOS UI behavior | Launch app, verify no Dock icon appears |
| Menu shows next print time | SC-2 | macOS UI behavior | Open menu bar icon, verify time displayed |
| Print Now triggers generate+lpr | SC-2 | Requires printer | Click Print Now, verify PDF sent to lpr |
| Schedule persists across app restart | SC-4 | Requires live API + restart | Set schedule in PWA, quit+relaunch app, verify correct schedule loaded |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
