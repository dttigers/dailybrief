import { Hono } from "hono";
import { callClaudeMultimodal, getAIClient, parseAIJson } from "../ai/client.js";
// NOTE: thoughts.ts + db wiring will be imported in Plan 02. Leave imports for those
// commented out / absent for now so this file typechecks on its own.

export const processPhoto = new Hono();

const VALID_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type MediaType = (typeof VALID_MEDIA_TYPES)[number];

// PHOTO_PROMPT is defined as a placeholder in Plan 01. Plan 02 replaces this
// constant with the full OCR-engine prompt (see 59-RESEARCH.md § "Claude vision
// prompt design"). Keeping it empty here keeps the route file parseable and
// lets Plan 01 ship a scaffold that typechecks.
const PHOTO_PROMPT = "__PLAN_02_REPLACES_THIS__";

/** The structured result of parsing Claude's response and applying D-04/D-08 coercions. */
export interface ProcessedPhotoResult {
  /** What Claude said (preserved as reported, so Phase 60 UX can surface it). */
  paperType: "lined" | "gridded" | "unknown";
  /** Claude's confidence [0,1], 0 if parse failed. */
  confidence: number;
  /**
   * Thought content strings, post D-04/D-08 coercions:
   *  - low confidence or unknown → preserve split (treat-as-lined)
   *  - high-confidence gridded with >1 entries → collapse to one (defensive)
   *  - parse failure → single entry with raw text
   */
  thoughts: string[];
}

/**
 * Pure function: raw Claude response text → validated/coerced result.
 * No I/O. No DB. No Claude call. Safe to unit-test with hand-crafted strings.
 *
 * Implements D-04 (low-confidence/unknown → split) and D-08 (parse failure → single
 * lined thought with raw text) from 59-CONTEXT.md.
 */
export function processClaudeResponse(rawText: string): ProcessedPhotoResult {
  const fallback = (): ProcessedPhotoResult => ({
    paperType: "unknown",
    confidence: 0,
    thoughts: [rawText.trim() || "[empty response]"],
  });

  let parsed: unknown;
  try {
    parsed = parseAIJson<unknown>(rawText);
  } catch {
    return fallback(); // D-08: parse failure → single lined fallback
  }

  if (!parsed || typeof parsed !== "object") return fallback();

  const obj = parsed as Record<string, unknown>;

  // Validate paperType (default "unknown" if missing/invalid)
  const rawPaperType = obj.paperType;
  const paperType: "lined" | "gridded" | "unknown" =
    rawPaperType === "lined" || rawPaperType === "gridded" || rawPaperType === "unknown"
      ? rawPaperType
      : "unknown";

  // Validate confidence (default 0 if missing/invalid; clamp to [0,1])
  let confidence = 0;
  if (typeof obj.confidence === "number" && Number.isFinite(obj.confidence)) {
    confidence = Math.max(0, Math.min(1, obj.confidence));
  }

  // Validate thoughts array and trim each entry
  if (!Array.isArray(obj.thoughts)) return fallback();
  const cleaned = (obj.thoughts as unknown[])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (cleaned.length === 0) return fallback();

  // D-04: determine effective mode. Low confidence or unknown → treat as lined (split).
  const effectiveLined =
    paperType === "unknown" || confidence < 0.5 || paperType === "lined";

  let thoughts: string[];
  if (effectiveLined) {
    // Lined (or fallback-to-lined): preserve the split as-is.
    thoughts = cleaned;
  } else {
    // High-confidence gridded: must be exactly 1 thought. Defensive collapse
    // if Claude returned multiple (prompt is supposed to prevent this, P-4).
    thoughts = cleaned.length === 1 ? cleaned : [cleaned.join("\n\n")];
  }

  return { paperType, confidence, thoughts };
}

// POST /process-photo — Smart photo upload: detect paper type + verbatim transcribe.
// Plan 01 ships a scaffold that validates inputs and returns 501. Plan 02 replaces
// the 501 with the Claude call + DB insert + toResponse serialization.
processPhoto.post("/process-photo", async (c) => {
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
      { error: `Invalid mediaType. Must be one of: ${VALID_MEDIA_TYPES.join(", ")}` },
      400,
    );
  }

  if (!getAIClient()) {
    return c.json(
      { error: "AI service unavailable. ANTHROPIC_API_KEY not configured." },
      503,
    );
  }

  // Plan 02 replaces this stub with: callClaudeMultimodal(...) → processClaudeResponse(...) → DB insert → toResponse.
  // Keeping the stub explicit so Plan 02 has an unambiguous replacement target.
  void PHOTO_PROMPT;
  void callClaudeMultimodal;
  void parseAIJson;
  return c.json({ error: "Not yet implemented — see Plan 59-02" }, 501);
});
