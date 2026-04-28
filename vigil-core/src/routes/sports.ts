import { Hono } from "hono";
import { createSportsService } from "../services/sports-service.js";
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

export function createSportsRouter(deps?: SportsRouterDeps): Hono {
  const service = createSportsService(deps);
  const prefsService = createSportsPreferencesService(deps);
  const router = new Hono();

  // Aggregate — primary consumer path for brief generation (per D-04)
  router.get("/sports", async (c) => {
    const result = await service.fetchAllLeagues();
    return c.json(result);
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

  // Per-league — validates :league param against allowlist (T-73-03 mitigation).
  // Registered LAST so the literal /sports/selections routes above win declaration-order matching.
  router.get("/sports/:league", async (c) => {
    const league = c.req.param("league");
    if (!VALID_LEAGUES.includes(league as League)) {
      return c.json({ error: `Unknown league. Valid: mlb, nfl, nba, nhl` }, 400);
    }
    const result = await service.fetchLeague(league as League);
    return c.json(result);
  });

  return router;
}

// ── Production route (no deps override — uses real fetch + env vars + real DB) ──────────

export const sports = createSportsRouter();
