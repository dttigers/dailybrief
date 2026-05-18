# Phase 130: Voice Capture Full Implementation - Pattern Map

**Mapped:** 2026-05-18
**Files analyzed:** 28 new/modified files
**Analogs found:** 26 / 28

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| **D-C1 DELETES** | | | | |
| `vigil-g2-plugin/scripts/voice-spike-encoder.ts` | DELETE | — | no analog needed | exact (delete) |
| `vigil-g2-plugin/src/screens/voice-spike.ts` | DELETE | — | no analog needed | exact (delete) |
| `vigil-core/src/routes/voice-spike.ts` | DELETE | — | no analog needed | exact (delete) |
| `vigil-core/src/ai/transcribe-spike.ts` | DELETE | — | no analog needed | exact (delete) |
| `vigil-core/src/routes/__tests__/voice-spike.test.ts` | DELETE | — | no analog needed | exact (delete) |
| **D-C2 REVERTS** | | | | |
| `vigil-g2-plugin/src/navigation.ts` | route/config | event-driven | `navigation.ts` itself (spike lines removed) | exact (revert) |
| `vigil-g2-plugin/src/main.ts` | entry-point | event-driven | `main.ts` itself (spike line removed) | exact (revert) |
| `vigil-g2-plugin/src/constants.ts` | config | — | `constants.ts` itself (spike entries removed) | exact (revert) |
| `vigil-g2-plugin/app.json` | config | — | `app.json` itself (desc reword) | exact (reword) |
| `vigil-core/src/index.ts` | entry-point | — | `index.ts` itself (lines 29 + 232 removed) | exact (revert) |
| **PRODUCTION CREATES** | | | | |
| `vigil-core/src/routes/voice-transcribe.ts` | route | request-response | `vigil-core/src/routes/captures-screenshot.ts` | exact |
| `vigil-core/src/ai/transcribe.ts` | service | request-response | `vigil-core/src/ai/client.ts` | exact |
| `vigil-g2-plugin/src/lib/wav-encoder.ts` | utility | transform | `voice-spike-encoder.ts` (shape reference pre-delete) | exact |
| `vigil-g2-plugin/src/screens/voice.ts` | component/screen | event-driven | `vigil-g2-plugin/src/screens/voice-spike.ts` (pre-delete) | exact |
| `vigil-g2-plugin/src/lib/voice-queue.ts` | service | event-driven | Phase 124 D-11 backoff schedule (no exact analog file) | partial |
| `vigil-core/drizzle/0023_voice_capture_dedup.sql` | migration | CRUD | `vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql` | exact |
| **PRODUCTION MODIFIES** | | | | |
| `vigil-g2-plugin/src/lib/audio-session-guard.ts` | utility | event-driven | itself (signature change `void` → `boolean`) | exact |
| `vigil-core/src/lib/agent-events-bus.ts` | service | pub-sub | itself + Phase 125 `QUIET_NAME` triple as the extend pattern | exact |
| `vigil-core/src/routes/agent-stream.ts` | route | streaming | itself + Phase 125 `quietListener` as the extend pattern | exact |
| `vigil-core/src/db/schema.ts` | model | CRUD | `vigil-core/src/db/schema.ts` existing tables | exact |
| `vigil-pwa/src/lib/api-error-codes.ts` | config | — | itself (lines 145–160 AUDIO/BUDGET extension entries) | exact |
| `vigil-pwa/src/hooks/useThoughts.ts` | hook | event-driven | itself line 127 (existing `vigil:thought-created` listener) | exact |
| `vigil-core/src/lib/ai-budget.ts` | service | CRUD | itself (add `withOpenAIBudgetTracking`) | exact |
| `vigil-core/src/analytics/posthog.ts` | utility | — | itself (verify `BLOCKED_PROPERTY_NAMES` + add to `SENSITIVE_ROUTES`) | exact |
| **TEST FILES** | | | | |
| `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` | test | — | `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` | role-match |
| `vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts` | test | — | `vigil-core/src/__tests__/audio-log-redaction.test.ts` (source-grep style) | role-match |
| `vigil-core/src/__tests__/audio-log-redaction.test.ts` (extend) | test | — | itself | exact |

---

## Pattern Assignments

### D-C1/D-C2: Spike Cleanup (Plan 01)

**Analog:** `vigil-core/src/index.ts:29,232` (mount lines to remove) and `vigil-g2-plugin/src/navigation.ts:41,51` (VOICE_SPIKE entries to remove)

**index.ts lines to remove** (`vigil-core/src/index.ts` lines 29 and 232):
```typescript
// LINE 29 — DELETE:
import { voiceSpike } from "./routes/voice-spike.js"; // Phase 128a SPIKE — TOSSABLE

// LINE 232 — DELETE:
app.route("/v1", voiceSpike); // Phase 128a SPIKE — TOSSABLE. Phase 130 productionizes.
```

**navigation.ts entries to remove** (`vigil-g2-plugin/src/navigation.ts` lines 24-30, 41, 51):
```typescript
// Lines 24-30 — DELETE:
import {
  buildVoiceSpikeScreen,
  getRecording,
  toggleVoiceSpikeRecording,
} from './screens/voice-spike.ts'

// Line 41 — DELETE entry:
  VOICE_SPIKE: 'voice-spike', // Phase 128a SPIKE — TOSSABLE

// Line 51 — DELETE from SCREEN_ORDER:
  Screen.VOICE_SPIKE,  // Phase 128a SPIKE — TOSSABLE
```

**constants.ts entries to remove** (`vigil-g2-plugin/src/constants.ts` lines 28-30):
```typescript
// Lines 28-30 — DELETE:
  VOICE_SPIKE_HEADER: 16,  // Phase 128a SPIKE — TOSSABLE
  VOICE_SPIKE_BODY: 17,    // Phase 128a SPIKE — TOSSABLE
  VOICE_SPIKE_FOOTER: 18,  // Phase 128a SPIKE — TOSSABLE
```

**app.json reword** (`vigil-g2-plugin/app.json` — KEEP `g2-microphone` permission, reword desc):
```json
{
  "name": "g2-microphone",
  "desc": "Push-to-record voice capture for thought intake."
}
```
Note: remove only the `Phase 128a VOICE-01 spike:` prefix; `g2-microphone` permission and everything else stays.

---

### `vigil-core/src/routes/voice-transcribe.ts` (route, request-response)

**Analog:** `vigil-core/src/routes/captures-screenshot.ts`

**Imports pattern** (captures-screenshot.ts lines 1-11):
```typescript
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable, voiceCaptures } from "../db/schema.js";
import { requireAiBudget, withOpenAIBudgetTracking } from "../lib/ai-budget.js";
import { assertAudioSessionWithinCap } from "../lib/audio-cap.js";
import { transcribeWav } from "../ai/transcribe.js";
import { bus } from "../lib/agent-events-bus.js";
```

**DI factory pattern** (captures-screenshot.ts lines 155-165):
```typescript
export function createVoiceTranscribeRoute(
  deps: Partial<VoiceTranscribeDeps> = {},
): Hono {
  const router = new Hono();
  const dbRef = deps.db ?? db;
  const dbAvailable = deps.dbAvailable ?? !!dbRef;
  // ... dep wiring
  router.post("/voice/transcribe", async (c) => {
    const userId = c.get("userId") as number;  // NEVER from body — T-129.1-09 pattern
```

**Auth chain pattern** (CONTEXT D-U3 order, Phase 127 guardrails):
```typescript
// Strict call order per RESEARCH Pitfall 3 (prevents 100MB DoS):
// 1. requireAiBudget BEFORE body parse
await requireAiBudget(userId);
// 2. body parse
const body = await c.req.json<{ audio: string; clientCaptureId: string }>();
// 3. assertAudioSessionWithinCap on base64 string BEFORE Buffer.from
assertAudioSessionWithinCap(body.audio);
```

**Dedup check pattern** (captures-screenshot.ts lines 244-286, SVCNOW-04):
```typescript
// SELECT-first dedup BEFORE OpenAI call — cost guard (mirrors SCAP-04)
const existing = await dbRef
  .select()
  .from(voiceCaptures)
  .where(
    and(
      eq(voiceCaptures.userId, userId),
      eq(voiceCaptures.clientCaptureId, body.clientCaptureId),
    ),
  )
  .limit(1);
if (existing.length > 0 && existing[0].thoughtId) {
  // return existing thought idempotently
}
```

**Insert + SSE fan-out sequence** (RESEARCH Pattern 2, lines 478-498):
```typescript
// Step 6: Insert thought
const [row] = await db!.insert(thoughtsTable).values({
  userId,
  content,
  source: "g2_voice",
  cloudKitRecordID: crypto.randomUUID(),
}).returning();

// Step 7: Record dedup entry
await db!.insert(voiceCaptures).values({
  userId, thoughtId: row.id, clientCaptureId: body.clientCaptureId,
});

// Step 8: SSE fan-out AFTER DB commit — NEVER inside a transaction
// (RESEARCH Pitfall 6: bus.emit inside explicit tx could fire before commit)
bus.emitThoughtCreated(userId, { thoughtId: row.id, content });

// Step 9: Fire-and-forget triage
void runTriage(userId, row.id, content);

return c.json({ thoughtId: row.id, content }, 201);
```

**Error handling pattern** (`vigil-core/src/index.ts` app.onError — Phase 127 throw-based):
```typescript
// New error classes follow DailyBudgetExceededError shape (ai-budget.ts:99-111):
export class VoiceTranscribeTimeoutError extends Error {
  readonly code = "VOICE_TRANSCRIBE_TIMEOUT" as const;
  constructor() { super("OpenAI transcription timed out"); this.name = "VoiceTranscribeTimeoutError"; }
}
// Same pattern for VoiceTranscribeProviderDownError / VoiceTranscribeQuotaError
// All three registered in app.onError translation table in index.ts
```

**Production singleton** (captures-screenshot.ts lines 401-404):
```typescript
export const voiceTranscribe = createVoiceTranscribeRoute();
// Then in vigil-core/src/index.ts:
// import { voiceTranscribe } from "./routes/voice-transcribe.js";
// app.route("/v1", voiceTranscribe);
```

---

### `vigil-core/src/ai/transcribe.ts` (service, request-response)

**Analog:** `vigil-core/src/ai/client.ts`

**Lazy-init OpenAI client pattern** (client.ts lines 1-18):
```typescript
import OpenAI from "openai";
import { toFile } from "openai";

let openaiClient: OpenAI | null = null;

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY not set. Voice transcription will return 503.");
}

export function getTranscribeClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}
```

**withBudgetTracking wrap pattern** (client.ts lines 43-51):
```typescript
// OpenAI transcription is duration-billed, not token-billed.
// Must use withOpenAIBudgetTracking (new helper), NOT withBudgetTracking
// (which reads response.usage.input_tokens — absent from OpenAI transcription response).
// Cost: durationSeconds × $0.003 / 60
// Duration estimated from: pcm.length / 32000 (bytes ÷ bytes-per-second at 16kHz×16bit×mono)
```

**Timeout + error taxonomy pattern** (RESEARCH Pattern 5, Gray Area Resolution §5):
```typescript
export async function transcribeWav(wav: Buffer): Promise<string> {
  const ai = getTranscribeClient();
  if (!ai) throw new VoiceTranscribeProviderDownError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const file = await toFile(wav, "audio.wav", { type: "audio/wav" });
    const response = await ai.audio.transcriptions.create(
      { file, model: "gpt-4o-mini-transcribe" },
      { signal: controller.signal },
    );
    return response.text;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new VoiceTranscribeTimeoutError();
    }
    // OpenAI quota error check: err.status === 429 or message contains "quota"
    throw new VoiceTranscribeProviderDownError();
  } finally {
    clearTimeout(timeout);
  }
}
```

---

### `vigil-g2-plugin/src/lib/wav-encoder.ts` (utility, transform)

**Analog:** `vigil-g2-plugin/src/screens/voice-spike.ts` (shape reference — DELETED per D-C1; `voice-spike-encoder.ts` imported `buildWav`)

**44-byte WAV header pattern** (RESEARCH Pattern 4, lines 547-593):
```typescript
// 44-byte WAV header byte map (VOICE-08 D-D1 pin reference):
//   offset 0:  "RIFF"              offset 8:  "WAVE"
//   offset 12: "fmt "              offset 16: 16 (uint32 LE)
//   offset 20: 1  (PCM format)     offset 22: 1  (channels = mono, uint16 LE)
//   offset 24: 16000 (sample rate) offset 28: 32000 (byte rate, uint32 LE)
//   offset 32: 2  (block align)    offset 34: 16 (bit depth, uint16 LE)
//   offset 36: "data"              offset 40: PCM data length (uint32 LE)
//   offset 44: raw PCM data bytes

export function buildWav(pcm: Uint8Array): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const totalLen = 36 + pcm.length;

  new TextEncoder().encode('RIFF').forEach((b, i) => view.setUint8(i, b));
  view.setUint32(4, totalLen, true);
  new TextEncoder().encode('WAVE').forEach((b, i) => view.setUint8(8 + i, b));
  new TextEncoder().encode('fmt ').forEach((b, i) => view.setUint8(12 + i, b));
  view.setUint32(16, 16, true);    // PCM chunk size
  view.setUint16(20, 1, true);     // PCM format
  view.setUint16(22, 1, true);     // mono
  view.setUint32(24, 16000, true); // 16 kHz
  view.setUint32(28, 32000, true); // byte rate
  view.setUint16(32, 2, true);     // block align
  view.setUint16(34, 16, true);    // 16-bit
  new TextEncoder().encode('data').forEach((b, i) => view.setUint8(36 + i, b));
  view.setUint32(40, pcm.length, true);

  const result = new Uint8Array(44 + pcm.length);
  result.set(new Uint8Array(header), 0);
  result.set(pcm, 44);
  return result;
}
```

---

### `vigil-g2-plugin/src/screens/voice.ts` (component/screen, event-driven)

**Analog:** `vigil-g2-plugin/src/screens/voice-spike.ts` (pre-delete shape) + companion.ts `isEventCapture: 1` pattern

**State type and module-scope state** (voice-spike.ts lines 48-55):
```typescript
// Production states (D-S1) — more than spike's 5 states
type StateLine = '[IDLE]' | `[REC ${string}]` | '[UPLOADING…]' | '[DONE]' | '[NO MIC]' | '[ERR]'

// D-S3: Recording state lives in main.ts scope, NOT in this module's local closure.
// This module only holds UI-rendering state; `recording` boolean lives in main.ts.
let stateLine: StateLine = '[IDLE]';
let micOnStartedAt: number | null = null;
let lastBytes: number | null = null;
let lastE2eMs: number | null = null;
```

**Screen builder — 3-container triple** (voice-spike.ts lines 118-193):
```typescript
export function buildVoiceScreen(isRecording: boolean): RebuildPageContainer {
  const header = buildVigilHeader(
    ContainerId.VOICE_HEADER,    // new constant (not VOICE_SPIKE_HEADER)
    'voice-header',
    'voice',
  );
  const body = new TextContainerProperty({
    xPosition: 0, yPosition: 40,
    width: DISPLAY_WIDTH, height: 210,
    borderWidth: 1, borderColor: 15, borderRadius: 0, paddingLength: 8,
    containerID: ContainerId.VOICE_BODY,
    containerName: 'voice-body',   // ≤11 chars (Phase 125 hardware-debug fix)
    content: bodyContent,
    isEventCapture: 1,             // LOAD-BEARING: DOUBLE_CLICK routes through body
  });
  // ...footer
}
```

**safeAudioControl run-4 caller pattern** (RESEARCH Pattern 1, lines 400-416):
```typescript
// Run 4 hardening: capture return value, short-circuit on false
async function toggleVoiceRecording(bridge: AudioGuardBridge): Promise<void> {
  if (recording) {
    // STOP path
    await safeAudioControl(false, bridge);
    // ... WAV assembly + POST
    return;
  }
  // START path
  const granted = await safeAudioControl(true, bridge);
  if (!granted) {
    stateLine = '[NO MIC]';
    recording = false;
    await onStateChange?.();
    return;
  }
  // proceed with recording
}
```

**State machine error differentiation** (D-S1):
```typescript
// [NO MIC] — Run 4 §5 requires DIFFERENT body text from [ERR]
if (stateLine === '[NO MIC]') {
  line1 = '[NO MIC]';
  line2 = 'enable mic in Hub';
} else if (stateLine === '[ERR]') {
  line1 = '[ERR]';
  line2 = 'retry — tap to dismiss';
}
```

---

### `vigil-g2-plugin/src/lib/voice-queue.ts` (service, event-driven)

**Analog:** No exact codebase analog. Pattern derived from D-O1..O4 decisions + Phase 124 D-11 backoff schedule.

**Queue shape and constants** (RESEARCH Pattern 5, lines 600-619):
```typescript
const QUEUE_KEY = 'vigil:voice-queue:v1';
const MAX_QUEUE_SIZE = 10;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000]; // D-O1 verbatim

interface QueueEntry {
  clientCaptureId: string;
  base64Audio: string;   // NOTE: ~200KB each; NEVER include in PostHog events
  queuedAt: number;
  retryCount: number;
}

function loadQueue(): QueueEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueueEntry[];
  } catch { return []; }
}

function saveQueue(q: QueueEntry[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
```

**LRU eviction on push** (D-O4):
```typescript
function enqueue(entry: QueueEntry): void {
  const q = loadQueue();
  if (q.length >= MAX_QUEUE_SIZE) {
    const evicted = q.shift()!; // oldest entry (LRU — per D-O4)
    posthog.capture('voice_queue_evicted', {
      clientCaptureId: evicted.clientCaptureId,
      retryCount: evicted.retryCount,
    });
  }
  q.push(entry);
  saveQueue(q);
}
```

**Backoff retry loop** (mirrors Phase 124 D-11 schedule):
```typescript
async function retryEntry(entry: QueueEntry): Promise<void> {
  const delayMs = BACKOFF_MS[Math.min(entry.retryCount, BACKOFF_MS.length - 1)] ?? 30000;
  await new Promise(r => setTimeout(r, delayMs));
  // attempt POST; on success: remove from queue; on 429: evict (no retry)
}
```

---

### `vigil-core/drizzle/0023_voice_capture_dedup.sql` (migration, CRUD)

**Analog:** `vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql`

**Full migration shape** (0021 pattern + RESEARCH Gray Area §2):
```sql
-- ── Phase 130: VOICE-05 voice_captures dedup table ──────────────────────────
-- New `voice_captures` sibling table with FK to thoughts.id.
-- Composite partial unique index (user_id, client_capture_id) WHERE NOT NULL.
-- Mirrors 0021_add_work_orders_client_capture_id.sql SVCNOW-04 dedup pattern.
-- Re-run safe: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS "voice_captures" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "thought_id" integer REFERENCES thoughts(id) ON DELETE SET NULL,
  "client_capture_id" text NOT NULL,
  "queued_at" timestamptz NOT NULL DEFAULT now(),
  "retry_count" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_voice_captures_user_client_capture_id"
  ON "voice_captures" ("user_id", "client_capture_id")
  WHERE "client_capture_id" IS NOT NULL;
```

---

### `vigil-g2-plugin/src/lib/audio-session-guard.ts` (MODIFIED — signature change)

**Analog:** itself (lines 80-158)

**Signature change** (current lines 80-83 → new):
```typescript
// CURRENT (lines 80-83):
export async function safeAudioControl(
  on: boolean,
  bridge: AudioGuardBridge,
): Promise<void> {

// CHANGE TO (Run 4 §1 — D-S2):
export async function safeAudioControl(
  on: boolean,
  bridge: AudioGuardBridge,
): Promise<boolean> {
```

**Return value change** (current lines 157-158):
```typescript
// CURRENT:
  audioActive = on;
  await bridge.audioControl(on);

// CHANGE TO (return SDK result instead of discarding it):
  audioActive = on;
  return bridge.audioControl(on);  // return Promise<boolean> — callers observe denial
```

All 4 cleanup hooks (lines 94-155) are UNCHANGED. Only the return type + final line change.

---

### `vigil-core/src/lib/agent-events-bus.ts` (MODIFIED — add `thought-created` channel)

**Analog:** itself, Phase 125 `QUIET_NAME` triple (lines 30-31, 83-113)

**New constant** (mirrors QUIET_NAME at line 30):
```typescript
// After line 31 (QUIET_NAME):
const THOUGHT_CREATED_NAME = "thought-created" as const;
```

**New triple methods** (mirrors emitQuiet/onQuiet/offQuiet at lines 84-113):
```typescript
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
  // Delete gate must now check ALL THREE event types (extends Phase 125 joint gate)
  if (
    emitter.listenerCount(EVENT_NAME) === 0 &&
    emitter.listenerCount(QUIET_NAME) === 0 &&
    emitter.listenerCount(THOUGHT_CREATED_NAME) === 0
  ) {
    emitters.delete(userId);
  }
}
```

**CRITICAL:** The existing `off` and `offQuiet` joint gates (lines 74-80 and 109-113) must ALSO be updated to include `listenerCount(THOUGHT_CREATED_NAME) === 0`. Otherwise a live `onThoughtCreated` listener would prevent Map cleanup.

---

### `vigil-core/src/routes/agent-stream.ts` (MODIFIED — multiplex `thought-created`)

**Analog:** itself, Phase 125 `quietListener` pattern (lines 56-71, 159-166, 183-187)

**Extended DI interface** (mirrors `onQuiet?`/`offQuiet?` at lines 62-70):
```typescript
// Add to AgentStreamDeps.bus:
onThoughtCreated?(
  userId: number,
  listener: (p: { thoughtId: number; content: string }) => void,
): void;
offThoughtCreated?(
  userId: number,
  listener: (p: { thoughtId: number; content: string }) => void,
): void;
```

**New listener** (mirrors quietListener at lines 159-166):
```typescript
const thoughtCreatedListener = (p: { thoughtId: number; content: string }) => {
  if (stream.aborted || stream.closed) return;
  void stream.writeSSE({
    event: "thought-created",
    data: JSON.stringify(p),
  });
};
// Register (mirrors line 168):
deps.bus.onThoughtCreated?.(userId, thoughtCreatedListener);
```

**Cleanup extension** (mirrors line 185-186):
```typescript
// Add to stream.onAbort():
deps.bus.offThoughtCreated?.(userId, thoughtCreatedListener);
```

---

### `vigil-core/src/db/schema.ts` (MODIFIED — add `voiceCaptures` table)

**Analog:** itself, `workOrders` table definition pattern

**New table definition** (follows pattern from schema.ts tables):
```typescript
// ── voice_captures table (Phase 130 VOICE-05 — D-U4 dedup) ───────────────
// Sibling table to thoughts. Composite unique index on (user_id, client_capture_id)
// enforces per-user dedup for G2 voice offline-queue retries. Mirrors
// SVCNOW-04 (migration 0021) / SCAP-04 (migration 0021) partial-unique pattern.
// W-01 invariant: ALL queries MUST filter eq(voiceCaptures.userId, userId).
export const voiceCaptures = pgTable(
  "voice_captures",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    thoughtId: integer("thought_id")
      .references(() => thoughts.id, { onDelete: "set null" }),
    clientCaptureId: text("client_capture_id").notNull(),
    queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
    retryCount: integer("retry_count").notNull().default(0),
  },
  // Partial unique index declared in migration 0023 (hand-crafted SQL;
  // Drizzle uniqueIndex helper cannot express the WHERE clause).
);
```

---

### `vigil-pwa/src/lib/api-error-codes.ts` (MODIFIED — add 3 VOICE_TRANSCRIBE_* codes)

**Analog:** itself, lines 139-160 (`AUDIO_SESSION_TOO_LONG` and `DAILY_AI_BUDGET_EXCEEDED` shapes)

**Three new entries** (after `DAILY_AI_BUDGET_EXCEEDED` at line 158, same shape):
```typescript
// ── EXTENSION (Phase 130 VOICE-06 — D-E1 locked-enum) ──
// vigil-core returns HTTP 504 + this code when OpenAI transcription exceeds
// 30s server-side AbortController timeout. D-E1 lock — cannot be removed.
VOICE_TRANSCRIBE_TIMEOUT: {
  message: "Voice transcription timed out. Please try again.",
},

// vigil-core returns HTTP 502 + this code when OpenAI returns 5xx or
// network error / refused connection. D-E1 lock — cannot be removed.
VOICE_TRANSCRIBE_PROVIDER_DOWN: {
  message: "Voice transcription service unavailable. Please try again shortly.",
},

// vigil-core returns HTTP 503 + this code when OpenAI org-level quota exhausted.
// Separate from DAILY_AI_BUDGET_EXCEEDED (per-user $0.50/day cap).
// D-E1 lock — cannot be removed.
VOICE_TRANSCRIBE_QUOTA: {
  message: "Voice transcription quota reached. Please try again later.",
},
```

---

### `vigil-pwa/src/hooks/useThoughts.ts` (MODIFIED — no rewrite needed)

**Analog:** itself, line 127 (existing `vigil:thought-created` listener)

**Existing pattern that already handles the cross-device SSE path** (lines 115-128):
```typescript
// vigil-pwa/src/hooks/useThoughts.ts:127
window.addEventListener('vigil:thought-created', handleCreated);
```

The `handleCreated` function already calls `refetch()`. Phase 130 does NOT modify this file directly — it only adds the PWA SSE subscriber (likely `useAgentStream.ts` or inline in an existing hook) that dispatches this event. The PWA subscriber pattern:

```typescript
// PWA SSE subscriber (new file or extend existing useAgentStream.ts):
eventSource.addEventListener('thought-created', (e: MessageEvent) => {
  window.dispatchEvent(new CustomEvent('vigil:thought-created'));
  // optionally parse e.data for the thought payload if needed
});
```

---

### `vigil-core/src/lib/ai-budget.ts` (MODIFIED — add OpenAI budget adapter)

**Analog:** itself (lines 218-246, `withBudgetTracking`)

**New OpenAI-specific accumulator** (mirrors withBudgetTracking structure):
```typescript
// OpenAI transcription billing: $0.003/min (= $0.00005/s)
const OPENAI_TRANSCRIBE_PRICE_PER_SEC = 0.003 / 60;

// durationMs is estimated from pcm.length / 32000 * 1000 at the call site
// (bytes ÷ bytes-per-second = seconds; ×1000 = ms).
export async function withOpenAIBudgetTracking(
  userId: number,
  durationMs: number,
  fn: () => Promise<string>,
): Promise<string> {
  const result = await fn();
  try {
    const usd = (durationMs / 1000) * OPENAI_TRANSCRIBE_PRICE_PER_SEC;
    if (usd > 0 && db) {
      await db.execute(sql`
        INSERT INTO ai_usage_daily (user_id, usage_date, usd_estimate, updated_at)
        VALUES (${userId}, CURRENT_DATE, ${usd}, NOW())
        ON CONFLICT (user_id, usage_date) DO UPDATE
          SET usd_estimate = ai_usage_daily.usd_estimate + EXCLUDED.usd_estimate,
              updated_at = NOW()
      `);
    }
  } catch (err) {
    console.error("[vigil-core] withOpenAIBudgetTracking accumulator failed (non-fatal):", err instanceof Error ? err.message : err);
  }
  return result;
}
```

---

### `vigil-core/src/analytics/posthog.ts` (MODIFIED — verify + extend)

**Analog:** itself (lines 32-49)

**Verification check:** `BLOCKED_PROPERTY_NAMES` already includes `audio`, `audioPcm`, `audio_pcm`, `pcm`, `audioBuffer`, `audio_buffer` (lines 42-48) — Phase 130 telemetry key names (`stop_to_http_ms`, `chunks`, `bytes`, `retry_count`, `transcript_chars`, `gap_ms`, `recording_id`) are safe.

**SENSITIVE_ROUTES extension** (after line 21):
```typescript
"/v1/voice/transcribe",   // add to SENSITIVE_ROUTES Set
```

**D-T1 PostHog event shape** (only safe key names):
```typescript
posthog.capture('voice_capture_completed', {
  stop_to_http_ms: number,    // safe: numeric metric name
  chunks: number,             // safe: numeric
  bytes: number,              // safe: numeric
  retry_count: number,        // safe: numeric
  transcript_chars: number,   // safe: numeric
  // NEVER include: audio, audioPcm, base64Audio, content
});
```

---

### `vigil-g2-plugin/src/navigation.ts` (MODIFIED — production VOICE screen added)

**Analog:** same file, the VOICE_SPIKE entries being removed (lines 24-30, 41, 51) are the exact pattern to replicate with production names.

**New import** (replace deleted voice-spike imports):
```typescript
import {
  buildVoiceScreen,
  getVoiceRecording,
  toggleVoiceRecording,
} from './screens/voice.ts';
```

**New Screen entry** (after AFFIRMATION, before Task Detail — carousel position per RESEARCH §specifics):
```typescript
VOICE: 'voice',  // Phase 130 production voice screen
```

**New SCREEN_ORDER entry** (replaces VOICE_SPIKE position):
```typescript
Screen.VOICE,  // Phase 130 production
```

**buildScreen case** (same pattern as VOICE_SPIKE case at lines 130-134):
```typescript
case Screen.VOICE: {
  return buildVoiceScreen(getVoiceRecording());
}
```

---

### `vigil-g2-plugin/src/constants.ts` (MODIFIED — production VOICE container IDs)

**Analog:** itself, lines 28-30 (VOICE_SPIKE entries being replaced)

**New entries** (replace deleted VOICE_SPIKE_* constants):
```typescript
VOICE_HEADER: 16,  // Phase 130 production voice screen
VOICE_BODY: 17,
VOICE_FOOTER: 18,
```

---

### `vigil-g2-plugin/src/main.ts` (MODIFIED — production voice screen wiring)

**Analog:** itself, existing DOUBLE_CLICK_EVENT routing at lines 221-260

The `main.ts` file imports `appendPcmChunk` from `voice-spike.ts` (line 62) — that import is REMOVED in D-C2. The DOUBLE_CLICK route for VOICE_SPIKE (spike event-routing block, lines 221-260) becomes the production VOICE route.

**Cross-screen state pattern** (D-S3 — recording state lives in main.ts scope):
```typescript
// Module-scope recording state (NOT in voice.ts's local closure)
// Pattern source: audio-session-guard.ts "let audioActive = false" precedent
let voiceRecording = false;
let pcmChunks: Uint8Array[] = [];

// DOUBLE_CLICK_EVENT routing for VOICE screen:
if (screen === Screen.VOICE && event.osEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
  await toggleVoiceRecording(bridge, pcmChunks, () => rebuildCurrentScreen(bridge));
}

// audioEvent collector (unchanged from spike — main.ts already owns this):
bridge.onEvenHubEvent((e) => {
  if (e.audioEvent?.audioPcm) {
    appendPcmChunkToVoiceBuffer(e.audioEvent.audioPcm as Uint8Array);
  }
})
```

---

### Test Files

#### `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` (NEW — D-D1)

**Analog:** `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` (test framework pattern)

**Test framework pattern** (audio-session-guard.test.ts lines 19-26):
```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWav } from '../lib/wav-encoder.ts';

test('WAV header: RIFF magic at offset 0', () => {
  const wav = buildWav(new Uint8Array(0));
  assert.equal(wav[0], 0x52); // 'R'
  assert.equal(wav[1], 0x49); // 'I'
  assert.equal(wav[2], 0x46); // 'F'
  assert.equal(wav[3], 0x46); // 'F'
});
test('WAV header: channel count = 1 (mono) at offset 22', () => { ... });
test('WAV header: sample rate = 16000 at offset 24 (uint32 LE)', () => { ... });
test('WAV header: bit depth = 16 at offset 34 (uint16 LE)', () => { ... });
// All 8 D-D1 header positions pinned
```

#### `vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts` (NEW — D-D3)

**Analog:** `vigil-core/src/__tests__/audio-log-redaction.test.ts` (source-grep drift detector pattern)

**Source-grep pairing test** (audio-log-redaction.test.ts lines 45-57 as template):
```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

test('D-D3: safeAudioControl(true,…) count === safeAudioControl(false,…) count across plugin src/', () => {
  // Walk vigil-g2-plugin/src/ non-test .ts files
  // grep-count "safeAudioControl(true,"
  // grep-count "safeAudioControl(false,"
  // assert counts equal
});
```

#### Extending `vigil-core/src/__tests__/audio-log-redaction.test.ts` (D-D2)

**Analog:** itself (the existing Rail 3 scope)

Extend the safe-list exclusions and extend the grep scope to include `vigil-g2-plugin/src/` and `vigil-core/src/routes/voice-transcribe.ts`. The rail already walks `vigil-core/src/` — extend to also walk the g2-plugin source. Pattern (lines 59+):
```typescript
// Extend ROOT to also include vigil-g2-plugin/src/ directory
// Add 'routes/voice-transcribe.ts' to safe-list if needed
// No regex change needed — the audioPcm/audio_pcm/pcm patterns are already the filter
```

---

## Shared Patterns

### Authentication + Authorization Chain
**Source:** `vigil-core/src/routes/captures-screenshot.ts` lines 167-170, 234-235
**Apply to:** `voice-transcribe.ts`
```typescript
// bearerAuth set by middleware dispatcher in index.ts — never trust body.userId
const userId = c.get("userId") as number;
// Auth chain ordering:
await requireAiBudget(userId);       // pre-flight BEFORE body parse
const body = await c.req.json();     // body parse second
assertAudioSessionWithinCap(body.audio);  // cap check BEFORE decode
```

### Error Handling — Throw-Based Funneling
**Source:** `vigil-core/src/lib/ai-budget.ts` lines 99-110 (DailyBudgetExceededError shape)
**Apply to:** `voice-transcribe.ts` new error classes, `app.onError` in index.ts
```typescript
export class VoiceTranscribeTimeoutError extends Error {
  readonly code = "VOICE_TRANSCRIBE_TIMEOUT" as const;
  constructor() {
    super("OpenAI transcription timed out after 30s");
    this.name = "VoiceTranscribeTimeoutError";
  }
}
// All three new errors registered in index.ts app.onError translation table
// alongside DailyBudgetExceededError and AudioSessionTooLongError.
```

### DI Factory Pattern
**Source:** `vigil-core/src/routes/captures-screenshot.ts` lines 155-165
**Apply to:** `voice-transcribe.ts`
```typescript
export function createVoiceTranscribeRoute(
  deps: Partial<VoiceTranscribeDeps> = {},
): Hono { ... }
export const voiceTranscribe = createVoiceTranscribeRoute(); // production singleton
```

### SSE Listener Cleanup Gate (Three-Channel)
**Source:** `vigil-core/src/lib/agent-events-bus.ts` lines 74-80
**Apply to:** All three `off*` methods after THOUGHT_CREATED_NAME added
```typescript
// After Phase 130: ALL three channels must show zero listeners before Map deletion
if (
  emitter.listenerCount(EVENT_NAME) === 0 &&
  emitter.listenerCount(QUIET_NAME) === 0 &&
  emitter.listenerCount(THOUGHT_CREATED_NAME) === 0
) {
  emitters.delete(userId);
}
```

### Container Name ≤11 Chars
**Source:** `vigil-g2-plugin/src/screens/voice-spike.ts` line 165 (`'vs-body'` comment), companion.ts fix note
**Apply to:** All new G2 screen containers
```typescript
containerName: 'voice-body',  // ≤11 chars — Phase 125 hardware-debug fix
// Even Hub runtime enforces strict <16 chars; use ≤11 for safety margin
```

### GUARD-01 Safe Key Names in Telemetry
**Source:** `vigil-core/src/analytics/posthog.ts` lines 32-49 (`BLOCKED_PROPERTY_NAMES`)
**Apply to:** All PostHog events, all console.log calls in voice-*.ts files
```typescript
// SAFE key names: stop_to_http_ms, chunks, bytes, retry_count, transcript_chars, gap_ms, t
// BLOCKED key names (never use): audio, audioPcm, audio_pcm, pcm, audioBuffer, content, body
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `vigil-g2-plugin/src/lib/voice-queue.ts` | service | event-driven | No localStorage queue with exponential backoff exists in the codebase. Closest: Phase 124 D-11 specifies the backoff schedule `[1s,2s,4s,8s,16s,30s]` but no implementation file. Use RESEARCH Pattern 5 (lines 600-619) as the reference shape. |

---

## Metadata

**Analog search scope:** `vigil-core/src/`, `vigil-g2-plugin/src/`, `vigil-pwa/src/`, `vigil-core/drizzle/`
**Files scanned:** 18 analog files read directly
**Pattern extraction date:** 2026-05-18

**Key load-bearing constraints for planner:**
1. `voice-transcribe.ts` route call order is strict (D-U3 + RESEARCH Pitfall 3): `requireAiBudget` → body parse → `assertAudioSessionWithinCap` → dedup check → `withOpenAIBudgetTracking(transcribeWav)` → insert thought → insert voice_capture → `bus.emitThoughtCreated` (AFTER db commit, never inside transaction per Pitfall 6) → fire-and-forget triage → return JSON.
2. `agent-events-bus.ts` off/offQuiet joint gates (lines 74-80, 109-113) MUST be updated to three-channel guard when `THOUGHT_CREATED_NAME` is added.
3. `safeAudioControl` signature change is `Promise<void>` → `Promise<boolean>` with `return bridge.audioControl(on)` — only the last line and return type change; all 4 cleanup hooks are unchanged.
4. Plan 01 (spike cleanup) MUST commit before any production code files are added — the `voice-transcribe.ts` route and `voice-spike.ts` spike route must never coexist.
