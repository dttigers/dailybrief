---
phase: 124
slug: g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-09
finalized: 2026-05-09
---

# Phase 124 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Sourced from RESEARCH.md §"Validation Architecture" + per-plan acceptance criteria.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **vigil-core framework** | `node:test` + `node:assert/strict` (existing — `agent-events.test.ts:7-8`) |
| **vigil-core config file** | none — `tsx --test` runs `**/*.test.ts` |
| **vigil-core quick run** | `cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts src/routes/__tests__/agent-stream.test.ts src/routes/agent-events.test.ts` |
| **vigil-core full suite** | `cd vigil-core && npx tsx --test "src/**/*.test.ts"` (Avoid `npm test` — STATE.md memo: integration tests hang due to scheduler-loop in index.js; use individual files) |
| **vigil-g2-plugin framework** | `node:test` + `node:assert/strict` via `tsx` (NEW — Plan 01 introduces it; plugin had zero test infra before Phase 124) |
| **vigil-g2-plugin config file** | none — `tsx --test` runs `src/**/*.test.ts` (Plan 01 adds the `npm test` script) |
| **vigil-g2-plugin quick run** | `cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/sse-client.test.ts src/screens/__tests__/companion.test.ts src/screens/__tests__/home.test.ts src/__tests__/navigation.test.ts src/__tests__/main.test.ts` |
| **vigil-g2-plugin full suite** | `cd vigil-g2-plugin && npm test` |
| **TypeScript compile gate** | `cd vigil-core && npx tsc --noEmit` AND `cd vigil-g2-plugin && npx tsc --noEmit` (zero errors involving Phase 124 files) |
| **Phase E2E vehicle** | `vigil-watch test` (Phase 123 Plan 03) — POSTs synthetic event with `_vigil_test_<ts>` sessionId; should propagate via SSE to plugin sim within 2s |
| **Estimated runtime** | ~30-60s for unit suites; ~2-5min for Wave 3 E2E checkpoint |

---

## Sampling Rate

- **After every task commit:** Run quick suite for the affected repo (vigil-core OR vigil-g2-plugin).
- **After every plan wave:** Run full suite (both repos): `cd vigil-core && npx tsx --test "src/**/*.test.ts" && cd ../vigil-g2-plugin && npm test`.
- **Before `/gsd-verify-work`:** Both full suites green + TypeScript compile clean.
- **Phase gate:** Full suites green + manual checkpoints (Plan 04 Task 3 D-14 PNG-equality + Plan 09 Task 2 E2E).
- **Max feedback latency:** ~60s for unit suites.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 124-01-01 | 01 | 0 | (test infra) | T-124-01-01 | tsx devDep added; smoke test runs | smoke | `cd vigil-g2-plugin && npm test` | ❌ W0 | ⬜ pending |
| 124-02-01 | 02 | 0 | AGENT-API-03 | T-124-02-01..04 | Bus class + per-userId isolation invariant | unit | `cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts` | ❌ W0 | ⬜ pending |
| 124-02-02 | 02 | 0 | AGENT-API-03 | T-124-02-01,02 | Cross-user isolation + 100-cycle no-leak | unit | same | ❌ W0 | ⬜ pending |
| 124-03-01 | 03 | 1 | AGENT-API-03 | T-124-03-01..08 | SSE route + bus.emit hook + index.ts mount | unit + drift | `cd vigil-core && npx tsc --noEmit` + acceptance greps | ❌ W0 | ⬜ pending |
| 124-03-02 | 03 | 1 | AGENT-API-03 | T-124-03-01..08 | Replay correctness + Last-Event-ID parse defense + cross-user isolation block 4 + abort cleanup + 24h cutoff | integration | `cd vigil-core && npx tsx --test src/routes/__tests__/agent-stream.test.ts src/routes/agent-events.test.ts src/integration/cross-user-isolation.test.ts` | ❌ W0 | ⬜ pending |
| 124-04-01 | 04 | 1 | G2-POLISH-07 | T-124-04-01,04 | 4-line body, drop affirmation param, drop DIVIDER | drift | `cd vigil-g2-plugin && npx tsx --test src/screens/__tests__/home.test.ts` | ❌ W0 | ⬜ pending |
| 124-04-02 | 04 | 1 | G2-POLISH-07 | T-124-04-01 | 4-entry array invariant + signature drift | drift | same | ❌ W0 | ⬜ pending |
| 124-04-03 | 04 | 1 | G2-POLISH-07 | T-124-04-03 | Byte-identical PNG capture (operator) | manual | `cmp home-1.png home-2.png` | n/a | ⬜ pending |
| 124-05-01 | 05 | 1 | AGENT-HUD-02 | T-124-05-01,02 | ROADMAP SC #2 narrowed to D-08 reality | doc | `grep -F "double-tap is context-sensitive" .planning/ROADMAP.md` | ❌ W0 | ⬜ pending |
| 124-05-02 | 05 | 1 | AGENT-HUD-02 | T-124-05-01 | SEED-011 lands with re-activation triggers | doc | `test -f .planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` | ❌ W0 | ⬜ pending |
| 124-06-01 | 06 | 2 | AGENT-API-03 | T-124-06-01,02,05 | SSE shim — bearer in Authorization header only; ReadableStream parser; AbortController disconnect | unit | `cd vigil-g2-plugin && npx tsc --noEmit` + grep gates | ❌ W0 | ⬜ pending |
| 124-06-02 | 06 | 2 | AGENT-API-03 | T-124-06-01..06 | parseFrame + backoff schedule + Last-Event-ID persistence + QuotaExceededError survival + state callbacks | unit | `cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/sse-client.test.ts` | ❌ W0 | ⬜ pending |
| 124-07-01 | 07 | 3 | AGENT-HUD-01 | T-124-07-01,02 | constants COMPANION_HEADER/BODY/FOOTER + Screen.COMPANION + carousel slot 1 + DOUBLE_CLICK Companion branch + fetchAgentSessions | structural | `cd vigil-g2-plugin && npx tsc --noEmit` + grep gates | ❌ W0 | ⬜ pending |
| 124-07-02 | 07 | 3 | AGENT-HUD-01 | T-124-07-03,04 | Companion screen body composition + banner state machine (5 events) + empty state + N/M + offline indicator + cycling + ackBanner | unit (table-driven) | `cd vigil-g2-plugin && npx tsx --test src/screens/__tests__/companion.test.ts` | ❌ W0 | ⬜ pending |
| 124-07-03 | 07 | 3 | AGENT-HUD-02 | T-124-07-01 | navigation.ts drift — no LONG_PRESS_EVENT; SCREEN_ORDER lock; DOUBLE_CLICK Companion branch references hasActiveBanner / cycleSession / getActiveSessions | drift | `cd vigil-g2-plugin && npx tsx --test src/__tests__/navigation.test.ts` | ❌ W0 | ⬜ pending |
| 124-08-01 | 08 | 4 | G2-POLISH-06 | T-124-08-01,02,05 | main.ts module-scope onLaunchSource + 500ms timeout + SSE wiring + ordering | structural | `cd vigil-g2-plugin && npx tsc --noEmit` + grep gates | ❌ W0 | ⬜ pending |
| 124-08-02 | 08 | 4 | G2-POLISH-06 | T-124-08-04 | Drift detector + hasActiveSession unit tests (D-06 5-min + non-terminal filter) | unit + drift | `cd vigil-g2-plugin && npx tsx --test src/__tests__/main.test.ts` | ❌ W0 | ⬜ pending |
| 124-09-01 | 09 | 5 | (all 5 REQ-IDs) | T-124-09-01..04 | 124-VERIFICATION.md skeleton with 6 sections + sign-off | doc | `grep -c "AGENT-API-03\\|AGENT-HUD-01\\|AGENT-HUD-02\\|G2-POLISH-06\\|G2-POLISH-07" 124-VERIFICATION.md` | ❌ W0 | ⬜ pending |
| 124-09-02 | 09 | 5 | (all 5 REQ-IDs) | T-124-09-01..04 | Operator E2E verification — vigil-watch → vigil-core → SSE → plugin sim within 2s; cross-user isolation live; reconnect storm; D-14 PNG re-confirm | manual (operator-checkpoint) | runs from 124-VERIFICATION.md sections 1-7 | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 (test infra prep — runs before any feature work):

- [ ] `vigil-g2-plugin/package.json` — add `tsx` devDep + `npm test` script (Plan 01)
- [ ] `vigil-g2-plugin/src/__tests__/smoke.test.ts` — first passing test scaffold (Plan 01)
- [ ] `vigil-g2-plugin/src/lib/__tests__/.gitkeep` — sse-client tests directory (Plan 01)
- [ ] `vigil-g2-plugin/src/screens/__tests__/.gitkeep` — companion + home tests directory (Plan 01)
- [ ] `vigil-core/src/lib/agent-events-bus.ts` — module under test (Plan 02)
- [ ] `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` — bus unit tests (Plan 02)

Wave 1 produces additional test files but they are not "Wave 0 prep" — they are part of the feature commits.

Wave 0 must be GREEN before Wave 1 starts. Set `wave_0_complete: true` in this file's frontmatter once Plan 01 + Plan 02 land green.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Byte-identical PNG capture (D-14) | G2-POLISH-07 | Sim PNG output is operator-driven via `evenhub-simulator` desktop tool — not scriptable from a test runner; requires GUI capture | Plan 04 Task 3 — see VERIFICATION.md "G2-POLISH-07" section |
| Live SSE pipeline E2E | AGENT-API-03 | Requires three concurrent processes (vigil-core, vigil-watch, plugin sim) + observable HUD; no headless equivalent | Plan 09 Task 2 — see VERIFICATION.md "AGENT-API-03 single-user end-to-end smoke" |
| Cross-user isolation under live network | AGENT-API-03 | Requires generating a second bearer key + two sims observing isolation in real conditions; structural unit test (block 4) is the static gate, but live test confirms middleware/CORS doesn't undo it | Plan 09 Task 2 — see VERIFICATION.md "Cross-user isolation (live)" |
| Reconnect storm (no listener leak) | AGENT-API-03 | Stop/start cycle requires real network drop simulation; unit test (Plan 02 100-cycle test) is structural gate, live test confirms under network conditions | Plan 09 Task 2 — see VERIFICATION.md "Reconnect storm test" |
| Real G2 hardware retest | G2-POLISH-06, G2-POLISH-07, AGENT-HUD-01, AGENT-HUD-02 | Requires physical glasses on hand | Deferred-item — operator runs when next on hand; sim-level verification is the structural gate |
| glassesMenu vs appMenu launch source | G2-POLISH-06 | Requires real Even Hub iOS app launch path (or sim launch-source toggle) | Plan 09 Task 2 — see VERIFICATION.md "G2-POLISH-06" |
| DOUBLE_CLICK context-sensitive on Companion | AGENT-HUD-02 | Requires plugin sim with banner state, multi-session state, and HOME fallback — observable via UI | Plan 09 Task 2 — see VERIFICATION.md "AGENT-HUD-02" |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (per-task verification map filled)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every code-producing task has an automated grep / tsc / tsx --test command)
- [x] Wave 0 covers all MISSING references (Plans 01 + 02 = test infra + bus module)
- [x] No watch-mode flags (no `--watch`, no `tsc --watch` — all gates run-once)
- [x] Feedback latency < 60s (per-suite tsx test runs in ~30-60s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-09
