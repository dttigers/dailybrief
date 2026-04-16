import type { ThoughtCategory, TherapyClassification } from "../db/types.js";

export interface TriageResult {
  category: ThoughtCategory;
  confidence: number;
  tags?: string[];
  therapyClassification?: TherapyClassification;
}

export type InsightType = "pattern" | "connection" | "actionPrompt" | "trend";

export interface Insight {
  type: InsightType;
  title: string;
  message: string;
  confidence: number;
  relatedThoughtIds: number[];
}

export interface TherapyClassificationResult {
  classification: TherapyClassification;
  confidence: number;
  reasoning: string;
}

export interface TherapyPattern {
  theme: string;
  description: string;
  frequency: number;
  trend: "increasing" | "stable" | "decreasing";
  relatedThoughtIds: number[];
  confidence: number;
}

export interface TherapyPrepItem {
  topic: string;
  context: string;
  urgency: "high" | "medium" | "low";
  relatedThoughtIds: number[];
}

export interface TherapyPrep {
  items: TherapyPrepItem[];
  overallThemes: string[];
  suggestedFocus: string;
}
