// ── Data types for PDF rendering ──────────────────────────────────────────────

export interface BriefWorkOrder {
  caseNumber: string;
  store: string;
  shortDescription: string;
  trade: string;
  location: string;
  equipment: string;
  priority: string;
  contact: string;
  status: "open" | "inProgress" | "done";
}

export interface BriefCalendarEvent {
  title: string;
  startTime: string;
  isAllDay: boolean;
  location?: string;
  timeString: string;
}

export interface BriefSportLeague {
  sport: string;
  displayName: string;
  teamName: string;
  divisionName: string;
  recentGame: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    result: "W" | "L" | "T" | null;
    gameDate: string;
  } | null;
  upcomingGame: {
    homeTeam: string;
    awayTeam: string;
    isHome: boolean;
    venue: string;
    gameDate: string;
    gameType: string;
  } | null;
  standings: Array<{
    team: string;
    wins: number;
    losses: number;
    gamesBack: string;
    winPct: string;
    streak: string;
    rank: number;
  }>;
}

export interface BriefThought {
  content: string;
  category?: "task" | "therapy" | "idea" | "reflection" | "project";
  source: "text" | "voice" | "image";
  taskStatus?: "open" | "inProgress" | "done";
  createdAt: string;
}

export interface BriefInsight {
  type: "pattern" | "connection" | "actionPrompt" | "trend";
  title: string;
  message: string;
}

export interface BriefTherapyItem {
  topic: string;
  context: string;
  urgency: "high" | "medium" | "low";
}

export interface BriefTherapyPrep {
  items: BriefTherapyItem[];
  suggestedFocus: string;
}

export interface BriefTherapyPattern {
  theme: string;
  trend: string;
}

export interface BriefRenderData {
  date: Date;
  workOrders: BriefWorkOrder[];
  workOrderPriorityOrder?: string[];
  taskThoughts: BriefThought[];
  calendarEvents: BriefCalendarEvent[];
  sports: BriefSportLeague[];
  affirmation: string;
  unprocessedThoughts: BriefThought[];
  recentThoughts: BriefThought[];
  insights: BriefInsight[];
  therapyPatterns: BriefTherapyPattern[];
  therapyPrep?: BriefTherapyPrep;
}

// ── Configuration types ───────────────────────────────────────────────────────

export interface PdfConfig {
  pageWidthInches: number; // default 3.75
  pageHeightInches: number; // default 7.75
  marginPoints: number; // default 12
  fontScale: number; // 0.75-1.5, default 1.0
  enabledSections: string[]; // e.g. ['workOrders','taskThoughts','calendar','sports','affirmation','thoughts','insights','therapyPrep']
}

// ── Computed layout (derived from PdfConfig) ──────────────────────────────────

export interface PdfLayout {
  pageW: number;
  pageH: number;
  margin: number;
  leftX: number;
  rightEdge: number;
  usableWidth: number;
  contentBottom: number;
  titleSize: number;
  headerSize: number;
  bodySize: number;
  smallSize: number;
  tinySize: number;
  tableRowHeight: number;
  tableHeaderHeight: number;
  checkboxSize: number;
  noteLineSpacing: number;
  innerPadding: number;
  enabledSections: Set<string>;
}

export function computeLayout(config: PdfConfig): PdfLayout {
  const scale = Math.max(0.75, Math.min(1.5, config.fontScale));
  const margin = config.marginPoints;
  const pageW = config.pageWidthInches * 72;
  const pageH = config.pageHeightInches * 72;
  return {
    pageW,
    pageH,
    margin,
    leftX: margin,
    rightEdge: pageW - margin,
    usableWidth: pageW - 2 * margin,
    contentBottom: pageH - margin,
    titleSize: 14 * scale,
    headerSize: 10 * scale,
    bodySize: 8 * scale,
    smallSize: 7 * scale,
    tinySize: 6 * scale,
    tableRowHeight: 14 * scale,
    tableHeaderHeight: 16 * scale,
    checkboxSize: 8 * scale,
    noteLineSpacing: 16 * scale,
    innerPadding: 8 * scale,
    enabledSections: new Set(config.enabledSections),
  };
}

export const DEFAULT_PDF_CONFIG: PdfConfig = {
  pageWidthInches: 3.75,
  pageHeightInches: 7.75,
  marginPoints: 12,
  fontScale: 1.0,
  enabledSections: [
    "workOrders",
    "taskThoughts",
    "calendar",
    "sports",
    "affirmation",
    "thoughts",
    "insights",
    "therapyPrep",
  ],
};
