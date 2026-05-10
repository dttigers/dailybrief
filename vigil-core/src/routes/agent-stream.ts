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
      // .unref() so a stuck keepalive timer never blocks Node process exit
      // (defense-in-depth — onAbort below is the primary cleanup path).
      const keepalive = setInterval(() => {
        if (stream.aborted || stream.closed) return;
        void stream.writeSSE({ event: "ping", data: "" });
      }, KEEPALIVE_INTERVAL_MS);
      keepalive.unref();

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
