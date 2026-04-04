import { Hono } from "hono";
import { callClaudeMultimodal, getAIClient } from "../ai/client.js";

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
    const description = await callClaudeMultimodal({
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
          text: "Describe this image concisely in 1-2 sentences. Focus on what is shown and any text visible in the image. This will be stored as a thought capture.",
        },
      ],
      maxTokens: 300,
    });

    return c.json({ description }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return c.json({ error: message }, 502);
  }
});
