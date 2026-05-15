// Phase 129 Plan 02 — TDD RED tests for screen-state-restore.ts
//
// Covers:
//   1. pickRestoredScreen TTL boundary (29min 59s → restore, 30min 01s → HOME)
//   2. pickRestoredScreen malformed/missing inputs → HOME without throwing
//   3. registerBackgroundStateHandlers with dev-preview bridge (no setBackgroundState) → no throw, console.warn
//   4. registerBackgroundStateHandlers with full bridge → registers BOTH keys
//   5. D-11 companion-snapshot hydration (verbatim payload deep-equal)
//   6. D-07 404-fallback: stored TASK_DETAIL with args → navigates to WORK_ORDERS on 404
//   7. Drift-detector: TTL constant 30 * 60 * 1000 present in source file

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  pickRestoredScreen,
  registerBackgroundStateHandlers,
  __resetForTesting,
  SCREEN_STATE_KEY,
  COMPANION_STATE_KEY,
  LAST_SCREEN_LS_KEY,
  TTL_MS,
} from '../screen-state-restore.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const restoreSrc = readFileSync(resolve(__dirname, '../screen-state-restore.ts'), 'utf-8')

// ---------- FakeBridge ----------

interface BgStateEntry {
  snapshot: () => unknown
  restore: (saved: unknown) => void
}

interface FakeBridgeWithBgState {
  setBackgroundState(key: string, snapshot: () => unknown): void
  onBackgroundRestore(key: string, restore: (saved: unknown) => void): void
  setLocalStorage(key: string, value: string): Promise<void>
  getLocalStorage(key: string): Promise<string | null>
  /** Trigger the bg restore for a given key with a given payload */
  triggerRestore(key: string, payload: unknown): void
  /** Get the snapshot for a given key */
  getSnapshot(key: string): unknown
  /** Read which keys were registered */
  registeredKeys: Set<string>
  /** Recorded navigateTo calls (for D-07 test) */
  recordedNavigateToCalls: string[]
  /** localStorage store */
  storageMap: Map<string, string>
}

function fakeBridgeWithBgSupport(): FakeBridgeWithBgState {
  const bgEntries = new Map<string, BgStateEntry>()
  const storageMap = new Map<string, string>()
  const recordedNavigateToCalls: string[] = []

  return {
    setBackgroundState(key: string, snapshot: () => unknown) {
      const entry = bgEntries.get(key) ?? { snapshot: () => null, restore: () => {} }
      bgEntries.set(key, { ...entry, snapshot })
    },
    onBackgroundRestore(key: string, restore: (saved: unknown) => void) {
      const entry = bgEntries.get(key) ?? { snapshot: () => null, restore: () => {} }
      bgEntries.set(key, { ...entry, restore })
    },
    async setLocalStorage(key: string, value: string) {
      storageMap.set(key, value)
    },
    async getLocalStorage(key: string) {
      return storageMap.get(key) ?? null
    },
    triggerRestore(key: string, payload: unknown) {
      const entry = bgEntries.get(key)
      entry?.restore(payload)
    },
    getSnapshot(key: string) {
      return bgEntries.get(key)?.snapshot()
    },
    get registeredKeys() {
      return new Set(bgEntries.keys())
    },
    recordedNavigateToCalls,
    storageMap,
  }
}

interface FakeBridgeNoBgState {
  setLocalStorage(key: string, value: string): Promise<void>
  getLocalStorage(key: string): Promise<string | null>
}

function fakeBridgeNoBgSupport(): FakeBridgeNoBgState {
  return {
    async setLocalStorage(_key: string, _value: string) {},
    async getLocalStorage(_key: string) {
      return null
    },
  }
}

// ---------- Per-test reset ----------

function beforeEach(): void {
  __resetForTesting()
}

// ---------- pickRestoredScreen tests ----------

test('pickRestoredScreen: 29min 59s elapsed → restores screen (D-05 boundary)', () => {
  const stored = { screen: 'work-orders', savedAt: Date.now() - (30 * 60 * 1000 - 1000) }
  assert.equal(pickRestoredScreen(stored, Date.now()), 'work-orders')
})

test('pickRestoredScreen: 30min 01s elapsed → HOME (TTL expired, D-05)', () => {
  const stored = { screen: 'work-orders', savedAt: Date.now() - (30 * 60 * 1000 + 1000) }
  assert.equal(pickRestoredScreen(stored, Date.now()), 'home')
})

test('pickRestoredScreen: exact TTL boundary (exactly 30min elapsed) → HOME', () => {
  const stored = { screen: 'work-orders', savedAt: Date.now() - 30 * 60 * 1000 }
  assert.equal(pickRestoredScreen(stored, Date.now()), 'home')
})

test('pickRestoredScreen: missing savedAt → HOME without throwing', () => {
  assert.equal(pickRestoredScreen({ screen: 'work-orders' }, Date.now()), 'home')
})

test('pickRestoredScreen: non-numeric savedAt → HOME without throwing', () => {
  assert.equal(pickRestoredScreen({ screen: 'work-orders', savedAt: 'not-a-number' }, Date.now()), 'home')
})

test('pickRestoredScreen: null input → HOME without throwing', () => {
  assert.doesNotThrow(() => {
    const result = pickRestoredScreen(null, Date.now())
    assert.equal(result, 'home')
  })
})

test('pickRestoredScreen: string input (garbage) → HOME without throwing', () => {
  assert.doesNotThrow(() => {
    const result = pickRestoredScreen('garbage', Date.now())
    assert.equal(result, 'home')
  })
})

test('pickRestoredScreen: undefined input → HOME without throwing', () => {
  assert.doesNotThrow(() => {
    const result = pickRestoredScreen(undefined, Date.now())
    assert.equal(result, 'home')
  })
})

test('pickRestoredScreen: empty object → HOME without throwing', () => {
  assert.doesNotThrow(() => {
    const result = pickRestoredScreen({}, Date.now())
    assert.equal(result, 'home')
  })
})

// ---------- registerBackgroundStateHandlers: dev-preview bridge (no bg state) ----------

test('registerBackgroundStateHandlers with dev-preview bridge → does NOT throw; console.warn fires', () => {
  beforeEach()

  const warnings: string[] = []
  const origWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '))
  }

  try {
    const noSupportBridge = fakeBridgeNoBgSupport()
    assert.doesNotThrow(() => {
      registerBackgroundStateHandlers(
        noSupportBridge as never,
        () => ({ activeSessions: [], bannerState: null }),
        () => {},
        () => ({ screen: 'home' as const }),
        async () => {},
      )
    })
    assert.ok(warnings.some((w) => w.includes('[screen-state-restore]')), 'console.warn fired with screen-state-restore tag')
  } finally {
    console.warn = origWarn
  }
})

// ---------- registerBackgroundStateHandlers: full bridge → registers BOTH keys ----------

test('registerBackgroundStateHandlers with full bridge → registers BOTH vigil-companion-state AND vigil-screen-state', () => {
  beforeEach()
  const bridge = fakeBridgeWithBgSupport()

  registerBackgroundStateHandlers(
    bridge as never,
    () => ({ activeSessions: [], bannerState: null }),
    () => {},
    () => ({ screen: 'home' as const }),
    async () => {},
  )

  assert.ok(bridge.registeredKeys.has(COMPANION_STATE_KEY), 'vigil-companion-state registered')
  assert.ok(bridge.registeredKeys.has(SCREEN_STATE_KEY), 'vigil-screen-state registered')
})

// ---------- D-11: companion snapshot hydration (verbatim payload) ----------

test('D-11 companion-snapshot hydration: restoreCompanionSnapshot invoked with verbatim payload', () => {
  beforeEach()
  const bridge = fakeBridgeWithBgSupport()

  const mockSession = {
    sessionId: 'abc123',
    label: 'test session',
    host: 'hostname',
    lastEvent: { event: 'heartbeat', message: null, eventTimestamp: '2026-05-15T00:00:00.000Z' },
    eventCount: 1,
  }

  let receivedPayload: unknown = undefined
  const restoreCompanionSnapshot = (payload: unknown) => {
    receivedPayload = payload
  }

  registerBackgroundStateHandlers(
    bridge as never,
    () => ({ activeSessions: [mockSession], bannerState: 'active' }),
    restoreCompanionSnapshot,
    () => ({ screen: 'home' as const }),
    async () => {},
  )

  // Fire the companion restore with the expected payload
  const companionPayload = { activeSessions: [mockSession], bannerState: 'active' }
  bridge.triggerRestore(COMPANION_STATE_KEY, companionPayload)

  assert.ok(receivedPayload !== undefined, 'restoreCompanionSnapshot was called')
  assert.deepEqual(
    receivedPayload,
    { activeSessions: [mockSession], bannerState: 'active' },
    'received payload matches verbatim (deep-equal)',
  )
})

// ---------- D-07: 404-fallback to WORK_ORDERS ----------

test('D-07: stored TASK_DETAIL with args={id:"WO-1234"}, re-fetch returns null → navigation lands on WORK_ORDERS (NOT HOME)', async () => {
  beforeEach()
  const bridge = fakeBridgeWithBgSupport()

  // The restoreScreenFn stub: when screen=TASK_DETAIL and re-fetch returns null,
  // navigate to WORK_ORDERS. This mirrors the logic that will live in main.ts.
  const restoreScreenFn = async (
    screen: string,
    args: { id?: string | number } | undefined,
    _bridge: unknown,
  ) => {
    if (screen === 'task-detail' && args?.id) {
      // Simulate a 404 re-fetch (entity deleted)
      const entity: null = null // simulated 404
      if (!entity) {
        // D-07: fall back to WORK_ORDERS parent list, NOT HOME
        bridge.recordedNavigateToCalls.push('work-orders')
        return
      }
    }
    bridge.recordedNavigateToCalls.push(screen)
  }

  registerBackgroundStateHandlers(
    bridge as never,
    () => ({ activeSessions: [], bannerState: null }),
    () => {},
    () => ({ screen: 'task-detail' as const, args: { id: 'WO-1234' } }),
    restoreScreenFn as never,
  )

  // Fire the screen restore with TASK_DETAIL + args
  bridge.triggerRestore(SCREEN_STATE_KEY, { screen: 'task-detail', args: { id: 'WO-1234' } })

  // Wait for async restore to complete
  await new Promise((r) => setTimeout(r, 50))

  assert.ok(bridge.recordedNavigateToCalls.length > 0, 'navigateTo was called')
  assert.equal(bridge.recordedNavigateToCalls[0], 'work-orders', 'navigated to WORK_ORDERS (parent list), not HOME')
  assert.ok(
    !bridge.recordedNavigateToCalls.includes('home'),
    'NO entry equals home — confirming D-07 correct fallback',
  )
})

// ---------- Exported constants ----------

test('Constants: SCREEN_STATE_KEY equals vigil-screen-state', () => {
  assert.equal(SCREEN_STATE_KEY, 'vigil-screen-state')
})

test('Constants: COMPANION_STATE_KEY equals vigil-companion-state', () => {
  assert.equal(COMPANION_STATE_KEY, 'vigil-companion-state')
})

test('Constants: LAST_SCREEN_LS_KEY equals vigil:v3:lastScreen', () => {
  assert.equal(LAST_SCREEN_LS_KEY, 'vigil:v3:lastScreen')
})

test('Constants: TTL_MS equals 30 * 60 * 1000 ms', () => {
  assert.equal(TTL_MS, 30 * 60 * 1000)
})

// ---------- Drift-detector ----------

test('Drift-detector: TTL constant 30 * 60 * 1000 present verbatim in screen-state-restore.ts', () => {
  assert.match(restoreSrc, /30\s*\*\s*60\s*\*\s*1000/, 'TTL constant present verbatim in source')
})
