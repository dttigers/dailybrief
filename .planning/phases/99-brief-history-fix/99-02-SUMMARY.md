---
phase: 99-brief-history-fix
plan: "02"
subsystem: vigil-core/routes+services
tags: [brief, pdf, bytea, postgres, drizzle, filesystem-removal, api-contract]
dependency_graph:
  requires: [99-01]
  provides: [brief-pdf-db-sink, structured-404-contract]
  affects:
    - vigil-core/src/services/brief-assembly-service.ts
    - vigil-core/src/routes/brief-generate.ts
    - vigil-core/src/services/generate-scheduler.ts
    - vigil-core/src/services/brief-assembly-service.test.ts
    - vigil-core/src/routes/brief-generate.test.ts
    - vigil-core/src/services/generate-scheduler.test.ts
tech_stack:
  added: []
  patterns:
    - buffer-to-db-bytea (assembleAndRender returns buffer only; caller writes to brief_pdfs)
    - left-join-for-conditional-404 (GET handler distinguishes missing-brief vs missing-bytes)
    - upsert-returning-id (briefs insert returns id for brief_pdfs FK)
decisions:
  - "assembleAndRender drops filePath from return type; buffer is the only output (D-03)"
  - "GET /brief/:date uses LEFT JOIN so row-exists-but-no-bytes 404 is distinct from no-row 404 (D-08)"
  - "pdfFilename set to null on all new writes; old rows left untouched (D-04/D-05)"
  - "Retention sweep fully deleted from scheduler; D-09 defer-forever confirmed"
  - "SCH-05 test renamed from 'retention sweep' to 'bytes-not-filename upsert test'"
key_files:
  created: []
  modified:
    - vigil-core/src/services/brief-assembly-service.ts
    - vigil-core/src/routes/brief-generate.ts
    - vigil-core/src/services/generate-scheduler.ts
    - vigil-core/src/services/brief-assembly-service.test.ts
    - vigil-core/src/routes/brief-generate.test.ts
    - vigil-core/src/services/generate-scheduler.test.ts
metrics:
  duration: "~5 minutes"
  completed: "2026-04-17"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 6
requirements_addressed: [BRIEF-01]
---

# Phase 99 Plan 02: Rewire Backend to brief_pdfs Sink — Summary

**One-liner:** Deleted the /tmp/briefs filesystem write path across all three backend files; PDF bytes now flow through brief_pdfs BYTEA rows with a locked structured-404 API contract for Plan 03.

## What Was Built

### Task 1: brief-assembly-service.ts — filesystem write removed

Changes to `vigil-core/src/services/brief-assembly-service.ts`:

1. Removed `briefsDir?: string` from `BriefAssemblyDeps` interface
2. Deleted `BRIEFS_DIR` constant (`deps.briefsDir ?? process.env.BRIEFS_DIR ?? "/tmp/briefs"`)
3. Updated `assembleAndRender` return type: `{ buffer: Buffer; metadata: ... }` — `filePath` field gone
4. Deleted the filesystem write block: `fs.promises.mkdir(BRIEFS_DIR)` + `fs.promises.writeFile(filePath, buffer)`
5. Updated return statement to drop `filePath`
6. Left `fs`/`path` imports in place — still used by the affirmation/prioritization filesystem cache (different concern, different path, out of scope)

Changes to `vigil-core/src/services/brief-assembly-service.test.ts`:

1. Removed `briefsDir: tmpDir` from `makeBaseDeps()` (field no longer exists)
2. Updated Test 1: removed `result.filePath.startsWith(tmpDir)` assertion
3. Replaced Test 9 "filesystem write" with Test 9 "assembleAndRender does NOT write to the filesystem" — uses `t.mock.method(fs.promises, "writeFile")` spy to assert no `brief-*.pdf` writes occur

### Task 2: brief-generate.ts — POST upserts brief_pdfs, GET reads from brief_pdfs

Changes to `vigil-core/src/routes/brief-generate.ts`:

1. Added `briefPdfs` to schema import; removed `fs`/`path` imports entirely
2. Updated `BriefGenerateDeps`: dropped `readFileFn`, updated `assemblerFactory` return type to drop `filePath`
3. Deleted the `readFile()` helper function
4. **POST handler**: after briefs upsert (with `.returning({ id: briefs.id })`), adds a second upsert into `brief_pdfs` with the buffer bytes, `contentType`, and `byteLength`; `pdfFilename` set to `null`
5. **GET handler**: full rewrite — LEFT JOIN `briefs → brief_pdfs`, two distinct 404 paths per D-08:
   - `rows.length === 0` → `{ error: "brief_not_found", date, regenerable: false }` (no briefs row)
   - `!row.bytes` → `{ error: "brief_pdf_not_stored", date, regenerable: true }` (pre-fix brief)
   - `row.bytes` present → 200 + raw PDF bytes
6. Deleted the `path.resolve` / `BRIEFS_DIR` path-traversal guard (dead code — no filesystem lookups)

Changes to `vigil-core/src/routes/brief-generate.test.ts`:

1. Rewrote `makeSuccessResult()` to drop `filePath`
2. Rewrote `makeMockDb` to capture both `briefs` and `briefPdfs` inserts, identify table by `Symbol.for("drizzle:Name")`, and return `[{ id: 1 }]` from `.returning()`
3. Updated Test 2: asserts `captures.briefs.pdfFilename === null` and `captures.briefPdfs.bytes/contentType/byteLength`
4. Replaced Tests 5–7 (file-path based) with four new tests:
   - Test 5: 200 + bytes when `brief_pdfs` row exists
   - Test 6: 404 `brief_pdf_not_stored` + `regenerable: true` when bytes = null
   - Test 7: 404 `brief_not_found` + `regenerable: false` when no briefs row
   - Test 8: 400 for malformed date (unchanged)
5. Test 9 (503 for db=null) kept and verified

### Task 3: generate-scheduler.ts — brief_pdfs sink + retention sweep deleted

Changes to `vigil-core/src/services/generate-scheduler.ts`:

1. Removed `import * as fs` and `lt` drizzle-orm import
2. Added `briefPdfs` to schema import
3. Updated `GenerateSchedulerDeps`:
   - `assemble` return type drops `filePath`
   - `upsertBriefFn` signature: `bytes: Buffer` replaces `pdfFilename: string`
   - Deleted `unlinkFn`, `selectExpiredBriefsFn`, `deleteExpiredBriefsFn`, `retentionDays` fields
4. Deleted `DEFAULT_RETENTION_DAYS` constant and `subtractDays()` helper
5. Rewrote `upsertBriefViaDb`: now writes briefs row (`pdfFilename: null`) then brief_pdfs row sequentially using `.returning({ id: briefs.id })`
6. Deleted `selectExpiredBriefsViaDb` and `deleteExpiredBriefsViaDb` functions
7. Updated `tick()`: passes `bytes: result.buffer` to `upsertBriefViaDb`; deleted the entire retention sweep block (D-09)

Changes to `vigil-core/src/services/generate-scheduler.test.ts`:

1. Removed `filePath` from `makeAssembler()` return shape
2. Deleted SCH-05 retention sweep test; replaced with new SCH-05 "bytes-not-filename upsert" test
3. Removed `selectExpiredBriefsFn`/`deleteExpiredBriefsFn` from all test fixtures (SCH-01 through SCH-08)

## API Contract (Locked for Plan 03)

### GET /v1/brief/:date

| Case | Status | Body |
|------|--------|------|
| brief_pdfs row exists | 200 | Raw PDF bytes, `Content-Type: application/pdf`, `Content-Disposition: inline; filename="brief-YYYY-MM-DD.pdf"` |
| briefs row exists, no brief_pdfs row | 404 | `{ "error": "brief_pdf_not_stored", "date": "YYYY-MM-DD", "regenerable": true }` |
| no briefs row at all | 404 | `{ "error": "brief_not_found", "date": "YYYY-MM-DD", "regenerable": false }` |
| invalid date format | 400 | `{ "error": "date must be YYYY-MM-DD format" }` |
| db unavailable | 503 | `{ "error": "Database not available" }` |

### POST /v1/brief/generate

200 OK: raw PDF bytes + `X-Brief-Storage-Key: YYYY-MM-DD` header (unchanged surface). Now also writes brief_pdfs row.

## Deleted Code Paths — Confirmed Zero References

| Pattern | Files checked | Result |
|---------|---------------|--------|
| `BRIEFS_DIR` | vigil-core/src/ | Zero references |
| `/tmp/briefs` in code | vigil-core/src/ | Zero (one comment in test explaining what we assert *against*) |
| `readFileFn` | vigil-core/src/ | Zero references |
| `unlinkFn` / `fs.promises.unlink` | vigil-core/src/ | Zero references |
| `subtractDays` / `selectExpiredBriefs` / `deleteExpiredBriefs` / `retentionDays` | vigil-core/src/ | Zero references |

## Deviations from Plan

None. Plan executed exactly as written. All D-03/D-05/D-06/D-08/D-09 directives followed.

## Known Stubs

None. The write path (POST), read path (GET), and scheduler are all fully wired to brief_pdfs. No mock data, no TODOs, no hardcoded empty values in the affected code paths.

## Threat Flags

None. No new network endpoints or auth paths introduced. The path-traversal guard (`path.resolve / BRIEFS_DIR`) is removed because the GET handler no longer reads files — the threat is eliminated by design (T-99-07).

## Self-Check: PASSED

- `vigil-core/src/services/brief-assembly-service.ts` — FOUND, no BRIEFS_DIR, no filePath
- `vigil-core/src/routes/brief-generate.ts` — FOUND, has briefPdfs, leftJoin, structured 404s
- `vigil-core/src/services/generate-scheduler.ts` — FOUND, has briefPdfs, no retention sweep
- `vigil-core/src/services/brief-assembly-service.test.ts` — FOUND, Test 9 no-filesystem-write spy
- `vigil-core/src/routes/brief-generate.test.ts` — FOUND, Tests 5-7 cover new 404 contract
- `vigil-core/src/services/generate-scheduler.test.ts` — FOUND, SCH-05 bytes-not-filename test
- Commit `e6ecd2a` — feat(99-02): strip filesystem write from brief-assembly-service
- Commit `5b7237f` — feat(99-02): rewire POST+GET brief routes to use brief_pdfs table
- Commit `fd3dc27` — feat(99-02): route scheduler through brief_pdfs sink, delete retention sweep
- Full test suite: 171 pass, 0 fail, 5 skipped (pre-existing DB integration tests)
