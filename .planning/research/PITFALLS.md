# Pitfalls Research

**Domain:** Multi-user auth migration, React PWA context menus, edit/refresh collision, brief history retrieval
**Researched:** 2026-04-17
**Confidence:** HIGH (architecture-specific, verified against live codebase), MEDIUM (mobile browser behavior — WebSearch + known WebKit bugs)

---

## Critical Pitfalls

### Pitfall 1: Cross-User Data Leak — Missing userId Filter on Every Query

**What goes wrong:**
When adding `userId` to the schema, developers correctly add the column to the `users` table and wire up middleware, then forget to add `.where(eq(table.userId, userId))` on 3-5 existing query functions. Every route that was written as single-user passes auth but returns all users' data. The leak is silent — HTTP 200, no error, just wrong data.

**Why it happens:**
The system has 30+ route files, each containing their own DB queries. Auth middleware only validates the token and resolves `userId`; it cannot enforce per-row filtering. There is no compiler or lint error. Manual review misses endpoints covered by rarely-exercised code paths (export, brief generation, sports proxy).

**How to avoid:**
1. Add `userId` column to ALL data tables in one migration (thoughts, projects, briefs, chat_sessions, ai_cache, app_settings, work_order_statuses, oauth_tokens). Do not add it table-by-table across multiple phases.
2. Write a grep/audit script immediately after migration that lists every `db.select().from(tableName)` call — confirm each has a userId where clause before shipping.
3. Consider a Drizzle query-builder helper `userScoped(userId)` that wraps every query — routes call the helper, not bare `db.select()`, making missing userId visible in code review.

**Warning signs:**
- Route handler does not destructure userId from context but calls a DB table that now has a userId column
- Integration test with two users shows user A can read user B's thoughts

**Phase to address:**
Multi-user foundation phase (schema migration + middleware) — must be done before any other multi-user work. Audit script should be a phase acceptance criterion.

---

### Pitfall 2: apiKey-to-User Mapping Is the Wrong Primitive

**What goes wrong:**
The current `api_keys` table has no `userId` foreign key. In multi-user mode, looking up a key correctly authenticates the request but still provides no identity. If you add `userId` to tables and try to use the key's `id` as the user discriminator, you end up with api_key-scoped data silos instead of user-scoped silos. Later user management (password reset, profile page) requires a users table anyway, making the api_key shortcut a dead end.

**Why it happens:**
The SHA-256 bearer token model was designed for API-to-API auth with no human identity concept. Extending it in-place is tempting because the middleware is already proven. The mistake is conflating "authenticated request" with "identified user."

**How to avoid:**
Add a `users` table with (id, email, created_at). Add `userId` FK to `api_keys`. Auth middleware resolves token → key row → userId, sets `c.set('userId', userId)` on every request. Routes read `c.get('userId')`. This is one migration and a middleware patch, not a full auth overhaul.

**Warning signs:**
- `api_keys` table has no FK to a users table after multi-user work begins
- Routes read `c.get('apiKeyId')` instead of `c.get('userId')` to scope queries

**Phase to address:**
Multi-user foundation phase — schema must define users → api_keys relationship before any userId columns are added downstream.

---

### Pitfall 3: Nullable userId Column Accepted by NOT NULL Constraint Too Early

**What goes wrong:**
Developer adds `userId integer NOT NULL` to thoughts/projects in one migration. Railway auto-deploys. The migration fails because existing rows have no userId value. Railway rolls back deploy; production is briefly unavailable or stuck on old schema.

**Why it happens:**
The developer copies the column definition from new tables (where NOT NULL is correct) and forgets that backfill must precede the constraint. Drizzle generates valid SQL; the error is runtime, not compile-time.

**How to avoid:**
Three-step sequence, each a separate migration:
1. `ALTER TABLE thoughts ADD COLUMN user_id integer` (nullable, no default)
2. Backfill: `UPDATE thoughts SET user_id = 1 WHERE user_id IS NULL` (seed owner user created in step 0)
3. `ALTER TABLE thoughts ALTER COLUMN user_id SET NOT NULL` + add FK constraint

Do not combine steps 1 and 3 in one migration. Drizzle custom migrations (`drizzle-kit generate` + hand-edit) are required for the backfill step because Drizzle schema doesn't express data backfill.

**Warning signs:**
- Migration file contains `NOT NULL` on a new column added to a table that already has rows
- No explicit backfill step between add-column and add-constraint migrations

**Phase to address:**
Multi-user foundation phase, first task. The migration sequence is the entire risk surface.

---

### Pitfall 4: In-Memory Rate Limiter Keyed by IP Instead of userId After Multi-User

**What goes wrong:**
The existing rate limiter keys by IP (or a global counter). After adding userId, the "right" behavior is 100 req/60s per user. But in-memory rate limiters don't survive Railway restarts and don't scale across instances. A legitimate user hitting the limit gets blocked; a different user from the same IP is fine.

**Why it happens:**
In-memory rate limiting was the right call for a single-user, single-instance deploy. Multi-user invalidates the assumption but the code works fine so nobody notices until a second Railway instance is spun up or rate limits start mis-firing.

**How to avoid:**
Re-key the rate limiter to userId during the multi-user phase. This is a 5-line change with zero downtime. Add a comment flagging that Redis is required if Railway ever runs 2+ replicas.

**Warning signs:**
- Rate limit key is still `c.req.header('x-forwarded-for')` after userId middleware is wired
- No comment in rate-limit.ts about single-instance assumption

**Phase to address:**
Multi-user foundation phase — update rate limiter key at the same time auth middleware is patched.

---

### Pitfall 5: onContextMenu Does Not Fire on iOS Safari / PWA

**What goes wrong:**
Right-click context menu implemented with `onContextMenu` handler works on desktop browsers and Android Chrome. On iOS Safari (and iOS Chrome, which uses WebKit), the `contextmenu` event does not fire on long press. The feature is silently absent on iPhone — no error, no fallback, just missing.

**Why it happens:**
iOS WebKit has never reliably dispatched `contextmenu` on long press for arbitrary elements. This is a documented WebKit bug tracked since iOS 13 (React issue #17596, Leaflet issue #6817, Apple Developer Forums). The React synthetic event `onContextMenu` wraps the native event — if the browser never fires it, React never sees it.

**How to avoid:**
Implement a dual-trigger system:
- Desktop: `onContextMenu` handler (works everywhere except iOS)
- Mobile: `onTouchStart` + `onTouchEnd` with a 500ms timer to detect long press

Use `user-select: none` + `-webkit-touch-callout: none` on the trigger element to suppress native iOS selection handles during long press. Do NOT use these CSS properties globally — they break text selection in other components.

Wrap in a custom hook `useContextMenu(ref, onOpen)` that abstracts both triggers. ThoughtRow gets one callback prop; the hook wires both event types internally.

**Warning signs:**
- Context menu only wired via `onContextMenu={handler}` with no touch fallback
- Testing only done on desktop Chrome or desktop Safari
- No real iOS device test (simulator does not reproduce this bug)

**Phase to address:**
Right-click context menu phase — mobile handling must be part of the initial implementation, not a follow-up fix.

---

### Pitfall 6: Context Menu Stays Open When It Should Not — No Global Dismiss

**What goes wrong:**
User right-clicks a thought, menu opens. User then clicks anywhere else on the page — menu stays open. Second right-click on a different thought opens a second menu or leaves the old one floating. Scroll events leave the menu at the wrong position. The 30s auto-refresh remounts the thought list while the menu is open, causing stale state or duplicate menus.

**Why it happens:**
React's synthetic event system doesn't expose a "click outside component" primitive. Developers add an `onClick` on the menu's backdrop but forget: (a) the menu is a sibling in the DOM tree, so bubbling doesn't work cleanly; (b) the 30s auto-refresh can remount the thought list while the menu is open; (c) scroll repositioning is not automatic.

**How to avoid:**
1. Render the menu in a React portal (`document.body`) so it's outside the thought list's stacking context.
2. Add a single `document.addEventListener('mousedown', dismiss)` + `document.addEventListener('touchstart', dismiss)` when the menu is open; remove it on dismiss.
3. Add `document.addEventListener('scroll', dismiss, { capture: true })` to close on scroll.
4. Capture `{ x, y }` at the time of the right-click event into state; render menu at fixed coordinates. Do not compute position at render time from element bounding rect.
5. Close before the 30s poll fires: the `useThoughts` refetch callback should call `closeContextMenu()` if menu is open.

**Warning signs:**
- Menu is rendered inline inside ThoughtRow JSX rather than in a portal
- No document-level click-outside listener
- No scroll close handler
- Menu position computed from element bounding rect at render time

**Phase to address:**
Right-click context menu phase — portal + dismiss system must be built first, before adding menu items.

---

### Pitfall 7: 30-Second Poll Overwrites In-Progress Edit

**What goes wrong:**
User clicks a thought to edit it. ThoughtRow enters `isEditing` state, textarea is focused. 30 seconds later, `setInterval(refetch, 30_000)` fires in `useThoughts`. `refetch()` increments `fetchTick`, triggering a re-fetch. The response updates `thoughts` state. If React reconciliation unmounts and remounts ThoughtRow (e.g., if list sort order shifts, or if the thought's key changes), all local state — `isEditing`, `draft` — is destroyed. The user's in-progress edit is gone silently.

Even without unmount: if `draft` is initialized from `thought.content` on mount and the parent passes a new `thought` prop whose content differs (e.g., another client edited the same thought), the `draft` shows stale content from the original mount, not the current server value.

**Why it happens:**
Edit state (`draft`, `isEditing`) lives inside ThoughtRow as local state, while the authoritative thought data lives in the parent via `useThoughts`. A poll-triggered re-render replaces the `thoughts` array. React reconciles by key (thought id) — stable id means no unmount. But list sort, category filter changes, or id collisions can trigger unmount.

**How to avoid:**
Minimal approach: pause the poll when any thought is being edited.
1. Add `onEditStart(id: number)` and `onEditEnd(id: number)` callbacks to ThoughtRow props.
2. Track `editingIds: Set<number>` in the parent (ThoughtsPage or ThoughtList).
3. In the `setInterval` callback, skip `refetch()` when `editingIds.size > 0`.
4. Resume automatically when the set becomes empty (save, cancel, blur).
5. Safety valve: auto-resume the poll if edit has been open more than 5 minutes (catches crashed/abandoned edits).

**Warning signs:**
- `setInterval(refetch, 30_000)` in useThoughts.ts with no check for in-progress edits
- No `onEditStart`/`onEditEnd` props on ThoughtRow
- Edit state entirely local to ThoughtRow with no parent awareness

**Phase to address:**
Edit-refresh pause phase — this bug exists in production today. Must be fixed before v3.4 ships.

---

### Pitfall 8: Brief History — Date Timezone Mismatch Between Server and Client

**What goes wrong:**
The briefs table stores date as a `date` column (YYYY-MM-DD, no timezone). The server generates the date using UTC. The client generates "today" using local time. If the user is in UTC-6 and generates a brief at 11pm local (5am UTC next day), the server stores tomorrow's UTC date. The client, checking `b.date === todayStr` with local date, never finds a match — brief appears absent even though it exists.

**Why it happens:**
Server is on UTC (Railway). Client is on local time. Both compute "today" independently with no coordination. BriefHistoryPage.tsx has a comment acknowledging this problem on the client side, but the server-side `brief-generate.ts` may still compute date using UTC.

**How to avoid:**
Pass client's local date as a parameter when generating the brief. `POST /v1/brief/generate` accepts `{ date: "2026-04-17" }` in the request body. Server uses the provided date instead of computing its own. This is a 2-line server change and a 1-line client change.

**Warning signs:**
- Server brief-generate route calls `new Date().toISOString().split('T')[0]` without accepting a client-provided date override
- No test covering brief generation at 11pm in a UTC-6 timezone

**Phase to address:**
Brief history fix phase — verify the generate endpoint first; this may already be partially addressed by the comment in BriefHistoryPage.tsx.

---

### Pitfall 9: Brief History PDF Served from Railway's Ephemeral Filesystem

**What goes wrong:**
Railway's filesystem resets on every deploy. PDFs written during brief generation are gone after the next Railway deploy. The briefs table stores `pdfFilename` (a local path) and `summary` (a JSONB blob of all brief data). The route that serves historical PDFs reads `pdfFilename` from the row, then tries `fs.readFile(pdfFilename)` from disk. After a Railway deploy, all those files are gone — every historical brief returns 404.

This is almost certainly the root cause of the known "older briefs fail to load" bug.

**Why it happens:**
PDF generation writes to Railway's writable filesystem as a convenience. The `pdfFilename` column was added to track where the file is, but nobody verified survival across deploys. Railway's managed Postgres persists, but the local disk does not.

**How to avoid:**
The brief history PDF endpoint must regenerate the PDF from the stored `summary` JSONB on every request, not serve a file from disk. The `summary` JSONB already contains all the data needed for PDFKit rendering. Add or modify `/v1/brief/:date/pdf` to: (1) read the brief row by date, (2) call the same PDFKit render function used during generation with `summary` as input, (3) stream the result back as `application/pdf`.

Do not store PDFs to Railway disk at all — generate on demand from the persisted summary. Add a short-lived in-memory cache (5 minutes by date key) to avoid re-rendering on repeated views.

**Warning signs:**
- `/v1/brief/:date/pdf` route reads from `pdfFilename` path on disk via `fs.readFile`
- No test confirms brief PDF is retrievable after a Railway re-deploy
- `pdfFilename` is `null` for many brief rows in production (already observable)

**Phase to address:**
Brief history fix phase — this is the root cause. Fix before any other brief history work.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| userId nullable with no backfill deadline | Faster migration | Orphaned rows with no user owner permanently | Never — backfill must run in same deploy window |
| Skipping users table, using apiKeyId as identity | Avoids new table | No email, no profile, no password reset, no user listing | Only in strictly single-token-per-person model — not for real multi-user |
| Context menu rendered inline in ThoughtRow (not portal) | Simpler code | Z-index fights, scroll positioning bugs, stacking context corruption | Never in a scrollable PWA |
| Poll pause with local-state-only check in ThoughtRow | Avoids prop drilling | Race condition: refetch fires between edit-start and state propagation | Acceptable with 0ms debounce guard |
| Regenerating PDF from summary on every history request | No disk storage needed | PDFKit adds ~100-200ms per request | Acceptable at single/few-user scale; cache when load increases |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Drizzle + Railway auto-deploy migrations | Migration runs on boot via `migrate()`; if it fails, server crashes but Railway infra reports "deploy success" | Watch Railway logs directly for migration errors; add a startup log message confirming migration completed cleanly |
| Hono context variables + TypeScript | `c.get('userId')` returns `unknown` without type registration; casting to `number` silently passes `undefined` through if middleware was skipped | Register typed context variable map via Hono's `createFactory<{userId: number}>()` so TypeScript enforces presence |
| vigilFetch + binary PDF response | `vigilFetch` adds `Content-Type: application/json` to every request; `getBriefPdf` must call `res.blob()` not `res.json()` | Verify `getBriefPdf` uses `res.blob()`; pass `Accept: application/pdf` header in the PDF-specific fetch |
| iOS Safari + iframe PDF | `<iframe src={blobUrl}>` does not reliably render PDFs in iOS Safari PWA installed to home screen (multi-page PDFs may show only page 1) | Keep iframe for desktop; add prominent Download PDF button as the primary action on mobile |
| React portal + Tailwind z-index | Portal renders at `document.body` but `z-50` can lose to a parent with CSS `transform` or `isolation: isolate` | Use `style={{ zIndex: 9999 }}` inline on the portal root; document the reason |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| userId WHERE clause missing on thoughts query | All users' data returned in one request; load time grows with user count | Grep audit + two-user integration test | At 2nd user onboarding |
| PDF regenerated on every brief history click, no cache | Slow loads (PDFKit runtime); Railway CPU spike on frequent views | 5-minute in-memory cache keyed by brief date | At 10+ brief history clicks per day |
| Context menu position computed at re-render time | Menu jumps on 30s poll re-render while open | Capture x,y at event time into a ref; render at fixed coordinates | On every 30s poll tick while menu is open |
| In-memory rate limiter per process | Rate limit resets on Railway deploy; not shared across instances | Key by userId now; note Redis needed for multi-instance | At 2+ Railway instances |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Existing single-user endpoints not updated with userId filter | Cross-user data exposure — any valid token reads any user's data | Audit every route; add two-user integration test as a phase exit criterion |
| api_keys table missing userId FK | Orphaned keys with no owner; cannot revoke by user; no audit trail | Add FK before any multi-user data is written |
| Context menu Delete action with no confirmation | Accidental delete on false-positive long press on mobile | Require explicit confirm for destructive menu actions; undo toast is better than confirm dialog for ADHD UX |
| Hono middleware order: rate limiter before auth middleware resolves userId | Cannot key rate limiter by userId if userId is not yet resolved | Place userId-keyed rate limiter middleware after the bearerAuth middleware |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Context menu includes "Edit" — but inline edit already works via click | Confusing double entry point; two ways to start the same action | Remove "Edit" from context menu; keep click-to-edit as primary; menu = Delete, Move, Re-triage, Add to Project |
| Context menu on mobile has no visual affordance for long press | Feature is invisible on touch devices | Show a "..." action button always-visible on mobile (touch) viewports, hover-visible on desktop |
| Poll paused indefinitely if edit never cleaned up (navigate away, crash) | Thoughts stop refreshing silently until page reload | Auto-resume poll if edit open > 5 minutes; also call `onEditEnd` in ThoughtRow's useEffect cleanup on unmount |
| Multi-user login page with no user creation flow | New users blocked with 401 until manually added to DB | Define explicitly: is this invite-only (seed users in migration) or self-serve? First-run experience must not be an unexplained 401 |

---

## "Looks Done But Isn't" Checklist

- [ ] **Multi-user auth:** `userId` column added to ALL data tables — thoughts, projects, briefs, chat_sessions, ai_cache, app_settings, oauth_tokens, work_order_statuses. Not just thoughts.
- [ ] **Multi-user auth:** Every route handler reads `c.get('userId')` and filters queries — including existing routes, not just new ones.
- [ ] **Multi-user auth:** Two-user integration test confirms data isolation (user A's token cannot retrieve user B's thoughts via GET /v1/thoughts).
- [ ] **Multi-user auth:** `api_keys` table has a `userId` FK to a `users` table.
- [ ] **Context menu:** Long-press works on iOS Safari (real device test, not simulator).
- [ ] **Context menu:** Menu closes on outside click, scroll, Escape key press, and 30s poll refetch.
- [ ] **Context menu:** Menu position is correct when triggered on a row near the bottom of the viewport (no overflow below fold).
- [ ] **Edit-refresh pause:** After saving or canceling an edit, the poll resumes automatically (no stuck-paused state).
- [ ] **Edit-refresh pause:** Navigating to another route mid-edit calls `onEditEnd` via useEffect cleanup.
- [ ] **Brief history:** Older briefs (before the current Railway deploy) load successfully — PDF is regenerated from DB, not served from ephemeral disk.
- [ ] **Brief history:** Brief generated at 11pm local time in UTC-6 appears under the correct local date.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cross-user data leak discovered in production | HIGH | Audit Railway logs for cross-user requests; add userId filters; redeploy immediately; assess if any user data was exposed |
| NOT NULL migration fails on prod Railway deploy | MEDIUM | Railway rolls back failed deploy automatically; schema stays on previous version; fix migration to nullable + backfill before retry |
| Brief history PDFs all return 404 after deploy | LOW | This is the known bug — add PDF-from-summary regeneration endpoint; no data loss since summary JSONB is persisted in Postgres |
| Context menu stays open on every 30s poll | LOW | Add `closeContextMenu()` call in the refetch path; one-line fix |
| User's edit lost due to unmount during poll | MEDIUM | Partially protected by stable React keys on thought id; full fix is poll-pause feature being built in this milestone |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Cross-user data leak (missing userId filter) | Multi-user foundation | Two-user integration test: user A cannot read user B's data |
| apiKey missing userId FK | Multi-user foundation | Schema check: `api_keys.user_id` column exists with FK to users table |
| Nullable → NOT NULL migration crash | Multi-user foundation | Staging migration dry-run before Railway push |
| In-memory rate limiter wrong key | Multi-user foundation | Verify rate-limit.ts keys by userId after middleware patch |
| onContextMenu silent failure on iOS | Context menu phase | Manual test on physical iOS device |
| Context menu no global dismiss | Context menu phase | Outside click, scroll, Escape all close the menu |
| 30s poll overwrites in-progress edit | Edit-refresh pause phase | Edit a thought, wait 35s with no save, confirm draft is still intact |
| Brief date timezone mismatch | Brief history fix phase | Verify generate endpoint accepts client-provided date parameter |
| PDF served from ephemeral Railway disk | Brief history fix phase | Deploy to Railway, generate brief, re-deploy, confirm old brief still loads |

---

## Sources

- Codebase: `vigil-core/src/middleware/auth.ts` — existing bearer token model has no userId field
- Codebase: `vigil-core/src/db/schema.ts` — no userId column on any table; briefs.pdfFilename is nullable
- Codebase: `vigil-pwa/src/hooks/useThoughts.ts` — `setInterval(refetch, 30_000)` with no edit guard (line 85)
- Codebase: `vigil-pwa/src/components/ThoughtRow.tsx` — edit state local to component, no parent callbacks
- Codebase: `vigil-pwa/src/pages/BriefHistoryPage.tsx` — calls `getBriefPdf(date)` which depends on disk-stored file
- WebKit bug: contextmenu not fired on iOS — React issue #17596, Leaflet issue #6817, Apple Developer Forums thread/699834
- Radix UI primitives discussion #930 — long press context menu on iOS requires custom touch event handler
- Railway docs — filesystem is ephemeral per deploy; PostgreSQL managed addon persists
- Drizzle ORM custom migrations — three-step nullable → backfill → NOT NULL pattern
- Hono context docs — `c.set`/`c.get` are per-request scoped; use `createFactory` for typed context variables
- Zero-downtime DB migrations: hoop.dev — add nullable column first, backfill in batches, add NOT NULL constraint last

---
*Pitfalls research for: Vigil v3.4 — multi-user auth migration, PWA context menu, edit-refresh pause, brief history fix*
*Researched: 2026-04-17*
