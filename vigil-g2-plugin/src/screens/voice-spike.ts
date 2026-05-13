// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
// Convention precedent: vigil-g2-plugin/scripts/check-verified.mjs.
//
// Wires 5 of 7 UI-SPEC states (IDLE / REC / UPLOADING… / DONE / ERR).
// The two remaining UI-SPEC states for permission-revoked and budget-
// exceeded failure modes are deferred to Phase 130 — the spike operator
// reads both failure shapes from console logs per CONTEXT D-G3 / D-M2,
// and the screen renders ERR for both cases in the meantime.
//
// Per-chunk live-counter re-render is DEFERRED. The `chunks: N bytes: B`
// line on the G2 display refreshes only on screen entry / state transition
// / post-upload. Mid-recording chunk count is read by the operator from
// the console log stream (Plan 04 Task 2's `chunk bytes=` line). Adding a
// per-audioEvent rebuild call would round-trip the SDK ≥10×/s and
// contaminate the inter_chunk_latency measurement this spike exists to
// take.
//
// All log strings use the GUARD-01 safe-key allowlist (bytes / chunk_n /
// gap_ms / mic_on_ms / e2e_ms / b64_chars) — never the banned tokens.

import {
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import { DISPLAY_WIDTH, ContainerId } from '../constants.ts'
import { buildVigilHeader } from './header.ts'
import { safeAudioControl } from '../lib/audio-session-guard.ts'
// Phase 128a SPIKE: switched from base64-JSON to raw octet-stream — toBase64
// no longer used. Encoder still exports it for future Phase 130 productionization.
import { buildWav } from '../../scripts/voice-spike-encoder.ts'
import { BASE_URL, API_KEY } from '../api.ts'

// ---------------------------------------------------------------------------
// Module-scope mutable state — the spike's recording state machine.
//
// `let recording` is the binary toggle the DOUBLE_CLICK route flips (Plan 04
// wires the actual gesture-handler call). `pcmChunks` is the in-memory buffer
// of audioEvent payloads (Plan 04 Task 2 wires the collector). The rest are
// last-result metadata for the body's line 3 ("last: 3.2s 1.4MB").
//
// Pattern source: vigil-g2-plugin/src/lib/audio-session-guard.ts:63-66
// (`let audioActive = false` closure-captured module state).
// ---------------------------------------------------------------------------

type StateLine = '[IDLE]' | '[REC]' | '[UPLOADING…]' | '[DONE]' | '[ERR]'

let recording = false
const pcmChunks: Uint8Array[] = []
let micOnStartedAt: number | null = null
let lastBytes: number | null = null
let lastE2eMs: number | null = null
let stateLine: StateLine = '[IDLE]'

/** Whether the screen's recording state machine is currently active. */
export function getRecording(): boolean {
  return recording
}

/**
 * Append one collected payload chunk to the in-memory buffer. Single-line
 * push by design — no SDK round-trip from this function (see top-of-file
 * "Per-chunk live-counter re-render is DEFERRED" note). Plan 04 Task 2
 * wires the audioEvent listener that calls this.
 */
export function appendPcmChunk(chunk: Uint8Array): void {
  if (pcmChunks.length === 0 && micOnStartedAt != null) {
    // First chunk per recording session — log D-M1 mic_on_latency once.
    console.log(`[voice-spike] mic_on_ms=${Date.now() - micOnStartedAt}`)
  }
  pcmChunks.push(chunk)
}

// ---------------------------------------------------------------------------
// Body helpers
// ---------------------------------------------------------------------------

function totalPayloadBytes(): number {
  let n = 0
  for (const c of pcmChunks) n += c.length
  return n
}

/** "M:SS" zero-padded SS; caps at "0:59" because the server cap trips first. */
function formatMSS(ms: number): string {
  const totalSec = Math.min(59, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}b`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / (1024 * 1024)).toFixed(1)}MB`
}

function formatLast(): string {
  if (lastBytes == null || lastE2eMs == null) return '—' // em-dash for "no recording yet"
  return `${(lastE2eMs / 1000).toFixed(1)}s ${formatBytes(lastBytes)}`
}

// ---------------------------------------------------------------------------
// Screen builder — 3-container header / body / footer triple, geometry
// lifted verbatim from vigil-g2-plugin/src/screens/affirmation.ts:17-61.
// ---------------------------------------------------------------------------

/**
 * Build the Voice Spike screen for the G2 carousel.
 *
 * @param isRecording — module-scope `recording` flag, threaded explicitly so
 *                       navigation.ts can pass `getRecording()` at build time.
 *                       Affirmation's analog passes affirmation text; spike
 *                       passes the boolean toggle since there's no API fetch.
 */
export function buildVoiceSpikeScreen(
  isRecording: boolean,
): RebuildPageContainer {
  // Unified VIGIL header — third arg overrides the default HH:MM AM/PM so the
  // operator can see at a glance which carousel screen they're on during the
  // 60s portfolio Loom (header.ts default vs override: see affirmation.ts:23
  // for the default-time call shape).
  const header = buildVigilHeader(
    ContainerId.VOICE_SPIKE_HEADER,
    'vs-header',
    'voice-spike',
  )

  // ----- Body content (3 lines: state / counter / last-result) --------------
  let line1: string
  if (isRecording) {
    // stateLine === '[REC]' is implied when isRecording is true.
    const elapsed = micOnStartedAt == null ? 0 : Date.now() - micOnStartedAt
    line1 = `[REC ${formatMSS(elapsed)}]  () to stop`
  } else if (stateLine === '[UPLOADING…]') {
    line1 = '[UPLOADING…]'
  } else if (stateLine === '[DONE]') {
    line1 = '[DONE]  thought saved'
  } else if (stateLine === '[ERR]') {
    line1 = '[ERR]  retry () to record'
  } else {
    // [IDLE]
    line1 = '[IDLE]  () to record'
  }

  const line2 = `chunks: ${pcmChunks.length}  bytes: ${totalPayloadBytes()}`
  const line3 = `last: ${formatLast()}`

  // Single template literal per home.ts:36 precedent; \n\n spacers between
  // sections for ADHD-glanceability per UI-SPEC §Accessibility.
  const bodyContent = `${line1}\n\n${line2}\n\n${line3}`

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 1, // Phase 106 D-07 item 4
    borderColor: 15,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.VOICE_SPIKE_BODY,
    containerName: 'vs-body', // ≤11 chars per Phase 125 hardware-debug-2026-05-10 fix
    content: bodyContent,
    isEventCapture: 1, // load-bearing: DOUBLE_CLICK routes through this
  })

  // ----- Footer (nav-hint row) ----------------------------------------------
  const footerContent = isRecording
    ? '() to stop recording'
    : '↑ home  ↓ companion  () rec'

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
    content: footerContent,
    isEventCapture: 0,
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, body, footer],
  })
}

// ---------------------------------------------------------------------------
// Recording state machine + POST orchestrator
//
// Called by Plan 04's DOUBLE_CLICK route. The CONTEXT D-W2 sequence is:
//   1. flip `recording`
//   2. (start)  reset buffer + console.time('mic-on') + safeAudioControl(true)
//   3. (stop)   safeAudioControl(false) → buildWav → toBase64 → POST
//      → on 200/201: parse {id,content} + stateLine = '[DONE]'
//      → on 4xx/5xx or throw: stateLine = '[ERR]'
//
// safeAudioControl (Phase 127 GUARD-02) is the ONLY mic-API entrypoint —
// bridge.audioControl is never called directly anywhere in this file.
// ---------------------------------------------------------------------------

export async function toggleVoiceSpikeRecording(
  bridge: Parameters<typeof safeAudioControl>[1],
  onStateChange?: () => Promise<void>,
): Promise<void> {
  recording = !recording

  if (recording) {
    // START recording
    pcmChunks.length = 0
    micOnStartedAt = Date.now()
    stateLine = '[REC]'
    // D-M1 mic_on_latency: appendPcmChunk logs it once on first chunk per session.
    await safeAudioControl(true, bridge)
    await onStateChange?.()
    return
  }

  // STOP recording → upload
  await safeAudioControl(false, bridge)
  stateLine = '[UPLOADING…]'
  await onStateChange?.()

  // Concat payload buffer into a single Uint8Array (sum-of-lengths alloc,
  // then `.set(chunk, offset)` per chunk — standard ArrayBuffer concat
  // pattern, no Node Buffer).
  const totalLen = totalPayloadBytes()
  const total = new Uint8Array(totalLen)
  let off = 0
  for (const c of pcmChunks) {
    total.set(c, off)
    off += c.length
  }

  const wav = buildWav(total)
  lastBytes = wav.length
  // GUARD-01-safe key names in log string: bytes — does NOT match banned
  // 'pcm' / 'audio*' substrings. Phase 128a SPIKE switched from base64-JSON
  // to raw octet-stream because iPhone WebView dropped large JSON string
  // bodies mid-POST (282KB string → "network connection was lost" + 404).
  console.log(`[voice-spike] bytes=${wav.length}`)

  let res: Response | null = null
  try {
    // Copy into a fresh ArrayBuffer-backed Uint8Array to satisfy strict-mode
    // Blob typing (Uint8Array<ArrayBufferLike> may include SharedArrayBuffer).
    // Avoids the ~33% base64 inflation that crashed the WebView's request pipe.
    const bytesForBlob = new Uint8Array(wav.length)
    bytesForBlob.set(wav)
    const blob = new Blob([bytesForBlob], { type: 'application/octet-stream' })
    res = await fetch(`${BASE_URL}/voice/transcribe?_=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/octet-stream',
      },
      body: blob,
    })
    if (res.ok) {
      // 200/201 — parse body so we observe content shape end-to-end, but the
      // spike doesn't currently use the parsed value beyond log telemetry.
      await res.json().catch(() => null)
      lastE2eMs =
        Date.now() - (micOnStartedAt ?? Date.now())
      stateLine = '[DONE]'
      console.log(
        `[voice-spike] e2e_ms=${lastE2eMs} chunk_n=${pcmChunks.length}`,
      )
    } else {
      stateLine = '[ERR]'
      console.error(`[voice-spike] upload failed status=${res.status}`)
    }
  } catch (err) {
    stateLine = '[ERR]'
    console.error(
      `[voice-spike] upload failed status=fetch_throw err=${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
  await onStateChange?.()
}
