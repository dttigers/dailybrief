import { Hono } from "hono";
import crypto from "crypto";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable } from "../db/schema.js";
import { eq, and, ne, gte, lte, desc, count, sql } from "drizzle-orm";
import type { DrizzleThought, PaginatedResponse } from "../db/types.js";

const VALID_SOURCES = ["text", "voice", "image"] as const;
const VALID_CATEGORIES = [
  "task",
  "therapy",
  "idea",
  "reflection",
  "project",
] as const;

/** API response shape — dates as ISO strings, tags as string[] */
interface ThoughtApiResponse {
  id: number;
  content: string;
  category: string | null;
  confidence: number | null;
  source: string;
  createdAt: string;
  modifiedAt: string;
  cloudKitRecordID: string;
  syncStatus: string;
  lastSyncedAt: string | null;
  taskStatus: string | null;
  therapyClassification: string | null;
  tags: string[];
  isFavorited: boolean;
}

function toResponse(row: DrizzleThought): ThoughtApiResponse {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    confidence: row.confidence,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    modifiedAt: row.modifiedAt.toISOString(),
    cloudKitRecordID: row.cloudKitRecordID,
    syncStatus: row.syncStatus,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    taskStatus: row.taskStatus,
    therapyClassification: row.therapyClassification,
    tags: row.tags ?? [],
    isFavorited: row.isFavorited,
  };
}

export const thoughts = new Hono();

// GET /thoughts — List with filters
thoughts.get("/thoughts", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const category = c.req.query("category");
    const source = c.req.query("source");
    const taskStatus = c.req.query("taskStatus");
    const therapyClassification = c.req.query("therapyClassification");
    const tag = c.req.query("tag");
    const favoritesOnly = c.req.query("favoritesOnly");
    const q = c.req.query("q");
    const after = c.req.query("after");
    const before = c.req.query("before");
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

    // Validate date params
    if (after && isNaN(Date.parse(after))) {
      return c.json({ error: "after must be a valid ISO 8601 date string" }, 400);
    }
    if (before && isNaN(Date.parse(before))) {
      return c.json({ error: "before must be a valid ISO 8601 date string" }, 400);
    }

    // Build dynamic WHERE conditions
    const conditions = [ne(thoughtsTable.syncStatus, "pendingDeletion")];

    if (q) {
      conditions.push(
        sql`"thoughts"."search_vector" @@ plainto_tsquery('english', ${q})`,
      );
    }
    if (category) {
      conditions.push(eq(thoughtsTable.category, category));
    }
    if (source) {
      conditions.push(eq(thoughtsTable.source, source));
    }
    if (taskStatus) {
      conditions.push(eq(thoughtsTable.taskStatus, taskStatus));
    }
    if (therapyClassification) {
      conditions.push(eq(thoughtsTable.therapyClassification, therapyClassification));
    }
    if (tag) {
      conditions.push(
        sql`${thoughtsTable.tags} @> ${JSON.stringify([tag])}::jsonb`,
      );
    }
    if (favoritesOnly === "true") {
      conditions.push(eq(thoughtsTable.isFavorited, true));
    }
    if (after) {
      conditions.push(gte(thoughtsTable.createdAt, new Date(after)));
    }
    if (before) {
      conditions.push(lte(thoughtsTable.createdAt, new Date(before)));
    }

    const whereCondition = and(...conditions);

    // Count query
    const [{ total }] = await db
      .select({ total: count() })
      .from(thoughtsTable)
      .where(whereCondition);

    // Data query
    const rows = await db
      .select()
      .from(thoughtsTable)
      .where(whereCondition)
      .orderBy(desc(thoughtsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const response: PaginatedResponse<ThoughtApiResponse> = {
      data: rows.map(toResponse),
      total,
      limit,
      offset,
    };

    return c.json(response);
  } catch (err) {
    console.error("[vigil-core] List thoughts failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});

// GET /thoughts/:id — Single thought
thoughts.get("/thoughts/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const rows = await db
      .select()
      .from(thoughtsTable)
      .where(
        and(
          eq(thoughtsTable.id, id),
          ne(thoughtsTable.syncStatus, "pendingDeletion"),
        ),
      )
      .limit(1);

    if (rows.length === 0) return c.json({ error: "Thought not found" }, 404);

    return c.json(toResponse(rows[0]));
  } catch (err) {
    console.error("[vigil-core] Get thought failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});

// POST /thoughts — Create
thoughts.post("/thoughts", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const body = await c.req.json();
    const { content, source, category, tags } = body;

    // Validation
    if (!content || typeof content !== "string" || content.trim() === "") {
      return c.json({ error: "content is required and must be non-empty" }, 400);
    }
    if (!VALID_SOURCES.includes(source)) {
      return c.json(
        { error: `source must be one of: ${VALID_SOURCES.join(", ")}` },
        400,
      );
    }
    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return c.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
        400,
      );
    }

    const [created] = await db
      .insert(thoughtsTable)
      .values({
        content: content.trim(),
        source,
        category: category ?? null,
        tags: tags && Array.isArray(tags) ? tags : null,
        cloudKitRecordID: crypto.randomUUID(),
      })
      .returning();

    return c.json(toResponse(created), 201);
  } catch (err) {
    console.error("[vigil-core] Create thought failed:", err);
    return c.json({ error: "Create failed" }, 500);
  }
});

// PUT /thoughts/:id — Update
thoughts.put("/thoughts/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    // Check existence
    const existing = await db
      .select({ id: thoughtsTable.id })
      .from(thoughtsTable)
      .where(
        and(
          eq(thoughtsTable.id, id),
          ne(thoughtsTable.syncStatus, "pendingDeletion"),
        ),
      )
      .limit(1);
    if (existing.length === 0) return c.json({ error: "Thought not found" }, 404);

    const body = await c.req.json();

    // Validation
    if (body.content !== undefined) {
      if (typeof body.content !== "string" || body.content.trim() === "") {
        return c.json({ error: "content must be non-empty string" }, 400);
      }
    }
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category)) {
        return c.json(
          { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
          400,
        );
      }
    }

    // Build dynamic update object
    const updates: Partial<typeof thoughtsTable.$inferInsert> = {};
    if (body.content !== undefined) updates.content = body.content.trim();
    if (body.category !== undefined) updates.category = body.category;
    if (body.taskStatus !== undefined) updates.taskStatus = body.taskStatus;
    if (body.therapyClassification !== undefined)
      updates.therapyClassification = body.therapyClassification;
    if (body.tags !== undefined)
      updates.tags = Array.isArray(body.tags) ? body.tags : null;
    if (body.isFavorited !== undefined) updates.isFavorited = body.isFavorited;

    // Always update modifiedAt and syncStatus
    updates.modifiedAt = new Date();
    updates.syncStatus = "pending";

    const [updated] = await db
      .update(thoughtsTable)
      .set(updates)
      .where(eq(thoughtsTable.id, id))
      .returning();

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Update thought failed:", err);
    return c.json({ error: "Update failed" }, 500);
  }
});

// DELETE /thoughts/:id — Soft delete
thoughts.delete("/thoughts/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    // Check existence
    const existing = await db
      .select({ id: thoughtsTable.id })
      .from(thoughtsTable)
      .where(
        and(
          eq(thoughtsTable.id, id),
          ne(thoughtsTable.syncStatus, "pendingDeletion"),
        ),
      )
      .limit(1);
    if (existing.length === 0) return c.json({ error: "Thought not found" }, 404);

    await db
      .update(thoughtsTable)
      .set({ syncStatus: "pendingDeletion", modifiedAt: new Date() })
      .where(eq(thoughtsTable.id, id));

    return c.body(null, 204);
  } catch (err) {
    console.error("[vigil-core] Delete thought failed:", err);
    return c.json({ error: "Delete failed" }, 500);
  }
});
