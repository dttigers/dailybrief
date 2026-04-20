import {
  RebuildPageContainer,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
} from '@evenrealities/even_hub_sdk'

import type { VigilBrief } from '../types.ts'
import { DISPLAY_WIDTH, ContainerId } from '../constants.ts'
import { buildVigilHeader } from './header.ts'

const MAX_VISIBLE_ITEMS = 6
const ITEM_CONTENT_MAX = 45

/** Store last fetched tasks for detail screen navigation */
let lastFetchedTasks: VigilBrief['openTasks'] = []

export function getLastFetchedTasks(): VigilBrief['openTasks'] {
  return lastFetchedTasks
}

/**
 * Build the work orders screen for the G2 display.
 *
 * Layout: header with count, scrollable list of open tasks, footer nav hints.
 * 576x288 greyscale display.
 */
export function buildWorkOrdersScreen(
  tasks: VigilBrief['openTasks'],
): RebuildPageContainer {
  lastFetchedTasks = tasks

  // Unified VIGIL header (Phase 106 D-07 item 1) — screen label shows open-task count
  const header = buildVigilHeader(
    ContainerId.WORK_ORDERS_HEADER,
    'work-orders-header',
    `${tasks.length} open`,
  )

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
    containerID: ContainerId.WORK_ORDERS_FOOTER,
    containerName: 'work-orders-footer',
    content: 'tap task for details   ⌾ double-tap to exit',
    isEventCapture: 0,
  })

  // Body: list of tasks or empty state
  if (tasks.length === 0) {
    const emptyBody = new TextContainerProperty({
      xPosition: 0,
      yPosition: 40,
      width: DISPLAY_WIDTH,
      height: 210,
      borderWidth: 1,      // Phase 106 D-07 item 4
      borderColor: 15,
      borderRadius: 0,
      paddingLength: 8,
      containerID: ContainerId.WORK_ORDERS_LIST,
      containerName: 'work-orders-list',
      content: 'No work orders open. Capture one when it finds you.',
      isEventCapture: 1,
    })

    return new RebuildPageContainer({
      containerTotalNum: 3,
      textObject: [header, emptyBody, footer],
    })
  }

  // Scrollable list of open tasks
  const visibleTasks = tasks.slice(0, MAX_VISIBLE_ITEMS)
  const itemNames = visibleTasks.map((t) =>
    t.content.length > ITEM_CONTENT_MAX
      ? t.content.slice(0, ITEM_CONTENT_MAX - 1) + '…'
      : t.content,
  )

  const listBody = new ListContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 1,      // Phase 106 D-07 item 4
    borderColor: 15,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.WORK_ORDERS_LIST,
    containerName: 'work-orders-list',
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: itemNames.length,
      itemWidth: DISPLAY_WIDTH - 16,
      isItemSelectBorderEn: 1,
      itemName: itemNames,
    }),
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, footer],
    listObject: [listBody],
  })
}
