import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'

/**
 * Phase 127 GUARD-02 (D-02.3 + RESEARCH Pitfall-seven): safeAudioControl wraps
 * the Even SDK `audioControl(on)` call and idempotently registers cleanup
 * hooks on ALL four documented exit paths so the G2 microphone can never
 * be left open after a crash, force-quit, browser unload, or Headless
 * WebView replay. The four hooks are:
 *
 *   - sysEvent `OsEventTypeList.ABNORMAL_EXIT_EVENT` (unexpected disconnect)
 *   - sysEvent `OsEventTypeList.SYSTEM_EXIT_EVENT`   (user-confirmed exit)
 *   - `window.beforeunload` (host WebView teardown)
 *   - `onBackgroundRestore("vigil-audio-guard", …)` after a
 *     `setBackgroundState` snapshot captured `audioActive === true`
 *
 * RESEARCH Pitfall-seven: `setBackgroundState` only snapshots state; it does
 * NOT auto-fire the cleanup callback on replay. The companion
 * `onBackgroundRestore` handler MUST be registered alongside the snapshot
 * registration, and it MUST inspect the restored payload and call
 * `audioControl(false)` defensively when the snapshot reports the mic was
 * open at backgrounding time.
 *
 * RESEARCH §A6 (named-enum lock): The SDK exit-event sentinels are
 * referenced by their `OsEventTypeList` enum members ONLY — bare integer
 * literals would silently break the moment the SDK renumbers the enum.
 * The lock extends to JSDoc + inline comments so a grep for hard-coded
 * enum integers cannot trip on documentation noise.
 *
 * Module-state idempotency (CONTEXT D-02.3): the first true call per
 * process lifetime performs registration; subsequent true calls only
 * update `audioActive`. Without this guard, repeated `safeAudioControl(true)`
 * would attach N listeners and cause O(N) handler invocations on each
 * exit-event fire (T-127-02-D denial-of-service mitigation).
 *
 * Phase 127 ships the helper with ZERO callers — Phase 130 VOICE-02
 * (push-to-record gesture handler) is the first consumer. The
 * `deduped-device-status.ts` precedent documents this "helper-only ship"
 * pattern (Phase 125 G2-POLISH-08 / D-12).
 */

/**
 * Minimal structural interface for the SDK surface this module touches.
 * Locally re-declared (rather than imported from `@evenrealities/even_hub_sdk`)
 * because:
 *   1. It documents EXACTLY which bridge methods the audio-session guard
 *      relies on — small, auditable contract.
 *   2. It makes the dependency-injection test seam typecheck without the
 *      tests having to construct a full `EvenAppBridge` instance.
 *   3. `setBackgroundState` / `onBackgroundRestore` are part of the Even
 *      Hub SDK background-state primitive surface (EVEN-SKILLS.md
 *      §"Background state"); declaring them here keeps the contract
 *      explicit at the call site.
 */
export interface AudioGuardBridge {
  audioControl(isOpen: boolean): Promise<boolean>
  onEvenHubEvent(callback: (event: EvenHubEvent) => void): () => void
  setBackgroundState(key: string, snapshot: () => unknown): void
  onBackgroundRestore(key: string, restore: (saved: unknown) => void): void
}

// Closure-captured module state (mirrors the `deduped-device-status.ts`
// precedent: `let lastSeenConnectType: DeviceConnectType | null = null`).
let audioActive = false
let cleanupRegistered = false

const BG_STATE_KEY = 'vigil-audio-guard'

/**
 * Wraps `bridge.audioControl(on)` with idempotent cleanup-hook registration.
 *
 * @param on       — true opens the mic; false closes it.
 * @param bridge   — dependency-injection seam (default: the SDK singleton at
 *                   the call site). Tests pass a fake bridge satisfying
 *                   `AudioGuardBridge`. Phase 130 VOICE-02 will call this
 *                   with the real `await waitForEvenAppBridge()` result.
 *
 * First true call registers cleanup on all four exit paths. Subsequent
 * calls only update `audioActive` and forward to `bridge.audioControl`.
 */
export async function safeAudioControl(
  on: boolean,
  bridge: AudioGuardBridge,
): Promise<void> {
  if (!cleanupRegistered && on) {
    // Idempotent registration: fires exactly once per process lifetime
    // on the first true call (T-127-02-D mitigation).
    cleanupRegistered = true

    // Hooks 1 + 2: sysEvent ABNORMAL_EXIT_EVENT and SYSTEM_EXIT_EVENT.
    // Named-enum reference per RESEARCH §A6 — never hard-code the integer
    // values. The `event.sysEvent?.eventType` access pattern mirrors
    // `vigil-g2-plugin/src/main.ts:245-258` (the only other
    // `bridge.onEvenHubEvent` registration site in the codebase).
    bridge.onEvenHubEvent((ev) => {
      const t = ev.sysEvent?.eventType
      if (
        t === OsEventTypeList.ABNORMAL_EXIT_EVENT ||
        t === OsEventTypeList.SYSTEM_EXIT_EVENT
      ) {
        if (audioActive) {
          audioActive = false
          // Best-effort mic-close (RESEARCH Pitfall-seven + PATTERNS lock):
          // an SDK-side close failure does not crash the plugin.
          bridge.audioControl(false).catch(() => {})
        }
      }
    })

    // Hook 3: host WebView beforeunload (firing on plugin teardown / page
    // navigation). Guarded for environments without a `window` global
    // (e.g. node:test unit-test contexts that don't polyfill it).
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (audioActive) {
          audioActive = false
          bridge.audioControl(false).catch(() => {})
        }
      })
    }

    // Hook 4: Even SDK background-state snapshot/restore pair. The host
    // snapshots JS state at backgrounding and replays it in a fresh
    // Headless WebView; the restore handler is what actually closes the
    // mic defensively when the snapshot reports it was open.
    //
    // RESEARCH Pitfall-seven lock: snapshot returns a JSON-serializable plain
    // object — NO class instances, Maps, Sets, or Date instances.
    bridge.setBackgroundState(BG_STATE_KEY, () => ({ audioActive }))
    bridge.onBackgroundRestore(BG_STATE_KEY, (saved: unknown) => {
      const s = saved as { audioActive?: boolean }
      if (s.audioActive) {
        bridge.audioControl(false).catch(() => {})
        audioActive = false
      }
    })
  }

  audioActive = on
  await bridge.audioControl(on)
}

/**
 * @internal — test-only helper. Resets the module-scope idempotency flags
 * so each unit test starts from a clean `audioActive=false,
 * cleanupRegistered=false` state without a per-test dynamic import (which
 * would add ~50ms per case). Not part of the public API; Phase 130
 * VOICE-02 MUST NOT call this from production code paths.
 */
export function __resetForTesting(): void {
  audioActive = false
  cleanupRegistered = false
}
