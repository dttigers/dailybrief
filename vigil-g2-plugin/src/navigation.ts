// Navigation state machine for G2 multi-screen experience

import {
  RebuildPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

import { rebuildHomeScreen } from './screens/home.ts'
import { buildWorkOrdersScreen, getLastFetchedTasks } from './screens/work-orders.ts'
import { buildAffirmationScreen } from './screens/affirmation.ts'
import { buildTaskDetailScreen } from './screens/task-detail.ts'
import { fetchSummary, fetchBrief, fetchAffirmation, fetchAgentSessions } from './api.ts'

// Screen identifiers — const object pattern (erasableSyntaxOnly)
export const Screen = {
  HOME: 'home',
  COMPANION: 'companion',     // NEW — Phase 124 D-05
  WORK_ORDERS: 'work-orders',
  AFFIRMATION: 'affirmation',
  TASK_DETAIL: 'task-detail',
} as const
export type ScreenName = (typeof Screen)[keyof typeof Screen]

// Circular navigation order
const SCREEN_ORDER: readonly ScreenName[] = [
  Screen.HOME,
  Screen.COMPANION,    // NEW slot 1 — Phase 124 D-05
  Screen.WORK_ORDERS,
  Screen.AFFIRMATION,
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
      // SSE shim provides live updates (wired in Plan 08 main.ts). Dynamic
      // import keeps companion.ts side-effect-free at module load until first
      // navigation to the Companion screen.
      const sessions = await fetchAgentSessions()
      const { rebuildCompanionScreen, hydrateActiveSessions } = await import(
        './screens/companion.ts'
      )
      hydrateActiveSessions(sessions)
      return rebuildCompanionScreen()
    }
    case Screen.WORK_ORDERS: {
      const brief = await fetchBrief()
      return buildWorkOrdersScreen(brief.openTasks)
    }
    case Screen.AFFIRMATION: {
      const result = await fetchAffirmation()
      return buildAffirmationScreen(result.affirmation)
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
    const { hasActiveBanner, ackBanner, getActiveSessions, cycleSession } =
      await import('./screens/companion.ts')
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
