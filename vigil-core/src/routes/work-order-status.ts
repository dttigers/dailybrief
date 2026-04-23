import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { workOrderStatuses } from "../db/schema.js";

const VALID_STATUSES = ["open", "inProgress", "done"] as const;

// ── Dependency injection interface (for testability) ─────────────────────────
// Phase 108 W-01: dbSelectFn / dbUpsertFn now take userId so every call site is
// scoped to the authenticated caller. Composite PK (userId, caseNumber) means
// User A's PUT on a caseNumber User B owns inserts a NEW row, not an overwrite.

export interface WorkOrderStatusDeps {
  dbAvailable: boolean;
  dbSelectFn: (userId: number) => Promise<Array<{ caseNumber: string; status: string }>>;
  dbUpsertFn: (userId: number, caseNumber: string, status: string) => Promise<void>;
}

// ── Factory (injected deps — used by tests) ───────────────────────────────────

export function createWorkOrderStatusRouter(deps: WorkOrderStatusDeps): Hono {
  const router = new Hono();

  // GET /work-orders/statuses — fetch caller's statuses only (Phase 108 W-01)
  // Literal route MUST precede param route to avoid greedy match.
  router.get("/work-orders/statuses", async (c) => {
    if (!deps.dbAvailable) return c.json({ error: "Database not available" }, 503);

    const userId = c.get("userId") as number;
    const rows = await deps.dbSelectFn(userId);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.caseNumber] = row.status;
    }
    return c.json(result);
  });

  // PUT /work-orders/:caseNumber/status — upsert caller's status (Phase 108 W-01)
  router.put("/work-orders/:caseNumber/status", async (c) => {
    if (!deps.dbAvailable) return c.json({ error: "Database not available" }, 503);

    const userId = c.get("userId") as number;
    const caseNumber = c.req.param("caseNumber");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Mass-assignment defense: destructure only { status } (T-65-01)
    const { status } = body as Record<string, unknown>;

    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return c.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        400,
      );
    }

    await deps.dbUpsertFn(userId, caseNumber, status as string);

    return c.json({ caseNumber, status });
  });

  return router;
}

// ── Production route (uses real DB) ─────────────────────────────────────────

export const workOrderStatus = createWorkOrderStatusRouter({
  get dbAvailable() {
    return !!db;
  },
  dbSelectFn: async (userId: number) => {
    if (!db) return [];
    const rows = await db
      .select()
      .from(workOrderStatuses)
      .where(eq(workOrderStatuses.userId, userId));
    return rows.map((r) => ({ caseNumber: r.caseNumber, status: r.status }));
  },
  dbUpsertFn: async (userId: number, caseNumber: string, status: string) => {
    if (!db) throw new Error("Database not available");
    await db
      .insert(workOrderStatuses)
      .values({ userId, caseNumber, status })
      .onConflictDoUpdate({
        target: [workOrderStatuses.userId, workOrderStatuses.caseNumber],
        set: { status, updatedAt: new Date() },
      });
  },
});
