---
phase: 59
plan: 01
subsystem: vigil-core-backend
tags: [photo-upload, ocr, claude-vision, hono, node-test]
dependency-graph:
  requires:
    - vigil-core/src/ai/client.ts (callClaudeMultimodal, parseAIJson, getAIClient)
    - vigil-core/src/routes/describe-image.ts (route pattern template)
  provides:
    - exported ThoughtApiResponse + toResponse (unblocks Plan 02)
    - processPhoto Hono router (scaffolded, 501 stub)
    - processClaudeResponse pure helper (fully tested)
    - npm test script (node:test via tsx)
  affects:
    - vigil-core/src/index.ts (new route mount)
tech-stack:
  added: []
  patterns:
    - Pure-helper extraction: all decision logic (D-04, D-08) lives in a
      string-in/string-out helper so it can be unit-tested without Claude or DB.
    - node:test + tsx: zero-dep testing using Node 22's built-in runner.
key-files:
  created:
    - vigil-core/src/routes/process-photo.ts
    - vigil-core/src/routes/process-photo.test.ts
  modified:
    - vigil-core/src/routes/thoughts.ts (2-line export addition)
    - vigil-core/package.json (added test script)
    - vigil-core/src/index.ts (2-line route mount)
decisions:
  - D-04 coercion: paperType preserved in response (UI transparency) but
    effective split is always lined when confidence<0.5 or paperType=unknown.
  - D-08 fallback: any parse failure, empty thoughts array, or non-object
    parsed value returns one lined thought containing rawText.trim().
  - High-confidence gridded with >1 thoughts: defensive collapse via "\n\n" join.
  - Empty-after-trim thoughts dropped; if all empty, D-08 fallback fires.
metrics:
  duration: ~10 min
  completed: 2026-04-09
  tasks: 4
  tests: 11 (all green)
---

# Phase 59 Plan 01: Smart Photo Upload Backend — Scaffold Summary

Scaffolded `/process-photo` endpoint: exported `toResponse`/`ThoughtApiResponse` from `thoughts.ts`, added `npm test` via `node:test`+`tsx` (zero new deps), created `process-photo.ts` with Hono router + pure `processClaudeResponse` helper implementing D-04 (low-confidence/unknown → lined split, high-conf gridded collapse) and D-08 (parse failure → raw-text fallback), wrote 11 unit tests covering every decision path, and mounted the route under `/v1`. Route returns a 501 stub on happy path — Plan 02 will replace it with Claude call + DB insert.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Export `toResponse` + `ThoughtApiResponse` | `9a7f107` | `vigil-core/src/routes/thoughts.ts` |
| 2 | Add `npm test` script (node:test via tsx) | `d36615a` | `vigil-core/package.json` |
| 3 | `process-photo.ts` scaffold + `processClaudeResponse` + 11 unit tests | `35a43c6` | `vigil-core/src/routes/process-photo.ts`, `vigil-core/src/routes/process-photo.test.ts` |
| 4 | Mount `processPhoto` in `index.ts` | `c97b228` | `vigil-core/src/index.ts` |

## Test Coverage

All 11 tests pass. Each covers a specific decision path:

| Test | Purpose | Requirement / Decision |
|------|---------|------------------------|
| lined paper multi-thought | Lined split with confidence | PHOTO-01, PHOTO-02 |
| gridded single thought | High-confidence gridded passthrough | PHOTO-03 |
| verbatim preserved | Strict equality on thought content | PHOTO-04 |
| confidence<0.5 w/ gridded → lined split | Low-confidence coercion | D-04 |
| paperType=unknown → lined split | Unknown fallback | D-04 |
| high-confidence gridded w/ >1 collapses | Defensive coercion | D-04 (P-4) |
| D-08 preamble prose fallback | Parse failure → raw-text single thought | D-08 (P-2) |
| D-08 truncated JSON fallback | Parse failure → raw-text single thought | D-08 |
| D-08 empty thoughts array fallback | Defensive empty handling | D-08 |
| D-08 missing fields default safely | Defaults for missing paperType/confidence | D-08 |
| trimming & empty drop | Whitespace hygiene | Implementation hygiene |

## Pitfalls Addressed

- **P-1** (paraphrase): Test asserts strict string equality; helper never mutates thought strings.
- **P-2** (parseAIJson preamble): D-08 preamble test exercises `"Here is the JSON: ..."` case.
- **P-3** (two fenced blocks): Covered by D-08 fallback (unparseable returns single-thought fallback).
- **P-10** (toResponse not exported): Fixed in Task 1.
- **P-11** (skipping fallback assertion): Two explicit D-08 tests.

## Deviations from Plan

None — plan executed exactly as written.

The only incidental change was running `npm install` to populate the worktree's `node_modules` (needed for `tsc` and `tsx` to resolve). This produced a version bump in `package-lock.json` (0.1.0 → 0.2.0 sync with `package.json`) which was reverted before the final state — no committed lockfile drift.

## Verification

Plan-level checks (all pass):

1. `cd vigil-core && npx tsc --noEmit` → exit 0
2. `cd vigil-core && npm test` → 11/11 tests pass, exit 0
3. `grep -c "^test(" vigil-core/src/routes/process-photo.test.ts` → 11
4. `grep "processPhoto" vigil-core/src/index.ts` → import + mount both present
5. `grep "^export function toResponse" vigil-core/src/routes/thoughts.ts` → exit 0
6. `grep "^export interface ThoughtApiResponse" vigil-core/src/routes/thoughts.ts` → exit 0
7. `git diff --stat vigil-core/src/routes/thoughts.ts` → 2 lines changed (within ≤4 target)

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|------------|
| T-59-04 (info disclosure via error path) | `processClaudeResponse` catches parse errors locally and returns a structured result; no error logging, no raw text echoed to HTTP error body. |
| T-59-05 (auth bypass) | Route mounted under `/v1` — bearer auth applies automatically via existing `/v1/*` middleware. |
| T-59-10 (malformed mediaType) | `VALID_MEDIA_TYPES` allowlist copied verbatim from `describe-image.ts`; 400 on mismatch. |

## Left for Plan 02

- Replace `PHOTO_PROMPT` placeholder with real OCR-engine prompt.
- Replace 501 stub with: `callClaudeMultimodal(...)` → `processClaudeResponse(...)` → batched Drizzle insert → `toResponse` serialization.
- Remove the three `void` statements that suppress unused-import warnings.
- Route-level tests (400/503/502/500).
- Live smoke test with real lined + gridded samples (Plan 02 Task 4 human-verify checkpoint).

## Self-Check: PASSED

- vigil-core/src/routes/process-photo.ts — FOUND
- vigil-core/src/routes/process-photo.test.ts — FOUND
- vigil-core/src/routes/thoughts.ts (exports) — FOUND
- vigil-core/package.json (test script) — FOUND
- vigil-core/src/index.ts (import + mount) — FOUND
- Commits 9a7f107, d36615a, 35a43c6, c97b228 — FOUND
