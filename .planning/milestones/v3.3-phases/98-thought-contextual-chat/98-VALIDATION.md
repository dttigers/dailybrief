---
phase: 98
slug: thought-contextual-chat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 98 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vigil-pwa/vitest.config.ts (if exists) or "none — Wave 0 installs" |
| **Quick run command** | `cd vigil-pwa && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd vigil-pwa && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-pwa && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd vigil-pwa && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 98-01-01 | 01 | 1 | CHAT-01 | — | N/A | manual | Browser: tap chat icon on thought | — | ⬜ pending |
| 98-01-02 | 01 | 1 | CHAT-01 | — | N/A | manual | Browser: verify thought injected as first message | — | ⬜ pending |
| 98-02-01 | 02 | 1 | CHAT-01 | — | N/A | manual | Browser: verify AI auto-responds to injected thought | — | ⬜ pending |
| 98-02-02 | 02 | 1 | CHAT-01 | — | N/A | manual | Browser: continue multi-turn after injection | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat icon visible on ThoughtRow | CHAT-01 | UI visual check | Open Thoughts page, verify chat bubble icon on each thought |
| Thought injected as first message | CHAT-01 | Requires browser + API interaction | Tap chat icon, verify thought text appears as user message |
| AI auto-responds | CHAT-01 | Requires live API call | Verify AI response appears after thought injection |
| Multi-turn continues | CHAT-01 | Requires interactive chat | Type follow-up message, verify normal chat flow |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
