# Phase 128a: VOICE-01 PCM feasibility spike - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** `--auto` (autonomous discuss — user authorized "work without stopping for clarifying questions"; gray areas resolved with recommended defaults grounded in canonical SDK docs + STACK research + Phase 127 guardrail outputs + Phase 127.5 hardware-verified gesture verdict)

<domain>
## Phase Boundary

**Empirically resolve whether G2 PCM capture can support the v3.9 voice anchor — and if so, in what scope.** This is a SPIKE, not a feature build. The four hard guardrails Phase 127 shipped (`safeAudioControl`, `assertAudioSessionWithinCap`, `requireAiBudget`, audio-PCM log redaction) are the safety scaffold; this phase exercises them on real G2 hardware and produces a single artifact — `128a-SPIKE-DECISION.md` — that scope-locks Phase 130.

Phase 128a succeeds when:

1. **128a-SPIKE-DECISION.md** records measured numbers (not estimates) for:
   - **Chunk size** — bytes per `audioEvent` fire + inter-arrival timing distribution
   - **E2E latency** — utterance end → thought row visible in PWA dashboard (median + p95 over ≥5 runs)
   - **Drop-out modes** — events where `audioEvent` inter-arrival gap exceeds 2× the baseline (BLE walk-out, iPhone backgrounding, app cold-start mid-recording)
   - **Battery delta** — 1h baseline (mic OFF, G2 worn, Hub foreground) vs 1h push-to-record (10× ~5s clips evenly spaced), measured via `onDeviceStatusChanged.batteryLevel`
2. **Decision file resolves to exactly one verdict** — `PASS` / `DEGRADE` / `BLOCK` — against the thresholds locked in D-PASS below.
3. **60s portfolio Loom** (`60s-demo.mp4`) — working capture → transcription → PWA dashboard round-trip on PASS, OR documents the failure mode that drove DEGRADE/BLOCK.
4. **`audioControl(false)` cleanup verified** on every documented exit path (no zombie microphone sessions after 5 force-quit cycles).

**Not in scope** — feature-grade UX, drift-detector tests, error-code wiring, offline queue, recording LED indicator, prefab voice gestures, ambient continuous capture mode, multi-operator/multi-G2 testing, Phase 130 endpoint hardening. Spike code is **tossable** and lives under `vigil-g2-plugin/scripts/voice-spike-page.html` + a marked-tossable `vigil-core/src/routes/voice-spike.ts`. Phase 130 productionizes the path that 128a proves.

</domain>

<decisions>
## Implementation Decisions

### Gesture for push-to-record

- **D-G1 — DOUBLE_CLICK push-to-record on Companion (start), DOUBLE_CLICK again (stop).** This is the **only** hardware-verified gesture as of 2026-05-10 (`project_g2_companion_doubletap_hardware_verified` memory: live G2 test confirmed DOUBLE_CLICK fires on Companion body container). Phase 127.5 verdict REACTIVATE proved single-press CAN work after a ≤10-line `?? 0` patch — but that patch is explicitly deferred to Phase 133. **Do NOT depend on single-press for this spike.** Implementation: `vigil-g2-plugin/scripts/voice-spike-page.html` (NEW, tossable) registers a temporary "Voice Spike" screen; its DOUBLE_CLICK_EVENT handler toggles a `recording: boolean` state and calls `safeAudioControl(recording, bridge)` from `vigil-g2-plugin/src/lib/audio-session-guard.ts`. No new lib code — the guard wrapper already exists.
- **D-G2 — Plugin permissions** — Add `"g2-microphone"` to `vigil-g2-plugin/app.json` permissions array with `desc` describing the spike. Operator verifies the Even Hub developer portal allowlist accepts `g2-microphone` BEFORE the spike packs. If permission grant fails on hardware: the spike's first 30 minutes records that as the BLOCK signal and exits early (per `permissions[]` schema confirmed by `app.json` review).
- **D-G3 — Permission rejection probe** — Run one cycle with permission revoked (Even Hub UI) to observe `audioControl(true)`'s error mode. Documents the failure shape Phase 130 must handle.

### Recording protocol

- **D-R1 — Three recording modes per session** to feed the four measurements without ballooning operator wallclock:
  1. **Short clips (3-5s each, × 10 runs)** — primary latency + chunk-size measurement. Operator counts "one one-thousand, two one-thousand" out loud. Total expected PCM ≈ 5 × 32,000 = 160,000 bytes per clip (±10% trim tolerance).
  2. **One near-cap clip (~55s)** — drop-out + cap-headroom measurement. Stays under the 60s server cap (D-02.1 from Phase 127) so the WAV reaches `/v1/voice/transcribe` and the round-trip completes.
  3. **One battery-delta pair** — 1h baseline (mic OFF, G2 worn, Hub foreground, screen visible) followed by 1h push-to-record (10× 5s clips evenly spaced across the hour). Same operator, same starting charge (100%), same iPhone foreground/background state across both halves. Captured via `onDeviceStatusChanged.batteryLevel` at t=0 and t=60min for each half.
- **D-R2 — Single-operator, single-G2-pair, single-Wi-Fi run.** Per STACK research §1b ("single-user empirical run is enough for the spike") and Phase 124 D-08 ("simulator audio path is sim-only — live device only"). Multi-network / multi-operator generalization is a Phase 130 hardening concern, not spike concern.
- **D-R3 — Hardware-only execution.** Simulator results do NOT count. Phase 124 D-08 + Phase 127.5 verdict both proved Even SDK event semantics differ on hardware (protobuf zero-omission). Spike operator wallclock = physical G2 in hand.

### WAV header + transcription path

- **D-W1 — Client-side WAV header in the G2 plugin.** VOICE-04 already locks "base64-WAV (16kHz mono 16-bit LE) as a single base64 blob per utterance" — so the plugin owns WAV assembly. Spike adds `vigil-g2-plugin/scripts/voice-spike-encoder.ts` (tossable; standard 44-byte WAV header for PCM 16kHz mono 16-bit LE — `RIFF` / `WAVE` / `fmt ` / `data` chunks per the canonical WAV format). Plugin concatenates `audioPcm` Uint8Array chunks → prepends 44-byte header → base64-encodes → POSTs to `/v1/voice/transcribe`. Sample math: 5s × 32,000 = 160,000 PCM bytes + 44 header bytes → base64 length ≈ 213,392 chars (well under the 2,560,000 cap).
- **D-W2 — `/v1/voice/transcribe` spike scaffold** — `vigil-core/src/routes/voice-spike.ts` (NEW, marked TOSSABLE in header comment "Phase 130 owns hardening; this file is spike-only and MUST be deleted or rewritten before Phase 130 lands"). Mount in `vigil-core/src/index.ts` under the existing `bearerAuth` + `requireVerifiedEmail` chain. Calls in order:
  1. `c.get("userId")` — userId from JWT
  2. `requireAiBudget(userId)` — Phase 127 GUARD-03 chokepoint (already shipped)
  3. Parse JSON body `{ audio: string }` (base64 WAV)
  4. `assertAudioSessionWithinCap(body.audio)` — Phase 127 GUARD-02 60s byte cap (already shipped)
  5. Decode base64 → Buffer → wrap as Node `File`-like for OpenAI SDK
  6. `transcribeWav(buf)` → OpenAI `gpt-4o-mini-transcribe` per STACK §1c
  7. `db.insert(thoughtsTable).values({ userId, content, source: 'g2_voice' }).returning()` — fire-and-forget triage via existing `process-audio.ts` triage hook pattern
  8. Return `{ id, content }`
- **D-W3 — Transcription provider: OpenAI `gpt-4o-mini-transcribe`** (per STACK §1c recommendation: $0.003/min, 500-1500ms latency, accepts standard WAV multipart). Anthropic is rejected — Anthropic Files API does NOT accept `audio/*` MIME types (verified at `https://platform.claude.com/docs/en/docs/build-with-claude/files`). REQUIREMENTS.md VOICE-05 lists "Anthropic beta.files OR OpenAI" with "provider locked before phase plan" — this CONTEXT.md is the lock.
- **D-W4 — `OPENAI_API_KEY` operator action** — Set `OPENAI_API_KEY` in Railway `vigil-core` env BEFORE the spike runs. Per `[Anthropic key sprawl]` memory + `[railway variables leak]` memory: do NOT dump full `railway variables` output; use `railway variables get OPENAI_API_KEY` or the Dashboard to verify. Document the operator action as a wallclock checkpoint in PLAN.md (cannot be `--auto`-executed).
- **D-W5 — `transcribeWav` helper** — `vigil-core/src/ai/transcribe-spike.ts` (NEW, tossable). Lazy-init the OpenAI client (mirrors the lazy `getAIClient()` pattern in `vigil-core/src/ai/client.ts`). Phase 130 productionizes it under `vigil-core/src/ai/transcribe.ts`.

### Measurement methodology

- **D-M1 — Latency definitions, locked:**
  - **`mic_on_latency`** — `console.time('mic-on')` at the `safeAudioControl(true)` call site → `console.timeEnd('mic-on')` in the first `audioEvent` listener fire. ≥10 samples; report min / median / p95.
  - **`inter_chunk_latency`** — wall-clock delta between consecutive `audioEvent` fires within a single recording. Full distribution from the near-cap 55s recording.
  - **`e2e_latency`** — wall-clock from `DOUBLE_CLICK_EVENT` (stop record) on G2 → row visible in PWA dashboard polling at 2-second interval (existing dashboard refresh cadence). ≥5 samples; report median + p95. Matches VOICE-06's 8s acceptance criterion.
- **D-M2 — Drop-out instrumentation** — Define drop-out as: gap between consecutive `audioEvent` fires > 2× the median inter-arrival interval measured during the first 5 seconds of a clean recording (used as that recording's baseline; recomputed per recording, not globally fixed). Log gaps with `console.log` (filtered through Phase 127 GUARD-01 redaction); spike-DECISION.md tabulates events ≥2s as discrete drop-outs.
- **D-M3 — Battery delta protocol** — Verify both halves are completed against the **same starting battery percentage** (100%). If battery falls below 70% before the second half starts: recharge to 100% and restart that half (don't compare a 100% baseline with a 65% push-to-record half — non-linear discharge curves invalidate the delta). Document delta as `(battery_t0 - battery_t60) percentage points` per half.
- **D-M4 — Cleanup verification protocol** — Five force-quit cycles, each:
  1. `safeAudioControl(true)` → record 3s → swipe-kill Even Hub iPhone app mid-recording.
  2. Reopen Even Hub → verify Phase 127 `safeAudioControl` cleanup fired via console log inspection (either ABNORMAL_EXIT_EVENT or beforeunload should fire; on iOS Headless WebView replay, the `onBackgroundRestore('vigil-audio-guard', …)` cleanup path is the load-bearing one).
  3. Verify G2 battery isn't draining at active-mic rate via `onDeviceStatusChanged.batteryLevel` delta over 30s (active mic ≈ 5-10× idle drain rate).
  4. Document each cycle's outcome (PASS = `audioControl(false)` confirmed fired; FAIL = mic still draining).

### Verdict thresholds (locked — spike author does NOT decide at write-up time)

- **D-PASS — Spike returns PASS when ALL FOUR conditions are met:**
  - `e2e_latency` median ≤ 8s (matches VOICE-06 acceptance criterion)
  - Drop-out events ≤ 1 per 60s of recording across the near-cap clip + all short clips
  - Battery delta in push-to-record half ≤ 15 percentage points over 1h
  - `audioControl(false)` cleanup confirmed fired on all 5 force-quit cycles AND on permission-revocation probe (D-G3)
  - PASS verdict scope-locks Phase 130 to **full VOICE-02..08 specification** (push-to-record short clips with the documented gesture per Phase 127.5 verdict).
- **D-DEGRADE — Spike returns DEGRADE when ANY of:**
  - 8s < `e2e_latency` median ≤ 15s
  - OR drop-out events 2-5 per 60s
  - OR battery delta 15-30 percentage points / hour
  - OR `audioControl(false)` cleanup fails on ≤2 of the 5 force-quit cycles but the 3+ that succeeded are sufficient for push-to-record use (the watchdog wins by default; if cleanup is best-effort but the 60s server cap catches stragglers, DEGRADE is acceptable)
  - DEGRADE verdict scope-locks Phase 130 to **push-to-record short clips ONLY** (≤5s per clip; no ambient continuous capture; explicit "REC 0:00" footer indicator on Companion HUD).
- **D-BLOCK — Spike returns BLOCK when ANY of:**
  - `e2e_latency` median > 15s
  - OR drop-out events > 5 per 60s
  - OR battery delta > 30 percentage points / hour
  - OR `audioControl(false)` cleanup fails on ≥3 of 5 force-quit cycles (mic-zombie risk is unmitigated)
  - OR `g2-microphone` permission rejected on Even Hub portal (D-G2)
  - OR PCM is not intelligible after WAV reconstruction (PASS GATE 1 from STACK research §"Day 1 Hour 4" fails)
  - BLOCK verdict **terminates Phase 130 from v3.9 scope.** Log structured findings in `128a-SPIKE-DECISION.md` per the SEED-003 DMARC pattern: three explicit re-activation conditions for revisiting in v3.10 or later.
- **D-V1 — Verdict commit** — Spike author writes the verdict + the specific failing/passing measurement at the TOP of `128a-SPIKE-DECISION.md`. The verdict is **not editable** after write — if a subsequent re-test contradicts it, the spike author opens a Phase 128a.1 to re-run with the updated protocol.

### Artifacts + file layout

- **D-A1 — Phase artifact locations** (all under `.planning/phases/128a-voice-01-pcm-feasibility-spike/`):
  - `128a-CONTEXT.md` (this file)
  - `128a-DISCUSSION-LOG.md` (auto-discuss audit)
  - `128a-RESEARCH.md` (gsd-phase-researcher output — uses canonical_refs below)
  - `128a-NN-PLAN.md` (gsd-planner output)
  - `128a-SPIKE-DECISION.md` (success criterion #2 — verdict + measured numbers + Phase 130 scope-lock implications)
  - `128a-MEASUREMENTS.md` (raw timing data, drop-out logs, decoded sample WAV reference; supports SPIKE-DECISION)
  - `60s-demo.mp4` (success criterion #3 — local file OR Loom URL captured in SPIKE-DECISION)
- **D-A2 — Tossable code locations** (lifecycle scoped to Phase 128a only; deleted or rewritten before Phase 130 lands):
  - `vigil-g2-plugin/scripts/voice-spike-page.html` — temporary "Voice Spike" screen with start/stop buttons + permission probe
  - `vigil-g2-plugin/scripts/voice-spike-encoder.ts` — WAV header builder (44-byte standard header for 16kHz mono 16-bit LE PCM)
  - `vigil-core/src/routes/voice-spike.ts` — minimal `/v1/voice/transcribe` route scaffold with TOSSABLE header comment
  - `vigil-core/src/ai/transcribe-spike.ts` — lazy-init OpenAI client + `transcribeWav(buf)` helper with TOSSABLE header comment
- **D-A3 — Spike code NOT to ship in plugin pack** — `vigil-g2-plugin/scripts/voice-spike-*.{html,ts}` excluded from `npm run pack` bundle (mirror `scripts/check-verified.mjs` pattern from STACK research). Verified by inspecting `npm run pack` output bundle size before submitting any plugin re-bundle.

### Operator wallclock checkpoints

Per `[feedback_wallclock_checkpoint_exempt]` memory: the following steps are exempt from `--auto` execution and MUST appear as explicit wallclock checkpoints in PLAN.md:

- **C-1** — Set `OPENAI_API_KEY` in Railway `vigil-core` env (D-W4). Operator-only.
- **C-2** — Verify `g2-microphone` permission allowed by Even Hub developer portal (D-G2). Operator-only; portal UI.
- **C-3** — Physical G2 hardware test cycles (D-R3 + D-M4). Operator wears G2, runs the spike script. Cannot be simulated.
- **C-4** — Battery-delta 2-hour wallclock window (D-R1 mode 3 + D-M3). Operator commits 2h of foreground iPhone time.
- **C-5** — 60s portfolio Loom recording (success criterion #3). Operator-only.

### Claude's Discretion

- Exact spike harness HTML structure (button layout, text labels) — researcher/planner pick
- Console log format for measurement events — researcher/planner pick (must be Phase 127 GUARD-01 redaction-compatible: no `audioPcm` reference in log strings; safe key names like `bytes`/`chunk_n`/`gap_ms`)
- Whether to mount `/v1/voice/transcribe` (spike scaffold) at the same path as Phase 130 will use OR at a temporary `/v1/voice/transcribe-spike` path — both work; defaulting to the production path because the 60s Loom demonstrates the production-shape round-trip more credibly. Planner can flip if a routing collision shows up.
- Whether to keep `voice-spike-page.html` checked in post-spike for regression replay OR delete immediately. Default: keep checked in under `vigil-g2-plugin/scripts/` (mirrors `scripts/check-verified.mjs` per STACK §"Open Questions"); flag with deletion-on-VOICE-08-ship reminder in a Phase 130 deferred-items entry.
- Drift-detector tests for the spike scaffold are **explicitly skipped** (drift detectors are Phase 130 + Phase 127 GUARD-01 scope — VOICE-08 will pin them). Spike author MUST NOT spend time on drift detectors.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 128a: VOICE-01 PCM feasibility spike" — goal + 4 success criteria
- `.planning/REQUIREMENTS.md` §"Phase 0 — Guardrails" line 24 — VOICE-01 verbatim
- `.planning/REQUIREMENTS.md` §"VOICE pipeline" lines 25-31 — VOICE-02..08 (downstream Phase 130 scope; spike author reads to understand what PASS/DEGRADE unlocks)
- `.planning/PROJECT.md` §"Current Milestone: v3.9 Voice & Companion Polish" — milestone scope, spike-first gate rationale, format lock, no-speaker constraint

### v3.9 research outputs (load-bearing for the spike)
- `.planning/research/SUMMARY.md` — cross-feature cost amplification rationale; the GUARD-03 budget watermark this spike INHERITS
- `.planning/research/STACK.md` §"1. VOICE-01..N — G2 PCM Voice Capture" (lines 28-160) — verified SDK API surface, format lock, transcription provider comparison table, OpenAI SDK snippet, endpoint shape, WAV header note
- `.planning/research/STACK.md` §"Concrete VOICE-01 Spike Scope (1-2 day, executable)" (lines 564-625) — Day 1/Day 2 hour-by-hour spike protocol (planner adapts to PLAN.md tasks)
- `.planning/research/STACK.md` §"Version Compatibility" — `openai@^4.79.0` + Node 20 + Hono `c.req.parseBody()` for multipart (NOTE: spike uses JSON-base64, not multipart, to mirror VOICE-04 spec; multipart was the STACK alternative shape)
- `.planning/research/PITFALLS.md` §"Pitfall 1 — Audio PCM data accidentally landing in logs" (lines 13-46) — Phase 127 GUARD-01 mitigation already shipped; spike author MUST NOT regress this in spike scaffold code
- `.planning/research/PITFALLS.md` §"Pitfall 2 — Audio session runaway" (lines 48-72) — Phase 127 GUARD-02 mitigation already shipped (`assertAudioSessionWithinCap`, `safeAudioControl`); spike author EXERCISES these on hardware
- `.planning/research/PITFALLS.md` §"Pitfall 3 — Cost runaway" (lines 75-107) — Phase 127 GUARD-03 mitigation already shipped (`requireAiBudget`); spike author EXERCISES this on hardware
- `.planning/research/PITFALLS.md` §"Pitfall 8 — Latency budget blown" (lines 239-265) — spike's primary motivation; planner adapts to PLAN.md latency-measurement tasks
- `.planning/research/EVEN-SKILLS.md` §"Audio capture" (lines 94-118) — canonical `audioControl` + `audioEvent.audioPcm` API surface; format lock (16kHz × 16-bit LE × mono = 32 KB/s)
- `.planning/research/EVEN-SKILLS.md` §"Background state" (referenced via `audio-session-guard.ts:8-32`) — Headless WebView replay semantics for `setBackgroundState` / `onBackgroundRestore`; cleanup-path requirement
- `.planning/research/EVEN-SKILLS.md` §"VOICE-01 spike — scope SHRINKS" (lines 184-200) — closed unknowns (format / API surface / cleanup paths) + remaining unknowns (chunk size / E2E latency / battery / dropout / cleanup robustness) — this is the spike's question set

### Phase 127 guardrail outputs (load-bearing — spike INHERITS, does NOT modify)
- `.planning/phases/127-pre-spike-guardrails/127-CONTEXT.md` — full Phase 127 decisions (D-01..D-04), especially the GUARD-02 (cap), GUARD-03 (budget), GUARD-01 (redaction) sections
- `vigil-g2-plugin/src/lib/audio-session-guard.ts` — `safeAudioControl(on, bridge)` wrapper (the spike's primary mic API; do NOT call `bridge.audioControl` directly)
- `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` — pinned cleanup-fire semantics (4 exit paths + idempotency + no-op when inactive)
- `vigil-core/src/lib/audio-cap.ts` — `MAX_PCM_BYTES = 1_920_000`, `MAX_AUDIO_B64_CHARS_60S = 2_560_000`, `assertAudioSessionWithinCap(b64)`, `AudioSessionTooLongError`
- `vigil-core/src/lib/ai-budget.ts` — `requireAiBudget(userId)`, `withBudgetTracking(userId, fn)`, `DailyBudgetExceededError`
- `vigil-core/src/analytics/posthog.ts:32` — `BLOCKED_PROPERTY_NAMES` Set (extended in Phase 127 with audio keys; spike scaffold logs must not bypass)
- `vigil-core/src/lib/sentry.ts` (Phase 127 GUARD-01) — `beforeSend` redactor; spike's Sentry breadcrumbs MUST flow through this
- `vigil-pwa/src/lib/api-error-codes.ts:145,158` — `AUDIO_SESSION_TOO_LONG` + `DAILY_AI_BUDGET_EXCEEDED` locked enum entries (already in place; spike doesn't extend)

### Phase 127.5 audit verdict (load-bearing — gesture-grammar input)
- `.planning/phases/127.5-g2-input-gesture-audit/127.5-AUDIT.md` — REACTIVATE verdict for single-press; **but** plumbing patch deferred to Phase 133. Spike MUST use DOUBLE_CLICK only.
- `[project_g2_companion_doubletap_hardware_verified]` (auto-memory) — 2026-05-10 live hardware test confirming Companion DOUBLE_CLICK_EVENT fires reliably

### Existing voice-adjacent code (reference / pattern source)
- `vigil-core/src/routes/process-audio.ts` — existing audio-input endpoint (file upload, Anthropic transcription, base64 + size guard pattern at lines 58-78); spike's `/v1/voice/transcribe` scaffold mirrors structure but swaps Anthropic → OpenAI and accepts raw WAV-base64 from G2 plugin (not multipart from PWA)
- `vigil-core/src/ai/client.ts` — lazy-init Anthropic client pattern (`getAIClient()`); spike's `transcribe-spike.ts` mirrors for OpenAI
- `vigil-core/src/db/schema.ts` §`thoughts` table — `source` column accepts `'g2_voice'` value (verify enum/freeform on spike code review; VOICE-05 mandates this source value)
- `vigil-g2-plugin/src/main.ts:66-70` (NAV_EVENTS) + `:221-260` (event-routing branches) — DOUBLE_CLICK_EVENT routing path already wired and hardware-verified
- `vigil-g2-plugin/app.json` — plugin permissions array (D-G2 modification site)

### Operator runbooks + memory references
- `[Anthropic key sprawl]` (auto-memory) — same drift pattern applies to `OPENAI_API_KEY`; spike adds it to the secret-management surface; document in RUNBOOK if not already
- `[Railway variables leak]` (auto-memory) — use `railway variables get OPENAI_API_KEY` or Dashboard; do NOT dump full output
- `[Wallclock checkpoints exempt from skip_checkpoints]` (auto-memory) — C-1..C-5 above are wallclock; `--auto` does NOT execute them

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (free wins for the spike)

- **`safeAudioControl(on, bridge)`** (`vigil-g2-plugin/src/lib/audio-session-guard.ts:80`) — wraps `bridge.audioControl(on)` with cleanup-hook registration on all four documented exit paths (ABNORMAL_EXIT, SYSTEM_EXIT, beforeunload, onBackgroundRestore). **Spike calls this, not raw `audioControl`.** First-call-per-process-lifetime idempotent registration. The cleanup-verification protocol (D-M4) directly exercises this wrapper.
- **`assertAudioSessionWithinCap(b64)`** (`vigil-core/src/lib/audio-cap.ts:74`) — server-side 60s byte cap, throws `AudioSessionTooLongError`. The near-cap 55s clip (D-R1 mode 2) lives just under the cap, so it MUST pass; the spike validates this gate is wired without ever tripping it.
- **`requireAiBudget(userId)`** (`vigil-core/src/lib/ai-budget.ts`) — per-user daily AI budget chokepoint. Default cap $0.50/user/day. Spike's transcription cost: 30s × $0.003/min ≈ $0.0015 per clip → 100 clips before tripping the cap. Spike's ~12 clips total (10 short + 1 near-cap + 1 transcription roundtrip for the Loom) costs ≈ $0.05 — well clear of the cap.
- **`BLOCKED_PROPERTY_NAMES`** (`vigil-core/src/analytics/posthog.ts:32`) — includes `audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer`. Spike scaffold's `console.log` calls MUST NOT name a local variable `pcm` / `audio` inside a logger call (Phase 127 GUARD-01 drift detector would catch it in CI, but the spike runs locally first — so use names like `bytes` / `chunk_n` / `gap_ms`).
- **`onDeviceStatusChanged.batteryLevel`** (Phase 125 G2-POLISH-08) — already subscribed by `vigil-g2-plugin/src/lib/deduped-device-status.ts`. Spike reads `batteryLevel` directly from the next `onDeviceStatusChanged` fire at the start + end of each 1h half (D-M3). No new subscription needed.
- **`thoughtsTable`** (`vigil-core/src/db/schema.ts`) — already accepts a `source` column for thought provenance. Spike scaffold inserts with `source: 'g2_voice'` to match the future VOICE-05 spec.
- **PWA dashboard polling** — existing 2-second poll cadence in the dashboard refresh hook. Spike's E2E latency measurement uses this as the visibility-deadline floor (so true latency is `transcribe_ms + insert_ms + (2000ms / 2)` ≈ `transcribe_ms + insert_ms + 1s` on average).

### Established Patterns

- **Lazy-init AI client** (`vigil-core/src/ai/client.ts`) — `let client: Anthropic | null = null; export function getAIClient() { if (!client && KEY) client = new Anthropic({…}); return client; }`. Spike mirrors for OpenAI in `transcribe-spike.ts`.
- **Throw-based error funneling through `app.onError`** (`vigil-core/src/index.ts:252-260`) — `AudioSessionTooLongError` → 413, `DailyBudgetExceededError` → 429, both with locked codes. Spike's `voice-spike.ts` does NOT need its own error translation; the guardrails throw and `app.onError` translates.
- **Tossable spike code with TOSSABLE header comment** — convention precedent: `vigil-g2-plugin/scripts/check-verified.mjs` (STACK research mentions). Header format: `// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is spike-only and MUST be deleted or rewritten before Phase 130 lands.`
- **Operator wallclock as explicit PLAN.md task** — Phase 125 Plan 11 (60s portfolio demo) and Phase 127 Plan 05 (Railway env update) are the precedents. Spike's C-1..C-5 follow this pattern; `--auto` cannot execute them.

### Integration Points

- **Plugin → server** — POST `/v1/voice/transcribe` (spike scaffold mounted in `vigil-core/src/index.ts` under the existing auth chain). Same path Phase 130 will use; spike scaffold is overwritten, not relocated.
- **Server → PWA** — spike inserts a `thoughts` row; existing PWA dashboard polling renders it. No new SSE channel, no new PWA component.
- **Plugin → SDK** — `safeAudioControl(true, bridge)` opens mic; `bridge.onEvenHubEvent(e => e.audioEvent?.audioPcm)` collects PCM; concat → WAV-wrap → base64 → POST. Existing `bridge` singleton already wired in `vigil-g2-plugin/src/main.ts`.

</code_context>

<specifics>
## Specific Ideas

- **"60s Loom" demonstration shape** — Mirror Phase 125's 60s portfolio demo pattern. Suggested arc: 5s G2 close-up showing the DOUBLE_CLICK gesture → 5s wide shot of operator wearing G2 + speaking → 10s Companion HUD recording (LED indicator stub is Phase 130 scope; spike Loom can use a placeholder "recording" overlay in screen recording editor) → 15s PWA dashboard refresh showing the new thought row arrive → 25s split-screen replay with measurement overlay (E2E latency, chunk count, drop-out events tallied).
- **Spike author = single operator** — per D-R2. The Vigil developer (memory: `[user_adhd_founder]`) runs the spike end-to-end on personal G2 hardware. No second-operator dry-run.
- **DOUBLE_CLICK confirmation pattern** — From `[project_g2_companion_doubletap_hardware_verified]` 2026-05-10 test: Companion body container's `isEventCapture: 1` (companion.ts:386-399) routes DOUBLE_CLICK_EVENT through the existing handler. Spike's voice-spike-page.html re-uses the same `isEventCapture: 1` pattern on its temporary text container.
- **Spike runs on plugin version branch, not main** — Spike author works in a branch (e.g., `spike/voice-01-pcm-feasibility`) so the tossable scaffold doesn't pollute `vigil-g2-plugin@0.3.6` history. Phase 130's productionization branches from main, not from this spike branch.

</specifics>

<deferred>
## Deferred Ideas

- **Ambient continuous capture mode** — even on PASS, Phase 130 ships push-to-record (per VOICE-02..08 spec). Ambient (always-on) capture is a v3.10+ scope decision contingent on (a) clean PASS with battery delta < 10%/hr, (b) better drop-out characterization, (c) a chunked-upload architecture that breaks the 60s cap into a session-id-tracked sequence. Note in 128a-SPIKE-DECISION as a v3.10 candidate ONLY if PASS thresholds are exceeded with significant headroom (battery < 10%/hr AND latency < 4s AND zero drop-outs).
- **`/v1/voice/transcribe` multipart shape** — STACK §1c sketched the route using `c.req.parseBody()` multipart upload. VOICE-04 instead specifies JSON body with base64 WAV (cleaner G2 plugin client; no multipart construction in WebView). Spike uses JSON-base64; if Phase 130 wants to swap to multipart for PWA voice (separate client, separate path), that's a Phase 130 architectural decision, not a spike concern.
- **Word-level transcript timestamps** — `whisper-1` supports timestamps for future "scrub-to-edit transcript" UX. STACK rejected for v3.9 ($0.006/min vs $0.003/min, accuracy overkill for ADHD-thought capture). Re-eval when an editing UX request emerges.
- **Streaming PCM upload** — STACK research §1c noted "no streaming complexity" for `gpt-4o-mini-transcribe`. Streaming chunked upload is the path if Phase 130 hits a 25 MB cap on long ambient sessions — but the 60s server cap (Phase 127 GUARD-02) makes this unreachable. Permanently deferred unless the cap relaxes.
- **`spike-VERIFICATION.md` separate from `SPIKE-DECISION.md`** — STACK research suggested splitting the operator-facing verification doc from the verdict. CONTEXT consolidates them into `128a-SPIKE-DECISION.md` (verdict + measured numbers) + `128a-MEASUREMENTS.md` (raw timing data). Author can revert to the 3-file split if the verdict doc grows past ~300 lines, but defaulting to 2.
- **Deepgram fallback** — STACK §1c noted Deepgram nova-3 at $0.0043/min, <500ms latency. Rejected for v3.9 (second account to maintain; OpenAI sufficient). Re-eval if OpenAI latency > 1.5s on real iPhone-tethered G2 traffic.
- **`OPENAI_API_KEY` server-only secret** — never reaches G2 plugin or PWA. Operator confirms during C-1 wallclock checkpoint.
- **Sentry breadcrumb redaction for `voice-spike.ts`** — Phase 127 GUARD-01 `beforeSend` redactor already covers any breadcrumb from the spike scaffold. Spike author MUST NOT add a parallel redaction shim in the spike route.

</deferred>

---

*Phase: 128a-voice-01-pcm-feasibility-spike*
*Context gathered: 2026-05-12*
*Mode: --auto (autonomous discuss; user authorized "work without stopping for clarifying questions"; recommended defaults grounded in Phase 127 guardrails + Phase 127.5 verdict + STACK/PITFALLS/EVEN-SKILLS research)*
