---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
plan: 06
subsystem: vigil-g2-plugin
tags: [phase-125, wave-2, plugin, sse, companion, hud, q-glyph]
requirements: [AGENT-HUD-03]
dependency_graph:
  requires:
    - "125-01 (Wave 0 RED placeholders at sse-client.test.ts + companion.test.ts)"
  provides:
    - "vigil-g2-plugin sse-client.ts dispatches quiet_mode_changed -> opts.onQuietMode"
    - "vigil-g2-plugin companion.ts exports setQuietMode/isQuietMode + Q glyph + ALLOWLIST filter"
    - "vigil-g2-plugin main.ts onQuietMode callback wired (Q glyph appears/disappears ~100ms after PWA toggle)"
    - "Plan 01 PLAN_06_SSE + PLAN_06_COMP placeholders GREEN (3 + 7 tests)"
  affects:
    - "Plan 125-09 (hardware retest) — exercises this plugin-side pipeline against real G2"
    - "AGENT-HUD-03 plugin-side closes; server-side closure pending Plan 03 (suppression queue) + Plan 05 (route)"
tech_stack:
  added: []
  patterns:
    - "Strict-superset extension of existing dispatch loop (Phase 124 agent-event/ping branches unchanged)"
    - "Module-level quiet-mode ref alongside existing sseConnected/bannerState (work-orders.ts:14-20 precedent)"
    - "Defense-in-depth HUD-write filter (server suppression is primary; this is belt-and-braces for the D-03 synthetic-frame race window)"
    - "Idempotent mutator (setQuietMode same-value-twice is no-op)"
key_files:
  created: []
  modified:
    - "vigil-g2-plugin/src/lib/sse-client.ts (+13 LOC: onQuietMode field + dispatch branch)"
    - "vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts (3 placeholders -> GREEN; 16 pass / 0 skipped)"
    - "vigil-g2-plugin/src/screens/companion.ts (+46/-2 LOC: quietMode ref + ALLOWLIST + setQuietMode/isQuietMode exports + Q glyph + filter)"
    - "vigil-g2-plugin/src/screens/__tests__/companion.test.ts (7 placeholders -> GREEN; 33 pass / 0 skipped)"
    - "vigil-g2-plugin/src/main.ts (+22 LOC: onQuietMode SSE callback wired)"
    - ".planning/phases/125-…/deferred-items.md (DEF-125-06-01 pre-existing tsconfig gap logged)"
decisions:
  - "Used QUIET_BANNER_ALLOWLIST (BannerType-typed Set) over QUIET_ALLOWLIST (AgentEventType) — the filter site is the banner-overlay branch where the cached state is BannerType, so typing matches the actual check"
  - "Filter site is computeBodyLines() (HUD-write boundary, after hasActiveBanner() resolves) — NOT applyAgentEvent, per CONTEXT D-02 strict requirement (cache must always update so cycling sessions shows accurate state)"
  - "Added a 7th Task 2 test (REBUILD) on top of the 6 enumerated behaviors — explicitly verifies computeRightSide() is read on every buildContainers() invocation (no stale-cached header path)"
  - "_resetState() now zeros quietMode — prevents cross-test pollution that would surface a Q glyph in Phase 124 baseline tests when companion.test.ts test execution order leaks state"
metrics:
  duration: "~38 minutes wall (context-load + 3 task commits + verify + summary)"
  completed: "2026-05-10"
  tasks_completed: 3
  tests_added: 10  # 3 sse-client + 7 companion (all turning W0 placeholders GREEN)
  loc_delta_total: "+81 / -2"
  files_changed: 5
  commits: [1357a31, 7882965, 2bb5f7c]
---

# Phase 125 Plan 06: Plugin-side quiet_mode_changed pipeline + Q glyph + HUD-write filter Summary

**One-liner:** Wired the plugin half of AGENT-HUD-03 end-to-end — SSE shim dispatches the new `quiet_mode_changed` event type, Companion screen tracks module-level `quietMode` state and prepends a `Q` glyph to the header rightSide as a strict superset of Phase 124's offline+N/M priority, with a defense-in-depth HUD-write filter that suppresses non-allowlist banner overlays when quiet is on; main.ts glues the SSE callback to `setQuietMode` + Companion rebuild so the glyph appears within ~100ms of a PWA toggle.

## Tasks Completed

### Task 1 — SSE shim quiet_mode_changed dispatch (commit `1357a31`)

**LOC delta:** `vigil-g2-plugin/src/lib/sse-client.ts` +13 / -0
**Test delta:** `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts` 3 PLAN_06_SSE placeholders → 3 GREEN tests

**Implementation:**
- Added `onQuietMode?: (data: string) => void` to `SseClientOptions` after `onEvent`. Backward-compatible — Phase 124 callers (no quiet-mode awareness) still compile because the property is optional.
- Added `else if (parsed.event === "quiet_mode_changed")` branch in the parseFrame dispatch loop (after the existing `agent-event` branch, before the implicit fall-through). The branch forwards the raw `parsed.data` JSON string to `opts.onQuietMode?` — JSON parsing is the caller's responsibility (per CONTEXT D-02 trust-boundary contract).
- Existing `agent-event` and `ping` branches verbatim — Phase 124 invariants preserved.

**Tests:**
- **DISPATCH:** A scripted `event: quiet_mode_changed\ndata: {"enabled":true,"since":"..."}\n\n` frame invokes `opts.onQuietMode` exactly once with the raw JSON string.
- **OPTIONAL:** Construct client WITHOUT `onQuietMode`; emit quiet_mode_changed + agent-event frames; assert no throw, loop continues, subsequent agent-event still fires onEvent.
- **NO-STEAL:** Interleaved agent-event + quiet_mode_changed frames — assert each callback fires exactly its expected count (`events.length === 2`, `quiet.length === 2`), no path starves the other.

**Test pass count after Task 1:** sse-client.test.ts — 16 pass / 0 fail / 0 skipped (was 13 pass + 3 skipped).

### Task 2 — Companion quietMode state + Q glyph + ALLOWLIST filter (commit `7882965`)

**LOC delta:** `vigil-g2-plugin/src/screens/companion.ts` +46 / -2
**Test delta:** `vigil-g2-plugin/src/screens/__tests__/companion.test.ts` 7 PLAN_06_COMP placeholders → 7 GREEN tests

**Implementation:**
- Module-level `let quietMode = false` alongside existing `sseConnected`/`bannerState`.
- Module-level `const QUIET_BANNER_ALLOWLIST = new Set<BannerType>(['needs_input', 'task_failed'])` — D-04 hard-locked.
- `export function setQuietMode(next: boolean): void` — idempotent mutator, invoked by main.ts when SSE delivers quiet_mode_changed.
- `export function isQuietMode(): boolean` — getter for tests.
- `computeRightSide()` updated to `[quiet, offline, sessions].filter(Boolean).join(' ')` where `quiet = quietMode ? 'Q' : ''`. **Strict superset of Phase 124** — quiet=false path returns identical output (D-14 byte-identity invariant preserved).
- `computeBodyLines()` banner-overlay branch now consults `QUIET_BANNER_ALLOWLIST` — when `quietMode === true` and the cached banner type is NOT in the allowlist, the overlay is suppressed (the body falls back to the normal 3-line render via the not-banner code path).
- `_resetState()` now zeros `quietMode` — prevents cross-test pollution.

**Tests (7 GREEN):**
- **MUTATOR (×2):** `setQuietMode(true)` → `isQuietMode()` true; full cycle (default false → true → false).
- **Q PREPEND:** `setQuietMode(true)`, sseConnected=true, single session → rightSide trailing glyph is exactly `Q`.
- **Q + ALL:** `setQuietMode(true) + setSseConnected(false) + 3 sessions + cycleSession()` → rightSide matches `/Q\s+!\s+2\/3/` (UI-SPEC table row 1).
- **Q OFF BASELINE:** `setQuietMode(false)` → rightSide contains no `Q` (Phase 124 path preserved).
- **ALLOWLIST PASSES:** `setQuietMode(true)` + dispatch needs_input → body line 1 still `[NEEDS INPUT]`.
- **NON-ALLOWLIST SUPPRESSED:** `setQuietMode(true)` + dispatch task_complete → `hasActiveBanner()` still true (cache layer unchanged per D-02) but body line 1 is NOT `[DONE]` (HUD-write filter suppresses).
- **REBUILD:** rebuild before `setQuietMode(true)` has no Q; same rebuild after has Q — verifies computeRightSide() is read on every buildContainers() invocation.

**Test pass count after Task 2:** companion.test.ts — 33 pass / 0 fail / 0 skipped (was 26 + 7 placeholders).

### Task 3 — main.ts onQuietMode → setQuietMode + Companion rebuild (commit `2bb5f7c`)

**LOC delta:** `vigil-g2-plugin/src/main.ts` +22 / -0

**Implementation:**
- Added `setQuietMode` to the existing `screens/companion.ts` import.
- Added `onQuietMode` callback to the existing `createSseClient(opts)` literal. The callback:
  1. `JSON.parse(data)` typed as `{ enabled: boolean; since: string | null }`.
  2. `setQuietMode(parsed.enabled)` propagates the boolean to companion's module ref.
  3. If `bridge && getCurrentScreen() === Screen.COMPANION`, void `rebuildCurrentScreen(bridge)` so the Q glyph appears/disappears within ~100ms.
  4. Malformed JSON → `console.error` + continue (no crash). `setQuietMode` is NOT called on bad payload (threat T-125-W6-02 mitigation).
- Phase 124 D-07 module-scope `bridgeInstance.onLaunchSource` registration UNTOUCHED — verified by `grep -c '.onLaunchSource(' = 1` before and after this task.

**Test pass count after Task 3:** Full vigil-g2-plugin suite — 79 pass / 0 fail / 0 skipped.

## Test-Suite Results

### vigil-g2-plugin full suite (`cd vigil-g2-plugin && npm test`)

```
ℹ tests 79
ℹ suites 0
ℹ pass 79
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~970
```

**Pre-baseline (per 125-01-SUMMARY.md):** 78 tests / 65 pass / 0 fail / 13 skipped.
**Delta:** 10 of 13 W0 skipped placeholders for this plan (PLAN_06_SSE × 3 + PLAN_06_COMP × 7) turned GREEN; +1 new test (Task 2 behavior 7 REBUILD) added on top of the enumerated 6 behaviors. Pre-existing 65 still pass; 0 new failures.
**Remaining skipped tests in the plugin suite:** 0 — all Plan 06 deferred placeholders closed; 3 deduped-device-status placeholders closed by Plan 04 in an earlier wave.

### Plugin type-check (`tsc --noEmit -p tsconfig.json`)

- **Non-test source:** clean exit 0 (no errors in `src/lib/*.ts`, `src/screens/*.ts`, `src/main.ts`).
- **Test files:** 15 pre-existing TS2307 errors for `node:test` / `node:assert/strict` imports — logged as DEF-125-06-01 in deferred-items.md. Pre-existing (verified by stash + tsc against pre-Plan-06 main tip). Application code (deliverable surface) is clean.

## Verification Block Pass

All `<verification>` grep commands from the plan return matches:

| Check | Result |
|-------|--------|
| `grep "parsed.event === \"quiet_mode_changed\"" vigil-g2-plugin/src/lib/sse-client.ts` | 1 match (dispatch branch present) |
| `grep "setQuietMode" vigil-g2-plugin/src/screens/companion.ts` | 5 matches (3 declarations + 2 doc-comments) |
| `grep "let quietMode = false" vigil-g2-plugin/src/screens/companion.ts` | 1 match |
| `grep "const quiet = quietMode ? 'Q' : ''" vigil-g2-plugin/src/screens/companion.ts` | 1 match |
| `grep "onQuietMode:" vigil-g2-plugin/src/main.ts` | 1 match |
| `cd vigil-g2-plugin && npm test` | exit 0 (79/79 pass) |
| `bridge.onLaunchSource` count invariant (must be 1) | 1 ✓ (Phase 124 D-07 untouched) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] _resetState() did not zero quietMode**

- **Found during:** Task 2 — when writing the "Q OFF BASELINE" test (behavior 4),
  realized that without `quietMode = false` inside `_resetState()`, cross-test
  pollution could leak a true value from an earlier test into a Phase 124
  baseline assertion. The plan's behaviors didn't explicitly call this out but
  the existing test pattern (every test starts with `_resetState()`) implicitly
  requires it.
- **Issue:** Test isolation gap — Phase 124 D-14 byte-identity invariant test
  could silently fail if test execution order changed.
- **Fix:** Added `quietMode = false` to `_resetState()` alongside the other
  module-state resets.
- **Files modified:** `vigil-g2-plugin/src/screens/companion.ts` (lines inside `_resetState()`).
- **Commit:** `7882965` (same as Task 2).

### Deferred Items

**DEF-125-06-01** logged in `.planning/phases/125-…/deferred-items.md` — pre-existing
`vigil-g2-plugin/tsconfig.json` gap (no `@types/node` declared; tests import
`node:test` modules that tsc can't resolve). Application code compiles cleanly;
`tsx --test` runtime is unaffected. Out of scope for AGENT-HUD-03 substantive work.

## Authentication Gates

None encountered. Plan 06 is plugin-only (no network, DB, or service auth).

## Threat Model Application

| Threat ID | Status | Mitigation Applied |
|-----------|--------|---------------------|
| T-125-W6-01 (Information Disclosure: "since" timestamp) | accepted as planned | Plugin trusts server for all event payloads; "since" reveals only what the user themselves toggled |
| T-125-W6-02 (Denial of Service: malformed JSON crashes plugin) | mitigated | main.ts wraps `JSON.parse` in `try/catch`; logs `console.error` and continues; `setQuietMode` is NOT called on bad payload (last-known-good state preserved) |
| T-125-04 (Information Disclosure: filter not at HUD-write) | mitigated | Filter is at `computeBodyLines()` banner-overlay branch (HUD-write boundary), NOT at `applyAgentEvent`. Cache always updates so cycling sessions shows accurate state per CONTEXT D-02 |

## Phase 124 Invariants Preserved

- **D-07 module-scope `bridge.onLaunchSource` registration:** Untouched. `grep -c '.onLaunchSource(' vigil-g2-plugin/src/main.ts` returns 1 (same as pre-Task-3).
- **D-14 byte-identity screenshot gate:** Untouched. quiet=false path in `computeRightSide()` returns identical output to Phase 124 (strict superset construction).
- **Banner state machine:** Untouched. `applyAgentEvent`, `hydrateActiveSessions`, `cycleSession`, `ackBanner`, `hasActiveBanner`, `_getBannerState` all unchanged. Filter is purely a render-time guard at `computeBodyLines()`.
- **All 26 Phase 124 companion.test.ts tests:** Still pass green.
- **All 13 Phase 124 sse-client.test.ts tests:** Still pass green.

## Self-Check: PASSED

- File `vigil-g2-plugin/src/lib/sse-client.ts`: FOUND (modified, +13 LOC)
- File `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts`: FOUND (3 placeholders → GREEN)
- File `vigil-g2-plugin/src/screens/companion.ts`: FOUND (modified, +46/-2 LOC)
- File `vigil-g2-plugin/src/screens/__tests__/companion.test.ts`: FOUND (7 placeholders → GREEN)
- File `vigil-g2-plugin/src/main.ts`: FOUND (modified, +22 LOC)
- File `.planning/phases/125-…/deferred-items.md`: FOUND (DEF-125-06-01 appended)
- Commit `1357a31` (Task 1): FOUND in `git log --oneline`
- Commit `7882965` (Task 2): FOUND in `git log --oneline`
- Commit `2bb5f7c` (Task 3): FOUND in `git log --oneline`
- vigil-g2-plugin full suite: exit 0 (79 pass / 0 fail / 0 skipped)
- Plan 01 PLAN_06_SSE placeholders: 0 remaining (grep -c returns 0)
- Plan 01 PLAN_06_COMP placeholders: 0 remaining (grep -c returns 0)
- Phase 124 D-07 invariant: `bridge.onLaunchSource` count = 1 (unchanged)
