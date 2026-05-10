# Phase 125 — Deferred Items

Out-of-scope discoveries logged during plan execution. Per gsd-executor scope-boundary
("Only auto-fix issues DIRECTLY caused by the current task's changes; pre-existing
warnings/failures in unrelated files are out of scope"), these are logged here for
follow-up rather than fixed inline.

---

## Plan 125-02 (Wave 1 — Drizzle migration)

### DEF-125-02-01 — Full `vigil-core` test suite hangs on `cross-user-isolation.test.ts`

- **Logged:** 2026-05-10
- **Symptom:** `cd vigil-core && npm test` (or equivalently `npx tsx --test "src/**/*.test.ts"`)
  runs >25 minutes without progressing past `cross-user-isolation.test.ts`. Cumulative
  CPU is ~0.25s while elapsed time grows linearly — classic hung-event-loop signature
  (likely an open DB handle waiting on a stale connection, or a `setInterval` keeping
  the loop alive after assertions pass).
- **Reproduction:** From a clean tree, `cd vigil-core && npm test` — never reaches
  the final TAP summary frame within 30 min.
- **Workaround used in Plan 125-02:** Targeted regression smoke via
  `npx tsx --test <schema-importing files>` (96 tests / 65 pass / 0 fail / 31 skip
  in 22s). Plan acceptance was schema-typing regression only, not a full-suite
  invariant — the targeted run satisfies it.
- **Tried but did not work:** `--test-skip-pattern=cross-user-isolation` against
  tsx 4.x — the flag is silently ignored or the hang is in a different file too.
  Process killed after 26 min wall, 0 CPU change in last 60s.
- **Pre-existing:** 125-01-SUMMARY.md flagged the same issue: "A pre-existing
  slow test (`src/integration/cross-user-isolation.test.ts`) was observed during
  baseline measurement. … a single sustained run measured ~15min in one earlier
  invocation". This plan's encounter (~25min+) suggests the regression has grown.
- **Owner:** Future ops plan (cleanup wave) — not in 125's scope. Recommend running
  the suite under `node --test --test-timeout=120000` with per-file isolation, or
  carving the integration tests into their own `npm run test:integration` lane so
  the fast unit suite (~22s) is the default `npm test` target.
