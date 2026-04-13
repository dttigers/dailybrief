// Brief assembly service — orchestrates all data sources concurrently via Promise.allSettled,
// maps results to BriefRenderData, renders a PDF, and saves it to the filesystem.
// Security: Never log Authorization headers or API keys (T-76-01).

import type {
  BriefRenderData,
  BriefCalendarEvent,
  BriefSportLeague,
  BriefWorkOrder,
  BriefThought,
  BriefInsight,
  BriefTherapyPattern,
  BriefTherapyPrep,
  PdfConfig,
} from "./pdf-types.js";
import { DEFAULT_PDF_CONFIG } from "./pdf-types.js";
import type { SportsResponse, LeagueData } from "./sports-service.js";
import type { CalendarEventsResponse, CalendarEvent } from "./calendar-service.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BriefAssemblyDeps {
  sportsService?: { fetchAllLeagues: () => Promise<SportsResponse> };
  calendarService?: { fetchTodaysEvents: () => Promise<CalendarEventsResponse> };
  pdfRenderer?: { renderBrief: (data: BriefRenderData, config?: PdfConfig) => Promise<Buffer> };
  dbClient?: any; // Drizzle db instance
  callClaudeFn?: (opts: { system: string; userMessage: string; maxTokens: number }) => Promise<string>;
  parseAIJsonFn?: <T>(raw: string) => T;
  getAIClientFn?: () => any;
  nowFn?: () => Date;
  briefsDir?: string;
}

type League = "mlb" | "nfl" | "nba" | "nhl";

// ── Mapper functions (exported for testing) ──────────────────────────────────

export function mapSports(result: PromiseSettledResult<SportsResponse>): BriefSportLeague[] {
  if (result.status === "rejected") return [];

  const { leagues } = result.value;
  const mapped: BriefSportLeague[] = [];

  for (const key of ["mlb", "nfl", "nba", "nhl"] as League[]) {
    const league = leagues[key];
    if (league.status !== "ok" || !league.data) continue;

    const data = league.data;
    const teamName = process.env[`SPORTS_${key.toUpperCase()}_TEAM_NAME`] ?? "My Team";

    mapped.push({
      sport: key,
      displayName: key.toUpperCase(),
      teamName,
      divisionName: "",
      recentGame: data.recentGame
        ? {
            homeTeam: data.recentGame.homeTeam,
            awayTeam: data.recentGame.awayTeam,
            homeScore: data.recentGame.homeScore,
            awayScore: data.recentGame.awayScore,
            result: data.recentGame.result,
            gameDate: data.recentGame.gameDate,
          }
        : null,
      upcomingGame: data.upcomingGame
        ? {
            homeTeam: data.upcomingGame.homeTeam,
            awayTeam: data.upcomingGame.awayTeam,
            isHome: data.upcomingGame.isHome,
            venue: data.upcomingGame.venue,
            gameDate: data.upcomingGame.gameDate,
            gameType: data.upcomingGame.gameType,
          }
        : null,
      standings: data.standings.map((s) => ({
        team: s.team,
        wins: s.wins,
        losses: s.losses,
        gamesBack: s.gamesBack,
        winPct: s.winPct,
        streak: s.streak,
        rank: s.rank,
      })),
    });
  }

  return mapped;
}

export function mapCalendarEvents(result: PromiseSettledResult<CalendarEventsResponse>): BriefCalendarEvent[] {
  if (result.status === "rejected") return [];

  const value = result.value;
  if (value.status !== "ok") return [];

  return value.events.map((event: CalendarEvent) => ({
    title: event.title,
    startTime: event.startTime,
    isAllDay: event.allDay,
    location: event.location ?? undefined,
    timeString: event.allDay
      ? "All Day"
      : new Date(event.startTime).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
  }));
}

export function mapWorkOrders(
  rows: Array<{
    caseNumber: string;
    store: string;
    shortDescription: string;
    trade: string;
    location: string;
    equipment: string;
    priority: string;
    contact: string;
    state: string;
    syncedAt: Date;
  }>,
  statusRows: Array<{ caseNumber: string; status: string; updatedAt: Date }>,
): BriefWorkOrder[] {
  const statusMap = new Map<string, string>();
  for (const sr of statusRows) {
    statusMap.set(sr.caseNumber, sr.status);
  }

  return rows.map((row) => ({
    caseNumber: row.caseNumber,
    store: row.store,
    shortDescription: row.shortDescription,
    trade: row.trade,
    location: row.location,
    equipment: row.equipment,
    priority: row.priority,
    contact: row.contact,
    status: (statusMap.get(row.caseNumber) ?? "open") as "open" | "inProgress" | "done",
  }));
}

export function mapThoughts(
  rows: Array<{
    id: number;
    content: string;
    category: string | null;
    source: string;
    taskStatus: string | null;
    createdAt: Date;
    [key: string]: unknown;
  }>,
): BriefThought[] {
  return rows.map((row) => ({
    content: row.content,
    category: (row.category ?? undefined) as BriefThought["category"],
    source: row.source as BriefThought["source"],
    taskStatus: (row.taskStatus ?? undefined) as BriefThought["taskStatus"],
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }));
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createBriefAssemblyService(deps: BriefAssemblyDeps = {}) {
  async function assembleAndRender(_dateStr: string): Promise<{ buffer: Buffer; filePath: string; metadata: { thoughtCount: number; taskCount: number; dateStr: string } }> {
    throw new Error("not implemented");
  }

  return { assembleAndRender };
}
