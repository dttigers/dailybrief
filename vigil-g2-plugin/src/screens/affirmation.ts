import {
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import { DISPLAY_WIDTH, DIVIDER, ContainerId } from '../constants.ts'

function formatTime(): string {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const period = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours % 12 || 12
  return `${h12.toString().padStart(2, '0')}:${minutes} ${period}`
}

const FALLBACK_AFFIRMATION = 'You are capable, you are enough.'

/**
 * Build the affirmation screen for the G2 display.
 *
 * Layout: header with brand + time, centered affirmation text, footer nav hints.
 * 576x288 greyscale display.
 */
export function buildAffirmationScreen(
  affirmation: string,
): RebuildPageContainer {
  const displayText = affirmation || FALLBACK_AFFIRMATION

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
    containerID: ContainerId.AFFIRMATION_HEADER,
    containerName: 'affirmation-header',
    content: headerContent,
    isEventCapture: 0,
  })

  // Body: centered affirmation text
  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.AFFIRMATION_BODY,
    containerName: 'affirmation-body',
    content: displayText,
    isEventCapture: 1,
  })

  // Footer: navigation hints
  const footer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 250,
    width: DISPLAY_WIDTH,
    height: 38,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.AFFIRMATION_FOOTER,
    containerName: 'affirmation-footer',
    content: '↑ work orders  ↓ home',
    isEventCapture: 0,
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, body, footer],
  })
}
