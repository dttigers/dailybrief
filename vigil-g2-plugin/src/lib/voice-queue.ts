/**
 * Phase 130 Plan 05 (VOICE-07): offline voice-capture queue with retry
 * backoff + LRU eviction + permanent-fail semantics + localStorage
 * persistence.
 *
 * Contracts (pinned by `src/lib/__tests__/voice-queue.test.ts`):
 *
 *   - Backoff schedule (Phase 124 D-11 verbatim): [1s, 2s, 4s, 8s, 16s, 30s]
 *     indexed by `retryCount`. Entries with `retryCount >= 6` are evicted
 *     before any further drain attempt — this is the "retries exhausted"
 *     path and emits a `voice_queue_evicted` PostHog event with
 *     `reason: 'retries_exhausted'`.
 *
 *   - Max queue size (VOICE-07 verbatim): 10 entries. On enqueue of an 11th
 *     entry, the OLDEST entry is evicted LRU-style and a `voice_queue_evicted`
 *     event fires with `reason: 'lru'`.
 *
 *   - Permanent failure (D-E3 cascade): HTTP 429 with body code
 *     `DAILY_AI_BUDGET_EXCEEDED` is non-retryable; the entry is evicted
 *     immediately with `reason: 'daily_budget_cap_hit'`.
 *
 *   - Transient failure (D-E1 / D-E2): HTTP 5xx (incl. 504
 *     `VOICE_TRANSCRIBE_TIMEOUT`, 502 `VOICE_TRANSCRIBE_PROVIDER_DOWN`, 503
 *     `VOICE_TRANSCRIBE_QUOTA`) and network errors increment `retryCount`
 *     and leave the entry in the queue for the next drain cycle. If the
 *     incremented `retryCount` reaches `BACKOFF_MS.length` (6), the entry
 *     is evicted as retries-exhausted.
 *
 *   - Persistence (D-O2): the queue is serialized to localStorage under
 *     the key `vigil:voice-queue:v1`. Process death (swipe-kill → reopen)
 *     recovers the queue intact. Storage budget: 10 × ~213 KB base64 ≈ 2.1
 *     MB per user — well under iOS WebView's 5 MB per-origin quota.
 *
 *   - Success (D-T1): on 2xx response, the entry is removed and a
 *     `voice_capture_completed` PostHog event fires with the safe-key set
 *     `{ stop_to_http_ms, chunks, bytes, retry_count, transcript_chars }`.
 *     The `chunks` / `bytes` / `transcript_chars` values are best-effort
 *     here (queued entries do not retain the per-chunk count; bytes is the
 *     base64-decoded approximate WAV length; transcript_chars is taken from
 *     the response body).
 *
 * Security (Phase 127 GUARD-01 + Plan 06 D-D2):
 *   - The base64Audio payload NEVER leaks into a PostHog event.
 *   - The Authorization bearer NEVER lands in a log statement (only the
 *     fetch headers object).
 *   - Per-chunk PCM data NEVER lands in a log statement (the queue does not
 *     have visibility into per-chunk timing — that's voice.ts's job).
 */

import {
  emitVoiceQueueEvicted,
  emitVoiceCaptureCompleted,
  __getPosthogCalls as __telemetryGetPosthogCalls,
  __resetPosthogSpy as __telemetryResetPosthogSpy,
} from './voice-telemetry.ts'

// ─── Constants (pinned by voice-queue.test.ts) ──────────────────────────────

/** localStorage key for queue persistence (D-O2 verbatim — operator tooling pin). */
export const QUEUE_KEY = 'vigil:voice-queue:v1'

/** Max queued utterances per operator (VOICE-07 verbatim). */
export const MAX_QUEUE_SIZE = 10

/**
 * Backoff schedule indexed by `retryCount`. Phase 124 D-11 verbatim values.
 * Position 6 (past the end) signals retries exhausted → permanent eviction.
 */
export const BACKOFF_MS: readonly number[] = [
  1000, 2000, 4000, 8000, 16000, 30000,
]

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QueueEntry {
  clientCaptureId: string
  /** Base64-encoded WAV (44-byte header + raw PCM). ~200 KB per entry. */
  base64Audio: string
  queuedAt: number
  retryCount: number
}

/**
 * Server error-body shape returned by `/v1/voice/transcribe` failures.
 * `code` matches the locked-enum entries at
 * `vigil-pwa/src/lib/api-error-codes.ts` (D-E1).
 */
interface VoiceErrorBody {
  code?: string
  error?: string
  message?: string
}

// ─── Storage helpers ────────────────────────────────────────────────────────

function getStorage(): Storage | null {
  // The plug-in runs inside a Headless WebView in production where
  // `localStorage` is a global. Under Node test contexts, the test shim is
  // installed on `globalThis.localStorage`. Either way, accessing
  // `globalThis.localStorage` is the portable read.
  const candidate = (globalThis as unknown as { localStorage?: Storage })
    .localStorage
  return candidate ?? null
}

/** Read + JSON-parse the queue from localStorage. Empty-array on any failure. */
export function loadQueue(): QueueEntry[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Light shape guard so a corrupted persisted blob doesn't crash drain.
    return parsed.filter(
      (e): e is QueueEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as QueueEntry).clientCaptureId === 'string' &&
        typeof (e as QueueEntry).base64Audio === 'string' &&
        typeof (e as QueueEntry).queuedAt === 'number' &&
        typeof (e as QueueEntry).retryCount === 'number',
    )
  } catch {
    // Corrupted blob — start fresh. Logging the parse error is intentionally
    // omitted: the only contextual info available is the raw blob, which
    // contains base64 audio payloads (GUARD-01 banned in logs).
    return []
  }
}

function saveQueue(q: QueueEntry[]): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    // localStorage quota exceeded or serialization failure. The queue is
    // bounded at MAX_QUEUE_SIZE (10 × ~213 KB = 2.1 MB) — well under iOS
    // WebView's 5 MB per-origin quota — so this should be unreachable in
    // practice. Swallow because there's no operator-visible action.
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Current queue depth (read from localStorage on each call — cheap). */
export function queueDepth(): number {
  return loadQueue().length
}

/**
 * Compute the retry delay for an entry with the given `retryCount`. Reads
 * directly from `BACKOFF_MS`; callers MUST NOT hard-code the schedule.
 *
 * `retryCount` values past the schedule clamp to the last value (30 s) so
 * the drain loop never divides by zero or returns NaN. In practice, entries
 * with `retryCount >= BACKOFF_MS.length` are evicted before this is called.
 */
export function getNextDelayMs(retryCount: number): number {
  if (retryCount < 0) return BACKOFF_MS[0]
  if (retryCount >= BACKOFF_MS.length) {
    return BACKOFF_MS[BACKOFF_MS.length - 1]
  }
  return BACKOFF_MS[retryCount]
}

/**
 * Append `entry` to the queue. If the queue is already at `MAX_QUEUE_SIZE`,
 * the OLDEST entry is evicted LRU-style (per D-O4) and a `voice_queue_evicted`
 * PostHog event fires.
 */
export function enqueue(entry: QueueEntry): void {
  const q = loadQueue()
  while (q.length >= MAX_QUEUE_SIZE) {
    const evicted = q.shift()
    if (evicted) {
      emitVoiceQueueEvicted({
        clientCaptureId: evicted.clientCaptureId,
        retryCount: evicted.retryCount,
        reason: 'lru',
      })
    }
  }
  q.push(entry)
  saveQueue(q)
}

/**
 * Walk the queue in order and attempt to drain each entry. Returns when:
 *   - every entry has been processed (success / evicted / left in place),
 *   - the queue is empty.
 *
 * This function does NOT sleep between entries — the caller (voice screen
 * online-detect retry tick OR background drain timer) is responsible for
 * scheduling cadence using `getNextDelayMs`. The drain loop is a single pass
 * over the persisted queue.
 *
 * Per-entry semantics:
 *   - `retryCount >= BACKOFF_MS.length` → evict (retries exhausted)
 *   - POST returns 2xx → remove from queue + emit voice_capture_completed
 *   - POST returns 429 DAILY_AI_BUDGET_EXCEEDED → evict (D-E3 cascade)
 *   - POST returns 5xx / network error → increment retryCount; if newly past
 *     the schedule, evict; else save the updated entry and leave in queue
 *
 * @param fetcher  — `fetch`-shaped function (DI seam — tests pass a mock).
 * @param apiKey   — bearer token; omitted from Authorization header if empty.
 * @param baseUrl  — base URL for the transcribe endpoint. Defaults to '/v1'
 *                   (production callers pass the BASE_URL from api.ts).
 */
export async function drainQueue(
  fetcher: typeof fetch,
  apiKey: string,
  baseUrl: string = '/v1',
): Promise<void> {
  const q = loadQueue()
  if (q.length === 0) return

  const survivors: QueueEntry[] = []

  for (const entry of q) {
    // Retries-exhausted check FIRST — never POST a past-schedule entry.
    if (entry.retryCount >= BACKOFF_MS.length) {
      emitVoiceQueueEvicted({
        clientCaptureId: entry.clientCaptureId,
        retryCount: entry.retryCount,
        reason: 'retries_exhausted',
      })
      continue
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const stopToHttpStart = Date.now()
    let response: Response | null = null
    let networkError = false
    try {
      response = await fetcher(`${baseUrl}/voice/transcribe`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          audio: entry.base64Audio,
          clientCaptureId: entry.clientCaptureId,
        }),
      })
    } catch {
      // Network error / fetch threw — treat as transient.
      networkError = true
    }
    const stopToHttpMs = Date.now() - stopToHttpStart

    if (!networkError && response && response.ok) {
      // Success — emit telemetry and drop the entry.
      let transcriptChars = 0
      try {
        const body = (await response.clone().json()) as { content?: string }
        transcriptChars = body.content?.length ?? 0
      } catch {
        // Response body unparseable — accept the 2xx and move on with
        // transcript_chars = 0 (best-effort metric, not a load-bearing field).
      }
      emitVoiceCaptureCompleted({
        stop_to_http_ms: stopToHttpMs,
        chunks: 0, // queued entries don't retain per-chunk count
        bytes: approximateWavBytes(entry.base64Audio),
        retry_count: entry.retryCount,
        transcript_chars: transcriptChars,
      })
      continue
    }

    // Failure path — distinguish permanent vs transient
    if (response && response.status === 429) {
      // Permanent — D-E3 daily budget cap
      let body: VoiceErrorBody = {}
      try {
        body = (await response.clone().json()) as VoiceErrorBody
      } catch {
        // Body unparseable — still treat 429 as permanent (the only documented
        // 429 code from /v1/voice/transcribe is DAILY_AI_BUDGET_EXCEEDED).
      }
      if (body.code === 'DAILY_AI_BUDGET_EXCEEDED' || !body.code) {
        emitVoiceQueueEvicted({
          clientCaptureId: entry.clientCaptureId,
          retryCount: entry.retryCount,
          reason: 'daily_budget_cap_hit',
        })
        continue
      }
    }

    // Transient — increment retryCount and decide whether to keep or evict
    const nextRetryCount = entry.retryCount + 1
    if (nextRetryCount >= BACKOFF_MS.length) {
      emitVoiceQueueEvicted({
        clientCaptureId: entry.clientCaptureId,
        retryCount: nextRetryCount,
        reason: 'retries_exhausted',
      })
      continue
    }

    survivors.push({
      ...entry,
      retryCount: nextRetryCount,
    })
  }

  saveQueue(survivors)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Estimate the WAV byte count from a base64 string length. Base64 encodes 3
 * bytes per 4 characters; the result is the approximate decoded size minus
 * the 44-byte WAV header (or 0 if smaller). This is a best-effort metric for
 * `voice_capture_completed.bytes` — not a load-bearing field.
 */
function approximateWavBytes(base64Audio: string): number {
  return Math.max(0, Math.floor((base64Audio.length * 3) / 4))
}

// ─── Test seams ─────────────────────────────────────────────────────────────

/**
 * @internal — test-only. Re-exported posthog spy accessor from
 * voice-telemetry.ts so the queue test file can import everything from one
 * module surface (`../voice-queue.ts`).
 */
export function __getPosthogCalls(): ReturnType<
  typeof __telemetryGetPosthogCalls
> {
  return __telemetryGetPosthogCalls()
}

/** @internal — test-only. Re-exported posthog spy reset. */
export function __resetPosthogSpy(): void {
  __telemetryResetPosthogSpy()
}

/**
 * @internal — test-only. The queue has no in-memory state (every read goes
 * through localStorage), so this is currently a no-op alias of
 * __resetPosthogSpy. Exists for symmetry with audio-session-guard's
 * __resetForTesting + so future caching can plug in here.
 */
export function __resetQueueForTesting(): void {
  // No in-memory state to clear today — localStorage is the source of truth.
  // The test file clears localStorage separately via the shim's `clear()`.
}
