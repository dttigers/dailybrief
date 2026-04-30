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

// ── Phase 116 SPORTS-01: GET /sports/teams/:league ──

function makeTeamsRouterApp(fetchFn: (url: string, init?: RequestInit) => Promise<Response>) {
  const inner = createSportsRouter({ fetchFn });
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId" as never, 1 as never);
    await next();
  });
  app.route("/", inner);
  return app;
}

function makeTeamsFetch(byPath: Record<string, unknown>): (url: string) => Promise<Response> {
  return async (url: string) => {
    for (const [pattern, body] of Object.entries(byPath)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
    return new Response("Not found", { status: 404 });
  };
}

test("SPORTS-01-teams-route-mlb: GET /sports/teams/mlb returns 200 with normalized teams array", async () => {
  const fetchFn = makeTeamsFetch({
    "mlb/v1/teams": { data: [{ id: 116, display_name: "Detroit Tigers" }, { id: 5, display_name: "Cleveland Guardians" }] },
  });
  const app = makeTeamsRouterApp(fetchFn);
  const res = await app.request("/sports/teams/mlb");
  assert.equal(res.status, 200);
  const body = await res.json() as { teams: Array<{ id: string; name: string }> };
  assert.ok(Array.isArray(body.teams), "body.teams is an array");
  assert.deepEqual(body.teams, [
    { id: "5", name: "Cleveland Guardians" },
    { id: "116", name: "Detroit Tigers" },
  ]);
});

test("SPORTS-01-teams-route-nfl: GET /sports/teams/nfl returns 200 with full_name-normalized teams", async () => {
  const fetchFn = makeTeamsFetch({
    "nfl/v1/teams": { data: [{ id: 13, full_name: "Detroit Lions" }] },
  });
  const app = makeTeamsRouterApp(fetchFn);
  const res = await app.request("/sports/teams/nfl");
  assert.equal(res.status, 200);
  const body = await res.json() as { teams: Array<{ id: string; name: string }> };
  assert.deepEqual(body.teams, [{ id: "13", name: "Detroit Lions" }]);
});

test("SPORTS-01-teams-route-nba: GET /sports/teams/nba returns 200", async () => {
  const fetchFn = makeTeamsFetch({
    "api.balldontlie.io/v1/teams": { data: [{ id: 10, full_name: "Detroit Pistons" }] },
  });
  const app = makeTeamsRouterApp(fetchFn);
  const res = await app.request("/sports/teams/nba");
  assert.equal(res.status, 200);
  const body = await res.json() as { teams: Array<{ id: string; name: string }> };
  assert.deepEqual(body.teams, [{ id: "10", name: "Detroit Pistons" }]);
});

test("SPORTS-01-teams-route-nhl: GET /sports/teams/nhl returns 200", async () => {
  const fetchFn = makeTeamsFetch({
    "nhl/v1/teams": { data: [{ id: 10, full_name: "Detroit Red Wings" }] },
  });
  const app = makeTeamsRouterApp(fetchFn);
  const res = await app.request("/sports/teams/nhl");
  assert.equal(res.status, 200);
  const body = await res.json() as { teams: Array<{ id: string; name: string }> };
  assert.deepEqual(body.teams, [{ id: "10", name: "Detroit Red Wings" }]);
});

test("SPORTS-01-teams-route-rejects-unknown: GET /sports/teams/soccer returns 400", async () => {
  const fetchFn = makeTeamsFetch({});
  const app = makeTeamsRouterApp(fetchFn);
  const res = await app.request("/sports/teams/soccer");
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.match(body.error, /Unknown league/);
});

test("SPORTS-01-teams-route-no-leak: 400 error body does NOT mention BALLDONTLIE or apiKey", async () => {
  const fetchFn = makeTeamsFetch({});
  const app = makeTeamsRouterApp(fetchFn);
  const res = await app.request("/sports/teams/soccer");
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.ok(!/BALLDONTLIE/i.test(text), "Response must not mention BALLDONTLIE");
  assert.ok(!/apiKey/i.test(text), "Response must not mention apiKey");
});

// ── Phase 116.1 SPORTS-01b: Route-layer UpstreamError → 502 mapping ──────────

import type { SportsServiceDeps as SportsServiceDepsForRoute } from "../services/sports-service.js";

/**
 * Helper for SPORTS-01b-route-* tests.
 * Returns SportsServiceDeps with a fetchFn that simulates BDL failures:
 * - status/headers: returns a Response with given status + headers
 * - throws: fetchFn itself throws the given error (e.g. ECONNREFUSED)
 * - neverResolves: returns a Promise that never resolves (but honors AbortSignal for timeout path)
 * - timeoutMsOverride: passed as _timeoutMsOverride to make timeout tests fast
 */
function makeFailingDeps(opts: {
  status?: number;
  headers?: Record<string, string>;
  throws?: Error;
  neverResolves?: boolean;
  timeoutMsOverride?: number;
}): SportsServiceDepsForRoute {
  return {
    teamIds: { mlb: "1", nfl: "1", nba: "1", nhl: "1" },
    _timeoutMsOverride: opts.timeoutMsOverride,
    fetchFn: async (_url: string, init?: RequestInit) => {
      if (opts.neverResolves) {
        // Honor abort signal so the AbortController timeout in fetchJSON fires.
        return new Promise<Response>((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              const e = new Error("aborted") as Error & { name: string };
              e.name = "AbortError";
              reject(e);
            });
          }
        });
      }
      if (opts.throws) throw opts.throws;
      return new Response("{}", {
        status: opts.status ?? 500,
        headers: opts.headers ?? {},
      });
    },
  };
}

test("SPORTS-01b-route-teams-401-returns-502-no-provider-name", async () => {
  const deps = makeFailingDeps({ status: 401 });
  const app = createSportsRouter(deps);
  const res = await app.request("/sports/teams/mlb");
  assert.equal(res.status, 502);
  const text = await res.text();
  const body = JSON.parse(text) as { error: string; retryAfter?: number };
  assert.deepEqual(body, { error: "Upstream sports provider unavailable" });
  assert.equal(res.headers.get("Retry-After"), null);
  assert.doesNotMatch(text, /balldontlie/i);  // T-73-01
});

test("SPORTS-01b-route-teams-429-returns-502-with-retryAfter-and-header", async () => {
  const deps = makeFailingDeps({ status: 429, headers: { "Retry-After": "30" } });
  const app = createSportsRouter(deps);
  const res = await app.request("/sports/teams/mlb");
  assert.equal(res.status, 502);
  const body = await res.json() as { error: string; retryAfter?: number };
  assert.equal(body.error, "Upstream sports provider unavailable");
  assert.equal(body.retryAfter, 30);
  assert.equal(res.headers.get("Retry-After"), "30");
});

test("SPORTS-01b-route-teams-500-returns-502-no-retryAfter-field", async () => {
  const deps = makeFailingDeps({ status: 500 });
  const app = createSportsRouter(deps);
  const res = await app.request("/sports/teams/mlb");
  assert.equal(res.status, 502);
  const text = await res.text();
  const body = JSON.parse(text) as Record<string, unknown>;
  assert.equal(body["error"], "Upstream sports provider unavailable");
  // Verify the field is actually absent from JSON, not present-but-undefined
  assert.equal("retryAfter" in body, false, "retryAfter MUST NOT be present in body for non-rate-limited errors");
  assert.equal(res.headers.get("Retry-After"), null);
  assert.doesNotMatch(text, /balldontlie/i);  // T-73-01
});

test("SPORTS-01b-route-league-network-failure-returns-502", async () => {
  const deps = makeFailingDeps({ throws: new Error("ECONNREFUSED") });
  const app = createSportsRouter(deps);
  const res = await app.request("/sports/nba");
  assert.equal(res.status, 502);
  const text = await res.text();
  const body = JSON.parse(text) as { error: string };
  assert.equal(body.error, "Upstream sports provider unavailable");
  assert.doesNotMatch(text, /balldontlie/i);  // T-73-01
});

test("SPORTS-01b-route-teams-timeout-returns-502", async () => {
  const deps = makeFailingDeps({ neverResolves: true, timeoutMsOverride: 10 });
  const app = createSportsRouter(deps);
  const res = await app.request("/sports/teams/nfl");
  assert.equal(res.status, 502);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "Upstream sports provider unavailable");
});
