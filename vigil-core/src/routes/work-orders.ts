import { Hono } from "hono";
import { eq, isNotNull, inArray } from "drizzle-orm";
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

// GET /work-orders — return work orders joined with status, with lazy auto-archive
workOrdersRouter.get("/work-orders", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  // Validate filter param against allowlist (T-92-02)
  const filterParam = c.req.query("filter") ?? "active";
  const validFilters = ["active", "archived", "all"] as const;
  const filter = validFilters.includes(filterParam as typeof validFilters[number])
    ? (filterParam as typeof validFilters[number])
    : "active";

  const rows = await db.select().from(workOrders);

  // Fetch all statuses in one query and build a lookup map
  const statusRows = await db.select().from(workOrderStatuses);
  const statusMap = new Map<string, { status: string; updatedAt: Date }>();
  for (const row of statusRows) {
    statusMap.set(row.caseNumber, { status: row.status, updatedAt: row.updatedAt });
  }

  // Lazy auto-archive: collect case numbers that need archiving
  const now = new Date();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const toArchive: string[] = [];

  for (const wo of rows) {
    if (wo.archivedAt !== null) continue; // already archived

    // TODO: When manual work order creation is added, skip auto-archive for manual orders (D-05)

    const statusEntry = statusMap.get(wo.caseNumber);

    // Gmail-imported rule (D-04a): syncedAt > 7 days ago
    if (now.getTime() - wo.syncedAt.getTime() > sevenDaysMs) {
      toArchive.push(wo.caseNumber);
      continue;
    }

    // Done rule (D-04b): status is "done" AND updatedAt > 7 days ago
    if (
      statusEntry &&
      statusEntry.status === "done" &&
      now.getTime() - statusEntry.updatedAt.getTime() > sevenDaysMs
    ) {
      toArchive.push(wo.caseNumber);
    }
  }

  // Batch update all orders that need archiving
  if (toArchive.length > 0) {
    await db
      .update(workOrders)
      .set({ archivedAt: now })
      .where(inArray(workOrders.caseNumber, toArchive));

    // Update in-memory rows to reflect the archive
    for (const wo of rows) {
      if (toArchive.includes(wo.caseNumber)) {
        wo.archivedAt = now;
      }
    }
  }

  // Filter based on archive status
  const filtered = rows.filter((wo) => {
    if (filter === "active") return wo.archivedAt === null;
    if (filter === "archived") return wo.archivedAt !== null;
    return true; // "all"
  });

  const data = filtered.map((wo) => ({
    caseNumber: wo.caseNumber,
    store: wo.store,
    shortDescription: wo.shortDescription,
    trade: wo.trade,
    location: wo.location,
    equipment: wo.equipment,
    priority: wo.priority,
    contact: wo.contact,
    state: wo.state,
    notes: wo.notes,
    status: statusMap.get(wo.caseNumber)?.status ?? "open",
    syncedAt: wo.syncedAt.toISOString(),
    lastChangeAt: wo.lastChangeAt?.toISOString() ?? null,
    lastChangeSummary: wo.lastChangeSummary ?? null,
    archivedAt: wo.archivedAt?.toISOString() ?? null,
  }));

  return c.json({ data });
});
