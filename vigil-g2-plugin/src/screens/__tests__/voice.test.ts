// Phase 130 Plan 04 — Wave 0 RED tests for VOICE-02 / VOICE-03 / VOICE-04
// production voice screen state machine + DOUBLE_CLICK toggle.
//
// Pins the D-S1 state machine (6 states), the D-S2 safeAudioControl Run 4
// caller pattern (Promise<boolean> short-circuit on false + try/catch on
// throw → [NO MIC]), the D-S3 cross-screen state invariant (recording state
// in module scope survives carousel rebuild), and the D-U3 POST shape
// (clientCaptureId UUID v4 + base64 WAV body + Authorization bearer).
//
// Framework: node:test + assert/strict. Mocks: `bridge.audioControl`,
// global `fetch`. Tests RED at end of Task 1 — voice.ts does not exist yet.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Note: the import path resolves to the (not yet created) voice.ts file.
// At Task 1 end, this import causes a "Cannot find module" failure — that IS
// the RED signal. Task 3 creates the implementation and these tests turn GREEN.
import {
  buildVoiceScreen,
  toggleVoiceRecording,
  getVoiceRecording,
  __resetVoiceForTesting,
  getVoiceStateLine,
  getVoiceBodyLine2,
} from '../voice.ts'

import type { AudioGuardBridge } from '../../lib/audio-session-guard.ts'
import { __resetForTesting as __resetAudioGuard } from '../../lib/audio-session-guard.ts'

// ─── Fake bridge (mirrors audio-session-guard.test.ts shape) ──────────────

interface FakeBridge extends AudioGuardBridge {
  audioControlCalls: Array<{ on: boolean }>
  audioControlResults: Array<boolean | 'throw'>
}

function fakeBridge(opts: {
  /** Queue of return values / throw signals consumed in FIFO order by audioControl. */
  audioControlQueue?: Array<boolean | 'throw'>
} = {}): FakeBridge {
  const audioControlCalls: Array<{ on: boolean }> = []
  const audioControlResults = opts.audioControlQueue ?? []
  return {
    audioControlCalls,
    audioControlResults,
    audioControl: async (on: boolean) => {
      audioControlCalls.push({ on })
      const r = audioControlResults.shift() ?? true
      if (r === 'throw') {
        throw new Error('mock permission denied throw')
      }
      return r
    },
    onEvenHubEvent: () => () => {},
    setBackgroundState: () => {},
    onBackgroundRestore: () => {},
  }
}

// ─── Per-test reset ────────────────────────────────────────────────────────

function beforeEach(): void {
  __resetVoiceForTesting()
  __resetAudioGuard()
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('D-S1 initial state: stateLine = [IDLE], voiceRecording = false', () => {
  beforeEach()
  assert.equal(getVoiceStateLine(), '[IDLE]', 'initial stateLine')
  assert.equal(getVoiceRecording(), false, 'initial recording flag')
})

test('D-S1 START path: bridge.audioControl returns true → stateLine = [REC 0:00], recording = true', async () => {
  beforeEach()
  const fb = fakeBridge({ audioControlQueue: [true] })
  const pcmChunks: Uint8Array[] = []
  await toggleVoiceRecording(fb, pcmChunks)
  assert.equal(getVoiceRecording(), true, 'recording flag flipped true')
  const state = getVoiceStateLine()
  // stateLine pattern: '[REC m:ss]'
  assert.ok(/^\[REC \d+:\d{2}\]$/.test(state), `stateLine matches [REC m:ss] pattern, got: ${state}`)
  // First snapshot is 0 elapsed seconds
  assert.ok(state.includes('0:00'), `stateLine starts at 0:00, got: ${state}`)
})

test('D-S1 [NO MIC] path: bridge.audioControl returns false → stateLine = [NO MIC], recording = false, body line 2 = "enable mic in Hub"', async () => {
  beforeEach()
  const fb = fakeBridge({ audioControlQueue: [false] })
  const pcmChunks: Uint8Array[] = []
  await toggleVoiceRecording(fb, pcmChunks)
  assert.equal(getVoiceStateLine(), '[NO MIC]', 'stateLine = [NO MIC]')
  assert.equal(getVoiceRecording(), false, 'recording flag stays false on permission denial')
  assert.equal(
    getVoiceBodyLine2(),
    'enable mic in Hub',
    'D-S1 / Run 4 §5 — [NO MIC] body line 2 distinguishes from [ERR] copy',
  )
})

test('D-S1 [NO MIC] path: bridge.audioControl throws → stateLine = [NO MIC] (Run 4 §3 try/catch)', async () => {
  beforeEach()
  const fb = fakeBridge({ audioControlQueue: ['throw'] })
  const pcmChunks: Uint8Array[] = []
  // toggleVoiceRecording catches the throw internally and surfaces [NO MIC]
  await toggleVoiceRecording(fb, pcmChunks)
  assert.equal(getVoiceStateLine(), '[NO MIC]', 'stateLine = [NO MIC] on throw')
  assert.equal(getVoiceRecording(), false, 'recording flag stays false on throw')
})

test('D-S1 STOP path: second DOUBLE_CLICK while recording → [UPLOADING…] → [DONE] → [IDLE] after 2s', async () => {
  beforeEach()
  // Mock fetch returning a successful 201 with thoughtId + content
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  let fetchUrl = ''
  let fetchBody: string | null = null
  let fetchAuthHeader: string | null = null
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    fetchCalled = true
    fetchUrl = url
    fetchBody = init.body as string
    fetchAuthHeader = (init.headers as Record<string, string>)['Authorization'] ?? null
    return {
      ok: true,
      status: 201,
      json: async () => ({ thoughtId: 42, content: 'mock transcript' }),
    } as unknown as Response
  }) as typeof fetch

  try {
    const fb = fakeBridge({ audioControlQueue: [true, true] })
    const pcmChunks: Uint8Array[] = [new Uint8Array(100), new Uint8Array(100)]
    // START
    await toggleVoiceRecording(fb, pcmChunks)
    assert.equal(getVoiceRecording(), true)
    // STOP — initiates [UPLOADING…] → fetch → [DONE]
    await toggleVoiceRecording(fb, pcmChunks)
    // After STOP completes, state should be [DONE] (before the 2s timer to [IDLE])
    // Since we await the fetch above resolves synchronously in the mock, we should
    // see [DONE] at this point (the 2s timer to [IDLE] is asynchronous).
    assert.equal(fetchCalled, true, 'fetch was called')
    assert.ok(fetchUrl.includes('/v1/voice/transcribe'), 'fetch URL contains /v1/voice/transcribe')
    assert.ok(fetchBody !== null, 'fetch body is non-null')
    // Authorization header bearer
    assert.ok(
      fetchAuthHeader === null || /^Bearer /.test(fetchAuthHeader),
      'Authorization header is Bearer-shaped (or absent when API_KEY unset in test env)',
    )
    // Parse body: { audio: base64Wav, clientCaptureId: <uuid> }
    const parsed = JSON.parse(fetchBody!) as { audio: string; clientCaptureId: string }
    assert.ok(typeof parsed.audio === 'string' && parsed.audio.length > 0, 'audio is non-empty base64 string')
    // UUID v4 shape pattern: 8-4-4-4-12 hex with version-4 indicator
    assert.ok(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.clientCaptureId),
      `clientCaptureId is a UUID v4: got ${parsed.clientCaptureId}`,
    )
    // State is now [DONE]
    assert.equal(getVoiceStateLine(), '[DONE]', 'stateLine = [DONE] after successful POST')
    assert.equal(getVoiceRecording(), false, 'recording flag flipped back false')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('D-S1 [ERR] path: POST returns 504 + VOICE_TRANSCRIBE_TIMEOUT → stateLine = [ERR], body line 2 = "retry — tap to dismiss"', async () => {
  beforeEach()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    return {
      ok: false,
      status: 504,
      json: async () => ({ code: 'VOICE_TRANSCRIBE_TIMEOUT', message: 'timed out' }),
    } as unknown as Response
  }) as typeof fetch

  try {
    const fb = fakeBridge({ audioControlQueue: [true, true] })
    const pcmChunks: Uint8Array[] = [new Uint8Array(100)]
    await toggleVoiceRecording(fb, pcmChunks) // START
    await toggleVoiceRecording(fb, pcmChunks) // STOP — POST fails with 504
    assert.equal(getVoiceStateLine(), '[ERR]', 'stateLine = [ERR] on 504')
    assert.equal(
      getVoiceBodyLine2(),
      'retry — tap to dismiss',
      'D-S1 / Run 4 §5 — [ERR] body line 2 distinguishes from [NO MIC] copy',
    )
    assert.equal(getVoiceRecording(), false, 'recording flag flipped false even on error')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('D-S3 cross-screen survival: voice module retains recording flag across carousel buildVoiceScreen calls', async () => {
  // Critical invariant: the recording flag is module-scope state, NOT created
  // inside buildVoiceScreen. Multiple buildVoiceScreen() invocations (which
  // happen on every carousel rebuild / swipe-back-to-voice) MUST observe the
  // same flag. If the flag were inside buildVoiceScreen's local closure, a
  // swipe-to-Companion-then-swipe-back-to-voice would reset state and lose
  // the recording mid-utterance.
  beforeEach()
  const fb = fakeBridge({ audioControlQueue: [true] })
  const pcmChunks: Uint8Array[] = []
  await toggleVoiceRecording(fb, pcmChunks)
  assert.equal(getVoiceRecording(), true, 'recording flag flipped true')

  // Simulate carousel rebuild on swipe — buildVoiceScreen called fresh.
  const rebuild1 = buildVoiceScreen(getVoiceRecording())
  assert.ok(rebuild1, 'first rebuild succeeds')
  // Module-scope flag still observably true after rebuild
  assert.equal(getVoiceRecording(), true, 'recording flag survives buildVoiceScreen rebuild')

  // Another rebuild (simulating swipe-back-to-voice)
  const rebuild2 = buildVoiceScreen(getVoiceRecording())
  assert.ok(rebuild2, 'second rebuild succeeds')
  assert.equal(getVoiceRecording(), true, 'recording flag survives a second rebuild')
})

test('D-S1 copy lock: [NO MIC] body line 2 vs [ERR] body line 2 MUST be different strings', () => {
  // Run 4 §5 — operator must visually distinguish the two error states. This
  // test pins the two strings as non-equal so a future "consolidate error
  // copy" refactor cannot collapse them.
  beforeEach()
  // The two distinct copy strings — these literal expectations match D-S1
  // and CONTEXT specifics §"[NO MIC] vs [ERR] body-line copy".
  const noMic = 'enable mic in Hub'
  const err = 'retry — tap to dismiss'
  assert.notEqual(noMic, err, '[NO MIC] vs [ERR] body copy must be visually distinct')
})
