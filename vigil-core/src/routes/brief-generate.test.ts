import { test } from "node:test";
import assert from "node:assert/strict";
import { createBriefGenerateRouter } from "./brief-generate.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePdfBuffer(): Buffer {
  return Buffer.from("%PDF-1.4 fake pdf content");
}

function makeSuccessResult() {
  return {
    buffer: makePdfBuffer(),
    metadata: { thoughtCount: 5, taskCount: 3, dateStr: "2026-04-13" },
  };
}

/** Mock DB that captures both briefs and brief_pdfs insert calls, and supports configurable select results */
function makeMockDb(opts: {
  selectRows?: any[];
  captureInserts?: { briefs?: any; briefPdfs?: any };
} = {}) {
  const captures = opts.captureInserts ?? {};
  let insertTarget: "briefs" | "briefPdfs" | null = null;
  const db: any = {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve(opts.selectRows ?? []),
          }),
        }),
        where: () => ({
          limit: () => Promise.resolve(opts.selectRows ?? []),
        }),
      }),
    }),
    insert: (table: any) => {
      // Identify table by the exported symbol — best-effort for mock purposes.
      const tableName = table?.[Symbol.for("drizzle:Name")] ?? "";
      insertTarget = tableName === "brief_pdfs" ? "briefPdfs" : "briefs";
      return {
        values: (vals: any) => {
          if (insertTarget === "briefs") captures.briefs = vals;
          if (insertTarget === "briefPdfs") captures.briefPdfs = vals;
          return {
            onConflictDoUpdate: () => ({
              returning: () => Promise.resolve(insertTarget === "briefs" ? [{ id: 1 }] : [{ briefId: 1 }]),
            }),
          };
        },
      };
    },
    // WR-01: route now wraps the two upserts in db.transaction(fn). The mock
    // simply invokes fn with itself as tx so insert capture still works.
    transaction: async (fn: (tx: any) => Promise<any>) => fn(db),
  };
  return db as PostgresJsDatabase<typeof schema>;
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("Test 1: POST /brief/generate returns 200 with PDF and X-Brief-Storage-Key header", async () => {
  const app = createBriefGenerateRouter({
    db: makeMockDb(),
    assemblerFactory: () => ({
      assembleAndRender: async () => makeSuccessResult(),
    }),
  });

  const res = await app.request("/brief/generate", { method: "POST" });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.ok(res.headers.get("x-brief-storage-key"), "should have X-Brief-Storage-Key header");
  assert.match(res.headers.get("x-brief-storage-key")!, /^\d{4}-\d{2}-\d{2}$/);

  const body = await res.arrayBuffer();
  assert.ok(body.byteLength > 0, "response body should contain PDF bytes");
});

test("Test 2: POST /brief/generate upserts briefs table with metadata and brief_pdfs with bytes", async () => {
  const captures: { briefs?: any; briefPdfs?: any } = {};
  const app = createBriefGenerateRouter({
    db: makeMockDb({ captureInserts: captures }),
    assemblerFactory: () => ({
      assembleAndRender: async () => makeSuccessResult(),
    }),
  });

  const res = await app.request("/brief/generate", { method: "POST" });

  assert.equal(res.status, 200);
  assert.ok(captures.briefs, "briefs should have been upserted");
  assert.equal(captures.briefs.pdfFilename, null);
  assert.equal(captures.briefs.thoughtCount, 5);
  assert.equal(captures.briefs.taskCount, 3);
  assert.ok(captures.briefPdfs, "brief_pdfs should have been upserted");
  assert.ok(Buffer.isBuffer(captures.briefPdfs.bytes));
  assert.equal(captures.briefPdfs.contentType, "application/pdf");
  assert.equal(captures.briefPdfs.byteLength, captures.briefPdfs.bytes.length);
});

test("Test 3: POST /brief/generate returns 503 when db is null", async () => {
  const app = createBriefGenerateRouter({
    db: null,
  });

  const res = await app.request("/brief/generate", { method: "POST" });

  assert.equal(res.status, 503);
  const json = await res.json() as { error: string };
  assert.equal(json.error, "Database not available");
});

test("Test 4: POST /brief/generate returns 500 when assembleAndRender throws", async () => {
  const app = createBriefGenerateRouter({
    db: makeMockDb(),
    assemblerFactory: () => ({
      assembleAndRender: async () => { throw new Error("Render exploded"); },
    }),
  });

  const res = await app.request("/brief/generate", { method: "POST" });

  assert.equal(res.status, 500);
  const json = await res.json() as { error: string };
  assert.equal(json.error, "Brief generation failed");
});

test("Test 5: GET /brief/:date returns 200 + PDF bytes when brief_pdfs row exists", async () => {
  const pdfBytes = Buffer.from("%PDF-1.4 stored bytes");
  const app = createBriefGenerateRouter({
    db: makeMockDb({
      selectRows: [{ briefId: 1, bytes: pdfBytes, contentType: "application/pdf" }],
    }),
  });
  const res = await app.request("/brief/2026-04-13");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const body = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(body, pdfBytes);
});

test("Test 6: GET /brief/:date returns 404 brief_pdf_not_stored when briefs row has no matching brief_pdfs row", async () => {
  const app = createBriefGenerateRouter({
    db: makeMockDb({
      selectRows: [{ briefId: 1, bytes: null, contentType: null }],
    }),
  });
  const res = await app.request("/brief/2026-04-13");
  assert.equal(res.status, 404);
  const body = await res.json() as { error: string; date: string; regenerable: boolean };
  assert.equal(body.error, "brief_pdf_not_stored");
  assert.equal(body.date, "2026-04-13");
  assert.equal(body.regenerable, true);
});

test("Test 7: GET /brief/:date returns 404 brief_not_found when no briefs row exists", async () => {
  const app = createBriefGenerateRouter({
    db: makeMockDb({ selectRows: [] }),
  });
  const res = await app.request("/brief/2026-04-13");
  assert.equal(res.status, 404);
  const body = await res.json() as { error: string; date: string; regenerable: boolean };
  assert.equal(body.error, "brief_not_found");
  assert.equal(body.date, "2026-04-13");
  assert.equal(body.regenerable, false);
});

test("Test 8: GET /brief/:date returns 400 for malformed date", async () => {
  const app = createBriefGenerateRouter({ db: makeMockDb() });
  const res = await app.request("/brief/not-a-date");
  assert.equal(res.status, 400);
  const json = await res.json() as { error: string };
  assert.equal(json.error, "date must be YYYY-MM-DD format");
});

test("Test 9: GET /brief/:date returns 503 when db is null", async () => {
  const app = createBriefGenerateRouter({
    db: null,
  });

  const res = await app.request("/brief/2026-04-12");

  assert.equal(res.status, 503);
  const json = await res.json() as { error: string };
  assert.equal(json.error, "Database not available");
});
