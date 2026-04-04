import {
  waitForEvenAppBridge,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { buildHomeScreen } from './screens/home.ts'

async function init(): Promise<void> {
  const bridge = await waitForEvenAppBridge()

  // Build and render the home screen
  const container = buildHomeScreen()
  await bridge.createStartUpPageContainer(container)

  // Listen for lifecycle events
  bridge.onEvenHubEvent((event) => {
    if (event.sysEvent) {
      const eventType = event.sysEvent.eventType
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
