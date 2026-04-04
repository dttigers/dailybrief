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
