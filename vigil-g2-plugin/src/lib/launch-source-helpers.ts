/**
 * Phase 124 Plan 08 — launch-source helpers (extracted from main.ts).
 *
 * Why this file exists separately from main.ts:
 *   - main.ts has top-level side effects from the Even Hub SDK
 *     (`EvenAppBridge.getInstance()` + `bridge.onLaunchSource(...)`) that
 *     ONLY work inside a WKWebView host environment.
 *   - Unit tests run under `node:test` (no WebView, no `window`).
 *   - Importing from main.ts would execute the SDK side effects and crash.
 *   - These helpers are pure (no SDK imports) — testable from `node:test`
 *     by importing this file directly.
 *   - main.ts re-exports them via `export { hasActiveSession, pickInitialScreen }
 *     from './lib/launch-source-helpers.ts'` so the helpers' canonical
 *     home (per the plan) is still main.ts from the consumer's POV.
 *
 * D-06 (active-session filter): a session counts as "active" iff its
 * `lastEvent.eventTimestamp` is within the last 5 minutes AND the event
 * is not in the terminal set `['task_complete', 'task_failed']`.
 *
 * D-06 (landing screen): on `glassesMenu`, fetch agent sessions and land
 * on Companion if any are active; else Home. On `appMenu`, always Home.
 */

import type { LaunchSource } from '@evenrealities/even_hub_sdk'
import type { AgentSessionRow } from '../types.ts'
import { pickRestoredScreen, LAST_SCREEN_LS_KEY } from './screen-state-restore.ts'
// Screen names imported as TYPES only — the runtime `Screen` const object
// from navigation.ts pulls in api.ts which depends on `import.meta.env`
// (Vite-only). `node:test` runs without Vite, so the runtime cascade
// crashes. Type-only imports are erased at compile time → no runtime
// dependency on navigation.ts → helpers stay pure for unit tests.
//
// String literals below are kept in sync with navigation.ts Screen const
// values: Screen.HOME === 'home', Screen.COMPANION === 'companion'.
// Plan 07's W-6 drift detector + Plan 08's drift detector lock these
// values in their respective source files.
import type { ScreenName } from '../navigation.ts'

const HOME: ScreenName = 'home'
const COMPANION: ScreenName = 'companion'

/**
 * D-06 active-session window + terminal set. Exported so companion.ts
 * (cycle-list filter) and main.ts (landing-screen routing) share one source.
 */
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000
const TERMINAL_EVENTS = new Set(['task_complete', 'task_failed'])
// Cycle-list filter is looser than landing-routing filter: we still want
// task_failed sessions visible so the banner overlay can show and the user
// can ack via DOUBLE_CLICK (CONTEXT D-08). Only task_complete is hidden
// from cycle (it auto-clears via 3s toast and there's nothing to ack).
const CYCLE_HIDDEN_EVENTS = new Set(['task_complete'])

/**
 * D-06 per-row active-session predicate (LANDING-SCREEN ROUTING). A session
 * is "active" iff its `lastEvent.eventTimestamp` is within the last 5
 * minutes AND the event is not in the terminal set.
 *
 * Used by `hasActiveSession` and `pickInitialScreen` for the strict
 * "should we land on Companion?" decision — a 4-minute-old task_failed
 * shouldn't trigger a glassesMenu landing on Companion (D-06).
 */
export function isSessionActive(
  session: AgentSessionRow,
  now: number = Date.now(),
): boolean {
  const ts = new Date(session.lastEvent.eventTimestamp).getTime()
  if (Number.isNaN(ts) || ts <= now - ACTIVE_WINDOW_MS) return false
  return !TERMINAL_EVENTS.has(session.lastEvent.event)
}

/**
 * Cycle-list visibility predicate (Companion HUD `hydrateActiveSessions`).
 * Looser than `isSessionActive`: stale filter is the same (5min) but only
 * task_complete is hidden — task_failed remains visible so its persistent
 * banner can show and be ack'd per CONTEXT D-08.
 */
export function isSessionVisibleInCycle(
  session: AgentSessionRow,
  now: number = Date.now(),
): boolean {
  const ts = new Date(session.lastEvent.eventTimestamp).getTime()
  if (Number.isNaN(ts) || ts <= now - ACTIVE_WINDOW_MS) return false
  return !CYCLE_HIDDEN_EVENTS.has(session.lastEvent.event)
}

/**
 * D-06 active-session filter: ≥1 row passes the per-row predicate.
 *
 * @param sessions  Agent session rows from GET /v1/agent-sessions
 * @param now       Override for testability — defaults to Date.now()
 */
export function hasActiveSession(
  sessions: AgentSessionRow[],
  now: number = Date.now(),
): boolean {
  return sessions.some((s) => isSessionActive(s, now))
}

/**
 * Pick the initial screen for first paint based on launch source + active
 * session check (D-06).
 *
 * Pure-pluggable contract: callers inject the agent-sessions fetcher so this
 * function stays SDK-free and testable. Production callers pass
 * `fetchAgentSessions` from api.ts. Test callers can pass any stub matching
 * `() => Promise<AgentSessionRow[]>`.
 *
 * The hydrate-cache side effect (companion.ts `hydrateActiveSessions`) is
 * intentionally NOT performed here — main.ts owns that concern so this
 * helper has no module-level coupling to the Companion screen state.
 *
 * Phase 129 G2-LIFECYCLE-02: extended with optional `bridge` parameter for
 * TTL-gated last-screen restore. When `source !== 'glassesMenu'` AND a bridge
 * is provided with a fresh `vigil:v3:lastScreen` value (within TTL_MS), returns
 * the stored screen instead of HOME. Malformed JSON falls through to HOME (D-05).
 *
 * D-10 invariant: the `source === 'glassesMenu'` branch is UNCHANGED — the
 * existing fetchSessions path is used; the bridge restore lookup is NOT run.
 */
export async function pickInitialScreen(
  source: LaunchSource,
  fetchSessions: () => Promise<AgentSessionRow[]>,
  bridge?: { getLocalStorage: (key: string) => Promise<string | null> },
): Promise<ScreenName> {
  if (source !== 'glassesMenu') {
    // G2-LIFECYCLE-02: attempt TTL-gated last-screen restore when bridge is provided.
    // D-10 guard: this branch only runs for non-glassesMenu sources.
    if (bridge) {
      try {
        const raw = await bridge.getLocalStorage(LAST_SCREEN_LS_KEY)
        if (raw) {
          const stored = JSON.parse(raw) as unknown
          const restored = pickRestoredScreen(stored, Date.now())
          if (restored !== HOME) {
            return restored
          }
        }
      } catch {
        // Malformed localStorage JSON → fall through to HOME (D-05/T-129-05).
      }
    }
    return HOME
  }
  // D-10: glassesMenu takes precedence — no restore lookup, use existing path.
  const sessions = await fetchSessions()
  return hasActiveSession(sessions) ? COMPANION : HOME
}
