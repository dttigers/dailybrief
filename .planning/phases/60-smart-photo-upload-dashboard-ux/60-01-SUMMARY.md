---
phase: 60-smart-photo-upload-dashboard-ux
plan: 01
subsystem: api
tags: [hono, claude-vision, drizzle, preview-mode, forcePaperType, asvs-l1, photo-05, photo-06]

requires:
  - phase: 59-smart-photo-upload-backend (plan 02)
    provides: "POST /v1/process-photo Claude-vision pipeline with DI factory (createProcessPhotoRouter), processClaudeResponse helper, toResponse serializer, and the 22-test node:test baseline"
provides:
  - "POST /v1/process-photo?preview=true — runs Claude + D-04 coercions + forcePaperType transform WITHOUT DB insert; returns 200 with unsaved thought shapes (id:null)"
  - "forcePaperType body field — strict 'lined' | 'gridded' enum; lined→gridded collapses via \\n\\n join, gridded→lined splits via splitGriddedBlobToLined"
  - "splitGriddedBlobToLined(blob) pure helper — heuristic /\\n{2,}/ split with degenerate passthrough"
  - "applyForcePaperType(result, force) pure helper — exported for unit test access"
  - "413 payload-size guard at 7 MB base64 (pre-flight, before Claude call)"
  - "Generic 502 body 'AI processing failed' — raw Anthropic SDK error text no longer reaches the client"
  - "Smoke-test preview-mode invariant — CI-friendly guard that ?preview=true never returns 201"
affects: [photo-upload-ui, dashboard-preview-flow, folder-watcher-phase-61]

tech-stack:
  added: []
  patterns:
    - "Pure post-processing transform (applyForcePaperType) chained after processClaudeResponse — keeps Phase 59 D-04 semantics untouched"
    - "Strict-equality query param parsing (=== 'true') — no truthy coercion so typos fall through to commit mode"
    - "Pre-flight resource guards (413) before vendor-cost operations"
    - "Generic error bodies at trust boundaries, detailed logs server-side only (WR-01 pattern)"

key-files:
  created: []
  modified:
    - "vigil-core/src/routes/process-photo.ts"
    - "vigil-core/src/routes/process-photo.test.ts"
    - "vigil-core/scripts/smoke-test.ts"

key-decisions:
  - "splitGriddedBlobToLined uses heuristic /\\n{2,}/ split (Option 2 from 60-RESEARCH.md) not a second Claude call — zero extra cost and the Phase 59 live gridded test confirmed \\n\\n is Claude's natural topic separator"
  - "applyForcePaperType exported (not file-local) — enables direct unit-test access and future reuse from a folder-watcher override path"
  - "413 not 400 for oversized payloads — follows 60-CONTEXT.md D-08 rather than the 59-REVIEW snippet's pre-Phase-60 400 recommendation"
  - "Preview mode returns 200, commit mode returns 201 — dashboard can distinguish by status code alone, no body parsing needed"
  - "RT-8 updated to assert the RAW SDK error text does NOT appear in the body (stronger than the plan's 'assert /AI processing failed/' spec) — closes WR-01 with a regression guard"

requirements-completed: []
# Backend half of PHOTO-05 + PHOTO-06 is now enabled; the requirements themselves
# are not CLOSED until Plan 60-02 (dashboard UX) ships. Orchestrator should
# mark requirements complete only after Plan 60-02.

duration: ~20min (worktree execution)
completed: 2026-04-09
---

# Phase 60 Plan 01: Backend Preview Patch Summary

**`/v1/process-photo` gains preview mode, `forcePaperType` override, 413 guard, and generic 502 — backend enablement for dashboard before-commit preview UX**

## Performance

- **Duration:** ~20 min worktree autonomous execution
- **Completed:** 2026-04-09
- **Tasks:** 3 autonomous
- **Files modified:** 3
- **Commits:** 3 atomic (feat + feat + chore)

## Accomplishments

- **Preview mode live** — `POST /v1/process-photo?preview=true` runs the exact same Claude call + `processClaudeResponse` + `applyForcePaperType` pipeline as commit mode, but skips `deps.dbInsertFn` entirely. Returns 200 with unsaved thought shapes: `{id: null, content, source: "image", confidence, projectId: null}`. Strict-equality check on the query param — `?preview=yes`, `?preview=1`, `?preview=TRUE` all fall through to commit mode by design (RT-14).
- **`forcePaperType` transform** — optional body field, strict `"lined" | "gridded"` enum validated before Claude call. Transform runs as a pure post-processing step (`applyForcePaperType`) after `processClaudeResponse`, preserving Phase 59 D-04 behavior unchanged. lined→gridded collapses N thoughts via `"\n\n"` join. gridded→lined splits the single blob via `splitGriddedBlobToLined` (`/\n{2,}/` heuristic). Degenerate gridded blobs (no `\n\n` separator) pass through as a single-entry array — callers never see empty thoughts.
- **`splitGriddedBlobToLined` helper** — exported pure function with 7 unit tests (T-60-a..T-60-g) covering multi-paragraph, single-line, empty-string, whitespace-only filtering, 3+ newline separators, trimming, and the live Phase 59 gridded verification blob.
- **413 payload guard (WR-02 closed)** — `body.image.length > 7 * 1024 * 1024` returns 413 BEFORE the Claude call, before any vendor token burn or 30-second hold on megabytes in memory. RT-20 verifies the Claude fake is never invoked.
- **Generic 502 body (WR-01 closed)** — on Claude failure, server logs `err.message` (T-59-04 discipline preserved) but the client receives only `{error: "AI processing failed"}`. RT-8 updated to assert (a) status 502, (b) body matches `/AI processing failed/`, and (c) the raw SDK text (`"anthropic 529 request_id=abc-internal-url"`) does NOT appear in the response body.
- **Smoke-test preview invariant (IN-02 closed)** — happy-path assertion tightened from `!== 201 && !== 200` to strict `!== 201`. New preview-mode block posts `?preview=true` and fails on 201 (commit leaked); 200 or 502 (1×1 PNG Claude reject) are both acceptable — the invariant is non-commit.

## Task Commits

1. **Task 1** — `e9c7798` feat(60-01): add splitGriddedBlobToLined helper + 7 unit tests
2. **Task 2** — `06bd70c` feat(60-01): wire preview mode + forcePaperType + 413 guard + generic 502
3. **Task 3** — `d74cb5a` chore(60-01): extend smoke-test with preview-mode check + tighten 201 gate

## Files Modified

- `vigil-core/src/routes/process-photo.ts` — Added `splitGriddedBlobToLined` + `applyForcePaperType` exports; route handler extended with preview-mode branch, forcePaperType validation, 413 guard, generic 502. Phase 59 invariants (P-7 unique UUIDs, P-12 batched insert, T-59-04 logging discipline, D-04 passthrough when `forcePaperType` absent) preserved unchanged.
- `vigil-core/src/routes/process-photo.test.ts` — 7 helper tests (T-60-a..g) + 9 new route tests (RT-12..RT-20) + RT-8 updated. 11 → 38 tests total.
- `vigil-core/scripts/smoke-test.ts` — Happy-path 200-or-201 drift removed; preview-mode block added after the 400-invalid-mediaType block.

## Decisions Made

- **Heuristic `\n{2,}` split over Claude re-call** — 60-RESEARCH.md Option 2. Zero extra cost, deterministic, the live Phase 59 gridded page already used `\n\n` as the natural topic separator. Escape hatch (Option 1 text-only Claude re-call) documented as future polish if Phase 60-02 human-verify finds degenerate splits on real photos.
- **`applyForcePaperType` is EXPORTED** — the plan suggested file-local with "exporting is better for future testability". Exported for direct unit-test access and future reuse (e.g., folder-watcher override path in Phase 61 if it ever needs one).
- **Status codes: 200 preview, 201 commit** — dashboard distinguishes by status code alone, no body parsing required.
- **413 not 400 for oversized payloads** — honors 60-CONTEXT.md D-08 over the 59-REVIEW snippet's 400 (which predated the D-08 status table).
- **RT-8 is stronger than the plan asked for** — the plan said "change `/anthropic 529/` to `/AI processing failed/`". The implemented test asserts BOTH that the generic message appears AND that the raw SDK text (including a fake internal request ID) is NOT present. This is a regression guard against someone re-introducing the leak via `{error: err.message}` with a fresh SDK error shape.

## Deviations from Plan

None requiring user decisions. One test-coverage strengthening delta:

- **[Plan enhancement] RT-8 double-assertion** — plan asked for a simple `/AI processing failed/` match; shipped a match + `!includes("anthropic 529")` guard. Zero behavior difference; stronger regression fence. The grep acceptance criterion `"grep -n 'anthropic 529' returns ZERO matches"` does NOT hold as literally stated — the string appears twice in the test file (once in the thrown Error, once in the negative assertion). Acceptance intent was "RT-8 no longer asserts the raw text appears in the body", which is satisfied. Flagging this explicitly so reviewers don't flag it as drift.

## Issues Encountered

**1. `node_modules` missing in worktree on initial test run** — `tsx: command not found`. `npm install` in `vigil-core/` resolved it in one shot. Worktrees share `.git` but not `node_modules`. One-time setup cost per worktree, not a code issue.

**2. Worktree branch base mismatch at start** — the worktree's initial HEAD was `5370a0a` (pre-phase-60 plan commit) rather than the expected base `373c826`. `git reset --hard 373c826` fixed it before any edits. Working tree was clean so no work was lost.

## Threat Surface Impact

All mitigations from the plan's `<threat_model>` are implemented and tested:

| Threat | Mitigation | Test |
|--------|-----------|------|
| T-60-01 Tampering (forcePaperType) | strict enum validation → 400 | RT-18 |
| T-60-02 Tampering (preview query) | strict `=== "true"` equality | RT-14 |
| T-60-03 DoS (oversized image) | 7 MB base64 pre-flight → 413 | RT-20 |
| T-60-04 InfoDisc (502 body) | generic `"AI processing failed"` | RT-8 |
| T-60-05 InfoDisc (log discipline) | T-59-04 preserved (no `body.image`, no `rawText` in logs) | code read |
| T-60-06..10 | accept (no new surface) | n/a |

No new threat surface introduced. `describeSubjects` / `/v1/describe-image` untouched per plan scope.

## Verification

- **Unit tests:** `cd vigil-core && npm test` → 38/38 pass (22 Phase 59 baseline + 7 T-60-* helper + 9 RT-12..RT-20 + RT-8 update overlap)
- **Type check:** `cd vigil-core && npx tsc --noEmit` → exit 0 (clean, no warnings)
- **Route-handler grep:** `applyForcePaperType`, `isPreview`, `MAX_IMAGE_B64_CHARS` all present in `process-photo.ts`
- **Smoke-test grep:** `preview=true` present; old `!== 201 && !== 200` drift removed
- **Manual curl:** not run — deferred to Plan 60-02 human-verify, per plan's verification section ("Manual is Plan 60-02's human-verify job")

## User Setup Required

None. The patch is additive:
- Existing callers omitting `preview` and `forcePaperType` get exact Phase 59 behavior (folder-watcher Phase 61 path unaffected).
- No new env vars, no migrations, no deploy steps.
- Next deploy of `vigil-core` will carry the patch automatically (Phase 56 push-on-complete hook + Railway auto-deploy).

## Next Phase Readiness

**Plan 60-02 (dashboard preview UX) can proceed immediately.** Backend contract ready:

```
POST /v1/process-photo?preview=true
Body: { image, mediaType, forcePaperType?: "lined"|"gridded" }
→ 200 { paperType, confidence, thoughts: [{id:null, content, source:"image", confidence, projectId:null}] }

POST /v1/process-photo
Body: { image, mediaType, forcePaperType?: "lined"|"gridded" }
→ 201 { paperType, confidence, thoughts: ThoughtApiResponse[] }  // with real ids
```

Phase 59 REVIEW items **WR-01, WR-02, IN-02 all closed inline** — no separate `/gsd-code-review-fix 59` run needed. The `[empty response]` IN-01 discussion remains deferred (separate concern, not blocking Phase 60).

## Self-Check: PASSED

Files modified verified on disk:
- FOUND: `vigil-core/src/routes/process-photo.ts` (exports `splitGriddedBlobToLined`, `applyForcePaperType`)
- FOUND: `vigil-core/src/routes/process-photo.test.ts` (38 tests, last one RT-20)
- FOUND: `vigil-core/scripts/smoke-test.ts` (preview=true block present)

Commits verified in `git log`:
- FOUND: `e9c7798` (Task 1)
- FOUND: `06bd70c` (Task 2)
- FOUND: `d74cb5a` (Task 3)

Test suite: 38/38 green. Type check: exit 0.

---
*Phase: 60-smart-photo-upload-dashboard-ux*
*Completed: 2026-04-09*
