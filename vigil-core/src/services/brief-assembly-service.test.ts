import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  mapSports,
  mapCalendarEvents,
  mapWorkOrders,
  mapThoughts,
} from "./brief-assembly-service.js";
import type { SportsResponse } from "./sports-service.js";
import type { CalendarEventsResponse, CalendarEvent } from "./calendar-service.js";

// ── Orchestration tests (Task 2) ────────────────────────────────────────────

describe("assembleAndRender orchestration", () => {
  test.todo("Test 1: happy path — all deps return valid data");
  test.todo("Test 2: sports failure — still succeeds with sports = []");
  test.todo("Test 3: calendar needs_reauth — still succeeds with calendarEvents = []");
  test.todo("Test 4: all external sources fail — still returns valid buffer");
  test.todo("Test 8: per-source timeout — wrapped in Promise.race 10s");
  test.todo("Test 9: filesystem write — PDF buffer written to BRIEFS_DIR");
  test.todo("Test 10: prioritization included when work orders exist");
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
