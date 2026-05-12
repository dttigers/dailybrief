---
phase: 128a
slug: voice-01-pcm-feasibility-spike
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 128a — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Tossable spike; the verdict it produces locks Phase 130 scope. Validation surface = the four Phase 127 guardrail tests + one new smoke test.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `tsx --test` (Node `node:test` + `node:assert/strict`) |
| **Config file** | None — script lines: `vigil-core/package.json:9`, `vigil-g2-plugin/package.json:14` |
| **Quick run command** | `cd vigil-core && npx tsx --test src/routes/__tests__/voice-spike.test.ts` |
| **Full suite command** | `cd vigil-core && npm test && cd ../vigil-g2-plugin && npm test` |
| **Estimated runtime** | ~10–15 seconds (full suite both packages) |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-core && npm test` (regression rail; catches mount-order break + GUARD-01 Rail 3 false-trip)
- **After every plan wave:** Run full suite both packages
- **Before `/gsd-verify-work`:** Full suite green + hardware verdict in `128a-SPIKE-DECISION.md` + signed-off `60s-demo.mp4`
- **Max feedback latency:** ~15 seconds (automated); manual hardware ≤ 2 wallclock hours per battery-delta protocol

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 128a-NN-NN | TBD | 0 | VOICE-01 | — | Wave 0 — create `voice-spike.test.ts` smoke | unit | `cd vigil-core && npx tsx --test src/routes/__tests__/voice-spike.test.ts` | ❌ Wave 0 | ⬜ pending |
| 128a-NN-NN | TBD | 1 | VOICE-01 | T-PCM-LEAK / GUARD-01 | Spike scaffold log strings do NOT contain `pcm`/`audio*` substrings | regression | `cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts` | ✅ exists (3 rails) | ⬜ pending |
| 128a-NN-NN | TBD | 1 | VOICE-01 | T-MIC-RUNAWAY / GUARD-02 | 60s server cap unchanged after spike scaffold lands | regression | `cd vigil-core && npx tsx --test src/lib/__tests__/audio-cap.test.ts` | ✅ exists | ⬜ pending |
| 128a-NN-NN | TBD | 1 | VOICE-01 | T-COST-RUNAWAY / GUARD-03 | `requireAiBudget` chokepoint unchanged after spike scaffold lands | regression | `cd vigil-core && npx tsx --test src/lib/__tests__/ai-budget.test.ts` | ✅ exists | ⬜ pending |
| 128a-NN-NN | TBD | 1 | VOICE-01 | T-CLEANUP-MISS | `safeAudioControl` 4-path cleanup unchanged after spike scaffold lands | regression | `cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/audio-session-guard.test.ts` | ✅ exists (6 cases) | ⬜ pending |
| 128a-NN-NN | TBD | 2 | VOICE-01 | — | `/v1/voice/transcribe` route mounted under bearerAuth + email-verified chain returns 201 + `{id, content}` | unit smoke | `cd vigil-core && npx tsx --test src/routes/__tests__/voice-spike.test.ts` | ❌ Wave 0 | ⬜ pending |
| 128a-NN-NN | TBD | 3 | VOICE-01 | — | `vigil.ehpk` bundle excludes `scripts/voice-spike-*.{ts,html}` per D-A3 | manual-only | operator inspects `npm run pack` output | N/A | ⬜ pending |
| 128a-NN-NN | TBD | 4 | VOICE-01 (hardware) | — | E2E latency ≤ 8s / ≤ 15s / > 15s drives PASS/DEGRADE/BLOCK verdict | manual-only | operator records in MEASUREMENTS.md | N/A — empirical | ⬜ pending |
| 128a-NN-NN | TBD | 4 | VOICE-01 (hardware) | — | Drop-out events ≤ 1 / 2-5 / > 5 per 60s | manual-only | operator records | N/A — empirical | ⬜ pending |
| 128a-NN-NN | TBD | 4 | VOICE-01 (hardware) | — | Battery delta ≤ 15pp / 15-30pp / > 30pp per hour | manual-only | operator records | N/A — empirical | ⬜ pending |
| 128a-NN-NN | TBD | 4 | VOICE-01 (hardware) | T-CLEANUP-MISS | `audioControl(false)` cleanup confirmed fired on 5/5 force-quit cycles | manual-only | operator inspects console + battery delta | N/A — empirical | ⬜ pending |

*Task IDs populated by planner. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/routes/__tests__/voice-spike.test.ts` — minimum smoke: mock `transcribeWav`, assert 201 + `{id, content}`, assert route mounted under bearerAuth chain. ~15-25 LOC. Tossable (deleted alongside `voice-spike.ts` when Phase 130 lands).

*Test framework + all four guardrail regression tests already exist — no installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2E latency measurement (utterance end → HTTP 200) | VOICE-01 (hardware) | Spike is empirical-by-design; sim path is sim-only (Phase 124 D-08) | Operator runs ≥5 short clips, records `mic_on_latency` + `inter_chunk_latency` + `e2e_latency` to MEASUREMENTS.md per D-M1 |
| Drop-out events per 60s | VOICE-01 (hardware) | Requires BLE-walk-out and backgrounding stimulus | Operator runs near-cap 55s clip + reads inter-arrival gap log per D-M2 |
| Battery delta per hour | VOICE-01 (hardware) | 2-wallclock-hour protocol; cannot be simulated | Operator runs D-R1 mode 3 + D-M3 protocol; records via `onDeviceStatusChanged.batteryLevel` |
| `audioControl(false)` cleanup on force-quit | VOICE-01 (hardware) | Requires iPhone swipe-kill stimulus | Operator runs 5× D-M4 cycles; inspects console + battery drain rate |
| Permission-revocation probe | VOICE-01 (hardware) | Requires Even Hub portal UI access | Operator revokes `g2-microphone` in portal, runs `safeAudioControl(true)`, observes error mode |
| `g2-microphone` portal allowlist verification | VOICE-01 (C-2) | Wallclock checkpoint — portal UI only | Operator confirms portal accepts permission before spike packs |
| `OPENAI_API_KEY` Railway env update | VOICE-01 (C-1) | Wallclock checkpoint — `railway variables get` only (no full dump) | Operator sets via Railway Dashboard or `railway variables set` |
| 60s portfolio Loom | VOICE-01 success criterion #3 | Operator records hardware + workflow | Per CONTEXT specifics §"60s Loom demonstration shape" |
| Verdict commit to `128a-SPIKE-DECISION.md` | VOICE-01 success criterion #2 | Operator writes verdict + measured numbers at TOP; not editable after | Operator authors per D-V1 |
| `vigil.ehpk` bundle size check | VOICE-01 (D-A3) | Operator inspects build output | Operator runs `npm run pack` and greps output for `voice-spike-*` patterns |

---

## What Future Changes Could Silently Break the Verdict?

The verdict produced by this spike locks Phase 130 scope. The four checks below ARE the validation surface; they run automatically in `npm test` and the spike inherits them by virtue of importing guarded modules:

1. **`safeAudioControl` cleanup wrapper drops one of the 4 exit hooks** — `audio-session-guard.test.ts` pins all 4 paths + idempotency + no-op-when-inactive (6 cases)
2. **`assertAudioSessionWithinCap` cap drift** — `audio-cap.ts` literal-locks `MAX_PCM_BYTES = 60 * 16_000 * 2`; `audio-cap.test.ts` pins constants
3. **`requireAiBudget` cap regression** — `ai-budget.test.ts` `__readCapUsdForTest` re-export pins the math
4. **GUARD-01 Rail 3 safe-list addition for spike code** — spike author MUST NOT add `voice-spike.ts` to safe-list; write log lines that pass regex without safe-list changes

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (planner enforces)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (one smoke test only)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s for automated suite
- [ ] `nyquist_compliant: true` set in frontmatter (after planner populates task IDs and Wave 0 smoke ships)

**Approval:** pending
