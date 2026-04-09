import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Hono } from "hono";
import {
  processClaudeResponse,
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

// ────────────────────────────────────────────────────────────────────────────
// Route-level tests (RT-*) — fake Claude + fake DB injected via
// createProcessPhotoRouter(deps). Exercised via Hono's built-in
// router.request(...) test fetcher — no HTTP server needed.
// ────────────────────────────────────────────────────────────────────────────

function mockDrizzleThought(overrides: Partial<DrizzleThought> = {}): DrizzleThought {
  const now = new Date();
  return {
    id: Math.floor(Math.random() * 1_000_000),
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

function makeDeps(overrides: Partial<ProcessPhotoDeps> = {}): ProcessPhotoDeps {
  return {
    callClaudeFn: async () =>
      JSON.stringify({
        paperType: "lined",
        confidence: 0.92,
        thoughts: ["- call mom", "- pay rent", "- email dave"],
      }),
    // Non-null sentinel — tests that need "no client" override this with () => null
    getAIClientFn: (() => ({})) as unknown as ProcessPhotoDeps["getAIClientFn"],
    dbInsertFn: async (rows) =>
      rows.map((r, i) =>
        mockDrizzleThought({
          id: i + 1,
          content: r.content as string,
          source: (r.source as string) ?? "image",
          confidence: (r.confidence as number | null) ?? null,
          cloudKitRecordID: r.cloudKitRecordID as string,
        }),
      ),
    ...overrides,
  };
}

async function post(router: Hono, body: unknown) {
  return router.request("/process-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  image: "aGVsbG8=", // "hello" in base64 — contents don't matter, fake Claude ignores
  mediaType: "image/jpeg",
};

interface ThoughtLite {
  id: number;
  content: string;
  source: string;
  confidence: number | null;
  projectId: number | null;
  cloudKitRecordID: string;
}
interface ProcessPhotoBody {
  paperType: string;
  confidence: number;
  thoughts: ThoughtLite[];
}

test("RT-1: lined happy path returns 201 with 3 thoughts", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 201);
  const json = (await res.json()) as ProcessPhotoBody;
  assert.equal(json.paperType, "lined");
  assert.equal(json.confidence, 0.92);
  assert.equal(json.thoughts.length, 3);
  for (const t of json.thoughts) {
    assert.equal(t.source, "image");
    assert.equal(t.confidence, 0.92);
    assert.equal(t.projectId, null);
  }
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
          confidence: 0.95,
          thoughts: ["Design notes: the router should be lazy-initialized..."],
        }),
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 201);
  const json = (await res.json()) as ProcessPhotoBody;
  assert.equal(json.paperType, "gridded");
  assert.equal(json.confidence, 0.95);
  assert.equal(json.thoughts.length, 1);
  assert.equal(json.thoughts[0].source, "image");
  assert.equal(json.thoughts[0].confidence, 0.95);
  assert.equal(json.thoughts[0].projectId, null);
});

test("RT-3: missing image field returns 400", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, { mediaType: "image/jpeg" });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /image/);
});

test("RT-4: mediaType application/pdf returns 400", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, { image: "aGVsbG8=", mediaType: "application/pdf" });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /Invalid mediaType/);
});

test("RT-5: missing mediaType returns 400", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, { image: "aGVsbG8=" });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /mediaType/);
});

test("RT-6: invalid JSON body returns 400", async () => {
  const router = createProcessPhotoRouter(makeDeps());
  const res = await post(router, "{not json");
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /Invalid JSON/);
});

test("RT-7: 503 when AI client unavailable", async () => {
  const router = createProcessPhotoRouter(
    makeDeps({ getAIClientFn: (() => null) as unknown as ProcessPhotoDeps["getAIClientFn"] }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 503);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /AI service unavailable/);
});

test("RT-8: 502 when Claude throws", async () => {
  const router = createProcessPhotoRouter(
    makeDeps({
      callClaudeFn: async () => {
        throw new Error("anthropic 529");
      },
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 502);
  const json = (await res.json()) as { error: string };
  assert.match(json.error, /anthropic 529/);
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
            confidence: (r.confidence as number | null) ?? null,
          }),
        );
      },
    }),
  );
  const res = await post(router, VALID_BODY);
  assert.equal(res.status, 201);
  const json = (await res.json()) as ProcessPhotoBody;
  assert.equal(json.paperType, "unknown");
  assert.equal(json.confidence, 0);
  assert.equal(json.thoughts.length, 1);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].content, "Here's what I see: a shopping list");
  assert.equal(json.thoughts[0].content, "Here's what I see: a shopping list");
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

test("RT-11: cloudKitRecordID uniqueness — 3 thoughts get 3 distinct UUIDs", async () => {
  let capturedRows: Array<{ cloudKitRecordID: string }> = [];
  const router = createProcessPhotoRouter(
    makeDeps({
      dbInsertFn: async (rows) => {
        capturedRows = rows.map((r) => ({ cloudKitRecordID: r.cloudKitRecordID as string }));
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
  assert.equal(capturedRows.length, 3);
  const ids = new Set(capturedRows.map((r) => r.cloudKitRecordID));
  assert.equal(ids.size, 3, "All 3 cloudKitRecordIDs must be distinct (P-7)");
  // And each must be a non-empty UUID-shaped string
  for (const r of capturedRows) {
    assert.ok(r.cloudKitRecordID.length > 0);
  }
  // Response also surfaces distinct IDs
  const json = (await res.json()) as ProcessPhotoBody;
  const jsonIds = new Set(json.thoughts.map((t) => t.cloudKitRecordID));
  assert.equal(jsonIds.size, 3);
});
