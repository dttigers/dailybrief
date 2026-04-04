import { Hono } from "hono";
import { callClaude, getAIClient } from "../ai/client.js";
import type { Insight } from "../ai/types.js";

interface ThoughtInput {
  id: number;
  content: string;
  category: string;
  createdAt: string;
}

export const insights = new Hono();

insights.post("/insights", async (c) => {
  // Check AI client availability
  if (!getAIClient()) {
    return c.json({ error: "AI service unavailable" }, 503);
  }

  // Parse and validate body
  let thoughts: ThoughtInput[] = [];
  let days = 7;

  try {
    const body = await c.req.json();
    thoughts = body?.thoughts ?? [];
    if (body?.days && typeof body.days === "number") {
      days = body.days;
    }
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(thoughts) || thoughts.length < 3) {
    return c.json(
      { error: "Minimum 3 thoughts required for insight generation" },
      400
    );
  }

  // Build formatted thought list
  const thoughtList = thoughts
    .map(
      (t) => `[${t.id}] (${t.category}, ${t.createdAt}) ${t.content}`
    )
    .join("\n");

  const system =
    "You are a personal insight engine for someone with ADHD. Analyze their recent captured thoughts and surface useful patterns, connections between ideas, and actionable suggestions. Focus on being genuinely helpful, not generic. Return a JSON array of insights.";

  const userMessage = `Here are my captured thoughts from the last ${days} days:
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
      parsed = JSON.parse(raw);
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

    // Map snake_case to camelCase and filter by confidence
    const insightsResult: Insight[] = parsed
      .map((item) => ({
        type: item.type as Insight["type"],
        title: item.title,
        message: item.message,
        confidence: item.confidence,
        relatedThoughtIds: item.related_thought_ids ?? [],
      }))
      .filter((insight) => insight.confidence >= 0.5);

    return c.json({ insights: insightsResult });
  } catch {
    return c.json({ error: "AI request failed" }, 502);
  }
});
