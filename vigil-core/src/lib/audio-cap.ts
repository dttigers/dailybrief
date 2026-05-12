// Phase 127 Plan 03 — GUARD-02 audio session byte cap helper.
//
// Defense-in-depth at HTTP ingress: the G2 SDK PCM format is locked at
// 16 kHz × 16-bit LE × mono = 32 KB/s per `.planning/research/EVEN-SKILLS.md`.
// One utterance = one POST. 60-second cap × 32 KB/s = 1_920_000 PCM bytes
// ≈ 2_560_000 base64 chars. Server rejects oversize payloads BEFORE any
// decode, regardless of whether the G2 plugin cleanup wrapper (Plan 04)
// fires reliably on hardware.
//
// Phase 130's `/v1/voice/transcribe` route imports `assertAudioSessionWithinCap`
// and calls it first thing inside the handler. The throw-based shape mirrors
// `DailyBudgetExceededError` (Plan 05) so `app.onError` (or a local catch)
// can translate the typed error to HTTP 413 with locked code
// `AUDIO_SESSION_TOO_LONG` (matches PWA ERROR_CODE_MAP key — D-02.4).
//
// Locks (CONTEXT D-02.1):
//   MAX_PCM_BYTES === 1_920_000             (60s × 16 kHz × 2 bytes — literal)
//   MAX_AUDIO_B64_CHARS_60S === 2_560_000   (ceil(MAX_PCM_BYTES * 4 / 3))

/**
 * Decoded PCM byte cap for a single 60-second G2 voice session.
 *
 * Math: 60s × 16_000 samples/s × 2 bytes/sample (16-bit LE mono) = 1_920_000.
 * Phase 103 D-04 literal-lock pattern — pinned by `audio-cap.test.ts`.
 */
export const MAX_PCM_BYTES = 60 * 16_000 * 2;

/**
 * Base64-encoded character cap for a 60-second G2 voice session.
 *
 * Math: `ceil(MAX_PCM_BYTES * 4 / 3) = 2_560_000`. Routes compare the raw
 * base64 string length BEFORE decoding to avoid allocating ~2.5 MB Buffer
 * memory for over-cap payloads. Phase 103 D-04 literal-lock pattern.
 */
export const MAX_AUDIO_B64_CHARS_60S = Math.ceil(MAX_PCM_BYTES * 4 / 3);

/**
 * Typed error raised by `assertAudioSessionWithinCap` when a base64 payload
 * exceeds the 60-second cap.
 *
 * Route handlers (Phase 130 `/v1/voice/transcribe`) catch and translate to
 * HTTP 413 with body `{ error, code: "AUDIO_SESSION_TOO_LONG" }`. The `code`
 * literal matches the PWA `ERROR_CODE_MAP` key verbatim (CONTEXT D-02.4) so
 * the PWA renders the locked friendly copy without server-side string-coupling.
 *
 * `name` is set explicitly so `instanceof` survives module boundaries — same
 * pattern used by `DailyBudgetExceededError` (Plan 05) for consistency across
 * GUARD-02 + GUARD-03 throw-based error funneling through `app.onError`.
 */
export class AudioSessionTooLongError extends Error {
  public readonly code = "AUDIO_SESSION_TOO_LONG" as const;

  constructor(public readonly b64Length: number) {
    super(
      `Audio session base64 length ${b64Length} exceeds 60s cap (${MAX_AUDIO_B64_CHARS_60S})`,
    );
    this.name = "AudioSessionTooLongError";
  }
}

/**
 * Assert that a base64 audio payload is within the 60-second G2 voice cap.
 *
 * Route-framework-agnostic — does NOT take a Hono context. Phase 130
 * handlers call this at the top of `/v1/voice/transcribe` after `bearerAuth`
 * and before any AI client invocation; on throw, the handler (or
 * `app.onError`) returns HTTP 413 with the locked `AUDIO_SESSION_TOO_LONG`
 * code.
 *
 * @param b64  Raw base64-encoded audio payload (typically `body.audio`).
 * @throws  {AudioSessionTooLongError} when `b64.length > MAX_AUDIO_B64_CHARS_60S`.
 */
export function assertAudioSessionWithinCap(b64: string): void {
  if (b64.length > MAX_AUDIO_B64_CHARS_60S) {
    throw new AudioSessionTooLongError(b64.length);
  }
}
