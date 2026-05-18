// Phase 127 Plan 04 — GREEN tests for GUARD-02 safeAudioControl cleanup wrapper.
//
// Six cases per PATTERNS section "vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts":
//   1. ABNORMAL_EXIT_EVENT → audioControl(false) fires
//   2. SYSTEM_EXIT_EVENT → audioControl(false) fires
//   3. window beforeunload → audioControl(false) fires
//   4. onBackgroundRestore with audioActive=true snapshot → audioControl(false) fires
//   5. Idempotency: safeAudioControl(true) twice registers onEvenHubEvent ONCE
//   6. No-op when audioActive=false: ABNORMAL_EXIT_EVENT does not fire audioControl(false)
//
// Module-state reset between cases via __resetForTesting — avoids per-test
// dynamic re-import (~50ms each, per Plan 04 action note).
//
// window polyfill: minimal addEventListener / dispatchEvent shim attached to
// globalThis before the safeAudioControl `if (typeof window !== "undefined")`
// branch is exercised. The polyfill lives at module top so each test sees the
// same global; per-test reset via the shim's `__resetListeners()` helper.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import {
  safeAudioControl,
  __resetForTesting,
  type AudioGuardBridge,
} from '../audio-session-guard.ts'

// ---------- Window polyfill (minimal — only the surface safeAudioControl touches) ----------

type WindowListener = (...args: unknown[]) => void

interface MinimalWindow {
  addEventListener: (type: string, listener: WindowListener) => void
  dispatchEvent: (event: { type: string }) => boolean
  __resetListeners: () => void
}

function installWindowPolyfill(): MinimalWindow {
  let listeners: Map<string, WindowListener[]> = new Map()
  const win: MinimalWindow = {
    addEventListener: (type: string, listener: WindowListener) => {
      const arr = listeners.get(type) ?? []
      arr.push(listener)
      listeners.set(type, arr)
    },
    dispatchEvent: (event: { type: string }) => {
      const arr = listeners.get(event.type) ?? []
      for (const l of arr) l(event)
      return true
    },
    __resetListeners: () => {
      listeners = new Map()
    },
  }
  ;(globalThis as unknown as { window: MinimalWindow }).window = win
  return win
}

const windowPolyfill = installWindowPolyfill()

// ---------- Fake bridge (PATTERNS lock — six-test shape) ----------

interface FakeBridge extends AudioGuardBridge {
  /** Recorded audioControl() invocations in order. */
  calls: Array<{ on: boolean }>
  /** onEvenHubEvent handler-registration count (idempotency assertion). */
  handlerCount: number
  /** Synchronously fire a fake EvenHubEvent to the registered handler. */
  fire: (ev: Partial<EvenHubEvent>) => void
  /** Read the current setBackgroundState snapshot. */
  snapshot: () => unknown
  /** Synchronously invoke the registered onBackgroundRestore handler. */
  restore: (saved: unknown) => void
}

interface FakeBridgeOptions {
  /** Override audioControl return value. Defaults to `true`. If a function,
   *  invoked per-call with the `on` argument (lets tests return true on (false,)
   *  closes and false on (true,) opens to simulate the "mic permission denied"
   *  path). If a thrown value, the audioControl Promise rejects with it. */
  audioControlResult?: boolean | ((on: boolean) => boolean | Promise<boolean>)
  /** If set, audioControl rejects with this value on every call. */
  audioControlThrow?: unknown
}

function fakeBridge(opts: FakeBridgeOptions = {}): FakeBridge {
  const calls: Array<{ on: boolean }> = []
  let handler: ((ev: EvenHubEvent) => void) | null = null
  let handlerCount = 0
  let bgStateSnapshot: (() => unknown) | null = null
  let bgRestoreHandler: ((saved: unknown) => void) | null = null
  return {
    calls,
    get handlerCount() {
      return handlerCount
    },
    audioControl: async (on: boolean) => {
      calls.push({ on })
      if (opts.audioControlThrow !== undefined) {
        throw opts.audioControlThrow
      }
      const result = opts.audioControlResult
      if (typeof result === 'function') {
        return await result(on)
      }
      return result ?? true
    },
    onEvenHubEvent: (h: (ev: EvenHubEvent) => void) => {
      handler = h
      handlerCount++
      return () => {
        handler = null
      }
    },
    setBackgroundState: (_key: string, fn: () => unknown) => {
      bgStateSnapshot = fn
    },
    onBackgroundRestore: (_key: string, fn: (saved: unknown) => void) => {
      bgRestoreHandler = fn
    },
    fire: (ev: Partial<EvenHubEvent>) => {
      handler?.(ev as EvenHubEvent)
    },
    snapshot: () => bgStateSnapshot?.(),
    restore: (saved: unknown) => {
      bgRestoreHandler?.(saved)
    },
  }
}

// ---------- Per-test reset ----------

function beforeEach(): void {
  __resetForTesting()
  windowPolyfill.__resetListeners()
}

// ---------- Tests ----------

test('safeAudioControl(true) + ABNORMAL_EXIT_EVENT fires audioControl(false)', async () => {
  beforeEach()
  const fb = fakeBridge()
  await safeAudioControl(true, fb)
  assert.deepEqual(fb.calls, [{ on: true }])

  fb.fire({ sysEvent: { eventType: OsEventTypeList.ABNORMAL_EXIT_EVENT } })
  assert.deepEqual(fb.calls, [{ on: true }, { on: false }])
})

test('safeAudioControl(true) + SYSTEM_EXIT_EVENT fires audioControl(false)', async () => {
  beforeEach()
  const fb = fakeBridge()
  await safeAudioControl(true, fb)

  fb.fire({ sysEvent: { eventType: OsEventTypeList.SYSTEM_EXIT_EVENT } })
  assert.deepEqual(fb.calls, [{ on: true }, { on: false }])
})

test('safeAudioControl(true) + window beforeunload fires audioControl(false)', async () => {
  beforeEach()
  const fb = fakeBridge()
  await safeAudioControl(true, fb)

  windowPolyfill.dispatchEvent({ type: 'beforeunload' })
  // .catch(() => {}) is synchronous-enough; the push to calls happens before
  // the Promise even resolves (audioControl.calls.push runs synchronously
  // inside the async fn body before the first await).
  assert.deepEqual(fb.calls, [{ on: true }, { on: false }])
})

test('onBackgroundRestore with audioActive=true snapshot fires audioControl(false)', async () => {
  beforeEach()
  const fb = fakeBridge()
  await safeAudioControl(true, fb)

  // Confirm the snapshot reports audioActive=true (the load-bearing precondition).
  const snap = fb.snapshot() as { audioActive: boolean }
  assert.equal(snap.audioActive, true)

  // Replay path: a fresh Headless WebView re-invokes the restore handler
  // with the captured snapshot. Cleanup MUST fire defensively.
  fb.restore({ audioActive: true })
  assert.deepEqual(fb.calls, [{ on: true }, { on: false }])
})

test('idempotent registration: safeAudioControl(true) twice registers onEvenHubEvent only once', async () => {
  beforeEach()
  const fb = fakeBridge()
  await safeAudioControl(true, fb)
  await safeAudioControl(true, fb)
  assert.equal(fb.handlerCount, 1)
  // audioControl(true) IS called both times — only the listener registration
  // is idempotent, not the underlying SDK call.
  assert.deepEqual(fb.calls, [{ on: true }, { on: true }])
})

test('cleanup is no-op when audioActive=false: ABNORMAL_EXIT_EVENT does not fire audioControl(false)', async () => {
  // Subtle setup (Plan 04 action note): calling safeAudioControl(false) FIRST
  // means cleanupRegistered stays false (registration only happens on first
  // true call). So the onEvenHubEvent handler is never even registered, and
  // firing the exit event is a structural no-op. This is the intended
  // behavior — there's no mic to close.
  beforeEach()
  const fb = fakeBridge()
  await safeAudioControl(false, fb)
  assert.deepEqual(fb.calls, [{ on: false }])

  fb.fire({ sysEvent: { eventType: OsEventTypeList.ABNORMAL_EXIT_EVENT } })
  // No additional call — audioControl(false) NOT re-invoked.
  assert.deepEqual(fb.calls, [{ on: false }])
})

// ─── Phase 130 Plan 04 Wave 0 RED tests — Run 4 hardening: Promise<boolean> ───

test('Run 4 §1: safeAudioControl(true) returns true when bridge.audioControl resolves true', async () => {
  beforeEach()
  const fb = fakeBridge({ audioControlResult: true })
  const result = await safeAudioControl(true, fb)
  assert.equal(typeof result, 'boolean', 'return value is a boolean (not undefined)')
  assert.equal(result, true, 'returns true when SDK acks mic open')
})

test('Run 4 §2: safeAudioControl(true) returns false when bridge.audioControl resolves false', async () => {
  // Permission-denied path — SDK reports the mic was NOT opened. Caller MUST
  // be able to observe this denial and short-circuit to [NO MIC] UI state.
  // The internal `audioActive` flag remains true-flipped (state-machine
  // consistency with the existing cleanup hooks — those still need to know
  // the caller INTENDED to open), but the caller observes false.
  beforeEach()
  const fb = fakeBridge({ audioControlResult: false })
  const result = await safeAudioControl(true, fb)
  assert.equal(typeof result, 'boolean', 'return value is a boolean (not undefined)')
  assert.equal(result, false, 'returns false when SDK denies mic open')
})

test('Run 4 §3: safeAudioControl(false) returns true when bridge.audioControl(false) resolves true', async () => {
  // STOP path — SDK acks mic close. Caller observes the SDK ack value.
  beforeEach()
  const fb = fakeBridge({ audioControlResult: true })
  // First open the mic so cleanup registration fires (closing without
  // having opened is a no-op path).
  await safeAudioControl(true, fb)
  // Now close it
  const result = await safeAudioControl(false, fb)
  assert.equal(typeof result, 'boolean', 'return value is a boolean')
  assert.equal(result, true, 'returns true (SDK ack of close)')
})

test('Run 4 §4: safeAudioControl signature resolves to a boolean (Promise<boolean>, never undefined)', async () => {
  // Type-shape assertion: under the OLD Promise<void> signature, `await
  // safeAudioControl(...)` resolved to undefined. Under the NEW Promise<boolean>
  // signature it resolves to a boolean. This test pins the signature change
  // structurally — if a future refactor reverts to Promise<void> (e.g.,
  // `return undefined as any`), this assertion fails.
  beforeEach()
  const fb = fakeBridge({ audioControlResult: true })
  const result: boolean = await safeAudioControl(true, fb)
  assert.notEqual(result, undefined, 'result MUST NOT be undefined')
  assert.equal(typeof result, 'boolean', 'result MUST be a boolean')
})
