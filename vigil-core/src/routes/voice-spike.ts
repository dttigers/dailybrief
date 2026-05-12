// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is spike-only and MUST be deleted or rewritten before Phase 130 lands.
// Lifecycle: created Phase 128a, deleted/rewritten Phase 130.
// Convention precedent: vigil-g2-plugin/scripts/check-verified.mjs

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { callClaude, parseAIJson } from "../ai/client.js";
import { db } from "../db/connection.js";
import { thoughts as thoughtsTable } from "../db/schema.js";
import type { TriageResult } from "../ai/types.js";
import { requireAiBudget } from "../lib/ai-budget.js";
import { assertAudioSessionWithinCap } from "../lib/audio-cap.js";
import { transcribeWav as defaultTranscribeWav } from "../ai/transcribe-spike.js";

// Triage prompt — verbatim copy from process-audio.ts:14-27. Load-bearing for
// category extraction tests downstream; do NOT paraphrase.
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

/**
 * Factory dependency seam for unit tests (mirrors agent-stream.ts /
 * quiet-mode.ts factory pattern — the canonical vigil-core route
 * test-injection precedent). Production `voiceSpike` export below wires the
 * real transcribeWav from ai/transcribe-spike.ts; tests can pass a stub.
 *
 * ESM live-binding constraints rule out `mock.method` here — the export from
 * transcribe-spike.ts is a function declaration with `configurable: false` so
 * defineProperty rebinding throws. Factory injection sidesteps the issue.
 */
export type VoiceSpikeDeps = {
  transcribeWav?: (wav: Buffer) => Promise<string>;
};

export function createVoiceSpikeRoute(deps: VoiceSpikeDeps = {}): Hono {
  const transcribe = deps.transcribeWav ?? defaultTranscribeWav;
  const router = new Hono();

  // POST /voice/transcribe — Phase 128a spike: G2 capture → OpenAI transcription → thought + triage.
  // Sequence (CONTEXT D-W2):
  //   1. userId from bearerAuth-set context
  //   2. requireAiBudget(userId) — Phase 127 GUARD-03 chokepoint, BEFORE body parse
  //   3. Parse JSON body { audio: string }
  //   4. assertAudioSessionWithinCap — Phase 127 GUARD-02 60s cap (inline catch → 413)
  //   5. Decode base64 → transcribe via OpenAI gpt-4o-mini-transcribe
  //   6. Insert thought with source='g2_voice'
  //   7. Fire-and-forget triage (verbatim from process-audio.ts:172-194)
  //   8. Return { id, content } with status 201
  router.post("/voice/transcribe", async (c) => {
    const userId = c.get("userId") as number;

    // 1. Phase 127 GUARD-03 — per-user daily AI budget gate (BEFORE body parse).
    //    Throws DailyBudgetExceededError → 429 via app.onError (index.ts:277-282).
    await requireAiBudget(userId);

    // 2. Parse JSON body { audio: string }
    let body: { audio?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!body.audio || typeof body.audio !== "string") {
      return c.json(
        { error: "audio is required and must be a base64 string" },
        400,
      );
    }

    // 3. Phase 127 GUARD-02 — 60s cap. Inline catch → 413 with locked code.
    //    Shared app.onError currently only branches DailyBudgetExceededError;
    //    keep AudioSessionTooLongError catch here per PATTERNS.md §6 (Phase 130
    //    productionizes the shared branch).
    try {
      assertAudioSessionWithinCap(body.audio);
    } catch (err) {
      if (err instanceof Error && err.name === "AudioSessionTooLongError") {
        return c.json(
          { error: err.message, code: "AUDIO_SESSION_TOO_LONG" },
          413,
        );
      }
      throw err;
    }

    // 4. Decode → transcribe via OpenAI gpt-4o-mini-transcribe
    let transcription: string;
    try {
      const wav = Buffer.from(body.audio, "base64");
      transcription = await transcribe(wav);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown AI error";
      console.error(
        "[vigil-core] /voice/transcribe OpenAI call failed:",
        msg,
      );
      return c.json({ error: "AI transcription failed" }, 502);
    }
    if (!transcription.trim()) {
      return c.json({ error: "Transcription produced no text" }, 422);
    }

    // 5. Insert thought — source='g2_voice' per CONTEXT D-W2 step 7.
    //    thoughts.source is freeform `text("source").notNull()` per schema.ts:99
    //    — no enum constraint, 'g2_voice' inserts cleanly.
    //    Tests stub db to null → skip insert and synthesize a row so the
    //    Wave 0 smoke can exercise the 201 happy path without a live Postgres.
    let insertedRow: { id: number; content: string };
    if (db) {
      try {
        const rows = await db
          .insert(thoughtsTable)
          .values({
            userId,
            content: transcription.trim(),
            source: "g2_voice",
            cloudKitRecordID: crypto.randomUUID(),
          })
          .returning();
        insertedRow = { id: rows[0].id, content: rows[0].content };
      } catch (err) {
        console.error(
          "[vigil-core] /voice/transcribe DB insert failed:",
          err,
        );
        return c.json({ error: "Failed to save thought" }, 500);
      }
    } else {
      // No DB (test / local-dev shape). Skip persistence + triage; return
      // synthesized row so route contract still holds. Mirrors the
      // `if (!db) return;` no-op shape used by lib/ai-budget.ts:178.
      return c.json(
        { id: 0, content: transcription.trim() },
        201,
      );
    }

    // 6. Fire-and-forget triage — verbatim copy of process-audio.ts:172-194
    //    (only insertedRow reference differs; behavior identical).
    const triageRowId = insertedRow.id;
    (async () => {
      try {
        const raw = await callClaude({
          system: TRIAGE_SYSTEM_PROMPT,
          userMessage: transcription.trim(),
          maxTokens: 100,
          userId,
        });
        const result = parseAIJson<TriageResult>(raw);
        await db!
          .update(thoughtsTable)
          .set({
            category: result.category,
            confidence: result.confidence,
            ...(result.category === "task" ? { taskStatus: "open" } : {}),
            ...(result.tags ? { tags: result.tags } : {}),
            ...(result.therapyClassification
              ? { therapyClassification: result.therapyClassification }
              : {}),
          })
          .where(
            and(
              eq(thoughtsTable.id, triageRowId),
              eq(thoughtsTable.userId, userId),
            ),
          );
      } catch (err) {
        console.error(
          "[vigil-core] /voice/transcribe triage failed (non-fatal):",
          err,
        );
      }
    })();

    // 7. Return created thought (matches process-audio.ts:197-205 shape, minus mediaType).
    return c.json({ id: insertedRow.id, content: insertedRow.content }, 201);
  });

  return router;
}

// Production export — wires the real OpenAI-backed transcribeWav.
// Mounted in index.ts under the bearerAuth + requireVerifiedEmailWithGrace chain.
export const voiceSpike = createVoiceSpikeRoute();
