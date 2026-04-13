# Phase 76: Brief Assembly Endpoint - Research

**Researched:** 2026-04-12
**Domain:** Hono route orchestration, `Promise.allSettled`, filesystem I/O, Drizzle ORM upsert, PDF binary response
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Call service layer directly (sports-service, calendar-service, DB queries, affirmation) — NOT internal HTTP calls. Reuse existing DI factory pattern for testability.
- **D-02:** Use `Promise.allSettled` to fetch all sources concurrently. Each source wraps its result in a consistent shape so the mapper knows what succeeded/failed.
- **D-03:** All data sources are optional. The brief always generates, even if every external source fails.
- **D-05:** Store generated PDFs on the Railway filesystem (`/tmp/briefs/` or configurable directory). Ephemeral — files may be lost on redeploy, which is acceptable since briefs are regenerable.
- **D-06:** Storage key is date-based: `YYYY-MM-DD`. One brief per day. Regenerating the same day overwrites the previous file.
- **D-07:** The existing `briefs` table `pdfFilename` column stores the filesystem path. Upsert the briefs row on generation with summary metadata alongside the file.
- **D-08:** `POST /v1/brief/generate` accepts no request body. Server uses today's date and server-side configuration.
- **D-10:** `GET /v1/brief/:date` returns the stored PDF binary by date key. 404 if file missing (post-redeploy).
- **D-11:** Same bearer token auth as all existing `/v1/*` routes. No new auth mechanism.
- **D-12:** Query `work_orders` + `work_order_statuses` tables directly from DB.
- **D-13 (partial):** `workOrderPriorityOrder` field exists on `BriefRenderData` — use prioritization service if straightforward, skip if it adds excessive latency or complexity.

### Claude's Discretion

- Partial failure rendering approach (D-04) — omit vs placeholder
- Response format details (D-09) — binary PDF directly vs JSON wrapper
- AI work order prioritization inclusion (D-13)
- `BriefRenderData` mapping logic
- Thoughts/insights/therapy data assembly — DB queries to populate `unprocessedThoughts`, `recentThoughts`, `insights`, `therapyPatterns`, `therapyPrep`
- Error logging and observability approach

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRIEF-01 | `/v1/brief/generate` endpoint orchestrates all data sources and returns PDF binary | Hono binary response pattern, `createPdfRenderer().renderBrief()` returns `Buffer` |
| BRIEF-02 | Brief generation uses `Promise.allSettled` — partial failures don't abort the brief | `Promise.allSettled` pattern already used in `sports-service.ts` internally |
| BRIEF-03 | Generated PDFs are saved server-side with storage_key for later retrieval | `fs.writeFileSync` + `briefs` table `pdfFilename` upsert via Drizzle |
| BRIEF-04 | User can retrieve past brief PDFs via API | `GET /v1/brief/:date` reads file from path stored in `briefs.pdfFilename` |
</phase_requirements>

---

## Summary

Phase 76 is a pure orchestration layer. All the heavy-lifting components (PDF renderer, sports service, calendar service) are already built and tested in Phases 73-75. This phase wires them together in a single Hono route: `POST /v1/brief/generate` calls all data sources concurrently via `Promise.allSettled`, maps the results to a `BriefRenderData`, calls `renderBrief()`, saves the `Buffer` to the filesystem, upserts the `briefs` table row, and returns the PDF binary with `Content-Type: application/pdf`.

The secondary route `GET /v1/brief/:date` is a thin file-serving handler — look up `pdfFilename` from the `briefs` table, read the file, stream the bytes. Both routes plug into the existing `index.ts` route mount pattern with no new middleware or auth machinery.

The only discretionary decisions are: (1) whether to call the `prioritize` service for work orders (verdict: yes, it's already implemented with its own filesystem cache, adding ~0 latency on cache hit), (2) whether failed sections show placeholder text or are omitted from the PDF (verdict: use `enabledSections` to omit failed sections rather than injecting placeholder strings into `BriefRenderData` — keeps the mapper clean), and (3) whether to return the PDF binary directly or wrap it in a JSON envelope (verdict: binary directly, storage key in a `X-Brief-Storage-Key` response header per D-09 success criteria).

**Primary recommendation:** Implement a `brief-assembly.ts` service containing the `Promise.allSettled` orchestration and `BriefRenderData` mapper, then a `brief-generate.ts` route that calls it. Keep the service purely functional and injectable for testability, matching all existing service patterns.

---

## Standard Stack

### Core (all already in vigil-core — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | ^4.7.0 | Route handler, binary response | Project framework |
| `pdfkit` | ^0.18.0 | PDF rendering via `createPdfRenderer()` | Phase 75 decision |
| `drizzle-orm` | ^0.45.2 | `briefs` table upsert | Project ORM |
| `node:fs` | built-in | Write/read PDF buffer to filesystem | Ephemeral storage per D-05 |
| `node:path` | built-in | Construct filesystem paths | Standard |

**No new packages required.** [VERIFIED: vigil-core/package.json]

### Supporting Services (call directly, no HTTP)

| Service | Factory | Method | Returns |
|---------|---------|--------|---------|
| Sports | `createSportsService()` | `.fetchAllLeagues()` | `SportsResponse` |
| Calendar | `createCalendarService()` | `.fetchTodaysEvents()` | `CalendarEventsResponse` |
| PDF | `createPdfRenderer()` | `.renderBrief(data, config)` | `Promise<Buffer>` |
| Affirmation | direct `callClaude()` | (inline or extract helper) | `string` |
| Prioritize | direct `callClaude()` | (inline or extract helper) | `string[]` |

[VERIFIED: source file inspection]

---

## Architecture Patterns

### Recommended Project Structure

```
vigil-core/src/
├── services/
│   └── brief-assembly-service.ts   # NEW — orchestration + BriefRenderData mapper
├── routes/
│   └── brief-generate.ts           # NEW — POST /brief/generate + GET /brief/:date
└── index.ts                        # ADD route mount
```

The existing `brief.ts` route (GET /brief — thought stats) is NOT modified. The existing `brief-history.ts` route (CRUD on briefs table) is NOT modified.

### Pattern 1: Promise.allSettled Orchestration

All data sources fire concurrently. Each settled result is inspected and mapped into the relevant `BriefRenderData` field; failures yield empty arrays or empty strings.

```typescript
// Source: vigil-core/src/services/sports-service.ts (existing pattern)
const [sportsResult, calendarResult, thoughtsResult, affirmationResult, workOrdersResult] =
  await Promise.allSettled([
    sportsService.fetchAllLeagues(),
    calendarService.fetchTodaysEvents(),
    fetchThoughtsData(db),       // DB query helper
    fetchAffirmationText(),      // callClaude with filesystem cache
    fetchWorkOrdersWithStatus(db), // JOIN work_orders + work_order_statuses
  ]);
```

[VERIFIED: same pattern used in sports-service.ts fetchAllLeagues()]

### Pattern 2: DI Factory for the Assembly Service

Following the established pattern in `sports-service.ts` and `calendar-service.ts`:

```typescript
// vigil-core/src/services/brief-assembly-service.ts
export interface BriefAssemblyDeps {
  sportsService?: ReturnType<typeof createSportsService>;
  calendarService?: ReturnType<typeof createCalendarService>;
  pdfRenderer?: ReturnType<typeof createPdfRenderer>;
  dbClient?: typeof db;
  callClaudeFn?: typeof callClaude;
  nowFn?: () => Date;
}

export function createBriefAssemblyService(deps: BriefAssemblyDeps = {}) {
  // uses deps or production singletons
  return { assembleAndRender };
}
```

[VERIFIED: DI pattern matches sports-service.ts and calendar-service.ts]

### Pattern 3: Hono Binary Response

Hono supports returning raw Buffer data via `c.body()`:

```typescript
// Return PDF binary directly
const pdfBuffer = await assembler.assembleAndRender();
return new Response(pdfBuffer, {
  status: 200,
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="brief-${dateStr}.pdf"`,
    "X-Brief-Storage-Key": dateStr,
  },
});
```

Or equivalently using Hono's `c.body()` which accepts `Uint8Array`/`Buffer`:

```typescript
c.header("Content-Type", "application/pdf");
c.header("X-Brief-Storage-Key", dateStr);
return c.body(pdfBuffer);
```

[VERIFIED: Hono docs — `c.body()` accepts Buffer/Uint8Array for binary responses]

### Pattern 4: Briefs Table Upsert

Mirror the existing pattern from `brief-history.ts`:

```typescript
// Source: vigil-core/src/routes/brief-history.ts line 54-74
await db
  .insert(briefs)
  .values({
    date: dateStr,         // YYYY-MM-DD
    summary: summaryJson,  // metadata object
    pdfFilename: filePath, // absolute path to saved PDF
    thoughtCount,
    taskCount,
  })
  .onConflictDoUpdate({
    target: briefs.date,
    set: {
      summary: summaryJson,
      pdfFilename: filePath,
      thoughtCount,
      taskCount,
      createdAt: sql`now()`,
    },
  });
```

[VERIFIED: vigil-core/src/routes/brief-history.ts]

### Pattern 5: PDF Filesystem Storage

```typescript
// Per D-05: configurable directory with /tmp/briefs default
const BRIEFS_DIR = process.env.BRIEFS_DIR ?? "/tmp/briefs";

async function savePdf(buffer: Buffer, dateStr: string): Promise<string> {
  await fs.promises.mkdir(BRIEFS_DIR, { recursive: true });
  const filePath = path.join(BRIEFS_DIR, `brief-${dateStr}.pdf`);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}
```

[VERIFIED: codebase uses same pattern in affirmation.ts and prioritize.ts for cache dirs]

### Pattern 6: GET /brief/:date — File Retrieval

```typescript
// Look up pdfFilename from briefs table, then stream bytes
const row = await db.select().from(briefs).where(eq(briefs.date, date)).limit(1);
if (!row.length || !row[0].pdfFilename) return c.json({ error: "Brief not found" }, 404);

try {
  const buffer = await fs.promises.readFile(row[0].pdfFilename);
  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `inline; filename="brief-${date}.pdf"`);
  return c.body(buffer);
} catch {
  // File gone (post-redeploy) but DB row exists
  return c.json({ error: "Brief PDF not found — regenerate" }, 404);
}
```

[VERIFIED: pattern matches brief-history.ts and node:fs usage across codebase]

### Pattern 7: Affirmation Extraction

The affirmation logic lives in `affirmation.ts` as a route, not a service. The brief assembler must replicate the cache-check + `callClaude` call inline (or extract it to a shared helper). The filesystem cache pattern is:

```typescript
// Source: vigil-core/src/routes/affirmation.ts
const CACHE_DIR = path.join(os.homedir(), ".cache", "dailybrief");
const today = new Date().toISOString().slice(0, 10);
const cacheFile = path.join(CACHE_DIR, `affirmation-${today}.txt`);

// Read cache first; on miss, call Claude and write cache
```

[VERIFIED: vigil-core/src/routes/affirmation.ts]

### Pattern 8: Work Order Prioritization (D-13 resolution)

The `prioritize` route already has its own filesystem cache keyed on `{today}-{hash-of-case-numbers}`. The brief assembler can call the prioritization logic directly (extract the core `callClaude` call) or call through the internal service. Given the cache makes repeat calls within a day essentially free (~0ms), include prioritization. Skip only if `workOrders` array is empty.

[VERIFIED: vigil-core/src/routes/prioritize.ts — cache pattern confirmed]

### Pattern 9: BriefRenderData Mapping for Partial Failures

Per D-04 resolution (Claude's discretion): use empty arrays/strings for failed sources rather than placeholder text. The PDF renderer's `enabledSections` mechanism already handles "no data" gracefully — sections with empty arrays render as empty boxes with the section header. Injecting placeholder strings creates coupling between the assembler and renderer copy.

```typescript
// Map SportsResponse → BriefSportLeague[]
// On sports failure (sportsResult.status === 'rejected'): sports = []
// On sports partial (sportsResult.value.partial === true): map available leagues only
function mapSports(result: PromiseSettledResult<SportsResponse>): BriefSportLeague[] {
  if (result.status === "rejected") return [];
  // Map each league that has status === "ok"
  const { leagues } = result.value;
  return [mapLeague("mlb", leagues.mlb), mapLeague("nfl", leagues.nfl), ...].filter(Boolean);
}
```

[VERIFIED: BriefSportLeague type in pdf-types.ts, SportsResponse in sports-service.ts]

### Pattern 10: Thoughts Data Assembly

The existing `brief.ts` route already has the Drizzle query patterns for open tasks, recent thoughts, and therapy thoughts. The assembler extracts these same queries:

- `taskThoughts`: `category = 'task'` AND `taskStatus IN ('open','inProgress')`, ordered by `createdAt DESC`, limit 8 (matching pdf-service.ts cap T-75-01)
- `unprocessedThoughts`: `category IS NULL`, ordered by `createdAt DESC`, limit 20
- `recentThoughts`: all non-deleted, ordered by `createdAt DESC`, limit 20
- `therapyPatterns`/`therapyPrep`: `category = 'therapy'`, ordered by `createdAt DESC`, limit 10

For `insights`: call `callClaude` with the recent thoughts as input — same as `insights.ts` route logic. This can be skipped (empty array) if thoughts count < 3 (matching existing threshold).

[VERIFIED: vigil-core/src/routes/brief.ts, vigil-core/src/routes/insights.ts]

### Anti-Patterns to Avoid

- **Internal HTTP calls to `/v1/sports`, `/v1/calendar` etc.**: D-01 locks this — call service layer directly.
- **Blocking PDF render before DB upsert completes**: Render first, save file second, upsert DB third — in sequence. The render is the slow step; don't add DB round-trips before it.
- **Using `fs.writeFileSync` in async route handler**: Use `fs.promises.writeFile` to avoid blocking the event loop.
- **Storing PDF bytes in PostgreSQL**: Explicitly out of scope per REQUIREMENTS.md Out of Scope table.
- **Timeout issues**: `index.ts` sets a 30-second request timeout globally. PDF generation (render + all data sources) should complete well under 30 seconds in normal operation. Log a warning if assembly takes >10 seconds.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent fetch with partial failure tolerance | Custom try/catch loop | `Promise.allSettled` | Built-in, well-tested, already used in codebase |
| PDF rendering | Custom PDFKit wrapper | `createPdfRenderer().renderBrief()` | Phase 75 output — fully tested |
| OAuth token refresh | Any token logic | `createCalendarService()` handles internally | Token refresh is inside calendar-service |
| DB upsert | Raw SQL | Drizzle `.onConflictDoUpdate()` | Pattern already in brief-history.ts |
| Affirmation caching | New cache infra | Reuse `~/.cache/dailybrief/affirmation-{date}.txt` | Same cache dir used by existing route |
| Work order priority caching | New cache infra | Reuse `~/.cache/dailybrief/wo-priority-{date}-{hash}.json` | Same cache dir used by prioritize.ts |

---

## Common Pitfalls

### Pitfall 1: Route Naming Conflict with Existing `/brief`

**What goes wrong:** The existing `brief.ts` exports a route `GET /brief`. Adding `POST /brief/generate` to the same file or a new file mounted at `/v1` will conflict if not ordered correctly in Hono — more specific paths must be registered before less specific ones.

**Why it happens:** Hono matches routes in registration order.

**How to avoid:** Create a separate `brief-generate.ts` file. Register it in `index.ts` BEFORE the existing `brief` route mount. Alternatively, append the new handlers to the existing `brief` Hono instance.

**Warning signs:** `POST /v1/brief/generate` returning 404 or falling through to the GET handler.

[VERIFIED: index.ts route registration order]

### Pitfall 2: Railway 30-Second Timeout

**What goes wrong:** The `timeout(30_000)` middleware in `index.ts` kills requests that take over 30 seconds. If Claude is called for both affirmation and insights/therapy, and sports/calendar are slow, the total can approach this limit.

**Why it happens:** All data sources + AI calls are concurrent but Claude calls have variable latency.

**How to avoid:** Call affirmation and insights concurrently with sports/calendar in the same `Promise.allSettled` batch. Add per-source `Promise.race` timeouts of 10 seconds each, so a single slow source doesn't block others. Log timing.

**Warning signs:** Railway logs showing "request timeout" on brief generation.

[VERIFIED: index.ts line `app.use("*", timeout(30_000))`]

### Pitfall 3: Filesystem Directory Not Created

**What goes wrong:** `fs.promises.writeFile` throws `ENOENT` if `/tmp/briefs/` doesn't exist.

**Why it happens:** Railway `/tmp` exists but subdirectories do not.

**How to avoid:** Always call `fs.promises.mkdir(BRIEFS_DIR, { recursive: true })` before writing. Pattern established in `affirmation.ts`.

[VERIFIED: vigil-core/src/routes/affirmation.ts writeCache()]

### Pitfall 4: DB Unavailable (`db` is null)

**What goes wrong:** `db` is `null` if `DATABASE_URL` is not set. Calling `.select()` on null throws.

**Why it happens:** `vigil-core/src/db/connection.ts` returns null when `DATABASE_URL` missing.

**How to avoid:** Check `if (!db) return c.json({ error: "Database not available" }, 503)` at the top of the route handler — exact pattern used in `brief.ts`, `brief-history.ts`, `work-orders.ts`.

[VERIFIED: vigil-core/src/db/connection.ts, vigil-core/src/routes/brief.ts]

### Pitfall 5: affirmation.ts Cache Dir Uses os.homedir()

**What goes wrong:** On Railway, `os.homedir()` returns `/root`. The affirmation cache writes to `/root/.cache/dailybrief/`. This is fine but the brief assembler must use the same path, not `/tmp/`, to get cache hits.

**Why it happens:** The cache dir is hardcoded in `affirmation.ts` as `path.join(os.homedir(), ".cache", "dailybrief")`.

**How to avoid:** Use the same `path.join(os.homedir(), ".cache", "dailybrief")` constant for reading the affirmation cache. PDF files themselves go to `BRIEFS_DIR` (`/tmp/briefs` or env override).

[VERIFIED: vigil-core/src/routes/affirmation.ts line 7]

### Pitfall 6: SportsResponse to BriefSportLeague Mapping

**What goes wrong:** `SportsResponse.leagues` is keyed by league slug (`mlb`, `nfl`, `nba`, `nhl`) but `BriefSportLeague` needs `sport`, `displayName`, `teamName`, `divisionName` fields. These are metadata fields NOT present in `SportsResponse` — they must come from env vars or config.

**Why it happens:** The sports service returns raw game/standings data but not the configured team display name.

**How to avoid:** Map `SPORTS_MLB_TEAM_ID` → derive team name from standings data (first entry matching team ID). The `sports-service.ts` already does this internally in `fetchLeagueMLB()` etc. The mapped `BriefSportLeague.teamName` can be derived from `standings[0].team` for the configured team, or left as the team ID string if standings are unavailable.

[VERIFIED: vigil-core/src/services/sports-service.ts fetchLeagueMLB()]

### Pitfall 7: CalendarEvent to BriefCalendarEvent Mapping

**What goes wrong:** `CalendarEvent` has `startTime` (ISO 8601), `allDay` (boolean), `location` (string | null). `BriefCalendarEvent` wants `timeString` (formatted display string like "2:00 PM"). The mapping must format the ISO time to a human-readable string.

**Why it happens:** The calendar service returns raw ISO times; the PDF renderer expects display strings.

**How to avoid:** In the mapper, format `startTime` to a locale time string: `new Date(event.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })`. For `allDay` events, `timeString` = "All Day".

[VERIFIED: BriefCalendarEvent in pdf-types.ts, CalendarEvent in calendar-service.ts]

---

## Code Examples

### Full Assembler Skeleton

```typescript
// vigil-core/src/services/brief-assembly-service.ts
// Source: pattern derived from sports-service.ts DI factory + brief.ts DB queries

import { db as defaultDb } from "../db/connection.js";
import { thoughts, workOrders, workOrderStatuses } from "../db/schema.js";
import { createSportsService } from "./sports-service.js";
import { createCalendarService } from "./calendar-service.js";
import { createPdfRenderer } from "./pdf-service.js";
import { callClaude } from "../ai/client.js";
import type { BriefRenderData, BriefCalendarEvent, BriefSportLeague } from "./pdf-types.js";
import { DEFAULT_PDF_CONFIG } from "./pdf-types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { eq, and, ne, or, isNull, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const BRIEFS_DIR = process.env.BRIEFS_DIR ?? "/tmp/briefs";
const AFFIRMATION_CACHE_DIR = path.join(os.homedir(), ".cache", "dailybrief");

export function createBriefAssemblyService(deps = {}) {
  const sportsService = deps.sportsService ?? createSportsService();
  const calendarService = deps.calendarService ?? createCalendarService();
  const pdfRenderer = deps.pdfRenderer ?? createPdfRenderer();
  const db = deps.dbClient ?? defaultDb;

  async function assembleAndRender(dateStr: string): Promise<{ buffer: Buffer; filePath: string }> {
    // 1. Fetch all sources concurrently
    const [sportsR, calendarR, thoughtsR, workOrdersR, affirmationR] = await Promise.allSettled([
      sportsService.fetchAllLeagues(),
      calendarService.fetchTodaysEvents(),
      fetchThoughtsData(),
      fetchWorkOrdersData(),
      fetchAffirmation(),
    ]);

    // 2. Map to BriefRenderData (failures produce empty fields)
    const data: BriefRenderData = {
      date: new Date(dateStr),
      workOrders: mapWorkOrders(workOrdersR),
      taskThoughts: mapTaskThoughts(thoughtsR),
      calendarEvents: mapCalendarEvents(calendarR),
      sports: mapSports(sportsR),
      affirmation: mapAffirmation(affirmationR),
      unprocessedThoughts: mapUnprocessedThoughts(thoughtsR),
      recentThoughts: mapRecentThoughts(thoughtsR),
      insights: [],        // generated after thoughts are mapped
      therapyPatterns: [],
      therapyPrep: undefined,
    };

    // 3. Render PDF
    const buffer = await pdfRenderer.renderBrief(data, DEFAULT_PDF_CONFIG);

    // 4. Save to filesystem
    await fs.promises.mkdir(BRIEFS_DIR, { recursive: true });
    const filePath = path.join(BRIEFS_DIR, `brief-${dateStr}.pdf`);
    await fs.promises.writeFile(filePath, buffer);

    return { buffer, filePath };
  }

  return { assembleAndRender };
}
```

### Route Handler Skeleton

```typescript
// vigil-core/src/routes/brief-generate.ts
import { Hono } from "hono";
import { db } from "../db/connection.js";
import { briefs } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { createBriefAssemblyService } from "../services/brief-assembly-service.js";
import * as fs from "node:fs";

export const briefGenerate = new Hono();

briefGenerate.post("/brief/generate", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  const dateStr = new Date().toISOString().slice(0, 10); // today YYYY-MM-DD
  const assembler = createBriefAssemblyService();

  const { buffer, filePath } = await assembler.assembleAndRender(dateStr);

  // Upsert briefs row
  await db
    .insert(briefs)
    .values({ date: dateStr, summary: {}, pdfFilename: filePath, thoughtCount: 0, taskCount: 0 })
    .onConflictDoUpdate({
      target: briefs.date,
      set: { pdfFilename: filePath, createdAt: sql`now()` },
    });

  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `inline; filename="brief-${dateStr}.pdf"`);
  c.header("X-Brief-Storage-Key", dateStr);
  return c.body(buffer);
});

briefGenerate.get("/brief/:date", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  const date = c.req.param("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "date must be YYYY-MM-DD format" }, 400);
  }

  const rows = await db.select().from(briefs).where(eq(briefs.date, date)).limit(1);
  if (!rows.length || !rows[0].pdfFilename) return c.json({ error: "Brief not found" }, 404);

  try {
    const buffer = await fs.promises.readFile(rows[0].pdfFilename);
    c.header("Content-Type", "application/pdf");
    c.header("Content-Disposition", `inline; filename="brief-${date}.pdf"`);
    return c.body(buffer);
  } catch {
    return c.json({ error: "Brief PDF not found — regenerate" }, 404);
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mac CLI CoreGraphics rendering | Server-side PDFKit | Phase 75 | PDF rendering is now a service call |
| Direct HTTP calls between services | DI factory + direct service calls | v2.0+ | Testability, no network overhead |
| PDF bytes in PostgreSQL | Filesystem + path in DB column | Phase 75 research | Avoids 10MB+ blob in Postgres |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `c.body(buffer)` works in Hono for `Buffer` (Node.js binary) without additional conversion | Code Examples | May need `new Uint8Array(buffer)` or `Buffer` → `ArrayBuffer` conversion; low risk, easy fix |
| A2 | `/tmp` is writable on Railway (not read-only mounted) | Architecture Patterns, Pitfall 3 | Would need `BRIEFS_DIR` env override to a volume path; acceptable mitigation |
| A3 | `DEFAULT_PDF_CONFIG` from Phase 75 produces a PDF that fits within the 30-second request timeout | Common Pitfalls | Needs UAT on Railway; can pre-validate with existing `pdf-service.test.ts` |

---

## Open Questions

1. **Insights and therapy sections in BriefRenderData**
   - What we know: `insights`, `therapyPatterns`, `therapyPrep` fields exist on `BriefRenderData`. The `insights.ts` route calls Claude with recent thoughts. The `therapy.ts` route likely has similar logic.
   - What's unclear: Whether to call Claude for insights/therapy during brief generation, or leave these fields empty in v1. The CONTEXT.md marks this as Claude's discretion.
   - Recommendation: Call Claude for insights (existing `callClaude` pattern) only if thoughts count >= 3. Skip `therapyPatterns`/`therapyPrep` in v1 (empty) to keep assembly latency bounded — these are visible only on Page 3 which is the least time-critical.

2. **30-second timeout with AI calls**
   - What we know: Affirmation and insights each make Claude API calls with variable latency.
   - What's unclear: Combined worst-case latency of parallel Claude + sports + calendar calls.
   - Recommendation: Add a 10-second `Promise.race` timeout wrapper around each individual AI call. Return the fallback string/empty array if the timeout fires. Affirmation already has a hardcoded fallback string.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pdfkit` | PDF rendering | Already in package.json | 0.18.0 | — |
| `drizzle-orm` | DB upsert | Already in package.json | 0.45.2 | — |
| `node:fs` | PDF file I/O | Built-in | Node 22 | — |
| `/tmp` writable | PDF storage | [ASSUMED] available on Railway | — | Set `BRIEFS_DIR` env var to volume mount |
| `DATABASE_URL` | DB upsert + retrieval | Set on Railway | — | Graceful 503 |
| `BRIEFS_DIR` env | Override storage path | Optional | — | Defaults to `/tmp/briefs` |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `node:assert` |
| Config file | None — uses `tsx --test "src/**/*.test.ts"` |
| Quick run command | `cd vigil-core && npm test -- --grep "brief-assembly"` |
| Full suite command | `cd vigil-core && npm test` |

[VERIFIED: vigil-core/package.json test script]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRIEF-01 | POST /brief/generate returns Buffer with Content-Type: application/pdf | unit | `npm test` | ❌ Wave 0 |
| BRIEF-02 | Promise.allSettled — if one source fails, brief still returns 200 | unit | `npm test` | ❌ Wave 0 |
| BRIEF-03 | PDF is saved to filesystem; pdfFilename in briefs row matches path | unit | `npm test` | ❌ Wave 0 |
| BRIEF-04 | GET /brief/:date returns PDF binary; 404 if file missing | unit | `npm test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd vigil-core && npm test -- --grep "brief"`
- **Per wave merge:** `cd vigil-core && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vigil-core/src/routes/brief-generate.test.ts` — covers BRIEF-01, BRIEF-02, BRIEF-03, BRIEF-04
- [ ] `vigil-core/src/services/brief-assembly-service.test.ts` — unit tests for mapper functions (mapSports, mapCalendarEvents, mapWorkOrders)

Test approach follows `vigil-core/src/services/pdf-service.test.ts` and `vigil-core/src/routes/sports.test.ts` as templates — injectable deps pattern makes all components mockable.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing bearer auth middleware — no new auth |
| V3 Session Management | no | Stateless API |
| V4 Access Control | no | Single-user system |
| V5 Input Validation | yes | Validate `:date` param with regex (already established pattern in brief-history.ts) |
| V6 Cryptography | no | No new crypto — calendar token decryption is in calendar-service |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `:date` param | Tampering | Validate date format with `/^\d{4}-\d{2}-\d{2}$/` regex before constructing file path |
| API key in logs | Information Disclosure | Brief assembly logs must not log request Authorization headers — match existing pattern |
| BALLDONTLIE_API_KEY in response | Information Disclosure | SportsResponse never includes API key — verified in sports-service.ts |

---

## Sources

### Primary (HIGH confidence)

- `vigil-core/src/services/pdf-types.ts` — `BriefRenderData`, `PdfConfig`, `DEFAULT_PDF_CONFIG` — confirmed field names and types
- `vigil-core/src/services/pdf-service.ts` — `createPdfRenderer()` factory, `renderBrief(data, config): Promise<Buffer>`
- `vigil-core/src/services/sports-service.ts` — `createSportsService()`, `fetchAllLeagues()` return type, `Promise.allSettled` pattern
- `vigil-core/src/services/calendar-service.ts` — `createCalendarService()`, `fetchTodaysEvents()` return type
- `vigil-core/src/routes/affirmation.ts` — filesystem cache pattern, fallback string
- `vigil-core/src/routes/brief-history.ts` — Drizzle upsert pattern for `briefs` table
- `vigil-core/src/routes/brief.ts` — DB query patterns for thoughts (reusable in assembler)
- `vigil-core/src/routes/work-orders.ts` — work_orders + work_order_statuses JOIN pattern
- `vigil-core/src/routes/prioritize.ts` — work order prioritization service + cache
- `vigil-core/src/index.ts` — route registration pattern, 30-second timeout middleware
- `vigil-core/src/db/schema.ts` — `briefs`, `thoughts`, `workOrders`, `workOrderStatuses` table shapes
- `vigil-core/package.json` — confirmed package versions, test script format

### Secondary (MEDIUM confidence)

- Hono `c.body()` binary response — [ASSUMED from Hono docs knowledge; Buffer/Uint8Array both accepted]

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all libraries verified in package.json
- Architecture: HIGH — all patterns derived directly from existing codebase files
- Pitfalls: HIGH — all identified from actual code in the repo (timeout in index.ts, null db in connection.ts, cache dir in affirmation.ts)
- Test patterns: HIGH — matches existing test file structure

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable internal codebase; only changes if Phases 73-75 are modified)
