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
