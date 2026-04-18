import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Hono } from "hono";
import {
  processClaudeResponse,
  splitGriddedBlobToLined,
  createProcessPhotoRouter,
  type ProcessPhotoDeps,
} from "./process-photo.js";
import type { DrizzleThought } from "../db/types.js";

test("PHOTO-01/PHOTO-02: lined paper returns multi-thought split with confidence", () => {
  const raw = JSON.stringify({
    paperType: "lined",
    confidence: 0.92,
    thoughts: ["- call mom", "- pay rent", "- email dave"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "lined");
  assert.equal(result.confidence, 0.92);
  assert.equal(result.thoughts.length, 3);
  assert.deepEqual(result.thoughts, ["- call mom", "- pay rent", "- email dave"]);
});

test("PHOTO-03: gridded paper returns exactly one thought", () => {
  const raw = JSON.stringify({
    paperType: "gridded",
    confidence: 0.88,
    thoughts: ["Long design note about architecture..."],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "gridded");
  assert.equal(result.thoughts.length, 1);
});

test("PHOTO-04: verbatim preserved — strict string equality, no rewrite", () => {
  const raw = JSON.stringify({
    paperType: "lined",
    confidence: 0.9,
    thoughts: ["I need to call mom"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.thoughts[0], "I need to call mom");
});

test("D-04: confidence<0.5 with gridded label is treated as lined (split preserved)", () => {
  const raw = JSON.stringify({
    paperType: "gridded",
    confidence: 0.3,
    thoughts: ["item a", "item b", "item c"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "gridded"); // preserved for UI transparency
  assert.equal(result.confidence, 0.3);
  assert.equal(result.thoughts.length, 3); // but effective behavior = lined split
});

test("D-04: paperType 'unknown' falls back to lined split", () => {
  const raw = JSON.stringify({
    paperType: "unknown",
    confidence: 0.9,
    thoughts: ["a", "b"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.thoughts.length, 2);
});

test("D-04 defensive: high-confidence gridded with >1 thoughts collapses to one", () => {
  const raw = JSON.stringify({
    paperType: "gridded",
    confidence: 0.95,
    thoughts: ["one", "two", "three"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.thoughts.length, 1);
  assert.ok(result.thoughts[0].includes("one"));
  assert.ok(result.thoughts[0].includes("three"));
});

test("D-08: parse failure on preamble prose falls back to single raw thought", () => {
  const raw = "Here is the JSON: a shopping list I guess";
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "unknown");
  assert.equal(result.confidence, 0);
  assert.equal(result.thoughts.length, 1);
  assert.equal(result.thoughts[0], raw.trim());
});

test("D-08: truncated JSON falls back to raw text", () => {
  const raw = '{"paperType":"lined","confidence":0.9,"thoughts":["call mom';
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "unknown");
  assert.equal(result.thoughts.length, 1);
});

test("D-08: empty thoughts array falls back to raw text", () => {
  const raw = JSON.stringify({
    paperType: "lined",
    confidence: 0.9,
    thoughts: [],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.thoughts.length, 1);
});

test("D-08: missing paperType and confidence default safely", () => {
  const raw = JSON.stringify({ thoughts: ["x"] });
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "unknown");
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.thoughts, ["x"]);
});

test("thought strings are trimmed; empty-after-trim entries are dropped", () => {
  const raw = JSON.stringify({
    paperType: "lined",
    confidence: 0.9,
    thoughts: ["  item 1  ", "\n- item 2\n", "   "],
  });
  const result = processClaudeResponse(raw);
  assert.deepEqual(result.thoughts, ["item 1", "- item 2"]);
});

// ── splitGriddedBlobToLined helper tests (Plan 60-01 Task 1) ────────────────
// Heuristic \n\n split per 60-RESEARCH.md Option 2. Degenerate passthrough
// (0 or 1 paragraphs after trim) → return single-entry array so callers never
// see an empty thoughts array.

test("T-60-a: multi-paragraph input splits on \\n\\n", () => {
  const result = splitGriddedBlobToLined("A\n\nB\n\nC");
  assert.deepEqual(result, ["A", "B", "C"]);
});

test("T-60-b: single paragraph (no \\n\\n) returns single-entry array", () => {
  const result = splitGriddedBlobToLined("just one line");
  assert.equal(result.length, 1);
  assert.equal(result[0], "just one line");
});

test("T-60-c: empty string returns single-entry array with empty string", () => {
  const result = splitGriddedBlobToLined("");
  assert.equal(result.length, 1);
  assert.equal(result[0], "");
});

test("T-60-d: whitespace-only paragraphs are filtered", () => {
  const result = splitGriddedBlobToLined("A\n\n   \n\nB");
  assert.deepEqual(result, ["A", "B"]);
});

test("T-60-e: 3+ consecutive newlines also count as separator", () => {
  const result = splitGriddedBlobToLined("A\n\n\n\nB");
  assert.deepEqual(result, ["A", "B"]);
});

test("T-60-f: entries are trimmed", () => {
  const result = splitGriddedBlobToLined("  A  \n\n  B  ");
  assert.deepEqual(result, ["A", "B"]);
});

test("T-60-g: live gridded verification blob splits cleanly", () => {
  const blob =
    "Brick ReBuilder\n\nAI API cost\n\nLet me choose Set Manually/\n\nUI Interface";
  const result = splitGriddedBlobToLined(blob);
  assert.ok(result.length >= 3, `expected >=3 parts, got ${result.length}`);
  assert.equal(result[0], "Brick ReBuilder");
});

// ── Route-level tests (Plan 02 Task 2) ──────────────────────────────────────
// Every RT-* test builds its own router via createProcessPhotoRouter({...fakes})
// and invokes it with Hono's built-in router.request(...) — no HTTP server,
// no real Claude, no real Postgres (P-9).

function mockDrizzleThought(
  overrides: Partial<DrizzleThought> = {},
): DrizzleThought {
  const now = new Date();
  return {
    id: Math.floor(Math.random() * 1_000_000),
    userId: 1, // Phase 102: seed user id — mocked rows
    content: "x",
    category: null,
    confidence: null,
    source: "image",
    createdAt: now,
    modifiedAt: now,
    cloudKitRecordID: crypto.randomUUID(),
    syncStatus: "pending",
    lastSyncedAt: null,
    taskStatus: null,
    therapyClassification: null,
    tags: null,
    isFavorited: false,
    projectId: null,
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<ProcessPhotoDeps> = {},
): ProcessPhotoDeps {
  return {
    callClaudeFn: async () =>
      JSON.stringify({
        paperType: "lined",
        confidence: 0.92,
        thoughts: ["- call mom", "- pay rent", "- email dave"],
      }),
    // Non-null sentinel — the handler only checks truthiness.
    getAIClientFn: () => ({}) as unknown as ReturnType<ProcessPhotoDeps["getAIClientFn"]>,
    dbInsertFn: async (rows) =>
      rows.map((r, i) =>
        mockDrizzleThought({
          id: i + 1,
          content: r.content as string,
          source: r.source as string,
          confidence: (r.confidence ?? null) as number | null,
          cloudKitRecordID: r.cloudKitRecordID as string,
        }),
      ),
    ...overrides,
  };
}

async function post(router: Hono, body: unknown): Promise<Response> {
  return router.request("/process-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  image: "aGVsbG8=", // "hello" in base64 — fake Claude ignores content
  mediaType: "image/jpeg",
};

interface ProcessPhotoResponseShape {
  paperType: string;
  confidence: number;
  thoughts: Array<{
    id: number;
    content: string;
    source: string;
    confidence: number | null;
    projectId: number | null;
    cloudKitRecordID: string;
  }>;
}

test("RT-1: lined happy path returns 201 with 3 thoughts (image source, distinct UUIDs)", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 201);
  const json = (await res.json()) as ProcessPhotoResponseShape;
  assert.equal(json.paperType, "lined");
  assert.equal(json.confidence, 0.92);
  assert.equal(json.thoughts.length, 3);
  for (const t of json.thoughts) {
    assert.equal(t.source, "image");
    assert.equal(t.confidence, 0.92);
    assert.equal(t.projectId, null);
  }
  // P-7: distinct cloudKitRecordIDs
  const ids = new Set(json.thoughts.map((t) => t.cloudKitRecordID));
  assert.equal(ids.size, 3);
  // Content preserved verbatim from fake Claude
  assert.deepEqual(
    json.thoughts.map((t) => t.content),
    ["- call mom", "- pay rent", "- email dave"],
  );
});

test("RT-2: gridded happy path returns 201 with exactly 1 thought", async () => {
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () =>
        JSON.stringify({
          paperType: "gridded",
          confidence: 0.88,
          thoughts: ["Long design note about the auth flow"],
        }),
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 201);
  const json = (await res.json()) as ProcessPhotoResponseShape;
  assert.equal(json.paperType, "gridded");
  assert.equal(json.confidence, 0.88);
  assert.equal(json.thoughts.length, 1);
  assert.equal(json.thoughts[0].source, "image");
  assert.equal(json.thoughts[0].confidence, 0.88);
  assert.equal(json.thoughts[0].projectId, null);
});

test("RT-3: missing image field returns 400", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, { mediaType: "image/jpeg" });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /image/);
});

test("RT-4: invalid mediaType (application/pdf) returns 400", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, {
    image: "aGVsbG8=",
    mediaType: "application/pdf",
  });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /mediaType/);
});

test("RT-5: missing mediaType returns 400", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, { image: "aGVsbG8=" });
  assert.equal(res.status, 400);
});

test("RT-6: malformed JSON body returns 400", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, "not-json{{{");
  assert.equal(res.status, 400);
});

test("RT-7: 503 when AI client unavailable", async () => {
  const router = createProcessPhotoRouter(
    makeDeps({
      getAIClientFn: () =>
        null as unknown as ReturnType<ProcessPhotoDeps["getAIClientFn"]>,
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 503);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /AI service unavailable/);
});

test("RT-8: 502 when Claude throws returns GENERIC body (WR-01 fix)", async () => {
  // 60-01 T-60-04 / Phase 59 REVIEW WR-01: raw SDK error text must NOT leak
  // to the client. Server-side log still captures detail; response body is
  // a generic "AI processing failed".
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () => {
        throw new Error("anthropic 529 request_id=abc-internal-url");
      },
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 502);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /AI processing failed/);
  // And the raw SDK text must not appear in the response body.
  assert.ok(
    !json.error.includes("anthropic 529"),
    "raw SDK error text leaked to client",
  );
});

test("RT-9: D-08 parse failure creates ONE thought with raw text content", async () => {
  let insertedRows: Array<{ content: string }> = [];
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () => "Here's what I see: a shopping list",
      dbInsertFn: async (rows) => {
        insertedRows = rows.map((r) => ({ content: r.content as string }));
        return rows.map((r, i) =>
          mockDrizzleThought({
            id: i + 1,
            content: r.content as string,
          }),
        );
      },
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 201);
  const json = (await res.json()) as ProcessPhotoResponseShape;
  assert.equal(json.paperType, "unknown");
  assert.equal(json.confidence, 0);
  assert.equal(json.thoughts.length, 1);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].content, "Here's what I see: a shopping list");
});

test("RT-10: 500 when DB insert throws", async () => {
  const router = createProcessPhotoRouter(
    makeDeps({
      dbInsertFn: async () => {
        throw new Error("pg down");
      },
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 500);
  const json = (await res.json()) as { error: string };
  assert.equal(json.error, "Create failed");
});

test("RT-11: cloudKitRecordID uniqueness — lined path produces N distinct UUIDs", async () => {
  // Seed a 5-thought lined response and assert every inserted row has its own UUID (P-7).
  let capturedUuids: string[] = [];
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () =>
        JSON.stringify({
          paperType: "lined",
          confidence: 0.9,
          thoughts: ["a", "b", "c", "d", "e"],
        }),
      dbInsertFn: async (rows) => {
        capturedUuids = rows.map((r) => r.cloudKitRecordID as string);
        return rows.map((r, i) =>
          mockDrizzleThought({
            id: i + 1,
            content: r.content as string,
            cloudKitRecordID: r.cloudKitRecordID as string,
          }),
        );
      },
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 201);
  assert.equal(capturedUuids.length, 5);
  const unique = new Set(capturedUuids);
  assert.equal(unique.size, 5, "every row must have a distinct cloudKitRecordID");
  // And they're actually UUID-shaped (P-7: via crypto.randomUUID)
  for (const id of capturedUuids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  }
});

// ── Plan 60-01 route tests (preview mode, forcePaperType, 413 guard) ────────

interface PreviewResponseShape {
  paperType: string;
  confidence: number;
  thoughts: Array<{
    id: number | null;
    content: string;
    source: string;
    confidence: number | null;
    projectId: number | null;
  }>;
}

test("RT-12: preview=true returns 200 + unsaved shapes and does NOT call dbInsertFn", async () => {
  let dbCalled = false;
  const router = createProcessPhotoRouter(
    makeDeps({
      dbInsertFn: async (rows) => {
        dbCalled = true;
        return rows.map((r, i) =>
          mockDrizzleThought({
            id: i + 1,
            content: r.content as string,
          }),
        );
      },
    }),
  );
  const res = await router.request("/process-photo?preview=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as PreviewResponseShape;
  assert.equal(json.paperType, "lined");
  assert.equal(json.confidence, 0.92);
  assert.equal(json.thoughts.length, 3);
  for (const t of json.thoughts) {
    assert.equal(t.id, null);
    assert.equal(t.source, "image");
    assert.equal(t.confidence, 0.92);
    assert.equal(t.projectId, null);
  }
  assert.equal(dbCalled, false, "dbInsertFn must not be called in preview mode");
});

test("RT-13: preview=true on gridded response → 200, 1 thought, no DB insert", async () => {
  let dbCalled = false;
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () =>
        JSON.stringify({
          paperType: "gridded",
          confidence: 0.88,
          thoughts: ["Long design note about the auth flow"],
        }),
      dbInsertFn: async (rows) => {
        dbCalled = true;
        return rows.map((r, i) =>
          mockDrizzleThought({ id: i + 1, content: r.content as string }),
        );
      },
    }),
  );
  const res = await router.request("/process-photo?preview=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as PreviewResponseShape;
  assert.equal(json.paperType, "gridded");
  assert.equal(json.thoughts.length, 1);
  assert.equal(dbCalled, false);
});

test("RT-14: preview=yes is NOT preview mode — strict equality only", async () => {
  let dbCalled = false;
  const router = createProcessPhotoRouter(
    makeDeps({
      dbInsertFn: async (rows) => {
        dbCalled = true;
        return rows.map((r, i) =>
          mockDrizzleThought({ id: i + 1, content: r.content as string }),
        );
      },
    }),
  );
  const res = await router.request("/process-photo?preview=yes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });
  assert.equal(res.status, 201, "non-'true' preview value must fall through to commit mode");
  assert.equal(dbCalled, true);
});

test("RT-15: forcePaperType=gridded on lined response collapses to 1 inserted row", async () => {
  let insertedRows: Array<{ content: string }> = [];
  const router = createProcessPhotoRouter(
    makeDeps({
      dbInsertFn: async (rows) => {
        insertedRows = rows.map((r) => ({ content: r.content as string }));
        return rows.map((r, i) =>
          mockDrizzleThought({ id: i + 1, content: r.content as string }),
        );
      },
    }),
  );
  const res = await post(router, { ...VALID_BODY, forcePaperType: "gridded" });
  assert.equal(res.status, 201);
  assert.equal(insertedRows.length, 1);
  assert.equal(
    insertedRows[0].content,
    "- call mom\n\n- pay rent\n\n- email dave",
  );
  const json = (await res.json()) as ProcessPhotoResponseShape;
  assert.equal(json.paperType, "gridded");
  assert.equal(json.thoughts.length, 1);
});

test("RT-16: forcePaperType=lined on gridded blob splits into N rows via helper", async () => {
  let insertedRows: Array<{ content: string }> = [];
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () =>
        JSON.stringify({
          paperType: "gridded",
          confidence: 0.9,
          thoughts: ["line1\n\nline2\n\nline3"],
        }),
      dbInsertFn: async (rows) => {
        insertedRows = rows.map((r) => ({ content: r.content as string }));
        return rows.map((r, i) =>
          mockDrizzleThought({ id: i + 1, content: r.content as string }),
        );
      },
    }),
  );
  const res = await post(router, { ...VALID_BODY, forcePaperType: "lined" });
  assert.equal(res.status, 201);
  assert.equal(insertedRows.length, 3);
  assert.deepEqual(
    insertedRows.map((r) => r.content),
    ["line1", "line2", "line3"],
  );
  const json = (await res.json()) as ProcessPhotoResponseShape;
  assert.equal(json.paperType, "lined");
});

test("RT-17: forcePaperType=lined on degenerate gridded blob (no \\n\\n) → 1 row passthrough", async () => {
  let insertedRows: Array<{ content: string }> = [];
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () =>
        JSON.stringify({
          paperType: "gridded",
          confidence: 0.9,
          thoughts: ["single paragraph"],
        }),
      dbInsertFn: async (rows) => {
        insertedRows = rows.map((r) => ({ content: r.content as string }));
        return rows.map((r, i) =>
          mockDrizzleThought({ id: i + 1, content: r.content as string }),
        );
      },
    }),
  );
  const res = await post(router, { ...VALID_BODY, forcePaperType: "lined" });
  assert.equal(res.status, 201);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].content, "single paragraph");
  const json = (await res.json()) as ProcessPhotoResponseShape;
  assert.equal(json.paperType, "lined");
});

test("RT-18: forcePaperType=banana returns 400 validation error", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, { ...VALID_BODY, forcePaperType: "banana" });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /forcePaperType/);
});

test("RT-19: preview=true + forcePaperType=gridded applies transform without DB insert", async () => {
  let dbCalled = false;
  const router = createProcessPhotoRouter(
    makeDeps({
      dbInsertFn: async (rows) => {
        dbCalled = true;
        return rows.map((r, i) =>
          mockDrizzleThought({ id: i + 1, content: r.content as string }),
        );
      },
    }),
  );
  const res = await router.request("/process-photo?preview=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_BODY, forcePaperType: "gridded" }),
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as PreviewResponseShape;
  assert.equal(json.paperType, "gridded");
  assert.equal(json.thoughts.length, 1);
  assert.equal(
    json.thoughts[0].content,
    "- call mom\n\n- pay rent\n\n- email dave",
  );
  assert.equal(dbCalled, false);
});

test("RT-20: oversized image (>7 MB base64) returns 413 before Claude call", async () => {
  let claudeCalled = false;
  let dbCalled = false;
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () => {
        claudeCalled = true;
        return JSON.stringify({
          paperType: "lined",
          confidence: 0.9,
          thoughts: ["should never reach here"],
        });
      },
      dbInsertFn: async (rows) => {
        dbCalled = true;
        return rows.map((r, i) =>
          mockDrizzleThought({ id: i + 1, content: r.content as string }),
        );
      },
    }),
  );
  const huge = "A".repeat(Math.ceil((5 * 1024 * 1024) * 4 / 3) + 1);
  const res = await post(router, { image: huge, mediaType: "image/jpeg" });
  assert.equal(res.status, 413);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /image exceeds maximum size/);
  assert.equal(claudeCalled, false, "Claude must not be called on oversized payload");
  assert.equal(dbCalled, false);
});
