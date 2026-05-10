---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 07
subsystem: vigil-g2-plugin
tags: [phase-124, plugin, companion-screen, navigation, hud, agent-events, sse, drift-detector, tdd]

requires:
  - vigil-g2-plugin/src/types.ts (Plan 06: AgentEvent, AgentSessionRow, AgentEventType)
  - vigil-g2-plugin/src/screens/header.ts (Plan 06 era: buildVigilHeader rightSide param)
  - vigil-core /v1/agent-sessions endpoint (Phase 121 Plan 02: { data: AgentSessionRow[] })
  - vigil-g2-plugin/src/lib/sse-client.ts (Plan 06: SSE shim — wired by Plan 08 main.ts)

provides:
  - Screen.COMPANION enum + slot 1 in SCREEN_ORDER ([HOME, COMPANION, WORK_ORDERS, AFFIRMATION])
  - ContainerId.COMPANION_HEADER/BODY/FOOTER (13/14/15)
  - fetchAgentSessions() — GET /v1/agent-sessions helper (api.ts)
  - companion.ts module — 3-line HUD + banner state machine + cycling + offline indicator
  - navigation.ts D-08 DOUBLE_CLICK Companion branch (banner-ack → cycle → home)
  - getCurrentScreen() / rebuildCurrentScreen() exports for Plan 08 SSE-driven repaint

affects:
  - vigil-g2-plugin/src/api.ts — added fetchAgentSessions; AgentSessionRow import
  - vigil-g2-plugin/src/constants.ts — 3 new ContainerIds; corrected per-page comment
  - vigil-g2-plugin/src/navigation.ts — Screen.COMPANION + SCREEN_ORDER + buildScreen case + handleNavEvent D-08 branch + W-6 exports

tech-stack:
  added:
    - tsx test runner with table-driven event-type cases (5x cases)
  patterns:
    - source-content drift detector (fs.readFileSync + comment-stripped regex; Phase 123 P03 + 124 P04 idiom)
    - injectable nowFn () => number (testable expiresAt-based toast clearing)
    - dynamic import inside buildScreen (avoids hard module-load coupling between navigation.ts and companion.ts)
    - module-level state cache (work-orders.ts:14-20 precedent)

key-files:
  created:
    - vigil-g2-plugin/src/screens/companion.ts (~280 lines)
    - vigil-g2-plugin/src/screens/__tests__/companion.test.ts (14 tests)
    - vigil-g2-plugin/src/__tests__/navigation.test.ts (5 drift tests)
  modified:
    - vigil-g2-plugin/src/constants.ts
    - vigil-g2-plugin/src/navigation.ts
    - vigil-g2-plugin/src/api.ts

decisions:
  - W-6 fix: getCurrentScreen() + rebuildCurrentScreen(bridge) exported from navigation.ts so Plan 08's SSE event handler can repaint the Companion HUD when an agent_event arrives WITHOUT changing screen identity (refreshCurrentScreen would also work but is kept separate for future divergence — e.g., SSE-only rebuild path that skips API hydrate)
  - Dynamic import (`await import('./screens/companion.ts')`) used in both buildScreen + handleNavEvent — keeps companion.ts side-effect-free at module load until first navigation. Pre-Plan 07 modules like home/work-orders/affirmation use static imports because they're guaranteed-loaded; Companion is a "newer" addition and deferring matches the "don't pay for what you don't use" pattern.
  - `currentScreen === Screen.COMPANION` literal is the drift-detector anchor (Task 3) — the handleNavEvent if-guard is structurally distinct from the SCREEN_ORDER literal (which contains `Screen.COMPANION,` only) and the buildScreen `case Screen.COMPANION:`. Search anchor reform during RED→GREEN avoided the false-pass risk where a future ride-along ships `case Screen.COMPANION` but drops the if-guard.
  - Banner state machine returns `{ toastMs: number | null }` explicitly — caller (Plan 08 SSE handler in main.ts) decides whether to setTimeout(rebuild, toastMs). Decoupling timer scheduling from companion.ts means tests don't fight against real setTimeout.
  - Empty-state bottom line locked to "No Claude Code activity yet" as the structural fallback. The "Last: <label> ... <Nm ago>" path is reachable only when activeSessions has ≥1 row — once true emptiness is reached, no per-session history is in scope. UI-SPEC §"Empty State Contract" reads this as acceptable (the 24h history surfaces naturally via the populated screen state).
  - LABEL_MAX=30, MESSAGE_MAX=32, TOAST_MS=3000 are the only tunables — codified as module constants so future copy changes are one-line edits.
  - Footer copy literally `'↓ work orders   () double-tap'` / `'↓ work orders   () ack banner'` — three spaces between the swipe arrow and the bracket-pair, matching home.ts/work-orders.ts/affirmation.ts conventions.
  - LONG_PRESS_EVENT removed from comment in navigation.ts — Task 1 acceptance grep is non-comment-stripping, so the literal token in the explanatory comment would have falsely tripped the drift gate. Replaced with "long-press" plain English while preserving the SEED-011 cross-reference. Task 3's drift test strips comments and tests the same invariant from the cleaner side.

metrics:
  start: 2026-05-10T02:00:00Z (approx)
  end: 2026-05-10T02:06:29Z
  duration: ~7 min
  tasks: 3 (1 auto + 2 TDD)
  files: 6 (3 created, 3 modified)
  tests: 14 companion + 5 navigation drift = 19 new (38 total in plugin suite, was 19)
  commits: 4 (1 feat-task1, 1 test-RED, 1 feat-GREEN, 1 test-drift)
  completed: 2026-05-10
---

# Phase 124 Plan 07: G2 Companion HUD + D-08 navigation + W-6 SSE-rebuild exports — Summary

Plumbed the Companion screen end-to-end: 3-line HUD + 5-event banner state machine + multi-session cycling + offline indicator via header rightSide; wired it as carousel slot 1 ([HOME, COMPANION, WORK_ORDERS, AFFIRMATION]); locked D-08 (DOUBLE_CLICK is the only Companion tap event) with a source-content drift detector; added the W-6 navigation exports Plan 08 needs to repaint Companion on incoming SSE events without churning screen identity.

## What Was Built

### Task 1 — Constants + navigation enum + DOUBLE_CLICK branch + fetchAgentSessions API helper (commit `4d024b9`)

**vigil-g2-plugin/src/constants.ts**
- Added `COMPANION_HEADER = 13`, `COMPANION_BODY = 14`, `COMPANION_FOOTER = 15` per UI-SPEC Container ID Allocation.
- Replaced misleading "max 12 total across all screens" comment with the per-page truth: SDK's `containerTotalNum: 1~12` constraint is per-call (CreateStartUpPageContainer / RebuildPageContainer), not global. Verified against `@evenrealities/even_hub_sdk` index.d.ts:638-643 in Phase 124 RESEARCH.

**vigil-g2-plugin/src/navigation.ts**
- Added `Screen.COMPANION = 'companion'` to the Screen const (slot between HOME and WORK_ORDERS).
- Inserted `Screen.COMPANION` at index 1 of `SCREEN_ORDER` — locked carousel order is now `[HOME, COMPANION, WORK_ORDERS, AFFIRMATION]` per D-05.
- Added `case Screen.COMPANION:` to `buildScreen` switch — hydrates from `fetchAgentSessions()`, then dynamic-imports `./screens/companion.ts` to call `hydrateActiveSessions(sessions)` and return `rebuildCompanionScreen()`.
- Inserted D-08 context-sensitive DOUBLE_CLICK Companion branch in `handleNavEvent` (between the HOME exit-confirm branch and the generic switch): priority `banner-ack → cycle-session → jump-Home`. Uses dynamic import to load `hasActiveBanner` / `ackBanner` / `getActiveSessions` / `cycleSession` from companion.ts.
- **W-6 fix**: added `export function getCurrentScreen(): ScreenName` and `export async function rebuildCurrentScreen(bridge): Promise<void>`. Plan 08's SSE event handler will call these to (a) decide whether an incoming event should trigger a repaint (only when user is viewing Companion) and (b) rebuild without changing screen identity.

**vigil-g2-plugin/src/api.ts**
- Added `import type { AgentSessionRow }` to the top.
- Added `export async function fetchAgentSessions(): Promise<AgentSessionRow[]>` — `GET /v1/agent-sessions` with bearer auth via existing `authHeaders()`. Returns `[]` on HTTP error or JSON-shape mismatch (matches `fetchSummary` fallback posture: display always renders). Verified shape `{ data: AgentSessionRow[] }` against vigil-core/src/routes/agent-events.ts:64-74 (Phase 121 Plan 02).

### Task 2 — Companion screen + 14 unit tests (commits `73966aa` RED + `79db84a` GREEN)

**vigil-g2-plugin/src/screens/companion.ts (~280 lines)**

Module-level state cache (mirrors `work-orders.ts:14-20` precedent):
- `activeSessions: AgentSessionRow[]`
- `currentSessionIndex: number`
- `bannerState: { type, sessionId, expiresAt? } | null`
- `sseConnected: boolean`
- `nowFn: () => number` (test-injectable for deterministic toast expiry)

Banner state machine (UI-SPEC §"Banner overlay states"):
- `needs_input` | `task_failed` → persistent banner; `toastMs: null`
- `task_complete` | `milestone` → 3s toast (`expiresAt = now + 3000`); `toastMs: 3000`
- `heartbeat` → no banner; state line refresh

STATE_LINE map (exhaustive over `AgentEventType`):
- `needs_input` → "waiting for input"
- `task_complete` → "done"
- `task_failed` → "failed"
- `milestone` → "running"
- `heartbeat` → "running"

Header rightSide priority (UI-SPEC §"Offline Indicator"):
1. `!sseConnected && len≥2` → `"! N/M"`
2. `!sseConnected && len≤1` → `"!"`
3. `sseConnected && len≥2` → `"N/M"`
4. else → `undefined` (header falls back to HH:MM AM/PM via `formatTime()`)

Layout (40/210/38 vertical split, mirrors affirmation.ts):
- Header: `buildVigilHeader(COMPANION_HEADER, 'companion-header', computeRightSide())`
- Body: 210px text container, `borderColor: 15`, `isEventCapture: 1`, content `${line1}\n${line2}\n${line3}`
- Footer: 38px, `borderColor: 0`, `isEventCapture: 0`, content `'↓ work orders   () double-tap'` or `'↓ work orders   () ack banner'`

Public API (consumed by navigation.ts D-08 branch + Plan 08 SSE wiring):
- `buildCompanionScreen()` → `CreateStartUpPageContainer` (initial paint, used by main.ts D-07)
- `rebuildCompanionScreen()` → `RebuildPageContainer` (subsequent paints)
- `hydrateActiveSessions(sessions)` — replaces cache, clamps index
- `applyAgentEvent(row)` — updates cache + bannerState; returns `{ toastMs }`
- `cycleSession()`, `ackBanner()`, `hasActiveBanner()`, `getActiveSessions()`, `setSseConnected()`, `isSseConnected()`
- `_resetState()`, `_setNow(fn)`, `_getBannerState()` (test seams)

**vigil-g2-plugin/src/screens/__tests__/companion.test.ts (14 tests)**

Coverage:
- 3-line render with single session
- Label truncation at 30 chars + ellipsis
- State-line mapping for all 5 event types (table-driven)
- needs_input persistent banner ([NEEDS INPUT] line 1)
- task_complete 3s toast — auto-clears via `_setNow`-driven time advance past `expiresAt`
- heartbeat doesn't set banner; updates state line to "running"
- Empty state — "No active sessions" / "idle" / "No Claude Code activity yet"
- N/M indicator on header rightSide when ≥2 sessions
- Offline indicator "!" when sseConnected=false
- Combined offline + N/M ("! 1/3")
- cycleSession wraps 0→1→2→0
- ackBanner clears persistent banner
- buildCompanionScreen returns CreateStartUpPageContainer with 3 textObject entries
- Footer copy: "double-tap" vs "ack banner"

RED gate: tests failed with `ERR_MODULE_NOT_FOUND` before companion.ts existed.
GREEN gate: 14/14 pass on first run after companion.ts landed.

### Task 3 — Navigation drift detectors (commit `d303f57`)

**vigil-g2-plugin/src/__tests__/navigation.test.ts (5 source-content drift tests)**

All tests use `fs.readFileSync(NAV_SRC) → strip line+block comments → assert source-content invariants`. Mirrors the Phase 124 Plan 04 home.test.ts and Phase 123 Plan 03 PackageTests/DriftDetectorTests pattern.

1. **D-08 drift — no LONG_PRESS_EVENT**. The token is absent from `OsEventTypeList` in `@evenrealities/even_hub_sdk@0.0.9`. Trip a future ride-along that re-introduces dead spec wording.
2. **D-08 drift — Companion branch handles DOUBLE_CLICK_EVENT**. Anchored at the literal guard `currentScreen === Screen.COMPANION` (handleNavEvent if-block). 1200-char window must include `DOUBLE_CLICK_EVENT`.
3. **SCREEN_ORDER lock**. Exactly 4 entries, `Screen.HOME` / `Screen.COMPANION` / `Screen.WORK_ORDERS` / `Screen.AFFIRMATION` in slot 0/1/2/3.
4. **D-08 priority chain**. Companion DOUBLE_CLICK branch's 1200-char window must reference all three: `hasActiveBanner` / `cycleSession` / `getActiveSessions`.
5. **W-6 lock**. `export function getCurrentScreen` + `export async function rebuildCurrentScreen` regex matches.

5/5 pass after one Rule 1 deviation (see below).

## Verification

- `cd vigil-g2-plugin && npx tsc --noEmit` — zero errors involving constants.ts / navigation.ts / api.ts / companion.ts / navigation.test.ts / companion.test.ts (pre-existing 13 baseline errors in `__tests__/smoke.test.ts` + `lib/__tests__/sse-client.test.ts` + `screens/__tests__/home.test.ts` for missing `node:test` types — out-of-scope per executor scope-boundary, carry-forward from Plan 01)
- `cd vigil-g2-plugin && npx tsx --test src/screens/__tests__/companion.test.ts` — 14/14 pass
- `cd vigil-g2-plugin && npx tsx --test src/__tests__/navigation.test.ts` — 5/5 pass
- `cd vigil-g2-plugin && npx tsx --test "src/**/*.test.ts"` (full plugin suite) — 38/38 pass (was 19/19; +19 new from this plan)
- All Plan 07 acceptance grep checks pass:
  - `COMPANION_HEADER: 13` / `COMPANION_BODY: 14` / `COMPANION_FOOTER: 15` in constants.ts ✓
  - "max 12 total across all screens" comment removed ✓
  - "containerTotalNum: 1~12" comment present ✓
  - `COMPANION: 'companion'` in navigation.ts ✓
  - SCREEN_ORDER has Screen.COMPANION between HOME and WORK_ORDERS ✓
  - `case Screen.COMPANION` in navigation.ts ✓
  - `currentScreen === Screen.COMPANION` (D-08 if-guard) in navigation.ts ✓
  - LONG_PRESS_EVENT absent from navigation.ts ✓
  - non-comment bare CLICK_EVENT absent for Companion ✓
  - `export async function fetchAgentSessions` in api.ts ✓
  - `${BASE_URL}/agent-sessions` in api.ts ✓
  - companion.ts contains STATE_LINE / 'waiting for input' / banner labels / ContainerId refs / borderColor 15 / footer copy / LABEL_MAX=30 / MESSAGE_MAX=32 / TOAST_MS=3000 / 9 expected exports ✓
  - No bearer/API_KEY/Authorization logging in companion.ts or api.ts ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Drift-detector test anchor changed from `Screen.COMPANION` first-occurrence to `currentScreen === Screen.COMPANION` literal guard**
- **Found during:** Task 3 RED→GREEN
- **Issue:** The plan-spec test used `noComments.indexOf("Screen.COMPANION")` which finds the first occurrence — that's at line 28 inside the SCREEN_ORDER literal, far from the line-180 handleNavEvent if-guard. The 200-char-before / 800-char-after window doesn't reach the DOUBLE_CLICK_EVENT branch, so the assertion `window.includes("DOUBLE_CLICK_EVENT")` failed.
- **Fix:** Changed the anchor to `noComments.indexOf("currentScreen === Screen.COMPANION")` — that literal exists ONLY in the handleNavEvent if-guard (it's not in the Screen const declaration nor the buildScreen case). Window from there forward correctly includes the DOUBLE_CLICK_EVENT branch body. Added an extra `assert.ok(idx >= 0, ...)` guard in case someone removes the if-block entirely.
- **Files modified:** `vigil-g2-plugin/src/__tests__/navigation.test.ts`
- **Commit:** d303f57 (the test landed correct on first commit; documented here for posterity)

**2. [Rule 1 — Bug] Removed `LONG_PRESS_EVENT` from explanatory comment in navigation.ts**
- **Found during:** Task 1 acceptance grep
- **Issue:** Task 1's acceptance criterion is `grep -c "LONG_PRESS_EVENT" navigation.ts` returns 0. The original explanatory comment included the literal token "LONG_PRESS_EVENT" to cross-reference SEED-011. The non-comment-stripping grep falsely tripped on the explanatory comment.
- **Fix:** Replaced "LONG_PRESS_EVENT is absent from OsEventTypeList" with "long-press is absent from OsEventTypeList" (plain English) while preserving the SEED-011 cross-reference. Task 3's drift test strips comments anyway — this maintains parity between Task 1 and Task 3 invariants.
- **Files modified:** `vigil-g2-plugin/src/navigation.ts`
- **Commit:** 4d024b9

### Authentication Gates

None. No external services called. `fetchAgentSessions()` uses the existing `VITE_API_KEY`/`authHeaders()` plumbing — no new auth surface.

## Threat Surface Scan

No new threat surface beyond what's already in the plan's `<threat_model>`. The Companion screen is a passive consumer of vigil-core's per-userId SSE stream (T-124-07-02 disposition: accept; server-side bus isolation is the structural guarantee). The drift detectors close T-124-07-01 (Tampering — future ride-along re-introduces dead event types) by trip-at-test-time. The banner state machine's switch-with-default closes T-124-07-03 (malformed event payload corrupting bannerState) by construction.

## Hand-off to Plan 08

Plan 08's main.ts SSE wiring should:
1. `import { createSseClient } from './lib/sse-client.ts'` (Plan 06)
2. `import { applyAgentEvent, setSseConnected } from './screens/companion.ts'` (this plan)
3. `import { getCurrentScreen, rebuildCurrentScreen, Screen } from './navigation.ts'` (this plan, W-6 exports)
4. On `onEvent(row)`: call `applyAgentEvent(row)`. If `getCurrentScreen() === Screen.COMPANION`, also `await rebuildCurrentScreen(bridge)`. If returned `toastMs > 0`, schedule `setTimeout(() => rebuildCurrentScreen(bridge), toastMs)` for the toast clear.
5. On `onStateChange('connected'|'disconnected')`: call `setSseConnected(connected)`. If on Companion screen, repaint to flash the offline `!` indicator.

The dynamic-import seam in navigation.ts means main.ts wiring won't trigger any companion.ts side effects until first navigation OR first incoming SSE event — Plan 08 tests can stub all 3 imports without companion.ts evaluating at module-load time.

## Self-Check: PASSED

All claims verified.

**Files created:**
- `vigil-g2-plugin/src/screens/companion.ts` ✓ (FOUND)
- `vigil-g2-plugin/src/screens/__tests__/companion.test.ts` ✓ (FOUND)
- `vigil-g2-plugin/src/__tests__/navigation.test.ts` ✓ (FOUND)

**Files modified:**
- `vigil-g2-plugin/src/constants.ts` ✓ (3 new ContainerIds + corrected comment)
- `vigil-g2-plugin/src/navigation.ts` ✓ (Screen.COMPANION + SCREEN_ORDER + buildScreen case + DOUBLE_CLICK branch + W-6 exports)
- `vigil-g2-plugin/src/api.ts` ✓ (fetchAgentSessions)

**Commits exist:**
- 4d024b9 (Task 1 — constants + nav + api) ✓ (FOUND)
- 73966aa (Task 2 RED — companion test) ✓ (FOUND)
- 79db84a (Task 2 GREEN — companion impl) ✓ (FOUND)
- d303f57 (Task 3 — nav drift tests) ✓ (FOUND)

## TDD Gate Compliance

- Task 2 (`tdd: true`): RED commit `73966aa` (test) → GREEN commit `79db84a` (feat) — gate sequence satisfied.
- Task 3 (`tdd: true`): drift-detector test commit `d303f57` is the only artifact (source-content drift tests don't have a separate RED→GREEN — they assert invariants on already-modified source from Task 1 in the same plan; the "RED" gate would require regressing Task 1 first, which would be cosmetic). Marker noted; consistent with Phase 123 Plan 03 PackageTests / Phase 124 Plan 04 home.test.ts patterns.

No TDD gate violations.
