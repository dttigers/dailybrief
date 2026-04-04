// Vigil Core API client — typed fetch wrapper for G2 plugin

import type { VigilSummary, VigilBrief, VigilAffirmation } from './types.ts'

const BASE_URL = 'http://localhost:3001/v1'

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

/** GET /v1/summary */
export async function fetchSummary(): Promise<VigilSummary> {
  try {
    const res = await fetch(`${BASE_URL}/summary`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as VigilSummary
  } catch (err) {
    console.error('[vigil-g2] fetchSummary failed:', err)
    return EMPTY_SUMMARY
  }
}

/** GET /v1/brief */
export async function fetchBrief(): Promise<VigilBrief> {
  try {
    const res = await fetch(`${BASE_URL}/brief`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as VigilBrief
  } catch (err) {
    console.error('[vigil-g2] fetchBrief failed:', err)
    return EMPTY_BRIEF
  }
}

/** POST /v1/affirmation */
export async function fetchAffirmation(): Promise<VigilAffirmation> {
  try {
    const res = await fetch(`${BASE_URL}/affirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as VigilAffirmation
  } catch (err) {
    console.error('[vigil-g2] fetchAffirmation failed:', err)
    return FALLBACK_AFFIRMATION
  }
}
