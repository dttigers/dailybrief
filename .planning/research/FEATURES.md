# Feature Research

**Domain:** Ambient AI life assistant — multi-user auth, PWA context menus, edit-refresh pause, brief history fix
**Researched:** 2026-04-17
**Confidence:** HIGH (based on live codebase inspection + verified patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Brief history list loads correctly | Already shipped in v2.2/v3.0; regression if broken | MEDIUM | Root cause: `/v1/brief/:date` reads PDF from filesystem path stored in DB. Railway has ephemeral fs — file gone after redeploy. Fix: store PDF as binary in DB column OR regenerate on-demand when file missing. DB storage is cleaner. |
| Edit thought without refresh clobbering it | 30s poll in `useThoughts` fires `setFetchTick` unconditionally — replaces optimistic state | LOW | `isEditing` flag already lives in `ThoughtRow.tsx`. `useThoughts` needs an `editingCount` ref or a `pausePoll` boolean passed down. Pattern: skip the poll tick when any row is in editing mode. |
| Right-click context menu on thought rows | Desktop users discover right-click naturally; 5 actions (Delete, Move, Edit, Re-triage, Add to Project) map exactly to existing API calls | MEDIUM | Pure React pattern: capture `onContextMenu` on ThoughtRow, render absolute-positioned div at `event.clientX/Y`, close on outside click or Escape. No library needed — all actions already have handlers. |
| Multi-user: users see only their own data | Without this, a second Vigil user on the same Railway instance would see all thoughts from all users | HIGH | Currently zero `userId` anywhere in schema. Requires: `users` table, `userId` FK on every data table (thoughts, briefs, projects, work_orders, api_keys, etc.), middleware to set user context per request, migration for existing single-user data. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-user auth with per-user bearer tokens | Enables second user (spouse/partner) to run independent Vigil instance on shared server; prerequisite for G2 glasses multi-user | HIGH | Architecture decision: keep bearer-token model (already exists) but make tokens user-scoped. Add `/v1/auth/register` and `/v1/auth/login` endpoints. Each token row gets a `userId`. Middleware reads `userId` from token and injects into every query. |
| Context menu as primary thought action surface | Reduces click depth: right-click → action vs. expand row → find button → click | LOW | All actions already wired (delete, move, retriage, edit, assign project). Context menu is just a new trigger surface. `onContextMenu` fires on long-press on iOS Safari too — touch support included. |
| PDF stored in DB as bytea | Briefs survive Railway deploys; any client can fetch historical PDFs without filesystem dependency | MEDIUM | Switch `pdfFilename` (text path) to `pdfData` (bytea/Buffer). PDFKit renders to Buffer already — just INSERT instead of writeFile. GET `/v1/brief/:date` reads from DB. Eliminates the ephemeral filesystem problem entirely. |
| Edit-lock polling pause | Zero data loss during edits; prevents "my edit just disappeared" frustration for ADHD user | LOW | Pattern: module-level `editingCountRef` that ThoughtRow increments on focus/decrements on blur. Poll in `useThoughts` checks `editingCountRef.current > 0` before calling refetch. No prop drilling. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| PostgreSQL Row Level Security (RLS) for data isolation | "Database-enforced security is best practice" | Drizzle ORM doesn't surface `SET app.user_id = $1` session var pattern cleanly; adds operational complexity; overkill for a 2-5 user system | Application-layer `userId` filter on every query via middleware injection — same security guarantee, simpler ops, Drizzle-native |
| OAuth2 / social login for multi-user auth | "Users expect Google login" | Requires OAuth app approval, redirect URIs, additional Railway env vars; user base is 1-3 known people | Email+password with bcrypt+JWT — straightforward, no external dependency, matches the existing bearer-token mental model |
| Real-time WebSocket sync for edit state | "Eliminates polling entirely" | WebSocket connection management on Railway, reconnect logic, no current need — 30s polling is fine for this use case | Pause-polling pattern during edits; resume on blur — solves the actual problem without architectural complexity |
| Full admin UI for user management | "Need to manage accounts" | Over-engineered for 1-3 users | Seed script + CLI command `vigil user create`; Settings page shows current user, allows token rotation |
| Session cookies instead of bearer tokens | "More secure for browser clients" | Breaks Mac app, CLI, G2 plugin, browser extension — all use `Authorization: Bearer` header | Keep bearer tokens; make them user-scoped. Existing clients need zero changes other than using their own token |

## Feature Dependencies

```
[Multi-user: users table + userId FK migration]
    └──required by──> [Multi-user: user-scoped bearer tokens]
                          └──required by──> [Multi-user: data isolation in all routes]
                                                └──required by──> [Multi-user: register/login endpoints]

[Brief PDF stored in DB (bytea)]
    └──fixes──> [Brief history PDF retrieval]

[isEditing state exposed from ThoughtRow]
    └──required by──> [Pause poll during edit]
                          └──enhances──> [Right-click context menu Edit action]

[Right-click context menu]
    └──uses existing──> [Delete, Move, Retriage, Assign Project handlers] (all already exist)
```

### Dependency Notes

- **Multi-user requires schema migration first:** Every table needs `userId` FK before routes can filter. Existing single-user data gets assigned to a seed "owner" user (userId=1) during migration — no data loss.
- **Brief PDF in DB required for history fix:** The filesystem path approach is broken on Railway by design (ephemeral). The fix is schema-level, not route-level.
- **Edit pause is independent:** Can ship without touching multi-user or brief history. Pure PWA change (1 ref + 1 guard).
- **Context menu is independent:** All action handlers already exist in ThoughtRow. No new API endpoints needed.
- **Multi-user does NOT block context menu or brief history fix:** These four features can be parallelized across phases.

## MVP Definition

### Launch With (this milestone, v3.4)

- [ ] **Brief history fix** — high-impact visible regression; users clicked "Briefs" and it failed; store PDF as bytea in DB column
- [ ] **Edit-refresh pause** — daily annoyance for ADHD user; simple `editingCountRef` added to poll guard; 2-hour implementation
- [ ] **Right-click context menu** — pure UI addition; no new API surface; all handlers exist; 1-day implementation
- [ ] **Multi-user foundation** — schema migration + middleware + register/login endpoints; data isolation; existing data assigned to owner user

### Add After Validation (v1.x)

- [ ] **User management CLI** (`vigil user create/list/deactivate`) — useful when adding 2nd user; not needed day-1
- [ ] **Token rotation UI** — Settings page "Rotate my token" button; security hygiene; not blocking

### Future Consideration (v2+)

- [ ] **Social login (Google OAuth)** — only if user base grows beyond 5 known people
- [ ] **Per-user settings** (PDF config, brief schedule, sports team) — currently global; user-scoped settings after multi-user proven stable
- [ ] **Shared projects across users** — requires RBAC on top of userId isolation; out of scope for v3.4

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Brief history PDF fix | HIGH — visible broken feature | MEDIUM (schema + route change) | P1 |
| Edit-refresh pause | HIGH — daily frustration | LOW (ref + poll guard) | P1 |
| Right-click context menu | MEDIUM — DX improvement | MEDIUM (React component) | P1 |
| Multi-user foundation | HIGH — prerequisite for G2 multi-user | HIGH (migration + middleware + auth endpoints) | P1 |
| User management CLI | LOW at 1-3 users | LOW | P2 |
| Token rotation UI | LOW urgency | LOW | P2 |
| Per-user settings | MEDIUM long-term | HIGH (schema + UI) | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Implementation Patterns (Verified from Codebase)

### Brief History Fix

Root cause confirmed: `brief-generate.ts` reads PDF from `rows[0].pdfFilename` (filesystem path). On Railway, `/tmp/briefs` is ephemeral — cleared on each deploy. The `briefs` DB table has `pdfFilename text` column. **Fix:** add `pdfData` bytea column to `briefs` table, store Buffer from PDFKit render directly, serve from DB on GET. Optionally keep `pdfFilename` nullable for local dev compatibility.

Schema delta: `ALTER TABLE briefs ADD COLUMN pdf_data bytea;`

Route delta in `brief-generate.ts`: replace `readFile(resolved)` with `Buffer.from(rows[0].pdfData)`.

### Edit-Refresh Pause

`useThoughts.ts` line 85: `const poll = setInterval(refetch, 30_000)`. Gap: `isEditing` is local to `ThoughtRow` (line 57), not visible to `useThoughts`.

Simplest fix — module-level mutable ref (no React state, no prop drilling):

```ts
// In a shared module, e.g. src/utils/editingGuard.ts
export const editingCountRef = { current: 0 }
```

ThoughtRow calls `editingCountRef.current++` on edit start, `editingCountRef.current--` on edit end. `useThoughts` poll guard:

```ts
const poll = setInterval(() => {
  if (editingCountRef.current === 0) refetch()
}, 30_000)
```

### Right-Click Context Menu

Standard React pattern: intercept `onContextMenu` on ThoughtRow's root div, `e.preventDefault()`, record `{x, y, thoughtId}` in `ThoughtList` state, render `<ContextMenu>` as an absolute-positioned div (or portal) at those coordinates, close on `mousedown` outside or `Escape`.

Actions map to existing handlers:
- Delete → existing `onDelete(id)`
- Move to category → existing `onCategoryChange(id, category)`
- Edit → set `isEditing=true` via callback prop
- Re-triage → existing `onRetriage(id)`
- Add to Project → existing project assignment flow

Boundary clamp: if `x + MENU_WIDTH > window.innerWidth`, render left-anchored instead.

### Multi-User Foundation

Current auth: `bearerAuth` middleware validates token hash against `api_keys` table — no `userId` on `api_keys`, no `userId` on any data table.

New model:
1. Add `users` table: `id serial PK`, `email text unique`, `passwordHash text`, `createdAt timestamp`
2. Add `userId integer references users(id)` FK to `api_keys` (each token belongs to a user)
3. Add `userId integer references users(id)` FK to `thoughts`, `projects`, `briefs`, `work_orders` (nullable in migration, then backfill to userId=1, then add NOT NULL)
4. Middleware: after validating token, JOIN to get `userId`, set `c.set('userId', userId)` on Hono context
5. All routes: add `eq(table.userId, c.get('userId'))` to every WHERE clause (Drizzle-native, no RLS needed)
6. New endpoints: `POST /v1/auth/register` (email+password → user row + bearer token), `POST /v1/auth/login` (email+password → existing or new bearer token)
7. Password: bcrypt cost 12. Token value: same `vk_` prefix + SHA-256 pattern already in use.

Migration safety: seed the first `users` row with the owner's email during migration, backfill all existing rows to `userId=1`.

## Sources

- Live codebase `/vigil-core/src/routes/brief-generate.ts` — confirmed ephemeral filesystem dependency as root cause
- Live codebase `/vigil-core/src/db/schema.ts` — confirmed no `userId` column anywhere in schema
- Live codebase `/vigil-pwa/src/hooks/useThoughts.ts` — confirmed 30s `setInterval(refetch, 30_000)` poll pattern
- Live codebase `/vigil-pwa/src/components/ThoughtRow.tsx` — confirmed `isEditing` is component-local, not surfaced upward
- Live codebase `/vigil-core/src/middleware/auth.ts` — confirmed bearer auth has no user concept
- WebSearch: React context menu pattern — `onContextMenu` + absolute positioned div (HIGH confidence — standard React pattern)
- WebSearch: bcrypt + JWT for Node.js minimal auth (HIGH confidence — well-established pattern, verified against Hono docs)
- WebSearch: PostgreSQL RLS vs application-layer userId (MEDIUM confidence — RLS is overkill confirmed by AWS + Supabase docs)

---
*Feature research for: Vigil v3.4 — Multi-User Foundation & PWA Polish*
*Researched: 2026-04-17*
