import { Hono } from "hono";
import {
  callClaudeConversation,
  getAIClient,
} from "../ai/client.js";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable } from "../db/schema.js";
import { desc, ne } from "drizzle-orm";

export const chat = new Hono();

chat.post("/chat", async (c) => {
  // Check AI client availability
  if (!getAIClient()) {
    return c.json({ error: "AI service unavailable" }, 503);
  }

  // Parse and validate body
  let messages: Array<{ role: "user" | "assistant"; content: string }>;
  let includeContext = true;
  let contextLimit = 20;

  try {
    const body = await c.req.json();
    messages = body?.messages;
    if (body?.includeContext === false) {
      includeContext = false;
    }
    if (
      typeof body?.contextLimit === "number" &&
      body.contextLimit >= 1 &&
      body.contextLimit <= 50
    ) {
      contextLimit = body.contextLimit;
    }
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: "messages array is required and must not be empty" }, 400);
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "user") {
    return c.json({ error: "Last message must have role 'user'" }, 400);
  }

  // Validate contextLimit range even if provided outside bounds
  if (contextLimit < 1) contextLimit = 1;
  if (contextLimit > 50) contextLimit = 50;

  // Build system prompt
  let system =
    "You are Vigil, an ambient AI life assistant built for ADHD brains. You help the user understand their thoughts, break down tasks, generate ideas, and find patterns in their captured data.\n\nBe concise, warm, and actionable. The user has ADHD — avoid walls of text, use bullet points, and lead with the most important thing.";

  let contextUsed = 0;

  // Optionally inject recent thoughts as context
  if (includeContext && db) {
    try {
      const recentThoughts = await db
        .select({
          content: thoughtsTable.content,
          category: thoughtsTable.category,
          createdAt: thoughtsTable.createdAt,
          taskStatus: thoughtsTable.taskStatus,
        })
        .from(thoughtsTable)
        .where(ne(thoughtsTable.syncStatus, "deleted"))
        .orderBy(desc(thoughtsTable.createdAt))
        .limit(contextLimit);

      if (recentThoughts.length > 0) {
        contextUsed = recentThoughts.length;
        const thoughtList = recentThoughts
          .map((t, i) => {
            const category = t.category ?? "uncategorized";
            const date = t.createdAt.toISOString().slice(0, 10);
            const status =
              t.category === "task" && t.taskStatus
                ? `/${t.taskStatus}`
                : "";
            return `${i + 1}. [${category}${status}] (${date}) ${t.content}`;
          })
          .join("\n");

        system += `\n\nHere are the user's recent captured thoughts for context:\n${thoughtList}`;
      }
    } catch {
      // Context injection failure is non-fatal — continue without context
    }
  }

  try {
    const response = await callClaudeConversation({
      system,
      messages,
      maxTokens: 1024,
    });

    return c.json({ response, contextUsed });
  } catch (err) {
    console.error("[chat] AI request failed:", err);
    const message = err instanceof Error ? err.message : "AI request failed";
    return c.json({ error: message }, 502);
  }
});
