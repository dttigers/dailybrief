// ── Phase 129.1 Plan 03 (SCAP-01 + SCAP-02) ────────────────────────────────
// Unit + integration tests for POST /v1/captures/screenshot. Uses node:test
// runner (vigil-core convention; matches brief-generate.test.ts). Mock-db
// captures fluent chain calls (select/from/where/limit, insert/values/
// onConflictDoUpdate/returning) for assertion on payload shape. Mock-Anthropic
// is a closure-captured fn injected via the createCapturesScreenshotRoute
// DI factory.

// Set JWT_SECRET BEFORE importing — utils/jwt.ts exits at import time without
// it (per index.ts:73-76 and the work-orders.test.ts pattern at line 5).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Lazy import after env is set (safety net for transitive jwt imports).
const { createCapturesScreenshotRoute, MAX_IMAGE_BASE64_LENGTH } = await import(
  "./captures-screenshot.js"
);

// ── Fixtures ───────────────────────────────────────────────────────────────

const VALID_UUID = "8e4f7c2d-9a3b-4c1e-8f6a-2b5d7e9f1c3a"; // UUID v4 shape
const VALID_UUID_2 = "9f5e8d3c-1a2b-4c5d-9e7f-3a8b1c4d5e6f";
const VALID_BASE64_PNG = Buffer.from("fake-png-bytes").toString("base64");

function makeExtractedJSON(overrides: {
  case_number?: string;
  short_description?: string;
  location?: string;
  department?: string;
  maintenance_problem?: string;
  extras?: Record<string, string>;
} = {}): string {
  return JSON.stringify({
    required: {
      case_number: overrides.case_number ?? "CS0363817",
      short_description: overrides.short_description ?? "Leaky faucet in bakery sink",
      location: overrides.location ?? "Bakery",
      department: overrides.department ?? "Bakery",
      maintenance_problem: overrides.maintenance_problem ?? "Plumbing",
    },
    extras: overrides.extras ?? {
      service: "MT-Trades",
      assignment_group: "MT-Maintenance",
      priority: "Medium",
      trade: "Plumber",
    },
  });
}

// ── Mock builders ──────────────────────────────────────────────────────────

interface MockCaptures {
  selectArgs: Array<{
    table?: unknown;
    whereCalled?: boolean;
    limitCalled?: boolean;
  }>;
  insertValues: Record<string, unknown> | null;
  conflictTarget: unknown;
  conflictSet: Record<string, unknown> | null;
  multimodalCalls: Array<{
    content: unknown;
    maxTokens: number;
    userId: number;
  }>;
  getAIClientCalls: number;
}

interface MockDbOpts {
  selectRows?: Array<Record<string, unknown>>;
}

function makeMockDb(opts: MockDbOpts, captures: MockCaptures): unknown {
  const db = {
    select: () => ({
      from: (_table: unknown) => {
        captures.selectArgs.push({ table: _table });
        return {
          where: (_whereExpr: unknown) => {
            const last = captures.selectArgs[captures.selectArgs.length - 1]!;
            last.whereCalled = true;
            return {
              limit: (_n: number) => {
                last.limitCalled = true;
                return Promise.resolve(opts.selectRows ?? []);
              },
            };
          },
        };
      },
    }),
    insert: (_table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        captures.insertValues = vals;
        return {
          onConflictDoUpdate: (cfg: {
            target: unknown;
            set: Record<string, unknown>;
          }) => {
            captures.conflictTarget = cfg.target;
            captures.conflictSet = cfg.set;
            return {
              returning: () =>
                Promise.resolve([{ caseNumber: String(vals.caseNumber) }]),
            };
          },
        };
      },
    }),
  };
  return db;
}

function makeCaptures(): MockCaptures {
  return {
    selectArgs: [],
    insertValues: null,
    conflictTarget: null,
    conflictSet: null,
    multimodalCalls: [],
    getAIClientCalls: 0,
  };
}

// Build a Hono app that injects userId via middleware (mirrors bearerAuth
// dispatcher in production) before routing to the factory router.
function makeApp(
  deps: Parameters<typeof createCapturesScreenshotRoute>[0],
  userId: number = 1,
): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/v1", createCapturesScreenshotRoute(deps));
  return app;
}

async function postScreenshot(app: Hono, body: unknown): Promise<Response> {
  return app.request("/v1/captures/screenshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ── Tests (10 cases per plan Task 3) ───────────────────────────────────────

test("SCAP-01/T1 (happy path): valid request → 200 with workOrderId + duplicate=false + extractedFields + INSERT pending_review", async () => {
  const captures = makeCaptures();
  const fakeClient = {} as never;

  const app = makeApp({
    db: makeMockDb({ selectRows: [] }, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => {
      captures.getAIClientCalls++;
      return fakeClient;
    },
    callClaudeMultimodalFn: async (opts) => {
      captures.multimodalCalls.push({
        content: opts.content,
        maxTokens: opts.maxTokens,
        userId: opts.userId,
      });
      return makeExtractedJSON();
    },
  });

  const res = await postScreenshot(app, {
    imageBase64: VALID_BASE64_PNG,
    mediaType: "image/png",
    clientCaptureId: VALID_UUID,
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    workOrderId: string;
    duplicate: boolean;
    extractedFields: { case_number: string; department: string; maintenance_problem: string };
    extraExtractedFields: Record<string, string>;
  };
  assert.equal(body.duplicate, false); // expects { duplicate: false } in response
  assert.equal(body.workOrderId, "CS0363817");
  assert.equal(body.extractedFields.case_number, "CS0363817");
  assert.equal(body.extractedFields.department, "Bakery");
  assert.equal(body.extractedFields.maintenance_problem, "Plumbing");
  assert.equal(body.extraExtractedFields.service, "MT-Trades");

  // Mock assertions: INSERT VALUES carried the right shape.
  assert.ok(captures.insertValues, "INSERT VALUES were captured");
  assert.equal(captures.insertValues!.state, "pending_review");
  assert.equal(captures.insertValues!.maintenanceProblem, "Plumbing");
  assert.equal(captures.insertValues!.department, "Bakery");
  assert.equal(captures.insertValues!.caseNumber, "CS0363817");
  assert.equal(captures.insertValues!.userId, 1, "userId must come from middleware, not body");
  assert.equal(captures.insertValues!.clientCaptureId, VALID_UUID);

  // Anthropic was invoked exactly once with userId + maxTokens.
  assert.equal(captures.multimodalCalls.length, 1, "Anthropic called exactly once");
  assert.equal(captures.multimodalCalls[0]!.userId, 1);
  assert.equal(captures.multimodalCalls[0]!.maxTokens, 1500);
});

test("SCAP-01/T2 (invalid mediaType): mediaType=image/gif → 400; Anthropic NOT called", async () => {
  const captures = makeCaptures();
  const app = makeApp({
    db: makeMockDb({}, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => ({}) as never,
    callClaudeMultimodalFn: async () => {
      throw new Error("should not be called");
    },
  });

  const res = await postScreenshot(app, {
    imageBase64: VALID_BASE64_PNG,
    mediaType: "image/gif",
    clientCaptureId: VALID_UUID,
  });

  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /mediaType/);
  assert.equal(captures.multimodalCalls.length, 0, "Anthropic NOT called");
  assert.equal(captures.insertValues, null, "DB INSERT NOT called");
});

test("SCAP-01/T3 (invalid clientCaptureId — not UUID v4): clientCaptureId=\"not-a-uuid\" → 400; Anthropic NOT called", async () => {
  const captures = makeCaptures();
  const app = makeApp({
    db: makeMockDb({}, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => ({}) as never,
    callClaudeMultimodalFn: async () => {
      throw new Error("should not be called");
    },
  });

  const res = await postScreenshot(app, {
    imageBase64: VALID_BASE64_PNG,
    mediaType: "image/png",
    clientCaptureId: "not-a-uuid",
  });

  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /clientCaptureId/);
  assert.equal(captures.multimodalCalls.length, 0, "Anthropic NOT called");
});

test("SCAP-01/T4 (missing imageBase64): body without imageBase64 → 400", async () => {
  const captures = makeCaptures();
  const app = makeApp({
    db: makeMockDb({}, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => ({}) as never,
    callClaudeMultimodalFn: async () => {
      throw new Error("should not be called");
    },
  });

  const res = await postScreenshot(app, {
    mediaType: "image/png",
    clientCaptureId: VALID_UUID,
  });

  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /imageBase64/);
  assert.equal(captures.multimodalCalls.length, 0);
});

test("SCAP-01/T5 (no AI client): getAIClientFn returns null → 503; Anthropic NOT called", async () => {
  const captures = makeCaptures();
  const app = makeApp({
    db: makeMockDb({}, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => null,
    callClaudeMultimodalFn: async () => {
      throw new Error("should not be called");
    },
  });

  const res = await postScreenshot(app, {
    imageBase64: VALID_BASE64_PNG,
    mediaType: "image/png",
    clientCaptureId: VALID_UUID,
  });

  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /AI service unavailable/);
  assert.equal(captures.multimodalCalls.length, 0);
});

test("SCAP-01/T6 (Anthropic error): callClaudeMultimodalFn throws → 502 with thrown message; INSERT NOT called", async () => {
  const captures = makeCaptures();
  const app = makeApp({
    db: makeMockDb({ selectRows: [] }, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => ({}) as never,
    callClaudeMultimodalFn: async (opts) => {
      captures.multimodalCalls.push({
        content: opts.content,
        maxTokens: opts.maxTokens,
        userId: opts.userId,
      });
      throw new Error("anthropic timeout");
    },
  });

  const res = await postScreenshot(app, {
    imageBase64: VALID_BASE64_PNG,
    mediaType: "image/png",
    clientCaptureId: VALID_UUID,
  });

  assert.equal(res.status, 502);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /anthropic timeout/);
  assert.equal(captures.multimodalCalls.length, 1, "Anthropic was invoked once");
  assert.equal(captures.insertValues, null, "DB INSERT NOT called after AI error");
});

test("SCAP-02/T7 (dedup short-circuit): existing (userId, clientCaptureId) row → 200 duplicate=true; Anthropic NOT called", async () => {
  const captures = makeCaptures();
  const existingRow = {
    caseNumber: "CS0111111",
    userId: 1,
    clientCaptureId: VALID_UUID,
    shortDescription: "existing description",
    location: "Front End",
    department: "Front End",
    maintenanceProblem: "Electrical",
    notes: JSON.stringify({ priority: "High", trade: "Electrician" }),
    state: "pending_review",
  };

  const app = makeApp({
    db: makeMockDb({ selectRows: [existingRow] }, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => ({}) as never,
    callClaudeMultimodalFn: async () => {
      throw new Error("should not be called on dedup hit");
    },
  });

  const res = await postScreenshot(app, {
    imageBase64: VALID_BASE64_PNG,
    mediaType: "image/png",
    clientCaptureId: VALID_UUID,
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    workOrderId: string;
    duplicate: boolean;
    extractedFields: { case_number: string; department: string };
    extraExtractedFields: Record<string, string>;
  };
  assert.equal(body.duplicate, true); // expects { duplicate: true } in response
  assert.equal(body.workOrderId, "CS0111111");
  assert.equal(body.extractedFields.case_number, "CS0111111");
  assert.equal(body.extractedFields.department, "Front End");
  // notes JSON parsed and surfaced
  assert.equal(body.extraExtractedFields.priority, "High");

  assert.equal(captures.multimodalCalls.length, 0, "Anthropic NOT called on dedup hit");
  assert.equal(captures.insertValues, null, "INSERT NOT called on dedup hit");
  assert.equal(captures.selectArgs.length, 1, "SELECT was the only DB call");
});

test("SCAP-02/T8 (case_number PK collision → onConflictDoUpdate): second POST with different clientCaptureId but same case_number → SET captured with updated fields", async () => {
  // Mock: SELECT returns no row (different clientCaptureId), Anthropic returns
  // case_number CS0000001 — same as a hypothetical prior row. The route's
  // INSERT … onConflictDoUpdate path must invoke .onConflictDoUpdate with the
  // canonical target + a SET clause that mutates the editable fields and
  // updates the new clientCaptureId.
  const captures = makeCaptures();
  const app = makeApp({
    db: makeMockDb({ selectRows: [] }, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => ({}) as never,
    callClaudeMultimodalFn: async (opts) => {
      captures.multimodalCalls.push({
        content: opts.content,
        maxTokens: opts.maxTokens,
        userId: opts.userId,
      });
      return makeExtractedJSON({
        case_number: "CS0000001",
        short_description: "updated short_description (latest screenshot wins)",
        location: "Deli",
        department: "Deli",
        maintenance_problem: "Refrigeration",
        extras: { priority: "Critical", trade: "Refrigeration Tech" },
      });
    },
  });

  const res = await postScreenshot(app, {
    imageBase64: VALID_BASE64_PNG,
    mediaType: "image/png",
    clientCaptureId: VALID_UUID_2,
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { workOrderId: string; duplicate: boolean };
  assert.equal(body.workOrderId, "CS0000001");
  assert.equal(body.duplicate, false);

  // The SET clause must include the editable fields. This pins the
  // onConflictDoUpdate path is wired and the update payload is non-empty.
  assert.ok(captures.conflictSet, "onConflictDoUpdate SET was captured");
  assert.equal(captures.conflictSet!.shortDescription, "updated short_description (latest screenshot wins)");
  assert.equal(captures.conflictSet!.location, "Deli");
  assert.equal(captures.conflictSet!.maintenanceProblem, "Refrigeration");
  assert.equal(captures.conflictSet!.department, "Deli");
  assert.equal(captures.conflictSet!.state, "pending_review");
  assert.equal(captures.conflictSet!.clientCaptureId, VALID_UUID_2, "clientCaptureId updated to latest");
  assert.ok(captures.conflictSet!.syncedAt instanceof Date);
});

test("SCAP-01/T9 (vision returns empty case_number): extracted.required.case_number=\"\" → 422; INSERT NOT called", async () => {
  const captures = makeCaptures();
  const app = makeApp({
    db: makeMockDb({ selectRows: [] }, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => ({}) as never,
    callClaudeMultimodalFn: async (opts) => {
      captures.multimodalCalls.push({
        content: opts.content,
        maxTokens: opts.maxTokens,
        userId: opts.userId,
      });
      return makeExtractedJSON({ case_number: "" });
    },
  });

  const res = await postScreenshot(app, {
    imageBase64: VALID_BASE64_PNG,
    mediaType: "image/png",
    clientCaptureId: VALID_UUID,
  });

  assert.equal(res.status, 422);
  const body = (await res.json()) as { error: string; extras: Record<string, string> };
  assert.match(body.error, /case_number/);
  assert.equal(captures.insertValues, null, "INSERT NOT called when case_number missing");
});

test("SCAP-01/T10 (image too large): imageBase64.length > MAX_IMAGE_BASE64_LENGTH → 413; Anthropic NOT called", async () => {
  const captures = makeCaptures();
  const app = makeApp({
    db: makeMockDb({}, captures) as never,
    dbAvailable: true,
    getAIClientFn: () => ({}) as never,
    callClaudeMultimodalFn: async () => {
      throw new Error("should not be called");
    },
  });

  // Build a 7_000_001-char string — one byte over the cap. Using 'A' (valid
  // base64 char) so any future length-only validation logic still triggers
  // the cap before any base64-syntax check.
  const oversize = "A".repeat(MAX_IMAGE_BASE64_LENGTH + 1);
  const res = await postScreenshot(app, {
    imageBase64: oversize,
    mediaType: "image/png",
    clientCaptureId: VALID_UUID,
  });

  assert.equal(res.status, 413);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /too large/);
  assert.equal(captures.multimodalCalls.length, 0, "Anthropic NOT called when image too large");
});
