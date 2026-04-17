const STORAGE_KEY = 'vigil_api_key'
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? (import.meta.env.DEV ? '' : 'https://api.vigilhub.io')

export const getStoredKey = (): string | null => localStorage.getItem(STORAGE_KEY)

export const storeKey = (key: string): void => {
  localStorage.setItem(STORAGE_KEY, key)
}

export const clearKey = (): void => {
  localStorage.removeItem(STORAGE_KEY)
}

export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  const authHeaders: Record<string, string> = key
    ? { Authorization: `Bearer ${key}` }
    : {}
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
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
  window?: 'all'
  taskStatus?: string
  excludeDone?: boolean
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
  if (params.window) qs.set('window', params.window)
  if (params.taskStatus) qs.set('taskStatus', params.taskStatus)
  if (params.excludeDone === false) qs.set('excludeDone', 'false')
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
  notes: string
  status: string
  syncedAt: string
  lastChangeAt: string | null
  lastChangeSummary: string | null
  archivedAt: string | null
}

export async function getWorkOrders(filter?: 'active' | 'archived' | 'all'): Promise<{ data: WorkOrderApiResponse[] }> {
  const params = filter ? `?filter=${filter}` : ''
  const res = await vigilFetch(`/v1/work-orders${params}`)
  if (!res.ok) throw new Error(`Failed to fetch work orders: ${res.status}`)
  return res.json()
}

export async function unarchiveWorkOrder(caseNumber: string): Promise<{ caseNumber: string; archivedAt: null }> {
  const res = await vigilFetch(`/v1/work-orders/${encodeURIComponent(caseNumber)}/unarchive`, { method: 'PUT' })
  if (!res.ok) throw new Error(`Failed to unarchive work order: ${res.status}`)
  return res.json()
}

export async function deleteArchivedWorkOrders(): Promise<{ deleted: number }> {
  const res = await vigilFetch('/v1/work-orders/archived', { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete archived work orders: ${res.status}`)
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

export async function generateInsights(): Promise<{ insights: Insight[]; cached: boolean; generatedAt: string }> {
  const res = await vigilFetch('/v1/insights', {
    method: 'POST',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Insights failed: ${res.status}`)
  }
  return res.json()
}

export async function getInsightsCache(): Promise<{ insights: Insight[]; cached: boolean; generatedAt: string } | null> {
  const res = await vigilFetch('/v1/insights/cache')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Insights cache fetch failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Brief History API
// ---------------------------------------------------------------------------

// --- Typed error for brief PDF fetch (Phase 99) ---------------------------

export type BriefPdfFetchErrorCode =
  | 'brief_pdf_not_stored'   // briefs row exists, no brief_pdfs bytes — regenerable
  | 'brief_not_found'        // no briefs row for this date — not regenerable
  | 'http_error'             // any other non-ok (500, 503, network)

export class BriefPdfFetchError extends Error {
  readonly code: BriefPdfFetchErrorCode
  readonly regenerable: boolean
  readonly status: number
  constructor(code: BriefPdfFetchErrorCode, regenerable: boolean, status: number, message: string) {
    super(message)
    this.name = 'BriefPdfFetchError'
    this.code = code
    this.regenerable = regenerable
    this.status = status
  }
}

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

  if (res.ok) {
    return res.blob()
  }

  // Non-OK: try to parse the structured error body locked by Phase 99 Plan 02.
  // Only 404 bodies are guaranteed to have { error, date, regenerable }; other
  // statuses fall through to the generic http_error path.
  if (res.status === 404) {
    let body: { error?: string; regenerable?: boolean } = {}
    try {
      body = await res.json()
    } catch {
      // Malformed 404 body — treat as generic not-found, not regenerable.
    }
    if (body.error === 'brief_pdf_not_stored') {
      throw new BriefPdfFetchError(
        'brief_pdf_not_stored',
        body.regenerable === true,
        404,
        "This brief's PDF isn't stored — regenerate to rebuild it",
      )
    }
    if (body.error === 'brief_not_found') {
      throw new BriefPdfFetchError(
        'brief_not_found',
        false,
        404,
        'Brief not found for this date',
      )
    }
    // Fallback for 404 without the expected shape.
    throw new BriefPdfFetchError('brief_not_found', false, 404, 'Brief not found')
  }

  throw new BriefPdfFetchError(
    'http_error',
    false,
    res.status,
    `Failed to load brief PDF: ${res.status}`,
  )
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

export async function getTherapyPatterns(): Promise<{ patterns: TherapyPattern[]; cached: boolean; generatedAt: string }> {
  const res = await vigilFetch('/v1/therapy/patterns', {
    method: 'POST',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Therapy patterns failed: ${res.status}`)
  }
  return res.json()
}

export async function generateTherapyPrep(): Promise<TherapyPrep & { cached: boolean; generatedAt: string }> {
  const res = await vigilFetch('/v1/therapy/prep', {
    method: 'POST',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Therapy prep failed: ${res.status}`)
  }
  return res.json()
}

export async function getTherapyPatternsCache(): Promise<{ patterns: TherapyPattern[]; cached: boolean; generatedAt: string } | null> {
  const res = await vigilFetch('/v1/therapy/cache?type=patterns')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Therapy patterns cache fetch failed: ${res.status}`)
  return res.json()
}

export async function getTherapyPrepCache(): Promise<(TherapyPrep & { cached: boolean; generatedAt: string }) | null> {
  const res = await vigilFetch('/v1/therapy/cache?type=prep')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Therapy prep cache fetch failed: ${res.status}`)
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

// ---------------------------------------------------------------------------
// Google OAuth (Phase 81 Plan 03)
// ---------------------------------------------------------------------------

export interface GoogleStatus {
  calendar: 'connected' | 'needs_auth'
  gmail: 'connected' | 'needs_auth'
  email?: string
}

/**
 * Fetch Google OAuth connection status.
 *
 * D-07 / Pitfall 6: 404 means "no token stored yet" (disconnected) — return null.
 * Non-404 non-ok responses indicate a real server error and must throw so the
 * UI can distinguish "disconnected" from "server broken".
 */
export async function getGoogleStatus(): Promise<GoogleStatus | null> {
  const res = await vigilFetch('/v1/google/status')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch Google status: ${res.status}`)
  return (await res.json()) as GoogleStatus
}

/**
 * Revoke the stored Google OAuth token server-side.
 */
export async function disconnectGoogle(): Promise<void> {
  const res = await vigilFetch('/v1/google/tokens', { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to disconnect Google: ${res.status}`)
}

/**
 * Trigger the Google OAuth flow via a full-page redirect.
 *
 * D-08 (reconciled): uses full-page navigation (NOT a popup) so it works inside
 * iOS standalone PWA mode. Endpoint is mounted at `/v1/auth/google` per
 * vigil-core/src/index.ts; GOOGLE_REDIRECT_URI must resolve to
 * `{server_origin}/v1/auth/google/callback`.
 */
export function redirectToGoogleAuth(): void {
  window.location.href = `${API_BASE}/v1/auth/google`
}

// ── Print schedule ─────────────────────────────────────────────────────────

export interface PrintSchedule {
  hour: number
  minute: number
  enabled: boolean
}

/**
 * Fetches the current print schedule from the server.
 * Returns defaults { hour: 6, minute: 0, enabled: true } if no schedule has been saved.
 */
export async function getPrintSchedule(): Promise<PrintSchedule> {
  const res = await vigilFetch('/v1/settings/print-schedule')
  if (!res.ok) throw new Error(`Failed to fetch print schedule: ${res.status}`)
  return res.json() as Promise<PrintSchedule>
}

/**
 * Persists the print schedule to the server.
 */
export async function setPrintSchedule(s: PrintSchedule): Promise<void> {
  const res = await vigilFetch('/v1/settings/print-schedule', {
    method: 'PUT',
    body: JSON.stringify(s),
  })
  if (!res.ok) throw new Error(`Failed to save print schedule: ${res.status}`)
}

// ── Generate schedule (Phase 86) ───────────────────────────────────────

export async function getGenerateSchedule(): Promise<PrintSchedule> {
  const res = await vigilFetch('/v1/settings/generate-schedule')
  if (!res.ok) throw new Error(`Failed to fetch generate schedule: ${res.status}`)
  return res.json() as Promise<PrintSchedule>
}

export async function setGenerateSchedule(s: PrintSchedule): Promise<void> {
  const res = await vigilFetch('/v1/settings/generate-schedule', {
    method: 'PUT',
    body: JSON.stringify(s),
  })
  if (!res.ok) throw new Error(`Failed to save generate schedule: ${res.status}`)
}

// ── Timezone (Phase 86) ────────────────────────────────────────────────

export interface TimezoneResponse {
  timezone: string
}

export async function getTimezone(): Promise<string> {
  const res = await vigilFetch('/v1/settings/timezone')
  if (!res.ok) throw new Error(`Failed to fetch timezone: ${res.status}`)
  const body = (await res.json()) as TimezoneResponse
  return body.timezone
}

export async function setTimezone(timezone: string): Promise<void> {
  const res = await vigilFetch('/v1/settings/timezone', {
    method: 'PUT',
    body: JSON.stringify({ timezone }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'unknown' }))) as { error: string }
    throw new Error(
      err.error === 'invalid_timezone' ? 'Invalid timezone' : `Failed (${res.status})`,
    )
  }
}

// ── Task status filter (Phase 91) ─────────────────────────────────────────

export type TaskStatusFilterValue = 'open' | 'done' | 'all'

export async function getTaskStatusFilter(): Promise<TaskStatusFilterValue> {
  try {
    const res = await vigilFetch('/v1/settings/task-status-filter')
    if (!res.ok) return 'open'
    const body = (await res.json()) as { filter?: string }
    const f = body.filter
    if (f === 'open' || f === 'done' || f === 'all') return f
    return 'open'
  } catch {
    return 'open'
  }
}

export async function putTaskStatusFilter(filter: TaskStatusFilterValue): Promise<void> {
  vigilFetch('/v1/settings/task-status-filter', {
    method: 'PUT',
    body: JSON.stringify({ filter }),
  }).catch(() => { /* fire-and-forget */ })
}
