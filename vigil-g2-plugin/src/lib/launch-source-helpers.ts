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
import { Screen, type ScreenName } from '../navigation.ts'

/**
 * D-06 active-session filter: ≥1 row with eventTimestamp within 5min AND
 * event NOT IN terminal-set ('task_complete', 'task_failed').
 *
 * @param sessions  Agent session rows from GET /v1/agent-sessions
 * @param now       Override for testability — defaults to Date.now()
 */
export function hasActiveSession(
  sessions: AgentSessionRow[],
  now: number = Date.now(),
): boolean {
  const cutoff = now - 5 * 60 * 1000
  const TERMINAL = new Set(['task_complete', 'task_failed'])
  return sessions.some((s) => {
    const ts = new Date(s.lastEvent.eventTimestamp).getTime()
    if (Number.isNaN(ts) || ts <= cutoff) return false
    return !TERMINAL.has(s.lastEvent.event)
  })
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
 */
export async function pickInitialScreen(
  source: LaunchSource,
  fetchSessions: () => Promise<AgentSessionRow[]>,
): Promise<ScreenName> {
  if (source !== 'glassesMenu') return Screen.HOME
  const sessions = await fetchSessions()
  return hasActiveSession(sessions) ? Screen.COMPANION : Screen.HOME
}
