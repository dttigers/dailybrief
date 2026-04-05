import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) {
  console.warn(
    "[vigil-core] DATABASE_URL not set — PostgreSQL features unavailable",
  );
}

const client = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL)
  : (null as unknown as ReturnType<typeof postgres>);

export const db = client ? drizzle(client, { schema }) : null;

/** Verify database connectivity with a simple query */
export async function testConnection(): Promise<boolean> {
  if (!client) return false;
  try {
    await client`SELECT 1`;
    console.log("[vigil-core] PostgreSQL connection verified");
    return true;
  } catch (err) {
    console.error(`[vigil-core] PostgreSQL connection failed: ${err}`);
    return false;
  }
}

/** Graceful shutdown — close the connection pool */
export async function closeConnection(): Promise<void> {
  if (client) {
    await client.end();
    console.log("[vigil-core] PostgreSQL connection closed");
  }
}
