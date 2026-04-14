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
    filePath: "/tmp/briefs/brief-2026-04-13.pdf",
    metadata: { thoughtCount: 5, taskCount: 3, dateStr: "2026-04-13" },
  };
}

/** Mock DB that captures insert calls and returns configurable select results */
function makeMockDb(opts: {
  selectRows?: any[];
  captureInsert?: { called: boolean; values: any };
} = {}) {
  const capture = opts.captureInsert ?? { called: false, values: null };
  // Cast to the Drizzle type — the mock only implements the subset used by the router.
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(opts.selectRows ?? []),
        }),
      }),
    }),
    insert: () => ({
      values: (vals: any) => {
        capture.called = true;
        capture.values = vals;
        return {
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve([{ id: 1 }]),
          }),
        };
      },
    }),
  } as unknown as PostgresJsDatabase<typeof schema>;
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

test("Test 2: POST /brief/generate upserts briefs table with metadata", async () => {
  const capture = { called: false, values: null as any };
  const app = createBriefGenerateRouter({
    db: makeMockDb({ captureInsert: capture }),
    assemblerFactory: () => ({
      assembleAndRender: async () => makeSuccessResult(),
    }),
  });

  const res = await app.request("/brief/generate", { method: "POST" });

  assert.equal(res.status, 200);
  assert.ok(capture.called, "insert should have been called on briefs table");
  assert.ok(capture.values, "should have captured inserted values");
  assert.equal(capture.values.pdfFilename, "/tmp/briefs/brief-2026-04-13.pdf");
  assert.equal(capture.values.thoughtCount, 5);
  assert.equal(capture.values.taskCount, 3);
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

test("Test 5: GET /brief/2026-04-12 returns 200 with PDF when row exists and file readable", async () => {
  const app = createBriefGenerateRouter({
    db: makeMockDb({
      selectRows: [{ pdfFilename: "/tmp/briefs/brief-2026-04-12.pdf" }],
    }),
    readFileFn: async () => makePdfBuffer(),
  });

  const res = await app.request("/brief/2026-04-12");

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const body = await res.arrayBuffer();
  assert.ok(body.byteLength > 0, "should return PDF bytes");
});

test("Test 6: GET /brief/2026-04-12 returns 404 when no briefs row exists", async () => {
  const app = createBriefGenerateRouter({
    db: makeMockDb({ selectRows: [] }),
  });

  const res = await app.request("/brief/2026-04-12");

  assert.equal(res.status, 404);
  const json = await res.json() as { error: string };
  assert.equal(json.error, "Brief not found");
});

test("Test 7: GET /brief/2026-04-12 returns 404 when row exists but file is gone", async () => {
  const app = createBriefGenerateRouter({
    db: makeMockDb({
      selectRows: [{ pdfFilename: "/tmp/briefs/brief-2026-04-12.pdf" }],
    }),
    readFileFn: async () => { throw new Error("ENOENT: no such file"); },
  });

  const res = await app.request("/brief/2026-04-12");

  assert.equal(res.status, 404);
  const json = await res.json() as { error: string };
  assert.match(json.error, /regenerate/i);
});

test("Test 8: GET /brief/not-a-date returns 400 with format error", async () => {
  const app = createBriefGenerateRouter({
    db: makeMockDb(),
  });

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
