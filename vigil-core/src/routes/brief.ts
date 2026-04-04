import { Hono } from "hono";
import { getDb } from "../db/index.js";
import type { Thought } from "../db/types.js";

export const brief = new Hono();

brief.get("/brief", (c) => {
  const db = getDb();
  if (!db) {
    return c.json({ error: "Database not available" }, 503);
  }

  try {
    // 1. Total thought count (excluding soft-deleted)
    const totalRow = db
      .prepare(
        "SELECT COUNT(*) as count FROM thoughts WHERE syncStatus != 'pendingDeletion'",
      )
      .get() as { count: number };

    // 2. Counts by category
    const categoryRows = db
      .prepare(
        "SELECT category, COUNT(*) as count FROM thoughts WHERE syncStatus != 'pendingDeletion' GROUP BY category",
      )
      .all() as { category: string | null; count: number }[];

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category ?? "uncategorized"] = row.count;
    }

    // 3. Task counts by status
    const taskRows = db
      .prepare(
        "SELECT taskStatus, COUNT(*) as count FROM thoughts WHERE category = 'task' AND syncStatus != 'pendingDeletion' GROUP BY taskStatus",
      )
      .all() as { taskStatus: string | null; count: number }[];

    const tasksByStatus: Record<string, number> = {};
    for (const row of taskRows) {
      tasksByStatus[row.taskStatus ?? "none"] = row.count;
    }

    // 4. Favorites count
    const favRow = db
      .prepare(
        "SELECT COUNT(*) as count FROM thoughts WHERE isFavorited = 1 AND syncStatus != 'pendingDeletion'",
      )
      .get() as { count: number };

    // 5. Unprocessed count (no category assigned)
    const unprocessedRow = db
      .prepare(
        "SELECT COUNT(*) as count FROM thoughts WHERE category IS NULL AND syncStatus != 'pendingDeletion'",
      )
      .get() as { count: number };

    // 6. Open tasks (open or inProgress, limit 10)
    const openTaskRows = db
      .prepare(
        `SELECT * FROM thoughts
         WHERE category = 'task' AND taskStatus IN ('open', 'inProgress') AND syncStatus != 'pendingDeletion'
         ORDER BY createdAt DESC LIMIT 10`,
      )
      .all() as Thought[];

    const openTasks = openTaskRows.map((row) => ({
      id: row.id,
      content: row.content,
      taskStatus: row.taskStatus,
      createdAt: row.createdAt,
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));

    // 7. Recent thoughts (last 5, all fields)
    const recentRows = db
      .prepare(
        `SELECT * FROM thoughts
         WHERE syncStatus != 'pendingDeletion'
         ORDER BY createdAt DESC LIMIT 5`,
      )
      .all() as Thought[];

    const recentThoughts = recentRows.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      source: row.source,
      createdAt: row.createdAt,
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));

    // 8. Recent therapy thoughts (last 5)
    const therapyRows = db
      .prepare(
        `SELECT * FROM thoughts
         WHERE category = 'therapy' AND syncStatus != 'pendingDeletion'
         ORDER BY createdAt DESC LIMIT 5`,
      )
      .all() as Thought[];

    const recentTherapy = therapyRows.map((row) => ({
      id: row.id,
      content: row.content,
      therapyClassification: row.therapyClassification,
      createdAt: row.createdAt,
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));

    // 9. Today's capture count
    const todayRow = db
      .prepare(
        "SELECT COUNT(*) as count FROM thoughts WHERE date(createdAt) = date('now') AND syncStatus != 'pendingDeletion'",
      )
      .get() as { count: number };

    const today = new Date().toISOString().split("T")[0];

    return c.json({
      date: today,
      counts: {
        total: totalRow.count,
        byCategory,
        tasksByStatus,
        favorites: favRow.count,
        unprocessed: unprocessedRow.count,
      },
      openTasks,
      recentThoughts,
      recentTherapy,
      todayCaptures: todayRow.count,
    });
  } catch (err) {
    console.error("[vigil-core] Brief query failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});
