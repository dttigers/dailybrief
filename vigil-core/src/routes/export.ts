import { Hono } from "hono";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable } from "../db/schema.js";
import { and, ne, eq, gte, lte, asc, sql } from "drizzle-orm";
import type { DrizzleThought } from "../db/types.js";

const EXPORT_LIMIT = 10000;

const VALID_FORMATS = ["json", "csv", "markdown"] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

function formatDate(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCSV(rows: DrizzleThought[]): string {
  const header =
    "id,content,category,source,createdAt,modifiedAt,taskStatus,tags,isFavorited";
  const lines = rows.map((row) => {
    const fields = [
      String(row.id),
      escapeCSV(row.content),
      escapeCSV(row.category ?? ""),
      escapeCSV(row.source),
      row.createdAt.toISOString(),
      row.modifiedAt.toISOString(),
      escapeCSV(row.taskStatus ?? ""),
      escapeCSV((row.tags ?? []).join("; ")),
      String(row.isFavorited),
    ];
    return fields.join(",");
  });
  return [header, ...lines].join("\n");
}

function toMarkdown(rows: DrizzleThought[]): string {
  // Group by category
  const groups: Record<string, DrizzleThought[]> = {};
  for (const row of rows) {
    const key = row.category ?? "uncategorized";
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const sections: string[] = [];
  sections.push(`# Vigil Export — ${formatDate()}\n`);

  const categoryOrder = [
    "task",
    "therapy",
    "idea",
    "reflection",
    "project",
    "uncategorized",
  ];
  const sortedKeys = Object.keys(groups).sort(
    (a, b) =>
      (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) -
      (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b)),
  );

  for (const category of sortedKeys) {
    const items = groups[category];
    sections.push(
      `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n`,
    );
    for (const item of items) {
      const dateStr = item.createdAt.toISOString().slice(0, 10);
      sections.push(`- **${dateStr}** — ${item.content}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

function toJSON(rows: DrizzleThought[]): object[] {
  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    category: row.category,
    confidence: row.confidence,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    modifiedAt: row.modifiedAt.toISOString(),
    cloudKitRecordID: row.cloudKitRecordID,
    syncStatus: row.syncStatus,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    taskStatus: row.taskStatus,
    therapyClassification: row.therapyClassification,
    tags: row.tags ?? [],
    isFavorited: row.isFavorited,
  }));
}

export const exportRoute = new Hono();

// GET /export — Export thoughts in JSON, CSV, or Markdown
exportRoute.get("/export", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const format = c.req.query("format") as ExportFormat | undefined;
    if (!format || !VALID_FORMATS.includes(format)) {
      return c.json(
        { error: `format is required and must be one of: ${VALID_FORMATS.join(", ")}` },
        400,
      );
    }

    const category = c.req.query("category");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const tag = c.req.query("tag");
    const q = c.req.query("q");

    // Validate date params
    if (from && isNaN(Date.parse(from))) {
      return c.json({ error: "from must be a valid ISO 8601 date string" }, 400);
    }
    if (to && isNaN(Date.parse(to))) {
      return c.json({ error: "to must be a valid ISO 8601 date string" }, 400);
    }

    // Build WHERE conditions (same pattern as thoughts.ts)
    const conditions = [ne(thoughtsTable.syncStatus, "pendingDeletion")];

    if (q) {
      conditions.push(
        sql`"thoughts"."search_vector" @@ plainto_tsquery('english', ${q})`,
      );
    }
    if (category) {
      conditions.push(eq(thoughtsTable.category, category));
    }
    if (tag) {
      conditions.push(
        sql`${thoughtsTable.tags} @> ${JSON.stringify([tag])}::jsonb`,
      );
    }
    if (from) {
      conditions.push(gte(thoughtsTable.createdAt, new Date(from)));
    }
    if (to) {
      conditions.push(lte(thoughtsTable.createdAt, new Date(to)));
    }

    const rows = await db
      .select()
      .from(thoughtsTable)
      .where(and(...conditions))
      .orderBy(asc(thoughtsTable.createdAt))
      .limit(EXPORT_LIMIT);

    const dateStr = formatDate();

    switch (format) {
      case "json": {
        const body = toJSON(rows);
        c.header("Content-Type", "application/json");
        c.header(
          "Content-Disposition",
          `attachment; filename="vigil-export-${dateStr}.json"`,
        );
        return c.json(body);
      }
      case "csv": {
        const body = toCSV(rows);
        c.header("Content-Type", "text/csv");
        c.header(
          "Content-Disposition",
          `attachment; filename="vigil-export-${dateStr}.csv"`,
        );
        return c.body(body);
      }
      case "markdown": {
        const body = toMarkdown(rows);
        c.header("Content-Type", "text/markdown");
        c.header(
          "Content-Disposition",
          `attachment; filename="vigil-export-${dateStr}.md"`,
        );
        return c.body(body);
      }
    }
  } catch (err) {
    console.error("[vigil-core] Export failed:", err);
    return c.json({ error: "Export failed" }, 500);
  }
});
