import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { agentEvents } from "../db/schema.js";
import type { DrizzleAgentEvent, NewAgentEvent } from "../db/types.js";
import { bus as defaultBus } from "../lib/agent-events-bus.js";

// ── Phase 121 — AGENT-API-01 + AGENT-API-02 — load-bearing invariants ───────
// 1. user_id resolved from c.get("userId") set by bearerAuth dispatcher
//    (index.ts:135). NEVER trust req.body.userId — Plan 04 cross-user-isolation
//    test block 1 pins this. T-121-W-01.
// 2. Dedupe key is (user_id, client_event_id) composite — NOT client_event_id
//    alone. Plan 04 test block 3 pins this. Single-column unique would let
//    userA's POST 200-dedupe against userB's UUID. T-121-W-03.
// 3. .strict()-equivalent: KNOWN_FIELDS Set + reject-on-extra-key. zod is
//    not installed; manual validation per codebase convention (Pattern Map #2).
// 4. Error response shape is { error: "<short-code>", message: "..." } —
//    new convention introduced by Phase 121, documented for future routes.

// ── Validation constants (drift-detector tests in Plan 03 lock these) ──────
// The 5 values MUST match the CHECK constraint in 0018_add_agent_events.sql
// verbatim. Drift-detector test in agent-events.test.ts greps both files.
export const VALID_EVENTS = [
  "needs_input",
  "task_complete",
  "task_failed",
  "milestone",
  "heartbeat",
] as const;
export type AgentEventType = (typeof VALID_EVENTS)[number];

// The 8 known top-level body fields (spec's 7 + client_event_id from D-C1).
// ANY other top-level key in body → 400 unknown_field (D-Discretion strict()).
const KNOWN_FIELDS = new Set([
  "session_id",
  "event",
  "message",
  "timestamp",
  "label",
  "host",
  "exit_code",
  "client_event_id",
]);

const DEFAULT_WINDOW_HOURS = 24; // D-B1
const SESSION_HARD_CAP = 100; // D-B4

// ── DI interface (factory pattern — mirrors work-order-status.ts:13-17) ────
// Plan 03's agent-events.test.ts uses stubbed deps; production uses real db.
export interface AgentEventsDeps {
  dbAvailable: boolean;
  // Insert path: returns the inserted row, OR the existing row if (userId,
  // clientEventId) already exists. The dedupe MUST scope on userId.
  dbInsertOrGet: (
    row: NewAgentEvent,
  ) => Promise<{ row: DrizzleAgentEvent; isNew: boolean }>;
  // Sessions list: latest event per session for caller, sliding window, capped.
  dbListSessions: (
    userId: number,
    sinceIso: Date,
    limit: number,
  ) => Promise<AgentSessionRow[]>;
  // Phase 124 (AGENT-API-03 / D-03): per-userId fan-out hook. Optional so
  // existing tests under agent-events.test.ts that pre-date Phase 124 still
  // wire without modification. Production singleton wires the real bus below.
  bus?: {
    emit(userId: number, row: DrizzleAgentEvent): void;
  };
}

export interface AgentSessionRow {
  sessionId: string;
  label: string;
  host: string;
  lastEvent: {
    event: AgentEventType;
    message: string | null;
    eventTimestamp: string; // ISO-8601 string for client convenience
  };
  eventCount: number;
}

// ── Factory ────────────────────────────────────────────────────────────────
export function createAgentEventsRoute(deps: AgentEventsDeps): Hono {
  const router = new Hono();

  // POST /v1/agent-events — idempotent insert (D-C1/C2/C3)
  // userId is non-null because the route is registered AFTER the bearerAuth
  // dispatcher at index.ts:135. (Mirror of change-password.ts:39 D-09 comment.)
  router.post("/agent-events", async (c) => {
    if (!deps.dbAvailable) {
      return c.json(
        { error: "db_unavailable", message: "Database not available" },
        503,
      );
    }

    const userId = c.get("userId") as number;

    // Body parse
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: "invalid_json", message: "Request body must be valid JSON" },
        400,
      );
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json(
        { error: "invalid_payload", message: "Body must be a JSON object" },
        400,
      );
    }
    const obj = body as Record<string, unknown>;

    // D-Discretion strict() — reject any unknown top-level fields. Note
    // userId IS rejected as unknown; this duplicates the mass-assignment
    // defense and emits a clear error rather than silently dropping.
    const unknown = Object.keys(obj).filter((k) => !KNOWN_FIELDS.has(k));
    if (unknown.length > 0) {
      return c.json(
        {
          error: "unknown_field",
          message: `Unknown field(s): ${unknown.join(", ")}. Allowed: ${Array.from(KNOWN_FIELDS).join(", ")}`,
        },
        400,
      );
    }

    // Required string fields
    const sessionId = obj["session_id"];
    const event = obj["event"];
    const label = obj["label"];
    const host = obj["host"];
    const clientEventId = obj["client_event_id"];
    const timestampRaw = obj["timestamp"];

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return c.json(
        { error: "missing_field", message: "session_id is required (string)" },
        400,
      );
    }
    if (typeof label !== "string" || label.length === 0) {
      return c.json(
        { error: "missing_field", message: "label is required (string)" },
        400,
      );
    }
    if (typeof host !== "string" || host.length === 0) {
      return c.json(
        { error: "missing_field", message: "host is required (string)" },
        400,
      );
    }

    // D-C3 — client_event_id is REQUIRED (not optional)
    if (typeof clientEventId !== "string" || clientEventId.length === 0) {
      return c.json(
        {
          error: "invalid_payload",
          message: "client_event_id is required (UUID string)",
        },
        400,
      );
    }

    // event must be one of VALID_EVENTS
    if (
      typeof event !== "string" ||
      !VALID_EVENTS.includes(event as AgentEventType)
    ) {
      return c.json(
        {
          error: "invalid_event",
          message: `event must be one of: ${VALID_EVENTS.join(", ")}`,
        },
        400,
      );
    }

    // timestamp must be ISO-8601 parseable
    if (typeof timestampRaw !== "string") {
      return c.json(
        { error: "missing_field", message: "timestamp is required (ISO-8601 string)" },
        400,
      );
    }
    const eventTimestamp = new Date(timestampRaw);
    if (Number.isNaN(eventTimestamp.getTime())) {
      return c.json(
        {
          error: "invalid_timestamp",
          message: "timestamp must be a valid ISO-8601 string",
        },
        400,
      );
    }

    // Optional fields
    const messageRaw = obj["message"];
    if (messageRaw !== undefined && typeof messageRaw !== "string") {
      return c.json(
        { error: "invalid_payload", message: "message must be a string when present" },
        400,
      );
    }
    const message = (messageRaw as string | undefined) ?? null;

    const exitCodeRaw = obj["exit_code"];
    let exitCode: number | null = null;
    if (exitCodeRaw !== undefined) {
      if (
        typeof exitCodeRaw !== "number" ||
        !Number.isFinite(exitCodeRaw) ||
        !Number.isInteger(exitCodeRaw)
      ) {
        return c.json(
          {
            error: "invalid_payload",
            message: "exit_code must be an integer when present",
          },
          400,
        );
      }
      exitCode = exitCodeRaw;
    }

    // INSERT — userId from c.get only (NEVER from body)
    const newRow: NewAgentEvent = {
      userId,
      sessionId,
      event,
      message,
      label,
      host,
      exitCode,
      eventTimestamp,
      clientEventId,
    };

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
  });

  // GET /v1/agent-sessions — caller's currently-tracked sessions (D-B1..B4)
  router.get("/agent-sessions", async (c) => {
    if (!deps.dbAvailable) {
      return c.json(
        { error: "db_unavailable", message: "Database not available" },
        503,
      );
    }

    const userId = c.get("userId") as number;

    // Optional ?since=<ISO-8601> override (D-B1)
    const sinceParam = c.req.query("since");
    let sinceIso: Date;
    if (sinceParam !== undefined) {
      const parsed = new Date(sinceParam);
      if (Number.isNaN(parsed.getTime())) {
        return c.json(
          {
            error: "invalid_query",
            message: "since must be a valid ISO-8601 string",
          },
          400,
        );
      }
      sinceIso = parsed;
    } else {
      sinceIso = new Date(Date.now() - DEFAULT_WINDOW_HOURS * 60 * 60 * 1000);
    }

    const sessions = await deps.dbListSessions(userId, sinceIso, SESSION_HARD_CAP);
    return c.json({ data: sessions });
  });

  return router;
}

// ── Production singleton (real db) ──────────────────────────────────────────
export const agentEvents$Route = createAgentEventsRoute({
  get dbAvailable() {
    return !!db;
  },

  // Phase 124 (AGENT-API-03 / D-03): wire real bus singleton from
  // ../lib/agent-events-bus.js so POST → bus.emit → SSE subscribers fan-out
  // works end-to-end. Existing tests pass deps without `bus` and the optional
  // chaining `deps.bus?.emit(...)` makes the hook a no-op there.
  bus: defaultBus,

  // D-C1 + D-C2 + D-D2 block 3: dedupe via composite (user_id, client_event_id)
  // partial unique index. .onConflictDoNothing returns no row on conflict;
  // we then SELECT the existing row and return it with isNew=false.
  dbInsertOrGet: async (row) => {
    if (!db) throw new Error("Database not available");

    // The partial unique index is (user_id, client_event_id) WHERE client_event_id IS NOT NULL.
    // Postgres requires the WHERE predicate to be included in the ON CONFLICT target for
    // partial indexes — without it, PG error 42P10 "no unique constraint matching" is thrown.
    const inserted = await db
      .insert(agentEvents)
      .values(row)
      .onConflictDoNothing({
        target: [agentEvents.userId, agentEvents.clientEventId],
        where: sql`${agentEvents.clientEventId} IS NOT NULL`,
      })
      .returning();

    if (inserted.length > 0) {
      return { row: inserted[0]!, isNew: true };
    }

    // Conflict path — dedupe hit. Fetch the existing row.
    // SAFE because the partial unique index scopes on (user_id, client_event_id);
    // no chance of returning another user's row.
    const existing = await db
      .select()
      .from(agentEvents)
      .where(
        and(
          eq(agentEvents.userId, row.userId),
          eq(agentEvents.clientEventId, row.clientEventId!),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      // Should be unreachable — onConflict said dup exists but SELECT found
      // none. Possible race: another transaction deleted between insert and
      // select. Treat as a server error.
      throw new Error(
        "agent_events idempotency invariant broken: insert hit conflict but row not found on follow-up select",
      );
    }
    return { row: existing[0]!, isNew: false };
  },

  // D-B1/B2/B3/B4: latest event per session per user, sliding window, capped.
  // Implementation: PG DISTINCT ON (session_id) ORDER BY session_id,
  // event_timestamp DESC composes natively with the composite index
  // (user_id, session_id, event_timestamp DESC). Returns one row per session
  // — the latest event. eventCount is a separate aggregate per session.
  dbListSessions: async (userId, sinceIso, limit) => {
    if (!db) return [];

    // Step 1: get latest-event-per-session via DISTINCT ON. Filter by user
    // and window. Ordered for the next sort. Cap to `limit` upfront via
    // a subquery so the outer ORDER BY only sorts the capped set.
    // Using sql tag because drizzle 0.45.2 has no DISTINCT ON helper.
    const rows = await db.execute(sql`
      WITH latest_per_session AS (
        SELECT DISTINCT ON (session_id)
          session_id,
          label,
          host,
          event,
          message,
          event_timestamp
        FROM agent_events
        WHERE user_id = ${userId}
          AND event_timestamp >= ${sinceIso.toISOString()}
        ORDER BY session_id, event_timestamp DESC
      ),
      counts AS (
        SELECT session_id, COUNT(*)::int AS event_count
        FROM agent_events
        WHERE user_id = ${userId}
          AND event_timestamp >= ${sinceIso.toISOString()}
        GROUP BY session_id
      )
      SELECT lps.session_id, lps.label, lps.host, lps.event, lps.message,
             lps.event_timestamp, c.event_count
      FROM latest_per_session lps
      JOIN counts c ON c.session_id = lps.session_id
      ORDER BY lps.event_timestamp DESC
      LIMIT ${limit}
    `);

    // Drizzle's db.execute returns an array of plain row objects (postgres-js
    // shape). Map snake_case → camelCase per D-B2.
    return (
      rows as unknown as Array<{
        session_id: string;
        label: string;
        host: string;
        event: string;
        message: string | null;
        event_timestamp: Date;
        event_count: number;
      }>
    ).map((r) => ({
      sessionId: r.session_id,
      label: r.label,
      host: r.host,
      lastEvent: {
        event: r.event as AgentEventType,
        message: r.message,
        eventTimestamp:
          r.event_timestamp instanceof Date
            ? r.event_timestamp.toISOString()
            : new Date(r.event_timestamp as unknown as string).toISOString(),
      },
      eventCount: r.event_count,
    }));
  },
});

// Default-export-equivalent name used in src/index.ts mount (matches the
// pattern of every other route file — singular noun export).
export { agentEvents$Route as agentEvents };
