import {
  CreateStartUpPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import type { VigilSummary, VigilAffirmation } from '../types.ts'
import { DISPLAY_WIDTH, DIVIDER, ContainerId } from '../constants.ts'

// Mock data matching Vigil API response shapes — swapped for real API data in Phase 33

export const MOCK_SUMMARY: VigilSummary = {
  total: 12,
  byCategory: { task: 3, idea: 5, note: 4 },
  tasksByStatus: { pending: 3, done: 0 },
  favorites: 2,
  linkedThoughts: 1,
  recent: [
    {
      id: 1,
      content: 'Fix HVAC unit at Store #142',
      category: 'task',
      source: 'voice',
      createdAt: '2026-04-04T10:00:00Z',
      tags: ['urgent', 'hvac'],
    },
  ],
}

export const MOCK_AFFIRMATION: VigilAffirmation = {
  affirmation:
    "You've been handling a lot of competing priorities today. That takes real skill.",
}

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
export function buildHomeScreen(): CreateStartUpPageContainer {
  const summary = MOCK_SUMMARY
  const affirmation = MOCK_AFFIRMATION

  const pendingCount = summary.tasksByStatus['pending'] ?? 0
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

  return new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: [header, body, footer],
  })
}
