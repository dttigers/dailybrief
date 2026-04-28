import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Import factory from route file (created in GREEN phase)
import { createSportsRouter } from "./sports.js";
import type { SportsServiceDeps } from "../services/sports-service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNBASuccessResponse() {
  return JSON.stringify({
    data: [
      {
        home_team: { full_name: "Los Angeles Lakers" },
        visitor_team: { full_name: "Golden State Warriors" },
        home_team_score: 110,
        visitor_team_score: 105,
        status: "Final",
        date: "2026-04-11",
      },
    ],
  });
}

function makeNFLGamesResponse() {
  return JSON.stringify({
    data: [
      {
        home_team: { full_name: "Kansas City Chiefs" },
        visitor_team: { full_name: "Philadelphia Eagles" },
        home_team_score: 27,
        visitor_team_score: 24,
        status: "Final",
        date: "2026-04-11",
      },
    ],
  });
}

function makeNHLGamesResponse() {
  return JSON.stringify({
    data: [
      {
        home_team: { full_name: "Toronto Maple Leafs" },
        away_team: { full_name: "Boston Bruins" },
        home_score: 3,
        away_score: 2,
        status: "Final",
        date: "2026-04-11",
      },
    ],
  });
}

function makeStandingsResponse(teamName = "Los Angeles Lakers") {
  return JSON.stringify({
    data: [
      {
        team: { full_name: teamName },
        wins: 50,
        losses: 30,
        games_back: "—",
        win_pct: "0.625",
        streak: "W3",
      },
    ],
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("SPORT-06: one league rejection returns partial true with other leagues ok", async () => {
  const deps: SportsServiceDeps = {
    teamIds: { mlb: "1", nfl: "1", nba: "1", nhl: "1" },
    fetchFn: async (url: string) => {
      // MLB URLs throw an error (simulates network/API failure)
      // MLB uses https://api.balldontlie.io/mlb/v1/...
      if (url.includes("balldontlie.io/mlb/")) {
        throw new Error("MLB API unavailable");
      }
      // NFL — https://api.balldontlie.io/nfl/v1/...
      if (url.includes("balldontlie.io/nfl/")) {
        if (url.includes("/games")) return new Response(makeNFLGamesResponse(), { status: 200 });
        return new Response(makeStandingsResponse("Kansas City Chiefs"), { status: 200 });
      }
      // NHL — https://api.balldontlie.io/nhl/v1/...
      if (url.includes("balldontlie.io/nhl/")) {
        if (url.includes("/games")) return new Response(makeNHLGamesResponse(), { status: 200 });
        return new Response(makeStandingsResponse("Toronto Maple Leafs"), { status: 200 });
      }
      // NBA — https://api.balldontlie.io/v1/... (no league prefix)
      if (url.includes("balldontlie.io/v1/")) {
        if (url.includes("/games")) return new Response(makeNBASuccessResponse(), { status: 200 });
        return new Response(makeStandingsResponse("Los Angeles Lakers"), { status: 200 });
      }
      return new Response(makeStandingsResponse(), { status: 200 });
    },
  };

  const app = createSportsRouter(deps);
  const res = await app.request("/sports");

  assert.equal(res.status, 200);
  const json = await res.json() as {
    partial: boolean;
    leagues: {
      mlb: { status: string };
      nba: { status: string };
      nfl: { status: string };
      nhl: { status: string };
    };
  };

  assert.equal(json.partial, true, "partial should be true when one league fails");
  assert.equal(json.leagues.mlb.status, "error", "MLB should have error status");
  assert.ok(
    json.leagues.nba.status === "ok" || json.leagues.nba.status === "off_season",
    `NBA should have ok or off_season status, got: ${json.leagues.nba.status}`
  );
});

test("GET /sports/:league with valid league returns 200", async () => {
  const deps: SportsServiceDeps = {
    teamIds: { mlb: "1", nfl: "1", nba: "1", nhl: "1" },
    fetchFn: async () => {
      return new Response(makeNBASuccessResponse(), { status: 200 });
    },
  };

  const app = createSportsRouter(deps);
  const res = await app.request("/sports/nba");

  assert.equal(res.status, 200);
  const json = await res.json() as { status: string };
  assert.ok(
    typeof json.status === "string",
    `response should have a 'status' field, got: ${JSON.stringify(json)}`
  );
});

test("GET /sports/:league with invalid league returns 400 with descriptive error", async () => {
  const deps: SportsServiceDeps = {
    teamIds: { mlb: "1", nfl: "1", nba: "1", nhl: "1" },
    fetchFn: async () => {
      return new Response("{}", { status: 200 });
    },
  };

  const app = createSportsRouter(deps);
  const res = await app.request("/sports/badleague");

  assert.equal(res.status, 400);
  const json = await res.json() as { error: string };
  assert.ok(
    json.error.includes("Valid: mlb, nfl, nba, nhl"),
    `error message should contain "Valid: mlb, nfl, nba, nhl", got: ${json.error}`
  );
});

// ── Phase 116 SPORTS-01: GET/PUT /sports/selections ──

import type { SportsSelections } from "../services/sports-preferences-service.js";
import type { SportsRouterDeps } from "./sports.js";

function makePrefsDeps(initial: SportsSelections | null = null): {
  deps: SportsRouterDeps;
  upsertCalls: Array<{ userId: number; value: SportsSelections }>;
  selectCalls: number[];
} {
  const upsertCalls: Array<{ userId: number; value: SportsSelections }> = [];
  const selectCalls: number[] = [];
  const deps: SportsRouterDeps = {
    dbSelectFn: async (userId: number) => { selectCalls.push(userId); return initial; },
    dbUpsertFn: async (userId: number, value: SportsSelections) => { upsertCalls.push({ userId, value }); },
  };
  return { deps, upsertCalls, selectCalls };
}

/** Wraps createSportsRouter with a use("*") that pre-sets userId, mirroring Phase 115 calendar route tests. */
function makeApp(deps: SportsRouterDeps, userId = 1) {
  const inner = createSportsRouter(deps);
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId" as never, userId as never);
    await next();
  });
  app.route("/", inner);
  return app;
}

test("SPORTS-01-put-happy: PUT /sports/selections with valid body returns 200 and persists value", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledLeagues: ["mlb", "nba"], favoriteTeams: { mlb: "116", nba: "10" } }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].userId, 1);
  assert.deepEqual(upsertCalls[0].value, { enabledLeagues: ["mlb", "nba"], favoriteTeams: { mlb: "116", nba: "10" } });
});

test("SPORTS-01-put-empty-default: PUT empty default { enabledLeagues: [], favoriteTeams: {} } returns 200", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledLeagues: [], favoriteTeams: {} }),
  });
  assert.equal(res.status, 200);
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0].value, { enabledLeagues: [], favoriteTeams: {} });
});

test("SPORTS-01-put-idempotent: two identical PUTs both return 200", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const body = JSON.stringify({ enabledLeagues: ["mlb"], favoriteTeams: { mlb: "116" } });
  for (let i = 0; i < 2; i++) {
    const res = await app.request("/sports/selections", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    assert.equal(res.status, 200);
  }
  assert.equal(upsertCalls.length, 2);
  assert.deepEqual(upsertCalls[0].value, upsertCalls[1].value);
});

test("SPORTS-01-put-rejects-non-array-leagues: 400 when enabledLeagues is a string", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledLeagues: "mlb", favoriteTeams: {} }),
  });
  assert.equal(res.status, 400);
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-put-rejects-unknown-league: 400 when enabledLeagues contains 'soccer'", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledLeagues: ["soccer"], favoriteTeams: {} }),
  });
  assert.equal(res.status, 400);
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-put-rejects-too-many-leagues: 400 when 5 leagues sent", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledLeagues: ["mlb", "nfl", "nba", "nhl", "soccer"], favoriteTeams: {} }),
  });
  assert.equal(res.status, 400);
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-put-rejects-non-string-team: 400 when favoriteTeams.mlb is a number", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledLeagues: ["mlb"], favoriteTeams: { mlb: 116 } }),
  });
  assert.equal(res.status, 400);
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-put-rejects-missing-fields: 400 when body is empty {}", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-put-rejects-invalid-json: 400 with 'Invalid JSON body'", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  const json = await res.json() as { error: string };
  assert.match(json.error, /Invalid JSON body/);
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-put-allows-disabled-team-D24: favoriteTeams entry for league not enabled is preserved", async () => {
  const { deps, upsertCalls } = makePrefsDeps();
  const app = makeApp(deps);
  const res = await app.request("/sports/selections", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledLeagues: ["mlb"], favoriteTeams: { mlb: "116", nfl: "13" } }),
  });
  assert.equal(res.status, 200);
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0].value, { enabledLeagues: ["mlb"], favoriteTeams: { mlb: "116", nfl: "13" } });
});

test("SPORTS-01-get-row-present: GET /sports/selections returns persisted value", async () => {
  const stored: SportsSelections = { enabledLeagues: ["nba"], favoriteTeams: { nba: "10" } };
  const { deps } = makePrefsDeps(stored);
  const app = makeApp(deps);
  const res = await app.request("/sports/selections");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), stored);
});

test("SPORTS-01-get-row-absent: GET /sports/selections returns empty default when no row exists", async () => {
  const { deps } = makePrefsDeps(null);
  const app = makeApp(deps);
  const res = await app.request("/sports/selections");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { enabledLeagues: [], favoriteTeams: {} });
});
