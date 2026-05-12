import { Hono } from "hono";
import { callClaude, getAIClient, parseAIJson } from "../ai/client.js";
import type { TriageResult } from "../ai/types.js";

export const triage = new Hono();

export const TRIAGE_SYSTEM_PROMPT = `You are a thought categorizer and tagger. Categorize the user's thought into exactly one of these categories:

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

/**
 * Reusable triage helper extracted for CAP-02 (Phase 103 Plan 02).
 * Same prompt + maxTokens contract as the POST /v1/triage route — if the prompt
 * or model parameters change, update BOTH the route and this helper together.
 *
 * Phase 127 GUARD-03 (T-127-03 mitigation): `userId` is REQUIRED so callClaude
 * can accumulate per-user spend in ai_usage_daily. The DI seam in
 * process-photo.ts (`triageFn: typeof triageThought`) automatically picks up
 * the widened shape via TypeScript — callers must supply userId.
 *
 * Throws on:
 *  - Claude network/API errors (5xx, timeout, throttle)
 *  - parseAIJson failure (malformed JSON response)
 *
 * Callers handling CAP-02 D-07 graceful-null fallback wrap this in
 * Promise.allSettled and treat rejections as "keep the row, null category".
 */
export async function triageThought(content: string, userId: number): Promise<TriageResult> {
  const raw = await callClaude({
    system: TRIAGE_SYSTEM_PROMPT,
    userMessage: content,
    maxTokens: 100,
    userId,
  });
  return parseAIJson<TriageResult>(raw);
}

// POST /triage — Categorize a thought via Claude
triage.post("/triage", async (c) => {
  // Phase 127 GUARD-03 (T-127-03 mitigation): callClaude now requires userId
  // for per-user spend accumulation. Sourced from c.get("userId") per W-01
  // lock — populated by bearerAuth dispatcher at index.ts.
  const userId = c.get("userId");

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
      userId,
    });

    let result: TriageResult;
    try {
      result = parseAIJson<TriageResult>(raw);
    } catch {
      console.error("[vigil-core] /v1/triage parse error, raw:", raw);
      return c.json({ error: "AI response parse error" }, 502);
    }

    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return c.json({ error: message }, 500);
  }
});
