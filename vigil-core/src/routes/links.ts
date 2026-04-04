import { Hono } from "hono";
import { getDb } from "../db/index.js";
import type { Thought, ThoughtResponse, ThoughtLink } from "../db/types.js";

function toResponse(row: Thought): ThoughtResponse {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

export const links = new Hono();

// POST /thoughts/:id/links — Create bidirectional link
links.post("/thoughts/:id/links", async (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const sourceId = Number(c.req.param("id"));
    const body = await c.req.json();
    const { targetId } = body;

    if (!targetId || typeof targetId !== "number") {
      return c.json({ error: "targetId is required and must be a number" }, 400);
    }

    if (targetId === sourceId) {
      return c.json({ error: "Cannot link a thought to itself" }, 400);
    }

    // Check both thoughts exist
    const sourceRow = db
      .prepare(
        "SELECT id FROM thoughts WHERE id = ? AND syncStatus != 'pendingDeletion'",
      )
      .get(sourceId) as { id: number } | undefined;

    if (!sourceRow) return c.json({ error: "Source thought not found" }, 404);

    const targetRow = db
      .prepare(
        "SELECT id FROM thoughts WHERE id = ? AND syncStatus != 'pendingDeletion'",
      )
      .get(targetId) as { id: number } | undefined;

    if (!targetRow) return c.json({ error: "Target thought not found" }, 404);

    // Insert both directions atomically
    const insertBoth = db.transaction(() => {
      db.prepare(
        "INSERT OR IGNORE INTO thought_links (sourceThoughtId, targetThoughtId, createdAt) VALUES (?, ?, ?)",
      ).run(sourceId, targetId, new Date().toISOString());

      db.prepare(
        "INSERT OR IGNORE INTO thought_links (sourceThoughtId, targetThoughtId, createdAt) VALUES (?, ?, ?)",
      ).run(targetId, sourceId, new Date().toISOString());
    });

    insertBoth();

    return c.json({ linked: true, sourceId, targetId }, 201);
  } catch (err) {
    console.error("[vigil-core] Create link failed:", err);
    return c.json({ error: "Create link failed" }, 500);
  }
});

// DELETE /thoughts/:id/links/:linkedId — Remove bidirectional link
links.delete("/thoughts/:id/links/:linkedId", (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = Number(c.req.param("id"));
    const linkedId = Number(c.req.param("linkedId"));

    // Check if link exists in either direction
    const existing = db
      .prepare(
        "SELECT id FROM thought_links WHERE (sourceThoughtId = ? AND targetThoughtId = ?) OR (sourceThoughtId = ? AND targetThoughtId = ?)",
      )
      .get(id, linkedId, linkedId, id) as { id: number } | undefined;

    if (!existing) return c.json({ error: "Link not found" }, 404);

    // Delete both directions atomically
    const deleteBoth = db.transaction(() => {
      db.prepare(
        "DELETE FROM thought_links WHERE sourceThoughtId = ? AND targetThoughtId = ?",
      ).run(id, linkedId);

      db.prepare(
        "DELETE FROM thought_links WHERE sourceThoughtId = ? AND targetThoughtId = ?",
      ).run(linkedId, id);
    });

    deleteBoth();

    return c.body(null, 204);
  } catch (err) {
    console.error("[vigil-core] Delete link failed:", err);
    return c.json({ error: "Delete link failed" }, 500);
  }
});

// GET /thoughts/:id/links — List linked thoughts
links.get("/thoughts/:id/links", (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = Number(c.req.param("id"));

    // Check source thought exists
    const sourceRow = db
      .prepare(
        "SELECT id FROM thoughts WHERE id = ? AND syncStatus != 'pendingDeletion'",
      )
      .get(id) as { id: number } | undefined;

    if (!sourceRow) return c.json({ error: "Thought not found" }, 404);

    const rows = db
      .prepare(
        `SELECT DISTINCT t.* FROM thoughts t
         JOIN thought_links tl ON
           (t.id = tl.targetThoughtId AND tl.sourceThoughtId = ?)
           OR (t.id = tl.sourceThoughtId AND tl.targetThoughtId = ?)
         WHERE t.syncStatus != 'pendingDeletion'`,
      )
      .all(id, id) as Thought[];

    return c.json({ links: rows.map(toResponse) });
  } catch (err) {
    console.error("[vigil-core] List links failed:", err);
    return c.json({ error: "List links failed" }, 500);
  }
});
