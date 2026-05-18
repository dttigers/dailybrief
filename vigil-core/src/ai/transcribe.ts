// ── Phase 130 Plan 02 (VOICE-05) — OpenAI transcription helper ────────────
//
// `transcribeWav` calls OpenAI gpt-4o-mini-transcribe with a 30-second
// AbortController timeout. Returns the transcribed text plus an estimated
// duration in milliseconds (used by withOpenAIBudgetTracking to compute USD).
//
// Locked decisions (CONTEXT D-U2, RESEARCH Gray Area #5):
//   - Model: gpt-4o-mini-transcribe ($0.003/min; 1.88s p50 measured in 128a)
//   - Timeout: 30 s (RESEARCH Gray Area #5 — 16× spike p95)
//   - PCM math: 16 kHz × 16-bit LE × mono = 32,000 bytes/sec = 32 bytes/ms.
//     The 44-byte WAV header is subtracted before duration estimation.
//
// Error funneling (D-E1):
//   AbortError                                 → VoiceTranscribeTimeoutError (504)
//   OpenAI quota (status===429 || /quota/i)    → VoiceTranscribeQuotaError (503)
//   Any other OpenAI/network error             → VoiceTranscribeProviderDownError (502)
//   getTranscribeClient() returns null         → VoiceTranscribeProviderDownError (502)
//
// Lazy-init mirrors ai/client.ts pattern: never crash on missing OPENAI_API_KEY
// at module-load — return null and let route translate to 502.

import OpenAI, { toFile } from "openai";
import {
  VoiceTranscribeTimeoutError,
  VoiceTranscribeProviderDownError,
  VoiceTranscribeQuotaError,
} from "../routes/voice-errors.js";

// ── Constants (RESEARCH Gray Area #5) ──────────────────────────────────────

const OPENAI_TRANSCRIBE_TIMEOUT_MS = 30_000;
const OPENAI_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

// 16 kHz × 16-bit × mono = 32,000 bytes/sec → 32 bytes/ms
const WAV_BYTES_PER_MS = 32;
// 44-byte WAV header (D-D1 byte map)
const WAV_HEADER_BYTES = 44;

// ── Lazy-init OpenAI client (mirrors ai/client.ts) ────────────────────────

let openaiClient: OpenAI | null = null;

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "WARNING: OPENAI_API_KEY not set. Voice transcription will throw VoiceTranscribeProviderDownError (502).",
  );
}

export function getTranscribeClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

// ── Quota detector (D-E1 disambiguation) ──────────────────────────────────
// OpenAI v6 SDK shapes errors as: { status: number, message: string, code?: string }
// — quota errors land at status 429 OR include "quota" in the message string.
function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const anyErr = err as { status?: unknown };
  if (typeof anyErr.status === "number" && anyErr.status === 429) return true;
  return /quota/i.test(err.message ?? "");
}

// ── Public API ────────────────────────────────────────────────────────────

export interface TranscribeResult {
  text: string;
  durationMs: number;
}

/**
 * Transcribe a 16 kHz × 16-bit LE × mono WAV buffer via OpenAI
 * gpt-4o-mini-transcribe with a 30 s AbortController timeout.
 *
 * @throws VoiceTranscribeTimeoutError       on 30s AbortController abort
 * @throws VoiceTranscribeQuotaError          on OpenAI 429 / "quota" error
 * @throws VoiceTranscribeProviderDownError   on any other OpenAI/network error,
 *                                            including the no-API-key case
 */
export async function transcribeWav(wav: Buffer): Promise<TranscribeResult> {
  const ai = getTranscribeClient();
  if (!ai) {
    throw new VoiceTranscribeProviderDownError(
      "OPENAI_API_KEY not configured",
    );
  }

  // Estimate duration BEFORE the network call so the budget adapter can
  // accumulate cost using the correct (server-validated) duration even if
  // the call later fails. PCM byte count → ms.
  const pcmBytes = Math.max(0, wav.length - WAV_HEADER_BYTES);
  const durationMs = pcmBytes / WAV_BYTES_PER_MS;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OPENAI_TRANSCRIBE_TIMEOUT_MS,
  );

  try {
    const file = await toFile(wav, "audio.wav", { type: "audio/wav" });
    const response = await ai.audio.transcriptions.create(
      {
        file,
        model: OPENAI_TRANSCRIBE_MODEL,
      },
      { signal: controller.signal },
    );
    // response is { text: string } for the default 'json' response_format.
    const text =
      typeof (response as { text?: unknown }).text === "string"
        ? (response as { text: string }).text
        : String(response);
    return { text, durationMs };
  } catch (err) {
    // AbortError funnels into VoiceTranscribeTimeoutError. v6 SDK / Node
    // surface the abort as either err.name === "AbortError" or a DOMException
    // whose name is "AbortError"; defensively check both.
    if (
      err instanceof Error &&
      (err.name === "AbortError" ||
        (err as { code?: unknown }).code === "ABORT_ERR")
    ) {
      throw new VoiceTranscribeTimeoutError();
    }
    if (isQuotaError(err)) {
      throw new VoiceTranscribeQuotaError();
    }
    // Re-throw our own typed errors unchanged (a defensive guard in case
    // OpenAI ever wraps an AbortError differently).
    if (
      err instanceof VoiceTranscribeTimeoutError ||
      err instanceof VoiceTranscribeQuotaError ||
      err instanceof VoiceTranscribeProviderDownError
    ) {
      throw err;
    }
    throw new VoiceTranscribeProviderDownError(
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timeout);
  }
}
