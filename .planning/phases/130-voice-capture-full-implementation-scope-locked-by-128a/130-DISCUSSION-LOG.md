# Phase 130: Voice capture full implementation (scope-locked by 128a) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 130-voice-capture-full-implementation-scope-locked-by-128a
**Mode:** `--auto` (no interactive questions; user authorized "work without stopping for clarifying questions"; recommended defaults grounded in Phase 128a SPIKE-DECISION PASS + Phase 127.5 REACTIVATE + Phase 127 guardrails)
**Areas discussed (auto-resolved):** Gesture grammar, Voice screen state machine + Run 4 hardening, Upload + transcription path, SSE fan-out for ≤ 8 s round-trip, Offline queue, Error taxonomy, Telemetry surface, Drift detectors, Spike-code cleanup ordering

---

## Gesture grammar (D-G1, D-G2)

| Option | Description | Selected |
|--------|-------------|----------|
| DOUBLE_CLICK toggle on dedicated Voice screen | Hardware-verified gesture (2026-05-10 memory); spike proved the path; Phase 127.5 patch deferred to Phase 133 | ✓ |
| Single-press toggle (REACTIVATE patch landed in Phase 130) | Would require the ≤10-line `?? 0` patch + `handleNavEvent` CLICK_EVENT branch; 127.5 audit explicitly says "deferred to Phase 133 implementer" | |
| DOUBLE_CLICK on Companion HUD overlay (no dedicated screen) | Would conflict with future G2-REPLY-02/03 DOUBLE_CLICK contract on Companion | |

**Auto-decision:** DOUBLE_CLICK toggle on dedicated Voice screen.
**Notes:** 127.5 audit recommends Phase 133 owns the single-press plumbing + UX semantics together (avoids the "plumbing without UX" failure mode). Phase 130's gesture path is the same one the 128a spike validated on hardware.

---

## Voice screen state machine + Run 4 hardening (D-S1, D-S2, D-S3)

| Option | Description | Selected |
|--------|-------------|----------|
| Five-state machine: IDLE / REC / UPLOADING / DONE / [NO MIC] vs [ERR] | Run 4 §5 explicitly distinguishes permission-missing vs unknown-error states | ✓ |
| Four-state machine: IDLE / REC / UPLOADING / ERR (no [NO MIC] distinction) | Simpler, but Run 4 §5 says distinct copy is REQUIRED so operator knows which corrective action applies | |
| Three-state machine: IDLE / REC / UPLOADING (silent failure on error) | Regresses on Run 4 hardening | |

**Auto-decision:** Five-state machine with [NO MIC] / [ERR] split.
**Notes:** `safeAudioControl` signature change to `Promise<boolean>` (Run 4 §1) is the load-bearing change; without it, callers can't observe permission denial. Cross-screen state survival (D-S3) keeps recording-state in the `main.ts` collector scope, not in the Voice screen closure.

---

## Upload + transcription path (D-U1, D-U2, D-U3, D-U4)

| Option | Description | Selected |
|--------|-------------|----------|
| DELETE spike + ADD fresh production route at same path | SPIKE-DECISION says "treat the spike's tossable code as a clean reference … not as code to keep"; auditable atomic cleanup commit | ✓ |
| In-place rename `voice-spike.ts` → `voice-transcribe.ts` | Easier diff but couples cleanup with production code; pollutes Phase 130 first commit; SPIKE-DECISION explicitly rejects | |
| Mount production route at `/v1/voice/transcribe-v2` and leave spike route in place | Would leave dead code in production; SPIKE-DECISION says delete | |

**Auto-decision:** DELETE spike, then ADD fresh production route.
**Notes:** OpenAI `gpt-4o-mini-transcribe` provider lock from 128a D-W3 stays. JSON-base64 body shape (not multipart) per VOICE-04 verbatim. `clientCaptureId` UUID v4 for dedup mirrors SCAP-04 / SVCNOW-04 composite-unique pattern (new migration expected `0023_voice_capture_dedup.sql`).

---

## Round-trip ≤ 8 s — SSE fan-out (D-X1, D-X2)

| Option | Description | Selected |
|--------|-------------|----------|
| SSE fan-out via existing `/v1/agent-stream` (multiplexed) | Reuses Phase 119 infra; single converged subscriber per dashboard | ✓ |
| New `/v1/thought-stream` dedicated SSE endpoint | Slightly cleaner channel separation but doubles SSE infra | |
| In-tab `vigil:thought-created` window event only | Per DRIFT-02: insufficient for cross-device G2-origin path (dashboard machine ≠ recording machine) | |
| Reduce PWA dashboard poll interval from 30 s → 2 s | Burns bandwidth + DB load on every active operator; SSE is the architecturally correct path | |

**Auto-decision:** Multiplex SSE via existing `/v1/agent-stream` (default; researcher can flip to dedicated stream).
**Notes:** Server-side `bus.publish('thought-created', payload)` fires immediately after `db.insert` returns. PWA subscriber dispatches the existing `vigil:thought-created` window event so `useThoughts.ts:127` refetch path is unchanged. In-tab dispatchers (`usePhotoUpload.ts:182`, `AudioUploadSection.tsx:54`) stay — single refetch trigger for both paths.

---

## Offline queue (D-O1, D-O2, D-O3, D-O4)

| Option | Description | Selected |
|--------|-------------|----------|
| `[1s, 2s, 4s, 8s, 16s, 30s]` backoff + localStorage persistence + LRU eviction + 10-entry cap | Verbatim VOICE-07 backoff (Phase 124 D-11 precedent); persistence survives swipe-kill | ✓ |
| In-memory queue (lost on process death) | Fails VOICE-07's "max 10 queued utterances" implicit persistence — a force-quit shouldn't drop captures the operator already made | |
| IndexedDB persistence | Overkill for 10-entry × 2.1 MB queue; localStorage 5 MB quota is sufficient | |
| FIFO eviction (drop newest when full) | ADHD-thought value decays with time — operator would rather keep the just-spoken memo than a 5-day-old failed one | |

**Auto-decision:** localStorage + LRU eviction + 10-entry cap + `[1s, 2s, 4s, 8s, 16s, 30s]` backoff.
**Notes:** Queue depth surfaces as a third HUD body line "syncing N voice captures…" via the existing Companion text container. Permanent-failure sub-queue (max 10; oldest evicted on 11th) lets operator inspect failed entries from a dedicated `[VOICE FAILED]` screen.

---

## Error taxonomy (D-E1, D-E2, D-E3)

| Option | Description | Selected |
|--------|-------------|----------|
| Three new locked-enum codes: TIMEOUT (504), PROVIDER_DOWN (502), QUOTA (503) + extend `api-error-codes.ts` | Verbatim VOICE-06 requirement; mirrors Phase 127 ERROR_CODE_MAP pattern | ✓ |
| Single generic `VOICE_TRANSCRIBE_FAILED` code | Loses operator-actionable distinction between transient (retry) and permanent (manual) failures | |
| Reuse existing `AUDIO_SESSION_TOO_LONG` / `DAILY_AI_BUDGET_EXCEEDED` only | Doesn't cover OpenAI-side failures (timeout, provider down, quota) | |

**Auto-decision:** Three new codes + per-error operator copy in api-error-codes.ts.
**Notes:** `DAILY_AI_BUDGET_EXCEEDED` cascade already works via `requireAiBudget` throw → `app.onError` translate; G2 plugin treats 429 as permanent (no retry — cap resets at midnight UTC), evicts the queued entry, surfaces "daily AI cost cap hit — try tomorrow" sub-copy.

---

## Telemetry surface (D-T1, D-T2, D-T3)

| Option | Description | Selected |
|--------|-------------|----------|
| PostHog event stream + per-recording structured events | Existing ops infra; no new dashboard to build; satisfies VOICE-08 "operator-facing telemetry surface" | ✓ |
| New per-recording admin table view in PWA Settings | Nice-to-have but not required by VOICE-08; deferred | |
| Console-only logging (no PostHog) | Not durable / not operator-facing | |

**Auto-decision:** PostHog events (`voice_capture_completed`, `voice_capture_dropout`).
**Notes:** `BLOCKED_PROPERTY_NAMES` filter (Phase 127 GUARD-01) already prevents `audioPcm` / `pcm` / `audio` from reaching PostHog; D-D2 drift detector enforces.

---

## Drift detectors (D-D1, D-D2, D-D3)

| Option | Description | Selected |
|--------|-------------|----------|
| Three drift detectors: WAV header pin + audioPcm log-sink ban + audioControl pairing | Verbatim VOICE-08 requirement (a/b/c) | ✓ |
| Two drift detectors (skip audioControl pairing) | Skips the orphan-mic-session class of bug Phase 127 GUARD-02 cleanup hooks mitigate (catches it, doesn't prevent it) | |

**Auto-decision:** All three drift detectors.
**Notes:** D-D2 extends Phase 127 GUARD-01's `redaction-drift.test.ts` (vigil-core) + `denylist-parity.test.ts` (vigil-pwa). D-D3 uses AST-light grep counting (`safeAudioControl(true` count == `safeAudioControl(false` count, minus test files).

---

## Spike-code cleanup ordering (D-C1, D-C2, D-C3, D-C4)

| Option | Description | Selected |
|--------|-------------|----------|
| Plan 01 = atomic spike cleanup (5 deletes + 5 reverts), then production plans | Auditable cleanup commit; prevents accidental spike-code reuse | ✓ |
| Spike cleanup interleaved with production plans | Couples cleanup with production code; harder to audit; SPIKE-DECISION rejects | |
| Defer spike cleanup to end of Phase 130 (final plan) | Leaves dead code mounted in production for most of Phase 130; SPIKE-DECISION says delete before production code lands | |

**Auto-decision:** Atomic plan 01 spike cleanup.
**Notes:** `app.json` `g2-microphone` permission explicitly PRESERVED (D-C2 — removing it re-triggers the C-2 portal approval pipeline and blocks Phase 130's first hardware run). The 3 carry-forward files (audio-session-guard.ts, ai-budget.ts, audio-cap.ts) are NOT deleted — Phase 130 modifies audio-session-guard.ts in place (Run 4 §1).

---

## Claude's Discretion

- Exact dedup-primitive migration number — researcher confirms next available (expected `0023`)
- Whether dedup lives on `thoughts.client_capture_id` OR a sibling `voice_captures` table — researcher picks based on SVCNOW-04 / SCAP-04 cleanliness; default preference: sibling table to keep polymorphic `thoughts` clean
- `/v1/thought-stream` vs multiplexed `/v1/agent-stream` — researcher picks; default: multiplex
- Per-chunk timestamp logging default (on vs operator-toggle) — researcher picks
- Server-side OpenAI timeout value — researcher locks; default proposal: 30 s
- HUD body-line layout priority when both `[NO MIC]` and offline-queue indicator are active — researcher picks; default: `[NO MIC]` wins
- Voice screen carousel position — researcher picks; default: same as spike (after Companion, before Tasks)
- UI-SPEC may run via `gsd-ui-phase 130` to lock body-line copy + state-machine transitions

## Deferred Ideas

- Ambient continuous capture mode (v3.10 candidate; requires chunked upload + 60s cap relaxation + battery-aware throttle)
- Multipart upload shape for future PWA voice client (Content-Type multiplex on the same route)
- Word-level transcript timestamps (whisper-1; gpt-4o-mini-transcribe doesn't support)
- Streaming chunked PCM upload (permanently deferred unless 60s cap relaxes)
- Deepgram fallback (re-eval if OpenAI median > 1.5 s on production-fleet traffic)
- Per-recording admin table view in PWA Settings (VOICE-08 satisfied by PostHog; nice-to-have)
- Phase 133 single-press plumbing patch (≤10-line `?? 0` fix + handleNavEvent CLICK_EVENT branch) — Phase 133's first plan owns
- `companion.ts:22-26` D-08 docstring revision after Phase 133 lands single-press
- VOICE-09+ features (transcript editing, multi-language, voice categorization) — post-v3.9
- Battery-aware queue throttling (pause retries below 20% battery)
