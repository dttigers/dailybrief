---
phase: 73
slug: sports-proxy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert` (built-in) |
| **Config file** | none — runs via `tsx --test "src/**/*.test.ts"` |
| **Quick run command** | `cd vigil-core && npm test -- --test-name-pattern "SPORT"` |
| **Full suite command** | `cd vigil-core && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-core && npm test -- --test-name-pattern "SPORT"`
- **After every plan wave:** Run `cd vigil-core && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 73-01-01 | 01 | 0 | — | — | N/A | setup | `npm test` | ❌ W0 | ⬜ pending |
| 73-01-02 | 01 | 1 | SPORT-01 | T-73-01 | API key not leaked in logs | unit | `npm test -- --test-name-pattern "SPORT-01"` | ❌ W0 | ⬜ pending |
| 73-01-03 | 01 | 1 | SPORT-02 | T-73-01 | API key not leaked in logs | unit | `npm test -- --test-name-pattern "SPORT-02"` | ❌ W0 | ⬜ pending |
| 73-01-04 | 01 | 1 | SPORT-03 | T-73-01 | API key not leaked in logs | unit | `npm test -- --test-name-pattern "SPORT-03"` | ❌ W0 | ⬜ pending |
| 73-01-05 | 01 | 1 | SPORT-04 | T-73-01 | API key not leaked in logs | unit | `npm test -- --test-name-pattern "SPORT-04"` | ❌ W0 | ⬜ pending |
| 73-01-06 | 01 | 2 | SPORT-05 | — | N/A | unit | `npm test -- --test-name-pattern "SPORT-05"` | ❌ W0 | ⬜ pending |
| 73-01-07 | 01 | 2 | SPORT-06 | — | N/A | unit | `npm test -- --test-name-pattern "SPORT-06"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/services/sports-service.test.ts` — stubs for SPORT-01 through SPORT-06
- [ ] `vigil-core/src/services/sports-service.ts` — must export `createSportsService` factory with injectable `fetchFn`

*Existing `node:test` infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Endpoint reachable on Railway | SPORT-04 SC-4 | Requires live deployment + network access | `curl -H "Authorization: Bearer $TOKEN" https://api.vigilhub.io/v1/sports` returns 200 |
| Team IDs resolve to correct teams | — | BDL team IDs must be verified against API | `GET /teams` on each league API, verify team name matches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
