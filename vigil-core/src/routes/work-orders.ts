import { Hono } from "hono";
import { eq, and, isNotNull, inArray, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { workOrders, workOrderStatuses } from "../db/schema.js";
import type { InferSelectModel } from "drizzle-orm";

// ── Work Orders — DI factory pattern (Phase 129 SVCNOW-04) ──────────────────
// Mirrors vigil-core/src/routes/agent-events.ts createAgentEventsRoute pattern
// (Phase 121 AGENT-API-01). Pre-wired `workOrdersRouter` export preserved for
// backward-compat with vigil-core/src/index.ts:30 — zero changes needed there.
//
// Load-bearing invariants:
// 1. userId resolved from c.get("userId") set by bearerAuth dispatcher — NEVER from body.
// 2. clientCaptureId dedup key is (user_id, client_capture_id) composite — NOT global.
// 3. sanitizer destructures EXACTLY 10 known fields; unknown fields silently dropped (T-129-15).
// 4. dbInsertOrGet SELECT-by-(userId,clientCaptureId) guard is the app-layer mirror of the
//    (user_id, client_capture_id) partial unique index from migration 0021 (T-129-14, T-129-20).

// ── Type aliases ────────────────────────────────────────────────────────────
export type WorkOrderRow = InferSelectModel<typeof workOrders>;
// SanitizedWorkOrder is the destructured + typed shape passed to deps
export interface SanitizedWorkOrder {
  userId: number;
  caseNumber: string;
  store: string;
  shortDescription: string;
  trade: string;
  location: string;
  equipment: string;
  priority: string;
  contact: string;
  state: string;
  clientCaptureId: string | null;
  syncedAt: Date;
}

// ── DI interface ────────────────────────────────────────────────────────────
// Minimal surface: only the dependencies the sync route's dedup actually needs.
// GET/PUT/DELETE handlers use deps.db (raw) for minimal refactor surface.
export interface WorkOrdersDeps {
  dbAvailable: boolean;
  // Raw db reference for GET/PUT/DELETE handlers (minimal refactor surface — only
  // the POST sync dedup is tightly DI'd per plan decision).
  db: typeof db;
  // Used when wo.clientCaptureId is non-null. Returns persisted row + isNew flag.
  // Application-layer SELECT-by-(userId,clientCaptureId) guard mirrors the
  // (user_id, client_capture_id) WHERE client_capture_id IS NOT NULL partial unique
  // index from migration 0021. SELECT is first; INSERT on miss.
  dbInsertOrGet: (input: SanitizedWorkOrder) => Promise<{ row: WorkOrderRow; isNew: boolean }>;
  // Used when wo.clientCaptureId is null/omitted (legacy/CLI path). Routes through
  // the existing ON CONFLICT (case_number) DO UPDATE upsert — unchanged semantics.
  dbUpsertLegacy: (input: SanitizedWorkOrder) => Promise<{ row: WorkOrderRow }>;
}

// ── Factory ────────────────────────────────────────────────────────────────
export function createWorkOrdersRoute(deps: WorkOrdersDeps): Hono {
  const router = new Hono();

  // POST /work-orders/sync — upsert work orders with clientCaptureId dedup (SVCNOW-04)
  router.post("/work-orders/sync", async (c) => {
    if (!deps.dbAvailable) return c.json({ error: "Database not available" }, 503);

    const userId = c.get("userId");
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

    // Mass-assignment defense: destructure exactly the 10 known fields (T-129-15 / T-66-02)
    // Phase 102: Every row carries userId from middleware context, NOT from body.
    // SVCNOW-04: clientCaptureId is the 10th allowlisted field (camelCase preferred,
    // snake_case fallback per RESEARCH Probe 4 + Pitfall 5).
    const sanitized: SanitizedWorkOrder[] = inputOrders.map((wo: Record<string, unknown>) => ({
      userId,
      caseNumber: String(wo.caseNumber ?? ""),
      store: String(wo.store ?? ""),
      shortDescription: String(wo.shortDescription ?? ""),
      trade: String(wo.trade ?? ""),
      location: String(wo.location ?? ""),
      equipment: String(wo.equipment ?? ""),
      priority: String(wo.priority ?? ""),
      contact: String(wo.contact ?? ""),
      state: String(wo.state ?? ""),
      // SVCNOW-04: accept clientCaptureId (camelCase preferred) OR client_capture_id (snake_case fallback)
      clientCaptureId:
        wo.clientCaptureId != null
          ? String(wo.clientCaptureId)
          : wo.client_capture_id != null
          ? String(wo.client_capture_id)
          : null,
      syncedAt: new Date(), // always server-generated, never from body
    }));

    // Filter out entries with empty caseNumber
    const valid = sanitized.filter((wo) => wo.caseNumber.trim() !== "");
    if (valid.length === 0) {
      return c.json({ error: "No valid work orders (caseNumber required)" }, 400);
    }

    // SVCNOW-04: Per-item dedup branching.
    // - clientCaptureId non-null → deps.dbInsertOrGet (app-layer SELECT guard + INSERT)
    //   Returns { isNew: true } for new inserts (contributes 1 to syncedCount)
    //   Returns { isNew: false } for dedup hits (contributes 0 to syncedCount)
    // - clientCaptureId null → deps.dbUpsertLegacy (ON CONFLICT (case_number) DO UPDATE)
    //   Always contributes 1 to syncedCount (legacy upsert path, no dedup)
    // HTTP 200 with { synced: 0 } is intentional for fully-deduped submissions (D-03).
    let syncedCount = 0;
    for (const wo of valid) {
      if (wo.clientCaptureId != null) {
        const { isNew } = await deps.dbInsertOrGet(wo);
        if (isNew) syncedCount++;
      } else {
        await deps.dbUpsertLegacy(wo);
        syncedCount++;
      }
    }

    return c.json({ synced: syncedCount });
  });

  // GET /work-orders — scoped by userId; joined with status; lazy auto-archive
  router.get("/work-orders", async (c) => {
    if (!deps.dbAvailable || !deps.db) return c.json({ error: "Database not available" }, 503);
    const localDb = deps.db;

    const userId = c.get("userId");
    // Validate filter param against allowlist (T-92-02)
    const filterParam = c.req.query("filter") ?? "active";
    const validFilters = ["active", "archived", "all"] as const;
    const filter = validFilters.includes(filterParam as typeof validFilters[number])
      ? (filterParam as typeof validFilters[number])
      : "active";

    const rows = await localDb.select().from(workOrders).where(eq(workOrders.userId, userId));

    // Fetch all statuses in one query and build a lookup map.
    // Phase 108 W-01: scope by userId — status rows are now per-user.
    const statusRows = await localDb
      .select()
      .from(workOrderStatuses)
      .where(eq(workOrderStatuses.userId, userId));
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

    // Batch update all orders that need archiving (scoped by userId)
    if (toArchive.length > 0) {
      await localDb
        .update(workOrders)
        .set({ archivedAt: now })
        .where(and(inArray(workOrders.caseNumber, toArchive), eq(workOrders.userId, userId)));

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

  // PUT /work-orders/:caseNumber/unarchive — restore an archived order (scoped)
  router.put("/work-orders/:caseNumber/unarchive", async (c) => {
    if (!deps.dbAvailable || !deps.db) return c.json({ error: "Database not available" }, 503);
    const localDb = deps.db;

    const userId = c.get("userId");
    const caseNumber = c.req.param("caseNumber");

    // Validate caseNumber exists (T-92-03) — scoped by userId, cross-user returns 404
    const existing = await localDb
      .select({ caseNumber: workOrders.caseNumber })
      .from(workOrders)
      .where(and(eq(workOrders.caseNumber, caseNumber), eq(workOrders.userId, userId)));

    if (existing.length === 0) {
      return c.json({ error: "Work order not found" }, 404);
    }

    await localDb
      .update(workOrders)
      .set({ archivedAt: null })
      .where(and(eq(workOrders.caseNumber, caseNumber), eq(workOrders.userId, userId)));

    return c.json({ caseNumber, archivedAt: null });
  });

  // DELETE /work-orders/archived — hard-delete all archived orders (scoped by userId)
  router.delete("/work-orders/archived", async (c) => {
    if (!deps.dbAvailable || !deps.db) return c.json({ error: "Database not available" }, 503);
    const localDb = deps.db;

    const userId = c.get("userId");
    // Find all archived orders for this user
    const archived = await localDb
      .select({ caseNumber: workOrders.caseNumber })
      .from(workOrders)
      .where(and(eq(workOrders.userId, userId), isNotNull(workOrders.archivedAt)));

    if (archived.length === 0) {
      return c.json({ deleted: 0 });
    }

    const archivedCaseNumbers = archived.map((r) => r.caseNumber);

    // Clean up corresponding statuses first. Phase 108 W-01: status rows are now
    // user-scoped; add eq(workOrderStatuses.userId, userId) as defense-in-depth so
    // the DELETE cannot sweep another user's statuses even if archivedCaseNumbers
    // is ever populated cross-user due to an upstream regression.
    await localDb
      .delete(workOrderStatuses)
      .where(
        and(
          eq(workOrderStatuses.userId, userId),
          inArray(workOrderStatuses.caseNumber, archivedCaseNumbers),
        ),
      );

    // Hard-delete only this user's archived work orders
    await localDb
      .delete(workOrders)
      .where(and(eq(workOrders.userId, userId), isNotNull(workOrders.archivedAt)));

    return c.json({ deleted: archived.length });
  });

  return router;
}

// ── Production singleton (real db) ────────────────────────────────────────────
// Pre-wired production binding — preserves existing `workOrdersRouter` named export
// so vigil-core/src/index.ts:30's `import { workOrdersRouter } from "./routes/work-orders.js"`
// continues to work unchanged (zero edits to index.ts required).
export const workOrdersRouter = createWorkOrdersRoute({
  get dbAvailable() {
    return !!db;
  },
  db,

  // Application-layer SELECT-by-(userId, clientCaptureId) guard — mirrors
  // agent-events.ts dbInsertOrGet pattern (lines 308+). The partial unique index
  // from migration 0021 is the DB-side race safety net; this is the app-layer mirror.
  // Drift assertion (c) in work-orders.test.ts greps source for dbInsertOrGet
  // or select.*client_capture_id to pin this guard in source (T-129-20 / Checker BLOCKER 4).
  dbInsertOrGet: async (input) => {
    if (!db) throw new Error("Database not available");
    // SELECT-by-(userId, clientCaptureId) guard — application-layer mirror of
    // the (user_id, client_capture_id) WHERE client_capture_id IS NOT NULL
    // partial unique index from migration 0021.
    const existing = await db
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.userId, input.userId),
          eq(workOrders.clientCaptureId, input.clientCaptureId!),
        ),
      )
      .limit(1);
    if (existing.length > 0) return { row: existing[0]!, isNew: false };
    const inserted = await db
      .insert(workOrders)
      .values(input)
      .returning();
    return { row: inserted[0]!, isNew: true };
  },

  dbUpsertLegacy: async (input) => {
    if (!db) throw new Error("Database not available");
    const rows = await db
      .insert(workOrders)
      .values(input)
      .onConflictDoUpdate({
        target: workOrders.caseNumber,
        set: {
          store: input.store,
          shortDescription: input.shortDescription,
          trade: input.trade,
          location: input.location,
          equipment: input.equipment,
          priority: input.priority,
          contact: input.contact,
          state: input.state,
          syncedAt: input.syncedAt,
        },
      })
      .returning();
    return { row: rows[0]! };
  },
});
