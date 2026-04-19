import { Hono } from "hono";
import crypto from "node:crypto";
import heicConvert from "heic-convert";
import { and, eq } from "drizzle-orm";
import { callClaudeMultimodal, getAIClient, parseAIJson } from "../ai/client.js";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable } from "../db/schema.js";
import { toResponse, type ThoughtApiResponse } from "./thoughts.js";
import type { DrizzleThought } from "../db/types.js";
import { captureException } from "../analytics/posthog.js";
import { triageThought } from "./triage.js";
import type { TriageResult } from "../ai/types.js";

const VALID_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",   // CAP-01 + D-01 (Phase 103)
  "image/heif",   // CAP-01 + D-01 (Phase 103)
] as const;

type MediaType = (typeof VALID_MEDIA_TYPES)[number];

/**
 * Claude vision prompt for /process-photo. Copied verbatim from
 * 59-RESEARCH.md § "Recommended prompt shape". Do NOT rewrite or abbreviate —
 * the exact phrasing (role override, counter-example, [illegible] escape hatch,
 * explicit "no preamble" close) is the first line of defense against
 * paraphrase (P-1) and parseAIJson preamble failures (P-2).
 */
const PHOTO_PROMPT = `You are an OCR engine, not an assistant. Your job is to transcribe handwritten
notes from an image EXACTLY as written, and to identify the paper type.

STEP 1 — PAPER TYPE:
Look at the background of the paper. Classify it as one of:
  - "lined":   horizontal ruled lines (notebook paper, legal pad, steno pad,
               loose-leaf, sticky note with lines, planner pages)
  - "gridded": a grid of squares or dots (engineering pad, graph paper,
               bullet journal, dot-grid notebook, Rhodia dot pad)
  - "unknown": blank paper, whiteboard, unclear, or the photo is too dark /
               blurry to tell

Assign a confidence value from 0.0 to 1.0 reflecting how certain you are of
the paper type. Confidence below 0.5 means you are guessing.

STEP 2 — TRANSCRIBE VERBATIM:
Transcribe the handwritten text EXACTLY as it appears. This is a transcription,
not a summary. Follow these rules without exception:

  - Use the writer's EXACT words. If the note says "call mom", output
    "call mom" — NOT "Call your mother" or "The user should call their mother".
  - Preserve first-person voice. If the writer wrote "I need to", keep "I need to".
  - Do NOT add editorial framing like "This note is about..." or "The writer
    mentions...". You are not describing the notes — you ARE the notes.
  - Do NOT paraphrase, summarize, or "clean up" phrasing.
  - Do NOT correct spelling or grammar unless the letter shapes are clearly
    ambiguous; if the writer wrote "recieve", output "recieve".
  - If a word is unreadable, output [illegible] for that word only.
  - Preserve bullet markers, dashes, numbering, and checkboxes as text
    (e.g., "- " or "1. " or "[ ] ").

STEP 3 — SPLIT OR DON'T SPLIT:

  If paperType is "lined": split the transcription into separate thoughts,
  ONE thought per distinct topic, bullet, numbered item, or paragraph. Use
  semantic judgment — two short lines about the same idea are ONE thought;
  a bullet list of five errands is FIVE thoughts. Do not split mid-sentence.
  Do not split at every newline — split at meaning boundaries.

  If paperType is "gridded": return the entire transcription as a SINGLE
  thought. Gridded paper is for extended writing (design notes, diary,
  meeting notes) and should not be fragmented. The thoughts array must
  have exactly one entry.

  If paperType is "unknown": treat as lined and split.

OUTPUT FORMAT:
Return ONLY a single JSON object. No markdown code fences. No explanatory
text before or after. No "Here is the JSON:" preamble. Just the object:

{
  "paperType": "lined" | "gridded" | "unknown",
  "confidence": 0.0,
  "thoughts": ["verbatim text 1", "verbatim text 2"]
}`;

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

/**
 * Apply a user-supplied `forcePaperType` override to a ProcessedPhotoResult.
 * Pure post-processing step run after processClaudeResponse. Per 60-CONTEXT.md
 * D-06 + 60-RESEARCH.md Option 2 — "client-side split, server-side collapse".
 *
 * Cases:
 *  A. force="gridded" and Claude returned multiple thoughts → collapse to 1 via \n\n join
 *  B. force="lined"   and Claude returned exactly 1 blob    → split via splitGriddedBlobToLined
 *  C. force matches current shape / shape already compatible → just restamp paperType
 *  D. force undefined → return result unchanged (Phase 59 D-04 passthrough)
 */
export function applyForcePaperType(
  result: ProcessedPhotoResult,
  force: "lined" | "gridded" | undefined,
): ProcessedPhotoResult {
  if (!force) return result;

  // Case A: user forces gridded, Claude said lined (or unknown) with multiple thoughts
  if (force === "gridded" && result.thoughts.length > 1) {
    return {
      paperType: "gridded",
      confidence: result.confidence,
      thoughts: [result.thoughts.join("\n\n")],
    };
  }

  // Case B: user forces lined, Claude said gridded with exactly one blob
  if (force === "lined" && result.thoughts.length === 1) {
    return {
      paperType: "lined",
      confidence: result.confidence,
      thoughts: splitGriddedBlobToLined(result.thoughts[0]),
    };
  }

  // Case C: force matches current shape, or shape already compatible →
  // restamp paperType and return unchanged thoughts.
  return { ...result, paperType: force };
}

/**
 * Split a gridded-mode transcription into lined-mode thoughts.
 * Uses Claude's natural \n\n paragraph convention observed in gridded output
 * (verified against the Phase 59 real-photo brainstorm page, 2026-04-09).
 * Degenerate input (0 or 1 paragraphs after trim) → return the original trimmed
 * blob as a single entry so callers never get an empty thoughts array.
 *
 * See: .planning/phases/60-smart-photo-upload-dashboard-ux/60-RESEARCH.md
 */
export function splitGriddedBlobToLined(blob: string): string[] {
  const parts = blob
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 2) return [blob.trim()];
  return parts;
}

// ── Dependency injection surface (Plan 02 Task 1.2) ─────────────────────────

/**
 * Dependency-injection surface for route-level tests. Production uses the default.
 * Tests pass fakes for all three so no real Claude / Postgres call is ever made
 * from the unit suite (P-9: live API belongs in smoke-test.ts only).
 */
export interface ProcessPhotoDeps {
  callClaudeFn: typeof callClaudeMultimodal;
  getAIClientFn: typeof getAIClient;
  dbInsertFn: (
    rows: Array<typeof thoughtsTable.$inferInsert>,
  ) => Promise<DrizzleThought[]>;
  // Phase 103 Plan 02 additions:
  /** CAP-01 D-01: HEIC/HEIF → JPEG buffer conversion. Called only when mediaType is heic/heif. */
  heicConvertFn: (buf: Buffer) => Promise<Buffer>;
  /** CAP-02 D-05/D-06: Per-thought triage. Called in parallel for each inserted row (commit mode only). */
  triageFn: (content: string) => Promise<TriageResult>;
  /** CAP-02 D-07: Post-triage DB update for per-thought category/confidence/tags. */
  dbUpdateTriageFn: (
    thoughtId: number,
    userId: number,
    result: TriageResult,
  ) => Promise<void>;
}

const defaultDeps: ProcessPhotoDeps = {
  callClaudeFn: callClaudeMultimodal,
  getAIClientFn: getAIClient,
  dbInsertFn: async (rows) => {
    if (!db) throw new Error("Database not available");
    // P-12: ONE batched insert — Postgres executes atomically (T-59-03).
    return db.insert(thoughtsTable).values(rows).returning();
  },
  // CAP-01 Plan 02: heic-convert produces Uint8Array, widen to Buffer for Claude base64 encode.
  heicConvertFn: async (buf) => {
    const out = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 });
    return Buffer.from(out);
  },
  // CAP-02 Plan 02: reuse existing triage prompt via exported helper.
  triageFn: triageThought,
  // CAP-02 Plan 02: userId-scoped update preserves existing multi-user isolation.
  dbUpdateTriageFn: async (thoughtId, userId, result) => {
    if (!db) throw new Error("Database not available");
    await db
      .update(thoughtsTable)
      .set({
        category: result.category,
        confidence: result.confidence,
        ...(result.category === "task" ? { taskStatus: "open" as const } : {}),
        ...(result.tags ? { tags: result.tags } : {}),
        ...(result.therapyClassification
          ? { therapyClassification: result.therapyClassification }
          : {}),
      })
      .where(and(eq(thoughtsTable.id, thoughtId), eq(thoughtsTable.userId, userId)));
  },
};

/**
 * Build a processPhoto router with injectable deps. Tests pass fakes; production
 * uses the defaults. The production singleton `processPhoto` is exported below
 * so `index.ts` can mount it unchanged from Plan 01.
 */
export function createProcessPhotoRouter(
  deps: ProcessPhotoDeps = defaultDeps,
): Hono {
  const router = new Hono();

  // POST /process-photo — Smart photo upload: detect paper type + verbatim transcribe.
  router.post("/process-photo", async (c) => {
    const userId = c.get("userId");
    // 0. Preview mode flag (Plan 60-01 D-01). Strict equality — only the exact
    //    string "true" triggers preview mode. `?preview=yes`, `?preview=1`,
    //    `?preview=TRUE` all fall through to commit mode by design (T-60-02).
    const isPreview = c.req.query("preview") === "true";

    // 1. Parse JSON body. 400 on malformed.
    let body: { image?: string; mediaType?: string; forcePaperType?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // 2. Validate image.
    if (!body.image || typeof body.image !== "string") {
      return c.json(
        { error: "image is required and must be a base64 string" },
        400,
      );
    }

    // 2b. Payload-size guard (Plan 60-01 / Phase 59 REVIEW WR-02).
    //     Anthropic rejects base64 > ~5 MB raw (~6.7 MB encoded). Cap at
    //     5 MB raw (ceil(5*1024*1024*4/3) base64 chars) and reject with 413
    //     BEFORE the Claude call so a malicious/buggy client can't burn
    //     vendor tokens or hold MBs in memory for the 30s request window.
    //     60-CONTEXT.md D-08 maps this to status 413.
    const MAX_IMAGE_B64_CHARS = Math.ceil((5 * 1024 * 1024) * 4 / 3);
    if (body.image.length > MAX_IMAGE_B64_CHARS) {
      return c.json(
        { error: "image exceeds maximum size (5 MB)" },
        413,
      );
    }

    // 3. Validate mediaType.
    if (!body.mediaType || typeof body.mediaType !== "string") {
      return c.json({ error: "mediaType is required" }, 400);
    }
    if (!VALID_MEDIA_TYPES.includes(body.mediaType as MediaType)) {
      return c.json(
        {
          error: `Invalid mediaType. Must be one of: ${VALID_MEDIA_TYPES.join(", ")}`,
        },
        400,
      );
    }
    const mediaType = body.mediaType as MediaType;

    // 3b. Validate forcePaperType (Plan 60-01 D-06). Optional; if provided
    //     must be exactly "lined" or "gridded". T-60-01 mitigation.
    const rawForce = body.forcePaperType;
    let forcePaperType: "lined" | "gridded" | undefined;
    if (rawForce !== undefined) {
      if (rawForce !== "lined" && rawForce !== "gridded") {
        return c.json(
          { error: "forcePaperType must be 'lined' or 'gridded' if provided" },
          400,
        );
      }
      forcePaperType = rawForce;
    }

    // 3c. CAP-01 D-01 — HEIC/HEIF → JPEG pre-conversion (Phase 103 Plan 02).
    //     Runs ONLY for heic/heif mediaTypes. Non-HEIC paths pass through
    //     unchanged so the existing jpeg/png/gif/webp behavior is untouched.
    //     Pitfall 7: heic-convert expects a raw byte Buffer, not the base64 string.
    let claudeMediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
      mediaType === "image/heic" || mediaType === "image/heif"
        ? "image/jpeg"
        : (mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp");
    let claudeImageB64 = body.image;
    if (mediaType === "image/heic" || mediaType === "image/heif") {
      try {
        const inputBuf = Buffer.from(body.image, "base64");
        const jpegBuf = await deps.heicConvertFn(inputBuf);
        claudeImageB64 = jpegBuf.toString("base64");
      } catch (err) {
        console.error(
          "[vigil-core] /process-photo HEIC conversion failed:",
          err instanceof Error ? err.message : err,
        );
        return c.json({ error: "Image conversion failed" }, 422);
      }
    }

    // 4. AI client availability gate.
    if (!deps.getAIClientFn()) {
      return c.json(
        { error: "AI service unavailable. ANTHROPIC_API_KEY not configured." },
        503,
      );
    }

    // 5. Claude vision call (ONE call per D-02, maxTokens 2000 per P-6).
    let rawText: string;
    try {
      rawText = await deps.callClaudeFn({
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: claudeMediaType,
              data: claudeImageB64,
            },
          },
          { type: "text", text: PHOTO_PROMPT },
        ],
        maxTokens: 2000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown AI error";
      // T-59-04: log err.message only — NEVER body.image (base64 payload).
      // WR-01 (59-REVIEW / T-60-04): do NOT leak raw SDK error text to the
      // client. Anthropic errors frequently contain request IDs, model names,
      // and upstream URLs. Log detail server-side, return generic body.
      console.error(
        "[vigil-core] /process-photo Claude call failed:",
        message,
      );
      return c.json({ error: "AI processing failed" }, 502);
    }

    // 6. Apply D-04/D-08 coercions via the Plan 01 pure helper, then the
    //    Plan 60-01 forcePaperType override transform.
    const result = processClaudeResponse(rawText);
    const transformed = applyForcePaperType(result, forcePaperType);

    // 7. Preview mode — skip the DB insert and return unsaved thought shapes
    //    so the dashboard can show a "before commit" preview (D-01).
    if (isPreview) {
      return c.json(
        {
          paperType: transformed.paperType,
          confidence: transformed.confidence,
          thoughts: transformed.thoughts.map((content) => ({
            id: null,
            content,
            source: "image" as const,
            confidence: transformed.confidence,
            projectId: null,
          })),
        },
        200,
      );
    }

    // 8. Commit mode — build insert rows, every row gets its OWN randomUUID (P-7).
    // Phase 102: every row carries userId (NOT NULL constraint).
    // CAP-02: confidence starts null — triage update is the single source of truth
    // for per-thought confidence. The page-level vision confidence lives only in the
    // response envelope (paperType/confidence), not in individual thought rows.
    const insertRows = transformed.thoughts.map((content) => ({
      userId,
      content,
      source: "image" as const,
      confidence: null,
      cloudKitRecordID: crypto.randomUUID(),
    }));

    // 9. ONE batched insert (P-12 / T-59-03).
    let insertedRows: DrizzleThought[];
    try {
      insertedRows = await deps.dbInsertFn(insertRows);
    } catch (err) {
      // T-59-04: log "Create failed" + err, NEVER rawText.
      console.error("[vigil-core] /process-photo DB insert failed:", err);
      return c.json({ error: "Create failed" }, 500);
    }

    // 9b. CAP-02 D-05/D-06/D-07 — Per-thought sync triage (Phase 103 Plan 02).
    //     Parallel via Promise.allSettled so one rejection does NOT short-circuit
    //     the batch (Pitfall 6). On per-thought failure: keep the row, leave
    //     category null, report to PostHog via Plan 01 captureException wrapper.
    //     D-07: never lose the user's capture — always return 201.
    const triageOutcomes = await Promise.allSettled(
      insertedRows.map((row) => deps.triageFn(row.content)),
    );
    const triagedRows: DrizzleThought[] = await Promise.all(
      insertedRows.map(async (row, i) => {
        const outcome = triageOutcomes[i];
        if (outcome.status === "fulfilled") {
          const t = outcome.value;
          try {
            await deps.dbUpdateTriageFn(row.id, userId, t);
            return {
              ...row,
              category: t.category,
              confidence: t.confidence,
              tags: t.tags ?? row.tags,
              taskStatus: t.category === "task" ? "open" : row.taskStatus,
              therapyClassification:
                t.therapyClassification ?? row.therapyClassification,
            };
          } catch (updateErr) {
            // DB update failed — still return the row with null category (D-07).
            console.error(
              "[vigil-core] /process-photo triage DB update failed:",
              updateErr instanceof Error ? updateErr.message : updateErr,
            );
            captureException(userId, updateErr, {
              route: "/v1/process-photo",
              method: "POST",
              op: "triage_update",
            });
            return row;
          }
        } else {
          // D-07: triage call rejected — keep row, report to PostHog, return null-category row.
          console.error(
            "[vigil-core] /process-photo triage failed (non-fatal):",
            outcome.reason instanceof Error
              ? outcome.reason.message
              : outcome.reason,
          );
          captureException(userId, outcome.reason, {
            route: "/v1/process-photo",
            method: "POST",
            op: "triage",
          });
          return row;
        }
      }),
    );

    // 10. Success: 201 with serialized thoughts via toResponse.
    //     CAP-02: triagedRows reflects post-triage category/confidence/tags.
    const thoughtsResponse: ThoughtApiResponse[] = triagedRows.map(toResponse);
    return c.json(
      {
        paperType: transformed.paperType,
        confidence: transformed.confidence,
        thoughts: thoughtsResponse,
      },
      201,
    );
  });

  return router;
}

/** Production singleton — what `index.ts` mounts. */
export const processPhoto = createProcessPhotoRouter();
