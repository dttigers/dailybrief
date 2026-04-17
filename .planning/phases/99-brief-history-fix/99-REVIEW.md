---
phase: 99-brief-history-fix
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - vigil-core/src/db/schema.ts
  - vigil-core/src/routes/brief-generate.ts
  - vigil-core/src/routes/brief-generate.test.ts
  - vigil-core/src/services/brief-assembly-service.ts
  - vigil-core/src/services/brief-assembly-service.test.ts
  - vigil-core/src/services/generate-scheduler.ts
  - vigil-core/src/services/generate-scheduler.test.ts
  - vigil-core/drizzle/0011_dashing_redwing.sql
  - vigil-core/drizzle/meta/0009_snapshot.json
  - vigil-core/drizzle/meta/0010_snapshot.json
  - vigil-core/drizzle/meta/0011_snapshot.json
  - vigil-core/drizzle/meta/_journal.json
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/pages/BriefHistoryPage.tsx
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 99: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 99 replaces the `/tmp/briefs` filesystem PDF sink with a `brief_pdfs` BYTEA table in Postgres to fix BRIEF-01 (Railway redeploy wipes the ephemeral disk). The implementation is solid: the migration is internally consistent, the snapshot chain (0008 → 0009 → 0010 → 0011) is correctly linked, the structured 404 JSON bodies round-trip through the PWA client with defensive parsing, and the scheduler and route both write bytes via an idempotent two-step upsert that preserves the "brief exists but PDF missing" signal the UI depends on.

No Critical issues found. Two Warnings concern (a) a non-atomic two-step upsert that can leak a `brief_pdf_not_stored` state on partial failure, and (b) the Regenerate-button full-page reload path leaving dead state updates and a double-revoke before navigation. Five Info items cover untested client-side 404 parsing, a misleading legacy header name, a doubled `URL.revokeObjectURL` call, an unusual empty `Content-Type` header, and an edge case in the affirmation cache.

## Warnings

### WR-01: Non-atomic two-step upsert can leave orphan `briefs` row when `brief_pdfs` insert fails

**File:** `vigil-core/src/routes/brief-generate.ts:60-91` (also `vigil-core/src/services/generate-scheduler.ts:130-161`)
**Issue:** Both the POST `/brief/generate` route and the scheduler's `upsertBriefViaDb` perform two sequential `db.insert(...).onConflictDoUpdate(...)` statements — first into `briefs`, then into `brief_pdfs` — without wrapping them in a transaction. If the first insert succeeds and the second fails (network blip, disk pressure, SIGTERM mid-request), the database ends up with a `briefs` row whose `brief_pdfs` row is missing. This is the exact `brief_pdf_not_stored` state the code treats as "pre-fix brief" requiring regeneration, so the read path degrades gracefully — but a freshly-generated brief advertising itself as new and then silently needing regeneration is a poor UX and muddies the semantic meaning of `brief_pdf_not_stored`.

**Fix:** Wrap both upserts in a single transaction so either both rows land or neither does:
```typescript
await db.transaction(async (tx) => {
  const [briefRow] = await tx.insert(briefs).values({...})
    .onConflictDoUpdate({...})
    .returning({ id: briefs.id });
  await tx.insert(briefPdfs).values({
    briefId: briefRow.id,
    bytes: buffer,
    contentType: "application/pdf",
    byteLength: buffer.length,
  }).onConflictDoUpdate({...});
});
```
Apply the same pattern in `generate-scheduler.ts:upsertBriefViaDb`. Tests already use DI seams so this change is internal to the drizzle fallback path and does not invalidate existing assertions.

### WR-02: `handleRegenerateDetail` performs wasted state updates and a double-revoke before `window.location.reload()`

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:129-157`
**Issue:** The success path of `handleRegenerateDetail`:
1. Calls `URL.revokeObjectURL(todayBlobUrl)` manually (line 142)
2. Calls `URL.createObjectURL(blob)` + `setTodayBlobUrl(url)` (lines 143-144)
3. Calls `window.location.reload()` (line 151)

The reload discards the entire JS context before React flushes the state update, so `setTodayBlobUrl(url)`, `setGenerateState('done')`, `setSelectedDate(null)`, `setDetailBlobUrl(null)`, and `setDetailErrorCode(null)` are all wasted work. Worse, the blob URL created on line 143 is never rendered and never explicitly revoked — the reload navigates before the cleanup effect at lines 61-65 ever fires. Browsers will eventually GC it on navigation, but it's a small memory leak per regenerate. The `setRegenerating(false)` in `finally` (line 155) is also unreachable on the success path for the same reason.

This path is also flagged in the plan as "acceptable tradeoff" for forcing `useBriefs` to re-fetch, but the interim blob work should be removed for clarity.

**Fix:** On success, skip the local state churn and go straight to reload. Retain only the error-path state updates:
```typescript
async function handleRegenerateDetail() {
  setRegenerating(true);
  setDetailError(null);
  try {
    await generateBrief();  // discard blob — reload will re-fetch
    // Cleanup is handled by the unmount effect fired during reload teardown
    // in well-behaved browsers; explicit revoke adds no value before reload().
    window.location.reload();
    // Nothing after reload() runs.
  } catch (e: unknown) {
    setDetailError(e instanceof Error ? e.message : 'Regenerate failed. Try again.');
    setRegenerating(false);
  }
}
```
Alternative (preferred longer-term): expose a `refetch` from `useBriefs` and avoid `window.location.reload()` altogether, which would preserve scroll position and the teal-highlighted "Today's Brief" iframe without a visible flash.

## Info

### IN-01: No tests cover the PWA client's structured 404 parsing or `BriefPdfFetchError` surface

**File:** `vigil-pwa/src/api/client.ts:371-416` (no corresponding `client.test.ts`)
**Issue:** `getBriefPdf` is the linchpin of T-99-11: it parses the structured 404 body, guards against malformed JSON, defaults `regenerable` to `false` when the flag is absent, and maps every error shape to a `BriefPdfFetchError` with a specific `code`. None of that is covered by automated tests. The server-side tests in `brief-generate.test.ts` verify the wire format produced (Tests 6, 7), but there is no counterpart verifying the client correctly consumes it or handles the documented failure modes (malformed JSON body, 500/503, missing `regenerable` flag).

Given the plan explicitly called out defensive parsing as a concern and the error-code-driven UI in `BriefHistoryPage` branches on `detailErrorCode`, this gap will allow regressions to slip in silently (e.g., a future refactor that throws a generic `Error` for 404s would break the UI's "Regenerate" button visibility).

**Fix:** Add a `vigil-pwa/src/api/client.test.ts` (or extend the PWA test suite) covering:
- 200 returns a Blob
- 404 with `{error: 'brief_pdf_not_stored', regenerable: true}` throws `BriefPdfFetchError` with `code: 'brief_pdf_not_stored'`, `regenerable: true`, `status: 404`
- 404 with `{error: 'brief_not_found', regenerable: false}` throws with `code: 'brief_not_found'`, `regenerable: false`
- 404 with malformed JSON body falls back to `code: 'brief_not_found'`, `regenerable: false`
- 404 with unknown `error` string falls back to `code: 'brief_not_found'`
- 500 throws with `code: 'http_error'`, `status: 500`

### IN-02: `X-Brief-Storage-Key` header name leaks the old filesystem-storage-key model

**File:** `vigil-core/src/routes/brief-generate.ts:98`
**Issue:** The response header `X-Brief-Storage-Key` is set to `dateStr`. Under the filesystem model this made sense — the date *was* the key derived from the filename. Under the new BYTEA model, the "storage key" is `brief_pdfs.brief_id`, not the date. The value returned is still semantically the date (useful for clients that want to know what date the generated brief covers without parsing `Content-Disposition`), but the name "Storage-Key" will confuse future maintainers. Test 1 (`brief-generate.test.ts:73`) asserts its presence and shape, so removing the header is a PWA-facing change.

**Fix:** Rename to `X-Brief-Date` (clearer intent, no model leakage). Update `brief-generate.test.ts:73-74` and grep `vigil-pwa/` for any consumer (none found in reviewed files, but worth checking) before landing.

### IN-03: `handleRegenerateDetail` and `handleGenerate` double-revoke `todayBlobUrl` on change

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:61-65, 78, 142`
**Issue:** Both `handleGenerate` (line 78) and `handleRegenerateDetail` (line 142) call `URL.revokeObjectURL(todayBlobUrl)` explicitly before calling `setTodayBlobUrl(url)`. The cleanup effect at lines 61-65 ALSO revokes `todayBlobUrl` on dependency change (closing over the previous value, per React closure semantics). The result is the same URL being revoked twice — harmless because `revokeObjectURL` is idempotent, but misleading to read.

**Fix:** Delete the manual `URL.revokeObjectURL(todayBlobUrl)` calls on lines 78 and 142. The cleanup effect is the single source of truth. Keep the `detailBlobUrlRef` path in `handleSelectBrief` / `handleBack` as-is — that one legitimately revokes eagerly because a ref isn't part of the effect deps.

### IN-04: `generateBrief` sends `Content-Type: ''` header which some intermediaries may reject

**File:** `vigil-pwa/src/api/client.ts:362, 373`
**Issue:** `generateBrief` and `getBriefPdf` both set `headers: { 'Content-Type': '' }` to override `vigilFetch`'s default `Content-Type: application/json`. POST `/brief/generate` sends no body, so no `Content-Type` is needed at all. An empty-string value is unusual and some reverse proxies / CDNs (including Cloudflare, relevant for `api.vigilhub.io`) may normalize or reject it. The safer idiom is to omit the header rather than set it to empty.

**Fix:** In `vigilFetch`, change the merge order so caller `undefined` values delete the default, or just set the header to undefined and filter:
```typescript
// Option A: omit via spread of a fresh object
const res = await fetch(`${API_BASE}${path}`, {
  ...init,
  headers: init?.body
    ? { 'Content-Type': 'application/json', ...authHeaders, ...init?.headers }
    : { ...authHeaders, ...init?.headers },
});
```
Then callers can drop the `'Content-Type': ''` workaround entirely. For today, the existing behavior works against the current vigil-core Hono server, so this is non-blocking.

### IN-05: `fetchAffirmation` caches the Claude response verbatim with no non-empty check

**File:** `vigil-core/src/services/brief-assembly-service.ts:285-299`
**Issue:** `callClaudeFn` returns a string. If Claude returns `""` (model refusal, truncation, empty completion), the code writes an empty file to `~/.cache/dailybrief/affirmation-{date}.txt` and on subsequent reads `fs.readFileSync(cacheFile, "utf-8")` returns `""` instead of falling through to `AFFIRMATION_FALLBACK`. The empty affirmation then flows into `BriefRenderData.affirmation` and renders as blank space in the PDF.

**Fix:** Gate both the cache write and the cache read on non-empty content:
```typescript
// On read
if (fs.existsSync(cacheFile)) {
  const cached = fs.readFileSync(cacheFile, "utf-8");
  if (cached.trim().length > 0) return cached;
}

// On write
if (text.trim().length > 0) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, text, "utf-8");
  } catch { /* non-fatal */ }
}
return text.trim().length > 0 ? text : AFFIRMATION_FALLBACK;
```

## Notes (non-findings)

The following were reviewed and are working as intended — recording here so future reviewers don't re-flag:

- **Migration 0011 SQL** (`vigil-core/drizzle/0011_dashing_redwing.sql`): `brief_id PRIMARY KEY NOT NULL`, `bytes bytea NOT NULL`, `byte_length integer NOT NULL`, FK `ON DELETE cascade` — all correct. Matches `schema.ts:120-133` and the journal entry at `_journal.json:83-87`.
- **Snapshot chain integrity**: 0008 id → 0009 prevId → 0009 id → 0010 prevId → 0010 id → 0011 prevId is linked correctly (verified `ab1d3a6b` → `e93010b5` → `0d52d7da` → `2652c9c9`). The manual patches to 0009/0010 reported in the plan did not break the hash chain.
- **Date validation regex** (`brief-generate.ts:116`): `^\d{4}-\d{2}-\d{2}$` accepts invalid calendar dates like `9999-99-99` but this is fine — the stated goal is path-traversal prevention (T-76-04), and Postgres will reject invalid dates at query time with a clean error.
- **Dedupe window correctness** (`generate-scheduler.ts:192`): Uses `now().getTime() - recent.createdAt.getTime() < dedupeWindowMs` with `createdAt` protected by schema `notNull`. Safe.
- **Scheduler `createdAt: sql\`now()\`` in upsert** (lines 143, 158): Intentional — bumps the timestamp so the scheduler's 10-minute dedupe correctly sees a manual `/brief/generate` as "generated recently" and skips.
- **Buffer memory**: Briefs are 30-100KB per the context note. Node's BYTEA round-trip via postgres-js is fine at this scale; no concern.
- **Test coverage for structured 404 shapes** (server): `brief-generate.test.ts` Tests 6 and 7 verify the exact wire format for both 404 variants. Complete on the server side; gap is client-side (see IN-01).

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
