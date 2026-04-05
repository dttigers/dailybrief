// TypeScript types for Vigil — Drizzle schema inference + legacy SQLite types

import { thoughts, thoughtLinks } from "./schema.js";

// ── Drizzle-inferred types (for PostgreSQL routes, Plans 37-02+) ────────────

export type DrizzleThought = typeof thoughts.$inferSelect;
export type NewThought = typeof thoughts.$inferInsert;

export type DrizzleThoughtLink = typeof thoughtLinks.$inferSelect;
export type NewThoughtLink = typeof thoughtLinks.$inferInsert;

// ── Validation unions (used for runtime checks) ────────────────────────────

export type ThoughtCategory =
  | "task"
  | "therapy"
  | "idea"
  | "reflection"
  | "project";

export type CaptureSource = "text" | "voice" | "image";

export type TaskStatus = "open" | "inProgress" | "done";

export type TherapyClassification = "selfLearnable" | "bringToTherapist";

export type SyncStatus = "pending" | "synced" | "pendingDeletion";

// ── Input/output types for API layer ────────────────────────────────────────

export interface ThoughtCreateInput {
  content: string;
  source: CaptureSource;
  category?: ThoughtCategory;
  tags?: string[];
}

export interface ThoughtUpdateInput {
  content?: string;
  category?: ThoughtCategory;
  taskStatus?: TaskStatus;
  therapyClassification?: TherapyClassification;
  tags?: string[];
  isFavorited?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
