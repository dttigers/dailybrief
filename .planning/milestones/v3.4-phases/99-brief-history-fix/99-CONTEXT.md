# Phase 99: Brief History Fix - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Make past daily briefs reliably retrievable from the PWA Brief History view regardless of Railway redeploys. The PWA UI already exists — this phase is a backend persistence fix plus a small PWA failure-state refinement.

**Root cause:** `vigil-core` writes PDFs to `/tmp/briefs/` (see `vigil-core/src/services/brief-assembly-service.ts:196`). Railway wipes `/tmp` on every redeploy, leaving dead `briefs.pdfFilename` paths. `GET /brief/:date` then returns 404.

**Success criteria (from ROADMAP):**
1. User can open the Brief History view in the PWA and see a list of all previously generated briefs
2. User can click any past brief and view the PDF in the PWA without a loading error
3. Briefs generated before a Railway redeploy are still accessible after the redeploy

**Out of scope (for this phase):**
- Retention/pruning of old PDFs (deferred — forever for now)
- Migrating pre-fix briefs' bytes (they're unrecoverable; show clear state instead)
- PDF generation engine changes (Phase 75 is untouched; only storage sink changes)
- External object storage (S3/R2/Blob) — not needed at current scale

</domain>

<decisions>
## Implementation Decisions

### Storage Backend
- **D-01:** PDF bytes persist in Postgres as BYTEA — no new external infrastructure. At ~1MB/day / ~360MB/year, Railway Postgres handles the scale trivially and the existing backup story covers it.
- **D-02:** Bytes live in a **sibling table `brief_pdfs`**, not a column on `briefs`. Schema (Drizzle):
  - `brief_id` (PK, FK → `briefs.id`, cascade delete)
  - `bytes` (BYTEA, not null)
  - `content_type` (text, default `'application/pdf'`)
  - `byte_length` (int, for quick list-time sizing without fetching bytes)
  - `created_at` (timestamp, default now)
  - Rationale: forces isolation — a `SELECT * FROM briefs` can never accidentally pull MB of binary; list queries stay fast.
- **D-03:** Remove the `/tmp/briefs` filesystem write path entirely. Flow becomes `buffer → brief_pdfs row → HTTP response`. `BRIEFS_DIR` env var and the `path.resolve` safety check in `brief-generate.ts:122` are removed with it.
- **D-04:** Deprecate/drop the `briefs.pdfFilename` column. It has no meaning under the new model. Migration zeros it out, next migration drops it. (Planner decides whether that's one migration or two.)

### Pre-fix Brief Handling
- **D-05:** Existing `briefs` rows (all pointing at dead `/tmp/` paths) are **left untouched**. Their metadata (`summary` JSON, `thoughtCount`, `taskCount`, `date`) is still accurate and stays visible in the history list.
- **D-06:** Detail click on a pre-fix brief surfaces a distinct "unavailable" state — clear messaging that the PDF predates the storage fix and can be regenerated. No silent auto-regen (historical regen would use *current* thoughts and produce a misleading document for a past date).

### Retrieval Failure UX (PWA)
- **D-07:** When `GET /brief/:date` returns a "no bytes" response, `BriefHistoryPage.tsx` shows a message like *"This brief's PDF isn't stored — regenerate to rebuild it"* plus an explicit **Regenerate** button that calls `POST /brief/generate` for that date.
- **D-08:** Distinguish the "pre-fix brief" state from the generic "genuinely missing" state in the API response (e.g., a structured 404 body) so the PWA can word the message appropriately. Planner decides exact shape.

### Retention
- **D-09:** No automatic pruning. Briefs and their PDF bytes are kept **forever**. Revisit only if DB size becomes a real constraint; metadata would stay even under future pruning.

### Claude's Discretion
- Exact Drizzle migration split (one vs two migrations to deprecate `pdfFilename` and add `brief_pdfs`) — pick whatever keeps the deploy risk lowest.
- Whether `POST /brief/generate` returns the PDF inline (current behavior) or a reference + separate fetch. Default: keep current inline behavior to minimize PWA churn.
- Test strategy for BYTEA round-trip (pg driver handling of Buffer). Pick pragmatic integration-style tests over heavy mocking.
- Error message copy on the PWA — use "not stored" / "regenerate" language but refine to match the existing Vigil tone.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend (vigil-core)
- `vigil-core/src/services/brief-assembly-service.ts` — PDF generation entry point; `BRIEFS_DIR` and `fs.writeFile` live here (line 196, 524–526)
- `vigil-core/src/routes/brief-generate.ts` — `POST /brief/generate` and `GET /brief/:date`; current path-traversal guard at line 122 becomes dead code under BYTEA
- `vigil-core/src/routes/brief-history.ts` — `/briefs` list + `/briefs/:date` metadata endpoints (unchanged by this phase)
- `vigil-core/src/db/schema.js` — `briefs` Drizzle schema; new `brief_pdfs` table gets added alongside
- `vigil-core/drizzle/` — migration directory (Dockerfile runs `node dist/db/migrate.js` on boot, so new migrations ship with deploy)
- `vigil-core/src/services/generate-scheduler.ts` — daily scheduler that also writes PDFs; must use the new sink, not `/tmp`

### Frontend (vigil-pwa)
- `vigil-pwa/src/pages/BriefHistoryPage.tsx` — list + detail view; receives the failure-state refinement (D-07, D-08)
- `vigil-pwa/src/api/client.ts` — `getBriefPdf(date)` and `generateBrief()` wrappers; may need a new error shape check

### Project-level
- `.planning/PROJECT.md` §Key Decisions — "Production PostgreSQL on Railway" is the baseline this phase leans on
- `.planning/REQUIREMENTS.md` §Brief Reliability — BRIEF-01 acceptance criterion

No external specs/ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Drizzle ORM + postgres-js driver** — already configured for `briefs` table with BYTEA-compatible connection; no new client needed
- **`briefs` table** — keep as-is; its `id` becomes the FK target for `brief_pdfs`
- **`createBriefAssemblyService`** — already returns `{ buffer, filePath, metadata }`; drop `filePath` from the return and pipe `buffer` straight into the DB write
- **Existing `GET /brief/:date` shape** — same URL, same response headers; only the source changes (DB read instead of `fs.readFile`)
- **PWA blob-URL lifecycle** — `BriefHistoryPage.tsx` already handles `URL.createObjectURL` + revoke correctly (WR-02); no changes needed to the happy path

### Established Patterns
- **Drizzle migrations auto-run on Railway boot** (`Dockerfile` CMD: `node dist/db/migrate.js && node dist/index.js`) — schema changes ship atomically with the code
- **Upsert-on-date** for briefs is the established pattern (`onConflictDoUpdate` in `brief-generate.ts` and `brief-history.ts`); the new `brief_pdfs` write should match — upsert on `brief_id`
- **Injected deps factory** (`createBriefGenerateRouter(deps)`) — existing test pattern; planner should follow it for the new `brief_pdfs` writer

### Integration Points
- `brief-assembly-service.assembleAndRender()` — mutation point: stop writing to `fs`, return buffer + metadata only
- `brief-generate.ts` POST handler — mutation point: after DB upsert of `briefs`, upsert `brief_pdfs` row with the buffer
- `brief-generate.ts` GET handler — mutation point: read bytes via Drizzle join on `brief_pdfs` instead of `fs.readFile`; remove `BRIEFS_DIR` path guard
- `generate-scheduler.ts` — if it calls `assembleAndRender` and writes to `/tmp` separately, consolidate to go through the same buffer→DB path

### Caveats
- Drizzle BYTEA ↔ Node Buffer handling: verify the roundtrip works cleanly (Buffer in, Buffer out via postgres-js) — likely fine but worth a focused test
- Never `SELECT *` from `brief_pdfs` in list context — always join-on-demand from the detail endpoint only
- Railway Postgres row size limits — TOAST handles large rows transparently, so BYTEA in the MB range is routine, but keep `byte_length` on the side so list UIs don't need to touch `bytes`

</code_context>

<specifics>
## Specific Ideas

- Failure-state copy: *"This brief's PDF isn't stored — regenerate to rebuild it."* (exact wording at planner's discretion, but keep the causal framing — user needs to understand *why* it's missing)
- The `X-Brief-Storage-Key` header currently returned by `POST /brief/generate` can stay; semantics don't change.

</specifics>

<deferred>
## Deferred Ideas

- **PDF retention policy** — not addressed this phase (D-09: forever). Revisit if DB size grows meaningfully.
- **External object storage migration (S3/R2/Blob)** — not needed at current scale. Would become worth it only if PDFs grew to tens of GB or if we wanted CDN delivery.
- **Backfill pass of /tmp on first deploy** — explicitly rejected (D-05). Railway container lifetime makes recovery unlikely and half-migrating is worse than clean separation.
- **Summary JSON fallback view** — nice idea but deferred. The Regenerate path covers the user's actual need.

</deferred>

---

*Phase: 99-brief-history-fix*
*Context gathered: 2026-04-17*
