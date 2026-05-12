// Phase 127 Plan 03 — GUARD-02 audio-cap helper tests (RED → GREEN).
//
// Pins the public surface of vigil-core/src/lib/audio-cap.ts per CONTEXT D-02.1
// + D-02.4 + PATTERNS section "vigil-core/src/lib/audio-cap.ts".
//
// Locked constants (CONTEXT D-02.1 — Even SDK PCM format lock 16 kHz × 16-bit
// LE × mono = 32 KB/s; 60s × 32 KB/s = 1_920_000 PCM bytes → ceil(n*4/3) ≈
// 2_560_000 base64 chars):
//   MAX_PCM_BYTES === 1_920_000
//   MAX_AUDIO_B64_CHARS_60S === 2_560_000
//
// Locked error code (CONTEXT D-02.4 — matches PWA ERROR_CODE_MAP key):
//   AudioSessionTooLongError.code === "AUDIO_SESSION_TOO_LONG"
//
// Analog: src/lib/quiet-mode-suppression.test.ts (closest pure-helper test
// under src/lib/; bare node:test + assert/strict pattern).
//
// Run: cd vigil-core && npx tsx --test src/lib/audio-cap.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PCM_BYTES,
  MAX_AUDIO_B64_CHARS_60S,
  assertAudioSessionWithinCap,
  AudioSessionTooLongError,
} from "./audio-cap.js";

test("MAX_PCM_BYTES === 1_920_000 (Even SDK 60s × 16 kHz × 2 bytes — D-02.1 literal lock)", () => {
  assert.equal(MAX_PCM_BYTES, 1_920_000);
});

test("MAX_AUDIO_B64_CHARS_60S === 2_560_000 (ceil(MAX_PCM_BYTES * 4 / 3) — D-02.1 literal lock)", () => {
  assert.equal(MAX_AUDIO_B64_CHARS_60S, 2_560_000);
  assert.equal(MAX_AUDIO_B64_CHARS_60S, Math.ceil(MAX_PCM_BYTES * 4 / 3));
});

test("assertAudioSessionWithinCap accepts exact boundary (length === MAX_AUDIO_B64_CHARS_60S)", () => {
  assert.doesNotThrow(() => {
    assertAudioSessionWithinCap("a".repeat(MAX_AUDIO_B64_CHARS_60S));
  });
});

test("assertAudioSessionWithinCap rejects boundary + 1 with AudioSessionTooLongError", () => {
  assert.throws(
    () => assertAudioSessionWithinCap("a".repeat(MAX_AUDIO_B64_CHARS_60S + 1)),
    AudioSessionTooLongError,
  );
});

test("assertAudioSessionWithinCap accepts empty string (degenerate but not over-cap)", () => {
  assert.doesNotThrow(() => {
    assertAudioSessionWithinCap("");
  });
});

test("AudioSessionTooLongError carries locked code AUDIO_SESSION_TOO_LONG + name + instanceof Error", () => {
  const err = new AudioSessionTooLongError(MAX_AUDIO_B64_CHARS_60S + 1);
  assert.equal(err.code, "AUDIO_SESSION_TOO_LONG");
  assert.equal(err.name, "AudioSessionTooLongError");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof AudioSessionTooLongError);
  assert.equal(err.b64Length, MAX_AUDIO_B64_CHARS_60S + 1);
  // Message includes both the actual length and the cap for debuggability.
  assert.match(err.message, /60s cap/);
  assert.match(err.message, new RegExp(String(MAX_AUDIO_B64_CHARS_60S)));
});
