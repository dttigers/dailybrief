# Phase 128a: VOICE-01 PCM feasibility spike — Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 9 (5 NEW, 4 MODIFIED)
**Analogs found:** 9 / 9 (all exact role + data-flow match)
**Note:** Honors RESEARCH DRIFT-01 — CONTEXT's `voice-spike-page.html` is replaced by a programmatic TS screen module (`vigil-g2-plugin/src/screens/voice-spike.ts`) because plugin screens are TS-built `RebuildPageContainer` objects, not HTML files.

---

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|---------|------|-----------|----------------|---------------|
| `vigil-g2-plugin/src/screens/voice-spike.ts` | NEW | screen-builder (G2 view) | event-driven (DOUBLE_CLICK → toggle) | `vigil-g2-plugin/src/screens/affirmation.ts` (layout) + `companion.ts:386-399` (isEventCapture body) | exact |
| `vigil-g2-plugin/scripts/voice-spike-encoder.ts` | NEW | utility (binary builder) | transform (Uint8Array → WAV → base64) | none in plugin lib (hand-rolled 44-byte WAV header per CONTEXT D-W1) | no-analog (greenfield; STACK §1c sketches header) |
| `vigil-g2-plugin/app.json` | MODIFIED | config (permissions manifest) | declarative | existing `"network"` entry inline in same file | exact |
| `vigil-g2-plugin/src/navigation.ts` | MODIFIED | router/state-machine | event-driven (SCROLL → next screen) | self (existing `Screen.AFFIRMATION` + `SCREEN_ORDER` entries) | exact |
| `vigil-g2-plugin/src/main.ts` | MODIFIED | entry/event-router | event-driven (`onEvenHubEvent` → dispatch) | self (existing DOUBLE_CLICK_EVENT branch `navigation.ts:219-238`) | exact |
| `vigil-core/src/routes/voice-spike.ts` | NEW | route (controller) | request-response (POST JSON, return JSON) | `vigil-core/src/routes/process-audio.ts:44-206` | exact |
| `vigil-core/src/ai/transcribe-spike.ts` | NEW | service (AI client wrapper) | request-response (Buffer → text) | `vigil-core/src/ai/client.ts:5-19` (lazy-init pattern) | role-match (OpenAI vs Anthropic; same lazy gate) |
| `vigil-core/src/index.ts` | MODIFIED | bootstrap (route mount + onError) | declarative | self (existing `app.route("/v1", processAudio)` at line 221 + `app.onError` at line 266) | exact |
| `vigil-core/src/routes/__tests__/voice-spike.test.ts` | NEW Wave 0 | test (smoke) | request-response (test client) | `vigil-core/src/routes/__tests__/agent-stream.test.ts:1-110` (env-preamble + makeApp pattern) | role-match (smoke shape, not full integration) |

---

## Pattern Assignments

### 1. `vigil-g2-plugin/src/screens/voice-spike.ts` (NEW; screen-builder; event-driven)

**Analog:** `vigil-g2-plugin/src/screens/affirmation.ts` (lines 1-62) — same display dimensions, same 3-container header/body/footer layout, same `isEventCapture: 1` on body that the DOUBLE_CLICK_EVENT route in `navigation.ts:219-238` already pattern-matches against.

**Tossable header (mandatory; CONTEXT D-A2):**
```typescript
// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is
// spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
// Convention precedent: vigil-g2-plugin/scripts/check-verified.mjs
```

**Imports pattern (copy from `affirmation.ts:1-7`):**
```typescript
import {
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import { DISPLAY_WIDTH, ContainerId } from '../constants.ts'
import { buildVigilHeader } from './header.ts'
```

**Core layout pattern (mirror `affirmation.ts:17-61` — header/body/footer triple):**
```typescript
export function buildVoiceSpikeScreen(recording: boolean): RebuildPageContainer {
  const header = buildVigilHeader(
    ContainerId.VOICE_SPIKE_HEADER, // ADD to constants.ts (see "Required constant additions" below)
    'vs-header',
  )

  // Body — isEventCapture: 1 so DOUBLE_CLICK_EVENT fires here.
  // Matches companion.ts:386-399 (hardware-verified DOUBLE_CLICK source).
  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 1,
    borderColor: 15,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.VOICE_SPIKE_BODY,
    containerName: 'vs-body',                  // ≤11 chars per Phase 125 hardware-debug-2026-05-10 fix in navigation.ts:71-77
    content: recording ? 'REC ●\n\n(double-tap to stop)' : 'VOICE SPIKE\n\n(double-tap to record)',
    isEventCapture: 1,                         // load-bearing: DOUBLE_CLICK routes through this
  })

  const footer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 250,
    width: DISPLAY_WIDTH,
    height: 38,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.VOICE_SPIKE_FOOTER,
    containerName: 'vs-footer',
    content: '↑ home   () double-tap',
    isEventCapture: 0,
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, body, footer],
  })
}
```

**Delta from analog:** Adds module-scope `recording: boolean` (default `false`) plus a setter `setRecording(on: boolean)` that the main.ts DOUBLE_CLICK handler flips. Affirmation has no toggle state — voice-spike does. Pattern source for module-scope mutable state: `vigil-g2-plugin/src/lib/audio-session-guard.ts:63-66` (`let audioActive = false`).

**Required constant additions** — `vigil-g2-plugin/src/constants.ts` currently maxes at `COMPANION_FOOTER: 15`. Add (modifies existing file but minimal):
```typescript
  VOICE_SPIKE_HEADER: 16,    // Phase 128a SPIKE — TOSSABLE
  VOICE_SPIKE_BODY: 17,
  VOICE_SPIKE_FOOTER: 18,
```
SDK constraint is "1~12 PER PAGE" (per `constants.ts:9-11` comment), not global — so 16-18 are fine.

**Gotchas:**
- Container name MUST be ≤11 chars (Phase 125 hardware bug; SDK runtime enforces strict <16 even though check-verified.mjs accepts ≤16). `'vs-body'` (7 chars) is safe.
- `isEventCapture: 1` on body is load-bearing — that's what makes DOUBLE_CLICK reach the handler.

---

### 2. `vigil-g2-plugin/scripts/voice-spike-encoder.ts` (NEW; utility; transform)

**Analog:** None in plugin lib (no existing binary builders). STACK §1c sketches the WAV header bytes; this is greenfield hand-rolled little-endian writes (CONTEXT D-W1 explicitly rejects the `wavefile` npm package — "Hand-roll the 44-byte WAV header" per RESEARCH "Alternatives Considered" line 160).

**Tossable header (mandatory):**
```typescript
// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is
// spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
```

**Core pattern (44-byte canonical WAV-PCM-44 header; STACK §1c spec):**
```typescript
/**
 * Build a 44-byte WAV header for 16 kHz mono 16-bit LE PCM, then prepend
 * it to the concatenated PCM bytes. Returns a single WAV-encoded Uint8Array
 * ready to base64-encode and POST.
 *
 * Format lock (EVEN-SKILLS.md §"Audio capture" lines 94-118):
 *   sampleRate=16000, channels=1, bitsPerSample=16  → byteRate=32000
 */
const SAMPLE_RATE = 16000
const CHANNELS = 1
const BITS_PER_SAMPLE = 16

export function buildWav(pcm: Uint8Array): Uint8Array {
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8)  // 32000
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8)              // 2
  const dataLen = pcm.length
  const totalLen = 44 + dataLen
  const buf = new Uint8Array(totalLen)
  const view = new DataView(buf.buffer)

  // 'RIFF' chunk
  buf.set([0x52, 0x49, 0x46, 0x46], 0)    // "RIFF"
  view.setUint32(4, totalLen - 8, true)
  buf.set([0x57, 0x41, 0x56, 0x45], 8)    // "WAVE"

  // 'fmt ' subchunk
  buf.set([0x66, 0x6d, 0x74, 0x20], 12)   // "fmt "
  view.setUint32(16, 16, true)             // subchunk1 size (PCM=16)
  view.setUint16(20, 1, true)              // audio format (PCM=1)
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BITS_PER_SAMPLE, true)

  // 'data' subchunk
  buf.set([0x64, 0x61, 0x74, 0x61], 36)   // "data"
  view.setUint32(40, dataLen, true)
  buf.set(pcm, 44)

  return buf
}

/** Base64-encode a Uint8Array via the WebView's btoa. */
export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
```

**Delta from research:** STACK research suggests Node `Buffer` writes; plugin runs in a Flutter WebView (no Node `Buffer`), so we use `DataView` + `Uint8Array`. The `btoa` path is verified-present in `vigil-g2-plugin` because the existing `api.ts` Bearer-header path already uses WebView primitives.

**Gotchas:**
- Sample math (CONTEXT D-W1): `5s × 32_000 = 160_000 PCM bytes + 44 header = 160_044 → base64 ≈ 213_392 chars`. Well under the `MAX_AUDIO_B64_CHARS_60S = 2_560_000` cap.
- File location is `vigil-g2-plugin/scripts/` NOT `vigil-g2-plugin/src/` — keeps it out of the plugin bundle (CONTEXT D-A3, mirrors `scripts/check-verified.mjs` precedent). Verified via `npm run pack` output size pre-resubmit.

---

### 3. `vigil-g2-plugin/app.json` (MODIFIED; config)

**Analog:** Self — existing `permissions[]` entry for `network`.

**Existing block (lines 10-16):**
```json
"permissions": [
  {
    "name": "network",
    "desc": "Fetches work orders, reminders, and affirmation data from the Vigil Core API.",
    "whitelist": ["https://api.vigilhub.io"]
  }
]
```

**Delta — append new entry per CONTEXT D-G2:**
```json
"permissions": [
  {
    "name": "network",
    "desc": "Fetches work orders, reminders, and affirmation data from the Vigil Core API.",
    "whitelist": ["https://api.vigilhub.io"]
  },
  {
    "name": "g2-microphone",
    "desc": "Phase 128a VOICE-01 spike: push-to-record voice capture for thought intake."
  }
]
```

**Gotchas:**
- `g2-microphone` is the canonical SDK permission name per EVEN-SKILLS.md §"Audio capture". Operator MUST verify Even Hub developer portal allowlist accepts this BEFORE plugin pack (wallclock checkpoint C-2; CONTEXT D-G2). If portal rejects → spike returns BLOCK in first 30 minutes (D-BLOCK).
- No `whitelist` array for `g2-microphone` — that field is `network`-specific.

---

### 4. `vigil-g2-plugin/src/navigation.ts` (MODIFIED; router state-machine)

**Analog:** Self — `Screen.AFFIRMATION` (line 31) + `SCREEN_ORDER` entry (line 41) + `buildScreen` branch (lines 112-115).

**Existing `Screen` enum (lines 27-33):**
```typescript
export const Screen = {
  HOME: 'home',
  COMPANION: 'companion',
  WORK_ORDERS: 'work-orders',
  AFFIRMATION: 'affirmation',
  TASK_DETAIL: 'task-detail',
} as const
```

**Existing `SCREEN_ORDER` (lines 37-42):**
```typescript
const SCREEN_ORDER: readonly ScreenName[] = [
  Screen.HOME,
  Screen.COMPANION,
  Screen.WORK_ORDERS,
  Screen.AFFIRMATION,
]
```

**Existing `buildScreen` branch pattern (lines 112-115):**
```typescript
case Screen.AFFIRMATION: {
  const result = await fetchAffirmation()
  return buildAffirmationScreen(result.affirmation)
}
```

**Delta — three edits:**

1. Add to `Screen` enum:
   ```typescript
   VOICE_SPIKE: 'voice-spike',   // Phase 128a SPIKE — TOSSABLE
   ```
2. Add to `SCREEN_ORDER` (after AFFIRMATION per phase prompt; the carousel order is HOME → COMPANION → WORK_ORDERS → AFFIRMATION → VOICE_SPIKE):
   ```typescript
   Screen.VOICE_SPIKE,           // Phase 128a SPIKE — TOSSABLE
   ```
3. Add to `buildScreen` (no API fetch — recording state lives in screen module):
   ```typescript
   case Screen.VOICE_SPIKE: {
     const { buildVoiceSpikeScreen, getRecording } = await import('./screens/voice-spike.ts')
     return buildVoiceSpikeScreen(getRecording())
   }
   ```
   OR (preferred — static import mirroring lines 12-16 to dodge the dynamic-import bug Phase 125 fixed at line 222):
   ```typescript
   import { buildVoiceSpikeScreen, getRecording } from './screens/voice-spike.ts'
   ...
   case Screen.VOICE_SPIKE: {
     return buildVoiceSpikeScreen(getRecording())
   }
   ```

**Gotchas:**
- **Use static imports** (lines 12-16 pattern), NOT dynamic. The Phase 125 follow-up at `navigation.ts:222-224` explicitly converted dynamic imports back to static because `INEFFECTIVE_DYNAMIC_IMPORT` fails on the Hermes engine. Spike must not regress this.
- DO NOT add a DOUBLE_CLICK_EVENT branch for `Screen.VOICE_SPIKE` here. The Companion D-08 carve-out (lines 219-238) routes DOUBLE_CLICK to navigation actions (banner-ack / cycle / jump-Home). The voice-spike screen needs DOUBLE_CLICK to toggle recording, NOT navigate. Handle the route at `main.ts` BEFORE `handleNavEvent` dispatches (see file 5 below).
- Container names must stay ≤11 chars (Phase 125 hardware-debug-2026-05-10 fix at lines 71-77).

---

### 5. `vigil-g2-plugin/src/main.ts` (MODIFIED; entry/event-router)

**Analog:** Self — the Companion DOUBLE_CLICK carve-out is the load-bearing precedent. The pattern is: intercept DOUBLE_CLICK_EVENT BEFORE `handleNavEvent` dispatches, when on a specific screen.

**Existing event-router shape (`main.ts:221-260`):**
```typescript
bridge.onEvenHubEvent((event) => {
  // List item click → task detail
  if (
    event.listEvent?.eventType === OsEventTypeList.CLICK_EVENT &&
    event.listEvent.currentSelectItemIndex != null &&
    bridge
  ) {
    void navigateToTaskDetail(event.listEvent.currentSelectItemIndex, bridge)
    return
  }

  // List events (temple touchpad swipes on list containers)
  if (event.listEvent?.eventType && NAV_EVENTS.has(event.listEvent.eventType) && bridge) {
    void handleNavEvent(event.listEvent.eventType, bridge)
    return
  }

  // Text events (temple touchpad swipes on text containers)
  if (event.textEvent?.eventType && NAV_EVENTS.has(event.textEvent.eventType) && bridge) {
    void handleNavEvent(event.textEvent.eventType, bridge)
    return
  }
  ...
})
```

**Existing Companion DOUBLE_CLICK precedent (`navigation.ts:219-238`):**
```typescript
if (
  currentScreen === Screen.COMPANION &&
  eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
) {
  if (hasActiveBanner()) { ackBanner(); await refreshCurrentScreen(bridge); return }
  if (getActiveSessions().length >= 2) { cycleSession(); ... ; return }
  await navigateTo(Screen.HOME, bridge)
  return
}
```

**Delta — add a VOICE_SPIKE DOUBLE_CLICK_EVENT carve-out:**

Option A (in `main.ts` event listener, intercept BEFORE `handleNavEvent`):
```typescript
// Phase 128a SPIKE — VOICE_SPIKE DOUBLE_CLICK toggles recording.
// MUST be checked BEFORE the NAV_EVENTS handlers below — DOUBLE_CLICK is
// in NAV_EVENTS and handleNavEvent would otherwise jump to HOME.
const isDoubleClick =
  event.textEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
  event.sysEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
if (isDoubleClick && getCurrentScreen() === Screen.VOICE_SPIKE && bridge) {
  void toggleVoiceSpikeRecording(bridge)
  return
}
```

Option B (preferred — extend `navigation.ts:handleNavEvent` with the same shape as the Companion carve-out at lines 219-238). This keeps event-routing in one file:
```typescript
// Phase 128a SPIKE — VOICE_SPIKE DOUBLE_CLICK toggles recording (TOSSABLE).
// Mirrors Companion D-08 carve-out at lines 219-238 above. Single-press
// REACTIVATE patch is Phase 133; spike depends on DOUBLE_CLICK only
// (memory: project_g2_companion_doubletap_hardware_verified 2026-05-10).
if (
  currentScreen === Screen.VOICE_SPIKE &&
  eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
) {
  await toggleVoiceSpikeRecording(bridge)
  return
}
```

**`toggleVoiceSpikeRecording` body (lives in `screens/voice-spike.ts`):**
```typescript
import { safeAudioControl } from '../lib/audio-session-guard.ts'

let recording = false
const pcmChunks: Uint8Array[] = []

export function getRecording(): boolean {
  return recording
}

export async function toggleVoiceSpikeRecording(
  bridge: Parameters<typeof safeAudioControl>[1],
): Promise<void> {
  recording = !recording
  if (recording) {
    console.time('mic-on')                                // D-M1 mic_on_latency
    pcmChunks.length = 0
    // audioEvent collector registered once per session — see main.ts wiring
  }
  await safeAudioControl(recording, bridge)               // Phase 127 GUARD-02 wrapper — NEVER call bridge.audioControl directly
  if (!recording) {
    // ... concat pcmChunks, buildWav, base64, POST /v1/voice/transcribe
  }
}
```

**PCM collector wiring (also `main.ts` — inside the existing `bridge.onEvenHubEvent` registration):**
```typescript
if (event.audioEvent?.audioPcm) {
  console.timeEnd('mic-on')                                       // first chunk → ends mic_on_latency timer
  const chunkBytes = event.audioEvent.audioPcm.length             // safe name per GUARD-01
  console.log(`[voice-spike] chunk bytes=${chunkBytes}`)           // NO 'audio' or 'pcm' token in string per BLOCKED_PROPERTY_NAMES
  appendPcmChunk(event.audioEvent.audioPcm)                       // exported from voice-spike.ts
  return
}
```

**Gotchas:**
- **MUST intercept before `NAV_EVENTS.has(eventType)` dispatch** — `DOUBLE_CLICK_EVENT` IS in `NAV_EVENTS` (line 69), so without the carve-out it would jump to HOME via the default switch at `navigation.ts:249-251`.
- **Use `safeAudioControl(on, bridge)` — never `bridge.audioControl(on)` directly.** Phase 127 GUARD-02 wrapper at `vigil-g2-plugin/src/lib/audio-session-guard.ts:80` is the only acceptable mic API per CONTEXT line 162-163.
- **Console log names** (GUARD-01 compliance): use `bytes`, `chunk_n`, `gap_ms` — NEVER `audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer` (the `BLOCKED_PROPERTY_NAMES` set at `vigil-core/src/analytics/posthog.ts:32`).

---

### 6. `vigil-core/src/routes/voice-spike.ts` (NEW; route; request-response)

**Analog:** `vigil-core/src/routes/process-audio.ts` (lines 44-206) — same auth-gate ordering, same JSON-body parse, same `requireAiBudget` chokepoint, same fire-and-forget triage tail, same `thoughts` insert + return shape.

**Tossable header (mandatory):**
```typescript
// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is
// spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
// Convention precedent: vigil-g2-plugin/scripts/check-verified.mjs
```

**Imports pattern (mirror `process-audio.ts:1-9`):**
```typescript
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { callClaude, parseAIJson } from "../ai/client.js";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable } from "../db/schema.js";
import type { TriageResult } from "../ai/types.js";
import { requireAiBudget } from "../lib/ai-budget.js";
import { assertAudioSessionWithinCap } from "../lib/audio-cap.js";   // Phase 127 GUARD-02
import { transcribeWav } from "../ai/transcribe-spike.js";           // NEW (see file 7)
```

**Core CRUD pattern (mirror `process-audio.ts:43-206` — sequence locked by CONTEXT D-W2):**
```typescript
export const voiceSpike = new Hono();

// Triage prompt — verbatim copy from process-audio.ts:14-27
const TRIAGE_SYSTEM_PROMPT = `You are a thought categorizer and tagger. Categorize the user's thought into exactly one of these categories:
... [identical to process-audio.ts:14-27] ...`;

// POST /voice/transcribe — Phase 128a spike: G2 PCM → OpenAI transcription → thought + triage.
voiceSpike.post("/voice/transcribe", async (c) => {
  const userId = c.get("userId") as number;

  // 1. Phase 127 GUARD-03 — per-user daily AI budget gate (BEFORE body parse).
  //    Throws DailyBudgetExceededError → 429 via app.onError (index.ts:277-282).
  await requireAiBudget(userId);

  // 2. Parse JSON body { audio: string }
  let body: { audio?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.audio || typeof body.audio !== "string") {
    return c.json({ error: "audio is required and must be a base64 string" }, 400);
  }

  // 3. Phase 127 GUARD-02 — 60s cap. Throws AudioSessionTooLongError.
  //    NOTE: index.ts onError currently only branches DailyBudgetExceededError.
  //    Plan must EITHER (a) catch+translate inline here, OR (b) extend the
  //    onError block (see "Shared Patterns" below). Recommendation: inline
  //    catch — keeps the spike tossable without touching shared onError.
  try {
    assertAudioSessionWithinCap(body.audio);
  } catch (err) {
    if (err instanceof Error && err.name === "AudioSessionTooLongError") {
      return c.json({ error: err.message, code: "AUDIO_SESSION_TOO_LONG" }, 413);
    }
    throw err;
  }

  // 4. Decode → transcribe via OpenAI gpt-4o-mini-transcribe
  let transcription: string;
  try {
    const wav = Buffer.from(body.audio, "base64");
    transcription = await transcribeWav(wav);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown AI error";
    console.error("[vigil-core] /voice/transcribe OpenAI call failed:", msg);
    return c.json({ error: "AI transcription failed" }, 502);
  }
  if (!transcription.trim()) {
    return c.json({ error: "Transcription produced no text" }, 422);
  }

  // 5. Insert thought (source='g2_voice' per CONTEXT D-W2 step 7).
  //    thoughts.source is freeform `text("source").notNull()` per schema.ts:99
  //    — no enum constraint, 'g2_voice' inserts cleanly.
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

  // 6. Fire-and-forget triage — verbatim copy of process-audio.ts:172-194
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
          ...(result.therapyClassification ? { therapyClassification: result.therapyClassification } : {}),
        })
        .where(and(eq(thoughtsTable.id, insertedRow.id), eq(thoughtsTable.userId, userId)));
    } catch (err) {
      console.error("[vigil-core] /voice/transcribe triage failed (non-fatal):", err);
    }
  })();

  // 7. Return created thought (matches process-audio.ts:197-205 shape)
  return c.json({ id: insertedRow.id, content: insertedRow.content }, 201);
});
```

**Delta from analog (`process-audio.ts`):**
- Drops `mediaType` validation (CONTEXT D-W1 locks WAV; one format).
- Drops `MAX_AUDIO_B64_CHARS = 10MB` size guard at line 69-72 — replaced by the stricter Phase 127 GUARD-02 60s cap (`MAX_AUDIO_B64_CHARS_60S = 2_560_000`).
- Drops `getAIClient()` gate (Anthropic) — replaced by OpenAI client gate inside `transcribeWav`.
- Drops the Anthropic `beta.files.upload` + `beta.messages.create` path (lines 91-147) — replaced by single `transcribeWav(wav)` call.
- Source value: `"g2_voice"` instead of `"voice"` (per CONTEXT D-W2 step 7 + VOICE-05 spec).

**Gotchas:**
- **`source: 'g2_voice'` is correct** per schema verification: `vigil-core/src/db/schema.ts:99` defines `source: text("source").notNull()` (freeform, no enum constraint).
- **Triage prompt MUST be verbatim** copy of `process-audio.ts:14-27`. Don't paraphrase — the prompt is load-bearing for category extraction tests downstream.
- **`AudioSessionTooLongError` is NOT yet in `app.onError`** (index.ts:266-299 only branches `DailyBudgetExceededError`). The inline catch-and-return-413 pattern keeps the spike scope-pure and avoids touching shared infrastructure.

---

### 7. `vigil-core/src/ai/transcribe-spike.ts` (NEW; service; request-response)

**Analog:** `vigil-core/src/ai/client.ts` (lines 5-19) — lazy-init singleton with env-key gate, same module-scope `let client: T | null = null` pattern.

**Tossable header (mandatory):**
```typescript
// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is
// spike-only and MUST be deleted or rewritten before Phase 130 lands.
// Phase 130 productionizes under vigil-core/src/ai/transcribe.ts.
```

**Imports + lazy-init pattern (mirror `client.ts:1-19`, swap Anthropic → OpenAI):**
```typescript
import OpenAI, { toFile } from "openai";

let client: OpenAI | null = null;

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "WARNING: OPENAI_API_KEY not set. /v1/voice/transcribe will return 503.",
  );
}

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI();   // SDK reads OPENAI_API_KEY from env automatically
  }
  return client;
}
```

**Core service pattern (`audio.transcriptions.create` per RESEARCH §Standard Stack lines 140-143):**
```typescript
/**
 * Transcribe a WAV-encoded Buffer via OpenAI gpt-4o-mini-transcribe.
 * $0.003/min; 500-1500ms expected latency per STACK §1c.
 *
 * Cost-tracking note: OpenAI spend is NOT yet wired into withBudgetTracking
 * (which counts Anthropic tokens via callClaude wrappers). The per-user
 * pre-flight requireAiBudget(userId) call in voice-spike.ts:1 is the only
 * gate; spike's expected ~12-clip total cost (≈ $0.05) sits well clear of
 * the $0.50/user/day cap. Phase 130 productionization adds OpenAI accounting.
 */
export async function transcribeWav(wav: Buffer): Promise<string> {
  const ai = getOpenAIClient();
  if (!ai) throw new Error("OpenAI client not available — OPENAI_API_KEY not configured");

  const file = await toFile(wav, "voice.wav");
  const response = await ai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
  });
  return response.text;
}
```

**Delta from analog (`client.ts`):**
- Anthropic → OpenAI SDK. `import OpenAI, { toFile } from "openai"` is the canonical v6.x shape per RESEARCH §"Standard Stack" line 142.
- Single `transcribeWav(buf)` helper instead of three `callClaude*` variants.
- No `withBudgetTracking` wrap — OpenAI billing is separate from Anthropic; spike's pre-flight `requireAiBudget` is the chokepoint, accounting is deferred to Phase 130.

**Gotchas:**
- **`openai@^6.37.0`** per RESEARCH DRIFT-03 (NOT `^4.79.0` as STACK§"Version Compatibility" claims — training-stale). `package.json` dependency line:
  ```json
  "openai": "^6.37.0"
  ```
  Verify at install time: `npm view openai version` should return ≥ 6.37.0.
- **`OPENAI_API_KEY` is operator-set in Railway** (wallclock checkpoint C-1; CONTEXT D-W4). Do NOT dump `railway variables` (leaks all secrets — see memory `feedback_railway_variables_leak`); use `railway variables get OPENAI_API_KEY` or Dashboard.
- **`toFile(wav, 'voice.wav')` is OpenAI SDK's Node-Buffer→File adapter.** Don't construct a `new File()` manually — `toFile` handles the Node-vs-browser File polyfill cleanly.

---

### 8. `vigil-core/src/index.ts` (MODIFIED; bootstrap)

**Analog:** Self — `processAudio` mount at line 221 + the surrounding import/route block.

**Existing import (line 27):**
```typescript
import { processAudio } from "./routes/process-audio.js";
```

**Existing mount (line 221, under bearerAuth + requireVerifiedEmailWithGrace chain):**
```typescript
app.route("/v1", processAudio);
```

**Delta — two edits:**

1. Add import after line 27:
   ```typescript
   import { voiceSpike } from "./routes/voice-spike.js"; // Phase 128a SPIKE — TOSSABLE
   ```
2. Add mount after line 221 (anywhere under the bearerAuth + requireVerifiedEmailWithGrace chain — line 182 mounts the verify-grace middleware):
   ```typescript
   app.route("/v1", voiceSpike); // Phase 128a SPIKE — TOSSABLE. Phase 130 productionizes.
   ```

**Gotchas:**
- **MUST be mounted AFTER the bearerAuth dispatcher (line ~175)** and AFTER `requireVerifiedEmailWithGrace` (line 182) — `c.get("userId")` is only populated after bearerAuth runs. Same constraint that gates `agentEvents`/`agentStream`/`quietMode` mounts (lines 247/255/262).
- **DO NOT extend `app.onError`** for `AudioSessionTooLongError` — keep that catch inline in the spike route per file 6 above. The onError block at lines 266-299 stays pristine; Phase 130 productionization is the right place to add the typed-error → 413 branch alongside the existing `DailyBudgetExceededError` → 429 branch (lines 277-282 pattern).
- **No `openai` install needed for `index.ts`** — only `vigil-core/package.json` needs the new `"openai": "^6.37.0"` dependency (RESEARCH line 165-168).

---

### 9. `vigil-core/src/routes/__tests__/voice-spike.test.ts` (NEW Wave 0; smoke test)

**Analog:** `vigil-core/src/routes/__tests__/agent-stream.test.ts` (lines 1-110) — the only test in the `__tests__/` subdir; same env preamble, same lazy-import-after-env, same outer-Hono-with-c.set-userId pattern. Also see `vigil-core/src/routes/quiet-mode.test.ts:1-81` for the factory-deps pattern (route-level alternative).

**Tossable header + env preamble (mandatory):**
```typescript
// PHASE 128a SPIKE — TOSSABLE smoke test for /v1/voice/transcribe.
// One green case: POST with valid base64 WAV returns 201 + {id, content}.
// Drift-detector tests EXPLICITLY out of scope (CONTEXT line 132).

// JWT_SECRET preamble — defensive even though voice-spike.ts has no JWT imports.
// Mirrors agent-stream.test.ts:1-5 self-contained copy-paste safety.
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Lazy imports after env is set (mirror agent-stream.test.ts:12-13)
const { voiceSpike } = await import("../voice-spike.js");
```

**Core test setup pattern (mirror `agent-stream.test.ts:82-112`):**
```typescript
function makeApp(opts: { userId: number }): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId" as never, opts.userId as never);
    await next();
  });
  app.route("/", voiceSpike);
  return app;
}

test("POST /voice/transcribe — base64 WAV body shape rejected without audio", async () => {
  const app = makeApp({ userId: 1 });
  const res = await app.request("/voice/transcribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});
```

**Delta from analog:**
- Lighter than `agent-stream.test.ts` — no `makeFakeBus`, no SSE frame parsing. Spike scope is one happy-path smoke + one validation-error smoke (CONTEXT line 132: "drift-detector tests for the spike scaffold are EXPLICITLY skipped").
- Tests live at `vigil-core/src/routes/__tests__/voice-spike.test.ts` per phase prompt — this matches `agent-stream.test.ts`'s location. (Most other route tests live as siblings under `vigil-core/src/routes/*.test.ts`; the `__tests__/` subdir is reserved for the agent-stream pattern. Either works; the phase prompt specifies `__tests__/`.)

**Gotchas:**
- **`tsx --test` not Vitest.** Test runner is node:test via tsx (RESEARCH §"Core" line 136-137 + `vigil-core/package.json:9`). Imports use `node:test` + `node:assert/strict`.
- **JWT_SECRET preamble is mandatory before any vigil-core import** (Phase 124 lock). Even though voice-spike.ts itself doesn't import JWT, transitive imports may.
- **Don't test transcription end-to-end** — that'd hit the OpenAI API. Stub `transcribeWav` if a 201-success test is desired, OR just smoke the 400/413 validation branches.

---

## Shared Patterns

### Tossable header comment (all 4 NEW files)

**Source:** Convention precedent at `vigil-g2-plugin/scripts/check-verified.mjs` (per CONTEXT line 205-206 + RESEARCH §"Pattern 1" lines 287-300).

**Apply to:** `voice-spike.ts` (screen), `voice-spike-encoder.ts`, `voice-spike.ts` (route), `transcribe-spike.ts`.

```typescript
// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is
// spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
// Convention precedent: vigil-g2-plugin/scripts/check-verified.mjs
```

Header acts as a grep-anchor for Phase 130 cleanup. Use the exact string `PHASE 128a SPIKE — TOSSABLE` so a `grep -r "PHASE 128a SPIKE"` at hardening time finds every file.

---

### Auth + email-verify chain (all 1 NEW route)

**Source:** `vigil-core/src/index.ts:175-182` — bearerAuth dispatcher followed by `requireVerifiedEmailWithGrace` (24h grace).

**Apply to:** `voice-spike.ts` route mount.

Mount the new route AFTER both middleware are installed (anywhere from line 198 onwards). The route handler MUST read `userId` via `c.get("userId") as number` — never from request body (cross-user-isolation T-125-01 mitigation pattern).

```typescript
// In the handler:
const userId = c.get("userId") as number;
await requireAiBudget(userId);   // Phase 127 GUARD-03 chokepoint
```

---

### GUARD-01 log redaction (all G2 plugin console.log + server console.log)

**Source:** `vigil-core/src/analytics/posthog.ts:32` `BLOCKED_PROPERTY_NAMES` Set — includes `audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer`.

**Apply to:** Every console.log in `voice-spike.ts` (screen + route), `voice-spike-encoder.ts`, `transcribe-spike.ts`.

**Safe property names:** `bytes`, `chunk_n`, `gap_ms`, `mic_on_ms`, `e2e_ms`, `b64_chars`.

**Forbidden in log strings:** the literal tokens `audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer`.

Sentry beforeSend (`vigil-core/src/lib/sentry.ts`) + PostHog before_send already redact these — but the local console drift detector (Phase 127 GUARD-01) catches them in CI. Spike code runs locally first; lint will fail before push.

---

### Throw-based error funneling (NEW route)

**Source:** `vigil-core/src/index.ts:266-299` `app.onError` (existing branch for `DailyBudgetExceededError` → 429).

**Apply to:** Spike route does NOT modify the shared `app.onError`. Catch typed errors inline in `voice-spike.ts` route handler:
- `DailyBudgetExceededError` — let it propagate; existing onError branch returns 429 already.
- `AudioSessionTooLongError` — inline catch + `return c.json({error, code: "AUDIO_SESSION_TOO_LONG"}, 413)` per file 6 above. NOT yet wired into shared onError.

Phase 130 productionization adds the AudioSessionTooLongError branch to the shared onError alongside DailyBudgetExceededError; spike keeps it inline to stay scope-pure.

---

### Lazy-init AI client (NEW service)

**Source:** `vigil-core/src/ai/client.ts:5-19` Anthropic lazy-init pattern.

**Apply to:** `transcribe-spike.ts` for OpenAI client.

```typescript
let client: OpenAI | null = null;
if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY not set. /v1/voice/transcribe will return 503.");
}
function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI();
  return client;
}
```

Pattern survives module boundaries because `client` is closure-captured at module load; the env-key check at every call lets `OPENAI_API_KEY` arrive after Node start (CI / local-dev shape).

---

### Operator wallclock checkpoints (PLAN.md task structure)

**Source:** Phase 125 Plan 11 (60s portfolio demo) + Phase 127 Plan 05 (Railway env update) — precedent for `--auto`-exempt PLAN.md tasks (per `[feedback_wallclock_checkpoint_exempt]` memory).

**Apply to:** PLAN.md must call out C-1 through C-5 (CONTEXT lines 117-124) as explicit, non-`--auto` tasks:

- **C-1:** Operator sets `OPENAI_API_KEY` in Railway `vigil-core` env via Dashboard or `railway variables --set` (NEVER `railway variables` dump — see memory `feedback_railway_variables_leak`).
- **C-2:** Operator verifies `g2-microphone` permission allowlisted by Even Hub developer portal.
- **C-3:** Operator runs the spike harness on physical G2 (simulator does not count — D-R3).
- **C-4:** Operator commits 2 wallclock hours for battery-delta protocol.
- **C-5:** Operator records 60s portfolio Loom (`60s-demo.mp4`).

These are NOT planner-executable; planner writes them as explicit tasks with a checkpoint marker that `--auto` honors (skips with a "manual: operator" stub log).

---

## No Analog Found

| File | Role | Data Flow | Reason | Fallback |
|------|------|-----------|--------|----------|
| `vigil-g2-plugin/scripts/voice-spike-encoder.ts` | utility | transform | No existing binary builder / WAV encoder in plugin lib | Hand-roll per STACK §1c spec + canonical WAV-PCM-44 byte layout (DataView/Uint8Array on the WebView side; NOT Node `Buffer`) |

---

## Required Constant Additions (modify-not-create)

To support the new screen, three additions to `vigil-g2-plugin/src/constants.ts`:

```typescript
  VOICE_SPIKE_HEADER: 16,    // Phase 128a SPIKE — TOSSABLE
  VOICE_SPIKE_BODY: 17,      // Phase 128a SPIKE — TOSSABLE
  VOICE_SPIKE_FOOTER: 18,    // Phase 128a SPIKE — TOSSABLE
```

(SDK constraint is "1~12 PER PAGE", not global — values 16-18 are safe per the comment at lines 9-11.)

---

## Metadata

**Analog search scope:**
- `vigil-g2-plugin/src/screens/` (5 files surveyed; `affirmation.ts` + `companion.ts` selected)
- `vigil-g2-plugin/src/lib/` (4 files; `audio-session-guard.ts` confirmed as import target)
- `vigil-g2-plugin/src/{main.ts, navigation.ts, constants.ts, app.json}` (all 4 read fully)
- `vigil-core/src/routes/` (59 files surveyed; `process-audio.ts` is exact analog for route)
- `vigil-core/src/routes/__tests__/` (1 file; `agent-stream.test.ts` is the smoke-test analog)
- `vigil-core/src/ai/` (3 files; `client.ts` is exact analog for lazy-init)
- `vigil-core/src/lib/` (8 files; `audio-cap.ts` + `ai-budget.ts` confirmed as import targets)
- `vigil-core/src/db/schema.ts` (lines 89-106; verified `source` is freeform `text`)
- `vigil-core/src/index.ts` (lines 1-60 + 200-300; verified mount + onError ordering)

**Files scanned:** 22

**Pattern extraction date:** 2026-05-12

**RESEARCH drift carried forward:** DRIFT-01 (TS-screen module instead of `voice-spike-page.html`) + DRIFT-03 (`openai@^6.37.0` not `^4.79.0`). DRIFT-02 (PWA polling cadence 30s, not 2s) does NOT touch this PATTERNS.md — it's a measurement-methodology concern for `e2e_latency`, not a file-pattern concern. Planner will route latency measurement to HTTP-200 of `/v1/voice/transcribe` per RESEARCH recommendation.
