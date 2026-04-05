import { Hono } from "hono";
import { db } from "../db/connection.js";
import { thoughts, thoughtLinks } from "../db/schema.js";
import { ne, eq, and, desc, count, sql } from "drizzle-orm";

export const summary = new Hono();

summary.get("/summary", async (c) => {
  if (!db) {
    return c.json({ error: "Database not available" }, 503);
  }

  try {
    // Total thought count (excluding soft-deleted)
    const [{ total }] = await db
      .select({ total: count() })
      .from(thoughts)
      .where(ne(thoughts.syncStatus, "pendingDeletion"));

    // Counts by category
    const categoryRows = await db
      .select({
        category: thoughts.category,
        count: count(),
      })
      .from(thoughts)
      .where(ne(thoughts.syncStatus, "pendingDeletion"))
      .groupBy(thoughts.category);

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category ?? "uncategorized"] = row.count;
    }

    // Task counts by status
    const taskRows = await db
      .select({
        taskStatus: thoughts.taskStatus,
        count: count(),
      })
      .from(thoughts)
      .where(
        and(
          eq(thoughts.category, "task"),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      )
      .groupBy(thoughts.taskStatus);

    const tasksByStatus: Record<string, number> = {};
    for (const row of taskRows) {
      tasksByStatus[row.taskStatus ?? "none"] = row.count;
    }

    // Favorites count
    const [{ favCount }] = await db
      .select({ favCount: count() })
      .from(thoughts)
      .where(
        and(
          eq(thoughts.isFavorited, true),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      );

    // Linked thoughts count
    const [{ linkedCount }] = await db
      .select({
        linkedCount:
          sql<number>`count(distinct ${thoughtLinks.sourceThoughtId})`,
      })
      .from(thoughtLinks);

    // Recent 5 thoughts
    const recentRows = await db
      .select()
      .from(thoughts)
      .where(ne(thoughts.syncStatus, "pendingDeletion"))
      .orderBy(desc(thoughts.createdAt))
      .limit(5);

    const recent = recentRows.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      tags: row.tags ?? [],
    }));

    return c.json({
      total,
      byCategory,
      tasksByStatus,
      favorites: favCount,
      linkedThoughts: linkedCount,
      recent,
    });
  } catch (err) {
    console.error("[vigil-core] Summary query failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});
