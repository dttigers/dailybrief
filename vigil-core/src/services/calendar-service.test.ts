import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptToken } from "../utils/token-crypto.js";

// ── Environment Setup ─────────────────────────────────────────────────────────
// Must be set before importing calendar-service (token-crypto reads it at call time)
process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import {
  createCalendarService,
} from "./calendar-service.js";
import type {
  CalendarServiceDeps,
  CalendarEventsResponse,
  CalendarListResponse,
} from "./calendar-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENCRYPTED_REFRESH = encryptToken("mock-refresh-token");
const FUTURE_EXPIRY = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
const PAST_EXPIRY = new Date(Date.now() - 60 * 1000);        // 1 minute ago

const VALID_TOKEN_ROW = {
  id: 1,
  provider: "google",
  encryptedRefreshToken: ENCRYPTED_REFRESH,
  accessToken: "mock-access-token",
  expiresAt: FUTURE_EXPIRY,
  calendarSelections: ["primary@gmail.com"] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const CALENDAR_EVENTS_RESPONSE = {
  items: [
    {
      id: "event1",
      summary: "Team Standup",
      start: { dateTime: "2026-04-12T09:00:00-04:00" },
      end: { dateTime: "2026-04-12T09:30:00-04:00" },
      location: "Conference Room A",
    },
    {
      id: "event2",
      summary: "Company Holiday",
      start: { date: "2026-04-12" },
      end: { date: "2026-04-13" },
      location: null,
    },
  ],
};

const CALENDAR_LIST_RESPONSE = {
  items: [
    { id: "primary@gmail.com", summary: "Personal", backgroundColor: "#4285f4", primary: true },
    { id: "work@company.com", summary: "Work", backgroundColor: "#0b8043", primary: false },
  ],
};

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeCalendarFetch(calendarId: string, body: unknown, status = 200): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url: string) => {
    if (url.includes(`calendars/${calendarId}/events`) || url.includes("calendarList")) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };
}

function makeThrowingFetch(errorMsg: string): (url: string, init?: RequestInit) => Promise<Response> {
  return async () => {
    throw new TypeError(errorMsg);
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("CAL-02-no-token-row: when no oauth_tokens row exists for 'google', service returns needs_reauth", async () => {
  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => null,
  };
  const service = createCalendarService(deps);
  const result = await service.fetchTodaysEvents(1);

  assert.equal(result.status, "needs_reauth");
});

test("CAL-02-no-refresh-needed: when access token expiresAt is 1 hour in the future, service uses existing access token without refreshing", async () => {
  let refreshCalled = false;

  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({ ...VALID_TOKEN_ROW, calendarSelections: ["primary@gmail.com"] }),
    dbUpdateFn: async () => {},
    refreshFn: async () => {
      refreshCalled = true;
      return { access_token: "new-token", expiry_date: null };
    },
    fetchFn: async (url: string) => {
      return new Response(JSON.stringify(CALENDAR_EVENTS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };

  const service = createCalendarService(deps);
  const result = await service.fetchTodaysEvents(1);

  assert.equal(refreshCalled, false, "refreshFn must NOT be called when token is still valid");
  assert.equal(result.status, "ok");
});

test("CAL-02-refresh: when access token expiresAt is in the past, service refreshes before fetching events", async () => {
  let refreshCalled = false;
  let dbUpdateCalled = false;
  const newAccessToken = "refreshed-access-token";

  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({
      ...VALID_TOKEN_ROW,
      accessToken: "old-expired-token",
      expiresAt: PAST_EXPIRY,
      calendarSelections: ["primary@gmail.com"],
    }),
    dbUpdateFn: async (accessToken: string) => {
      dbUpdateCalled = true;
      assert.equal(accessToken, newAccessToken, "dbUpdateFn must be called with the new access token");
    },
    refreshFn: async () => {
      refreshCalled = true;
      return { access_token: newAccessToken, expiry_date: Date.now() + 3600000 };
    },
    fetchFn: async () => {
      return new Response(JSON.stringify(CALENDAR_EVENTS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };

  const service = createCalendarService(deps);
  const result = await service.fetchTodaysEvents(1);

  assert.equal(refreshCalled, true, "refreshFn must be called when token is expired");
  assert.equal(dbUpdateCalled, true, "dbUpdateFn must be called after refresh");
  assert.equal(result.status, "ok");
});

test("CAL-02-refresh-failure: when refreshAccessToken throws (revoked token), service returns needs_reauth", async () => {
  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({
      ...VALID_TOKEN_ROW,
      expiresAt: PAST_EXPIRY,
    }),
    dbUpdateFn: async () => {},
    refreshFn: async () => {
      throw new Error("Token has been revoked");
    },
    fetchFn: async () => new Response("{}", { status: 200 }),
  };

  const service = createCalendarService(deps);
  const result = await service.fetchTodaysEvents(1);

  assert.equal(result.status, "needs_reauth");
});

test("CAL-03-events: fetchTodaysEvents returns events in CalendarEvent shape", async () => {
  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({ ...VALID_TOKEN_ROW, calendarSelections: ["primary@gmail.com"] }),
    dbUpdateFn: async () => {},
    fetchFn: async () => {
      return new Response(JSON.stringify(CALENDAR_EVENTS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };

  const service = createCalendarService(deps);
  const result = await service.fetchTodaysEvents(1) as { status: "ok"; events: unknown[]; fetchedAt: string };

  assert.equal(result.status, "ok");
  assert.ok(Array.isArray(result.events), "events must be an array");
  assert.ok(result.events.length > 0, "events must not be empty");
  assert.ok(typeof result.fetchedAt === "string", "fetchedAt must be a string");

  const event = result.events[0] as {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    location: string | null;
    calendarId: string;
    calendarName: string;
    calendarColor: string | null;
  };
  assert.ok(typeof event.id === "string", "event.id must be a string");
  assert.ok(typeof event.title === "string", "event.title must be a string");
  assert.ok(typeof event.startTime === "string", "event.startTime must be a string");
  assert.ok(typeof event.endTime === "string", "event.endTime must be a string");
  assert.ok(typeof event.allDay === "boolean", "event.allDay must be a boolean");
});

test("CAL-03-allday: when Google returns event with start.date (no start.dateTime), event has allDay=true", async () => {
  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({ ...VALID_TOKEN_ROW, calendarSelections: ["primary@gmail.com"] }),
    dbUpdateFn: async () => {},
    fetchFn: async () => {
      return new Response(JSON.stringify(CALENDAR_EVENTS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };

  const service = createCalendarService(deps);
  const result = await service.fetchTodaysEvents(1) as { status: "ok"; events: Array<{ id: string; allDay: boolean; startTime: string }> };

  assert.equal(result.status, "ok");
  const allDayEvent = result.events.find((e) => e.id === "event2");
  assert.ok(allDayEvent, "all-day event (event2) must be present");
  assert.equal(allDayEvent.allDay, true, "all-day event must have allDay=true");
  assert.ok(typeof allDayEvent.startTime === "string", "all-day event must have startTime set from start.date");
});

test("CAL-03-network-error: when fetch to Google Calendar API throws network error, service returns error status", async () => {
  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({ ...VALID_TOKEN_ROW, calendarSelections: ["primary@gmail.com"] }),
    dbUpdateFn: async () => {},
    fetchFn: makeThrowingFetch("fetch failed"),
  };

  const service = createCalendarService(deps);
  const result = await service.fetchTodaysEvents(1) as { status: string; error?: string };

  assert.equal(result.status, "error");
  assert.ok(typeof result.error === "string", "error must be a string message");
});

test("CAL-03-selected-calendars: when calendarSelections has specific IDs, only those calendars are fetched", async () => {
  const fetchedUrls: string[] = [];

  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({
      ...VALID_TOKEN_ROW,
      calendarSelections: ["primary@gmail.com", "work@company.com"],
    }),
    dbUpdateFn: async () => {},
    fetchFn: async (url: string) => {
      fetchedUrls.push(url);
      return new Response(JSON.stringify(CALENDAR_EVENTS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };

  const service = createCalendarService(deps);
  await service.fetchTodaysEvents(1);

  // Should fetch events for each selected calendar (no calendarList call)
  const calendarFetches = fetchedUrls.filter((u) => u.includes("calendars/") && u.includes("/events"));
  assert.equal(calendarFetches.length, 2, "should fetch events for exactly the 2 selected calendars");
  const calendarListFetches = fetchedUrls.filter((u) => u.includes("calendarList"));
  assert.equal(calendarListFetches.length, 0, "should NOT call calendarList when selections are specified");
});

test("CAL-03-no-selection: when calendarSelections is empty, all calendars are fetched via calendarList", async () => {
  const fetchedUrls: string[] = [];

  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({
      ...VALID_TOKEN_ROW,
      calendarSelections: [],
    }),
    dbUpdateFn: async () => {},
    fetchFn: async (url: string) => {
      fetchedUrls.push(url);
      // Return calendar list for calendarList requests
      if (url.includes("calendarList")) {
        return new Response(JSON.stringify(CALENDAR_LIST_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Return events for events requests
      return new Response(JSON.stringify(CALENDAR_EVENTS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };

  const service = createCalendarService(deps);
  await service.fetchTodaysEvents(1);

  const calendarListFetches = fetchedUrls.filter((u) => u.includes("calendarList"));
  assert.equal(calendarListFetches.length, 1, "should call calendarList exactly once when selections is empty");

  const calendarFetches = fetchedUrls.filter((u) => u.includes("calendars/") && u.includes("/events"));
  assert.equal(calendarFetches.length, 2, "should fetch events for all calendars from list (2 in fixture)");
});

test("CAL-03-calendar-list: fetchCalendarList returns CalendarInfo[] with id, name, color, primary", async () => {
  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({ ...VALID_TOKEN_ROW }),
    dbUpdateFn: async () => {},
    fetchFn: async () => {
      return new Response(JSON.stringify(CALENDAR_LIST_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };

  const service = createCalendarService(deps);
  const result = await service.fetchCalendarList(1) as {
    status: "ok";
    calendars: Array<{ id: string; name: string; color: string | null; primary: boolean }>;
  };

  assert.equal(result.status, "ok");
  assert.ok(Array.isArray(result.calendars), "calendars must be an array");
  assert.equal(result.calendars.length, 2);

  const primary = result.calendars[0];
  assert.equal(primary.id, "primary@gmail.com");
  assert.equal(primary.name, "Personal");
  assert.equal(primary.color, "#4285f4");
  assert.equal(primary.primary, true);

  const work = result.calendars[1];
  assert.equal(work.id, "work@company.com");
  assert.equal(work.name, "Work");
  assert.equal(work.primary, false);
});

test("CAL-SCHED-01-userid-required: fetchTodaysEvents requires a userId parameter (Phase 109 D-11)", async () => {
  // Signature-level test: fetchTodaysEvents/fetchCalendarList take a userId.
  // The internal seed-user resolver was removed; callers must supply userId.
  // This is a forcing-function test — if the signature regresses to zero-arg,
  // TypeScript compile fails before this test can run.
  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({ ...VALID_TOKEN_ROW, calendarSelections: ["primary@gmail.com"] }),
    dbUpdateFn: async () => {},
    fetchFn: async () =>
      new Response(JSON.stringify(CALENDAR_EVENTS_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  };

  const service = createCalendarService(deps);

  // Verify the runtime signature accepts a numeric userId without throwing.
  const eventsResult = await service.fetchTodaysEvents(42);
  assert.equal(eventsResult.status, "ok");

  const listResult = await service.fetchCalendarList(42);
  assert.equal(listResult.status, "ok");
});
