# Phase 76: Brief Assembly Endpoint - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

`POST /v1/brief/generate` orchestrates all data sources concurrently via `Promise.allSettled`, tolerates partial failures, renders a PDF using the Phase 75 PDFKit engine, returns the PDF binary, and saves it server-side for later retrieval via `GET /v1/brief/:date`.

</domain>

<decisions>
## Implementation Decisions

### Data Source Orchestration
- **D-01:** Call service layer directly (sports-service, calendar-service, DB queries, affirmation) — NOT internal HTTP calls. Reuse existing DI factory pattern for testability.
- **D-02:** Use `Promise.allSettled` to fetch all sources concurrently. Each source wraps its result in a consistent shape so the mapper knows what succeeded/failed.
- **D-03:** All data sources are optional. The brief always generates, even if every external source fails. An empty brief with just the date header and empty sections is a valid output.

### Partial Failure Handling
- **D-04:** Claude's discretion on whether failed sections are omitted entirely or show placeholder text. Choose what best fits the existing PDF renderer's `enabledSections` behavior.

### PDF Storage Strategy
- **D-05:** Store generated PDFs on the Railway filesystem (e.g. `/tmp/briefs/` or a configurable directory). Ephemeral — files may be lost on redeploy, which is acceptable since briefs are regenerable.
- **D-06:** Storage key is date-based: `2026-04-12`. One brief per day. Regenerating the same day overwrites the previous file.
- **D-07:** The existing `briefs` table `pdfFilename` column stores the filesystem path. Upsert the briefs row on generation with summary metadata alongside the file.

### API Contract & Auth
- **D-08:** `POST /v1/brief/generate` accepts no request body. Server uses today's date and server-side configuration (teams, calendars, enabled sections) for everything.
- **D-09:** Claude's discretion on response format — success criteria SC-1 says "returns a PDF binary response with correct content-type header." Storage key can be returned in a response header.
- **D-10:** `GET /v1/brief/:date` returns the stored PDF binary by date key. If file is missing (e.g. post-redeploy), return 404 — client can re-generate.
- **D-11:** Same bearer token auth as all existing `/v1/*` routes. No new auth mechanism.

### Work Order Data Source
- **D-12:** Query `work_orders` + `work_order_statuses` tables directly from the DB. Data is synced there by the Mac CLI. If no work orders exist, that section is empty.
- **D-13:** Claude's discretion on whether to include AI work order prioritization. The existing `BriefRenderData` has `workOrderPriorityOrder` field — use it if the prioritization service is straightforward to call, skip if it adds excessive latency or complexity.

### Claude's Discretion
- Partial failure rendering approach (D-04) — omit vs placeholder
- Response format details (D-09) — binary PDF directly vs JSON wrapper
- AI work order prioritization inclusion (D-13)
- `BriefRenderData` mapping logic — how each API/DB result transforms into the lean render type
- Thoughts/insights/therapy data assembly — DB queries to populate `unprocessedThoughts`, `recentThoughts`, `insights`, `therapyPatterns`, `therapyPrep` fields
- Error logging and observability approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data Contract (Phase 75 output)
- `vigil-core/src/services/pdf-types.ts` — `BriefRenderData` interface defines the exact shape the assembler must produce. Also `PdfConfig` and `DEFAULT_PDF_CONFIG`.
- `vigil-core/src/services/pdf-service.ts` — `createPdfRenderer()` DI factory. The assembler calls `renderBrief(data, config)` to get a PDF Buffer.

### Data Source Services
- `vigil-core/src/services/sports-service.ts` — `SportsResponse` type, DI factory pattern with injectable fetch. Returns `partial` flag and per-league status.
- `vigil-core/src/services/calendar-service.ts` — Google Calendar events fetcher. Returns `needs_reauth` status on token failure.
- `vigil-core/src/routes/affirmation.ts` — Claude-generated daily affirmation with filesystem cache.

### Database Schema
- `vigil-core/src/db/schema.ts` — `briefs` table (id, date, summary, pdfFilename, thoughtCount, taskCount), `work_orders` table, `work_order_statuses` table, `thoughts` table.

### Existing Brief Routes
- `vigil-core/src/routes/brief.ts` — Current `/brief` GET route (thought summary stats). Phase 76 adds `/brief/generate` POST and `/brief/:date` GET alongside this.
- `vigil-core/src/routes/brief-history.ts` — Existing `/briefs` CRUD routes for brief metadata. The assembler should upsert via the briefs table directly.

### Prior Phase Decisions
- `.planning/phases/73-sports-proxy/73-CONTEXT.md` — Sports proxy decisions (D-04: aggregate endpoint, D-05: server-side team config)
- `.planning/phases/74-google-calendar-server-side/74-CONTEXT.md` — Calendar decisions (D-11: events endpoint, D-12: needs_reauth graceful degradation)
- `.planning/phases/75-pdf-generation-engine/75-CONTEXT.md` — PDF engine decisions (D-07: lean BriefRenderData, D-09: 3-page structure, D-13: enabledSections)

### Requirements
- `.planning/REQUIREMENTS.md` — BRIEF-01 through BRIEF-04 define acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pdf-service.ts` `createPdfRenderer()` — DI factory, call `renderBrief(data)` to get `Promise<Buffer>`
- `sports-service.ts` — DI factory with `fetchAll()` returning `SportsResponse` with per-league status
- `calendar-service.ts` — DI factory for Google Calendar events
- `affirmation.ts` route — has filesystem caching logic for daily affirmation text
- `brief.ts` route — existing thought stats queries (open tasks, recent thoughts, therapy) can be extracted/reused for assembling `BriefRenderData`

### Established Patterns
- All services use DI factory pattern with injectable dependencies for testability
- Routes export `new Hono()` instances registered in `index.ts`
- Database queries use Drizzle ORM with `eq`, `and`, `desc`, `count`, `sql` operators
- Error responses: `{ error: "message" }` with appropriate HTTP status codes
- Bearer auth middleware applied at router level

### Integration Points
- New routes register in `vigil-core/src/index.ts` alongside existing route mounts
- `briefs` table upsert on `date` column (unique constraint) — same pattern as `brief-history.ts`
- PDF renderer accepts `BriefRenderData` + optional `PdfConfig` — assembler is responsible for the mapping layer

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The assembler is a straightforward orchestration layer: fetch data concurrently, map to `BriefRenderData`, render PDF, save to filesystem, return binary.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 76-brief-assembly-endpoint*
*Context gathered: 2026-04-12*
