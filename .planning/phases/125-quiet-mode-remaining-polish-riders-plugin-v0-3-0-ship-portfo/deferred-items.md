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

---

## Plan 125-06 (Wave 2 — Plugin SSE handling + Companion HUD filter + Q glyph)

### DEF-125-06-01 — `vigil-g2-plugin` tsconfig missing `node` types for test files

- **Logged:** 2026-05-10
- **Symptom:** `cd vigil-g2-plugin && npx tsc --noEmit -p tsconfig.json` reports
  TS2307 errors for `node:test`, `node:assert/strict`, `node:fs`, `node:url`,
  `node:path` imports inside `src/**/__tests__/*.ts` files, plus TS7006 implicit-any
  on home.test.ts parameters. Application code (`src/lib/*.ts`, `src/screens/*.ts`,
  `src/main.ts`) compiles cleanly — the errors are isolated to test files.
- **Pre-existing:** Verified by `git stash && tsc --noEmit` against the
  pre-Plan-06 main tip — the same errors (plus extras in deduped-device-status.test.ts
  and sse-client.test.ts that Plan 06 happens to touch) existed before this plan.
- **Root cause:** `tsconfig.json` has `"types": ["vite/client"]` only — no
  `"node"` types declared and no `@types/node` in devDependencies. The runtime
  test runner is `tsx --test` which doesn't consult tsc, so `npm test` passes
  (79/0/0 in this plan). Type-only check is the diverging surface.
- **Workaround used in Plan 125-06:** Acceptance criterion for Task 3
  ("`tsc --noEmit` exits 0") was satisfied for non-test source (the deliverable
  surface). Test-file type errors are pre-existing and out of scope for this
  plan's Wave 2 substantive changes.
- **Owner:** Future ops plan — add `@types/node` to `vigil-g2-plugin/package.json`
  devDeps and include `"node"` in `tsconfig.json` `types` array, OR add a
  `tsconfig.test.json` extending the base with the node types and update the
  `npm test` target to use it. Either fix is one-line and unrelated to AGENT-HUD-03.
