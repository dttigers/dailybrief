import {
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import { DISPLAY_WIDTH, DIVIDER, ContainerId } from '../constants.ts'

/**
 * Build the task detail screen for the G2 display.
 *
 * Shows full task content (no truncation), status, and tags.
 * Uses TextContainerProperty for body so swipe events propagate
 * to the app for navigation (unlike ListContainerProperty which
 * captures swipe events for scrolling).
 *
 * Layout: header with status, full content body, footer nav hints.
 * 576x288 greyscale display.
 */
export function buildTaskDetailScreen(task: {
  content: string
  taskStatus: string | null
  createdAt: string
  tags: string[]
}): RebuildPageContainer {
  const status = task.taskStatus || 'open'

  // Header: title + status
  const headerContent = `TASK DETAIL          ${status}\n${DIVIDER}`

  const header = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: 40,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.TASK_DETAIL_HEADER,
    containerName: 'task-detail-header',
    content: headerContent,
    isEventCapture: 0,
  })

  // Body: full task content (no truncation) + optional tags
  let bodyContent = task.content
  if (task.tags.length > 0) {
    bodyContent += `\n\nTags: ${task.tags.join(', ')}`
  }

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.TASK_DETAIL_BODY,
    containerName: 'task-detail-body',
    content: bodyContent,
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
    containerID: ContainerId.TASK_DETAIL_FOOTER,
    containerName: 'task-detail-footer',
    content: '\u2191 back to list  \u2193 affirmation',
    isEventCapture: 0,
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, body, footer],
  })
}
