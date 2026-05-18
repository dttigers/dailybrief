// ── Phase 130 Plan 02 (VOICE-06 D-E1) — locked-enum voice transcribe errors ──
//
// Three throw-based error classes that funnel through app.onError (vigil-core/
// src/index.ts) into HTTP responses with locked-enum codes:
//
//   VoiceTranscribeTimeoutError      → HTTP 504 + code VOICE_TRANSCRIBE_TIMEOUT
//   VoiceTranscribeProviderDownError → HTTP 502 + code VOICE_TRANSCRIBE_PROVIDER_DOWN
//   VoiceTranscribeQuotaError        → HTTP 503 + code VOICE_TRANSCRIBE_QUOTA
//
// Shape mirrors DailyBudgetExceededError (lib/ai-budget.ts:99-110) and
// AudioSessionTooLongError (lib/audio-cap.ts:50-59):
//   - readonly code = "<LITERAL>" as const — matches PWA ERROR_CODE_MAP key.
//   - name = "<ClassName>" — preserves `instanceof` across module boundaries
//     (Plan 03 PWA-side enums + Plan 02 app.onError translation table both
//     rely on `instanceof` and on .name as a belt-and-braces fallback).
//   - extends Error — Hono's app.onError receives them via the standard
//     thrown-error path.
//
// Locked literals (D-E1, cannot be abbreviated):
//   VOICE_TRANSCRIBE_TIMEOUT      — OpenAI request exceeded server-side 30s
//                                   AbortController signal. Returned to G2
//                                   plugin which evicts the queued entry and
//                                   surfaces [ERR].
//   VOICE_TRANSCRIBE_PROVIDER_DOWN — OpenAI returned 5xx / refused connection /
//                                   network error. Plugin retries via offline
//                                   queue (Plan 05).
//   VOICE_TRANSCRIBE_QUOTA         — OpenAI org-level quota exhausted (distinct
//                                   from per-user DAILY_AI_BUDGET_EXCEEDED).
//                                   Plugin evicts queue entry (no point
//                                   retrying — quota is org-wide).

export class VoiceTranscribeTimeoutError extends Error {
  public readonly code = "VOICE_TRANSCRIBE_TIMEOUT" as const;

  constructor(message: string = "OpenAI transcription timed out after 30s") {
    super(message);
    this.name = "VoiceTranscribeTimeoutError";
  }
}

export class VoiceTranscribeProviderDownError extends Error {
  public readonly code = "VOICE_TRANSCRIBE_PROVIDER_DOWN" as const;

  constructor(
    message: string = "OpenAI transcription provider unavailable",
  ) {
    super(message);
    this.name = "VoiceTranscribeProviderDownError";
  }
}

export class VoiceTranscribeQuotaError extends Error {
  public readonly code = "VOICE_TRANSCRIBE_QUOTA" as const;

  constructor(message: string = "OpenAI transcription quota exhausted") {
    super(message);
    this.name = "VoiceTranscribeQuotaError";
  }
}
