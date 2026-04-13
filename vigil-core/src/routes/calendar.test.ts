import { test } from "node:test";
import assert from "node:assert/strict";

// ── Environment Setup ─────────────────────────────────────────────────────────
process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { createCalendarRouter } from "./calendar.js";
import type { CalendarServiceDeps } from "../services/calendar-service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CANNED_EVENTS_RESPONSE = {
  status: "ok" as const,
  events: [
    {
      id: "event1",
      title: "Team Standup",
      startTime: "2026-04-12T09:00:00-04:00",
      endTime: "2026-04-12T09:30:00-04:00",
      allDay: false,
      location: "Conference Room A",
      calendarId: "primary@gmail.com",
      calendarName: "primary@gmail.com",
      calendarColor: null,
    },
  ],
  fetchedAt: "2026-04-12T13:00:00.000Z",
};

const CANNED_LIST_RESPONSE = {
  status: "ok" as const,
  calendars: [
    { id: "primary@gmail.com", name: "Personal", color: "#4285f4", primary: true },
    { id: "work@company.com", name: "Work", color: "#0b8043", primary: false },
  ],
};

// ── Mock dep factories ────────────────────────────────────────────────────────

function makeOkDeps(): CalendarServiceDeps {
  return {
    dbSelectFn: async () => ({
      id: 1,
      provider: "google",
      encryptedRefreshToken: "ignored-in-route-tests",
      accessToken: "mock-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      calendarSelections: ["primary@gmail.com"],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    dbUpdateFn: async () => {},
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "event1",
              summary: "Team Standup",
              start: { dateTime: "2026-04-12T09:00:00-04:00" },
              end: { dateTime: "2026-04-12T09:30:00-04:00" },
              location: "Conference Room A",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  };
}

function makeReauthDeps(): CalendarServiceDeps {
  return {
    // null row → TokenNotFoundError → needs_reauth
    dbSelectFn: async () => null,
  };
}

function makeErrorDeps(): CalendarServiceDeps {
  return {
    dbSelectFn: async () => ({
      id: 1,
      provider: "google",
      encryptedRefreshToken: "ignored",
      accessToken: "mock-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      calendarSelections: ["primary@gmail.com"],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    dbUpdateFn: async () => {},
    fetchFn: async () => {
      throw new TypeError("fetch failed");
    },
  };
}

function makeCalendarListDeps(): CalendarServiceDeps {
  return {
    dbSelectFn: async () => ({
      id: 1,
      provider: "google",
      encryptedRefreshToken: "ignored",
      accessToken: "mock-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      calendarSelections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    dbUpdateFn: async () => {},
    fetchFn: async (url: string) => {
      if (url.includes("calendarList")) {
        return new Response(
          JSON.stringify({
            items: [
              { id: "primary@gmail.com", summary: "Personal", backgroundColor: "#4285f4", primary: true },
              { id: "work@company.com", summary: "Work", backgroundColor: "#0b8043", primary: false },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      // Return events for specific calendars
      return new Response(
        JSON.stringify({ items: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("CAL-03-events-route: GET /calendar/events returns 200 with { status: ok, events: [...], fetchedAt }", async () => {
  const app = createCalendarRouter(makeOkDeps());
  const res = await app.request("/calendar/events");

  assert.equal(res.status, 200);
  const json = await res.json() as { status: string; events: unknown[]; fetchedAt: string };
  assert.equal(json.status, "ok");
  assert.ok(Array.isArray(json.events), "events must be an array");
  assert.ok(typeof json.fetchedAt === "string", "fetchedAt must be a string");
});

test("CAL-03-events-reauth: GET /calendar/events when service returns needs_reauth returns 200 with { status: needs_reauth }", async () => {
  const app = createCalendarRouter(makeReauthDeps());
  const res = await app.request("/calendar/events");

  assert.equal(res.status, 200);
  const json = await res.json() as { status: string };
  assert.equal(json.status, "needs_reauth");
});

test("CAL-03-events-error: GET /calendar/events when service returns error returns 200 with { status: error, error: ... }", async () => {
  const app = createCalendarRouter(makeErrorDeps());
  const res = await app.request("/calendar/events");

  assert.equal(res.status, 200);
  const json = await res.json() as { status: string; error?: string };
  assert.equal(json.status, "error");
  assert.ok(typeof json.error === "string", "error field must be a string");
});

test("CAL-03-list-route: GET /calendar/list returns 200 with { status: ok, calendars: [...] }", async () => {
  const deps: CalendarServiceDeps = {
    dbSelectFn: async () => ({
      id: 1,
      provider: "google",
      encryptedRefreshToken: "ignored",
      accessToken: "mock-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      calendarSelections: ["primary@gmail.com"],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    dbUpdateFn: async () => {},
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          items: [
            { id: "primary@gmail.com", summary: "Personal", backgroundColor: "#4285f4", primary: true },
            { id: "work@company.com", summary: "Work", backgroundColor: "#0b8043", primary: false },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  };

  const app = createCalendarRouter(deps);
  const res = await app.request("/calendar/list");

  assert.equal(res.status, 200);
  const json = await res.json() as { status: string; calendars: unknown[] };
  assert.equal(json.status, "ok");
  assert.ok(Array.isArray(json.calendars), "calendars must be an array");
  assert.equal(json.calendars.length, 2);
});

test("CAL-03-list-reauth: GET /calendar/list when service returns needs_reauth returns 200 with { status: needs_reauth }", async () => {
  const app = createCalendarRouter(makeReauthDeps());
  const res = await app.request("/calendar/list");

  assert.equal(res.status, 200);
  const json = await res.json() as { status: string };
  assert.equal(json.status, "needs_reauth");
});
