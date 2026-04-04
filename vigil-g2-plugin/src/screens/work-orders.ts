import {
  RebuildPageContainer,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
} from '@evenrealities/even_hub_sdk'

import type { VigilBrief } from '../types.ts'
import { DISPLAY_WIDTH, DIVIDER, ContainerId } from '../constants.ts'

const MAX_VISIBLE_ITEMS = 6
const ITEM_CONTENT_MAX = 45

/**
 * Build the work orders screen for the G2 display.
 *
 * Layout: header with count, scrollable list of open tasks, footer nav hints.
 * 576x288 greyscale display.
 */
export function buildWorkOrdersScreen(
  tasks: VigilBrief['openTasks'],
): RebuildPageContainer {
  // Header: title + count
  const headerContent = `WORK ORDERS          ${tasks.length} open\n${DIVIDER}`

  const header = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: 40,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.WORK_ORDERS_HEADER,
    containerName: 'work-orders-header',
    content: headerContent,
    isEventCapture: 0,
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
    containerID: ContainerId.WORK_ORDERS_FOOTER,
    containerName: 'work-orders-footer',
    content: '↑ home  ↓ affirmation',
    isEventCapture: 0,
  })

  // Body: list of tasks or empty state
  if (tasks.length === 0) {
    const emptyBody = new TextContainerProperty({
      xPosition: 0,
      yPosition: 40,
      width: DISPLAY_WIDTH,
      height: 210,
      borderWidth: 0,
      borderColor: 0,
      borderRadius: 0,
      paddingLength: 8,
      containerID: ContainerId.WORK_ORDERS_LIST,
      containerName: 'work-orders-list',
      content: 'No open tasks — nice work!',
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
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.WORK_ORDERS_LIST,
    containerName: 'work-orders-list',
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: itemNames.length,
      itemWidth: DISPLAY_WIDTH - 16,
      isItemSelectBorderEn: 0,
      itemName: itemNames,
    }),
  })

  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [header, footer],
    listObject: [listBody],
  })
}
