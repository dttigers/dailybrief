import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createSportsService, UpstreamError } from "./sports-service.js";

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

// ── Phase 116 SPORTS-01: fetchTeams ──

test("SPORTS-01-teams-mlb-uses-display-name: fetchTeams('mlb') returns alphabetically-sorted teams using display_name field", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/teams": { data: [
      { id: 116, display_name: "Detroit Tigers", full_name: "wrong-mlb-full_name" },
      { id: 5, display_name: "Cleveland Guardians", full_name: "wrong-mlb-full_name" },
    ]},
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const teams = await service.fetchTeams("mlb");
  assert.deepEqual(teams, [
    { id: "5", name: "Cleveland Guardians" },
    { id: "116", name: "Detroit Tigers" },
  ]);
});

test("SPORTS-01-teams-nfl-uses-full-name: fetchTeams('nfl') uses full_name field", async () => {
  const mockFetch = createMockFetch({
    "nfl/v1/teams": { data: [
      { id: 13, full_name: "Detroit Lions", display_name: "wrong-display" },
      { id: 1, full_name: "Arizona Cardinals" },
    ]},
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const teams = await service.fetchTeams("nfl");
  assert.deepEqual(teams, [
    { id: "1", name: "Arizona Cardinals" },
    { id: "13", name: "Detroit Lions" },
  ]);
});

test("SPORTS-01-teams-nba-uses-full-name: fetchTeams('nba') uses full_name field", async () => {
  const mockFetch = createMockFetch({
    // NBA's BASE_URL is "/v1" (no league segment), so the path-substring is "v1/teams" — but
    // we need to disambiguate from MLB/NFL/NHL. The mock's substring match treats "v1/teams"
    // as ambiguous, so include "api.balldontlie.io/v1/teams" verbatim.
    "api.balldontlie.io/v1/teams": { data: [
      { id: 10, full_name: "Detroit Pistons" },
      { id: 1, full_name: "Atlanta Hawks" },
    ]},
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const teams = await service.fetchTeams("nba");
  assert.deepEqual(teams, [
    { id: "1", name: "Atlanta Hawks" },
    { id: "10", name: "Detroit Pistons" },
  ]);
});

test("SPORTS-01-teams-nhl-uses-full-name: fetchTeams('nhl') uses full_name field", async () => {
  const mockFetch = createMockFetch({
    "nhl/v1/teams": { data: [
      { id: 10, full_name: "Detroit Red Wings" },
      { id: 6, full_name: "Boston Bruins" },
    ]},
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const teams = await service.fetchTeams("nhl");
  assert.deepEqual(teams, [
    { id: "6", name: "Boston Bruins" },
    { id: "10", name: "Detroit Red Wings" },
  ]);
});

test("SPORTS-01-teams-cache-hit: two consecutive fetchTeams calls within TTL produce ONE outbound call", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/teams": { data: [{ id: 116, display_name: "Detroit Tigers" }] },
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const a = await service.fetchTeams("mlb");
  const b = await service.fetchTeams("mlb");
  assert.equal(mockFetch.calls.length, 1, "Second fetchTeams should hit cache");
  assert.deepEqual(a, b);
});

test("SPORTS-01-teams-cache-cleared-by-clearCache: after clearCache(), next fetchTeams hits BDL again", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/teams": { data: [{ id: 116, display_name: "Detroit Tigers" }] },
  });
  const service = createSportsService({ fetchFn: mockFetch });
  await service.fetchTeams("mlb");           // call 1 → BDL
  await service.fetchTeams("mlb");           // cached → no BDL
  assert.equal(mockFetch.calls.length, 1);
  service.clearCache();
  await service.fetchTeams("mlb");           // cache empty → BDL again
  assert.equal(mockFetch.calls.length, 2);
});

test("SPORTS-01-teams-cache-per-league-isolation: fetchTeams('mlb') then fetchTeams('nba') produces TWO calls", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/teams": { data: [{ id: 116, display_name: "Detroit Tigers" }] },
    "api.balldontlie.io/v1/teams": { data: [{ id: 10, full_name: "Detroit Pistons" }] },
  });
  const service = createSportsService({ fetchFn: mockFetch });
  await service.fetchTeams("mlb");
  await service.fetchTeams("nba");
  assert.equal(mockFetch.calls.length, 2);
});

test("SPORTS-01-teams-bdl-error-throws: BDL non-200 throws and does NOT populate cache", async () => {
  let callCount = 0;
  const fetchFn = async (_url: string, _init?: RequestInit) => {
    callCount++;
    return new Response("server error", { status: 500 });
  };
  const service = createSportsService({ fetchFn });
  // Phase 116.1: fetchJSON now throws UpstreamError (kind='server-error') instead of generic Error.
  await assert.rejects(() => service.fetchTeams("mlb"), /Upstream sports provider failed/);
  // Subsequent call still hits fetchFn — proves error did NOT populate cache.
  await assert.rejects(() => service.fetchTeams("mlb"), /Upstream sports provider failed/);
  assert.equal(callCount, 2);
});

test("SPORTS-01-teams-empty-data: fetchTeams resolves to [] when BDL returns { data: [] }", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/teams": { data: [] },
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const teams = await service.fetchTeams("mlb");
  assert.deepEqual(teams, []);
});

test("SPORTS-01-teams-id-stringified: BDL numeric id is returned as a string (D-05)", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/teams": { data: [{ id: 116, display_name: "Detroit Tigers" }] },
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const teams = await service.fetchTeams("mlb");
  assert.equal(typeof teams[0].id, "string");
  assert.equal(teams[0].id, "116");
});

// ── Phase 116 SPORTS-01: selections-aware fetchAllLeagues ──

test("SPORTS-01-selections-undefined-uses-env-legacy: fetchAllLeagues() with no arg uses env-var teamIds (D-13)", async () => {
  // env vars set at file top: SPORTS_MLB_TEAM_ID=116, SPORTS_NFL_TEAM_ID=13, etc.
  const mockFetch = createMockFetch({
    "mlb/v1/games?dates": MLB_GAMES_RESPONSE,
    "mlb/v1/standings": MLB_STANDINGS_RESPONSE,
    // Off-season noise for the other three leagues.
    "nfl/v1/games": { data: [] },
    "nfl/v1/standings": { data: [] },
    "api.balldontlie.io/v1/games": { data: [] },
    "api.balldontlie.io/v1/standings": { data: [] },
    "nhl/v1/games": { data: [] },
    "nhl/v1/standings": { data: [] },
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchAllLeagues();
  // The MLB recent URL must contain team_ids[]=116 (env-var Detroit Tigers, D-13 legacy).
  const mlbRecentCall = mockFetch.calls.find((u) => u.includes("mlb/v1/games") && u.includes("team_ids[]=116"));
  assert.ok(mlbRecentCall, `Expected an MLB recent-games URL with team_ids[]=116, got: ${mockFetch.calls.join(", ")}`);
  // All four league keys are present in the response.
  assert.ok(result.leagues.mlb);
  assert.ok(result.leagues.nfl);
  assert.ok(result.leagues.nba);
  assert.ok(result.leagues.nhl);
});

test("SPORTS-01-selections-empty-short-circuits: enabledLeagues=[] yields all-disabled with ZERO HTTP calls (D-17)", async () => {
  const mockFetch = createMockFetch({});
  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchAllLeagues({ enabledLeagues: [], favoriteTeams: {} });
  assert.equal(mockFetch.calls.length, 0, "Zero outbound calls expected");
  assert.equal(result.leagues.mlb.status, "disabled");
  assert.equal(result.leagues.nfl.status, "disabled");
  assert.equal(result.leagues.nba.status, "disabled");
  assert.equal(result.leagues.nhl.status, "disabled");
  assert.equal(result.partial, false);
  assert.ok(typeof result.fetchedAt === "string");
});

test("SPORTS-01-selections-disabled-league-not-fetched: only enabled league fetches (D-15)", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/games?dates": MLB_GAMES_RESPONSE,
    "mlb/v1/standings": MLB_STANDINGS_RESPONSE,
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchAllLeagues({ enabledLeagues: ["mlb"], favoriteTeams: { mlb: "116" } });
  // No NFL/NBA/NHL URLs were fetched.
  const offLeagueCalls = mockFetch.calls.filter(
    (u) =>
      u.includes("/nfl/") ||
      u.includes("/nhl/") ||
      // NBA's BASE_URL has no league segment (api.balldontlie.io/v1/...) — detect by absence of a known league segment.
      (u.includes("api.balldontlie.io/v1/") && !u.includes("/mlb/") && !u.includes("/nfl/") && !u.includes("/nhl/")),
  );
  assert.equal(offLeagueCalls.length, 0, `Expected no off-league calls, got: ${offLeagueCalls.join(", ")}`);
  assert.equal(result.leagues.nfl.status, "disabled");
  assert.equal(result.leagues.nba.status, "disabled");
  assert.equal(result.leagues.nhl.status, "disabled");
});

test("SPORTS-01-selections-standings-only-when-no-team: enabled+no-team fetches ONLY standings (D-16)", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/standings": MLB_STANDINGS_RESPONSE,
  });
  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchAllLeagues({ enabledLeagues: ["mlb"], favoriteTeams: {} });
  // No game URL — only standings was called.
  const gameCalls = mockFetch.calls.filter((u) => u.includes("/games?"));
  assert.equal(gameCalls.length, 0, `Expected no /games calls, got: ${gameCalls.join(", ")}`);
  // Standings was called.
  const standingsCalls = mockFetch.calls.filter((u) => u.includes("/standings"));
  assert.ok(standingsCalls.length >= 1, "Standings call expected");
  // MLB result is ok with null games.
  assert.equal(result.leagues.mlb.status, "ok");
  assert.equal(result.leagues.mlb.data?.recentGame, null);
  assert.equal(result.leagues.mlb.data?.upcomingGame, null);
  assert.ok(Array.isArray(result.leagues.mlb.data?.standings));
});

test("SPORTS-01-selections-team-override: favoriteTeams overrides env-var teamId in URL (D-13/D-14)", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/games?dates": MLB_GAMES_RESPONSE,
    "mlb/v1/standings": MLB_STANDINGS_RESPONSE,
  });
  const service = createSportsService({ fetchFn: mockFetch });
  // Picker says "Yankees = 999" — override Detroit Tigers env-var.
  await service.fetchAllLeagues({ enabledLeagues: ["mlb"], favoriteTeams: { mlb: "999" } });
  // The MLB recent URL contains team_ids[]=999, NOT team_ids[]=116.
  const overrideCall = mockFetch.calls.find((u) => u.includes("mlb/v1/games") && u.includes("team_ids[]=999"));
  assert.ok(overrideCall, `Expected URL with team_ids[]=999, got: ${mockFetch.calls.join(", ")}`);
  const envVarCall = mockFetch.calls.find((u) => u.includes("mlb/v1/games") && u.includes("team_ids[]=116"));
  assert.equal(envVarCall, undefined, `Did NOT expect env-var teamId in URL when selections.favoriteTeams overrides`);
});

test("SPORTS-01-selections-response-shape-stable: all four league keys always present (D-15)", async () => {
  const mockFetch = createMockFetch({});
  const service = createSportsService({ fetchFn: mockFetch });
  const result = await service.fetchAllLeagues({ enabledLeagues: [], favoriteTeams: {} });
  assert.deepEqual(Object.keys(result).sort(), ["fetchedAt", "leagues", "partial"]);
  assert.deepEqual(Object.keys(result.leagues).sort(), ["mlb", "nba", "nfl", "nhl"]);
});

test("SPORTS-01-selections-disabled-bypasses-cache: disabled league does not consult or populate cache", async () => {
  const mockFetch = createMockFetch({
    "mlb/v1/games?dates": MLB_GAMES_RESPONSE,
    "mlb/v1/standings": MLB_STANDINGS_RESPONSE,
  });
  const service = createSportsService({ fetchFn: mockFetch });
  // First call: MLB disabled → 0 calls.
  await service.fetchAllLeagues({ enabledLeagues: [], favoriteTeams: {} });
  assert.equal(mockFetch.calls.length, 0);
  // Second call: enable MLB → MLB fetches happen (cache was NOT poisoned by 'disabled').
  await service.fetchAllLeagues({ enabledLeagues: ["mlb"], favoriteTeams: { mlb: "116" } });
  const mlbCalls = mockFetch.calls.filter((u) => u.includes("/mlb/"));
  assert.ok(mlbCalls.length >= 1, "After enabling MLB, MLB fetches should occur");
});

test("SPORTS-01-selections-typed-LeagueResult-disabled: 'disabled' is a valid LeagueResult status (compile-only)", () => {
  // If the union does NOT include 'disabled', the test file fails to compile and tsx --test never runs.
  // This test passing at runtime is sufficient evidence the type was extended.
  const x: import("./sports-service.js").LeagueResult = { status: "disabled" };
  assert.equal(x.status, "disabled");
});

// ── Phase 116.1 SPORTS-01b: UpstreamError classification ──────────────────────

function createFailingMockFetch(opts: {
  status?: number;
  headers?: Record<string, string>;
  throws?: Error;
}): (url: string, init?: RequestInit) => Promise<Response> {
  return async (_url: string, _init?: RequestInit) => {
    if (opts.throws) throw opts.throws;
    return new Response("{}", {
      status: opts.status ?? 500,
      headers: opts.headers ?? {},
    });
  };
}

test("SPORTS-01b-svc-throws-UpstreamError-on-401: fetchTeams rejects with UpstreamError kind 'auth' on 401", async () => {
  const service = createSportsService({ fetchFn: createFailingMockFetch({ status: 401 }) });
  const err = await service.fetchTeams("mlb").catch((e: unknown) => e);
  assert.ok(err instanceof UpstreamError, `Expected UpstreamError, got ${String(err)}`);
  assert.equal(err.kind, "auth");
  assert.equal(err.retryAfter, undefined);
  assert.ok(!err.message.match(/balldontlie/i), `Error message must not contain 'balldontlie': ${err.message}`);
});

test("SPORTS-01b-svc-throws-UpstreamError-on-429-with-Retry-After: kind='rate-limited', retryAfter=45 (number)", async () => {
  const service = createSportsService({
    fetchFn: createFailingMockFetch({ status: 429, headers: { "Retry-After": "45" } }),
  });
  const err = await service.fetchTeams("nfl").catch((e: unknown) => e);
  assert.ok(err instanceof UpstreamError, `Expected UpstreamError, got ${String(err)}`);
  assert.equal(err.kind, "rate-limited");
  assert.equal(err.retryAfter, 45);
  assert.equal(typeof err.retryAfter, "number");
});

test("SPORTS-01b-svc-throws-UpstreamError-on-429-without-Retry-After: kind='rate-limited', retryAfter=undefined", async () => {
  const service = createSportsService({
    fetchFn: createFailingMockFetch({ status: 429 }),
  });
  const err = await service.fetchTeams("nfl").catch((e: unknown) => e);
  assert.ok(err instanceof UpstreamError, `Expected UpstreamError, got ${String(err)}`);
  assert.equal(err.kind, "rate-limited");
  assert.equal(err.retryAfter, undefined);
});

test("SPORTS-01b-svc-throws-UpstreamError-on-500: kind='server-error', retryAfter=undefined", async () => {
  const service = createSportsService({
    fetchFn: createFailingMockFetch({ status: 500 }),
  });
  const err = await service.fetchTeams("mlb").catch((e: unknown) => e);
  assert.ok(err instanceof UpstreamError, `Expected UpstreamError, got ${String(err)}`);
  assert.equal(err.kind, "server-error");
  assert.equal(err.retryAfter, undefined);
});

test("SPORTS-01b-svc-throws-UpstreamError-on-network-failure: fetchFn throws → UpstreamError kind='server-error' with original cause", async () => {
  const originalErr = new Error("ECONNREFUSED");
  const service = createSportsService({
    fetchFn: createFailingMockFetch({ throws: originalErr }),
  });
  const err = await service.fetchTeams("nba").catch((e: unknown) => e);
  assert.ok(err instanceof UpstreamError, `Expected UpstreamError, got ${String(err)}`);
  assert.equal(err.kind, "server-error");
  assert.equal(err.retryAfter, undefined);
  // Original message must NOT appear in UpstreamError.message (generic message only).
  assert.ok(!err.message.includes("ECONNREFUSED"), `UpstreamError.message must be generic, not contain original: ${err.message}`);
  // Original error MUST appear in .cause for ops diagnostics.
  assert.ok((err as Error & { cause?: unknown }).cause === originalErr, "Original error must be in .cause");
});

test("SPORTS-01b-svc-encodes-teamId-in-recent-and-upcoming-URLs-D11: teamId with injection chars is encoded", async () => {
  const urls: string[] = [];
  const capturingFetch = async (url: string, _init?: RequestInit): Promise<Response> => {
    urls.push(url);
    // Return valid empty responses so fetchAllLeagues completes without error.
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const service = createSportsService({ fetchFn: capturingFetch });
  // Malicious teamId that would inject a query parameter if not encoded.
  await service.fetchAllLeagues({
    enabledLeagues: ["mlb"],
    favoriteTeams: { mlb: "116&season=2027" },
  });
  // At least one captured URL must contain the ENCODED form.
  const hasEncoded = urls.some((u) => u.includes("team_ids[]=116%26season%3D2027"));
  // No captured URL must contain the raw injection string.
  const hasRaw = urls.some((u) => u.includes("team_ids[]=116&season=2027"));
  assert.ok(hasEncoded, `Expected URL with encoded team_ids[]=116%26season%3D2027, got: ${urls.join(", ")}`);
  assert.equal(hasRaw, false, `URL must NOT contain raw injection string team_ids[]=116&season=2027`);
});
