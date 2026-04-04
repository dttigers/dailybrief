import { Hono } from "hono";
import { getDb } from "../db/index.js";
import type { Thought, ThoughtResponse } from "../db/types.js";

function toResponse(row: Thought): ThoughtResponse {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

export const tags = new Hono();

// POST /thoughts/:id/tags — Add tag to thought
tags.post("/thoughts/:id/tags", async (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { tag } = body;

    if (!tag || typeof tag !== "string" || tag.trim() === "") {
      return c.json({ error: "tag is required and must be non-empty" }, 400);
    }

    const row = db
      .prepare(
        "SELECT * FROM thoughts WHERE id = ? AND syncStatus != 'pendingDeletion'",
      )
      .get(id) as Thought | undefined;

    if (!row) return c.json({ error: "Thought not found" }, 404);

    const currentTags: string[] = row.tags ? JSON.parse(row.tags) : [];
    const trimmedTag = tag.trim();

    if (!currentTags.includes(trimmedTag)) {
      currentTags.push(trimmedTag);
    }

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE thoughts SET tags = ?, modifiedAt = ?, syncStatus = 'pending' WHERE id = ?",
    ).run(JSON.stringify(currentTags), now, id);

    const updated = db
      .prepare("SELECT * FROM thoughts WHERE id = ?")
      .get(id) as Thought;

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Add tag failed:", err);
    return c.json({ error: "Add tag failed" }, 500);
  }
});

// DELETE /thoughts/:id/tags/:tag — Remove tag from thought
tags.delete("/thoughts/:id/tags/:tag", (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = c.req.param("id");
    const tagParam = decodeURIComponent(c.req.param("tag"));

    const row = db
      .prepare(
        "SELECT * FROM thoughts WHERE id = ? AND syncStatus != 'pendingDeletion'",
      )
      .get(id) as Thought | undefined;

    if (!row) return c.json({ error: "Thought not found" }, 404);

    const currentTags: string[] = row.tags ? JSON.parse(row.tags) : [];

    if (!currentTags.includes(tagParam)) {
      return c.json({ error: "Tag not found on thought" }, 404);
    }

    const updatedTags = currentTags.filter((t) => t !== tagParam);
    const now = new Date().toISOString();

    db.prepare(
      "UPDATE thoughts SET tags = ?, modifiedAt = ?, syncStatus = 'pending' WHERE id = ?",
    ).run(JSON.stringify(updatedTags), now, id);

    const updated = db
      .prepare("SELECT * FROM thoughts WHERE id = ?")
      .get(id) as Thought;

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Remove tag failed:", err);
    return c.json({ error: "Remove tag failed" }, 500);
  }
});

// GET /tags — List all unique tags
tags.get("/tags", (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT json_each.value as tag
         FROM thoughts, json_each(thoughts.tags)
         WHERE thoughts.syncStatus != 'pendingDeletion'
           AND thoughts.tags IS NOT NULL
         ORDER BY tag`,
      )
      .all() as { tag: string }[];

    return c.json({ tags: rows.map((r) => r.tag) });
  } catch (err) {
    console.error("[vigil-core] List tags failed:", err);
    return c.json({ error: "List tags failed" }, 500);
  }
});

// PUT /thoughts/:id/favorite — Toggle favorite
tags.put("/thoughts/:id/favorite", (c) => {
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

    const newFavorited = row.isFavorited ? 0 : 1;
    const now = new Date().toISOString();

    db.prepare(
      "UPDATE thoughts SET isFavorited = ?, modifiedAt = ?, syncStatus = 'pending' WHERE id = ?",
    ).run(newFavorited, now, id);

    const updated = db
      .prepare("SELECT * FROM thoughts WHERE id = ?")
      .get(id) as Thought;

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Toggle favorite failed:", err);
    return c.json({ error: "Toggle favorite failed" }, 500);
  }
});
