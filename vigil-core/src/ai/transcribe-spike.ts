// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is spike-only and MUST be deleted or rewritten before Phase 130 lands.
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
// Phase 130 productionizes under vigil-core/src/ai/transcribe.ts.

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
    // SDK reads OPENAI_API_KEY from env automatically.
    client = new OpenAI();
  }
  return client;
}

/**
 * Transcribe a WAV-encoded Buffer via OpenAI gpt-4o-mini-transcribe.
 *
 * $0.003/min; 500-1500ms expected latency per STACK §1c. Throws when
 * OPENAI_API_KEY is unset (route translates to 502 inline).
 *
 * Cost-tracking note (CONTEXT D-W5 / RESEARCH §7): OpenAI spend is NOT yet
 * wired into the per-call budget-tracking wrapper (which counts Anthropic
 * tokens via callClaude wrappers). The per-user pre-flight requireAiBudget
 * call in voice-spike.ts is the only gate; spike's expected ~12-clip total
 * cost (≈ $0.05) sits well clear of the $0.50/user/day cap. Phase 130
 * productionization adds OpenAI accounting.
 */
export async function transcribeWav(wav: Buffer): Promise<string> {
  const ai = getOpenAIClient();
  if (!ai) {
    throw new Error(
      "OPENAI_API_KEY not configured — /v1/voice/transcribe unavailable",
    );
  }

  const file = await toFile(wav, "voice.wav");
  const response = await ai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
  });
  return response.text;
}
