import { Hono } from "hono";
import { eq, ne, and, or, inArray } from "drizzle-orm";
import { db } from "../db/connection.js";
import { thoughts, thoughtLinks } from "../db/schema.js";
import type { DrizzleThought } from "../db/types.js";

function toResponse(row: DrizzleThought) {
  return {
    ...row,
    tags: (row.tags as string[]) || [],
  };
}

export const links = new Hono();

// POST /thoughts/:id/links — Create bidirectional link
links.post("/thoughts/:id/links", async (c) => {
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
    const [sourceRow] = await db
      .select({ id: thoughts.id })
      .from(thoughts)
      .where(and(eq(thoughts.id, sourceId), ne(thoughts.syncStatus, "pendingDeletion")));

    if (!sourceRow) return c.json({ error: "Source thought not found" }, 404);

    const [targetRow] = await db
      .select({ id: thoughts.id })
      .from(thoughts)
      .where(and(eq(thoughts.id, targetId), ne(thoughts.syncStatus, "pendingDeletion")));

    if (!targetRow) return c.json({ error: "Target thought not found" }, 404);

    // Insert both directions atomically
    await db.transaction(async (tx) => {
      await tx
        .insert(thoughtLinks)
        .values({
          sourceThoughtId: sourceId,
          targetThoughtId: targetId,
        })
        .onConflictDoNothing();
      await tx
        .insert(thoughtLinks)
        .values({
          sourceThoughtId: targetId,
          targetThoughtId: sourceId,
        })
        .onConflictDoNothing();
    });

    return c.json({ linked: true, sourceId, targetId }, 201);
  } catch (err) {
    console.error("[vigil-core] Create link failed:", err);
    return c.json({ error: "Create link failed" }, 500);
  }
});

// DELETE /thoughts/:id/links/:linkedId — Remove bidirectional link
links.delete("/thoughts/:id/links/:linkedId", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = Number(c.req.param("id"));
    const linkedId = Number(c.req.param("linkedId"));

    // Check if link exists in either direction
    const [existing] = await db
      .select({ id: thoughtLinks.id })
      .from(thoughtLinks)
      .where(
        or(
          and(
            eq(thoughtLinks.sourceThoughtId, id),
            eq(thoughtLinks.targetThoughtId, linkedId),
          ),
          and(
            eq(thoughtLinks.sourceThoughtId, linkedId),
            eq(thoughtLinks.targetThoughtId, id),
          ),
        ),
      );

    if (!existing) return c.json({ error: "Link not found" }, 404);

    // Delete both directions atomically
    await db.transaction(async (tx) => {
      await tx
        .delete(thoughtLinks)
        .where(
          and(
            eq(thoughtLinks.sourceThoughtId, id),
            eq(thoughtLinks.targetThoughtId, linkedId),
          ),
        );
      await tx
        .delete(thoughtLinks)
        .where(
          and(
            eq(thoughtLinks.sourceThoughtId, linkedId),
            eq(thoughtLinks.targetThoughtId, id),
          ),
        );
    });

    return c.body(null, 204);
  } catch (err) {
    console.error("[vigil-core] Delete link failed:", err);
    return c.json({ error: "Delete link failed" }, 500);
  }
});

// GET /thoughts/:id/links — List linked thoughts
links.get("/thoughts/:id/links", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const id = Number(c.req.param("id"));

    // Check source thought exists
    const [sourceRow] = await db
      .select({ id: thoughts.id })
      .from(thoughts)
      .where(and(eq(thoughts.id, id), ne(thoughts.syncStatus, "pendingDeletion")));

    if (!sourceRow) return c.json({ error: "Thought not found" }, 404);

    // Get all linked thought IDs from both directions
    const linkRows = await db
      .select({
        sourceThoughtId: thoughtLinks.sourceThoughtId,
        targetThoughtId: thoughtLinks.targetThoughtId,
      })
      .from(thoughtLinks)
      .where(
        or(
          eq(thoughtLinks.sourceThoughtId, id),
          eq(thoughtLinks.targetThoughtId, id),
        ),
      );

    // Collect unique linked IDs (exclude the source ID)
    const linkedIds = new Set<number>();
    for (const link of linkRows) {
      if (link.sourceThoughtId !== id) linkedIds.add(link.sourceThoughtId);
      if (link.targetThoughtId !== id) linkedIds.add(link.targetThoughtId);
    }

    if (linkedIds.size === 0) {
      return c.json({ links: [] });
    }

    // Fetch the actual thoughts
    const linkedThoughts = await db
      .select()
      .from(thoughts)
      .where(
        and(
          inArray(thoughts.id, Array.from(linkedIds)),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      );

    return c.json({ links: linkedThoughts.map(toResponse) });
  } catch (err) {
    console.error("[vigil-core] List links failed:", err);
    return c.json({ error: "List links failed" }, 500);
  }
});
