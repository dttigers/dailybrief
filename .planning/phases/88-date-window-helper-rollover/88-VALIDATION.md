---
phase: 88
slug: date-window-helper-rollover
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 88 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (vigil-core + vigil-pwa) |
| **Config file** | vigil-core/vitest.config.ts, vigil-pwa/vitest.config.ts |
| **Quick run command** | `cd vigil-core && npm test -- --run` |
| **Full suite command** | `cd vigil-core && npm test -- --run && cd ../vigil-pwa && npm test -- --run` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command for the package touched
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Populated by planner — each task maps to ROLLOVER-01..04 with an automated verify command or Wave 0 dependency.*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/utils/date-window.test.ts` — unit tests for `getCurrentWeekWindow` / `getRollingDayWindow` including DST + tz edges
- [ ] `vigil-core/src/routes/thoughts.test.ts` — integration tests for window default + bypass behavior (`?q=`, `?after`/`?before`, `?window=all`)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Thoughts tab header swaps from week label to "Search: all time" when search is active | ROLLOVER-02 (UI) | Visual state check best done by eye | Open PWA Thoughts tab, verify header shows `This week · …`; type in search; verify header swaps to search state; clear search; verify revert |
| Timezone change in Settings shifts boundary on next page load (not live) | ROLLOVER-04 | Cross-page reload timing | Change tz in Settings, reload Thoughts tab, verify window shifted; confirm no live recompute happened before reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
