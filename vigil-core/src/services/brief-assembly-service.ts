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
import type { SportsResponse } from "./sports-service.js";
import type { CalendarEventsResponse, CalendarEvent } from "./calendar-service.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { workOrders as workOrdersTable, workOrderStatuses as workOrderStatusesTable, thoughts as thoughtsTable } from "../db/schema.js";
import { desc, isNull, eq as drizzleEq } from "drizzle-orm";

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
  // Internal: overridable for testing
  _sourceTimeoutMs?: number;
  _workOrderRows?: any[];
  _workOrderStatusRows?: any[];
  _cacheDir?: string;
}

type League = "mlb" | "nfl" | "nba" | "nhl";

const AFFIRMATION_FALLBACK = "You are capable, you are enough, and today is full of possibility.";
const AFFIRMATION_CACHE_DIR = path.join(os.homedir(), ".cache", "dailybrief");

// ── Timeout helper (T-76-02 mitigation) ──────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("Source timeout")), ms),
    ),
  ]);
}

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
  const SOURCE_TIMEOUT_MS = deps._sourceTimeoutMs ?? 10_000;
  const BRIEFS_DIR = deps.briefsDir ?? process.env.BRIEFS_DIR ?? "/tmp/briefs";
  const CACHE_DIR = deps._cacheDir ?? AFFIRMATION_CACHE_DIR;

  // ── DB query helpers ────────────────────────────────────────────────────

  async function fetchTaskThoughts(db: any): Promise<BriefThought[]> {
    try {
      const rows = await db
        .select()
        .from(getThoughtsTable())
        .where(taskThoughtsFilter())
        .orderBy(thoughtsOrderDesc())
        .limit(8);
      return mapThoughts(rows);
    } catch {
      return [];
    }
  }

  async function fetchRecentThoughts(db: any): Promise<BriefThought[]> {
    try {
      const rows = await db
        .select()
        .from(getThoughtsTable())
        .orderBy(thoughtsOrderDesc())
        .limit(20);
      return mapThoughts(rows);
    } catch {
      return [];
    }
  }

  async function fetchUnprocessedThoughts(db: any): Promise<BriefThought[]> {
    try {
      const rows = await db
        .select()
        .from(getThoughtsTable())
        .where(unprocessedFilter())
        .orderBy(thoughtsOrderDesc())
        .limit(20);
      return mapThoughts(rows);
    } catch {
      return [];
    }
  }

  async function fetchWorkOrdersWithStatus(db: any): Promise<{ workOrders: BriefWorkOrder[]; rawRows: any[] }> {
    // Check for test overrides first
    if (deps._workOrderRows) {
      const mapped = mapWorkOrders(deps._workOrderRows, deps._workOrderStatusRows ?? []);
      return { workOrders: mapped, rawRows: deps._workOrderRows };
    }
    try {
      const woRows = await db.select().from(getWorkOrdersTable()).limit(100);
      const statusRows = await db.select().from(getWorkOrderStatusesTable()).limit(100);
      const mapped = mapWorkOrders(woRows, statusRows);
      return { workOrders: mapped, rawRows: woRows };
    } catch {
      return { workOrders: [], rawRows: [] };
    }
  }

  // ── Affirmation with filesystem cache ──────────────────────────────────

  async function fetchAffirmation(recentThoughts: BriefThought[], dateStr: string): Promise<string> {
    // Check filesystem cache first
    const cacheFile = path.join(CACHE_DIR, `affirmation-${dateStr}.txt`);
    try {
      if (fs.existsSync(cacheFile)) {
        return fs.readFileSync(cacheFile, "utf-8");
      }
    } catch {
      // Cache read failure is non-fatal
    }

    // Try calling Claude
    const callClaudeFn = deps.callClaudeFn;
    if (!callClaudeFn) return AFFIRMATION_FALLBACK;

    try {
      let system = "Generate a brief, warm ADHD-specific affirmation (2-3 sentences). Be encouraging but not patronizing.";
      if (recentThoughts.length > 0) {
        const truncated = recentThoughts
          .slice(0, 5)
          .map((t) => t.content.slice(0, 50))
          .join("\n");
        system += `\n\nRecent thoughts:\n${truncated}`;
      }
      system += "\n\nReturn only the affirmation text.";

      const text = await callClaudeFn({
        system,
        userMessage: "Give me today's ADHD affirmation.",
        maxTokens: 200,
      });

      // Write cache
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, text, "utf-8");
      } catch {
        // Cache write failure is non-fatal
      }

      return text;
    } catch {
      return AFFIRMATION_FALLBACK;
    }
  }

  // ── Prioritization with filesystem cache ───────────────────────────────

  async function fetchPrioritization(workOrders: BriefWorkOrder[], dateStr: string): Promise<string[] | undefined> {
    if (workOrders.length === 0) return undefined;

    const getAIClientFn = deps.getAIClientFn;
    if (!getAIClientFn || !getAIClientFn()) return undefined;

    const callClaudeFn = deps.callClaudeFn;
    const parseAIJsonFn = deps.parseAIJsonFn;
    if (!callClaudeFn || !parseAIJsonFn) return undefined;

    // Check filesystem cache
    const caseNumbers = workOrders.map((wo) => wo.caseNumber).sort();
    const hash = crypto.createHash("md5").update(JSON.stringify(caseNumbers)).digest("hex");
    const cacheFile = path.join(CACHE_DIR, `wo-priority-${dateStr}-${hash}.json`);

    try {
      if (fs.existsSync(cacheFile)) {
        return JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as string[];
      }
    } catch {
      // Cache miss
    }

    try {
      const formatted = workOrders
        .map((wo, i) => `${i + 1}. Case: ${wo.caseNumber}\n   Store: ${wo.store}\n   Description: ${wo.shortDescription}\n   Trade: ${wo.trade}\n   Priority: ${wo.priority}`)
        .join("\n\n");

      const raw = await callClaudeFn({
        system: "You are a facilities management assistant. Analyze these work orders and rank them by urgency. Respond with ONLY a JSON array of case numbers in priority order (highest urgency first).",
        userMessage: formatted,
        maxTokens: 500,
      });

      const prioritized = parseAIJsonFn<string[]>(raw);

      // Write cache
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(prioritized));
      } catch {
        // Cache write failure is non-fatal
      }

      return prioritized;
    } catch {
      return undefined;
    }
  }

  // ── Insights generation ────────────────────────────────────────────────

  async function fetchInsights(recentThoughts: BriefThought[]): Promise<BriefInsight[]> {
    if (recentThoughts.length < 3) return [];

    const getAIClientFn = deps.getAIClientFn;
    if (!getAIClientFn || !getAIClientFn()) return [];

    const callClaudeFn = deps.callClaudeFn;
    const parseAIJsonFn = deps.parseAIJsonFn;
    if (!callClaudeFn || !parseAIJsonFn) return [];

    try {
      const thoughtList = recentThoughts
        .map((t, i) => `[${i}] (${t.category ?? "uncategorized"}) ${t.content}`)
        .join("\n");

      const raw = await callClaudeFn({
        system: "You are a personal insight engine for someone with ADHD. Analyze their recent captured thoughts and surface useful patterns, connections, and actionable suggestions. Return a JSON array of insights.",
        userMessage: `Thoughts:\n${thoughtList}\n\nReturn JSON array: [{"type":"pattern|connection|actionPrompt|trend","title":"...","message":"..."}]`,
        maxTokens: 1024,
      });

      const parsed = parseAIJsonFn<Array<{ type: string; title: string; message: string }>>(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item) => ({
        type: item.type as BriefInsight["type"],
        title: item.title,
        message: item.message,
      }));
    } catch {
      return [];
    }
  }

  // ── Drizzle table references (lazy to avoid import issues in tests) ────

  function getThoughtsTable() { return thoughtsTable; }
  function getWorkOrdersTable() { return workOrdersTable; }
  function getWorkOrderStatusesTable() { return workOrderStatusesTable; }
  function taskThoughtsFilter() { return drizzleEq(thoughtsTable.category, "task"); }
  function unprocessedFilter() { return isNull(thoughtsTable.category); }
  function thoughtsOrderDesc() { return desc(thoughtsTable.createdAt); }

  // ── Main orchestration ─────────────────────────────────────────────────

  async function assembleAndRender(dateStr: string): Promise<{
    buffer: Buffer;
    filePath: string;
    metadata: { thoughtCount: number; taskCount: number; dateStr: string };
  }> {
    const startMs = Date.now();
    const db = deps.dbClient;

    // 1. Fetch all sources concurrently via Promise.allSettled with per-source timeouts (T-76-02)
    const [sportsR, calendarR, thoughtsR, workOrdersR, affirmationR] = await Promise.allSettled([
      deps.sportsService
        ? withTimeout(deps.sportsService.fetchAllLeagues(), SOURCE_TIMEOUT_MS)
        : Promise.reject(new Error("No sports service")),
      deps.calendarService
        ? withTimeout(deps.calendarService.fetchTodaysEvents(), SOURCE_TIMEOUT_MS)
        : Promise.reject(new Error("No calendar service")),
      db
        ? withTimeout(
            (async () => {
              const [task, recent, unprocessed] = await Promise.all([
                fetchTaskThoughts(db),
                fetchRecentThoughts(db),
                fetchUnprocessedThoughts(db),
              ]);
              return { taskThoughts: task, recentThoughts: recent, unprocessedThoughts: unprocessed };
            })(),
            SOURCE_TIMEOUT_MS,
          )
        : Promise.resolve({ taskThoughts: [] as BriefThought[], recentThoughts: [] as BriefThought[], unprocessedThoughts: [] as BriefThought[] }),
      db
        ? withTimeout(fetchWorkOrdersWithStatus(db), SOURCE_TIMEOUT_MS)
        : Promise.resolve({ workOrders: [] as BriefWorkOrder[], rawRows: [] }),
      // Affirmation needs recent thoughts — we'll fetch it after thoughts settle
      Promise.resolve(null), // placeholder — will fetch affirmation after
    ]);

    // 2. Extract results from settled promises
    const sports = mapSports(sportsR as PromiseSettledResult<SportsResponse>);
    const calendarEvents = mapCalendarEvents(calendarR as PromiseSettledResult<CalendarEventsResponse>);

    // Log failed sources by name (never log credentials)
    if (sportsR.status === "rejected") {
      console.log(`[brief-assembly] Sports source failed: ${sportsR.reason instanceof Error ? sportsR.reason.message : "unknown"}`);
    }
    if (calendarR.status === "rejected") {
      console.log(`[brief-assembly] Calendar source failed: ${calendarR.reason instanceof Error ? calendarR.reason.message : "unknown"}`);
    }

    const thoughtsData = thoughtsR.status === "fulfilled"
      ? thoughtsR.value
      : { taskThoughts: [] as BriefThought[], recentThoughts: [] as BriefThought[], unprocessedThoughts: [] as BriefThought[] };

    if (thoughtsR.status === "rejected") {
      console.log(`[brief-assembly] Thoughts source failed: ${thoughtsR.reason instanceof Error ? thoughtsR.reason.message : "unknown"}`);
    }

    const woData = workOrdersR.status === "fulfilled"
      ? workOrdersR.value
      : { workOrders: [] as BriefWorkOrder[], rawRows: [] };

    if (workOrdersR.status === "rejected") {
      console.log(`[brief-assembly] Work orders source failed: ${workOrdersR.reason instanceof Error ? workOrdersR.reason.message : "unknown"}`);
    }

    // 3. Post-allSettled: fetch affirmation (needs recent thoughts)
    const affirmation = await fetchAffirmation(thoughtsData.recentThoughts, dateStr);

    // 4. Post-allSettled conditional calls: prioritization and insights
    const workOrderPriorityOrder = await fetchPrioritization(woData.workOrders, dateStr);
    const insights = await fetchInsights(thoughtsData.recentThoughts);

    // 5. Assemble BriefRenderData
    const data: BriefRenderData = {
      date: new Date(dateStr),
      workOrders: woData.workOrders,
      workOrderPriorityOrder,
      taskThoughts: thoughtsData.taskThoughts,
      calendarEvents,
      sports,
      affirmation,
      unprocessedThoughts: thoughtsData.unprocessedThoughts,
      recentThoughts: thoughtsData.recentThoughts,
      insights,
      therapyPatterns: [], // v1: skipped to keep latency bounded
      therapyPrep: undefined, // v1: skipped to keep latency bounded
    };

    // 6. Render PDF
    let buffer: Buffer;
    if (deps.pdfRenderer) {
      buffer = await deps.pdfRenderer.renderBrief(data, DEFAULT_PDF_CONFIG);
    } else {
      // Production: import and create renderer
      const { createPdfRenderer } = await import("./pdf-service.js");
      const renderer = createPdfRenderer();
      buffer = await renderer.renderBrief(data, DEFAULT_PDF_CONFIG);
    }

    // 7. Save to filesystem
    await fs.promises.mkdir(BRIEFS_DIR, { recursive: true });
    const filePath = path.join(BRIEFS_DIR, `brief-${dateStr}.pdf`);
    await fs.promises.writeFile(filePath, buffer);

    // 8. Log timing
    const totalMs = Date.now() - startMs;
    console.log(`[brief-assembly] Total: ${totalMs}ms`);
    if (totalMs > 10_000) {
      console.log(`[brief-assembly] WARNING: Assembly took ${totalMs}ms (>10s)`);
    }

    const thoughtCount = thoughtsData.recentThoughts.length;
    const taskCount = thoughtsData.taskThoughts.filter((t) => t.taskStatus === "open" || t.taskStatus === "inProgress").length;

    return {
      buffer,
      filePath,
      metadata: { thoughtCount, taskCount, dateStr },
    };
  }

  return { assembleAndRender };
}
