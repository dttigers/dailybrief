# Phase 128a — VOICE-01 SPIKE DECISION: PASS

**Verdict:** PASS · **Authored:** 2026-05-18 · **Loom:** _pending — operator to commit `60s-demo.mp4` to this phase directory OR paste Loom URL into this field per UI-SPEC §"60s Loom demonstration shape" (C-5)_

> **D-V1 NOTICE:** Per CONTEXT D-V1, this verdict is **not editable** after commit. If a subsequent re-test contradicts this verdict, the spike author opens a Phase 128a.1 with updated protocol — no in-place edit. The verdict is a mechanical function of the measurements in `128a-MEASUREMENTS.md` "Verdict inputs (mechanical)" block; the threshold trace at the bottom of this file proves the derivation.

---

## Verdict Evidence

All four PASS conditions met. ALL six verdict inputs in PASS bucket; zero BLOCK triggers active; zero DEGRADE buckets hit.

| Input | Measured | Threshold | Bucket | Source |
|-------|----------|-----------|--------|--------|
| `e2e_latency` median (stop→HTTP 200) | **1,880 ms** | PASS ≤ 8,000 ms | **PASS** | MEASUREMENTS Run 1 (9-trial median of corrected `stop→HTTP_ms` per D-M1/DRIFT-02) |
| Drop-outs per 60 s | **0** | PASS ≤ 1 / 60 s | **PASS** | MEASUREMENTS Run 2 (568-chunk near-cap 56.8 s recording streamed cleanly; 0 application-layer drops) |
| Battery delta (incremental cost) | **5 pp/hr** | PASS ≤ 15 pp/hr | **PASS** | MEASUREMENTS Run 5 (Half A 100→93 = 7 pp; Half B 100→88 = 12 pp; Δ = 5 pp/hr) |
| Cleanup pass count | **5 / 5** + permission-revocation probe documented | PASS = 5/5 AND probe doc'd | **PASS** | MEASUREMENTS Runs 3 + 4 (5 force-quit cycles, all idle-rate drain post-kill; probe documented via code-path analysis of `safeAudioControl` + `toggleVoiceSpikeRecording` per D-G3) |
| PCM intelligible after WAV reconstruction (PASS GATE 1) | **YES** | NO → BLOCK regardless of other metrics | PASS (no BLOCK trigger) | MEASUREMENTS Run 1 (9/9 transcripts appeared in PWA with intelligible text — operator-confirmed) |
| Permission rejected at portal (C-2) | **NO** — allowlist cleared 2026-05-12 | YES → BLOCK regardless of other metrics | PASS (no BLOCK trigger) | Plan 05 SUMMARY `c2_resolved` (v0.3.7 sideload triggered OS mic-grant prompt on hardware — empirical proof BLOCK signal did not fire) |

Headline numbers driving the verdict: **e2e median 1.88 s**, **0 drops/60s**, **5 pp/hr battery cost**, **5/5 cleanup**. Each is well inside its PASS bucket (≤24%, 0%, ≤33%, 100% of the threshold respectively). The push-to-record short-clip path is mechanically supported by Phase 127's `requireAiBudget` + `assertAudioSessionWithinCap` guardrails without modification.

---

## Phase 130 Scope-Lock Implication

**Phase 130 ships the full VOICE-02..08 spec** (push-to-record short clips with `DOUBLE_CLICK` gesture per Phase 127.5 REACTIVATE verdict; on track for Phase 133 plumbing patch).

Concretely, Phase 130 plans MUST land all of:

- **VOICE-02** — production `voice` screen module (replaces the tossable `voice-spike.ts` screen with a hardened state machine — `[NO MIC]` UI surface for permission denial per Run 4 hardening Section 5 below).
- **VOICE-03** — production `/v1/voice/transcribe` route (hardens the spike route with `safeAudioControl` return-value capture, full denial-path UI, structured error taxonomy).
- **VOICE-04** — production transcription helper (`ai/transcribe.ts`) supersedes the spike's `transcribe-spike.ts`.
- **VOICE-05** — Companion HUD push-to-record gesture wired through the existing carousel + event router (production-grade replacement for `voice-spike-encoder.ts`).
- **VOICE-06** — 8 s end-to-end acceptance: SSE fan-out from `/v1/voice/transcribe` → existing `AgentEventBus` → PWA dashboard (see DRIFT-02 section below — the dashboard-poll gap MUST be closed by SSE or in-tab event for VOICE-06 to be achievable).
- **VOICE-07** — production thought storage (replace the spike's transient flow with the canonical capture path).
- **VOICE-08** — operator-facing telemetry surface (per-recording timing + drop-out counters in the standard ops dashboard).

No DEGRADE-bucket scope-narrowing applies. No BLOCK-bucket termination or re-activation conditions apply. Phase 130 plans should treat the spike's tossable code as a clean reference for the production hardening — not as code to keep.

---

## RESEARCH DRIFT-02 — Latency Measurement Note

E2E latency in this spike is measured from utterance-end (`DOUBLE_CLICK` stop event) → HTTP 200 of `/v1/voice/transcribe`, **NOT** to PWA dashboard render. The PWA dashboard polls every 30 s (`vigil-pwa/src/hooks/useThoughts.ts:81-87`), so the dashboard-visibility floor is `transcribe_ms + insert_ms + 15 s average` — unreachable for the 8 s VOICE-06 target via polling.

**Phase 130 task requirement (VOICE-06 acceptance):** Phase 130 MUST wire SSE fan-out from `/v1/voice/transcribe` → existing `AgentEventBus` → PWA dashboard, **OR** an in-tab `vigil:thought-created` window event from the G2-origin path. Without one of these two paths, VOICE-06's 8 s acceptance criterion cannot be measured against dashboard render and will silently fail QA. The spike's 1,880 ms `stop→HTTP_ms` median is the *backend-side* floor; the dashboard-visibility floor is what the user perceives. Phase 130 closes the gap by routing the transcribe event directly to the renderer.

Reference for the SSE wiring pattern: `vigil-core/src/server/agent-event-bus.ts` (Phase 119) already publishes structured events on a typed channel; the missing piece is a route-side `bus.publish('thought-created', …)` call inside `voice-transcribe.ts` and a PWA-side SSE subscriber that mutates the local `useThoughts` cache without waiting for the next 30 s poll. The in-tab window-event alternative is cheaper (no SSE infra) but only works when the recording originates from the same browser tab — the G2-origin path is cross-device, so SSE is the canonical fix.

---

## Tossable Code Cleanup Note (Phase 130)

Grep anchor for finding spike artifacts: `PHASE 128a SPIKE` is the leading-comment marker on every tossable file in this spike.

**Five files to DELETE outright (all spike-only TS):**

```
vigil-g2-plugin/scripts/voice-spike-encoder.ts
vigil-g2-plugin/src/screens/voice-spike.ts
vigil-core/src/routes/voice-spike.ts
vigil-core/src/ai/transcribe-spike.ts
vigil-core/src/routes/__tests__/voice-spike.test.ts
```

**Five modifications to REVERT (remove the spike-only entries; keep prior Phase 127/127.5 baseline):**

```
vigil-g2-plugin/src/navigation.ts          — remove VOICE_SPIKE carousel entry + DOUBLE_CLICK route
vigil-g2-plugin/src/main.ts                — remove voice-spike screen registration
vigil-g2-plugin/src/constants.ts           — remove VOICE_SPIKE_SCREEN_ID / VOICE_SPIKE_PATH constants
vigil-g2-plugin/app.json                   — KEEP `g2-microphone` permission entry (Phase 130 needs it); REMOVE only spike-only descriptor strings if any
vigil-core/src/index.ts                    — remove `/v1/voice/transcribe` spike-route mount; Phase 130 re-mounts the production VOICE-03 route at the same path
```

**Carry forward (NOT tossable — Phase 127 guardrails the spike inherited without modification):**

- `vigil-g2-plugin/src/lib/audio-session-guard.ts` — Phase 127 GUARD-02 cleanup hooks (1-4); Phase 130 hardens hook signature per Run 4 Section 5 below.
- `vigil-core/src/middleware/require-ai-budget.ts` — Phase 127 budget guard.
- `vigil-core/src/middleware/assert-audio-session-within-cap.ts` — Phase 127 60 s cap enforcement.

**`app.json` `g2-microphone` permission:** explicitly preserved. Removing it would re-trigger the C-2 portal approval pipeline, blocking Phase 130's first hardware run unnecessarily.

---

## Run 4 Hardening (REQUIRED for Phase 130 — derived from spike code-path analysis)

The spike's `safeAudioControl(true, bridge)` discards the SDK return value and has no try/catch, so a permission-denied call silently produces a `[REC]` state with empty PCM (eventually 422'd by the backend). Phase 130's VOICE-02 + VOICE-03 plans MUST land these five changes (full path analysis in `128a-MEASUREMENTS.md` Run 4):

1. Change `safeAudioControl` signature from `Promise<void>` → `Promise<boolean>` so callers can observe denial.
2. Capture return value in `toggleVoiceRecording`: if `false`, flip `recording` back, set `stateLine = '[NO MIC]'`, short-circuit before the recording loop.
3. Wrap the safeAudioControl call in `try/catch` so a throw can't leave the state machine inconsistent.
4. Wire `[NO MIC]` state in the body builder (currently W1-deferred in the spike).
5. Distinguish `[NO MIC]` (permission missing — fix in Hub settings) vs `[ERR]` (something else broke — retry) in UI-SPEC.

---

## Author Signature

**Author:** Jameson Morrill
**Date:** 2026-05-18
**Verdict committed at:** (this commit — `docs(128a-06): author SPIKE-DECISION.md (PASS)`)

> Per CONTEXT **D-V1**: this verdict is **NOT editable** after commit. Contradictory re-tests require Phase 128a.1 with updated protocol — no in-place edit of this file.

---

## Threshold Trace

Re-states each threshold + the measured number + the mechanical bucket assignment. Proves the verdict is a function of the measurements, not a subjective interpretation. Format mirrors `128a-MEASUREMENTS.md` "Verdict inputs (mechanical)" block.

```
e2e_latency median: 1880 ms  → bucket: PASS  (PASS ≤ 8000  · DEGRADE 8001-15000 · BLOCK > 15000)
drop-outs per 60s:  0         → bucket: PASS  (PASS ≤ 1     · DEGRADE 2-5         · BLOCK > 5)
battery delta:      5 pp/hr   → bucket: PASS  (PASS ≤ 15    · DEGRADE 15-30       · BLOCK > 30)
cleanup pass count: 5/5       → bucket: PASS  (PASS = 5/5 + probe doc'd · DEGRADE 3-4/5 · BLOCK ≤ 2/5)
PCM intelligible (PASS GATE 1): YES        → no BLOCK trigger
Permission rejected at portal (C-2): NO    → no BLOCK trigger

GATE LOGIC (mechanical):
  STEP 1 BLOCK gate (any single condition triggers BLOCK):
    1880 > 15000  ? NO
    0    > 5      ? NO
    5    > 30     ? NO
    5/5  ≤ 2/5    ? NO
    permission rejected? NO
    PCM not intelligible? NO
    → BLOCK NOT TRIGGERED

  STEP 2 PASS gate (ALL four conditions required):
    1880 ≤ 8000   ? YES
    0    ≤ 1      ? YES
    5    ≤ 15     ? YES
    cleanup = 5/5 AND probe doc'd ? YES
    → PASS

  STEP 3 (skip — PASS satisfied)

VERDICT = PASS
```

A third party re-reading this file and `128a-MEASUREMENTS.md` "Verdict inputs (mechanical)" block must mechanically arrive at the same PASS verdict. If they do not, the protocol — not the verdict — needs updating, per D-V1.
