// Unified VIGIL header factory for all G2 screens.
// Per Phase 106 D-07 item 1: every screen gets the `VIGIL <context>` wordmark header.
// Per RESEARCH Pattern 2 option (b): wordmark on left, screen-specific label on right.
// Greyscale-only per D-05 (4-bit display, no background fill, borders+text only).

import { TextContainerProperty } from '@evenrealities/even_hub_sdk'

import { DISPLAY_WIDTH, DIVIDER, CHARS_PER_LINE } from '../constants.ts'

/** Format the current time as `HH:MM AM/PM` (12-hour, zero-padded hour). */
export function formatTime(): string {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const period = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours % 12 || 12
  return `${h12.toString().padStart(2, '0')}:${minutes} ${period}`
}

/**
 * Build the unified VIGIL header for any screen.
 *
 * Layout within CHARS_PER_LINE (32 chars):
 *   `VIGIL`    + padding + `<rightSide>` on line 1
 *   `<DIVIDER>` (32-char ━) on line 2
 *
 * @param containerID   Pass ContainerId.<SCREEN>_HEADER from constants.ts
 * @param containerName e.g. 'home-header' (kebab-case, matches existing pattern)
 * @param rightSide     Optional screen-specific label (e.g. '3 open', 'inProgress').
 *                      When omitted, falls back to current time (HH:MM AM/PM).
 */
export function buildVigilHeader(
  containerID: number,
  containerName: string,
  rightSide?: string,
): TextContainerProperty {
  const right = rightSide ?? formatTime()
  const WORDMARK = 'VIGIL'
  // Pad so WORDMARK sits left-aligned and `right` sits right-aligned within 32 chars.
  const leftPad = Math.max(1, CHARS_PER_LINE - WORDMARK.length - right.length)
  const headerContent = `${WORDMARK}${' '.repeat(leftPad)}${right}\n${DIVIDER}`

  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: 40,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID,
    containerName,
    content: headerContent,
    isEventCapture: 0,
  })
}
