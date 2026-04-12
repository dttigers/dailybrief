import {
  pgTable,
  serial,
  text,
  doublePrecision,
  timestamp,
  jsonb,
  boolean,
  integer,
  date,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── projects table ──────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status"), // free text; app validates: active | archived | done
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_projects_created_at").on(table.createdAt),
  ],
);

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
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "set null" }),
    // search_vector column is added via migration SQL (tsvector generated column)
  },
  (table) => [
    index("idx_thoughts_created_at").on(table.createdAt),
    index("idx_thoughts_category").on(table.category),
    index("idx_thoughts_sync_status").on(table.syncStatus),
    index("idx_thoughts_project_id").on(table.projectId),
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

// ── briefs table ───────────────────────────────────────────────────────────

export const briefs = pgTable(
  "briefs",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull().unique(),
    summary: jsonb("summary").notNull(),
    pdfFilename: text("pdf_filename"),
    thoughtCount: integer("thought_count").notNull(),
    taskCount: integer("task_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_briefs_date").on(table.date),
    index("idx_briefs_created_at").on(table.createdAt),
  ],
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

// ── work_order_statuses table ───────────────────────────────────────────────

export const workOrderStatuses = pgTable("work_order_statuses", {
  caseNumber: text("case_number").primaryKey(),
  status: text("status").notNull().default("open"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
