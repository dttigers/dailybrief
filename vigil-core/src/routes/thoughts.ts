import { Hono } from "hono";
import crypto from "crypto";
import { getDb } from "../db/index.js";
import type {
  Thought,
  ThoughtResponse,
  PaginatedResponse,
} from "../db/types.js";

const VALID_SOURCES = ["text", "voice", "image"] as const;
const VALID_CATEGORIES = [
  "task",
  "therapy",
  "idea",
  "reflection",
  "project",
] as const;

function toResponse(row: Thought): ThoughtResponse {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

export const thoughts = new Hono();

// GET /thoughts — List with filters
thoughts.get("/thoughts", (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const category = c.req.query("category");
    const source = c.req.query("source");
    const taskStatus = c.req.query("taskStatus");
    const therapyClassification = c.req.query("therapyClassification");
    const tag = c.req.query("tag");
    const favoritesOnly = c.req.query("favoritesOnly");
    const q = c.req.query("q");
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

    const conditions: string[] = ["t.syncStatus != 'pendingDeletion'"];
    const params: unknown[] = [];

    // FTS search
    let fromClause = "thoughts t";
    if (q) {
      fromClause =
        "thoughts t JOIN thoughts_fts fts ON t.id = fts.rowid";
      conditions.push("thoughts_fts MATCH ?");
      params.push(q);
    }

    if (category) {
      conditions.push("t.category = ?");
      params.push(category);
    }
    if (source) {
      conditions.push("t.source = ?");
      params.push(source);
    }
    if (taskStatus) {
      conditions.push("t.taskStatus = ?");
      params.push(taskStatus);
    }
    if (therapyClassification) {
      conditions.push("t.therapyClassification = ?");
      params.push(therapyClassification);
    }
    if (tag) {
      conditions.push(
        "EXISTS (SELECT 1 FROM json_each(t.tags) WHERE json_each.value = ?)",
      );
      params.push(tag);
    }
    if (favoritesOnly === "true") {
      conditions.push("t.isFavorited = 1");
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // Count query
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM ${fromClause} ${whereClause}`)
      .get(...params) as { count: number };

    // Data query
    const rows = db
      .prepare(
        `SELECT t.* FROM ${fromClause} ${whereClause} ORDER BY t.createdAt DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Thought[];

    const response: PaginatedResponse<ThoughtResponse> = {
      data: rows.map(toResponse),
      total: countRow.count,
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
thoughts.get("/thoughts/:id", (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = c.req.param("id");
    const row = db
      .prepare(
        "SELECT * FROM thoughts WHERE id = ? AND syncStatus != 'pendingDeletion'",
      )
      .get(id) as Thought | undefined;

    if (!row) return c.json({ error: "Thought not found" }, 404);

    return c.json(toResponse(row));
  } catch (err) {
    console.error("[vigil-core] Get thought failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});

// POST /thoughts — Create
thoughts.post("/thoughts", async (c) => {
  const db = getDb();
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

    const now = new Date().toISOString();
    const cloudKitRecordID = crypto.randomUUID();
    const tagsJson = tags && Array.isArray(tags) ? JSON.stringify(tags) : null;

    const result = db
      .prepare(
        `INSERT INTO thoughts (content, source, category, tags, cloudKitRecordID, syncStatus, createdAt, modifiedAt, isFavorited)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0)`,
      )
      .run(
        content.trim(),
        source,
        category ?? null,
        tagsJson,
        cloudKitRecordID,
        now,
        now,
      );

    const created = db
      .prepare("SELECT * FROM thoughts WHERE id = ?")
      .get(result.lastInsertRowid) as Thought;

    return c.json(toResponse(created), 201);
  } catch (err) {
    console.error("[vigil-core] Create thought failed:", err);
    return c.json({ error: "Create failed" }, 500);
  }
});

// PUT /thoughts/:id — Update
thoughts.put("/thoughts/:id", async (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = c.req.param("id");

    // Check existence
    const existing = db
      .prepare(
        "SELECT * FROM thoughts WHERE id = ? AND syncStatus != 'pendingDeletion'",
      )
      .get(id) as Thought | undefined;
    if (!existing) return c.json({ error: "Thought not found" }, 404);

    const body = await c.req.json();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (body.content !== undefined) {
      if (typeof body.content !== "string" || body.content.trim() === "") {
        return c.json({ error: "content must be non-empty string" }, 400);
      }
      setClauses.push("content = ?");
      params.push(body.content.trim());
    }
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category)) {
        return c.json(
          { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
          400,
        );
      }
      setClauses.push("category = ?");
      params.push(body.category);
    }
    if (body.taskStatus !== undefined) {
      setClauses.push("taskStatus = ?");
      params.push(body.taskStatus);
    }
    if (body.therapyClassification !== undefined) {
      setClauses.push("therapyClassification = ?");
      params.push(body.therapyClassification);
    }
    if (body.tags !== undefined) {
      setClauses.push("tags = ?");
      params.push(Array.isArray(body.tags) ? JSON.stringify(body.tags) : null);
    }
    if (body.isFavorited !== undefined) {
      setClauses.push("isFavorited = ?");
      params.push(body.isFavorited ? 1 : 0);
    }

    // Always update modifiedAt and syncStatus
    const now = new Date().toISOString();
    setClauses.push("modifiedAt = ?");
    params.push(now);
    setClauses.push("syncStatus = 'pending'");

    params.push(id);

    db.prepare(
      `UPDATE thoughts SET ${setClauses.join(", ")} WHERE id = ?`,
    ).run(...params);

    const updated = db
      .prepare("SELECT * FROM thoughts WHERE id = ?")
      .get(id) as Thought;

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Update thought failed:", err);
    return c.json({ error: "Update failed" }, 500);
  }
});

// DELETE /thoughts/:id — Soft delete
thoughts.delete("/thoughts/:id", (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = c.req.param("id");

    const existing = db
      .prepare(
        "SELECT id FROM thoughts WHERE id = ? AND syncStatus != 'pendingDeletion'",
      )
      .get(id) as { id: number } | undefined;
    if (!existing) return c.json({ error: "Thought not found" }, 404);

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE thoughts SET syncStatus = 'pendingDeletion', modifiedAt = ? WHERE id = ?",
    ).run(now, id);

    return c.body(null, 204);
  } catch (err) {
    console.error("[vigil-core] Delete thought failed:", err);
    return c.json({ error: "Delete failed" }, 500);
  }
});
