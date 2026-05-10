// Phase 125 Plan 05 — GREEN tests for /v1/quiet-mode endpoint contract.
//
// Replaces the Wave-0 Plan 01 RED placeholders. Pattern reference:
// vigil-core/src/routes/calendar.test.ts (CAL-01) — factory-deps style,
// outer Hono app pre-sets c.set("userId") to mirror the production
// bearerAuth dispatcher.
//
// Threat coverage:
//   - T-125-01 (cross-user isolation): Test 7 asserts userA's PUT does not
//     affect userB's column or held-events queue.
//   - T-125-02 (auth bypass): structural — userId is read from c.get(),
//     never from body. Test 7 also pins this (different userId middleware
//     for "userA" vs "userB" produces independent state surfaces).

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import type { DrizzleAgentEvent } from "../db/types.js";

// Lazy imports after env is set.
const { createQuietModeRouter } = await import("./quiet-mode.js");
const { suppressionQueue } = await import("../lib/quiet-mode-suppression.js");
const { bus } = await import("../lib/agent-events-bus.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

interface QuietState {
  enabled: boolean;
  since: Date | null;
}

interface SetCall {
  userId: number;
  enabled: boolean;
  since: Date | null;
}

function makeDeps(opts: {
  dbAvailable?: boolean;
  initialState?: Map<number, QuietState>;
}): {
  deps: {
    dbAvailable: boolean;
    dbGet: (userId: number) => Promise<QuietState>;
    dbSet: (userId: number, enabled: boolean, since: Date | null) => Promise<void>;
  };
  state: Map<number, QuietState>;
  setCalls: SetCall[];
} {
  const state = opts.initialState ?? new Map<number, QuietState>();
  const setCalls: SetCall[] = [];
  return {
    deps: {
      dbAvailable: opts.dbAvailable ?? true,
      dbGet: async (userId) =>
        state.get(userId) ?? { enabled: false, since: null },
      dbSet: async (userId, enabled, since) => {
        state.set(userId, { enabled, since });
        setCalls.push({ userId, enabled, since });
      },
    },
    state,
    setCalls,
  };
}

function makeAppWithUserId(
  deps: ReturnType<typeof makeDeps>["deps"],
  userId = 1,
): Hono {
  const inner = createQuietModeRouter(deps);
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId" as never, userId as never);
    await next();
  });
  app.route("/", inner);
  return app;
}

function makeRow(overrides: Partial<DrizzleAgentEvent> = {}): DrizzleAgentEvent {
  return {
    id: 1,
    userId: 1,
    sessionId: "claude-test-001",
    event: "heartbeat",
    message: "test",
    label: "test-label",
    host: "test-host",
    exitCode: null,
    eventTimestamp: new Date("2026-05-09T12:00:00Z"),
    receivedAt: new Date("2026-05-09T12:00:01Z"),
    clientEventId: "uuid-test-001",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("GET /v1/quiet-mode returns {enabled:false, since:null} for fresh user", async () => {
  const { deps } = makeDeps({});
  const app = makeAppWithUserId(deps);
  const res = await app.request("/quiet-mode");
  assert.equal(res.status, 200);
  const json = (await res.json()) as { enabled: boolean; since: string | null };
  assert.deepEqual(json, { enabled: false, since: null });
});

test("GET /v1/quiet-mode returns {enabled:true, since:ISO} after enabling", async () => {
  const initial = new Map<number, QuietState>([
    [1, { enabled: true, since: new Date("2026-05-10T10:00:00Z") }],
  ]);
  const { deps } = makeDeps({ initialState: initial });
  const app = makeAppWithUserId(deps);
  const res = await app.request("/quiet-mode");
  assert.equal(res.status, 200);
  const json = (await res.json()) as { enabled: boolean; since: string | null };
  assert.equal(json.enabled, true);
  assert.equal(json.since, "2026-05-10T10:00:00.000Z");
});

test("GET /v1/quiet-mode returns 503 when dbAvailable=false", async () => {
  const { deps } = makeDeps({ dbAvailable: false });
  const app = makeAppWithUserId(deps);
  const res = await app.request("/quiet-mode");
  assert.equal(res.status, 503);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "db_unavailable");
});

test("PUT /v1/quiet-mode {enabled:true} writes column + emits bus.emitQuiet payload + sets since=now", async (t) => {
  suppressionQueue._clearAll();
  const { deps, setCalls, state } = makeDeps({});
  const app = makeAppWithUserId(deps);

  // Capture bus.emitQuiet payload via onQuiet listener.
  const quietEmits: Array<{ enabled: boolean; since: string | null }> = [];
  const quietListener = (p: { enabled: boolean; since: string | null }) =>
    quietEmits.push(p);
  bus.onQuiet(1, quietListener);
  t.after(() => bus.offQuiet(1, quietListener));

  const before = Date.now();
  const res = await app.request("/quiet-mode", {
    method: "PUT",
    body: JSON.stringify({ enabled: true }),
    headers: { "Content-Type": "application/json" },
  });
  const after = Date.now();

  assert.equal(res.status, 200);
  const json = (await res.json()) as { ok: boolean };
  assert.equal(json.ok, true);

  // dbSet called with (1, true, Date(~now))
  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0]!.userId, 1);
  assert.equal(setCalls[0]!.enabled, true);
  assert.ok(setCalls[0]!.since instanceof Date, "since must be a Date");
  const sinceMs = setCalls[0]!.since!.getTime();
  assert.ok(
    sinceMs >= before && sinceMs <= after,
    "since must be within request wallclock window",
  );

  // State surface updated
  const persisted = state.get(1)!;
  assert.equal(persisted.enabled, true);
  assert.ok(persisted.since !== null);

  // emitQuiet fired once with {enabled: true, since: ISO}
  assert.equal(quietEmits.length, 1);
  assert.equal(quietEmits[0]!.enabled, true);
  assert.ok(typeof quietEmits[0]!.since === "string");
  assert.match(quietEmits[0]!.since!, /^\d{4}-\d{2}-\d{2}T/);
});

test("PUT /v1/quiet-mode {enabled:false} writes column + emits bus.emitQuiet + flushes suppressionQueue + re-emits each held row via bus.emit", async (t) => {
  suppressionQueue._clearAll();

  // Seed user 1 as quiet, then capture 3 events into the suppression queue.
  const initial = new Map<number, QuietState>([
    [1, { enabled: true, since: new Date("2026-05-10T08:00:00Z") }],
  ]);
  const { deps, setCalls } = makeDeps({ initialState: initial });
  const app = makeAppWithUserId(deps);

  // Insertion order T+10, T+0, T+20 — flush MUST return chronological (T+0, T+10, T+20).
  const rowAt10 = makeRow({
    id: 101,
    sessionId: "s-A",
    event: "heartbeat",
    eventTimestamp: new Date("2026-05-10T10:00:10Z"),
  });
  const rowAt0 = makeRow({
    id: 102,
    sessionId: "s-A",
    event: "milestone",
    eventTimestamp: new Date("2026-05-10T10:00:00Z"),
  });
  const rowAt20 = makeRow({
    id: 103,
    sessionId: "s-B",
    event: "task_complete",
    eventTimestamp: new Date("2026-05-10T10:00:20Z"),
  });
  // shouldSuppress(uid=1, isQuiet=true, row) — non-allowlist → stored.
  assert.equal(suppressionQueue.shouldSuppress(1, true, rowAt10), true);
  assert.equal(suppressionQueue.shouldSuppress(1, true, rowAt0), true);
  assert.equal(suppressionQueue.shouldSuppress(1, true, rowAt20), true);
  assert.equal(suppressionQueue._size(1), 3);

  // Capture re-emitted rows + quiet payload.
  const replayed: DrizzleAgentEvent[] = [];
  const eventListener = (row: DrizzleAgentEvent) => replayed.push(row);
  bus.on(1, eventListener);
  t.after(() => bus.off(1, eventListener));

  const quietEmits: Array<{ enabled: boolean; since: string | null }> = [];
  const quietListener = (p: { enabled: boolean; since: string | null }) =>
    quietEmits.push(p);
  bus.onQuiet(1, quietListener);
  t.after(() => bus.offQuiet(1, quietListener));

  const res = await app.request("/quiet-mode", {
    method: "PUT",
    body: JSON.stringify({ enabled: false }),
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(res.status, 200);
  // dbSet called with (1, false, null)
  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0]!.enabled, false);
  assert.equal(setCalls[0]!.since, null);

  // emitQuiet fired once with {enabled: false, since: null}
  assert.equal(quietEmits.length, 1);
  assert.deepEqual(quietEmits[0], { enabled: false, since: null });

  // Suppression queue flushed
  assert.equal(suppressionQueue._size(1), 0);

  // All 3 held rows re-emitted via bus.emit in chronological order
  // (T+0 first, then T+10, then T+20 — Pitfall 4 sort applied by flush()).
  assert.equal(replayed.length, 3);
  assert.equal(replayed[0]!.id, 102, "T+0 row (id 102) replays first");
  assert.equal(replayed[1]!.id, 101, "T+10 row (id 101) replays second");
  assert.equal(replayed[2]!.id, 103, "T+20 row (id 103) replays third");
});

test("PUT /v1/quiet-mode rejects non-boolean enabled with 400 invalid_payload", async () => {
  const { deps, setCalls } = makeDeps({});
  const app = makeAppWithUserId(deps);
  const res = await app.request("/quiet-mode", {
    method: "PUT",
    body: JSON.stringify({ enabled: "true" }),
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "invalid_payload");
  assert.equal(setCalls.length, 0, "dbSet must NOT be called when validation fails");
});

test("PUT /v1/quiet-mode rejects missing enabled field with 400 invalid_payload", async () => {
  const { deps, setCalls } = makeDeps({});
  const app = makeAppWithUserId(deps);
  const res = await app.request("/quiet-mode", {
    method: "PUT",
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "invalid_payload");
  assert.equal(setCalls.length, 0);
});

test("PUT /v1/quiet-mode rejects malformed JSON with 400 invalid_json", async () => {
  const { deps, setCalls } = makeDeps({});
  const app = makeAppWithUserId(deps);
  const res = await app.request("/quiet-mode", {
    method: "PUT",
    body: "not-json{",
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "invalid_json");
  assert.equal(setCalls.length, 0);
});

test("PUT /v1/quiet-mode returns 503 when dbAvailable=false", async () => {
  const { deps, setCalls } = makeDeps({ dbAvailable: false });
  const app = makeAppWithUserId(deps);
  const res = await app.request("/quiet-mode", {
    method: "PUT",
    body: JSON.stringify({ enabled: true }),
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(res.status, 503);
  assert.equal(setCalls.length, 0);
});

test("T-125-01 cross-user isolation: userA's PUT does not affect userB's column or held queue", async (t) => {
  suppressionQueue._clearAll();

  // Shared deps + state Map; two different middleware-injected userIds.
  const { deps, setCalls, state } = makeDeps({});
  const appA = makeAppWithUserId(deps, 1);
  const appB = makeAppWithUserId(deps, 2);

  // Seed both users' suppression queues with one held row each.
  const rowForA = makeRow({
    id: 201,
    userId: 1,
    sessionId: "s-A",
    event: "heartbeat",
  });
  const rowForB = makeRow({
    id: 202,
    userId: 2,
    sessionId: "s-B",
    event: "heartbeat",
  });
  suppressionQueue.shouldSuppress(1, true, rowForA);
  suppressionQueue.shouldSuppress(2, true, rowForB);
  assert.equal(suppressionQueue._size(1), 1);
  assert.equal(suppressionQueue._size(2), 1);

  // Capture bus emissions for BOTH users to prove fan-out is isolated.
  const aEvents: DrizzleAgentEvent[] = [];
  const bEvents: DrizzleAgentEvent[] = [];
  const aListener = (r: DrizzleAgentEvent) => aEvents.push(r);
  const bListener = (r: DrizzleAgentEvent) => bEvents.push(r);
  bus.on(1, aListener);
  bus.on(2, bListener);
  t.after(() => {
    bus.off(1, aListener);
    bus.off(2, bListener);
  });

  const aQuietEmits: Array<{ enabled: boolean; since: string | null }> = [];
  const bQuietEmits: Array<{ enabled: boolean; since: string | null }> = [];
  const aQuietListener = (p: { enabled: boolean; since: string | null }) =>
    aQuietEmits.push(p);
  const bQuietListener = (p: { enabled: boolean; since: string | null }) =>
    bQuietEmits.push(p);
  bus.onQuiet(1, aQuietListener);
  bus.onQuiet(2, bQuietListener);
  t.after(() => {
    bus.offQuiet(1, aQuietListener);
    bus.offQuiet(2, bQuietListener);
  });

  // userA PUTs enabled=false — should flush userA's queue ONLY.
  const res = await appA.request("/quiet-mode", {
    method: "PUT",
    body: JSON.stringify({ enabled: false }),
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(res.status, 200);

  // dbSet was called for userA only.
  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0]!.userId, 1);
  assert.equal(setCalls[0]!.enabled, false);

  // userA's queue is flushed; userB's queue is untouched.
  assert.equal(suppressionQueue._size(1), 0, "userA queue flushed");
  assert.equal(suppressionQueue._size(2), 1, "userB queue untouched");

  // userA listeners fired (rowForA replayed + quiet payload); userB listeners
  // received nothing (fan-out is per-userId via EventEmitter Map).
  assert.equal(aEvents.length, 1, "userA receives the replayed row");
  assert.equal(aEvents[0]!.id, 201);
  assert.equal(bEvents.length, 0, "userB receives no rows from userA's flush");
  assert.equal(aQuietEmits.length, 1, "userA emitQuiet fired");
  assert.equal(bQuietEmits.length, 0, "userB emitQuiet did NOT fire");

  // userB's state unchanged: GET as userB returns whatever was there before
  // (no entry → fresh false/null).
  const getB = await appB.request("/quiet-mode");
  const jsonB = (await getB.json()) as { enabled: boolean; since: string | null };
  assert.equal(jsonB.enabled, false);
  assert.equal(jsonB.since, null);

  // Confirm state Map shows userA toggled, no entry for userB (or unchanged).
  assert.equal(state.get(1)?.enabled, false);
  assert.equal(state.has(2), false, "userB state untouched");
});
