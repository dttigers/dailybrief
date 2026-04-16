import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { callClaudeMultimodal, getAIClient, parseAIJson, callClaude } from "../ai/client.js";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable } from "../db/schema.js";
import type { TriageResult } from "../ai/types.js";

export const processAudio = new Hono();

const AUDIO_PROMPT =
  "Transcribe this audio recording verbatim. Return ONLY the transcription text — no commentary, no timestamps, no labels. If the audio is unclear, transcribe what you can hear.";

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

const VALID_MEDIA_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
] as const;

type AudioMediaType = (typeof VALID_MEDIA_TYPES)[number];

// POST /process-audio — Transcribe audio via Claude, create thought, auto-triage.
processAudio.post("/process-audio", async (c) => {
  // 1. Parse JSON body
  let body: { audio?: string; mediaType?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // 2. Validate audio
  if (!body.audio || typeof body.audio !== "string") {
    return c.json({ error: "audio is required and must be a base64 string" }, 400);
  }

  // 2b. Size guard — 10 MB base64 limit
  const MAX_AUDIO_B64_CHARS = Math.ceil(10 * 1024 * 1024 * 4 / 3);
  if (body.audio.length > MAX_AUDIO_B64_CHARS) {
    return c.json({ error: "audio exceeds maximum size (10 MB)" }, 413);
  }

  // 3. Validate mediaType
  if (!body.mediaType || typeof body.mediaType !== "string") {
    return c.json({ error: "mediaType is required" }, 400);
  }
  if (!VALID_MEDIA_TYPES.includes(body.mediaType as AudioMediaType)) {
    return c.json(
      { error: `Invalid mediaType. Must be one of: ${VALID_MEDIA_TYPES.join(", ")}` },
      400,
    );
  }
  const mediaType = body.mediaType as AudioMediaType;

  // 4. AI client gate
  if (!getAIClient()) {
    return c.json({ error: "AI service unavailable. ANTHROPIC_API_KEY not configured." }, 503);
  }

  // 5. Upload file to Anthropic beta.files, then reference in message
  const ai = getAIClient()!;
  let transcription: string;
  try {
    // Upload audio as a file via beta API
    const audioBuffer = Buffer.from(body.audio, "base64");
    const blob = new Blob([audioBuffer], { type: mediaType });
    const file = new File([blob], `recording.${mediaType.split("/")[1] ?? "wav"}`, { type: mediaType });

    const uploaded = await ai.beta.files.upload({ file });

    const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    const response = await ai.beta.messages.create({
      model,
      max_tokens: 4096,
      betas: ["files-api-2025-04-14"],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: AUDIO_PROMPT,
            },
            {
              type: "file",
              source: {
                type: "file",
                file_id: uploaded.id,
              },
            } as never,
          ],
        },
      ],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      throw new Error(`Unexpected response type: ${block.type}`);
    }
    transcription = block.text;

    // Clean up uploaded file (fire-and-forget)
    ai.beta.files.delete(uploaded.id).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    console.error("[vigil-core] /process-audio Claude call failed:", message);
    return c.json({ error: "AI transcription failed" }, 502);
  }

  if (!transcription.trim()) {
    return c.json({ error: "Transcription produced no text" }, 422);
  }

  // 6. Create thought
  let insertedRow: typeof thoughtsTable.$inferSelect;
  try {
    const rows = await db!
      .insert(thoughtsTable)
      .values({
        content: transcription.trim(),
        source: "voice",
        cloudKitRecordID: crypto.randomUUID(),
      })
      .returning();
    insertedRow = rows[0];
  } catch (err) {
    console.error("[vigil-core] /process-audio DB insert failed:", err);
    return c.json({ error: "Failed to save thought" }, 500);
  }

  // 7. Fire-and-forget triage (non-blocking)
  (async () => {
    try {
      const raw = await callClaude({
        system: TRIAGE_SYSTEM_PROMPT,
        userMessage: transcription.trim(),
        maxTokens: 100,
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
        .where(eq(thoughtsTable.id, insertedRow.id));
    } catch (err) {
      console.error("[vigil-core] /process-audio triage failed (non-fatal):", err);
    }
  })();

  // 8. Return created thought
  return c.json(
    {
      id: insertedRow.id,
      content: insertedRow.content,
      source: insertedRow.source,
      transcription: transcription.trim(),
    },
    201,
  );
});
