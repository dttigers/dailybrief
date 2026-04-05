import Database from "better-sqlite3";
import { db } from "../src/db/connection.js";
import { thoughts, thoughtLinks } from "../src/db/schema.js";
import path from "node:path";
import os from "node:os";

interface SqliteThought {
  id: number;
  content: string;
  category: string | null;
  confidence: number | null;
  source: string;
  createdAt: string;
  modifiedAt: string;
  cloudKitRecordID: string;
  syncStatus: string;
  lastSyncedAt: string | null;
  taskStatus: string | null;
  therapyClassification: string | null;
  tags: string | null;
  isFavorited: number;
}

interface SqliteThoughtLink {
  id: number;
  sourceThoughtId: number;
  targetThoughtId: number;
  createdAt: string;
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const sqliteIdx = args.indexOf("--sqlite");
  const sqlitePath =
    sqliteIdx !== -1 && args[sqliteIdx + 1]
      ? args[sqliteIdx + 1]
      : path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Jarvis",
          "jarvis.sqlite",
        );

  // Open SQLite read-only
  console.log(`Opening SQLite database: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  // Query all rows
  const sqliteThoughts = sqlite
    .prepare("SELECT * FROM thoughts")
    .all() as SqliteThought[];
  const sqliteLinks = sqlite
    .prepare("SELECT * FROM thought_links")
    .all() as SqliteThoughtLink[];

  console.log(
    `Found ${sqliteThoughts.length} thoughts and ${sqliteLinks.length} links in SQLite`,
  );

  if (dryRun) {
    console.log("Dry run — no data inserted.");
    sqlite.close();
    process.exit(0);
  }

  if (!db) {
    console.error("DATABASE_URL not set — cannot migrate data");
    sqlite.close();
    process.exit(1);
  }

  // Build a map from cloudKitRecordID -> sqliteId for later link mapping
  const cloudKitToSqliteId = new Map<string, number>();
  for (const row of sqliteThoughts) {
    cloudKitToSqliteId.set(row.cloudKitRecordID, row.id);
  }

  // Insert thoughts in batches of 100, building ID mapping
  const sqliteIdToPostgresId = new Map<number, number>();
  const batchSize = 100;

  for (let i = 0; i < sqliteThoughts.length; i += batchSize) {
    const batch = sqliteThoughts.slice(i, i + batchSize);

    const values = batch.map((row) => ({
      content: row.content,
      category: row.category,
      confidence: row.confidence,
      source: row.source,
      createdAt: new Date(row.createdAt),
      modifiedAt: new Date(row.modifiedAt),
      cloudKitRecordID: row.cloudKitRecordID,
      syncStatus: row.syncStatus,
      lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt) : null,
      taskStatus: row.taskStatus,
      therapyClassification: row.therapyClassification,
      tags: row.tags ? JSON.parse(row.tags) : null,
      isFavorited: row.isFavorited === 1,
    }));

    const inserted = await db
      .insert(thoughts)
      .values(values)
      .returning({ id: thoughts.id, cloudKitRecordID: thoughts.cloudKitRecordID });

    // Map SQLite IDs to PostgreSQL IDs via cloudKitRecordID
    for (const pgRow of inserted) {
      const sqliteId = cloudKitToSqliteId.get(pgRow.cloudKitRecordID);
      if (sqliteId !== undefined) {
        sqliteIdToPostgresId.set(sqliteId, pgRow.id);
      }
    }
  }

  // Insert thought_links using ID mapping
  let skippedLinks = 0;
  const linkBatches: Array<{
    sourceThoughtId: number;
    targetThoughtId: number;
    createdAt: Date;
  }>[] = [];
  let currentLinkBatch: Array<{
    sourceThoughtId: number;
    targetThoughtId: number;
    createdAt: Date;
  }> = [];

  for (const link of sqliteLinks) {
    const pgSourceId = sqliteIdToPostgresId.get(link.sourceThoughtId);
    const pgTargetId = sqliteIdToPostgresId.get(link.targetThoughtId);

    if (pgSourceId === undefined || pgTargetId === undefined) {
      console.warn(
        `Skipping link ${link.id}: unmapped IDs (source=${link.sourceThoughtId}, target=${link.targetThoughtId})`,
      );
      skippedLinks++;
      continue;
    }

    currentLinkBatch.push({
      sourceThoughtId: pgSourceId,
      targetThoughtId: pgTargetId,
      createdAt: new Date(link.createdAt),
    });

    if (currentLinkBatch.length >= batchSize) {
      linkBatches.push(currentLinkBatch);
      currentLinkBatch = [];
    }
  }
  if (currentLinkBatch.length > 0) {
    linkBatches.push(currentLinkBatch);
  }

  for (const batch of linkBatches) {
    await db.insert(thoughtLinks).values(batch);
  }

  const migratedLinks = sqliteLinks.length - skippedLinks;
  console.log(
    `Migrated ${sqliteThoughts.length} thoughts and ${migratedLinks} links. Skipped ${skippedLinks} links (unmapped IDs).`,
  );

  sqlite.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
