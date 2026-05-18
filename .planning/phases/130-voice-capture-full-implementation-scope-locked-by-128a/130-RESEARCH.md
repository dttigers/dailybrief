# Phase 130: Voice Capture Full Implementation — Research

**Researched:** 2026-05-18
**Domain:** G2 PCM voice capture productionization — Even SDK audio, Hono server route, OpenAI transcription, Drizzle migration, SSE fan-out, offline queue, drift-detector tests
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Gesture grammar:**
- D-G1: Production gesture is `DOUBLE_CLICK_EVENT` toggle on the Voice screen. Phase 130 ships on DOUBLE_CLICK only. Single-press deferred to Phase 133.
- D-G2: Single-screen Voice screen as `vigil-g2-plugin/src/screens/voice.ts` (new file). Companion HUD hosts the "recording" indicator via cross-screen state.

**Voice screen state machine (VOICE-02, Run 4 hardening):**
- D-S1: States `[IDLE]` → `[REC m:ss]` → `[UPLOADING…]` → `[DONE]` (2s) with error branches `[NO MIC]` and `[ERR]`. Both error states render with DIFFERENT body text.
- D-S2: `safeAudioControl` returns `Promise<boolean>`. Callers capture return value; `false` → `[NO MIC]` + short-circuit.
- D-S3: Recording state lives in `main.ts` event-collector scope, not in the Voice screen's local closure.

**Upload + transcription path (VOICE-03, VOICE-04):**
- D-U1: DELETE the 5 spike files + REVERT 5 spike modifications. Then ADD production route at same path. Delete-then-add, never in-place rename.
- D-U2: Provider locked to OpenAI `gpt-4o-mini-transcribe`.
- D-U3: Endpoint shape `POST /v1/voice/transcribe` JSON body `{ audio: string; clientCaptureId: string }`. Returns `{ thoughtId: number; content: string }`. Auth chain: `bearerAuth` → `requireVerifiedEmail` → `requireAiBudget(userId)` → `assertAudioSessionWithinCap(body.audio)` → `transcribeWav(buf)` wrapped in `withBudgetTracking` → `db.insert` → `bus.publish` → return JSON.
- D-U4: `clientCaptureId` dedup primitive. Researcher picks placement. (Locked below.)

**SSE fan-out (VOICE-06):**
- D-X1: SSE REQUIRED. Must land: `bus.publish('thought-created', …)` in `voice-transcribe.ts`; new event channel on `agent-events-bus.ts`; PWA SSE subscriber on `/v1/agent-stream`; subscriber dispatches `vigil:thought-created` window event → `useThoughts.ts:127` refetch.
- D-X2: Existing in-tab `vigil:thought-created` event stays unchanged.

**Offline queue (VOICE-07):**
- D-O1: Backoff `[1s, 2s, 4s, 8s, 16s, 30s]`, max 10 queued utterances, "syncing N voice captures" HUD indicator.
- D-O2: Queue persisted in WebView `localStorage` keyed `vigil:voice-queue:v1`. Storage budget ≤ 2.1 MB.
- D-O3: Queue indicator as third body line on Companion HUD. Hidden when queue depth = 0.
- D-O4: LRU eviction when queue full; log eviction via PostHog.

**Error taxonomy (VOICE-06):**
- D-E1: Three locked-enum error codes: `VOICE_TRANSCRIBE_TIMEOUT` (HTTP 504), `VOICE_TRANSCRIBE_PROVIDER_DOWN` (HTTP 502), `VOICE_TRANSCRIBE_QUOTA` (HTTP 503).
- D-E2: Per-error PWA copy in `vigil-pwa/src/lib/api-error-codes.ts` at same shape as existing entries.
- D-E3: `DAILY_AI_BUDGET_EXCEEDED` → permanent failure (no retry), evict from queue, `[ERR]` with `daily AI cost cap hit — try tomorrow`.

**Telemetry (VOICE-08):**
- D-T1: `posthog.capture('voice_capture_completed', { stop_to_http_ms, chunks, bytes, retry_count, transcript_chars })`. No `audioPcm`/`audio`/`pcm` property names.
- D-T2: `posthog.capture('voice_capture_dropout', { gap_ms, recording_id })` for inter-arrival gaps > 2× baseline.
- D-T3: PostHog stream is operator-facing ops surface. No new admin dashboard in Phase 130.

**Drift detectors (VOICE-08):**
- D-D1: WAV header byte-for-byte pin test in `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts`.
- D-D2: Extend Phase 127 GUARD-01 drift detectors with `audioPcm`/`audio_pcm`/`pcm` grep patterns on `vigil-g2-plugin/src/` and `voice-transcribe.ts`.
- D-D3: `safeAudioControl(true,` count === `safeAudioControl(false,` count across plugin source.

**Spike cleanup (REQUIRED first):**
- D-C1: DELETE 5 files outright (see canonical list in CONTEXT.md D-C1).
- D-C2: REVERT 5 spike-only modifications (see CONTEXT.md D-C2). KEEP `g2-microphone` permission; REWORD desc.
- D-C3: CARRY FORWARD (no delete/rename): `audio-session-guard.ts`, `require-ai-budget.ts` (alias: `lib/ai-budget.ts`), `assert-audio-session-within-cap.ts` (alias: `lib/audio-cap.ts`).
- D-C4: Spike-removal commit is Plan 01, BEFORE production route plans.

### Claude's Discretion

(Resolved below in Gray Area Resolutions section)

### Deferred Ideas (OUT OF SCOPE)

- Ambient continuous capture mode (v3.10+)
- Multipart upload shape for PWA voice
- Word-level transcript timestamps (whisper-1)
- Streaming chunked PCM upload
- Deepgram fallback
- Per-recording table view in PWA Settings
- Phase 133 single-press plumbing patch
- Battery-aware queue throttling
- Portfolio Loom demo (waived — G2 lenses not screen-mirrorable)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-02 | G2 plugin requests `g2-microphone` permission; push-to-record gesture triggers `audioControl(true)` via DOUBLE_CLICK | Permission already in `app.json`; gesture path hardware-verified; state machine with Run 4 hardening required |
| VOICE-03 | G2 plugin renders visible "recording" indicator (LED-style) on Companion HUD that survives screen changes | Cross-screen state via `main.ts` module scope; existing `companion.ts` body line pattern carries indicator |
| VOICE-04 | G2 plugin buffers PCM and POSTs WAV-wrapped base64 blob to `POST /v1/voice/transcribe` | WAV encoder (new `wav-encoder.ts`); octet-stream or JSON-base64 per CONTEXT D-U3 |
| VOICE-05 | `POST /v1/voice/transcribe`: bearerAuth + email-verified, accepts base64 WAV, calls OpenAI transcribe, creates thought `source='g2_voice'`, fires triage | Full production route `voice-transcribe.ts` + `ai/transcribe.ts`; dedup migration 0023 |
| VOICE-06 | Transcribed thoughts appear in PWA dashboard within 8s of utterance end; failure paths surface locked-enum error codes | SSE fan-out path mandatory (DRIFT-02); new `thought-created` event on `agent-events-bus`; PWA subscriber wiring |
| VOICE-07 | Offline queue: exponential backoff `[1s, 2s, 4s, 8s, 16s, 30s]`; max 10 queued utterances; "syncing N voice captures" HUD indicator | localStorage queue in plugin; retry loop on reconnect; HUD Companion body line 3 |
| VOICE-08 | Drift-detector tests: WAV header pin, no `audioPcm` in log sinks, `audioControl` pairing | Three new/extended tests: `wav-encoder.test.ts`, extended `audio-log-redaction.test.ts` + `denylist-parity.test.ts`, `audiocontrol-pairing.test.ts` |

</phase_requirements>

---

## Summary

Phase 130 productionizes the complete push-to-record voice capture pipeline that Phase 128a's PASS verdict (e2e median 1,880 ms, 0 drop-outs/60s, 5 pp/hr battery, 5/5 cleanup) unlocked at full VOICE-02..08 scope. There is no DEGRADE narrowing.

The work falls into six coherent layers: (1) **spike cleanup** — 5 file deletes + 5 reverts, single atomic commit; (2) **G2 plugin** — production `voice.ts` screen + `wav-encoder.ts` + `safeAudioControl` signature hardening + offline queue; (3) **server route** — production `voice-transcribe.ts` + `ai/transcribe.ts` with full guardrail chain, new error types, budget tracking, and SSE publish; (4) **database** — migration 0023 for `voice_captures` dedup table; (5) **SSE/PWA** — new `thought-created` channel on `agent-events-bus`, extended `agent-stream.ts`, PWA SSE subscriber dispatching `vigil:thought-created`; (6) **drift detectors** — WAV header pin, audioPcm-in-logs extension, audioControl pairing pin.

The critical cross-cutting constraint is SSE: without wiring `bus.publish('thought-created', …)` through to the PWA, the 8s VOICE-06 acceptance criterion is structurally unreachable (30s polling floor, DRIFT-02 locked). All six layers are serial-dependent: the plugin can't send without the route; the route can't reach the PWA without SSE; the SSE extension can't be validated without the PWA subscriber.

**Primary recommendation:** Ship in 7 plans: 130-01 spike cleanup → 130-02 server route + migration → 130-03 SSE fan-out + PWA subscriber → 130-04 G2 plugin voice screen + wav encoder → 130-05 safeAudioControl hardening + offline queue → 130-06 drift detectors → 130-07 plugin pack + hardware wallclock checkpoint. 6-8 plans total is the expected range.

---

## Gray Area Resolutions (Claude's Discretion)

### 1. Exact migration number for dedup primitive (D-U4)

**Confirmed: `0023_voice_capture_dedup.sql`.**

[VERIFIED: codebase grep] The last applied migration is `0022_add_work_orders_maintenance_problem_department.sql` (confirmed by directory listing of `vigil-core/drizzle/`). Next sequential slot is `0023`. The CONTEXT.md expectation is correct.

### 2. Dedup placement: `thoughts.client_capture_id` vs sibling `voice_captures` table

**Decision: New `voice_captures` sibling table with FK to `thoughts.id`.**

Rationale:
- `thoughts` table is polymorphic (source = 'g2_voice', 'voice', 'camera', etc.). Adding `client_capture_id` only for G2 voice creates a nullable column that is always NULL for 90%+ of rows — a schema smell.
- A sibling `voice_captures(id, user_id, thought_id, client_capture_id, queued_at, retry_count)` table mirrors the SCAP-04 / SVCNOW-04 dedup pattern cleanly: composite partial unique index `(user_id, client_capture_id) WHERE client_capture_id IS NOT NULL`.
- The `voice_captures` table also provides a natural home for per-recording telemetry metadata (bytes, stop_to_http_ms, chunk_count) without polluting `thoughts`.
- The dedup check is a SELECT by `(userId, clientCaptureId)` BEFORE the OpenAI call — same shape as `captures-screenshot.ts` SCAP-04 short-circuit.

```sql
-- 0023_voice_capture_dedup.sql
CREATE TABLE IF NOT EXISTS "voice_captures" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "thought_id" integer REFERENCES thoughts(id) ON DELETE SET NULL,
  "client_capture_id" text NOT NULL,
  "queued_at" timestamptz NOT NULL DEFAULT now(),
  "retry_count" integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_voice_captures_user_client_capture_id"
  ON "voice_captures" ("user_id", "client_capture_id")
  WHERE "client_capture_id" IS NOT NULL;
```

W-01 invariant: every query on `voice_captures` MUST filter `eq(voiceCaptures.userId, userId)`. Add `voice_captures` to `cross-user-isolation.test.ts`.

### 3. SSE channel: multiplex `/v1/agent-stream` vs new `/v1/thought-stream`

**Decision: Multiplex onto `/v1/agent-stream`.**

[VERIFIED: codebase grep] `agent-events-bus.ts` already has `EVENT_NAME = "event"` and `QUIET_NAME = "quiet"` channels. The bus uses Node `EventEmitter` per userId. Adding a third `THOUGHT_CREATED_NAME = "thought-created"` channel requires:
1. One new constant in `agent-events-bus.ts`.
2. New `emitThoughtCreated`, `onThoughtCreated`, `offThoughtCreated` methods mirroring the `emitQuiet/onQuiet/offQuiet` triple.
3. `agent-stream.ts` adds a `thoughtCreatedListener` that writes `event: "thought-created"` SSE frames.
4. `bus.offThoughtCreated` called in the `onAbort` cleanup alongside `bus.off` and `bus.offQuiet`.

The PWA SSE client already connects to `/v1/agent-stream`. No new endpoint registration, no second SSE connection from the PWA. Slight wire-payload increase per SSE connection (~50-200 bytes per thought created) is negligible.

Standing up `/v1/thought-stream` would require: new route file, new mount in `index.ts`, new PWA hook connecting to a second SSE URL, and double the reconnect logic. Not worth it.

### 4. Per-chunk timestamp logging default (D-T2)

**Decision: Default-ON in production.**

Phase 128a deliberately omitted per-chunk timestamps to avoid contaminating inter-arrival latency measurements during the spike. In production, the cost is one `console.log` per ~100ms audioEvent fire (~10 lines/s during recording). This is standard debug telemetry for a production feature — not a measurement-contamination concern.

The drop-out detector (D-T2) requires per-chunk timestamps to identify gaps > 2× baseline. Without default-on timestamps, drop-out telemetry is permanently blind. Given that per-chunk logging was deliberately excluded from the spike to keep Run 1 numbers clean, enabling it in production is the correct closure of the spike's deferred item.

Format: `console.log('[voice] chunk bytes=${bytes} t=${Date.now()}')` — safe key names (`bytes`, `t`) that don't match GUARD-01 `BLOCKED_PROPERTY_NAMES` regex.

### 5. Server-side OpenAI timeout (D-E1)

**Decision: 30 seconds.**

Rationale:
- Spike measured `stop→HTTP_ms` median 1,880ms, p95 ~2,387ms, max 2,562ms for clips up to 6s of speech.
- Near-cap 56.8s clip measured `stop→HTTP_ms` = 3,601ms.
- Even at 60× the median (pathological case), 30s provides a 16× buffer above p95.
- OpenAI's own recommended timeout for transcription API calls is typically 30-60s per their documentation.
- `VOICE_TRANSCRIBE_TIMEOUT` (HTTP 504) is thrown using Node's `AbortController` with a 30,000ms signal passed to the OpenAI SDK fetch call:

```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 30_000)
try {
  const response = await ai.audio.transcriptions.create(
    { file, model: 'gpt-4o-mini-transcribe' },
    { signal: controller.signal }
  )
  return response.text
} catch (err) {
  if (err instanceof Error && err.name === 'AbortError') {
    throw new VoiceTranscribeTimeoutError()
  }
  throw new VoiceTranscribeProviderDownError()
} finally {
  clearTimeout(timeout)
}
```

### 6. HUD body-line priority when `[NO MIC]` + offline queue both active

**Decision: `[NO MIC]` wins; queue indicator hidden.**

Rationale: When `[NO MIC]` is active, the operator cannot record new captures. The queue indicator ("syncing N voice captures") implies background work is happening that the operator should be aware of — but showing BOTH simultaneously causes cognitive overload on a 3-line HUD. Since the operator can't take any useful action on the queue without first fixing the mic permission, `[NO MIC]` is the higher-priority signal. The queue will resume syncing once the operator re-grants the mic permission (implicitly fixing the `[NO MIC]` state), at which point line 3 re-renders the queue count naturally.

Priority ladder for Companion HUD body line 3:
1. `[NO MIC] enable mic in Hub` — highest priority (blocks capture entirely)
2. `syncing N voice captures…` — shown when queue depth > 0 and mic is OK
3. `[DONE] thought saved` — ephemeral 2s display after successful capture
4. (empty) — normal idle state

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Push-to-record gesture | G2 Plugin (client) | — | DOUBLE_CLICK_EVENT routed in `main.ts`; SDK-level event |
| PCM buffering + WAV assembly | G2 Plugin (client) | — | `audioEvent.audioPcm` arrives client-side; WAV header prepended before upload |
| Offline queue persistence | G2 Plugin (client) | — | WebView localStorage; survives process death |
| Base64-WAV upload | G2 Plugin → API | — | Single POST per utterance; VOICE-04 locked shape |
| Request auth + guardrails | API / Backend | — | bearerAuth + requireVerifiedEmail + requireAiBudget + assertAudioSessionWithinCap all live server-side |
| Dedup check | API / Backend | Database | SELECT by (userId, clientCaptureId) before OpenAI call |
| OpenAI transcription | API / Backend | — | `ai/transcribe.ts`; timeout + error taxonomy server-side |
| Budget tracking | API / Backend | Database | `withBudgetTracking(userId, fn)` wraps OpenAI call; accumulates to `ai_usage_daily` |
| `thoughts` row insert | API / Backend | Database | `db.insert(thoughtsTable)` with `source='g2_voice'` |
| SSE fan-out | API / Backend | — | `bus.publish('thought-created', …)` → `agent-events-bus` → connected PWA |
| PWA real-time update | Browser / Client | — | SSE subscriber → `vigil:thought-created` window event → `useThoughts` refetch |
| Error display to operator | G2 Plugin (client) | Browser / Client | G2 HUD shows `[ERR]`/`[NO MIC]`; PWA api-error-codes renders for exhausted-queue errors |
| Drift detector tests | Build-time (CI) | — | Source-grep tests in `vigil-core/src/__tests__/` and `vigil-g2-plugin/src/__tests__/` |
| WAV header correctness | Build-time (CI) | G2 Plugin | `wav-encoder.test.ts` byte-for-byte header assertion |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@evenrealities/even_hub_sdk` | 0.0.9 (installed) | G2 plugin SDK — `audioControl`, `onEvenHubEvent`, `setBackgroundState` | Project-pinned; v0.0.10 in skills reference but 0.0.9 is what is installed |
| `openai` | `^4.79.0` (pinned in 128a Plan 01) | OpenAI transcription client | Phase 128a D-W3 locked; `gpt-4o-mini-transcribe` at $0.003/min |
| `hono` | existing | Route framework | Project standard |
| `drizzle-orm` | existing | ORM / query builder | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` | built-in | `crypto.randomUUID()` for cloudKitRecordID on thought insert | Already used in voice-spike.ts pattern |
| `openai` `toFile` | part of openai package | Convert Buffer → SDK File for transcription | Already used in transcribe-spike.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gpt-4o-mini-transcribe` | `whisper-1` | whisper-1 is $0.006/min (2×) + supports word timestamps; overkill for ADHD capture |
| Multiplex `/v1/agent-stream` | New `/v1/thought-stream` | New stream = new endpoint + new PWA connection; not worth the overhead |
| `voice_captures` sibling table | `thoughts.client_capture_id` | Sibling keeps polymorphic `thoughts` clean; see Gray Area #2 |

**No new package installs required.** The `openai` package is already installed (Phase 128a Plan 01 pinned `openai@^4.79.0`). `@evenrealities/even_hub_sdk@0.0.9` is already installed. The only new files are within the existing package boundaries.

---

## Package Legitimacy Audit

No new packages are installed in Phase 130. All required packages (`openai`, `@evenrealities/even_hub_sdk`, `hono`, `drizzle-orm`) are already present in the project's `node_modules` and were verified during earlier phases. No slopcheck needed.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
G2 Hardware (operator gesture)
  │  DOUBLE_CLICK_EVENT
  ▼
vigil-g2-plugin/src/main.ts (event router)
  │  routes to voice screen handler
  ▼
vigil-g2-plugin/src/screens/voice.ts (state machine)
  │  safeAudioControl(true, bridge) → [RESULT: boolean]
  │    ├── false → [NO MIC] state, short-circuit
  │    └── true → begin recording
  │
  │  bridge.onEvenHubEvent → audioEvent.audioPcm (Uint8Array)
  │  per-chunk: appendPcmChunk + per-chunk timestamp log
  │
  │  DOUBLE_CLICK_EVENT (stop)
  │  safeAudioControl(false, bridge)
  │  WAV-wrap via wav-encoder.ts (44-byte header + PCM)
  │
  │  Online path:
  ▼
POST /v1/voice/transcribe { audio: base64, clientCaptureId: UUID }
  │
  ▼
vigil-core/src/routes/voice-transcribe.ts
  │  bearerAuth (index.ts:166)
  │  requireVerifiedEmail
  │  requireAiBudget(userId)          ← throws DAILY_AI_BUDGET_EXCEEDED → 429
  │  assertAudioSessionWithinCap(b64) ← throws AUDIO_SESSION_TOO_LONG → 413
  │  SELECT voice_captures WHERE (userId, clientCaptureId) [dedup check]
  │    └── hit → return existing {thoughtId, content}
  │  withBudgetTracking(userId, fn) → transcribeWav(buf)
  │    ├── AbortController(30s) → VOICE_TRANSCRIBE_TIMEOUT → 504
  │    ├── OpenAI 5xx → VOICE_TRANSCRIBE_PROVIDER_DOWN → 502
  │    └── quota error → VOICE_TRANSCRIBE_QUOTA → 503
  │  db.insert(thoughtsTable) { userId, content, source: 'g2_voice' }
  │  db.insert(voiceCaptures) { userId, thoughtId, clientCaptureId }
  │  bus.publish('thought-created', { userId, thoughtId, content })  ← NEW
  │  fire-and-forget triage (existing pattern)
  │  return { thoughtId, content } → 201
  │
  ▼                                    ▼ (parallel SSE path)
G2 plugin: [DONE] state           agent-events-bus.ts
                                     │ emitThoughtCreated(userId, payload)
  │  Offline path:                   ▼
  │  localStorage queue            vigil-core/src/routes/agent-stream.ts
  │  retry [1s,2s,4s,8s,16s,30s]   │  thoughtCreatedListener → SSE frame
  │  "syncing N" HUD line           │  event: "thought-created"
                                     ▼
posthog.capture(                  vigil-pwa/src/hooks/useAgentStream.ts (or
  'voice_capture_completed', …)     inline in existing SSE subscriber)
                                     │  parse SSE "thought-created" frame
                                     │  dispatch window.dispatchEvent(
                                     │    new CustomEvent('vigil:thought-created')
                                     │  )
                                     ▼
                                  vigil-pwa/src/hooks/useThoughts.ts:127
                                     │  handleCreated → refetch()
                                     ▼
                                  PWA dashboard renders new thought row
                                  (≤ 8s from utterance end — VOICE-06 ✓)
```

### Recommended Project Structure

New files Phase 130 creates:

```
vigil-g2-plugin/src/
├── screens/
│   └── voice.ts                   # Production voice screen (VOICE-02)
├── lib/
│   └── wav-encoder.ts             # WAV header builder (44-byte, 16kHz/16bit/mono)
└── src/__tests__/
    ├── wav-encoder.test.ts        # D-D1 WAV header byte-for-byte pin
    └── audiocontrol-pairing.test.ts  # D-D3 safeAudioControl pairing

vigil-core/src/
├── routes/
│   └── voice-transcribe.ts        # Production VOICE-03..05 endpoint
├── ai/
│   └── transcribe.ts              # Production OpenAI transcription helper
├── db/
│   └── schema.ts                  # (modified: add voiceCaptures table)
└── __tests__/
    └── audio-log-redaction.test.ts  # (extended: D-D2 audioPcm pattern)

vigil-core/drizzle/
└── 0023_voice_capture_dedup.sql   # voice_captures table + dedup index

vigil-pwa/src/
└── lib/
    └── api-error-codes.ts         # (extended: 3 VOICE_TRANSCRIBE_* codes)
```

Files deleted (D-C1):
```
vigil-g2-plugin/scripts/voice-spike-encoder.ts  ← DELETE
vigil-g2-plugin/src/screens/voice-spike.ts       ← DELETE
vigil-core/src/routes/voice-spike.ts             ← DELETE
vigil-core/src/ai/transcribe-spike.ts            ← DELETE
vigil-core/src/routes/__tests__/voice-spike.test.ts ← DELETE
```

### Pattern 1: safeAudioControl — Hardened Signature (Run 4)

[VERIFIED: codebase grep — `vigil-g2-plugin/src/lib/audio-session-guard.ts`]

Current signature: `Promise<void>`. Phase 130 changes to `Promise<boolean>`:

```typescript
// vigil-g2-plugin/src/lib/audio-session-guard.ts (modified)
export async function safeAudioControl(
  on: boolean,
  bridge: AudioGuardBridge,
): Promise<boolean> {  // ← changed from Promise<void>
  if (!cleanupRegistered && on) {
    cleanupRegistered = true
    // ... hook registration unchanged ...
  }
  audioActive = on
  return bridge.audioControl(on)  // ← return the SDK result
}
```

Caller pattern (Run 4 §2):

```typescript
// vigil-g2-plugin/src/screens/voice.ts
async function toggleVoiceRecording(bridge: AudioGuardBridge) {
  try {
    const granted = await safeAudioControl(true, bridge)
    if (!granted) {
      stateLine = '[NO MIC]'
      recording = false
      await onStateChange?.()
      return
    }
    // proceed with recording
  } catch {
    stateLine = '[NO MIC]'
    recording = false
    await onStateChange?.()
  }
}
```

### Pattern 2: Production Route Structure (mirrors captures-screenshot.ts)

[VERIFIED: codebase grep — `vigil-core/src/routes/captures-screenshot.ts` + `voice-spike.ts`]

```typescript
// vigil-core/src/routes/voice-transcribe.ts
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable, voiceCaptures } from "../db/schema.js";
import { requireAiBudget, withBudgetTracking } from "../lib/ai-budget.js";
import { assertAudioSessionWithinCap } from "../lib/audio-cap.js";
import { transcribeWav } from "../ai/transcribe.js";
import { bus } from "../lib/agent-events-bus.js";
import {
  VoiceTranscribeTimeoutError,
  VoiceTranscribeProviderDownError,
  VoiceTranscribeQuotaError,
} from "./voice-errors.js";

export function createVoiceTranscribeRoute(deps = {}): Hono {
  const router = new Hono();

  router.post("/voice/transcribe", async (c) => {
    const userId = c.get("userId") as number;

    // 1. Pre-flight guards (BEFORE body parse — Phase 127 pattern)
    await requireAiBudget(userId);

    // 2. Parse JSON body
    const body = await c.req.json<{ audio: string; clientCaptureId: string }>();
    if (!body.audio || !body.clientCaptureId) {
      return c.json({ error: "audio and clientCaptureId are required" }, 400);
    }

    // 3. Cap guard
    assertAudioSessionWithinCap(body.audio);

    // 4. Dedup check (BEFORE OpenAI call — cost guard)
    if (db) {
      const existing = await db.select().from(voiceCaptures)
        .where(and(
          eq(voiceCaptures.userId, userId),
          eq(voiceCaptures.clientCaptureId, body.clientCaptureId)
        )).limit(1);
      if (existing.length > 0 && existing[0].thoughtId) {
        const thought = await db.select().from(thoughtsTable)
          .where(eq(thoughtsTable.id, existing[0].thoughtId)).limit(1);
        if (thought.length > 0) {
          return c.json({ thoughtId: thought[0].id, content: thought[0].content }, 200);
        }
      }
    }

    // 5. Decode + transcribe (wrapped in budget tracking)
    const wav = Buffer.from(body.audio, "base64");
    const content = await withBudgetTracking(userId, () => transcribeWav(wav));

    // 6. Insert thought
    const [row] = await db!.insert(thoughtsTable).values({
      userId,
      content,
      source: "g2_voice",
      cloudKitRecordID: crypto.randomUUID(),
    }).returning();

    // 7. Record dedup entry
    await db!.insert(voiceCaptures).values({
      userId,
      thoughtId: row.id,
      clientCaptureId: body.clientCaptureId,
    });

    // 8. SSE fan-out (VOICE-06)
    bus.emitThoughtCreated(userId, { thoughtId: row.id, content });

    // 9. Fire-and-forget triage (pattern from process-audio.ts:172-194)
    void runTriage(userId, row.id, content);

    return c.json({ thoughtId: row.id, content }, 201);
  });

  return router;
}
```

### Pattern 3: SSE Thought-Created Channel (extends agent-events-bus.ts)

[VERIFIED: codebase grep — `vigil-core/src/lib/agent-events-bus.ts` Phase 125 `QUIET_NAME` precedent]

```typescript
// Addition to agent-events-bus.ts
const THOUGHT_CREATED_NAME = "thought-created" as const;

// In AgentEventBus class:
emitThoughtCreated(userId: number, payload: { thoughtId: number; content: string }): void {
  const emitter = emitters.get(userId);
  if (!emitter) return;
  emitter.emit(THOUGHT_CREATED_NAME, payload);
}

onThoughtCreated(userId: number, listener: (p: { thoughtId: number; content: string }) => void): void {
  getOrCreate(userId).on(THOUGHT_CREATED_NAME, listener);
}

offThoughtCreated(userId: number, listener: (p: { thoughtId: number; content: string }) => void): void {
  const emitter = emitters.get(userId);
  if (!emitter) return;
  emitter.off(THOUGHT_CREATED_NAME, listener);
  // Only delete Map entry when ALL three event types have zero listeners
  if (
    emitter.listenerCount(EVENT_NAME) === 0 &&
    emitter.listenerCount(QUIET_NAME) === 0 &&
    emitter.listenerCount(THOUGHT_CREATED_NAME) === 0
  ) {
    emitters.delete(userId);
  }
}
```

The `agent-stream.ts` adds an analogous `thoughtCreatedListener` in its setup block, writes `event: "thought-created"` SSE frames, and calls `bus.offThoughtCreated` in the `onAbort` cleanup.

### Pattern 4: WAV Encoder (44-byte header, mirrors spike encoder shape)

[VERIFIED: codebase grep — `vigil-g2-plugin/scripts/voice-spike-encoder.ts` + Phase 128a CONTEXT D-W1]

```typescript
// vigil-g2-plugin/src/lib/wav-encoder.ts
// Production WAV encoder for 16kHz × 16-bit LE × mono PCM.
// The spike's voice-spike-encoder.ts is DELETED per D-C1; this file
// is its production-grade replacement.
//
// 44-byte WAV header byte map (VOICE-08 D-D1 pin reference):
//   offset 0:  "RIFF"
//   offset 4:  total data length - 8 (uint32 LE)
//   offset 8:  "WAVE"
//   offset 12: "fmt "
//   offset 16: 16 (PCM chunk size, uint32 LE)
//   offset 20: 1  (PCM format, uint16 LE)
//   offset 22: 1  (channels = mono, uint16 LE)
//   offset 24: 16000 (sample rate, uint32 LE)
//   offset 28: 32000 (byte rate = sampleRate × channels × bitDepth/8, uint32 LE)
//   offset 32: 2  (block align = channels × bitDepth/8, uint16 LE)
//   offset 34: 16 (bit depth, uint16 LE)
//   offset 36: "data"
//   offset 40: PCM data length (uint32 LE)
//   offset 44: raw PCM data bytes

export function buildWav(pcm: Uint8Array): Uint8Array {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const totalLen = 36 + pcm.length

  // RIFF chunk
  new TextEncoder().encode('RIFF').forEach((b, i) => view.setUint8(i, b))
  view.setUint32(4, totalLen, true)
  new TextEncoder().encode('WAVE').forEach((b, i) => view.setUint8(8 + i, b))
  // fmt subchunk
  new TextEncoder().encode('fmt ').forEach((b, i) => view.setUint8(12 + i, b))
  view.setUint32(16, 16, true)   // PCM chunk size
  view.setUint16(20, 1, true)    // PCM format
  view.setUint16(22, 1, true)    // mono
  view.setUint32(24, 16000, true) // 16 kHz
  view.setUint32(28, 32000, true) // byte rate
  view.setUint16(32, 2, true)    // block align
  view.setUint16(34, 16, true)   // 16-bit
  // data subchunk
  new TextEncoder().encode('data').forEach((b, i) => view.setUint8(36 + i, b))
  view.setUint32(40, pcm.length, true)

  const result = new Uint8Array(44 + pcm.length)
  result.set(new Uint8Array(header), 0)
  result.set(pcm, 44)
  return result
}
```

### Pattern 5: Offline Queue (localStorage, mirrors Phase 124 D-11 backoff)

[ASSUMED] Queue implementation shape — no prior exact implementation in codebase to verify against; pattern derived from D-O1..D-O4 decisions.

```typescript
// In vigil-g2-plugin/src/lib/voice-queue.ts (new file)
const QUEUE_KEY = 'vigil:voice-queue:v1'
const MAX_QUEUE_SIZE = 10
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000]

interface QueueEntry {
  clientCaptureId: string
  base64Audio: string  // WARNING: large; ensure GUARD-01 redaction doesn't touch this
  queuedAt: number
  retryCount: number
}

// localStorage usage note: EVEN-SKILLS.md §"Persistence" warns that
// browser localStorage does NOT reliably persist in Flutter WebView.
// Use bridge.setLocalStorage for max reliability. However, D-O2 explicitly
// chose WebView localStorage (vigil:voice-queue:v1) for the queue — this is
// a conscious decision. If persistence issues arise, a Phase 130 follow-up
// can migrate to bridge.setLocalStorage with the same key.
```

**Critical note:** The `base64Audio` in the queue entry is large (~200KB per entry). Ensure PostHog `BLOCKED_PROPERTY_NAMES` does NOT catch the queue key name during any telemetry that references the queue. The D-T1 `voice_capture_completed` event MUST NOT include the `base64Audio` field — only `{ stop_to_http_ms, chunks, bytes, retry_count, transcript_chars }`.

### Anti-Patterns to Avoid

- **Calling `bridge.audioControl()` directly** — always use `safeAudioControl(on, bridge)`. The guard wrapper handles cleanup hooks. Run 4 hardening changes the return-type contract.
- **Using `window.localStorage` for queue without `bridge.setLocalStorage` fallback** — EVEN-SKILLS.md explicitly warns Flutter WebView localStorage may not persist. D-O2 chose this path consciously; document the limitation.
- **Calling `bus.publish` / `bus.emit` before `db.insert` returns** — the SSE fan-out MUST happen AFTER the thought row exists in the database. If the fan-out fires first, the PWA refetch may query before the row is committed.
- **In-place renaming spike files to production names** — the SPIKE-DECISION explicitly requires delete + re-add. Do not rename `voice-spike.ts` → `voice.ts`.
- **Drizzle-kit auto-generate for migration 0023** — hand-craft the SQL per Phase 121 idiom. Do NOT commit `drizzle-kit generate` output verbatim.
- **Logging `body.audio` at any verbosity level** — the base64 WAV is audio data. GUARD-01 `BLOCKED_PROPERTY_NAMES` includes `audio`. Log only safe key names: `bytes`, `chunk_n`, `stop_to_http_ms`.
- **Using `withBudgetTracking` for OpenAI without adapting the accumulator** — `withBudgetTracking` was written for Anthropic token counting. The OpenAI transcription API returns duration-based billing, not token counts. Phase 130 should either: (a) adapt `withBudgetTracking` to accept a cost-in-USD override for OpenAI calls, OR (b) add a separate lightweight accumulator for OpenAI spend. The spike's `transcribe-spike.ts` deliberately omitted OpenAI accounting; Phase 130 MUST add it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WAV header assembly | Custom bit manipulation | The 44-byte pattern from `voice-spike-encoder.ts` (reference, then delete) | Already validated by spike runs; VOICE-08 pins the exact bytes |
| OpenAI client initialization | Direct `new OpenAI(…)` at module top | Lazy-init singleton (`getTranscribeClient()`) mirroring `ai/client.ts` | Cold-start Railway deploy must not crash on missing env var |
| Per-user budget check | Custom query | `requireAiBudget(userId)` from `lib/ai-budget.ts` | Already ships Phase 127; wiring is a one-liner |
| Audio session cap | Custom byte counter | `assertAudioSessionWithinCap(b64)` from `lib/audio-cap.ts` | Already ships Phase 127; wiring is a one-liner |
| SSE EventEmitter pattern | New pub/sub | Extend `agent-events-bus.ts` | Phase 119/124/125 infra; listener cleanup + memory bounds already solved |
| Dedup index | Manual SELECT+INSERT race | `CREATE UNIQUE INDEX … WHERE client_capture_id IS NOT NULL` + `onConflictDoNothing` or SELECT-first | Phase 121 pattern; concurrent inserts with same clientCaptureId must only create one row |
| Error code registration | Bespoke error objects | Extend `app.onError` in `index.ts` + locked-enum in `api-error-codes.ts` | Phase 126/127 established the translation table; all new errors must join it |
| PostHog event redaction | Per-event filtering | `BLOCKED_PROPERTY_NAMES` Set (already enforced by `redactEvent`) | Never add a new audio-named property to a PostHog event — GUARD-01 catches it |

**Key insight:** Phase 127's guardrails (`safeAudioControl`, `requireAiBudget`, `assertAudioSessionWithinCap`, `BLOCKED_PROPERTY_NAMES`, `app.onError` translation) reduce Phase 130's server-side implementation to glue code. The hardest original work is: (1) OpenAI budget accounting, (2) SSE `thought-created` channel extension, (3) offline queue with correct backoff + eviction, and (4) the three drift detectors.

---

## Common Pitfalls

### Pitfall 1: OpenAI budget tracking omitted (spike debt)

**What goes wrong:** `transcribe-spike.ts` explicitly notes that OpenAI spend is NOT wired into `withBudgetTracking` because it was written for Anthropic tokens. If Phase 130 copies the spike's `transcribeWav` without adapting the budget wrapper, every OpenAI transcription call is invisible to the per-user $0.50/day cap. An operator doing 100 voice captures/day would blow the cap silently.

**Why it happens:** `withBudgetTracking(userId, fn)` reads `response.usage.input_tokens` + `output_tokens` from Anthropic's response shape. OpenAI's `audio.transcriptions.create` response has no `usage` field — it returns `{ text: string }`. The accumulator silently records $0.

**How to avoid:** Phase 130's `transcribeWav` MUST compute the OpenAI cost from clip duration and accumulate it manually. Cost: `durationSeconds × $0.003 / 60`. Duration can be estimated from `pcm.length / 32000` (bytes ÷ bytes-per-second). Recommended: add a `withOpenAIBudgetTracking(userId, durationMs, fn)` helper in `lib/ai-budget.ts` that accepts a pre-computed USD amount and accumulates it via the same `INSERT … ON CONFLICT DO UPDATE` pattern.

**Warning signs:** AI usage dashboard shows zero OpenAI line item after Phase 130 ships.

### Pitfall 2: SSE emitter leak if `offThoughtCreated` not called in cleanup

**What goes wrong:** `agent-stream.ts` registers `thoughtCreatedListener` via `bus.onThoughtCreated`. If the `onAbort` cleanup only calls `bus.off` + `bus.offQuiet` (Phase 125 pattern) but NOT `bus.offThoughtCreated`, the listener persists after the SSE client disconnects. Every subsequent `emitThoughtCreated` fires to a dead listener, and the emitter Map never shrinks.

**How to avoid:** The `onAbort` cleanup in `agent-stream.ts` MUST call all three: `bus.off`, `bus.offQuiet`, `bus.offThoughtCreated`. The delete-gate in `off`/`offQuiet`/`offThoughtCreated` must check all three listener counts: `listenerCount(EVENT_NAME) === 0 && listenerCount(QUIET_NAME) === 0 && listenerCount(THOUGHT_CREATED_NAME) === 0`.

**Warning signs:** `bus._size()` (test hook) grows and never shrinks when users connect/disconnect the SSE stream.

### Pitfall 3: `withBudgetTracking` call order vs `assertAudioSessionWithinCap`

**What goes wrong:** If `requireAiBudget` is called AFTER body parsing and decoding but BEFORE `assertAudioSessionWithinCap`, an attacker can send a 100MB payload. The body will be decoded fully before the cap guard runs, burning 100MB of server memory.

**How to avoid:** Strict call order per D-U3: (1) `requireAiBudget` (2) body parse (3) `assertAudioSessionWithinCap` on the base64 string length BEFORE `Buffer.from(body.audio, 'base64')`. The cap guard operates on the base64 string length (~2.56M chars), which avoids allocating the decoded buffer for over-cap inputs.

### Pitfall 4: localStorage queue in Even Hub Flutter WebView

**What goes wrong:** EVEN-SKILLS.md §"Persistence" explicitly states: "Browser IndexedDB and browser `localStorage` do NOT reliably persist across app restarts in this environment." D-O2 chose `localStorage` knowing this limitation. If the queue is lost on app restart during a network outage, queued utterances are silently dropped.

**How to avoid:** D-O2 is a conscious tradeoff. The CONTEXT.md reasoning stands (storage budget: ~2.1MB fits easily). However, the implementation should fall back to `bridge.setLocalStorage` if the queue survives fewer than 2 restart cycles in practice. Document the known limitation in the implementation comment so Phase 133 can migrate to `bridge.setLocalStorage` if operators report lost queue entries.

**Warning signs:** PostHog shows `voice_queue_evicted` events with `retry_count = 0` (evicted before any retry attempts) — would indicate the queue is being lost and re-created, not growing.

### Pitfall 5: WAV encoder produces stereo or wrong sample rate

**What goes wrong:** If the WAV header is wrong (e.g., channel count = 2, or sample rate = 44100), OpenAI transcription will either fail with an error or attempt to transcribe audio at the wrong rate, producing garbled output. The spike encoder was validated by the 9/9 intelligible transcripts in Run 1 — the production encoder must produce identical headers.

**How to avoid:** The D-D1 drift detector test (`wav-encoder.test.ts`) byte-for-byte pins the 44-byte header. This test must be added in Phase 130 Plan 06 (drift detectors) at the LATEST, but should be added in the same plan as `wav-encoder.ts` creation. The test is the only way to catch a regression before it ships to hardware.

### Pitfall 6: SSE fan-out fires before DB commit is durable

**What goes wrong:** `bus.emitThoughtCreated` is called synchronously after `db.insert(...).returning()`. In Postgres on Railway with default autocommit, `returning()` resolves after the row is committed — this is safe. But if the route is ever wrapped in an explicit transaction, `emitThoughtCreated` inside the transaction could fire the SSE event before the transaction commits, causing the PWA to refetch and get an empty result.

**How to avoid:** Never wrap the `db.insert` + `bus.emitThoughtCreated` sequence in an explicit Drizzle transaction. The current spike pattern (no explicit transaction) is correct. Document this constraint in the route's JSDoc.

---

## Plan Ordering — Confirmed Shape

D-C4 is confirmed correct: spike removal as its own Plan 01 is the right shape.

**Recommended 7-plan sequence:**

| Plan | Scope | Key deliverable |
|------|-------|-----------------|
| 130-01 | Spike cleanup | D-C1 (5 deletes) + D-C2 (5 reverts); app.json desc reworded; single atomic commit. No production code. |
| 130-02 | Server route + migration | `0023_voice_capture_dedup.sql`; `voice_captures` schema + Drizzle model; `ai/transcribe.ts`; `voice-transcribe.ts` (full chain, no SSE yet — bus.publish stubbed as no-op); new error types + `app.onError` entries; `api-error-codes.ts` VOICE_TRANSCRIBE_* extensions; OpenAI budget accounting adapter |
| 130-03 | SSE fan-out + PWA subscriber | `THOUGHT_CREATED_NAME` channel on `agent-events-bus.ts`; extend `agent-stream.ts`; PWA SSE subscriber dispatching `vigil:thought-created`; stub integration test (mock OpenAI → assert SSE frame fires) |
| 130-04 | G2 plugin voice screen + wav encoder | `wav-encoder.ts`; `voice.ts` state machine (IDLE/REC/UPLOADING/DONE/ERR/NO MIC); `safeAudioControl` signature change (`Promise<void>` → `Promise<boolean>`); cross-screen state in `main.ts`; Companion HUD body line 3 (offline queue indicator) |
| 130-05 | Offline queue + telemetry | `voice-queue.ts` localStorage queue; retry loop with `[1s,2s,4s,8s,16s,30s]` backoff; LRU eviction; D-T1 `voice_capture_completed` PostHog event; D-T2 dropout counter |
| 130-06 | Drift detectors | `wav-encoder.test.ts` (D-D1); extend `audio-log-redaction.test.ts` + `denylist-parity.test.ts` (D-D2); `audiocontrol-pairing.test.ts` (D-D3); `audio-session-guard.test.ts` extended with return-value assertions |
| 130-07 | Plugin pack + hardware wallclock | `npm run release` in `vigil-g2-plugin`; sideload to G2; operator wallclock: push-to-record → PWA dashboard render timing (VOICE-06 8s verification); battery delta sanity check |

**Rationale for plan ordering:**
- Plan 01 before any production code: spike files and production code must never coexist (D-U1 "delete-then-add" principle).
- Plan 02 before Plan 03: SSE fan-out requires `bus.emitThoughtCreated` to exist in the route.
- Plan 03 before Plan 04: G2 plugin sends to the server; the server+SSE chain should be testable before the plugin ships.
- Plan 04 before Plan 05: offline queue is part of the plugin but depends on the plugin's recording state machine being final.
- Plan 06 (drift detectors) can run in parallel with Plans 04-05 or after Plan 03 — the WAV encoder test is independent of the route tests. Placing it at 06 ensures the encoder exists to test.
- Plan 07 is the hardware UAT checkpoint — always last and always a wallclock checkpoint (cannot be `--auto`-executed per `[feedback_wallclock_checkpoint_exempt]` memory).

---

## Runtime State Inventory

> Phase 130 is a productionization phase, not a rename/refactor. However, it deletes spike files and mounts a production route at the same path. The runtime state relevant to the transition:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `thoughts` rows with `source='g2_voice'` from spike runs (Run 1 × 9 trials + near-cap + battery-delta clips ≈ 20 rows) | No migration needed — `source='g2_voice'` is the correct production value; these rows are valid data |
| Stored data | No `voice_captures` rows exist yet (migration 0023 not applied) | Migration 0023 creates the table; no seed data needed |
| Live service config | `OPENAI_API_KEY` set in Railway `vigil-core` env (Phase 128a C-1 RESOLVED — confirmed in SPIKE-DECISION "Wallclock C-1 RESOLVED") | No action — already set |
| OS-registered state | None — no task scheduler, launchd, or systemd involvement | None |
| Secrets/env vars | `OPENAI_API_KEY` server-only; never in plugin or PWA | No change needed |
| Build artifacts | `vigil.ehpk` v0.3.7 is the current plugin pack (includes spike screen). Phase 130 Plan 07 re-packs as v0.3.8 with spike removed + voice production screen added | `npm run release` in Plan 07; new `.ehpk` sideloaded to G2 |

**Spike route in production:** `/v1/voice/transcribe` is currently mounted via `voiceSpike` (index.ts:29,232). After Plan 01 (D-C1+D-C2), this mount is removed. After Plan 02 (production route), it is re-mounted via the production handler at the same path. Between Plan 01 and Plan 02, `/v1/voice/transcribe` returns 404 — this is acceptable (spike UI will also be deleted from the plugin in Plan 04).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | DB migrations, `voice_captures` table | ✓ (Railway) | 15.x | — |
| `openai` npm package | `ai/transcribe.ts` | ✓ | ^4.79.0 (pinned) | — |
| `OPENAI_API_KEY` Railway env | Transcription | ✓ (RESOLVED Phase 128a C-1) | — | Route returns 503 if missing |
| G2 hardware + iPhone | Plan 07 wallclock UAT | Human operator required | v0.3.7 → v0.3.8 after pack | Cannot simulate; Plan 07 is a human checkpoint |
| Even Hub developer portal | `g2-microphone` permission | ✓ (already approved Phase 128a C-2) | — | Would re-trigger approval pipeline if revoked |

**Missing dependencies with no fallback:** None — all dependencies are available.

**Missing dependencies with fallback:** `OPENAI_API_KEY` absent → lazy-init returns null → route throws → `app.onError` returns HTTP 503 with `VOICE_TRANSCRIBE_PROVIDER_DOWN` code. This is the correct graceful degradation.

---

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `assert` (project standard — `tsx --test`) |
| Config file | none — `npm test` in each package |
| Quick run command (vigil-core) | `cd vigil-core && npm test` |
| Quick run command (vigil-g2-plugin) | `cd vigil-g2-plugin && npm test` |
| Full suite command | `cd vigil-core && npm test && cd ../vigil-g2-plugin && npm test && cd ../vigil-pwa && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-02 | `safeAudioControl` returns `Promise<boolean>`; `false` → `[NO MIC]` state | unit | `cd vigil-g2-plugin && npm test -- --test-name-pattern="safeAudioControl"` | ❌ Wave 0 — extend `audio-session-guard.test.ts` |
| VOICE-03 | Recording indicator survives screen swipe (cross-screen state) | unit | `cd vigil-g2-plugin && npm test -- --test-name-pattern="voice screen state"` | ❌ Wave 0 — `voice.test.ts` |
| VOICE-04 | WAV header byte-for-byte correctness | unit | `cd vigil-g2-plugin && npm test -- --test-name-pattern="wav-encoder"` | ❌ Wave 0 — `wav-encoder.test.ts` |
| VOICE-05 | POST `/v1/voice/transcribe` happy path: 201, thought inserted, dedup works | unit | `cd vigil-core && npm test -- --test-name-pattern="voice transcribe"` | ❌ Wave 0 — `voice-transcribe.test.ts` |
| VOICE-05 | Dedup: second POST with same `clientCaptureId` returns 200 with existing thought | unit | same as above | ❌ Wave 0 |
| VOICE-05 | `AUDIO_SESSION_TOO_LONG` (413) when cap exceeded | unit | same as above | ❌ Wave 0 |
| VOICE-05 | `DAILY_AI_BUDGET_EXCEEDED` (429) when cap hit | unit | same as above | ❌ Wave 0 |
| VOICE-05 | `VOICE_TRANSCRIBE_TIMEOUT` (504) on 30s abort | unit | same as above | ❌ Wave 0 |
| VOICE-06 | SSE `thought-created` event fires after DB insert | unit | `cd vigil-core && npm test -- --test-name-pattern="thought-created"` | ❌ Wave 0 — extend `agent-events-bus.test.ts` |
| VOICE-06 | Error codes present in `api-error-codes.ts` | unit | `cd vigil-pwa && npm test -- --test-name-pattern="VOICE_TRANSCRIBE"` | ❌ Wave 0 — extend locked-enum pin test |
| VOICE-07 | Offline queue retry backoff schedule `[1,2,4,8,16,30]s` | unit | `cd vigil-g2-plugin && npm test -- --test-name-pattern="voice-queue"` | ❌ Wave 0 — `voice-queue.test.ts` |
| VOICE-07 | Queue max 10 entries; LRU eviction on 11th | unit | same as above | ❌ Wave 0 |
| VOICE-08 | WAV header byte-for-byte (D-D1) | unit | `cd vigil-g2-plugin && npm test -- --test-name-pattern="wav-encoder"` | ❌ Wave 0 — `wav-encoder.test.ts` |
| VOICE-08 | No `audioPcm` in log sinks (D-D2) | drift-detector | `cd vigil-core && npm test -- --test-name-pattern="audio-log-redaction"` | ✅ Exists — extend with `voice-transcribe.ts` + g2-plugin scope |
| VOICE-08 | `audioControl(true)` / `(false)` pairing (D-D3) | drift-detector | `cd vigil-g2-plugin && npm test -- --test-name-pattern="audiocontrol-pairing"` | ❌ Wave 0 — `audiocontrol-pairing.test.ts` |

### D5 Latency Invariant (VOICE-06: ≤ 8s end-to-end)

The 8s criterion is measured from `DOUBLE_CLICK (stop)` → PWA dashboard row visible, **NOT** stop→HTTP. This is cross-device and cannot be fully automated in unit tests. The validation approach:

- **Unit-level proxy:** assert `bus.emitThoughtCreated` is called within the route handler (after DB insert returns). If the emit happens, the ~50ms SSE propagation + ~16ms React render means the only variable is `stop_to_http_ms`. With spike median 1,880ms, the total is well under 8s.
- **Integration test (Plan 03):** mock OpenAI client; real SSE connection; assert PWA `useThoughts` refetch fires within 500ms of the mock transcription completing. Not a full 8s timing test, but proves the SSE path is wired end-to-end.
- **Hardware UAT (Plan 07):** operator measures wallclock stop→dashboard row visible. The spike proved the backend-side floor (1.88s). The SSE fan-out adds ~50ms. Hardware confirmation closes the criterion.

### D6 Cost Invariant

`withBudgetTracking(userId, fn)` wraps the OpenAI call. Phase 130 MUST adapt the accumulator for OpenAI's duration-based billing (see Pitfall 1 above). The `ai-budget.test.ts` already tests `withBudgetTracking`; extend it to cover the OpenAI cost path.

### D7 Drift Detectors

| Detector | Test Location | Command |
|----------|---------------|---------|
| D-D1 WAV header | `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` | `cd vigil-g2-plugin && npm test -- --test-name-pattern="wav header"` |
| D-D2 audioPcm in logs | `vigil-core/src/__tests__/audio-log-redaction.test.ts` (extend) + `vigil-pwa/src/__tests__/denylist-parity.test.ts` (extend) | `cd vigil-core && npm test -- --test-name-pattern="audio-log-redaction"` |
| D-D3 audioControl pairing | `vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts` | `cd vigil-g2-plugin && npm test -- --test-name-pattern="audiocontrol-pairing"` |

### D8 Round-Trip Acceptance Test

Minimum integration test for Plan 03:

```typescript
// vigil-core/src/routes/__tests__/voice-transcribe-sse.test.ts
// Tests the full stop→SSE path with a mock OpenAI client.
// 1. Create a test SSE connection via bus.onThoughtCreated
// 2. POST /v1/voice/transcribe with mock transcribeWav that returns 'test'
// 3. Assert: DB row inserted, bus.emitThoughtCreated called with {thoughtId, content}
// 4. Assert: SSE listener received the thought-created payload
// Does NOT assert 8s timing (hardware UAT does that)
```

### Sampling Rate

- **Per task commit:** `cd vigil-core && npm test` or `cd vigil-g2-plugin && npm test` (relevant package only)
- **Per wave merge:** Both packages + PWA: `npm test` in all three
- **Phase gate:** Full suite green in all three packages before `/gsd:verify-work`

### Wave 0 Gaps (must be created before implementation begins)

- [ ] `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` — covers VOICE-04, VOICE-08 D-D1
- [ ] `vigil-g2-plugin/src/__tests__/voice.test.ts` — covers VOICE-02, VOICE-03 state machine
- [ ] `vigil-g2-plugin/src/__tests__/voice-queue.test.ts` — covers VOICE-07
- [ ] `vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts` — covers VOICE-08 D-D3
- [ ] `vigil-core/src/routes/__tests__/voice-transcribe.test.ts` — covers VOICE-05 (extend with factory-injection DI pattern from voice-spike.ts)
- [ ] `vigil-core/src/routes/__tests__/voice-transcribe-sse.test.ts` — D8 round-trip acceptance test (Plan 03)
- [ ] Extend `vigil-core/src/__tests__/audio-log-redaction.test.ts` — add `vigil-g2-plugin/src/` to the grep scope + `voice-transcribe.ts` to the allow-list
- [ ] Extend `vigil-pwa/src/lib/api-error-codes.test.ts` — add VOICE_TRANSCRIBE_* locked-enum pin tests

---

## Security Domain

> `security_enforcement` is absent from config.json — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `bearerAuth` middleware (index.ts:166); `requireVerifiedEmail` |
| V3 Session Management | no | stateless API; no session cookies |
| V4 Access Control | yes | `userId` from `c.get("userId")` (NEVER from body); W-01 cross-user isolation on all DB queries |
| V5 Input Validation | yes | `assertAudioSessionWithinCap` for audio payload; UUID v4 regex for `clientCaptureId` (mirror SCAP-01 `UUID_V4_REGEX`); JSON parse try/catch |
| V6 Cryptography | no | No new crypto; `crypto.randomUUID()` for cloudKitRecordID (existing pattern) |

### Known Threat Patterns for Phase 130 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Audio payload DoS (100MB body) | DoS | `assertAudioSessionWithinCap` checks base64 length BEFORE `Buffer.from()` allocation |
| Cross-user voice read | Information Disclosure | W-01: all `voice_captures` + `thoughts` queries must filter `eq(table.userId, userId)` |
| clientCaptureId replay from different user | Spoofing | Composite unique index is `(user_id, client_capture_id)` — per-user scope, not global |
| audioPcm in Sentry/PostHog | Information Disclosure | Phase 127 GUARD-01 `BLOCKED_PROPERTY_NAMES` + `beforeSend` redactor; D-D2 drift detector |
| Cost abuse via voice transcription | DoS/Financial | `requireAiBudget` pre-flight + `withBudgetTracking` accumulator |
| SSE cross-user bleed | Information Disclosure | `AgentEventBus` uses per-userId `EventEmitter` instances; structural isolation (Phase 119 D-03) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spike-grade `safeAudioControl` (discards return, no try/catch) | Production `safeAudioControl` returns `Promise<boolean>`; callers observe denial | Phase 130 (Run 4 hardening) | `[NO MIC]` state distinguishable from `[ERR]` |
| Spike `transcribeWav` (no timeout, no OpenAI budget accounting) | Production with 30s `AbortController` + OpenAI cost accumulation | Phase 130 | Cost cap enforced; `VOICE_TRANSCRIBE_TIMEOUT` surfaced to operator |
| PWA notified of G2 captures via 30s polling | SSE `thought-created` channel → immediate PWA refetch | Phase 130 | 8s VOICE-06 criterion achievable |
| Spike uses `localStorage` for queue (known Flutter WebView persistence gap) | D-O2 consciously uses `localStorage`; bridge.setLocalStorage noted as fallback | Phase 130 | Acceptable tradeoff; documented for Phase 133 follow-up |

**Deprecated/outdated:**
- `voice-spike.ts`, `voice-spike-encoder.ts`, `transcribe-spike.ts` (and 2 others): all deleted in Plan 01 per D-C1.
- `app.json` desc `"Phase 128a VOICE-01 spike: push-to-record voice capture for thought intake."`: reworded to production-grade in Plan 01 per D-C2.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WebView `localStorage` persists the offline queue across app restarts in Even Hub Flutter WebView | Offline queue pattern; D-O2 | Queue silently lost on force-quit → operator loses queued utterances; mitigation: fall back to `bridge.setLocalStorage` |
| A2 | `withBudgetTracking` adaptor for OpenAI duration-based billing can use `pcm.length / 32000` to estimate duration | Pitfall 1; budget tracking | If estimation is off by >50%, per-user cost cap may under-count actual spend; mitigation: use OpenAI response metadata if available |
| A3 | Per-chunk timestamp logging (`console.log('[voice] chunk bytes=… t=…')`) does not measurably impact G2 display rendering latency in production | D-T2 default-on decision | If 10 console.log/s causes rendering jank on G2, should become operator-toggle; verifiable in Plan 07 UAT |
| A4 | OpenAI SDK `AbortController` signal is respected by `ai.audio.transcriptions.create` (i.e., the `signal` option is accepted by the SDK) | Pitfall section; 30s timeout implementation | If SDK ignores signal, timeout won't fire; mitigation: wrap with `Promise.race([transcribeCall, timeoutReject])` as fallback |
| A5 | `voice-queue.ts` offline queue pattern (localStorage) — no prior exact implementation in codebase to verify against | Offline queue pattern | Shape may need adjustment once wired into the voice screen state machine |

---

## Open Questions

1. **OpenAI `withBudgetTracking` adaptor shape**
   - What we know: `withBudgetTracking` accumulates Anthropic token costs; OpenAI transcription bills by duration.
   - What's unclear: Should `withBudgetTracking` be extended to accept a pre-computed USD amount, or should a new `withOpenAIBudgetTracking` function be added to `lib/ai-budget.ts`?
   - Recommendation: Add `withOpenAIBudgetTracking(userId, usdAmount, fn)` that calls `fn()` and accumulates the provided `usdAmount` regardless of the response shape. Keeps the accumulator table unified (`ai_usage_daily`) while supporting both billing models.

2. **`voiceCaptures` Drizzle schema location**
   - What we know: `vigil-core/src/db/schema.ts` holds all table definitions. Adding `voiceCaptures` here is the pattern.
   - What's unclear: Should `voiceCaptures` join `schema.ts` inline or get its own file?
   - Recommendation: Add to `schema.ts` inline (all other tables are there). No precedent for a split-out schema file in this codebase.

3. **SSE subscriber location in PWA**
   - What we know: The PWA has `useThoughts.ts:127` which already listens for `vigil:thought-created`. The G2 plugin's SSE client lives in `vigil-g2-plugin/src/lib/sse-client.ts`.
   - What's unclear: Does the PWA already have an SSE client connected to `/v1/agent-stream`? If not, where does the new subscriber live?
   - Recommendation: Planner should grep for `agent-stream` usage in the PWA before Plan 03. The SSE subscriber for `thought-created` events should extend the EXISTING PWA SSE connection (if one exists) rather than open a second connection to the same endpoint. If no PWA SSE client exists, create one in `vigil-pwa/src/hooks/useAgentStream.ts` that dispatches window events on receipt of `thought-created` SSE frames.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection: `vigil-core/drizzle/` (migration sequence 0001-0022 confirmed), `vigil-core/src/lib/agent-events-bus.ts` (EventEmitter pattern + cleanup gate), `vigil-core/src/routes/agent-stream.ts` (SSE handler + cleanup pattern), `vigil-core/src/lib/audio-cap.ts`, `vigil-core/src/lib/ai-budget.ts`, `vigil-core/src/routes/voice-spike.ts`, `vigil-g2-plugin/src/lib/audio-session-guard.ts`, `vigil-g2-plugin/src/screens/voice-spike.ts`, `vigil-pwa/src/hooks/useThoughts.ts:127`, `vigil-pwa/src/lib/api-error-codes.ts:145-158`
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-SPIKE-DECISION.md` — PASS verdict, Run 4 hardening
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-MEASUREMENTS.md` — raw timing data
- `.planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/130-CONTEXT.md` — full decision set
- `.planning/research/EVEN-SKILLS.md` — SDK audio API, background-state semantics, localStorage warning
- `.planning/research/STACK.md` §1 — OpenAI transcription snippet, WAV encoder shape
- `.planning/research/PITFALLS.md` §§1-3, 8 — audio PCM redaction, session runaway, cost runaway, latency

### Secondary (MEDIUM confidence)
- `.planning/phases/127-pre-spike-guardrails/127-CONTEXT.md` — guardrail decisions + guard-module locations confirmed
- `.planning/phases/127.5-g2-input-gesture-audit/127.5-AUDIT.md` — REACTIVATE verdict, Phase 133 deferral confirmed
- `vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql` — dedup pattern reference (SCAP-04 / SVCNOW-04)
- `vigil-core/src/routes/captures-screenshot.ts` — DI factory pattern + dedup short-circuit shape

### Tertiary (LOW confidence)
- A1-A5 in Assumptions Log above — implementation details inferred from patterns; not verified by execution

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified installed; no new installs
- Architecture: HIGH — SSE/bus extension verified against live code; route pattern verified against spike + SCAP reference
- Migration number: HIGH — directory listing confirmed 0022 is last; 0023 is correct
- Dedup table decision: HIGH — reasoning from existing schema + SCAP-04 pattern
- SSE channel decision: HIGH — agent-events-bus code read; `QUIET_NAME` precedent is exact template
- Offline queue shape: MEDIUM — D-O1..D-O4 decisions are locked; specific localStorage persistence is ASSUMED (A1)
- OpenAI budget adaptor: MEDIUM — spike explicitly deferred this; adaptor shape is ASSUMED (A2)
- Pitfalls: HIGH — sourced from codebase grep + Phase 127/128a prior art

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (30-day window; no fast-moving dependencies; OpenAI pricing stable)
