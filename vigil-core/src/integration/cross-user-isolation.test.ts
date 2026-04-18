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
    [userA] = await db
      .insert(users)
      .values({ email: "usera@test.local", passwordHash: pw })
      .returning();
    [userB] = await db
      .insert(users)
      .values({ email: "userb@test.local", passwordHash: pw })
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
});
