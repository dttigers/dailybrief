/**
 * Phase 130 Plan 04 (VOICE-04 D-D1): 44-byte WAV header builder for the G2
 * voice capture pipeline.
 *
 * `buildWav(pcm)` wraps raw 16-kHz mono 16-bit-LE PCM in a RIFF/WAVE/PCM
 * container so the OpenAI Audio Transcriptions API (gpt-4o-mini-transcribe)
 * accepts the upload — the API requires a recognized audio MIME type and
 * matching container shape, NOT raw PCM bytes.
 *
 * D-D1 byte map (pinned by `src/__tests__/wav-encoder.test.ts`):
 *
 *   offset 0:  "RIFF"            (4 bytes ASCII)
 *   offset 4:  36 + pcm.length   (uint32 LE — RIFF chunk size, excludes the
 *                                 leading 8 bytes of "RIFF" + size field)
 *   offset 8:  "WAVE"            (4 bytes ASCII)
 *   offset 12: "fmt "            (4 bytes ASCII — trailing space significant)
 *   offset 16: 16                (uint32 LE — PCM subchunk size)
 *   offset 20: 1                 (uint16 LE — audio format = PCM)
 *   offset 22: 1                 (uint16 LE — channel count = mono)
 *   offset 24: 16000             (uint32 LE — sample rate = 16 kHz)
 *   offset 28: 32000             (uint32 LE — byte rate = 16000 × 2)
 *   offset 32: 2                 (uint16 LE — block align = channels × bit depth / 8)
 *   offset 34: 16                (uint16 LE — bit depth)
 *   offset 36: "data"            (4 bytes ASCII)
 *   offset 40: pcm.length        (uint32 LE — data subchunk size)
 *   offset 44: <pcm bytes>       (raw PCM data)
 *
 * The format is locked because:
 *   - 16 kHz × 16-bit × mono is the format the Even Hub SDK emits via
 *     `audioEvent.audioPcm` (verified in Phase 128a spike).
 *   - gpt-4o-mini-transcribe accepts that shape natively without resampling.
 *   - The byte rate / block align fields are derivable from those three
 *     numbers but are part of the RIFF/WAVE spec — recorded literally so
 *     a future regression in any of the three primary values is caught
 *     in the same byte position.
 *
 * Phase 130 Plan 06 will pin this byte map further with a server-side
 * drift detector (D-D1 §"new test"). Phase 130 Plan 05's offline queue
 * stores the OUTPUT of this function as base64 in localStorage, so any
 * regression in this header would silently brick the queue.
 *
 * Security: NEVER log the input `pcm` or the output `Uint8Array`. The
 * Phase 127 GUARD-01 `BLOCKED_PROPERTY_NAMES` blocklist enforces this for
 * PostHog / Sentry; per-callsite hygiene applies for `console.log`.
 */
export function buildWav(pcm: Uint8Array): Uint8Array {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const totalLen = 36 + pcm.length

  // RIFF descriptor — bytes 0-3
  view.setUint8(0, 0x52) // 'R'
  view.setUint8(1, 0x49) // 'I'
  view.setUint8(2, 0x46) // 'F'
  view.setUint8(3, 0x46) // 'F'

  // RIFF chunk size — bytes 4-7 (uint32 LE = total file size - 8)
  view.setUint32(4, totalLen, true)

  // WAVE format identifier — bytes 8-11
  view.setUint8(8, 0x57) // 'W'
  view.setUint8(9, 0x41) // 'A'
  view.setUint8(10, 0x56) // 'V'
  view.setUint8(11, 0x45) // 'E'

  // "fmt " subchunk identifier — bytes 12-15 (note: trailing space is part of the spec)
  view.setUint8(12, 0x66) // 'f'
  view.setUint8(13, 0x6d) // 'm'
  view.setUint8(14, 0x74) // 't'
  view.setUint8(15, 0x20) // ' '

  view.setUint32(16, 16, true) // PCM subchunk size
  view.setUint16(20, 1, true) // audio format = PCM
  view.setUint16(22, 1, true) // channel count = mono
  view.setUint32(24, 16000, true) // sample rate = 16 kHz
  view.setUint32(28, 32000, true) // byte rate = 16000 × 2
  view.setUint16(32, 2, true) // block align = 1 channel × 16 bits / 8
  view.setUint16(34, 16, true) // bit depth = 16

  // "data" subchunk identifier — bytes 36-39
  view.setUint8(36, 0x64) // 'd'
  view.setUint8(37, 0x61) // 'a'
  view.setUint8(38, 0x74) // 't'
  view.setUint8(39, 0x61) // 'a'

  // Data subchunk size — bytes 40-43 (uint32 LE = pcm.length)
  view.setUint32(40, pcm.length, true)

  // Concatenate header + PCM into a single Uint8Array
  const result = new Uint8Array(44 + pcm.length)
  result.set(new Uint8Array(header), 0)
  result.set(pcm, 44)
  return result
}
