// Display constants for Even G2 greyscale display

export const DISPLAY_WIDTH = 576
export const DISPLAY_HEIGHT = 288
export const CHARS_PER_LINE = 32
export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

/** Container IDs for screen layouts. SDK constraint is `containerTotalNum: 1~12`
 *  PER PAGE (per CreateStartUpPageContainer / RebuildPageContainer call), NOT
 *  global across screens. Verified against
 *  @evenrealities/even_hub_sdk index.d.ts:638-643 in Phase 124 research. */
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
  TASK_DETAIL_HEADER: 10,
  TASK_DETAIL_BODY: 11,
  TASK_DETAIL_FOOTER: 12,
  COMPANION_HEADER: 13,    // Phase 124 D-05
  COMPANION_BODY: 14,
  COMPANION_FOOTER: 15,
  VOICE_HEADER: 16,        // Phase 130 Plan 04 — production voice screen (VOICE-02/03/04)
  VOICE_BODY: 17,
  VOICE_FOOTER: 18,
} as const
