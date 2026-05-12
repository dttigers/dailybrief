---
phase: 127
slug: pre-spike-guardrails
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-11
revised: 2026-05-11
---

# Phase 127 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (vigil-core) + vitest (vigil-pwa) |
| **Config file** | vigil-core/tsconfig.json (no test framework config; node:test built-in) · vigil-pwa/vitest.config.ts |
| **Quick run command** | `pnpm --filter vigil-core test -- --test-name-pattern '127\|guard'` (or per-file path) |
| **Full suite command** | `pnpm --filter vigil-core test && pnpm --filter vigil-pwa test` |
| **Estimated runtime** | ~30s vigil-core unit + ~20s vigil-pwa = ~50s |

---

## Sampling Rate

- **After every task commit:** Run quick command scoped to the touched test file
- **After every plan wave:** Run full suite for the affected workspace (`vigil-core` and/or `vigil-pwa`)
- **Before `/gsd-verify-work`:** Full suite (both workspaces) must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> The planner is authoritative for the final task IDs and per-task tests. This table seeds the structural expectations the planner must satisfy. Every guard MUST land at least one drift-detector or behavioral assertion that fails CI if a future commit re-introduces the prevented pattern (Nyquist signal-coverage).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 127-01-A | 01 GUARD-01 | 1 | GUARD-01 | T-127-01 (audio PCM exfil via logs) | `BLOCKED_PROPERTY_NAMES` contains all 6 audio keys | unit (literal Set) | `pnpm --filter vigil-core test src/__tests__/audio-log-redaction.test.ts` | ❌ W0 | ⬜ pending |
| 127-01-B | 01 GUARD-01 | 1 | GUARD-01 | T-127-01 | `Sentry.init` registers `beforeSend` (source-string assertion) | unit (source-grep) | same file | ❌ W0 | ⬜ pending |
| 127-01-C | 01 GUARD-01 | 1 | GUARD-01 | T-127-01 | No `console.*` call site references `audio`/`pcm` locals | unit (repo-grep) | same file | ❌ W0 | ⬜ pending |
| 127-01-D | 01 GUARD-01 | 1 | GUARD-01 | T-127-01 | `posthog.test.ts:103` size assertion updated from `=== 8` to new count | unit | `pnpm --filter vigil-core test src/analytics/posthog.test.ts` | ✅ (extend existing) | ⬜ pending |
| 127-01-E | 02 GUARD-01-PWA | 1 | GUARD-01 | T-127-01 | PWA Sentry init registers `beforeSend` + denylist parity HARD-FAIL on cross-workspace read failure (no size-only fallback) + sentry-init.test.ts source-grep on main.tsx + pnpm denylist-parity:ci CI script | unit + CI script | `pnpm --filter vigil-pwa test src/lib/sentry-redact.test.ts src/__tests__/denylist-parity.test.ts src/__tests__/sentry-init.test.ts` + `pnpm --filter vigil-pwa denylist-parity:ci` | ❌ W0 | ⬜ pending |
| 127-02-A | 03 GUARD-02 | 1 | GUARD-02 | T-127-02 (runaway audio session) | `assertAudioSessionWithinCap(b64)` throws at >2.56MB base64 | unit | `pnpm --filter vigil-core test src/lib/audio-cap.test.ts` | ❌ W0 | ⬜ pending |
| 127-02-B | 04 GUARD-02-G2 | 1 | GUARD-02 | T-127-02 | `safeAudioControl(true)` then each of 4 exit events fires `audioControl(false)` — no bare `6`/`7` integer literals anywhere in audio-session-guard.ts (code OR prose) | unit (6 cases + grep) | `pnpm --filter vigil-g2-plugin test src/lib/audio-session-guard.test.ts` | ❌ W0 | ⬜ pending |
| 127-02-C | 03 GUARD-02 | 1 | GUARD-02 | T-127-02 | `ERROR_CODE_MAP` exposes `AUDIO_SESSION_TOO_LONG` with locked copy | unit | `pnpm --filter vigil-pwa test src/lib/api-error-codes.test.ts` | ✅ (extend) | ⬜ pending |
| 127-03-A | 05 GUARD-03 | 2 | GUARD-03 | T-127-03 (AI cost burn) | `ai_usage_daily` migration shape (columns, PK, index) | integration | `pnpm --filter vigil-core test src/db/__tests__/ai-usage-daily.test.ts` | ❌ W0 | ⬜ pending |
| 127-03-B | 05 GUARD-03 | 2 | GUARD-03 | T-127-03 | `requireAiBudget(userId)` throws `DailyBudgetExceededError` at watermark; ALL 7 enumerated test cases pass (no skip allowance — `__computeUsdForTest` + `__readCapUsdForTest` test helpers required as exports) | unit | `pnpm --filter vigil-core test src/lib/ai-budget.test.ts` | ❌ W0 | ⬜ pending |
| 127-03-C | 05 GUARD-03 | 2 | GUARD-03 | T-127-03 | `withBudgetTracking(userId, fn)` accumulates usd_estimate from `usage` field; math verified via `__computeUsdForTest` pure function | unit | same file | ❌ W0 | ⬜ pending |
| 127-03-D | 05.1b GUARD-03 | 3 | GUARD-03 | T-127-03 | `app.onError` returns 429 + code for `DailyBudgetExceededError` BEFORE Sentry sink; spy-based assertion `captureException + captureToSentry` have 0 calls on budget-error path | unit | `pnpm --filter vigil-core test src/__tests__/app-on-error.test.ts` | ❌ W0 | ⬜ pending |
| 127-03-E | 05.1b GUARD-03 | 3 | GUARD-03 | T-127-03 / W-01 | `cross-user-isolation.test.ts` extended with `ai-usage-daily isolation` block + W-01-AI-BUDGET source-grep on ai-budget.ts | unit (grep + integration) | `pnpm --filter vigil-core test src/integration/cross-user-isolation.test.ts` | ✅ (extend) | ⬜ pending |
| 127-03-F | 06 GUARD-03-PWA | 2 | GUARD-03 | T-127-03 | `ERROR_CODE_MAP` exposes `DAILY_AI_BUDGET_EXCEEDED` with locked copy | unit | `pnpm --filter vigil-pwa test src/lib/api-error-codes.test.ts` | ✅ (extend) | ⬜ pending |
| 127-03-G | 05.1a GUARD-03 | 2 | GUARD-03 | T-127-03 (Pitfall 4 closure) | `client.test.ts` drift detector pins `withBudgetTracking(userId,` >= 3 in client.ts AND zero un-wrapped `messages.create` sites across routes/ + ai/ | unit (source-grep) | `pnpm --filter vigil-core test src/ai/client.test.ts` | ❌ W0 | ⬜ pending |
| 127-04-A | 07 GUARD-04 | 2 | GUARD-04 | T-127-04 (schema drift) | `drizzle-kit generate` stdout contains `No schema changes, nothing to migrate 😴` (after Plan 05's migration/schema landed — Wave 2 ordering) | integration (shell) | `pnpm --filter vigil-core test src/__tests__/migration-drift.test.ts` | ❌ W0 | ⬜ pending |
| 127-04-B | 07 GUARD-04 | 2 | GUARD-04 | T-127-04 | `.planning/STATE.md` Phase 107.1 blocker entry resolved | doc check | manual / state-doc test | ✅ (edit) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/__tests__/audio-log-redaction.test.ts` — stubs for GUARD-01
- [ ] `vigil-core/src/lib/audio-cap.test.ts` — stubs for GUARD-02 server cap
- [ ] `vigil-g2-plugin/src/lib/audio-session-guard.test.ts` — stubs for GUARD-02 cleanup wrapper
- [ ] `vigil-core/src/db/__tests__/ai-usage-daily.test.ts` — stubs for GUARD-03 schema/PK
- [ ] `vigil-core/src/lib/ai-budget.test.ts` — stubs for GUARD-03 watermark + accumulator (all 7 cases required, no skip)
- [ ] `vigil-core/src/ai/client.test.ts` — stubs for GUARD-03 Pitfall-4 drift detector (Plan 05.1a)
- [ ] `vigil-core/src/__tests__/app-on-error.test.ts` — stubs for GUARD-03 429 branch (Plan 05.1b, Wave 3)
- [ ] `vigil-core/src/__tests__/migration-drift.test.ts` — stubs for GUARD-04 drift detector
- [ ] `vigil-pwa/src/lib/sentry-redact.test.ts` — stubs for GUARD-01 PWA Sentry parity
- [ ] `vigil-pwa/src/__tests__/sentry-init.test.ts` — stubs for GUARD-01 PWA main.tsx beforeSend source-grep (T-127-01-D mitigation)
- [ ] `vigil-pwa/scripts/denylist-parity-ci.mjs` — sibling CI script for denylist parity (T-127-01-C hardening)

*node:test ships with Node ≥18; no framework install task is required. Vitest is already configured in vigil-pwa.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sentry breadcrumb redaction on a real Sentry event in dev | GUARD-01 | Live Sentry DSN required; CI runs against a stub | 1. Set Sentry DSN in `.env.development`. 2. Trigger an error in `/v1/process-audio` with synthetic `audioPcm` extra. 3. Confirm Sentry dashboard event has no `audioPcm` key in extras or breadcrumbs. |
| G2 hardware cleanup wrapper firing on real device unload | GUARD-02 | Even SDK lifecycle events fire only on physical glasses | 1. Load v3.9 plugin on G2 hardware. 2. Trigger record. 3. Pull glasses off (battery cut → ABNORMAL_EXIT_EVENT). 4. Confirm subsequent reconnect shows mic off (no LED, audioStatus=false). *Owner: Phase 128a operator step; Phase 127 ships the wrapper + unit-test guarantee only.* |
| 429 → friendly PWA copy in the AI cache regenerate flow | GUARD-03 | Requires crossing the $0.50/day watermark with a real user | 1. Set `VIGIL_DAILY_AI_BUDGET_USD=0.01`. 2. Trigger one chat round-trip. 3. Trigger second chat — PWA renders the `DAILY_AI_BUDGET_EXCEEDED` copy. *Owner: post-deploy smoke; Phase 127 unit-tests cover the contract; PWA copy already locked in code.* |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (11 new test files / CI scripts after revision split)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter (revised after blocker + warning fixes landed)

**Approval:** ready — Plan 05.1 split into 05.1a (Wave 2) + 05.1b (Wave 3); Plan 02 hardened (sentry-init.test.ts + denylist-parity:ci script; T-127-01-D mitigation); Plan 04 acceptance criterion tightened (no bare 6/7 in code OR prose); Plan 05 requires all 7 tests via `__computeUsdForTest` + `__readCapUsdForTest` helper exports; Plan 07 moved to Wave 2 with explicit depends_on: [05]
