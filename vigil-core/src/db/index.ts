import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

const DB_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "Jarvis",
  "jarvis.sqlite",
);

let db: Database.Database | null = null;

export function withDb<T>(fn: (db: Database.Database) => T): T | null {
  const instance = getDb();
  if (!instance) return null;
  return fn(instance);
}

export function getDb(): Database.Database | null {
  if (db) return db;

  if (!existsSync(DB_PATH)) {
    console.error(
      `[vigil-core] Database not found at ${DB_PATH}. Endpoints will return 503.`,
    );
    return null;
  }

  try {
    db = new Database(DB_PATH);
    const result = db.prepare("SELECT COUNT(*) as count FROM thoughts").get() as
      | { count: number }
      | undefined;
    console.log(
      `[vigil-core] Connected to Jarvis database (${result?.count ?? 0} thoughts)`,
    );
    return db;
  } catch (err) {
    console.error(`[vigil-core] Failed to open database: ${err}`);
    return null;
  }
}
