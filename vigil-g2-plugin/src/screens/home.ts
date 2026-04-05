import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import type { VigilSummary, VigilAffirmation } from '../types.ts'
import { DISPLAY_WIDTH, DIVIDER, ContainerId } from '../constants.ts'

function formatTime(): string {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const period = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours % 12 || 12
  return `${h12.toString().padStart(2, '0')}:${minutes} ${period}`
}

/**
 * Build the home screen container for the G2 display.
 *
 * Layout: 3 stacked text containers (header, body, footer)
 * within the 576x288 greyscale display.
 */
/**
 * Build home screen text containers from API data.
 * Shared layout logic for both startup and rebuild variants.
 */
function buildHomeContainers(
  summary: VigilSummary,
  affirmation: VigilAffirmation,
): TextContainerProperty[] {
  const pendingCount = (summary.tasksByStatus['open'] ?? 0) + (summary.tasksByStatus['inProgress'] ?? 0)
  const topPriority = summary.recent[0]?.content ?? 'No tasks'

  // Header: brand + time
  const headerContent = `VIGIL              ${formatTime()}\n${DIVIDER}`

  const header = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: 40,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.HOME_HEADER,
    containerName: 'home-header',
    content: headerContent,
    isEventCapture: 0,
  })

  // Body: task count + top priority + affirmation
  const bodyContent = [
    `▲ ${pendingCount} tasks pending`,
    '',
    'TOP PRIORITY:',
    topPriority,
    '',
    DIVIDER,
    affirmation.affirmation,
  ].join('\n')

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.HOME_BODY,
    containerName: 'home-body',
    content: bodyContent,
    isEventCapture: 1,
  })

  // Footer: navigation hint
  const footer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 250,
    width: DISPLAY_WIDTH,
    height: 38,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.HOME_FOOTER,
    containerName: 'home-footer',
    content: '↓ swipe for work orders',
    isEventCapture: 0,
  })

  return [header, body, footer]
}

export function buildHomeScreen(
  summary: VigilSummary,
  affirmation: VigilAffirmation,
): CreateStartUpPageContainer {
  const textObject = buildHomeContainers(summary, affirmation)
  return new CreateStartUpPageContainer({
    containerTotalNum: textObject.length,
    textObject,
  })
}

export function rebuildHomeScreen(
  summary: VigilSummary,
  affirmation: VigilAffirmation,
): RebuildPageContainer {
  const textObject = buildHomeContainers(summary, affirmation)
  return new RebuildPageContainer({
    containerTotalNum: textObject.length,
    textObject,
  })
}
