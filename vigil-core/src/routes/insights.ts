import { Hono } from "hono";
import { callClaude, getAIClient, parseAIJson } from "../ai/client.js";
import type { Insight } from "../ai/types.js";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable, appSettings, aiCache } from "../db/schema.js";
import { eq, and, ne, gte, lt, desc } from "drizzle-orm";
import { getRollingDayWindow } from "../utils/date-window.js";

export const insights = new Hono();

insights.get("/insights/cache", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);

  const userId = c.get("userId");
  // Phase 102: aiCache is per-user — scope the read to prevent userA seeing userB's cache.
  const rows = await db
    .select()
    .from(aiCache)
    .where(and(eq(aiCache.userId, userId), eq(aiCache.type, "insights")))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ cached: false }, 404);
  }

  return c.json({
    insights: rows[0].result,
    cached: true,
    generatedAt: rows[0].generatedAt.toISOString(),
  });
});

insights.post("/insights", async (c) => {
  // Check AI client availability
  if (!getAIClient()) {
    return c.json({ error: "AI service unavailable" }, 503);
  }

  if (!db) return c.json({ error: "Database not available" }, 503);

  const userId = c.get("userId");
  // Resolve user timezone (composite PK (userId, key) per Phase 102 Pitfall 3)
  const tzRows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(and(eq(appSettings.userId, userId), eq(appSettings.key, "user_timezone")))
    .limit(1);
  const tz = tzRows.length > 0 ? (tzRows[0].value as string) : "America/New_York";

  // 7-day rolling window, scoped by userId
  const { start, end } = getRollingDayWindow(tz, 7);

  const conditions = [
    eq(thoughtsTable.userId, userId),
    ne(thoughtsTable.syncStatus, "pendingDeletion"),
    gte(thoughtsTable.createdAt, start),
    lt(thoughtsTable.createdAt, end),
  ];

  const rows = await db
    .select()
    .from(thoughtsTable)
    .where(and(...conditions))
    .orderBy(desc(thoughtsTable.createdAt))
    .limit(200);

  if (rows.length < 3) {
    return c.json(
      { error: `Only ${rows.length} thought${rows.length === 1 ? "" : "s"} this week — need at least 3 for insights`, count: rows.length },
      400
    );
  }

  // Build formatted thought list
  const thoughtList = rows
    .map(
      (t) => `[${t.id}] (${t.category ?? "uncategorized"}, ${t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt}) ${t.content}`
    )
    .join("\n");

  const system =
    "You are a personal insight engine for someone with ADHD. Analyze their recent captured thoughts and surface useful patterns, connections between ideas, and actionable suggestions. Focus on being genuinely helpful, not generic. Return a JSON array of insights.";

  const userMessage = `Here are my captured thoughts from the last 7 days:
${thoughtList}

Analyze these thoughts and return a JSON array of insights. Each insight should be:
[{"type": "pattern|connection|actionPrompt|trend", "title": "...", "message": "...", "confidence": 0.0-1.0, "related_thought_ids": []}]

Return ONLY the JSON array, no other text.`;

  try {
    const raw = await callClaude({
      system,
      userMessage,
      maxTokens: 1024,
    });

    // Parse JSON response
    let parsed: Array<{
      type: string;
      title: string;
      message: string;
      confidence: number;
      related_thought_ids: number[];
    }>;

    try {
      parsed = parseAIJson(raw);
    } catch {
      return c.json(
        { error: "Failed to parse AI response as JSON" },
        502
      );
    }

    if (!Array.isArray(parsed)) {
      return c.json(
        { error: "Failed to parse AI response as JSON" },
        502
      );
    }

    // Validate shape and filter by confidence
    const validParsed = parsed.filter(
      (item: Record<string, unknown>) =>
        typeof item.title === "string" &&
        typeof item.message === "string" &&
        typeof item.confidence === "number"
    );
    if (validParsed.length === 0) {
      return c.json({ error: "AI returned no valid insights" }, 502);
    }

    const insightsResult: Insight[] = validParsed
      .map((item) => ({
        type: item.type as Insight["type"],
        title: item.title,
        message: item.message,
        confidence: item.confidence,
        relatedThoughtIds: item.related_thought_ids ?? [],
      }))
      .filter((insight) => insight.confidence >= 0.5);

    // Write to ai_cache (upsert: overwrite on regenerate)
    // Phase 102: composite (userId, type) conflict target per uq_ai_cache_user_type.
    await db
      .insert(aiCache)
      .values({ userId, type: "insights", result: insightsResult, generatedAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [aiCache.userId, aiCache.type],
        set: { result: insightsResult, generatedAt: new Date(), updatedAt: new Date() },
      });

    return c.json({ insights: insightsResult, cached: false, generatedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    console.error("[insights] AI request failed:", message);
    return c.json({ error: "AI request failed" }, 502);
  }
});
