---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 01
subsystem: testing
tags: [phase-124, plugin, test-infra, tsx, node-test, vigil-g2-plugin]

# Dependency graph
requires:
  - phase: 121-agent-events-api-foundation-cross-user-isolation-lock
    provides: vigil-core/src/routes/agent-events.test.ts pattern (node:test + assert/strict scaffold; copied verbatim into smoke.test.ts header)
provides:
  - vigil-g2-plugin/package.json with tsx ^4.19.0 devDep + npm test script
  - vigil-g2-plugin/src/__tests__/smoke.test.ts (2/2 passing tests confirming runner)
  - Empty test directories at vigil-g2-plugin/src/lib/__tests__/ and vigil-g2-plugin/src/screens/__tests__/ ready for downstream plans
affects: [124-04, 124-06, 124-07, 124-08]

# Tech tracking
tech-stack:
  added: [tsx ^4.19.0 — devDep only, no runtime impact; matches vigil-core version verbatim]
  patterns: [node:test + tsx loader for vigil-g2-plugin tests; mirrors vigil-core/package.json:9 "test" script shape]

key-files:
  created:
    - vigil-g2-plugin/src/__tests__/smoke.test.ts
    - vigil-g2-plugin/src/lib/__tests__/.gitkeep
    - vigil-g2-plugin/src/screens/__tests__/.gitkeep
  modified:
    - vigil-g2-plugin/package.json
    - vigil-g2-plugin/package-lock.json

key-decisions:
  - "tsx version pinned to ^4.19.0 — exact verbatim copy of vigil-core/package.json devDep entry; same supply-chain attestation surface, no version drift across the monorepo"
  - "test script `tsx --test \"src/**/*.test.ts\"` — verbatim shape from vigil-core/package.json:9; downstream plan tests use the same glob"
  - "tsconfig.json untouched — existing `include: [\"src\"]` already matches src/**/*.test.ts; test files compile under tsx loader without config changes"

patterns-established:
  - "Plugin test harness: node:test + tsx loader (no jest, no vitest) — keeps zero-runtime-dep posture intact (tsx is devDep)"
  - "Test layout: src/__tests__/ for top-level entry-point tests; src/lib/__tests__/ for transport/runtime utilities; src/screens/__tests__/ for screen component tests — co-located with source to keep imports relative"

requirements-completed: []  # AGENT-HUD-01, AGENT-HUD-02, G2-POLISH-06, G2-POLISH-07 are FRONTMATTER tags only — this plan is the test-infra prerequisite. Actual requirement satisfaction lands in Plans 04, 06, 07, 08.

# Metrics
duration: 1min
completed: 2026-05-10
---

# Phase 124 Plan 01: Plugin test infra bootstrap Summary

**`node:test` + `tsx` runner bootstrapped for `vigil-g2-plugin` so Plans 02-08 can author SSE-shim, Companion-screen, navigation, and launch-source tests against the same harness vigil-core uses.**

## Performance

- **Duration:** 1m 17s
- **Started:** 2026-05-10T00:28:00Z
- **Completed:** 2026-05-10T00:29:17Z
- **Tasks:** 1
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `vigil-g2-plugin` can now run `npm test` and the `tsx --test` runner executes against `src/**/*.test.ts`, returning 2/2 pass on first run.
- `tsx ^4.19.0` added as devDep — exact version match with `vigil-core/package.json` (no monorepo version drift). `node_modules/tsx/package.json` exists; `package-lock.json` records 4 `"tsx"` resolution entries.
- Smoke test (`src/__tests__/smoke.test.ts`) verifies BOTH the runner (`assert.equal(1+1, 2)`) AND TypeScript-under-tsx-loader compilation (`const x: number = 42`); locks the toolchain end-to-end.
- Three test directories exist with explanatory `.gitkeep` files so Plans 04/06/07/08 can drop test files into stable paths without each plan needing to mkdir.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tsx devDep + npm test script + smoke test** — `114b0aa` (chore)

_Note: Plan-metadata commit follows below this SUMMARY._

## Files Created/Modified

- `vigil-g2-plugin/package.json` — Added `tsx: ^4.19.0` to devDependencies; added `test: tsx --test "src/**/*.test.ts"` to scripts.
- `vigil-g2-plugin/package-lock.json` — npm-managed lockfile updated with tsx resolution + 4 transitive deps (5 packages added total).
- `vigil-g2-plugin/src/__tests__/smoke.test.ts` — Two-test smoke file: `1+1==2` runner check + `const x: number = 42` tsx-loader-compiles check. Header comment references the vigil-core analog.
- `vigil-g2-plugin/src/lib/__tests__/.gitkeep` — Placeholder (1-line comment) reserving the dir for Plan 06's sse-client tests.
- `vigil-g2-plugin/src/screens/__tests__/.gitkeep` — Placeholder reserving the dir for Plan 04 + Plan 07 (companion + home) tests.

## Decisions Made

- **tsx version pinned to `^4.19.0`** — read verbatim from `vigil-core/package.json:47` and copied exactly. Rationale: zero monorepo version drift, single supply-chain attestation surface, and the threat-model T-124-01-01 disposition (`accept`) is conditioned on "same version as vigil-core".
- **No tsconfig.json edit** — verified `include: ["src"]` already matches `src/**/*.test.ts`; touching tsconfig would have been a no-op risk against `verbatimModuleSyntax: true` and `erasableSyntaxOnly: true` strictness.
- **`.gitkeep` files carry one-line comments naming the downstream plan** — light cross-reference so Plan 06 / 07 / 04 / 08 owners don't need to re-derive directory intent.

## Deviations from Plan

None — plan executed exactly as written. All 6 acceptance criteria PASS, npm test exits 0 with `# pass 2`, no out-of-scope changes to plugin source.

## Issues Encountered

None. `npm install` reported 2 vulnerabilities (1 moderate, 1 high) in transitive deps — these existed pre-plan in `vigil-g2-plugin/package-lock.json` and are out of scope for a test-infra bootstrap. Logged for future maintenance pass; not a Phase 124 blocker.

## Self-Check: PASSED

- `vigil-g2-plugin/package.json` — `grep '"tsx":'` → FOUND (`"tsx": "^4.19.0",`)
- `vigil-g2-plugin/package.json` — `grep '"test": "tsx --test'` → FOUND
- `vigil-g2-plugin/node_modules/tsx/package.json` — exists
- `vigil-g2-plugin/src/__tests__/smoke.test.ts` — `grep 'import { test } from "node:test"'` → FOUND
- `vigil-g2-plugin/src/lib/__tests__/.gitkeep` — exists
- `vigil-g2-plugin/src/screens/__tests__/.gitkeep` — exists
- Commit `114b0aa` — present in `git log --oneline -5`

## User Setup Required

None — devDep change only. No environment variables, no external services, no dashboard configuration.

## Next Phase Readiness

- **Plan 02 (vigil-core agent-events-bus + emit hook)** — independent of this plan; runs in vigil-core, no plugin coupling.
- **Plan 03 (vigil-core agent-stream SSE route)** — independent; runs in vigil-core.
- **Plan 04 (G2 Companion screen + navigation)** — UNBLOCKED for screen tests at `src/screens/__tests__/companion.test.ts`.
- **Plan 06 (plugin SSE shim)** — UNBLOCKED for shim tests at `src/lib/__tests__/sse-client.test.ts`.
- **Plan 07 (G2-POLISH-07 home overflow trim)** — UNBLOCKED for home-screen tests at `src/screens/__tests__/home.test.ts`.
- **Plan 08 (onLaunchSource)** — UNBLOCKED for entry-point tests at `src/__tests__/launch-source.test.ts`.

No blockers. No concerns. Test runner is green; downstream plans can author tests immediately.

---
*Phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish*
*Completed: 2026-05-10*
