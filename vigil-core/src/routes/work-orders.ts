import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { workOrders, workOrderStatuses } from "../db/schema.js";

// ── Work Orders router ────────────────────────────────────────────────────────

export const workOrdersRouter = new Hono();

// POST /work-orders/sync — upsert work orders from CLI
workOrdersRouter.post("/work-orders/sync", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { workOrders: inputOrders } = body as Record<string, unknown>;

  // Validate: must be a non-empty array (T-66-04: max 100 items)
  if (!Array.isArray(inputOrders) || inputOrders.length === 0) {
    return c.json({ error: "workOrders must be a non-empty array" }, 400);
  }
  if (inputOrders.length > 100) {
    return c.json({ error: "workOrders must not exceed 100 items" }, 400);
  }

  // Mass-assignment defense: destructure only the 9 known fields (T-66-02)
  const sanitized = inputOrders.map((wo: Record<string, unknown>) => ({
    caseNumber: String(wo.caseNumber ?? ""),
    store: String(wo.store ?? ""),
    shortDescription: String(wo.shortDescription ?? ""),
    trade: String(wo.trade ?? ""),
    location: String(wo.location ?? ""),
    equipment: String(wo.equipment ?? ""),
    priority: String(wo.priority ?? ""),
    contact: String(wo.contact ?? ""),
    state: String(wo.state ?? ""),
    syncedAt: new Date(),
  }));

  // Filter out entries with empty caseNumber
  const valid = sanitized.filter((wo) => wo.caseNumber.trim() !== "");
  if (valid.length === 0) {
    return c.json({ error: "No valid work orders (caseNumber required)" }, 400);
  }

  for (const wo of valid) {
    await db
      .insert(workOrders)
      .values(wo)
      .onConflictDoUpdate({
        target: workOrders.caseNumber,
        set: {
          store: wo.store,
          shortDescription: wo.shortDescription,
          trade: wo.trade,
          location: wo.location,
          equipment: wo.equipment,
          priority: wo.priority,
          contact: wo.contact,
          state: wo.state,
          syncedAt: wo.syncedAt,
        },
      });
  }

  return c.json({ synced: valid.length });
});

// GET /work-orders — return all work orders joined with status
workOrdersRouter.get("/work-orders", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  const rows = await db.select().from(workOrders);

  // Fetch all statuses in one query and build a lookup map
  const statusRows = await db.select().from(workOrderStatuses);
  const statusMap = new Map<string, string>();
  for (const row of statusRows) {
    statusMap.set(row.caseNumber, row.status);
  }

  const data = rows.map((wo) => ({
    caseNumber: wo.caseNumber,
    store: wo.store,
    shortDescription: wo.shortDescription,
    trade: wo.trade,
    location: wo.location,
    equipment: wo.equipment,
    priority: wo.priority,
    contact: wo.contact,
    state: wo.state,
    status: statusMap.get(wo.caseNumber) ?? "open",
    syncedAt: wo.syncedAt.toISOString(),
  }));

  return c.json({ data });
});
