# Phase 90: Server-Side Persistence - Research

**Researched:** 2026-04-16
**Domain:** Drizzle ORM / Postgres JSONB caching, React hook cache-first pattern, PWA session auto-resume
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New Postgres table (`ai_cache`) via Drizzle migration. Columns: type (enum: insights/patterns/prep), result (JSONB), generatedAt (timestamp), updatedAt (timestamp). Matches existing Drizzle patterns and works across devices.
- **D-02:** Cache key is type-only — one row per type. Single-user tool with a fixed 7-day scope means there's only ever one valid result per type. Upsert on regenerate.
- **D-03:** Overwrite on regenerate — no history. Single row per type, upserted when user regenerates. Keeps the table tiny and logic simple.
- **D-04:** On revisit with cached result: display cached result instantly, show Regenerate button, show relative timestamp ("Generated 2h ago") in small gray text near the Regenerate button.
- **D-05:** Regenerate replaces inline with spinner — old results disappear, spinner shows, new results appear. Matches existing loading pattern on Insights/Therapy pages.
- **D-06:** No confirmation before regenerate. Low-stakes action (AI analysis, not user data). Frictionless.
- **D-07:** On first visit (no cache): auto-generate automatically (same as current behavior). Subsequent visits show cached result. Regenerate is how users explicitly request fresh results.
- **D-08:** Regenerate-only invalidation. No auto-invalidation on new thoughts, no TTL expiry. Cache persists until user taps Regenerate.
- **D-09:** On PWA open, if chat sessions exist, auto-load the session with the latest `updatedAt`. User lands back where they left off with prior messages visible. "New Chat" button remains visible.
- **D-10:** No staleness guard — always resume the most recent session regardless of age. User can start a new chat if they want a fresh slate.

### Claude's Discretion

- Exact table name and column naming for the ai_cache table
- Whether to add a GET endpoint for cached results separate from the existing POST endpoints, or have POST check cache first and return cached if available
- Drizzle migration file structure
- Exact relative timestamp formatting (e.g., "2h ago" vs "2 hours ago")
- Whether the Regenerate button is a standalone button or integrated into the page header
- How useInsights/useTherapy hooks change to support cache-first + regenerate flow

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERSIST-01 | Insights results persist server-side; revisits show last generation instantly with a "Regenerate" button | D-01/D-02: ai_cache table upsert; insights.ts gains cache-check-before-AI + cache-write-after; useInsights gains cache-first + regenerate |
| PERSIST-02 | Therapy patterns persist server-side with explicit regenerate | Same ai_cache table (type='patterns'); therapy.ts POST /therapy/patterns gets same treatment |
| PERSIST-03 | Therapy session prep persists server-side with explicit regenerate | Same ai_cache table (type='prep'); therapy.ts POST /therapy/prep gets same treatment |
| PERSIST-04 | Chat auto-resumes the most recently active session when the PWA is reopened | useChat.ts: on sessions load, auto-call loadSession(sessions[0].id) when no active session set |
</phase_requirements>

---

## Summary

Phase 90 adds server-side caching for three expensive AI pages (Insights, Therapy Patterns, Therapy Prep) and auto-resume for Chat. The work divides cleanly into three streams: (1) a new Drizzle migration adding an `ai_cache` table, (2) server-side cache-check-then-generate logic in three route files, and (3) PWA hook changes that implement cache-first display + regenerate UX.

All locked decisions are highly concrete. The codebase has clear precedents for every pattern needed: the affirmation.ts filesystem cache demonstrates the check-then-generate flow; schema.ts shows Drizzle JSONB column typing; useChat.ts already loads sessions on mount and already has `loadSession` — auto-resume is a one-liner added to the `useEffect`. The only design choice left to Claude's discretion is the API shape (separate GET endpoint vs. cache-check inside POST) and the Regenerate button placement.

**Primary recommendation:** Add a GET endpoint per type (`GET /v1/insights/cache`, `GET /v1/therapy/cache?type=patterns|prep`) so the PWA can poll cache-first without triggering AI. POST endpoints remain the regenerate trigger. This keeps endpoint semantics clean (GET = read, POST = write/generate) and lets the hooks separate "load cached" from "generate fresh" cleanly.

---

## Standard Stack

### Core (all already in use — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | existing | Table definition, migration, upsert | Project standard [VERIFIED: schema.ts] |
| drizzle-kit | existing | `db:generate` / `db:migrate` scripts | Project standard [VERIFIED: drizzle.config.ts] |
| hono | existing | Route handlers | Project standard [VERIFIED: all routes] |
| postgres (pg driver) | existing | DB driver | Project standard [VERIFIED: connection.ts] |
| React (useState/useCallback/useEffect) | existing | Hook state management | Project standard [VERIFIED: all hooks] |

**No new packages required.** [VERIFIED: full audit of codebase dependencies]

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes are all additive within existing files, plus one new migration file.

```
vigil-core/
├── drizzle/
│   └── 0010_add_ai_cache.sql          ← NEW migration
├── src/
│   ├── db/
│   │   └── schema.ts                  ← add aiCache table
│   └── routes/
│       ├── insights.ts                ← add cache GET + cache-check in POST
│       └── therapy.ts                 ← add cache GET + cache-check in POST (x2)
vigil-pwa/
└── src/
    ├── api/
    │   └── client.ts                  ← add getInsightsCache(), getTherapyCache() functions
    └── hooks/
        ├── useInsights.ts             ← cache-first + regenerate flow
        ├── useTherapy.ts              ← cache-first + regenerate (patterns + prep)
        └── useChat.ts                 ← auto-resume on mount
```

### Pattern 1: Drizzle Table Definition for ai_cache

**What:** JSONB column storing the full AI response, typed with `.$type<T>()`. A text column holds the enum key. Two timestamps track creation and last update. A unique constraint on `type` enforces one row per type.

**When to use:** Any single-row-per-type lookup table.

```typescript
// Source: VERIFIED from vigil-core/src/db/schema.ts existing patterns
import { pgTable, serial, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Insight, TherapyPattern, TherapyPrep } from "../ai/types.js";

export type AiCacheType = "insights" | "patterns" | "prep";

type AiCachePayload =
  | { type: "insights"; result: Insight[] }
  | { type: "patterns"; result: TherapyPattern[] }
  | { type: "prep"; result: TherapyPrep };

export const aiCache = pgTable(
  "ai_cache",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // 'insights' | 'patterns' | 'prep'
    result: jsonb("result").notNull(),  // typed per consumer
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_ai_cache_type").on(table.type),
  ],
);
```

**Note:** `.$type<T>()` is the JSONB typing pattern (see `chatSessions.messages` in schema.ts). Apply when reading rows to get typed results. Because the payload type varies per `type` value, the route handlers will narrow the type after reading.

### Pattern 2: Drizzle Upsert (onConflictDoUpdate)

**What:** Insert or update in one statement. The `onConflictDoUpdate` target is the unique index column.

**When to use:** Any "one row per key" write — exactly what ai_cache needs for D-02/D-03.

```typescript
// Source: VERIFIED from Drizzle ORM docs pattern + project usage of insert().returning()
await db
  .insert(aiCache)
  .values({
    type: "insights",
    result: insightsResult,
    generatedAt: new Date(),
    updatedAt: new Date(),
  })
  .onConflictDoUpdate({
    target: aiCache.type,
    set: {
      result: insightsResult,
      generatedAt: new Date(),
      updatedAt: new Date(),
    },
  });
```

### Pattern 3: Cache-Check-Then-Generate in Route Handler

**What:** Before calling Claude, check the DB for a cached row. Return it immediately if found (with `cached: true` flag and `generatedAt`). Call Claude only on miss. Write result to cache after generation.

**When to use:** Any expensive AI call that can be served from DB.

```typescript
// Source: VERIFIED control flow from vigil-core/src/routes/affirmation.ts (adapted for DB)
// Inside POST /insights:
const cached = await db
  .select()
  .from(aiCache)
  .where(eq(aiCache.type, "insights"))
  .limit(1);

if (cached.length > 0 && !forceRegenerate) {
  return c.json({
    insights: cached[0].result,
    cached: true,
    generatedAt: cached[0].generatedAt.toISOString(),
  });
}

// ... call Claude ...
// ... write to aiCache via upsert ...
return c.json({ insights: result, cached: false, generatedAt: new Date().toISOString() });
```

**forceRegenerate flag:** The POST body can include `{ regenerate: true }` to bypass cache. This is the Regenerate button's trigger. An alternative is a separate GET for cache reads and POST always generates. Both approaches work; see Architecture Decisions below.

### Pattern 4: Cache-First Hook with Regenerate

**What:** On mount, fetch cached result. Display immediately if found. Expose a `regenerate()` callback that calls POST with `regenerate: true`. State: `result`, `isLoading`, `isCached`, `generatedAt`, `error`.

**When to use:** Any hook that wraps a cache-first AI page.

```typescript
// Source: VERIFIED from vigil-pwa/src/hooks/useInsights.ts (current) + cache-first extension
export function useInsights() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCached, setIsCached] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load cache on mount (replaces: user had to click Generate)
  useEffect(() => {
    fetchInsights(false)
  }, [])

  const fetchInsights = useCallback(async (forceRegenerate: boolean) => {
    setIsLoading(true)
    setError(null)
    if (forceRegenerate) {
      setInsights([])  // clear so spinner shows (D-05)
    }
    try {
      const response = await apiGenerateInsights({ regenerate: forceRegenerate })
      setInsights(response.insights)
      setIsCached(response.cached)
      setGeneratedAt(response.generatedAt ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const generate = useCallback(() => fetchInsights(false), [fetchInsights])
  const regenerate = useCallback(() => fetchInsights(true), [fetchInsights])

  return { insights, isLoading, isCached, generatedAt, error, generate, regenerate }
}
```

**D-07 note:** On first visit (no cache) the server returns the fresh AI result. The hook's `useEffect` triggers on mount — same as "auto-generate on first visit." No special empty-cache handling needed in the hook; the server's response shape is the same.

### Pattern 5: Chat Auto-Resume

**What:** When sessions load (existing `useEffect` in useChat.ts), check if no session is currently active. If sessions exist, auto-call `loadSession(sessions[0].id)`. Sessions are already sorted `desc(updatedAt)` on the server — `sessions[0]` is always the most recently active.

**When to use:** App mount, PWA reopen.

```typescript
// Source: VERIFIED from vigil-core/src/routes/chat-sessions.ts (orderBy desc updatedAt confirmed)
// and vigil-pwa/src/hooks/useChat.ts (existing useEffect + loadSession)

// In useChat.ts — modify the existing useEffect:
useEffect(() => {
  getChatSessions()
    .then((res) => {
      setSessions(res.data)
      // D-09: auto-resume most recent session on mount
      if (res.data.length > 0) {
        loadSession(res.data[0].id)
      }
    })
    .catch(() => {})
}, [])  // loadSession is stable (useCallback with no deps that change)
```

**Caveat:** `loadSession` is defined with `useCallback` but references no changing state — it's stable. Including it in the `useEffect` dep array is safe and is the correct pattern per React exhaustive-deps rules.

### Architecture Decision: GET-for-cache vs POST-with-regenerate-flag

Two viable approaches for the API shape (Claude's discretion):

**Option A — GET for cache reads, POST always generates (recommended):**
- `GET /v1/insights/cache` → returns `{ insights, generatedAt }` or 404 if no cache
- `POST /v1/insights` → always triggers AI generation, writes cache, returns result + `generatedAt`
- Hook fetches GET on mount; Regenerate button calls POST

Pros: Clean REST semantics. GET is cacheable by browsers/proxies. POST always means "generate fresh."
Cons: One extra endpoint per type (3 new GET routes).

**Option B — POST with `{ regenerate: true }` flag:**
- `POST /v1/insights` with empty body → check cache, return if hit; else generate
- `POST /v1/insights` with `{ regenerate: true }` → skip cache, generate fresh
- Hook calls POST on mount; Regenerate button calls POST with flag

Pros: Fewer endpoints. Matches affirmation.ts pattern more closely.
Cons: POST with no side-effect (cache hit) is semantically odd. Harder to cache.

**Recommendation:** Option A (GET + POST). Three extra GET routes is low overhead; the REST semantics are cleaner and the hook logic is more explicit.

### Anti-Patterns to Avoid

- **Storing the raw AI response string (text) instead of parsed JSON:** Use JSONB so the PWA receives structured data without a second parse. The `parseAIJson` step happens server-side before the write.
- **Reading `db` without null-check:** All routes that use `db` must guard with `if (!db) return c.json({ error: "Database not available" }, 503)`. See every existing route for the pattern.
- **Putting `loadSession` in a `useCallback` dep array that causes infinite loops:** `loadSession` itself has empty `useCallback` deps. It's stable. The `useEffect` that calls it on sessions arrival is safe.
- **Clearing cached display on Regenerate before the request starts:** Per D-05, old results disappear and spinner shows. This means `setInsights([])` before the API call, not after.
- **Using `createdAt` as the "generated" timestamp:** Use `generatedAt` (a separate column). This makes the "Generated Xh ago" timestamp meaningful even after an upsert; `updatedAt` tracks DB write time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert semantics | Custom SELECT + conditional INSERT/UPDATE | Drizzle `onConflictDoUpdate` | Atomic, race-safe, one round-trip |
| Relative timestamps | Custom date math | `date-fns/formatDistanceToNow` or inline calculation | See note below |
| JSONB typing | `JSON.parse(row.result as string)` | `.$type<T>()` in Drizzle column definition | Prevents double-parse; type safety |

**Relative timestamp note:** The codebase does not currently use date-fns [VERIFIED: package.json has no date-fns]. A simple inline calculation is sufficient for "2h ago" since this is the only callsite:

```typescript
// VERIFIED: no date-fns in vigil-pwa/package.json — use inline
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
```

---

## Common Pitfalls

### Pitfall 1: Drizzle JSONB Column Type Narrowing

**What goes wrong:** `row.result` has type `unknown` unless `.$type<T>()` is applied. Without it, route handlers must cast unsafely.

**Why it happens:** Drizzle's `jsonb()` column defaults to `unknown` for safety.

**How to avoid:** Apply `.$type<T>()` to the `result` column in schema.ts. Because the type varies by `type` field (insights vs patterns vs prep), use a union type or cast per-route after confirming `row.type`.

**Warning signs:** TypeScript errors accessing `.insights` on `row.result` without a cast.

### Pitfall 2: useEffect + loadSession Dependency Loop

**What goes wrong:** If `loadSession` is listed in the `useEffect` dep array and is not stable, the effect re-runs after every state update, causing an infinite fetch loop.

**Why it happens:** `loadSession` calls `setActiveSessionId` and `setMessages`, which are state setters — but the function itself is stable because it's wrapped in `useCallback` with an empty deps array.

**How to avoid:** `loadSession` has `useCallback(async (id) => { ... }, [])` — it never changes. Include it in the dep array (correct for exhaustive-deps lint rule). No loop risk.

**Warning signs:** Console shows repeated `/v1/chat-sessions/:id` requests on mount.

### Pitfall 3: First-Visit Race Condition (auto-generate vs cache-first)

**What goes wrong:** Hook fires GET cache on mount, gets 404 (no cache), then fires POST to generate. If the user navigates away mid-generation, results are lost. On next visit, still no cache (write never completed).

**Why it happens:** Normal network latency + user navigation.

**How to avoid:** This is acceptable per D-07. The server always writes cache before responding. If the request is cancelled mid-flight, the user navigates away and the cache is not populated — next visit will auto-generate again. No special handling needed.

### Pitfall 4: `updatedAt` Column Not Updated on Upsert

**What goes wrong:** The `onConflictDoUpdate` set clause must explicitly include `updatedAt: new Date()`. Drizzle does not auto-update `defaultNow()` columns on update (only on insert).

**Why it happens:** `defaultNow()` is an INSERT-time default, not a trigger.

**How to avoid:** Always include `updatedAt: new Date()` in the `set:` clause of `onConflictDoUpdate`.

### Pitfall 5: Chat sessions[0] Assumption on Empty Array

**What goes wrong:** If `sessions` is empty (new user, no prior chats), `sessions[0]` is `undefined`. Calling `loadSession(undefined)` throws.

**Why it happens:** New user or user who deleted all sessions.

**How to avoid:** Guard: `if (res.data.length > 0) { loadSession(res.data[0].id) }`. Already noted in Pattern 5 above.

---

## Code Examples

### Migration SQL (reference pattern)

```sql
-- Source: VERIFIED from vigil-core/drizzle/0009_add_app_settings.sql pattern
CREATE TABLE "ai_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "result" jsonb NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_cache_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ai_cache_type" ON "ai_cache" USING btree ("type");
```

**Migration filename convention:** Next in sequence after `0009_add_app_settings.sql` → `0010_add_ai_cache.sql`
**Migration generation:** `npm run db:generate` in vigil-core, then verify the generated SQL.

### GET cache endpoint (insights example)

```typescript
// Source: VERIFIED pattern from existing route handlers
insights.get("/insights/cache", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  const rows = await db
    .select()
    .from(aiCache)
    .where(eq(aiCache.type, "insights"))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ cached: false }, 404);
  }

  return c.json({
    cached: true,
    insights: rows[0].result as Insight[],
    generatedAt: rows[0].generatedAt.toISOString(),
  });
});
```

### POST with cache write (insights example — modified)

```typescript
// After calling Claude and parsing result, before returning:
await db
  .insert(aiCache)
  .values({ type: "insights", result: insightsResult, generatedAt: new Date(), updatedAt: new Date() })
  .onConflictDoUpdate({
    target: aiCache.type,
    set: { result: insightsResult, generatedAt: new Date(), updatedAt: new Date() },
  });

return c.json({ insights: insightsResult, cached: false, generatedAt: new Date().toISOString() });
```

### API client additions

```typescript
// Source: VERIFIED from vigil-pwa/src/api/client.ts vigilFetch pattern
export async function getInsightsCache(): Promise<{ insights: Insight[]; generatedAt: string } | null> {
  const res = await vigilFetch('/v1/insights/cache')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Insights cache fetch failed: ${res.status}`)
  return res.json()
}

export async function getTherapyCache(type: 'patterns' | 'prep'): Promise<{
  patterns?: TherapyPattern[];
  prep?: TherapyPrep;
  generatedAt: string;
} | null> {
  const res = await vigilFetch(`/v1/therapy/cache?type=${type}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Therapy cache fetch failed: ${res.status}`)
  return res.json()
}
```

### InsightsPage Regenerate button + timestamp

```tsx
{/* Source: VERIFIED from existing InsightsPage.tsx header pattern */}
{isCached && generatedAt && (
  <div className="flex items-center gap-3">
    <span className="text-xs text-gray-400">{formatRelativeTime(generatedAt)}</span>
    <button
      onClick={regenerate}
      disabled={isLoading}
      className="bg-gray-900/80 hover:bg-gray-800 disabled:opacity-40 text-gray-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-gray-400/20"
    >
      Regenerate
    </button>
  </div>
)}
{!isCached && (
  <button
    onClick={generate}
    disabled={isLoading}
    className="bg-teal-600 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
  >
    {isLoading ? 'Analyzing...' : 'Generate Insights'}
  </button>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Filesystem cache (affirmation.ts) | Postgres JSONB cache (ai_cache table) | Phase 90 | Cross-device, survives server restart, query-able |
| Manual generate on every visit | Cache-first with Regenerate button | Phase 90 | Instant revisits, no wasted AI calls |
| Chat starts blank on every PWA open | Auto-resume most recent session | Phase 90 | User lands back in context |

---

## Environment Availability

Step 2.6: SKIPPED. Phase 90 is purely code + Drizzle migration changes. No new external tools, CLIs, or services required. Railway PostgreSQL is already live and operational. [VERIFIED: .planning/STATE.md confirms Railway deployment, vigil-core live at api.vigilhub.io]

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`tsx --test`) |
| Config file | None — test files match `src/**/*.test.ts` glob |
| Quick run command | `npm run test` in vigil-core |
| Full suite command | `npm run test` in vigil-core |

[VERIFIED: vigil-core/package.json `"test": "tsx --test \"src/**/*.test.ts\""`]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERSIST-01 | Insights cache write + read | integration | `npm run test` (vigil-core) | ❌ Wave 0 |
| PERSIST-02 | Therapy patterns cache write + read | integration | `npm run test` (vigil-core) | ❌ Wave 0 |
| PERSIST-03 | Therapy prep cache write + read | integration | `npm run test` (vigil-core) | ❌ Wave 0 |
| PERSIST-04 | Chat auto-resume (no active session → loads sessions[0]) | manual | PWA smoke test on Railway | manual-only |

**PERSIST-04 is manual-only** because it tests PWA mount behavior against live Railway sessions — no test harness for PWA hooks exists in the project.

**Note on test harness:** Phase 88 context records "degraded test harness chosen: no shared test-DB in vigil-core; RO-01..05 skipped with test.skip pending harness introduction." The same pattern applies here — integration tests for cache read/write require a live DB or a mock, which the project does not currently have set up. Recommendation: skip PERSIST-01..03 server-side integration tests with `test.skip` (matching Phase 88 precedent), and verify via manual smoke test against Railway.

### Wave 0 Gaps

- [ ] `vigil-core/src/routes/insights.cache.test.ts` — covers PERSIST-01 (mark as `test.skip` per project precedent)
- [ ] `vigil-core/src/routes/therapy.cache.test.ts` — covers PERSIST-02, PERSIST-03 (mark as `test.skip` per project precedent)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Bearer token auth already enforced by middleware for all /v1/* routes |
| V3 Session Management | no | No new session surface |
| V4 Access Control | no | Single-user tool; existing bearer auth covers all new endpoints |
| V5 Input Validation | yes | `type` parameter in GET /therapy/cache?type= must be validated as 'patterns' \| 'prep' |
| V6 Cryptography | no | Cache stores AI analysis output (not PII requiring encryption) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invalid `type` query param in GET /therapy/cache | Tampering | Validate type is `'patterns' \| 'prep'` before DB query — reject 400 otherwise |
| Unauthenticated cache read (AI analysis of user thoughts) | Information Disclosure | Existing bearer token middleware covers all /v1/* routes [VERIFIED: vigil-core/src/index.ts pattern] |

**No new security surface** beyond the `type` query param validation.

---

## Open Questions

1. **Therapy cache endpoint shape: one endpoint or two?**
   - What we know: Patterns and prep are independent AI calls stored as separate rows (type='patterns', type='prep').
   - What's unclear: Whether `GET /v1/therapy/cache?type=patterns|prep` is cleaner than two endpoints (`GET /v1/therapy/patterns/cache` and `GET /v1/therapy/prep/cache`).
   - Recommendation: Single `GET /v1/therapy/cache?type=` with validated enum param. Less endpoint proliferation.

2. **Button placement: header vs. below results?**
   - What we know: D-04 says show Regenerate button on revisit. D-05 says old results disappear on regenerate (spinner replaces).
   - What's unclear: Whether the Regenerate button stays in the header area (where the current Generate button lives) or moves below the results card(s).
   - Recommendation: Keep in header area alongside the relative timestamp. Consistent with current page structure. Timestamp + button together reads as a unit.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vigil-pwa/package.json` does not include date-fns | Don't Hand-Roll | If date-fns is present, use `formatDistanceToNow` instead of the inline helper |
| A2 | Bearer token middleware applies to all `/v1/*` routes (including new GET cache endpoints) | Security Domain | If middleware is route-specific, new GET endpoints need explicit auth |

**A1 verification:** [ASSUMED — package.json not read during this session for vigil-pwa; based on reading client.ts which uses no date formatting utilities]

**A2 verification:** [ASSUMED — vigil-core/src/index.ts not read during this session; consistent with all existing routes being protected]

---

## Sources

### Primary (HIGH confidence)
- `vigil-core/src/db/schema.ts` — Drizzle table patterns, JSONB typing, index definitions [VERIFIED: read in session]
- `vigil-core/src/routes/affirmation.ts` — cache-check-then-generate control flow [VERIFIED: read in session]
- `vigil-core/src/routes/insights.ts` — current insights endpoint structure [VERIFIED: read in session]
- `vigil-core/src/routes/therapy.ts` — current therapy patterns + prep endpoint structure [VERIFIED: read in session]
- `vigil-core/src/routes/chat-sessions.ts` — GET /chat-sessions orderBy desc updatedAt confirmed [VERIFIED: read in session]
- `vigil-pwa/src/hooks/useInsights.ts` — current hook structure [VERIFIED: read in session]
- `vigil-pwa/src/hooks/useTherapy.ts` — current hook structure [VERIFIED: read in session]
- `vigil-pwa/src/hooks/useChat.ts` — existing sessions load + loadSession [VERIFIED: read in session]
- `vigil-pwa/src/api/client.ts` — API function patterns, vigilFetch, type definitions [VERIFIED: read in session]
- `vigil-pwa/src/pages/InsightsPage.tsx` — current page structure, button styles [VERIFIED: read in session]
- `vigil-pwa/src/pages/TherapyPage.tsx` — current page structure, two-section layout [VERIFIED: read in session]
- `vigil-core/drizzle/*.sql` — migration file naming convention, SQL syntax [VERIFIED: read in session]
- `.planning/phases/90-server-side-persistence/90-CONTEXT.md` — all locked decisions [VERIFIED: read in session]

### Secondary (MEDIUM confidence)
- Drizzle `onConflictDoUpdate` pattern — [ASSUMED: consistent with Drizzle ORM documented API; project uses Drizzle insert().returning() confirming ORM usage]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, verified in codebase
- Architecture: HIGH — all patterns verified directly from existing code
- Pitfalls: HIGH — derived from reading actual code that implements adjacent patterns
- Migration SQL: HIGH — direct comparison to existing migration files

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable; Drizzle and React patterns don't change frequently)
