// Set JWT_SECRET BEFORE importing the route — utils/jwt.ts exits at import time
// without it (per index.ts:61-64 and the auth.test.ts pattern at line 21).
// agent-events.ts does not directly import utils/jwt.ts, but this block is
// included for self-contained copy-paste safety (per Phase 121 / Plan 03 spec).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import type { AgentEventsDeps, AgentSessionRow } from "./agent-events.js";
import type { DrizzleAgentEvent, NewAgentEvent } from "../db/types.js";

// Lazy import after env is set (safety net for transitive jwt imports).
const { createAgentEventsRoute, VALID_EVENTS } = await import("./agent-events.js");

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRow(
  userId: number,
  overrides: Partial<DrizzleAgentEvent> = {},
): DrizzleAgentEvent {
  return {
    id: 1,
    userId,
    sessionId: "claude-test-001",
    event: "needs_input",
    message: "test message",
    label: "test-label",
    host: "test-host",
    exitCode: null,
    eventTimestamp: new Date("2026-05-08T12:00:00Z"),
    receivedAt: new Date("2026-05-08T12:00:01Z"),
    clientEventId: "uuid-test-001",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AgentEventsDeps> = {}): AgentEventsDeps {
  return {
    dbAvailable: true,
    dbInsertOrGet: async (row) => ({
      row: makeRow(row.userId, {
        sessionId: row.sessionId,
        event: row.event as DrizzleAgentEvent["event"],
        message: row.message ?? null,
        label: row.label,
        host: row.host,
        exitCode: row.exitCode ?? null,
        eventTimestamp: row.eventTimestamp,
        clientEventId: row.clientEventId ?? null,
      }),
      isNew: true,
    }),
    dbListSessions: async () => [],
    ...overrides,
  };
}

// Build a Hono app that stubs c.set("userId", <id>) BEFORE routing to the
// factory router. Mirrors production, where bearerAuth sets userId on the
// context for every route under /v1.
function makeApp(deps: AgentEventsDeps, userId: number = 1): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/", createAgentEventsRoute(deps));
  return app;
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: "claude-test-001",
    event: "needs_input",
    message: "test message",
    timestamp: "2026-05-08T12:00:00Z",
    label: "test-label",
    host: "test-host",
    client_event_id: "uuid-test-001",
    ...overrides,
  };
}

async function postEvent(app: Hono, body: unknown): Promise<Response> {
  return app.request("/agent-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function getSessions(app: Hono, query: string = ""): Promise<Response> {
  return app.request(`/agent-sessions${query}`);
}

// ── POST /v1/agent-events tests ────────────────────────────────────────────────

test("AGENT-API-01/T1: POST happy path returns 201 with all fields preserved", async () => {
  let captured: NewAgentEvent | null = null;
  const app = makeApp(
    makeDeps({
      dbInsertOrGet: async (row) => {
        captured = row;
        return {
          row: makeRow(row.userId, {
            sessionId: row.sessionId,
            clientEventId: row.clientEventId ?? null,
          }),
          isNew: true,
        };
      },
    }),
    42,
  );

  const res = await postEvent(
    app,
    validBody({ session_id: "sess-A", client_event_id: "uuid-A" }),
  );
  assert.equal(res.status, 201);
  const json = (await res.json()) as DrizzleAgentEvent;
  assert.equal(json.userId, 42, "response userId must be from c.get('userId')");
  assert.equal(json.sessionId, "sess-A");
  assert.equal(json.clientEventId, "uuid-A");
  assert.ok(captured, "dbInsertOrGet must have been called");
  assert.equal(
    captured!.userId,
    42,
    "captured userId must come from c.get('userId'), not body",
  );
  assert.equal(captured!.sessionId, "sess-A");
  assert.equal(captured!.label, "test-label");
  assert.equal(captured!.host, "test-host");
  assert.equal(captured!.clientEventId, "uuid-A");
});

test("AGENT-API-01/T2: POST without client_event_id returns 400 invalid_payload (D-C3)", async () => {
  const app = makeApp(makeDeps());
  const body = validBody();
  delete body["client_event_id"];
  const res = await postEvent(app, body);
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string; message: string };
  assert.equal(json.error, "invalid_payload");
  assert.match(json.message, /client_event_id/);
});

test("AGENT-API-01/T3: POST same client_event_id twice — first 201, second 200 with same row (D-C2)", async () => {
  const seen = new Map<string, DrizzleAgentEvent>();
  const app = makeApp(
    makeDeps({
      dbInsertOrGet: async (row) => {
        const key = `${row.userId}:${row.clientEventId}`;
        const existing = seen.get(key);
        if (existing) return { row: existing, isNew: false };
        const inserted = makeRow(row.userId, {
          sessionId: row.sessionId,
          clientEventId: row.clientEventId ?? null,
        });
        seen.set(key, inserted);
        return { row: inserted, isNew: true };
      },
    }),
  );

  const body = validBody({ client_event_id: "uuid-dup" });
  const res1 = await postEvent(app, body);
  assert.equal(res1.status, 201, "first POST must be 201");
  const row1 = (await res1.json()) as DrizzleAgentEvent;

  const res2 = await postEvent(app, body);
  assert.equal(
    res2.status,
    200,
    "second POST with same client_event_id must be 200 (D-C2 idempotent)",
  );
  const row2 = (await res2.json()) as DrizzleAgentEvent;
  assert.deepEqual(row2, row1, "second response must be the same row");
});

// Table-driven test for the 5 VALID_EVENTS (T4-T8 collapsed)
for (const evt of [
  "needs_input",
  "task_complete",
  "task_failed",
  "milestone",
  "heartbeat",
] as const) {
  test(`AGENT-API-01/T4-T8: POST with event="${evt}" returns 201`, async () => {
    const app = makeApp(makeDeps());
    const res = await postEvent(
      app,
      validBody({ event: evt, client_event_id: `uuid-${evt}` }),
    );
    assert.equal(res.status, 201);
  });
}

test("AGENT-API-01/T9: POST with invalid event value returns 400 invalid_event", async () => {
  const app = makeApp(makeDeps());
  const res = await postEvent(
    app,
    validBody({ event: "made_up_event", client_event_id: "uuid-bad-evt" }),
  );
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string; message: string };
  assert.equal(json.error, "invalid_event");
  assert.match(json.message, /needs_input/); // error message lists valid values
});

test("AGENT-API-01/T10: POST with malformed timestamp returns 400 invalid_timestamp", async () => {
  const app = makeApp(makeDeps());
  const res = await postEvent(
    app,
    validBody({ timestamp: "not a date", client_event_id: "uuid-bad-ts" }),
  );
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string; message: string };
  assert.equal(json.error, "invalid_timestamp");
});

test("AGENT-API-01/T11: POST with unknown field returns 400 unknown_field (D-Discretion strict())", async () => {
  const app = makeApp(makeDeps());
  const res = await postEvent(
    app,
    validBody({ extra_field: "x", client_event_id: "uuid-extra" }),
  );
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string; message: string };
  assert.equal(json.error, "unknown_field");
  assert.match(json.message, /extra_field/);
});

test("AGENT-API-01/T12: POST with body.userId attempted is rejected as unknown_field (mass-assignment defense)", async () => {
  let captured: NewAgentEvent | null = null;
  const app = makeApp(
    makeDeps({
      dbInsertOrGet: async (row) => {
        captured = row;
        return {
          row: makeRow(row.userId, { clientEventId: row.clientEventId ?? null }),
          isNew: true,
        };
      },
    }),
    42,
  );

  // KNOWN_FIELDS guard rejects body.userId as unknown_field.
  // If a future regression accidentally includes 'userId' in KNOWN_FIELDS,
  // this test STILL fails at the unknown_field check — correct behavior.
  const res = await postEvent(
    app,
    validBody({ userId: 999, client_event_id: "uuid-mass" }),
  );
  assert.equal(res.status, 400, "body.userId must be rejected as unknown_field");
  assert.equal(
    captured,
    null,
    "dbInsertOrGet must NOT have been called when validation rejects",
  );
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "unknown_field");
});

test("AGENT-API-01/T13: POST without label returns 400 missing_field", async () => {
  const app = makeApp(makeDeps());
  const body = validBody({ client_event_id: "uuid-no-label" });
  delete body["label"];
  const res = await postEvent(app, body);
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string; message: string };
  assert.equal(json.error, "missing_field");
  assert.match(json.message, /label/);
});

test("AGENT-API-01/T14: POST with non-integer exit_code returns 400 invalid_payload", async () => {
  const app = makeApp(makeDeps());
  const res = await postEvent(
    app,
    validBody({ exit_code: 3.14, client_event_id: "uuid-fract-exit" }),
  );
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string; message: string };
  assert.equal(json.error, "invalid_payload");
  assert.match(json.message, /exit_code/);
});

test("AGENT-API-01/T15: POST with deps.dbAvailable=false returns 503 db_unavailable", async () => {
  const app = makeApp(makeDeps({ dbAvailable: false }));
  const res = await postEvent(app, validBody({ client_event_id: "uuid-503" }));
  assert.equal(res.status, 503);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "db_unavailable");
});

test("AGENT-API-01/T16: POST with malformed JSON returns 400 invalid_json", async () => {
  const app = makeApp(makeDeps());
  const res = await postEvent(app, "{not json");
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "invalid_json");
});

// ── GET /v1/agent-sessions tests ───────────────────────────────────────────────

test("AGENT-API-02/T1: GET happy path returns 200 + data array (sorted DESC handled by dep)", async () => {
  const sessions: AgentSessionRow[] = [
    {
      sessionId: "s1",
      label: "l",
      host: "h",
      lastEvent: {
        event: "needs_input",
        message: "m",
        eventTimestamp: "2026-05-08T12:00:00Z",
      },
      eventCount: 3,
    },
    {
      sessionId: "s2",
      label: "l",
      host: "h",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: "2026-05-08T11:00:00Z",
      },
      eventCount: 1,
    },
  ];
  const app = makeApp(makeDeps({ dbListSessions: async () => sessions }));
  const res = await getSessions(app);
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: AgentSessionRow[] };
  assert.equal(json.data.length, 2);
  assert.equal(json.data[0]!.sessionId, "s1");
});

test("AGENT-API-02/T2: GET with ?since=<ISO> passes parsed Date to dep", async () => {
  let capturedSince: Date | null = null;
  const app = makeApp(
    makeDeps({
      dbListSessions: async (_uid, since) => {
        capturedSince = since;
        return [];
      },
    }),
  );
  const res = await getSessions(app, "?since=2026-01-01T00:00:00Z");
  assert.equal(res.status, 200);
  assert.ok(capturedSince instanceof Date);
  assert.equal(capturedSince!.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("AGENT-API-02/T3: GET with malformed since returns 400 invalid_query", async () => {
  const app = makeApp(makeDeps());
  const res = await getSessions(app, "?since=not-a-date");
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "invalid_query");
});

test("AGENT-API-02/T4: GET passes 100 as limit arg (D-B4 hard cap)", async () => {
  let capturedLimit: number | null = null;
  const app = makeApp(
    makeDeps({
      dbListSessions: async (_uid, _since, lim) => {
        capturedLimit = lim;
        return [];
      },
    }),
  );
  const res = await getSessions(app);
  assert.equal(res.status, 200);
  assert.equal(capturedLimit, 100, "limit arg must be 100 per D-B4");
});

test("AGENT-API-02/T5: GET with empty result returns 200 + { data: [] }", async () => {
  const app = makeApp(makeDeps({ dbListSessions: async () => [] }));
  const res = await getSessions(app);
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: AgentSessionRow[] };
  assert.deepEqual(json.data, []);
});

test("AGENT-API-02/T6: GET dbListSessions called with correct userId (scoping wiring)", async () => {
  let capturedUid: number | null = null;
  const app = makeApp(
    makeDeps({
      dbListSessions: async (uid) => {
        capturedUid = uid;
        return [];
      },
    }),
    99,
  );
  const res = await getSessions(app);
  assert.equal(res.status, 200);
  assert.equal(capturedUid, 99, "dbListSessions must receive userId from c.get('userId')");
});

// ── Drift detectors (lock VALID_EVENTS in source + migration) ──────────────────

test("DRIFT/T1: agent-events.ts source declares the 5 VALID_EVENTS values verbatim", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "agent-events.ts"), "utf8");
  // The VALID_EVENTS const must contain all 5 strings verbatim (Phase 121 D-A2 lock).
  // If a future edit reorders OR drops OR adds a value, this fails.
  for (const v of [
    "needs_input",
    "task_complete",
    "task_failed",
    "milestone",
    "heartbeat",
  ]) {
    assert.match(
      src,
      new RegExp(`"${v}"`),
      `agent-events.ts must declare "${v}" in VALID_EVENTS verbatim (D-A2 lock)`,
    );
  }
  // Also assert the array has exactly 5 entries — guard against silent additions.
  const validEventsBlock = src.match(
    /export const VALID_EVENTS = \[([\s\S]*?)\] as const;/,
  );
  assert.ok(validEventsBlock, "VALID_EVENTS const block must be parseable");
  const stringLiterals = validEventsBlock![1]!.match(/"[a-z_]+"/g) ?? [];
  assert.equal(
    stringLiterals.length,
    5,
    `VALID_EVENTS must have exactly 5 entries, found ${stringLiterals.length} (D-A2 lock)`,
  );
  // And the in-memory const matches what we found in the source (sanity).
  assert.deepEqual(
    [...VALID_EVENTS],
    ["needs_input", "task_complete", "task_failed", "milestone", "heartbeat"],
    "in-memory VALID_EVENTS must match source array order (D-A2 lock)",
  );
});

test("DRIFT/T2: 0018_add_agent_events.sql CHECK constraint declares the 5 values verbatim", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const migrationPath = path.join(
    here,
    "..",
    "..",
    "drizzle",
    "0018_add_agent_events.sql",
  );
  const src = fs.readFileSync(migrationPath, "utf8");
  // Lock the exact CHECK clause shape — guards against accidental simplification
  // (e.g., dropping the CHECK altogether) AND value drift.
  assert.match(
    src,
    /CHECK \("event" IN \('needs_input','task_complete','task_failed','milestone','heartbeat'\)\)/,
    "0018_add_agent_events.sql CHECK constraint must list the 5 values verbatim (D-A2 lock)",
  );
  // Lock the partial unique index predicate (D-A4 + D-D2 block 3).
  assert.match(
    src,
    /CREATE UNIQUE INDEX[^;]+"agent_events"\s*\("user_id",\s*"client_event_id"\)\s*WHERE\s*"client_event_id"\s*IS\s*NOT\s*NULL/,
    "0018_add_agent_events.sql partial unique index must scope on (user_id, client_event_id) WHERE client_event_id IS NOT NULL (D-D2 block 3 lock)",
  );
});
