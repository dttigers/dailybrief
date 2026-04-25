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
  customType,
  primaryKey,
} from "drizzle-orm/pg-core";

// ── bytea custom type (Drizzle has no built-in bytea helper) ──────────────
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ── users table (Phase 102 — multi-user foundation) ────────────────────────

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(), // stored lowercase (Pitfall 5)
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Phase 110 (AUTH-09 D-01): bearerAuth gate compares jwt.iat to
    // floor(passwordChangedAt/1000); change-password handler writes new Date()
    // here AFTER the password hash update commits (D-14). No DEFAULT — the
    // 0015 migration backfills existing rows to created_at so prior JWTs
    // (iat >= floor(created_at/1000)) keep working on deploy (D-03).
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
      .notNull(),
  },
  (table) => [uniqueIndex("uq_users_email").on(table.email)],
);

// ── projects table ──────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
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
    index("idx_projects_user_id").on(table.userId),
  ],
);

// ── thoughts table ──────────────────────────────────────────────────────────

export const thoughts = pgTable(
  "thoughts",
  {
    id: serial("id").primaryKey(),
    content: text("content").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
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
    index("idx_thoughts_user_id").on(table.userId),
  ],
);

// ── api_keys table ─────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("uq_api_keys_key_hash").on(table.keyHash),
    index("idx_api_keys_user_id").on(table.userId),
  ],
);

// ── briefs table ───────────────────────────────────────────────────────────

export const briefs = pgTable(
  "briefs",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    summary: jsonb("summary").notNull(),
    pdfFilename: text("pdf_filename"),
    thoughtCount: integer("thought_count").notNull(),
    taskCount: integer("task_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_briefs_user_date").on(table.userId, table.date),
    index("idx_briefs_created_at").on(table.createdAt),
    index("idx_briefs_user_id").on(table.userId),
  ],
);

// ── brief_pdfs table (Phase 99 — BYTEA storage for daily brief PDFs) ──────
export const briefPdfs = pgTable(
  "brief_pdfs",
  {
    briefId: integer("brief_id")
      .primaryKey()
      .references(() => briefs.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    bytes: bytea("bytes").notNull(),
    contentType: text("content_type").notNull().default("application/pdf"),
    byteLength: integer("byte_length").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_brief_pdfs_user_id").on(table.userId)],
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
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_thought_links_source").on(table.sourceThoughtId),
    index("idx_thought_links_target").on(table.targetThoughtId),
    index("idx_thought_links_user_id").on(table.userId),
    unique("uq_thought_links_source_target").on(
      table.sourceThoughtId,
      table.targetThoughtId,
    ),
  ],
);

// ── chat_sessions table ────────────────────────────────────────────────────

export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("New Chat"),
  messages: jsonb("messages").$type<Array<{ role: "user" | "assistant"; content: string }>>().notNull().default([]),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_chat_sessions_updated_at").on(table.updatedAt),
  index("idx_chat_sessions_user_id").on(table.userId),
]);

// ── work_order_statuses table (Phase 108 — W-01 user scoping) ──────────────
// Composite PK (userId, caseNumber) prevents cross-user caseNumber collisions
// on upsert. D-23 from Phase 102 reversed here — see migrate.test.ts:13.

export const workOrderStatuses = pgTable(
  "work_order_statuses",
  {
    caseNumber: text("case_number").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("open"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.caseNumber] }),
    index("idx_work_order_statuses_user_id").on(table.userId),
  ],
);

// ── work_orders table ───────────────────────────────────────────────────────

export const workOrders = pgTable("work_orders", {
  caseNumber: text("case_number").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  store: text("store").notNull().default(""),
  shortDescription: text("short_description").notNull().default(""),
  trade: text("trade").notNull().default(""),
  location: text("location").notNull().default(""),
  equipment: text("equipment").notNull().default(""),
  priority: text("priority").notNull().default(""),
  contact: text("contact").notNull().default(""),
  state: text("state").notNull().default(""),
  notes: text("notes").notNull().default(""),
  lastChangeAt: timestamp("last_change_at", { withTimezone: true }),
  lastChangeSummary: text("last_change_summary"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  index("idx_work_orders_user_id").on(table.userId),
]);

// ── oauth_tokens table ─────────────────────────────────────────────────────

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    accessToken: text("access_token").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    calendarSelections: jsonb("calendar_selections").$type<string[]>().default([]),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    accountEmail: text("account_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_oauth_tokens_user_provider").on(table.userId, table.provider),
    index("idx_oauth_tokens_user_id").on(table.userId),
  ],
);

// ── app_settings table ─────────────────────────────────────────────────────
// Phase 102 Pitfall 3: PK became composite (user_id, key) — singleton global-config
// design is gone. Each user has their own print_schedule / user_timezone / etc.
export const appSettings = pgTable("app_settings", {
  key: text("key").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.key] }),
  index("idx_app_settings_user_id").on(table.userId),
]);

// -- ai_cache table --------------------------------------------------------
export const aiCache = pgTable(
  "ai_cache",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    result: jsonb("result").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_ai_cache_user_type").on(table.userId, table.type),
    index("idx_ai_cache_user_id").on(table.userId),
  ],
);

// ── password_reset_tokens (Phase 112 — AUTH-10 forgot-password flow) ──────────
// Schema is permanent for two phases:
//   - Phase 112 writes type='password_reset' rows on /v1/auth/forgot-password.
//   - Phase 113 (AUTH-11) writes type='email_verify' rows; the CHECK constraint
//     is pre-locked here so 113 doesn't need to revisit the migration.
//
// Atomic single-use claim semantics (CONTEXT D-02): UPDATE … SET used_at=now()
// WHERE token_hash=$1 AND type=$2 AND used_at IS NULL AND expires_at > now()
// RETURNING user_id. UNIQUE on token_hash gives fast lookup; PG row-lock on
// the matched row serializes concurrent claims (only the first sees used_at
// IS NULL true).
//
// CHECK constraint on `type` is enforced at SQL level only — drizzle-orm@0.45.2
// has no first-class column-level CHECK helper for pgTable. The 0016 migration
// carries the strict semantic.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(), // SHA-256 hex of raw token (D-08)
    type: text("type").notNull(),            // 'password_reset' | 'email_verify' (CHECK at SQL)
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),  // NULL = unused, ts = claimed
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_prt_token_hash").on(table.tokenHash),
    index("idx_prt_user_id_type").on(table.userId, table.type),
    index("idx_prt_expires_at").on(table.expiresAt),
  ],
);
