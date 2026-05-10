/**
 * Phase 125 (AGENT-HUD-03 / D-01 / D-05): GET/PUT /v1/quiet-mode endpoint.
 *
 * GET  /v1/quiet-mode → { enabled: boolean, since: ISO|null } for the
 *      authenticated user (userId from c.get("userId") set by bearerAuth).
 * PUT  /v1/quiet-mode { enabled: boolean } → writes users.quiet_mode +
 *      users.quiet_mode_since columns, emits bus.emitQuiet for SSE fan-out,
 *      and on enabled=false flushes the suppressionQueue and re-emits each
 *      held row via bus.emit so attached SSE listeners deliver them in
 *      chronological order (Pitfall 4 — suppressionQueue.flush sorts).
 *
 * CROSS-USER ISOLATION INVARIANT (T-125-01 / T-125-02 / Phase 121 D-D2):
 *   userId is ALWAYS read from c.get("userId") — NEVER from request body.
 *   The route is mounted in index.ts AFTER the bearerAuth dispatcher (line
 *   140), so c.get("userId") is guaranteed non-null at handler entry. Do
 *   NOT move the mount above that dispatcher — would create a silent auth
 *   bypass and let userA read/write userB's quiet_mode state.
 *
 * Pattern reference: vigil-core/src/routes/calendar.ts (CAL-01) factory
 * shape + 125-RESEARCH.md §Pattern 2 (lines 295-374).
 *
 * SECURITY (memory: feedback_railway_variables_leak): touches no secrets.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { suppressionQueue } from "../lib/quiet-mode-suppression.js";
import { bus } from "../lib/agent-events-bus.js";

export interface QuietModeDeps {
  dbAvailable: boolean;
  dbGet: (userId: number) => Promise<{ enabled: boolean; since: Date | null }>;
  dbSet: (userId: number, enabled: boolean, since: Date | null) => Promise<void>;
}

export function createQuietModeRouter(deps: QuietModeDeps): Hono {
  const router = new Hono();

  router.get("/quiet-mode", async (c) => {
    if (!deps.dbAvailable) return c.json({ error: "db_unavailable" }, 503);
    const userId = c.get("userId") as number;
    const { enabled, since } = await deps.dbGet(userId);
    return c.json({ enabled, since: since?.toISOString() ?? null });
  });

  router.put("/quiet-mode", async (c) => {
    if (!deps.dbAvailable) return c.json({ error: "db_unavailable" }, 503);
    const userId = c.get("userId") as number;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const enabled = (body as { enabled?: unknown } | null)?.enabled;
    if (typeof enabled !== "boolean") {
      return c.json(
        { error: "invalid_payload", message: "enabled must be a boolean" },
        400,
      );
    }
    const since = enabled ? new Date() : null;
    await deps.dbSet(userId, enabled, since);
    // Emit on SSE bus so connected agent-stream listeners can update the
    // plugin's local isQuiet ref + write a quiet_mode_changed SSE frame.
    bus.emitQuiet(userId, { enabled, since: since?.toISOString() ?? null });
    if (!enabled) {
      // Flush suppression queue + re-emit each held row via bus.emit so the
      // SSE listener in agent-stream.ts delivers them to attached clients
      // in chronological order (suppressionQueue.flush sorts by
      // eventTimestamp ASC — Pitfall 4).
      const held = suppressionQueue.flush(userId);
      for (const row of held) bus.emit(userId, row);
    }
    return c.json({ ok: true });
  });

  return router;
}

// ── Production route (no deps override — uses real DB + bus + suppression) ────

export const quietMode$Route = createQuietModeRouter({
  get dbAvailable() {
    return !!db;
  },
  dbGet: async (userId) => {
    if (!db) throw new Error("Database not available");
    const rows = await db
      .select({ enabled: users.quietMode, since: users.quietModeSince })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? { enabled: false, since: null };
  },
  dbSet: async (userId, enabled, since) => {
    if (!db) throw new Error("Database not available");
    await db
      .update(users)
      .set({ quietMode: enabled, quietModeSince: since })
      .where(eq(users.id, userId));
  },
});
export { quietMode$Route as quietMode };
