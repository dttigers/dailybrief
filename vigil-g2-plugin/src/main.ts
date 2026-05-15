// Vigil G2 plugin — entry point.
//
// Phase 124 Plan 08 wiring:
//   1. D-07: register `bridge.onLaunchSource` at MODULE SCOPE (BEFORE
//      `waitForEvenAppBridge()` resolves) so the SDK's one-shot
//      launch-source push (fired once after the WebView page-ready event,
//      per SDK comment "页面就绪后由 SDK 推送一次, reload 不会再次触发") is
//      captured into a Promise<LaunchSource>. Registering inside `init()`
//      races the push and can miss it.
//   2. D-06: `init()` awaits both `waitForEvenAppBridge()` AND a 500ms
//      Promise.race against the launchSourcePromise (timeout fallback to
//      'appMenu') so first paint lands on the right screen with zero
//      flash. On glassesMenu + ≥1 active session → Companion; else Home.
//   3. SSE client connects AFTER `bridge.createStartUpPageContainer(...)`
//      (first paint is non-blocking on SSE). onEvent → applyAgentEvent +
//      conditional Companion rebuild; onStateChange → setSseConnected +
//      conditional Companion rebuild.
//
// SECURITY (memory: feedback_railway_variables_leak):
//   - VITE_API_KEY is read once via api.ts module-scope and re-exported
//     for the SSE client. NEVER logged, NEVER URL-appended.
//   - SSE onEvent's catch block never logs `data` (could contain user
//     task content) or `id` (per CONTEXT D-04 trust boundary).

import {
  EvenAppBridge,
  waitForEvenAppBridge,
  OsEventTypeList,
  type LaunchSource,
} from '@evenrealities/even_hub_sdk'
import { buildHomeScreen } from './screens/home.ts'
import {
  buildCompanionScreen,
  applyAgentEvent,
  setSseConnected,
  setQuietMode,
  hydrateActiveSessions,
  getActiveSessions,
} from './screens/companion.ts'
import {
  Screen,
  type ScreenName,
  handleNavEvent,
  navigateToTaskDetail,
  refreshCurrentScreen,
  getCurrentScreen,
  rebuildCurrentScreen,
} from './navigation.ts'
import {
  fetchSummary,
  fetchBrief,
  fetchAgentSessions,
  BASE_URL,
  API_KEY,
} from './api.ts'
import { createSseClient } from './lib/sse-client.ts'
import { pickInitialScreen } from './lib/launch-source-helpers.ts'
// Phase 128a SPIKE — TOSSABLE. PCM chunk collector for VOICE_SPIKE; Phase 130 owns removal.
import { appendPcmChunk } from './screens/voice-spike.ts'
// Phase 129 G2-LIFECYCLE-01: screen state restore module.
import { registerBackgroundStateHandlers } from './lib/screen-state-restore.ts'

// Re-export the testable launch-source helpers from main.ts so any future
// caller importing them via './main.ts' still works (and so the plan's
// "main.ts contains hasActiveSession + pickInitialScreen" contract is
// satisfied at the source-content drift-detector level).
export {
  hasActiveSession,
  pickInitialScreen,
} from './lib/launch-source-helpers.ts'

const NAV_EVENTS = new Set([
  OsEventTypeList.SCROLL_TOP_EVENT,
  OsEventTypeList.SCROLL_BOTTOM_EVENT,
  OsEventTypeList.DOUBLE_CLICK_EVENT,
])

const REFRESH_INTERVAL_MS = 60_000

// ── Phase 124 D-07: module-scope onLaunchSource registration ──────────
// SDK pushes launchSource ONCE after the WebView page-ready event
// (verified SDK source comment "页面就绪后由 SDK 推送一次, reload 不会再次触发").
// Module-scope registration captures the push regardless of when init()
// runs — registering inside init() races the push and the value can be
// missed. RESEARCH §"Pattern 4" / CONTEXT D-07.
const bridgeInstance = EvenAppBridge.getInstance()
const launchSourcePromise: Promise<LaunchSource> = new Promise((resolve) => {
  bridgeInstance.onLaunchSource((source) => resolve(source))
})

// ── Phase 129 G2-LIFECYCLE-01: module-scope setBackgroundState registrations ──
// MUST precede function init() — same ordering constraint as onLaunchSource
// (D-07 drift test extended to also check setBackgroundState index < initIdx).
//
// registerBackgroundStateHandlers wires TWO background-state pairs:
//   1. 'vigil-companion-state': companion HUD activeSessions + bannerState (D-11 fold)
//   2. 'vigil-screen-state': last-viewed screen + optional args (G2-LIFECYCLE-01)
//
// restoreScreenFn implements D-07: for parameterized screens (TASK_DETAIL), re-fetch
// the entity by id; on 404 (null/undefined), fall back to WORK_ORDERS parent list.
// Do NOT fall back to HOME for 404 — D-07 mandates parent list for closest-to-intent UX.
//
// Cast rationale: EvenAppBridge@0.0.9 .d.ts does not type setBackgroundState/
// onBackgroundRestore; cast through unknown per Phase 127 GUARD-02 pattern.
const restoreScreenFn = async (
  screen: string,
  args: { id?: string | number } | undefined,
  _bridge: unknown,
): Promise<void> => {
  if (!bridge) return
  if (screen === Screen.TASK_DETAIL && args?.id != null) {
    // D-07: re-fetch the task entity on restore. On 404 (task deleted/out-of-scope
    // or completed since last session), navigate to WORK_ORDERS parent list — NOT HOME.
    // The G2 task list is loaded by fetchBrief() → brief.openTasks; find by id.
    try {
      const brief = await fetchBrief()
      const taskIdx = brief.openTasks.findIndex((t) => String(t.id) === String(args.id))
      if (taskIdx < 0) {
        // D-07: task not in current open list (404 equivalent) → parent list.
        await navigateTo(Screen.WORK_ORDERS, bridge)
        return
      }
      // Task found — navigate via navigateToTaskDetail to get the task-detail screen.
      await navigateToTaskDetail(taskIdx, bridge)
    } catch {
      // Network error during re-fetch — fall back to WORK_ORDERS (safer than HOME per D-07).
      await navigateTo(Screen.WORK_ORDERS, bridge)
    }
    return
  }
  // Non-parameterized screen: navigate directly.
  if (screen && screen !== Screen.TASK_DETAIL) {
    await navigateTo(screen as import('./navigation.ts').ScreenName, bridge)
  }
}

registerBackgroundStateHandlers(
  bridgeInstance as unknown as import('./lib/screen-state-restore.ts').ScreenRestoreBridge,
  // getCompanionSnapshot: returns serializable companion HUD state (D-11).
  // activeSessions from companion module-state (JSON-serializable rows).
  () => ({
    activeSessions: getActiveSessions(),
    bannerState: null,
  }),
  // restoreCompanionSnapshot: hydrate companion from restored snapshot (D-11).
  (saved: unknown) => {
    const s = saved as { activeSessions?: Parameters<typeof hydrateActiveSessions>[0] }
    if (s?.activeSessions) {
      hydrateActiveSessions(s.activeSessions)
    }
  },
  // getScreenSnapshot: returns current screen + args for bg-state snapshot.
  () => ({ screen: getCurrentScreen() }),
  // restoreScreenFn: re-fetch + D-07 404→WORK_ORDERS fallback (see above).
  restoreScreenFn as never,
)

// ── SSE client setup (Phase 124 Plan 06 shim) ─────────────────────────
// Bearer in Authorization header (api.ts authHeaders pattern) — never URL.
// Connects AFTER first paint via init() → keeps initial render
// non-blocking on network. The closure captures `bridge` lazily via the
// module-scope `let bridge` written by init().
let bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null

function startRefreshTimer(b: Awaited<ReturnType<typeof waitForEvenAppBridge>>): void {
  stopRefreshTimer()
  refreshTimer = setInterval(() => void refreshCurrentScreen(b), REFRESH_INTERVAL_MS)
}

function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// AGENT-HUD-01 + AGENT-API-03 client wiring (CONTEXT D-04 + D-11).
const sseClient = createSseClient({
  url: `${BASE_URL}/agent-stream`,
  apiKey: API_KEY,
  onEvent: (_id, data) => {
    try {
      const row = JSON.parse(data) as Parameters<typeof applyAgentEvent>[0]
      const result = applyAgentEvent(row)
      if (bridge && getCurrentScreen() === Screen.COMPANION) {
        void rebuildCurrentScreen(bridge)
      }
      if (result.toastMs && result.toastMs > 0) {
        const toastBridge = bridge
        const toastMs = result.toastMs
        setTimeout(() => {
          if (toastBridge && getCurrentScreen() === Screen.COMPANION) {
            void rebuildCurrentScreen(toastBridge)
          }
        }, toastMs)
      }
    } catch {
      // Bad JSON or unexpected shape — drop silently. NEVER log `data`
      // or `_id`: payload may contain user task content per CONTEXT D-04
      // trust boundary; bearer-adjacent leak surface is `_id` only and
      // even that is policy-banned from logs.
    }
  },
  onStateChange: (connected) => {
    setSseConnected(connected)
    if (bridge && getCurrentScreen() === Screen.COMPANION) {
      void rebuildCurrentScreen(bridge)
    }
    // Phase 125 v0.3.6 — update iPhone WebView splash status indicator.
    // Even Hub reviewer rejected v0.2.0 for blank WebView; index.html now
    // shows a brand splash with a connection dot.
    const el = document.getElementById('vigil-status')
    if (el) {
      el.setAttribute('data-state', connected ? 'connected' : 'offline')
      const text = el.querySelector('.status-text')
      if (text) text.textContent = connected ? 'Connected' : 'Offline'
    }
  },
  // Phase 125 (AGENT-HUD-03 / D-02 / UI-SPEC §"Header rebuild on
  // quiet_mode_changed"): when the server emits quiet_mode_changed (either
  // as the synthetic D-03 state-bootstrap frame on connect OR as a live
  // PWA-toggle frame), parse the {enabled, since} payload and propagate
  // the boolean to companion's module-level quietMode ref. If the user is
  // currently viewing Companion, rebuild so the Q glyph appears/disappears
  // within ~100ms. Malformed JSON: log and ignore — DO NOT crash plugin.
  onQuietMode: (data) => {
    try {
      const parsed = JSON.parse(data) as { enabled: boolean; since: string | null }
      setQuietMode(parsed.enabled)
      if (bridge && getCurrentScreen() === Screen.COMPANION) {
        void rebuildCurrentScreen(bridge)
      }
    } catch (err) {
      // Per CONTEXT threat T-125-W6-02 — malformed payload must NOT crash
      // the plugin. setQuietMode is not called on bad payload, preserving
      // last-known good state.
      console.error('[main] malformed quiet_mode_changed payload', err)
    }
  },
})

async function buildInitialContainer(
  screen: ScreenName,
): Promise<Awaited<ReturnType<typeof buildHomeScreen>>> {
  switch (screen) {
    case Screen.COMPANION: {
      // Already hydrated by init() before this call — buildCompanionScreen
      // reads the in-memory cache.
      return buildCompanionScreen()
    }
    case Screen.HOME:
    default: {
      // Phase 124 D-12 (G2-POLISH-07): Home no longer renders affirmation
      // inline; fetchAffirmation() is dropped from this path.
      const summary = await fetchSummary()
      return buildHomeScreen(summary)
    }
  }
}

async function init(): Promise<void> {
  // D-07: race the launchSourcePromise against a 500ms timeout fallback to
  // 'appMenu'. waitForEvenAppBridge resolves once the SDK is ready; the
  // race captures the launch source if the SDK pushed it before the
  // timeout, else falls back gracefully.
  const [resolvedBridge, source] = await Promise.all([
    waitForEvenAppBridge(),
    Promise.race<LaunchSource>([
      launchSourcePromise,
      // 500ms timeout: SDK pushes launchSource ONCE after page-ready; if
      // that push hasn't arrived by 500ms (e.g. WebView lifecycle anomaly,
      // SDK shim bug), default to 'appMenu' so init() never hangs forever
      // on first paint (CONTEXT D-07 + threat T-124-08-05).
      new Promise<LaunchSource>((r) => setTimeout(() => r('appMenu'), 500)),
    ]),
  ])
  bridge = resolvedBridge

  // D-06: pickInitialScreen → glassesMenu + ≥1 active session → Companion;
  // else Home. Hydrate the Companion cache up-front so the first paint
  // reflects accurate state (Companion's buildContainers reads
  // activeSessions; without hydrate it would render empty state).
  const sessions = source === 'glassesMenu' ? await fetchAgentSessions() : []
  hydrateActiveSessions(sessions)
  // G2-LIFECYCLE-02: pass bridgeInstance as third arg so pickInitialScreen can
  // attempt the TTL-gated last-screen restore for non-glassesMenu launches.
  const initialScreen = await pickInitialScreen(source, async () => sessions, bridge)
  const container = await buildInitialContainer(initialScreen)
  await bridge.createStartUpPageContainer(container)

  // Start 60s auto-refresh timer
  startRefreshTimer(bridge)

  // Listen for lifecycle + navigation events
  bridge.onEvenHubEvent((event) => {
    // Phase 128a SPIKE — VOICE_SPIKE audioEvent collector (TOSSABLE).
    // Append PCM chunks while recording. Log strings use GUARD-01 safe
    // keys (bytes, chunk_n) — never pcm/audio* (per BLOCKED_PROPERTY_NAMES
    // at vigil-core/src/analytics/posthog.ts:32). Per W2 revision the
    // screen does NOT re-render here — counter refresh happens on screen
    // entry / state transition / post-upload, so we don't round-trip the
    // SDK ≥10x/s and contaminate the inter_chunk_latency measurement.
    if (event.audioEvent?.audioPcm) {
      const bytes = event.audioEvent.audioPcm.length
      // mic_on_ms is logged inside appendPcmChunk on the first chunk per
      // session (single-fire — no repeated "Timer 'mic-on' does not exist"
      // warnings the old console.timeEnd path produced on every chunk).
      console.log(`[voice-spike] chunk bytes=${bytes}`)
      appendPcmChunk(event.audioEvent.audioPcm)
      return
    }

    // List item click → task detail
    if (
      event.listEvent?.eventType === OsEventTypeList.CLICK_EVENT &&
      event.listEvent.currentSelectItemIndex != null &&
      bridge
    ) {
      void navigateToTaskDetail(event.listEvent.currentSelectItemIndex, bridge)
      return
    }

    // List events (temple touchpad swipes on list containers)
    if (event.listEvent?.eventType && NAV_EVENTS.has(event.listEvent.eventType) && bridge) {
      void handleNavEvent(event.listEvent.eventType, bridge)
      return
    }

    // Text events (temple touchpad swipes on text containers)
    if (event.textEvent?.eventType && NAV_EVENTS.has(event.textEvent.eventType) && bridge) {
      void handleNavEvent(event.textEvent.eventType, bridge)
      return
    }

    // System events (R1 ring + lifecycle)
    if (event.sysEvent && bridge) {
      const eventType = event.sysEvent.eventType
      if (eventType && NAV_EVENTS.has(eventType)) {
        void handleNavEvent(eventType, bridge)
        return
      }
      if (eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        console.log('Vigil foregrounded')
        void refreshCurrentScreen(bridge)
        startRefreshTimer(bridge)
      } else if (eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        console.log('Vigil backgrounded')
        stopRefreshTimer()
      }
    }
  })

  // Phase 124 D-04 + D-11: SSE connect AFTER first paint — non-blocking
  // landing. The shim's exponential backoff handles transient errors;
  // onStateChange flips the offline indicator, onEvent drives Companion
  // HUD rebuilds.
  sseClient.connect()

  console.log('Vigil G2 plugin ready')
}

init()
