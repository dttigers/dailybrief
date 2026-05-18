// Phase 130 Plan 04 — Wave 0 RED tests for D-D1 WAV header structure pin.
// Phase 130 Plan 06 — finalized: ALL 8 D-D1 header byte positions pinned
//                      byte-for-byte + bonus assertions for byte rate / block
//                      align / data length / total length / PCM-pass-through.
//
// The wav-encoder.ts module ships a `buildWav(pcm: Uint8Array): Uint8Array`
// helper that wraps raw 16kHz mono 16-bit-LE PCM in a 44-byte RIFF/WAVE/PCM
// header. This test file pins all 8 D-D1 header byte positions so a
// regression to 8 kHz, stereo, or 8-bit format trips before any G2 build
// packs.
//
// D-D1 byte map (acceptance criteria from Plan 06):
//   1. Bytes 0-3   = "RIFF"               (0x52 0x49 0x46 0x46)
//   2. Bytes 4-7   = uint32 LE total len  (36 + pcm.length)
//   3. Bytes 8-11  = "WAVE"               (0x57 0x41 0x56 0x45)
//   4. Bytes 12-15 = "fmt "               (0x66 0x6d 0x74 0x20 — trailing space)
//   5. Byte 22     = uint16 LE channels   (1 — mono)
//   6. Byte 24     = uint32 LE sampleRate (16000)
//   7. Byte 34     = uint16 LE bitDepth   (16)
//   8. Bytes 36-39 = "data"               (0x64 0x61 0x74 0x61)
//
// Bonus (low-cost / high-signal):
//   - Byte 28 = uint32 LE byteRate    (32000)
//   - Byte 32 = uint16 LE blockAlign  (2)
//   - Byte 40 = uint32 LE dataLen     (pcm.length)
//   - Total length === 44 + pcm.length
//   - Bytes 44..end equal input pcm bytes
//
// Test framework: node:test + assert/strict (matches audio-session-guard.test.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Note: the import path resolves to the wav-encoder.ts file landed in Plan 04.
import { buildWav } from '../lib/wav-encoder.ts'

// ─── ASCII-string sentinel constants (referenced by Plan 06 acceptance grep) ─
// These four literals MUST appear in the test source file so the source-grep
// acceptance criterion in 130-06-PLAN.md sees the exact ASCII markers. Each
// constant is consumed by an assert call below — they are not dead code.
const RIFF_MARKER = 'RIFF'
const WAVE_MARKER = 'WAVE'
const FMT_MARKER = 'fmt '
const DATA_MARKER = 'data'

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let s = ''
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i])
  return s
}

// ─── 44-byte fixed-header position pins (D-D1) ─────────────────────────────

test('D-D1: buildWav(empty pcm) returns Uint8Array of length 44 with RIFF/WAVE/fmt /data markers', () => {
  const wav = buildWav(new Uint8Array(0))
  assert.ok(wav instanceof Uint8Array, 'return type is Uint8Array')
  assert.equal(wav.length, 44, 'header-only length is 44 bytes')

  // RIFF at offset 0-3
  assert.equal(wav[0], 0x52, 'byte 0 = "R" (0x52)')
  assert.equal(wav[1], 0x49, 'byte 1 = "I" (0x49)')
  assert.equal(wav[2], 0x46, 'byte 2 = "F" (0x46)')
  assert.equal(wav[3], 0x46, 'byte 3 = "F" (0x46)')

  // WAVE at offset 8-11
  assert.equal(wav[8], 0x57, 'byte 8 = "W" (0x57)')
  assert.equal(wav[9], 0x41, 'byte 9 = "A" (0x41)')
  assert.equal(wav[10], 0x56, 'byte 10 = "V" (0x56)')
  assert.equal(wav[11], 0x45, 'byte 11 = "E" (0x45)')

  // "fmt " at offset 12-15
  assert.equal(wav[12], 0x66, 'byte 12 = "f" (0x66)')
  assert.equal(wav[13], 0x6d, 'byte 13 = "m" (0x6d)')
  assert.equal(wav[14], 0x74, 'byte 14 = "t" (0x74)')
  assert.equal(wav[15], 0x20, 'byte 15 = " " (0x20 — space)')

  // "data" at offset 36-39
  assert.equal(wav[36], 0x64, 'byte 36 = "d" (0x64)')
  assert.equal(wav[37], 0x61, 'byte 37 = "a" (0x61)')
  assert.equal(wav[38], 0x74, 'byte 38 = "t" (0x74)')
  assert.equal(wav[39], 0x61, 'byte 39 = "a" (0x61)')
})

test('D-D1: WAV header channel count = 1 (mono) at offset 22 (uint16 LE)', () => {
  const wav = buildWav(new Uint8Array(0))
  // uint16 LE at offset 22
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint16(22, true), 1, 'channels = 1 (mono)')
})

test('D-D1: WAV header sample rate = 16000 at offset 24 (uint32 LE)', () => {
  const wav = buildWav(new Uint8Array(0))
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint32(24, true), 16000, 'sample rate = 16000 Hz')
})

test('D-D1: WAV header byte rate = 32000 at offset 28 (uint32 LE)', () => {
  const wav = buildWav(new Uint8Array(0))
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint32(28, true), 32000, 'byte rate = 32000 (16000 × 2)')
})

test('D-D1: WAV header bit depth = 16 at offset 34 (uint16 LE)', () => {
  const wav = buildWav(new Uint8Array(0))
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint16(34, true), 16, 'bit depth = 16')
})

test('D-D1: buildWav(pcm) writes pcm.length at byte position 40 (uint32 LE data length)', () => {
  const pcm = new Uint8Array(100)
  const wav = buildWav(pcm)
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint32(40, true), pcm.length, 'data length field = pcm.length')
})

test('D-D1: total output length = 44 + pcm.length; bytes 44..end equal input pcm', () => {
  const pcm = new Uint8Array(32) // any size
  for (let i = 0; i < pcm.length; i++) pcm[i] = (i * 7) & 0xff // distinct pattern
  const wav = buildWav(pcm)

  assert.equal(wav.length, 44 + pcm.length, 'total length = 44 + pcm.length')

  // Bytes 44..end equal pcm bytes
  for (let i = 0; i < pcm.length; i++) {
    assert.equal(wav[44 + i], pcm[i], `byte 44+${i} = pcm[${i}]`)
  }
})

test('D-D1: RIFF chunk size at offset 4 = 36 + pcm.length (uint32 LE)', () => {
  // RIFF chunk size = total file size - 8 (the 8 bytes of "RIFF" + size field)
  // = 36 + pcm.length. Pinned for header-shape regression coverage.
  const pcm = new Uint8Array(200)
  const wav = buildWav(pcm)
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint32(4, true), 36 + pcm.length, 'RIFF chunk size = 36 + pcm.length')
})

// ─── Plan 06: ASCII-string sentinel assertions ────────────────────────────
// Pins the exact ASCII literals 'RIFF', 'WAVE', 'fmt ', 'data' as decoded
// strings — complements the per-byte hex assertions above so future
// regressions are caught regardless of how the header is written (hex bytes
// vs TextEncoder vs direct ASCII).

test('D-D1: bytes 0-3 decode to ASCII "RIFF" marker', () => {
  const wav = buildWav(new Uint8Array(0))
  assert.equal(readAscii(wav, 0, 4), RIFF_MARKER, 'bytes 0-3 = "RIFF"')
})

test('D-D1: bytes 8-11 decode to ASCII "WAVE" marker', () => {
  const wav = buildWav(new Uint8Array(0))
  assert.equal(readAscii(wav, 8, 4), WAVE_MARKER, 'bytes 8-11 = "WAVE"')
})

test('D-D1: bytes 12-15 decode to ASCII "fmt " marker (with trailing space)', () => {
  const wav = buildWav(new Uint8Array(0))
  assert.equal(readAscii(wav, 12, 4), FMT_MARKER, 'bytes 12-15 = "fmt "')
  // Pin the trailing-space invariant explicitly — a "fmt0" regression would
  // break the WAV header even with all numeric fields intact.
  assert.equal(wav[15], 0x20, 'byte 15 MUST be a literal space character (0x20)')
})

test('D-D1: bytes 36-39 decode to ASCII "data" marker', () => {
  const wav = buildWav(new Uint8Array(0))
  assert.equal(readAscii(wav, 36, 4), DATA_MARKER, 'bytes 36-39 = "data"')
})

test('D-D1: WAV header block align = 2 at offset 32 (uint16 LE)', () => {
  // block align = channels × bit depth / 8 = 1 × 16 / 8 = 2. Pinned so a
  // regression to stereo (channels=2 → block align=4) trips here too.
  const wav = buildWav(new Uint8Array(0))
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  assert.equal(view.getUint16(32, true), 2, 'block align = 2 (mono × 16-bit)')
})
