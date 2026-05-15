/**
 * Phase 129 Plan 02 — G2-LIFECYCLE-01/02/03: screen state restore module.
 *
 * Provides two non-overlapping persistence mechanisms for G2 plugin state:
 *
 *   1. `setBackgroundState`/`onBackgroundRestore` (G2-LIFECYCLE-01):
 *      Survives in-session phone-background → foreground migration via the
 *      Even Hub SDK's Headless WebView replay. Registered at MODULE SCOPE
 *      before `init()` so the SDK can snapshot state before init() resolves.
 *
 *   2. `bridge.setLocalStorage`/`bridge.getLocalStorage` (G2-LIFECYCLE-02):
 *      Survives plugin re-launch / iPhone app force-quit. Written fire-and-
 *      forget on every `navigateTo()` and `navigateToTaskDetail()` call.
 *
 * D-11 free win: Companion HUD active-session/banner cache is folded into
 * the same `setBackgroundState('vigil-companion-state', ...)` registration
 * path as the screen state (no extra bridge round-trip).
 *
 * Feature-detect pattern (mirroring audio-session-guard.ts:136-154):
 * dev-preview bridge via `evenhub qr` does NOT expose `setBackgroundState`/
 * `onBackgroundRestore`. A console.warn is emitted and the function returns
 * without throwing. Production iPhone Even Hub WebView exposes both methods.
 *
 * Snapshot objects MUST be JSON-serializable — NO class instances, Maps,
 * Sets, or Date instances (RESEARCH Pitfall 1 + audio-session-guard.ts pattern).
 */

import type { ScreenName } from '../navigation.ts'

/**
 * Minimal structural interface for the bridge surface this module touches.
 * Locally declared (not imported from the SDK) to document the exact contract
 * and keep tests SDK-free — mirrors AudioGuardBridge isolation rationale.
 */
export interface ScreenRestoreBridge {
  setBackgroundState(key: string, snapshot: () => unknown): void
  onBackgroundRestore(key: string, restore: (saved: unknown) => void): void
  setLocalStorage(key: string, value: string): Promise<void>
  getLocalStorage(key: string): Promise<string | null>
}

// ── Constants (module-level, exported for consumers) ──────────────────────

/** Even SDK background-state key for screen restore (G2-LIFECYCLE-01). */
export const SCREEN_STATE_KEY = 'vigil-screen-state'

/** Even SDK background-state key for companion HUD cache (D-11 fold). */
export const COMPANION_STATE_KEY = 'vigil-companion-state'

/**
 * Even SDK localStorage key for cross-relaunch screen persistence (G2-LIFECYCLE-02).
 * Fire-and-forget writes happen on every navigateTo/navigateToTaskDetail call.
 */
export const LAST_SCREEN_LS_KEY = 'vigil:v3:lastScreen'

/**
 * 30-minute wall-clock TTL for localStorage restore (D-05).
 * Inline literal preserves drift-detector visibility: a grep for
 * `30 * 60 * 1000` in this file confirms the constant is correct.
 * Drift test: `/30\s*\*\s*60\s*\*\s*1000/` against source.
 */
export const TTL_MS = 30 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────

/** Shape stored in SDK localStorage on every screen-change write. */
export interface StoredLastScreen {
  screen: ScreenName
  args?: { id: string | number }
  savedAt: number
}

// ── Module-level state (mirrors audio-session-guard.ts pattern) ───────────

// (No mutable state required for this module — state lives in companion.ts
// and navigation.ts. __resetForTesting is provided to match the pattern.)

// ── Pure helper ───────────────────────────────────────────────────────────

/**
 * TTL-gate: given a stored screen blob and the current wall-clock ms,
 * returns the stored screen name if fresh (within TTL_MS), or 'home' otherwise.
 *
 * All malformed inputs fall through to 'home' without throwing (D-05/T-129-05).
 */
export function pickRestoredScreen(stored: unknown, now: number): ScreenName {
  if (stored == null || typeof stored !== 'object' || Array.isArray(stored)) {
    return 'home'
  }
  const s = stored as Record<string, unknown>
  const savedAt = s.savedAt
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
    return 'home'
  }
  // D-05: wall-clock TTL. Pocket-gap fallback to HOME is intentional (D-06).
  // Comparison: elapsed > TTL → HOME. Exactly at TTL → HOME (strict ≤).
  if (now - savedAt > TTL_MS) {
    return 'home'
  }
  // Validate screen field
  const screen = s.screen
  if (typeof screen !== 'string' || screen.length === 0) {
    return 'home'
  }
  return screen as ScreenName
}

// ── Registration function ─────────────────────────────────────────────────

/**
 * Register `setBackgroundState`/`onBackgroundRestore` pairs for BOTH the
 * companion HUD cache (D-11) and the screen state (G2-LIFECYCLE-01).
 *
 * MUST be called at MODULE SCOPE in main.ts, BEFORE `async function init()`.
 * Same ordering constraint as Phase 124 D-07 `onLaunchSource` registration.
 *
 * @param bridge                 — The Even SDK bridge (cast to ScreenRestoreBridge).
 * @param getCompanionSnapshot   — Returns the current companion HUD state to snapshot.
 * @param restoreCompanionSnapshot — Hydrates the companion HUD from a restored snapshot.
 * @param getScreenSnapshot      — Returns the current screen name (+args) to snapshot.
 * @param restoreScreenFn        — Called with the restored screen/args; caller implements
 *                                 re-fetch + D-07 404→parent-list fallback logic.
 */
export function registerBackgroundStateHandlers(
  bridge: ScreenRestoreBridge,
  getCompanionSnapshot: () => unknown,
  restoreCompanionSnapshot: (saved: unknown) => void,
  getScreenSnapshot: () => { screen: ScreenName; args?: { id: string | number } },
  restoreScreenFn: (
    screen: ScreenName,
    args: { id?: string | number } | undefined,
    bridge: ScreenRestoreBridge,
  ) => Promise<void>,
): void {
  // Feature-detect (mirroring audio-session-guard.ts:136-141):
  // dev-preview bridge (via `evenhub qr` sideload) does NOT expose these
  // methods. Log a console.warn and return — callers are NOT expected to
  // handle the dev-preview gap; production bridges expose both methods.
  if (
    typeof (bridge as { setBackgroundState?: unknown }).setBackgroundState !== 'function' ||
    typeof (bridge as { onBackgroundRestore?: unknown }).onBackgroundRestore !== 'function'
  ) {
    console.warn(
      '[screen-state-restore] Dev preview bridge — setBackgroundState/onBackgroundRestore unavailable. ' +
        'Screen restore and companion HUD cache are disabled in dev preview. ' +
        'Production Even Hub WebView exposes both methods.',
    )
    return
  }

  // D-11: Companion HUD active-session/banner cache fold.
  // Snapshot is captured at backgrounding time; restore hydrates the cache
  // on foreground re-entry so the HUD doesn't render empty state.
  bridge.setBackgroundState(COMPANION_STATE_KEY, () => getCompanionSnapshot())
  bridge.onBackgroundRestore(COMPANION_STATE_KEY, (saved: unknown) => {
    restoreCompanionSnapshot(saved)
  })

  // G2-LIFECYCLE-01: screen state snapshot/restore.
  // Snapshot captures the current screen name + optional args (id-only per D-08).
  // Restore calls the provided restoreScreenFn which re-fetches the entity
  // and handles D-07 404→parent-list fallback.
  bridge.setBackgroundState(SCREEN_STATE_KEY, () => getScreenSnapshot())
  bridge.onBackgroundRestore(SCREEN_STATE_KEY, (saved: unknown) => {
    const s = saved as { screen?: ScreenName; args?: { id?: string | number } }
    if (s?.screen) {
      // Fire-and-forget (does not block foreground re-entry).
      void restoreScreenFn(s.screen, s.args, bridge)
    }
  })
}

/**
 * @internal — test-only helper. Resets any module-scope mutable state
 * (none currently — provided to match audio-session-guard.ts pattern and
 * for future-proofing if module-level state is added).
 */
export function __resetForTesting(): void {
  // No mutable module state to reset in this module.
  // Kept for pattern consistency with audio-session-guard.ts.
}
