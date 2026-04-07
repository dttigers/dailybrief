import { Hono } from "hono";
import { callClaudeMultimodal, getAIClient, parseAIJson } from "../ai/client.js";

export const describeImage = new Hono();

const VALID_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type MediaType = (typeof VALID_MEDIA_TYPES)[number];

// POST /describe-image — Describe a base64 image via Claude vision
describeImage.post("/describe-image", async (c) => {
  let body: { image?: string; mediaType?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.image || typeof body.image !== "string") {
    return c.json({ error: "image is required and must be a base64 string" }, 400);
  }

  if (!body.mediaType || typeof body.mediaType !== "string") {
    return c.json({ error: "mediaType is required" }, 400);
  }

  if (!VALID_MEDIA_TYPES.includes(body.mediaType as MediaType)) {
    return c.json(
      {
        error: `Invalid mediaType. Must be one of: ${VALID_MEDIA_TYPES.join(", ")}`,
      },
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
    const rawText = await callClaudeMultimodal({
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: body.mediaType as MediaType,
            data: body.image,
          },
        },
        {
          type: "text",
          text: `Analyze this image of handwritten notes or a notebook page. Identify each distinct subject, topic, or thought present. Return a JSON array where each element represents one distinct subject:

[{"subject": "brief topic label", "content": "full description of this subject/thought"}]

If the image contains only one subject, return a single-element array. If it's not a notebook/notes image, return a single element describing what you see. Return ONLY the JSON array, no other text.`,
        },
      ],
      maxTokens: 1000,
    });

    // Parse multi-subject JSON response into descriptions array
    let descriptions: string[];
    try {
      const parsed = parseAIJson<Array<{
        subject?: string;
        content?: string;
      }>>(rawText);
      descriptions = parsed
        .map((entry) => {
          const content = entry.content?.trim();
          if (!content) return null;
          const subject = entry.subject?.trim();
          return subject ? `${subject}: ${content}` : content;
        })
        .filter((d): d is string => d !== null);
      if (descriptions.length === 0) descriptions = [rawText.trim()];
    } catch {
      // Fallback: if not valid JSON, treat as single description
      descriptions = [rawText.trim()];
    }

    // Return both formats for backward compatibility
    return c.json({ description: descriptions[0], descriptions }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return c.json({ error: message }, 502);
  }
});
