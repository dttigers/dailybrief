---
phase: 99-brief-history-fix
fixed_at: 2026-04-17T00:00:00Z
review_path: .planning/phases/99-brief-history-fix/99-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 99: Code Review Fix Report

**Fixed at:** 2026-04-17
**Source review:** .planning/phases/99-brief-history-fix/99-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (Critical + Warning only — 5 Info findings deferred)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Non-atomic two-step upsert can leave orphan `briefs` row when `brief_pdfs` insert fails

**Files modified:** `vigil-core/src/routes/brief-generate.ts`, `vigil-core/src/services/generate-scheduler.ts`, `vigil-core/src/routes/brief-generate.test.ts`
**Commit:** 580fb3a
**Applied fix:** Wrapped both `briefs` and `brief_pdfs` upserts in `db.transaction(async (tx) => {...})` in:
1. `brief-generate.ts` POST `/brief/generate` handler (lines 58-95)
2. `generate-scheduler.ts` `upsertBriefViaDb` (lines 130-165)

Followed the existing transaction pattern already used by `routes/links.ts` and `routes/bulk.ts`. Both upserts now share a single atomic unit — either both rows land or neither does, eliminating the "brief exists but PDF bytes missing" race window.

Also updated the test mock in `brief-generate.test.ts` to expose a `transaction(fn)` method that invokes `fn(db)` so the existing insert-capture assertions continue to work.

**Verification:**
- Tier 1: Re-read both source files at affected line ranges — fix text present, surrounding code intact.
- Tier 2: `npx tsc --noEmit` — clean (no errors).
- Tier 2+: Full test suite (`npm test`) — 171 pass / 0 fail / 5 skipped (matches pre-fix baseline of 171 green; the 2 failures introduced by the transaction change were resolved by the mock update).

### WR-02: `handleRegenerateDetail` performs wasted state updates and a double-revoke before `window.location.reload()`

**Files modified:** `vigil-pwa/src/pages/BriefHistoryPage.tsx`
**Commit:** 6a93c7b
**Applied fix:** Simplified `handleRegenerateDetail` success path to just `await generateBrief(); window.location.reload();` per the review's preferred fix. Removed:
- Manual `URL.revokeObjectURL(detailBlobUrlRef.current)` (redundant with unmount effect)
- Manual `URL.revokeObjectURL(todayBlobUrl)` (double-revoke, already handled by cleanup effect at lines 61-65)
- `URL.createObjectURL(blob)` + `setTodayBlobUrl(url)` (leaked object URL, never rendered before reload)
- `setGenerateState('done')`, `setSelectedDate(null)`, `setDetailBlobUrl(null)`, `setDetailErrorCode(null)` (all discarded by reload before React flushed them)
- Moved `setRegenerating(false)` out of `finally` into the `catch` block only, since the success path never reaches finally-after-reload.

Error path retained: catch block still sets `detailError` and resets `regenerating`.

**Verification:**
- Tier 1: Re-read modified function — 17 lines, reads cleanly, no orphan identifiers.
- Tier 2: `npx tsc --noEmit` — only pre-existing TS6305 stale-dist errors in other files; no errors reference `BriefHistoryPage.tsx`.
- Tier 2+: `npm run build` (vite) — succeeds, 64 modules transformed, PWA service worker regenerated.

## Skipped Issues

None — all in-scope findings (WR-01, WR-02) fixed successfully.

Note: 5 Info-severity findings (IN-01 through IN-05) are out of scope per `fix_scope: critical_warning` and remain untouched. They describe test coverage gaps, header naming, redundant revokes, unusual `Content-Type: ''` header, and affirmation cache edge case — none are correctness regressions.

---

_Fixed: 2026-04-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
