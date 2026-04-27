const STORAGE_KEY = 'vigil_jwt'
const LEGACY_KEY = 'vigil_api_key'
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? (import.meta.env.DEV ? '' : 'https://api.vigilhub.io')

export const getStoredKey = (): string | null => sessionStorage.getItem(STORAGE_KEY)

export const storeKey = (key: string): void => {
  sessionStorage.setItem(STORAGE_KEY, key)
}

export const clearKey = (): void => {
  sessionStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_KEY) // D-10: one-time legacy cleanup
}

/**
 * Sign out of Vigil.
 *
 * Clears the JWT (sessionStorage) and legacy API key (localStorage), then
 * dispatches a `vigil:signout` CustomEvent on `window` so App-level state
 * (e.g. `isAuthenticated`) can flip to false. Without the event, the /auth
 * route guard (`isAuthenticated ? <Navigate to="/" /> : <AuthPage />`)
 * bounces the user straight back to the dashboard after clearing the JWT,
 * causing a 401 cascade instead of landing on the login screen.
 *
 * Call this from any sign-out UI (Layout header, SettingsPage) instead of
 * inlining `clearKey()`.
 */
export const signOut = (): void => {
  clearKey()
  window.dispatchEvent(new CustomEvent('vigil:signout'))
}

/**
 * Authenticated fetch with cross-cutting 401 'Session expired' handler.
 *
 * Phase 110 (AUTH-09 D-19): when any authenticated request returns
 *   401 + body { error: 'Session expired' }
 * (the literal body shape from bearerAuth's password_changed_at gate — see
 * vigil-core/src/middleware/auth.ts), this wrapper:
 *   1. Clones the response so the caller can still read the body
 *   2. Calls signOut() — clears sessionStorage and dispatches 'vigil:signout'
 *   3. Forces a full-page navigation to /auth
 * The original Response is still returned to the caller. The body
 * discriminator (`'Session expired'`) is the contract — any endpoint that
 * returns a 401 with a different body (e.g., /v1/auth/change-password's
 * 'Invalid credentials' on wrong current password) is UNAFFECTED.
 *
 * Without this handler, every authenticated PWA route degrades the moment a
 * user changes their password on another device — every poll/fetch returns a
 * cryptic 401 the PWA cannot recover from.
 */
export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  const authHeaders: Record<string, string> = key
    ? { Authorization: `Bearer ${key}` }
    : {}
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
  })

  // Phase 110 (AUTH-09 D-19): cross-cutting 401 'Session expired' detection.
  if (res.status === 401) {
    // Clone before reading — the original Response body is still consumable
    // by the caller. Try/catch the JSON parse: a non-JSON 401 body (e.g.,
    // proxy HTML page) must not throw.
    try {
      const probe = res.clone()
      const body = (await probe.json()) as { error?: string }
      if (body?.error === 'Session expired') {
        signOut()
        // Full-page navigation guarantees a clean state regardless of any
        // in-flight React Router transitions. The signout event is also
        // dispatched by signOut() above for any listeners that mount before
        // the navigation tears the page down.
        if (typeof window !== 'undefined' && window.location) {
          // ?reason=session_expired gives AuthPage context to show a banner —
          // without it the user arrives with no explanation for the bounce.
          window.location.href = '/auth?reason=session_expired'
        }
      }
    } catch {
      // Non-JSON 401 body — pass through unchanged. The caller's existing
      // error-handling code path runs.
    }
  }

  return res
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
 * iOS standalone PWA mode. GOOGLE_REDIRECT_URI must resolve to
 * `{server_origin}/v1/auth/google/callback`.
 *
 * Hotfix 2026-04-26: the Phase 102 server-side change moved
 * `GET /v1/auth/google` behind bearerAuth so the state JWT can carry the
 * authenticated userId. Browsers do NOT send Authorization headers on
 * `window.location.href` navigations, so the legacy GET path returns 401.
 *
 * Two-step replacement:
 *   1. POST `/v1/auth/google/init` via vigilFetch (Authorization header
 *      attached from sessionStorage) — server returns `{redirect_url}` with
 *      the state JWT pre-baked.
 *   2. window.location.href = redirect_url — direct navigation to Google's
 *      consent screen, no further vigil-core hop required.
 *
 * Throws if init fails (e.g. session expired, network error). Callers should
 * surface a user-facing error.
 */
export async function redirectToGoogleAuth(): Promise<void> {
  const res = await vigilFetch('/v1/auth/google/init', { method: 'POST' })
  if (!res.ok) {
    throw new Error(
      `Google OAuth init failed: ${res.status} ${res.statusText}`,
    )
  }
  const body = (await res.json()) as { redirect_url?: string }
  if (!body.redirect_url || typeof body.redirect_url !== 'string') {
    throw new Error('Google OAuth init returned no redirect_url')
  }
  window.location.href = body.redirect_url
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

// ── Calendar source picker (Phase 115 CAL-01) ─────────────────────────

/** PWA-side mirror of CalendarInfo from vigil-core/src/services/calendar-service.ts. */
export interface CalendarInfo {
  id: string
  name: string
  color: string | null
  primary: boolean
}

/** Discriminated union mirroring the GET /v1/calendar/list response shape. */
export type CalendarListResult =
  | { status: 'ok'; calendars: CalendarInfo[] }
  | { status: 'needs_reauth' }
  | { status: 'error'; error: string }

/**
 * Fetches the user's Google calendars for the source picker.
 * Returns the full discriminated-union response — caller routes on status.
 * Throws only on transport failures (HTTP non-200 OR network error).
 */
export async function getCalendarList(): Promise<CalendarListResult> {
  const res = await vigilFetch('/v1/calendar/list')
  if (!res.ok) throw new Error(`Failed to fetch calendar list: ${res.status}`)
  return (await res.json()) as CalendarListResult
}

/**
 * Persists the user's calendar selection. Server overwrites wholesale.
 * Empty array IS valid input — see CAL-01 D-11 (empty = all calendars).
 * Cap is enforced server-side at 1000 IDs (T-115-01-02).
 */
export async function setCalendarSelections(ids: string[]): Promise<void> {
  const res = await vigilFetch('/v1/calendar/selections', {
    method: 'PUT',
    body: JSON.stringify({ selectedCalendarIds: ids }),
  })
  if (!res.ok) throw new Error(`Failed to save calendar selections: ${res.status}`)
}
