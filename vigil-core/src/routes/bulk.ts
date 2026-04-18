import { Hono } from "hono";
import { eq, ne, and, inArray } from "drizzle-orm";
import { db } from "../db/connection.js";
import { thoughts } from "../db/schema.js";

const VALID_CATEGORIES = [
  "task",
  "therapy",
  "idea",
  "reflection",
  "project",
] as const;

export const bulk = new Hono();

function validateIds(ids: unknown): ids is number[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every((id) => typeof id === "number" && Number.isInteger(id))
  );
}

// POST /thoughts/bulk/delete — Bulk soft delete
bulk.post("/thoughts/bulk/delete", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    const { ids } = body;

    if (!validateIds(ids)) {
      return c.json(
        { error: "ids must be a non-empty array of integers" },
        400,
      );
    }

    // Phase 102: scope by userId — cross-user ids silently drop to 0 (no leak).
    const result = await db
      .update(thoughts)
      .set({
        syncStatus: "pendingDeletion",
        modifiedAt: new Date(),
      })
      .where(and(inArray(thoughts.id, ids), eq(thoughts.userId, userId)))
      .returning({ id: thoughts.id });

    return c.json({ deleted: result.length });
  } catch (err) {
    console.error("[vigil-core] Bulk delete failed:", err);
    return c.json({ error: "Bulk delete failed" }, 500);
  }
});

// POST /thoughts/bulk/recategorize — Bulk category change
bulk.post("/thoughts/bulk/recategorize", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    const { ids, category } = body;

    if (!validateIds(ids)) {
      return c.json(
        { error: "ids must be a non-empty array of integers" },
        400,
      );
    }

    if (
      !category ||
      !VALID_CATEGORIES.includes(
        category as (typeof VALID_CATEGORIES)[number],
      )
    ) {
      return c.json(
        {
          error: `category must be one of: ${VALID_CATEGORIES.join(", ")}`,
        },
        400,
      );
    }

    const result = await db
      .update(thoughts)
      .set({
        category,
        modifiedAt: new Date(),
        syncStatus: "pending",
      })
      .where(
        and(
          inArray(thoughts.id, ids),
          eq(thoughts.userId, userId),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      )
      .returning({ id: thoughts.id });

    return c.json({ updated: result.length });
  } catch (err) {
    console.error("[vigil-core] Bulk recategorize failed:", err);
    return c.json({ error: "Bulk recategorize failed" }, 500);
  }
});

// POST /thoughts/bulk/therapy-classify — Bulk therapy classification
bulk.post("/thoughts/bulk/therapy-classify", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    const { ids, classification } = body;

    if (!validateIds(ids)) {
      return c.json(
        { error: "ids must be a non-empty array of integers" },
        400,
      );
    }

    const VALID_CLASSIFICATIONS = ["selfLearnable", "bringToTherapist"] as const;
    if (
      !classification ||
      !VALID_CLASSIFICATIONS.includes(
        classification as (typeof VALID_CLASSIFICATIONS)[number],
      )
    ) {
      return c.json(
        {
          error: `classification must be one of: ${VALID_CLASSIFICATIONS.join(", ")}`,
        },
        400,
      );
    }

    const result = await db
      .update(thoughts)
      .set({
        therapyClassification: classification,
        modifiedAt: new Date(),
        syncStatus: "pending",
      })
      .where(
        and(
          inArray(thoughts.id, ids),
          eq(thoughts.userId, userId),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      )
      .returning({ id: thoughts.id });

    return c.json({ updated: result.length });
  } catch (err) {
    console.error("[vigil-core] Bulk therapy classify failed:", err);
    return c.json({ error: "Bulk therapy classify failed" }, 500);
  }
});

// POST /thoughts/bulk/tag — Bulk add/remove tag
bulk.post("/thoughts/bulk/tag", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    const { ids, tag, action } = body;

    if (!validateIds(ids)) {
      return c.json(
        { error: "ids must be a non-empty array of integers" },
        400,
      );
    }

    if (!tag || typeof tag !== "string" || tag.trim() === "") {
      return c.json({ error: "tag must be a non-empty string" }, 400);
    }

    if (action !== "add" && action !== "remove") {
      return c.json(
        { error: 'action must be "add" or "remove"' },
        400,
      );
    }

    const trimmedTag = tag.trim();

    // Fetch all matching thoughts (scoped by userId)
    const matchingThoughts = await db
      .select({ id: thoughts.id, tags: thoughts.tags })
      .from(thoughts)
      .where(
        and(
          inArray(thoughts.id, ids),
          eq(thoughts.userId, userId),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      );

    let modifiedCount = 0;

    await db.transaction(async (tx) => {
      for (const t of matchingThoughts) {
        const currentTags: string[] = (t.tags as string[]) || [];
        let newTags: string[];

        if (action === "add") {
          if (currentTags.includes(trimmedTag)) continue;
          newTags = [...currentTags, trimmedTag];
        } else {
          if (!currentTags.includes(trimmedTag)) continue;
          newTags = currentTags.filter((x) => x !== trimmedTag);
        }

        await tx
          .update(thoughts)
          .set({
            tags: newTags.length > 0 ? newTags : null,
            modifiedAt: new Date(),
            syncStatus: "pending",
          })
          .where(and(eq(thoughts.id, t.id), eq(thoughts.userId, userId)));
        modifiedCount++;
      }
    });

    return c.json({ updated: modifiedCount });
  } catch (err) {
    console.error("[vigil-core] Bulk tag failed:", err);
    return c.json({ error: "Bulk tag failed" }, 500);
  }
});
