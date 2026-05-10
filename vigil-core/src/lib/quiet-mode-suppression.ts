/**
 * Phase 125 (AGENT-HUD-03 / D-04): in-memory suppression queue keyed by
 * (userId, sessionId, eventType). When users.quiet_mode = true, non-allowlist
 * agent_events are HELD here instead of being delivered over SSE. On
 * quiet_mode → false, server emits the held set in chronological order.
 *
 * Cross-user isolation (T-125-01): keyed by userId from c.get('userId') —
 * never from request body. Same invariant as agent-events-bus.ts.
 *
 * Replay-storm cap (T-125-03): Map.set overwrite means at most ONE row per
 * (userId, sessionId, eventType) is held — bounded ≤ N_sessions × N_event_types
 * per user (realistically ≤ 5×5 = 25 rows per user).
 *
 * NEVER LOG: this module touches no secrets, but row payloads may include
 * agent message content (Phase 121 — content is not classified secret, but
 * adopt project-wide non-logging posture).
 */
import type { DrizzleAgentEvent } from "../db/types.js";

const ALLOWLIST = new Set(["needs_input", "task_failed"]);

const heldByUser = new Map<
  number,
  Map<string, Map<string, DrizzleAgentEvent>>
>();

export const suppressionQueue = {
  /**
   * Returns true if event was suppressed (and stored), false if it should
   * pass through to SSE.
   */
  shouldSuppress(userId: number, isQuiet: boolean, row: DrizzleAgentEvent): boolean {
    if (!isQuiet) return false;
    if (ALLOWLIST.has(row.event)) return false;
    let bySession = heldByUser.get(userId);
    if (!bySession) {
      bySession = new Map();
      heldByUser.set(userId, bySession);
    }
    let byEventType = bySession.get(row.sessionId);
    if (!byEventType) {
      byEventType = new Map();
      bySession.set(row.sessionId, byEventType);
    }
    byEventType.set(row.event, row); // last-of-each-kind via overwrite
    return true;
  },

  /** Flush + clear. Returns held rows in ascending event_timestamp order. */
  flush(userId: number): DrizzleAgentEvent[] {
    const bySession = heldByUser.get(userId);
    if (!bySession) return [];
    const out: DrizzleAgentEvent[] = [];
    for (const byEventType of bySession.values()) {
      for (const row of byEventType.values()) out.push(row);
    }
    out.sort((a, b) => a.eventTimestamp.getTime() - b.eventTimestamp.getTime());
    heldByUser.delete(userId);
    return out;
  },

  // Test hooks
  _size(userId: number): number {
    const bySession = heldByUser.get(userId);
    if (!bySession) return 0;
    let n = 0;
    for (const m of bySession.values()) n += m.size;
    return n;
  },
  _clearAll(): void {
    heldByUser.clear();
  },
};
