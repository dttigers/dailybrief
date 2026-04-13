---
phase: 74
slug: google-calendar-server-side
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | vigil-core/package.json (test script) |
| **Quick run command** | `cd vigil-core && npx tsx --test src/services/calendar-service.test.ts` |
| **Full suite command** | `cd vigil-core && npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 1 | CAL-02 | T-74-01 | Tokens encrypted at rest with AES-256-GCM | unit | `npx tsx --test src/services/calendar-service.test.ts` | ❌ W0 | ⬜ pending |
| 74-01-02 | 01 | 1 | CAL-02 | T-74-02 | Refresh token never in response bodies | unit | `npx tsx --test src/services/calendar-service.test.ts` | ❌ W0 | ⬜ pending |
| 74-02-01 | 02 | 2 | CAL-01 | T-74-03 | OAuth state param prevents CSRF | integration | `npx tsx --test src/routes/calendar.test.ts` | ❌ W0 | ⬜ pending |
| 74-02-02 | 02 | 2 | CAL-03 | — | Events fetched for today only | unit | `npx tsx --test src/services/calendar-service.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/services/calendar-service.test.ts` — stubs for CAL-02, CAL-03
- [ ] `vigil-core/src/routes/calendar.test.ts` — stubs for CAL-01

*Existing test infrastructure (node:test + tsx) covers all framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OAuth consent screen renders | CAL-01 | Requires browser + Google account | Click "Connect Google Calendar", verify Google consent screen appears |
| Token persists across deploys | CAL-02 | Requires Railway deploy cycle | Deploy, authorize, redeploy, verify events still fetch |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
