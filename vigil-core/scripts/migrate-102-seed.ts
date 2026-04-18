// ── Phase 102 pre-migration seed helper ──────────────────────────────────────
// Inserts the seed user row BEFORE the Drizzle migrator runs 0012_multi_user_foundation.sql.
// Idempotent via ON CONFLICT (email) DO NOTHING. Reads VIGIL_SEED_USER_EMAIL from process.env.
//
// Also sets a database-level GUC `vigil.seed_email` via ALTER DATABASE so the DO-block inside
// the migration SQL (Step 4 backfill) can read it through current_setting(). ALTER DATABASE
// persists across reconnects, unlike SET LOCAL.
//
// Expected caller: `npm run db:migrate-102` runs this, then `drizzle-kit migrate`.

import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("[migrate-102-seed] DATABASE_URL not set");
  process.exit(1);
}

// D-11 placeholder hash — valid argon2id format so register's startsWith() check works,
// but the encoded salt + hash are fixed placeholder bytes, so verify() will always fail.
// PLACEHOLDERSALT / PLACEHOLDERHASHPLACEHOLDERHASHPLACEHOL base64-encoded.
const PLACEHOLDER_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT0xERVJTQUxU$UExBQ0VIT0xERVJIQVNIUExBQ0VIT0xERVJIQVNIUExBQ0VIT0w";

const seedEmail = (
  process.env["VIGIL_SEED_USER_EMAIL"] ?? "jamesonmorrill1@gmail.com"
)
  .toLowerCase()
  .trim();

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  // Create users table if not exists — migration 0012 will also create it with IF NOT EXISTS;
  // we need it to exist here so we can INSERT before the migrator runs.
  await sql`CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users USING btree (email)`;

  await sql`INSERT INTO users (email, password_hash) VALUES (${seedEmail}, ${PLACEHOLDER_HASH}) ON CONFLICT (email) DO NOTHING`;

  // Expose seed email to the migration session via a GUC so the DO-block in 0012 can read it.
  // ALTER DATABASE persists across reconnects within a deploy.
  const dbName = new URL(DATABASE_URL).pathname.slice(1);
  const safeEmail = seedEmail.replace(/'/g, "''");
  const safeDb = dbName.replace(/"/g, '""');
  await sql.unsafe(
    `ALTER DATABASE "${safeDb}" SET vigil.seed_email = '${safeEmail}'`,
  );

  console.log(
    `[migrate-102-seed] seed user row ensured for ${seedEmail}; vigil.seed_email GUC set on database "${dbName}"`,
  );
} finally {
  await sql.end();
}
