// Navigation state machine for G2 multi-screen experience

import {
  RebuildPageContainer,
  TextContainerProperty,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

import { DISPLAY_WIDTH, ContainerId } from './constants.ts'

import { rebuildHomeScreen } from './screens/home.ts'
import { buildWorkOrdersScreen, getLastFetchedTasks } from './screens/work-orders.ts'
import { buildAffirmationScreen } from './screens/affirmation.ts'
import { buildTaskDetailScreen } from './screens/task-detail.ts'
import {
  rebuildCompanionScreen,
  hydrateActiveSessions,
  hasActiveBanner,
  ackBanner,
  getActiveSessions,
  cycleSession,
} from './screens/companion.ts'
// Phase 128a SPIKE — TOSSABLE. Static import (NOT dynamic) per Phase 125
// Hermes fix at navigation.ts:222-224. Phase 130 owns hardening/removal.
import {
  buildVoiceSpikeScreen,
  getRecording,
  toggleVoiceSpikeRecording,
} from './screens/voice-spike.ts'
import { fetchSummary, fetchBrief, fetchAffirmation, fetchAgentSessions } from './api.ts'

// Screen identifiers — const object pattern (erasableSyntaxOnly)
export const Screen = {
  HOME: 'home',
  COMPANION: 'companion',     // NEW — Phase 124 D-05
  WORK_ORDERS: 'work-orders',
  AFFIRMATION: 'affirmation',
  TASK_DETAIL: 'task-detail',
  VOICE_SPIKE: 'voice-spike', // Phase 128a SPIKE — TOSSABLE
} as const
export type ScreenName = (typeof Screen)[keyof typeof Screen]

// Circular navigation order
const SCREEN_ORDER: readonly ScreenName[] = [
  Screen.HOME,
  Screen.COMPANION,    // NEW slot 1 — Phase 124 D-05
  Screen.WORK_ORDERS,
  Screen.AFFIRMATION,
  Screen.VOICE_SPIKE,  // Phase 128a SPIKE — TOSSABLE (visible-not-hidden per 128A-UI-SPEC)
]

/** Module-level current screen state */
export let currentScreen: ScreenName = Screen.HOME

export function getNextScreen(current: ScreenName): ScreenName {
  const idx = SCREEN_ORDER.indexOf(current)
  return SCREEN_ORDER[(idx + 1) % SCREEN_ORDER.length]
}

export function getPrevScreen(current: ScreenName): ScreenName {
  const idx = SCREEN_ORDER.indexOf(current)
  return SCREEN_ORDER[(idx - 1 + SCREEN_ORDER.length) % SCREEN_ORDER.length]
}

/** Build the screen container for a given screen name, fetching live data */
async function buildScreen(screen: ScreenName): Promise<RebuildPageContainer> {
  switch (screen) {
    case Screen.HOME: {
      // Phase 124 D-12 (G2-POLISH-07): Home no longer renders affirmation
      // inline; fetchAffirmation() is dropped from this path. The Affirmation
      // screen below still uses fetchAffirmation() (do not remove the import).
      const summary = await fetchSummary()
      return rebuildHomeScreen(summary)
    }
    case Screen.COMPANION: {
      // Phase 124 D-05 / AGENT-HUD-01 — hydrate from GET /v1/agent-sessions;
      // SSE shim provides live updates (wired in Plan 08 main.ts).
      // Phase 125 hardware-debug-2026-05-10: hardware retest revealed
      // Companion was missing from carousel on G2. Root cause: container
      // names 'companion-header'/'companion-footer' are exactly 16 chars
      // — the runtime SDK enforces strict <16 even though check-verified.mjs
      // accepts ≤16. TextContainerProperty constructor threw, buildScreen
      // throw poisoned currentScreen, navigation appeared to skip Companion.
      // Fix: container names shortened to 'comp-header'/'comp-body'/
      // 'comp-footer' (≤11 chars, matching every other screen's pattern).
      // try/catch retained as defense-in-depth so any future Companion
      // failure renders a visible diagnostic instead of silently breaking
      // the carousel.
      try {
        const sessions = await fetchAgentSessions()
        hydrateActiveSessions(sessions)
        return rebuildCompanionScreen()
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e)
        return new RebuildPageContainer({
          containerTotalNum: 1,
          textObject: [
            new TextContainerProperty({
              xPosition: 0,
              yPosition: 0,
              width: DISPLAY_WIDTH,
              height: 288,
              borderWidth: 0,
              borderColor: 0,
              borderRadius: 0,
              paddingLength: 8,
              containerID: ContainerId.COMPANION_BODY,
              containerName: 'comp-err',
              content: `COMPANION ERR\n${msg.slice(0, 60)}`,
              isEventCapture: 1,
            }),
          ],
        })
      }
    }
    case Screen.WORK_ORDERS: {
      const brief = await fetchBrief()
      return buildWorkOrdersScreen(brief.openTasks)
    }
    case Screen.AFFIRMATION: {
      const result = await fetchAffirmation()
      return buildAffirmationScreen(result.affirmation)
    }
    case Screen.VOICE_SPIKE: {
      // Phase 128a SPIKE — TOSSABLE. No API fetch — recording state lives in
      // the screen module (mirrors audio-session-guard module-scope pattern).
      return buildVoiceSpikeScreen(getRecording())
    }
    case Screen.TASK_DETAIL: {
      // Sub-screen — on refresh, fall back to work orders list
      const brief = await fetchBrief()
      return buildWorkOrdersScreen(brief.openTasks)
    }
  }
}

/** Navigate to a screen — rebuilds the page container */
export async function navigateTo(
  screen: ScreenName,
  bridge: EvenAppBridge,
): Promise<void> {
  currentScreen = screen
  const container = await buildScreen(screen)
  await bridge.rebuildPageContainer(container)
  console.log(`[vigil-g2] navigated to: ${screen}`)
}

/** Refresh the current screen with fresh API data */
export async function refreshCurrentScreen(
  bridge: EvenAppBridge,
): Promise<void> {
  await navigateTo(currentScreen, bridge)
}

/**
 * Phase 124 W-6 — read-only accessor for the current screen identity.
 * Plan 08's SSE event handler needs this to decide whether an incoming
 * agent_event should trigger a Companion rebuild (only when the user is
 * actually viewing the Companion screen — otherwise the event silently
 * updates the in-memory cache via applyAgentEvent and the user sees the
 * fresh state on next swipe-to-Companion).
 */
export function getCurrentScreen(): ScreenName {
  return currentScreen
}

/**
 * Phase 124 W-6 — rebuild whatever screen is currently active without
 * changing the screen identity. Used by Plan 08's SSE wiring to repaint
 * the Companion HUD when a new agent_event arrives. Identical to
 * refreshCurrentScreen for now (kept as a separate export so future
 * SSE-only rebuild logic — e.g., skipping the API fetch and using only
 * the in-memory companion cache — can diverge without churning the
 * refreshCurrentScreen call sites in handleNavEvent).
 */
export async function rebuildCurrentScreen(
  bridge: EvenAppBridge,
): Promise<void> {
  const container = await buildScreen(currentScreen)
  await bridge.rebuildPageContainer(container)
}

/** Navigate to task detail sub-screen by list item index */
export async function navigateToTaskDetail(
  itemIndex: number,
  bridge: EvenAppBridge,
): Promise<void> {
  const tasks = getLastFetchedTasks()
  const task = tasks[itemIndex]
  if (!task) return
  currentScreen = Screen.TASK_DETAIL
  const container = buildTaskDetailScreen(task)
  await bridge.rebuildPageContainer(container)
  console.log(`[vigil-g2] navigated to: task-detail (index ${itemIndex})`)
}

/** Handle navigation events from temple touchpad / R1 ring */
export async function handleNavEvent(
  eventType: OsEventTypeList,
  bridge: EvenAppBridge,
): Promise<void> {
  // Task detail is a sub-screen, not in SCREEN_ORDER — handle explicitly
  if (currentScreen === Screen.TASK_DETAIL) {
    if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
      await navigateTo(Screen.WORK_ORDERS, bridge)
    } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      await navigateTo(Screen.AFFIRMATION, bridge)
    } else if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      await navigateTo(Screen.HOME, bridge)
    }
    return
  }

  // G2-02: home-screen double-tap hands off to the host-rendered exit-confirm dialog.
  // Per D-01, we do NOT render a custom confirmation UI. Per RESEARCH Pitfall 3,
  // we fire-and-forget — the SDK's Promise<boolean> semantics are undocumented,
  // and lifecycle transitions (confirm/cancel) arrive via existing FOREGROUND_*
  // listeners in main.ts (lines 75-82). exitMode=1 per D-01.
  if (
    currentScreen === Screen.HOME &&
    eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    void bridge.shutDownPageContainer(1)
    return
  }

  // Phase 124 D-08 — context-sensitive DOUBLE_CLICK on Companion screen.
  // ONLY DOUBLE_CLICK_EVENT is plumbed reliably on G2 (CLICK_EVENT is
  // sim-only per Phase 45 retro; long-press is absent from OsEventTypeList
  // in @evenrealities/even_hub_sdk@0.0.9 — see SEED-011).
  // Priority: banner-ack → cycle-session → jump-Home.
  if (
    currentScreen === Screen.COMPANION &&
    eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    // Phase 125 follow-up: was `await import('./screens/companion.ts')`.
    // Same INEFFECTIVE_DYNAMIC_IMPORT issue as above — converted to static
    // import for engine-agnostic resolution.
    if (hasActiveBanner()) {
      ackBanner()
      await refreshCurrentScreen(bridge)
      return
    }
    if (getActiveSessions().length >= 2) {
      cycleSession()
      await refreshCurrentScreen(bridge)
      return
    }
    await navigateTo(Screen.HOME, bridge)
    return
  }

  // Phase 128a SPIKE — VOICE_SPIKE DOUBLE_CLICK toggles recording (TOSSABLE).
  // Mirrors Companion D-08 carve-out at lines 219-238 above. Hardware-verified
  // DOUBLE_CLICK per project_g2_companion_doubletap_hardware_verified 2026-05-10.
  // Single-press REACTIVATE patch is Phase 133. MUST be checked BEFORE the
  // default NAV_EVENTS dispatch below — otherwise DOUBLE_CLICK would jump to
  // HOME via the switch at the bottom of this function.
  //
  // Cast rationale: `toggleVoiceSpikeRecording` consumes the
  // `AudioGuardBridge` structural type from `audio-session-guard.ts`, which
  // declares `setBackgroundState`/`onBackgroundRestore` per EVEN-SKILLS.md
  // §"Background state". The runtime EvenAppBridge exposes those methods,
  // but `@evenrealities/even_hub_sdk@0.0.9`'s `.d.ts` does NOT type them.
  // Cast through `unknown` per Phase 127 GUARD-02 pattern; Phase 130
  // productionization owns the upstream SDK .d.ts fix.
  if (
    currentScreen === Screen.VOICE_SPIKE &&
    eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    await toggleVoiceSpikeRecording(
      bridge as unknown as Parameters<typeof toggleVoiceSpikeRecording>[0],
    )
    return
  }

  let target: ScreenName

  switch (eventType) {
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      target = getNextScreen(currentScreen)
      break
    case OsEventTypeList.SCROLL_TOP_EVENT:
      target = getPrevScreen(currentScreen)
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      target = Screen.HOME
      break
    default:
      return
  }

  await navigateTo(target, bridge)
}
