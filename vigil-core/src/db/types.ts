// TypeScript types matching the Jarvis SQLite schema

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
  tags: string | null; // JSON array stored as TEXT
  isFavorited: number;
}

export interface ThoughtLink {
  id: number;
  sourceThoughtId: number;
  targetThoughtId: number;
  createdAt: string;
}
