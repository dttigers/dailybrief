# Phase 64: Thoughts Dashboard - Research

**Researched:** 2026-04-12
**Domain:** React/TypeScript PWA — list, filter, search, capture, and inline-edit thoughts
**Confidence:** HIGH (all key facts verified directly from codebase sources)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| THOUGHT-01 | User can view all thoughts with category filtering (same categories as Mac dashboard) | GET /v1/thoughts?category= verified in thoughts.ts; categories: task, therapy, idea, reflection, project |
| THOUGHT-02 | User can search thoughts by text content | GET /v1/thoughts?q= uses PostgreSQL full-text search via plainto_tsquery; verified in thoughts.ts line 106 |
| THOUGHT-03 | User can capture a new text thought from the PWA | POST /v1/thoughts + POST /v1/triage flow verified in thoughts.ts + triage.ts |
| THOUGHT-04 | User can edit an existing thought's content inline | PUT /v1/thoughts/:id accepts partial update body; content field verified in thoughts.ts line 269 |
</phase_requirements>

---

## Summary

Phase 63 delivered a complete PWA shell: React 19 + Vite 8 + Tailwind 4 + React Router 7, API client with bearer auth, responsive Layout component, and offline detection. Phase 64 replaces the `DashboardPage.tsx` placeholder with a real thoughts dashboard. All backend endpoints are already live at `api.vigilhub.io`.

The API surface is fully documented in `vigil-core/src/routes/thoughts.ts`. `GET /v1/thoughts` supports pagination (`limit`/`offset`, max 200 per page), full-text search (`q`), category filter, and returns `PaginatedResponse<ThoughtApiResponse>` — shape `{ data: ThoughtApiResponse[], total: number, limit: number, offset: number }`. The triage endpoint is a separate `POST /v1/triage` call that takes `{ content }` and returns `{ category, confidence }` — after which a second `PUT /v1/thoughts/:id` patches the category onto the created thought.

The Mac dashboard (DashboardViewModel.swift) implements debounced search, category tabs, and inline editing — these are the exact patterns to replicate in React. No new backend work is needed for this phase.

**Primary recommendation:** Build a single `ThoughtsPage` replacing `DashboardPage`, with three self-contained sub-components: `CategoryTabs`, `ThoughtList`, and `CaptureBar`. Use a custom `useThoughts` hook for all API state. Debounce search input at 300ms. Inline editing uses a controlled `<textarea>` swapped in on click, saved on blur/Enter.

---

## Standard Stack

### Core (all already installed in vigil-pwa)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^19.2.5 | UI rendering | Already installed [VERIFIED: package.json] |
| react-dom | ^19.2.5 | DOM rendering | Already installed [VERIFIED: package.json] |
| react-router | ^7.14.0 | Routing (useNavigate already used) | Already installed [VERIFIED: package.json] |
| tailwindcss | ^4.2.2 | Utility CSS | Already installed, zero-config via `@import "tailwindcss"` [VERIFIED: package.json] |
| typescript | ^6.0.2 | Type safety | Already installed [VERIFIED: package.json] |

### No New Packages Required
All required functionality is available with the existing stack:
- Debounced search: `setTimeout`/`clearTimeout` in a custom hook — no lodash.debounce needed
- Inline editing: controlled `<textarea>` element — no external library needed
- API calls: existing `vigilFetch` from `src/api/client.ts`

**Installation:** None. `node_modules` already present [VERIFIED: node_modules/.package-lock.json exists].

---

## API Contract (Verified from Source)

### GET /v1/thoughts — List with Filters
[VERIFIED: vigil-core/src/routes/thoughts.ts lines 59-172]

**Query parameters:**
| Param | Type | Notes |
|-------|------|-------|
| `q` | string | Full-text search via PostgreSQL `plainto_tsquery('english', ?)` |
| `category` | string | One of: `task`, `therapy`, `idea`, `reflection`, `project` |
| `source` | string | One of: `text`, `voice`, `image` |
| `taskStatus` | string | Filter by task status |
| `favoritesOnly` | `"true"` | Show only favorited thoughts |
| `projectId` | number | Filter by project; mutually exclusive with `unassigned` |
| `unassigned` | `"true"` | Show only thoughts without a project |
| `after` | ISO 8601 string | Created after date |
| `before` | ISO 8601 string | Created before date |
| `limit` | number | 1–200, default 50 |
| `offset` | number | Default 0 |

**Response shape:**
```typescript
// Source: vigil-core/src/routes/thoughts.ts PaginatedResponse type
interface ThoughtsListResponse {
  data: ThoughtApiResponse[];
  total: number;
  limit: number;
  offset: number;
}

interface ThoughtApiResponse {
  id: number;
  content: string;
  category: string | null;
  confidence: number | null;
  source: string;
  createdAt: string;       // ISO string
  modifiedAt: string;      // ISO string
  cloudKitRecordID: string;
  syncStatus: string;
  lastSyncedAt: string | null;
  taskStatus: string | null;
  therapyClassification: string | null;
  tags: string[];
  isFavorited: boolean;
  projectId: number | null;
}
```

**Sorted by:** `createdAt DESC` (newest first, always) [VERIFIED: thoughts.ts line 157]

### POST /v1/thoughts — Create
[VERIFIED: vigil-core/src/routes/thoughts.ts lines 203-243]

**Request body:**
```typescript
{ content: string; source: "text" | "voice" | "image"; category?: string; tags?: string[] }
```
- `content` required, non-empty
- `source` required — for PWA captures, always use `"text"`
- `category` optional — omit when calling triage first, then patch with PUT

**Response:** `ThoughtApiResponse` with HTTP 201

### POST /v1/triage — Categorize via Claude AI
[VERIFIED: vigil-core/src/routes/triage.ts]

**Request body:** `{ content: string }`
**Response:** `{ category: "task" | "therapy" | "idea" | "reflection" | "project"; confidence: number }`
- Returns 503 if `ANTHROPIC_API_KEY` not configured on server
- Returns 502 if Claude returns malformed JSON
- PWA must handle both error cases gracefully (fall back to uncategorized)

### PUT /v1/thoughts/:id — Partial Update
[VERIFIED: vigil-core/src/routes/thoughts.ts lines 246-345]

**Request body (all fields optional):**
```typescript
{ content?: string; category?: string; taskStatus?: string; isFavorited?: boolean; projectId?: number | null; tags?: string[] }
```
- Partial update — only send fields to change
- `projectId: null` means "unassign from project" (explicit null vs. absent key matters)
- Returns updated `ThoughtApiResponse`

---

## Architecture Patterns

### Recommended File Structure
```
vigil-pwa/src/
├── api/
│   └── client.ts            # existing — add getThoughts(), createThought(), updateThought(), triageThought()
├── hooks/
│   └── useOnlineStatus.ts   # existing
│   └── useThoughts.ts       # NEW — all thoughts API state
├── components/
│   └── Layout.tsx           # existing
│   └── OfflineBanner.tsx    # existing
│   └── CategoryTabs.tsx     # NEW — horizontal category filter tabs
│   └── ThoughtList.tsx      # NEW — virtualized/scrollable list
│   └── ThoughtRow.tsx       # NEW — single thought with inline edit
│   └── CaptureBar.tsx       # NEW — sticky bottom input + submit
│   └── SearchBar.tsx        # NEW — debounced search input
└── pages/
    └── AuthPage.tsx         # existing
    └── DashboardPage.tsx    # existing placeholder — REPLACE with ThoughtsPage import
    └── ThoughtsPage.tsx     # NEW — assembles sub-components, owns filter state
```

### Pattern 1: API Functions in client.ts
Add typed API functions to the existing `src/api/client.ts` file. Do not scatter `vigilFetch` calls across components.

```typescript
// Source: pattern inferred from existing client.ts structure [VERIFIED: vigil-pwa/src/api/client.ts]

export interface ThoughtsListResponse {
  data: ThoughtApiResponse[];
  total: number;
  limit: number;
  offset: number;
}

export async function getThoughts(params: {
  category?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<ThoughtsListResponse> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  const res = await vigilFetch(`/v1/thoughts?${qs}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function createThought(content: string): Promise<ThoughtApiResponse> {
  const res = await vigilFetch('/v1/thoughts', {
    method: 'POST',
    body: JSON.stringify({ content, source: 'text' }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function triageThought(content: string): Promise<{ category: string; confidence: number }> {
  const res = await vigilFetch('/v1/triage', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Triage failed: ${res.status}`);
  return res.json();
}

export async function updateThought(id: number, patch: Partial<Pick<ThoughtApiResponse, 'content' | 'category' | 'isFavorited' | 'taskStatus'>>): Promise<ThoughtApiResponse> {
  const res = await vigilFetch(`/v1/thoughts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
  return res.json();
}
```

### Pattern 2: useThoughts Hook
Centralize all thoughts state in a custom hook. Components receive data and callbacks — no direct API calls in components.

```typescript
// src/hooks/useThoughts.ts — [ASSUMED pattern, based on React community practice]
export function useThoughts(category: string | null, searchQuery: string) {
  const [thoughts, setThoughts] = useState<ThoughtApiResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch on filter/search change
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getThoughts({ category: category ?? undefined, q: searchQuery || undefined, limit: 50 })
      .then(res => {
        if (!cancelled) { setThoughts(res.data); setTotal(res.total); }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [category, searchQuery]);

  // Optimistic update helper
  function updateLocal(id: number, patch: Partial<ThoughtApiResponse>) {
    setThoughts(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  return { thoughts, total, isLoading, error, updateLocal, refetch: () => { /* re-trigger */ } };
}
```

### Pattern 3: Debounced Search — 300ms
The Mac dashboard uses debounced search (DashboardViewModel.swift). Replicate with a simple timer:

```typescript
// In ThoughtsPage.tsx or SearchBar.tsx — [ASSUMED 300ms, standard convention]
const [inputValue, setInputValue] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');

useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(inputValue), 300);
  return () => clearTimeout(timer);
}, [inputValue]);
// Pass debouncedQuery to useThoughts — not inputValue
```

### Pattern 4: Inline Editing
Mac dashboard tracks `editingThoughtId` and `editedContent` in the view model. Same approach in React:

```typescript
// In ThoughtRow.tsx — [ASSUMED pattern]
const [isEditing, setIsEditing] = useState(false);
const [draft, setDraft] = useState(thought.content);

// Click content area → setIsEditing(true)
// textarea onBlur or Cmd+Enter → call updateThought(thought.id, { content: draft })
// On success: call updateLocal to patch optimistically, setIsEditing(false)
// On ESC: setDraft(thought.content), setIsEditing(false) — discard
```

### Pattern 5: Capture + Triage Flow
POST thought first (get ID), then POST triage, then PATCH category. Never block the user on triage — show a spinner on the row or silently update category after save.

```
User types → Submit →
  1. POST /v1/thoughts { content, source: "text" } → get { id, ... }
  2. Optimistically prepend to list (category=null)
  3. POST /v1/triage { content } → { category, confidence }
  4. PUT /v1/thoughts/:id { category } → update row in place
  5. If triage 503/502 → leave category null, no error banner needed
```

### Category Filter Values
[VERIFIED: vigil-core/src/routes/thoughts.ts lines 9-15]

```typescript
const CATEGORIES = ['all', 'task', 'therapy', 'idea', 'reflection', 'project'] as const;
// 'all' is a UI-only value — send no category param when 'all' is selected
```

Category tabs pattern (matching Mac sidebar):
- "All" (no filter) — show total count
- "Task" — category=task
- "Therapy" — category=therapy
- "Idea" — category=idea
- "Reflection" — category=reflection
- "Project" — category=project (note: this is thoughts about projects, not project records)

### Anti-Patterns to Avoid
- **Calling /v1/triage inline in list render:** Triage is async Claude AI — call it only on capture, not on display.
- **Fetching individual thoughts on edit:** PUT /v1/thoughts/:id returns the updated thought — use that as the source of truth, no refetch needed.
- **Using `limit: 200` by default:** Default limit is 50. With large datasets, pagination or infinite scroll will be needed — for Phase 64, load 50, show count, and add "Load more" only if needed. Keep it simple.
- **Blocking submit on triage:** If triage fails (503 = no Anthropic key), the thought still exists. Never prevent save because triage failed.
- **Resetting the whole list on inline edit:** Use optimistic `updateLocal` so the list doesn't flicker.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search | Client-side string matching | Pass `q=` to GET /v1/thoughts | PostgreSQL `plainto_tsquery` already handles tokenization, stemming, ranking [VERIFIED: thoughts.ts line 106] |
| AI categorization | Custom classification logic | POST /v1/triage | Claude-powered, already deployed [VERIFIED: triage.ts] |
| Debounce | Custom debounce utility | `setTimeout`/`clearTimeout` in `useEffect` | No lodash needed; 4-line pattern is sufficient |
| Date formatting | `Intl.DateTimeFormat` wrapper | Native `Intl.DateTimeFormat` or `toLocaleDateString()` | No date library needed for display |

**Key insight:** The entire backend is already built. Phase 64 is pure frontend work — every feature maps to an existing API endpoint.

---

## Common Pitfalls

### Pitfall 1: `category: null` vs. absent category in PUT body
**What goes wrong:** Sending `{ category: null }` in a PUT body will attempt to set category to null. The API validates category values — null is not in `VALID_CATEGORIES`, so it will return a 400 error.
**Why it happens:** JavaScript's JSON serialization includes null properties.
**How to avoid:** Only include `category` in the PUT body when you have a valid category string. Build the patch object conditionally:
```typescript
const patch: Record<string, unknown> = {};
if (content !== undefined) patch.content = content;
if (category !== undefined && category !== null) patch.category = category;
```
[VERIFIED: thoughts.ts lines 268-280 — validation only runs `if (body.category !== undefined)`]

### Pitfall 2: `projectId: null` semantics differ from absent key
**What goes wrong:** Omitting `projectId` from PUT body = "don't touch it". Sending `projectId: null` = "unassign from project". These are different.
**Why it happens:** The API explicitly documents this distinction (thoughts.ts line 284 comment: "JSON null means 'unassign', absent key means 'leave alone'").
**How to avoid:** Phase 64 does not need to touch projectId at all — leave it out of all PUT bodies.

### Pitfall 3: Triage endpoint can return 503
**What goes wrong:** Triage returns 503 if `ANTHROPIC_API_KEY` is not set on the server. This should not block capture.
**Why it happens:** The AI client check is explicit in triage.ts line 31: `if (!getAIClient()) return 503`.
**How to avoid:** Wrap the triage call in try/catch, treat any non-200 as "category unknown", continue with the uncategorized thought.

### Pitfall 4: Search uses `q` param (not `search` or `query`)
**What goes wrong:** Wrong query param name silently returns unfiltered results (the backend ignores unknown params).
**How to avoid:** The param is `q` — verified at thoughts.ts line 69.

### Pitfall 5: Re-render thrash from search → fetch → state update loop
**What goes wrong:** If `useEffect` depends on a non-debounced input, every keypress triggers a fetch. With React 19 and fast typing, this queues up many simultaneous requests.
**How to avoid:** The debounce pattern in Pattern 3 above. The `cancelled = true` cleanup in the effect cancels stale responses.

### Pitfall 6: DashboardPage.tsx is a placeholder — replace, don't wrap
**What goes wrong:** Wrapping the placeholder in ThoughtsPage adds an unnecessary component layer.
**How to avoid:** Replace the body of `DashboardPage.tsx` to render `<ThoughtsPage />`, OR rename the file — but the simpler approach is to change `DashboardPage.tsx` to import and render `ThoughtsPage`. App.tsx wires Layout → DashboardPage and should not need to change.

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from config.json — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed — no test runner in vigil-pwa/package.json [VERIFIED: package.json] |
| Config file | None |
| Quick run command | N/A — no test infrastructure |
| Full suite command | N/A |

### Wave 0 Gaps
The vigil-pwa has no test infrastructure. For Phase 64, given the YOLO mode config and no existing test infrastructure, the practical validation approach is manual smoke testing rather than automated unit tests:

- [ ] `vite build` exits 0 (build verification as proxy for type-correctness)
- [ ] Manual: navigate to app, see thought list
- [ ] Manual: select category tab, see filtered results
- [ ] Manual: type in search box, see results narrow after 300ms
- [ ] Manual: click capture bar, enter text, submit — thought appears in list
- [ ] Manual: click thought content, edit inline, save — content updates in place

**Automated check available:**
```bash
cd /Users/jamesonmorrill/Desktop/Local\ AI/dailybrief/vigil-pwa && npx vite build 2>&1 | tail -5
```
TypeScript compilation errors surface here. This is the primary automated gate.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vite build | ✓ | Available (vigil-pwa node_modules present) | — |
| vigil-pwa/node_modules | All packages | ✓ | Installed [VERIFIED: .package-lock.json] | npm install |
| api.vigilhub.io | Runtime API calls | ✓ | Live (Phase 63 context: Railway deploy complete) | localhost:3001 via VITE_API_BASE |

**Missing dependencies with no fallback:** None.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Auth already handled in Phase 63 (API key bearer) |
| V3 Session Management | no | localStorage key; single-user — no session tokens |
| V4 Access Control | no | All requests go through authenticated vigilFetch |
| V5 Input Validation | yes | thought content: trim whitespace, reject empty string before POST |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via thought content display | Tampering | React JSX auto-escapes — do NOT use dangerouslySetInnerHTML for content display |
| Long content causing layout overflow | Denial of Service (UX) | CSS `break-words` or `truncate` on thought content display |
| Empty POST to /v1/thoughts | Tampering | Trim + validate before calling createThought — don't rely on server alone |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 300ms debounce is appropriate | Architecture Patterns | Too low = excess API calls; too high = sluggish feel. Adjustable. |
| A2 | Load 50 thoughts per page is sufficient for Phase 64 (no pagination needed) | Architecture Patterns | If user has >50 thoughts and expects to see all, needs "load more" — low risk, easy to add |
| A3 | Triage 503 errors should be silently swallowed | Common Pitfalls | If ANTHROPIC_API_KEY is misconfigured on Railway and user expects auto-categorization, silent failure is confusing |

---

## Open Questions

1. **Does Phase 64 need pagination / load-more?**
   - What we know: API supports offset-based pagination; default limit is 50
   - What's unclear: How many thoughts does the user have? If >50, the list would be silently truncated
   - Recommendation: Start with limit=50, show total count below the list (e.g., "Showing 50 of 142"). Add "Load more" button if total > loaded count. Keep it simple.

2. **Should CategoryTabs show per-category counts?**
   - What we know: The API does not have a dedicated counts endpoint; counts require separate filtered queries
   - What's unclear: Whether counts are worth the extra API calls (5 extra requests per page load)
   - Recommendation: Omit counts in Phase 64 — just show category names. The Mac dashboard shows counts, but they add complexity. Can be added later.

3. **ThoughtsPage vs. DashboardPage naming**
   - What we know: App.tsx renders `<Layout><DashboardPage /></Layout>` on all `/*` routes
   - What's unclear: Whether future phases (WO, Projects) each get a separate page/route or replace DashboardPage
   - Recommendation: Keep `DashboardPage.tsx` as the entry point, have it render `<ThoughtsPage />` for now. Future phases will add routing (e.g., `/thoughts`, `/work-orders`) — that's Phase 65+ concern.

---

## Sources

### Primary (HIGH confidence)
- `vigil-core/src/routes/thoughts.ts` — complete API contract: query params, request/response shapes, validation logic, sort order
- `vigil-core/src/routes/triage.ts` — triage endpoint: request, response, error codes (503, 502)
- `vigil-core/src/routes/bulk.ts` — bulk endpoints (not needed in Phase 64, confirmed out of scope)
- `vigil-pwa/src/api/client.ts` — existing API client: vigilFetch, auth pattern, API_BASE
- `vigil-pwa/src/components/Layout.tsx` — layout structure, Tailwind class conventions used in project
- `vigil-pwa/src/App.tsx` — routing structure, isAuthenticated state pattern
- `vigil-pwa/package.json` — installed dependencies, confirmed no test runner
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` — Mac dashboard: CategoryFilter enum, debounced search, editingThoughtId pattern

### Secondary (MEDIUM confidence)
- React 19 `useEffect` cleanup pattern for cancelling stale fetches — standard community practice

### Tertiary (LOW confidence / ASSUMED)
- 300ms debounce timing — standard convention, not validated against this specific app

---

## Metadata

**Confidence breakdown:**
- API contract: HIGH — read directly from TypeScript source
- Architecture patterns: HIGH — directly mirrors existing codebase conventions and Mac dashboard patterns
- Triage flow: HIGH — verified from triage.ts source
- Test infrastructure: HIGH — confirmed absent from package.json

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable — backend API is deployed, not fast-moving)
