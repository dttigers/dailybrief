import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { thoughts } from "../db/schema.js";
import type { DrizzleThought } from "../db/types.js";

function toResponse(row: DrizzleThought) {
  return {
    ...row,
    tags: (row.tags as string[]) || [],
  };
}

export const tags = new Hono();

// POST /thoughts/:id/tags — Add tag to thought
tags.post("/thoughts/:id/tags", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    const body = await c.req.json();
    const { tag } = body;

    if (!tag || typeof tag !== "string" || tag.trim() === "") {
      return c.json({ error: "tag is required and must be non-empty" }, 400);
    }

    const [thought] = await db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));

    if (!thought || thought.syncStatus === "pendingDeletion") {
      return c.json({ error: "Thought not found" }, 404);
    }

    const trimmedTag = tag.trim();
    const currentTags: string[] = (thought.tags as string[]) || [];

    if (!currentTags.includes(trimmedTag)) {
      currentTags.push(trimmedTag);
      await db
        .update(thoughts)
        .set({
          tags: currentTags,
          modifiedAt: new Date(),
          syncStatus: "pending",
        })
        .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));
    }

    const [updated] = await db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Add tag failed:", err);
    return c.json({ error: "Add tag failed" }, 500);
  }
});

// DELETE /thoughts/:id/tags/:tag — Remove tag from thought
tags.delete("/thoughts/:id/tags/:tag", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    const tagParam = decodeURIComponent(c.req.param("tag"));

    const [thought] = await db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));

    if (!thought || thought.syncStatus === "pendingDeletion") {
      return c.json({ error: "Thought not found" }, 404);
    }

    const currentTags: string[] = (thought.tags as string[]) || [];

    if (!currentTags.includes(tagParam)) {
      return c.json({ error: "Tag not found on thought" }, 404);
    }

    const newTags = currentTags.filter((t) => t !== tagParam);

    await db
      .update(thoughts)
      .set({
        tags: newTags.length > 0 ? newTags : null,
        modifiedAt: new Date(),
        syncStatus: "pending",
      })
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));

    const [updated] = await db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Remove tag failed:", err);
    return c.json({ error: "Remove tag failed" }, 500);
  }
});

// GET /tags — List all unique tags (scoped by userId)
tags.get("/tags", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const result = await db.execute(
      sql`SELECT DISTINCT jsonb_array_elements_text(tags) as tag
          FROM ${thoughts}
          WHERE tags IS NOT NULL AND sync_status != 'pendingDeletion' AND user_id = ${userId}
          ORDER BY tag`,
    );

    return c.json({
      tags: result.map((r: Record<string, unknown>) => r.tag as string),
    });
  } catch (err) {
    console.error("[vigil-core] List tags failed:", err);
    return c.json({ error: "List tags failed" }, 500);
  }
});

// PUT /thoughts/:id/favorite — Toggle favorite
tags.put("/thoughts/:id/favorite", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));

    const [thought] = await db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));

    if (!thought || thought.syncStatus === "pendingDeletion") {
      return c.json({ error: "Thought not found" }, 404);
    }

    const [updated] = await db
      .update(thoughts)
      .set({
        isFavorited: !thought.isFavorited,
        modifiedAt: new Date(),
        syncStatus: "pending",
      })
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)))
      .returning();

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Toggle favorite failed:", err);
    return c.json({ error: "Toggle favorite failed" }, 500);
  }
});
