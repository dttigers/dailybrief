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
// Phase 125 (AGENT-HUD-03 / D-02): per-userId quiet_mode_changed fan-out.
// Same per-userId emitter Map as EVENT_NAME, second event channel.
const QUIET_NAME = "quiet" as const;
// Phase 130 Plan 03 (VOICE-06): thought-created fan-out for G2 voice
// transcribe → /v1/agent-stream SSE → PWA dashboard refresh. Plan 02 landed
// the emitThoughtCreated SHIM (emit-only); Plan 03 promotes this to the full
// emit/on/off triple AND extends the existing two-channel `off`/`offQuiet`
// joint cleanup gates to ALSO require listenerCount(THOUGHT_CREATED_NAME) === 0
// (PATTERNS.md §"CRITICAL" — without this, a still-subscribed thought-created
// listener silently blocks Map cleanup when the operator unsubscribes from
// the other two channels).
const THOUGHT_CREATED_NAME = "thought-created" as const;
// MAX_LISTENERS_PER_USER = 50 — RESEARCH §node:events: default 10 too tight for
// reconnect storms. Literal `50` is inlined into setMaxListeners(50) below so
// the acceptance-criteria drift detector (grep "setMaxListeners(50)") in the
// Plan 02 contract pins the exact cap at the call site.

const emitters = new Map<number, EventEmitter>();

function getOrCreate(userId: number): EventEmitter {
  let emitter = emitters.get(userId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(50);
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
    // Phase 125: cleanup gate joint across EVENT_NAME + QUIET_NAME so
    // an outstanding onQuiet listener prevents emitter Map deletion (and
    // vice versa). Without this gate, off() would orphan a still-registered
    // QUIET listener on a deleted-then-resurrected emitter (T-125-W3-01).
    // Phase 130 Plan 03: cleanup gate extended to three channels — also
    // require THOUGHT_CREATED_NAME listener count to be 0 (T-130-03-R).
    if (
      emitter.listenerCount(EVENT_NAME) === 0 &&
      emitter.listenerCount(QUIET_NAME) === 0 &&
      emitter.listenerCount(THOUGHT_CREATED_NAME) === 0
    ) {
      emitters.delete(userId);
    }
  }

  // Phase 125 (AGENT-HUD-03 / D-02): per-userId quiet_mode_changed fan-out.
  emitQuiet(userId: number, payload: { enabled: boolean; since: string | null }): void {
    // Mirror emit() — do NOT create an emitter on emitQuiet alone. Listeners
    // create emitters via onQuiet().
    const emitter = emitters.get(userId);
    if (!emitter) return;
    emitter.emit(QUIET_NAME, payload);
  }

  onQuiet(
    userId: number,
    listener: (p: { enabled: boolean; since: string | null }) => void,
  ): void {
    getOrCreate(userId).on(QUIET_NAME, listener);
  }

  offQuiet(
    userId: number,
    listener: (p: { enabled: boolean; since: string | null }) => void,
  ): void {
    const emitter = emitters.get(userId);
    if (!emitter) return;
    emitter.off(QUIET_NAME, listener);
    // Delete Map entry only when ALL event types have zero listeners.
    // Phase 130 Plan 03: extended from two-channel (EVENT + QUIET) to
    // three-channel (+ THOUGHT_CREATED). Without this extension, an
    // outstanding onThoughtCreated listener would be orphaned when the
    // operator unsubscribes from both EVENT and QUIET channels.
    if (
      emitter.listenerCount(EVENT_NAME) === 0 &&
      emitter.listenerCount(QUIET_NAME) === 0 &&
      emitter.listenerCount(THOUGHT_CREATED_NAME) === 0
    ) {
      emitters.delete(userId);
    }
  }

  // ── Phase 130 Plan 03 (VOICE-06) — thought-created full triple ────────────
  // emit/on/off with three-channel joint cleanup gate (PATTERNS.md lines
  // 503-535). Plan 02 shipped the emit-only SHIM; Plan 03 promotes to the
  // full triple and extends the existing `off` and `offQuiet` cleanup gates
  // to also require listenerCount(THOUGHT_CREATED_NAME) === 0.
  emitThoughtCreated(
    userId: number,
    payload: { thoughtId: number; content: string },
  ): void {
    // Mirror emit() — do NOT create an emitter on emitThoughtCreated alone.
    // Listeners create emitters via onThoughtCreated().
    const emitter = emitters.get(userId);
    if (!emitter) return;
    emitter.emit(THOUGHT_CREATED_NAME, payload);
  }

  onThoughtCreated(
    userId: number,
    listener: (p: { thoughtId: number; content: string }) => void,
  ): void {
    getOrCreate(userId).on(THOUGHT_CREATED_NAME, listener);
  }

  offThoughtCreated(
    userId: number,
    listener: (p: { thoughtId: number; content: string }) => void,
  ): void {
    const emitter = emitters.get(userId);
    if (!emitter) return;
    emitter.off(THOUGHT_CREATED_NAME, listener);
    // Delete Map entry only when ALL THREE event types have zero listeners.
    // Phase 130 Plan 03 three-channel cleanup gate (T-130-03-R).
    if (
      emitter.listenerCount(EVENT_NAME) === 0 &&
      emitter.listenerCount(QUIET_NAME) === 0 &&
      emitter.listenerCount(THOUGHT_CREATED_NAME) === 0
    ) {
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
