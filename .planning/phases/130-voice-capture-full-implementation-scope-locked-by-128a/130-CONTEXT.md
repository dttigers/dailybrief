# Phase 130: Voice capture full implementation (scope-locked by 128a) - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Mode:** `--auto` (autonomous discuss — user authorized "work without stopping for clarifying questions"; gray areas resolved with recommended defaults grounded in Phase 128a SPIKE-DECISION PASS verdict + Phase 127.5 REACTIVATE verdict + Phase 127 guardrails + STACK/PITFALLS research)

<domain>
## Phase Boundary

**Ship the G2 voice anchor at FULL VOICE-02..08 scope** — Phase 128a returned PASS on all four verdict inputs (e2e median 1,880 ms, 0 drop-outs/60s, 5 pp/hr battery cost, 5/5 cleanup), so the DEGRADE narrowing path does NOT apply. Phase 130 productionizes the spike code that Phase 128a proved: push-to-record short clips, base64-WAV upload, OpenAI `gpt-4o-mini-transcribe`, thought-row insert with `source='g2_voice'`, PWA dashboard render within 8 s of utterance end.

Phase 130 succeeds when:

1. **Operator gesture** — `DOUBLE_CLICK_EVENT` on the production Voice screen toggles record on/off (Phase 127.5 REACTIVATE verdict applies; single-press plumbing patch is **deferred to Phase 133** — Phase 130 does NOT depend on single-press).
2. **HUD indicator** — visible LED-style "recording" indicator survives screen changes for the entire `audioControl(true)` duration (VOICE-03).
3. **Round-trip ≤ 8 s** — utterance end → PWA dashboard render. Per SPIKE-DECISION DRIFT-02, the spike's `stop→HTTP_ms` median of 1,880 ms is the backend-side floor; **the user-perceived 8 s floor requires SSE fan-out** from `/v1/voice/transcribe` → `agent-events-bus` → PWA subscriber (PWA dashboard's existing 30-s poll cadence makes 8 s unreachable without SSE).
4. **Error taxonomy** — `VOICE_TRANSCRIBE_TIMEOUT`, `VOICE_TRANSCRIBE_PROVIDER_DOWN`, `VOICE_TRANSCRIBE_QUOTA` locked-enum extensions land in `vigil-pwa/src/lib/api-error-codes.ts` and matching server-side throws translate via `app.onError` (Phase 127 D-02 pattern).
5. **Offline queue** — failed POSTs retry with `[1s, 2s, 4s, 8s, 16s, 30s]` backoff (mirror Phase 124 D-11); max 10 queued utterances; "syncing N voice captures" HUD indicator when queue depth > 0.
6. **Drift detectors** — pin WAV header structure, ban `audioPcm` from every log sink (extends Phase 127 GUARD-01 drift detector), pin `audioControl(true)`/`audioControl(false)` pairing (no orphan `(true)` calls).
7. **Tossable spike code REMOVED** — 5 spike files deleted; 5 spike-only edits reverted to pre-128a baseline; `app.json` `g2-microphone` permission PRESERVED.
8. **Run 4 hardening landed** — `safeAudioControl` returns `Promise<boolean>`, callers observe denial, `[NO MIC]` state distinguishable from `[ERR]` in UI.

**Not in scope** — ambient continuous capture (v3.10 candidate per 128a-CONTEXT.md deferred), multipart upload shape (PWA voice is a separate phase), word-level timestamps (whisper-1; not gpt-4o-mini-transcribe), streaming PCM upload, Phase 133 single-press plumbing patch (gesture-grammar work belongs in Phase 133), G2-ACTION / G2-REPLY / WATCH-ENRICH / HUD-CLARITY (Phase 133 closeout bundle).

</domain>

<decisions>
## Implementation Decisions

### Gesture grammar

- **D-G1 — Production gesture is DOUBLE_CLICK_EVENT toggle on the Voice screen.** Phase 127.5 returned REACTIVATE — single-press *can* be made to work with a ≤10-line `?? 0` patch — but the audit explicitly defers that patch to Phase 133 ("the plumbing fix is ≤10 lines… BUT adding `CLICK_EVENT` to `NAV_EVENTS`… ships pure plumbing with zero behavioral improvement"). Phase 130 ships on DOUBLE_CLICK only. The same `companion.ts:386-399` `isEventCapture: 1` pattern the spike used carries forward.
- **D-G2 — Single-screen Voice screen, not Companion overlay.** Spike used a dedicated `voice-spike` screen registered in the carousel; Phase 130 productionizes it as `vigil-g2-plugin/src/screens/voice.ts` (new file, NOT a Companion overlay). Companion HUD continues to host the "recording" indicator via cross-screen state (D-U1 below), but the actual gesture target is the Voice screen.

### Voice screen state machine (VOICE-02 productionization + Run 4 hardening)

- **D-S1 — States:** `[IDLE]` → `[REC m:ss]` → `[UPLOADING…]` → `[DONE]` (returns to `[IDLE]` after 2 s). Error branches: `[NO MIC]` (permission revoked at Even Hub portal) and `[ERR]` (transcribe failure / network down / quota / timeout). Run 4 Hardening §5 requires `[NO MIC]` and `[ERR]` to render with DIFFERENT body text (`[NO MIC] enable mic in Hub` vs `[ERR] retry — tap to dismiss`) so the operator knows which corrective action applies.
- **D-S2 — `safeAudioControl` returns `Promise<boolean>`.** Per Run 4 §1, change the signature from `Promise<void>` → `Promise<boolean>` and return the SDK's `audioControl(true)` result. Callers MUST capture the return value and short-circuit on `false` (Run 4 §2). Spike code path was `safeAudioControl(true, bridge)` discard-result + try-less + no `[NO MIC]` surface; production code path is `if (!await safeAudioControl(true, bridge)) { stateLine = '[NO MIC]'; return; }` inside a `try/catch` (Run 4 §3).
- **D-S3 — State persists across screen swipe.** Operator can swipe to Companion mid-recording without losing recording state. Implementation: recording state lives in `main.ts` event-collector scope (NOT in the Voice screen's local closure), so the carousel rebuild on swipe does not clear `recording`. The spike already proved cross-screen survival via the `audioEvent` collector in `main.ts`.

### Upload + transcription path (VOICE-03 + VOICE-04 productionization)

- **D-U1 — DELETE the spike route, then ADD a production route at the same path.** Per SPIKE-DECISION "Tossable Code Cleanup Note", Phase 130 plans MUST delete `vigil-core/src/routes/voice-spike.ts` + `vigil-core/src/ai/transcribe-spike.ts` + remove the `voiceSpike` mount line in `vigil-core/src/index.ts:29,232`, then add a fresh `vigil-core/src/routes/voice-transcribe.ts` + `vigil-core/src/ai/transcribe.ts` mounted at the same `/v1/voice/transcribe` path. **Do NOT in-place rename the spike file** — the SPIKE-DECISION explicitly says "treat the spike's tossable code as a clean reference for the production hardening, not as code to keep." Branch hygiene matters: spike removal is its own atomic commit before the production route lands.
- **D-U2 — Provider locked: OpenAI `gpt-4o-mini-transcribe`** per Phase 128a D-W3. Anthropic Files API does NOT accept `audio/*` MIME types. Spike measured 1,880 ms median latency on real iPhone-tethered G2 traffic — well clear of the 1.5 s Deepgram fallback trigger (128a-CONTEXT.md deferred), so no provider re-eval in Phase 130.
- **D-U3 — Endpoint shape:** `POST /v1/voice/transcribe` JSON body `{ audio: string; clientCaptureId: string }` (base64 WAV + UUID v4 for dedup-on-retry). Returns `{ thoughtId: number; content: string }`. Auth chain: `bearerAuth` → `requireVerifiedEmail` → `requireAiBudget(userId)` → `assertAudioSessionWithinCap(body.audio)` → `transcribeWav(buf)` → `db.insert(thoughtsTable).values({ userId, content, source: 'g2_voice' }).returning()` → `bus.publish('thought-created', { userId, thoughtId, content })` (D-X1 below) → return JSON. Phase 127 guardrails throw via `app.onError`; no per-route error translation.
- **D-U4 — `clientCaptureId` dedup primitive** — mirror the SCAP-04 / SVCNOW-04 pattern (composite partial unique index `(user_id, client_capture_id)` on a denorm column on `thoughts` OR on a sibling `voice_captures` table — researcher picks). Reason: offline-queue retries (D-O1 below) cause the same utterance to POST multiple times once network returns; without dedup, every retry creates a duplicate thought row. The G2 plugin generates a UUID v4 per recording at `safeAudioControl(true)` time, stores it on the queued entry, and includes it on every retry POST. **This is a NEW migration** — researcher confirms migration number; expected `0023_voice_capture_dedup.sql` (or land it on `thoughts.client_capture_id` if the researcher determines the column belongs there).

### Round-trip ≤ 8 s — SSE fan-out (VOICE-06 productionization; CRITICAL per DRIFT-02)

- **D-X1 — SSE is REQUIRED, in-tab window event is INSUFFICIENT.** Per Phase 128a SPIKE-DECISION DRIFT-02 §"Phase 130 task requirement (VOICE-06 acceptance)": the existing PWA dashboard polls `useThoughts` every 30 s, so dashboard-visibility floor without SSE is `transcribe_ms + insert_ms + ~15 s` — unreachable for the 8 s VOICE-06 criterion. The G2-origin path is cross-device (recording on G2; dashboard on a different machine's browser), so an in-tab `vigil:thought-created` window event won't fire on the dashboard machine. **Phase 130 plans MUST land:**
  1. Server-side `bus.publish('thought-created', payload)` call inside `voice-transcribe.ts` immediately after the `db.insert` returns (`vigil-core/src/lib/agent-events-bus.ts` already exposes the per-userId emitter primitive — Phase 119).
  2. New SSE event channel `thought-created` on `agent-events-bus.ts` (mirror the existing `agent-event` and `agent-event-quiet` channels at `agent-events-bus.ts:30,84`).
  3. PWA SSE subscriber that listens on `/v1/agent-stream` (or a new `/v1/thought-stream` channel — researcher picks; preference: extend `/v1/agent-stream` to multiplex thought-created events since the SSE infra is already wired, instead of standing up a parallel stream).
  4. PWA subscriber dispatches a `vigil:thought-created` window event on receipt → `useThoughts.ts:127` already listens for that exact event and triggers a refetch (no PWA hook rewrite needed).
- **D-X2 — Existing in-tab `vigil:thought-created` event stays.** PWA-origin captures (`vigil-pwa/src/hooks/usePhotoUpload.ts:182`, `vigil-pwa/src/components/AudioUploadSection.tsx:54`) already dispatch this event. Phase 130 adds the cross-device path via SSE → window event; the in-tab path is unchanged. Single converged refetch trigger.

### Offline queue (VOICE-07 productionization)

- **D-O1 — Queue backoff schedule:** `[1s, 2s, 4s, 8s, 16s, 30s]` per VOICE-07 (verbatim REQUIREMENTS.md line). After 6 retries fail, the queued utterance is moved to a "permanently failed" sub-queue (max 10 entries; oldest evicted on 11th); operator can swipe to a dedicated `[VOICE FAILED]` screen to see counts and manually clear. Phase 130 plans MUST land the 6-step backoff + the visible "syncing N voice captures" HUD line when queue depth > 0.
- **D-O2 — Queue persistence:** WebView `localStorage` keyed by `vigil:voice-queue:v1` (JSON-serialized array of `{ clientCaptureId, base64Audio, queuedAt, retryCount }`). Survives process death (swipe-kill → reopen recovers queue), bounded to ≤ 10 entries (cap from VOICE-07 = max 10 queued utterances). Storage budget: 10 × ~213 KB base64 ≈ 2.1 MB per user — well under iOS WebView's 5 MB per-origin localStorage quota.
- **D-O3 — Queue UI surface:** the "syncing N voice captures" indicator renders as a footer line on Companion HUD (third body line; replaces the spike's `[DONE] thought saved` ephemeral line). Operator-facing copy: `syncing 3 voice captures…` (drains visibly as POSTs succeed). When queue depth = 0, the line is hidden (not rendered as empty whitespace). HUD already renders multi-line body via `companion.ts` text container.
- **D-O4 — Queue eviction policy when queue is full** — when a new recording finishes and the queue is already at 10 entries, the OLDEST queued entry is evicted in favor of the new one (LRU-style), and the evicted entry's `clientCaptureId` is logged with `posthog.capture('voice_queue_evicted', …)` for telemetry. Rationale: an ADHD-thought voice memo's value decays with time; the operator would rather lose a 5-day-old failed-to-sync memo than the one they just spoke.

### Error taxonomy (VOICE-06 productionization)

- **D-E1 — Three locked-enum error codes** extend the Phase 127 `ERROR_CODE_MAP` pattern:
  - `VOICE_TRANSCRIBE_TIMEOUT` — OpenAI request exceeded server-side timeout (default 30 s; researcher locks exact value). HTTP 504.
  - `VOICE_TRANSCRIBE_PROVIDER_DOWN` — OpenAI returned 5xx / network error / refused connection. HTTP 502.
  - `VOICE_TRANSCRIBE_QUOTA` — OpenAI quota exhausted (org-level, separate from Phase 127 GUARD-03 per-user daily-AI-cost watermark). HTTP 503.
- **D-E2 — Per-error operator copy** added to `vigil-pwa/src/lib/api-error-codes.ts` at the same shape as the existing `AUDIO_SESSION_TOO_LONG` (line 145) and `DAILY_AI_BUDGET_EXCEEDED` (line 158) entries. The PWA renders these on the dashboard if a queued utterance returns a 4xx/5xx after retries exhaust. G2 HUD shows the generic `[ERR]` state with a "see PWA" sub-line.
- **D-E3 — `DAILY_AI_BUDGET_EXCEEDED` cascades correctly** — voice transcribe is wrapped in `requireAiBudget(userId)` (Phase 127 GUARD-03); when the cap is exceeded, `requireAiBudget` throws `DailyBudgetExceededError`, `app.onError` translates to HTTP 429 with code `DAILY_AI_BUDGET_EXCEEDED`. G2 plugin treats 429 like a permanent failure (no retry — cost cap won't reset until midnight UTC); evicts the queued entry; surfaces `[ERR]` with sub-copy `daily AI cost cap hit — try tomorrow`.

### Telemetry surface (VOICE-08)

- **D-T1 — Per-recording structured event** — emit `posthog.capture('voice_capture_completed', { stop_to_http_ms, chunks, bytes, retry_count, transcript_chars })` on every successful round-trip. NO `audioPcm` / `audio` / `pcm` property names (Phase 127 GUARD-01 `BLOCKED_PROPERTY_NAMES` blocklist already enforces; drift-detector test verifies). Keys are operator-facing metrics names, not PCM-data names.
- **D-T2 — Drop-out counter** — `posthog.capture('voice_capture_dropout', { gap_ms, recording_id })` fires when inter-arrival gap exceeds 2× the recording's first-5 s baseline (per Phase 128a D-M2). Researcher decides whether per-chunk timestamping is on by default or operator-toggle (spike deferred this).
- **D-T3 — Operator-facing ops surface** — VOICE-08 requirement says "operator-facing telemetry surface" but does not lock the shape. Default: PostHog event stream is the source of truth (existing ops infra); no new admin dashboard built in Phase 130. If researcher determines a per-recording table view in PWA Settings is needed, that lands as a separate scoped task; Phase 130 does NOT block on it.

### Drift detectors (VOICE-08)

- **D-D1 — WAV header structure pin** — new test `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` (or extend an existing encoder test) asserts the 44-byte header byte-for-byte: `RIFF` (offset 0), `WAVE` (offset 8), `fmt ` (offset 12), channel count = 1 (offset 22, 2 bytes LE), sample rate = 16000 (offset 24, 4 bytes LE), bit depth = 16 (offset 34, 2 bytes LE), `data` (offset 36). If the encoder regresses to 8 kHz or stereo, the test fails before the build packs.
- **D-D2 — No `audioPcm` in log sinks** — extend the existing Phase 127 GUARD-01 drift detector (`vigil-core/src/__tests__/redaction-drift.test.ts` and `vigil-pwa/src/__tests__/denylist-parity.test.ts` per Phase 127 Plan 01/02) with explicit grep patterns for `audioPcm`, `audio_pcm`, `pcm` in `console.log` / `Sentry.captureException` / `posthog.capture` call sites in `vigil-g2-plugin/src/` and `vigil-core/src/routes/voice-transcribe.ts`. If a new call site adds one of these property names without redaction, CI fails.
- **D-D3 — `audioControl(true)` / `audioControl(false)` pairing** — drift detector test scans `vigil-g2-plugin/src/` for every `safeAudioControl(true,` call and asserts that the same code path has a `safeAudioControl(false,` call within the function or via a cleanup hook. AST-light grep with structural counting (e.g., `grep -c "safeAudioControl(true"` must equal `grep -c "safeAudioControl(false"` across the plugin source — minus the test files themselves). Catches the "spike's `safeAudioControl(true)` without matching `(false)`" class of bug that Phase 127 GUARD-02 cleanup hooks paper over but should never need to.

### Spike-code cleanup (REQUIRED before Phase 130 lands)

Per SPIKE-DECISION "Tossable Code Cleanup Note", these are pre-Phase-130 plan tasks:

- **D-C1 — DELETE 5 files outright:**
  - `vigil-g2-plugin/scripts/voice-spike-encoder.ts`
  - `vigil-g2-plugin/src/screens/voice-spike.ts`
  - `vigil-core/src/routes/voice-spike.ts`
  - `vigil-core/src/ai/transcribe-spike.ts`
  - `vigil-core/src/routes/__tests__/voice-spike.test.ts`
- **D-C2 — REVERT 5 spike-only modifications** (remove spike entries; keep prior Phase 127 baseline):
  - `vigil-g2-plugin/src/navigation.ts` — remove VOICE_SPIKE carousel entry + DOUBLE_CLICK route
  - `vigil-g2-plugin/src/main.ts` — remove voice-spike screen registration
  - `vigil-g2-plugin/src/constants.ts` — remove VOICE_SPIKE_SCREEN_ID / VOICE_SPIKE_PATH constants
  - `vigil-g2-plugin/app.json` — **KEEP `g2-microphone`** entry; remove only spike-only descriptor strings (current `desc: "Phase 128a VOICE-01 spike: push-to-record voice capture for thought intake."` should be reworded to a production-grade description without `Phase 128a` reference)
  - `vigil-core/src/index.ts` — remove `import { voiceSpike } from "./routes/voice-spike.js"` (line 29) and `app.route("/v1", voiceSpike)` (line 232); Phase 130 re-mounts the production VOICE-03 route at the same path
- **D-C3 — CARRY FORWARD (do NOT touch):** Phase 127 guardrails the spike inherited without modification:
  - `vigil-g2-plugin/src/lib/audio-session-guard.ts` — Phase 130 modifies the `safeAudioControl` signature per Run 4 §1, but does NOT delete/rename the file
  - `vigil-core/src/middleware/require-ai-budget.ts` (or `lib/ai-budget.ts` — researcher confirms location)
  - `vigil-core/src/middleware/assert-audio-session-within-cap.ts` (or `lib/audio-cap.ts` — researcher confirms location)
- **D-C4 — Plan ordering** — the cleanup commits (D-C1 + D-C2) should land as their OWN plan (e.g., `130-01-PLAN.md`) BEFORE the production route + screen plans. This keeps the spike-removal commit auditable as a single atomic step and prevents the "production code reuses spike code by accident" failure mode.

### Claude's Discretion

- **Exact migration number for the dedup primitive** (D-U4) — researcher confirms next available migration number; expected `0023_voice_capture_dedup.sql`.
- **Whether dedup lives on `thoughts.client_capture_id` OR a sibling `voice_captures` table** (D-U4) — researcher picks based on which keeps the SVCNOW-04 / SCAP-04 pattern cleanest. Default preference: a new `voice_captures` table with FK to `thoughts.id`, so the dedup column doesn't pollute the polymorphic `thoughts` table (which already carries `source = 'g2_voice'`).
- **`/v1/thought-stream` vs multiplexed `/v1/agent-stream`** (D-X1 step 3) — researcher picks; default preference is multiplexed because the SSE infra is already wired and the only delta is one new event-channel name. The trade-off is a slightly larger SSE wire payload on the dashboard for every agent event the operator isn't watching (fine: payloads are tens of bytes).
- **Per-chunk timestamp logging default** (D-T2) — researcher picks default-on vs operator-toggle. Phase 128a spike deferred per-chunk timestamps to avoid contaminating Run 1 latency; in production, the cost is one extra `console.log` per 100 ms chunk (~10 lines/s during recording), which is negligible.
- **Server-side OpenAI timeout** (D-E1) — researcher locks the timeout value. Default proposal: 30 s (well above the spike's 3.6 s near-cap clip + headroom for slow days), with `VOICE_TRANSCRIBE_TIMEOUT` thrown if exceeded.
- **HUD body-line layout when both `[NO MIC]` and offline-queue indicator are active** — researcher picks priority order (probably `[NO MIC]` wins, queue indicator hidden because the user can't record anyway). UI-SPEC can lock this if `gsd-ui-phase` runs.
- **Loom-equivalent demo** for Phase 130 close — per Phase 128a precedent (`[feedback_loom_waived_g2_not_screen_mirrorable]` memory: G2 lenses are not screen-mirrorable, so portfolio Loom waived as not-applicable). Phase 130's 8-s round-trip demonstration is provable via console-log timing screenshots + PWA dashboard screen recording — Loom is NOT a Phase 130 close-out blocker.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 130: Voice capture full implementation (scope-locked by 128a)" — phase goal + 5 success criteria
- `.planning/REQUIREMENTS.md` §"Voice — G2 PCM capture (anchor)" lines 25-31 — VOICE-02..08 requirement text verbatim (VOICE-02, VOICE-03, VOICE-04, VOICE-05, VOICE-06, VOICE-07, VOICE-08)
- `.planning/PROJECT.md` §"Current Milestone: v3.9 Voice & Companion Polish" — milestone scope, format lock, spike-gate rationale

### Phase 128a spike output (LOAD-BEARING — scope-locks Phase 130)
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-SPIKE-DECISION.md` — **PASS verdict + measured numbers + Phase 130 scope-lock list (sections "Phase 130 Scope-Lock Implication", "RESEARCH DRIFT-02 — Latency Measurement Note", "Tossable Code Cleanup Note (Phase 130)", "Run 4 Hardening (REQUIRED for Phase 130)")**. The mechanical verdict and the 5-file-delete + 5-modification-revert lists are MANDATORY downstream-agent reading.
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-MEASUREMENTS.md` — raw timing data (e2e median 1,880 ms, 0 drop-outs, 5 pp/hr battery, 5/5 cleanup); MEASUREMENTS Run 4 is the source of the 5 Run-4-hardening changes
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-CONTEXT.md` — full 128a decision set (D-W1 WAV header, D-W2 endpoint shape, D-W3 OpenAI provider lock, D-W5 lazy-init pattern, D-M1..M4 measurement methodology) — researcher mirrors patterns; planner verifies the production code preserves the validated shape

### Phase 127 guardrail outputs (LOAD-BEARING — Phase 130 INHERITS, must NOT regress)
- `.planning/phases/127-pre-spike-guardrails/127-CONTEXT.md` — Phase 127 full decision set (D-01 GUARD-01, D-02 GUARD-02, D-03 GUARD-03, D-04 GUARD-04 + Anti-pattern §"redact only one rail" + drift-detector pattern)
- `vigil-g2-plugin/src/lib/audio-session-guard.ts` — `safeAudioControl(on, bridge)` wrapper; Phase 130 modifies signature `Promise<void>` → `Promise<boolean>` per Run 4 §1 (D-S2 above)
- `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` — pinned cleanup-fire semantics (4 exit paths + idempotency + no-op when inactive); Phase 130 extends with the new return-value assertions
- `vigil-core/src/lib/audio-cap.ts` — `MAX_PCM_BYTES = 1_920_000`, `assertAudioSessionWithinCap(b64)`, `AudioSessionTooLongError`; Phase 130 mounts this on the production voice-transcribe route
- `vigil-core/src/lib/ai-budget.ts` — `requireAiBudget(userId)`, `withBudgetTracking(userId, fn)`, `DailyBudgetExceededError`; Phase 130 wraps the OpenAI call with `withBudgetTracking`
- `vigil-core/src/analytics/posthog.ts:32` — `BLOCKED_PROPERTY_NAMES` Set; drift-detector test guards
- `vigil-core/src/lib/sentry.ts` — `beforeSend` redactor; Phase 130 Sentry breadcrumbs flow through unchanged

### Phase 127.5 audit verdict (LOAD-BEARING — gesture-grammar input)
- `.planning/phases/127.5-g2-input-gesture-audit/127.5-AUDIT.md` — REACTIVATE verdict for single-press; plumbing patch DEFERRED to Phase 133; **Phase 130 ships on DOUBLE_CLICK only** per the audit's explicit recommendation

### v3.9 research outputs (research → planner → executor inheritance)
- `.planning/research/STACK.md` §"1. VOICE-01..N — G2 PCM Voice Capture" (lines 28-160) — SDK API surface, format lock (16kHz × 16-bit LE × mono), OpenAI SDK pattern, endpoint shape (JSON-base64, NOT multipart per VOICE-04)
- `.planning/research/STACK.md` §"Version Compatibility" — `openai@^4.79.0` (pinned in 128a Plan 01) + Node 20 + Hono `c.req.json()` for JSON body
- `.planning/research/PITFALLS.md` §"Pitfall 1 — Audio PCM in logs" (lines 13-46) — D-D2 drift detector exists; Phase 130 must NOT regress
- `.planning/research/PITFALLS.md` §"Pitfall 2 — Audio session runaway" (lines 48-72) — D-D3 drift detector source
- `.planning/research/PITFALLS.md` §"Pitfall 3 — Cost runaway" (lines 75-107) — D-E3 cascade source
- `.planning/research/PITFALLS.md` §"Pitfall 8 — Latency budget blown" (lines 239-265) — D-X1 SSE requirement source
- `.planning/research/EVEN-SKILLS.md` §"Audio capture" (lines 94-118) — `audioControl` + `audioEvent.audioPcm` API surface
- `.planning/research/EVEN-SKILLS.md` §"Background state" — Headless WebView replay + `setBackgroundState` / `onBackgroundRestore` cleanup semantics (D-O2 localStorage persistence reasoning)
- `.planning/research/EVEN-SKILLS.md` §"VOICE-01 spike — scope SHRINKS" (lines 184-200) — closed-vs-open unknowns; the spike CLOSED all six

### Phase 129.1 patterns (analogous dedup primitive — D-U4 mirrors SCAP-04 + SVCNOW-04)
- `.planning/phases/129.1-svcnow-revert-screenshot-pipeline/` — SCAP-01..04 endpoint structure (POST with base64 blob + clientCaptureId + composite-unique dedup)
- `vigil-core/src/routes/captures-screenshot.ts` — SCAP-01 production endpoint; D-U4 dedup pattern reference (composite partial unique index `(user_id, client_capture_id)`)
- Migration `vigil-core/src/db/migrations/0021_…` — SVCNOW-04 dedup migration shape

### Existing voice-adjacent code (production patterns to mirror)
- `vigil-core/src/routes/process-audio.ts` — existing audio-input endpoint (file upload, Anthropic transcription, base64 + size guard pattern at lines 58-78); Phase 130 mirrors structure but uses OpenAI SDK + JSON-base64 (not multipart) + `source = 'g2_voice'` (not `'voice'`)
- `vigil-core/src/ai/client.ts` — lazy-init Anthropic client pattern (`getAIClient()`); Phase 130's `transcribe.ts` mirrors for OpenAI
- `vigil-core/src/db/schema.ts` §`thoughts` table — `source` column accepts `'g2_voice'` value (verified by 128a spike — no enum constraint)
- `vigil-core/src/lib/agent-events-bus.ts` — `AgentEventBus` per-userId emitter (Phase 119); Phase 130 adds `thought-created` event channel (D-X1 step 2)
- `vigil-core/src/routes/agent-stream.ts` — SSE handler subscribing to `agent-events-bus`; Phase 130 extends to multiplex `thought-created` events (D-X1 step 3 default)
- `vigil-pwa/src/hooks/useThoughts.ts:127` — existing `vigil:thought-created` window event listener; Phase 130 dispatches this event from the new SSE subscriber (D-X1 step 4)
- `vigil-pwa/src/hooks/usePhotoUpload.ts:182` + `vigil-pwa/src/components/AudioUploadSection.tsx:54` — existing dispatchers of `vigil:thought-created`; pattern reference
- `vigil-pwa/src/lib/api-error-codes.ts:145,158` — existing `AUDIO_SESSION_TOO_LONG` + `DAILY_AI_BUDGET_EXCEEDED` locked-enum entries; Phase 130 extends with the three VOICE_TRANSCRIBE_* codes (D-E1)
- `vigil-g2-plugin/src/screens/companion.ts:22-26,386-399` — Companion body text container with `isEventCapture: 1` (D-G1 gesture target pattern)
- `vigil-g2-plugin/src/main.ts:66-70,221-260` — NAV_EVENTS + event-routing branches; DOUBLE_CLICK_EVENT already wired and hardware-verified; spike voice screen registration to be REMOVED
- `vigil-g2-plugin/src/lib/deduped-device-status.ts` — Phase 125 `onDeviceStatusChanged.batteryLevel` subscriber (not modified by Phase 130; reference for any future battery-aware queue-throttling)
- `vigil-g2-plugin/app.json` — plugin permissions array (D-C2 reword target)

### Phase 124 prior-art (offline-queue pattern)
- Phase 124 D-11 — `[1s, 2s, 4s, 8s, 16s, 30s]` exponential backoff schedule (D-O1 mirrors)

### Operator runbooks + memory references
- `[Anthropic key sprawl]` auto-memory — same pattern applies to `OPENAI_API_KEY`; secret is already set in Railway per 128a Plan 05 (Wallclock C-1 RESOLVED)
- `[Railway variables leak]` auto-memory — use `railway variables get` or Dashboard; do NOT dump full output
- `[feedback_loom_waived_g2_not_screen_mirrorable]` auto-memory — Phase 130 close-out does NOT require a portfolio Loom (G2 lenses not screen-mirrorable)
- `[feedback_wallclock_checkpoint_exempt]` auto-memory — any hardware-validation step must be an explicit PLAN.md wallclock checkpoint (cannot be `--auto`-executed)
- `[project_g2_companion_doubletap_hardware_verified]` auto-memory — DOUBLE_CLICK_EVENT on Companion confirmed live 2026-05-10; D-G1 gesture path is hardware-validated

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (free wins for Phase 130)

- **`safeAudioControl(on, bridge)`** (`vigil-g2-plugin/src/lib/audio-session-guard.ts:80`) — Phase 127 GUARD-02 mic wrapper. Phase 130 MODIFIES the signature to return `Promise<boolean>` per Run 4 §1 (D-S2). All four exit-path cleanup hooks (ABNORMAL_EXIT, SYSTEM_EXIT, beforeunload, onBackgroundRestore) carry forward unchanged.
- **`assertAudioSessionWithinCap(b64)`** (`vigil-core/src/lib/audio-cap.ts:74`) — 60s server-side cap; Phase 130 mounts on the production voice-transcribe route (already-shipped guardrail; one-line require).
- **`requireAiBudget(userId)` + `withBudgetTracking(userId, fn)`** (`vigil-core/src/lib/ai-budget.ts`) — Phase 127 GUARD-03 per-user daily AI-cost watermark. Phase 130 wraps the OpenAI call with `withBudgetTracking` so transcribe cost counts against the same $0.50/user/day cap as chat + ai_cache regenerate.
- **`AgentEventBus` per-userId emitter** (`vigil-core/src/lib/agent-events-bus.ts`) — Phase 119 SSE primitive; already supports per-userId isolation. Phase 130 publishes a NEW `thought-created` event channel (mirror the existing `EVENT_NAME` and `QUIET_NAME` channels at agent-events-bus.ts:30,84).
- **`/v1/agent-stream` SSE handler** (`vigil-core/src/routes/agent-stream.ts`) — Phase 119 + 125 SSE infra; Phase 130 extends to multiplex `thought-created` events (D-X1 step 3 default).
- **`vigil:thought-created` window event** (`vigil-pwa/src/hooks/useThoughts.ts:127`) — existing PWA refetch trigger; Phase 130 dispatches it from the new SSE subscriber so the same refetch path serves both in-tab and cross-device captures.
- **WAV header pattern** — Phase 128a's `voice-spike-encoder.ts` is DELETED per D-C1, but its 44-byte WAV header shape is the validated reference; the production encoder under `vigil-g2-plugin/src/lib/wav-encoder.ts` (new) mirrors the shape with a drift-detector test (D-D1).
- **`thoughtsTable` `source` column** (`vigil-core/src/db/schema.ts`) — accepts `'g2_voice'` value (validated by 128a spike — no enum constraint to extend).
- **`onDeviceStatusChanged.batteryLevel`** (Phase 125) — already subscribed by `vigil-g2-plugin/src/lib/deduped-device-status.ts`; available if researcher wants battery-aware queue throttling (not required by VOICE-07 — likely deferred).
- **SCAP-04 / SVCNOW-04 dedup pattern** — `vigil-core/src/routes/captures-screenshot.ts` + migration 0021 — proven composite partial-unique-index dedup primitive that Phase 130's `clientCaptureId` (D-U4) mirrors.

### Established Patterns

- **Lazy-init AI client** (`vigil-core/src/ai/client.ts`) — `let client: Anthropic | null = null; export function getAIClient() { if (!client && KEY) client = new Anthropic({…}); return client; }`. Phase 130's `transcribe.ts` mirrors for OpenAI.
- **Throw-based error funneling through `app.onError`** (`vigil-core/src/index.ts:252-260`) — guardrail throws (`AudioSessionTooLongError` → 413, `DailyBudgetExceededError` → 429) translate centrally. Phase 130's three new throws (`VoiceTranscribeTimeoutError`, `VoiceTranscribeProviderDownError`, `VoiceTranscribeQuotaError`) join the same translation table.
- **Drift-detector test pattern** — Phase 127 GUARD-01's three-rail drift detector (`vigil-core/src/__tests__/redaction-drift.test.ts` + `vigil-pwa/src/__tests__/denylist-parity.test.ts`); Phase 130 extends with WAV-header pin (D-D1), audioPcm-in-logs pin (D-D2), and audioControl-pairing pin (D-D3).
- **Migration numbering** — Phase 129.1's migration 0022 was last applied; Phase 130's dedup migration is expected `0023_voice_capture_dedup.sql` (researcher confirms).
- **`POST` route with bearerAuth + requireVerifiedEmail + body validation** — `vigil-core/src/routes/captures-screenshot.ts` (SCAP-01) is the closest analog; Phase 130's `voice-transcribe.ts` mirrors structure.
- **Tossable spike code precedent** — `vigil-g2-plugin/scripts/check-verified.mjs` (STACK research) + the 128a TOSSABLE-header pattern. Phase 130 plan 01 deletes all five spike files in one commit (D-C1).

### Integration Points

- **G2 plugin → server** — `POST /v1/voice/transcribe` (same path the spike used; the spike route gets deleted in plan 01, production route gets added in a later plan; net change is a re-mount under the same path).
- **Server → PWA (SSE)** — new `thought-created` event channel on `agent-events-bus.ts` → `/v1/agent-stream` multiplexes → PWA SSE subscriber → `vigil:thought-created` window event → `useThoughts.ts:127` refetch (D-X1).
- **Plugin → SDK** — `safeAudioControl(true/false, bridge)` opens/closes mic; `bridge.onEvenHubEvent(e => e.audioEvent?.audioPcm)` collects PCM; WAV-wrap → base64 → POST. Existing `bridge` singleton already wired in `vigil-g2-plugin/src/main.ts`.
- **Plugin local storage** — `localStorage.setItem('vigil:voice-queue:v1', JSON.stringify(queue))` for offline queue persistence (D-O2).
- **Server → analytics** — `posthog.capture('voice_capture_completed', …)` + `voice_capture_dropout` events (D-T1, D-T2) routed through existing `vigil-core/src/analytics/posthog.ts` (Phase 127 GUARD-01 `BLOCKED_PROPERTY_NAMES` already filters).

</code_context>

<specifics>
## Specific Ideas

- **Phase 130 plan 01 = spike-removal commit** — atomic deletion of the 5 spike files (D-C1) + revert of the 5 spike-only modifications (D-C2). Single commit, no production code added. This keeps the spike-removal auditable as its own commit (matching Phase 129's terminology cleanup plan style — see commit `f7db458 docs(128a-06)`-adjacent atomic-commit pattern from STATE.md).
- **DOUBLE_CLICK semantics on Voice screen mirror spike** — the spike already proved DOUBLE_CLICK_EVENT routes correctly to a new screen registered in the carousel + `main.ts:221-260` event router. Phase 130 reproduces the wiring under a production screen name (e.g., `VOICE_SCREEN_ID` instead of `VOICE_SPIKE_SCREEN_ID`).
- **`[NO MIC]` vs `[ERR]` body-line copy** — Run 4 §5 distinguishes the two states; suggested copy (researcher locks):
  - `[NO MIC] enable mic in Hub` — permission revoked at Even Hub portal (the operator must take action in the Even Hub app, not in Vigil)
  - `[ERR] retry — tap to dismiss` — transcribe failure / network down (the operator can tap to dismiss + the queue will retry on its own)
- **Voice screen carousel position** — researcher picks (default: after Companion, before Tasks — mirrors the spike's position). UI-SPEC can lock.
- **8-s acceptance test methodology** — VOICE-06's 8 s criterion is measured from `DOUBLE_CLICK_EVENT (stop)` → PWA dashboard row visible (NOT to HTTP 200 like the spike). With SSE in place, the floor is `stop→HTTP_ms (1.88 s median) + SSE_propagation (~50 ms) + React render (~16 ms) ≈ 2 s` — comfortably under 8 s. Researcher writes a test that exercises the full path (mock OpenAI client; real SSE; PWA happy-path render assertion).

</specifics>

<deferred>
## Deferred Ideas

- **Ambient continuous capture mode** — even on PASS, Phase 130 ships push-to-record short clips ONLY (per VOICE-02..08 spec). Ambient (always-on) capture is a v3.10+ candidate contingent on (a) better drop-out characterization across more environments, (b) a chunked-upload architecture that breaks the 60 s server cap into a session-id-tracked sequence, (c) a battery-aware throttle. 128a measured 5 pp/hr battery delta in push-to-record mode — ambient would be considerably higher. Re-eval in v3.10 milestone planning.
- **Multipart upload shape for PWA voice** — STACK §1c sketched `c.req.parseBody()` multipart; VOICE-04 locks JSON-base64 for the G2 plugin. If PWA voice (web-recorded audio) is added in a future phase, multipart is the cleaner shape for that client; route can multiplex shape on Content-Type header.
- **Word-level transcript timestamps** — `whisper-1` supports timestamps for future "scrub-to-edit transcript" UX; gpt-4o-mini-transcribe does not. Re-eval when an editing UX request emerges (STACK rejected for v3.9: $0.006/min vs $0.003/min; accuracy overkill for ADHD-thought capture).
- **Streaming chunked PCM upload** — 60 s server cap (Phase 127 GUARD-02) makes this unreachable. Permanently deferred unless the cap relaxes (which is itself an ambient-mode prerequisite).
- **Deepgram fallback** — STACK §1c rejected for v3.9. Re-eval if OpenAI median latency > 1.5 s on real iPhone-tethered G2 traffic in production (spike measured 1.88 s median — close to the trigger; if production-fleet latency degrades, this becomes relevant).
- **Per-recording table view in PWA Settings** (D-T3) — VOICE-08 requirement is satisfied by PostHog stream; a per-recording admin table is nice-to-have, not required. Re-eval if operators need self-serve drill-down into latency / drop-out events without leaving Vigil.
- **Phase 133 single-press plumbing patch** (≤10-line `?? 0` fix per Phase 127.5 audit + handleNavEvent CLICK_EVENT branch). Phase 133's first plan owns this; Phase 130 explicitly does NOT depend on it.
- **`Companion.ts` D-08 docstring revision** — when Phase 133 lands the single-press plumbing, the `companion.ts:22-26` docstring about "single-tap sim-only" needs updating. Tracked in Phase 127.5 deferred items.
- **VOICE-09+ scope** — additional voice features (transcript editing UX, multi-language transcription, voice-driven thought-categorization) are post-v3.9. Capture as backlog if operator surfaces them during Phase 130 UAT.
- **Battery-aware queue throttling** — pause queue retries when G2 battery < 20% to preserve charge for active capture. Nice-to-have; not in VOICE-07 spec.

</deferred>

---

*Phase: 130-voice-capture-full-implementation-scope-locked-by-128a*
*Context gathered: 2026-05-18*
*Mode: --auto (autonomous discuss; user authorized "work without stopping for clarifying questions"; recommended defaults grounded in Phase 128a SPIKE-DECISION PASS verdict + Phase 127.5 REACTIVATE verdict + Phase 127 guardrails + STACK/PITFALLS/EVEN-SKILLS research)*
