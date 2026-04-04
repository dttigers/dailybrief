import { Hono } from "hono";
import { callClaude, getAIClient } from "../ai/client.js";
import type {
  TherapyClassificationResult,
  TherapyPattern,
  TherapyPrep,
  TherapyPrepItem,
} from "../ai/types.js";

export const therapy = new Hono();

// ── Classify ────────────────────────────────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `You are a therapy thought classifier for a personal journaling tool. Your role is to help the user understand which thoughts they can explore independently vs which would benefit from discussing with their therapist.

IMPORTANT: You are a categorization tool, NOT a therapist. Your classifications are suggestions to help organize therapy prep, not clinical advice.

Classify the thought into one of two categories:

- selfLearnable: The user can likely work through this independently. Includes: self-reflection exercises, mindfulness practices, journaling prompts, cognitive reframing the user could do alone, gratitude practices, goal-setting, habit tracking observations, general emotional check-ins.

- bringToTherapist: This would benefit from professional guidance. Includes: recurring distressing patterns, trauma-related content, relationship conflicts needing mediation perspective, feelings of hopelessness or being stuck, topics the user keeps circling back to without resolution, strong emotional reactions they don't understand, anything involving safety concerns.

When in doubt, classify as bringToTherapist.

Respond with ONLY a JSON object:
{"classification": "<selfLearnable|bringToTherapist>", "confidence": <0.0-1.0>, "reasoning": "<1 sentence explaining why>"}`;

// POST /therapy/classify — Classify a thought for therapy relevance
therapy.post("/therapy/classify", async (c) => {
  let body: { content?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    !body.content ||
    typeof body.content !== "string" ||
    !body.content.trim()
  ) {
    return c.json(
      { error: "content is required and must be a non-empty string" },
      400
    );
  }

  if (!getAIClient()) {
    return c.json(
      { error: "AI service unavailable. ANTHROPIC_API_KEY not configured." },
      503
    );
  }

  try {
    const raw = await callClaude({
      system: CLASSIFY_SYSTEM_PROMPT,
      userMessage: body.content,
      maxTokens: 150,
    });

    let result: TherapyClassificationResult;
    try {
      result = JSON.parse(raw) as TherapyClassificationResult;
    } catch {
      return c.json({ error: "AI response parse error", raw }, 502);
    }

    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return c.json({ error: message }, 500);
  }
});
