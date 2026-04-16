# Phase 89: 7-Day Analysis Scope - Research

**Researched:** 2026-04-16
**Domain:** Hono route refactoring, Drizzle ORM query composition, PWA hook simplification
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** All three endpoints (`POST /insights`, `POST /therapy/patterns`, `POST /therapy/prep`) become fully server-side: they query the DB for thoughts within the 7-day window using `getRollingDayWindow(tz, 7)`, then run Claude. Clients no longer send thoughts in the request body.
- **D-02:** PWA hooks (`useInsights.ts`, `useTherapy.ts`) simplify to just calling the endpoint with no body. The `getThoughts({ limit: 200, window: 'all' })` fetches are removed from these hooks.
- **D-03:** Therapy-specific filtering happens server-side in the DB query: Patterns endpoint queries thoughts with any `therapyClassification` set; Prep endpoint queries thoughts with `therapyClassification = 'bringToTherapist'`. Combined with the 7-day window filter in one Drizzle query.
- **D-04:** DB access via Hono context (`c.get('db')`) — matches the established pattern in `thoughts.ts` and other routes. (**CORRECTION below**)
- **D-05:** When the 7-day window yields fewer thoughts than the minimum (Insights: <3, Patterns: <5, Prep: <1), the endpoint returns a structured error with the count and a friendly message (e.g., "Only 2 thoughts this week — need at least 3 for insights"). No fallback to a wider window.
- **D-06:** Thresholds remain unchanged (Insights: 3, Patterns: 5, Prep: 1). No lowering.
- **D-07:** Insights and Therapy pages show a subtle subheading under the page title: "Analyzing last 7 days" — small gray text, consistent with the "This week" header pattern from Phase 88's Thoughts tab.
- **D-08:** AI prompt text hardcodes "7 days" literally (e.g., "from the last 7 days"). No variable/parameter. Therapy patterns prompt changes from "last 30 days" to "last 7 days".

### Claude's Discretion

- Exact Drizzle query structure for combining date-window + classification filters
- Whether to extract a shared "get thoughts in window" helper used by all three endpoints, or inline the query in each
- HTTP status code for the "insufficient data" response (400 vs 200 with empty result + message)
- Exact copy for the "Analyzing last 7 days" subheading and insufficient-data messages
- Whether the POST body becomes completely empty or accepts optional params for future extensibility

### Deferred Ideas (OUT OF SCOPE)

- Daily brief PDF 7-day scope (Phase 93, SCOPE-04)
- Server-side persistence/caching of results (Phase 90)
- Configurable analysis window (deferred past v3.2)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCOPE-01 | Insights generation only considers thoughts from the last 7 days | Server queries DB with `getRollingDayWindow(tz, 7)` bounds; client removes `getThoughts` prefetch |
| SCOPE-02 | Therapy pattern recognition only considers thoughts from the last 7 days | Same window + `therapyClassification IS NOT NULL` filter in one Drizzle query |
| SCOPE-03 | Therapy session prep only considers thoughts from the last 7 days | Same window + `therapyClassification = 'bringToTherapist'` filter in one Drizzle query |
</phase_requirements>

---

## Summary

Phase 89 converts three AI analysis endpoints from a "client pushes thoughts" model to a "server queries DB" model, gating all three to the last 7 calendar days using the `getRollingDayWindow` helper shipped in Phase 88. The migration is surgical: each of the three route handlers gains a DB query and loses its body-parsing for thoughts; the corresponding PWA hooks drop their `getThoughts` prefetches; two page components gain a one-line subheading; and three API client functions lose their `thoughts` parameters.

The codebase is fully understood from direct file reads. No external library research is needed — this phase reuses exclusively existing patterns: Drizzle `conditions[]` arrays, `getRollingDayWindow`, the inline timezone lookup from `appSettings`, and `callClaude` / `parseAIJson`. The only judgment call is whether to extract a shared DB query helper vs. inline the pattern in each of the three routes.

**Primary recommendation:** Inline the query in each route handler (3 handlers × ~10 lines each). Extraction into a shared helper belongs in Phase 90 (persistence), which will need a richer query abstraction anyway. Inlining now keeps this phase's diff small and Phase 90's refactor scoped.

---

## CRITICAL: DB Access Pattern Correction

**D-04 in CONTEXT.md states:** "DB access via Hono context (`c.get('db')`)"

**Reality verified in codebase [VERIFIED: grep across all route files]:** Zero occurrences of `c.get('db')` exist in `vigil-core/src/routes/`. Every route — `thoughts.ts`, `projects.ts`, `chat.ts`, `settings.ts`, all 20 routes — uses:

```typescript
import { db } from "../db/connection.js";
// ...
if (!db) return c.json({ error: "Database not available" }, 503);
```

**The planner MUST use the direct import pattern, not `c.get('db')`.**

---

## Standard Stack

### Core (all pre-existing, no new installs)

| Library | Source | Purpose | Why Standard |
|---------|--------|---------|--------------|
| `drizzle-orm` | already installed | DB query builder | All existing routes use it |
| `hono` | already installed | Route handler framework | Entire vigil-core is Hono |
| `getRollingDayWindow` | `src/utils/date-window.ts` | 7-day window bounds | Phase 88 output, purpose-built |
| `callClaude`, `parseAIJson` | `src/ai/client.ts` | AI request + response parsing | Already used in both route files |
| `appSettings` table | `src/db/schema.ts` | `user_timezone` key storage | All timezone lookups use this table |

**Installation:** None required. [VERIFIED: package.json not changed this phase]

---

## Architecture Patterns

### DB Access Pattern (canonical)

```typescript
// Source: vigil-core/src/routes/thoughts.ts (and all other routes)
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable, appSettings } from "../db/schema.js";
import { eq, and, gte, lt, isNotNull } from "drizzle-orm";
import { getRollingDayWindow } from "../utils/date-window.js";

// Inside handler:
if (!db) return c.json({ error: "Database not available" }, 503);

// Timezone lookup (inline, matches thoughts.ts:169-177)
const tzRows = await db
  .select({ value: appSettings.value })
  .from(appSettings)
  .where(eq(appSettings.key, "user_timezone"))
  .limit(1);
const tz = tzRows.length > 0 ? (tzRows[0].value as string) : "America/New_York";

// Window bounds
const { start, end } = getRollingDayWindow(tz, 7);
```
[VERIFIED: thoughts.ts lines 169-178, settings.ts DEFAULT_TIMEZONE constant]

### Drizzle Conditions Array Pattern

```typescript
// Source: vigil-core/src/routes/thoughts.ts
const conditions = [ne(thoughtsTable.syncStatus, "pendingDeletion")];
conditions.push(gte(thoughtsTable.createdAt, start));
conditions.push(lt(thoughtsTable.createdAt, end));
// Additional filter for therapy routes:
conditions.push(isNotNull(thoughtsTable.therapyClassification));
// OR for prep:
conditions.push(eq(thoughtsTable.therapyClassification, "bringToTherapist"));

const rows = await db
  .select()
  .from(thoughtsTable)
  .where(and(...conditions))
  .orderBy(desc(thoughtsTable.createdAt))
  .limit(200);
```
[VERIFIED: thoughts.ts lines 127-199]

### Drizzle Operator Import Note

The `isNotNull` operator is needed for the Patterns endpoint (any therapyClassification set). Verify it is exported from `drizzle-orm` — `thoughts.ts` currently imports `eq, and, ne, gte, lte, lt, desc, count, sql, isNull` — `isNotNull` is the inverse and is a standard drizzle-orm export. [ASSUMED — standard drizzle-orm, not grep-verified in this codebase, but isNull is already imported so isNotNull is available from the same package]

Alternative that avoids `isNotNull`: `ne(thoughtsTable.therapyClassification, null)` — but this is not idiomatic Drizzle for nullable columns. Prefer `isNotNull`.

### getRollingDayWindow Semantics

```typescript
// Source: vigil-core/src/utils/date-window.ts
// Returns: { start: Date; end: Date }
// start = 00:00 on the anchor day (INCLUSIVE), aligned to user tz
// end = now (NOT day-aligned, EXCLUSIVE-semantics via lt())
// Callers use: gte(createdAt, start) and lt(createdAt, end)
const { start, end } = getRollingDayWindow("America/New_York", 7);
```
[VERIFIED: date-window.ts lines 158-177]

### Insufficient Data Response

The CONTEXT.md specifies a structured error with count. Recommended pattern (aligns with existing route error shapes):

```typescript
// HTTP 400 — client request cannot be fulfilled with available data
return c.json(
  { error: "Only 2 thoughts this week — need at least 3 for insights", count: rows.length },
  400
);
```

This matches the existing pattern in `insights.ts` (line 34-39) and `therapy.ts` (line 107-110) where insufficient thoughts return 400. Recommendation: 400 (consistent with existing behavior, signals "not enough input" rather than server error).

### PWA Hook Simplification Pattern

```typescript
// BEFORE (useInsights.ts):
const result = await getThoughts({ limit: 200, window: 'all' })
const thoughts = result.data.map(...)
const response = await apiGenerateInsights(thoughts, days)

// AFTER:
const response = await apiGenerateInsights()  // no args
```

The hook drops `getThoughts` import, the `days` param from `generate(days?)`, and the client-side `thoughts.length < 3` check (server now enforces this and returns 400 with a message).

### API Client Function Signatures (after refactor)

```typescript
// BEFORE:
export async function generateInsights(
  thoughts: { id: number; content: string; category: string; createdAt: string }[],
  days = 7,
): Promise<{ insights: Insight[] }>

// AFTER:
export async function generateInsights(): Promise<{ insights: Insight[] }> {
  const res = await vigilFetch('/v1/insights', { method: 'POST', body: JSON.stringify({}) })
  ...
}
```

Similarly for `getTherapyPatterns` and `generateTherapyPrep` — both lose their `thoughts` and `days`/`patterns` parameters. The `patterns` context for prep is no longer passed from client (server can optionally derive it server-side, but CONTEXT.md D-01 says to run Claude directly — keep it simple, no client-side pattern injection in prep).

### Subheading UI Pattern

```tsx
// Source: vigil-pwa/src/pages/ThoughtsPage.tsx (Phase 88 pattern)
// InsightsPage.tsx — add after h1:
<h1 className="text-lg font-medium text-gray-50">Insights</h1>
<p className="text-xs text-gray-400 mt-0.5">Analyzing last 7 days</p>

// TherapyPage.tsx — add after each h2 section header:
<h2 className="text-lg font-medium text-gray-50">Therapy Patterns</h2>
<p className="text-xs text-gray-400 mt-0.5">Analyzing last 7 days</p>
```
[ASSUMED for exact class names — Phase 88 "This week" header uses similar gray text patterns; exact Tailwind classes are planner's discretion per CONTEXT.md D-07]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone-aware 7-day window | Custom date math | `getRollingDayWindow(tz, 7)` | Phase 88 purpose-built this; DST handling is already correct |
| Drizzle date range filter | Raw SQL WHERE | `gte` + `lt` with `Date` objects | Already the established pattern; Drizzle handles parameterization |
| Timezone resolution | Re-implement settings read | Inline `appSettings` query (same as thoughts.ts:169-177) | One place, same default fallback |
| Null check on therapyClassification | JS filter post-query | `isNotNull` in the WHERE clause | Push filter to DB, don't fetch and discard |

---

## Common Pitfalls

### Pitfall 1: Using `c.get('db')` instead of direct import
**What goes wrong:** `c.get('db')` returns `undefined` — this Hono context binding does not exist in vigil-core. Route crashes silently or returns 503.
**Why it happens:** CONTEXT.md D-04 describes a pattern that doesn't match the actual codebase.
**How to avoid:** Use `import { db } from "../db/connection.js"` and guard with `if (!db) return c.json(..., 503)`.
**Warning signs:** TypeScript error on `c.get('db')` type — no such key is registered on the Hono env.
[VERIFIED: grep found zero `c.get('db')` occurrences across all 20 route files]

### Pitfall 2: Using `lte` instead of `lt` for the window end bound
**What goes wrong:** Thoughts created at exactly `end` (i.e., right now) are included twice conceptually; more importantly, it's inconsistent with the `getRollingDayWindow` semantics which document `end === now` as exclusive.
**Why it happens:** `lte` vs `lt` confusion.
**How to avoid:** Use `lt(thoughtsTable.createdAt, end)` — matches `thoughts.ts:179` pattern for week window.
[VERIFIED: thoughts.ts line 179, date-window.ts docstring "end === now (not day-aligned)"]

### Pitfall 3: Forgetting `ne(syncStatus, "pendingDeletion")` guard
**What goes wrong:** Soft-deleted thoughts appear in AI analysis context.
**Why it happens:** All DB queries in thoughts.ts start with this condition; it's easy to miss when writing a fresh query in insights.ts/therapy.ts.
**How to avoid:** Always start the `conditions` array with `ne(thoughtsTable.syncStatus, "pendingDeletion")`.
[VERIFIED: thoughts.ts line 127]

### Pitfall 4: Leaving `thoughts` param in POST body parsing when none is sent
**What goes wrong:** If the route still attempts `body?.thoughts` after refactoring, it silently gets `undefined` — harmless but confusing. More importantly, the old `body.thoughts.length < N` guard becomes unreachable dead code.
**Why it happens:** Incremental refactor leaves old body-parsing code behind.
**How to avoid:** Remove all `ThoughtInput[]` / `PatternThought[]` / `PrepThought[]` interfaces and body-parsing for thoughts in the three route handlers. Body parsing can be entirely removed or kept minimal for future-extensibility (empty `{}` or no body).

### Pitfall 5: PWA hook still calling `getThoughts` after refactor
**What goes wrong:** Double round-trips per generation — one for thoughts (now unused), one for the AI endpoint. Client-side thought count check also becomes wrong (uses all-time count, not 7-day count).
**Why it happens:** Incremental refactor leaves `getThoughts` call in place.
**How to avoid:** Remove the `getThoughts` import from `useInsights.ts` and both `getThoughts` calls from `useTherapy.ts`. The `therapyThoughtCount` state in `useTherapy` also becomes irrelevant (count surfaced server-side in the error message instead).

### Pitfall 6: Passing `patterns` context to prep endpoint from client
**What goes wrong:** The prep endpoint in therapy.ts currently accepts `body.patterns` from the client for additional context. After refactoring, clients send no body — no patterns are available. The prep prompt degrades gracefully (the `patternSection` logic already handles empty patterns), so this is a silent behavior change, not a crash.
**Why it happens:** Current prep calls `generateTherapyPrep(mapped, patternSummaries)` passing patterns from the previous patterns call.
**How to avoid:** After refactoring, decide: (a) drop patterns context entirely (simpler, D-01 says "run Claude directly"), or (b) have the prep endpoint optionally query for patterns internally. Recommendation: drop patterns context in this phase. Phase 90 (persistence) will make patterns available server-side anyway.

---

## Code Examples

### Complete insight route handler (after refactor)

```typescript
// Source pattern: thoughts.ts timezone lookup + date-window.ts getRollingDayWindow
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable, appSettings } from "../db/schema.js";
import { eq, and, ne, gte, lt, desc } from "drizzle-orm";
import { getRollingDayWindow } from "../utils/date-window.js";

insights.post("/insights", async (c) => {
  if (!getAIClient()) {
    return c.json({ error: "AI service unavailable" }, 503);
  }
  if (!db) return c.json({ error: "Database not available" }, 503);

  // Resolve user timezone (same pattern as thoughts.ts:169-177)
  const tzRows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "user_timezone"))
    .limit(1);
  const tz = tzRows.length > 0 ? (tzRows[0].value as string) : "America/New_York";

  // 7-day rolling window
  const { start, end } = getRollingDayWindow(tz, 7);

  const conditions = [
    ne(thoughtsTable.syncStatus, "pendingDeletion"),
    gte(thoughtsTable.createdAt, start),
    lt(thoughtsTable.createdAt, end),
  ];

  const rows = await db
    .select()
    .from(thoughtsTable)
    .where(and(...conditions))
    .orderBy(desc(thoughtsTable.createdAt))
    .limit(200);

  if (rows.length < 3) {
    return c.json(
      { error: `Only ${rows.length} thought${rows.length === 1 ? "" : "s"} this week — need at least 3 for insights`, count: rows.length },
      400
    );
  }

  // Build prompt and call Claude (same as existing pattern)...
});
```

### Therapy patterns route (additional filter)

```typescript
// therapyClassification IS NOT NULL filter
import { isNotNull } from "drizzle-orm";

const conditions = [
  ne(thoughtsTable.syncStatus, "pendingDeletion"),
  gte(thoughtsTable.createdAt, start),
  lt(thoughtsTable.createdAt, end),
  isNotNull(thoughtsTable.therapyClassification),  // any therapy classification
];
```

### Therapy prep route (strict filter)

```typescript
// therapyClassification = 'bringToTherapist' filter
const conditions = [
  ne(thoughtsTable.syncStatus, "pendingDeletion"),
  gte(thoughtsTable.createdAt, start),
  lt(thoughtsTable.createdAt, end),
  eq(thoughtsTable.therapyClassification, "bringToTherapist"),
];
```

---

## File Change Inventory

Complete list of files touched by this phase:

**vigil-core (server):**
1. `vigil-core/src/routes/insights.ts` — Remove client thoughts parsing; add DB import, tz lookup, window query, updated prompt
2. `vigil-core/src/routes/therapy.ts` — Same for `/therapy/patterns` and `/therapy/prep`; remove `PatternThought`/`PrepThought` interfaces

**vigil-pwa (client):**
3. `vigil-pwa/src/hooks/useInsights.ts` — Remove `getThoughts` call, `days` param, client-side count check
4. `vigil-pwa/src/hooks/useTherapy.ts` — Remove both `getThoughts` calls, client-side filtering, `therapyThoughtCount` state
5. `vigil-pwa/src/api/client.ts` — Update `generateInsights()`, `getTherapyPatterns()`, `generateTherapyPrep()` signatures (remove thought params)
6. `vigil-pwa/src/pages/InsightsPage.tsx` — Add "Analyzing last 7 days" subheading
7. `vigil-pwa/src/pages/TherapyPage.tsx` — Add "Analyzing last 7 days" subheading (×2 sections)

**No schema changes, no migrations, no new dependencies.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `isNotNull` is exported from `drizzle-orm` (same package that exports `isNull`) | Code Examples | Low — use `ne(col, null)` as fallback; isNull IS imported in thoughts.ts so isNotNull is in the same package |
| A2 | Exact Tailwind classes for "Analyzing last 7 days" subheading | Code Examples | Low — planner has discretion per D-07; any small gray text class is acceptable |
| A3 | Prep endpoint dropping client-supplied patterns context is acceptable (degrades gracefully) | Common Pitfalls | Low — prep prompt already handles empty patterns; Phase 90 will restore richer context server-side |

---

## Open Questions

1. **Shared DB query helper vs. inline**
   - What we know: Three route handlers need nearly identical timezone + window + query boilerplate (~15 lines each)
   - What's unclear: Whether to extract `getThoughtsInWindow(db, tz, days, extraConditions)` now
   - Recommendation: Inline in each handler. 3 × 15 lines = 45 lines of near-duplicate code, but Phase 90 will restructure these endpoints around persistence anyway. Extracting now creates a helper that Phase 90 will likely replace.

2. **Empty POST body or omit body entirely**
   - What we know: Clients currently send `{ thoughts, days }` in body; after refactoring, there's nothing useful to send
   - What's unclear: Whether to keep body parsing for future extensibility
   - Recommendation: Clients send `{}` (empty JSON object) or no body. Server should not require a body but should tolerate one gracefully. PWA client sends no body (omit `body` from fetch, or send `{}`).

---

## Validation Architecture

`workflow.nyquist_validation` is absent from config.json — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (vigil-core) + Vitest (vigil-pwa) |
| Config file | `vigil-core/vitest.config.ts` (assumed) / package.json test script |
| Quick run command | `cd vigil-core && npm test -- --run` |
| Full suite command | `cd vigil-core && npm test -- --run && cd ../vigil-pwa && npm test -- --run` |

**Note:** Phase 88 CONTEXT.md establishes a "degraded test harness" — no shared test-DB in vigil-core; DB-touching tests (RO-01..05) are skipped with `test.skip`. The same constraint applies here: DB query behavior is verified manually (via logged query scope) rather than automated tests.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | Status |
|--------|----------|-----------|-------------------|--------|
| SCOPE-01 | Insights endpoint queries only 7-day window | Manual verification via server log / response | n/a — no test DB | Wave 0 gap |
| SCOPE-02 | Therapy patterns endpoint queries only 7-day window | Manual verification | n/a — no test DB | Wave 0 gap |
| SCOPE-03 | Therapy prep endpoint queries only 7-day window | Manual verification | n/a — no test DB | Wave 0 gap |
| SC-04 | All three endpoints share `getRollingDayWindow` helper (not duplicated) | Code review / grep | `grep -r "getRollingDayWindow" vigil-core/src/routes/` | Verifiable post-implementation |

### Sampling Rate
- **Per task commit:** TypeScript compile check (`cd vigil-core && npx tsc --noEmit`)
- **Per wave merge:** Full suite if any unit tests exist for the modified files
- **Phase gate:** TypeScript clean + manual generation test in browser

### Wave 0 Gaps
- No new test files required — DB-touching route tests are deferred per Phase 88 test harness decision
- TypeScript types are the primary automated correctness check for this phase

---

## Security Domain

Applicable ASVS categories for this phase:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Bearer auth handled by existing middleware (unchanged) |
| V3 Session Management | no | Stateless endpoints |
| V4 Access Control | no | All endpoints are behind existing `bearerAuth` middleware |
| V5 Input Validation | yes | Server no longer accepts client-sent thoughts — attack surface reduced |
| V6 Cryptography | no | No crypto operations |

**Security improvement:** Moving from client-sent to server-queried thoughts eliminates the possibility of a client injecting arbitrary thoughts into the AI context. The 7-day window also limits the scope of data exposed to Claude per request.

---

## Sources

### Primary (HIGH confidence)
- `vigil-core/src/utils/date-window.ts` — `getRollingDayWindow` signature and semantics [VERIFIED: file read]
- `vigil-core/src/routes/thoughts.ts` — DB import pattern, conditions array, timezone lookup, `ne(syncStatus, "pendingDeletion")` guard [VERIFIED: file read]
- `vigil-core/src/routes/insights.ts` — current client-sent pattern to be replaced [VERIFIED: file read]
- `vigil-core/src/routes/therapy.ts` — current patterns and prep endpoints [VERIFIED: file read]
- `vigil-core/src/routes/settings.ts` — timezone key constant (`"user_timezone"`) and default (`"America/New_York"`) [VERIFIED: file read]
- `vigil-core/src/db/schema.ts` — `therapyClassification` column type (nullable text) [VERIFIED: file read]
- `vigil-pwa/src/hooks/useInsights.ts` — current getThoughts call to remove [VERIFIED: file read]
- `vigil-pwa/src/hooks/useTherapy.ts` — current getThoughts calls to remove [VERIFIED: file read]
- `vigil-pwa/src/api/client.ts` — current function signatures to simplify [VERIFIED: file read]
- All 20 route files — confirmed zero `c.get('db')` usage [VERIFIED: grep]

### Secondary (MEDIUM confidence)
- `isNotNull` availability in drizzle-orm — inferred from `isNull` being imported in thoughts.ts; same export set [ASSUMED with LOW risk]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in active use; verified by file reads
- Architecture: HIGH — DB access pattern verified across 20 route files; CONTEXT.md D-04 error identified and corrected
- Pitfalls: HIGH — all 6 pitfalls derived from direct code inspection, not speculation

**Research date:** 2026-04-16
**Valid until:** Stable — no fast-moving dependencies; only internal codebase changes
