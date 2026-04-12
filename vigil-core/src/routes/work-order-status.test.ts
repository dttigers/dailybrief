import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// ── Dependency injection factory (mirrors process-photo.test.ts pattern) ─────

interface WorkOrderStatusDeps {
  dbSelectFn: () => Promise<Array<{ caseNumber: string; status: string }>>;
  dbUpsertFn: (caseNumber: string, status: string) => Promise<void>;
  dbAvailable: boolean;
}

// Import the factory from the route file (created in GREEN phase)
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

async function put(router: Hono, caseNumber: string, body: unknown): Promise<Response> {
  return router.request(`/work-orders/${caseNumber}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function getStatuses(router: Hono): Promise<Response> {
  return router.request("/work-orders/statuses", {
    method: "GET",
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("WO-02/T1: PUT /work-orders/TEST001/status with done returns 200 and correct body", async () => {
  const router = createWorkOrderStatusRouter(makeDeps());
  const res = await put(router, "TEST001", { status: "done" });
  assert.equal(res.status, 200);
  const json = await res.json() as { caseNumber: string; status: string };
  assert.equal(json.caseNumber, "TEST001");
  assert.equal(json.status, "done");
});

test("WO-02/T2: PUT with invalid status returns 400 with error message containing 'status must be one of'", async () => {
  const router = createWorkOrderStatusRouter(makeDeps());
  const res = await put(router, "TEST001", { status: "invalid" });
  assert.equal(res.status, 400);
  const json = await res.json() as { error: string };
  assert.match(json.error, /status must be one of/);
});

test("WO-02/T3: PUT same case number twice returns updated status (upsert, not duplicate)", async () => {
  const store: Record<string, string> = {};
  const router = createWorkOrderStatusRouter(
    makeDeps({
      dbUpsertFn: async (caseNumber, status) => {
        store[caseNumber] = status;
      },
      dbSelectFn: async () =>
        Object.entries(store).map(([caseNumber, status]) => ({ caseNumber, status })),
    }),
  );

  // First PUT: open
  const res1 = await put(router, "TEST001", { status: "open" });
  assert.equal(res1.status, 200);
  const json1 = await res1.json() as { caseNumber: string; status: string };
  assert.equal(json1.status, "open");

  // Second PUT: done (upsert)
  const res2 = await put(router, "TEST001", { status: "done" });
  assert.equal(res2.status, 200);
  const json2 = await res2.json() as { caseNumber: string; status: string };
  assert.equal(json2.status, "done");

  // GET should show only one entry for TEST001 with the updated status
  const res3 = await getStatuses(router);
  assert.equal(res3.status, 200);
  const map = await res3.json() as Record<string, string>;
  assert.equal(Object.keys(map).filter((k) => k === "TEST001").length, 1);
  assert.equal(map["TEST001"], "done");
});

test("WO-03/T4: GET /work-orders/statuses returns a flat { caseNumber: status } map", async () => {
  const router = createWorkOrderStatusRouter(
    makeDeps({
      dbSelectFn: async () => [
        { caseNumber: "TEST001", status: "done" },
        { caseNumber: "TEST002", status: "open" },
      ],
    }),
  );
  const res = await getStatuses(router);
  assert.equal(res.status, 200);
  const json = await res.json() as Record<string, string>;
  assert.equal(json["TEST001"], "done");
  assert.equal(json["TEST002"], "open");
});

test("WO-03/T5: GET /work-orders/statuses when empty returns {}", async () => {
  const router = createWorkOrderStatusRouter(makeDeps({ dbSelectFn: async () => [] }));
  const res = await getStatuses(router);
  assert.equal(res.status, 200);
  const json = await res.json() as Record<string, string>;
  assert.deepEqual(json, {});
});
