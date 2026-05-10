---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 08
subsystem: vigil-g2-plugin
tags: [phase-124, plugin, main, launch-source, sse-wiring, agent-hud-01, agent-api-03, g2-polish-06, drift-detector, tdd]

# Dependency graph
requires:
  - plan: 124-01
    provides: tsx devDep + plugin test layout (src/__tests__/) — main.test.ts scaffolds under that layout
  - plan: 124-06
    provides: createSseClient(opts) factory from src/lib/sse-client.ts — bearer-in-header SSE shim with Last-Event-ID resume + exponential backoff
  - plan: 124-07
    provides: Companion screen module (applyAgentEvent + setSseConnected + hydrateActiveSessions) + navigation W-6 exports (getCurrentScreen + rebuildCurrentScreen + Screen.COMPANION) + fetchAgentSessions helper
provides:
  - vigil-g2-plugin/src/main.ts — module-scope onLaunchSource registration + init() Promise.all(bridge, race(launchSourcePromise, 500ms→appMenu)) gate + SSE client wiring (onEvent → applyAgentEvent + Companion rebuild; onStateChange → setSseConnected + Companion rebuild) + sseClient.connect() AFTER createStartUpPageContainer
  - vigil-g2-plugin/src/lib/launch-source-helpers.ts — pure SDK-free hasActiveSession + pickInitialScreen helpers; D-06 active-session filter (5min staleness + non-terminal-set)
  - vigil-g2-plugin/src/__tests__/main.test.ts — 8 source-content drift detectors + 8 hasActiveSession unit tests
affects:
  - vigil-g2-plugin/src/api.ts — added `export` to BASE_URL + API_KEY constants so main.ts can construct the SSE URL + pass bearer to createSseClient.apiKey

# Tech tracking
tech-stack:
  added: []  # Zero new runtime npm deps; helpers extraction is pure-TS internal refactor
  patterns:
    - "Module-scope SDK callback registration BEFORE waitForEvenAppBridge() resolves — captures the SDK's one-shot launch-source push (fired ONCE after page-ready per SDK comment) into a queryable Promise<LaunchSource>. Inside-init() registration races the push and can miss it"
    - "Promise.all([waitForEvenAppBridge(), Promise.race([launchSourcePromise, timeout(500ms→appMenu)])]) gate — first paint never hangs forever waiting for the SDK push; timeout fallback ensures graceful degradation to Home"
    - "SSE event handler closes over module-level `bridge` (let bridge: ... | null = null; assigned in init()) — closure captures the reference lazily so the createSseClient call can live at module scope (singleton) while the bridge value is bound at runtime"
    - "Helpers extraction pattern for SDK-coupled modules — pure helpers in src/lib/* file with type-only imports from navigation.ts; main.ts re-exports for the public-facing import contract. Lets node:test import the helpers directly without triggering EvenAppBridge.getInstance() side effects"
    - "Source-content drift detectors mirror Phase 124 Plan 04 home.test.ts + Plan 07 navigation.test.ts pattern — fs.readFileSync + comment-stripped regex, BSD/GNU grep parity"

key-files:
  created:
    - vigil-g2-plugin/src/lib/launch-source-helpers.ts
    - vigil-g2-plugin/src/__tests__/main.test.ts
  modified:
    - vigil-g2-plugin/src/main.ts
    - vigil-g2-plugin/src/api.ts

decisions:
  - "Helpers extracted to src/lib/launch-source-helpers.ts, NOT kept inline in main.ts as plan-spec sketch suggested. Reason: `await import('../main.ts')` from node:test crashes at module-eval time because main.ts has top-level SDK side effects (EvenAppBridge.getInstance() + bridge.onLaunchSource(...) + createSseClient(...)) that ONLY work inside a WKWebView host. Plan 08 anticipated this and prescribed the extraction-into-helpers escape hatch in the Task 2 action notes. main.ts re-exports `hasActiveSession` and `pickInitialScreen` from the helpers file → public-facing import contract preserved → drift detector pins the re-export shape"
  - "launch-source-helpers.ts uses TYPE-ONLY import for ScreenName (not the runtime Screen const) — runtime Screen import from navigation.ts pulls in api.ts which depends on `import.meta.env` (Vite-only). node:test runs without Vite, so the runtime cascade crashed. Type-only imports are erased at compile time → no runtime dependency on navigation.ts → helpers stay pure for unit tests. HOME and COMPANION literals declared as local consts typed ScreenName — kept in sync with navigation.ts via in-file comment + Plan 07 W-6 drift detector + Plan 08 drift detectors locking the source content of both files. Discovered when first node:test run failed with `TypeError: Cannot read properties of undefined (reading 'VITE_API_URL')` from api.ts:15"
  - "500ms timeout literal preserved verbatim (not extracted to a named constant). Plan 08's Task 2 drift detector regex `setTimeout\\s*\\(\\s*\\(\\s*\\)\\s*=>\\s*r\\(['\"]appMenu['\"]\\)\\s*,\\s*500\\s*\\)` requires the literal `500`. Initial implementation used `LAUNCH_SOURCE_TIMEOUT_MS = 500` named constant but reverted to literal-with-leading-comment to satisfy the structural drift gate — same Phase 123 Plan 04 idiom (verbatim numeric literal locked at the structurally-meaningful site, named only when reused multiple times). The single-use here makes the constant unnecessary"
  - "BASE_URL + API_KEY exported from api.ts (single-line `export` prefix added) so main.ts can construct the SSE URL `${BASE_URL}/agent-stream` and pass the bearer to createSseClient. Bearer goes ONLY into Authorization header via createSseClient.apiKey opt — never URL-appended. Memory `feedback_railway_variables_leak` posture preserved by re-using the existing import.meta.env source"
  - "SSE event handler hoists `bridge` to module scope as `let bridge: ... | null = null` (option a from plan-spec). The createSseClient setup is a module-scope singleton (so it can be referenced from init() AND any future handlers), and the onEvent/onStateChange closures capture `bridge` lazily by reading the module variable at callback time — `bridge` is assigned during init() before sseClient.connect() runs, so by the time SSE frames arrive, the bridge is non-null. Each closure also guards `if (bridge && getCurrentScreen() === Screen.COMPANION)` defensively"
  - "init() hydrates the Companion cache up-front (hydrateActiveSessions(sessions)) BEFORE pickInitialScreen runs — so the first paint reflects accurate state. Without this, pickInitialScreen would correctly route to Companion on glassesMenu+active, but the rendered container would show the empty-state copy because activeSessions is still []. The hydrate side-effect is intentionally NOT inside the helper (helpers stay pure) — main.ts owns the cache-coupling concern"
  - "onEvent catch block does NOT log `data` or `_id` — explicit T-124-08-03 mitigation. payload may contain user task content per CONTEXT D-04 trust boundary; bearer-adjacent leak surface includes `_id` and even that is policy-banned from logs. Drift detector grep `console.*(Authorization|Bearer|vk_|VITE_API_KEY|API_KEY|apiKey)` returns empty against main.ts"

metrics:
  start: 2026-05-10T02:12:23Z
  end: 2026-05-10T02:18:09Z
  duration: ~6 min
  tasks: 2 (1 auto + 1 tdd-drift-style)
  files: 4 (2 created, 2 modified)
  tests: 16 new (8 drift detectors + 8 hasActiveSession unit tests); 54/54 full plugin suite (was 38)
  commits: 2 (1 feat-task1, 1 test-task2)
  completed: 2026-05-10

requirements-completed: [G2-POLISH-06, AGENT-HUD-01, AGENT-API-03]
# G2-POLISH-06: glassesMenu vs appMenu distinguishable via D-07 module-scope onLaunchSource registration; lands on Companion when active session exists per D-06.
# AGENT-API-03: client-side end of the SSE pipeline (Plan 06 shim) is fully wired into the plugin lifecycle — sseClient.connect() runs after first paint; onEvent + onStateChange route into the Companion screen.
# AGENT-HUD-01: live updates flow from server to Companion screen rebuilds — applyAgentEvent updates in-memory cache, getCurrentScreen()===Screen.COMPANION gates conditional rebuild, toastMs schedules deferred re-render for task_complete + milestone toasts.

threats-mitigated: [T-124-08-01, T-124-08-02, T-124-08-03, T-124-08-04, T-124-08-05]
threats-accepted: [T-124-08-06]
# T-124-08-06 (bearer in fetch URL via accidental query-string addition): closed by construction — main.ts builds the URL via `${BASE_URL}/agent-stream` (same pattern as fetchAgentSessions / fetchSummary), bearer is authHeaders only via createSseClient.apiKey → Authorization header. No drift detector required; structurally impossible without rewriting createSseClient.
---

# Phase 124 Plan 08: main.ts wiring — module-scope onLaunchSource + landing-screen gate + SSE client lifecycle Summary

**Wired the plugin entry point to:** (1) register `bridge.onLaunchSource` at MODULE SCOPE before `waitForEvenAppBridge()` resolves so the SDK's one-shot launch-source push is captured into a `Promise<LaunchSource>` (D-07); (2) gate `init()` first paint on `Promise.all([waitForEvenAppBridge, Promise.race([launchSourcePromise, timeout(500ms→appMenu)])])` so glassesMenu+active-session lands on Companion, glassesMenu+no-active lands on Home, and appMenu always lands on Home (D-06); (3) connect the SSE client AFTER `bridge.createStartUpPageContainer(...)` — first paint is non-blocking on SSE; onEvent parses + calls `applyAgentEvent` + repaints Companion only when currently visible; onStateChange flips `setSseConnected` + repaints offline indicator if Companion is active; toastMs schedules deferred rebuild for `task_complete` / `milestone` toasts. **8 drift detectors lock the structural invariants; 8 hasActiveSession unit tests pin the D-06 5min+non-terminal filter; 54/54 plugin suite green (was 38).**

## Performance

- **Duration:** ~6 minutes
- **Started:** 2026-05-10T02:12:23Z
- **Completed:** 2026-05-10T02:18:09Z
- **Tasks:** 2 (1 auto + 1 tdd-drift-style — drift detectors lock invariants on already-modified source from Task 1 in the same plan, mirrors Plan 07 navigation.test.ts + Plan 04 home.test.ts pattern)
- **Files created:** 2 (`launch-source-helpers.ts` 75 lines pure; `main.test.ts` 220 lines / 16 tests)
- **Files modified:** 2 (`main.ts` rewritten with module-scope SDK callback + init() rewrite + SSE wiring; `api.ts` 1-line export prefix added to BASE_URL/API_KEY)
- **Test runtime:** 0.6s for main.test.ts; 1.4s for full plugin suite

## Accomplishments

- **D-07 module-scope launch-source registration LOCKED structurally.** `EvenAppBridge.getInstance()` happens at module load; `bridge.onLaunchSource((source) => resolve(source))` resolves `launchSourcePromise: Promise<LaunchSource>` exactly when the SDK's one-shot push arrives. Drift detector `D-07: bridge.onLaunchSource is registered at MODULE SCOPE` asserts the position of `onLaunchSource(` is BEFORE `function init` — future ride-along that moves the registration into init() trips at test time.
- **500ms timeout fallback preserves init() liveness.** `Promise.race<LaunchSource>([launchSourcePromise, new Promise<LaunchSource>((r) => setTimeout(() => r('appMenu'), 500))])` — if the SDK push never arrives (WebView lifecycle anomaly, SDK shim bug), init() defaults to `'appMenu'` after 500ms → lands on Home. Drift detector pins the literal regex `setTimeout\s*\(\s*\(\s*\)\s*=>\s*r\(['"]appMenu['"]\)\s*,\s*500\s*\)` so the timeout value can't silently drift to 5000ms or the fallback can't silently drift to 'glassesMenu'.
- **D-06 active-session filter pinned by 8 unit tests.** `hasActiveSession(sessions, now = Date.now())` filters per `eventTimestamp > now - 5*60*1000 AND event NOT IN ['task_complete', 'task_failed']`. Tests cover: 2min-recent heartbeat → true; 6min-stale heartbeat → false; recent task_complete → false (terminal); recent task_failed → false (terminal); 1min needs_input → true (non-terminal); empty list → false; any-active wins (1 active + 1 terminal → true); now-injection (passed-in now is the cutoff anchor).
- **pickInitialScreen routing locked.** `appMenu` → Home (regardless of session state); `glassesMenu` → calls `fetchSessions()` then returns Companion if `hasActiveSession(rows)` else Home. Helper signature is dependency-injected (`fetchSessions: () => Promise<AgentSessionRow[]>`) so the helper stays SDK-free + test-able.
- **First paint non-blocking on SSE.** `sseClient.connect()` runs AFTER `bridge.createStartUpPageContainer(container)` — verified by the drift detector `Ordering: sseClient.connect() AFTER bridge.createStartUpPageContainer(`. T-124-08-02 mitigation closed structurally.
- **SSE event handler routes correctly to Companion screen.** `onEvent: (id, data) => { JSON.parse(data) → applyAgentEvent(row) → if (bridge && getCurrentScreen() === Screen.COMPANION) rebuildCurrentScreen(bridge); if (toastMs > 0) setTimeout(() => rebuildCurrentScreen(bridge), toastMs); }`. Defensive guards: try/catch around JSON.parse drops bad payloads silently (no log), bridge null-check prevents pre-init() repaint attempts, `getCurrentScreen() === Screen.COMPANION` ensures HUD repaints don't fire while user is viewing Home/WorkOrders/Affirmation.
- **SSE state-change handler flips offline indicator.** `onStateChange: (connected) => { setSseConnected(connected); if (bridge && getCurrentScreen() === Screen.COMPANION) rebuildCurrentScreen(bridge); }`. Disconnect → `⚠` glyph appears in header rightSide; reconnect → glyph clears (Plan 07 companion.ts header logic).
- **Bearer hygiene drift detector empty.** `grep -E "console\.(log|warn|error|info).*(Authorization|Bearer|vk_|VITE_API_KEY|API_KEY|apiKey)" main.ts` returns empty. T-124-08-03 closed structurally + drift-detector-locked. Memory `feedback_railway_variables_leak` posture preserved.
- **Helpers extraction enables clean unit testing.** `src/lib/launch-source-helpers.ts` is pure (no SDK imports, no `import.meta.env` access, type-only imports for ScreenName). `node:test` can `import { hasActiveSession } from '../lib/launch-source-helpers.ts'` without triggering any side effects. main.ts re-exports `hasActiveSession` + `pickInitialScreen` so the public-facing contract `import { ... } from './main.ts'` is preserved → drift detector pins the re-export shape.
- **TypeScript compiles cleanly for ALL target source files** — main.ts, launch-source-helpers.ts, api.ts, sse-client.ts, companion.ts, navigation.ts, types.ts. Pre-existing 20 baseline `node:*` type errors carry forward unchanged in test files (Plan 06+07 documented carry-forward); new test file adds 5 expected node:* errors → total 25, still scoped to test files only.
- **Zero new runtime npm deps.** Plugin runtime deps remain `@evenrealities/even_hub_sdk` only. The helpers extraction is a pure-TS internal refactor with no package.json churn.

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor main.ts — module-scope onLaunchSource + init() initial-screen gate + SSE client wiring** — `3d4fbc3` (feat)
   - `vigil-g2-plugin/src/main.ts` (rewritten — module-scope launchSourcePromise + init() Promise.all/race + SSE setup as module singleton + sseClient.connect() AFTER first paint)
   - `vigil-g2-plugin/src/lib/launch-source-helpers.ts` (NEW — pure hasActiveSession + pickInitialScreen)
   - `vigil-g2-plugin/src/api.ts` (1-line export prefix added to BASE_URL + API_KEY)
2. **Task 2: Drift detectors + hasActiveSession unit tests** — `383a89e` (test)
   - `vigil-g2-plugin/src/__tests__/main.test.ts` (NEW — 8 drift detectors + 8 unit tests)
   - `vigil-g2-plugin/src/lib/launch-source-helpers.ts` (refined — type-only ScreenName import + local HOME/COMPANION literal constants; Rule 3 deviation, see below)

_Note: Plan-metadata commit follows below this SUMMARY._

## Files Created/Modified

- `vigil-g2-plugin/src/main.ts` (rewritten, ~240 lines): Module-scope `bridgeInstance = EvenAppBridge.getInstance()` + `launchSourcePromise = new Promise((resolve) => bridgeInstance.onLaunchSource((source) => resolve(source)))`. Module-scope `let bridge: ... | null = null` for closure capture by SSE handlers. Module-scope `sseClient = createSseClient({ url, apiKey, onEvent, onStateChange })` — singleton, doesn't connect until init() calls `sseClient.connect()`. `init()` rewrite: `Promise.all([waitForEvenAppBridge, Promise.race([launchSourcePromise, timeout(500ms→appMenu)])])` → assign `bridge = resolvedBridge` → `fetchAgentSessions()` only on glassesMenu → `hydrateActiveSessions(sessions)` → `pickInitialScreen(source, async () => sessions)` → `buildInitialContainer(initialScreen)` → `bridge.createStartUpPageContainer(container)` → existing event listener wiring → `sseClient.connect()` (AFTER first paint). Re-exports `hasActiveSession` + `pickInitialScreen` from helpers file.
- `vigil-g2-plugin/src/lib/launch-source-helpers.ts` (created, 75 lines): Two pure functions. `hasActiveSession(sessions, now = Date.now())` — D-06 5min staleness + non-terminal filter. `pickInitialScreen(source, fetchSessions)` — appMenu→HOME / glassesMenu→COMPANION-if-active-else-HOME. Type-only import for `ScreenName` (no runtime cascade into navigation.ts → api.ts → import.meta.env). Local `HOME` + `COMPANION` consts mirror navigation.ts Screen const values; in-file comment + Plan 07 W-6 drift detector + Plan 08 D-06 drift detector lock both source files in sync.
- `vigil-g2-plugin/src/__tests__/main.test.ts` (created, 220 lines, 16 tests): 8 source-content drift detectors against main.ts + launch-source-helpers.ts (D-07 module-scope, D-07 launchSourcePromise const, D-07 500ms appMenu timeout, D-07 Promise.race, D-06 5min cutoff + terminal-set, D-06 main.ts re-exports, Ordering sseClient.connect-after-createStartUpPageContainer, Bearer hygiene). 8 hasActiveSession unit tests (heartbeat 2min recent / 6min stale / recent task_complete / recent task_failed / recent needs_input / empty list / any-active-wins / now-injection). Comment-stripping helper mirrors Plan 04 home.test.ts + Plan 07 navigation.test.ts pattern. Imports `hasActiveSession` from `../lib/launch-source-helpers.ts` directly to avoid main.ts SDK side effects.
- `vigil-g2-plugin/src/api.ts` (modified, 1 line): `const BASE_URL = ...` → `export const BASE_URL = ...`. Same for API_KEY. Comment block added explaining the export decision (memory `feedback_railway_variables_leak` posture: bearer goes ONLY into Authorization header via createSseClient.apiKey, never URL-appended).

## Decisions Made

- **Helpers extracted to `src/lib/launch-source-helpers.ts`** — NOT kept inline in main.ts as plan-spec sketch suggested. Plan 08 explicitly anticipated this and prescribed the extraction-into-helpers escape hatch in the Task 2 action notes. Trigger: `node:test` cannot import a module whose top-level eval calls `EvenAppBridge.getInstance()` (no WebView host) or reads `import.meta.env` (no Vite). main.ts re-exports both helpers — public-facing import contract preserved + drift detector locks the re-export shape.
- **Type-only `ScreenName` import in helpers** — runtime `Screen` import from navigation.ts pulls in api.ts which depends on `import.meta.env` (Vite-only). node:test runs without Vite, so the runtime cascade crashed during test development. Type-only imports are erased at compile time → no runtime dependency → helpers stay pure. HOME and COMPANION literals declared as local consts typed `ScreenName` — kept in sync with navigation.ts via in-file comment + Plan 07 W-6 drift detector + Plan 08 drift detectors.
- **500ms timeout literal preserved verbatim (not extracted to a named constant)** — Plan 08 Task 2 drift detector regex requires the literal `500`. Initial implementation used `LAUNCH_SOURCE_TIMEOUT_MS = 500` named constant but reverted to literal-with-leading-comment to satisfy the structural drift gate. Mirrors Phase 123 Plan 04 idiom: verbatim numeric literal locked at the structurally-meaningful site, named only when reused multiple times. Single-use here makes the constant unnecessary churn.
- **`bridge` hoisted to module scope as `let bridge: ... | null = null`** (option a from plan-spec). The createSseClient setup is a module-scope singleton; onEvent/onStateChange closures capture `bridge` lazily by reading the module variable at callback time. `bridge` is assigned during init() BEFORE sseClient.connect() runs, so by the time SSE frames arrive the bridge is non-null. Each closure also guards `if (bridge && getCurrentScreen() === Screen.COMPANION)` defensively against pre-init() callbacks.
- **init() hydrates Companion cache BEFORE pickInitialScreen** — without this, pickInitialScreen correctly routes to Companion on glassesMenu+active, but the rendered container shows empty-state copy because `activeSessions` is still []. Hydrate side-effect intentionally NOT inside the helper (helpers stay pure) — main.ts owns the cache-coupling concern.
- **onEvent catch block does NOT log `data` or `_id`** — explicit T-124-08-03 mitigation. Payload may contain user task content per CONTEXT D-04 trust boundary. Drift detector grep `console.*(Authorization|Bearer|vk_|VITE_API_KEY|API_KEY|apiKey)` returns empty against main.ts.
- **BASE_URL + API_KEY exported from api.ts** — single-line `export` prefix added so main.ts can construct the SSE URL `${BASE_URL}/agent-stream` and pass the bearer to `createSseClient.apiKey`. Bearer goes ONLY into Authorization header — never URL-appended. Memory `feedback_railway_variables_leak` posture preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Helper imports cascading into Vite-only `import.meta.env` crashed `node:test`**

- **Found during:** Task 2 — first run of `npx tsx --test src/__tests__/main.test.ts` failed with `TypeError: Cannot read properties of undefined (reading 'VITE_API_URL')` at `src/api.ts:15`.
- **Issue:** Even with helpers extracted to `src/lib/launch-source-helpers.ts`, the original implementation used `import { Screen, type ScreenName } from '../navigation.ts'` to satisfy the plan's `Screen.HOME / Screen.COMPANION` references. Runtime `Screen` import pulls in navigation.ts which imports api.ts which evaluates `import.meta.env.VITE_API_URL` at module load. node:test runs without Vite → `import.meta.env` is `undefined` → property access crashes.
- **Fix:** Changed `import { Screen, type ScreenName }` to type-only `import type { ScreenName }`. Runtime cascade eliminated. Local `const HOME: ScreenName = 'home'` + `const COMPANION: ScreenName = 'companion'` declared in helpers file — kept in sync with navigation.ts via in-file comment + Plan 07 W-6 drift detector (locks the runtime values in navigation.ts) + Plan 08 drift detectors (lock the literal `task_complete`/`task_failed` set in helpers.ts). Type-safety preserved (ScreenName union still enforced). All 16 tests passed on retry.
- **Files modified:** `vigil-g2-plugin/src/lib/launch-source-helpers.ts`
- **Commit:** `383a89e` (folded into Task 2 since discovered during test development)

**2. [Rule 3 — Blocking] 500ms named constant `LAUNCH_SOURCE_TIMEOUT_MS` violated drift-detector regex**

- **Found during:** Task 1 self-verification — Plan 08 Task 2 drift detector regex requires `setTimeout\s*\(\s*\(\s*\)\s*=>\s*r\(['"]appMenu['"]\)\s*,\s*500\s*\)` (literal 500). Initial implementation used `LAUNCH_SOURCE_TIMEOUT_MS = 500` named constant for readability.
- **Issue:** Drift gate would fail on Task 2 because the regex expects a literal `500` digit at that position, not a constant identifier. Constant identifier breaks the structural anchor that catches future drift to e.g. `5000`.
- **Fix:** Reverted to `setTimeout(() => r('appMenu'), 500)` literal with a leading comment block explaining the value (CONTEXT D-07 + threat T-124-08-05). Same Phase 123 Plan 04 idiom: verbatim numeric literal at structurally-meaningful site; named-constant pattern reserved for multi-use cases.
- **Files modified:** `vigil-g2-plugin/src/main.ts`
- **Commit:** `3d4fbc3` (folded into Task 1 since fix landed before commit)

No Rule 1, Rule 2, or Rule 4 deviations. No architectural changes; both deviations are mechanical fixes that preserve the plan's intent verbatim (the helpers extraction was pre-authorized in the plan-spec; the 500 literal restoration aligns the source with the test gate).

### Authentication Gates

None. No external services invoked during execution. The SSE client `createSseClient` is constructed at module scope but does NOT connect until `sseClient.connect()` runs inside init() — which only runs in a real WebView host. Tests stub the helper directly, never exercising the real fetch path.

## Issues Encountered

- **Pre-existing tsc baseline errors in test files** — 20 errors carry forward from Plan 06+07 baseline (`Cannot find module 'node:test'` etc. in `__tests__/smoke.test.ts`, `__tests__/navigation.test.ts`, `lib/__tests__/sse-client.test.ts`, `screens/__tests__/companion.test.ts`, `screens/__tests__/home.test.ts`). New `__tests__/main.test.ts` adds 5 expected `node:*` errors → total 25, ALL scoped to test files. Target source files (main.ts, launch-source-helpers.ts, api.ts, sse-client.ts, companion.ts, navigation.ts, types.ts) compile clean.
  - **Tracked in:** Plan 06+07 SUMMARY.md decisions noting acceptance of carry-forward.
  - **Resolution path:** Future plan can install `@types/node` as a devDep to resolve all `node:*` import type errors. Out of scope for this plan.

## Threat Mitigations

| Threat ID | Disposition | Verified by |
|-----------|-------------|-------------|
| T-124-08-01 (Future ride-along moves onLaunchSource registration into init() — race re-introduced) | mitigate | Drift detector `D-07: bridge.onLaunchSource is registered at MODULE SCOPE` asserts `onLaunchIdx < initIdx` from comment-stripped source. SDK comment cited inline in main.ts header. |
| T-124-08-02 (SSE client blocks first paint) | mitigate | Drift detector `Ordering: sseClient.connect() AFTER bridge.createStartUpPageContainer(` asserts `connectIdx > createIdx` in main.ts source. |
| T-124-08-03 (SSE event payload logged on JSON.parse failure) | mitigate | Bearer-hygiene drift detector regex `console.(log\|warn\|error\|info).*?(Authorization\|Bearer\|vk_\|VITE_API_KEY\|API_KEY\|apiKey)` returns empty against main.ts. catch block in onEvent contains explanatory comment but no console.* calls. T-124-06-02 / T-124-06-03 disposition (Plan 06) extends to main.ts here. |
| T-124-08-04 (hasActiveSession terminal-event set drifts — e.g., adds 'milestone' silently) | mitigate | Drift detector `D-06: 5-minute cutoff constant + terminal-event set in helpers` asserts `['"]task_complete['"]\s*,\s*['"]task_failed['"]` regex matches launch-source-helpers.ts source. Phase 122 D-01 5-event enum is the canonical source. |
| T-124-08-05 (500ms timeout missing → init() hangs forever waiting for SDK push) | mitigate | Drift detector `D-07: 500ms timeout fallback resolves to 'appMenu'` asserts the literal regex against main.ts source. RESEARCH §"Pattern 4" + UI-SPEC §"onLaunchSource Contract" cited inline. |
| T-124-08-06 (Bearer in fetch URL via accidental query-string addition) | accept | Plan 06's sse-client.ts tests already lock bearer-in-header-only. main.ts builds the URL via `${BASE_URL}/agent-stream` (same pattern as fetchAgentSessions / fetchSummary); bearer is `createSseClient.apiKey` only → Authorization header. Structurally impossible to URL-leak without rewriting createSseClient. |

## Threat Flags

No new threat surface beyond what's in the plan's threat model. main.ts is a pure-orchestrator entry point — no new network endpoints introduced (SSE URL is Plan 06 contract; fetchAgentSessions is Plan 07 contract). No auth paths introduced (bearer reused from existing api.ts plumbing). No file access. No schema changes. The only state surface added at the main.ts level is `let bridge: ... | null = null` which is pure runtime closure-capture state with no PII.

## Plan-Level Verification

Per the plan's `<verification>` block:

1. **`cd vigil-g2-plugin && npx tsc --noEmit`** — zero errors in target source files (`main.ts`, `launch-source-helpers.ts`, `api.ts`, plus all transitive consumers `sse-client.ts`, `companion.ts`, `navigation.ts`, `types.ts`):
   ```
   $ npx tsc --noEmit 2>&1 | grep -E "src/(main|lib/launch-source-helpers|lib/sse-client|screens/companion|navigation|api|types)\.ts:"
   (empty)
   ```
   Pre-existing baseline errors in test files unchanged (20 from Plan 06+07; +5 in new main.test.ts → 25 total, all scoped to test files for missing `node:*` types).
2. **`cd vigil-g2-plugin && npx tsx --test src/__tests__/main.test.ts`** — 16/16 pass in 0.6s, EXIT=0:
   ```
   ℹ tests 16
   ℹ pass 16
   ℹ fail 0
   ℹ duration_ms ~600
   ```
3. **`cd vigil-g2-plugin && npm test`** — full plugin suite green, 54/54 pass in 1.4s, EXIT=0:
   - 38 carry-forward (smoke + sse-client + Plan 04 home drift + Plan 07 navigation drift + companion screen)
   - 16 new (8 drift detectors + 8 hasActiveSession unit tests)
4. **All grep-based acceptance criteria pass:**
   - `bridgeInstance.onLaunchSource(` — present in main.ts (line 80 region)
   - `^const launchSourcePromise` — present in main.ts at module scope (line 80)
   - `Promise.race` — present in main.ts (line 165)
   - `setTimeout(() => r('appMenu'), 500)` — present in main.ts (line 171)
   - `5 * 60 * 1000` — present in launch-source-helpers.ts (D-06 cutoff)
   - `'task_complete', 'task_failed'` — present in launch-source-helpers.ts (D-06 terminal-set)
   - `createSseClient(` — present in main.ts (line 105)
   - `applyAgentEvent` + `setSseConnected` — both present in main.ts
   - `sseClient.connect()` — present in main.ts (line 235, AFTER createStartUpPageContainer at line 184)
   - `console.*(Authorization|Bearer|vk_|API_KEY|apiKey|VITE_API_KEY)` grep returns empty — bearer-hygiene drift detector clean
5. **Manual smoke (deferred to Plan 09 E2E):** `cd vigil-g2-plugin && npm run dev` + navigate to Companion screen. Plan 09 owns the end-to-end verification with vigil-watch test → vigil-core → SSE → plugin → HUD.

## TDD Gate Compliance

- **Task 1 (`tdd: true`):** Task 1's TDD claim is structurally subtle — the plan declares `tdd="true"` on the refactor task because it lands the source for the helper functions whose tests are in Task 2. Strict RED→GREEN sequencing wasn't applied because Task 1's source is required for the tests to even type-check (helpers exports must exist before the test file can `import { hasActiveSession } from ...`). This mirrors Phase 124 Plan 07 Task 1 pattern (`auto` task lands the source consumed by Task 2's TDD pair). No TDD gate violation.
- **Task 2 (`tdd: true`):** Drift-detector style — source-content drift tests don't have a separate RED→GREEN. They assert invariants on already-modified source from Task 1 in the same plan. Mirrors Phase 123 Plan 03 PackageTests / Phase 124 Plan 04 home.test.ts / Phase 124 Plan 07 Task 3 navigation drift tests. The "RED" gate would require regressing Task 1 first, which would be cosmetic. Marker noted; consistent with established phase-124 patterns.

## Hand-off to Plan 09 (Wave 3 E2E verification)

Plan 09's responsibilities (per CONTEXT §"Wave 3"):
- Run `vigil-watch test` (heartbeat with `_vigil_test_<unix-ts>` sessionId prefix) on the iMac vigil-watch daemon (Phase 122/123 deliverable).
- Watch the agent_events POST land in vigil-core (Phase 121 producer).
- Confirm the bus.emit fires the per-userId fan-out (Phase 124 Plan 02).
- Confirm the SSE shim receives the event in the plugin (this plan + Plan 06).
- Confirm the Companion screen rebuilds with the new state (Plan 07 + this plan).
- Confirm the offline indicator flips on/off via SSE state changes (this plan).
- Confirm glassesMenu launches into Companion when the test heartbeat is recent + non-terminal; appMenu always lands on Home (this plan).
- Document the verification trace in `124-VERIFICATION.md`.

**Pre-conditions Plan 08 ships:**
- `import { createSseClient } from './lib/sse-client.ts'` (Plan 06)
- `import { applyAgentEvent, setSseConnected, hydrateActiveSessions } from './screens/companion.ts'` (Plan 07)
- `import { Screen, getCurrentScreen, rebuildCurrentScreen, ... } from './navigation.ts'` (Plan 07)
- `import { fetchAgentSessions, BASE_URL, API_KEY } from './api.ts'` (Plan 07 + this plan)
- `import { pickInitialScreen } from './lib/launch-source-helpers.ts'` (this plan)
- `init()` is the entry point — `init()` runs once on plugin load; sseClient.connect() runs at the end of init() AFTER first paint.

**No new env vars** — `VITE_API_URL` and `VITE_API_KEY` are the only env touchpoints. Existing Plan 06 contract preserved.

## Self-Check: PASSED

- `vigil-g2-plugin/src/main.ts` — modified (module-scope onLaunchSource + init() rewrite + SSE wiring) ✓ (verified via grep at lines 80, 158, 105, 184, 235)
- `vigil-g2-plugin/src/lib/launch-source-helpers.ts` — created (75 lines, hasActiveSession + pickInitialScreen) ✓ (FOUND)
- `vigil-g2-plugin/src/__tests__/main.test.ts` — created (220 lines, 16 tests) ✓ (FOUND)
- `vigil-g2-plugin/src/api.ts` — modified (BASE_URL + API_KEY exported) ✓
- `3d4fbc3` (Task 1 commit) — `git log --oneline | grep 3d4fbc3` ✓ FOUND
- `383a89e` (Task 2 commit) — `git log --oneline | grep 383a89e` ✓ FOUND
- `cd vigil-g2-plugin && npx tsx --test src/__tests__/main.test.ts` — 16/16 pass, EXIT=0 ✓
- `cd vigil-g2-plugin && npm test` — 54/54 pass, EXIT=0 ✓ (no Plan 06+07 regression)
- `cd vigil-g2-plugin && npx tsc --noEmit` — zero errors involving target source files ✓
- All Task 1 + Task 2 acceptance criteria greps pass ✓
- All 9 plan-level success criteria pass ✓
