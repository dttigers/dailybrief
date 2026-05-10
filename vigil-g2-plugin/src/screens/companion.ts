/**
 * Phase 124 (AGENT-HUD-01 / AGENT-HUD-02): Companion HUD screen.
 *
 * 3-line glanceable HUD surfacing Claude Code session state on the G2.
 *   Line 1: session label (truncated 30 + '…')
 *   Line 2: state — 'idle' | 'running' | 'waiting for input' | 'done' | 'failed'
 *   Line 3: last event message (truncated 32 + '…')
 *
 * Banner overlay states (UI-SPEC §"Banner overlay states"):
 *   needs_input    → [NEEDS INPUT]  persistent until DOUBLE_CLICK ack
 *   task_failed    → [TASK FAILED]  persistent until DOUBLE_CLICK ack
 *   task_complete  → [DONE]         3s toast (auto-clear)
 *   milestone      → [MILESTONE]    3s toast
 *   heartbeat      → no banner; updates state line to 'running' if not
 *
 * Header rightSide priority (UI-SPEC §"Offline Indicator"):
 *   1. SSE disconnected AND ≥2 sessions: '! 2/3'
 *   2. SSE disconnected AND ≤1 session:  '!'
 *   3. SSE connected AND ≥2 sessions:    '2/3'
 *   4. Else: undefined → header falls back to HH:MM
 *
 * D-08: DOUBLE_CLICK is the only Companion tap event (handled in
 * navigation.ts handleNavEvent). Single-tap and long-press are deferred
 * per SEED-011 (single-tap is sim-only on G2; long-press absent from
 * OsEventTypeList).
 */
import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import type { AgentSessionRow, AgentEvent, AgentEventType } from '../types.ts'
import { DISPLAY_WIDTH, ContainerId } from '../constants.ts'
import { buildVigilHeader } from './header.ts'

const LABEL_MAX = 30
const MESSAGE_MAX = 32
const TOAST_MS = 3000

const STATE_LINE: Record<AgentEventType, string> = {
  needs_input: 'waiting for input',
  task_complete: 'done',
  task_failed: 'failed',
  milestone: 'running',
  heartbeat: 'running',
}

type BannerType = 'needs_input' | 'task_failed' | 'task_complete' | 'milestone'

interface BannerState {
  type: BannerType
  sessionId: string
  expiresAt?: number // for toast types only
}

// ── Module-level state cache (work-orders.ts:14-20 precedent) ─────────
let activeSessions: AgentSessionRow[] = []
let currentSessionIndex = 0
let bannerState: BannerState | null = null
let sseConnected = true
let nowFn: () => number = () => Date.now()

// ── State accessors / mutators (consumed by navigation.ts D-08 branch) ─

export function hydrateActiveSessions(sessions: AgentSessionRow[]): void {
  activeSessions = [...sessions]
  // Clamp index — keeps currentSessionIndex valid when sessions list shrinks.
  if (currentSessionIndex >= activeSessions.length) {
    currentSessionIndex =
      activeSessions.length === 0 ? 0 : activeSessions.length - 1
  }
}

export function getActiveSessions(): AgentSessionRow[] {
  return activeSessions
}

export function cycleSession(): void {
  if (activeSessions.length === 0) return
  currentSessionIndex = (currentSessionIndex + 1) % activeSessions.length
}

export function ackBanner(): void {
  bannerState = null
}

export function hasActiveBanner(): boolean {
  if (bannerState === null) return false
  if (bannerState.expiresAt === undefined) return true // persistent
  return bannerState.expiresAt > nowFn()
}

export function setSseConnected(connected: boolean): void {
  sseConnected = connected
}

export function isSseConnected(): boolean {
  return sseConnected
}

/**
 * Apply an incoming agent event from SSE. Updates activeSessions + bannerState.
 * Returns toastMs > 0 if caller should schedule a 3s rebuild to clear the
 * toast, else null.
 */
export function applyAgentEvent(row: {
  sessionId: string
  label?: string
  host?: string
  event: AgentEventType
  message: string | null
  eventTimestamp: string
}): { toastMs: number | null } {
  const idx = activeSessions.findIndex((s) => s.sessionId === row.sessionId)
  const lastEvent: AgentEvent = {
    event: row.event,
    message: row.message,
    eventTimestamp: row.eventTimestamp,
  }
  if (idx >= 0) {
    activeSessions[idx] = {
      ...activeSessions[idx],
      lastEvent,
      eventCount: activeSessions[idx].eventCount + 1,
    }
    currentSessionIndex = idx // most-recent-event session takes the lead (D-09)
  } else {
    activeSessions.push({
      sessionId: row.sessionId,
      label: row.label ?? row.sessionId,
      host: row.host ?? '',
      lastEvent,
      eventCount: 1,
    })
    currentSessionIndex = activeSessions.length - 1
  }

  // Banner state machine
  switch (row.event) {
    case 'needs_input':
    case 'task_failed':
      bannerState = { type: row.event, sessionId: row.sessionId }
      return { toastMs: null }
    case 'task_complete':
    case 'milestone':
      bannerState = {
        type: row.event,
        sessionId: row.sessionId,
        expiresAt: nowFn() + TOAST_MS,
      }
      return { toastMs: TOAST_MS }
    case 'heartbeat':
    default:
      // No banner. Caller may still want to rebuild for state-line refresh.
      return { toastMs: null }
  }
}

// ── Internal helpers ────────────────────────────────────────────────

function truncate(s: string | null | undefined, max: number): string {
  const v = s ?? ''
  return v.length > max ? v.slice(0, max) + '…' : v
}

function emptyStateBottomLine(): string {
  // No active sessions in cache. The "last 24h summary" path requires the
  // hydrate caller to pass at least one row; once activeSessions is empty
  // (true emptiness), only the fallback string is structurally available.
  return 'No Claude Code activity yet'
}

function computeRightSide(): string | undefined {
  const offline = sseConnected ? '' : '!'
  const sessions =
    activeSessions.length >= 2
      ? `${currentSessionIndex + 1}/${activeSessions.length}`
      : ''
  const combined = [offline, sessions].filter(Boolean).join(' ')
  return combined || undefined
}

function computeBodyLines(): {
  line1: string
  line2: string
  line3: string
  bannerActive: boolean
} {
  // Empty state
  if (activeSessions.length === 0) {
    return {
      line1: 'No active sessions',
      line2: 'idle',
      line3: emptyStateBottomLine(),
      bannerActive: false,
    }
  }

  const session = activeSessions[currentSessionIndex]
  const banner = hasActiveBanner() ? bannerState : null

  // Banner overlay (persistent or active toast)
  if (banner) {
    const bannerLabel: Record<BannerType, string> = {
      needs_input: '[NEEDS INPUT]',
      task_failed: '[TASK FAILED]',
      task_complete: '[DONE]',
      milestone: '[MILESTONE]',
    }
    return {
      line1: bannerLabel[banner.type],
      line2: truncate(session.label, LABEL_MAX),
      line3: truncate(
        session.lastEvent.message ?? session.lastEvent.event,
        MESSAGE_MAX,
      ),
      bannerActive: true,
    }
  }

  // Normal 3-line HUD
  return {
    line1: truncate(session.label, LABEL_MAX),
    line2: STATE_LINE[session.lastEvent.event],
    line3: truncate(
      session.lastEvent.message ?? session.lastEvent.event,
      MESSAGE_MAX,
    ),
    bannerActive: false,
  }
}

function buildContainers(): TextContainerProperty[] {
  const { line1, line2, line3, bannerActive } = computeBodyLines()

  const header = buildVigilHeader(
    ContainerId.COMPANION_HEADER,
    'companion-header',
    computeRightSide(),
  )

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 40,
    width: DISPLAY_WIDTH,
    height: 210,
    borderWidth: 1,
    borderColor: 15,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.COMPANION_BODY,
    containerName: 'companion-body',
    content: `${line1}\n${line2}\n${line3}`,
    isEventCapture: 1,
  })

  const footer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 250,
    width: DISPLAY_WIDTH,
    height: 38,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: ContainerId.COMPANION_FOOTER,
    containerName: 'companion-footer',
    content: bannerActive
      ? '↓ work orders   () ack banner'
      : '↓ work orders   () double-tap',
    isEventCapture: 0,
  })

  return [header, body, footer]
}

// ── Public exports (build / rebuild) ────────────────────────────────

export function buildCompanionScreen(): CreateStartUpPageContainer {
  const containers = buildContainers()
  return new CreateStartUpPageContainer({
    containerTotalNum: containers.length,
    textObject: containers,
  })
}

export function rebuildCompanionScreen(): RebuildPageContainer {
  const containers = buildContainers()
  return new RebuildPageContainer({
    containerTotalNum: containers.length,
    textObject: containers,
  })
}

// ── Test hooks ──────────────────────────────────────────────────────

export function _resetState(): void {
  activeSessions = []
  currentSessionIndex = 0
  bannerState = null
  sseConnected = true
  nowFn = () => Date.now()
}

export function _setNow(fn: () => number): void {
  nowFn = fn
}

export function _getBannerState(): BannerState | null {
  return bannerState
}
