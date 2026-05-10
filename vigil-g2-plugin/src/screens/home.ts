import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import type { VigilSummary } from '../types.ts'
import { DISPLAY_WIDTH, ContainerId } from '../constants.ts'
import { buildVigilHeader } from './header.ts'

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
): TextContainerProperty[] {
  const pendingCount = (summary.tasksByStatus['open'] ?? 0) + (summary.tasksByStatus['inProgress'] ?? 0)
  const topPriority = summary.recent[0]?.content ?? 'No tasks'

  // Unified VIGIL header (Phase 106 D-07 item 1)
  const header = buildVigilHeader(ContainerId.HOME_HEADER, 'home-header')
  // rightSide omitted → falls back to HH:MM AM/PM (preserves existing home behavior)

  // Body: 4 logical lines fitting 210px container (Phase 124 D-12 — G2-POLISH-07).
  // Inline affirmation + DIVIDER removed; affirmation lives on its own carousel
  // screen. Locks v3.5 HARDWARE-DIVERGENCE Divergence 4 ("two captures show
  // different scroll positions") structurally — content can no longer overflow.
  const bodyContent = [
    `* ${pendingCount} tasks pending`,
    '',
    'TOP PRIORITY:',
    topPriority,
  ].join('\n')

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 1,      // Phase 106 D-07 item 4
    borderColor: 15,     // max greyscale brightness
    borderRadius: 0,     // sharp corners — consistent with divider row
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
    content: '↓ companion   () double-tap to exit',
    isEventCapture: 0,
  })

  return [header, body, footer]
}

export function buildHomeScreen(
  summary: VigilSummary,
): CreateStartUpPageContainer {
  const textObject = buildHomeContainers(summary)
  return new CreateStartUpPageContainer({
    containerTotalNum: textObject.length,
    textObject,
  })
}

export function rebuildHomeScreen(
  summary: VigilSummary,
): RebuildPageContainer {
  const textObject = buildHomeContainers(summary)
  return new RebuildPageContainer({
    containerTotalNum: textObject.length,
    textObject,
  })
}
