import { Hono } from "hono";
import { db } from "../db/connection.js";
import { briefs } from "../db/schema.js";
import { eq, desc, gte, lte, count, and, sql } from "drizzle-orm";
import type { DrizzleBrief, PaginatedResponse } from "../db/types.js";

/** API response shape — dates as strings */
interface BriefApiResponse {
  id: number;
  date: string;
  summary: unknown;
  pdfFilename: string | null;
  thoughtCount: number;
  taskCount: number;
  createdAt: string;
}

function toResponse(row: DrizzleBrief): BriefApiResponse {
  return {
    id: row.id,
    date: row.date,
    summary: row.summary,
    pdfFilename: row.pdfFilename,
    thoughtCount: row.thoughtCount,
    taskCount: row.taskCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export const briefHistory = new Hono();

// POST /briefs — Save (upsert) a brief snapshot
briefHistory.post("/briefs", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const body = await c.req.json();
    const { date, summary, pdfFilename, thoughtCount, taskCount } = body;

    // Validation
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: "date is required and must be YYYY-MM-DD format" }, 400);
    }
    if (summary === undefined || summary === null) {
      return c.json({ error: "summary is required" }, 400);
    }
    if (typeof thoughtCount !== "number" || !Number.isFinite(thoughtCount)) {
      return c.json({ error: "thoughtCount is required and must be a number" }, 400);
    }
    if (typeof taskCount !== "number" || !Number.isFinite(taskCount)) {
      return c.json({ error: "taskCount is required and must be a number" }, 400);
    }

    // Upsert — on conflict on date, update the record
    const [saved] = await db
      .insert(briefs)
      .values({
        date,
        summary,
        pdfFilename: pdfFilename ?? null,
        thoughtCount,
        taskCount,
      })
      .onConflictDoUpdate({
        target: briefs.date,
        set: {
          summary,
          pdfFilename: pdfFilename ?? null,
          thoughtCount,
          taskCount,
          createdAt: sql`now()`,
        },
      })
      .returning();

    return c.json(toResponse(saved), 201);
  } catch (err) {
    console.error("[vigil-core] Save brief failed:", err);
    return c.json({ error: "Save failed" }, 500);
  }
});

// GET /briefs — List brief history with pagination
briefHistory.get("/briefs", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 30, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const from = c.req.query("from");
    const to = c.req.query("to");

    // Validate date params
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return c.json({ error: "from must be YYYY-MM-DD format" }, 400);
    }
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return c.json({ error: "to must be YYYY-MM-DD format" }, 400);
    }

    // Build conditions
    const conditions = [];
    if (from) {
      conditions.push(gte(briefs.date, from));
    }
    if (to) {
      conditions.push(lte(briefs.date, to));
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    // Count query
    const [{ total }] = await db
      .select({ total: count() })
      .from(briefs)
      .where(whereCondition);

    // Data query
    const rows = await db
      .select()
      .from(briefs)
      .where(whereCondition)
      .orderBy(desc(briefs.date))
      .limit(limit)
      .offset(offset);

    const response: PaginatedResponse<BriefApiResponse> = {
      data: rows.map(toResponse),
      total,
      limit,
      offset,
    };

    return c.json(response);
  } catch (err) {
    console.error("[vigil-core] List briefs failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});

// GET /briefs/:date — Get specific brief by date
briefHistory.get("/briefs/:date", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const date = c.req.param("date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: "date must be YYYY-MM-DD format" }, 400);
    }

    const rows = await db
      .select()
      .from(briefs)
      .where(eq(briefs.date, date))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: "Brief not found" }, 404);
    }

    return c.json(toResponse(rows[0]));
  } catch (err) {
    console.error("[vigil-core] Get brief failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});
