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
const { workOrders: workOrdersSchema, workOrderStatuses: workOrderStatusesSchema } = await import(
  "../db/schema.js"
);

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

// ── WO-MANUAL-03: maintenance_problem + department round-trip ─────────────────

// WO-MANUAL-03/T1: sanitizer carries maintenanceProblem + department through to dbInsertOrGet
test("WO-MANUAL-03/T1: maintenance_problem + department reach dbInsertOrGet payload (round-trip)", async () => {
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

  const res = await postSync(app, {
    workOrders: [
      {
        caseNumber: "TEST-CS001",
        clientCaptureId: "uuid-a",
        maintenanceProblem: "HVAC",
        department: "Bakery",
        state: "open",
        shortDescription: "x",
      },
    ],
  });

  assert.equal(res.status, 200);
  assert.ok(capturedInput, "dbInsertOrGet must have been called");
  assert.equal(
    capturedInput!.maintenanceProblem,
    "HVAC",
    "maintenanceProblem must round-trip through sanitizer to dbInsertOrGet payload"
  );
  assert.equal(
    capturedInput!.department,
    "Bakery",
    "department must round-trip through sanitizer to dbInsertOrGet payload"
  );
});

// WO-MANUAL-03/T2: dbUpsertLegacy SET clause carries maintenanceProblem + department on case_number conflict
test("WO-MANUAL-03/T2: legacy path (no clientCaptureId) — sanitizer carries maintenance_problem + department on each POST", async () => {
  const capturedInputs: Array<Record<string, unknown>> = [];

  const deps = makeDeps({
    dbUpsertLegacy: async (input) => {
      capturedInputs.push(input);
      return { row: makeWorkOrderRow(input.userId as number, input.caseNumber as string) };
    },
  });
  const app = makeApp(deps, 1);

  // First POST — legacy path (no clientCaptureId) with one value
  const res1 = await postSync(app, {
    workOrders: [
      {
        caseNumber: "TEST-CS002",
        maintenanceProblem: "Plumbing",
        department: "Deli",
        state: "open",
        shortDescription: "x",
      },
    ],
  });
  assert.equal(res1.status, 200);

  // Second POST same caseNumber, different maintenance_problem + department
  const res2 = await postSync(app, {
    workOrders: [
      {
        caseNumber: "TEST-CS002",
        maintenanceProblem: "Electrical",
        department: "Produce",
        state: "open",
        shortDescription: "x",
      },
    ],
  });
  assert.equal(res2.status, 200);

  assert.equal(capturedInputs.length, 2, "dbUpsertLegacy must have been called twice");
  assert.equal(capturedInputs[0]!.maintenanceProblem, "Plumbing", "first call: maintenanceProblem=Plumbing");
  assert.equal(capturedInputs[0]!.department, "Deli", "first call: department=Deli");
  assert.equal(capturedInputs[1]!.maintenanceProblem, "Electrical", "second call: maintenanceProblem=Electrical");
  assert.equal(capturedInputs[1]!.department, "Produce", "second call: department=Produce");
});

// WO-MANUAL-03/T3: missing maintenance_problem + department default to null (not undefined)
test("WO-MANUAL-03/T3: omitted maintenance_problem + department land as null (not undefined) in sanitizer payload", async () => {
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

  const res = await postSync(app, {
    workOrders: [
      {
        caseNumber: "TEST-CS003",
        clientCaptureId: "uuid-c",
        state: "open",
        shortDescription: "x",
        // maintenanceProblem and department deliberately omitted
      },
    ],
  });

  assert.equal(res.status, 200);
  assert.ok(capturedInput, "dbInsertOrGet must have been called");
  assert.strictEqual(
    capturedInput!.maintenanceProblem,
    null,
    "omitted maintenanceProblem must land as null, not undefined"
  );
  assert.strictEqual(
    capturedInput!.department,
    null,
    "omitted department must land as null, not undefined"
  );
});

// ── WO-MANUAL-05: POST /:caseNumber/commit + DELETE /:caseNumber (Phase 129.1-05) ──
//
// Mock-db builder for the commit + delete routes. Both routes use deps.db directly
// (not dbInsertOrGet/dbUpsertLegacy), so we need a Drizzle-shape stub that supports:
//   - .select().from(table).where(...)              — return matching rows array
//   - .update(table).set(obj).where(...).returning() — apply patch + return updated rows
//   - .delete(table).where(...)                     — remove matching rows
//
// The mock keeps a single in-memory `rows` map keyed by caseNumber. The chain stubs
// ignore the actual SQL where-condition; tests assert on captured args + final state.

interface StoredRow {
  caseNumber: string;
  userId: number;
  state: string;
  shortDescription: string;
  store: string;
  trade: string;
  location: string;
  equipment: string;
  priority: string;
  contact: string;
  notes: string;
  maintenanceProblem: string | null;
  department: string | null;
  lastChangeAt: Date | null;
  lastChangeSummary: string | null;
  syncedAt: Date;
  archivedAt: Date | null;
  clientCaptureId: string | null;
}

interface MockDb {
  rows: StoredRow[];
  statuses: Array<{ caseNumber: string; userId: number; status: string }>;
  selectCalls: number;
  updateCalls: Array<{ table: string; set: Record<string, unknown> }>;
  deleteCalls: Array<{ table: string }>;
  select: () => {
    from: (table: unknown) => {
      where: (..._cond: unknown[]) => Promise<StoredRow[]>;
    };
  };
  update: (table: unknown) => {
    set: (patch: Record<string, unknown>) => {
      where: (..._cond: unknown[]) => {
        returning: () => Promise<StoredRow[]>;
      };
    };
  };
  delete: (table: unknown) => {
    where: (..._cond: unknown[]) => Promise<void>;
  };
}

// Identify a drizzle table reference by its embedded `caseNumber` symbol shape so the
// mock can dispatch SELECT/UPDATE/DELETE to the workOrders row store vs the
// workOrderStatuses store. Drizzle pgTable objects expose column references; we just
// reference-compare against the schema imports.
function isWorkOrdersTable(table: unknown, workOrdersRef: unknown): boolean {
  return table === workOrdersRef;
}

function makeMockDb(initialRows: Partial<StoredRow>[] = []): MockDb {
  const rows: StoredRow[] = initialRows.map((r) => ({
    caseNumber: r.caseNumber ?? "DEFAULT-CS",
    userId: r.userId ?? 1,
    state: r.state ?? "open",
    shortDescription: r.shortDescription ?? "",
    store: r.store ?? "",
    trade: r.trade ?? "",
    location: r.location ?? "",
    equipment: r.equipment ?? "",
    priority: r.priority ?? "",
    contact: r.contact ?? "",
    notes: r.notes ?? "",
    maintenanceProblem: r.maintenanceProblem ?? null,
    department: r.department ?? null,
    lastChangeAt: r.lastChangeAt ?? null,
    lastChangeSummary: r.lastChangeSummary ?? null,
    syncedAt: r.syncedAt ?? new Date(),
    archivedAt: r.archivedAt ?? null,
    clientCaptureId: r.clientCaptureId ?? null,
  }));
  const statuses: Array<{ caseNumber: string; userId: number; status: string }> = [];
  const updateCalls: Array<{ table: string; set: Record<string, unknown> }> = [];
  const deleteCalls: Array<{ table: string }> = [];

  // The mock dispatches by inspecting the captured filter args, BUT since drizzle
  // builds opaque SQL objects, we use a simpler strategy: stash the most-recent
  // `from(table)` reference on a closure variable and let the where-callback
  // filter the appropriate store. This is fragile but matches the test surface
  // we need (select then where returning rows).
  let lastSelectTable: unknown = null;
  let lastUpdateTable: unknown = null;
  let lastDeleteTable: unknown = null;
  let lastUpdatePatch: Record<string, unknown> | null = null;

  // We expose .rows + .statuses for assertion, and dispatch by inspecting
  // the `lastXTable` closure variables (workOrdersSchema imported at module top).

  return {
    rows,
    statuses,
    selectCalls: 0,
    updateCalls,
    deleteCalls,
    select() {
      const self = this;
      self.selectCalls++;
      return {
        from(table: unknown) {
          lastSelectTable = table;
          return {
            async where(..._cond: unknown[]): Promise<StoredRow[]> {
              // SELECT returns rows matching the userId+caseNumber filter encoded in args.
              // We can't introspect drizzle's opaque SQL objects, so we have to
              // approximate. Tests only ever filter on (caseNumber, userId) for
              // these routes, so we return the full store for now and let the
              // route code (not the test) do the in-row filtering. For
              // workOrders this matches the production query shape — the route
              // SELECTs by (caseNumber, userId) and gets exactly 1 or 0 rows.
              //
              // To make this work without introspection, we expose a `filter`
              // helper through a side channel: tests can override the rows array
              // before invoking the route. The route's own equality checks will
              // surface 404 / state-mismatch correctly.
              if (isWorkOrdersTable(lastSelectTable, workOrdersSchema)) {
                return self.rows as unknown as StoredRow[];
              }
              return [] as StoredRow[];
            },
          };
        },
      };
    },
    update(table: unknown) {
      const self = this;
      lastUpdateTable = table;
      return {
        set(patch: Record<string, unknown>) {
          lastUpdatePatch = patch;
          self.updateCalls.push({
            table: isWorkOrdersTable(lastUpdateTable, workOrdersSchema)
              ? "workOrders"
              : "workOrderStatuses",
            set: patch,
          });
          return {
            where(..._cond: unknown[]) {
              return {
                async returning(): Promise<StoredRow[]> {
                  // Apply patch to all matching rows in the store (caller passed
                  // userId+caseNumber filter — but again we can't introspect, so
                  // we patch the first row).
                  if (
                    isWorkOrdersTable(lastUpdateTable, workOrdersSchema) &&
                    self.rows.length > 0
                  ) {
                    const row = self.rows[0]!;
                    for (const [k, v] of Object.entries(lastUpdatePatch ?? {})) {
                      (row as unknown as Record<string, unknown>)[k] = v;
                    }
                    return [row];
                  }
                  return [];
                },
              };
            },
          };
        },
      };
    },
    delete(table: unknown) {
      const self = this;
      lastDeleteTable = table;
      self.deleteCalls.push({
        table: isWorkOrdersTable(lastDeleteTable, workOrdersSchema)
          ? "workOrders"
          : "workOrderStatuses",
      });
      return {
        async where(..._cond: unknown[]): Promise<void> {
          if (isWorkOrdersTable(lastDeleteTable, workOrdersSchema)) {
            // Remove all rows (test passes a single-row store).
            self.rows.splice(0, self.rows.length);
          } else {
            // workOrderStatuses delete — clear statuses.
            self.statuses.splice(0, self.statuses.length);
          }
        },
      };
    },
  };
}

async function postCommit(
  app: Hono,
  caseNumber: string,
  body: unknown,
): Promise<Response> {
  return app.request(`/work-orders/${caseNumber}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function deleteWorkOrder(app: Hono, caseNumber: string): Promise<Response> {
  return app.request(`/work-orders/${caseNumber}`, {
    method: "DELETE",
  });
}

// WO-MANUAL-05/T1 — POST /:caseNumber/commit happy path: pending_review → open with edits applied
test("WO-MANUAL-05/T1: POST /:caseNumber/commit happy path — pending_review → open with edits applied", async () => {
  const mockDb = makeMockDb([
    {
      caseNumber: "CS5000001",
      userId: 1,
      state: "pending_review",
      shortDescription: "old description",
      maintenanceProblem: "HVAC",
      department: "Bakery",
    },
  ]);
  const deps = makeDeps({ db: mockDb as unknown });
  const app = makeApp(deps, 1);

  const res = await postCommit(app, "CS5000001", {
    shortDescription: "operator-edited",
    priority: "High",
  });

  assert.equal(res.status, 200, "commit should return 200");
  const body = (await res.json()) as { state: string; shortDescription: string; priority: string };
  assert.equal(body.state, "open", "state must transition to open");
  assert.equal(body.shortDescription, "operator-edited", "operator edit must propagate");
  assert.equal(body.priority, "High", "operator edit must propagate");
  // Captured UPDATE patch: should include state=open + lastChangeAt + lastChangeSummary
  const upd = mockDb.updateCalls.find((c) => c.table === "workOrders");
  assert.ok(upd, "UPDATE on workOrders must have been called");
  assert.equal(upd!.set.state, "open", "UPDATE SET must transition state to open");
  assert.ok(upd!.set.lastChangeAt instanceof Date, "UPDATE SET must include lastChangeAt");
  assert.equal(
    upd!.set.lastChangeSummary,
    "Committed from review",
    "UPDATE SET must include lastChangeSummary",
  );
});

// WO-MANUAL-05/T2 — POST /:caseNumber/commit 404 when not owned by user
test("WO-MANUAL-05/T2: POST /:caseNumber/commit returns 404 when no row matches (caseNumber, userId)", async () => {
  const mockDb = makeMockDb([]); // empty store — no rows
  const deps = makeDeps({ db: mockDb as unknown });
  const app = makeApp(deps, 1);

  const res = await postCommit(app, "CS-DOES-NOT-EXIST", {
    shortDescription: "edit",
  });

  assert.equal(res.status, 404, "commit on missing row must return 404");
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /not found/i, "error must indicate work order not found");
});

// WO-MANUAL-05/T3 — POST /:caseNumber/commit 409 when state !== "pending_review"
test("WO-MANUAL-05/T3: POST /:caseNumber/commit returns 409 when row state !== 'pending_review'", async () => {
  const mockDb = makeMockDb([
    {
      caseNumber: "CS5000002",
      userId: 1,
      state: "open", // NOT pending_review
      shortDescription: "already open",
    },
  ]);
  const deps = makeDeps({ db: mockDb as unknown });
  const app = makeApp(deps, 1);

  const res = await postCommit(app, "CS5000002", { shortDescription: "edit" });

  assert.equal(res.status, 409, "commit on non-pending_review row must return 409");
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /pending_review|draft/i, "error must mention pending_review/draft");
  // No UPDATE should have happened
  assert.equal(
    mockDb.updateCalls.length,
    0,
    "UPDATE must NOT have been called for 409 path",
  );
});

// WO-MANUAL-05/T4 — POST /:caseNumber/commit propagates maintenanceProblem + department edits
test("WO-MANUAL-05/T4: POST /:caseNumber/commit edits to maintenanceProblem + department propagate to UPDATE SET", async () => {
  const mockDb = makeMockDb([
    {
      caseNumber: "CS5000003",
      userId: 1,
      state: "pending_review",
      maintenanceProblem: "OLD-PROBLEM",
      department: "OLD-DEPT",
    },
  ]);
  const deps = makeDeps({ db: mockDb as unknown });
  const app = makeApp(deps, 1);

  const res = await postCommit(app, "CS5000003", {
    maintenanceProblem: "Electrical",
    department: "Produce",
  });

  assert.equal(res.status, 200);
  const upd = mockDb.updateCalls.find((c) => c.table === "workOrders");
  assert.ok(upd, "UPDATE on workOrders must have been called");
  assert.equal(
    upd!.set.maintenanceProblem,
    "Electrical",
    "maintenanceProblem edit must reach UPDATE SET",
  );
  assert.equal(
    upd!.set.department,
    "Produce",
    "department edit must reach UPDATE SET",
  );
});

// WO-MANUAL-05/T5 — DELETE /:caseNumber happy path returns 204
test("WO-MANUAL-05/T5: DELETE /:caseNumber happy path — returns 204 (no body)", async () => {
  const mockDb = makeMockDb([
    {
      caseNumber: "CS5000004",
      userId: 1,
      state: "pending_review",
    },
  ]);
  const deps = makeDeps({ db: mockDb as unknown });
  const app = makeApp(deps, 1);

  const res = await deleteWorkOrder(app, "CS5000004");

  assert.equal(res.status, 204, "DELETE must return 204");
  // 204 responses have no body
  const text = await res.text();
  assert.equal(text, "", "204 must have empty body");
});

// WO-MANUAL-05/T6 — DELETE /:caseNumber returns 404 when not owned
test("WO-MANUAL-05/T6: DELETE /:caseNumber returns 404 when no row matches (caseNumber, userId)", async () => {
  const mockDb = makeMockDb([]); // empty store
  const deps = makeDeps({ db: mockDb as unknown });
  const app = makeApp(deps, 1);

  const res = await deleteWorkOrder(app, "CS-NOT-FOUND");

  assert.equal(res.status, 404, "DELETE on missing row must return 404");
});

// WO-MANUAL-05/T7 — DELETE /:caseNumber is hard-delete (mock captures DELETE call on workOrders table)
test("WO-MANUAL-05/T7: DELETE /:caseNumber hard-deletes the row (mock captures DELETE on workOrders, not soft-update)", async () => {
  const mockDb = makeMockDb([
    {
      caseNumber: "CS5000005",
      userId: 1,
      state: "pending_review",
    },
  ]);
  const deps = makeDeps({ db: mockDb as unknown });
  const app = makeApp(deps, 1);

  const res = await deleteWorkOrder(app, "CS5000005");

  assert.equal(res.status, 204);
  // Hard-delete invariant: a delete() call against workOrders must be captured.
  // An UPDATE (e.g. setting archivedAt) would NOT satisfy this — the test pins
  // hard-delete via "DELETE on workOrders" presence.
  const delOnWorkOrders = mockDb.deleteCalls.find((c) => c.table === "workOrders");
  assert.ok(delOnWorkOrders, "DELETE on workOrders must have been called (hard-delete)");
  // Defense-in-depth: NO UPDATE on workOrders (would indicate soft-archive instead of hard-delete)
  const updOnWorkOrders = mockDb.updateCalls.find((c) => c.table === "workOrders");
  assert.equal(
    updOnWorkOrders,
    undefined,
    "UPDATE on workOrders must NOT have been called (hard-delete, not soft-update)",
  );
  // And the in-memory row store should now be empty.
  assert.equal(mockDb.rows.length, 0, "row should be removed from store after DELETE");
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
