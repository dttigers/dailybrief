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
 * Phase 125 (AGENT-HUD-03 / D-02, D-03, T-125-04):
 *   - Phase 0 (NEW): synthetic `quiet_mode_changed` SSE frame is the FIRST
 *     frame emitted after stream setup, BEFORE the Phase 1 Last-Event-ID
 *     replay loop. Required by D-03 + Pitfall 1 — without this ordering,
 *     a `task_complete` row in the replay set surfaces on the HUD before
 *     the plugin knows DND is on.
 *   - Phase 1 (MODIFIED): each replayed row passes through
 *     suppressionQueue.shouldSuppress(userId, isQuiet, row); suppressed
 *     rows are stored in the queue (last-of-each-kind) and NOT written to
 *     the stream. Mitigates T-125-04 (stale state on reconnect during DND).
 *   - Phase 2 (MODIFIED): live-attach eventListener also filters through
 *     suppressionQueue. Local `isQuiet` ref tracks the current state.
 *   - Phase 2b (NEW): bus.onQuiet listener writes a `quiet_mode_changed`
 *     frame and updates the local `isQuiet` ref. The /v1/quiet-mode PUT
 *     handler is responsible for flushing the suppression queue + re-emitting
 *     held rows via bus.emit — those rows arrive here via eventListener
 *     (by then isQuiet is already false locally).
 *   - Phase 4 (MODIFIED): cleanup calls BOTH bus.off and bus.offQuiet to
 *     prevent listener leaks (T-125-W5-01).
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
import { agentEvents, users } from "../db/schema.js";
import type { DrizzleAgentEvent } from "../db/types.js";
import { bus } from "../lib/agent-events-bus.js";
import { suppressionQueue } from "../lib/quiet-mode-suppression.js";

const KEEPALIVE_INTERVAL_MS = 25_000;
const REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const INT32_MAX = 2_147_483_647;

export interface AgentStreamDeps {
  dbAvailable: boolean;
  bus: {
    on(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
    off(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
    // Phase 125 (AGENT-HUD-03 / D-02): quiet_mode_changed fan-out hooks.
    // Optional on the type so test-time fakes can omit them and fall back
    // to no-op behavior (the production singleton always supplies them).
    onQuiet?(
      userId: number,
      listener: (p: { enabled: boolean; since: string | null }) => void,
    ): void;
    offQuiet?(
      userId: number,
      listener: (p: { enabled: boolean; since: string | null }) => void,
    ): void;
    // Phase 130 Plan 03 (VOICE-06): thought-created fan-out from G2 voice
    // transcribe. Optional on the type so test-time fakes can omit them;
    // the production `agent-events-bus.ts` singleton always supplies them.
    onThoughtCreated?(
      userId: number,
      listener: (p: { thoughtId: number; content: string }) => void,
    ): void;
    offThoughtCreated?(
      userId: number,
      listener: (p: { thoughtId: number; content: string }) => void,
    ): void;
  };
  dbReplayMissed: (
    userId: number,
    afterId: number,
    cutoff: Date,
  ) => Promise<DrizzleAgentEvent[]>;
  // Phase 125 (AGENT-HUD-03 / D-03): reads users.quiet_mode + users.quiet_mode_since
  // for the Phase 0 synthetic state-bootstrap frame.
  dbGetQuietMode: (
    userId: number,
  ) => Promise<{ enabled: boolean; since: Date | null }>;
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
      // Phase 0 (Phase 125 / D-03): synthetic state-bootstrap frame BEFORE
      // any replay. Pitfall 1 — this frame MUST emit before any agent-event
      // in Phase 1, else a task_complete during reconnect surfaces despite
      // DND being on. The local `isQuiet` ref is captured here and updated
      // by the bus.onQuiet listener below (Phase 2b).
      const quiet = await deps.dbGetQuietMode(userId);
      let isQuiet = quiet.enabled;
      await stream.writeSSE({
        event: "quiet_mode_changed",
        data: JSON.stringify({
          enabled: quiet.enabled,
          since: quiet.since?.toISOString() ?? null,
        }),
      });

      // Phase 1: Replay missed events (only when Last-Event-ID is valid)
      if (resumeFrom !== null) {
        const cutoff = new Date(Date.now() - REPLAY_WINDOW_MS);
        const missed = await deps.dbReplayMissed(userId, resumeFrom, cutoff);
        for (const row of missed) {
          if (stream.aborted || stream.closed) return;
          // Phase 125 T-125-04: filter replays through suppression rule too —
          // reconnect during DND should not burst the held set; that flush
          // happens via the /v1/quiet-mode PUT handler (enabled=false).
          if (suppressionQueue.shouldSuppress(userId, isQuiet, row)) continue;
          await stream.writeSSE({
            event: "agent-event",
            id: String(row.id),
            data: JSON.stringify(row),
          });
        }
      }

      // Phase 2: Live attach. Listener closure captures stream + isQuiet —
      // defined INSIDE this callback so the cleanup hook references the
      // same closure (RESEARCH Pitfall 3). Phase 125: filter through
      // suppressionQueue before writing.
      const eventListener = (row: DrizzleAgentEvent) => {
        if (stream.aborted || stream.closed) return;
        if (suppressionQueue.shouldSuppress(userId, isQuiet, row)) return;
        // Fire-and-forget — writeSSE returns Promise but we don't await
        // (the listener signature is sync). Hono buffers internally.
        void stream.writeSSE({
          event: "agent-event",
          id: String(row.id),
          data: JSON.stringify(row),
        });
      };
      // Phase 2b (Phase 125 / D-02): bus.onQuiet listener writes a
      // quiet_mode_changed frame and updates the local isQuiet ref.
      // Note: actual suppression flush is done in the /v1/quiet-mode PUT
      // handler — not here. The PUT handler emits each held row as a
      // normal "event", which falls through to eventListener above. By
      // then isQuiet is already false locally so the row passes through.
      const quietListener = (p: { enabled: boolean; since: string | null }) => {
        if (stream.aborted || stream.closed) return;
        isQuiet = p.enabled;
        void stream.writeSSE({
          event: "quiet_mode_changed",
          data: JSON.stringify(p),
        });
      };
      // Phase 130 Plan 03 (VOICE-06 / D8 round-trip): thought-created SSE
      // multiplex. Triggered by /v1/voice/transcribe → bus.emitThoughtCreated
      // (PATTERNS.md lines 558-565). Carries the new thought's id + content
      // to the PWA so useAgentStream.ts dispatches `vigil:thought-created`
      // → useThoughts.ts:127 refetch (cross-device G2-origin path).
      const thoughtCreatedListener = (
        p: { thoughtId: number; content: string },
      ) => {
        if (stream.aborted || stream.closed) return;
        void stream.writeSSE({
          event: "thought-created",
          data: JSON.stringify(p),
        });
      };
      deps.bus.on(userId, eventListener);
      deps.bus.onQuiet?.(userId, quietListener);
      deps.bus.onThoughtCreated?.(userId, thoughtCreatedListener);

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
      // Phase 125 T-125-W5-01: also call bus.offQuiet to prevent listener
      // leaks on disconnect during quiet mode.
      stream.onAbort(() => {
        clearInterval(keepalive);
        deps.bus.off(userId, eventListener);
        deps.bus.offQuiet?.(userId, quietListener);
        // Phase 130 Plan 03 (T-130-03-R): three-channel cleanup gate on
        // agent-events-bus.ts requires this off call, otherwise the
        // thought-created listener orphan-blocks emitter Map cleanup.
        deps.bus.offThoughtCreated?.(userId, thoughtCreatedListener);
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
  // Phase 125 (AGENT-HUD-03 / D-03): read users.quiet_mode + users.quiet_mode_since
  // for the synthetic state-bootstrap frame. Mirrors quiet-mode.ts dbGet.
  dbGetQuietMode: async (userId) => {
    if (!db) return { enabled: false, since: null };
    const rows = await db
      .select({ enabled: users.quietMode, since: users.quietModeSince })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? { enabled: false, since: null };
  },
});
export { agentStream$Route as agentStream };
