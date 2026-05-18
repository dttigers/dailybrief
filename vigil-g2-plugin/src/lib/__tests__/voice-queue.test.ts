// Phase 130 Plan 05 (VOICE-07 / VOICE-08): Wave 0 RED tests for the offline
// voice queue.
//
// 10 tests pin the offline-queue + telemetry contracts:
//   1. enqueue + loadQueue round-trips via localStorage key 'vigil:voice-queue:v1'
//   2. 11th enqueue evicts oldest entry LRU-style + posthog 'voice_queue_evicted' fires
//   3. drainQueue with a fetch mock that resolves 201 removes the entry + decrements queueDepth
//   4. getNextDelayMs returns the exact [1000, 2000, 4000, 8000, 16000, 30000] schedule
//   5. retryCount >= 6 evicts permanently + posthog 'voice_queue_evicted' fires
//   6. 429 DAILY_AI_BUDGET_EXCEEDED evicts permanently + posthog event with reason='daily_budget_cap_hit'
//   7. 504 VOICE_TRANSCRIBE_TIMEOUT increments retryCount + entry remains in queue
//   8. Persistence across reload — clear in-memory state, loadQueue recovers from localStorage
//   9. voice_capture_completed event uses exact safe keys { stop_to_http_ms, chunks, bytes, retry_count, transcript_chars }
//  10. voice_capture_dropout fires on inter-chunk gap > 2× first-5s baseline with { gap_ms, recording_id }
//
// localStorage shim: Node node:test does not provide a DOM. The minimal
// in-memory shim below satisfies the queue's three localStorage methods
// (getItem / setItem / removeItem). posthog is stubbed via a spy array on a
// module-level export so the queue's `posthog.capture(...)` calls land in a
// place tests can inspect.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// ─── In-memory localStorage shim ────────────────────────────────────────────
//
// The queue module reads `localStorage.getItem` / `setItem` / `removeItem` at
// runtime — under Node ESM there is no DOM. Install a minimal shim BEFORE
// the queue module is imported so the queue's first `loadQueue()` (or
// equivalent module-load read) sees an empty store.

interface StorageShim {
  _data: Record<string, string>
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
  clear: () => void
}

const storageShim: StorageShim = {
  _data: {},
  getItem(k) {
    return this._data[k] ?? null
  },
  setItem(k, v) {
    this._data[k] = String(v)
  },
  removeItem(k) {
    delete this._data[k]
  },
  clear() {
    this._data = {}
  },
}

;(globalThis as unknown as { localStorage: StorageShim }).localStorage =
  storageShim

// ─── PostHog spy ────────────────────────────────────────────────────────────
//
// The queue calls `posthog.capture(eventName, props)` for evicted entries and
// successful completions. We import the module's posthog client and inspect
// its spy array. The implementation MUST expose a `__resetPosthogSpy()` and
// `__getPosthogCalls()` test seam (mirrors the audio-session-guard
// __resetForTesting precedent).

import {
  enqueue,
  drainQueue,
  queueDepth,
  loadQueue,
  getNextDelayMs,
  BACKOFF_MS,
  MAX_QUEUE_SIZE,
  QUEUE_KEY,
  __resetQueueForTesting,
  __getPosthogCalls,
  __resetPosthogSpy,
  type QueueEntry,
} from '../voice-queue.ts'

import {
  emitVoiceCaptureCompleted,
  emitVoiceCaptureDropout,
} from '../voice-telemetry.ts'

// ─── Per-test reset ─────────────────────────────────────────────────────────

function beforeEach(): void {
  storageShim.clear()
  __resetQueueForTesting()
  __resetPosthogSpy()
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    clientCaptureId: overrides.clientCaptureId ?? 'cap-1',
    base64Audio: overrides.base64Audio ?? 'dGVzdA==',
    queuedAt: overrides.queuedAt ?? 1_000_000,
    retryCount: overrides.retryCount ?? 0,
  }
}

function jsonResponse(
  status: number,
  body: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('voice-queue Test 1: enqueue + loadQueue round-trips via localStorage', () => {
  beforeEach()
  const entry = makeEntry({ clientCaptureId: 'cap-1', retryCount: 0 })
  enqueue(entry)

  const loaded = loadQueue()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].clientCaptureId, 'cap-1')
  assert.equal(loaded[0].retryCount, 0)

  // localStorage key is the exact 'vigil:voice-queue:v1' literal — pinned for
  // operator-tooling stability (e.g. /v1/admin/voice-queue inspector tool).
  const raw = storageShim.getItem('vigil:voice-queue:v1')
  assert.notEqual(raw, null, 'localStorage key vigil:voice-queue:v1 populated')
  const parsed = JSON.parse(raw!) as QueueEntry[]
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].clientCaptureId, 'cap-1')
})

test('voice-queue Test 2: 11th enqueue evicts oldest entry LRU-style + posthog voice_queue_evicted fires', () => {
  beforeEach()
  // Fill queue to MAX_QUEUE_SIZE (10) with cap-0..cap-9
  for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
    enqueue(makeEntry({ clientCaptureId: `cap-${i}`, queuedAt: 1_000_000 + i }))
  }
  assert.equal(queueDepth(), MAX_QUEUE_SIZE)

  // 11th enqueue should evict cap-0 (oldest, first-in)
  enqueue(makeEntry({ clientCaptureId: 'cap-new', queuedAt: 2_000_000 }))

  const q = loadQueue()
  assert.equal(q.length, MAX_QUEUE_SIZE, 'queue capped at MAX_QUEUE_SIZE = 10')
  // Oldest (cap-0) must be gone; newest (cap-new) must be at the tail
  assert.equal(q[0].clientCaptureId, 'cap-1', 'oldest entry evicted; cap-1 now at head')
  assert.equal(
    q[q.length - 1].clientCaptureId,
    'cap-new',
    'newest entry appended at tail',
  )

  // PostHog spy should have at least one voice_queue_evicted call for cap-0
  const evictionCalls = __getPosthogCalls().filter(
    (c) => c.event === 'voice_queue_evicted',
  )
  assert.ok(
    evictionCalls.length >= 1,
    'at least one voice_queue_evicted PostHog event fired',
  )
  const props = evictionCalls[0].props ?? {}
  assert.equal(
    props.clientCaptureId,
    'cap-0',
    "evicted event's clientCaptureId is the LRU-evicted entry",
  )
  assert.equal(props.retryCount, 0)

  // GUARD-01: the evicted event MUST NOT include the base64Audio payload.
  const propsObj = props as Record<string, unknown>
  assert.equal(
    'base64Audio' in propsObj,
    false,
    'base64Audio MUST NOT appear in posthog event props',
  )
  assert.equal('audio' in propsObj, false)
  assert.equal('audioPcm' in propsObj, false)
})

test('voice-queue Test 3: drainQueue with 201-resolving fetch removes entry + decrements queueDepth', async () => {
  beforeEach()
  enqueue(makeEntry({ clientCaptureId: 'cap-success', retryCount: 0 }))
  assert.equal(queueDepth(), 1)

  const fetchMock: typeof fetch = async () =>
    jsonResponse(201, { thoughtId: 42, content: 'hello' })

  await drainQueue(fetchMock, 'test-api-key')

  assert.equal(queueDepth(), 0, 'queue drained after successful POST')
  assert.equal(loadQueue().length, 0)
})

test('voice-queue Test 4: getNextDelayMs returns exact [1000, 2000, 4000, 8000, 16000, 30000] schedule', () => {
  beforeEach()
  // Phase 124 D-11 verbatim backoff schedule — pinned literal values
  assert.equal(getNextDelayMs(0), 1000, 'retryCount=0 → 1000 ms')
  assert.equal(getNextDelayMs(1), 2000)
  assert.equal(getNextDelayMs(2), 4000)
  assert.equal(getNextDelayMs(3), 8000)
  assert.equal(getNextDelayMs(4), 16000)
  assert.equal(getNextDelayMs(5), 30000)

  // BACKOFF_MS export literal-shape pin
  assert.deepEqual(BACKOFF_MS, [1000, 2000, 4000, 8000, 16000, 30000])
})

test('voice-queue Test 5: retryCount >= 6 evicts permanently + posthog voice_queue_evicted fires', async () => {
  beforeEach()
  // Pre-load an entry past the backoff schedule. The drain loop should detect
  // retryCount >= BACKOFF_MS.length and evict without invoking fetch.
  enqueue(makeEntry({ clientCaptureId: 'cap-exhausted', retryCount: 6 }))
  assert.equal(queueDepth(), 1)

  let fetchCalled = false
  const fetchMock: typeof fetch = async () => {
    fetchCalled = true
    return jsonResponse(201)
  }

  await drainQueue(fetchMock, 'test-api-key')

  assert.equal(queueDepth(), 0, 'exhausted entry evicted')
  assert.equal(fetchCalled, false, 'fetch NOT called for exhausted entry')

  const evictionCalls = __getPosthogCalls().filter(
    (c) => c.event === 'voice_queue_evicted',
  )
  assert.ok(evictionCalls.length >= 1, 'voice_queue_evicted fired for exhausted entry')
  const props = evictionCalls[0].props ?? {}
  assert.equal(props.clientCaptureId, 'cap-exhausted')
})

test('voice-queue Test 6: 429 DAILY_AI_BUDGET_EXCEEDED evicts permanently + posthog reason=daily_budget_cap_hit', async () => {
  beforeEach()
  enqueue(makeEntry({ clientCaptureId: 'cap-budget', retryCount: 0 }))

  const fetchMock: typeof fetch = async () =>
    jsonResponse(429, { code: 'DAILY_AI_BUDGET_EXCEEDED' })

  await drainQueue(fetchMock, 'test-api-key')

  assert.equal(queueDepth(), 0, 'budget-cap entry evicted (D-E3 cascade)')

  const evictionCalls = __getPosthogCalls().filter(
    (c) => c.event === 'voice_queue_evicted',
  )
  assert.ok(
    evictionCalls.length >= 1,
    'voice_queue_evicted fired for budget-cap entry',
  )
  const props = evictionCalls.find(
    (c) => (c.props as Record<string, unknown>)?.reason === 'daily_budget_cap_hit',
  )
  assert.ok(
    props,
    "voice_queue_evicted props include reason='daily_budget_cap_hit' for 429 DAILY_AI_BUDGET_EXCEEDED",
  )
})

test('voice-queue Test 7: 504 VOICE_TRANSCRIBE_TIMEOUT increments retryCount + entry stays in queue', async () => {
  beforeEach()
  enqueue(makeEntry({ clientCaptureId: 'cap-timeout', retryCount: 0 }))

  const fetchMock: typeof fetch = async () =>
    jsonResponse(504, { code: 'VOICE_TRANSCRIBE_TIMEOUT' })

  await drainQueue(fetchMock, 'test-api-key')

  // Transient failure → entry remains; retryCount incremented
  const q = loadQueue()
  assert.equal(q.length, 1, 'transient 504 leaves entry in queue')
  assert.equal(q[0].clientCaptureId, 'cap-timeout')
  assert.equal(q[0].retryCount, 1, 'retryCount incremented after transient failure')

  // No eviction event for transient failures
  const evictionCalls = __getPosthogCalls().filter(
    (c) => c.event === 'voice_queue_evicted',
  )
  assert.equal(
    evictionCalls.length,
    0,
    'voice_queue_evicted NOT fired for transient 504',
  )
})

test('voice-queue Test 8: persistence across reload — loadQueue recovers from localStorage', () => {
  beforeEach()
  enqueue(makeEntry({ clientCaptureId: 'cap-persistent', retryCount: 2 }))

  // Simulate WebView reload — clear ONLY in-memory state, leave localStorage intact
  __resetQueueForTesting()
  // (storageShim untouched here — we want the persisted bytes to remain)

  const recovered = loadQueue()
  assert.equal(recovered.length, 1, 'queue recovered from localStorage after reload')
  assert.equal(recovered[0].clientCaptureId, 'cap-persistent')
  assert.equal(recovered[0].retryCount, 2)
})

test('voice-queue Test 9: voice_capture_completed event uses exact safe-key set', () => {
  beforeEach()
  emitVoiceCaptureCompleted({
    stop_to_http_ms: 1880,
    chunks: 37,
    bytes: 96_000,
    retry_count: 0,
    transcript_chars: 42,
  })

  const calls = __getPosthogCalls().filter(
    (c) => c.event === 'voice_capture_completed',
  )
  assert.equal(calls.length, 1, 'voice_capture_completed fired exactly once')
  const props = calls[0].props ?? {}
  const propKeys = Object.keys(props).sort()
  assert.deepEqual(
    propKeys,
    ['bytes', 'chunks', 'retry_count', 'stop_to_http_ms', 'transcript_chars'],
    'voice_capture_completed props are EXACTLY the safe-key set',
  )

  // GUARD-01: no audioPcm / audio / pcm / audioBuffer / audio_pcm
  const propsObj = props as Record<string, unknown>
  for (const banned of [
    'audio',
    'audioPcm',
    'audio_pcm',
    'pcm',
    'audioBuffer',
    'audio_buffer',
    'base64Audio',
  ]) {
    assert.equal(banned in propsObj, false, `banned key ${banned} MUST NOT appear`)
  }
})

test('voice-queue Test 10: voice_capture_dropout fires with { gap_ms, recording_id } only', () => {
  beforeEach()
  emitVoiceCaptureDropout({ gap_ms: 320, recording_id: 'rec-abc' })

  const calls = __getPosthogCalls().filter(
    (c) => c.event === 'voice_capture_dropout',
  )
  assert.equal(calls.length, 1, 'voice_capture_dropout fired exactly once')
  const props = calls[0].props ?? {}
  const propKeys = Object.keys(props).sort()
  assert.deepEqual(
    propKeys,
    ['gap_ms', 'recording_id'],
    'voice_capture_dropout props are EXACTLY { gap_ms, recording_id }',
  )

  // GUARD-01 banned keys check
  const propsObj = props as Record<string, unknown>
  for (const banned of [
    'audio',
    'audioPcm',
    'audio_pcm',
    'pcm',
    'audioBuffer',
    'base64Audio',
  ]) {
    assert.equal(banned in propsObj, false, `banned key ${banned} MUST NOT appear`)
  }
})

// ─── Constants pin ──────────────────────────────────────────────────────────
// These structural assertions defend against accidental drift in shared
// constants. They sit OUTSIDE numbered tests so a future planner can grep for
// the literal values to confirm the contract is still in place.

test('voice-queue: constants pin (MAX_QUEUE_SIZE, QUEUE_KEY, BACKOFF_MS literals)', () => {
  assert.equal(MAX_QUEUE_SIZE, 10, 'MAX_QUEUE_SIZE === 10 (per VOICE-07)')
  assert.equal(
    QUEUE_KEY,
    'vigil:voice-queue:v1',
    "QUEUE_KEY === 'vigil:voice-queue:v1' (operator-tooling pin)",
  )
  assert.deepEqual(BACKOFF_MS, [1000, 2000, 4000, 8000, 16000, 30000])
})
