import { Hono } from "hono";
import { getDb } from "../db/index.js";
import type { Thought } from "../db/types.js";

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
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const body = await c.req.json();
    const { ids } = body;

    if (!validateIds(ids)) {
      return c.json(
        { error: "ids must be a non-empty array of integers" },
        400,
      );
    }

    const now = new Date().toISOString();
    const placeholders = ids.map(() => "?").join(", ");

    const result = db.transaction(() => {
      return db
        .prepare(
          `UPDATE thoughts SET syncStatus = 'pendingDeletion', modifiedAt = ? WHERE id IN (${placeholders})`,
        )
        .run(now, ...ids);
    })();

    return c.json({ deleted: result.changes });
  } catch (err) {
    console.error("[vigil-core] Bulk delete failed:", err);
    return c.json({ error: "Bulk delete failed" }, 500);
  }
});

// POST /thoughts/bulk/recategorize — Bulk category change
bulk.post("/thoughts/bulk/recategorize", async (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
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

    const now = new Date().toISOString();
    const placeholders = ids.map(() => "?").join(", ");

    const result = db.transaction(() => {
      return db
        .prepare(
          `UPDATE thoughts SET category = ?, syncStatus = 'pending', modifiedAt = ? WHERE id IN (${placeholders}) AND syncStatus != 'pendingDeletion'`,
        )
        .run(category, now, ...ids);
    })();

    return c.json({ updated: result.changes });
  } catch (err) {
    console.error("[vigil-core] Bulk recategorize failed:", err);
    return c.json({ error: "Bulk recategorize failed" }, 500);
  }
});

// POST /thoughts/bulk/therapy-classify — Bulk therapy classification
bulk.post("/thoughts/bulk/therapy-classify", async (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
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

    const now = new Date().toISOString();
    const placeholders = ids.map(() => "?").join(", ");

    const result = db.transaction(() => {
      return db
        .prepare(
          `UPDATE thoughts SET therapyClassification = ?, syncStatus = 'pending', modifiedAt = ? WHERE id IN (${placeholders}) AND syncStatus != 'pendingDeletion'`,
        )
        .run(classification, now, ...ids);
    })();

    return c.json({ updated: result.changes });
  } catch (err) {
    console.error("[vigil-core] Bulk therapy classify failed:", err);
    return c.json({ error: "Bulk therapy classify failed" }, 500);
  }
});

// POST /thoughts/bulk/tag — Bulk add/remove tag
bulk.post("/thoughts/bulk/tag", async (c) => {
  const db = getDb();
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
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
    const now = new Date().toISOString();
    const placeholders = ids.map(() => "?").join(", ");

    const updated = db.transaction(() => {
      // Fetch all matching thoughts
      const rows = db
        .prepare(
          `SELECT id, tags FROM thoughts WHERE id IN (${placeholders}) AND syncStatus != 'pendingDeletion'`,
        )
        .all(...ids) as Pick<Thought, "id" | "tags">[];

      let count = 0;
      const updateStmt = db.prepare(
        "UPDATE thoughts SET tags = ?, syncStatus = 'pending', modifiedAt = ? WHERE id = ?",
      );

      for (const row of rows) {
        const currentTags: string[] = row.tags
          ? JSON.parse(row.tags)
          : [];

        let newTags: string[];
        if (action === "add") {
          if (currentTags.includes(trimmedTag)) {
            continue; // Already has tag, skip
          }
          newTags = [...currentTags, trimmedTag];
        } else {
          if (!currentTags.includes(trimmedTag)) {
            continue; // Doesn't have tag, skip
          }
          newTags = currentTags.filter((t) => t !== trimmedTag);
        }

        updateStmt.run(JSON.stringify(newTags), now, row.id);
        count++;
      }

      return count;
    })();

    return c.json({ updated });
  } catch (err) {
    console.error("[vigil-core] Bulk tag failed:", err);
    return c.json({ error: "Bulk tag failed" }, 500);
  }
});
