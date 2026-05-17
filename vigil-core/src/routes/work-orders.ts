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
// 3. sanitizer destructures EXACTLY 12 known fields; unknown fields silently dropped (T-129-15).
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
  maintenanceProblem: string | null;
  department: string | null;
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

    // Mass-assignment defense: destructure exactly the 12 known fields (T-129-15 / T-66-02)
    // Phase 102: Every row carries userId from middleware context, NOT from body.
    // SVCNOW-04: clientCaptureId is the 10th allowlisted field (camelCase preferred,
    // snake_case fallback per RESEARCH Probe 4 + Pitfall 5).
    // WO-MANUAL-03 (Phase 129.1): maintenanceProblem (11th) + department (12th)
    // added so screenshot + PWA manual-create payloads survive the whitelist.
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
      // WO-MANUAL-03 (Phase 129.1): coerce-or-null pattern; preserves whitelist
      // discipline (null when omitted, never undefined; never raw user object).
      maintenanceProblem: wo.maintenanceProblem != null ? String(wo.maintenanceProblem) : null,
      department: wo.department != null ? String(wo.department) : null,
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

  // POST /work-orders/:caseNumber/commit — operator commits a pending_review draft
  // (WO-MANUAL-02 / Phase 129.1-05). Applies operator edits + transitions state
  // from "pending_review" → "open". 12-field editable whitelist mirrors the sync
  // sanitizer (T-129.1-24 mass-assignment defense). userId-scoped; 404 if not
  // owned by caller; 409 if existing state !== "pending_review" (T-129.1-25
  // state-transition gate).
  router.post("/work-orders/:caseNumber/commit", async (c) => {
    if (!deps.dbAvailable || !deps.db) return c.json({ error: "Database not available" }, 503);
    const localDb = deps.db;

    const userId = c.get("userId");
    const caseNumber = c.req.param("caseNumber");

    // Allow empty body — operator may commit with no edits. JSON parse failure
    // is non-fatal (treat as empty {}).
    let edits: Record<string, unknown> = {};
    try {
      edits = (await c.req.json()) as Record<string, unknown>;
    } catch {
      edits = {};
    }

    // SELECT-by-(caseNumber, userId) — userId scoping is T-129.1-23 spoofing defense.
    const rows = await localDb
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.caseNumber, caseNumber), eq(workOrders.userId, userId)));

    if (rows.length === 0) {
      return c.json({ error: "Work order not found" }, 404);
    }

    const row = rows[0]!;
    if (row.state !== "pending_review") {
      return c.json({ error: "Work order is not a pending_review draft" }, 409);
    }

    // Build SET object: state transition + lastChange* metadata, plus any
    // operator edits from the 11 editable-field whitelist. Coerce-or-skip
    // mirrors the sync sanitizer (T-129.1-24): for nullable fields, accept
    // null explicitly via `field in edits` guard; for required string fields,
    // coerce via String() when present.
    const patch: Record<string, unknown> = {
      state: "open",
      lastChangeAt: new Date(),
      lastChangeSummary: "Committed from review",
    };
    // Required-string fields (default "" in schema — must coerce to string)
    const requiredFields = [
      "store",
      "shortDescription",
      "trade",
      "location",
      "equipment",
      "priority",
      "contact",
      "notes",
    ] as const;
    for (const f of requiredFields) {
      if (edits[f] != null) patch[f] = String(edits[f]);
    }
    // Nullable text fields (maintenanceProblem, department) — coerce-or-null
    if ("maintenanceProblem" in edits) {
      patch.maintenanceProblem =
        edits.maintenanceProblem != null ? String(edits.maintenanceProblem) : null;
    }
    if ("department" in edits) {
      patch.department = edits.department != null ? String(edits.department) : null;
    }

    const updated = await localDb
      .update(workOrders)
      .set(patch)
      .where(and(eq(workOrders.caseNumber, caseNumber), eq(workOrders.userId, userId)))
      .returning();

    return c.json(updated[0], 200);
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

  // DELETE /work-orders/:caseNumber — hard-delete a draft (WO-MANUAL-02 Discard).
  // Operator confirms via window.confirm() on the PWA before this fires (T-129.1-27).
  // Cleans up matching workOrderStatuses row defense-in-depth. userId-scoped
  // (T-129.1-23). MUST be registered AFTER DELETE /work-orders/archived so the
  // static segment wins for that literal path; Hono's trie generally prefers
  // literals over params, but registration order is also a defense-in-depth
  // tiebreaker. The explicit `caseNumber === "archived"` guard inside is the
  // final safety net.
  router.delete("/work-orders/:caseNumber", async (c) => {
    if (!deps.dbAvailable || !deps.db) return c.json({ error: "Database not available" }, 503);
    const localDb = deps.db;

    const userId = c.get("userId");
    const caseNumber = c.req.param("caseNumber");

    // Guard: never match the static /archived path under any router variant.
    // caseNumbers are uppercase alphanumeric per the form-level regex, so this
    // should never fire in practice — defense-in-depth.
    if (caseNumber === "archived") {
      return c.json({ error: "Work order not found" }, 404);
    }

    // SELECT-by-(caseNumber, userId)
    const rows = await localDb
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.caseNumber, caseNumber), eq(workOrders.userId, userId)));

    if (rows.length === 0) {
      return c.json({ error: "Work order not found" }, 404);
    }

    // Hard-delete: clean up workOrderStatuses first (defense-in-depth — the
    // FK has ON DELETE RESTRICT, so leaving a status row would block the
    // workOrders delete). Then delete the workOrders row.
    await localDb
      .delete(workOrderStatuses)
      .where(
        and(
          eq(workOrderStatuses.userId, userId),
          eq(workOrderStatuses.caseNumber, caseNumber),
        ),
      );

    await localDb
      .delete(workOrders)
      .where(and(eq(workOrders.caseNumber, caseNumber), eq(workOrders.userId, userId)));

    return c.body(null, 204);
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
          // WO-MANUAL-03 (Phase 129.1): SET clause is an explicit field list —
          // adding here keeps dbUpsertLegacy's update path in sync with the
          // extended SanitizedWorkOrder (dbInsertOrGet inherits via values(input)).
          maintenanceProblem: input.maintenanceProblem,
          department: input.department,
          syncedAt: input.syncedAt,
        },
      })
      .returning();
    return { row: rows[0]! };
  },
});
