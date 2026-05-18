/**
 * Phase 130 Plan 05 (VOICE-08 telemetry): plug-in side PostHog event shim.
 *
 * The G2 plugin runs inside a Headless WebView and historically has not
 * embedded the PostHog browser SDK (the vigil-core server emits backend
 * PostHog events on the user's behalf). Plan 05 needs operator-facing
 * telemetry from the CLIENT side so that latency / drop-out / queue-eviction
 * events are observable independent of whether the POST ever reaches the
 * server. The contract:
 *
 *   - `posthog.capture(event, props)` is the only call shape the queue +
 *     voice screen use.
 *   - Event names are LOCKED to the D-T1 / D-T2 / D-O4 set:
 *         voice_capture_completed     (success path; safe-key set per D-T1)
 *         voice_capture_dropout       (inter-chunk gap > 2× baseline per D-T2)
 *         voice_queue_evicted         (LRU / exhaustion / D-E3 cascade per D-O4)
 *   - Event PROPS use ONLY the safe-key contract (no audio/audioPcm/pcm/
 *     audioBuffer/base64Audio property names — Phase 127 GUARD-01 BLOCKED_PROPERTY_NAMES).
 *
 * Real-runtime transport: until the PostHog browser SDK is added to the
 * plugin (deferred), the shim's runtime impl is a console.log so events are
 * still observable in operator-side Even Hub Console output during UAT. The
 * Plan 06 drift detector source-greps this file for the safe-key invariant.
 *
 * Test seam (mirrors audio-session-guard's `__resetForTesting`): the spy
 * array is exported via `__getPosthogCalls()` / `__resetPosthogSpy()` so
 * tests can inspect emitted events without standing up a network mock.
 */

// ─── Event-prop type contracts (D-T1 + D-T2 + D-O4 — safe-key set only) ─────

/**
 * D-T1 `voice_capture_completed` event props. EXACTLY these keys — anything
 * else is a Plan 06 D-D2 drift-detector regression.
 */
export interface VoiceCaptureCompletedProps {
  stop_to_http_ms: number
  chunks: number
  bytes: number
  retry_count: number
  transcript_chars: number
}

/**
 * D-T2 `voice_capture_dropout` event props. EXACTLY these keys.
 */
export interface VoiceCaptureDropoutProps {
  gap_ms: number
  recording_id: string
}

/**
 * D-O4 `voice_queue_evicted` event props. The `reason` field disambiguates
 * normal LRU / retry-exhaustion eviction from the D-E3 `daily_budget_cap_hit`
 * cascade. The clientCaptureId + retryCount give operator-side context for
 * the dropped capture.
 */
export interface VoiceQueueEvictedProps {
  clientCaptureId: string
  retryCount: number
  reason?: 'lru' | 'retries_exhausted' | 'daily_budget_cap_hit'
}

// ─── Spy array (test seam) ──────────────────────────────────────────────────

interface PosthogCall {
  event: string
  props: Record<string, unknown>
}

let posthogCalls: PosthogCall[] = []

// ─── Public capture entrypoints ─────────────────────────────────────────────

/**
 * Internal capture shim. Routes to the spy array (always) AND to the runtime
 * transport (console.log under WebView; future: PostHog browser SDK).
 *
 * NOTE: this is the ONLY function that should produce a PostHog event. All
 * named emitters below funnel through here so the safe-key invariant has a
 * single chokepoint.
 */
function capture(event: string, props: Record<string, unknown>): void {
  posthogCalls.push({ event, props })
  // Operator-observable in Even Hub Console during UAT. The
  // `[posthog]` prefix lets the operator grep the console output.
  // SAFE KEYS ONLY — never log `body.audio` / `base64Audio` / PCM bytes.
  console.log(`[posthog] ${event}`, props)
}

/**
 * D-T1: emit `voice_capture_completed` with the safe-key set. The function
 * signature is the contract — there is NO escape hatch to add arbitrary
 * keys. Adding a key requires editing this file (and the drift detector
 * source-grep will catch it).
 */
export function emitVoiceCaptureCompleted(
  props: VoiceCaptureCompletedProps,
): void {
  capture('voice_capture_completed', {
    stop_to_http_ms: props.stop_to_http_ms,
    chunks: props.chunks,
    bytes: props.bytes,
    retry_count: props.retry_count,
    transcript_chars: props.transcript_chars,
  })
}

/**
 * D-T2: emit `voice_capture_dropout` with the safe-key set.
 */
export function emitVoiceCaptureDropout(props: VoiceCaptureDropoutProps): void {
  capture('voice_capture_dropout', {
    gap_ms: props.gap_ms,
    recording_id: props.recording_id,
  })
}

/**
 * D-O4: emit `voice_queue_evicted` for LRU eviction / retry exhaustion / D-E3
 * permanent-fail cascade. The `reason` field disambiguates the three.
 */
export function emitVoiceQueueEvicted(props: VoiceQueueEvictedProps): void {
  const payload: Record<string, unknown> = {
    clientCaptureId: props.clientCaptureId,
    retryCount: props.retryCount,
  }
  if (props.reason !== undefined) {
    payload.reason = props.reason
  }
  capture('voice_queue_evicted', payload)
}

// ─── Test seams ─────────────────────────────────────────────────────────────

/**
 * @internal — test-only. Returns the spy array of all captured events in
 * insertion order. Tests inspect this to verify event emission semantics
 * without standing up a network mock.
 */
export function __getPosthogCalls(): readonly PosthogCall[] {
  return posthogCalls
}

/**
 * @internal — test-only. Clears the spy array between tests so each test
 * starts from an empty event log.
 */
export function __resetPosthogSpy(): void {
  posthogCalls = []
}
