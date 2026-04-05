import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[migrate] DATABASE_URL not set");
  process.exit(1);
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

console.log("[migrate] Running migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("[migrate] Migrations complete");
await client.end();
