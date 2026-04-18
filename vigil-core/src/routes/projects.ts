import { Hono } from "hono";
import { db } from "../db/connection.js";
import { projects as projectsTable } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import type { DrizzleProject } from "../db/types.js";

const VALID_STATUSES = ["active", "archived", "done"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;

/** API response shape — dates as ISO strings, nulls preserved */
interface ProjectApiResponse {
  id: number;
  name: string;
  description: string | null;
  status: string | null;
  createdAt: string;
  updatedAt: string;
}

function toResponse(row: DrizzleProject): ProjectApiResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isValidStatus(s: unknown): s is ValidStatus {
  return typeof s === "string" && (VALID_STATUSES as readonly string[]).includes(s);
}

export const projects = new Hono();

// GET /projects — list (no pagination per D-05)
projects.get("/projects", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);
  try {
    const userId = c.get("userId");
    const rows = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId))
      .orderBy(desc(projectsTable.createdAt));
    return c.json(rows.map(toResponse));
  } catch (err) {
    console.error("[vigil-core] List projects failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});

// GET /projects/:id — single
projects.get("/projects/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);
  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const rows = await db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)))
      .limit(1);

    if (rows.length === 0) return c.json({ error: "Project not found" }, 404);
    return c.json(toResponse(rows[0]));
  } catch (err) {
    console.error("[vigil-core] Get project failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});

// POST /projects — create
projects.post("/projects", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    // Explicit destructure = mass-assignment defense; extras silently dropped
    const { name, description, status } = body;

    // Validation per D-06
    if (!name || typeof name !== "string" || name.trim() === "") {
      return c.json({ error: "name is required and must be non-empty" }, 400);
    }
    const trimmedName = name.trim();
    if (trimmedName.length > NAME_MAX) {
      return c.json(
        { error: `name must be ${NAME_MAX} characters or fewer` },
        400,
      );
    }
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return c.json({ error: "description must be a string" }, 400);
      }
      if (description.length > DESCRIPTION_MAX) {
        return c.json(
          { error: `description must be ${DESCRIPTION_MAX} characters or fewer` },
          400,
        );
      }
    }
    if (status !== undefined && status !== null) {
      if (!isValidStatus(status)) {
        return c.json(
          { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
          400,
        );
      }
    }

    const [created] = await db
      .insert(projectsTable)
      .values({
        userId,
        name: trimmedName,
        description: description ?? null,
        status: status ?? null,
      })
      .returning();

    return c.json(toResponse(created), 201);
  } catch (err) {
    console.error("[vigil-core] Create project failed:", err);
    return c.json({ error: "Create failed" }, 500);
  }
});

// PATCH /projects/:id — partial update
projects.patch("/projects/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);
  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    // Existence check (scoped by userId — cross-user PATCH returns 404)
    const existing = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)))
      .limit(1);
    if (existing.length === 0) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json();

    // Validation per D-06 (only on fields actually present)
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return c.json({ error: "name must be non-empty string" }, 400);
      }
      if (body.name.trim().length > NAME_MAX) {
        return c.json(
          { error: `name must be ${NAME_MAX} characters or fewer` },
          400,
        );
      }
    }
    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== "string") {
        return c.json({ error: "description must be a string" }, 400);
      }
      if (body.description.length > DESCRIPTION_MAX) {
        return c.json(
          { error: `description must be ${DESCRIPTION_MAX} characters or fewer` },
          400,
        );
      }
    }
    if (body.status !== undefined && body.status !== null) {
      if (!isValidStatus(body.status)) {
        return c.json(
          { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
          400,
        );
      }
    }

    // Build update object — explicit allowlist (mass-assignment defense)
    const updates: Partial<typeof projectsTable.$inferInsert> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    // Always bump updatedAt
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(projectsTable)
      .set(updates)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)))
      .returning();

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Update project failed:", err);
    return c.json({ error: "Update failed" }, 500);
  }
});

// DELETE /projects/:id — hard delete (FK ON DELETE SET NULL handles thoughts)
projects.delete("/projects/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);
  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const existing = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)))
      .limit(1);
    if (existing.length === 0) {
      return c.json({ error: "Project not found" }, 404);
    }

    await db.delete(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId)));

    return c.body(null, 204);
  } catch (err) {
    console.error("[vigil-core] Delete project failed:", err);
    return c.json({ error: "Delete failed" }, 500);
  }
});
