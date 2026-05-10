---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
plan: 08
subsystem: infra
tags: [ship-prep, version-bump, docs-amendments, seed-005, demo-cascade, evenhub-pack, tsconfig]

# Dependency graph
requires:
  - phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
    provides: bridge.onLaunchSource registration at main.ts:82 (SDK 0.0.8 API surface — drives min_sdk_version bump)
  - phase: 125-04
    provides: createDedupedDeviceStatusListener helper (no live consumer; ships under v0.3.0)
  - phase: 125-06
    provides: AGENT-HUD-03 plugin pipeline (Q glyph + quietMode allowlist filter) — folded into the packed vigil.ehpk
provides:
  - vigil.ehpk artifact at vigil-g2-plugin/vigil.ehpk (30564 bytes, v0.3.0, min_sdk 0.0.8) — Wave 4 hardware retest + Even Hub upload payload
  - Source-artifact wording reconciliation: REQUIREMENTS.md / ROADMAP.md / v3.8 spec / SEED-005 now match shipped reality (double-tap acknowledge; PWA→Core→SSE quiet-mode pipeline; documented exit gesture for G2-POLISH-05)
  - check-verified.mjs gate operational again (path bug from v3.5 archive move fixed)
  - tsconfig exclude for test files (unblocks `npm run build:prod` chain)
affects:
  - Plan 125-09 (Wave 4 hardware retest — consumes vigil.ehpk)
  - Plan 125-10 (Even Hub developer portal upload — consumes vigil.ehpk)
  - Plan 125-11 (operator portfolio demo recording — relies on amended demo wording)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-pack staleness gate (check-verified.mjs) is path-coupled to the v3.5 archive layout — when v3.x phases archive, the script's VERIFIED_PATH must be re-resolved"
    - "tsconfig.json exclude for test files: tests run via tsx (which ignores tsc); shipped build (Vite + tsc no-emit type check) skips them"
    - "Conditional min_sdk_version bump driven by grep evidence (Pitfall 6 + RESEARCH A1): bump only when a >=0.0.8 SDK API is invoked in src/"

key-files:
  created: []
  modified:
    - vigil-g2-plugin/scripts/check-verified.mjs (VERIFIED_PATH fixed)
    - .planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/VERIFIED.md (timestamp refreshed)
    - vigil-g2-plugin/app.json (version 0.3.0; min_sdk_version 0.0.8)
    - vigil-g2-plugin/tsconfig.json (exclude test files from tsc compile path)
    - .planning/REQUIREMENTS.md (AGENT-DEMO-01 + G2-POLISH-05 wording)
    - .planning/ROADMAP.md (Phase 125 SC #5 wording)
    - .planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md (Interaction + Quiet mode sections, lines 229-238)
    - .planning/seeds/SEED-005-g2-swipe-out-of-list-broken-on-hardware.md (appended 2026-05-10 SDK source-dive spike note)
    - .planning/phases/125-…/deferred-items.md (DEF-125-06-01 resolved; DEF-125-08-01 logged)
  generated:
    - vigil-g2-plugin/vigil.ehpk (30564 bytes — gitignored binary build output)

key-decisions:
  - "min_sdk_version bumped to 0.0.8: grep confirmed bridge.onLaunchSource invoked at src/main.ts:82 (added by Phase 124 D-07). Per RESEARCH A1, this API was added in SDK 0.0.8, so leaving min_sdk at 0.0.7 would silently fail to install on hosts with old SDKs."
  - "PROJECT.md amendment: NO-OP. v3.8 milestone block has no demo-tap reference (only generic 'G2 Companion HUD screen + tap interactions + Quiet mode + plugin v0.3.0 resubmit' bullet on line 161). No single-tap wording to amend."
  - "tsconfig.json: added exclude rather than installing @types/node. Rationale: tests are runtime artifacts run via tsx (which ignores tsconfig.exclude), not part of the shipped Vite build. Cleanest separation and zero new dependencies."

patterns-established:
  - "VERIFIED.md staleness gate path is brittle across milestone archives — when v3.x closes, anything that resolves into .planning/phases/<that-phase>/ needs to follow the file to .planning/milestones/<vX>-phases/<phase>/. Add as a milestone-close checklist item."
  - "Docs-amendment cascade pattern: when a requirement word changes (e.g., single-tap → double-tap), the planner identifies all source-artifact echo sites (REQUIREMENTS.md, ROADMAP.md, PROJECT.md, milestone spec) and amends in a single atomic commit with a positive + negative grep matrix in the verification block."
  - "Conditional min_sdk_version bump: grep the plugin src for SDK APIs newer than current min_sdk; bump only if matches. Don't bump speculatively."

requirements-completed: [G2-PLUGIN-01, G2-POLISH-05, AGENT-DEMO-01]

# Metrics
duration: 5min
completed: 2026-05-10
---

# Phase 125 Plan 08: Ship-prep + 5-doc amendments + vigil.ehpk pack Summary

**Three threads landed: check-verified.mjs path fix + VERIFIED.md refresh + app.json v0.3.0 / min_sdk 0.0.8 bumps; 5-doc amendment cascade (single-tap → double-tap, swipe → documented exit, SDK quiet-mode pipeline reality); vigil.ehpk v0.3.0 packed at 30564 bytes ready for Wave 4.**

## Performance

- **Duration:** ~5 min (excluding read-and-analyze)
- **Started:** 2026-05-10T18:41:03Z
- **Completed:** 2026-05-10T18:46:00Z
- **Tasks:** 3/3
- **Files modified:** 9 (3 build infra, 5 docs, 1 deferred-items log)
- **Files generated:** 1 (vigil.ehpk binary, gitignored)

## Accomplishments

- Pre-pack staleness gate operational again: `check-verified.mjs` now points at `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/VERIFIED.md` (the post-v3.5-archive location); VERIFIED.md `Verified:` ISO timestamp refreshed to `2026-05-10T12:41:16-06:00` (within 24h gate).
- Plugin manifest accurate against SDK API surface: `vigil-g2-plugin/app.json` version 0.2.0 → 0.3.0; `min_sdk_version` 0.0.7 → 0.0.8 (because Phase 124's `bridge.onLaunchSource` registration at `src/main.ts:82` requires SDK 0.0.8+ per RESEARCH A1).
- Source-artifact wording matches shipped reality across 5 files: REQUIREMENTS.md (AGENT-DEMO-01 + G2-POLISH-05), ROADMAP.md (Phase 125 SC #5), v3.8 spec (Interaction + Quiet mode), SEED-005 (SDK source-dive spike note appended).
- `vigil.ehpk` artifact (30564 bytes; > 1KB sanity check) produced via `npm run package:ehpk` — ready for Plan 09 hardware retest and Plan 10 Even Hub developer portal upload.

## Task Commits

1. **Task 1: Fix check-verified.mjs path + refresh VERIFIED.md timestamp + bump app.json version** — `6528730` (chore)
2. **Task 2: Cascade 5-doc amendments (single-tap → double-tap, swipe → documented exit, SDK quiet-mode pipeline)** — `3874977` (docs)
3. **Task 3: Pack vigil.ehpk v0.3.0 + tsconfig fix for build chain** — `c9c4b15` (chore)

## Files Created/Modified

- `vigil-g2-plugin/scripts/check-verified.mjs` — VERIFIED_PATH constant: added `'milestones'` and `'v3.5-phases'` path segments to follow the v3.5 archive layout
- `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/VERIFIED.md` — `Verified:` line timestamp refreshed (`2026-05-06T00:23:30Z` → `2026-05-10T12:41:16-06:00`)
- `vigil-g2-plugin/app.json` — `version: "0.3.0"` (D-11 step 1); `min_sdk_version: "0.0.8"` (RESEARCH A1)
- `vigil-g2-plugin/tsconfig.json` — added `"exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]` so `tsc` no longer trips on `node:test`/`node:assert` imports in test files
- `.planning/REQUIREMENTS.md` — AGENT-DEMO-01 line 44: `single-tap to acknowledge` → `double-tap to acknowledge`; G2-POLISH-05 line 48: full rewrite per D-06 fallback ("documented exit gesture (DOUBLE_CLICK → home) with on-screen hint; SDK SCROLL bubble limit acknowledged in SEED-005 follow-up")
- `.planning/ROADMAP.md` — Phase 125 SC #5 line 472: `single-tap to acknowledge` → `double-tap to acknowledge`
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` — §"Interaction" (lines 229-233) rewritten: double-tap context-sensitive (Phase 124 D-08); single-tap + long-press DEFERRED via SEED-011. §"Quiet mode" (lines 235-238) rewritten: PWA Settings toggle → Vigil Core → quiet_mode_changed SSE pipeline (Phase 125 D-01..D-04; SDK exposes no Focus API per @evenrealities/even_hub_sdk@0.0.9)
- `.planning/seeds/SEED-005-g2-swipe-out-of-list-broken-on-hardware.md` — appended `## 2026-05-10 SDK source-dive spike (Phase 125 / D-06)` section with negative finding, resolution, re-activation triggers, citation to 125-RESEARCH.md as the spike artifact
- `.planning/phases/125-…/deferred-items.md` — DEF-125-06-01 updated with "Resolved (Plan 125-08)" note; DEF-125-08-01 logged for pre-existing PWA Plan 07 leftovers (`vigil-pwa/src/api/client.ts` + `vigil-pwa/src/pages/SettingsPage.test.tsx` / `SettingsPage.tsx` — out of scope for Plan 08)
- **Generated (gitignored):** `vigil-g2-plugin/vigil.ehpk` — 30564 bytes, covered by `*.ehpk` in `vigil-g2-plugin/.gitignore`

## Decisions Made

1. **min_sdk_version 0.0.7 → 0.0.8 (conditional bump fired):** Grep confirmed `bridge.onLaunchSource` is invoked at `vigil-g2-plugin/src/main.ts:82` (Phase 124 D-07 module-scope registration) and referenced at `src/lib/launch-source-helpers.ts:6`. Per RESEARCH A1, this API was added in SDK 0.0.8. Leaving min_sdk at 0.0.7 would let users on the old SDK install a plugin that silently fails to register launch sources.
2. **PROJECT.md amendment NO-OP:** Per CONTEXT D-08, the amendment cascade target included PROJECT.md "v3.8 milestone target features." Inspected the v3.8 milestone block (starts at line 11; in-progress bullets at lines 158-162). The only Phase 125–related bullet on line 161 reads "G2 Companion HUD screen — new plugin screen with tap interactions, Quiet mode, plugin v0.3.0 resubmit (AGENT-HUD-\*, G2-PLUGIN-\* — v3.8)" — no demo-tap wording to amend. Recorded as no-op per the plan's acceptance criterion.
3. **tsconfig exclude vs install @types/node:** Plan 125-06's deferred-items log (DEF-125-06-01) proposed two future fixes for this same TS2307 failure (install `@types/node` OR add a `tsconfig.test.json`). I took a third path: exclude test files from tsc altogether. Tests are runtime artifacts driven by `tsx --test` (which ignores `tsconfig.exclude`), not part of the shipped Vite build. Zero new dependencies; cleanest separation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsconfig was failing the production build chain**

- **Found during:** Task 3 (Pack vigil.ehpk)
- **Issue:** `npm run package:ehpk` calls `npm run release` → `npm run build:prod` → `tsc && vite build --mode production`. `tsc` emits TS2307 for `node:test` / `node:assert/strict` / `node:fs` / `node:url` / `node:path` imports in every test file under `src/__tests__/`, `src/lib/__tests__/`, `src/screens/__tests__/`, plus TS7006 implicit-any on home.test.ts callback parameters. Pre-existing per DEF-125-06-01 — this is the first ship-prep run since 124+ test files landed.
- **Fix:** Added `"exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]` to `vigil-g2-plugin/tsconfig.json`. Tests still run via `tsx --test` (which ignores tsconfig.exclude); shipped build now type-checks production source only.
- **Files modified:** `vigil-g2-plugin/tsconfig.json`
- **Verification:** Plugin tests: 79/0/0. `npm run package:ehpk` succeeded end-to-end ("Successfully packed vigil.ehpk (30564 bytes)").
- **Committed in:** `c9c4b15` (Task 3 commit)
- **Updated:** `deferred-items.md` DEF-125-06-01 — added "Resolved (Plan 125-08)" note.

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking)
**Impact on plan:** Without the fix, Task 3 could not produce vigil.ehpk — the plan's headline deliverable. Resolution is one-line, applies to the v3.8 milestone's only shippable plugin, and removes a known item from the deferred-items log. No scope creep.

## Out-of-Scope Discoveries

**Logged to `deferred-items.md` as DEF-125-08-01, not fixed by Plan 08:**

Plan 125-07 PWA quiet-mode toggle work (`vigil-pwa/src/api/client.ts` + `vigil-pwa/src/pages/SettingsPage.test.tsx` + `vigil-pwa/src/pages/SettingsPage.tsx`) is present in the working tree as uncommitted changes. Plan 08 did not touch PWA code. Per gsd-executor SCOPE BOUNDARY, these belong to Plan 07's executor or summary to commit.

## Verification Matrix

### Positive greps (all should return ≥ 1)

| # | Substring | File | Count |
|---|-----------|------|-------|
| 1 | `double-tap to acknowledge` | `.planning/REQUIREMENTS.md` | 1 |
| 2 | `double-tap to acknowledge` | `.planning/ROADMAP.md` | 1 |
| 3 | `documented exit gesture` | `.planning/REQUIREMENTS.md` | 1 |
| 4 | `PWA Settings toggle` | `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` | 1 |
| 5 | `DEFERRED via SEED-011` | `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` | 1 |
| 6 | `SDK source-dive spike (Phase 125 / D-06)` | `.planning/seeds/SEED-005-g2-swipe-out-of-list-broken-on-hardware.md` | 1 |

### Negative greps (all should return 0)

| # | Substring | File | Count |
|---|-----------|------|-------|
| 1 | `single-tap to acknowledge` | `.planning/REQUIREMENTS.md` | 0 |
| 2 | `single-tap to acknowledge` | `.planning/ROADMAP.md` | 0 |
| 3 | `Honor iOS Focus state via Even SDK` | `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` | 0 |
| 4 | `Single tap on temple: acknowledge` | `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` | 0 |

### Build + gate evidence

- `check-verified.mjs` gate: `[package:ehpk] VERIFIED.md fresh (3m old). Proceeding.`
- `tsc && vite build --mode production`: `✓ 17 modules transformed. dist/assets/index-C4H7uvJc.js 74.32 kB │ gzip: 28.36 kB. ✓ built in 118ms.`
- `evenhub pack`: `Successfully packed vigil.ehpk (30564 bytes)`
- `vigil-g2-plugin/.gitignore` line covering `*.ehpk` confirmed (artifact will not be committed).
- Plugin tests: `tests 79, suites 0, pass 79, fail 0, cancelled 0, skipped 0, todo 0, duration_ms 1294`

## Issues Encountered

- Initial `npm run package:ehpk` run failed at the `tsc` step due to pre-existing TS errors in test files (DEF-125-06-01). Handled per Rule 3 deviation (see above). Single-line tsconfig fix; not a scope creep.

## TDD Gate Compliance

Plan type was `execute` (not `tdd`), so RED → GREEN → REFACTOR gate sequence does not apply. All three tasks were straightforward implement-and-verify with positive + negative grep matrices, file-existence assertions, and build-output evidence.

## Next Phase Readiness

- **Plan 125-09 (Wave 4 hardware retest — operator wallclock):** vigil.ehpk artifact ready at `vigil-g2-plugin/vigil.ehpk` (30564 bytes, v0.3.0, min_sdk 0.0.8). Sideload via `evenhub qr` for hardware retest of Companion HUD + Quiet-mode toggle + work-orders exit + home overflow regression + `needs_input` → ack flow per CONTEXT D-11 step 3.
- **Plan 125-10 (Even Hub developer portal upload — operator wallclock):** Same artifact; manual upload to dashboard + screenshot of acknowledgment.
- **Plan 125-11 (60s portfolio demo recording — operator wallclock):** Demo wording is now correct ("double-tap to acknowledge"); per D-09 + D-10 shot list, the recording is a single-take real-hardware capture.

## Self-Check: PASSED

**Files exist:**
- FOUND: `vigil-g2-plugin/vigil.ehpk` (30564 bytes)
- FOUND: `.planning/phases/125-…/125-08-SUMMARY.md` (this file)

**Commits exist:**
- FOUND: `6528730` (Task 1: ship-prep)
- FOUND: `3874977` (Task 2: docs amendments)
- FOUND: `c9c4b15` (Task 3: tsconfig + pack)

---
*Phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo*
*Completed: 2026-05-10*
