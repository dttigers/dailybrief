---
phase: 130
slug: voice-capture-full-implementation-scope-locked-by-128a
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 130 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `130-RESEARCH.md` §"Validation Architecture" + CONTEXT.md drift detectors (D-D1, D-D2, D-D3).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `assert` via `tsx --test` |
| **Config file** | none — each package uses `npm test` |
| **Quick run command** | `cd vigil-core && npm test` (or per-package depending on changed files) |
| **Full suite command** | `cd vigil-core && npm test && cd ../vigil-g2-plugin && npm test && cd ../vigil-pwa && npm test` |
| **Estimated runtime** | ~60 seconds (full); ~15 seconds (per-package) |

---

## Sampling Rate

- **After every task commit:** Run the package-scoped `npm test` for whichever package was touched (e.g., a route change runs `cd vigil-core && npm test`).
- **After every plan wave:** Run the full suite command.
- **Before `/gsd:verify-work`:** Full suite must be green AND drift-detector tests (D-D1, D-D2, D-D3) must pass.
- **Max feedback latency:** ~60 seconds (full suite); ~15 seconds (per-package).

---

## Per-Task Verification Map

> Filled in per plan during execution. Each plan's tasks reference back to this map.
> Reference plans: 130-01 (cleanup), 130-02 (route+migration), 130-03 (SSE+PWA), 130-04 (G2 voice screen), 130-05 (queue+telemetry), 130-06 (drift detectors), 130-07 (pack+hardware UAT).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 130-01-* | 01 | 1 | (cleanup, no REQ) | — | files removed; spike route un-mounted | unit | `cd vigil-core && npm test` (verifies app still builds) | ✅ existing | ⬜ pending |
| 130-02-* | 02 | 2 | VOICE-05 | T-130-02 (audio cap, AI budget, dedup) | bearerAuth + email-verified + dedup + cap | unit | `cd vigil-core && npm test -- --test-name-pattern="voice-transcribe"` | ❌ Wave 0 | ⬜ pending |
| 130-03-* | 03 | 3 | VOICE-06 | — | SSE fan-out reaches PWA cross-device | unit | `cd vigil-core && npm test -- --test-name-pattern="thought-created"` | ❌ Wave 0 | ⬜ pending |
| 130-04-* | 04 | 3 | VOICE-02, VOICE-03, VOICE-04 | T-130-04 (no orphan audioControl) | safeAudioControl `Promise<boolean>`; cross-screen state; WAV header | unit | `cd vigil-g2-plugin && npm test -- --test-name-pattern="voice"` | ❌ Wave 0 | ⬜ pending |
| 130-05-* | 05 | 4 | VOICE-07, VOICE-08 (T1, T2) | — | offline queue backoff; LRU eviction; PostHog event keys | unit | `cd vigil-g2-plugin && npm test -- --test-name-pattern="voice-queue"` | ❌ Wave 0 | ⬜ pending |
| 130-06-* | 06 | 4 | VOICE-08 | T-130-06 (drift) | D-D1/D-D2/D-D3 pin | drift-detector | (see D7 table below) | ✅ partial / ❌ Wave 0 | ⬜ pending |
| 130-07-* | 07 | 5 | (UAT — all VOICE-02..08) | — | hardware wallclock + portfolio screenshots | manual | operator runs G2-tethered round-trip | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## D5 Latency Invariant (VOICE-06: ≤ 8s end-to-end)

The 8s criterion is measured from `DOUBLE_CLICK (stop)` → PWA dashboard row visible (cross-device).

- **Unit proxy:** assert `bus.emitThoughtCreated` is called within the route handler after DB insert returns. Spike measured `stop→HTTP_ms` median 1.88s; SSE propagation ~50ms; React render ~16ms → ~2s ceiling for the automated path.
- **Integration test (Plan 03):** mock OpenAI client; real SSE connection; assert PWA `useThoughts` refetch fires within 500ms of mock transcribe completion. Proves the SSE path is wired end-to-end.
- **Hardware UAT (Plan 07):** operator wallclock-measures stop→dashboard-row-visible on G2-tethered iPhone + dev laptop. Closes the criterion.

---

## D6 Cost Invariant

`withBudgetTracking(userId, fn)` wraps the OpenAI call. Phase 130 adds an OpenAI-cost-accumulator adapter (RESEARCH A2) because the existing helper reads Anthropic `response.usage` token counts and OpenAI transcription returns no `usage` field. Extend `ai-budget.test.ts` to cover the OpenAI path. Daily cap: $0.50/user/day (Phase 127 GUARD-03).

---

## D7 Drift Detectors

| Detector | Test Location | Command |
|----------|---------------|---------|
| **D-D1** WAV header (44-byte structure: RIFF / WAVE / fmt / 16kHz / mono / 16-bit / data) | `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` | `cd vigil-g2-plugin && npm test -- --test-name-pattern="wav-encoder"` |
| **D-D2** No `audioPcm` / `audio_pcm` / `pcm` keys in `console.log` / `Sentry.captureException` / `posthog.capture` | `vigil-core/src/__tests__/audio-log-redaction.test.ts` (extend) + `vigil-pwa/src/__tests__/denylist-parity.test.ts` (extend) | `cd vigil-core && npm test -- --test-name-pattern="audio-log-redaction"` |
| **D-D3** `safeAudioControl(true, …)` count == `safeAudioControl(false, …)` count across `vigil-g2-plugin/src/` (excluding test files) | `vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts` | `cd vigil-g2-plugin && npm test -- --test-name-pattern="audiocontrol-pairing"` |

---

## D8 Round-Trip Acceptance Test

`vigil-core/src/routes/__tests__/voice-transcribe-sse.test.ts` (Plan 03 Wave 0):

- Mock OpenAI client returns `{ text: "hello world" }`.
- Bear auth + verified-email fixture user.
- POST `/v1/voice/transcribe` with a 1s 16kHz mono WAV.
- Assert: 201 response with `{ thoughtId, content: "hello world" }`.
- Assert: SSE client subscribed to `/v1/agent-stream` receives a `thought-created` event with `{ userId, thoughtId, content }` within 500ms.
- Assert: row exists in `thoughts` with `source = 'g2_voice'` and `voice_captures` has the dedup row.

---

## Wave 0 Requirements

Tests that must be authored or extended BEFORE the corresponding plan's production code lands:

### vigil-core
- [ ] `vigil-core/src/routes/__tests__/voice-transcribe.test.ts` — VOICE-05 happy + dedup + error taxonomy (Plan 02)
- [ ] `vigil-core/src/routes/__tests__/voice-transcribe-sse.test.ts` — D8 round-trip (Plan 03)
- [ ] `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` (extend) — `thought-created` channel + listener leak guard (Plan 03)
- [ ] `vigil-core/src/__tests__/audio-log-redaction.test.ts` (extend) — D-D2 covers `voice-transcribe.ts` + plugin scope (Plan 06)
- [ ] `vigil-core/src/lib/__tests__/ai-budget.test.ts` (extend) — OpenAI cost adapter path (Plan 02)

### vigil-g2-plugin
- [ ] `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` — VOICE-04 + D-D1 (Plan 04 + Plan 06)
- [ ] `vigil-g2-plugin/src/screens/__tests__/voice.test.ts` — VOICE-02/03 state machine + cross-screen survival (Plan 04)
- [ ] `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` (extend) — `Promise<boolean>` return + `[NO MIC]` surface (Plan 04)
- [ ] `vigil-g2-plugin/src/lib/__tests__/voice-queue.test.ts` — VOICE-07 backoff + LRU + persistence (Plan 05)
- [ ] `vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts` — D-D3 (Plan 06)

### vigil-pwa
- [ ] `vigil-pwa/src/__tests__/denylist-parity.test.ts` (extend) — D-D2 PWA-side (Plan 06)
- [ ] `vigil-pwa/src/lib/__tests__/api-error-codes.test.ts` (extend) — three VOICE_TRANSCRIBE_* locked-enum entries (Plan 03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hardware wallclock round-trip ≤ 8s | VOICE-06 | Cross-device (G2 + iPhone tether + dev laptop browser); not reproducible in CI | Plan 07: operator double-clicks G2, speaks ≤3s, releases. Stopwatch from release to dashboard row visible in `vigil-pwa` browser. Pass if ≤8s. Capture screenshot of dashboard row + console-log timing. |
| Recording indicator survives carousel swipe | VOICE-03 | Visual / kinetic test; unit test covers state survival but not pixel rendering | Plan 07: operator starts recording, swipes to Companion, swipes to next screen, swipes back. Indicator visible throughout. |
| `[NO MIC]` surfaces when Even Hub permission revoked | VOICE-02 (Run 4 §5) | Requires manual revocation in Even Hub portal | Plan 07: operator revokes `g2-microphone` in Even Hub, double-clicks G2 Voice screen, observes `[NO MIC] enable mic in Hub` body line. |
| Offline queue drains when network returns | VOICE-07 | Requires airplane-mode toggle on iPhone | Plan 07: operator enables airplane mode, makes 2 recordings (queue depth=2 visible on HUD), disables airplane mode, observes queue drains to 0. |
| Portfolio demo screenshots | (operator close-out) | Loom waived per `[feedback_loom_waived_g2_not_screen_mirrorable]` memory | Plan 07: capture console-log timing screenshot + PWA dashboard render screenshot. No 60s Loom required. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (13 test files to author/extend)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (full suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
