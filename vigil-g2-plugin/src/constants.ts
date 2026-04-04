// Display constants for Even G2 greyscale display

export const DISPLAY_WIDTH = 576
export const DISPLAY_HEIGHT = 288
export const CHARS_PER_LINE = 32
export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

/** Container IDs for screen layouts (max 12 total across all screens) */
export const ContainerId = {
  HOME_HEADER: 1,
  HOME_BODY: 2,
  HOME_FOOTER: 3,
  WORK_ORDERS_HEADER: 4,
  WORK_ORDERS_LIST: 5,
  WORK_ORDERS_FOOTER: 6,
  AFFIRMATION_HEADER: 7,
  AFFIRMATION_BODY: 8,
  AFFIRMATION_FOOTER: 9,
} as const
