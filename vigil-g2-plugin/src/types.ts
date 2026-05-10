// Vigil API response types — minimal subset for G2 plugin home screen

/** GET /v1/summary response shape */
export interface VigilSummary {
  total: number
  byCategory: Record<string, number>
  tasksByStatus: Record<string, number>
  favorites: number
  linkedThoughts: number
  recent: Array<{
    id: number
    content: string
    category: string | null
    source: string
    createdAt: string
    tags: string[]
  }>
}

/** GET /v1/brief response shape */
export interface VigilBrief {
  date: string
  counts: {
    total: number
    byCategory: Record<string, number>
    tasksByStatus: Record<string, number>
    favorites: number
    unprocessed: number
  }
  openTasks: Array<{
    id: number
    content: string
    taskStatus: string | null
    createdAt: string
    tags: string[]
  }>
  recentThoughts: Array<{
    id: number
    content: string
    category: string | null
    source: string
    createdAt: string
    tags: string[]
  }>
  recentTherapy: Array<{
    id: number
    content: string
    therapyClassification: string | null
    createdAt: string
    tags: string[]
  }>
  todayCaptures: number
}

/** POST /v1/affirmation response shape */
export interface VigilAffirmation {
  affirmation: string
  cached?: boolean
}

/** POST /v1/prioritize response shape */
export interface VigilPrioritized {
  prioritizedCaseNumbers: string[]
  cached?: boolean
}

// Phase 124 (AGENT-API-03 / AGENT-HUD-01): agent_events row shapes
// mirror vigil-core/src/routes/agent-events.ts:64-74 response shape.
// The 5 event values are locked per Phase 122 D-01 (drift-detector pinned).
export type AgentEventType =
  | "needs_input"
  | "task_complete"
  | "task_failed"
  | "milestone"
  | "heartbeat"

export interface AgentEvent {
  event: AgentEventType
  message: string | null
  eventTimestamp: string // ISO-8601 from vigil-core
}

export interface AgentSessionRow {
  sessionId: string
  label: string
  host: string
  lastEvent: AgentEvent
  eventCount: number
}
