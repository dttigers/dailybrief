---
phase: 106-g2-store-resubmit-atomic
plan: 04
subsystem: g2
tags: [g2, screenshots, vite-env, demo-data, dead-code-elimination, import-meta-env]

requires:
  - phase: 106-01
    provides: atomic-gate scaffold (VERIFIED.md + check-verified.mjs); Plan 05 pack gate is downstream
provides:
  - VITE_SCREENSHOT_MODE env flag (opt-in) short-circuiting fetchBrief/fetchAffirmation/fetchSummary to deterministic demo data
  - DEMO_BRIEF / DEMO_AFFIRMATION / DEMO_SUMMARY constants with exact strings locked for reproducible PNGs
  - vite-env.d.ts narrowing ImportMetaEnv to VITE_API_URL + VITE_API_KEY + VITE_SCREENSHOT_MODE
  - .env.screenshot.example template (committed) with T8-leak-1 security warning; .env.screenshot gitignored
  - Dead-code-elimination proof: with flag unset, production bundle contains no DEMO_BRIEF symbol and none of the three task strings
affects: [106-05]

tech-stack:
  added: []
  patterns:
    - "Vite import.meta.env.VITE_* static-replacement + tree-shaking for demo-only code paths"
    - "ImportMetaEnv interface augmentation via src/vite-env.d.ts (no tsconfig edit required)"
    - "Opt-in screenshot mode via separate .env.screenshot file (not merged into .env.production)"

key-files:
  created:
    - vigil-g2-plugin/src/vite-env.d.ts
    - vigil-g2-plugin/.env.screenshot.example
  modified:
    - vigil-g2-plugin/src/api.ts
    - vigil-g2-plugin/.gitignore

key-decisions:
  - "Truthiness check `if (SCREENSHOT_MODE)` rather than `=== 'true'` — matches existing `VITE_API_KEY || ''` idiom and preserves Vite's DCE analysis"
  - "SCREENSHOT_MODE held in a module-scope `const` so Vite's static replacement folds each guard to a literal `if (undefined)` / `if ('1')` at build time, enabling tree-shaking of the entire demo branch (and the three DEMO_* constants) from production bundles"
  - "New `.env.screenshot` rule appended to `.gitignore` rather than relying on existing `*.local` (which does not match `.env.screenshot`)"
  - "Demo strings locked verbatim by planner: 'Follow up on PR-4827 review', 'Draft Q2 OKRs — start with team themes', 'Call plumber about kitchen sink', 'You are exactly where you need to be today.' — Plan 05 simulator run must reproduce these to match store listing copy"
  - ".env.production acceptance criterion (`! grep -q VITE_SCREENSHOT_MODE .env.production`) gates T8-leak-1 and is re-checked in Plan 05 runbook before every pack"

patterns-established:
  - "Opt-in env flag pattern for screenshot/demo surfaces: gate with `import.meta.env.VITE_*`, lock constants at module scope, verify DCE by grepping dist/"
  - "Env-file stratification: .env.production holds production-only keys; opt-in flags live in a distinct, gitignored file with a committed .example template"

requirements-completed: [G2-01]

duration: 3m
completed: 2026-04-20
---

# Phase 106 Plan 04: G2-01 VITE_SCREENSHOT_MODE demo-data short-circuit Summary

**Opt-in `VITE_SCREENSHOT_MODE` env flag with module-scope `const` + three DEMO_* constants short-circuits every api.ts fetch when set; Vite dead-code-eliminates the entire demo branch (and all three constants) from production bundles when the flag is unset — verified both directions via grep on dist/.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-20T17:42:00Z
- **Completed:** 2026-04-20T17:45:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `src/api.ts` reads `VITE_SCREENSHOT_MODE` at module scope, defines `DEMO_BRIEF`/`DEMO_AFFIRMATION`/`DEMO_SUMMARY` with the exact strings locked by the planner, and short-circuits all three fetch functions when the flag is truthy.
- `src/vite-env.d.ts` declares `ImportMetaEnv` with the three known `VITE_*` keys (merges with vite/client via TS interface merging; no tsconfig change).
- `.env.screenshot.example` committed with the security warning that demos must never ship; actual `.env.screenshot` gitignored via a new explicit rule.
- Dead-code elimination verified in both directions: flag unset → zero demo strings/symbols in prod bundle; `VITE_SCREENSHOT_MODE=1 vite build` → demo strings present.
- `.env.production` left untouched — T8-leak-1 mitigation upheld.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add VITE_SCREENSHOT_MODE guard + DEMO_* constants in src/api.ts** — `7ac33aa` (feat)
2. **Task 2: Create .env.screenshot.example template and ensure .env.screenshot is gitignored** — `38511d0` (chore)

## Files Created/Modified

- `vigil-g2-plugin/src/api.ts` — module-scope `SCREENSHOT_MODE` const, three DEMO_* constants, `if (SCREENSHOT_MODE) return DEMO_*` guard at the top of every fetch function; existing EMPTY_SUMMARY/EMPTY_BRIEF/FALLBACK_AFFIRMATION + try/catch fallback path preserved intact
- `vigil-g2-plugin/src/vite-env.d.ts` (new) — `/// <reference types="vite/client" />` + interface merge declaring the three VITE_* keys
- `vigil-g2-plugin/.env.screenshot.example` (new) — committed template with `VITE_SCREENSHOT_MODE=1` and T8-leak-1 security warning
- `vigil-g2-plugin/.gitignore` — appended explicit `.env.screenshot` rule

## Exact Demo Values (Locked for Plan 05 Reproducibility)

**DEMO_BRIEF:**
- date: `'2026-04-19'`
- counts: `{ total: 12, byCategory: {}, tasksByStatus: { open: 3 }, favorites: 0, unprocessed: 0 }`
- openTasks (3 entries, ids 1–3, all `taskStatus: 'open'`, `createdAt` 09:00Z/10:00Z/11:00Z):
  1. `'Follow up on PR-4827 review'`
  2. `'Draft Q2 OKRs — start with team themes'`
  3. `'Call plumber about kitchen sink'`
- todayCaptures: `7`

**DEMO_AFFIRMATION:**
- affirmation: `'You are exactly where you need to be today.'`

**DEMO_SUMMARY:**
- total: `12`, tasksByStatus: `{ open: 3 }`
- recent: 1 entry mirroring the top openTask (`'Follow up on PR-4827 review'`, category `'task'`, source `'manual'`) so the home "TOP PRIORITY" row aligns with the brief

## Decisions Made

- Kept truthiness `if (SCREENSHOT_MODE)` — consistent with the existing `VITE_API_KEY || ''` idiom and avoids the type-narrowing trap of `=== 'true'` on a Vite-replaced string literal.
- `SCREENSHOT_MODE` declared as a module-scope `const` so Vite's static-replacement + tree-shaker can flatten each guard and drop every DEMO_* constant from production bundles.
- Added explicit `.env.screenshot` rule to `.gitignore`; the pre-existing `*.local` does not cover that filename.
- Did not add a gitignore rule for `.env.screenshot.example` — the example is the template and must commit.

## Deviations from Plan

None — plan executed exactly as written.

## Dead-Code-Elimination Proof (T8-leak-1 Verification)

**Negative (flag unset, production build):**
```
$ cd vigil-g2-plugin && npm run build:prod
$ ! grep -q 'Follow up on PR-4827 review' dist/assets/*.js   # → exit 0
$ ! grep -q 'Draft Q2 OKRs' dist/assets/*.js                  # → exit 0
$ ! grep -q 'Call plumber about kitchen sink' dist/assets/*.js # → exit 0
$ ! grep -q 'You are exactly where you need to be today' dist/assets/*.js # → exit 0
$ ! grep -q 'DEMO_BRIEF' dist/assets/*.js                     # → exit 0
```

**Positive (flag set, production build):**
```
$ VITE_SCREENSHOT_MODE=1 npx vite build --mode production --outDir dist-screenshot
$ grep -q 'Follow up on PR-4827 review' dist-screenshot/assets/*.js # → exit 0
$ grep -q 'You are exactly where you need to be today' dist-screenshot/assets/*.js # → exit 0
```

**.env.production check:**
```
$ grep VITE_SCREENSHOT_MODE vigil-g2-plugin/.env.production
(no output — exit 1)
$ cat vigil-g2-plugin/.env.production
VITE_API_URL=https://api.vigilhub.io/v1
VITE_API_KEY=vk_...
```

## Issues Encountered

None.

## Plan 05 Runbook Recommendation

Before running the Even simulator session for PNG capture, Plan 05 should:
```bash
cd vigil-g2-plugin
cp .env.screenshot.example .env.screenshot
export $(grep -v '^#' .env.screenshot | xargs)
npm run dev   # or: npm run build && serve dist/
```
And immediately **before pack**, re-verify the leak guard:
```bash
! grep -q 'VITE_SCREENSHOT_MODE' .env.production
```
This is already part of the atomic gate in Plan 01 / Plan 05 but worth restating here — the flag being present in `.env.production` at pack time is the single failure mode for T8-leak-1.

## Next Phase Readiness

- G2-01 code side complete. Plan 05 can now run the simulator in flag-on mode and produce reproducible PNGs matching the locked demo strings.
- T8-leak-1 mitigated: `.env.production` remains two lines (`VITE_API_URL`, `VITE_API_KEY`); no new key was introduced to the production env. Vite-static-replacement + DCE verified both directions.
- Wave 1 is now fully complete for Phase 106 (102, 103, 104). Only Plan 05 (simulator capture + atomic gate flip) remains.

## Self-Check: PASSED

- `vigil-g2-plugin/src/api.ts` — FOUND (modified)
- `vigil-g2-plugin/src/vite-env.d.ts` — FOUND (created)
- `vigil-g2-plugin/.env.screenshot.example` — FOUND (created)
- `vigil-g2-plugin/.gitignore` — FOUND (modified — `.env.screenshot` appended)
- Commit `7ac33aa` (Task 1) — FOUND
- Commit `38511d0` (Task 2) — FOUND

---
*Phase: 106-g2-store-resubmit-atomic*
*Plan: 04*
*Completed: 2026-04-20*
