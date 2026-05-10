// Vigil Core API client — typed fetch wrapper for G2 plugin

import type {
  VigilSummary,
  VigilBrief,
  VigilAffirmation,
  AgentSessionRow,
} from './types.ts'

// Phase 124 Plan 08: BASE_URL + API_KEY exported so main.ts can construct the
// SSE URL (`${BASE_URL}/agent-stream`) and pass the bearer to createSseClient
// without re-reading import.meta.env. Bearer goes ONLY into the Authorization
// header (via createSseClient's apiKey opt) — never URL-appended (memory:
// feedback_railway_variables_leak).
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/v1'
export const API_KEY = import.meta.env.VITE_API_KEY || ''

// Phase 106 G2-01: VITE_SCREENSHOT_MODE short-circuits fetches to deterministic demo
// data so Plan 05's simulator session produces stable, reproducible PNGs.
// Per D-11 and RESEARCH §Security T8-leak-1, this flag MUST NOT be set in
// .env.production — Vite dead-code-eliminates the demo branch when unset.
const SCREENSHOT_MODE = import.meta.env.VITE_SCREENSHOT_MODE

/** Returns headers for API requests, including Bearer auth when API_KEY is set */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`
  }
  return headers
}

/** Fallback data returned when API calls fail — ensures display always renders */
const EMPTY_SUMMARY: VigilSummary = {
  total: 0,
  byCategory: {},
  tasksByStatus: {},
  favorites: 0,
  linkedThoughts: 0,
  recent: [],
}

const EMPTY_BRIEF: VigilBrief = {
  date: new Date().toISOString().split('T')[0],
  counts: {
    total: 0,
    byCategory: {},
    tasksByStatus: {},
    favorites: 0,
    unprocessed: 0,
  },
  openTasks: [],
  recentThoughts: [],
  recentTherapy: [],
  todayCaptures: 0,
}

const FALLBACK_AFFIRMATION: VigilAffirmation = {
  affirmation: 'You are capable, you are enough, and today is full of possibility.',
}

// -------------------------------------------------------------------------
// Phase 106 G2-01 — deterministic demo data for store screenshots.
// These constants are dead-code-eliminated from production bundles when
// VITE_SCREENSHOT_MODE is unset (verified via Vite dead-code analysis).
// -------------------------------------------------------------------------

const DEMO_BRIEF: VigilBrief = {
  date: '2026-04-19',
  counts: {
    total: 12,
    byCategory: {},
    tasksByStatus: { open: 3 },
    favorites: 0,
    unprocessed: 0,
  },
  openTasks: [
    {
      id: 1,
      content: 'Follow up on PR-4827 review',
      taskStatus: 'open',
      createdAt: '2026-04-19T09:00:00Z',
      tags: [],
    },
    {
      id: 2,
      content: 'Draft Q2 OKRs — start with team themes',
      taskStatus: 'open',
      createdAt: '2026-04-19T10:00:00Z',
      tags: [],
    },
    {
      id: 3,
      content: 'Call plumber about kitchen sink',
      taskStatus: 'open',
      createdAt: '2026-04-19T11:00:00Z',
      tags: [],
    },
  ],
  recentThoughts: [],
  recentTherapy: [],
  todayCaptures: 7,
}

const DEMO_AFFIRMATION: VigilAffirmation = {
  affirmation: 'You are exactly where you need to be today.',
}

// Phase 125 (AGENT-HUD-01 screenshot fixture): deterministic Companion HUD
// content for Even Hub Preview slot capture. Single session in `needs_input`
// state — banner-active layout shows headline feature most clearly.
const DEMO_AGENT_SESSIONS: AgentSessionRow[] = [
  {
    sessionId: 'demo-session-1',
    label: 'vigil-core deploy',
    host: 'morrill-mac-mini',
    eventCount: 4,
    lastEvent: {
      event: 'needs_input',
      message: 'approve database migration?',
      eventTimestamp: '2026-05-10T19:32:00Z',
    },
  },
]

const DEMO_SUMMARY: VigilSummary = {
  total: 12,
  byCategory: {},
  tasksByStatus: { open: 3 },
  favorites: 0,
  linkedThoughts: 0,
  recent: [
    {
      id: 1,
      content: 'Follow up on PR-4827 review',
      category: 'task',
      source: 'manual',
      createdAt: '2026-04-19T09:00:00Z',
      tags: [],
    },
  ],
}

/** GET /v1/summary */
export async function fetchSummary(): Promise<VigilSummary> {
  if (SCREENSHOT_MODE) return DEMO_SUMMARY
  try {
    const res = await fetch(`${BASE_URL}/summary`, { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as VigilSummary
  } catch (err) {
    console.error('[vigil-g2] fetchSummary failed:', err)
    return EMPTY_SUMMARY
  }
}

/** GET /v1/brief */
export async function fetchBrief(): Promise<VigilBrief> {
  if (SCREENSHOT_MODE) return DEMO_BRIEF
  try {
    const res = await fetch(`${BASE_URL}/brief`, { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as VigilBrief
  } catch (err) {
    console.error('[vigil-g2] fetchBrief failed:', err)
    return EMPTY_BRIEF
  }
}

/** POST /v1/affirmation */
export async function fetchAffirmation(): Promise<VigilAffirmation> {
  if (SCREENSHOT_MODE) return DEMO_AFFIRMATION
  try {
    const res = await fetch(`${BASE_URL}/affirmation`, {
      method: 'POST',
      headers: authHeaders(),
      body: '{}',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as VigilAffirmation
  } catch (err) {
    console.error('[vigil-g2] fetchAffirmation failed:', err)
    return FALLBACK_AFFIRMATION
  }
}

/**
 * GET /v1/agent-sessions — Phase 124 (AGENT-HUD-01 / D-06 / D-10).
 *
 * Hydrates the Companion screen + glassesMenu landing-source check with the
 * caller's active + recent agent_events sessions (sliding 24h window per
 * Phase 121 D-B1). Returns [] on error (matches fetchSummary fallback
 * posture — display always renders, even on transient API failure).
 *
 * NOTE: never log the bearer or API_KEY in this helper; authHeaders()
 * already gates Authorization-header injection on a non-empty API_KEY.
 */
export async function fetchAgentSessions(): Promise<AgentSessionRow[]> {
  if (SCREENSHOT_MODE) return DEMO_AGENT_SESSIONS
  try {
    const res = await fetch(`${BASE_URL}/agent-sessions`, {
      headers: authHeaders(),
    })
    if (!res.ok) return []
    const json = await res.json()
    // GET /v1/agent-sessions returns { data: AgentSessionRow[] } — verified
    // at vigil-core/src/routes/agent-events.ts:64-74 (Phase 121 Plan 02).
    return Array.isArray(json?.data) ? (json.data as AgentSessionRow[]) : []
  } catch {
    return []
  }
}
