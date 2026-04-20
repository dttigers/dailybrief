import { Hono } from "hono";
import crypto from "crypto";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable, projects as projectsTable, appSettings } from "../db/schema.js";
import { eq, and, ne, gte, lte, lt, desc, count, sql, isNull, or } from "drizzle-orm";
import { getCurrentWeekWindow } from "../utils/date-window.js";
import { callClaude, getAIClient, parseAIJson } from "../ai/client.js";
import type { TriageResult } from "../ai/types.js";
import type { DrizzleThought, PaginatedResponse } from "../db/types.js";
import { TRIAGE_SYSTEM_PROMPT } from "./triage.js";
import { trackEvent } from "../analytics/posthog.js";

/**
 * Pure predicate: returns true if the caller has explicitly bypassed the
 * default week window. Exported for unit testing (RO-06, RO-07).
 *
 * Bypass conditions (D-07):
 *   - q       : full-text search — results should be all-time
 *   - after   : caller supplied an explicit start bound
 *   - before  : caller supplied an explicit end bound
 *   - window === "all" : explicit escape hatch
 *
 * Any other value for window (including undefined, "", "current", typos)
 * falls through to the default window path.
 */
export function shouldBypassWindow(params: {
  q: string | undefined;
  after: string | undefined;
  before: string | undefined;
  window: string | undefined;
  category: string | undefined;
}): boolean {
  return !!params.q || !!params.after || !!params.before || params.window === "all" || params.category === "idea";
}

const VALID_SOURCES = ["text", "voice", "image"] as const;
const VALID_CATEGORIES = [
  "task",
  "therapy",
  "idea",
  "reflection",
  "project",
] as const;

/** API response shape — dates as ISO strings, tags as string[] */
export interface ThoughtApiResponse {
  id: number;
  content: string;
  category: string | null;
  confidence: number | null;
  source: string;
  createdAt: string;
  modifiedAt: string;
  cloudKitRecordID: string;
  syncStatus: string;
  lastSyncedAt: string | null;
  taskStatus: string | null;
  therapyClassification: string | null;
  tags: string[];
  isFavorited: boolean;
  projectId: number | null;
}

export function toResponse(row: DrizzleThought): ThoughtApiResponse {
  return {
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
    projectId: row.projectId ?? null,
  };
}

export const thoughts = new Hono();

// GET /thoughts — List with filters
thoughts.get("/thoughts", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const category = c.req.query("category");
    const source = c.req.query("source");
    const taskStatus = c.req.query("taskStatus");
    const therapyClassification = c.req.query("therapyClassification");
    const tag = c.req.query("tag");
    const favoritesOnly = c.req.query("favoritesOnly");
    const q = c.req.query("q");
    const after = c.req.query("after");
    const before = c.req.query("before");
    const projectIdParam = c.req.query("projectId");
    const unassignedParam = c.req.query("unassigned");
    const windowParam = c.req.query("window");
    const excludeDone = c.req.query("excludeDone");
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

    // D-01: projectId and unassigned are mutually exclusive
    if (projectIdParam !== undefined && unassignedParam === "true") {
      return c.json(
        { error: "projectId and unassigned are mutually exclusive" },
        400,
      );
    }

    // Validate projectId
    let projectIdNum: number | undefined;
    if (projectIdParam !== undefined) {
      projectIdNum = Number(projectIdParam);
      if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
        return c.json({ error: "projectId must be a positive integer" }, 400);
      }
    }

    // Validate date params
    if (after && isNaN(Date.parse(after))) {
      return c.json({ error: "after must be a valid ISO 8601 date string" }, 400);
    }
    if (before && isNaN(Date.parse(before))) {
      return c.json({ error: "before must be a valid ISO 8601 date string" }, 400);
    }

    // Build dynamic WHERE conditions
    const conditions = [
      eq(thoughtsTable.userId, userId),
      ne(thoughtsTable.syncStatus, "pendingDeletion"),
    ];

    if (q) {
      conditions.push(
        sql`"thoughts"."search_vector" @@ plainto_tsquery('english', ${q})`,
      );
    }
    if (category) {
      conditions.push(eq(thoughtsTable.category, category));
    }
    if (source) {
      conditions.push(eq(thoughtsTable.source, source));
    }
    if (taskStatus) {
      conditions.push(eq(thoughtsTable.taskStatus, taskStatus));
    }
    // D-04: By default, exclude done tasks from all views.
    // Callers can opt out with excludeDone=false (e.g., Tasks tab Done/All filters).
    // If taskStatus is explicitly set (e.g., taskStatus=done), skip this filter
    // since the caller is explicitly requesting a specific task status.
    if (excludeDone !== "false" && !taskStatus) {
      conditions.push(
        or(
          isNull(thoughtsTable.taskStatus),
          ne(thoughtsTable.taskStatus, "done"),
        )!
      );
    }
    if (therapyClassification) {
      conditions.push(eq(thoughtsTable.therapyClassification, therapyClassification));
    }
    if (tag) {
      conditions.push(
        sql`${thoughtsTable.tags} @> ${JSON.stringify([tag])}::jsonb`,
      );
    }
    if (favoritesOnly === "true") {
      conditions.push(eq(thoughtsTable.isFavorited, true));
    }
    if (projectIdNum !== undefined) {
      conditions.push(eq(thoughtsTable.projectId, projectIdNum));
    }
    if (unassignedParam === "true") {
      conditions.push(isNull(thoughtsTable.projectId));
    }
    if (after) {
      conditions.push(gte(thoughtsTable.createdAt, new Date(after)));
    }
    if (before) {
      conditions.push(lte(thoughtsTable.createdAt, new Date(before)));
    }

    // ROLLOVER-01..04: default to current-week window in user tz,
    // unless caller explicitly bypasses via ?q=, ?after=, ?before=, or ?window=all.
    const bypassWindow = shouldBypassWindow({ q, after, before, window: windowParam, category });
    if (!bypassWindow) {
      // Inline tz lookup (mirrors settings.ts pattern; extraction to shared util deferred to Phase 89 per CONTEXT.md)
      // Phase 102: appSettings has composite PK (user_id, key) — scope by userId.
      const tzRows = await db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(and(eq(appSettings.userId, userId), eq(appSettings.key, "user_timezone")))
        .limit(1);
      const tz = tzRows.length > 0 ? (tzRows[0].value as string) : "America/New_York";
      const { start, end } = getCurrentWeekWindow(tz);
      conditions.push(gte(thoughtsTable.createdAt, start));
      conditions.push(lt(thoughtsTable.createdAt, end));
    }

    const whereCondition = and(...conditions);

    // Count query
    const [{ total }] = await db
      .select({ total: count() })
      .from(thoughtsTable)
      .where(whereCondition);

    // Data query
    const rows = await db
      .select()
      .from(thoughtsTable)
      .where(whereCondition)
      .orderBy(desc(thoughtsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const response: PaginatedResponse<ThoughtApiResponse> = {
      data: rows.map(toResponse),
      total,
      limit,
      offset,
    };

    return c.json(response);
  } catch (err) {
    console.error("[vigil-core] List thoughts failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});

// GET /thoughts/:id — Single thought
thoughts.get("/thoughts/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const rows = await db
      .select()
      .from(thoughtsTable)
      .where(
        and(
          eq(thoughtsTable.id, id),
          eq(thoughtsTable.userId, userId),
          ne(thoughtsTable.syncStatus, "pendingDeletion"),
        ),
      )
      .limit(1);

    if (rows.length === 0) return c.json({ error: "Thought not found" }, 404);

    return c.json(toResponse(rows[0]));
  } catch (err) {
    console.error("[vigil-core] Get thought failed:", err);
    return c.json({ error: "Query failed" }, 500);
  }
});

// POST /thoughts — Create
thoughts.post("/thoughts", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    const { content, source, category, tags } = body;

    // Validation
    if (!content || typeof content !== "string" || content.trim() === "") {
      return c.json({ error: "content is required and must be non-empty" }, 400);
    }
    if (!VALID_SOURCES.includes(source)) {
      return c.json(
        { error: `source must be one of: ${VALID_SOURCES.join(", ")}` },
        400,
      );
    }
    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return c.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
        400,
      );
    }

    const [created] = await db
      .insert(thoughtsTable)
      .values({
        userId,
        content: content.trim(),
        source,
        category: category ?? null,
        tags: tags && Array.isArray(tags) ? tags : null,
        cloudKitRecordID: crypto.randomUUID(),
      })
      .returning();

    // D-15 (Phase 105): thought_created always emits when a thought row is inserted.
    // Properties are bounded enums + booleans — never thought.content (BLOCKED_PROPERTY_NAMES
    // would catch it anyway, but per code review hygiene, never include it).
    trackEvent(userId, "thought_created", {
      source: created.source,
      has_category: category != null,
      fire_and_forget_triage: !category && getAIClient() != null,
    });

    // Fire-and-forget auto-triage when no category provided
    if (!category && getAIClient()) {
      const thoughtId = created.id;
      const thoughtContent = content.trim();
      (async () => {
        try {
          const raw = await callClaude({
            system: TRIAGE_SYSTEM_PROMPT,
            userMessage: thoughtContent,
            maxTokens: 200,
          });
          const result = parseAIJson<TriageResult>(raw);
          await db!
            .update(thoughtsTable)
            .set({
              category: result.category,
              confidence: result.confidence,
              ...(result.category === "task" ? { taskStatus: "open" } : {}),
              ...(result.tags ? { tags: result.tags } : {}),
              ...(result.therapyClassification ? { therapyClassification: result.therapyClassification } : {}),
            })
            .where(and(eq(thoughtsTable.id, thoughtId), eq(thoughtsTable.userId, userId)));
        } catch (err) {
          console.error("[vigil-core] Auto-triage failed (non-fatal):", err);
        }
      })();
    }

    return c.json(toResponse(created), 201);
  } catch (err) {
    console.error("[vigil-core] Create thought failed:", err);
    return c.json({ error: "Create failed" }, 500);
  }
});

// PUT /thoughts/:id — Update
thoughts.put("/thoughts/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    // Check existence (scoped by userId — cross-user PATCH returns 404 not 403)
    const existing = await db
      .select({ id: thoughtsTable.id })
      .from(thoughtsTable)
      .where(
        and(
          eq(thoughtsTable.id, id),
          eq(thoughtsTable.userId, userId),
          ne(thoughtsTable.syncStatus, "pendingDeletion"),
        ),
      )
      .limit(1);
    if (existing.length === 0) return c.json({ error: "Thought not found" }, 404);

    const body = await c.req.json();

    // Validation
    if (body.content !== undefined) {
      if (typeof body.content !== "string" || body.content.trim() === "") {
        return c.json({ error: "content must be non-empty string" }, 400);
      }
    }
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category)) {
        return c.json(
          { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
          400,
        );
      }
    }

    // D-02: project_id whitelist with FK existence check.
    // Strict `!== undefined` gate (Pitfall P-1) — JSON null means "unassign",
    // absent key means "leave alone". Accept both projectId and project_id.
    let projectIdUpdate: number | null | undefined = undefined;
    const rawProjectId =
      body.projectId !== undefined ? body.projectId :
      body.project_id !== undefined ? body.project_id :
      undefined;

    if (rawProjectId !== undefined) {
      if (rawProjectId === null) {
        projectIdUpdate = null; // explicit unassign
      } else if (
        typeof rawProjectId === "number" &&
        Number.isInteger(rawProjectId) &&
        rawProjectId > 0
      ) {
        // FK existence check (mirrors projects.ts:137-145 pattern)
        // Phase 102: must also scope by userId to prevent cross-user projectId
        // reference attack (userA setting a thought's projectId to userB's project).
        const projectExists = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(and(eq(projectsTable.id, rawProjectId), eq(projectsTable.userId, userId)))
          .limit(1);
        if (projectExists.length === 0) {
          return c.json({ error: "project not found" }, 400);
        }
        projectIdUpdate = rawProjectId;
      } else {
        return c.json(
          { error: "projectId must be a positive integer or null" },
          400,
        );
      }
    }

    // Build dynamic update object
    const updates: Partial<typeof thoughtsTable.$inferInsert> = {};
    if (body.content !== undefined) updates.content = body.content.trim();
    if (body.category !== undefined) updates.category = body.category;
    if (body.taskStatus !== undefined) updates.taskStatus = body.taskStatus;
    if (body.therapyClassification !== undefined)
      updates.therapyClassification = body.therapyClassification;
    if (body.tags !== undefined)
      updates.tags = Array.isArray(body.tags) ? body.tags : null;
    if (body.isFavorited !== undefined) updates.isFavorited = body.isFavorited;
    if (projectIdUpdate !== undefined) updates.projectId = projectIdUpdate;

    // Always update modifiedAt and syncStatus
    updates.modifiedAt = new Date();
    updates.syncStatus = "pending";

    const [updated] = await db
      .update(thoughtsTable)
      .set(updates)
      .where(and(eq(thoughtsTable.id, id), eq(thoughtsTable.userId, userId)))
      .returning();

    return c.json(toResponse(updated));
  } catch (err) {
    console.error("[vigil-core] Update thought failed:", err);
    return c.json({ error: "Update failed" }, 500);
  }
});

// DELETE /thoughts/:id — Soft delete
thoughts.delete("/thoughts/:id", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  try {
    const userId = c.get("userId");
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    // Check existence (scoped by userId — cross-user delete returns 404)
    const existing = await db
      .select({ id: thoughtsTable.id })
      .from(thoughtsTable)
      .where(
        and(
          eq(thoughtsTable.id, id),
          eq(thoughtsTable.userId, userId),
          ne(thoughtsTable.syncStatus, "pendingDeletion"),
        ),
      )
      .limit(1);
    if (existing.length === 0) return c.json({ error: "Thought not found" }, 404);

    await db
      .update(thoughtsTable)
      .set({ syncStatus: "pendingDeletion", modifiedAt: new Date() })
      .where(and(eq(thoughtsTable.id, id), eq(thoughtsTable.userId, userId)));

    return c.body(null, 204);
  } catch (err) {
    console.error("[vigil-core] Delete thought failed:", err);
    return c.json({ error: "Delete failed" }, 500);
  }
});
