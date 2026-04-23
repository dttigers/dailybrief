import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

// ── Phase 102 Wave 0 — RED-by-default scaffold ────────────────────────────────
// Asserts the post-migration schema state that Plan 01's 0012 migration must
// produce. Skips if DATABASE_URL is unset (matches calendar.test.ts pattern).
//
// Pins:
//   - AUTH-01: users table with email unique + passwordHash column
//   - AUTH-04: 11 data tables each gain NOT NULL user_id FK to users(id)
//   - D-05:    Seed user row exists with lowercased email + argon2id placeholder hash
//   - D-23 (Phase 102) REVERSED in Phase 108 — work_order_statuses is now user-scoped; assertion flipped.
//   - Pitfall 3: app_settings PK is composite (user_id, key) — not just (key)
//   - Pitfall 5: seed email stored lowercase
//   - Pitfall 7: every userId FK declared ON DELETE RESTRICT (confdeltype='r')
//
// Pre-Plan-01 RED state: "users" table does not exist, so every information_schema
// lookup returns 0 rows, and the first assertion fails loudly.
// -----------------------------------------------------------------------------

// DATABASE_URL is required for every it() here — skip hermetically if missing.
// We can't use before(t => t.skip()) because node:test's SuiteContext doesn't expose
// .skip() (it's only on TestContext inside it()). Each it() checks env instead.
const DB_READY = !!process.env["DATABASE_URL"];

describe("migration 0012 — multi-user foundation (AUTH-01, AUTH-04)", () => {
  it("users table exists with email unique constraint + passwordHash column (AUTH-01)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("./connection.js");
    if (!db) throw new Error("db null");
    const rows = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' ORDER BY ordinal_position
    `);
    const cols = (rows as unknown as Array<{ column_name: string }>).map(
      (r) => r.column_name,
    );
    assert.ok(cols.includes("id"), "users.id missing");
    assert.ok(cols.includes("email"), "users.email missing");
    assert.ok(cols.includes("password_hash"), "users.password_hash missing");
    assert.ok(cols.includes("created_at"), "users.created_at missing");
    assert.ok(cols.includes("updated_at"), "users.updated_at missing");

    const uq = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'uq_users_email'
    `);
    assert.equal(
      (uq as unknown as unknown[]).length,
      1,
      "uq_users_email unique index missing",
    );
  });

  it("seed user row exists with lowercased email + argon2id placeholder hash (D-05, Pitfall 5)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("./connection.js");
    if (!db) throw new Error("db null");
    const seedEmail = (
      process.env["VIGIL_SEED_USER_EMAIL"] ?? "jamesonmorrill1@gmail.com"
    ).toLowerCase();
    const rows = await db.execute(
      sql`SELECT email, password_hash FROM users WHERE email = ${seedEmail}`,
    );
    const [row] = rows as unknown as Array<{
      email: string;
      password_hash: string;
    }>;
    assert.ok(row, `seed user ${seedEmail} not found`);
    assert.equal(row.email, seedEmail, "seed email not stored lowercase (Pitfall 5)");
    assert.match(
      row.password_hash,
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
      "seed password_hash not an argon2id placeholder (D-05)",
    );
  });

  it("all 11 data tables have NOT NULL user_id column + FK to users(id) ON DELETE RESTRICT (Pitfall 7)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("./connection.js");
    if (!db) throw new Error("db null");
    const tables = [
      "api_keys",
      "thoughts",
      "projects",
      "briefs",
      "brief_pdfs",
      "thought_links",
      "chat_sessions",
      "work_orders",
      "oauth_tokens",
      "ai_cache",
      "app_settings",
    ];
    for (const t of tables) {
      const rows = await db.execute(sql`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_name = ${t} AND column_name = 'user_id'
      `);
      const [row] = rows as unknown as Array<{ is_nullable: string }>;
      assert.ok(row, `table ${t} has no user_id column`);
      assert.equal(row.is_nullable, "NO", `${t}.user_id must be NOT NULL`);

      const fk = await db.execute(sql`
        SELECT confdeltype FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        WHERE cl.relname = ${t} AND c.contype = 'f'
          AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES users(id)%'
      `);
      const [fkRow] = fk as unknown as Array<{ confdeltype: string }>;
      assert.ok(fkRow, `${t}.user_id missing FK to users(id)`);
      assert.equal(
        fkRow.confdeltype,
        "r",
        `${t}.user_id FK must be ON DELETE RESTRICT (confdeltype='r'), got '${fkRow.confdeltype}'`,
      );
    }
  });

  it("work_order_statuses table DOES have NOT NULL user_id column with FK to users(id) ON DELETE RESTRICT (D-23 reversed in Phase 108 — W-01)", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("./connection.js");
    if (!db) throw new Error("db null");

    // Column exists + is NOT NULL
    const rows = await db.execute(sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'work_order_statuses' AND column_name = 'user_id'
    `);
    const [row] = rows as unknown as Array<{ is_nullable: string }>;
    assert.ok(row, "work_order_statuses.user_id column missing — Phase 108 migration 0014 did not apply");
    assert.equal(row.is_nullable, "NO", "work_order_statuses.user_id must be NOT NULL");

    // FK exists and is ON DELETE RESTRICT (confdeltype='r')
    const fk = await db.execute(sql`
      SELECT confdeltype FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      WHERE cl.relname = 'work_order_statuses' AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES users(id)%'
    `);
    const [fkRow] = fk as unknown as Array<{ confdeltype: string }>;
    assert.ok(fkRow, "work_order_statuses.user_id missing FK to users(id)");
    assert.equal(
      fkRow.confdeltype,
      "r",
      `work_order_statuses.user_id FK must be ON DELETE RESTRICT (confdeltype='r'), got '${fkRow.confdeltype}'`,
    );
  });

  it("app_settings primary key is composite (user_id, key) — Pitfall 3", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("./connection.js");
    if (!db) throw new Error("db null");
    const rows = await db.execute(sql`
      SELECT a.attname AS col, i.indisprimary
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      JOIN pg_class c ON c.oid = i.indrelid
      WHERE c.relname = 'app_settings' AND i.indisprimary = true
      ORDER BY array_position(i.indkey, a.attnum)
    `);
    const cols = (rows as unknown as Array<{ col: string }>).map((r) => r.col);
    assert.deepEqual(
      cols.slice().sort(),
      ["key", "user_id"],
      `expected composite PK (user_id, key); got ${cols.join(",")}`,
    );
  });

  it("idx_<table>_user_id index exists on each of the 11 scoped tables", async (t) => {
    if (!DB_READY) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("./connection.js");
    if (!db) throw new Error("db null");
    const tables = [
      "api_keys",
      "thoughts",
      "projects",
      "briefs",
      "brief_pdfs",
      "thought_links",
      "chat_sessions",
      "work_orders",
      "oauth_tokens",
      "ai_cache",
      "app_settings",
    ];
    for (const t of tables) {
      const rows: unknown = await db.execute(sql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = ${t} AND indexname = ${`idx_${t}_user_id`}
      `);
      assert.equal(
        (rows as unknown as unknown[]).length,
        1,
        `idx_${t}_user_id missing`,
      );
    }
  });

  it.skip("TODO Plan 05: running migrate.ts twice against a freshly-migrated DB is a no-op (idempotency via IF NOT EXISTS + ON CONFLICT)", () => {
    // Two invocations of the migration runner must leave the schema identical.
    // Verified in Plan 05 go/no-go script.
  });
});
