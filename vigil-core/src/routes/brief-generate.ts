// POST /brief/generate — orchestrate assembly + render, store PDF bytes in brief_pdfs, return PDF binary
// GET /brief/:date — retrieve stored PDF bytes from brief_pdfs by date
// Security: T-76-04 date validation, T-76-05 no stack traces in error responses

import { Hono } from "hono";
import { db as defaultDb } from "../db/connection.js";
import { briefs, briefPdfs } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema.js";
import { createBriefAssemblyService } from "../services/brief-assembly-service.js";
import { getAIClient, callClaude, parseAIJson } from "../ai/client.js";
import { createSportsService } from "../services/sports-service.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface BriefGenerateDeps {
  // null accepted to match the nullable db export from connection.ts
  db?: PostgresJsDatabase<typeof schema> | null;
  assemblerFactory?: () => {
    assembleAndRender: (dateStr: string) => Promise<{
      buffer: Buffer;
      metadata: { thoughtCount: number; taskCount: number; dateStr: string };
    }>;
  };
}

// ── Factory (injected deps for testing) ─────────────────────────────────────

export function createBriefGenerateRouter(deps: BriefGenerateDeps = {}): Hono {
  const router = new Hono();

  function getDb() {
    return deps.db !== undefined ? deps.db : defaultDb;
  }

  function getAssembler() {
    if (deps.assemblerFactory) return deps.assemblerFactory();
    return createBriefAssemblyService({
      dbClient: getDb(),
      sportsService: createSportsService(),
      getAIClientFn: getAIClient,
      callClaudeFn: callClaude,
      parseAIJsonFn: parseAIJson,
    });
  }

  // POST /brief/generate — generate today's brief PDF and store bytes in brief_pdfs (D-03)
  router.post("/brief/generate", async (c) => {
    const db = getDb();
    if (!db) return c.json({ error: "Database not available" }, 503);

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const assembler = getAssembler();
      const { buffer, metadata } = await assembler.assembleAndRender(dateStr);

      // WR-01: Wrap both upserts in a single transaction so either both rows land or
      // neither does. Prevents leaking a `brief_pdf_not_stored` state if the bytes
      // insert fails after the metadata insert succeeds.
      const summaryJson = { generatedAt: new Date().toISOString(), partial: false };
      await db.transaction(async (tx) => {
        const [briefRow] = await tx.insert(briefs).values({
          date: dateStr,
          summary: summaryJson,
          pdfFilename: null,
          thoughtCount: metadata.thoughtCount,
          taskCount: metadata.taskCount,
        }).onConflictDoUpdate({
          target: briefs.date,
          set: {
            summary: summaryJson,
            pdfFilename: null,
            thoughtCount: metadata.thoughtCount,
            taskCount: metadata.taskCount,
            createdAt: sql`now()`,
          },
        }).returning({ id: briefs.id });

        // Upsert brief_pdfs row (bytes). PK is brief_id.
        await tx.insert(briefPdfs).values({
          briefId: briefRow.id,
          bytes: buffer,
          contentType: "application/pdf",
          byteLength: buffer.length,
        }).onConflictDoUpdate({
          target: briefPdfs.briefId,
          set: {
            bytes: buffer,
            contentType: "application/pdf",
            byteLength: buffer.length,
            createdAt: sql`now()`,
          },
        });
      });

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="brief-${dateStr}.pdf"`,
          "X-Brief-Storage-Key": dateStr,
        },
      });
    } catch (err) {
      // T-76-05: generic error, no stack traces
      console.error("[brief-generate] Generation failed:", err);
      return c.json({ error: "Brief generation failed" }, 500);
    }
  });

  // GET /brief/:date — retrieve stored PDF by date key (D-05, D-06, D-08)
  router.get("/brief/:date", async (c) => {
    const db = getDb();
    if (!db) return c.json({ error: "Database not available" }, 503);

    const date = c.req.param("date");

    // T-76-04: validate date format to prevent path traversal
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: "date must be YYYY-MM-DD format" }, 400);
    }

    try {
      // Single query: join briefs → brief_pdfs; left join so we can tell
      // "brief row missing" apart from "brief row exists but no bytes".
      const rows = await db
        .select({
          briefId: briefs.id,
          bytes: briefPdfs.bytes,
          contentType: briefPdfs.contentType,
        })
        .from(briefs)
        .leftJoin(briefPdfs, eq(briefPdfs.briefId, briefs.id))
        .where(eq(briefs.date, date))
        .limit(1);

      if (rows.length === 0) {
        // D-08: genuinely missing — no briefs row at all.
        return c.json({ error: "brief_not_found", date, regenerable: false }, 404);
      }

      const row = rows[0];
      if (!row.bytes) {
        // D-05 / D-06 / D-08: pre-fix brief (briefs row exists, no brief_pdfs row).
        return c.json({ error: "brief_pdf_not_stored", date, regenerable: true }, 404);
      }

      // Success path — bytes come back as Buffer from postgres-js driver.
      const buf = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": row.contentType ?? "application/pdf",
          "Content-Disposition": `inline; filename="brief-${date}.pdf"`,
        },
      });
    } catch (err) {
      console.error("[brief-generate] Retrieval failed:", err);
      return c.json({ error: "Query failed" }, 500);
    }
  });

  return router;
}

// Default export for index.ts registration
export const briefGenerate = createBriefGenerateRouter();
