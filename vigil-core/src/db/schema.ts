import {
  pgTable,
  serial,
  text,
  doublePrecision,
  numeric,
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
    // Phase 113 (AUTH-11 D-05): emailVerifiedAt column. NULL = unverified
    // (banner sentinel for SettingsPage). Non-null TIMESTAMPTZ = verified
    // at that moment. The 0017 migration backfills existing rows to
    // created_at (SC#4 grandfathering anti-lockout). Nullable on purpose —
    // newly registered users start with NULL until they click the verify
    // link. NO .notNull() and NO default.
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Phase 125 (AGENT-HUD-03 / D-05): per-user HUD DND filter state.
    // Default false — every user starts non-quiet. NULL since column when off.
    quietMode: boolean("quiet_mode").notNull().default(false),
    quietModeSince: timestamp("quiet_mode_since", { withTimezone: true }),
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

// ── ai_usage_daily table (Phase 127 GUARD-03 / D-03.1) ─────────────────────
// Per-user daily AI spend watermark. Composite PK (user_id, usage_date) is
// the W-01 cross-user-isolation pattern (Phase 121 D-D2 lock). Daily rollover
// happens naturally by the usage_date key — no cron, no nightly job. The
// helper library at src/lib/ai-budget.ts reads/writes this table via
// `requireAiBudget(userId)` (pre-flight throw on cap exceed) and
// `withBudgetTracking(userId, fn)` (post-call accumulator via INSERT … ON
// CONFLICT (user_id, usage_date) DO UPDATE).
//
// usd_estimate is numeric(12,6) — Pitfall 9 override of CONTEXT D-03.1's
// numeric(10,4). The sub-cent precision lets a single chat turn (e.g.
// 100 input + 50 output tokens at $3/$15 per 1M = $0.00105) accumulate
// without rounding to zero; CONTEXT's (10,4) would round that to $0.0011
// and silently inflate the watermark.
//
// onDelete: "cascade" — when a user is hard-deleted (rare; mostly test
// cleanup), their daily spend rows go with them. workOrderStatuses uses
// "restrict" because work-order data is operationally precious; ai_usage_daily
// is throwaway telemetry that resets at UTC 00:00 anyway.
//
// idx_ai_usage_daily_date covers the usage_date alone — the composite PK
// (user_id, usage_date) already provides an implicit index for queries
// leading with user_id (which is the common shape: `WHERE user_id = $1
// AND usage_date = CURRENT_DATE`). The date-only index covers future
// admin queries like "all users who hit the cap today" without scanning
// the whole table.

export const aiUsageDaily = pgTable(
  "ai_usage_daily",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    usdEstimate: numeric("usd_estimate", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.usageDate] }),
    index("idx_ai_usage_daily_date").on(table.usageDate),
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
  clientCaptureId: text("client_capture_id"), // nullable; (user_id, client_capture_id) partial unique enforced in 0021 migration (SVCNOW-04)
  maintenanceProblem: text("maintenance_problem"), // nullable; Phase 129.1 WO-MANUAL-03 — added via migration 0022
  department: text("department"), // nullable; Phase 129.1 WO-MANUAL-03 — added via migration 0022
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

// ── agent_events table (Phase 121 — AGENT-API-01) ────────────────────────
// Receives Claude Code session events from the future vigil-watch daemon
// (Phase 122) via POST /v1/agent-events. Per-user scoped (D-22), append-only,
// idempotent via partial unique index on (user_id, client_event_id) WHERE
// client_event_id IS NOT NULL — composite scope is load-bearing per D-D2
// block 3 (single-column would cross-contaminate users).
//
// Two-timestamp design (D-A1):
//   - event_timestamp: source of truth from daemon payload (ordering key)
//   - received_at:    DB insert time (clock-skew + retry-latency forensics)
//
// CHECK constraint on `event` is enforced at SQL level only — drizzle-orm@0.45.2
// has no first-class column-level CHECK helper for pgTable. The 0018 migration
// carries the strict semantic. Same pattern as passwordResetTokens.type.
//
// Partial unique index on (user_id, client_event_id) WHERE client_event_id IS
// NOT NULL is also enforced at SQL level only — drizzle-orm@0.45.2 has no
// partial-unique-index helper. The 0018 migration carries it.
export const agentEvents = pgTable(
  "agent_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionId: text("session_id").notNull(),
    event: text("event").notNull(), // CHECK ('needs_input','task_complete','task_failed','milestone','heartbeat') — SQL-level only
    message: text("message"), // nullable per spec (events without freeform message)
    label: text("label").notNull(),
    host: text("host").notNull(),
    exitCode: integer("exit_code"), // nullable — only present on task_complete/task_failed
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(), // D-A1 source of truth
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(), // D-A1 DB insert time
    clientEventId: text("client_event_id"), // nullable; partial unique with userId enforced in 0018 migration (D-A4 + D-C1)
  },
  (table) => [
    // D-A3 idx 1: composite for "latest event per session per user" GET — supports DISTINCT ON / window query
    index("idx_agent_events_user_session_ts").on(
      table.userId,
      table.sessionId,
      table.eventTimestamp,
    ),
    // D-A3 idx 2: per-user listing + write-side scoping safety (symmetry with rest of schema)
    index("idx_agent_events_user_id").on(table.userId),
  ],
);
