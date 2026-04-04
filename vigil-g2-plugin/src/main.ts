import {
  waitForEvenAppBridge,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { buildHomeScreen } from './screens/home.ts'
import { handleNavEvent } from './navigation.ts'

const NAV_EVENTS = new Set([
  OsEventTypeList.SCROLL_TOP_EVENT,
  OsEventTypeList.SCROLL_BOTTOM_EVENT,
  OsEventTypeList.DOUBLE_CLICK_EVENT,
])

async function init(): Promise<void> {
  const bridge = await waitForEvenAppBridge()

  // Build and render the home screen
  const container = buildHomeScreen()
  await bridge.createStartUpPageContainer(container)

  // Listen for lifecycle + navigation events
  bridge.onEvenHubEvent((event) => {
    // List events (temple touchpad swipes)
    if (event.listEvent?.eventType && NAV_EVENTS.has(event.listEvent.eventType)) {
      void handleNavEvent(event.listEvent.eventType, bridge)
      return
    }

    // System events (R1 ring + lifecycle)
    if (event.sysEvent) {
      const eventType = event.sysEvent.eventType
      if (eventType && NAV_EVENTS.has(eventType)) {
        void handleNavEvent(eventType, bridge)
        return
      }
      if (eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        console.log('Vigil foregrounded')
      } else if (eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        console.log('Vigil backgrounded')
      }
    }
  })

  console.log('Vigil G2 plugin ready')
}

init()
