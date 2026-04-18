---
phase: 101
slug: context-menu
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 101 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/react (existing in vigil-pwa) |
| **Config file** | `vigil-pwa/vitest.config.ts` |
| **Quick run command** | `cd vigil-pwa && npm run test -- --run {file}` |
| **Full suite command** | `cd vigil-pwa && npm run test -- --run` |
| **Estimated runtime** | ~15 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run touched test file with `--run` flag
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green + manual iOS long-press UAT
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

*Populated by planner; each task's `<automated>` block must map to a row here. Task IDs follow `{phase}-{plan}-{task}` pattern. See 101-RESEARCH.md §"Wave 0 Test Gaps" for file inventory.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-by-planner | — | — | CTX-01..07 | — | — | unit/integration | `cd vigil-pwa && npm run test -- --run {file}` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-pwa/src/components/ContextMenu.test.tsx` — stubs for CTX-01, CTX-02, CTX-03 (trigger + positioning + close behavior)
- [ ] `vigil-pwa/src/components/ToastHost.test.tsx` — stubs for CTX-05 (undo toast lifecycle, deferred-commit)
- [ ] `vigil-pwa/src/hooks/useToast.test.ts` — stubs for useToast() API contract
- [ ] `vigil-pwa/src/components/ThoughtRow.test.tsx` — extensions for CTX-04 (edit interlock), CTX-06 (re-triage), edit-mode suppression (D-03)
- [ ] Optional: `vigil-pwa/src/pages/ThoughtsPage.test.tsx` — integration test for deferred-commit undo flow

*Existing fake-timer + microtask-flush pattern from `useThoughts.test.tsx:18-23` is the template for long-press (500ms) and toast (5s) timer tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS long-press opens menu (not native callout) | CTX-02 | Safari native callout + `contextmenu` synthesis cannot be reproduced in jsdom / Chrome DevTools emulation | On a real iPhone, long-press a thought row in Safari. Menu must open within ~500ms; native "Copy/Look Up" callout must NOT appear. Verify `-webkit-touch-callout: none` is applied. |
| Viewport overflow flip (bottom/right edges) | CTX-03 | jsdom reports fixed viewport; real positioning math only visible in a browser | Open menu near bottom-right of viewport on desktop Chrome, Safari, Firefox. Verify menu flips up and shifts left rather than clipping. |
| Scroll/resize dismissal feels natural | CTX-03 | Perceptual — no automated assertion for "feels right" | Open menu, scroll the thought list. Menu must close immediately. Resize window — menu must close. |
| Focus return on close | CTX-07 (a11y) | Focus behavior in jsdom diverges from browsers | Open menu with right-click, press Escape. Triggering row must regain focus (visible outline in keyboard-only nav). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 test files listed above)
- [ ] No watch-mode flags (use `--run` always)
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] Manual iOS UAT executed and recorded before phase verification

**Approval:** pending
