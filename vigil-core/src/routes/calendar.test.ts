import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

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

// ── Phase 115 CAL-01: PUT /calendar/selections ────────────────────────────────

function makeSelectionsDeps(): { deps: CalendarServiceDeps; calls: Array<{ userId: number; ids: string[] }> } {
  const calls: Array<{ userId: number; ids: string[] }> = [];
  const deps: CalendarServiceDeps = {
    dbSetCalendarSelectionsFn: async (userId, ids) => { calls.push({ userId, ids }); },
  };
  return { deps, calls };
}

// Wrap the router in an outer Hono app that pre-sets userId so that the
// route handler's `c.get("userId")` resolves to a known value (mirrors the
// global bearerAuth dispatcher behavior in production index.ts).
function makeAppWithUserId(deps: CalendarServiceDeps, userId = 1): Hono {
  const inner = createCalendarRouter(deps);
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId" as never, userId as never);
    await next();
  });
  app.route("/", inner);
  return app;
}

test("CAL-01-put-happy: PUT /calendar/selections with valid body returns 200 and persists ids", async () => {
  const { deps, calls } = makeSelectionsDeps();
  const app = makeAppWithUserId(deps);
  const res = await app.request("/calendar/selections", {
    method: "PUT",
    body: JSON.stringify({ selectedCalendarIds: ["a", "b"] }),
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(res.status, 200);
  const json = await res.json() as { ok: boolean };
  assert.equal(json.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 1);
  assert.deepEqual(calls[0].ids, ["a", "b"]);
});

test("CAL-01-put-empty: PUT /calendar/selections with empty array returns 200 and persists []", async () => {
  const { deps, calls } = makeSelectionsDeps();
  const app = makeAppWithUserId(deps);
  const res = await app.request("/calendar/selections", {
    method: "PUT",
    body: JSON.stringify({ selectedCalendarIds: [] }),
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(res.status, 200);
  const json = await res.json() as { ok: boolean };
  assert.equal(json.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].ids, []);
});

test("CAL-01-put-idempotent: two consecutive PUTs return 200 with identical persisted args", async () => {
  const { deps, calls } = makeSelectionsDeps();
  const app = makeAppWithUserId(deps);
  const body = JSON.stringify({ selectedCalendarIds: ["a"] });

  const r1 = await app.request("/calendar/selections", { method: "PUT", body, headers: { "Content-Type": "application/json" } });
  const r2 = await app.request("/calendar/selections", { method: "PUT", body, headers: { "Content-Type": "application/json" } });

  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { userId: 1, ids: ["a"] });
  assert.deepEqual(calls[1], { userId: 1, ids: ["a"] });
});

test("CAL-01-put-rejects-non-array: PUT /calendar/selections with non-array selectedCalendarIds returns 400", async () => {
  const { deps, calls } = makeSelectionsDeps();
  const app = makeAppWithUserId(deps);
  const res = await app.request("/calendar/selections", {
    method: "PUT",
    body: JSON.stringify({ selectedCalendarIds: "not-an-array" }),
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(res.status, 400);
  assert.equal(calls.length, 0, "dbSetCalendarSelectionsFn must NOT be called when validation fails");
});

test("CAL-01-put-rejects-missing-field: PUT /calendar/selections with no selectedCalendarIds returns 400", async () => {
  const { deps, calls } = makeSelectionsDeps();
  const app = makeAppWithUserId(deps);
  const res = await app.request("/calendar/selections", {
    method: "PUT",
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(res.status, 400);
  assert.equal(calls.length, 0, "dbSetCalendarSelectionsFn must NOT be called when field is missing");
});

test("CAL-01-put-rejects-too-many: PUT /calendar/selections with >1000 ids returns 400", async () => {
  const { deps, calls } = makeSelectionsDeps();
  const app = makeAppWithUserId(deps);
  const res = await app.request("/calendar/selections", {
    method: "PUT",
    body: JSON.stringify({ selectedCalendarIds: Array(1001).fill("x") }),
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(res.status, 400);
  assert.equal(calls.length, 0, "dbSetCalendarSelectionsFn must NOT be called when cap exceeded");
});

test("CAL-01-put-rejects-non-string-elements: PUT /calendar/selections with non-string elements returns 400", async () => {
  const { deps, calls } = makeSelectionsDeps();
  const app = makeAppWithUserId(deps);
  const res = await app.request("/calendar/selections", {
    method: "PUT",
    body: JSON.stringify({ selectedCalendarIds: [1, 2] }),
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(res.status, 400);
  assert.equal(calls.length, 0, "dbSetCalendarSelectionsFn must NOT be called when elements are non-string");
});
