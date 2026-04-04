import { Hono } from "hono";
import { getDb } from "../db/index.js";

export const summary = new Hono();

summary.get("/summary", (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ error: "Database not available" }, 503);
  }

  try {
    // Total thought count (excluding soft-deleted)
    const totalRow = db
      .prepare(
        "SELECT COUNT(*) as count FROM thoughts WHERE syncStatus != 'pendingDeletion'",
      )
      .get() as { count: number };

    // Counts by category
    const categoryRows = db
      .prepare(
        "SELECT category, COUNT(*) as count FROM thoughts WHERE syncStatus != 'pendingDeletion' GROUP BY category",
      )
      .all() as { category: string | null; count: number }[];

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category ?? "uncategorized"] = row.count;
    }

    // Task counts by status
    const taskRows = db
      .prepare(
        "SELECT taskStatus, COUNT(*) as count FROM thoughts WHERE category = 'task' AND syncStatus != 'pendingDeletion' GROUP BY taskStatus",
      )
      .all() as { taskStatus: string | null; count: number }[];

    const tasksByStatus: Record<string, number> = {};
    for (const row of taskRows) {
      tasksByStatus[row.taskStatus ?? "none"] = row.count;
    }

    // Recent thoughts (last 5)
    const recentRows = db
      .prepare(
        "SELECT id, content, category, source, createdAt, tags FROM thoughts WHERE syncStatus != 'pendingDeletion' ORDER BY createdAt DESC LIMIT 5",
      )
      .all() as {
      id: number;
      content: string;
      category: string | null;
      source: string;
      createdAt: string;
      tags: string | null;
    }[];

    const recent = recentRows.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      source: row.source,
      createdAt: row.createdAt,
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));

    // Favorites count
    const favRow = db
      .prepare(
        "SELECT COUNT(*) as count FROM thoughts WHERE isFavorited = 1 AND syncStatus != 'pendingDeletion'",
      )
      .get() as { count: number };

    // Linked thoughts count
    const linkedRow = db
      .prepare("SELECT COUNT(DISTINCT sourceThoughtId) as count FROM thought_links")
      .get() as { count: number };

    return c.json({
      total: totalRow.count,
      byCategory,
      tasksByStatus,
      favorites: favRow.count,
      linkedThoughts: linkedRow.count,
      recent,
    });
  } catch (err) {
    console.error("[vigil-core] Summary query failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});
