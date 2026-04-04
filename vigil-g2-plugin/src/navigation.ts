// Navigation state machine for G2 multi-screen experience

import {
  RebuildPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

import { rebuildHomeScreen } from './screens/home.ts'
import { buildWorkOrdersScreen } from './screens/work-orders.ts'
import { buildAffirmationScreen } from './screens/affirmation.ts'
import { fetchSummary, fetchBrief, fetchAffirmation } from './api.ts'

// Screen identifiers — const object pattern (erasableSyntaxOnly)
export const Screen = {
  HOME: 'home',
  WORK_ORDERS: 'work-orders',
  AFFIRMATION: 'affirmation',
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

/** Handle navigation events from temple touchpad / R1 ring */
export async function handleNavEvent(
  eventType: OsEventTypeList,
  bridge: EvenAppBridge,
): Promise<void> {
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
