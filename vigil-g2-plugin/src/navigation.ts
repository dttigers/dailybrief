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
import { fetchSummary, fetchBrief, fetchAffirmation } from './api.ts'

// Screen identifiers — const object pattern (erasableSyntaxOnly)
export const Screen = {
  HOME: 'home',
  WORK_ORDERS: 'work-orders',
  AFFIRMATION: 'affirmation',
  TASK_DETAIL: 'task-detail',
} as const
export type ScreenName = (typeof Screen)[keyof typeof Screen]

// Circular navigation order
const SCREEN_ORDER: readonly ScreenName[] = [
  Screen.HOME,
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
      const [summary, affirmation] = await Promise.all([
        fetchSummary(),
        fetchAffirmation(),
      ])
      return rebuildHomeScreen(summary, affirmation)
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
