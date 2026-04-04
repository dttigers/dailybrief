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

// ── Patterns ──────────────────────────────────────────────────────────────

interface PatternThought {
  id: number;
  content: string;
  therapyClassification: string;
  createdAt: string;
}

const PATTERNS_SYSTEM_PROMPT = `You are a pattern detection tool, NOT a therapist. Your role is to surface observations to help the user prepare for therapy sessions.

Analyze the user's therapy-related thoughts and identify recurring emotional themes, behavioral patterns, and unresolved concerns. For each pattern:
- Name the theme concisely
- Describe what you observe in 1-2 sentences
- Count how many thoughts relate to this theme
- Note whether the theme appears to be increasing, stable, or decreasing in frequency based on timestamps
- List the thought IDs that exhibit this pattern
- Rate your confidence (0.0-1.0) in the pattern being genuine, not surface-level

Focus on genuine patterns. Look for: recurring emotional states or triggers, behavioral cycles (avoidance, rumination), unresolved concerns that keep appearing, relationship dynamics that repeat, progress or regression in specific areas.`;

// POST /therapy/patterns — Detect patterns across therapy thoughts
therapy.post("/therapy/patterns", async (c) => {
  let body: { thoughts?: PatternThought[]; days?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.thoughts || !Array.isArray(body.thoughts) || body.thoughts.length < 5) {
    return c.json(
      { error: "At least 5 thoughts are required for pattern detection" },
      400
    );
  }

  if (!getAIClient()) {
    return c.json(
      { error: "AI service unavailable. ANTHROPIC_API_KEY not configured." },
      503
    );
  }

  const days = body.days || 30;
  const thoughtLines = body.thoughts
    .map((t) => `[${t.id}] (${t.therapyClassification}, ${t.createdAt}) ${t.content}`)
    .join("\n");

  const userMessage = `Here are my therapy-related thoughts from the last ${days} days:\n${thoughtLines}\n\nAnalyze these thoughts and identify recurring patterns. Return a JSON array:\n[{"theme": "...", "description": "...", "frequency": N, "trend": "increasing|stable|decreasing", "related_thought_ids": [], "confidence": 0.0-1.0}]\n\nReturn ONLY the JSON array, no other text.`;

  try {
    const raw = await callClaude({
      system: PATTERNS_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1024,
    });

    let parsed: Array<{
      theme: string;
      description: string;
      frequency: number;
      trend: "increasing" | "stable" | "decreasing";
      related_thought_ids: number[];
      confidence: number;
    }>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return c.json({ error: "AI response parse error", raw }, 502);
    }

    const patterns: TherapyPattern[] = parsed
      .filter((p) => p.confidence >= 0.5)
      .map((p) => ({
        theme: p.theme,
        description: p.description,
        frequency: p.frequency,
        trend: p.trend,
        relatedThoughtIds: p.related_thought_ids,
        confidence: p.confidence,
      }));

    return c.json({ patterns }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return c.json({ error: message }, 500);
  }
});

// ── Prep ──────────────────────────────────────────────────────────────────

interface PrepThought {
  id: number;
  content: string;
  createdAt: string;
}

interface PrepPattern {
  theme: string;
  trend: string;
  confidence: number;
  description: string;
}

const PREP_SYSTEM_PROMPT = `You are organizing the user's own thoughts for their therapy prep, NOT providing therapy or clinical advice.

Generate a structured therapy session preparation from the user's recent thoughts that they marked for therapist discussion. Your job is to:
- Organize thoughts into clear discussion topics
- Provide brief context for each topic so the user can reference it quickly
- Assign urgency levels (high/medium/low) based on emotional intensity and how pressing the topic seems
- If recurring patterns are provided, use them to add context about themes that keep appearing
- Identify overall themes across all topics
- Suggest a session focus based on what seems most pressing or important

Keep topics concise and actionable. The user should be able to glance at this prep before their session and know exactly what to discuss.`;

// POST /therapy/prep — Generate structured therapy session prep
therapy.post("/therapy/prep", async (c) => {
  let body: { thoughts?: PrepThought[]; patterns?: PrepPattern[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.thoughts || !Array.isArray(body.thoughts) || body.thoughts.length < 1) {
    return c.json(
      { error: "At least 1 thought is required for session prep" },
      400
    );
  }

  if (!getAIClient()) {
    return c.json(
      { error: "AI service unavailable. ANTHROPIC_API_KEY not configured." },
      503
    );
  }

  const thoughtLines = body.thoughts
    .map((t) => `[${t.id}] (${t.createdAt}) ${t.content}`)
    .join("\n");

  let patternSection = "";
  if (body.patterns && body.patterns.length > 0) {
    const patternLines = body.patterns
      .map((p) => `- ${p.theme} (${p.trend}, confidence: ${p.confidence}): ${p.description}`)
      .join("\n");
    patternSection = `\n\nDetected recurring patterns for additional context:\n${patternLines}`;
  }

  const userMessage = `Here are my recent thoughts marked for discussion with my therapist:\n${thoughtLines}${patternSection}\n\nGenerate a structured therapy session prep. Return a JSON object:\n{"items": [{"topic": "...", "context": "...", "urgency": "high|medium|low", "related_thought_ids": []}], "overall_themes": ["..."], "suggested_focus": "..."}\n\nReturn ONLY the JSON object, no other text.`;

  try {
    const raw = await callClaude({
      system: PREP_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1024,
    });

    let parsed: {
      items: Array<{
        topic: string;
        context: string;
        urgency: "high" | "medium" | "low";
        related_thought_ids: number[];
      }>;
      overall_themes: string[];
      suggested_focus: string;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return c.json({ error: "AI response parse error", raw }, 502);
    }

    const prep: TherapyPrep = {
      items: parsed.items.map((item) => ({
        topic: item.topic,
        context: item.context,
        urgency: item.urgency,
        relatedThoughtIds: item.related_thought_ids,
      })),
      overallThemes: parsed.overall_themes,
      suggestedFocus: parsed.suggested_focus,
    };

    return c.json(prep, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return c.json({ error: message }, 500);
  }
});
