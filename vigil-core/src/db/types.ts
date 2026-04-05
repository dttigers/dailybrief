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

// ── Legacy types (for existing SQLite routes — removed in Plan 37-04) ───────

export interface Thought {
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
  tags: string | null; // JSON array stored as TEXT in SQLite
  isFavorited: number;
}

export interface ThoughtLink {
  id: number;
  sourceThoughtId: number;
  targetThoughtId: number;
  createdAt: string;
}

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

export interface ThoughtResponse
  extends Omit<Thought, "tags"> {
  tags: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
