import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createSportsService } from "./sports-service.js";

// ── Environment Setup ─────────────────────────────────────────────────────────
// Set team IDs in process.env so the service can read them
process.env["SPORTS_MLB_TEAM_ID"] = "116";  // Detroit Tigers
process.env["SPORTS_NFL_TEAM_ID"] = "13";   // Detroit Lions
process.env["SPORTS_NBA_TEAM_ID"] = "10";   // Detroit Pistons
process.env["SPORTS_NHL_TEAM_ID"] = "10";   // Detroit Red Wings

// ── Mock fetch helper ─────────────────────────────────────────────────────────

interface MockFetchFn {
  (url: string, init?: RequestInit): Promise<Response>;
  calls: string[];
}

function createMockFetch(responses: Record<string, unknown>): MockFetchFn {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("Not found", { status: 404 });
  };
  (fn as MockFetchFn).calls = calls;
  return fn as MockFetchFn;
}

// ── Canned BDL response fixtures ──────────────────────────────────────────────

const MLB_GAMES_RESPONSE = {
  data: [
    {
      home_team_name: "Detroit Tigers",
      away_team_name: "Cleveland Guardians",
      home_team: { id: 116, display_name: "Detroit Tigers" },
      away_team: { id: 5, display_name: "Cleveland Guardians" },
      home_team_data: { runs: 5 },
      away_team_data: { runs: 3 },
      status: "STATUS_FINAL",
      date: "2026-04-11",
    },
  ],
};

const MLB_STANDINGS_RESPONSE = {
  data: [
    {
      team: { full_name: "Detroit Tigers" },
      wins: 10,
      losses: 5,
      games_back: "0.0",
      win_pct: "0.667",
      streak: "W3",
    },
  ],
};

const NFL_GAMES_RESPONSE = {
  data: [
    {
      home_team: { id: 13, full_name: "Detroit Lions" },
      visitor_team: { id: 7, full_name: "Chicago Bears" },
      home_team_score: 24,
      visitor_team_score: 17,
      status: "Final",
      date: "2026-01-05",
      week: 18,
    },
  ],
};

const NFL_STANDINGS_RESPONSE = {
  data: [
    {
      team: { full_name: "Detroit Lions" },
      wins: 15,
      losses: 2,
      games_back: "0.0",
      win_pct: "0.882",
      streak: "W5",
    },
  ],
};

const NBA_GAMES_RESPONSE = {
  data: [
    {
      home_team: { id: 10, full_name: "Detroit Pistons" },
      visitor_team: { id: 7, full_name: "Chicago Bulls" },
      home_team_score: 110,
      visitor_team_score: 98,
      status: "Final",
      date: "2026-04-10",
    },
  ],
};

const NBA_STANDINGS_RESPONSE = {
  data: [
    {
      team: { full_name: "Detroit Pistons" },
      wins: 28,
      losses: 54,
      games_back: "12.0",
      win_pct: "0.341",
      streak: "L2",
    },
  ],
};

const NHL_GAMES_RESPONSE = {
  data: [
    {
      home_team: { id: 10, full_name: "Detroit Red Wings" },
      away_team: { id: 7, full_name: "Chicago Blackhawks" },
      home_score: 4,
      away_score: 2,
      status: "Final",
      date: "2026-04-10",
    },
  ],
};

const NHL_STANDINGS_RESPONSE = {
  data: [
    {
      team: { full_name: "Detroit Red Wings" },
      wins: 30,
      losses: 40,
      ot_losses: 12,
      games_back: "8.0",
      win_pct: "0.366",
      streak: "L1",
    },
  ],
};

const EMPTY_RESPONSE = { data: [] };

// ── Tests ─────────────────────────────────────────────────────────────────────

test("SPORT-01: MLB fetcher normalizes balldontlie MLB response to canonical LeagueData", async () => {
  const mockFetch = createMockFetch({
    "/games": MLB_GAMES_RESPONSE,
    "/standings": MLB_STANDINGS_RESPONSE,
  });

  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchLeague("mlb");

  assert.equal(result.status, "ok");
  assert.ok(result.data, "Expected data to be present");
  assert.ok(result.data.recentGame, "Expected recentGame to be present");
  assert.equal(result.data.recentGame.homeTeam, "Detroit Tigers");
  assert.equal(result.data.recentGame.awayTeam, "Cleveland Guardians");
  assert.equal(result.data.recentGame.homeScore, 5);
  assert.equal(result.data.recentGame.awayScore, 3);
  assert.ok(result.data.standings.length > 0, "Expected standings entries");
  assert.equal(result.data.standings[0].team, "Detroit Tigers");
  assert.equal(result.data.standings[0].wins, 10);
  assert.equal(result.data.standings[0].losses, 5);
});

test("SPORT-02: NFL fetcher normalizes balldontlie NFL response to canonical LeagueData", async () => {
  const mockFetch = createMockFetch({
    "/games": NFL_GAMES_RESPONSE,
    "/standings": NFL_STANDINGS_RESPONSE,
  });

  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchLeague("nfl");

  assert.equal(result.status, "ok");
  assert.ok(result.data, "Expected data to be present");
  assert.ok(result.data.recentGame, "Expected recentGame to be present");
  assert.equal(result.data.recentGame.homeTeam, "Detroit Lions");
  assert.equal(result.data.recentGame.awayTeam, "Chicago Bears");
  assert.equal(result.data.recentGame.homeScore, 24);
  assert.equal(result.data.recentGame.awayScore, 17);
});

test("SPORT-03: NBA fetcher normalizes balldontlie NBA response to canonical LeagueData", async () => {
  const mockFetch = createMockFetch({
    "/games": NBA_GAMES_RESPONSE,
    "/standings": NBA_STANDINGS_RESPONSE,
  });

  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchLeague("nba");

  assert.equal(result.status, "ok");
  assert.ok(result.data, "Expected data to be present");
  assert.ok(result.data.recentGame, "Expected recentGame to be present");
  assert.equal(result.data.recentGame.homeTeam, "Detroit Pistons");
  // visitor_team is mapped to awayTeam for NBA
  assert.equal(result.data.recentGame.awayTeam, "Chicago Bulls");
  assert.equal(result.data.recentGame.homeScore, 110);
  assert.equal(result.data.recentGame.awayScore, 98);
});

test("SPORT-04: NHL fetcher normalizes balldontlie NHL response to canonical LeagueData", async () => {
  const mockFetch = createMockFetch({
    "/games": NHL_GAMES_RESPONSE,
    "/standings": NHL_STANDINGS_RESPONSE,
  });

  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchLeague("nhl");

  assert.equal(result.status, "ok");
  assert.ok(result.data, "Expected data to be present");
  assert.ok(result.data.recentGame, "Expected recentGame to be present");
  assert.equal(result.data.recentGame.homeTeam, "Detroit Red Wings");
  assert.equal(result.data.recentGame.awayTeam, "Chicago Blackhawks");
  // NHL uses home_score/away_score (NOT home_team_score/visitor_team_score)
  assert.equal(result.data.recentGame.homeScore, 4);
  assert.equal(result.data.recentGame.awayScore, 2);
});

test("SPORT-05: second fetchLeague call within TTL returns cached data without calling fetchFn", async () => {
  const mockFetch = createMockFetch({
    "/games": NBA_GAMES_RESPONSE,
    "/standings": NBA_STANDINGS_RESPONSE,
  });

  const service = createSportsService({ fetchFn: mockFetch });

  // First call — should hit fetchFn (2 calls: games + standings)
  const result1 = await service.fetchLeague("nba");
  assert.equal(result1.status, "ok");
  const callsAfterFirst = mockFetch.calls.length;
  assert.ok(callsAfterFirst >= 1, "Expected fetchFn to be called on first fetch");

  // Second call within TTL — should return cached data, fetchFn NOT called again
  const result2 = await service.fetchLeague("nba");
  assert.equal(result2.status, "ok");
  assert.equal(
    mockFetch.calls.length,
    callsAfterFirst,
    "fetchFn call count must not increase on second call within TTL",
  );
});

test("SPORT-01: MLB STATUS_FINAL is recognized as final game status", async () => {
  // Explicit test that STATUS_FINAL (MLB-specific) produces a recentGame, not null
  const mockFetch = createMockFetch({
    "/games": {
      data: [
        {
          home_team_name: "Detroit Tigers",
          away_team_name: "Cleveland Guardians",
          home_team: { id: 116, display_name: "Detroit Tigers" },
          away_team: { id: 5, display_name: "Cleveland Guardians" },
          home_team_data: { runs: 5 },
          away_team_data: { runs: 3 },
          status: "STATUS_FINAL",  // MLB-specific status string
          date: "2026-04-11",
        },
      ],
    },
    "/standings": MLB_STANDINGS_RESPONSE,
  });

  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchLeague("mlb");

  assert.equal(result.status, "ok");
  assert.ok(result.data, "Expected data to be present");
  // If STATUS_FINAL is not handled, recentGame will be null
  assert.ok(result.data.recentGame !== null, "STATUS_FINAL must be recognized as a final game status");
  assert.equal(result.data.recentGame!.homeTeam, "Detroit Tigers");
});

test("off-season: empty games array returns status off_season not error", async () => {
  const mockFetch = createMockFetch({
    "/games": EMPTY_RESPONSE,
    "/standings": EMPTY_RESPONSE,
  });

  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchLeague("nba");

  // Empty data arrays must return off_season, not error
  assert.equal(
    result.status,
    "off_season",
    "Empty games + standings must return status 'off_season', not 'error'",
  );
});
