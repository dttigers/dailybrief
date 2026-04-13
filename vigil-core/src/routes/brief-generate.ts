// POST /brief/generate — orchestrate assembly + render, return PDF binary
// GET /brief/:date — retrieve stored PDF by date key
// Security: T-76-04 date validation, T-76-05 no stack traces in error responses

import { Hono } from "hono";
import { db as defaultDb } from "../db/connection.js";
import { briefs } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { createBriefAssemblyService } from "../services/brief-assembly-service.js";
import * as fs from "node:fs";

// ── Types ───────────────────────────────────────────────────────────────────

export interface BriefGenerateDeps {
  db?: any;
  assemblerFactory?: () => { assembleAndRender: (dateStr: string) => Promise<{
    buffer: Buffer;
    filePath: string;
    metadata: { thoughtCount: number; taskCount: number; dateStr: string };
  }> };
  readFileFn?: (path: string) => Promise<Buffer>;
}

// ── Factory (injected deps for testing) ─────────────────────────────────────

export function createBriefGenerateRouter(deps: BriefGenerateDeps = {}): Hono {
  const router = new Hono();

  function getDb() {
    return deps.db !== undefined ? deps.db : defaultDb;
  }

  function getAssembler() {
    if (deps.assemblerFactory) return deps.assemblerFactory();
    return createBriefAssemblyService();
  }

  async function readFile(filePath: string): Promise<Buffer> {
    if (deps.readFileFn) return deps.readFileFn(filePath);
    return fs.promises.readFile(filePath);
  }

  // POST /brief/generate — generate today's brief PDF (D-08: no request body)
  router.post("/brief/generate", async (c) => {
    const db = getDb();
    if (!db) return c.json({ error: "Database not available" }, 503);

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const assembler = getAssembler();
      const { buffer, filePath, metadata } = await assembler.assembleAndRender(dateStr);

      // Upsert briefs table (D-07)
      const summaryJson = { generatedAt: new Date().toISOString(), partial: false };
      await db.insert(briefs).values({
        date: dateStr,
        summary: summaryJson,
        pdfFilename: filePath,
        thoughtCount: metadata.thoughtCount,
        taskCount: metadata.taskCount,
      }).onConflictDoUpdate({
        target: briefs.date,
        set: {
          summary: summaryJson,
          pdfFilename: filePath,
          thoughtCount: metadata.thoughtCount,
          taskCount: metadata.taskCount,
          createdAt: sql`now()`,
        },
      });

      // Return PDF binary (D-09)
      return new Response(buffer, {
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

  // GET /brief/:date — retrieve stored PDF by date key (D-10)
  router.get("/brief/:date", async (c) => {
    const db = getDb();
    if (!db) return c.json({ error: "Database not available" }, 503);

    const date = c.req.param("date");

    // T-76-04: validate date format to prevent path traversal
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: "date must be YYYY-MM-DD format" }, 400);
    }

    try {
      const rows = await db.select().from(briefs).where(eq(briefs.date, date)).limit(1);

      if (rows.length === 0 || !rows[0].pdfFilename) {
        return c.json({ error: "Brief not found" }, 404);
      }

      try {
        const buffer = await readFile(rows[0].pdfFilename);
        return new Response(buffer, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="brief-${date}.pdf"`,
          },
        });
      } catch {
        return c.json({ error: "Brief PDF not found — regenerate" }, 404);
      }
    } catch (err) {
      console.error("[brief-generate] Retrieval failed:", err);
      return c.json({ error: "Query failed" }, 500);
    }
  });

  return router;
}

// Default export for index.ts registration
export const briefGenerate = createBriefGenerateRouter();
