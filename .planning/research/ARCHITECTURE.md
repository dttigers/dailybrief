# Architecture Research

**Domain:** Multi-user auth + PWA context menu + edit-refresh pause + brief history fix
**Researched:** 2026-04-17
**Confidence:** HIGH (all findings based on direct codebase inspection)

## Standard Architecture

### System Overview (Current State)

```
┌──────────────────────────────────────────────────────────────────┐
│                         Clients                                   │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────┐  ┌────────┐  │
│  │ vigil-pwa    │  │ Mac CLI     │  │ G2 plugin  │  │ Ext    │  │
│  │ (React/Vite) │  │ (Swift/Node)│  │ (Even SDK) │  │ (TS)   │  │
│  └──────┬───────┘  └──────┬──────┘  └─────┬──────┘  └───┬────┘  │
└─────────┼────────────────┼───────────────┼──────────────┼────────┘
          │  Bearer vk_*   │               │              │
          ▼  (SHA-256 hash)▼               ▼              ▼
┌──────────────────────────────────────────────────────────────────┐
│               Vigil Core API (Hono/TypeScript, Railway)           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Middleware: CORS → secureHeaders → timeout(30s) → rateLimiter│ │
│  │             → bearerAuth (all /v1/* except /v1/health)       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Routes: 25+ REST endpoints under /v1/                        │ │
│  │ thoughts · projects · briefs · brief/generate · chat        │ │
│  │ insights · therapy · work-orders · sports · calendar · etc.  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Background services: GenerateScheduler · GmailWorkOrders     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────────┘
                               │  Drizzle ORM + postgres-js
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                  PostgreSQL (Railway managed)                      │
│  api_keys · thoughts · projects · briefs · chat_sessions          │
│  work_orders · work_order_statuses · oauth_tokens · app_settings  │
│  thought_links · ai_cache                                         │
└──────────────────────────────────────────────────────────────────┘
```

### Current Auth Model (Single-User)

The current auth is flat: one `api_keys` table row per token. The middleware verifies SHA-256(token) against `key_hash`, looks up `isActive`, updates `lastUsedAt`, then calls `next()`. No user context is attached to `c` (Hono context). Every authenticated request sees ALL data in the database. There are no `userId` columns on any table.

---

## Feature Integration Analysis

### 1. Brief History Fix

**Root cause (confirmed from code):** `GET /brief/:date` reads the PDF from the Railway filesystem at the path stored in `briefs.pdfFilename` (e.g., `/tmp/briefs/brief-2026-04-13.pdf`). Railway's filesystem is ephemeral — it is wiped on every deploy and dyno restart. So any brief older than the most recent deploy returns 404.

**What changes:**

| Layer | Current | New |
|-------|---------|-----|
| DB schema | `briefs.pdfFilename text` (path pointer) | Add `pdfData bytea` column |
| `brief-generate.ts` POST | Writes PDF to `/tmp`, stores path | Also writes buffer to `pdfData` |
| `brief-generate.ts` GET | Reads file from path | Try `pdfData` column first; file path as fallback |
| Drizzle schema | No `pdfData` | Add `pdfData: customType('bytea')` |
| Migration | — | New migration adds `pdf_data bytea` column |

**No PWA changes required.** The fix is entirely in `vigil-core`. The PWA already calls `GET /v1/brief/:date` and handles the blob correctly.

**Recommended approach:** Store the PDF buffer in `pdfData bytea` at generation time. On GET, prefer the in-memory buffer column over the file path. This is simpler than an S3/R2 integration and appropriate at current scale (<50 briefs/year).

**Data flow after fix:**

```
POST /brief/generate
  assembler.assembleAndRender() → { buffer, filePath, metadata }
  db.insert(briefs) with pdfData = buffer           ← NEW
  return buffer as PDF response

GET /brief/:date
  row = db.select() from briefs where date = :date
  if row.pdfData → return pdfData as PDF response   ← NEW primary path
  elif row.pdfFilename and file exists → return file ← fallback
  else → 404 "Brief PDF not found — regenerate"
```

---

### 2. Edit-Refresh Pause

**Root cause (confirmed from code):** `useThoughts.ts` runs `setInterval(refetch, 30_000)` unconditionally. `ThoughtRow.tsx` manages `isEditing` state locally. When the 30s poll fires during an edit, `setThoughts` replaces the list, the `ThoughtRow` component re-renders with the original content from the server, and the in-progress edit is lost.

**What changes:**

| Layer | Current | New |
|-------|---------|-----|
| `useThoughts.ts` | Polls every 30s unconditionally | Accepts `isPaused?: boolean` param; skips interval when paused |
| `ThoughtRow.tsx` | No edit lifecycle callbacks | Calls `onEditStart()` / `onEditEnd()` on edit open/close |
| Parent pages | Pass `onUpdate` to `ThoughtRow` | Also track `isAnyEditing` state; pass `isPaused` to `useThoughts` |

**No API changes required.** This is a pure PWA state management fix.

**Data flow:**

```
User clicks thought content → ThoughtRow sets isEditing=true
ThoughtRow calls onEditStart() → parent sets isAnyEditing=true
useThoughts sees isPaused=true → interval not created / cleared
User saves or cancels → ThoughtRow calls onEditEnd()
Parent sets isAnyEditing=false → useThoughts restarts 30s interval
```

**Implementation note:** Move the `setInterval` inside a `useEffect` that depends on `isPaused`. When `isPaused` becomes true, the effect cleanup clears the interval. When it returns to false, a fresh interval starts — so the next poll is 30s after the edit ends, not immediately.

---

### 3. Right-Click Context Menu

**What changes:**

| Layer | Current | New |
|-------|---------|-----|
| `ThoughtRow.tsx` | No context menu | Add `onContextMenu` handler; passes `{ x, y, thoughtId }` to parent |
| New: `ThoughtContextMenu.tsx` | — | Portal-rendered floating menu at `{ x, y }` |
| Parent pages | No context menu state | Track `contextMenu: { x, y, thoughtId } | null` |
| `api/client.ts` | `updateThought`, `bulkDeleteThoughts` exist | Reused as-is |

**No API changes required.** All menu actions call existing endpoints.

**Implementation pattern:**

```tsx
// ThoughtRow.tsx — add to existing wrapper div
<div
  onContextMenu={(e) => {
    e.preventDefault()
    onContextMenu?.(e.clientX, e.clientY, thought.id)
  }}
>

// ThoughtContextMenu.tsx — portal at document.body
// position: fixed at { top: y, left: x } clamped to viewport
// items: Delete | Move to [category submenu] | Edit | Re-triage | Add to Project [project submenu]
// dismisses on: Escape, pointerdown outside, any item click
```

**"Move to category" and "Add to Project" sub-menus:** Render as inline expansion (not a nested flyout) within the same menu container. Categories are a static list. Projects are fetched from `useProjects()` — already available in parent pages.

---

### 4. Multi-User Foundation

**Current state:** Every table is implicitly scoped to "the one user." No `userId` column anywhere. `api_keys` has no user foreign key.

**Target state:** Multiple Vigil instances (users) each have their own thoughts, projects, briefs, etc. The bearer token identifies which user.

**Integration approach: Add `users` table + `userId` FK on data tables via migration; attach `userId` to Hono context in `bearerAuth` middleware.**

#### Schema changes

```
NEW TABLE: users
  id          serial PK
  name        text NOT NULL
  email       text UNIQUE
  createdAt   timestamp WITH TIME ZONE DEFAULT now()

MODIFIED TABLE: api_keys
  + userId    integer NOT NULL REFERENCES users(id)

MODIFIED TABLES (add userId FK, backfill to 1):
  thoughts       + userId integer NOT NULL REFERENCES users(id)
  projects       + userId integer NOT NULL REFERENCES users(id)
  briefs         + userId integer NOT NULL REFERENCES users(id)
  chat_sessions  + userId integer NOT NULL REFERENCES users(id)
  ai_cache       + userId integer NOT NULL REFERENCES users(id)
  app_settings   composite PK becomes (key, userId)
  oauth_tokens   + userId integer (nullable for global deploy-wide tokens)
```

**Note on work_orders:** Work orders are pulled from IMAP (not user-generated), so they stay global for v3.4. Do not add userId to work_orders or work_order_statuses in this milestone.

#### Middleware change

`bearerAuth` must attach the resolved `userId` to Hono context so routes can scope queries:

```typescript
// middleware/auth.ts — modified select
const [key] = await db
  .select({ id: apiKeys.id, userId: apiKeys.userId })
  .from(apiKeys)
  .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
  .limit(1)

if (!key) return c.json({ error: 'Invalid API key' }, 401)

c.set('userId', key.userId)  // requires Hono typed Variables
await next()
```

Hono supports typed context variables via `new Hono<{ Variables: { userId: number } }>()`. Sub-routers created as plain `new Hono()` need `c.get('userId') as number` with explicit cast.

#### Route changes

Every route that queries a data table must add `eq(table.userId, c.get('userId'))` to WHERE clauses. This is the bulk of the implementation work.

**Routes requiring userId scope:**
- `thoughts.ts` — all handlers (SELECT, INSERT, UPDATE, DELETE)
- `projects.ts` — all handlers
- `brief-history.ts` — all handlers
- `brief-generate.ts` — all handlers
- `chat.ts`, `chat-sessions.ts` — all handlers
- `insights.ts`, `therapy.ts` — ai_cache lookups
- `settings.ts` — app_settings lookups
- `tags.ts`, `links.ts` — secondary thought lookups
- `bulk.ts` — verify thought IDs belong to userId before mutation
- `triage.ts` — INSERT after triage
- `affirmation.ts`, `summary.ts` — thought context queries

**Routes NOT needing userId scope:**
- `health.ts` — no auth, no DB
- `sports.ts` — no user data
- `google-auth.ts`, `google-status.ts` — keep single-tenant OAuth for now
- `work-orders.ts`, `work-order-status.ts` — global for v3.4
- `process-photo.ts`, `process-audio.ts`, `describe-image.ts` — no direct DB queries

#### Migration strategy (zero-downtime for existing user)

1. New migration: create `users` table; insert one row `(id=1, name='Jameson')`.
2. Add `userId integer DEFAULT 1` columns to all data tables.
3. Backfill: `UPDATE thoughts SET user_id = 1` etc. (already done by DEFAULT).
4. Add `NOT NULL` constraint; add FK constraint.
5. Add `userId` column to `api_keys`; set existing rows to `1`.
6. Remove DEFAULT clause now that all rows have a value.

Programmatic Drizzle migrate runs automatically on deploy — no manual Railway console step.

#### PWA changes for multi-user

**v3.4 scope: none.** The PWA already stores one API key per browser session in `localStorage`. The `AuthPage.tsx` flow (enter key → validate → store) is correct for multi-user. Each user provides their own key. No registration UI is needed for v3.4 — key provisioning stays manual (admin inserts API key row into DB).

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `bearerAuth` middleware | Resolve token → userId; attach to `c` | All protected routes via `c.get('userId')` |
| `users` table | Identity record per Vigil instance | `api_keys.userId` FK source |
| `api_keys` table | Token → userId mapping | bearerAuth reads on every request |
| `ThoughtRow.tsx` | Edit state; context menu event source | Parent via `onEditStart`, `onEditEnd`, `onContextMenu` callbacks |
| `ThoughtContextMenu.tsx` (NEW) | Render floating menu at pointer position | ThoughtsPage/DashboardPage context menu state |
| `useThoughts.ts` | Fetch + poll thoughts | Accepts `isPaused: boolean` new param |
| `brief-generate.ts` GET | Serve PDF by date | Reads `pdfData bytea` from DB (primary); falls back to file |

---

## Recommended Project Structure Changes

```
vigil-core/src/
├── db/
│   └── schema.ts              # ADD: users table; userId FKs on data tables
├── middleware/
│   └── auth.ts                # MODIFY: attach userId to Hono context variables
├── routes/
│   ├── thoughts.ts            # MODIFY: scope all queries to userId
│   ├── projects.ts            # MODIFY: scope all queries to userId
│   ├── brief-history.ts       # MODIFY: scope briefs queries to userId
│   ├── brief-generate.ts      # MODIFY: store pdfData; scope queries to userId
│   ├── chat.ts                # MODIFY: scope to userId
│   ├── chat-sessions.ts       # MODIFY: scope to userId
│   ├── insights.ts            # MODIFY: scope ai_cache to userId
│   ├── therapy.ts             # MODIFY: scope ai_cache to userId
│   ├── settings.ts            # MODIFY: scope app_settings to userId
│   ├── bulk.ts                # MODIFY: userId guard before mutation
│   ├── tags.ts                # MODIFY: scope to userId
│   ├── links.ts               # MODIFY: scope to userId
│   ├── triage.ts              # MODIFY: pass userId on INSERT
│   ├── affirmation.ts         # MODIFY: scope thought context to userId
│   └── summary.ts             # MODIFY: scope thought context to userId
└── drizzle/
    └── 0011_multi_user.sql    # NEW: users table + userId FK migrations

vigil-pwa/src/
├── components/
│   ├── ThoughtRow.tsx             # MODIFY: onContextMenu handler + onEditStart/onEditEnd
│   └── ThoughtContextMenu.tsx     # NEW: portal-rendered floating context menu
├── hooks/
│   └── useThoughts.ts             # MODIFY: accept isPaused param; gate interval
├── pages/
│   ├── ThoughtsPage.tsx           # MODIFY: track isAnyEditing; pass to useThoughts
│   └── DashboardPage.tsx          # MODIFY: track isAnyEditing; pass to useThoughts
```

---

## Architectural Patterns

### Pattern 1: Hono Typed Context Variables

**What:** Hono allows declaring variables that middleware sets and routes read, with TypeScript type safety.

**When to use:** Whenever middleware needs to pass resolved data (like userId) to downstream handlers.

**Trade-offs:** Requires threading the generic through the Hono instance. Sub-routers created as plain `new Hono()` won't inherit the parent type without explicit generic — use `c.get('userId') as number` with a comment explaining why.

**Example:**
```typescript
// In index.ts
const app = new Hono<{ Variables: { userId: number } }>()

// In bearerAuth middleware
c.set('userId', key.userId)

// In any route
const userId = c.get('userId') as number
```

---

### Pattern 2: Application-Level Row Scoping

**What:** Add `userId` to every WHERE clause in route handlers. Not PostgreSQL RLS — application-level enforcement.

**When to use:** Single-instance multi-tenancy at small scale (<100 users). Simpler to implement and test than RLS for a codebase that owns all its queries.

**Trade-offs:** Every query must remember to scope. A missed WHERE clause leaks data. Mitigated with an integration test that creates two users and verifies isolation.

**Example:**
```typescript
// Before (single-user)
const rows = await db.select().from(thoughts).where(eq(thoughts.id, id))

// After (multi-user)
const userId = c.get('userId') as number
const rows = await db.select().from(thoughts)
  .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)))
```

---

### Pattern 3: Edit-Gate Polling Pause

**What:** A boolean flag pauses the 30s polling interval to protect in-progress edits.

**When to use:** Any polling loop that could overwrite transient UI state.

**Trade-offs:** User misses new thoughts during edit session. Acceptable — they can refetch after saving.

**Example:**
```typescript
// useThoughts.ts
export function useThoughts(category, searchQuery, filters, isPaused = false) {
  useEffect(() => {
    if (isPaused) return  // skip interval while editing
    const poll = setInterval(refetch, 30_000)
    return () => clearInterval(poll)
  }, [refetch, isPaused])
}
```

---

### Pattern 4: Portal-Rendered Context Menu

**What:** `ReactDOM.createPortal` renders the context menu at `document.body`, avoiding z-index stacking issues from ancestor `overflow: hidden` containers.

**When to use:** Any floating UI element (menus, tooltips, modals) that must appear above all content.

**Trade-offs:** Renders outside DOM position but stays inside React tree logically (events bubble correctly). Requires viewport clamping to prevent off-screen rendering.

**Example:**
```tsx
import { createPortal } from 'react-dom'

export default function ThoughtContextMenu({ x, y, onClose, ... }) {
  const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH)
  const clampedY = Math.min(y, window.innerHeight - MENU_HEIGHT)
  return createPortal(
    <div style={{ position: 'fixed', top: clampedY, left: clampedX }}>
      {/* menu items */}
    </div>,
    document.body
  )
}
```

---

## Data Flow

### Multi-User Request Flow

```
Client:    Authorization: Bearer vk_abc123
bearerAuth: SHA-256("vk_abc123") → lookup api_keys.keyHash
            + api_keys.userId = 7
            c.set('userId', 7) → next()
Route:     c.get('userId') → 7
           db.select().from(thoughts)
             .where(and(eq(thoughts.userId, 7), eq(thoughts.id, thoughtId)))
Response:  Only user 7's data returned
```

### Brief PDF Fix Data Flow

```
POST /brief/generate
  assembler.assembleAndRender(dateStr) → { buffer: Buffer, filePath: string }
  db.insert(briefs).values({
    date, summary, pdfFilename: filePath,
    pdfData: buffer,          ← NEW
    thoughtCount, taskCount
  })
  return new Response(buffer, { 'Content-Type': 'application/pdf' })

GET /brief/:date
  row = db.select().from(briefs).where(date = :date, userId = :userId)
  if row.pdfData:
    return new Response(row.pdfData, 'application/pdf')  ← primary
  elif row.pdfFilename && file exists at path:
    return file contents                                  ← fallback
  else:
    return 404 "Brief PDF not found — regenerate"
```

### Edit-Refresh Pause Flow

```
ThoughtRow: user clicks content text
  → setIsEditing(true)
  → props.onEditStart()
Parent page: setIsAnyEditing(true)
  → isPaused={true} passed to useThoughts
useThoughts: isPaused=true
  → useEffect returns early, no interval created
  → (if interval was running, cleanup function cleared it)

ThoughtRow: user saves (blur or Cmd+Enter)
  → handleSave() → setIsEditing(false)
  → props.onEditEnd()
Parent page: setIsAnyEditing(false)
  → isPaused={false} passed to useThoughts
useThoughts: isPaused=false
  → useEffect runs, new setInterval(refetch, 30_000) created
```

---

## Build Order Recommendation

Dependencies determine order. Multi-user touches every route and is the highest-risk change — it comes last. The three smaller features are independent and can be sequenced by risk ascending.

| Phase | Feature | Scope | Risk | Rationale |
|-------|---------|-------|------|-----------|
| 1 | Brief History Fix | vigil-core only | Low | DB migration + 1 route change; no PWA touch |
| 2 | Edit-Refresh Pause | vigil-pwa only | Very Low | 3-4 files; pure state management |
| 3 | Right-Click Context Menu | vigil-pwa only | Low-Med | New component + parent state; reuses existing API |
| 4 | Multi-User Foundation | vigil-core (schema + all routes) | High | Schema migration + ~15 route files; touches every data query |

Multi-user is last because: (a) it requires a schema migration that touches every table, (b) it has the highest surface area for error, and (c) all other features work without it and can be validated by the existing user first.

---

## Anti-Patterns

### Anti-Pattern 1: Storing PDFs Only on Filesystem

**What people do:** Write PDFs to `/tmp` and store only the file path in the DB.

**Why it's wrong:** Railway (and most PaaS) has ephemeral storage. Files are gone after every restart. The path pointer in the DB becomes a dangling reference.

**Do this instead:** Store the PDF buffer in a `bytea` column. Use object storage (S3/R2) only if PDF sizes become large enough to matter (Vigil briefs are ~100-200KB each).

---

### Anti-Pattern 2: Flat Global Queries After Adding userId

**What people do:** Add a `userId` column but forget to scope it in some routes.

**Why it's wrong:** User A can read or mutate User B's thoughts. Silent data leak.

**Do this instead:** Write a two-user isolation integration test immediately after the migration. Create user A and user B with separate API keys, insert a thought as A, verify B's GET returns 0 results. Run this test after every route change.

---

### Anti-Pattern 3: Polling Without a Pause Gate

**What people do:** Run `setInterval(refetch, 30_000)` unconditionally.

**Why it's wrong:** The interval fires during an active edit, `setThoughts` replaces the list, and the in-progress edit content is overwritten by the server response.

**Do this instead:** Gate the interval on an `isPaused` flag controlled by the parent component's edit state.

---

### Anti-Pattern 4: Context Menu as DOM Child of ThoughtRow

**What people do:** Render the context menu inside the thought row's div.

**Why it's wrong:** The thought list container uses `overflow: hidden` for truncation. The menu clips at the container boundary and is invisible outside it.

**Do this instead:** `ReactDOM.createPortal(menu, document.body)` with `position: fixed` coordinates from the `contextmenu` event. Clamp coordinates to viewport bounds.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostgreSQL (Railway) | Drizzle ORM via postgres-js | Migration adds `users` table + userId FK columns; `bytea` for PDF storage |
| Anthropic Claude | Global API key; called by route handlers | No multi-user change needed — API key is server-side env var |
| Google OAuth | `oauth_tokens` scoped by provider string | Keep deploy-wide (not per-user) for v3.4; defer per-user OAuth |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `bearerAuth` middleware → routes | `c.set('userId')` / `c.get('userId') as number` | Requires Hono typed Variables at app level |
| `ThoughtsPage` → `ThoughtRow` | New props: `onEditStart`, `onEditEnd`, `onContextMenu` | Extend `ThoughtRowProps` interface |
| `ThoughtsPage` → `useThoughts` | New `isPaused: boolean` param | Defaults to `false`; backward compatible |
| `ThoughtsPage` → `ThoughtContextMenu` | State: `contextMenu: { x, y, thoughtId } or null` | Controls menu mount/unmount |
| `brief-generate.ts` GET → DB | `pdfData bytea` column on `briefs` table | Primary PDF source post-fix; replaces filesystem read |

---

## Sources

- Direct inspection: `/vigil-core/src/middleware/auth.ts`
- Direct inspection: `/vigil-core/src/db/schema.ts`
- Direct inspection: `/vigil-core/src/routes/brief-generate.ts`
- Direct inspection: `/vigil-core/src/routes/brief-history.ts`
- Direct inspection: `/vigil-core/src/index.ts`
- Direct inspection: `/vigil-pwa/src/hooks/useThoughts.ts`
- Direct inspection: `/vigil-pwa/src/components/ThoughtRow.tsx`
- Direct inspection: `/vigil-pwa/src/pages/BriefHistoryPage.tsx`
- Direct inspection: `/vigil-pwa/src/App.tsx`
- Direct inspection: `/vigil-pwa/src/api/client.ts`

---

*Architecture research for: Vigil v3.4 Multi-User Foundation & PWA Polish*
*Researched: 2026-04-17*
