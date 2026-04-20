import {
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import { DISPLAY_WIDTH, ContainerId } from '../constants.ts'
import { buildVigilHeader } from './header.ts'

const FALLBACK_AFFIRMATION = "Brief unavailable. Retry when you're ready."

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

  // Unified VIGIL header (Phase 106 D-07 item 1)
  const header = buildVigilHeader(ContainerId.AFFIRMATION_HEADER, 'affirmation-header')

  // Body: centered affirmation text
  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 1,      // Phase 106 D-07 item 4
    borderColor: 15,
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
    content: '↑ work orders   ⌾ double-tap to exit',
    isEventCapture: 0,
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, body, footer],
  })
}
