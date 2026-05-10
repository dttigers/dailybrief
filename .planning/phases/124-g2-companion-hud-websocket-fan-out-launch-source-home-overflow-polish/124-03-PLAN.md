---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 03
type: execute
wave: 1
depends_on: [02]
files_modified:
  - vigil-core/src/routes/agent-stream.ts
  - vigil-core/src/routes/__tests__/agent-stream.test.ts
  - vigil-core/src/routes/agent-events.ts
  - vigil-core/src/routes/agent-events.test.ts
  - vigil-core/src/index.ts
  - vigil-core/src/integration/cross-user-isolation.test.ts
autonomous: true
requirements: [AGENT-API-03]
tags: [phase-124, vigil-core, sse, hono, agent-stream]

must_haves:
  truths:
    - "GET /v1/agent-stream returns Content-Type: text/event-stream"
    - "GET /v1/agent-stream is registered AFTER bearerAuth dispatcher (no auth bypass)"
    - "POST /v1/agent-events with isNew=true causes bus.emit; isNew=false (dedupe) does NOT emit"
    - "GET /v1/agent-stream with Last-Event-ID: 5 replays rows where id > 5 AND event_timestamp > now() - 24h, in id ASC order"
    - "Last-Event-ID: -1 OR garbage produces zero replay rows (defensive parse, not 'every row')"
    - "userA's SSE connection NEVER receives events emitted for userB (cross-user isolation locked)"
    - "After client aborts, bus._listenerCount(userId) returns to 0 (listener cleanup via stream.onAbort)"
    - "Server emits event: ping every 25s as keepalive (iOS NAT idle-kill mitigation)"
    - "No bearer key or Authorization header value is logged anywhere in agent-stream.ts (per feedback_railway_variables_leak)"
  artifacts:
    - path: "vigil-core/src/routes/agent-stream.ts"
      provides: "Hono streamSSE handler at GET /v1/agent-stream with Last-Event-ID replay + bus subscription + onAbort cleanup + 25s keepalive"
      exports: ["createAgentStreamRoute", "agentStream"]
      contains: "streamSSE"
    - path: "vigil-core/src/routes/__tests__/agent-stream.test.ts"
      provides: "Integration tests covering replay correctness, cross-user isolation, Last-Event-ID parse defense, abort cleanup"
      contains: "node:test"
    - path: "vigil-core/src/index.ts"
      provides: "Mount of agent-stream router AFTER bearerAuth dispatcher"
      contains: "app.route(\"/v1\", agentStream)"
  key_links:
    - from: "vigil-core/src/routes/agent-events.ts"
      to: "vigil-core/src/lib/agent-events-bus.ts"
      via: "bus.emit(userId, row) on isNew=true"
      pattern: "if \\(isNew\\) deps\\.bus\\?\\.emit"
    - from: "vigil-core/src/routes/agent-stream.ts"
      to: "vigil-core/src/lib/agent-events-bus.ts"
      via: "bus.on(userId, listener) inside streamSSE callback"
      pattern: "bus\\.on\\("
    - from: "vigil-core/src/routes/agent-stream.ts"
      to: "vigil-core/src/db/schema.ts:agentEvents"
      via: "Drizzle replay query (gt id, gt event_timestamp, eq user_id, orderBy id)"
      pattern: "agentEvents\\.id"
---

<objective>
Implement the SSE endpoint, the bus.emit hook in the existing POST handler, the index.ts mount, and the cross-user isolation lock test extension. After this plan ships, vigil-core can deliver agent_events to subscribed plugin clients in real time, replay missed events on reconnect via Last-Event-ID (24h-bounded), and survive iOS NAT idle-kills via 25s server-side keepalive pings.

Per D-01: SSE on `GET /v1/agent-stream` (verbatim path). Per D-02: Last-Event-ID resume bounded to last 24h. Per D-03: per-userId EventEmitter (Plan 02) wired into POST handler on `isNew=true` only.

Purpose:
- AGENT-API-03 — fan out new agent_events as `event: agent-event` SSE frames per userId.
- Lock cross-user isolation structurally (Map separation in Plan 02 + extended cross-user-isolation.test.ts here).
- Make the SSE endpoint resumable across reconnects (Last-Event-ID replay query).

Output:
- `vigil-core/src/routes/agent-stream.ts` (NEW, ~150 lines) — Hono streamSSE handler with DI factory shape
- `vigil-core/src/routes/__tests__/agent-stream.test.ts` (NEW) — 7 tests
- `vigil-core/src/routes/agent-events.ts` (MODIFIED) — single-line bus.emit hook + AgentEventsDeps extension
- `vigil-core/src/routes/agent-events.test.ts` (MODIFIED) — 2 new tests for emit gating
- `vigil-core/src/index.ts` (MODIFIED) — mount /v1/agent-stream after bearerAuth
- `vigil-core/src/integration/cross-user-isolation.test.ts` (MODIFIED) — block 4 for SSE
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
@.planning/phases/121-agent-events-api-foundation-cross-user-isolation-lock/121-CONTEXT.md
@vigil-core/src/routes/agent-events.ts
@vigil-core/src/routes/agent-events.test.ts
@vigil-core/src/integration/cross-user-isolation.test.ts
@vigil-core/src/db/schema.ts
@vigil-core/src/db/types.ts
@vigil-core/src/index.ts
@vigil-core/src/lib/agent-events-bus.ts

<interfaces>
<!-- ============================================================ -->
<!-- LOCKED CONTRACTS — copy these into the implementation -->
<!-- ============================================================ -->

<!-- Hono streamSSE signature (from RESEARCH §"Pattern 1") -->
import { streamSSE } from "hono/streaming";

interface SSEMessage {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
}

declare class SSEStreamingApi {
  aborted: boolean;   // public — check before writing
  closed: boolean;    // public — check before writing
  onAbort(listener: () => void): void;
  writeSSE(message: SSEMessage): Promise<void>;
}

<!-- DI factory shape (from PATTERNS.md §agent-stream.ts) -->
import type { DrizzleAgentEvent } from "../db/types.js";

export interface AgentStreamDeps {
  dbAvailable: boolean;
  bus: {
    on(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
    off(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
  };
  dbReplayMissed: (
    userId: number,
    afterId: number,
    cutoff: Date,
  ) => Promise<DrizzleAgentEvent[]>;
}

<!-- Last-Event-ID parse (RESEARCH Pitfall 2 — defensive) -->
const raw = c.req.header("Last-Event-ID");
const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
const resumeFrom =
  Number.isFinite(parsed) && parsed >= 0 && parsed < 2_147_483_647
    ? parsed
    : null;

<!-- Replay query (RESEARCH §"Code Examples — Drizzle replay query") -->
import { gt, eq, and } from "drizzle-orm";
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
db.select().from(agentEvents).where(and(
  eq(agentEvents.userId, userId),
  gt(agentEvents.id, lastEventId),
  gt(agentEvents.eventTimestamp, cutoff),
)).orderBy(agentEvents.id);

<!-- Agent-events POST hook (PATTERNS.md §"agent-events.ts — MODIFIED"): -->
const { row, isNew } = await deps.dbInsertOrGet(newRow);
if (isNew) {
  deps.bus?.emit(userId, row);  // ← single new line
}
return c.json(row, isNew ? 201 : 200);

<!-- Mount in index.ts (PATTERNS.md §"index.ts — MODIFIED"): -->
import { agentStream } from "./routes/agent-stream.js";
// AFTER existing app.route("/v1", agentEvents); at line 210:
app.route("/v1", agentStream);
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create agent-stream.ts SSE route + extend agent-events.ts with bus.emit hook + mount in index.ts</name>
  <files>
    vigil-core/src/routes/agent-stream.ts,
    vigil-core/src/routes/agent-events.ts,
    vigil-core/src/index.ts
  </files>
  <read_first>
    - vigil-core/src/routes/agent-events.ts (FULL file — DI factory shape, lines 49-77; KNOWN_FIELDS validate; line 237-239 dbInsertOrGet return point)
    - vigil-core/src/db/schema.ts lines 374-419 (agentEvents table — id, userId, eventTimestamp columns)
    - vigil-core/src/db/types.ts (DrizzleAgentEvent type)
    - vigil-core/src/index.ts (full file — mount order: bearerAuth at line 136; metricsMiddleware at line 158; agentEvents at line 210)
    - vigil-core/src/middleware/auth.ts (bearerAuth contract — c.set("userId"))
    - vigil-core/src/lib/agent-events-bus.ts (Plan 02 output — bus public API)
    - vigil-core/node_modules/hono/dist/types/helper/streaming/sse.d.ts (streamSSE signature)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md §"Pattern 1" (lines 271-393 — full streamSSE handler sketch)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md §"agent-stream.ts" + §"agent-events.ts (MODIFIED)" + §"index.ts (MODIFIED)"
  </read_first>
  <behavior>
    - Test 1: GET /v1/agent-stream with no Last-Event-ID returns 200 + Content-Type: text/event-stream + only live frames (no replay).
    - Test 2: GET /v1/agent-stream with Last-Event-ID: 5 invokes dbReplayMissed(userId, 5, cutoff) where cutoff is ~24h before now.
    - Test 3: POST /v1/agent-events with new payload (isNew=true) triggers bus.emit; POST same payload again (isNew=false) does NOT trigger bus.emit.
    - Test 4: Stream emits event: ping frames at ~25s intervals (test with mocked timer or short interval).
    - Test 5: stream.onAbort fires when client closes; listener is bus.off'd; bus._listenerCount returns to 0.
    - Test 6: c.get("userId") is the only userId source — request body cannot inject a different userId for fan-out.
    - Test 7: No console.log calls reference Authorization, Bearer, vk_, or API_KEY in agent-stream.ts (drift detector).
  </behavior>
  <action>
    ## Step A: Create `vigil-core/src/routes/agent-stream.ts`

    Use Write tool. Mirror the DI factory shape of `agent-events.ts:49-77` and the streamSSE pattern from RESEARCH.md §"Pattern 1" (lines 271-393):

    ```typescript
    /**
     * Phase 124 (AGENT-API-03 / D-01, D-02, D-03): SSE fan-out route.
     *
     * GET /v1/agent-stream — Hono streamSSE handler.
     *   - bearerAuth dispatcher (mounted in index.ts) sets c.get("userId").
     *   - Replays missed events from agent_events WHERE user_id = ? AND id > ?
     *     AND event_timestamp > now() - 24h, in id ASC order, when
     *     Last-Event-ID header is present and parses to a valid non-negative int.
     *   - Subscribes to bus via bus.on(userId, listener).
     *   - Emits event: ping every 25s (iOS NAT idle-kill mitigation, RESEARCH
     *     Pitfall 7).
     *   - Cleans up via stream.onAbort(): clearInterval(keepalive); bus.off(...).
     *   - Holds the connection open via await new Promise<void>(resolve =>
     *     stream.onAbort(resolve)) to prevent Hono auto-closing the response
     *     after the callback resolves (RESEARCH Pitfall 1).
     *
     * SECURITY (memory: feedback_railway_variables_leak):
     *   - NEVER log Authorization, Bearer, vk_, or API_KEY values.
     *   - Bearer is consumed by bearerAuth middleware (vigil-core/src/middleware/auth.ts).
     *     This route never reads c.req.header("Authorization") directly.
     */
    import { Hono } from "hono";
    import { streamSSE } from "hono/streaming";
    import { and, eq, gt } from "drizzle-orm";
    import { db } from "../db/connection.js";
    import { agentEvents } from "../db/schema.js";
    import type { DrizzleAgentEvent } from "../db/types.js";
    import { bus } from "../lib/agent-events-bus.js";

    const KEEPALIVE_INTERVAL_MS = 25_000;
    const REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;
    const INT32_MAX = 2_147_483_647;

    export interface AgentStreamDeps {
      dbAvailable: boolean;
      bus: {
        on(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
        off(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
      };
      dbReplayMissed: (
        userId: number,
        afterId: number,
        cutoff: Date,
      ) => Promise<DrizzleAgentEvent[]>;
    }

    export function createAgentStreamRoute(deps: AgentStreamDeps): Hono {
      const router = new Hono();

      router.get("/agent-stream", (c) => {
        // userId is non-null because the route is registered AFTER the bearerAuth
        // dispatcher at index.ts:135. NEVER trust req.body.userId. Mirror
        // agent-events.ts:91 comment — load-bearing for cross-user isolation lock.
        const userId = c.get("userId") as number;

        // Defensive Last-Event-ID parse (RESEARCH Pitfall 2):
        //   - Negative → null (don't replay everything)
        //   - NaN/garbage → null
        //   - >= INT32_MAX → null (postgres int4 column won't have higher ids)
        const raw = c.req.header("Last-Event-ID");
        const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
        const resumeFrom =
          Number.isFinite(parsed) && parsed >= 0 && parsed < INT32_MAX
            ? parsed
            : null;

        return streamSSE(c, async (stream) => {
          // Phase 1: Replay missed events (only when Last-Event-ID is valid)
          if (resumeFrom !== null) {
            const cutoff = new Date(Date.now() - REPLAY_WINDOW_MS);
            const missed = await deps.dbReplayMissed(userId, resumeFrom, cutoff);
            for (const row of missed) {
              if (stream.aborted || stream.closed) return;
              await stream.writeSSE({
                event: "agent-event",
                id: String(row.id),
                data: JSON.stringify(row),
              });
            }
          }

          // Phase 2: Live attach. Listener closure captures stream — defined
          // INSIDE this callback so the cleanup hook references the same
          // closure (RESEARCH Pitfall 3).
          const listener = (row: DrizzleAgentEvent) => {
            if (stream.aborted || stream.closed) return;
            // Fire-and-forget — writeSSE returns Promise but we don't await
            // (the listener signature is sync). Hono buffers internally.
            void stream.writeSSE({
              event: "agent-event",
              id: String(row.id),
              data: JSON.stringify(row),
            });
          };
          deps.bus.on(userId, listener);

          // Phase 3: 25s keepalive — Hono streamSSE does NOT auto-emit pings.
          const keepalive = setInterval(() => {
            if (stream.aborted || stream.closed) return;
            void stream.writeSSE({ event: "ping", data: "" });
          }, KEEPALIVE_INTERVAL_MS);

          // Phase 4: Cleanup. Both bus.off and clearInterval reference the
          // closure-captured listener + keepalive — pairs always match.
          stream.onAbort(() => {
            clearInterval(keepalive);
            deps.bus.off(userId, listener);
          });

          // Phase 5: Hold the connection open. Without this, the streamSSE
          // callback resolves and Hono closes the ReadableStream — listener
          // would fire forever into a closed stream (RESEARCH Pitfall 1).
          await new Promise<void>((resolve) => {
            stream.onAbort(resolve);
          });
        });
      });

      return router;
    }

    // Production singleton — mirror agent-events.ts:280+ pattern.
    export const agentStream$Route = createAgentStreamRoute({
      get dbAvailable() {
        return !!db;
      },
      bus,
      dbReplayMissed: async (userId, afterId, cutoff) => {
        if (!db) return [];
        return db
          .select()
          .from(agentEvents)
          .where(
            and(
              eq(agentEvents.userId, userId),
              gt(agentEvents.id, afterId),
              gt(agentEvents.eventTimestamp, cutoff),
            ),
          )
          .orderBy(agentEvents.id);
      },
    });
    export { agentStream$Route as agentStream };
    ```

    ## Step B: Modify `vigil-core/src/routes/agent-events.ts`

    Use Edit tool. Two changes:

    1. **Add bus import at top of file** (insert near other route-internal imports, e.g. after the schema/types imports):
    ```typescript
    import { bus as defaultBus } from "../lib/agent-events-bus.js";
    ```

    2. **Extend AgentEventsDeps interface** (append `bus?` field — keep optional so existing tests don't break):
    ```typescript
    export interface AgentEventsDeps {
      dbAvailable: boolean;
      dbInsertOrGet: ...;          // keep existing
      dbListSessions: ...;          // keep existing
      // Phase 124 (AGENT-API-03): per-userId fan-out hook. Optional so legacy
      // tests under agent-events.test.ts that pre-date Phase 124 still wire.
      // Production singleton wires the real bus below.
      bus?: {
        emit(userId: number, row: DrizzleAgentEvent): void;
      };
    }
    ```

    3. **Add bus.emit hook at line 237** (immediately after `dbInsertOrGet` returns):
    ```typescript
    const { row, isNew } = await deps.dbInsertOrGet(newRow);
    // Phase 124 (AGENT-API-03 / D-03): fan out to per-userId SSE subscribers.
    // MUST be gated on isNew — Phase 121 dedupe means the same client payload
    // may POST twice (network retry); emitting both times would publish
    // duplicates to subscribers (CONTEXT D-03 + RESEARCH Anti-Patterns).
    if (isNew) {
      deps.bus?.emit(userId, row);
    }
    // D-C2: 201 on fresh insert, 200 on idempotent dup (same body shape)
    return c.json(row, isNew ? 201 : 200);
    ```

    4. **Update production singleton** at the bottom of the file (where `createAgentEventsRoute({ ... })` is called) — add `bus: defaultBus,` to the deps object.

    ## Step C: Modify `vigil-core/src/index.ts`

    Use Edit tool. Two changes:

    1. **Add import** near existing `import { agentEvents }` line (~line 43):
    ```typescript
    import { agentStream } from "./routes/agent-stream.js";
    ```

    2. **Add mount** immediately after `app.route("/v1", agentEvents);` at line 210:
    ```typescript
    // Phase 124 (AGENT-API-03): per-userId SSE fan-out for agent_events.
    // SAME mount-order constraint as agentEvents above — MUST be after the
    // bearerAuth dispatcher at line 135 AND after the metricsMiddleware at
    // line 158. Do NOT move above line 135 — would create a silent auth
    // bypass (cross-user fan-out becomes possible). Mirror agent-events
    // mount comment.
    app.route("/v1", agentStream);
    ```

    ## Step D: Verify TypeScript compiles

    ```
    cd vigil-core && npx tsc --noEmit
    ```

    No errors should be specific to the new/modified files.
  </action>
  <verify>
    <automated>cd vigil-core && npx tsc --noEmit 2>&1 | grep -E "agent-(stream|events)\.ts|src/index\.ts" | grep -v "^# " | head -20 ; echo "---tsc-check-complete---"</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f vigil-core/src/routes/agent-stream.ts`
    - `vigil-core/src/routes/agent-stream.ts` contains `streamSSE` (grep exits 0)
    - `vigil-core/src/routes/agent-stream.ts` contains `from "hono/streaming"` (grep exits 0)
    - `vigil-core/src/routes/agent-stream.ts` contains `c.get("userId")` (grep exits 0)
    - `vigil-core/src/routes/agent-stream.ts` contains `Last-Event-ID` (grep exits 0)
    - `vigil-core/src/routes/agent-stream.ts` contains `Number.isFinite(parsed) && parsed >= 0 && parsed < INT32_MAX` (grep exits 0; defensive parse RESEARCH Pitfall 2)
    - `vigil-core/src/routes/agent-stream.ts` contains `setInterval` AND `25_000` AND `clearInterval` (3 separate greps each exit 0; keepalive)
    - `vigil-core/src/routes/agent-stream.ts` contains `stream.onAbort(resolve)` (grep exits 0; hold-open per RESEARCH Pitfall 1)
    - `vigil-core/src/routes/agent-stream.ts` contains `bus.on(userId` AND `bus.off(userId` (both greps exit 0)
    - `vigil-core/src/routes/agent-stream.ts` does NOT contain `console.log` referencing Bearer/Authorization/vk_/API_KEY: `grep -E '(console\.(log|error|warn|info)).*(Bearer|Authorization|vk_|API_KEY)' vigil-core/src/routes/agent-stream.ts` exits non-zero (no matches)
    - `vigil-core/src/routes/agent-events.ts` contains `if (isNew)` and `deps.bus?.emit(userId` (both greps exit 0)
    - `vigil-core/src/routes/agent-events.ts` contains `bus?:` in interface (grep `bus\?:` exits 0)
    - `vigil-core/src/index.ts` contains `import { agentStream }` (grep exits 0)
    - `vigil-core/src/index.ts` contains `app.route("/v1", agentStream)` (grep exits 0)
    - `cd vigil-core && npx tsc --noEmit` produces zero errors involving `agent-stream.ts`, `agent-events.ts`, or `src/index.ts` (grep on output finds none)
  </acceptance_criteria>
  <done>
    SSE route exists with full streamSSE handler; bus.emit hook is wired into POST handler with isNew gate; index.ts mounts the route after bearerAuth; entire vigil-core compiles under TypeScript strict.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Integration tests for SSE route + agent-events emit gating + cross-user-isolation extension</name>
  <files>
    vigil-core/src/routes/__tests__/agent-stream.test.ts,
    vigil-core/src/routes/agent-events.test.ts,
    vigil-core/src/integration/cross-user-isolation.test.ts
  </files>
  <read_first>
    - vigil-core/src/routes/agent-events.test.ts (full file — `makeApp(deps, userId)` helper at lines 62-70, `makeDeps` factory at lines 38-57)
    - vigil-core/src/integration/cross-user-isolation.test.ts (full file — existing block 1-3 structure for adding block 4)
    - vigil-core/src/routes/agent-stream.ts (Task 1 output — match the API)
    - vigil-core/src/routes/agent-events.ts (Task 1 output — match the new bus field)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md §"agent-stream.test.ts" (test scaffold + readNFrames helper + T1-T7 numbering)
  </read_first>
  <behavior>
    - 7 tests in agent-stream.test.ts (T1-T7 from PATTERNS) covering: no-replay-without-header, replay-with-Last-Event-ID, parse defense (-1, garbage), cross-user isolation, abort cleanup, replay 24h cutoff bound.
    - 2 new tests in agent-events.test.ts: (a) POST with isNew=true emits to bus; (b) POST with isNew=false does NOT emit.
    - 1 new block in cross-user-isolation.test.ts: SSE userA stream NEVER receives userB bus.emit.
  </behavior>
  <action>
    ## Step A: Create `vigil-core/src/routes/__tests__/agent-stream.test.ts`

    Use Write tool. Mirror agent-events.test.ts scaffold (process.env JWT_SECRET, lazy import, makeApp helper). Add a fakeBus stub plus a readNFrames helper for SSE response parsing.

    Key test cases (see PATTERNS.md §"agent-stream.test.ts" for the verbatim T1-T7 specs):
    - **T1 (no replay):** GET with no Last-Event-ID → fakeReplay never called → no replay frames; only live frames after `bus.emit`.
    - **T2 (replay with Last-Event-ID):** GET with `Last-Event-ID: 5` → fakeReplay called with `(userId, 5, cutoffDate)` → emits 2 stub rows as `agent-event` frames in id ASC order.
    - **T3 (parse defense — negative):** GET with `Last-Event-ID: -1` → fakeReplay NOT called (resumeFrom is null).
    - **T4 (parse defense — garbage):** GET with `Last-Event-ID: foo` → fakeReplay NOT called.
    - **T5 (cross-user isolation):** Two streams (userA=1, userB=2) on the same fakeBus. emit-for-userA fires → userA stream receives; userB stream does NOT.
    - **T6 (abort cleanup):** Stream open → reader.cancel() → wait microtask → bus.off was called once; bus has no listeners for that userId.
    - **T7 (24h cutoff):** GET with `Last-Event-ID: 1` → fakeReplay receives a `cutoff` Date that is within 1s of `now - 24h`.

    Scaffold sketch (full file in PATTERNS §"agent-stream.test.ts"):
    ```typescript
    process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

    import { test } from "node:test";
    import assert from "node:assert/strict";
    import { Hono } from "hono";

    const { createAgentStreamRoute } = await import("../agent-stream.js");

    type AnyRow = { id: number; userId: number; event: string; eventTimestamp: string };

    function makeFakeBus() {
      const listeners = new Map<number, Set<(row: AnyRow) => void>>();
      return {
        on(userId: number, fn: (r: AnyRow) => void) {
          const s = listeners.get(userId) ?? new Set();
          s.add(fn);
          listeners.set(userId, s);
        },
        off(userId: number, fn: (r: AnyRow) => void) {
          listeners.get(userId)?.delete(fn);
        },
        emit(userId: number, row: AnyRow) {
          listeners.get(userId)?.forEach(fn => fn(row));
        },
        listenerCount(userId: number) {
          return listeners.get(userId)?.size ?? 0;
        },
      };
    }

    function makeApp(opts: { userId: number; bus: ReturnType<typeof makeFakeBus>; replay?: AnyRow[] }) {
      const app = new Hono();
      app.use("*", async (c, next) => { c.set("userId", opts.userId); await next(); });
      app.route(
        "/",
        createAgentStreamRoute({
          dbAvailable: true,
          bus: opts.bus as never,
          dbReplayMissed: async (_uid, _afterId, _cutoff) => (opts.replay ?? []) as never,
        }),
      );
      return app;
    }

    async function readFrames(res: Response, n: number, timeoutMs = 1000): Promise<string[]> {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const frames: string[] = [];
      let buf = "";
      const deadline = Date.now() + timeoutMs;
      while (frames.length < n && Date.now() < deadline) {
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise<{ done: true; value: undefined }>((r) =>
            setTimeout(() => r({ done: true, value: undefined }), Math.max(0, deadline - Date.now())),
          ),
        ]);
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0 && frames.length < n) {
          frames.push(buf.slice(0, idx));
          buf = buf.slice(idx + 2);
        }
      }
      void reader.cancel();
      return frames;
    }

    function parseFrame(raw: string): { event?: string; data?: string; id?: string } {
      const out: { event?: string; data?: string; id?: string } = {};
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) out.event = line.slice(6).trim();
        else if (line.startsWith("data:")) out.data = (out.data ?? "") + line.slice(5).trim();
        else if (line.startsWith("id:")) out.id = line.slice(3).trim();
      }
      return out;
    }

    test("T1: no Last-Event-ID → no replay; live frame delivered on emit", async () => {
      const bus = makeFakeBus();
      const app = makeApp({ userId: 1, bus, replay: [{ id: 99, userId: 1, event: "heartbeat", eventTimestamp: new Date().toISOString() }] });
      const reqPromise = app.request("/agent-stream", { headers: { Accept: "text/event-stream" } });
      const res = await reqPromise;
      // Emit one event; should appear as the first non-ping frame.
      bus.emit(1, { id: 100, userId: 1, event: "heartbeat", eventTimestamp: new Date().toISOString() } as AnyRow);
      const frames = await readFrames(res, 1, 500);
      const parsed = frames.map(parseFrame).filter(f => f.event === "agent-event");
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].id, "100");
      // Replay was NOT used since no Last-Event-ID
      // (verify: 99 not in seen ids)
      assert.notEqual(parsed[0].id, "99");
    });

    test("T2: Last-Event-ID: 5 → dbReplayMissed called with (1, 5, cutoff); rows replayed in id ASC", async () => {
      let captured: { userId: number; afterId: number; cutoff: Date } | null = null;
      const bus = makeFakeBus();
      const app = new Hono();
      app.use("*", async (c, next) => { c.set("userId", 1); await next(); });
      app.route("/", createAgentStreamRoute({
        dbAvailable: true,
        bus: bus as never,
        dbReplayMissed: async (uid, afterId, cutoff) => {
          captured = { userId: uid, afterId, cutoff };
          return [
            { id: 6, userId: 1, event: "heartbeat", eventTimestamp: new Date().toISOString() },
            { id: 7, userId: 1, event: "milestone", eventTimestamp: new Date().toISOString() },
          ] as never;
        },
      }));
      const res = await app.request("/agent-stream", { headers: { "Last-Event-ID": "5", Accept: "text/event-stream" } });
      const frames = await readFrames(res, 2, 500);
      const parsed = frames.map(parseFrame).filter(f => f.event === "agent-event");
      assert.deepEqual(parsed.map(f => f.id), ["6", "7"]);
      assert.equal(captured?.userId, 1);
      assert.equal(captured?.afterId, 5);
    });

    test("T3: Last-Event-ID: -1 → dbReplayMissed NOT called", async () => {
      let called = 0;
      const bus = makeFakeBus();
      const app = new Hono();
      app.use("*", async (c, next) => { c.set("userId", 1); await next(); });
      app.route("/", createAgentStreamRoute({
        dbAvailable: true,
        bus: bus as never,
        dbReplayMissed: async () => { called++; return []; },
      }));
      const res = await app.request("/agent-stream", { headers: { "Last-Event-ID": "-1", Accept: "text/event-stream" } });
      // Drain a tiny bit so the replay phase completes before we cancel
      const reader = res.body!.getReader();
      await new Promise(r => setTimeout(r, 50));
      void reader.cancel();
      assert.equal(called, 0, "negative Last-Event-ID does not trigger replay");
    });

    test("T4: Last-Event-ID: garbage → dbReplayMissed NOT called", async () => {
      let called = 0;
      const bus = makeFakeBus();
      const app = new Hono();
      app.use("*", async (c, next) => { c.set("userId", 1); await next(); });
      app.route("/", createAgentStreamRoute({
        dbAvailable: true,
        bus: bus as never,
        dbReplayMissed: async () => { called++; return []; },
      }));
      const res = await app.request("/agent-stream", { headers: { "Last-Event-ID": "foo", Accept: "text/event-stream" } });
      const reader = res.body!.getReader();
      await new Promise(r => setTimeout(r, 50));
      void reader.cancel();
      assert.equal(called, 0, "garbage Last-Event-ID does not trigger replay");
    });

    test("T5: cross-user isolation — userA stream never sees userB emit", async () => {
      const bus = makeFakeBus();
      // Two separate Hono apps, two userIds, ONE shared bus.
      const appA = makeApp({ userId: 1, bus });
      const appB = makeApp({ userId: 2, bus });
      const resA = await appA.request("/agent-stream", { headers: { Accept: "text/event-stream" } });
      const resB = await appB.request("/agent-stream", { headers: { Accept: "text/event-stream" } });

      // Emit ONLY to userB
      bus.emit(2, { id: 10, userId: 2, event: "needs_input", eventTimestamp: new Date().toISOString() } as AnyRow);

      // userA stream should NOT receive a frame within 200ms
      const framesA = await readFrames(resA, 1, 200);
      const framesB = await readFrames(resB, 1, 200);
      const eventA = framesA.map(parseFrame).filter(f => f.event === "agent-event");
      const eventB = framesB.map(parseFrame).filter(f => f.event === "agent-event");
      assert.equal(eventA.length, 0, "userA received zero agent-event frames");
      assert.equal(eventB.length, 1, "userB received the emit");
      assert.equal(eventB[0].id, "10");
    });

    test("T6: stream abort cleanup — bus listener count returns to 0", async () => {
      const bus = makeFakeBus();
      const app = makeApp({ userId: 1, bus });
      const res = await app.request("/agent-stream", { headers: { Accept: "text/event-stream" } });
      // Wait for the listener to be attached
      await new Promise(r => setTimeout(r, 50));
      assert.equal(bus.listenerCount(1), 1, "listener attached on connect");
      // Abort the stream
      void res.body!.getReader().cancel();
      // Allow microtasks to drain the onAbort callback
      await new Promise(r => setTimeout(r, 100));
      assert.equal(bus.listenerCount(1), 0, "listener removed after abort");
    });

    test("T7: replay 24h cutoff — dbReplayMissed receives cutoff ~24h before now", async () => {
      let captured: Date | null = null;
      const bus = makeFakeBus();
      const app = new Hono();
      app.use("*", async (c, next) => { c.set("userId", 1); await next(); });
      app.route("/", createAgentStreamRoute({
        dbAvailable: true,
        bus: bus as never,
        dbReplayMissed: async (_uid, _afterId, cutoff) => { captured = cutoff; return []; },
      }));
      const before = Date.now();
      const res = await app.request("/agent-stream", { headers: { "Last-Event-ID": "1", Accept: "text/event-stream" } });
      void res.body!.getReader().cancel();
      const after = Date.now();
      const expectedMin = before - 24 * 60 * 60 * 1000 - 100; // 100ms slack
      const expectedMax = after - 24 * 60 * 60 * 1000 + 100;
      assert.ok(captured !== null, "cutoff captured");
      assert.ok(captured!.getTime() >= expectedMin && captured!.getTime() <= expectedMax,
        `cutoff (${captured!.toISOString()}) is within ~24h of now ±100ms`);
    });
    ```

    ## Step B: Extend `vigil-core/src/routes/agent-events.test.ts`

    Use Edit tool. Append two new tests at the end of the file:

    ```typescript
    test("Phase 124: POST with isNew=true triggers bus.emit", async () => {
      const emitted: Array<{ userId: number; row: any }> = [];
      const fakeBus = { emit: (uid: number, row: any) => emitted.push({ userId: uid, row }) };
      const deps = makeDeps({
        dbInsertOrGet: async (newRow) => ({ row: { id: 1, ...newRow }, isNew: true }),
        bus: fakeBus,
      });
      const app = makeApp(deps, /* userId */ 7);
      const res = await app.request("/agent-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ /* a valid agent-events payload — copy from existing tests */ }),
      });
      assert.ok([200, 201].includes(res.status));
      assert.equal(emitted.length, 1, "isNew=true → bus.emit fired exactly once");
      assert.equal(emitted[0].userId, 7);
    });

    test("Phase 124: POST with isNew=false does NOT trigger bus.emit (dedupe)", async () => {
      const emitted: number[] = [];
      const fakeBus = { emit: (uid: number, _row: any) => emitted.push(uid) };
      const deps = makeDeps({
        dbInsertOrGet: async (newRow) => ({ row: { id: 1, ...newRow }, isNew: false }),
        bus: fakeBus,
      });
      const app = makeApp(deps, 7);
      const res = await app.request("/agent-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ /* same payload */ }),
      });
      assert.ok([200, 201].includes(res.status));
      assert.equal(emitted.length, 0, "isNew=false → bus.emit suppressed");
    });
    ```

    Note: the executor must read agent-events.test.ts and copy a valid payload shape from an existing test (so the request body validates). Use `makeDeps`/`makeApp` already defined in the file.

    ## Step C: Extend `vigil-core/src/integration/cross-user-isolation.test.ts`

    Use Edit tool. Append a new "block 4" test at the end of the file:

    ```typescript
    // Phase 124 (AGENT-API-03): Block 4 — SSE cross-user isolation.
    // userA's GET /v1/agent-stream MUST NOT receive events emitted via
    // the bus for userB. Mirrors block 1-3 structure (lazy imports, JWT
    // bearer auth, app.fetch in-process dispatch).
    test("Block 4: SSE userA never receives userB bus emissions (AGENT-API-03)", async () => {
      const { bus } = await import("../lib/agent-events-bus.js");
      // ... construct two app.fetch dispatches with userA=1 and userB=2 bearer
      // headers, then bus.emit({userId: 2, ...}) and assert userA frames received
      // contain zero agent-event entries.
      // Implementation MUST use the real Hono app from index.ts so the
      // bearerAuth → c.set('userId') → c.get('userId') path is exercised
      // end-to-end. The fakeBus pattern from agent-stream.test.ts is NOT
      // sufficient for this lock — block 4 is the structural integration test.
    });
    ```

    The executor should follow the existing block-3 pattern exactly (read it first via Read). If the existing harness uses JWT bearer fixtures, reuse them; if it uses vk_ keys, use those.
  </action>
  <verify>
    <automated>cd vigil-core && npx tsx --test src/routes/__tests__/agent-stream.test.ts src/routes/agent-events.test.ts src/integration/cross-user-isolation.test.ts 2>&1 | tail -40</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f vigil-core/src/routes/__tests__/agent-stream.test.ts`
    - File contains 7 tests labeled `T1:` through `T7:` (grep `"T[1-7]:"` finds 7 matches)
    - File contains `cross-user isolation` test (grep exits 0)
    - File contains `Last-Event-ID` (grep exits 0; appears at least 4 times — header tests)
    - `vigil-core/src/routes/agent-events.test.ts` contains `Phase 124: POST with isNew=true` (grep exits 0)
    - `vigil-core/src/routes/agent-events.test.ts` contains `Phase 124: POST with isNew=false` (grep exits 0)
    - `vigil-core/src/integration/cross-user-isolation.test.ts` contains `Block 4` (grep exits 0)
    - `cd vigil-core && npx tsx --test src/routes/__tests__/agent-stream.test.ts` exits 0; output shows `# pass 7` (grep exits 0)
    - `cd vigil-core && npx tsx --test src/routes/agent-events.test.ts` exits 0 with original tests + 2 new ones passing
    - `cd vigil-core && npx tsx --test src/integration/cross-user-isolation.test.ts` exits 0
  </acceptance_criteria>
  <done>
    All 7 SSE route tests + 2 emit-gating tests + 1 cross-user-isolation block 4 are passing. Defensive parse, replay, cross-user isolation, abort cleanup, and 24h cutoff all locked.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → SSE endpoint | Bearer (vk_ or JWT) crosses bearerAuth middleware. SSE handler reads userId from `c.get("userId")` ONLY. |
| client → Last-Event-ID header | Untrusted integer. Must be validated before passing to Drizzle. |
| bus.emit → SSE listener | userId-scoped delivery via Map separation (Plan 02). |
| stream → connection | Long-lived; abort signals must reach cleanup. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-124-03-01 | Information Disclosure | Cross-user fan-out leak via SSE (userA receives userB events) | mitigate | (a) Plan 02's Map<userId, EventEmitter> isolation; (b) `c.get("userId")` is the ONLY userId source — never `req.body.userId` or query param; (c) cross-user-isolation.test.ts Block 4 locks the structural guarantee. |
| T-124-03-02 | Information Disclosure | Bearer key in logs / Authorization header value logged | mitigate | agent-stream.ts contains zero `console.log` references to `Bearer`/`Authorization`/`vk_`/`API_KEY` (drift detector in acceptance criteria). bearerAuth middleware is already audited (Phase 121). |
| T-124-03-03 | Denial of Service | Replay-DoS via crafted Last-Event-ID (negative or massive int) | mitigate | Defensive parse: `Number.isFinite(parsed) && parsed >= 0 && parsed < 2_147_483_647` → `null` falls back to live-only. T3 (negative) and T4 (garbage) tests pin this. |
| T-124-03-04 | Denial of Service | Listener leak under reconnect storm (Pitfall 3) | mitigate | (a) listener defined inside streamSSE callback closure; (b) bus.off + clearInterval in stream.onAbort; (c) Plan 02 setMaxListeners(50); (d) T6 abort-cleanup test asserts listenerCount → 0. |
| T-124-03-05 | Denial of Service | iOS NAT idle-kill creates reconnect storms (Pitfall 7) | mitigate | 25s server keepalive (`event: ping`) inside streamSSE callback. Plugin shim drops ping frames silently (Plan 06). |
| T-124-03-06 | Tampering | Hono `timeout(30_000)` middleware closes long-lived SSE connection prematurely | accept | RESEARCH §"index.ts pitfall to flag": Hono streaming responses return immediately as `Response`; timeout middleware doesn't race against an already-returned response. T6 (abort cleanup) implicitly covers >30s open via the explicit reader.cancel(). If observed in production, mitigation = exempt /v1/agent-stream from timeout middleware. |
| T-124-03-07 | Information Disclosure | Replay query selects rows for wrong user (SQL injection via Last-Event-ID) | mitigate | Parameterized Drizzle query (`gt(agentEvents.id, parsedNumber)` is bind-parameterized). `userId` is from `c.get("userId")` (server-set). Defensive int parse + `< INT32_MAX` clamp prevents postgres int4 overflow. |
| T-124-03-08 | Spoofing | Client sets `req.body.userId` and the route uses it instead of bearer-derived userId | mitigate | Plan 04 of Phase 121 already locked KNOWN_FIELDS guard for POST. SSE GET has no body. The route literally does `c.get("userId") as number` — there is no path that reads userId from the request body or query. Cross-user-isolation block 4 pins this. |
</threat_model>

<verification>
- `cd vigil-core && npm test 2>&1 | tail -30` (or via individual files via tsx — npm test may hang per STATE.md memo about scheduler-loop in index.js; use individual files):
  - `cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts src/routes/__tests__/agent-stream.test.ts src/routes/agent-events.test.ts src/integration/cross-user-isolation.test.ts` exits 0
- `cd vigil-core && npx tsc --noEmit` — zero errors involving agent-stream.ts, agent-events.ts, src/index.ts
- All grep-based acceptance criteria pass
</verification>

<success_criteria>
- AGENT-API-03 fully implemented: SSE endpoint live, fan-out wired, replay works, cross-user isolation locked.
- Bearer never logged.
- Last-Event-ID parse defensive (negative + garbage → no replay).
- Listener cleanup on disconnect verified by test (no leaks).
- 25s keepalive prevents iOS NAT idle-kill.
- Existing Phase 121 tests still green (regression safety).
</success_criteria>

<output>
After completion, create `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-03-SUMMARY.md`.
</output>
