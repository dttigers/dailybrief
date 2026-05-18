// ── Phase 130 Plan 02 (VOICE-05) ─────────────────────────────────────────
// POST /v1/voice/transcribe — G2 voice capture ingest. Accepts a base64 WAV
// payload + clientCaptureId, calls OpenAI gpt-4o-mini-transcribe (wrapped in
// withOpenAIBudgetTracking for per-user daily AI-cost accounting), inserts a
// thoughts row with `source='g2_voice'`, records a voice_captures dedup row,
// emits a `thought-created` bus event (SHIM in this plan; Plan 03 wires the
// listener triple), and fires a non-blocking triage job.
//
// Strict call order (RESEARCH Pitfall 3 — DoS guard):
//   1. requireAiBudget(userId)         — pre-flight throw on cap exceed
//   2. c.req.json()                    — body parse
//   3. assertAudioSessionWithinCap(b64) — cap on base64 string length BEFORE
//                                         Buffer.from (avoids decoding
//                                         oversize payloads into memory)
//   4. SELECT voice_captures (dedup)   — short-circuit BEFORE OpenAI call
//   5. Buffer.from + transcribeWav      — wrapped in withOpenAIBudgetTracking
//   6. INSERT thoughts                  — { source: 'g2_voice' }
//   7. INSERT voice_captures            — { clientCaptureId, thoughtId }
//   8. bus.emitThoughtCreated           — AFTER db commit (Pitfall 6)
//   9. fire-and-forget triage           — non-blocking
//   10. return c.json({...}, 201)
//
// Load-bearing invariants:
//   - userId is sourced from c.get("userId") (bearerAuth dispatcher). NEVER
//     from body. T-130-02-S spoofing mitigation.
//   - Dedup short-circuits BEFORE the OpenAI call — cost guard. T-130-02-T-2.
//   - All voice_captures queries filter eq(voiceCaptures.userId, userId).
//     W-01 cross-user isolation invariant.
//   - bus.emitThoughtCreated is called AFTER both INSERTs complete and OUTSIDE
//     any explicit transaction (Pitfall 6 — fan-out before commit could let
//     the PWA refetch get an empty result).
//
// DI factory shape mirrors captures-screenshot.ts:155-165 — `deps` is
// `Partial<VoiceTranscribeDeps>` so unit tests can swap mocked db, mocked
// transcribeWav, mocked bus, mocked requireAiBudget, and mocked runTriage
// without touching env or module imports.

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "../db/connection.js";
import {
  thoughts as thoughtsTable,
  voiceCaptures,
} from "../db/schema.js";
import {
  requireAiBudget as defaultRequireAiBudget,
  withOpenAIBudgetTracking,
} from "../lib/ai-budget.js";
import { assertAudioSessionWithinCap } from "../lib/audio-cap.js";
import { transcribeWav as defaultTranscribeWav } from "../ai/transcribe.js";
import { bus as defaultBus } from "../lib/agent-events-bus.js";
import { triageThought } from "./triage.js";

// ── DI factory deps ───────────────────────────────────────────────────────

interface VoiceTranscribeBus {
  emitThoughtCreated(
    userId: number,
    payload: { thoughtId: number; content: string },
  ): void;
}

export interface VoiceTranscribeDeps {
  dbAvailable: boolean;
  db: typeof defaultDb;
  requireAiBudgetFn: typeof defaultRequireAiBudget;
  transcribeWavFn: typeof defaultTranscribeWav;
  runTriageFn: (userId: number, thoughtId: number, content: string) => void;
  bus: VoiceTranscribeBus;
}

// Default fire-and-forget triage. Mirrors process-audio.ts:171-194 — runs
// inside an IIFE async block and logs failures non-fatally.
function defaultRunTriage(
  userId: number,
  thoughtId: number,
  content: string,
): void {
  if (!defaultDb) return;
  void (async () => {
    try {
      const result = await triageThought(content, userId);
      await defaultDb!
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
            eq(thoughtsTable.id, thoughtId),
            eq(thoughtsTable.userId, userId),
          ),
        );
    } catch (err) {
      console.error(
        "[vigil-core] /v1/voice/transcribe triage failed (non-fatal):",
        err,
      );
    }
  })();
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createVoiceTranscribeRoute(
  deps: Partial<VoiceTranscribeDeps> = {},
): Hono {
  const router = new Hono();

  const dbRef = deps.db ?? defaultDb;
  const dbAvailable = deps.dbAvailable ?? !!dbRef;
  const requireAiBudgetFn =
    deps.requireAiBudgetFn ?? defaultRequireAiBudget;
  const transcribeWavFn = deps.transcribeWavFn ?? defaultTranscribeWav;
  const runTriageFn = deps.runTriageFn ?? defaultRunTriage;
  const bus = deps.bus ?? defaultBus;

  router.post("/voice/transcribe", async (c) => {
    // T-130-02-S mitigation: userId from middleware, NEVER body.
    const userId = c.get("userId") as number | undefined;
    if (typeof userId !== "number") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!dbAvailable || !dbRef) {
      return c.json({ error: "Database not available" }, 503);
    }

    // 1. Pre-flight AI budget gate (BEFORE body parse — T-130-02-D / Pitfall 3)
    //    Throws DailyBudgetExceededError → app.onError translates to 429.
    await requireAiBudgetFn(userId);

    // 2. Parse JSON body
    let body: { audio?: unknown; clientCaptureId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (typeof body.audio !== "string" || body.audio.length === 0) {
      return c.json(
        { error: "audio and clientCaptureId are required" },
        400,
      );
    }
    if (
      typeof body.clientCaptureId !== "string" ||
      body.clientCaptureId.length === 0
    ) {
      return c.json(
        { error: "audio and clientCaptureId are required" },
        400,
      );
    }
    const audio = body.audio;
    const clientCaptureId = body.clientCaptureId;

    // 3. Cap check on the base64 string length BEFORE decode
    //    Throws AudioSessionTooLongError → app.onError translates to 413.
    assertAudioSessionWithinCap(audio);

    // 4. Dedup SELECT BEFORE OpenAI call — T-130-02-T-2 + cost guard.
    const existing = await dbRef
      .select()
      .from(voiceCaptures)
      .where(
        and(
          eq(voiceCaptures.userId, userId),
          eq(voiceCaptures.clientCaptureId, clientCaptureId),
        ),
      )
      .limit(1);

    if (existing.length > 0 && existing[0]!.thoughtId != null) {
      const thoughtRows = await dbRef
        .select()
        .from(thoughtsTable)
        .where(
          and(
            eq(thoughtsTable.id, existing[0]!.thoughtId!),
            eq(thoughtsTable.userId, userId),
          ),
        )
        .limit(1);
      if (thoughtRows.length > 0) {
        const t = thoughtRows[0]!;
        return c.json(
          {
            thoughtId: t.id,
            content: t.content,
          },
          200,
        );
      }
      // Dedup row references a thought that no longer exists (FK SET NULL
      // edge — should be rare). Fall through to re-transcribe.
    }

    // 5. Decode + transcribe (wrapped in budget tracking).
    //    OpenAI errors (timeout/quota/provider-down) propagate as typed
    //    VoiceTranscribe*Error → app.onError translates to 504/503/502.
    const wav = Buffer.from(audio, "base64");
    // Estimate durationMs at the call site for the budget adapter.
    // (transcribeWav also computes this internally for its return value, but
    // we don't have access to it until after the call resolves — which is too
    // late for the wrapper. We re-compute here to keep the wrapper signature
    // pure. PCM bytes / 32 = ms; subtract 44-byte WAV header.)
    const durationMs = Math.max(0, wav.length - 44) / 32;

    const { text } = await withOpenAIBudgetTracking(
      userId,
      durationMs,
      () => transcribeWavFn(wav),
    );

    // 6. INSERT thoughts row
    const inserted = await dbRef
      .insert(thoughtsTable)
      .values({
        userId,
        content: text,
        source: "g2_voice",
        cloudKitRecordID: crypto.randomUUID(),
      })
      .returning();
    const row = inserted[0]!;

    // 7. INSERT voice_captures dedup row
    await dbRef.insert(voiceCaptures).values({
      userId,
      thoughtId: row.id,
      clientCaptureId,
    });

    // 8. SSE fan-out AFTER db commit (Pitfall 6 — never inside transaction).
    //    Plan 03 wires the listener triple + agent-stream.ts SSE subscriber.
    bus.emitThoughtCreated(userId, {
      thoughtId: row.id,
      content: text,
    });

    // 9. Fire-and-forget triage (non-blocking).
    runTriageFn(userId, row.id, text);

    // 10. Return created thought.
    return c.json(
      {
        thoughtId: row.id,
        content: text,
      },
      201,
    );
  });

  return router;
}

// ── Production singleton ──────────────────────────────────────────────────
// Pre-wired binding for vigil-core/src/index.ts mount.
export const voiceTranscribe = createVoiceTranscribeRoute();
