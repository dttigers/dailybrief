/**
 * Phase 130 Plan 04 (VOICE-02 / VOICE-03 / VOICE-04): production voice
 * capture screen.
 *
 * Replaces the deleted `voice-spike.ts` (Plan 01) with the full Run 4 state
 * machine + the Promise<boolean> safeAudioControl caller pattern + the
 * `[NO MIC]` permission-denied surface + the WAV-wrap + base64 POST flow.
 *
 * D-S1 state machine — six states pinned by `src/screens/__tests__/voice.test.ts`:
 *   [IDLE]        — initial / after a successful [DONE] auto-clear
 *   [REC m:ss]    — recording in progress (live elapsed counter)
 *   [UPLOADING…]  — STOP gesture observed; PCM concat + WAV wrap + POST in flight
 *   [DONE]        — POST returned 2xx; transcript saved (auto-clears to [IDLE] after 2s)
 *   [NO MIC]      — safeAudioControl returned false OR threw (mic permission denied at
 *                   Even Hub portal). Body line 2 reads "enable mic in Hub".
 *   [ERR]         — POST returned non-2xx (timeout / quota / provider down / network).
 *                   Body line 2 reads "retry — tap to dismiss".
 *
 * D-S3 cross-screen survival: the `recording` flag + UI-display state line
 * live at MODULE scope here. Because ES modules are evaluated exactly once
 * per JS lifetime, swiping to Companion and back to Voice does NOT reset the
 * state (carousel rebuild just calls `buildVoiceScreen(getVoiceRecording())`
 * again, which reads the same module-scope flag).
 *
 * The accumulated PCM chunks themselves live in `main.ts` module scope —
 * the SDK's `bridge.onEvenHubEvent` registration is owned by `main.ts`, so
 * the array of `audioEvent.audioPcm` payloads is collected there and passed
 * INTO `toggleVoiceRecording` on STOP.
 *
 * Security (CONTEXT threat T-130-04-2 + Phase 127 GUARD-01):
 *   - NEVER log `pcmChunks`, the WAV bytes, the base64 payload, or the
 *     fetch request body. The per-chunk log in main.ts uses safe key names
 *     (`bytes` / `t`) — see the D-D2 source-grep drift detector landing in
 *     Plan 06.
 *   - The Authorization bearer is read from `api.ts` (single source of
 *     truth — never URL-appended, never logged).
 *
 * Phase 130 Plan 05 will wrap the POST in queue-aware retry (D-O1 backoff
 * schedule). Phase 130 Plan 06 will add the WAV header drift detector
 * (D-D1) — the producer side already lands in this plan via
 * `vigil-g2-plugin/src/lib/wav-encoder.ts`.
 */

import {
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import { DISPLAY_WIDTH, ContainerId } from '../constants.ts'
import { buildVigilHeader } from './header.ts'
import {
  safeAudioControl,
  type AudioGuardBridge,
} from '../lib/audio-session-guard.ts'
import { buildWav } from '../lib/wav-encoder.ts'
import { BASE_URL, API_KEY } from '../api.ts'
import { enqueue } from '../lib/voice-queue.ts'
import {
  emitVoiceCaptureCompleted,
  emitVoiceCaptureDropout,
} from '../lib/voice-telemetry.ts'

// ─── State-line union type (D-S1) ──────────────────────────────────────────

type StateLine =
  | '[IDLE]'
  | `[REC ${string}]`
  | '[UPLOADING…]'
  | '[DONE]'
  | '[NO MIC]'
  | '[ERR]'

// ─── Module-scope state (D-S3 cross-screen survival) ───────────────────────

let recording = false
let stateLine: StateLine = '[IDLE]'
let bodyLine2 = ''
let recordingStartedAt: number | null = null
let doneTimer: ReturnType<typeof setTimeout> | null = null

// Sentinel copy strings (Run 4 §5 / CONTEXT specifics — these MUST stay
// visually distinct so the operator knows which corrective action applies).
const COPY_NO_MIC = 'enable mic in Hub'
const COPY_ERR = 'retry — tap to dismiss'
// D-E3 cascade — 429 DAILY_AI_BUDGET_EXCEEDED is a permanent failure; the
// daily AI cost cap won't reset until midnight UTC. Distinct copy lets the
// operator distinguish "transient retry-on-its-own" from "you've hit the
// daily cap; no point trying again until tomorrow".
const COPY_BUDGET_CAP = 'daily AI cost cap hit — try tomorrow'

// ─── Drop-out detection state (D-T2) ───────────────────────────────────────
//
// We track inter-chunk gap times during the first 5 seconds of recording to
// compute a baseline. After 5 s, any inter-chunk gap > 2× baseline emits a
// `voice_capture_dropout` event. State is reset on each START.

interface DropoutState {
  recordingId: string | null
  /** First-5s inter-chunk gaps used to compute baseline. */
  baselineGaps: number[]
  /** Computed baseline (mean of baselineGaps); null until 5 s elapsed. */
  baselineMs: number | null
  /** Timestamp of the most recent chunk arrival (for gap computation). */
  lastChunkAt: number | null
}

let dropoutState: DropoutState = {
  recordingId: null,
  baselineGaps: [],
  baselineMs: null,
  lastChunkAt: null,
}

const BASELINE_WINDOW_MS = 5000
const DROPOUT_THRESHOLD_MULTIPLIER = 2

// ─── Accessors ──────────────────────────────────────────────────────────────

export function getVoiceRecording(): boolean {
  return recording
}

export function getVoiceStateLine(): StateLine {
  return stateLine
}

export function getVoiceBodyLine2(): string {
  return bodyLine2
}

// ─── DOUBLE_CLICK toggle (Run 4 caller pattern) ───────────────────────────

/**
 * Toggle voice recording — START on first DOUBLE_CLICK, STOP on second.
 *
 * START path (Run 4 §1-3):
 *   - try { granted = await safeAudioControl(true, bridge) }
 *   - if (!granted) → stateLine = '[NO MIC]', recording stays false
 *   - catch → stateLine = '[NO MIC]' (same path; the SDK can throw or resolve
 *     false depending on which level of the permission stack denies)
 *   - else → recording = true, stateLine = '[REC 0:00]', record start ts
 *
 * STOP path (D-U3):
 *   - safeAudioControl(false, bridge) — close the mic (fire-and-forget; SDK
 *     ack is observable but we proceed regardless)
 *   - stateLine = '[UPLOADING…]'
 *   - concat PCM chunks → buildWav() → base64 encode
 *   - POST /v1/voice/transcribe with { audio: base64, clientCaptureId: UUID v4 }
 *   - 2xx → stateLine = '[DONE]', schedule 2s timer to [IDLE]
 *   - non-2xx → stateLine = '[ERR]', body line 2 = COPY_ERR
 *
 * The `onStateChange` callback (if provided) is invoked after each state
 * transition so main.ts can rebuild the current screen via the carousel.
 *
 * @param bridge       — audio bridge satisfying AudioGuardBridge
 * @param pcmChunks    — PCM byte arrays accumulated by main.ts's audioEvent
 *                       collector while recording was true
 * @param onStateChange — optional callback to trigger UI rebuild after each transition
 */
export async function toggleVoiceRecording(
  bridge: AudioGuardBridge,
  pcmChunks: Uint8Array[],
  onStateChange?: () => void | Promise<void>,
): Promise<void> {
  if (recording) {
    // ── STOP path ──────────────────────────────────────────────────────
    await stopRecording(bridge, pcmChunks, onStateChange)
    return
  }

  // ── START path ────────────────────────────────────────────────────────
  // Clear any prior [DONE] auto-timer if user double-clicks quickly.
  if (doneTimer) {
    clearTimeout(doneTimer)
    doneTimer = null
  }
  // Reset the PCM buffer on START so each utterance is a fresh capture.
  // Mutate in place (caller passed the array by reference) so main.ts's
  // collector continues to push into the same buffer.
  pcmChunks.length = 0

  let granted = false
  try {
    granted = await safeAudioControl(true, bridge)
  } catch {
    // Run 4 §3 — bridge.audioControl can throw on certain permission-stack
    // failures. Treat throw and false identically: surface [NO MIC] so the
    // operator knows to check the Even Hub permission portal.
    granted = false
  }

  if (!granted) {
    stateLine = '[NO MIC]'
    bodyLine2 = COPY_NO_MIC
    recording = false
    await onStateChange?.()
    return
  }

  // Mic open — flip to recording state. The m:ss elapsed counter is computed
  // at render time from `recordingStartedAt`, so we don't need a timer here.
  recording = true
  recordingStartedAt = Date.now()
  stateLine = formatRecState(0)
  bodyLine2 = ''
  // Reset drop-out tracking + mint a fresh recording_id for the dropout +
  // completed events. The same UUID is reused as the clientCaptureId on the
  // POST so the eventual server-side voice_captures row, the queue entry
  // (if it fails), and the telemetry events all share one identifier.
  dropoutState = {
    recordingId: generateUuidV4(),
    baselineGaps: [],
    baselineMs: null,
    lastChunkAt: null,
  }
  await onStateChange?.()
}

/**
 * Record an audio-chunk arrival timestamp. Called by main.ts's audioEvent
 * collector branch on each `audioEvent.audioPcm` event while `recording ===
 * true`. Implements D-T2 drop-out detection:
 *
 *   1. First 5 s of recording: collect inter-chunk gap times to compute the
 *      baseline.
 *   2. At the 5 s mark: freeze the baseline (mean of gaps).
 *   3. After 5 s: any inter-chunk gap > 2× baseline emits a
 *      `voice_capture_dropout` event with safe-key props `{ gap_ms,
 *      recording_id }`. Multiple drop-outs in one capture produce multiple
 *      events.
 *
 * Idempotent w.r.t. calls outside a recording session — if `recording ===
 * false`, returns early.
 */
export function recordChunkArrival(now: number = Date.now()): void {
  if (!recording || recordingStartedAt === null) return
  if (dropoutState.recordingId === null) return

  const elapsedSinceStart = now - recordingStartedAt
  const gap = dropoutState.lastChunkAt === null ? 0 : now - dropoutState.lastChunkAt
  dropoutState.lastChunkAt = now

  // First-5s baseline window: accumulate gap samples (skip the first chunk,
  // which has no prior chunk to gap against).
  if (elapsedSinceStart < BASELINE_WINDOW_MS) {
    if (gap > 0) dropoutState.baselineGaps.push(gap)
    return
  }

  // Past the 5 s baseline window — compute baseline once on first
  // out-of-window call, then start scoring subsequent gaps.
  if (dropoutState.baselineMs === null) {
    if (dropoutState.baselineGaps.length === 0) {
      // No baseline samples collected — fall back to a conservative 200 ms
      // (the spike's typical inter-chunk arrival cadence). Without this
      // fallback we'd never detect drop-outs from very short recordings
      // that happened to skip the first 5 s window entirely.
      dropoutState.baselineMs = 200
    } else {
      const sum = dropoutState.baselineGaps.reduce((a, b) => a + b, 0)
      dropoutState.baselineMs = sum / dropoutState.baselineGaps.length
    }
  }

  if (
    gap > 0 &&
    gap > dropoutState.baselineMs * DROPOUT_THRESHOLD_MULTIPLIER
  ) {
    emitVoiceCaptureDropout({
      gap_ms: gap,
      recording_id: dropoutState.recordingId,
    })
  }
}

async function stopRecording(
  bridge: AudioGuardBridge,
  pcmChunks: Uint8Array[],
  onStateChange?: () => void | Promise<void>,
): Promise<void> {
  // Close the mic. safeAudioControl returns Promise<boolean>; we observe but
  // proceed regardless — even if the SDK denies the close-ack, we still want
  // to upload whatever we captured. Errors are swallowed (defense-in-depth).
  try {
    await safeAudioControl(false, bridge)
  } catch {
    // ignore — close-ack failure is non-fatal
  }

  recording = false
  recordingStartedAt = null
  stateLine = '[UPLOADING…]'
  bodyLine2 = ''
  await onStateChange?.()

  // Capture chunk count BEFORE the buffer is mutated below — it's a
  // load-bearing input to the voice_capture_completed event's `chunks` field
  // (D-T1). We intentionally do this before WAV-wrap so a thrown encode
  // doesn't drop the metric.
  const totalChunks = pcmChunks.length

  let audioBase64 = ''
  let wavBytes = 0
  // Reuse the dropout recording_id as the clientCaptureId so the queue entry,
  // the server-side voice_captures row, and the telemetry events all share
  // one identifier. Falls back to a fresh UUID v4 if the dropout state was
  // never initialized (defensive — should be unreachable since the START
  // path always sets it).
  const clientCaptureId = dropoutState.recordingId ?? generateUuidV4()

  try {
    const pcm = concatPcmChunks(pcmChunks)
    const wav = buildWav(pcm)
    wavBytes = wav.length
    audioBase64 = uint8ToBase64(wav)
  } catch {
    // Encode failure — there's nothing to POST. Surface [ERR] and bail. The
    // raw PCM is not recoverable to a queue entry without WAV-wrap, so we do
    // NOT enqueue.
    stateLine = '[ERR]'
    bodyLine2 = COPY_ERR
    await onStateChange?.()
    return
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`
  }

  const stopToHttpStart = Date.now()
  let res: Response | null = null
  let networkError = false
  try {
    res = await fetch(`${BASE_URL}/voice/transcribe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ audio: audioBase64, clientCaptureId }),
    })
  } catch {
    networkError = true
  }
  const stopToHttpMs = Date.now() - stopToHttpStart

  if (!networkError && res && res.ok) {
    // ── Success path ────────────────────────────────────────────────────
    let transcriptChars = 0
    try {
      const body = (await res.clone().json()) as { content?: string }
      transcriptChars = body.content?.length ?? 0
    } catch {
      // Body unparseable — accept the 2xx and move on with transcript_chars = 0.
    }

    // D-T1: voice_capture_completed with safe-key set ONLY. The compiler
    // enforces the contract (VoiceCaptureCompletedProps).
    emitVoiceCaptureCompleted({
      stop_to_http_ms: stopToHttpMs,
      chunks: totalChunks,
      bytes: wavBytes,
      retry_count: 0, // online path — no retries
      transcript_chars: transcriptChars,
    })

    stateLine = '[DONE]'
    bodyLine2 = ''
    pcmChunks.length = 0
    // Schedule auto-clear to [IDLE] after 2 seconds (D-S1).
    doneTimer = setTimeout(() => {
      if (stateLine === '[DONE]') {
        stateLine = '[IDLE]'
        bodyLine2 = ''
        void onStateChange?.()
      }
      doneTimer = null
    }, 2000)
    await onStateChange?.()
    return
  }

  // ── Failure paths ──────────────────────────────────────────────────────

  // 429 DAILY_AI_BUDGET_EXCEEDED — permanent (D-E3 cascade). Do NOT enqueue —
  // the cap won't reset until midnight UTC, so retrying would only burn
  // bandwidth. Distinct body-line copy lets the operator tell this apart
  // from transient failures that the queue is auto-retrying.
  if (!networkError && res && res.status === 429) {
    let body: { code?: string } = {}
    try {
      body = (await res.clone().json()) as { code?: string }
    } catch {
      // Unparseable 429 body — still treat as permanent (the only documented
      // 429 from /v1/voice/transcribe is DAILY_AI_BUDGET_EXCEEDED).
    }
    if (body.code === 'DAILY_AI_BUDGET_EXCEEDED' || !body.code) {
      stateLine = '[ERR]'
      bodyLine2 = COPY_BUDGET_CAP
      pcmChunks.length = 0
      await onStateChange?.()
      return
    }
  }

  // Transient (5xx / network error / other) — enqueue + show [ERR]. The
  // queue's drain loop (scheduled cadence handler) will retry per the
  // [1s, 2s, 4s, 8s, 16s, 30s] backoff and either succeed or evict after 6
  // retries. enqueue() handles LRU eviction internally if the queue is full.
  enqueue({
    clientCaptureId,
    base64Audio: audioBase64,
    queuedAt: Date.now(),
    retryCount: 0,
  })

  stateLine = '[ERR]'
  bodyLine2 = COPY_ERR
  // Clear the in-flight buffer; the next recording starts fresh. The queue
  // owns the payload now.
  pcmChunks.length = 0
  await onStateChange?.()
}

// ─── PCM + base64 + UUID helpers ──────────────────────────────────────────

function concatPcmChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

/** Base64-encode a Uint8Array. Uses `btoa` in browser-class runtimes (G2 WebView)
 *  and falls back to `Buffer.from(...).toString('base64')` under Node.js test
 *  contexts where `btoa` is also available since v16 but the Buffer path is
 *  cheaper for large payloads. */
function uint8ToBase64(bytes: Uint8Array): string {
  // Browser path — btoa expects a binary string.
  if (typeof btoa === 'function') {
    // Chunk the conversion so large PCM payloads don't blow the call stack of
    // String.fromCharCode (~64KB safe limit).
    const CHUNK = 0x8000
    let binary = ''
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
      binary += String.fromCharCode.apply(
        null,
        slice as unknown as number[],
      )
    }
    return btoa(binary)
  }
  // Node fallback (test runs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeBuffer = (globalThis as unknown as { Buffer?: { from(arr: Uint8Array): { toString(enc: string): string } } }).Buffer
  if (NodeBuffer) {
    return NodeBuffer.from(bytes).toString('base64')
  }
  throw new Error('No base64 encoder available')
}

/** UUID v4 generator. Prefers `crypto.randomUUID()` (modern browsers + Node 19+),
 *  falls back to a manual RFC 4122 implementation if absent. */
function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for older runtimes
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
  }
  // Last-resort Math.random fallback (NOT cryptographically secure; logged
  // here so the absence of crypto.* is visible in production).
  console.warn('[voice] crypto.randomUUID + crypto.getRandomValues unavailable; using Math.random UUID fallback')
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function formatRecState(elapsedSeconds: number): `[REC ${string}]` {
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `[REC ${minutes}:${seconds.toString().padStart(2, '0')}]`
}

// ─── Screen builder ─────────────────────────────────────────────────────────

/**
 * Build the voice screen page container. Reads module-scope state to render
 * the current state line + body line 2. The `isRecording` parameter is
 * informational only — the source of truth is the module-scope `recording`
 * flag (which `isRecording` mirrors for the carousel rebuild call site).
 *
 * Container names ≤ 11 chars per the Phase 125 hardware-debug fix
 * (`voice-body` / `voice-head` / `voice-foot`).
 */
export function buildVoiceScreen(_isRecording: boolean): RebuildPageContainer {
  // Compute the live elapsed counter for [REC m:ss] from `recordingStartedAt`
  // so the user sees a fresh m:ss each carousel rebuild without an interval
  // timer. The 60-second audio cap means m won't exceed 1 (server-side
  // assertAudioSessionWithinCap enforces 1.92 MB / 60 s).
  if (recording && recordingStartedAt !== null) {
    const elapsedSec = Math.floor((Date.now() - recordingStartedAt) / 1000)
    stateLine = formatRecState(elapsedSec)
  }

  const header = buildVigilHeader(
    ContainerId.VOICE_HEADER,
    'voice-head',
    'voice',
  )

  const bodyContent = bodyLine2 ? `${stateLine}\n${bodyLine2}` : stateLine

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 1,
    borderColor: 15,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.VOICE_BODY,
    containerName: 'voice-body',
    content: bodyContent,
    isEventCapture: 1, // DOUBLE_CLICK routes through body — D-G1 / D-G2 / companion.ts:386-399 pattern
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
    containerID: ContainerId.VOICE_FOOTER,
    containerName: 'voice-foot',
    content: recording
      ? '() double-tap to stop'
      : '() double-tap to record',
    isEventCapture: 0,
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, body, footer],
  })
}

// ─── Test-only helper ─────────────────────────────────────────────────────

/**
 * @internal — test-only helper. Resets module-scope state so each unit test
 * starts from `recording=false, stateLine=[IDLE]`. Mirrors the
 * `__resetForTesting` precedent in `audio-session-guard.ts`.
 *
 * Phase 130 Plan 04 VOICE-02 production code MUST NOT call this — the
 * state machine is driven by `toggleVoiceRecording` only.
 */
export function __resetVoiceForTesting(): void {
  recording = false
  stateLine = '[IDLE]'
  bodyLine2 = ''
  recordingStartedAt = null
  if (doneTimer) {
    clearTimeout(doneTimer)
    doneTimer = null
  }
  dropoutState = {
    recordingId: null,
    baselineGaps: [],
    baselineMs: null,
    lastChunkAt: null,
  }
}
