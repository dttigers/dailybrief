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
import { isSessionVisibleInCycle } from '../lib/launch-source-helpers.ts'
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

// Phase 125 (AGENT-HUD-03 / D-02 / UI-SPEC §"Updated rightSide Priority Order"):
// module-level quiet-mode ref. Toggled by setQuietMode() invoked from main.ts
// when an SSE quiet_mode_changed frame arrives. Idempotent — setting the same
// value twice is a no-op.
let quietMode = false

// Phase 125 (D-04 hard-locked allowlist; UI-SPEC §"What Quiet Mode Suppresses").
// Defense-in-depth HUD-write filter — server-side suppression queue (Plan 05)
// is the primary mechanism, but the plugin filter exists because the synthetic
// state-bootstrap frame (D-03) narrows but doesn't eliminate the reconnect
// race window. Allowlist mirrors the AGENT-HUD-03 spec verbatim.
const QUIET_BANNER_ALLOWLIST = new Set<BannerType>(['needs_input', 'task_failed'])

// Phase 124 follow-up — ack tracking for banner-on-cycle/-hydrate.
// Key = `${sessionId}:${eventTimestamp}`. When the user ack's a banner via
// DOUBLE_CLICK, we record it here so cycling away and back doesn't re-show
// the same banner. New events (different eventTimestamp) on the same
// session create a new key and re-trigger the banner — correct UX for
// "Claude Code asked, I answered, now it's asking again."
const ackedBannerKeys: Set<string> = new Set()

function bannerKeyFor(session: AgentSessionRow): string {
  return `${session.sessionId}:${session.lastEvent.eventTimestamp}`
}

function bannerEligibleType(event: AgentEventType): BannerType | null {
  if (event === 'needs_input' || event === 'task_failed') return event
  // task_complete / milestone are toasts (3s self-clearing) — only set
  // by live SSE events via applyAgentEvent, never re-derived from cache.
  return null
}

/**
 * Recompute the persistent banner overlay for the current session.
 * Called after `hydrateActiveSessions` and `cycleSession` so cycling to
 * a session whose lastEvent is needs_input/task_failed shows the banner
 * (unless previously ack'd) — closes the gap between live-SSE-driven
 * bannerState and cache-driven viewing.
 *
 * Toast banners (task_complete / milestone) are NOT re-derived: they're
 * by design ephemeral and tied to live event delivery.
 */
function recomputePersistentBannerForCurrent(): void {
  if (activeSessions.length === 0) {
    if (bannerState && bannerState.expiresAt === undefined) bannerState = null
    return
  }
  const session = activeSessions[currentSessionIndex]
  // Don't clobber an active toast (task_complete / milestone with expiresAt).
  if (bannerState && bannerState.expiresAt !== undefined) return

  const bannerType = bannerEligibleType(session.lastEvent.event)
  if (!bannerType) {
    // Current session has no banner-eligible event → clear any stale
    // persistent banner (e.g., user cycled away from a needs_input session).
    if (bannerState && bannerState.expiresAt === undefined) bannerState = null
    return
  }

  const key = bannerKeyFor(session)
  if (ackedBannerKeys.has(key)) {
    // User already ack'd this specific event — keep banner cleared.
    if (bannerState && bannerState.sessionId === session.sessionId) {
      bannerState = null
    }
    return
  }

  bannerState = { type: bannerType, sessionId: session.sessionId }
}

// ── State accessors / mutators (consumed by navigation.ts D-08 branch) ─

export function hydrateActiveSessions(sessions: AgentSessionRow[]): void {
  // Capture identity (sessionId) before replacing the cache so we can
  // preserve "which session the user was viewing" across hydrate. The
  // server returns rows ordered by lastEvent.eventTimestamp DESC — that
  // order rarely matches the live-SSE-set currentSessionIndex, so a naive
  // index-only restore would silently jump the user to a different
  // session (and recompute would set the wrong banner). Capture before
  // filter so even sessions filtered out can be detected as "no longer
  // in cache" and fall back to 0.
  const previousSessionId =
    activeSessions[currentSessionIndex]?.sessionId

  // Phase 124 follow-up — cycle-list filter (was previously absent — every
  // row from /v1/agent-sessions appeared in the cycle, including hours-old
  // task_complete sessions). Looser than landing-routing's isSessionActive:
  // stale 5min cutoff + hide only task_complete; task_failed STAYS in cycle
  // so its persistent banner can show and the user can ack (D-08).
  activeSessions = sessions.filter((s) => isSessionVisibleInCycle(s, nowFn()))

  // Restore index by sessionId match. Falls back to 0 (most-recent per the
  // server's eventTimestamp-DESC ordering) if the previous session was
  // filtered out or there was no previous session.
  if (previousSessionId !== undefined) {
    const newIdx = activeSessions.findIndex(
      (s) => s.sessionId === previousSessionId,
    )
    currentSessionIndex = newIdx >= 0 ? newIdx : 0
  } else {
    currentSessionIndex = 0
  }
  // Defensive clamp (should be unreachable after the above).
  if (currentSessionIndex >= activeSessions.length) {
    currentSessionIndex =
      activeSessions.length === 0 ? 0 : activeSessions.length - 1
  }

  // Phase 124 follow-up — recompute persistent banner from cache so
  // hydrating a cache that contains an unacked needs_input/task_failed
  // session shows the banner overlay (was: banner only fired on live SSE).
  recomputePersistentBannerForCurrent()
}

export function getActiveSessions(): AgentSessionRow[] {
  return activeSessions
}

export function cycleSession(): void {
  if (activeSessions.length === 0) return
  currentSessionIndex = (currentSessionIndex + 1) % activeSessions.length
  // Phase 124 follow-up — show banner for the newly-current session if its
  // lastEvent is needs_input/task_failed and not previously ack'd.
  recomputePersistentBannerForCurrent()
}

export function ackBanner(): void {
  // Phase 124 follow-up — record the ack against the current banner's
  // (sessionId, eventTimestamp) key so cycling away and back doesn't
  // re-show this same banner. New events on the same session create a
  // new key and re-trigger the banner.
  if (bannerState && activeSessions.length > 0) {
    const session = activeSessions.find((s) => s.sessionId === bannerState!.sessionId)
    if (session) ackedBannerKeys.add(bannerKeyFor(session))
  }
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

// Phase 125 (AGENT-HUD-03 / D-02): mutator + getter for module-level quietMode
// ref. setQuietMode is invoked from main.ts when an SSE quiet_mode_changed
// frame arrives. Idempotent — same value twice is a no-op.
export function setQuietMode(next: boolean): void {
  quietMode = next
}

export function isQuietMode(): boolean {
  return quietMode
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
  // Phase 125 (UI-SPEC §"Updated rightSide Priority Order"): Q glyph
  // prepended before offline + sessions. Strict superset of Phase 124 —
  // quiet=false path returns identical output, preserving the Phase 124
  // D-14 byte-identity invariant.
  const quiet = quietMode ? 'Q' : ''
  const offline = sseConnected ? '' : '!'
  const sessions =
    activeSessions.length >= 2
      ? `${currentSessionIndex + 1}/${activeSessions.length}`
      : ''
  const combined = [quiet, offline, sessions].filter(Boolean).join(' ')
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
  // Phase 125 (AGENT-HUD-03 / Pattern 5 defense-in-depth): server-side
  // suppression queue (Plan 05) is the primary mechanism — most non-allowlist
  // events never reach the plugin while Quiet is on. The plugin-side filter
  // exists because the synthetic state-bootstrap frame (D-03) narrows but
  // doesn't eliminate the reconnect race window, and because cache cycling
  // (cycleSession) can surface a banner that arrived before quietMode flipped.
  // UI-SPEC §"What Quiet Mode Suppresses" — allowlist = { needs_input, task_failed }.
  const rawBanner = hasActiveBanner() ? bannerState : null
  const banner =
    rawBanner && quietMode && !QUIET_BANNER_ALLOWLIST.has(rawBanner.type)
      ? null
      : rawBanner

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
    'comp-header',
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
    containerName: 'comp-body',
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
    containerName: 'comp-footer',
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
  ackedBannerKeys.clear()
  // Phase 125: ensure quiet-mode ref returns to its compile-time default
  // between tests so cross-test pollution doesn't surface a Q glyph in
  // Phase 124 baseline tests.
  quietMode = false
}

export function _setNow(fn: () => number): void {
  nowFn = fn
}

export function _getBannerState(): BannerState | null {
  return bannerState
}
