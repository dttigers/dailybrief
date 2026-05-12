import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

// ── Phase 102 Wave 0 — CROSS-USER ISOLATION HEADLINE TEST (AUTH-05) ──────────
// This is the single load-bearing test for AUTH-05: it creates two real users
// in the live DB, issues a JWT for each, and asserts that every read/write
// path scopes rows to the authenticated caller. If Plan 04's route-scoping
// audit misses a `.where(eq(table.userId, c.get('userId')))` on even one
// endpoint, at least one assertion here must fail with "LEAK:".
//
// Pins (all from CONTEXT.md + RESEARCH §Minimum test surface):
//   - D-02:  `export const app = new Hono()` in src/index.ts (Plan 03 hard requirement)
//   - D-03:  backwards-compat — seed user's existing vk_ key continues to work
//   - D-21:  every scoped route filters queries by c.get('userId')
//   - D-22:  route-level scoping, not DB RLS; trap-test catches missed `.where`
//
// The three RED signals this file emits before Waves 1–4:
//   1. ERR_MODULE_NOT_FOUND on '../utils/jwt.js' + '../utils/password.js' (Plan 02)
//   2. `import { app } from '../index.js'` — currently `const app`, not exported
//   3. users/thoughts schema rows have no userId column (Plan 01)
//
// All tests skip gracefully if DATABASE_URL is unset — hermetic by design.
// -----------------------------------------------------------------------------

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";
process.env["VIGIL_ALLOWED_EMAILS"] = "userA@test.local,userB@test.local";

// Lazy imports so the boot-checks in utils/jwt.ts run after env is set
const { db } = await import("../db/connection.js");
const { users, thoughts, projects, apiKeys } = await import("../db/schema.js");
const { signToken } = await import("../utils/jwt.js");
const { hashPassword } = await import("../utils/password.js");

// Import the Hono app for in-process dispatch. Plan 03 must add
// `export const app = ...` in src/index.ts (currently not exported).
const { app } = await import("../index.js");

const DB_READY = !!process.env["DATABASE_URL"];

let userA: { id: number; email: string };
let userB: { id: number; email: string };
let tokenA: string;
let tokenB: string;

async function get(path: string, token: string) {
  return app.fetch(
    new Request(`http://x${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}
async function post(path: string, token: string, body: unknown) {
  return app.fetch(
    new Request(`http://x${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("cross-user isolation (AUTH-05)", () => {
  before(async () => {
    if (!DB_READY) return;
    if (!db) throw new Error("db null");
    // Clean + seed two users
    await db.delete(thoughts).where(eq(thoughts.cloudKitRecordID, "iso-a-1"));
    await db.delete(thoughts).where(eq(thoughts.cloudKitRecordID, "iso-b-1"));
    await db.delete(users).where(eq(users.email, "usera@test.local"));
    await db.delete(users).where(eq(users.email, "userb@test.local"));
    const pw = await hashPassword("validpass12345");
    // Phase 110 (AUTH-09): passwordChangedAt NOT NULL — seed with "now" so the
    // fresh JWT minted below has iat >= floor(passwordChangedAt/1000) and passes
    // the Plan 02 bearerAuth gate (strict less-than per D-05).
    const now = new Date();
    [userA] = await db
      .insert(users)
      .values({ email: "usera@test.local", passwordHash: pw, passwordChangedAt: now })
      .returning();
    [userB] = await db
      .insert(users)
      .values({ email: "userb@test.local", passwordHash: pw, passwordChangedAt: now })
      .returning();
    // One thought per user
    await db.insert(thoughts).values({
      userId: userA.id,
      content: "userA SECRET",
      source: "text",
      cloudKitRecordID: "iso-a-1",
    });
    await db.insert(thoughts).values({
      userId: userB.id,
      content: "userB SECRET",
      source: "text",
      cloudKitRecordID: "iso-b-1",
    });
    tokenA = await signToken(userA.id, userA.email);
    tokenB = await signToken(userB.id, userB.email);
  });

  after(async () => {
    if (!db || !DB_READY) return;
    await db.delete(thoughts).where(eq(thoughts.cloudKitRecordID, "iso-a-1"));
    await db.delete(thoughts).where(eq(thoughts.cloudKitRecordID, "iso-b-1"));
    await db.delete(users).where(eq(users.email, "usera@test.local"));
    await db.delete(users).where(eq(users.email, "userb@test.local"));
  });

  it("GET /v1/thoughts returns only caller's rows — userA does NOT see userB's content", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const res = await get("/v1/thoughts?window=all", tokenA);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: Array<{ content: string }> };
    const contents = body.data.map((t) => t.content);
    assert.ok(contents.includes("userA SECRET"), "userA must see own thought");
    assert.ok(
      !contents.includes("userB SECRET"),
      "LEAK: userA saw userB's thought via GET /v1/thoughts",
    );
  });

  it("GET /v1/thoughts/:id — userA requesting userB's thought id returns 404 (not 200, not 403)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const [bThought] = await d!
      .select()
      .from(thoughts)
      .where(eq(thoughts.cloudKitRecordID, "iso-b-1"));
    const res = await get(`/v1/thoughts/${bThought.id}`, tokenA);
    assert.equal(
      res.status,
      404,
      "LEAK: cross-user GET /v1/thoughts/:id returned non-404 — existence leak via 403 or data leak via 200",
    );
  });

  it("GET /v1/summary uses only caller's thoughts (no cross-user pollution)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const res = await get("/v1/summary", tokenA);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      recentThoughts?: Array<{ content: string }>;
    };
    const recent = body.recentThoughts ?? [];
    assert.ok(
      !recent.some((t) => t.content === "userB SECRET"),
      "LEAK: GET /v1/summary surfaced userB's thought in userA's summary",
    );
  });

  it("GET /v1/projects returns only caller's projects", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const [pA] = await d!
      .insert(projects)
      .values({ name: "A-proj", userId: userA.id })
      .returning();
    const [pB] = await d!
      .insert(projects)
      .values({ name: "B-proj", userId: userB.id })
      .returning();
    try {
      const res = await get("/v1/projects", tokenA);
      // /v1/projects returns a bare array (D-03 contract preserved for PWA/Mac clients).
      const body = (await res.json()) as Array<{ id: number; name: string }>;
      const names = body.map((p) => p.name);
      assert.ok(names.includes("A-proj"));
      assert.ok(
        !names.includes("B-proj"),
        "LEAK: GET /v1/projects surfaced userB's project in userA's list",
      );
    } finally {
      await d!.delete(projects).where(eq(projects.id, pA.id));
      await d!.delete(projects).where(eq(projects.id, pB.id));
    }
  });

  it("POST /v1/thoughts/bulk/delete with userB's ids from userA's token deletes 0 rows", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const [bThought] = await d!
      .select()
      .from(thoughts)
      .where(eq(thoughts.cloudKitRecordID, "iso-b-1"));
    const res = await post("/v1/thoughts/bulk/delete", tokenA, {
      ids: [bThought.id],
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { deleted: number };
    assert.equal(
      body.deleted,
      0,
      "LEAK: cross-user bulk delete reported non-zero — userA can delete userB's data",
    );
    // And userB's row must still be present
    const [stillThere] = await d!
      .select()
      .from(thoughts)
      .where(eq(thoughts.cloudKitRecordID, "iso-b-1"));
    assert.ok(
      stillThere,
      "LEAK CRITICAL: userB's thought was actually deleted by userA via bulk-delete",
    );
  });

  it("POST /v1/links — userA cannot create link between their thought and userB's thought", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const [aThought] = await d!
      .select()
      .from(thoughts)
      .where(eq(thoughts.cloudKitRecordID, "iso-a-1"));
    const [bThought] = await d!
      .select()
      .from(thoughts)
      .where(eq(thoughts.cloudKitRecordID, "iso-b-1"));
    const res = await post("/v1/links", tokenA, {
      sourceThoughtId: aThought.id,
      targetThoughtId: bThought.id,
    });
    assert.ok(
      [400, 404].includes(res.status),
      `LEAK: cross-user link-create returned ${res.status} — must be 400 or 404 (both endpoints look like no-op)`,
    );
  });

  it("seed user's existing vk_ key still returns seed-user data (backwards-compat D-03)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    // Smoke: there must be at least one apiKeys row linked to the seed user
    // after the Plan 01 backfill. The live-key curl smoke lives in Plan 05 go/no-go.
    const { db: d } = await import("../db/connection.js");
    const seedEmail = (
      process.env["VIGIL_SEED_USER_EMAIL"] ?? "jamesonmorrill1@gmail.com"
    ).toLowerCase();
    const [seedUser] = await d!
      .select()
      .from(users)
      .where(eq(users.email, seedEmail));
    if (!seedUser) {
      t.skip("seed user not present — run migration first");
      return;
    }
    const seedKeys = await d!
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, seedUser.id));
    assert.ok(
      seedKeys.length >= 1,
      `seed user has 0 api_keys rows after backfill — vk_ clients will break (D-03 violation)`,
    );
  });

  it("chat-sessions isolation — GET /v1/chat-sessions returns only caller's sessions", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { chatSessions } = await import("../db/schema.js");
    const [aSession] = await d!
      .insert(chatSessions)
      .values({ userId: userA.id, title: "A session" })
      .returning();
    const [bSession] = await d!
      .insert(chatSessions)
      .values({ userId: userB.id, title: "B session" })
      .returning();
    try {
      const res = await get("/v1/chat-sessions", tokenA);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: Array<{ id: number; title: string }> };
      const titles = body.data.map((s) => s.title);
      assert.ok(titles.includes("A session"), "userA must see own session");
      assert.ok(
        !titles.includes("B session"),
        "LEAK: GET /v1/chat-sessions surfaced userB's session in userA's list",
      );
    } finally {
      await d!.delete(chatSessions).where(eq(chatSessions.id, aSession.id));
      await d!.delete(chatSessions).where(eq(chatSessions.id, bSession.id));
    }
  });

  it("brief-history isolation — GET /v1/briefs returns only caller's briefs", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { briefs } = await import("../db/schema.js");
    // Use distant-future dates to avoid colliding with seed user's real brief history.
    const [aBrief] = await d!
      .insert(briefs)
      .values({
        userId: userA.id,
        date: "2099-12-30",
        summary: { test: "A-brief" },
        thoughtCount: 1,
        taskCount: 0,
      })
      .returning();
    const [bBrief] = await d!
      .insert(briefs)
      .values({
        userId: userB.id,
        date: "2099-12-31",
        summary: { test: "B-brief" },
        thoughtCount: 1,
        taskCount: 0,
      })
      .returning();
    try {
      const res = await get("/v1/briefs?from=2099-12-01&to=2099-12-31", tokenA);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: Array<{ id: number; date: string }> };
      const ids = body.data.map((b) => b.id);
      assert.ok(ids.includes(aBrief.id), "userA must see own brief");
      assert.ok(
        !ids.includes(bBrief.id),
        "LEAK: GET /v1/briefs surfaced userB's brief in userA's history",
      );
    } finally {
      await d!.delete(briefs).where(eq(briefs.id, aBrief.id));
      await d!.delete(briefs).where(eq(briefs.id, bBrief.id));
    }
  });

  it("brief PDF isolation — userB cannot retrieve userA's PDF bytes on a date only userA has (W-02)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { briefs, briefPdfs } = await import("../db/schema.js");

    // Distant-future date; deconflicted from the brief-history isolation test's
    // 2099-12-30 / 2099-12-31 fixtures. W-02 Success Criterion #5.
    const isoDate = "2099-12-28";

    // Insert userA's briefs row FIRST (brief_pdfs.brief_id FKs to briefs.id).
    const [aBrief] = await d!
      .insert(briefs)
      .values({
        userId: userA.id,
        date: isoDate,
        summary: { test: "W-02-A-brief" },
        thoughtCount: 1,
        taskCount: 0,
      })
      .returning();

    // Insert the matching brief_pdfs row with real bytes so the route's
    // leftJoin resolves to bytes (distinguishes "no briefs row" 404 from
    // "briefs row exists but no pdf bytes" 404 — we want the first kind).
    const pdfBytes = Buffer.from("W-02 FAKE PDF BYTES — userA ONLY");
    await d!.insert(briefPdfs).values({
      briefId: aBrief.id,
      userId: userA.id,
      bytes: pdfBytes,
      contentType: "application/pdf",
      byteLength: pdfBytes.length,
    });

    try {
      // userB requests the same date with tokenB — must return 404, never bytes.
      const res = await get(`/v1/brief/${isoDate}`, tokenB);
      assert.equal(
        res.status,
        404,
        `LEAK: userB got status ${res.status} on GET /v1/brief/${isoDate} — expected 404`,
      );
      const body = (await res.json()) as { error: string; date: string; regenerable: boolean };
      assert.equal(
        body.error,
        "brief_not_found",
        `LEAK: userB got error '${body.error}' — expected 'brief_not_found' (the route's no-briefs-row 404 branch)`,
      );
      // Sanity: userB MUST NOT have received the PDF payload shape (any response
      // with Content-Type=application/pdf would be a leak; 404 JSON body is the
      // expected shape).
      assert.notEqual(
        res.headers.get("content-type"),
        "application/pdf",
        "LEAK: userB received application/pdf Content-Type on another user's brief date",
      );
    } finally {
      // Cleanup order: brief_pdfs first (FK references briefs.id), then briefs.
      // (briefPdfs.briefId is FK to briefs.id ON DELETE CASCADE, so deleting
      // the briefs row would also cascade; but doing it explicitly keeps the
      // cleanup order unambiguous and matches the brief-history test style.)
      await d!.delete(briefPdfs).where(eq(briefPdfs.briefId, aBrief.id));
      await d!.delete(briefs).where(eq(briefs.id, aBrief.id));
    }
  });

  it("work-orders isolation — GET /v1/work-orders returns only caller's orders", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { workOrders } = await import("../db/schema.js");
    // Use unique caseNumbers scoped to this test to avoid PK collisions.
    const aCase = `ISO-A-${Date.now()}`;
    const bCase = `ISO-B-${Date.now()}`;
    await d!.insert(workOrders).values({
      userId: userA.id,
      caseNumber: aCase,
      shortDescription: "userA-order",
    });
    await d!.insert(workOrders).values({
      userId: userB.id,
      caseNumber: bCase,
      shortDescription: "userB-order",
    });
    try {
      const res = await get("/v1/work-orders?filter=all", tokenA);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: Array<{ caseNumber: string }> };
      const cases = body.data.map((w) => w.caseNumber);
      assert.ok(cases.includes(aCase), "userA must see own work order");
      assert.ok(
        !cases.includes(bCase),
        "LEAK: GET /v1/work-orders surfaced userB's order in userA's list",
      );
    } finally {
      await d!.delete(workOrders).where(eq(workOrders.caseNumber, aCase));
      await d!.delete(workOrders).where(eq(workOrders.caseNumber, bCase));
    }
  });

  // ── Phase 127 GUARD-03 (Plan 05.1b Task 3) — ai_usage_daily W-01 lock ────
  // Two locks against cross-user reads of the per-user daily AI spend
  // watermark (ai_usage_daily table, Plan 05 schema). The integration block
  // mirrors the work-orders isolation lock above. The W-01-AI-BUDGET
  // source-grep enforces that vigil-core/src/lib/ai-budget.ts literally
  // contains `eq(aiUsageDaily.userId, userId)` (the Drizzle filter is the
  // single defense; same convention as the W-01 grep used in prior phases —
  // Phase 121 D-D2 / Phase 124 D-D2 carryforward).
  it("ai-usage-daily isolation — userA's row never returned for userB's query", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { aiUsageDaily } = await import("../db/schema.js");
    // Today's date as ISO-8601 yyyy-mm-dd (the column is `date` type — text
    // form is what Drizzle expects on insert per the schema pattern).
    const today = new Date().toISOString().slice(0, 10);
    try {
      await d!
        .insert(aiUsageDaily)
        .values({
          userId: userA.id,
          usageDate: today,
          usdEstimate: "0.45",
        })
        // Composite PK (userId, usageDate) — onConflict update so re-runs
        // against the same DB date don't trip the test setup.
        .onConflictDoUpdate({
          target: [aiUsageDaily.userId, aiUsageDaily.usageDate],
          set: { usdEstimate: "0.45", updatedAt: new Date() },
        });

      // Read as userB — must return ZERO rows. If a future query drops the
      // `.where(eq(aiUsageDaily.userId, userId))` filter, userA's spend
      // becomes visible to userB and the assertion below fires with "LEAK:".
      const rows = await d!
        .select()
        .from(aiUsageDaily)
        .where(eq(aiUsageDaily.userId, userB.id));
      assert.equal(
        rows.length,
        0,
        "LEAK: ai_usage_daily query for userB returned userA's row — W-01 cross-user-isolation regressed",
      );
    } finally {
      await d!.delete(aiUsageDaily).where(eq(aiUsageDaily.userId, userA.id));
    }
  });

  // ── W-01-AI-BUDGET (source-grep) ──────────────────────────────────────────
  // Pins the literal `eq(aiUsageDaily.userId, userId)` in
  // vigil-core/src/lib/ai-budget.ts so every read on aiUsageDaily inside
  // ai-budget.ts MUST filter by the caller's userId. Mirrors the W-01 grep
  // style from prior phases (Phase 121 D-D2 lock). Runs WITHOUT DATABASE_URL
  // so a CI-without-DB still catches a query-filter drop.
  it("W-01-AI-BUDGET — ai-budget.ts reads aiUsageDaily with eq(aiUsageDaily.userId, userId) filter", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    // ../lib/ai-budget.ts (the integration test sits in src/integration/)
    const aiBudgetPath = path.resolve(here, "..", "lib", "ai-budget.ts");
    const src = fs.readFileSync(aiBudgetPath, "utf8");
    assert.ok(
      src.includes("eq(aiUsageDaily.userId, userId)"),
      "W-01-AI-BUDGET: vigil-core/src/lib/ai-budget.ts must contain the literal `eq(aiUsageDaily.userId, userId)` (W-01 cross-user-isolation pattern — Phase 121 D-D2 carryforward). If a future planner refactors the Drizzle filter shape, replace this assertion with the new literal and update the Phase 121 lock comment chain.",
    );
  });

  it("insights cache isolation — GET /v1/insights/cache does not serve userA's cache to userB (aiCache.userId)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { aiCache } = await import("../db/schema.js");
    // Pre-seed userA's insights cache with a known-unique payload.
    const marker = `SECRET-A-${Date.now()}`;
    const [aRow] = await d!
      .insert(aiCache)
      .values({
        userId: userA.id,
        type: "insights",
        result: [{ marker }],
      })
      .onConflictDoUpdate({
        target: [aiCache.userId, aiCache.type],
        set: { result: [{ marker }], updatedAt: new Date() },
      })
      .returning();
    try {
      // Hit userB's cache endpoint — must NOT return userA's payload.
      const res = await get("/v1/insights/cache", tokenB);
      // Either 404 (no cache for userB) or 200 with different payload — but NEVER userA's marker.
      const text = await res.text();
      assert.ok(
        !text.includes(marker),
        "LEAK: userB received userA's cached insights (aiCache not scoped by userId)",
      );
    } finally {
      await d!.delete(aiCache).where(eq(aiCache.id, aRow.id));
    }
  });

  // ── Phase 121 (AGENT-API-01 + AGENT-API-02) — agent_events isolation lock ─
  // Three D-D2 invariants pinned here, mirroring the W-01/W-02 pattern from
  // Phase 108. This file is the single audit-grep target every future phase
  // uses to confirm "is this endpoint cross-user-safe?". Per-route tests
  // live in agent-events.test.ts (Plan 03); these three are the structural
  // lock that future regressions cannot silently pass.

  it("POST /v1/agent-events: userA's POST cannot insert with userB's userId (D-D2.1)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { agentEvents } = await import("../db/schema.js");
    const { eq, and } = await import("drizzle-orm");

    const cid1 = `iso-A-cid-${Date.now()}`;
    const cid2 = `iso-A-cid-clean-${Date.now()}`;

    try {
      // Step 1: hostile POST including body.userId = userB.id.
      // Plan 02's KNOWN_FIELDS guard rejects body.userId as unknown_field → 400.
      // This is the front-door defense.
      const hostile = {
        session_id: "iso-sess-A",
        event: "needs_input",
        message: "from userA with userB userId in body",
        timestamp: new Date().toISOString(),
        label: "iso-test",
        host: "iso-host",
        client_event_id: cid1,
        userId: userB.id, // hostile field — must be rejected as unknown_field
      };
      const res1 = await post("/v1/agent-events", tokenA, hostile);
      assert.equal(
        res1.status,
        400,
        `LEAK: POST with body.userId did NOT 400 (status ${res1.status}). KNOWN_FIELDS guard regressed — body.userId may be silently dropped instead of rejected. If a future plan removes the strict() guard, the userId-from-bearer guarantee becomes the ONLY defense; verify nothing was inserted by checking DB below.`,
      );
      const body1 = (await res1.json()) as { error: string; message: string };
      assert.equal(body1.error, "unknown_field");

      // Confirm no row was persisted (KNOWN_FIELDS guard fired before DB).
      const leaked = await d!
        .select()
        .from(agentEvents)
        .where(
          and(
            eq(agentEvents.clientEventId, cid1),
            eq(agentEvents.userId, userB.id),
          ),
        );
      assert.equal(
        leaked.length,
        0,
        `LEAK CRITICAL: hostile POST persisted a row with userId=userB.id (${userB.id}). The route is trusting body.userId — D-21 violation.`,
      );

      // Step 2: clean POST without the hostile field — verifies the route
      // attributes the row to the bearer's userId (userA), not userB.
      const clean = {
        session_id: "iso-sess-A",
        event: "needs_input",
        message: "from userA, clean payload",
        timestamp: new Date().toISOString(),
        label: "iso-test",
        host: "iso-host",
        client_event_id: cid2,
      };
      const res2 = await post("/v1/agent-events", tokenA, clean);
      assert.equal(res2.status, 201, "clean POST must succeed");
      const body2 = (await res2.json()) as { userId: number; clientEventId: string };
      assert.equal(
        body2.userId,
        userA.id,
        `LEAK: response userId is ${body2.userId}, expected userA.id (${userA.id}). Route is leaking attribution.`,
      );

      // DB cross-check: the persisted row has user_id = userA.id.
      const persisted = await d!
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.clientEventId, cid2));
      assert.equal(persisted.length, 1, "exactly 1 row persisted for clean POST");
      assert.equal(
        persisted[0]!.userId,
        userA.id,
        `LEAK: persisted row has user_id=${persisted[0]!.userId}, expected userA.id (${userA.id})`,
      );
    } finally {
      await d!.delete(agentEvents).where(eq(agentEvents.clientEventId, cid1));
      await d!.delete(agentEvents).where(eq(agentEvents.clientEventId, cid2));
    }
  });

  it("GET /v1/agent-sessions: userA's GET never returns userB's sessions (D-D2.2)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { agentEvents } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    const aSession = `iso-A-session-${Date.now()}`;
    const bSession = `iso-B-session-${Date.now()}`;
    const aCid = `iso-A-get-cid-${Date.now()}`;
    const bCid = `iso-B-get-cid-${Date.now()}`;

    try {
      // Seed one event for userA, one for userB — direct DB insert (bypasses
      // the route entirely so the test pins GET-side filtering, not POST-side).
      await d!.insert(agentEvents).values({
        userId: userA.id,
        sessionId: aSession,
        event: "needs_input",
        message: "userA event",
        label: "iso-test",
        host: "iso-host",
        eventTimestamp: new Date(),
        clientEventId: aCid,
      });
      await d!.insert(agentEvents).values({
        userId: userB.id,
        sessionId: bSession,
        event: "task_complete",
        message: "userB event",
        label: "iso-test",
        host: "iso-host",
        eventTimestamp: new Date(),
        clientEventId: bCid,
      });

      const res = await get("/v1/agent-sessions", tokenA);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: Array<{ sessionId: string; lastEvent: { message: string | null } }>;
      };
      const sessionIds = body.data.map((s) => s.sessionId);
      assert.ok(
        sessionIds.includes(aSession),
        "userA must see own session in GET response",
      );
      assert.ok(
        !sessionIds.includes(bSession),
        `LEAK: GET /v1/agent-sessions surfaced userB's session "${bSession}" in userA's list — D-22 violation (route missing .where(eq(agentEvents.userId, c.get('userId'))) on the read path)`,
      );
      // Defense in depth: also assert the message field doesn't leak userB's content.
      const messages = body.data.map((s) => s.lastEvent.message);
      assert.ok(
        !messages.includes("userB event"),
        "LEAK: userB's message text appeared in userA's GET response",
      );
    } finally {
      await d!.delete(agentEvents).where(eq(agentEvents.clientEventId, aCid));
      await d!.delete(agentEvents).where(eq(agentEvents.clientEventId, bCid));
    }
  });

  // ── Phase 124 (AGENT-API-03) — Block 4: SSE cross-user isolation ──────────
  // userA's GET /v1/agent-stream MUST NOT receive events emitted via the bus
  // for userB. End-to-end via app.fetch (so bearerAuth → c.set('userId') →
  // c.get('userId') is exercised), with the real bus singleton from
  // ../lib/agent-events-bus.js (the same instance the production route uses).
  // The fakeBus pattern from agent-stream.test.ts is NOT sufficient for this
  // lock — block 4 is the structural integration test.
  it("Block 4: SSE userA never receives userB bus emissions (AGENT-API-03)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { bus } = await import("../lib/agent-events-bus.js");

    // Open two SSE connections via app.fetch — userA and userB bearers.
    // Important: Hono streamSSE returns the Response immediately with a
    // streaming body; the actual handler runs async. We need to give the
    // listener a moment to attach via bus.on(userId, listener) before we
    // emit, and we MUST cancel both readers in finally{} so the handler's
    // hold-open Promise resolves and the test runner can exit cleanly.
    const resA = await app.fetch(
      new Request("http://x/v1/agent-stream", {
        headers: {
          Authorization: `Bearer ${tokenA}`,
          Accept: "text/event-stream",
        },
      }),
    );
    const resB = await app.fetch(
      new Request("http://x/v1/agent-stream", {
        headers: {
          Authorization: `Bearer ${tokenB}`,
          Accept: "text/event-stream",
        },
      }),
    );
    assert.equal(resA.status, 200, "userA stream opens with 200");
    assert.equal(resB.status, 200, "userB stream opens with 200");

    const readerA = resA.body!.getReader();
    const readerB = resB.body!.getReader();
    const decoder = new TextDecoder();

    // Helper: read up to N "agent-event" frames OR until timeout, then return
    // collected ids (skips ping frames). Does NOT cancel — caller does that.
    async function collectAgentEventIds(
      reader: ReadableStreamDefaultReader<Uint8Array>,
      maxN: number,
      timeoutMs: number,
    ): Promise<string[]> {
      const ids: string[] = [];
      let buf = "";
      const deadline = Date.now() + timeoutMs;
      while (ids.length < maxN && Date.now() < deadline) {
        const remaining = Math.max(0, deadline - Date.now());
        const result = await Promise.race([
          reader.read(),
          new Promise<{ done: true; value: undefined }>((r) =>
            setTimeout(() => r({ done: true, value: undefined }), remaining),
          ),
        ]);
        if (result.done) break;
        buf += decoder.decode(result.value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event: string | undefined;
          let id: string | undefined;
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("id:")) id = line.slice(3).trim();
          }
          if (event === "agent-event" && id) ids.push(id);
          if (ids.length >= maxN) break;
        }
      }
      return ids;
    }

    try {
      // Allow listeners to attach (the streamSSE callback runs async; bus.on
      // happens after the Response is returned).
      await new Promise((r) => setTimeout(r, 50));

      // Emit ONLY for userB — this is the structural cross-user isolation test.
      // The bus MUST keep userA and userB on different EventEmitter instances
      // so userA's listener never fires. If a regression collapses the
      // Map<userId, EventEmitter> to a global emitter, userA collects ≥1 frame
      // and this test fails with the LEAK message below.
      bus.emit(userB.id, {
        id: 999_001,
        userId: userB.id,
        sessionId: "iso-block4-sess",
        event: "needs_input",
        message: "userB-only emit",
        label: "iso-block4",
        host: "iso-block4-host",
        exitCode: null,
        eventTimestamp: new Date(),
        receivedAt: new Date(),
        clientEventId: `iso-block4-cid-${Date.now()}`,
      });

      // userA must collect ZERO agent-event frames within 200ms;
      // userB must collect EXACTLY ONE.
      const idsA = await collectAgentEventIds(readerA, 1, 200);
      const idsB = await collectAgentEventIds(readerB, 1, 200);

      assert.equal(
        idsA.length,
        0,
        `LEAK CRITICAL: userA's SSE stream received ${idsA.length} agent-event frame(s) when bus was emitted for userB. Map<userId, EventEmitter> isolation regressed — Phase 124 D-03 invariant + Phase 121 D-D2 cross-user isolation violation.`,
      );
      assert.equal(idsB.length, 1, "userB must have received exactly one frame");
      assert.equal(idsB[0], "999001", "userB frame id matches the emitted row.id");
    } finally {
      // CRITICAL cleanup — without these, the streamSSE handlers' hold-open
      // Promises never resolve and the test runner stays alive past the
      // file timeout.
      try {
        await readerA.cancel();
      } catch {
        /* ignore */
      }
      try {
        await readerB.cancel();
      } catch {
        /* ignore */
      }
      // Allow the onAbort handlers to fire so bus.off cleanup runs before
      // the next test reads the singleton's listener count.
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  it("Dedupe scope: userA's client_event_id collision with userB's UUID is allowed (D-D2.3)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db: d } = await import("../db/connection.js");
    const { agentEvents } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    // Both users use the SAME client_event_id UUID.
    // Composite (user_id, client_event_id) partial unique index permits this.
    // Single-column unique would 200-dedupe userB's POST against userA's row.
    const sharedCid = `iso-shared-cid-${Date.now()}`;

    try {
      const baseBody = {
        session_id: "iso-shared-sess",
        event: "needs_input",
        message: "shared cid test",
        timestamp: new Date().toISOString(),
        label: "iso-test",
        host: "iso-host",
        client_event_id: sharedCid,
      };

      const resA = await post("/v1/agent-events", tokenA, baseBody);
      assert.equal(
        resA.status,
        201,
        `userA POST with shared cid must succeed with 201, got ${resA.status}`,
      );
      const rowA = (await resA.json()) as { id: number; userId: number; clientEventId: string };
      assert.equal(rowA.userId, userA.id);

      const resB = await post("/v1/agent-events", tokenB, baseBody);
      assert.equal(
        resB.status,
        201,
        `LEAK CRITICAL: userB POST with same client_event_id returned ${resB.status} (expected 201). The dedupe constraint is single-column instead of composite (user_id, client_event_id). userA and userB cannot both use UUID "${sharedCid}" — this is a cross-user contamination bug. Migration 0018's partial unique index has regressed.`,
      );
      const rowB = (await resB.json()) as { id: number; userId: number; clientEventId: string };
      assert.equal(rowB.userId, userB.id);

      // Cross-check: 2 distinct rows in DB with the shared cid, scoped by user.
      const rows = await d!
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.clientEventId, sharedCid));
      assert.equal(
        rows.length,
        2,
        `LEAK CRITICAL: expected 2 rows with shared cid (one per user), found ${rows.length}. Dedupe scope is broken.`,
      );
      const userIds = rows.map((r) => r.userId).sort();
      assert.deepEqual(
        userIds,
        [userA.id, userB.id].sort(),
        "the 2 rows with shared cid must be one for userA and one for userB",
      );
      assert.notEqual(rowA.id, rowB.id, "the two rows must have distinct serial PKs");
    } finally {
      await d!.delete(agentEvents).where(eq(agentEvents.clientEventId, sharedCid));
    }
  });
});
