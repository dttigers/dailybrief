import {
  pgTable,
  serial,
  text,
  doublePrecision,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── thoughts table ──────────────────────────────────────────────────────────

export const thoughts = pgTable(
  "thoughts",
  {
    id: serial("id").primaryKey(),
    content: text("content").notNull(),
    category: text("category"), // task, therapy, idea, reflection, project
    confidence: doublePrecision("confidence"),
    source: text("source").notNull(), // text, voice, image
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    modifiedAt: timestamp("modified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    cloudKitRecordID: text("cloudkit_record_id").notNull().unique(),
    syncStatus: text("sync_status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    taskStatus: text("task_status"),
    therapyClassification: text("therapy_classification"),
    tags: jsonb("tags").$type<string[]>(),
    isFavorited: boolean("is_favorited").notNull().default(false),
    // search_vector column is added via migration SQL (tsvector generated column)
  },
  (table) => [
    index("idx_thoughts_created_at").on(table.createdAt),
    index("idx_thoughts_category").on(table.category),
    index("idx_thoughts_sync_status").on(table.syncStatus),
  ],
);

// ── api_keys table ─────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [uniqueIndex("uq_api_keys_key_hash").on(table.keyHash)],
);

// ── thought_links table ─────────────────────────────────────────────────────

export const thoughtLinks = pgTable(
  "thought_links",
  {
    id: serial("id").primaryKey(),
    sourceThoughtId: integer("source_thought_id")
      .notNull()
      .references(() => thoughts.id, { onDelete: "cascade" }),
    targetThoughtId: integer("target_thought_id")
      .notNull()
      .references(() => thoughts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_thought_links_source").on(table.sourceThoughtId),
    index("idx_thought_links_target").on(table.targetThoughtId),
    unique("uq_thought_links_source_target").on(
      table.sourceThoughtId,
      table.targetThoughtId,
    ),
  ],
);
