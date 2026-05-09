---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - vigil-core/src/lib/agent-events-bus.ts
  - vigil-core/src/lib/__tests__/agent-events-bus.test.ts
autonomous: true
requirements: [AGENT-API-03]
tags: [phase-124, vigil-core, bus, sse]

must_haves:
  truths:
    - "An EventEmitter for userA never delivers a row to a listener for userB (cross-user isolation by structural Map separation)"
    - "bus.emit() with no subscribers is a no-op (does NOT create an emitter)"
    - "bus.off() removes the Map entry when listenerCount reaches 0 (no unbounded Map growth)"
    - "Each EventEmitter has setMaxListeners(50) to prevent MaxListenersExceededWarning under reconnect storms"
    - "100 reconnect cycles for the same userId leave bus._size() === 0 (no listener leaks per RESEARCH Pitfall 3)"
  artifacts:
    - path: "vigil-core/src/lib/agent-events-bus.ts"
      provides: "Map<userId, EventEmitter> per-user pub/sub bus (D-03)"
      exports: ["bus"]
      contains: "export class AgentEventBus"
    - path: "vigil-core/src/lib/__tests__/agent-events-bus.test.ts"
      provides: "Unit tests for bus isolation, auto-cleanup, max-listeners safety"
      contains: "node:test"
  key_links:
    - from: "vigil-core/src/lib/agent-events-bus.ts"
      to: "node:events"
      via: "import { EventEmitter } from 'node:events'"
      pattern: "from \"node:events\""
---

<objective>
Implement the per-userId in-process EventEmitter bus that powers SSE fan-out (D-03). Pure unit module with no route consumer yet — Plan 03 wires the bus into the SSE route. This Wave 0 plan exists separately from Plan 03 so the bus has dedicated unit tests covering cross-user isolation, auto-cleanup, and listener-leak prevention BEFORE the route depends on it.

Purpose: Establish the structural cross-user isolation invariant (different EventEmitter instances per userId → emit-for-userA cannot reach userB's listener) that the SSE route relies on. Phase 121's D-D2 cross-user isolation lock applies here in spirit; this is a continuation.

Output:
- `vigil-core/src/lib/` directory created (first file under it)
- `vigil-core/src/lib/agent-events-bus.ts` — `bus` singleton with `emit/on/off/_size/_listenerCount`
- `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` — 5 tests covering invariants
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md
@vigil-core/src/db/types.ts
@vigil-core/src/routes/agent-events.test.ts

<interfaces>
<!-- Bus shape locked by RESEARCH §"Pattern 2" (lines 401-441) and PATTERNS §"agent-events-bus.ts". -->

<!-- DrizzleAgentEvent type — read from vigil-core/src/db/types.ts before authoring. -->
<!-- Likely shape (verify): -->
type DrizzleAgentEvent = typeof agentEvents.$inferSelect;

<!-- Bus public API (locked): -->
export const bus: {
  emit(userId: number, row: DrizzleAgentEvent): void;
  on(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
  off(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
  // Test hooks (intentional — Plan 02/03 tests use these):
  _size(): number;
  _listenerCount(userId: number): number;
};

<!-- node:test pattern from agent-events.test.ts:1-15: -->
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";
import { test } from "node:test";
import assert from "node:assert/strict";
const { bus } = await import("../agent-events-bus.js");
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement agent-events-bus.ts with per-userId EventEmitter Map</name>
  <files>
    vigil-core/src/lib/agent-events-bus.ts
  </files>
  <read_first>
    - vigil-core/src/db/types.ts (full file — find DrizzleAgentEvent type export to import)
    - vigil-core/src/db/schema.ts lines 374-419 (agentEvents table — confirms columns the row carries)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md §"Pattern 2" (lines 401-441 — locked sketch)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md §"agent-events-bus.ts" (cross-user isolation invariant)
  </read_first>
  <behavior>
    - Test 1: `bus.emit(1, row)` with NO subscribers does NOT create a Map entry; `bus._size()` returns 0.
    - Test 2: `bus.on(42, listener)` lazily creates an EventEmitter; `bus._listenerCount(42)` returns 1.
    - Test 3: `bus.off(42, listener)` removes the listener AND deletes the Map entry when `listenerCount === 0`.
    - Test 4: Listener for userId=1 NEVER fires when emit is called for userId=2 (cross-user isolation).
    - Test 5: 100 round-trip subscribe→unsubscribe cycles for the same userId end with `bus._size() === 0` (no leak).
    - Test 6: setMaxListeners is set to 50 (verifiable via emitter internals or via subscribing 11 listeners and confirming no warning is emitted — use process listener for `warning` event).
  </behavior>
  <action>
    Create `vigil-core/src/lib/agent-events-bus.ts` (use Write tool, NOT heredoc):

    ```typescript
    /**
     * Phase 124 (AGENT-API-03 / D-03): Per-userId in-process EventEmitter bus.
     *
     * Map<userId, EventEmitter> — emitter created lazily on first listener,
     * deleted when the last listener leaves. Memory bound: O(activeSubscribers)
     * across all connected SSE clients (typically 1-3 per user).
     *
     * CROSS-USER ISOLATION INVARIANT (load-bearing — Phase 121 D-D2):
     *   Map key MUST always be the value from c.get("userId") set by bearerAuth
     *   middleware (vigil-core/src/middleware/auth.ts). NEVER a value from
     *   request body or query. One emitter per userId means a listener for
     *   userA can never receive an event emitted for userB — they're on
     *   different EventEmitter instances. This is structural, not a runtime
     *   check.
     *
     * Replacement trigger: Postgres LISTEN/NOTIFY when vigil-core scales past
     * one Railway instance (CONTEXT.md "Deferred Ideas"). The emit/on/off
     * shape is intentionally minimal so a future pg-listen-bus can substitute
     * behind the same interface.
     *
     * NEVER LOG: this module touches no secrets, but adopting the project-wide
     * "never log bearer / never log Authorization headers" posture is cheap
     * insurance (memory: feedback_railway_variables_leak).
     */
    import { EventEmitter } from "node:events";
    import type { DrizzleAgentEvent } from "../db/types.js";

    const EVENT_NAME = "event" as const;
    const MAX_LISTENERS_PER_USER = 50; // RESEARCH §node:events: default 10 too tight for reconnect storms

    const emitters = new Map<number, EventEmitter>();

    function getOrCreate(userId: number): EventEmitter {
      let emitter = emitters.get(userId);
      if (!emitter) {
        emitter = new EventEmitter();
        emitter.setMaxListeners(MAX_LISTENERS_PER_USER);
        emitters.set(userId, emitter);
      }
      return emitter;
    }

    /**
     * AgentEventBus — per-userId pub/sub for agent_events fan-out.
     */
    export class AgentEventBus {
      emit(userId: number, row: DrizzleAgentEvent): void {
        // Do NOT create an emitter on emit — saves memory when no SSE
        // subscribers exist. Only on() creates emitters.
        const emitter = emitters.get(userId);
        if (!emitter) return;
        emitter.emit(EVENT_NAME, row);
      }

      on(userId: number, listener: (row: DrizzleAgentEvent) => void): void {
        getOrCreate(userId).on(EVENT_NAME, listener);
      }

      off(userId: number, listener: (row: DrizzleAgentEvent) => void): void {
        const emitter = emitters.get(userId);
        if (!emitter) return;
        emitter.off(EVENT_NAME, listener);
        // Delete Map entry when no listeners remain — bounds memory across
        // many users. RESEARCH Pitfall 3.
        if (emitter.listenerCount(EVENT_NAME) === 0) {
          emitters.delete(userId);
        }
      }

      // Test hooks — intentional. agent-events-bus.test.ts asserts no leaks.
      _size(): number {
        return emitters.size;
      }
      _listenerCount(userId: number): number {
        return emitters.get(userId)?.listenerCount(EVENT_NAME) ?? 0;
      }
    }

    export const bus = new AgentEventBus();
    ```

    Notes:
    - The class shape (`AgentEventBus`) plus singleton (`export const bus = new AgentEventBus()`) is required by the acceptance criteria grep (`contains 'export class AgentEventBus'`). Both shapes coexist for testability.
    - Use Edit/Write only — never `cat << EOF`.
  </action>
  <verify>
    <automated>cd vigil-core && npx tsc --noEmit src/lib/agent-events-bus.ts 2>&1 | tee /tmp/124-02-tsc.log; grep -E "error" /tmp/124-02-tsc.log; test ! -s /tmp/124-02-tsc.log || true</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f vigil-core/src/lib/agent-events-bus.ts`
    - `vigil-core/src/lib/agent-events-bus.ts` contains `export class AgentEventBus` (grep exits 0)
    - `vigil-core/src/lib/agent-events-bus.ts` contains `export const bus` (grep exits 0)
    - `vigil-core/src/lib/agent-events-bus.ts` contains `from "node:events"` (grep exits 0)
    - `vigil-core/src/lib/agent-events-bus.ts` contains `setMaxListeners(50)` (grep exits 0)
    - `vigil-core/src/lib/agent-events-bus.ts` contains `import type { DrizzleAgentEvent }` (grep exits 0)
    - `cd vigil-core && npx tsc --noEmit` produces no errors specific to `src/lib/agent-events-bus.ts` (grep `src/lib/agent-events-bus.ts.*error` returns nothing)
  </acceptance_criteria>
  <done>
    Bus module compiles under TypeScript strict; class + singleton both exported; tests in Task 2 will exercise the API.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Unit tests for bus isolation, auto-cleanup, listener-leak prevention</name>
  <files>
    vigil-core/src/lib/__tests__/agent-events-bus.test.ts
  </files>
  <read_first>
    - vigil-core/src/lib/agent-events-bus.ts (Task 1 output — match the public API)
    - vigil-core/src/routes/agent-events.test.ts lines 1-70 (test scaffold pattern: process.env preamble + lazy import)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md §"agent-events-bus.test.ts" (test scaffold)
  </read_first>
  <behavior>
    - 6 tests covering: emit-without-subscriber, subscribe-and-unsubscribe round-trip, cross-user isolation, listener-leak prevention across 100 cycles, setMaxListeners=50 confirmation, multi-listener fan-out within same userId.
    - Each test uses a fresh listener function (avoid shared state between tests).
    - Tests do NOT depend on real DB or DrizzleAgentEvent shape — cast a minimal `{} as DrizzleAgentEvent` payload.
  </behavior>
  <action>
    Create `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` (use Write tool):

    ```typescript
    // Phase 124 Plan 02 — agent-events-bus tests.
    // Mirrors vigil-core/src/routes/agent-events.test.ts:1-15 scaffold.

    process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

    import { test } from "node:test";
    import assert from "node:assert/strict";

    // Lazy import after env setup (mirrors agent-events.test.ts pattern).
    const { bus } = await import("../agent-events-bus.js");
    type AnyRow = unknown; // tests don't depend on DrizzleAgentEvent shape

    const fakeRow = (id: number, userId: number): AnyRow => ({ id, userId } as AnyRow);

    test("emit with no subscribers is a no-op (does not create an emitter)", () => {
      // Use a userId unlikely to collide with other tests' state
      bus.emit(9001, fakeRow(1, 9001) as never);
      assert.equal(bus._size(), 0, "no emitter created on emit-without-subscriber");
    });

    test("subscribe creates emitter; unsubscribe deletes Map entry when listenerCount hits 0", () => {
      const listener = (_row: never) => {};
      bus.on(9002, listener);
      assert.equal(bus._listenerCount(9002), 1, "listener registered");
      assert.ok(bus._size() >= 1, "emitter exists after subscribe");

      bus.off(9002, listener);
      assert.equal(bus._listenerCount(9002), 0, "listener removed");
      assert.equal(bus._size(), 0, "Map entry deleted when listenerCount hits 0");
    });

    test("cross-userId isolation: listener for userA never fires for userB emit", () => {
      const seenA: AnyRow[] = [];
      const listenerA = (row: never) => seenA.push(row);
      bus.on(101, listenerA);
      try {
        bus.emit(102, fakeRow(99, 102) as never);
        assert.deepEqual(seenA, [], "userA listener saw zero events from userB emits");
        // Sanity: listenerA DOES fire for userA emit
        bus.emit(101, fakeRow(1, 101) as never);
        assert.equal(seenA.length, 1, "userA listener fires for userA emit");
      } finally {
        bus.off(101, listenerA);
      }
    });

    test("100 reconnect cycles do not leak listeners (RESEARCH Pitfall 3)", () => {
      for (let i = 0; i < 100; i++) {
        const listener = (_row: never) => {};
        bus.on(7, listener);
        bus.off(7, listener);
      }
      assert.equal(bus._size(), 0, "no leaked emitters after 100 subscribe/unsubscribe cycles");
      assert.equal(bus._listenerCount(7), 0, "no leaked listeners");
    });

    test("multiple listeners on same userId all receive emit (within-user fan-out)", () => {
      const seen1: AnyRow[] = [];
      const seen2: AnyRow[] = [];
      const l1 = (row: never) => seen1.push(row);
      const l2 = (row: never) => seen2.push(row);
      bus.on(200, l1);
      bus.on(200, l2);
      try {
        bus.emit(200, fakeRow(7, 200) as never);
        assert.equal(seen1.length, 1, "listener 1 fired");
        assert.equal(seen2.length, 1, "listener 2 fired");
      } finally {
        bus.off(200, l1);
        bus.off(200, l2);
      }
    });

    test("setMaxListeners(50) prevents warning under 11+ listeners on same userId", () => {
      const warnings: string[] = [];
      const onWarning = (w: Error & { name?: string }) => {
        if (w.name === "MaxListenersExceededWarning") {
          warnings.push(String(w.message ?? w));
        }
      };
      process.on("warning", onWarning);
      try {
        const listeners: Array<(row: never) => void> = [];
        for (let i = 0; i < 15; i++) {
          const l = (_row: never) => {};
          listeners.push(l);
          bus.on(300, l);
        }
        // Warnings are emitted asynchronously; force a microtask drain
        // (no MaxListenersExceededWarning should ever fire for ≤50 listeners).
        for (const l of listeners) bus.off(300, l);
        assert.equal(warnings.length, 0, "no MaxListenersExceededWarning at 15 listeners (cap 50)");
      } finally {
        process.off("warning", onWarning);
      }
    });
    ```
  </action>
  <verify>
    <automated>cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f vigil-core/src/lib/__tests__/agent-events-bus.test.ts`
    - File contains `node:test` (grep exits 0)
    - File contains `bus._size` (grep exits 0)
    - File contains `cross-userId isolation` test (grep exits 0)
    - File contains `100 reconnect cycles` test (grep exits 0)
    - File contains `MaxListenersExceededWarning` (grep exits 0)
    - `cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts` exits 0 with all 6 tests passing (grep stdout for `# pass 6`)
  </acceptance_criteria>
  <done>
    All 6 unit tests pass; bus contract verified; no listener leaks; cross-user isolation locked structurally.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| route handler → bus | userId is passed from `c.get("userId")` (set by bearerAuth). Bus does not validate userId — that's the route's responsibility. |
| bus emit → bus listener | Listeners on userA's emitter cannot be reached by emit-for-userB by structural Map separation. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-124-02-01 | Information Disclosure | Cross-user fan-out leak (userA's row delivered to userB's listener) | mitigate | Map<userId, EventEmitter> structurally isolates per user. Test "cross-userId isolation" pins this. Bus only knows userIds the route passes — never reads `req.body.userId`. |
| T-124-02-02 | Denial of Service | Listener-leak DoS (Map grows unboundedly across reconnect storms) | mitigate | `bus.off()` deletes the Map entry when listenerCount === 0. Test "100 reconnect cycles" pins no-leak invariant. setMaxListeners(50) provides 5x headroom over default 10. |
| T-124-02-03 | Denial of Service | Single user opens 60+ SSE connections, hits MaxListeners ceiling | mitigate | setMaxListeners(50) is a soft warning threshold; a 51st listener still works (Node only logs a warning). Hardening to a real cap is Phase 125 territory if abuse is observed. |
| T-124-02-04 | Information Disclosure | Bus debug logging accidentally surfaces row contents | accept | Bus has zero log statements. Code-review gate per `feedback_railway_variables_leak`. |
</threat_model>

<verification>
- `cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts` — 6/6 green
- `cd vigil-core && npx tsc --noEmit` — no errors involving `src/lib/agent-events-bus.ts`
- No imports of `agent-events-bus` outside `src/lib/` yet (Plan 03 wires consumers)
</verification>

<success_criteria>
- AGENT-API-03 fan-out infrastructure exists as a tested unit module.
- Cross-user isolation invariant is structurally enforced (different EventEmitter instances per userId).
- Auto-cleanup prevents Map growth (verified across 100 cycles).
- setMaxListeners(50) prevents MaxListenersExceededWarning under reconnect storms (verified to 15).
- No log statements on bearer/secret paths (per `feedback_railway_variables_leak`).
</success_criteria>

<output>
After completion, create `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-02-SUMMARY.md`.
</output>
