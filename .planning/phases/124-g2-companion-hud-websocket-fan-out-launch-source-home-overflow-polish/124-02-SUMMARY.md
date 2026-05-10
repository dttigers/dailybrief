---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 02
subsystem: vigil-core
tags: [phase-124, vigil-core, bus, sse, agent-events, pub-sub]

# Dependency graph
requires:
  - phase: 121-agent-events-api-foundation-cross-user-isolation-lock
    provides: D-D2 cross-user isolation invariant — Plan 02 bus structurally enforces it for the SSE fan-out path; agent-events.ts as the route-layer analog the bus pairs with
  - file: vigil-core/src/db/types.ts
    provides: DrizzleAgentEvent type — bus emits this row shape
provides:
  - vigil-core/src/lib/agent-events-bus.ts — bus singleton (Map<userId, EventEmitter>) with emit/on/off/_size/_listenerCount API; AgentEventBus class export for testability
  - vigil-core/src/lib/__tests__/agent-events-bus.test.ts — 6 unit tests pinning isolation, auto-cleanup, and listener-leak prevention
  - vigil-core/src/lib/ directory established (first file under it; future in-process pub/sub primitives land here)
affects: [124-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Map<userId, EventEmitter> per-user pub/sub — first in-codebase example (D-03); cross-user isolation enforced structurally, not via runtime checks"
    - "Lazy emitter creation on first listener + auto-cleanup on last unsubscribe — bounds memory across many users (RESEARCH Pitfall 3)"
    - "Test hooks (_size / _listenerCount) marked as intentional public methods — allow downstream test files to assert no-leak invariants without reaching into private state"

key-files:
  created:
    - vigil-core/src/lib/agent-events-bus.ts
    - vigil-core/src/lib/__tests__/agent-events-bus.test.ts
  modified: []

key-decisions:
  - "Literal `setMaxListeners(50)` inlined at the call site (instead of a named const reference) — Plan 02 acceptance criterion `grep \"setMaxListeners(50)\"` requires the literal; keeps the cap pinned at the call site as a drift detector. Comment above the function names the constant for human readability."
  - "Listener parameter type is `DrizzleAgentEvent`, not `never` from the plan-spec verbatim — `tsc --noEmit` strict rejects `(_row: never) => void` listeners as contravariantly incompatible with the bus's accepted type. Using DrizzleAgentEvent is type-honest, no runtime semantics change. (Rule 3 deviation, see below.)"
  - "Class + singleton dual export (AgentEventBus class AND `bus` const) is intentional — class shape required by acceptance grep `contains 'export class AgentEventBus'`; singleton is what consumers import. Both shapes coexist for testability without runtime cost."

patterns-established:
  - "vigil-core/src/lib/ directory — for primitives that aren't routes/services/middleware/db/ai/analytics/utils. First occupant: in-process pub/sub bus. Future: in-process queues, registries, process-wide counters that need cross-route imports + maintain process-wide state"
  - "Drift-detector-friendly literal numerics — when a numeric cap is acceptance-tested via grep, inline the literal at the call site (not a named const) so the test pins the exact value at the structurally-relevant line"

requirements-completed: [AGENT-API-03]  # Note: AGENT-API-03 covers the full SSE fan-out — Plan 02 lands the in-process bus infrastructure (a strict subset). Plan 03 wires the SSE consumer; satisfaction of the requirement crystallizes when both plans are in.

threats-mitigated: [T-124-02-01, T-124-02-02, T-124-02-03, T-124-02-04]
threats-accepted: []

# Metrics
duration: 4min
completed: 2026-05-10
tasks: 2
files: 2
---

# Phase 124 Plan 02: Per-userId in-process EventEmitter bus Summary

**`Map<userId, EventEmitter>` bus singleton in `vigil-core/src/lib/agent-events-bus.ts` with structural cross-user isolation, auto-cleanup on last-listener unsubscribe, `setMaxListeners(50)` headroom for reconnect storms, and 6 unit tests pinning the invariants — Plan 03 will wire the SSE route consumer.**

## Performance

- **Duration:** ~4 minutes
- **Started:** 2026-05-10T00:32:41Z
- **Completed:** 2026-05-10T00:36:44Z
- **Tasks:** 2
- **Files created:** 2 (one source, one test)
- **Files modified:** 0

## Accomplishments

- `vigil-core/src/lib/` directory established (first ever file under it). 82 lines of pub/sub bus implementation with `AgentEventBus` class export plus a module-level `bus` singleton for consumers.
- Cross-user isolation enforced **structurally** (not via runtime check): listeners for userA and userB live on different `EventEmitter` instances inside a `Map`, so emit-for-userA cannot reach userB's listener by construction. This continues the Phase 121 D-D2 lock.
- Auto-cleanup on last unsubscribe: when `bus.off()` brings `listenerCount` to 0, the Map entry is deleted — bounds memory across many users and across reconnect storms.
- `bus.emit()` with no subscribers is a no-op (does NOT create an empty emitter): saves memory when no SSE clients are connected for a given user.
- `setMaxListeners(50)` provides 5x headroom over Node's default 10, suppressing `MaxListenersExceededWarning` under reasonable reconnect burst scenarios. Test pins the absence-of-warning at 15 listeners.
- 6 unit tests passing on first invocation:
  - `emit with no subscribers is a no-op`
  - `subscribe creates emitter; unsubscribe deletes Map entry when listenerCount hits 0`
  - `cross-userId isolation: listener for userA never fires for userB emit`
  - `100 reconnect cycles do not leak listeners (RESEARCH Pitfall 3)`
  - `multiple listeners on same userId all receive emit (within-user fan-out)`
  - `setMaxListeners(50) prevents warning under 11+ listeners on same userId`
- `npx tsc --noEmit` produces no errors involving either created file.
- No imports of the bus exist outside `src/lib/` yet — Plan 03 owns the consumer wiring (`agent-stream.ts`) and the producer hook (`agent-events.ts:bus.emit` on `isNew = true`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement agent-events-bus.ts with per-userId EventEmitter Map** — `aa69c4f` (feat)
2. **Task 2: Unit tests for bus isolation, auto-cleanup, listener-leak prevention** — `fe75ebd` (test)

_Note: Plan-metadata commit follows below this SUMMARY._

## Files Created/Modified

- `vigil-core/src/lib/agent-events-bus.ts` (created) — 82 lines. Module-level `Map<number, EventEmitter>` (`emitters`), `getOrCreate(userId)` lazy factory with `setMaxListeners(50)`, `AgentEventBus` class with `emit/on/off` + test hooks `_size/_listenerCount`, and `bus = new AgentEventBus()` singleton export. Top-of-file doc-comment names the cross-user isolation invariant + memory feedback (`feedback_railway_variables_leak`) posture even though no secrets flow through this module.
- `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` (created) — 108 lines. Mirrors the `agent-events.test.ts:1-15` scaffold: `process.env["JWT_SECRET"]` preamble (defensive), `node:test` + `node:assert/strict` imports, lazy bus import, then 6 `test(...)` blocks. Uses `DrizzleAgentEvent` as the listener parameter type so all listeners type-check under `tsc --noEmit` strict.

## Decisions Made

- **Literal `setMaxListeners(50)` at the call site** — Plan 02 acceptance criterion includes a `grep "setMaxListeners(50)"` drift detector. Inlining the literal pins the cap at the structurally-relevant line; a comment above the function references the named constant `MAX_LISTENERS_PER_USER = 50` for human readability without losing the drift-detector grip. Pattern locked for future drift-friendly numeric caps.
- **`AgentEventBus` class + `bus` singleton dual export** — class shape is required by the acceptance grep `contains 'export class AgentEventBus'` (Plan 02 Task 1 acceptance), AND the singleton is what consumers import. Both coexist with zero runtime overhead (the class never gets re-instantiated outside this file). Future test contexts that want a fresh bus instance can `new AgentEventBus()` if needed.
- **Listener parameter type = `DrizzleAgentEvent`, not `never`** — see Deviations below. The plan-spec verbatim test source used `(_row: never) => void` listeners; `tsc --noEmit` strict rejects this because parameter types are contravariant — `never` parameters cannot be assigned to a function that expects `DrizzleAgentEvent`. Using the actual type is the type-honest fix.
- **Test hooks `_size()` / `_listenerCount(userId)` are public, not via reflection** — leading underscore signals "intended for tests, not callers". Plan 02 explicitly calls out these methods as part of the public API for downstream test assertions on no-leak invariants. Future bus implementations (e.g. pg-listen-bus.ts) MUST preserve these methods — they're load-bearing for Plan 02's `100 reconnect cycles` regression detector.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `setMaxListeners(MAX_LISTENERS_PER_USER)` named-constant call rejected by acceptance grep**

- **Found during:** Task 1 — first acceptance-criteria pass.
- **Issue:** Plan-spec verbatim source used `emitter.setMaxListeners(MAX_LISTENERS_PER_USER)` where `MAX_LISTENERS_PER_USER = 50`. The Task 1 acceptance criterion `grep "setMaxListeners(50)"` failed because the call site referenced the named constant instead of the literal.
- **Fix:** Inlined `setMaxListeners(50)` at the call site; preserved the `MAX_LISTENERS_PER_USER = 50` value in a comment block above the function so the named-constant intent isn't lost for future readers. No semantic change.
- **Files modified:** `vigil-core/src/lib/agent-events-bus.ts`
- **Commit:** `aa69c4f`

**2. [Rule 3 - Blocking] Test listener parameter type `never` rejected by `tsc --noEmit`**

- **Found during:** Task 2 — final tsc pass (tests ran fine under `npx tsx --test` because tsx is loose; `tsc --noEmit` is strict).
- **Issue:** Plan-spec verbatim test source declared listener parameters as `(_row: never) => void` and `(row: never) => void`. `tsc --noEmit` produced 12 `TS2345` errors because parameter types are contravariant — a function with a `never` parameter cannot be passed where the accepted type is `(row: DrizzleAgentEvent) => void`. The runtime worked because tsx erases types entirely, but `npx tsc --noEmit` is part of the plan's `<verification>` step and is the structural correctness gate.
- **Fix:** Changed all listener type annotations from `(... : never)` to `(... : Row)` where `type Row = DrizzleAgentEvent`. Imported `DrizzleAgentEvent` from `../../db/types.js`. Updated `fakeRow` to return `Row` (cast through `as unknown as Row` since tests don't depend on populating the full row shape — the bus never reads any field). Runtime semantics unchanged; tests still pass 6/6.
- **Files modified:** `vigil-core/src/lib/__tests__/agent-events-bus.test.ts`
- **Commit:** `fe75ebd`

No Rule 1 / Rule 2 / Rule 4 deviations.

## Issues Encountered

None. Both tasks landed on first runtime-test pass; Task 2 needed one tsc-driven type fix (documented as Rule 3 deviation #2 above).

## Threat Mitigations

| Threat ID | Disposition | Verified by |
|-----------|-------------|-------------|
| T-124-02-01 (Cross-user fan-out leak) | mitigate | `cross-userId isolation` test: subscribes listener on userId=101, emits for userId=102, asserts the listener saw zero events. Sanity branch confirms it DOES fire on userId=101 emit. Map separation is structural, not a runtime check. |
| T-124-02-02 (Listener-leak DoS via reconnect storms) | mitigate | `100 reconnect cycles do not leak listeners` test: 100 round-trip subscribe→unsubscribe pairs leave `bus._size() === 0` AND `bus._listenerCount(7) === 0`. `bus.off()` always deletes the Map entry when `listenerCount === 0`. |
| T-124-02-03 (60+ listeners per user — MaxListeners ceiling) | mitigate | `setMaxListeners(50)` test: subscribes 15 listeners on userId=300, no `MaxListenersExceededWarning` fires (cap is 50, default would have been 10 and warned at the 11th). Plan-level note: hardening to a hard cap is Phase 125 territory if abuse is observed. |
| T-124-02-04 (Bus debug logging surfaces row contents) | accept | `agent-events-bus.ts` has zero `console.*` statements. Doc comment at the top of the file explicitly adopts the project-wide "never log bearer / never log Authorization headers" posture per `feedback_railway_variables_leak`. Code review gate. |

## Self-Check: PASSED

- `vigil-core/src/lib/agent-events-bus.ts` — exists ✓
- `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` — exists ✓
- `aa69c4f` (Task 1 commit) — `git log --oneline | grep aa69c4f` ✓ found
- `fe75ebd` (Task 2 commit) — `git log --oneline | grep fe75ebd` ✓ found
- `cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts` — `# pass 6` ✓
- `cd vigil-core && npx tsc --noEmit` — no errors involving `src/lib/agent-events-bus.ts` or `src/lib/__tests__/agent-events-bus.test.ts` ✓
- All 6 Task 1 acceptance criteria greps pass ✓
- All 7 Task 2 acceptance criteria pass (file existence + 5 substring greps + `# pass 6`) ✓

## Plan-Level Verification

Per the plan's `<verification>` block, all three gates pass:

1. `cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts` → 6/6 green ✓
2. `cd vigil-core && npx tsc --noEmit` → no errors involving `src/lib/agent-events-bus.ts` ✓
3. No imports of `agent-events-bus` exist outside `src/lib/` yet (Plan 03 will wire the SSE route + the agent-events POST hook) ✓

## Hand-off to Plan 03

Plan 03 inherits these load-bearing pre-conditions:

- `import { bus } from "../lib/agent-events-bus.js"` is the import path. The `bus` singleton has the exact shape locked by Plan 02's `<interfaces>` block.
- Plan 03's `agent-events.ts` POST handler MUST gate `bus.emit(userId, row)` on `isNew === true` — emitting on dedupe hits would publish duplicates to subscribers (RESEARCH Anti-Patterns line "Skipping the if (isNew) guard"). Plan 02's bus has no defense against duplicate emits — the contract is that the producer (`agent-events.ts`) emits exactly once per logical event.
- Plan 03's SSE route MUST call `bus.off(userId, listener)` on `stream.onAbort` — without this, listener leaks accumulate and the `100 reconnect cycles` test invariant pinned by Plan 02 silently inverts at the system level (Plan 02 only proves the bus can clean up; the route must actually invoke `off`).
- The cross-user isolation invariant is structural — Plan 03 only needs to ensure the userId passed to `bus.on/off/emit` always comes from `c.get("userId")` (set by `bearerAuth` middleware), never from `req.body.userId`. Plan 121 D-D2 is the lock; Plan 02 makes it cheap to honor.
