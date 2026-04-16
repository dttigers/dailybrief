# Phase 90: Server-Side Persistence - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Cache the three expensive AI-generated results (Insights, Therapy patterns, Therapy session prep) server-side so revisits display the last generation instantly with a Regenerate button; Chat auto-resumes the most recently active session when the PWA reopens.

**Requirements covered:** PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04

**Out of scope:** Daily brief PDF 7-day scope (Phase 93, SCOPE-04), Tasks tab filtering (Phase 91), Work Order archive (Phase 92), any new AI analysis capabilities.

</domain>

<decisions>
## Implementation Decisions

### Cache Storage
- **D-01:** New Postgres table (e.g., `ai_cache`) via Drizzle migration. Columns: type (enum: insights/patterns/prep), result (JSONB), generatedAt (timestamp), updatedAt (timestamp). Matches existing Drizzle patterns and works across devices.
- **D-02:** Cache key is type-only — one row per type. Single-user tool with a fixed 7-day scope means there's only ever one valid result per type. Upsert on regenerate.
- **D-03:** Overwrite on regenerate — no history. Single row per type, upserted when user regenerates. Keeps the table tiny and logic simple.

### Regenerate UX
- **D-04:** On revisit with cached result: display cached result instantly, show Regenerate button, show relative timestamp ("Generated 2h ago") in small gray text near the Regenerate button.
- **D-05:** Regenerate replaces inline with spinner — old results disappear, spinner shows, new results appear. Matches existing loading pattern on Insights/Therapy pages.
- **D-06:** No confirmation before regenerate. Low-stakes action (AI analysis, not user data). Frictionless.
- **D-07:** On first visit (no cache): auto-generate automatically (same as current behavior). Subsequent visits show cached result. Regenerate is how users explicitly request fresh results.

### Cache Lifetime & Invalidation
- **D-08:** Regenerate-only invalidation. No auto-invalidation on new thoughts, no TTL expiry. Cache persists until user taps Regenerate. The "Generated Xh ago" timestamp lets users judge freshness themselves.

### Chat Auto-Resume
- **D-09:** On PWA open, if chat sessions exist, auto-load the session with the latest `updatedAt`. User lands back where they left off with prior messages visible. "New Chat" button remains visible for starting fresh.
- **D-10:** No staleness guard — always resume the most recent session regardless of age. User can start a new chat if they want a fresh slate.

### Claude's Discretion
- Exact table name and column naming for the ai_cache table
- Whether to add a GET endpoint for cached results separate from the existing POST endpoints, or have POST check cache first and return cached if available
- Drizzle migration file structure
- Exact relative timestamp formatting (e.g., "2h ago" vs "2 hours ago")
- Whether the Regenerate button is a standalone button or integrated into the page header
- How useInsights/useTherapy hooks change to support cache-first + regenerate flow

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requirements
- `.planning/ROADMAP.md` §"Phase 90" — phase goal, depends-on, success criteria
- `.planning/REQUIREMENTS.md` §PERSIST-01..04 — acceptance criteria wording

### Phase 89 context (direct dependency)
- `.planning/phases/89-7-day-analysis-scope/89-CONTEXT.md` — D-01 confirms all three endpoints are fully server-side; D-05/D-06 define insufficient-data behavior; D-07 defines "Analyzing last 7 days" subheading

### Phase 88 context (transitive dependency)
- `.planning/phases/88-date-window-helper-rollover/88-CONTEXT.md` — D-01 defines `getRollingDayWindow` signature

### Code touchpoints — server
- `vigil-core/src/routes/insights.ts` — POST /insights endpoint (needs cache-check-before-AI-call + cache-write-after)
- `vigil-core/src/routes/therapy.ts` — POST /therapy/patterns and POST /therapy/prep (same cache integration)
- `vigil-core/src/routes/chat-sessions.ts` — existing CRUD for chat sessions (no server changes needed for auto-resume; this is PWA-only)
- `vigil-core/src/db/schema.ts` — new ai_cache table definition
- `vigil-core/src/routes/affirmation.ts` — reference for existing caching pattern (filesystem-based; NOT the model for Phase 90, but shows cache-check-then-generate flow)

### Code touchpoints — PWA
- `vigil-pwa/src/hooks/useInsights.ts` — needs cache-first flow + regenerate trigger
- `vigil-pwa/src/hooks/useTherapy.ts` — needs cache-first flow + regenerate trigger for both patterns and prep
- `vigil-pwa/src/hooks/useChat.ts` — needs auto-load most recent session on mount
- `vigil-pwa/src/pages/InsightsPage.tsx` — Regenerate button + "Generated Xh ago" timestamp
- `vigil-pwa/src/pages/TherapyPage.tsx` — Regenerate button + timestamp (for both patterns and prep sections)
- `vigil-pwa/src/pages/ChatPage.tsx` — may need changes for auto-resume UX
- `vigil-pwa/src/api/client.ts` — new/updated API functions for cache retrieval

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vigil-core/src/routes/chat-sessions.ts` — Full CRUD already exists for chat sessions (list, get, create, update, delete). Auto-resume is purely a PWA hook change.
- `vigil-core/src/routes/affirmation.ts` — Cache-check-then-generate flow pattern (filesystem-based, but the control flow is reusable: check cache -> return if hit -> generate -> write cache -> return).
- `vigil-core/src/db/schema.ts` — Existing Drizzle table definitions with `pgTable`, `serial`, `text`, `jsonb`, `timestamp` patterns.
- `vigil-pwa/src/hooks/useInsights.ts` — Simple generate-on-demand hook; needs cache-first wrapper.
- `vigil-pwa/src/hooks/useTherapy.ts` — Dual-action hook (patterns + prep); both need cache-first wrapper.

### Established Patterns
- Route handlers access DB via `db` import from `../db/connection.js` (some routes) or `c.get('db')` Hono context.
- Drizzle queries use `conditions[]` array assembled with `and(...conditions)`.
- JSONB columns typed with `.$type<T>()` (see `chatSessions.messages`).
- PWA hooks use `useState` + `useCallback` pattern; no external state management.
- API client functions in `vigil-pwa/src/api/client.ts` wrap fetch calls.

### Integration Points
- New Drizzle migration for `ai_cache` table.
- Three route files gain cache-check logic (insights.ts, therapy.ts x2 endpoints).
- Three PWA hooks gain cache-first + regenerate flow.
- ChatPage or useChat hook gains auto-load-most-recent on mount.

</code_context>

<specifics>
## Specific Ideas

- The cache table holds one row per AI type — upsert semantics mean the table never grows beyond 3 rows.
- "Generated 2h ago" relative timestamp helps user decide whether to regenerate without being noisy.
- Auto-generate on first visit (no cache) preserves current behavior — no regression for new users.
- Chat auto-resume is the simplest change: `useChat` already loads sessions on mount; just auto-call `loadSession(sessions[0].id)` when sessions arrive and no active session is set.
- The Regenerate button and timestamp should be consistent across all three pages (Insights, Therapy patterns, Therapy prep).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 90-server-side-persistence*
*Context gathered: 2026-04-16*
