---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
plan: 01
subsystem: test-infra
tags: [phase-125, wave-0, test-infra, nyquist, red-placeholders]
requirements: [AGENT-HUD-03, G2-POLISH-08]
dependency_graph:
  requires: []
  provides:
    - "vigil-core/src/routes/quiet-mode.test.ts (RED → Plan 05 turns green)"
    - "vigil-core/src/lib/quiet-mode-suppression.test.ts (RED → Plan 03 turns green)"
    - "vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts (RED → Plan 04 turns green)"
    - "Extended placeholders in agent-events-bus.test.ts (PLAN_03_BUS → Plan 03)"
    - "Extended placeholders in agent-stream.test.ts (PLAN_05_STREAM → Plan 05)"
    - "Extended placeholders in sse-client.test.ts (PLAN_06_SSE → Plan 06)"
    - "Extended placeholders in companion.test.ts (PLAN_06_COMP → Plan 06)"
  affects:
    - "Plans 02-07 unblocked — every Wave 1+ <verify><automated> block now points at an existing file"
tech_stack:
  added: []
  patterns:
    - "node:test skip-with-reason placeholder pattern: { skip: PLAN_XX } where PLAN_XX is a TODO(125-XX) string"
    - "Append-only extension of existing test files (zero deletions invariant)"
key_files:
  created:
    - "vigil-core/src/routes/quiet-mode.test.ts"
    - "vigil-core/src/lib/quiet-mode-suppression.test.ts"
    - "vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts"
  modified:
    - "vigil-core/src/lib/__tests__/agent-events-bus.test.ts (+33 lines, append-only)"
    - "vigil-core/src/routes/__tests__/agent-stream.test.ts (+44 lines, append-only)"
    - "vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts (+30 lines, append-only)"
    - "vigil-g2-plugin/src/screens/__tests__/companion.test.ts (+57 lines, append-only)"
decisions:
  - "Used { skip: 'TODO(125-XX): ...' } over { todo: ... } per plan interface guidance D-04 readability — appears in test output explicitly"
  - "Imported test/assert only at top of NEW files; reused existing imports in EXTENDED files (no duplicate imports)"
metrics:
  duration: "~22 minutes wall (planning context-load + write + verify + commit)"
  completed: "2026-05-10"
  tasks_completed: 2
  tests_added: 31  # 7 quiet-mode + 8 suppression + 3 deduped + 4 bus + 5 stream + 3 sse + 7 companion = 37 (placed 7 redundancy)
  tests_added_actual: 37
  files_changed: 7
---

# Phase 125 Plan 01: Wave-0 RED test scaffolds Summary

**One-liner:** Bootstrapped 8 Wave-0 test files (3 NEW + 4 EXTENDED) with 37 RED skip-placeholders that pin every Wave 1+ implementation contract referenced by 125-VALIDATION.md, unblocking Plans 02-07 to land verify-pointing implementations against existing test files.

## Tasks Completed

### Task 1 — Create 3 NEW Wave-0 RED test files

**Commit:** `7904dd3`
**Files created:**
- `vigil-core/src/routes/quiet-mode.test.ts` — 7 skipped tests (PLAN_05 / TODO(125-05)) pinning AGENT-HUD-03 endpoint contract
- `vigil-core/src/lib/quiet-mode-suppression.test.ts` — 8 skipped tests (TODO(125-03)) pinning suppression queue shape, allowlist, flush ordering, cross-user isolation, replay-storm DoS bound
- `vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts` — 3 skipped tests (TODO(125-04)) pinning G2-POLISH-08 helper

Each test() carries a `{ skip: 'TODO(125-XX): pending implementation in Plan XX' }` reason so the runner counts them as skipped (NOT failing). Test bodies use `assert.fail("placeholder")` guarded by skip — Wave 1+ plans replace `{ skip: PLAN_XX }` with green implementations and replace the placeholder with the asserted body.

**Per-acceptance grep counts:**
- `TODO(125-05)` in quiet-mode.test.ts: **8** (acceptance: ≥ 7) ✓
- `TODO(125-03)` in quiet-mode-suppression.test.ts: **9** (acceptance: ≥ 8) ✓
- `TODO(125-04)` in deduped-device-status.test.ts: **4** (acceptance: ≥ 3) ✓

### Task 2 — EXTEND 4 existing test files with Wave-0 RED placeholders

**Commit:** `bafa4e3`
**Files modified (append-only, zero deletions):**

| File | +Lines | -Lines | Tests added | Constant ref |
|------|--------|--------|-------------|--------------|
| vigil-core/src/lib/__tests__/agent-events-bus.test.ts | 33 | 0 | 4 | PLAN_03_BUS |
| vigil-core/src/routes/__tests__/agent-stream.test.ts | 44 | 0 | 5 | PLAN_05_STREAM |
| vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts | 30 | 0 | 3 | PLAN_06_SSE |
| vigil-g2-plugin/src/screens/__tests__/companion.test.ts | 57 | 0 | 7 | PLAN_06_COMP |

**Per-acceptance grep counts:**
- `PLAN_03_BUS`: **6** (acceptance: ≥ 4) ✓
- `PLAN_05_STREAM`: **7** (acceptance: ≥ 5) ✓
- `PLAN_06_SSE`: **5** (acceptance: ≥ 3) ✓
- `PLAN_06_COMP`: **9** (acceptance: ≥ 7) ✓
- `TODO(125-03_BUS)` literal: **0** (acceptance: 0; constant uses underscore-suffix) ✓

**Threat T-125-W0-01 (Tampering of existing tests) — mitigated:** `git diff --numstat` shows 4 files with N additions and **0 deletions** each. Confirmed pre-existing tests still pass via per-file targeted runs (agent-events-bus.test.ts: pass 6, fail 0; agent-stream.test.ts: pass 7, fail 0).

## Test-Suite Results

### vigil-core full suite (`cd vigil-core && npm test`)

```
ℹ tests 543
ℹ suites 35
ℹ pass 434
ℹ fail 0
ℹ cancelled 0
ℹ skipped 109
ℹ todo 0
ℹ duration_ms 53363
```

**Exit code:** 0 ✓
**Pre-baseline:** 519 tests / 434 pass / 0 fail / 85 skipped
**Delta:** +24 new tests, all skipped (8 quiet-mode + 7 suppression + 4 bus + 5 stream); pre-existing 434 still pass; 0 new failures.

### vigil-g2-plugin full suite (`cd vigil-g2-plugin && npm test`)

```
ℹ tests 78
ℹ suites 0
ℹ pass 65
ℹ fail 0
ℹ cancelled 0
ℹ skipped 13
ℹ todo 0
ℹ duration_ms 847
```

**Exit code:** 0 ✓
**Pre-baseline:** 65 tests / 65 pass / 0 fail / 0 skipped
**Delta:** +13 new tests, all skipped (3 deduped + 3 sse + 7 companion); pre-existing 65 still pass; 0 new failures.

## Wave-0 File Coverage Map

| File | Status | Pinned by | Plan turns green |
|------|--------|-----------|------------------|
| vigil-core/src/routes/quiet-mode.test.ts | NEW (7 skip) | AGENT-HUD-03 endpoint contract | Plan 05 |
| vigil-core/src/lib/quiet-mode-suppression.test.ts | NEW (8 skip) | AGENT-HUD-03 suppression queue | Plan 03 |
| vigil-core/src/lib/__tests__/agent-events-bus.test.ts | EXTEND (+4 skip) | bus.emitQuiet/onQuiet/offQuiet | Plan 03 |
| vigil-core/src/routes/__tests__/agent-stream.test.ts | EXTEND (+5 skip) | Phase 0 synthetic + suppression filter | Plan 05 |
| vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts | NEW (3 skip) | G2-POLISH-08 helper | Plan 04 |
| vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts | EXTEND (+3 skip) | quiet_mode_changed dispatch | Plan 06 |
| vigil-g2-plugin/src/screens/__tests__/companion.test.ts | EXTEND (+7 skip) | setQuietMode + Q glyph + filter | Plan 06 |

8th W0 item (VERIFIED.md timestamp refresh) intentionally NOT in this plan — it's a Wave 3 ship-prep responsibility (Plan 08) because the timestamp must be < 24h fresh AT pack time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Skipped `requirements.mark-complete [AGENT-HUD-03, G2-POLISH-08]`**

- **Found during:** State-update phase after Task 2.
- **Issue:** The executor contract instructs marking requirements complete from the plan frontmatter; plan 125-01 frontmatter declares `requirements: [AGENT-HUD-03, G2-POLISH-08]`. But Wave-0 RED placeholders do NOT satisfy these requirements — they pin the contracts that Wave 1+ implementations (Plans 03/04/05/06) close.
- **Fix:** Did not run `gsd-sdk query requirements mark-complete AGENT-HUD-03 G2-POLISH-08`. Plan 04 closes G2-POLISH-08 (deduped helper implementation); Plans 03+05+06 collectively close AGENT-HUD-03 (suppression queue + endpoint + plugin filter). Marking these complete on Wave-0 would generate false-green REQUIREMENTS.md state.
- **Files modified:** None (action skipped intentionally).
- **Commit:** N/A (deviation is the absence of an action).
- **Per scope-boundary policy:** This is an in-scope correctness call — the plan frontmatter `requirements:` field declares which requirements the plan TOUCHES (test-scaffold lock); the gsd-executor contract assumes touched=closed. For Wave-0 RED plans the correct semantic is "scaffolded, not closed". A future improvement could add a `requirements_scaffolded:` vs `requirements_closed:` distinction in plan frontmatter, but that is out of scope for this plan.

The plan was otherwise atomic and well-specified. No bugs surfaced (Rule 1), no missing critical functionality (Rule 2), no blocking issues (Rule 3), no architectural changes (Rule 4). Wave-0 RED state is by design — the placeholder bodies (`assert.fail("placeholder")`) are guarded by `{ skip: ... }` so they never execute; Wave 1+ implementations replace skip + body in lockstep with a real assertion.

### Note on full-suite runtime

A pre-existing slow test (`src/integration/cross-user-isolation.test.ts`) was observed during baseline measurement. It does not cause failure (suite still exits 0) but a single sustained run measured ~15min in one earlier invocation (other invocations completed in 53s). Out of scope for this plan; logged as a deferred-items observation if it surfaces again. Targeted-file runs (used for Task 2 append verification) avoided it via direct `npx tsx --test <file...>` invocation.

## Authentication Gates

None encountered. Wave-0 is test-infra-only — no network, DB, or service interactions.

## Self-Check: PASSED

- File `vigil-core/src/routes/quiet-mode.test.ts`: FOUND
- File `vigil-core/src/lib/quiet-mode-suppression.test.ts`: FOUND
- File `vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts`: FOUND
- File `vigil-core/src/lib/__tests__/agent-events-bus.test.ts`: FOUND (+33 lines append)
- File `vigil-core/src/routes/__tests__/agent-stream.test.ts`: FOUND (+44 lines append)
- File `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts`: FOUND (+30 lines append)
- File `vigil-g2-plugin/src/screens/__tests__/companion.test.ts`: FOUND (+57 lines append)
- Commit `7904dd3` (Task 1, 3 NEW files): FOUND in `git log --oneline`
- Commit `bafa4e3` (Task 2, 4 EXTEND files): FOUND in `git log --oneline`
- vigil-core full suite: exit 0 (543 tests / 434 pass / 0 fail / 109 skipped)
- vigil-g2-plugin full suite: exit 0 (78 tests / 65 pass / 0 fail / 13 skipped)
- Append-only invariant: 4/4 EXTENDED files have 0 deletions per `git diff --numstat`
