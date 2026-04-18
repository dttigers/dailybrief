import { Hono } from "hono";
import { db } from "../db/connection.js";
import { thoughts } from "../db/schema.js";
import { ne, eq, and, or, desc, count, sql, isNull } from "drizzle-orm";

export const brief = new Hono();

brief.get("/brief", async (c) => {
  if (!db) {
    return c.json({ error: "Database not available" }, 503);
  }

  try {
    const userId = c.get("userId");
    // 1. Total thought count (scoped by userId, excluding soft-deleted)
    const [{ total }] = await db
      .select({ total: count() })
      .from(thoughts)
      .where(and(eq(thoughts.userId, userId), ne(thoughts.syncStatus, "pendingDeletion")));

    // 2. Counts by category (scoped)
    const categoryRows = await db
      .select({
        category: thoughts.category,
        count: count(),
      })
      .from(thoughts)
      .where(and(eq(thoughts.userId, userId), ne(thoughts.syncStatus, "pendingDeletion")))
      .groupBy(thoughts.category);

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category ?? "uncategorized"] = row.count;
    }

    // 3. Task counts by status (scoped)
    const taskRows = await db
      .select({
        taskStatus: thoughts.taskStatus,
        count: count(),
      })
      .from(thoughts)
      .where(
        and(
          eq(thoughts.userId, userId),
          eq(thoughts.category, "task"),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      )
      .groupBy(thoughts.taskStatus);

    const tasksByStatus: Record<string, number> = {};
    for (const row of taskRows) {
      tasksByStatus[row.taskStatus ?? "none"] = row.count;
    }

    // 4. Favorites count (scoped)
    const [{ favCount }] = await db
      .select({ favCount: count() })
      .from(thoughts)
      .where(
        and(
          eq(thoughts.userId, userId),
          eq(thoughts.isFavorited, true),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      );

    // 5. Unprocessed count (scoped — no category assigned)
    const [{ unprocessed }] = await db
      .select({ unprocessed: count() })
      .from(thoughts)
      .where(
        and(
          eq(thoughts.userId, userId),
          isNull(thoughts.category),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      );

    // 6. Open tasks (scoped — open or inProgress, limit 10)
    const openTaskRows = await db
      .select()
      .from(thoughts)
      .where(
        and(
          eq(thoughts.userId, userId),
          eq(thoughts.category, "task"),
          or(
            eq(thoughts.taskStatus, "open"),
            eq(thoughts.taskStatus, "inProgress"),
          ),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      )
      .orderBy(desc(thoughts.createdAt))
      .limit(10);

    const openTasks = openTaskRows.map((row) => ({
      id: row.id,
      content: row.content,
      taskStatus: row.taskStatus,
      createdAt: row.createdAt.toISOString(),
      tags: row.tags ?? [],
    }));

    // 7. Recent thoughts (scoped — last 5)
    const recentRows = await db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.userId, userId), ne(thoughts.syncStatus, "pendingDeletion")))
      .orderBy(desc(thoughts.createdAt))
      .limit(5);

    const recentThoughts = recentRows.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      tags: row.tags ?? [],
    }));

    // 8. Recent therapy thoughts (scoped — last 5)
    const therapyRows = await db
      .select()
      .from(thoughts)
      .where(
        and(
          eq(thoughts.userId, userId),
          eq(thoughts.category, "therapy"),
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      )
      .orderBy(desc(thoughts.createdAt))
      .limit(5);

    const recentTherapy = therapyRows.map((row) => ({
      id: row.id,
      content: row.content,
      therapyClassification: row.therapyClassification,
      createdAt: row.createdAt.toISOString(),
      tags: row.tags ?? [],
    }));

    // 9. Today's capture count (scoped by userId)
    const [{ todayCount }] = await db
      .select({ todayCount: count() })
      .from(thoughts)
      .where(
        and(
          eq(thoughts.userId, userId),
          sql`${thoughts.createdAt}::date = CURRENT_DATE`,
          ne(thoughts.syncStatus, "pendingDeletion"),
        ),
      );

    const today = new Date().toISOString().split("T")[0];

    return c.json({
      date: today,
      counts: {
        total,
        byCategory,
        tasksByStatus,
        favorites: favCount,
        unprocessed,
      },
      openTasks,
      recentThoughts,
      recentTherapy,
      todayCaptures: todayCount,
    });
  } catch (err) {
    console.error("[vigil-core] Brief query failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});
