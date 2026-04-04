// Navigation state machine for G2 multi-screen experience

import {
  RebuildPageContainer,
  TextContainerProperty,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

import { buildHomeScreen } from './screens/home.ts'
import { DISPLAY_WIDTH, DIVIDER, ContainerId } from './constants.ts'

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

/** Build a placeholder screen for screens not yet implemented */
function buildPlaceholderScreen(
  title: string,
  headerId: number,
  bodyId: number,
  footerId: number,
  navHint: string,
): RebuildPageContainer {
  const header = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: 40,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: headerId,
    containerName: `${title.toLowerCase().replace(/\s+/g, '-')}-header`,
    content: `${title}\n${DIVIDER}`,
    isEventCapture: 0,
  })

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: bodyId,
    containerName: `${title.toLowerCase().replace(/\s+/g, '-')}-body`,
    content: `${title} - Coming Soon`,
    isEventCapture: 1,
  })

  const footer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 250,
    width: DISPLAY_WIDTH,
    height: 38,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: footerId,
    containerName: `${title.toLowerCase().replace(/\s+/g, '-')}-footer`,
    content: navHint,
    isEventCapture: 0,
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, body, footer],
  })
}

/** Build the screen container for a given screen name */
function buildScreen(screen: ScreenName): RebuildPageContainer {
  switch (screen) {
    case Screen.HOME: {
      // Reuse home builder — convert CreateStartUpPageContainer to RebuildPageContainer
      const home = buildHomeScreen()
      return new RebuildPageContainer({
        containerTotalNum: home.containerTotalNum,
        textObject: home.textObject,
      })
    }
    case Screen.WORK_ORDERS:
      return buildPlaceholderScreen(
        'Work Orders',
        ContainerId.WORK_ORDERS_HEADER,
        ContainerId.WORK_ORDERS_LIST,
        ContainerId.WORK_ORDERS_FOOTER,
        '↑ home  ↓ affirmation',
      )
    case Screen.AFFIRMATION:
      return buildPlaceholderScreen(
        'Affirmation',
        ContainerId.AFFIRMATION_HEADER,
        ContainerId.AFFIRMATION_BODY,
        ContainerId.AFFIRMATION_FOOTER,
        '↑ work orders  ⊡⊡ home',
      )
  }
}

/** Navigate to a screen — rebuilds the page container */
export async function navigateTo(
  screen: ScreenName,
  bridge: EvenAppBridge,
): Promise<void> {
  currentScreen = screen
  const container = buildScreen(screen)
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
