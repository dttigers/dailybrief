// Set JWT_SECRET BEFORE importing the route — utils/jwt.ts exits at import time
// without it (per index.ts:61-64 and the auth.test.ts pattern at line 21).
// work-orders.ts does not directly import utils/jwt.ts, but this block is
// included for self-contained copy-paste safety (per Phase 129 / Plan 04 spec).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lazy import after env is set (safety net for transitive jwt imports).
const { createWorkOrdersRoute } = await import("./work-orders.js");

// ── Types (mirrors agent-events.test.ts shape) ─────────────────────────────

interface WorkOrderRow {
  caseNumber: string;
  userId: number;
  clientCaptureId: string | null;
  shortDescription: string;
  priority: string;
  syncedAt: Date;
  [key: string]: unknown;
}

interface WorkOrdersDeps {
  dbAvailable: boolean;
  db: unknown;
  dbInsertOrGet: (input: Record<string, unknown>) => Promise<{ row: WorkOrderRow; isNew: boolean }>;
  dbUpsertLegacy: (input: Record<string, unknown>) => Promise<{ row: WorkOrderRow }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

let idCounter = 0;

function makeWorkOrderRow(userId: number, caseNumber: string, overrides: Partial<WorkOrderRow> = {}): WorkOrderRow {
  return {
    caseNumber,
    userId,
    clientCaptureId: null,
    shortDescription: "test description",
    priority: "Medium",
    syncedAt: new Date(),
    ...overrides,
  };
}

// makeDeps: creates a deps object with in-memory dedup map (mirrors agent-events.test.ts makeDeps)
function makeDeps(overrides: Partial<WorkOrdersDeps> = {}): WorkOrdersDeps {
  // In-memory dedup map keyed by `${userId}|${clientCaptureId}`
  const dedupMap = new Map<string, WorkOrderRow>();
  // In-memory legacy upsert map keyed by caseNumber
  const legacyMap = new Map<string, WorkOrderRow>();

  return {
    dbAvailable: true,
    db: null,
    dbInsertOrGet: async (input) => {
      const userId = input.userId as number;
      const clientCaptureId = input.clientCaptureId as string;
      const caseNumber = input.caseNumber as string;
      const key = `${userId}|${clientCaptureId}`;
      if (dedupMap.has(key)) {
        return { row: dedupMap.get(key)!, isNew: false };
      }
      const row = makeWorkOrderRow(userId, caseNumber, {
        clientCaptureId,
        shortDescription: input.shortDescription as string,
        priority: input.priority as string,
        syncedAt: input.syncedAt as Date,
        id: ++idCounter,
      });
      dedupMap.set(key, row);
      return { row, isNew: true };
    },
    dbUpsertLegacy: async (input) => {
      const userId = input.userId as number;
      const caseNumber = input.caseNumber as string;
      const row = makeWorkOrderRow(userId, caseNumber, {
        shortDescription: input.shortDescription as string,
        priority: input.priority as string,
        syncedAt: input.syncedAt as Date,
        id: ++idCounter,
      });
      legacyMap.set(caseNumber, row);
      return { row };
    },
    ...overrides,
  };
}

// Build a Hono app that stubs c.set("userId", <id>) BEFORE routing to the
// factory router. Mirrors production, where bearerAuth sets userId on the
// context for every route under /v1.
function makeApp(deps: WorkOrdersDeps, userId: number = 1): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/", createWorkOrdersRoute(deps));
  return app;
}

async function postSync(app: Hono, body: unknown): Promise<Response> {
  return app.request("/work-orders/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ── POST /work-orders/sync tests ───────────────────────────────────────────────

// SVCNOW-04/T1: Idempotency — first POST with clientCaptureId → synced:1
test("SVCNOW-04/T1: POST with clientCaptureId (first time) — invokes dbInsertOrGet, returns 200 {synced:1}", async () => {
  let insertOrGetCalls = 0;
  let capturedInput: Record<string, unknown> | null = null;

  const deps = makeDeps({
    dbInsertOrGet: async (input) => {
      insertOrGetCalls++;
      capturedInput = input;
      return {
        row: makeWorkOrderRow(input.userId as number, input.caseNumber as string, {
          clientCaptureId: input.clientCaptureId as string,
        }),
        isNew: true,
      };
    },
  });
  const app = makeApp(deps, 1);

  const res = await postSync(app, {
    workOrders: [
      {
        caseNumber: "CS9999991",
        shortDescription: "a",
        priority: "Medium",
        clientCaptureId: "uuid-A",
      },
    ],
  });

  assert.equal(res.status, 200);
  const json = (await res.json()) as { synced: number };
  assert.equal(json.synced, 1, "first POST with clientCaptureId must return synced:1");
  assert.equal(insertOrGetCalls, 1, "dbInsertOrGet invoked exactly once");
  assert.ok(capturedInput, "dbInsertOrGet was called");
  assert.equal(capturedInput!.userId, 1, "userId comes from middleware, not body");
  assert.equal(capturedInput!.clientCaptureId, "uuid-A");
  assert.equal(capturedInput!.caseNumber, "CS9999991");
});

// SVCNOW-04/T2: Idempotency — second POST with same clientCaptureId → synced:0 (dedup hit)
test("SVCNOW-04/T2: POST same clientCaptureId twice (user 1) — second returns synced:0 (dedup)", async () => {
  const deps = makeDeps();
  const app = makeApp(deps, 1);

  const body = {
    workOrders: [
      {
        caseNumber: "CS9999991",
        shortDescription: "a",
        priority: "Medium",
        clientCaptureId: "uuid-A",
      },
    ],
  };

  const res1 = await postSync(app, body);
  assert.equal(res1.status, 200);
  const json1 = (await res1.json()) as { synced: number };
  assert.equal(json1.synced, 1, "first POST must return synced:1");

  const res2 = await postSync(app, body);
  assert.equal(res2.status, 200);
  const json2 = (await res2.json()) as { synced: number };
  assert.equal(json2.synced, 0, "second POST with same clientCaptureId must return synced:0 (dedup)");
});

// SVCNOW-04/T3: Per-user scoping — same clientCaptureId from different users → both synced:1
test("SVCNOW-04/T3: Same clientCaptureId from different users — both return synced:1 (per-user scope)", async () => {
  const deps = makeDeps();
  // user 1 submits uuid-A
  const app1 = makeApp(deps, 1);
  const res1 = await postSync(app1, {
    workOrders: [{ caseNumber: "CS9999991", shortDescription: "a", priority: "Medium", clientCaptureId: "uuid-A" }],
  });
  assert.equal((await res1.json() as { synced: number }).synced, 1, "user 1 first POST: synced:1");

  // user 2 submits same uuid-A — DIFFERENT user, should NOT be a dedup
  const app2 = makeApp(deps, 2);
  const res2 = await postSync(app2, {
    workOrders: [{ caseNumber: "CS9999992", shortDescription: "b", priority: "Low", clientCaptureId: "uuid-A" }],
  });
  assert.equal(res2.status, 200);
  assert.equal((await res2.json() as { synced: number }).synced, 1, "user 2 same clientCaptureId: synced:1 (per-user scope)");
});

// SVCNOW-04/T4: Backward-compat — POST without clientCaptureId → routes through dbUpsertLegacy
test("SVCNOW-04/T4: POST without clientCaptureId routes through dbUpsertLegacy — returns synced:1", async () => {
  let insertOrGetCalls = 0;
  let upsertLegacyCalls = 0;

  const deps = makeDeps({
    dbInsertOrGet: async (input) => {
      insertOrGetCalls++;
      return { row: makeWorkOrderRow(input.userId as number, input.caseNumber as string), isNew: true };
    },
    dbUpsertLegacy: async (input) => {
      upsertLegacyCalls++;
      return { row: makeWorkOrderRow(input.userId as number, input.caseNumber as string) };
    },
  });
  const app = makeApp(deps, 1);

  const res = await postSync(app, {
    workOrders: [
      { caseNumber: "CS9999992", shortDescription: "b", priority: "Low" },
    ],
  });

  assert.equal(res.status, 200);
  const json = (await res.json()) as { synced: number };
  assert.equal(json.synced, 1, "no clientCaptureId → legacy path → synced:1");
  assert.equal(insertOrGetCalls, 0, "dbInsertOrGet must NOT be called for legacy path");
  assert.equal(upsertLegacyCalls, 1, "dbUpsertLegacy must be called exactly once");
});

// SVCNOW-04/T5: Backward-compat — two POSTs of the same legacy order both return synced:1
test("SVCNOW-04/T5: Two POSTs of same legacy order (no clientCaptureId) — both return synced:1 (legacy upsert behavior)", async () => {
  const deps = makeDeps();
  const app = makeApp(deps, 1);

  const body = {
    workOrders: [{ caseNumber: "CS9999992", shortDescription: "b", priority: "Low" }],
  };

  const res1 = await postSync(app, body);
  assert.equal((await res1.json() as { synced: number }).synced, 1, "first legacy POST: synced:1");

  const res2 = await postSync(app, body);
  assert.equal((await res2.json() as { synced: number }).synced, 1, "second legacy POST: synced:1 (legacy upsert unchanged)");
});

// SVCNOW-04/T6: Mass-assignment defense — injected userId=999 and syncedAt are ignored
test("SVCNOW-04/T6: Mass-assignment defense — injected userId=999 lands as userId=1 from middleware", async () => {
  let capturedInput: Record<string, unknown> | null = null;

  const deps = makeDeps({
    dbInsertOrGet: async (input) => {
      capturedInput = input;
      return {
        row: makeWorkOrderRow(input.userId as number, input.caseNumber as string, {
          clientCaptureId: input.clientCaptureId as string,
        }),
        isNew: true,
      };
    },
  });
  const app = makeApp(deps, 1);

  const attackerEpochDate = new Date(0); // 1970-01-01 — attacker's injected syncedAt
  const res = await postSync(app, {
    workOrders: [
      {
        caseNumber: "CS9999991",
        shortDescription: "a",
        priority: "Medium",
        clientCaptureId: "uuid-mass",
        userId: 999, // attacker injects
        syncedAt: attackerEpochDate.toISOString(), // attacker injects
      },
    ],
  });

  assert.equal(res.status, 200);
  assert.ok(capturedInput, "dbInsertOrGet must have been called");
  assert.equal(capturedInput!.userId, 1, "userId must be 1 from middleware, NOT 999 from body");
  // syncedAt must be server-generated (close to now), NOT the 1970 epoch
  const syncedAt = capturedInput!.syncedAt as Date;
  const nowMs = Date.now();
  assert.ok(
    syncedAt instanceof Date && Math.abs(nowMs - syncedAt.getTime()) < 5000,
    "syncedAt must be server-generated (within 5s of now), not the attacker's 1970 value"
  );
});

// SVCNOW-04/T7: snake_case fallback — client_capture_id (snake_case) accepted
test("SVCNOW-04/T7: snake_case client_capture_id fallback accepted — maps to clientCaptureId", async () => {
  let capturedClientCaptureId: string | null = null;

  const deps = makeDeps({
    dbInsertOrGet: async (input) => {
      capturedClientCaptureId = input.clientCaptureId as string;
      return {
        row: makeWorkOrderRow(input.userId as number, input.caseNumber as string, {
          clientCaptureId: input.clientCaptureId as string,
        }),
        isNew: true,
      };
    },
  });
  const app = makeApp(deps, 1);

  const res = await postSync(app, {
    workOrders: [
      {
        caseNumber: "CS9999991",
        shortDescription: "a",
        priority: "Medium",
        client_capture_id: "uuid-snake", // snake_case
      },
    ],
  });

  assert.equal(res.status, 200);
  assert.equal((await res.json() as { synced: number }).synced, 1);
  assert.equal(capturedClientCaptureId, "uuid-snake", "snake_case client_capture_id must be accepted");
});

// SVCNOW-04/T8: DB unavailable → 503
test("SVCNOW-04/T8: DB unavailable returns 503", async () => {
  const deps = makeDeps({ dbAvailable: false });
  const app = makeApp(deps, 1);

  const res = await postSync(app, {
    workOrders: [{ caseNumber: "CS9999991", shortDescription: "a", priority: "Medium", clientCaptureId: "uuid-A" }],
  });

  assert.equal(res.status, 503);
});

// ── Drift detectors ────────────────────────────────────────────────────────────

test("DRIFT/T1: work-orders.ts source contains app-layer dedup guard (dbInsertOrGet or select.*client_capture_id)", () => {
  const src = readFileSync(resolve(__dirname, "work-orders.ts"), "utf-8");
  // Checker BLOCKER 4 mitigation: pins app-layer dedup in source even when CI
  // cannot spin up a real Postgres for index enforcement.
  assert.match(
    src,
    /dbInsertOrGet|select.*client_capture_id/i,
    "work-orders.ts must reference dbInsertOrGet or SELECT-by-clientCaptureId (app-layer dedup drift detector)"
  );
});

test("DRIFT/T2: 0021 migration SQL contains WHERE client_capture_id IS NOT NULL (partial index predicate)", () => {
  const migrationPath = resolve(__dirname, "..", "..", "drizzle", "0021_add_work_orders_client_capture_id.sql");
  const src = readFileSync(migrationPath, "utf-8");
  assert.match(
    src,
    /WHERE "client_capture_id" IS NOT NULL/,
    "0021 migration must contain the partial unique index predicate (T-129-17 migration drift lock)"
  );
});

// ── Acceptance criteria structural checks ─────────────────────────────────────

test("STRUCT/T1: work-orders.ts exports createWorkOrdersRoute factory", () => {
  const src = readFileSync(resolve(__dirname, "work-orders.ts"), "utf-8");
  const factoryCount = (src.match(/export function createWorkOrdersRoute/g) ?? []).length;
  assert.equal(factoryCount, 1, "work-orders.ts must export exactly one createWorkOrdersRoute function");
});

test("STRUCT/T2: work-orders.ts exports pre-wired workOrdersRouter binding", () => {
  const src = readFileSync(resolve(__dirname, "work-orders.ts"), "utf-8");
  const bindingCount = (src.match(/export const workOrdersRouter/g) ?? []).length;
  assert.equal(bindingCount, 1, "work-orders.ts must export exactly one workOrdersRouter binding");
});
