import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// ── Dependency injection factory (mirrors process-photo.test.ts pattern) ─────
// Phase 108 W-01: dbSelectFn / dbUpsertFn now take userId as first parameter.

interface WorkOrderStatusDeps {
  dbSelectFn: (userId: number) => Promise<Array<{ caseNumber: string; status: string }>>;
  dbUpsertFn: (userId: number, caseNumber: string, status: string) => Promise<void>;
  dbAvailable: boolean;
}

// Import the factory from the route file
import { createWorkOrderStatusRouter } from "./work-order-status.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<WorkOrderStatusDeps> = {}): WorkOrderStatusDeps {
  return {
    dbAvailable: true,
    dbSelectFn: async () => [],
    dbUpsertFn: async () => {},
    ...overrides,
  };
}

// Build a Hono app that stubs c.set("userId", <id>) BEFORE routing to the
// factory router. Mirrors production, where bearerAuth sets userId on the
// context for every route under /v1.
function makeApp(deps: WorkOrderStatusDeps, userId: number = 1): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/", createWorkOrderStatusRouter(deps));
  return app;
}

async function put(app: Hono, caseNumber: string, body: unknown): Promise<Response> {
  return app.request(`/work-orders/${caseNumber}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function getStatuses(app: Hono): Promise<Response> {
  return app.request("/work-orders/statuses", {
    method: "GET",
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("WO-02/T1: PUT /work-orders/TEST001/status with done returns 200 and correct body", async () => {
  const app = makeApp(makeDeps());
  const res = await put(app, "TEST001", { status: "done" });
  assert.equal(res.status, 200);
  const json = await res.json() as { caseNumber: string; status: string };
  assert.equal(json.caseNumber, "TEST001");
  assert.equal(json.status, "done");
});

test("WO-02/T2: PUT with invalid status returns 400 with error message containing 'status must be one of'", async () => {
  const app = makeApp(makeDeps());
  const res = await put(app, "TEST001", { status: "invalid" });
  assert.equal(res.status, 400);
  const json = await res.json() as { error: string };
  assert.match(json.error, /status must be one of/);
});

test("WO-02/T3: PUT same case number twice returns updated status (upsert, not duplicate)", async () => {
  // userId-keyed store (Phase 108 — composite PK).
  const store: Record<number, Record<string, string>> = {};
  const app = makeApp(
    makeDeps({
      dbUpsertFn: async (userId, caseNumber, status) => {
        if (!store[userId]) store[userId] = {};
        store[userId][caseNumber] = status;
      },
      dbSelectFn: async (userId) =>
        Object.entries(store[userId] ?? {}).map(([caseNumber, status]) => ({ caseNumber, status })),
    }),
  );

  // First PUT: open
  const res1 = await put(app, "TEST001", { status: "open" });
  assert.equal(res1.status, 200);
  const json1 = await res1.json() as { caseNumber: string; status: string };
  assert.equal(json1.status, "open");

  // Second PUT: done (upsert)
  const res2 = await put(app, "TEST001", { status: "done" });
  assert.equal(res2.status, 200);
  const json2 = await res2.json() as { caseNumber: string; status: string };
  assert.equal(json2.status, "done");

  // GET should show only one entry for TEST001 with the updated status
  const res3 = await getStatuses(app);
  assert.equal(res3.status, 200);
  const map = await res3.json() as Record<string, string>;
  assert.equal(Object.keys(map).filter((k) => k === "TEST001").length, 1);
  assert.equal(map["TEST001"], "done");
});

test("WO-03/T4: GET /work-orders/statuses returns a flat { caseNumber: status } map", async () => {
  const app = makeApp(
    makeDeps({
      dbSelectFn: async () => [
        { caseNumber: "TEST001", status: "done" },
        { caseNumber: "TEST002", status: "open" },
      ],
    }),
  );
  const res = await getStatuses(app);
  assert.equal(res.status, 200);
  const json = await res.json() as Record<string, string>;
  assert.equal(json["TEST001"], "done");
  assert.equal(json["TEST002"], "open");
});

test("WO-03/T5: GET /work-orders/statuses when empty returns {}", async () => {
  const app = makeApp(makeDeps({ dbSelectFn: async () => [] }));
  const res = await getStatuses(app);
  assert.equal(res.status, 200);
  const json = await res.json() as Record<string, string>;
  assert.deepEqual(json, {});
});

// ── Phase 108 W-01 — new: cross-user wiring tests ────────────────────────────

test("Phase 108 W-01: dbUpsertFn receives correct userId argument (composite conflict target)", async () => {
  let capturedUserId: number | null = null;
  let capturedCaseNumber: string | null = null;
  const app = makeApp(
    makeDeps({
      dbUpsertFn: async (userId, caseNumber, _status) => {
        capturedUserId = userId;
        capturedCaseNumber = caseNumber;
      },
    }),
    42, // app-level userId stub
  );
  const res = await put(app, "CASE-X", { status: "open" });
  assert.equal(res.status, 200);
  assert.equal(capturedUserId, 42, "dbUpsertFn must receive userId from c.get('userId')");
  assert.equal(capturedCaseNumber, "CASE-X");
});

test("Phase 108 W-01: dbSelectFn receives correct userId argument (scoped GET)", async () => {
  let capturedUserId: number | null = null;
  const app = makeApp(
    makeDeps({
      dbSelectFn: async (userId) => {
        capturedUserId = userId;
        return [];
      },
    }),
    99,
  );
  const res = await getStatuses(app);
  assert.equal(res.status, 200);
  assert.equal(capturedUserId, 99, "dbSelectFn must receive userId from c.get('userId')");
});
