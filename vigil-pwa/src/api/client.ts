const STORAGE_KEY = 'vigil_api_key'
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.vigilhub.io'

export const getStoredKey = (): string | null => localStorage.getItem(STORAGE_KEY)

export const storeKey = (key: string): void => {
  localStorage.setItem(STORAGE_KEY, key)
}

export const clearKey = (): void => {
  localStorage.removeItem(STORAGE_KEY)
}

export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

/**
 * Validate an API key by calling an authenticated endpoint.
 *
 * IMPORTANT: Do NOT use /v1/health — it is explicitly excluded from bearer auth
 * in vigil-core/src/index.ts and returns 200 for any request, even without a key.
 * Use /v1/summary which requires a valid bearer token.
 */
export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/summary`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Thoughts API
// ---------------------------------------------------------------------------

export interface ThoughtApiResponse {
  id: number
  content: string
  category: string | null
  confidence: number | null
  source: string
  createdAt: string
  modifiedAt: string
  taskStatus: string | null
  therapyClassification: string | null
  tags: string[]
  isFavorited: boolean
  projectId: number | null
}

export interface ThoughtsListResponse {
  data: ThoughtApiResponse[]
  total: number
  limit: number
  offset: number
}

export async function getThoughts(params: {
  category?: string
  q?: string
  limit?: number
  offset?: number
  projectId?: number
  unassigned?: boolean
  source?: string
  after?: string
  before?: string
  favoritesOnly?: boolean
}): Promise<ThoughtsListResponse> {
  const qs = new URLSearchParams()
  if (params.category) qs.set('category', params.category)
  if (params.q) qs.set('q', params.q)
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  if (params.projectId !== undefined) qs.set('projectId', String(params.projectId))
  if (params.unassigned) qs.set('unassigned', 'true')
  if (params.source) qs.set('source', params.source)
  if (params.after) qs.set('after', params.after)
  if (params.before) qs.set('before', params.before)
  if (params.favoritesOnly) qs.set('favoritesOnly', 'true')
  const res = await vigilFetch(`/v1/thoughts?${qs}`)
  if (!res.ok) throw new Error(`Failed to fetch thoughts: ${res.status}`)
  return res.json()
}

export async function createThought(content: string): Promise<ThoughtApiResponse> {
  const res = await vigilFetch('/v1/thoughts', {
    method: 'POST',
    body: JSON.stringify({ content, source: 'text' }),
  })
  if (!res.ok) throw new Error(`Failed to create thought: ${res.status}`)
  return res.json()
}

export async function triageThought(content: string): Promise<{ category: string; confidence: number }> {
  const res = await vigilFetch('/v1/triage', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`Triage failed: ${res.status}`)
  return res.json()
}

export async function updateThought(
  id: number,
  patch: { content?: string; category?: string; isFavorited?: boolean; taskStatus?: string; projectId?: number | null; therapyClassification?: string },
): Promise<ThoughtApiResponse> {
  // Only include defined (non-undefined) fields — sending category: null causes a 400
  const body: Record<string, unknown> = {}
  if (patch.content !== undefined) body.content = patch.content
  if (patch.category !== undefined && patch.category !== null) body.category = patch.category
  if (patch.isFavorited !== undefined) body.isFavorited = patch.isFavorited
  if (patch.taskStatus !== undefined) body.taskStatus = patch.taskStatus
  if (patch.projectId !== undefined) body.projectId = patch.projectId
  if (patch.therapyClassification !== undefined) body.therapyClassification = patch.therapyClassification

  const res = await vigilFetch(`/v1/thoughts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Update failed: ${res.status}`)
  return res.json()
}

export async function bulkDeleteThoughts(ids: number[]): Promise<{ deleted: number }> {
  const res = await vigilFetch('/v1/thoughts/bulk/delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(`Bulk delete failed: ${res.status}`)
  return res.json()
}

export async function bulkRecategorizeThoughts(ids: number[], category: string): Promise<{ updated: number }> {
  const res = await vigilFetch('/v1/thoughts/bulk/recategorize', {
    method: 'POST',
    body: JSON.stringify({ ids, category }),
  })
  if (!res.ok) throw new Error(`Bulk recategorize failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Projects API
// ---------------------------------------------------------------------------

export interface ProjectApiResponse {
  id: number
  name: string
  description: string | null
  status: string | null
  createdAt: string
  updatedAt: string
}

export async function getProjects(): Promise<ProjectApiResponse[]> {
  const res = await vigilFetch('/v1/projects')
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Work Orders API
// ---------------------------------------------------------------------------

export interface WorkOrderApiResponse {
  caseNumber: string
  store: string
  shortDescription: string
  trade: string
  location: string
  equipment: string
  priority: string
  contact: string
  state: string
  status: string
  syncedAt: string
}

export async function getWorkOrders(): Promise<{ data: WorkOrderApiResponse[] }> {
  const res = await vigilFetch('/v1/work-orders')
  if (!res.ok) throw new Error(`Failed to fetch work orders: ${res.status}`)
  return res.json()
}

export async function updateWorkOrderStatus(
  caseNumber: string,
  status: 'open' | 'inProgress' | 'done',
): Promise<{ caseNumber: string; status: string }> {
  const res = await vigilFetch(`/v1/work-orders/${encodeURIComponent(caseNumber)}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(`Failed to update work order status: ${res.status}`)
  return res.json()
}

export async function prioritizeWorkOrders(
  workOrders: WorkOrderApiResponse[],
): Promise<{ prioritizedCaseNumbers: string[]; cached: boolean }> {
  const res = await vigilFetch('/v1/prioritize', {
    method: 'POST',
    body: JSON.stringify({ workOrders }),
  })
  if (!res.ok) throw new Error(`Failed to prioritize work orders: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Chat API
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  response: string
  contextUsed: number
}

export async function sendChatMessage(
  messages: ChatMessage[],
  includeContext = true,
): Promise<ChatResponse> {
  const res = await vigilFetch('/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, includeContext }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Insights API
// ---------------------------------------------------------------------------

export interface Insight {
  type: 'pattern' | 'connection' | 'actionPrompt' | 'trend'
  title: string
  message: string
  confidence: number
  relatedThoughtIds: number[]
}

export async function generateInsights(
  thoughts: { id: number; content: string; category: string; createdAt: string }[],
  days = 7,
): Promise<{ insights: Insight[] }> {
  const res = await vigilFetch('/v1/insights', {
    method: 'POST',
    body: JSON.stringify({ thoughts, days }),
  })
  if (!res.ok) throw new Error(`Insights failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Brief History API
// ---------------------------------------------------------------------------

export interface BriefApiResponse {
  id: number
  date: string
  summary: unknown
  pdfFilename: string | null
  thoughtCount: number
  taskCount: number
  createdAt: string
}

export interface BriefsListResponse {
  data: BriefApiResponse[]
  total: number
  limit: number
  offset: number
}

export async function getBriefs(params?: { limit?: number; offset?: number }): Promise<BriefsListResponse> {
  const qs = new URLSearchParams()
  qs.set('limit', String(params?.limit ?? 50))
  if (params?.offset !== undefined) qs.set('offset', String(params.offset))
  const res = await vigilFetch(`/v1/briefs?${qs}`)
  if (!res.ok) throw new Error(`Failed to fetch briefs: ${res.status}`)
  return res.json()
}

export async function getBriefByDate(date: string): Promise<BriefApiResponse> {
  const res = await vigilFetch(`/v1/briefs/${date}`)
  if (!res.ok) throw new Error(`Failed to fetch brief for ${date}: ${res.status}`)
  return res.json()
}

export async function generateBrief(): Promise<Blob> {
  const res = await vigilFetch('/v1/brief/generate', {
    method: 'POST',
    headers: { 'Content-Type': '' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Brief generation failed: ${res.status}${text ? ` — ${text}` : ''}`)
  }
  return res.blob()
}

export async function getBriefPdf(date: string): Promise<Blob> {
  const res = await vigilFetch(`/v1/brief/${date}`, {
    headers: { 'Content-Type': '' },
  })
  if (!res.ok) throw new Error(`Failed to load brief PDF: ${res.status}`)
  return res.blob()
}

// ---------------------------------------------------------------------------
// Therapy API
// ---------------------------------------------------------------------------

export interface TherapyClassificationResult {
  classification: 'selfLearnable' | 'bringToTherapist'
  confidence: number
  reasoning: string
}

export interface TherapyPattern {
  theme: string
  description: string
  frequency: number
  trend: 'increasing' | 'stable' | 'decreasing'
  relatedThoughtIds: number[]
  confidence: number
}

export interface TherapyPrepItem {
  topic: string
  context: string
  urgency: 'high' | 'medium' | 'low'
  relatedThoughtIds: number[]
}

export interface TherapyPrep {
  items: TherapyPrepItem[]
  overallThemes: string[]
  suggestedFocus: string
}

export async function getTherapyPatterns(
  thoughts: { id: number; content: string; therapyClassification: string; createdAt: string }[],
  days = 30,
): Promise<{ patterns: TherapyPattern[] }> {
  const res = await vigilFetch('/v1/therapy/patterns', {
    method: 'POST',
    body: JSON.stringify({ thoughts, days }),
  })
  if (!res.ok) throw new Error(`Therapy patterns failed: ${res.status}`)
  return res.json()
}

export async function generateTherapyPrep(
  thoughts: { id: number; content: string; createdAt: string }[],
  patterns?: { theme: string; trend: string; confidence: number; description: string }[],
): Promise<TherapyPrep> {
  const res = await vigilFetch('/v1/therapy/prep', {
    method: 'POST',
    body: JSON.stringify({ thoughts, patterns }),
  })
  if (!res.ok) throw new Error(`Therapy prep failed: ${res.status}`)
  return res.json()
}

// ── Audio transcription ──────────────────────────────────────────────────────

export interface ProcessAudioResponse {
  id: number
  content: string
  source: string
  transcription: string
}

export async function processAudio(audio: string, mediaType: string): Promise<ProcessAudioResponse> {
  const res = await vigilFetch('/v1/process-audio', {
    method: 'POST',
    body: JSON.stringify({ audio, mediaType }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Audio processing failed: ${res.status}`)
  }
  return res.json()
}

// ── Chat sessions ────────────────────────────────────────────────────────────

export interface ChatSession {
  id: number
  title: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  messageCount?: number
  createdAt: string
  updatedAt: string
}

export async function getChatSessions(): Promise<{ data: ChatSession[] }> {
  const res = await vigilFetch('/v1/chat-sessions')
  if (!res.ok) throw new Error(`Failed to load chat sessions: ${res.status}`)
  return res.json()
}

export async function getChatSession(id: number): Promise<ChatSession> {
  const res = await vigilFetch(`/v1/chat-sessions/${id}`)
  if (!res.ok) throw new Error(`Failed to load chat session: ${res.status}`)
  return res.json()
}

export async function createChatSession(title?: string): Promise<ChatSession> {
  const res = await vigilFetch('/v1/chat-sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error(`Failed to create chat session: ${res.status}`)
  return res.json()
}

export async function updateChatSession(
  id: number,
  updates: { title?: string; messages?: Array<{ role: 'user' | 'assistant'; content: string }> },
): Promise<ChatSession> {
  const res = await vigilFetch(`/v1/chat-sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update chat session: ${res.status}`)
  return res.json()
}

export async function deleteChatSession(id: number): Promise<void> {
  const res = await vigilFetch(`/v1/chat-sessions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete chat session: ${res.status}`)
}
