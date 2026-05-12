// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
// Convention precedent: vigil-g2-plugin/scripts/check-verified.mjs (scripts/
// directory is excluded from the plugin pack bundle per CONTEXT D-A3).
//
// Builds the standard 44-byte WAV-PCM header for the format locked by
// CONTEXT D-W1 and EVEN-SKILLS.md §"Audio capture" (lines 94-118):
//   - SAMPLE_RATE      = 16000 Hz
//   - CHANNELS         = 1 (mono)
//   - BITS_PER_SAMPLE  = 16 (little-endian)
//   ⇒ byteRate    = 32000
//   ⇒ blockAlign  = 2
//
// Chunk layout (canonical RIFF/WAVE/fmt /data):
//   offset  bytes  content
//   0       4      "RIFF"          (0x52 0x49 0x46 0x46)
//   4       4      totalLen - 8    (LE uint32)
//   8       4      "WAVE"          (0x57 0x41 0x56 0x45)
//   12      4      "fmt "          (0x66 0x6d 0x74 0x20)
//   16      4      16              (PCM subchunk1 size, LE uint32)
//   20      2      1               (PCM audio format, LE uint16)
//   22      2      CHANNELS        (LE uint16)
//   24      4      SAMPLE_RATE     (LE uint32)
//   28      4      byteRate        (LE uint32)
//   32      2      blockAlign      (LE uint16)
//   34      2      BITS_PER_SAMPLE (LE uint16)
//   36      4      "data"          (0x64 0x61 0x74 0x61)
//   40      4      dataLen         (LE uint32)
//   44      N      PCM payload bytes
//
// WebView-compatible primitives only: Uint8Array + DataView + btoa. Node
// Buffer is unavailable in the Even Hub WebView runtime.

const SAMPLE_RATE = 16000
const CHANNELS = 1
const BITS_PER_SAMPLE = 16

/**
 * Build a 44-byte WAV header for 16 kHz mono 16-bit LE, prepended to the
 * concatenated payload bytes. Returns a single ready-to-base64-encode
 * Uint8Array.
 *
 * Format locked at module-constant load time — do NOT parameterize.
 */
export function buildWav(pcm: Uint8Array): Uint8Array {
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8) // 32000
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8) // 2
  const dataLen = pcm.length
  const totalLen = 44 + dataLen
  const buf = new Uint8Array(totalLen)
  const view = new DataView(buf.buffer)

  // 'RIFF' chunk
  buf.set([0x52, 0x49, 0x46, 0x46], 0) // "RIFF"
  view.setUint32(4, totalLen - 8, true)
  buf.set([0x57, 0x41, 0x56, 0x45], 8) // "WAVE"

  // 'fmt ' subchunk
  buf.set([0x66, 0x6d, 0x74, 0x20], 12) // "fmt "
  view.setUint32(16, 16, true) // subchunk1 size (PCM = 16)
  view.setUint16(20, 1, true) // format tag (PCM = 1)
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BITS_PER_SAMPLE, true)

  // 'data' subchunk
  buf.set([0x64, 0x61, 0x74, 0x61], 36) // "data"
  view.setUint32(40, dataLen, true)
  buf.set(pcm, 44)

  return buf
}

/**
 * Base64-encode a Uint8Array via the WebView's btoa.
 *
 * Uses the canonical String.fromCharCode charcode loop so each byte maps to
 * a single Latin-1 code unit before btoa runs. This is the same pattern
 * the existing G2 plugin api.ts authHeaders / SSE shim rely on (WebView
 * has btoa + atob but no Node Buffer).
 */
export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin)
}
