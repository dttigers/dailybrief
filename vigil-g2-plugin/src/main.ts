import {
  waitForEvenAppBridge,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { buildHomeScreen } from './screens/home.ts'
import { handleNavEvent, refreshCurrentScreen } from './navigation.ts'
import { fetchSummary, fetchAffirmation } from './api.ts'

const NAV_EVENTS = new Set([
  OsEventTypeList.SCROLL_TOP_EVENT,
  OsEventTypeList.SCROLL_BOTTOM_EVENT,
  OsEventTypeList.DOUBLE_CLICK_EVENT,
])

const REFRESH_INTERVAL_MS = 60_000

let refreshTimer: ReturnType<typeof setInterval> | null = null

function startRefreshTimer(bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>): void {
  stopRefreshTimer()
  refreshTimer = setInterval(() => void refreshCurrentScreen(bridge), REFRESH_INTERVAL_MS)
}

function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

async function init(): Promise<void> {
  const bridge = await waitForEvenAppBridge()

  // Fetch real data and build the home screen
  const [summary, affirmation] = await Promise.all([
    fetchSummary(),
    fetchAffirmation(),
  ])
  const container = buildHomeScreen(summary, affirmation)
  await bridge.createStartUpPageContainer(container)

  // Start 60s auto-refresh timer
  startRefreshTimer(bridge)

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
        void refreshCurrentScreen(bridge)
        startRefreshTimer(bridge)
      } else if (eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        console.log('Vigil backgrounded')
        stopRefreshTimer()
      }
    }
  })

  console.log('Vigil G2 plugin ready')
}

init()
