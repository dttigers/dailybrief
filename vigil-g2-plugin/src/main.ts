import {
  waitForEvenAppBridge,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { buildHomeScreen } from './screens/home.ts'
import { handleNavEvent, navigateToTaskDetail, refreshCurrentScreen } from './navigation.ts'
import { fetchSummary } from './api.ts'

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
  // Phase 124 D-12 (G2-POLISH-07): Home no longer renders affirmation inline;
  // fetchAffirmation() is dropped from this path. Affirmation screen still
  // calls fetchAffirmation() in its own buildScreen branch (navigation.ts).
  const summary = await fetchSummary()
  const container = buildHomeScreen(summary)
  await bridge.createStartUpPageContainer(container)

  // Start 60s auto-refresh timer
  startRefreshTimer(bridge)

  // Listen for lifecycle + navigation events
  bridge.onEvenHubEvent((event) => {
    // List item click → task detail
    if (
      event.listEvent?.eventType === OsEventTypeList.CLICK_EVENT &&
      event.listEvent.currentSelectItemIndex != null
    ) {
      void navigateToTaskDetail(event.listEvent.currentSelectItemIndex, bridge)
      return
    }

    // List events (temple touchpad swipes on list containers)
    if (event.listEvent?.eventType && NAV_EVENTS.has(event.listEvent.eventType)) {
      void handleNavEvent(event.listEvent.eventType, bridge)
      return
    }

    // Text events (temple touchpad swipes on text containers)
    if (event.textEvent?.eventType && NAV_EVENTS.has(event.textEvent.eventType)) {
      void handleNavEvent(event.textEvent.eventType, bridge)
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
