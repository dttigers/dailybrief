# Phase 128a: VOICE-01 PCM feasibility spike — Research

**Researched:** 2026-05-12
**Domain:** G2 PCM voice capture spike — empirically resolve `audioControl(true)` operational envelope on hardware (chunk size, E2E latency, drop-out modes, battery delta, cleanup robustness)
**Confidence:** HIGH for live-code surface verification + canonical SDK pattern, MEDIUM for OpenAI provider integration shape (one drift from STACK and one drift from CONTEXT surfaced below), LOW (by design) for empirical hardware numbers — those are what the spike resolves

---

## Summary

This phase is a **hardware-only empirical spike**, not a feature build. CONTEXT.md is unusually rich and locks every implementation decision (gestures, recording protocol, WAV path, measurement methodology, verdict thresholds, artifact locations, wallclock checkpoints). The research task is therefore: (1) verify those locked decisions still hold against the live code state, (2) flag the small number of drifts where CONTEXT or upstream STACK research no longer match reality, (3) surface the open unknowns that PLAN.md must answer to be executable, and (4) define the minimum validation surface a tossable spike should carry forward into Phase 130 + VOICE-08.

**Three load-bearing drifts surfaced in this research** (all need planner attention before tasks are written):

1. **CONTEXT D-G1 + D-A2 specify `vigil-g2-plugin/scripts/voice-spike-page.html` as a "temporary screen"** — but the plugin's screen system is programmatic (`TextContainerProperty` constructed in TS), not HTML-per-screen. There is exactly one `index.html` (the iPhone WebView splash). A new "Voice Spike" screen must be a TS module (`vigil-g2-plugin/src/screens/voice-spike.ts`) + an entry added to the `Screen` enum in `navigation.ts`. The HTML-file shape from CONTEXT is **architecturally incompatible** with how this plugin works. `[VERIFIED: vigil-g2-plugin/src/navigation.ts:24-43, vigil-g2-plugin/index.html`, vigil-g2-plugin/vite.config.ts]`
2. **CONTEXT D-M1 + Code Insights claim "PWA dashboard polling 2-second interval"** — actual polling in `vigil-pwa/src/hooks/useThoughts.ts:87` is `30_000` (30 seconds), with a `vigil:thought-created` window event for same-tab faster fan-out. A G2-originated `/v1/voice/transcribe` POST does NOT fire `vigil:thought-created` in the PWA tab. E2E latency math in CONTEXT (`transcribe_ms + insert_ms + 1s` average) is wrong; the true PWA visibility floor without further work is `transcribe_ms + insert_ms + (30s/2)` = `transcribe_ms + insert_ms + 15s` average. **The 8s VOICE-06 acceptance target is unreachable through pure dashboard polling.** Two options open: (a) spike measures latency from utterance-end to `/v1/voice/transcribe` HTTP 200 (server side; matches VOICE-06 intent but bypasses dashboard) OR (b) the spike harness includes a manual browser refresh during demo. **Strongly recommend option (a) — measure to API response, not to UI render. Document the gap in SPIKE-DECISION so Phase 130 plans SSE fan-out for VOICE-06 acceptance.** `[VERIFIED: vigil-pwa/src/hooks/useThoughts.ts:81-87, AudioUploadSection.tsx:54, usePhotoUpload.ts:182]`
3. **STACK.md §"Version Compatibility" locks `openai@^4.79.0`** — actual current published version is `openai@6.37.0` (verified via `npm view openai version` on 2026-05-12). The training-stale v4 baseline predates major releases. The `toFile` import path and the `audio.transcriptions.create` signature are stable across the v4→v6 jump, but the planner should write the `package.json` dependency line as `"openai": "^6.37.0"` (or `^6.0.0`) not `^4.79.0`. `[VERIFIED: npm registry; latest=6.37.0]`

Beyond these three drifts, the rest of CONTEXT.md holds against the live code: `safeAudioControl`, `assertAudioSessionWithinCap`, `requireAiBudget` are all in place with the documented signatures; the `thoughts.source` column is freeform `text("source").notNull()` so `'g2_voice'` inserts without enum violation; Phase 127 GUARD-01 redaction (Sentry beforeSend + PostHog BLOCKED_PROPERTY_NAMES + console drift detector) is shipped exactly where CONTEXT references it.

**Primary recommendation:** Write PLAN.md as a TS-screen scaffold (NOT an HTML-file scaffold); measure E2E latency to HTTP-200 of `/v1/voice/transcribe` (not to PWA dashboard render); install `openai@^6.37.0`; mirror the `audio-session-guard.test.ts` cleanup-fire tests as one regression test for `voice-spike.ts` so the guardrail integration doesn't silently regress in spike commits.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Gesture (D-G1 / D-G2 / D-G3):**
- DOUBLE_CLICK push-to-record on Companion (start), DOUBLE_CLICK again (stop). DOUBLE_CLICK is the only hardware-verified gesture as of 2026-05-10 (`project_g2_companion_doubletap_hardware_verified`). Single-press REACTIVATE patch is deferred to Phase 133. Do NOT depend on single-press for this spike.
- Add `"g2-microphone"` to `vigil-g2-plugin/app.json` permissions array with `desc` describing the spike. Operator verifies Even Hub developer portal allowlist BEFORE spike packs. If permission grant fails: spike's first 30 minutes records that as the BLOCK signal and exits early.
- Run one cycle with permission revoked (Even Hub UI) to observe `audioControl(true)`'s error mode. Documents failure shape Phase 130 must handle.

**Recording protocol (D-R1 / D-R2 / D-R3):**
- Three recording modes per session:
  1. Short clips (3-5s each, × 10 runs) — primary latency + chunk-size measurement
  2. One near-cap clip (~55s) — drop-out + cap-headroom measurement (stays under 60s server cap)
  3. One battery-delta pair — 1h baseline (mic OFF, G2 worn, Hub foreground, screen visible) vs 1h push-to-record (10× 5s clips evenly spaced)
- Single-operator, single-G2-pair, single-Wi-Fi run. Multi-network/multi-operator is Phase 130 scope.
- Hardware-only. Simulator does NOT count.

**WAV + transcription (D-W1 / D-W2 / D-W3 / D-W4 / D-W5):**
- Client-side WAV header in the G2 plugin: `vigil-g2-plugin/scripts/voice-spike-encoder.ts` (tossable; standard 44-byte WAV header for PCM 16kHz mono 16-bit LE — RIFF/WAVE/fmt/data chunks per canonical WAV format). Plugin concatenates `audioPcm` Uint8Array chunks → prepends 44-byte header → base64-encodes → POSTs to `/v1/voice/transcribe`.
- `vigil-core/src/routes/voice-spike.ts` (NEW, marked TOSSABLE in header comment). Mount under bearerAuth + requireVerifiedEmail. Sequence: `c.get("userId")` → `requireAiBudget(userId)` → parse JSON `{audio: string}` → `assertAudioSessionWithinCap(body.audio)` → decode base64 → wrap as Node `File`-like for OpenAI SDK → `transcribeWav(buf)` → `db.insert(thoughtsTable).values({userId, content, source: 'g2_voice'}).returning()` → fire-and-forget triage via existing `process-audio.ts` pattern → return `{id, content}`.
- Transcription provider: OpenAI `gpt-4o-mini-transcribe` ($0.003/min, 500-1500ms latency, accepts standard WAV multipart). Anthropic rejected (Files API does NOT accept audio/* MIME types).
- Set `OPENAI_API_KEY` in Railway `vigil-core` env BEFORE spike runs. Use `railway variables get OPENAI_API_KEY` or Dashboard; do NOT dump full output.
- `vigil-core/src/ai/transcribe-spike.ts` (NEW, tossable). Lazy-init OpenAI client mirroring `getAIClient()` pattern. Phase 130 productionizes under `vigil-core/src/ai/transcribe.ts`.

**Measurement methodology (D-M1 / D-M2 / D-M3 / D-M4):**
- `mic_on_latency`: `console.time('mic-on')` at `safeAudioControl(true)` → `console.timeEnd('mic-on')` in first `audioEvent` listener fire. ≥10 samples; report min / median / p95.
- `inter_chunk_latency`: wall-clock delta between consecutive `audioEvent` fires within a single recording. Full distribution from the near-cap 55s recording.
- `e2e_latency`: wall-clock from `DOUBLE_CLICK_EVENT` (stop record) on G2 → row visible in PWA dashboard polling. ≥5 samples; report median + p95. Matches VOICE-06 8s acceptance criterion.
- Drop-out defined as gap > 2× the median inter-arrival interval of first 5s of clean recording (recomputed per recording).
- Battery delta: both halves start at same percentage (100%). If battery falls below 70% before second half: recharge and restart. Document as `(battery_t0 - battery_t60) percentage points` per half.
- Cleanup verification: five force-quit cycles; each: `safeAudioControl(true)` → 3s record → swipe-kill Even Hub mid-recording → reopen → verify cleanup fired via console log inspection → verify G2 not draining at active-mic rate via `onDeviceStatusChanged.batteryLevel` delta over 30s.

**Verdict thresholds (D-PASS / D-DEGRADE / D-BLOCK / D-V1):**
- PASS: ALL four — `e2e_latency` median ≤ 8s + drop-outs ≤ 1 per 60s + battery delta ≤ 15pp/hr + cleanup confirmed on all 5 force-quit + permission-revocation probe → unlocks full VOICE-02..08 in Phase 130.
- DEGRADE: ANY of — 8s < latency ≤ 15s OR 2-5 drop-outs/60s OR 15-30pp/hr battery OR cleanup fails on ≤2 of 5 cycles → push-to-record short clips ONLY (≤5s; no ambient; explicit "REC 0:00" footer on Companion HUD).
- BLOCK: ANY of — latency > 15s OR > 5 drop-outs/60s OR > 30pp/hr battery OR cleanup fails on ≥3 of 5 cycles OR permission rejected OR PCM not intelligible after WAV reconstruction → terminates Phase 130 from v3.9 scope.
- Verdict at TOP of `128a-SPIKE-DECISION.md`. Not editable after write; re-test contradictions open Phase 128a.1.

**Artifacts + layout (D-A1 / D-A2 / D-A3):**
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/{128a-CONTEXT.md, 128a-DISCUSSION-LOG.md, 128a-RESEARCH.md, 128a-NN-PLAN.md, 128a-SPIKE-DECISION.md, 128a-MEASUREMENTS.md, 60s-demo.mp4}`
- Tossable code paths: `vigil-g2-plugin/scripts/voice-spike-page.html`, `vigil-g2-plugin/scripts/voice-spike-encoder.ts`, `vigil-core/src/routes/voice-spike.ts`, `vigil-core/src/ai/transcribe-spike.ts` — see DRIFT-01 below: the plugin HTML path is structurally wrong and must be replaced by a TS-screen module.
- Spike code NOT bundled in plugin pack — verified by inspecting `npm run pack` output bundle size before resubmit (mirror `scripts/check-verified.mjs` pattern).

**Operator wallclock checkpoints (C-1..C-5, exempt from `--auto`):**
- C-1: Set `OPENAI_API_KEY` in Railway `vigil-core` env
- C-2: Verify `g2-microphone` permission allowed by Even Hub developer portal
- C-3: Physical G2 hardware test cycles
- C-4: Battery-delta 2-hour wallclock window
- C-5: 60s portfolio Loom recording

### Claude's Discretion
- Exact spike harness structure (button layout, text labels)
- Console log format for measurement events — must be GUARD-01 redaction-compatible (no `audioPcm` reference in log strings; safe names like `bytes`/`chunk_n`/`gap_ms`)
- Mount path for `/v1/voice/transcribe` (spike scaffold) — production path OR temporary `/v1/voice/transcribe-spike`. Default to production path.
- Keep `voice-spike-page.html` checked in post-spike for regression replay OR delete immediately. Default: keep checked in; flag with deletion-on-VOICE-08-ship reminder.
- Drift-detector tests for spike scaffold are **explicitly skipped** (drift detectors are Phase 130 + GUARD-01 scope — VOICE-08 will pin them). Spike author MUST NOT spend time on drift detectors.

### Deferred Ideas (OUT OF SCOPE)
- Ambient continuous capture mode (v3.10+; only note in SPIKE-DECISION if PASS exceeds thresholds with headroom: battery < 10%/hr AND latency < 4s AND zero drop-outs)
- `/v1/voice/transcribe` multipart shape (STACK alternative; spike uses JSON-base64)
- Word-level transcript timestamps (`whisper-1`; deferred)
- Streaming PCM upload (60s server cap makes it unreachable)
- Separate `spike-VERIFICATION.md` (consolidated into `SPIKE-DECISION.md` + `MEASUREMENTS.md`; revertable if verdict doc grows past ~300 lines)
- Deepgram fallback (re-eval if OpenAI latency > 1.5s on hardware traffic)
- `OPENAI_API_KEY` reaching client (server-only secret)
- Parallel Sentry redaction shim in spike route (Phase 127 GUARD-01 already covers)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | PCM feasibility spike — empirically resolves chunk size, end-to-end latency, drop-out modes, battery delta (1h baseline vs 1h push-to-record), `audioControl(false)` cleanup robustness. Output: `128a-SPIKE-DECISION.md` with PASS/DEGRADE/BLOCK verdict and `60s-demo.mp4` portfolio loom. | This entire research document. Stack already locked (`@evenrealities/even_hub_sdk@^0.0.9` audioControl/audioEvent.audioPcm, `openai@^6.37.0` audio.transcriptions.create + toFile, Phase 127 guardrails `safeAudioControl` + `assertAudioSessionWithinCap` + `requireAiBudget`). Three drifts surfaced (HTML-vs-TS-screen, polling cadence, openai version). Validation surface defined for VOICE-08 inheritance. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| G2 PCM capture (`audioControl`, `audioEvent.audioPcm`) | G2 plugin (WebView) | Even Hub SDK | SDK exposes mic-on / mic-off and pushes PCM via `onEvenHubEvent`; plugin code calls `safeAudioControl` wrapper |
| WAV header assembly + base64 encoding | G2 plugin (WebView) | — | CONTEXT D-W1 locks "client-side WAV header in the G2 plugin" — server sees a ready-to-decode WAV |
| Cleanup on exit paths (ABNORMAL_EXIT, SYSTEM_EXIT, beforeunload, onBackgroundRestore) | G2 plugin (`safeAudioControl`) | — | Phase 127 GUARD-02 already shipped at this tier; spike exercises but does not re-implement |
| HTTP transport (POST `/v1/voice/transcribe`) | G2 plugin → vigil-core API | Network | JSON-base64 body; mirrors Phase 124 SSE shim auth (`Authorization: Bearer <VITE_API_KEY>`) |
| Auth + email-verify gating | vigil-core middleware chain | — | `bearerAuth` dispatcher at `/v1/*` + `requireVerifiedEmailWithGrace` (24h) — both already in place; spike route inherits via mount-order |
| Budget gate (per-user $0.50/day cap) | vigil-core (`requireAiBudget`) | Database (`ai_usage_daily`) | Phase 127 GUARD-03 already shipped; spike calls it before transcription |
| 60s session byte-cap | vigil-core (`assertAudioSessionWithinCap`) | — | Phase 127 GUARD-02 already shipped; throws → app.onError → 413 with `AUDIO_SESSION_TOO_LONG` |
| Transcription | OpenAI API (`gpt-4o-mini-transcribe`) | vigil-core (`transcribeWav`) | $0.003/min; toFile-wrapped Buffer → `audio.transcriptions.create` |
| Thought row insertion + triage fan-out | vigil-core (`thoughts` table) + fire-and-forget Claude triage | Database | Mirror `process-audio.ts` pattern verbatim — same triage system prompt, same `withBudgetTracking` accumulator pathway via `callClaude()` |
| PWA dashboard visibility | PWA `useThoughts` 30s polling | — | Existing 30s `setInterval` in `useThoughts.ts:81-87` (NOT 2s as CONTEXT D-M1 claims — see DRIFT-02) |
| Log redaction (GUARD-01) | PostHog before_send + Sentry beforeSend + console drift detector | — | Already shipped at the redaction tier; spike code must NOT add a parallel shim |

**Why this matters for the planner:** Three potential mis-assignments to watch for:
- **WAV header on server side** — would invalidate VOICE-04's client-side spec; planner must keep header construction in `vigil-g2-plugin/scripts/voice-spike-encoder.ts`
- **`/v1/voice/transcribe` body parsing as multipart** — STACK §1c sketches `c.req.parseBody()`; CONTEXT D-W2 step 3 locks JSON `{audio: string}` base64. Planner uses JSON.
- **PWA dashboard render included in 8s latency budget** — false floor (see DRIFT-02); measure to HTTP 200 of `/v1/voice/transcribe`, not to dashboard.

---

## Standard Stack

### Core (already installed; no new deps for the plugin side)

| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@evenrealities/even_hub_sdk` | ^0.0.9 (live in `vigil-g2-plugin/package.json`) | `audioControl(boolean)`, `onEvenHubEvent`, `EvenAppBridge`, `OsEventTypeList`, `setBackgroundState`, `onBackgroundRestore`, `TextContainerProperty`, `RebuildPageContainer` | The only SDK surface that exposes G2 hardware events. `[VERIFIED: vigil-g2-plugin/package.json:18, vigil-g2-plugin/src/lib/audio-session-guard.ts:1, EVEN-SKILLS.md:102-117]` |
| `tsx` | ^4.19.0 (live in both `vigil-g2-plugin/package.json:13` and `vigil-core/package.json`) | Test runner via `tsx --test "src/**/*.test.ts"` (node:test) | NOT Vitest — STACK.md mentions Vitest under "Re-Used Stack" but that's PWA-only. `[VERIFIED: vigil-core/package.json:9 + vigil-g2-plugin/package.json:14]` |

### Core (NEW — vigil-core only, gated on spike PASS into Phase 130)

| Library | Version (verified) | Purpose | Why Recommended |
|---------|---------|---------|--------------|
| `openai` | **^6.37.0** (current latest, verified `npm view openai version` 2026-05-12) | OpenAI SDK for `audio.transcriptions.create({file, model: 'gpt-4o-mini-transcribe'})` with `toFile(Buffer.from(...), 'audio.wav')` helper | Canonical pattern per official `openai-node` README. **NOT `^4.79.0` as STACK §"Version Compatibility" says** — that's training-stale. `[VERIFIED: npm view openai version → 6.37.0]` `[CITED: https://github.com/openai/openai-node README §"Audio Transcriptions"]` |

### Supporting (re-used; no changes needed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hono` | ^4.7.0 | `Hono` router instance for `voice-spike.ts`, `c.get("userId")`, `c.req.json()` | Mirrors `process-audio.ts:1-9` import shape verbatim |
| `drizzle-orm` | ^0.45.2 | `db.insert(thoughtsTable).values({...}).returning()` and the existing W-01 cross-user-isolation patterns | Already imported in `process-audio.ts:5` |
| `@anthropic-ai/sdk` | ^0.88.0 | Triage fan-out via `callClaude()` (NOT touched for the OpenAI transcription path) | Existing `ai/client.ts` lazy-init pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `openai@^6.37.0` | `openai@^4.79.0` (per STACK.md) | v4 is 18 months stale; `toFile` import path and `audio.transcriptions.create` signature are stable across the jump but newer release will land at install time anyway — pin to ^6.0.0 floor |
| OpenAI `gpt-4o-mini-transcribe` | OpenAI `whisper-1` ($0.006/min) | Only needed for word-level timestamps (deferred per CONTEXT); 2× cost for current scope |
| OpenAI `gpt-4o-transcribe` | (higher accuracy 4.1% WER vs 5.3%) | Same latency, 2× cost; ADHD-thought capture doesn't need the accuracy lift |
| Deepgram nova-3 | ($0.0043/min, <500ms latency) | Second account to maintain; rejected unless OpenAI latency > 1.5s on hardware |
| `wavefile` npm package | Adds dep for ~30 LOC of hand-rolled little-endian writes | Hand-roll the 44-byte WAV header — pattern below in Code Examples |
| Multipart upload via `c.req.parseBody()` | (STACK §1c sketch) | CONTEXT D-W2 step 3 locks JSON `{audio: string}` base64 — no Multipart construction in WebView |

**Installation (only on PASS verdict at Phase 130 productionization; the spike installs it now):**

```bash
cd vigil-core
npm install openai@^6.37.0
```

**Version verification (planner re-runs at task-execution time):**

```bash
npm view openai version
# Expected: 6.37.0 or newer
```

---

## Architecture Patterns

### System Architecture Diagram (Phase 128a spike data flow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ G2 Glasses (hardware)                                                   │
│   Operator DOUBLE_CLICK on Companion body container (isEventCapture=1)  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │ BLE
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ iPhone — Even Hub (Flutter WebView)                                     │
│   onEvenHubEvent → sysEvent.eventType === DOUBLE_CLICK_EVENT            │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ vigil-g2-plugin — voice-spike screen (TS module — NEW)          │   │
│   │   1. recording = !recording                                     │   │
│   │   2. safeAudioControl(recording, bridge)  [Phase 127 GUARD-02]  │   │
│   │   3. on (start):                                                │   │
│   │      • console.time('mic-on')                                   │   │
│   │      • register audioEvent collector:                           │   │
│   │           pcmChunks.push(event.audioEvent.audioPcm)             │   │
│   │           log chunk_n, bytes, gap_ms (NO 'audio'/'pcm' tokens)  │   │
│   │   4. on (stop):                                                 │   │
│   │      • concatenate pcmChunks → totalPcm: Uint8Array             │   │
│   │      • voice-spike-encoder.ts: prepend 44-byte WAV header       │   │
│   │      • base64-encode the WAV bytes                              │   │
│   │      • POST /v1/voice/transcribe with bearer header             │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ vigil-core (Railway api.vigilhub.io:8080)                               │
│   bearerAuth ──► requireVerifiedEmailWithGrace ──► metricsMiddleware    │
│       │                                                                 │
│       ▼                                                                 │
│   /v1/voice/transcribe (NEW spike route — TOSSABLE):                    │
│       1. userId = c.get("userId")                                       │
│       2. await requireAiBudget(userId)         [Phase 127 GUARD-03]     │
│          │ throw DailyBudgetExceededError → 429 via app.onError         │
│       3. body = await c.req.json() { audio: string }                    │
│       4. assertAudioSessionWithinCap(body.audio)   [Phase 127 GUARD-02] │
│          │ throw AudioSessionTooLongError → 413 via app.onError         │
│       5. wav = Buffer.from(body.audio, 'base64')                        │
│       6. file = await toFile(wav, 'voice.wav')                          │
│       7. text = await openai.audio.transcriptions.create({              │
│             file, model: 'gpt-4o-mini-transcribe'                       │
│          }).then(r => r.text)                                           │
│       8. db.insert(thoughts).values({                                   │
│             userId, content: text, source: 'g2_voice',                  │
│             cloudKitRecordID: crypto.randomUUID()                       │
│          }).returning()                                                 │
│       9. fire-and-forget triage (mirror process-audio.ts:172-194)       │
│      10. return { id, content }                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ Postgres (thoughts table)     │
                  │ source = 'g2_voice'           │
                  │ source column is freeform     │
                  │ text — no enum constraint     │
                  └───────────────────────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ PWA (vigil-pwa)               │
                  │ useThoughts: 30s setInterval  │
                  │ (NOT 2s as CONTEXT claims —   │
                  │  see DRIFT-02)                │
                  └───────────────────────────────┘
```

### Recommended Project Structure (additions only)

```
vigil-g2-plugin/
├── src/
│   ├── navigation.ts           # ADD: Screen.VOICE_SPIKE entry + SCREEN_ORDER + buildScreen branch
│   ├── screens/
│   │   └── voice-spike.ts      # NEW (TOSSABLE) — TS module building TextContainerProperty
│   └── lib/
│       └── audio-session-guard.ts  # UNCHANGED — Phase 127 GUARD-02; spike imports `safeAudioControl`
├── scripts/
│   ├── check-verified.mjs      # UNCHANGED — existing pack-time gate
│   └── voice-spike-encoder.ts  # NEW (TOSSABLE) — 44-byte WAV header + base64 encode helper
└── app.json                    # MODIFY — add "g2-microphone" permission entry

vigil-core/
├── src/
│   ├── routes/
│   │   └── voice-spike.ts      # NEW (TOSSABLE) — minimal /v1/voice/transcribe scaffold
│   ├── ai/
│   │   └── transcribe-spike.ts # NEW (TOSSABLE) — lazy-init OpenAI client + transcribeWav helper
│   └── index.ts                # MODIFY — `app.route("/v1", voiceSpike)` after `processAudio` mount
└── package.json                # MODIFY — add "openai": "^6.37.0" to dependencies

.planning/phases/128a-voice-01-pcm-feasibility-spike/
├── 128a-CONTEXT.md             # exists
├── 128a-RESEARCH.md            # this file
├── 128a-DISCUSSION-LOG.md      # exists (or will, from gsd-discuss-phase)
├── 128a-NN-PLAN.md             # gsd-planner output
├── 128a-SPIKE-DECISION.md      # success criterion #2
├── 128a-MEASUREMENTS.md        # raw timing + drop-out data
└── 60s-demo.mp4                # success criterion #3 (or Loom URL captured in SPIKE-DECISION)
```

### Pattern 1: Tossable spike-code header comment

**What:** Every new file (4 files) MUST open with the canonical TOSSABLE header so future agents grep-find them at Phase 130 hardening time.

**When to use:** Every spike-only file.

**Example:**

```typescript
// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is
// spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
// Convention precedent: vigil-g2-plugin/scripts/check-verified.mjs
// (operator-facing tooling — keep checked in for regression replay).
```

Source: convention precedent in `vigil-g2-plugin/scripts/check-verified.mjs` per STACK §"Open Questions" Q1. `[VERIFIED: STACK.md:664-665]`

### Pattern 2: Canonical 44-byte WAV header for 16kHz mono 16-bit LE

**What:** RIFF/WAVE/fmt /data chunk layout. 44 bytes fixed.

**When to use:** `vigil-g2-plugin/scripts/voice-spike-encoder.ts` — building a transcribable WAV from raw PCM `Uint8Array` chunks.

**Byte layout (little-endian unless noted):**

```
Offset  Size  Field            Value for our format
─────  ────  ───────────────  ──────────────────────────────────────
0      4     ChunkID          "RIFF" (ASCII bytes)
4      4     ChunkSize        36 + dataLen        (uint32 LE)
8      4     Format           "WAVE" (ASCII bytes)
12     4     Subchunk1ID      "fmt " (ASCII; trailing space)
16     4     Subchunk1Size    16                  (PCM)
20     2     AudioFormat      1                   (PCM = 1)
22     2     NumChannels      1                   (mono)
24     4     SampleRate       16000               (16 kHz)
28     4     ByteRate         32000               (SampleRate × NumChannels × BitsPerSample/8)
32     2     BlockAlign       2                   (NumChannels × BitsPerSample/8)
34     2     BitsPerSample    16
36     4     Subchunk2ID      "data" (ASCII bytes)
40     4     Subchunk2Size    dataLen             (uint32 LE)
44     …     PCM data         <Uint8Array bytes>
```

**Example (TypeScript, hand-rolled, zero deps):**

```typescript
// voice-spike-encoder.ts
// PHASE 128a SPIKE — TOSSABLE. (header comment as above)

const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WAVE = [0x57, 0x41, 0x56, 0x45]; // "WAVE"
const FMT  = [0x66, 0x6d, 0x74, 0x20]; // "fmt "
const DATA = [0x64, 0x61, 0x74, 0x61]; // "data"

export function buildWavBlob(pcm: Uint8Array): Uint8Array {
  const dataLen = pcm.byteLength;
  const buf = new Uint8Array(44 + dataLen);
  const dv = new DataView(buf.buffer);

  buf.set(RIFF, 0);
  dv.setUint32(4, 36 + dataLen, true);       // ChunkSize
  buf.set(WAVE, 8);
  buf.set(FMT, 12);
  dv.setUint32(16, 16, true);                // Subchunk1Size (PCM = 16)
  dv.setUint16(20, 1, true);                 // AudioFormat = PCM
  dv.setUint16(22, 1, true);                 // NumChannels = mono
  dv.setUint32(24, 16000, true);             // SampleRate
  dv.setUint32(28, 32000, true);             // ByteRate
  dv.setUint16(32, 2, true);                 // BlockAlign
  dv.setUint16(34, 16, true);                // BitsPerSample
  buf.set(DATA, 36);
  dv.setUint32(40, dataLen, true);           // Subchunk2Size
  buf.set(pcm, 44);
  return buf;
}

export function wavToBase64(wav: Uint8Array): string {
  // Browser-safe: btoa requires a binary string
  let binary = '';
  for (let i = 0; i < wav.length; i++) binary += String.fromCharCode(wav[i]);
  return btoa(binary);
}
```

Source: WAV canonical spec confirmed against multiple references (the same 44-byte layout used by every minimal PCM-to-WAV helper in the wild). `[CITED: https://docs.fileformat.com/audio/wav/]` `[CITED: http://soundfile.sapp.org/doc/WaveFormat/]`

**Verification step:** After first 5s recording, base64-encode and `console.log` the WAV blob (filtered through GUARD-01 — name the variable `bytes`/`wavB64`, NEVER `audioPcm`/`audioBuffer`). Operator copies to Mac: `printf '%s' '<base64>' | base64 -d > test.wav && afplay test.wav` → verifies "one one-thousand, two one-thousand" count is intelligible. **This is PASS GATE 1** per STACK §"Day 1 Hour 4". `[VERIFIED: STACK.md:586-591]`

### Pattern 3: OpenAI SDK transcription with toFile-wrapped Buffer

**What:** Canonical `openai-node` pattern for wrapping a Node Buffer as a File-like input.

**When to use:** `vigil-core/src/ai/transcribe-spike.ts` — converting decoded base64 WAV Buffer into `audio.transcriptions.create({file, model})`.

**Example:**

```typescript
// transcribe-spike.ts
// PHASE 128a SPIKE — TOSSABLE. (header comment)
//
// Lazy-init OpenAI client mirroring vigil-core/src/ai/client.ts getAIClient()
// pattern. Phase 130 productionizes under vigil-core/src/ai/transcribe.ts.

import OpenAI, { toFile } from 'openai';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function transcribeWav(wavBuffer: Buffer): Promise<string> {
  const c = getOpenAIClient();
  if (!c) throw new Error('OPENAI_API_KEY not configured');
  const file = await toFile(wavBuffer, 'voice.wav', { type: 'audio/wav' });
  const res = await c.audio.transcriptions.create({
    file,
    model: 'gpt-4o-mini-transcribe',
  });
  return res.text;
}
```

Sources: `[CITED: https://github.com/openai/openai-node README §"Audio Transcriptions"]` (toFile helper for Buffer); `[CITED: https://platform.openai.com/docs/api-reference/audio/createTranscription]` (audio.transcriptions.create); `[VERIFIED: vigil-core/src/ai/client.ts:5-19 (lazy-init Anthropic pattern this mirrors)]`.

### Pattern 4: Mirror process-audio.ts route handler shape

**What:** The new `/v1/voice/transcribe` route is a near-clone of `process-audio.ts` with: (a) Anthropic transcription swapped for OpenAI, (b) JSON `{audio}` body instead of `{audio, mediaType}` multipart-style, (c) `source: 'g2_voice'` (vs `'voice'`), (d) `assertAudioSessionWithinCap` added.

**Example:**

```typescript
// vigil-core/src/routes/voice-spike.ts
// PHASE 128a SPIKE — TOSSABLE. (header comment)

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable } from "../db/schema.js";
import { callClaude, parseAIJson } from "../ai/client.js";
import type { TriageResult } from "../ai/types.js";
import { requireAiBudget } from "../lib/ai-budget.js";
import { assertAudioSessionWithinCap } from "../lib/audio-cap.js";
import { transcribeWav, getOpenAIClient } from "../ai/transcribe-spike.js";

export const voiceSpike = new Hono();

// Triage prompt — VERBATIM copy from process-audio.ts:14-27 to avoid drift.
const TRIAGE_SYSTEM_PROMPT = `You are a thought categorizer and tagger. …`;

voiceSpike.post("/voice/transcribe", async (c) => {
  const userId = c.get("userId") as number;

  // GUARD-03 — pre-flight budget gate
  await requireAiBudget(userId);

  // Parse JSON body { audio: string }
  let body: { audio?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.audio || typeof body.audio !== "string") {
    return c.json({ error: "audio is required and must be a base64 WAV string" }, 400);
  }

  // GUARD-02 — server-side 60s byte cap
  assertAudioSessionWithinCap(body.audio);   // throws → 413 via app.onError

  // AI provider gate
  if (!getOpenAIClient()) {
    return c.json({ error: "AI service unavailable. OPENAI_API_KEY not configured." }, 503);
  }

  // Transcribe
  let transcription: string;
  try {
    const wav = Buffer.from(body.audio, "base64");
    transcription = await transcribeWav(wav);
  } catch (err) {
    console.error("[vigil-core] /voice/transcribe OpenAI call failed:",
      err instanceof Error ? err.message : err);
    return c.json({ error: "Transcription failed" }, 502);
  }
  if (!transcription.trim()) {
    return c.json({ error: "Transcription produced no text" }, 422);
  }

  // Insert thought row
  let insertedRow: typeof thoughtsTable.$inferSelect;
  try {
    const rows = await db!
      .insert(thoughtsTable)
      .values({
        userId,
        content: transcription.trim(),
        source: "g2_voice",
        cloudKitRecordID: crypto.randomUUID(),
      })
      .returning();
    insertedRow = rows[0];
  } catch (err) {
    console.error("[vigil-core] /voice/transcribe DB insert failed:", err);
    return c.json({ error: "Failed to save thought" }, 500);
  }

  // Fire-and-forget triage — mirror process-audio.ts:172-194 verbatim
  (async () => {
    try {
      const raw = await callClaude({
        system: TRIAGE_SYSTEM_PROMPT,
        userMessage: transcription.trim(),
        maxTokens: 100,
        userId,
      });
      const result = parseAIJson<TriageResult>(raw);
      await db!
        .update(thoughtsTable)
        .set({
          category: result.category,
          confidence: result.confidence,
          ...(result.category === "task" ? { taskStatus: "open" } : {}),
          ...(result.tags ? { tags: result.tags } : {}),
          ...(result.therapyClassification
            ? { therapyClassification: result.therapyClassification } : {}),
        })
        .where(and(eq(thoughtsTable.id, insertedRow.id), eq(thoughtsTable.userId, userId)));
    } catch (err) {
      console.error("[vigil-core] /voice/transcribe triage failed (non-fatal):", err);
    }
  })();

  return c.json({ id: insertedRow.id, content: insertedRow.content }, 201);
});
```

Source: `[VERIFIED: vigil-core/src/routes/process-audio.ts (full file)]` for the pattern; `[VERIFIED: vigil-core/src/index.ts:200-262 (route mount-order chain)]` for where to add `app.route("/v1", voiceSpike)`.

### Anti-Patterns to Avoid

- **Calling `bridge.audioControl(true)` directly in the spike screen** — Phase 127 GUARD-02 wraps mic-on/off via `safeAudioControl(on, bridge)` from `vigil-g2-plugin/src/lib/audio-session-guard.ts`. Direct calls bypass the cleanup-hook registration on the four exit paths (ABNORMAL_EXIT, SYSTEM_EXIT, beforeunload, onBackgroundRestore). `[VERIFIED: vigil-g2-plugin/src/lib/audio-session-guard.ts:80-140]`
- **Naming spike scaffold log variables `audio`/`pcm`/`audioPcm`/`audioBuffer`** — GUARD-01 Rail 3 source-greps `/console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i` across `routes|lib|ai|middleware` and trips CI. Use `bytes`/`chunk_n`/`gap_ms`/`wavB64`/`mic_on_ms`. `[VERIFIED: vigil-core/src/__tests__/audio-log-redaction.test.ts:117-135]`
- **Sentry breadcrumb redaction shim inside `voice-spike.ts`** — GUARD-01.2 `redactSentryEvent` already strips audio keys before network I/O at the Sentry SDK boundary. Parallel shim would drift from the source of truth. `[VERIFIED: vigil-core/src/lib/sentry.ts:91-136]`
- **Trying to register a separate `voice-spike-page.html` as a "Voice Spike" screen via `app.json`** — `app.json` has no per-screen HTML mapping; the plugin uses one root `index.html` + programmatic `RebuildPageContainer` building per-screen. See DRIFT-01.
- **Wrapping `transcribeWav` in `withBudgetTracking`** — `withBudgetTracking` is shaped for the Anthropic SDK response with `response.usage.{input_tokens, output_tokens}`. OpenAI's `audio.transcriptions.create` response has different shape (`{text}`) and is billed by audio duration not tokens. The pre-flight `requireAiBudget` gate is the gate; per-call accumulation for OpenAI audio is a Phase 130 problem, not a spike problem. `[VERIFIED: vigil-core/src/lib/ai-budget.ts:218-246]`
- **Adding new error code enum entries (`VOICE_TRANSCRIBE_TIMEOUT` etc.)** — those are VOICE-06 scope (Phase 130). Spike returns 502 with generic body. `[VERIFIED: REQUIREMENTS.md:29 VOICE-06]`
- **Modifying `audio-session-guard.ts` for spike-specific instrumentation** — Phase 127 ships this with idempotent module-state; spike must add per-recording timing via the call site, not the wrapper. `[VERIFIED: audio-session-guard.ts:60-152]`
- **Mounting `/v1/voice/transcribe` BEFORE bearerAuth** — silent-auth-bypass. Mount must follow the `app.use("/v1/*", async (c, next) => { … return bearerAuth(c, next); })` dispatcher chain at index.ts:167-176. `[VERIFIED: vigil-core/src/index.ts:167-262]`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mic-on/mic-off + cleanup | New cleanup hook plumbing | `safeAudioControl(on, bridge)` from `vigil-g2-plugin/src/lib/audio-session-guard.ts` | Phase 127 GUARD-02 already idempotently registers cleanup on all 4 exit paths; the cleanup-verification protocol (D-M4) directly exercises this wrapper `[VERIFIED: audio-session-guard.ts:80-140 + audio-session-guard.test.ts (6 cases)]` |
| 60s byte cap | New body-size check | `assertAudioSessionWithinCap(b64)` from `vigil-core/src/lib/audio-cap.ts` | Phase 127 GUARD-02; throws `AudioSessionTooLongError` → 413 with locked code `AUDIO_SESSION_TOO_LONG` via app.onError `[VERIFIED: audio-cap.ts:73-77]` |
| Daily AI budget gate | New per-user cost watermark | `requireAiBudget(userId)` from `vigil-core/src/lib/ai-budget.ts` | Phase 127 GUARD-03; throws `DailyBudgetExceededError` → 429 via app.onError; default cap $0.50/day `[VERIFIED: ai-budget.ts:177-191]` |
| OpenAI client init | Bare `new OpenAI()` at module top | Lazy `getOpenAIClient()` pattern mirroring `getAIClient()` | Local-dev shape: `OPENAI_API_KEY` unset → returns null → 503; no boot crash `[VERIFIED: ai/client.ts:5-19]` |
| Buffer → File for OpenAI SDK | `new File([buf], 'voice.wav', ...)` (Node 18+ global) | `await toFile(buf, 'voice.wav', { type: 'audio/wav' })` | Canonical openai-node helper; survives platform quirks `[CITED: https://github.com/openai/openai-node README]` |
| WAV header building | `wavefile` npm dep | Hand-rolled 30-LOC `buildWavBlob(pcm)` in voice-spike-encoder.ts | Adds dep for ~30 LOC of little-endian byte writes; PCM-to-WAV is a solved 44-byte header `[VERIFIED: STACK.md:516 (alternatives table)]` |
| Audio log redaction | Per-route filter shim | Existing GUARD-01 three rails (PostHog BLOCKED_PROPERTY_NAMES + Sentry redactSentryEvent beforeSend + console drift detector) | Three rails are already in place at the redaction tier; spike must NOT add a parallel shim `[VERIFIED: __tests__/audio-log-redaction.test.ts]` |
| `thoughts.source` enum | New CHECK constraint or enum migration | Insert `'g2_voice'` directly | Column is freeform `text("source").notNull()`; comment says "text, voice, image" but is NOT enforced by DB `[VERIFIED: vigil-core/src/db/schema.ts:99]` |
| Triage fan-out | New thought-categorizer pipeline | Fire-and-forget `callClaude({system: TRIAGE_SYSTEM_PROMPT, …})` mirroring `process-audio.ts:172-194` | Same triage prompt + same `parseAIJson` shape — drift between voice triage and process-audio triage is a known foot-gun; reuse `[VERIFIED: process-audio.ts:14-27, 172-194]` |
| 60s portfolio Loom shape | New format | Mirror Phase 125 60s portfolio demo arc | Pattern precedent: `Phase 125 G2-POLISH-08` 60s portfolio demo. Suggested arc in CONTEXT §Specific Ideas `[VERIFIED: CONTEXT.md:219]` |

**Key insight:** Phase 127 + 127.5 ship 4 guardrails + 1 audit verdict that this spike INHERITS verbatim. Every "don't hand-roll" item maps to a code module that already exists. Spike code is glue, not foundation.

---

## Runtime State Inventory

> Phase 128a is a hardware-only feasibility spike, not a rename/refactor/migration. Each category is answered explicitly per the canonical question "After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?"

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The spike INSERTS new rows (`thoughts.source = 'g2_voice'`); does NOT migrate existing data. The `source` column is freeform `text` (verified — no enum/CHECK constraint), so the new value passes structurally. PostHog event names like `voice_captured` may emit (Claude's Discretion in CONTEXT) — must be GUARD-01-compliant property names. | None — new data, no migration |
| Live service config | OpenAI API key (`OPENAI_API_KEY`) — NEW Railway env var, NOT in git. Per `[Anthropic key sprawl]` memory: same drift pattern. Per `[Railway variables leak]` memory: use `railway variables get OPENAI_API_KEY` not full dump. Even Hub developer portal allowlist for `g2-microphone` permission — operator action (C-2). | C-1 + C-2 wallclock checkpoints |
| OS-registered state | None. Spike does not register Windows Task Scheduler tasks, pm2 processes, launchd plists, or systemd units. The G2 microphone is hardware-controlled by Even Hub OS via `audioControl`. | None |
| Secrets / env vars | `OPENAI_API_KEY` (new) — server-only. `[Vigil bearer plumbing in Settings]` memory: never reach G2 plugin or PWA. `VIGIL_DAILY_AI_BUDGET_USD` (existing) — controls GUARD-03 cap. | C-1 wallclock checkpoint |
| Build artifacts / installed packages | `openai` npm package — NEW dep in `vigil-core/package.json`. `package-lock.json` will update. No egg-info / compiled binaries / Docker image rebuilds required beyond the standard Railway re-deploy. | Plan should include `npm install openai@^6.37.0` in vigil-core followed by Railway re-deploy verification (`/v1/health` check). |

---

## Common Pitfalls

### Pitfall 1: HTML-file-as-screen architectural mismatch (DRIFT-01)

**What goes wrong:** CONTEXT D-G1 + D-A2 reference `vigil-g2-plugin/scripts/voice-spike-page.html` as if HTML files map to G2 screens. They don't. The plugin has exactly ONE `index.html` (the iPhone WebView splash); all G2 screens are built programmatically by TS modules returning `RebuildPageContainer` instances containing `TextContainerProperty` constructors (and occasionally list containers).

**Why it happens:** "WebView plugin" implies HTML-per-screen routing for anyone familiar with web SPAs. The Even Hub SDK breaks that assumption — the WebView only paints the splash; everything else is the SDK's native renderer driven by JS objects (containers) submitted via `createStartUpPageContainer` / `RebuildPageContainer`.

**How to avoid:** Build the spike screen as a TS module at `vigil-g2-plugin/src/screens/voice-spike.ts` mirroring `companion.ts`. Add a `Screen.VOICE_SPIKE` entry to the `Screen` const + `SCREEN_ORDER` + `buildScreen` switch in `navigation.ts`. The "voice-spike-page.html" path in CONTEXT D-A2 should be reinterpreted as voice-spike.ts (TS module) OR (if the planner prefers to preserve the path for grep-discoverability of tossable code) created as a non-functional doc file documenting the spike-screen behavior.

**Warning signs:** Spike pack failure with `RebuildPageContainer` shape mismatch; the screen renders nothing; `console.log` shows no events from the spike screen.

**Source:** `[VERIFIED: vigil-g2-plugin/index.html (only HTML); vigil-g2-plugin/src/navigation.ts:24-43 (Screen const + SCREEN_ORDER); vigil-g2-plugin/src/screens/companion.ts:377-415 (TextContainerProperty pattern)]`

### Pitfall 2: PWA dashboard 30s polling cadence breaks 8s E2E latency budget (DRIFT-02)

**What goes wrong:** CONTEXT D-M1 says "row visible in PWA dashboard polling at 2-second interval (existing dashboard refresh cadence)." The actual cadence is **30 seconds** (`vigil-pwa/src/hooks/useThoughts.ts:87: setInterval(() => { … }, 30_000)`). The `vigil:thought-created` window event provides faster fan-out, but it's a same-tab event dispatched by `AudioUploadSection.tsx:54` / `usePhotoUpload.ts:182` — a G2-originated POST to `/v1/voice/transcribe` does NOT fire it in the PWA tab. The 8s VOICE-06 acceptance criterion is unreachable through pure dashboard polling — average wait is 15s, p95 is ~29s.

**Why it happens:** CONTEXT was written without verifying the cadence in code; the author may have remembered Phase 124 SSE work and conflated it with thought polling.

**How to avoid:** Measure `e2e_latency` from `DOUBLE_CLICK_EVENT` stop → HTTP 200 of `/v1/voice/transcribe` (server-side completion), NOT to PWA dashboard render. This still tests the full transcription pipeline and satisfies VOICE-06's intent (utterance-end to system-confirmed-capture). Document the dashboard-render lag separately as an observation, and flag in `SPIKE-DECISION.md` that Phase 130 must add SSE fan-out (via the existing AgentEventBus pattern) to make dashboard-render under 8s. **The 60s Loom demo can use a manual browser refresh to make the row appear within camera frame — that's a Loom-shaping question, not a verdict-affecting one.**

**Warning signs:** Operator runs spike and the row appears 25 seconds after stop-record on the dashboard despite transcription itself taking 800ms — PASS verdict written based on dashboard render would falsely BLOCK.

**Source:** `[VERIFIED: vigil-pwa/src/hooks/useThoughts.ts:81-87 (30s poll); AudioUploadSection.tsx:54, usePhotoUpload.ts:182 (vigil:thought-created emitters)]`

### Pitfall 3: Stale OpenAI SDK version pin in STACK.md (DRIFT-03)

**What goes wrong:** STACK.md §"Version Compatibility" says `openai@^4.79.0` is the latest stable. Verified via `npm view openai version` on 2026-05-12: **`6.37.0`** is current latest (dist-tag `latest`). Caret pinning `^4.79.0` would resolve to `4.x.x` (since SemVer caret blocks major-version jumps) and miss every release since approximately mid-2025.

**Why it happens:** STACK research is dated 2026-05-11 (one day before this research) but quotes "(latest stable as of May 2026)" — that text is training-data stale and the researcher didn't verify against the registry.

**How to avoid:** Pin the dependency as `"openai": "^6.37.0"` (or `^6.0.0` to allow any v6 update). The `toFile` import path and `audio.transcriptions.create` signature are stable across the v4→v6 jump per the openai-node README and CHANGELOG inspection — no breaking changes for our use case.

**Warning signs:** `npm install openai@^4.79.0` installs a 4.x version; `import { toFile } from 'openai'` may still work but other downstream OpenAI features lag.

**Source:** `[VERIFIED: npm view openai version → 6.37.0; npm view openai dist-tags → {latest: '6.37.0'}]`

### Pitfall 4: Hard-coded enum integers vs OsEventTypeList named enum (carryforward from Phase 127)

**What goes wrong:** Writing `if (event.sysEvent?.eventType === 3)` instead of `=== OsEventTypeList.DOUBLE_CLICK_EVENT`. RESEARCH §A6 (Phase 127) locks named-enum references because the SDK could renumber the integers in a future release.

**Why it happens:** Easier to write; integer matches the SDK README table verbatim.

**How to avoid:** Always import `OsEventTypeList` from `@evenrealities/even_hub_sdk` and reference named members. The audio-session-guard.ts:89-99 pattern is the canonical example.

**Warning signs:** A spike commit grep finds `=== 3 ||` or `=== 0 ||` in a guarded comparison.

**Source:** `[VERIFIED: vigil-g2-plugin/src/lib/audio-session-guard.ts:89-99 (named-enum pattern); EVEN-SKILLS.md:16-29 (OsEventTypeList table)]`

### Pitfall 5: Mixing JSON-base64 body with `c.req.parseBody()` multipart parsing

**What goes wrong:** STACK §1c sketches `/v1/voice/transcribe` with `c.req.parseBody()` returning a `File`. CONTEXT D-W2 step 3 locks JSON body `{audio: string}`. If the planner copies STACK verbatim and the plugin sends JSON-base64, parseBody returns `{}` and the route 400s.

**Why it happens:** STACK was written with a generic multipart-upload shape (mirroring `process-photo.ts`); CONTEXT then refined to JSON-base64 to match VOICE-04's "single base64 blob per utterance" spec.

**How to avoid:** Route handler uses `await c.req.json()` returning `{audio: string}`. The Buffer is decoded via `Buffer.from(body.audio, 'base64')`.

**Warning signs:** Plugin POST succeeds with 400 `{error: "audio is required"}` even though the body looks correct.

**Source:** `[VERIFIED: CONTEXT.md D-W2 step 3; REQUIREMENTS.md VOICE-04 line 27]`

### Pitfall 6: Battery measurement contaminated by Headless WebView replay

**What goes wrong:** D-M3 protocol says read `batteryLevel` from `onDeviceStatusChanged` at t=0 and t=60min. If the iPhone backgrounds the plugin mid-hour and Even Hub spins up a Headless WebView to keep state alive, the active mic during background may drain at a different rate than foreground push-to-record — and the `onDeviceStatusChanged` event in the headless context may report stale values.

**Why it happens:** Even Hub's background-state architecture replays a snapshot in a fresh WebView; subscribed event handlers from the original WebView are dropped, so the `bridge.onDeviceStatusChanged` registration may not re-fire automatically.

**How to avoid:** Operator keeps iPhone foreground for the full 2-hour battery-delta protocol (per CONTEXT D-R1 mode 3 — same foreground/background state across both halves). If the iPhone screen locks, treat the half as invalid and restart from 100% charge.

**Warning signs:** Battery delta in second half is suspiciously similar to first half (suggests mic didn't actually activate during the push-to-record clips because the WebView replay dropped the gesture handler).

**Source:** `[VERIFIED: EVEN-SKILLS.md:69-91 (background state replay semantics); audio-session-guard.ts:5-21 (replay defensive cleanup hook)]`

### Pitfall 7: Spike route mounted before bearerAuth dispatcher (silent auth bypass)

**What goes wrong:** `app.route("/v1", voiceSpike)` placed above line 167 in `vigil-core/src/index.ts` would mount the route before the bearer auth dispatcher, making transcription open to the public internet. Per the mount-order convention documented in index.ts:214-218 (and the WR-02 mount-order comment block referenced there), routes must be mounted AFTER the dispatcher.

**Why it happens:** Misreading index.ts route order; placing voiceSpike alphabetically near `authMe` / `auth-me` / `auth` block.

**How to avoid:** Mount immediately after `app.route("/v1", processAudio)` (line 221). The dispatcher at lines 167-176 + `requireVerifiedEmailWithGrace` at line 182 + `metricsMiddleware` at line 195 chain together to enforce authenticated, verified, measured access. voiceSpike inherits all three by mount-order.

**Warning signs:** Route works without `Authorization: Bearer …` header.

**Source:** `[VERIFIED: vigil-core/src/index.ts:167-262 + mount-order.test.ts pattern referenced in sentry.ts:11-15]`

### Pitfall 8: Permission-revocation probe runs in the same session as the success path

**What goes wrong:** D-G3 says "Run one cycle with permission revoked (Even Hub UI) to observe `audioControl(true)`'s error mode." If this runs IN THE SAME session as the 12 successful recordings, the revocation may persist through the rest of the run (Even Hub permission cache lifetime is undocumented) and contaminate the cleanup-verification step (D-M4) by making subsequent `audioControl(true)` calls reject before the cleanup wrapper even registers.

**Why it happens:** Operator wants to minimize spike wallclock by combining probes.

**How to avoid:** Sequence:
1. C-2: verify permission allowlist
2. Day 1 hours 1-4 (per STACK §"Concrete VOICE-01 Spike Scope"): all 10 short clips + the 55s near-cap clip + PASS GATE 1 intelligibility check
3. Day 2 hours 1-3: latency characterization + drop-out modes + end-to-end transcription
4. **Then** D-G3 permission-revocation probe (one shot, captured to MEASUREMENTS.md)
5. **Then** D-M4 cleanup verification (5 force-quit cycles) — note these run AFTER permission revocation but with permission re-granted explicitly between D-G3 and D-M4

**Warning signs:** All 5 cleanup cycles in D-M4 fire `audioControl(false)` instantly because `audioControl(true)` already rejected — yielding false-PASS on cleanup.

**Source:** Inference from CONTEXT D-G3 + D-M4 + STACK §"Day 1/Day 2 hour-by-hour" sequencing; no direct citation but flagged because the sequencing isn't explicit in CONTEXT and the planner needs to make this call. `[ASSUMED]`

---

## Code Examples

Already provided inline above under **Pattern 1-4**. Cross-references:

- **WAV header construction:** Pattern 2 (above)
- **OpenAI SDK transcription with toFile:** Pattern 3 (above)
- **Spike route handler shape:** Pattern 4 (above)
- **safeAudioControl call site:** see `[VERIFIED: vigil-g2-plugin/src/lib/audio-session-guard.ts:80-140]`
- **Triage fan-out:** mirrors `[VERIFIED: vigil-core/src/routes/process-audio.ts:172-194]` verbatim — TRIAGE_SYSTEM_PROMPT must be copied (not re-generated) to avoid prompt drift between voice paths.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenAI `whisper-1` ($0.006/min, 2.1s latency) | OpenAI `gpt-4o-mini-transcribe` ($0.003/min, 500-1500ms) | Q1 2026 | 50% cost reduction, 60% latency reduction; default for new transcription work `[CITED: https://tokenmix.ai/blog/gpt-4o-transcribe-vs-whisper-review-2026]` |
| `openai@4.x` Node SDK | `openai@6.x` Node SDK | Major release jump approximately Aug 2025 — Mar 2026 | `toFile` import + `audio.transcriptions.create` signature stable; new resource interfaces, improved streaming types `[VERIFIED: npm view openai dist-tags]` |
| Anthropic Files API for audio transcription | OpenAI `gpt-4o-mini-transcribe` | (always; Anthropic never supported audio MIME types) | Anthropic Files API only accepts `application/pdf`, `text/plain`, `image/jpeg|png|gif|webp` — verified at platform.claude.com/docs/en/docs/build-with-claude/files. Anthropic's own cookbook uses Deepgram. `[VERIFIED: STACK.md:638-639]` |
| Sentry v7 Hub API | Sentry v10 `withScope` functional API | Sentry v8+ release | Vigil ships v10 (`@sentry/node@^10.52.0`). DO NOT reintroduce pre-v8 surface. `[VERIFIED: vigil-core/src/lib/sentry.ts:25-29]` |

**Deprecated / outdated:**
- `wavefile` npm package for header construction — overkill for the 30-LOC hand-roll; STACK §"Stack Patterns" rejects.
- `multer` / `formidable` for multipart parsing in Hono — Hono provides `c.req.parseBody()` natively; CONTEXT D-W2 step 3 also takes us off multipart entirely (JSON-base64).
- `pgvector` + embeddings at <10k thoughts — premature optimization; FTS handles current scale (~607 thoughts).
- Local Whisper on Railway — $-per-min cloud transcription cheaper at single-user scale.

---

## Assumptions Log

> Claims tagged `[ASSUMED]` need user confirmation before becoming locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Permission-revocation probe (D-G3) and cleanup verification (D-M4) must be sequenced with permission RE-GRANTED between them to avoid contaminating the cleanup-cycle test | Pitfall 8 | If wrong: 5 cleanup cycles report false-PASS because `audioControl(true)` is rejecting at the permission boundary rather than reaching the cleanup wrapper; the verdict misreads "cleanup robust" when reality is "cleanup never had a mic to clean up". Operator should validate the permission cache lifetime on first revoke-and-re-grant attempt during the spike. |
| A2 | The `60s-demo.mp4` portfolio Loom can use a manual browser refresh to make the dashboard row appear within camera frame (Pitfall 2 workaround) | Pitfall 2 | If wrong: operator films a 60s Loom that includes a 15-25s gap of dead-air while the PWA polls, which looks broken. The author needs to decide if that's acceptable for the portfolio or if a stub SSE push (one-line add to voice-spike.ts) is in scope. Recommend: stay tossable; manual refresh is fine. |
| A3 | `voice-spike-page.html` path from CONTEXT D-A2 should be reinterpreted as `voice-spike.ts` (TS module) given the actual plugin architecture | DRIFT-01 | If wrong: planner spends a task writing a non-functional HTML file. Low-blast-radius — the task fails fast at "screen doesn't render" and gets rewritten as a TS module. Recommend planner just go directly to TS module and document the architectural reality in PLAN.md. |
| A4 | OpenAI `gpt-4o-mini-transcribe` is still available and still priced at $0.003/min on 2026-05-12 | Standard Stack §"NEW" | If wrong: spike fails at first transcription with 404 model-not-found or with a billing surprise. The operator's first transcription test (Day 2 Hour 3 from STACK §"Concrete VOICE-01 Spike Scope") catches this immediately. |
| A5 | `vigil-g2-plugin` does not bundle `scripts/` into the `.ehpk` pack output (per `npm run pack`); the spike scaffold therefore doesn't bloat the production plugin | CONTEXT D-A3 | If wrong: spike code ships to Even Hub reviewer in v0.4.0+ rebundle; reviewer may reject for unverified scripts. The CONTEXT says "Verified by inspecting `npm run pack` output bundle size" — operator action item, recommend planner add a bundle-size check task before any post-spike rebundle. |
| A6 | The `thoughts.source` column accepts `'g2_voice'` without DB-level constraint rejection | Code Examples Pattern 4 | If wrong: insert fails at runtime, route returns 500. Confirmed against `schema.ts:99` — column is `text("source").notNull()` with a comment `// text, voice, image` but NO check constraint or enum. Cross-checked against the `process-audio.ts:158-164` insert which uses `source: 'voice'` and works. **Very low risk; treating as `[VERIFIED]` but flagging here because future migrations might add a CHECK.** |

**If this table grew to >10 items, that would be a research-quality flag.** 6 items is normal for a spike with this much pre-locked context.

---

## Open Questions

1. **Should the spike screen be added to `SCREEN_ORDER` (carousel-navigable from Home via swipe) or be hidden (only reachable via a deep-link or `bridge.callEvenApp` invocation)?**
   - What we know: Carousel adds a 5th slot users see daily; hiding requires a deep-link mechanism that may not exist in the SDK.
   - What's unclear: Whether the spike author wants the operator to swipe past "Voice Spike" between Home / Companion / Work Orders / Affirmation in normal use, or whether the screen should only appear in a "spike-mode" build.
   - Recommendation: Add to `SCREEN_ORDER` for the spike-running operator (one user, one device), use the planner-discretion "keep checked in" flag (CONTEXT Claude's Discretion §3) — delete the screen entry when Phase 130 productionizes a real "Voice" screen.

2. **What's the minimum regression test for `voice-spike.ts` / `transcribe-spike.ts` that the planner SHOULD include despite CONTEXT explicitly skipping drift detectors?**
   - What we know: CONTEXT Claude's Discretion §4 says "Drift-detector tests for the spike scaffold are explicitly skipped." But the existing GUARD-01 audio-log-redaction.test.ts Rail 3 walks `routes|lib|ai|middleware/**/*.ts` and may trip on the spike's `console.log` calls if any variable is named `audio*`/`pcm*`. The test runs in CI on every commit.
   - What's unclear: Whether "spike scaffold files (`voice-spike.ts`, `transcribe-spike.ts`, `voice-spike-encoder.ts`) get auto-safe-listed in audio-log-redaction.test.ts" should be a one-line PR or whether the spike author should write log lines that pass the existing regex without a safe-list addition.
   - Recommendation: **Write log lines that pass the regex without safe-list changes.** Use `bytes`/`chunk_n`/`gap_ms`/`mic_on_ms`/`wavB64` variable names; never use `audio` or `pcm` tokens in any string passed to `console.*`. This preserves the GUARD-01 invariant without touching the drift detector — keeping it tossable.

3. **Does the spike need any unit test at all?**
   - What we know: Spike code is tossable; CONTEXT explicitly skips drift detectors; `safeAudioControl` already has 6 tests in `audio-session-guard.test.ts`; `assertAudioSessionWithinCap` already has tests in `audio-cap.test.ts` (verified via file presence in routes/__tests__).
   - What's unclear: Whether the planner should add ONE smoke test for the spike route — e.g., `voice-spike.test.ts` — to catch (a) auth chain breakage at mount-order regression and (b) the `transcribeWav` mock returning `{text}` shape.
   - Recommendation: **One node:test smoke test in `vigil-core/src/routes/__tests__/voice-spike.test.ts`** — mock `transcribeWav` to return `{text: 'hello'}`, assert 201 + `{id, content: 'hello'}`. Total cost: ~15 LOC. Prevents Phase 130's first task from inheriting a broken spike route. The test is itself tossable and gets deleted alongside `voice-spike.ts`.

4. **Should the spike emit any PostHog events?**
   - What we know: CONTEXT discretion-area #1 lists "Console log format for measurement events — researcher/planner pick (must be Phase 127 GUARD-01 redaction-compatible)." PostHog events would be additionally CI-checked via Rail 1 (BLOCKED_PROPERTY_NAMES) and Rail 2 (Sentry beforeSend).
   - What's unclear: Whether the planner wants spike measurements to land in PostHog (for cross-spike comparison and future-spike replay) or stay in `console.*` (operator-facing only) + MEASUREMENTS.md tabulation.
   - Recommendation: **Stay console-only.** Spike is tossable; PostHog drift detector adds a maintenance surface that disappears when spike code is deleted; raw `console.time`/`console.timeEnd` + manual log copy into MEASUREMENTS.md is faster for the spike author. Phase 130 productionizes the PostHog events as `voice_captured` (per STACK §1c snippet at line 151).

5. **Sentry breadcrumbs from spike route — auto-redacted or needs explicit safe-listing?**
   - What we know: GUARD-01.2 `redactSentryEvent` runs as `beforeSend` and strips audio keys from `event.extra` / `event.contexts` / `event.breadcrumbs[].data`. The spike route's `console.error` calls flow into Sentry breadcrumbs automatically (via Sentry's default `console` integration if enabled — verify in initSentry config).
   - What's unclear: Whether the spike's `console.error("[vigil-core] /voice/transcribe OpenAI call failed: ...", err.message)` could ever embed an audio-PCM-shaped value in the message string (e.g., if OpenAI returns a 413 with the file size encoded).
   - Recommendation: **Sanity-check audio-free messaging.** Spike's `console.error` messages reference only route name + error message (`err.message`); the error message from OpenAI SDK for transcription failures never includes audio bytes. No safe-listing needed. `[ASSUMED-low-risk]`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `openai` npm package | `transcribe-spike.ts` (vigil-core) | ✓ (will install via `npm install openai@^6.37.0`) | 6.37.0 (latest) | — |
| OpenAI API endpoint (`api.openai.com/v1/audio/transcriptions`) | Day 2 Hour 3 end-to-end test | ✓ (public, requires `OPENAI_API_KEY`) | — | — |
| `OPENAI_API_KEY` Railway env var | vigil-core runtime | ✗ (not yet set) | — | C-1 operator action |
| `g2-microphone` permission in Even Hub developer portal | Plugin runtime | ? (depends on Even portal allowlist) | — | If rejected: spike halts at BLOCK per D-G2 |
| Physical G2 hardware | All spike measurement | ✓ (operator's personal G2 pair) | — | — |
| Physical iPhone with Even Hub installed | All spike measurement | ✓ (operator's personal iPhone) | — | — |
| Railway production deploy of vigil-core | `/v1/voice/transcribe` reachable from plugin | ✓ (`api.vigilhub.io`, custom domain live 2026-04-08) | — | — |
| `@evenrealities/even_hub_sdk@^0.0.9` | Plugin SDK calls | ✓ | 0.0.9 (per `vigil-g2-plugin/package.json:18`) | — |
| `tsx --test` test runner | Smoke test in `voice-spike.test.ts` (if Open Q3 lands) | ✓ | tsx@^4.19.0 | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- `OPENAI_API_KEY` not yet set → C-1 wallclock checkpoint resolves it.
- `g2-microphone` permission not yet allowlisted → C-2 wallclock checkpoint resolves it; rejection becomes the BLOCK signal per D-G2.

---

## Validation Architecture

> Phase 128a is a **tossable spike** by design. CONTEXT explicitly skips drift-detector tests. However, the test framework + one smoke test (Open Q3 recommendation) protects against spike-commit-time regression of the Phase 127 guardrails the spike INHERITS. VOICE-08 (Phase 130) will pin the production drift detectors — this section defines what minimum surface the spike should carry forward.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `tsx --test` (Node's built-in `node:test`) + `node:assert/strict` |
| Config file | None — script line in `package.json:9` (vigil-core) and `package.json:14` (vigil-g2-plugin) |
| Quick run command (vigil-core) | `cd vigil-core && npx tsx --test src/routes/__tests__/voice-spike.test.ts` |
| Full suite command (vigil-core) | `cd vigil-core && npm test` |
| Quick run command (vigil-g2-plugin) | `cd vigil-g2-plugin && npm test` |
| Full suite command (vigil-g2-plugin) | `cd vigil-g2-plugin && npm test` |

`[VERIFIED: vigil-core/package.json:9, vigil-g2-plugin/package.json:14]`

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-01 | Spike-decision authoring (writes `128a-SPIKE-DECISION.md` with verdict) | manual-only | — (operator wallclock checkpoint C-5 + SPIKE-DECISION.md commit) | N/A |
| VOICE-01 | `/v1/voice/transcribe` route mounted with bearerAuth + emails-verified chain | unit smoke | `cd vigil-core && npx tsx --test src/routes/__tests__/voice-spike.test.ts` | ❌ Wave 0 — planner creates |
| VOICE-01 | `safeAudioControl` cleanup integration unchanged after spike scaffold lands | regression | `cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/audio-session-guard.test.ts` | ✅ exists (6 cases) |
| VOICE-01 | `assertAudioSessionWithinCap` byte-cap unchanged after spike scaffold lands | regression | `cd vigil-core && npx tsx --test src/lib/__tests__/audio-cap.test.ts` | ✅ exists (verified via file presence; not exhaustively read) |
| VOICE-01 | `requireAiBudget` chokepoint unchanged after spike scaffold lands | regression | `cd vigil-core && npx tsx --test src/lib/__tests__/ai-budget.test.ts` | ✅ exists (verified via file presence) |
| VOICE-01 | GUARD-01 audio log redaction not regressed by spike scaffold | regression | `cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts` | ✅ exists (3 rails) |
| VOICE-01 (hardware) | E2E latency ≤ 8s (PASS) / ≤ 15s (DEGRADE) / > 15s (BLOCK) | manual-only | — (operator measures + records in MEASUREMENTS.md) | N/A — empirical |
| VOICE-01 (hardware) | Drop-out events ≤ 1 / 2-5 / > 5 per 60s | manual-only | — | N/A — empirical |
| VOICE-01 (hardware) | Battery delta ≤ 15pp / 15-30pp / > 30pp per hour | manual-only | — | N/A — empirical |
| VOICE-01 (hardware) | `audioControl(false)` cleanup on 5/5 force-quit cycles | manual-only | — (operator inspects console + battery telemetry) | N/A — empirical |

### Sampling Rate

- **Per task commit:** `cd vigil-core && npm test` (regression rail; catches mount-order breakage and any GUARD-01 Rail 3 false-trip on spike-code log strings)
- **Per wave merge:** `cd vigil-core && npm test && cd ../vigil-g2-plugin && npm test` (full both-package suite)
- **Phase gate:** Full suite green + manual hardware verdict in `128a-SPIKE-DECISION.md` + signed-off `60s-demo.mp4` before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vigil-core/src/routes/__tests__/voice-spike.test.ts` — minimum: mock `transcribeWav` → assert 201 + `{id, content}` + assert route mounted under bearerAuth chain (covers Pitfall 7). ~15-25 LOC. Tossable; deleted alongside `voice-spike.ts` when Phase 130 lands.
- [ ] Bundle-size check task — operator runs `cd vigil-g2-plugin && npm run pack` and inspects output to verify `scripts/voice-spike-*.{ts,html}` are NOT in the `vigil.ehpk` bundle (per D-A3). One-task PLAN.md item.

*(Drift detectors for the spike scaffold itself: explicitly skipped per CONTEXT Claude's Discretion §4. VOICE-08 in Phase 130 pins them.)*

### What Future Changes Could Silently Break the Verdict?

Even though spike code is tossable, the **verdict it produces** locks Phase 130's scope. The four conditions below would invalidate the verdict if they regress:

1. **`safeAudioControl` cleanup wrapper drops one of the 4 exit hooks.** Mitigation: `audio-session-guard.test.ts` already pins all 4 paths + idempotency + no-op-when-inactive (6 cases). PASS-this-test → cleanup verdict valid.
2. **`assertAudioSessionWithinCap` cap drift (60s → some other value).** Mitigation: `audio-cap.ts` literal-locks `MAX_PCM_BYTES = 60 * 16_000 * 2`; `audio-cap.test.ts` pins the constants per Phase 103 D-04 literal-lock pattern.
3. **`requireAiBudget` cap regression** (e.g., `DEFAULT_CAP_USD = 0.50` flipping). Mitigation: `ai-budget.test.ts` `__readCapUsdForTest` re-export pins the math.
4. **GUARD-01 Rail 3 safe-list addition for spike code.** If the spike author adds `voice-spike.ts` to the safe-list to bypass the redaction regex, future audio-PCM leaks via that file go uncaught. Mitigation: write log lines that pass the regex without safe-list changes (Open Q2 recommendation).

These four checks ARE the validation surface for the spike's verdict. They run automatically in `npm test`; the spike inherits them by virtue of importing the guarded modules.

---

## Sources

### Primary (HIGH confidence)

- `[VERIFIED: vigil-g2-plugin/src/lib/audio-session-guard.ts (full file)]` — `safeAudioControl(on, bridge)` wrapper signature + 4 exit-path registration + idempotency
- `[VERIFIED: vigil-core/src/lib/audio-cap.ts (full file)]` — `MAX_PCM_BYTES = 1_920_000`, `MAX_AUDIO_B64_CHARS_60S = 2_560_000`, `assertAudioSessionWithinCap`, `AudioSessionTooLongError`
- `[VERIFIED: vigil-core/src/lib/ai-budget.ts (full file)]` — `requireAiBudget(userId)`, `withBudgetTracking(userId, fn)`, `DailyBudgetExceededError`, `DEFAULT_CAP_USD = 0.50`, pricing constants
- `[VERIFIED: vigil-core/src/analytics/posthog.ts (full file)]` — `BLOCKED_PROPERTY_NAMES` extended with 6 Phase-127 audio keys; `redactEvent` before_send hook
- `[VERIFIED: vigil-core/src/lib/sentry.ts (full file)]` — `redactSentryEvent` beforeSend hook + `initSentry()` mount-order contract
- `[VERIFIED: vigil-core/src/__tests__/audio-log-redaction.test.ts (read first 120 lines)]` — 3-rail drift detector (PostHog Set / Sentry beforeSend / console.* grep)
- `[VERIFIED: vigil-core/src/routes/process-audio.ts (full file)]` — pattern source for `/v1/voice/transcribe` route shape (auth → budget → body → call → insert → triage)
- `[VERIFIED: vigil-core/src/ai/client.ts (full file)]` — lazy-init Anthropic client pattern that `transcribe-spike.ts` mirrors for OpenAI
- `[VERIFIED: vigil-core/src/index.ts (lines 1-262)]` — mount-order chain: bearerAuth dispatcher → requireVerifiedEmailWithGrace → metricsMiddleware → protected routes → app.onError (with DailyBudgetExceededError 429 branch)
- `[VERIFIED: vigil-core/src/db/schema.ts:87-124]` — `thoughts` table schema: `source: text("source").notNull()` — freeform text, no enum/CHECK constraint
- `[VERIFIED: vigil-g2-plugin/src/main.ts (full file)]` — event-routing pattern + NAV_EVENTS Set + bridge wiring
- `[VERIFIED: vigil-g2-plugin/src/navigation.ts:24-43]` — Screen const + SCREEN_ORDER + buildScreen switch (the registration surface a new "Voice Spike" screen attaches to)
- `[VERIFIED: vigil-g2-plugin/index.html (full file)]` — sole HTML file in plugin; iPhone WebView splash (NOT a per-screen registration mechanism)
- `[VERIFIED: vigil-g2-plugin/app.json (full file)]` — permissions array shape; needs `g2-microphone` addition per D-G2
- `[VERIFIED: vigil-g2-plugin/package.json:18]` — `@evenrealities/even_hub_sdk: ^0.0.9` (matches EVEN-SKILLS.md / STACK.md)
- `[VERIFIED: vigil-g2-plugin/package.json:14 + vigil-core/package.json:9]` — test runner is `tsx --test`, not Vitest
- `[VERIFIED: vigil-pwa/src/hooks/useThoughts.ts:81-87]` — 30-second polling cadence (NOT 2-second as CONTEXT D-M1 claims)
- `[VERIFIED: vigil-pwa/src/components/AudioUploadSection.tsx:54 + usePhotoUpload.ts:182]` — `vigil:thought-created` window event emitter sites (same-tab only)
- `[VERIFIED: vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts (full file)]` — 6 test cases pinning safeAudioControl behavior
- `[VERIFIED: npm view openai version → 6.37.0; npm view openai dist-tags → {latest: '6.37.0', beta: '5.0.0-beta.0', alpha: '5.0.0-alpha.0', next: '4.0.0-beta.12'}]` — current openai npm release

### Primary (HIGH confidence — CITED from official docs)

- `[CITED: https://github.com/openai/openai-node README §"Audio Transcriptions"]` — canonical `toFile(Buffer.from('my bytes'), 'audio.mp3')` pattern for wrapping Node Buffer
- `[CITED: https://platform.openai.com/docs/api-reference/audio/createTranscription]` — `audio.transcriptions.create({file, model})` request shape
- `[CITED: https://docs.fileformat.com/audio/wav/]` — WAV format reference for 44-byte header
- `[CITED: http://soundfile.sapp.org/doc/WaveFormat/]` — WAV canonical spec (RIFF chunk layout)
- `[CITED: https://platform.claude.com/docs/en/docs/build-with-claude/files]` — Anthropic Files API MIME types (no audio support — verified by STACK.md §"What NOT to Use")

### Secondary (MEDIUM confidence)

- `[CITED: .planning/research/STACK.md (full file)]` — v3.9 stack research, especially §1 VOICE-01..N (lines 28-160), §"Concrete VOICE-01 Spike Scope" (lines 564-625), §"What NOT to Use", §"Version Compatibility" (note: STACK quotes `openai@^4.79.0` which is now stale — verified above as 6.37.0)
- `[CITED: .planning/research/EVEN-SKILLS.md (full file)]` — Even SDK API surface; §"Audio capture" (lines 94-118 of the GitHub-cloned skills); §"Background state" (lines 69-91); §"VOICE-01 spike — scope SHRINKS" (lines 184-200) — closed unknowns + remaining unknowns
- `[CITED: .planning/phases/128a-voice-01-pcm-feasibility-spike/128a-CONTEXT.md (full file)]` — locked decisions for this phase
- `[CITED: REQUIREMENTS.md §"Voice — G2 PCM capture" lines 23-31]` — VOICE-01..08 spec
- `[CITED: https://tokenmix.ai/blog/whisper-api-pricing]` — `gpt-4o-mini-transcribe` at $0.003/min (referenced via STACK.md)
- `[CITED: https://tokenmix.ai/blog/gpt-4o-transcribe-vs-whisper-review-2026]` — `gpt-4o-mini-transcribe` supersedes `whisper-1`

### Tertiary (LOW confidence — Phase 127.5 hardware-verified)

- `[CITED: project_g2_companion_doubletap_hardware_verified auto-memory (2026-05-10)]` — Companion DOUBLE_CLICK_EVENT fires reliably on hardware; this is the gesture spike depends on
- `[CITED: .planning/phases/127.5-g2-input-gesture-audit/127.5-AUDIT.md]` — REACTIVATE verdict for single-press; plumbing deferred to Phase 133 (spike MUST use DOUBLE_CLICK only)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every recommendation cross-referenced against live code or official docs; the one drift (openai version) flagged explicitly
- Architecture: HIGH — patterns verbatim from existing routes; DRIFT-01 caught and explained
- Pitfalls: MEDIUM — 8 listed; 7 verified from live code or shipped tests, 1 (Pitfall 8 — permission-revocation sequencing) is `[ASSUMED]` based on inference
- Validation surface: HIGH — minimum smoke test is verifiable, existing test infrastructure HAS the regression rails

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days — stable; OpenAI SDK + Even SDK both shipping cadence is monthly, so re-verify openai npm version + SDK versions if this research is older than 30 days when consumed)

---

*Phase: 128a-voice-01-pcm-feasibility-spike*
*Researcher: gsd-phase-researcher (Claude Opus 4.7 / 1M context)*
*Mode: --auto (autonomous; CONTEXT-locked decisions verified against live code, three drifts surfaced, validation surface defined for VOICE-08 inheritance)*
