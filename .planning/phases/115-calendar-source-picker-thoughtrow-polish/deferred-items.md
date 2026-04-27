# Phase 115 — Deferred Items

## Pre-existing issues found during execution (NOT caused by Phase 115 changes)

### TS6305 stale .d.ts warnings in vigil-pwa (70 occurrences)

**Discovered during:** Plan 115-03, Task 1 verification (`npx tsc --noEmit`)
**Status:** Pre-existing — confirmed by stash-and-rerun (70 TS6305 before AND after the className change; 0 non-TS6305 errors).
**Cause:** Stale `.d.ts` and `.tsbuildinfo` artifacts from an earlier `tsc --build` (or vitest's emit step) sit alongside the source `.tsx`/`.ts` files in `vigil-pwa/src/`. Tsc's default include `**/*` picks them up and complains they weren't built from source.
**Why deferred:** Out of scope per `<scope_boundary>` — these warnings predate this plan, are unrelated to the single-line className change in `ThoughtRow.tsx:399`, and exist throughout `vigil-pwa/src/**` (every page/component/util has a stale `.d.ts`).
**Impact on Plan 115-03:** None. Tsc still exits non-zero (because of TS6305), but no real type errors exist for the modified file. Verification ran via `vitest` instead, which passed cleanly.
**Recommended fix (separate cleanup):** `cd vigil-pwa && find src -name '*.d.ts' -delete && rm -f tsconfig.tsbuildinfo` then re-run `npx tsc --noEmit` to confirm clean exit.
