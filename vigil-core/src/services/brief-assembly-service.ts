// Brief assembly service — orchestrates all data sources concurrently via Promise.allSettled,
// maps results to BriefRenderData, renders a PDF, and stores bytes in brief_pdfs (D-03).
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
import type { SportsResponse, SportsSelections } from "./sports-service.js";
import type { CalendarEventsResponse, CalendarEvent } from "./calendar-service.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { workOrders as workOrdersTable, workOrderStatuses as workOrderStatusesTable, thoughts as thoughtsTable, appSettings } from "../db/schema.js";
import { desc, isNull, eq as drizzleEq, gte, lt, and, ne } from "drizzle-orm";
import { getCurrentWeekWindow } from "../utils/date-window.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema.js";
import { trackEvent } from "../analytics/posthog.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BriefAssemblyDeps {
  sportsService?: { fetchAllLeagues: (selections?: SportsSelections) => Promise<SportsResponse> };
  calendarService?: { fetchTodaysEvents: (userId: number) => Promise<CalendarEventsResponse> };
  pdfRenderer?: { renderBrief: (data: BriefRenderData, config?: PdfConfig) => Promise<Buffer> };
  dbClient?: PostgresJsDatabase<typeof schema> | null; // Drizzle db instance (null when DB unavailable)
  callClaudeFn?: (opts: { system: string; userMessage: string; maxTokens: number }) => Promise<string>;
  parseAIJsonFn?: <T>(raw: string) => T;
  getAIClientFn?: () => any;
  nowFn?: () => Date;
  /**
   * Phase 116.1 SPORTS-01b D-06: PostHog telemetry hook (test seam).
   * Production: defaults to the trackEvent wrapper from analytics/posthog.js.
   * Tests: inject a capturing mock to assert event firing.
   */
  trackEventFn?: typeof trackEvent;
  // Internal: overridable for testing
  _sourceTimeoutMs?: number;
  _workOrderRows?: any[];
  _workOrderStatusRows?: any[];
  _cacheDir?: string;
}

type League = "mlb" | "nfl" | "nba" | "nhl";

const AFFIRMATION_FALLBACK = "You are capable, you are enough, and today is full of possibility.";
const AFFIRMATION_CACHE_DIR = path.join(os.homedir(), ".cache", "dailybrief");

// Phase 116 SPORTS-01 D-10: empty default when no app_settings row exists for the
// caller. sports-service short-circuits to all-disabled with zero BDL calls (D-17).
const EMPTY_SELECTIONS: SportsSelections = { enabledLeagues: [], favoriteTeams: {} };

// Phase 116.1 SPORTS-01b D-05/D-07: placeholder copies for upstream-failed leagues.
// Per-league: "{LEAGUE} data temporarily unavailable." (D-05)
// All-failed: single block when every non-disabled league errors. (D-07)
const PER_LEAGUE_FAILURE_COPY = (league: League): string =>
  `${league.toUpperCase()} data temporarily unavailable.`;
const ALL_FAILED_COPY = "Sports data temporarily unavailable. Try again on tomorrow's brief.";

// Phase 116.1 SPORTS-01b D-06: regex to extract kind from Plan 01's UpstreamError message format.
// Plan 01 sets message = `Upstream sports provider failed (${kind})` so we can recover kind for telemetry.
// Falls back to "unknown" if a non-Upstream error reached settledToResult (e.g., a synchronous throw).
const UPSTREAM_KIND_RE = /Upstream sports provider failed \((auth|server-error|timeout|rate-limited)\)/;
function extractErrorClass(errorString: string | undefined): string {
  if (!errorString) return "unknown";
  const match = errorString.match(UPSTREAM_KIND_RE);
  return match ? match[1] : "unknown";
}

// Helper: build a placeholder BriefSportLeague entry that drawSportSection (pdf-service.ts:377)
// can render without modification — recentGame=null + upcomingGame=null + standings=[] are all
// already-handled paths in the renderer (line 418 "No recent game" branch).
function buildSportsPlaceholder(sportKey: string, displayName: string, teamName: string): BriefSportLeague {
  return {
    sport: sportKey,
    displayName,
    teamName,
    divisionName: "",
    recentGame: null,
    upcomingGame: null,
    standings: [],
  };
}

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
  const orderedKeys = ["mlb", "nfl", "nba", "nhl"] as const;

  // Phase 116.1 SPORTS-01b D-07 detection: count non-disabled leagues + how many are 'error'.
  // All-failed condition: every non-disabled league is 'error' AND there's at least 1 such league.
  const nonDisabled = orderedKeys.filter((k) => leagues[k].status !== "disabled");
  const errored = nonDisabled.filter((k) => leagues[k].status === "error");
  if (nonDisabled.length > 0 && errored.length === nonDisabled.length) {
    // D-07: short-circuit to single all-failed block.
    return [buildSportsPlaceholder("all-failed", "Sports", ALL_FAILED_COPY)];
  }

  const mapped: BriefSportLeague[] = [];

  for (const key of orderedKeys) {
    const league = leagues[key];

    // Phase 116 SPORTS-01 D-15/D-18: 'disabled' status → silent omission (cascade preserved).
    // When all four leagues are disabled, mapped is empty and pdf-service's
    // `data.sports.length > 0` guard at pdf-service.ts:281 suppresses the entire
    // sports section (header + content). No renderer changes needed.
    if (league.status === "disabled") continue;

    // Phase 116.1 SPORTS-01b D-05: per-league placeholder for upstream failures.
    if (league.status === "error") {
      mapped.push(buildSportsPlaceholder(key, key.toUpperCase(), PER_LEAGUE_FAILURE_COPY(key)));
      continue;
    }

    // 'off_season' or any other non-'ok' status: continue to skip (preserve current behavior).
    if (league.status !== "ok" || !league.data) continue;

    // Happy path — UNCHANGED from existing implementation.
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

  return rows
    .map((row) => ({
      caseNumber: row.caseNumber,
      store: row.store,
      shortDescription: row.shortDescription,
      trade: row.trade,
      location: row.location,
      equipment: row.equipment,
      priority: row.priority,
      contact: row.contact,
      status: (statusMap.get(row.caseNumber) ?? "open") as "open" | "inProgress" | "done",
    }))
    .filter((wo) => wo.status !== "done");
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
  const CACHE_DIR = deps._cacheDir ?? AFFIRMATION_CACHE_DIR;
  // Phase 116.1 SPORTS-01b D-06: PostHog telemetry hook; injectable for tests.
  const trackEventImpl = deps.trackEventFn ?? trackEvent;

  // ── DB query helpers ────────────────────────────────────────────────────

  async function fetchTaskThoughts(db: any, start: Date, end: Date, userId: number): Promise<BriefThought[]> {
    try {
      const rows = await db
        .select()
        .from(getThoughtsTable())
        .where(and(drizzleEq(thoughtsTable.userId, userId), notPendingDeletion(), taskThoughtsFilter(), gte(thoughtsTable.createdAt, start), lt(thoughtsTable.createdAt, end)))
        .orderBy(thoughtsOrderDesc())
        .limit(8);
      return mapThoughts(rows);
    } catch {
      return [];
    }
  }

  async function fetchRecentThoughts(db: any, start: Date, end: Date, userId: number): Promise<BriefThought[]> {
    try {
      const rows = await db
        .select()
        .from(getThoughtsTable())
        .where(and(drizzleEq(thoughtsTable.userId, userId), notPendingDeletion(), gte(thoughtsTable.createdAt, start), lt(thoughtsTable.createdAt, end)))
        .orderBy(thoughtsOrderDesc())
        .limit(20);
      return mapThoughts(rows);
    } catch {
      return [];
    }
  }

  async function fetchUnprocessedThoughts(db: any, start: Date, end: Date, userId: number): Promise<BriefThought[]> {
    try {
      const rows = await db
        .select()
        .from(getThoughtsTable())
        .where(and(drizzleEq(thoughtsTable.userId, userId), notPendingDeletion(), unprocessedFilter(), gte(thoughtsTable.createdAt, start), lt(thoughtsTable.createdAt, end)))
        .orderBy(thoughtsOrderDesc())
        .limit(20);
      return mapThoughts(rows);
    } catch {
      return [];
    }
  }

  async function fetchWorkOrdersWithStatus(db: any, userId: number): Promise<{ workOrders: BriefWorkOrder[]; rawRows: any[] }> {
    // Check for test overrides first
    if (deps._workOrderRows) {
      const mapped = mapWorkOrders(deps._workOrderRows, deps._workOrderStatusRows ?? []);
      return { workOrders: mapped, rawRows: deps._workOrderRows };
    }
    try {
      const woRows = await db.select().from(getWorkOrdersTable()).where(and(drizzleEq(workOrdersTable.userId, userId), activeWorkOrderFilter())).limit(100);
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

  // ── Timezone helper ────────────────────────────────────────────────────

  async function getUserTimezone(db: any, userId: number): Promise<string> {
    try {
      // Phase 102: appSettings has composite PK (userId, key).
      const rows = await db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(and(drizzleEq(appSettings.userId, userId), drizzleEq(appSettings.key, "user_timezone")))
        .limit(1);
      return rows.length > 0 ? (rows[0].value as string) : "America/New_York";
    } catch {
      return "America/New_York";
    }
  }

  /**
   * Read the calling user's sports picker selections from app_settings (Phase 116 SPORTS-01).
   * Returns the empty default { enabledLeagues: [], favoriteTeams: {} } when:
   *   - no row exists (D-10 honest new-user default)
   *   - row value is corrupt or non-object (graceful degradation; brief still renders)
   *   - DB query throws (e.g. connection drop — fall back rather than crash brief generation)
   *
   * Defensive shape-check: rejects rows where value is not an object with the
   * exact keys { enabledLeagues, favoriteTeams }. The WRITE path validates at
   * Plan 01's PUT handler; this is a defense-in-depth READ.
   */
  async function getUserSportsSelections(db: any, userId: number): Promise<SportsSelections> {
    try {
      const rows = await db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(and(drizzleEq(appSettings.userId, userId), drizzleEq(appSettings.key, "sports_selections")))
        .limit(1);
      if (rows.length === 0) return EMPTY_SELECTIONS;
      const value = rows[0].value;
      if (!value || typeof value !== "object") return EMPTY_SELECTIONS;
      const v = value as { enabledLeagues?: unknown; favoriteTeams?: unknown };
      if (!Array.isArray(v.enabledLeagues) || !v.favoriteTeams || typeof v.favoriteTeams !== "object") {
        return EMPTY_SELECTIONS;
      }
      return value as SportsSelections;
    } catch {
      return EMPTY_SELECTIONS;
    }
  }

  // ── Drizzle table references (lazy to avoid import issues in tests) ────

  function getThoughtsTable() { return thoughtsTable; }
  function getWorkOrdersTable() { return workOrdersTable; }
  function getWorkOrderStatusesTable() { return workOrderStatusesTable; }
  function taskThoughtsFilter() { return drizzleEq(thoughtsTable.category, "task"); }
  function unprocessedFilter() { return isNull(thoughtsTable.category); }
  function notPendingDeletion() { return ne(thoughtsTable.syncStatus, "pendingDeletion"); }
  function activeWorkOrderFilter() { return isNull(workOrdersTable.archivedAt); }
  function thoughtsOrderDesc() { return desc(thoughtsTable.createdAt); }

  // ── Main orchestration ─────────────────────────────────────────────────

  async function assembleAndRender(dateStr: string, userId: number): Promise<{
    buffer: Buffer;
    metadata: { thoughtCount: number; taskCount: number; dateStr: string };
  }> {
    const startMs = Date.now();
    const db = deps.dbClient;

    // 0. Compute Wed-anchored week window for thought queries
    const tz = db ? await getUserTimezone(db, userId) : "America/New_York";

    // Phase 116 SPORTS-01 D-14: read per-user picker selections (single new DB query
    // before the source fan-out). Empty default when no row exists (D-10), which
    // sports-service short-circuits to all-disabled with zero BDL calls (D-17).
    const sportsSelections = db ? await getUserSportsSelections(db, userId) : EMPTY_SELECTIONS;

    const { start: weekStart, end: weekEnd } = getCurrentWeekWindow(tz);

    // 1. Fetch all sources concurrently via Promise.allSettled with per-source timeouts (T-76-02)
    //    Phase 102: all DB queries scoped by userId (per-user brief).
    //    Phase 116 SPORTS-01 D-14: sports fetch threads per-user selections.
    const [sportsR, calendarR, thoughtsR, workOrdersR, affirmationR] = await Promise.allSettled([
      deps.sportsService
        ? withTimeout(deps.sportsService.fetchAllLeagues(sportsSelections), SOURCE_TIMEOUT_MS)
        : Promise.reject(new Error("No sports service")),
      deps.calendarService
        ? withTimeout(deps.calendarService.fetchTodaysEvents(userId), SOURCE_TIMEOUT_MS)
        : Promise.reject(new Error("No calendar service")),
      db
        ? withTimeout(
            (async () => {
              const [task, recent, unprocessed] = await Promise.all([
                fetchTaskThoughts(db, weekStart, weekEnd, userId),
                fetchRecentThoughts(db, weekStart, weekEnd, userId),
                fetchUnprocessedThoughts(db, weekStart, weekEnd, userId),
              ]);
              return { taskThoughts: task, recentThoughts: recent, unprocessedThoughts: unprocessed };
            })(),
            SOURCE_TIMEOUT_MS,
          )
        : Promise.resolve({ taskThoughts: [] as BriefThought[], recentThoughts: [] as BriefThought[], unprocessedThoughts: [] as BriefThought[] }),
      db
        ? withTimeout(fetchWorkOrdersWithStatus(db, userId), SOURCE_TIMEOUT_MS)
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

    // Phase 116.1 SPORTS-01b D-06: emit a PostHog event per failed league for cohort/funnel analytics.
    // Orthogonal to the console.log above: that fires when the entire Promise rejected (catastrophic
    // failure); this fires per-league inside a fulfilled SportsResponse (partial failures).
    // Property names use snake_case per Phase 105 PostHog convention (D-01..D-04 type contract).
    // T-73-01 preserved: properties are enum literals only — no URL, no apiKey, no BDL response body.
    if (sportsR.status === "fulfilled") {
      const sportsValue = sportsR.value as SportsResponse;
      for (const key of ["mlb", "nfl", "nba", "nhl"] as const) {
        const lr = sportsValue.leagues[key];
        if (lr.status === "error") {
          trackEventImpl(userId, "sports_league_fetch_failed", {
            league: key,
            status: "error",
            error_class: extractErrorClass(lr.error),
          });
        }
      }
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

    // 7. Log timing
    const totalMs = Date.now() - startMs;
    console.log(`[brief-assembly] Total: ${totalMs}ms`);
    if (totalMs > 10_000) {
      console.log(`[brief-assembly] WARNING: Assembly took ${totalMs}ms (>10s)`);
    }

    const thoughtCount = thoughtsData.recentThoughts.length;
    const taskCount = thoughtsData.taskThoughts.filter((t) => t.taskStatus === "open" || t.taskStatus === "inProgress").length;

    return {
      buffer,
      metadata: { thoughtCount, taskCount, dateStr },
    };
  }

  return { assembleAndRender };
}
