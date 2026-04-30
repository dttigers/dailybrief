import { Hono } from "hono";
import { createSportsService, UpstreamError } from "../services/sports-service.js";
import type { SportsServiceDeps } from "../services/sports-service.js";
import {
  createSportsPreferencesService,
  type SportsPreferencesServiceDeps,
} from "../services/sports-preferences-service.js";

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl"] as const;
type League = (typeof VALID_LEAGUES)[number];

/**
 * Combined deps for createSportsRouter — sports-service deps for the existing
 * /sports + /sports/:league handlers, plus sports-preferences-service deps
 * for the new GET/PUT /sports/selections handlers (Phase 116 SPORTS-01).
 */
export type SportsRouterDeps = SportsServiceDeps & SportsPreferencesServiceDeps;

// ── Factory (injected deps — used by tests) ───────────────────────────────────

/**
 * Phase 116.1 SPORTS-01b D-01 / D-02 / D-04: Single classification source — all
 * UpstreamError kinds (auth, rate-limited, server-error, timeout) collapse to the
 * SAME 502 contract. The only variance is the optional retryAfter field + header
 * for rate-limited kind. Body string is verbatim per CONTEXT.md D-01 — never
 * includes the provider name (T-73-01).
 */
function upstreamErrorToResponse(c: import("hono").Context, err: UpstreamError) {
  const body: { error: string; retryAfter?: number } = {
    error: "Upstream sports provider unavailable",
  };
  if (err.retryAfter !== undefined) {
    body.retryAfter = err.retryAfter;
  }
  // D-02: defense-in-depth — set header AND body field. Clients that read either get the same data.
  // T-2 mitigation: err.retryAfter was already sanitized to a positive integer ≤ 86400 in fetchJSON
  // (Plan 01 step 3); String() of a number cannot inject CRLF or other header tampering.
  if (err.retryAfter !== undefined) {
    c.header("Retry-After", String(err.retryAfter));
  }
  return c.json(body, 502);
}

export function createSportsRouter(deps?: SportsRouterDeps): Hono {
  const service = createSportsService(deps);
  const prefsService = createSportsPreferencesService(deps);
  const router = new Hono();

  // Aggregate — primary consumer path for brief generation (per D-04)
  // Phase 116.1 D-09 route 3: fetchAllLeagues uses Promise.allSettled internally so per-league
  // UpstreamErrors get caught and reduced to LeagueResult.status === "error" via settledToResult.
  // This catch is dormant for typical BDL failures BUT defense-in-depth for synchronous throws
  // in the function's setup or future refactors that change the error-handling shape.
  router.get("/sports", async (c) => {
    try {
      const result = await service.fetchAllLeagues();
      return c.json(result);
    } catch (err) {
      if (err instanceof UpstreamError) {
        return upstreamErrorToResponse(c, err);
      }
      throw err;
    }
  });

  // GET /sports/selections — return user's persisted picker state, or the empty
  // default { enabledLeagues: [], favoriteTeams: {} } when no row exists (D-10).
  // Bearer-gated via global bearerAuth dispatcher in index.ts; userId scoped via c.get("userId").
  // Registered BEFORE /sports/:league so the literal path wins over the param route
  // (Hono matches in declaration order — preventing :league=selections shadowing).
  router.get("/sports/selections", async (c) => {
    const userId = c.get("userId") as number;
    const result = await prefsService.getUserSelections(userId);
    return c.json(result);
  });

  // PUT /sports/selections — wholesale-replace the user's sports preferences (D-03).
  // Body: { enabledLeagues: League[], favoriteTeams: { mlb?: string, nfl?: string, nba?: string, nhl?: string } }.
  // Empty default { enabledLeagues: [], favoriteTeams: {} } is a valid input.
  // Validation (whitelist league keys, string team values, max 4 enabled leagues, no mass-assigned extras)
  // is single-sourced in the service layer's validateSportsSelections — the route catches the throw and
  // maps it to 400 (T-116-01-02 / T-116-01-03 / T-116-01-05 mitigation).
  // Per-user scoping per D-04b: userId from c.get("userId"), NEVER from request body (T-116-01-04).
  router.put("/sports/selections", async (c) => {
    const userId = c.get("userId") as number;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    try {
      // setUserSelections internally calls validateSportsSelections; throws map to 400.
      // Pass body through unchanged — the validator handles type-narrowing.
      await prefsService.setUserSelections(userId, body as Parameters<typeof prefsService.setUserSelections>[1]);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Validation failed" }, 400);
    }
    return c.json({ ok: true });
  });

  // GET /sports/teams/:league — Phase 116 SPORTS-01 D-06.
  // Returns the BDL team roster for the league, normalized to [{ id: string, name: string }],
  // alphabetically sorted, cached server-side for 24h (D-07).
  // Bearer-gated via global bearerAuth dispatcher in index.ts; userId not required by this read
  // because team rosters are public BDL data shared across users (the cache is global per D-07).
  // Allowlist mirrors the existing /sports/:league handler (T-73-03 / T-116-02-06 mitigation).
  // Registered BEFORE /sports/:league so Hono's first-match dispatch picks the literal /teams/ segment.
  // 400 error body is hardcoded literal — never references BALLDONTLIE or apiKey (T-116-02-02).
  router.get("/sports/teams/:league", async (c) => {
    const league = c.req.param("league");
    if (!VALID_LEAGUES.includes(league as League)) {
      return c.json({ error: `Unknown league. Valid: mlb, nfl, nba, nhl` }, 400);
    }
    try {
      const teams = await service.fetchTeams(league as League);
      return c.json({ teams });
    } catch (err) {
      if (err instanceof UpstreamError) {
        return upstreamErrorToResponse(c, err);
      }
      throw err;  // Non-Upstream errors → Hono default 500 (preserves existing behavior for unknown throws)
    }
  });

  // Per-league — validates :league param against allowlist (T-73-03 mitigation).
  // Registered LAST so the literal /sports/selections + /sports/teams/:league routes above
  // win declaration-order matching.
  router.get("/sports/:league", async (c) => {
    const league = c.req.param("league");
    if (!VALID_LEAGUES.includes(league as League)) {
      return c.json({ error: `Unknown league. Valid: mlb, nfl, nba, nhl` }, 400);
    }
    try {
      const result = await service.fetchLeague(league as League);
      return c.json(result);
    } catch (err) {
      if (err instanceof UpstreamError) {
        return upstreamErrorToResponse(c, err);
      }
      throw err;
    }
  });

  return router;
}

// ── Production route (no deps override — uses real fetch + env vars + real DB) ──────────

export const sports = createSportsRouter();
