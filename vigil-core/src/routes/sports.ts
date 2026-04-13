import { Hono } from "hono";
import { createSportsService } from "../services/sports-service.js";
import type { SportsServiceDeps } from "../services/sports-service.js";

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl"] as const;
type League = (typeof VALID_LEAGUES)[number];

// ── Factory (injected deps — used by tests) ───────────────────────────────────

export function createSportsRouter(deps?: SportsServiceDeps): Hono {
  const service = createSportsService(deps);
  const router = new Hono();

  // Aggregate — primary consumer path for brief generation (per D-04)
  router.get("/sports", async (c) => {
    const result = await service.fetchAllLeagues();
    return c.json(result);
  });

  // Per-league — validates :league param against allowlist (T-73-03 mitigation)
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

// ── Production route (no deps override — uses real fetch + env vars) ──────────

export const sports = createSportsRouter();
