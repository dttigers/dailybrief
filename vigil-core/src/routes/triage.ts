import { Hono } from "hono";
import { callClaude, getAIClient, parseAIJson } from "../ai/client.js";
import type { TriageResult } from "../ai/types.js";

export const triage = new Hono();

const TRIAGE_SYSTEM_PROMPT = `You are a thought categorizer and tagger. Categorize the user's thought into exactly one of these categories:

- task: actionable to-do item, something to do or buy
- therapy: feelings, emotions, therapy questions, mental health reflections
- idea: creative ideas, feature concepts, business ideas, "what if" thoughts
- reflection: observations, journal entries, life reflections, gratitude
- project: project notes, technical decisions, work-related context

Also:
- Add 1-3 short descriptive tags (lowercase, no hashtags) that capture the topic. Examples: "grocery", "work", "health", "parenting", "home repair".
- If category is "therapy", classify as either "selfLearnable" (can process alone) or "bringToTherapist" (should discuss with therapist). Omit therapyClassification for non-therapy categories.

Respond with ONLY a JSON object, no other text:
{"category": "<category>", "confidence": <0.0-1.0>, "tags": ["tag1", "tag2"], "therapyClassification": "selfLearnable"|"bringToTherapist"|null}`;

// POST /triage — Categorize a thought via Claude
triage.post("/triage", async (c) => {
  let body: { content?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
    return c.json({ error: "content is required and must be a non-empty string" }, 400);
  }

  if (!getAIClient()) {
    return c.json(
      { error: "AI service unavailable. ANTHROPIC_API_KEY not configured." },
      503
    );
  }

  try {
    const raw = await callClaude({
      system: TRIAGE_SYSTEM_PROMPT,
      userMessage: body.content,
      maxTokens: 100,
    });

    let result: TriageResult;
    try {
      result = parseAIJson<TriageResult>(raw);
    } catch {
      return c.json({ error: "AI response parse error", raw }, 502);
    }

    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return c.json({ error: message }, 500);
  }
});
