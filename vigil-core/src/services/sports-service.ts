// Sports service — balldontlie.io API integration
// Supports MLB, NFL, NBA, NHL with injectable fetch for testability.
// In-memory cache with 5-min TTL prevents redundant API calls (critical on free tier: 5 req/min).
// Security: BALLDONTLIE_API_KEY is NEVER logged or included in any response body.
//
// Phase 116 SPORTS-01:
//   - fetchAllLeagues(selections?) respects per-user picker selections (D-14, D-15).
//   - LeagueResult.status union includes 'disabled' for non-enabled leagues (D-15).
//   - Standings-only path when league enabled but no favorite team set (D-16).
//   - Zero outbound calls when selections.enabledLeagues is empty (D-17).
//   - Legacy SPORTS_*_TEAM_ID env-var fallback retained for tests (D-13) — only
//     triggered when fetchAllLeagues is called WITHOUT a selections argument
//     (i.e., the legacy signature path). Production code (brief-assembly-service)
//     always passes selections from Plan 04 onward.

import type { SportsSelections } from "./sports-preferences-service.js";

export type { SportsSelections };

/**
 * Phase 116.1 SPORTS-01b D-10: Single classification source for all BDL upstream
 * failures. Thrown by fetchJSON; consumers (route layer in Plan 02, brief-assembly
 * in Plan 04) catch and map to HTTP 502 + body or per-league placeholder.
 *
 * T-73-01 invariant: `message` MUST NOT contain "balldontlie" or "BALLDONTLIE"
 * substring (asserted in tests). The provider name lives ONLY in the existing
 * console.log line at fetchJSON's catch site, never in thrown errors or HTTP bodies.
 */
export class UpstreamError extends Error {
  readonly kind: "rate-limited" | "server-error" | "timeout" | "auth";
  readonly retryAfter?: number;
  constructor(opts: {
    kind: "rate-limited" | "server-error" | "timeout" | "auth";
    retryAfter?: number;
    cause?: unknown;
  }) {
    // Generic message — provider name MUST NOT appear here (T-73-01).
    super(`Upstream sports provider failed (${opts.kind})`);
    this.name = "UpstreamError";
    this.kind = opts.kind;
    this.retryAfter = opts.retryAfter;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export interface SportsResponse {
  fetchedAt: string;
  partial: boolean;
  leagues: {
    mlb: LeagueResult;
    nfl: LeagueResult;
    nba: LeagueResult;
    nhl: LeagueResult;
  };
}

export interface LeagueResult {
  status: "ok" | "error" | "off_season" | "disabled";
  error?: string;
  data?: LeagueData;
}

export interface LeagueData {
  recentGame: GameScore | null;
  upcomingGame: UpcomingGame | null;
  standings: StandingsEntry[];
}

export interface GameScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  result: "W" | "L" | "T" | null;
  gameType: string;
  gameDate: string;
}

export interface StandingsEntry {
  team: string;
  wins: number;
  losses: number;
  gamesBack: string;
  winPct: string;
  streak: string;
  rank: number;
}

export interface UpcomingGame {
  homeTeam: string;
  awayTeam: string;
  isHome: boolean;
  venue: string;
  gameType: string;
  gameDate: string;
}

export interface SportsServiceDeps {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  teamIds?: Record<League, string>;
  /**
   * Phase 116.1 SPORTS-01b D-03 — override 10s default for tests.
   * Production code MUST NOT pass this. Plan 02's route-layer timeout test uses 10ms.
   */
  _timeoutMsOverride?: number;
}

// ── Internals ─────────────────────────────────────────────────────────────────

type League = "mlb" | "nfl" | "nba" | "nhl";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TEAMS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (D-07: rosters rarely change)

const BASE_URLS: Record<League, string> = {
  nba: "https://api.balldontlie.io/v1",
  nfl: "https://api.balldontlie.io/nfl/v1",
  mlb: "https://api.balldontlie.io/mlb/v1",
  nhl: "https://api.balldontlie.io/nhl/v1",
};

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

function isFresh(entry: CacheEntry<unknown>, ttlMs: number = CACHE_TTL_MS): boolean {
  return Date.now() - entry.fetchedAt < ttlMs;
}

// Per-league raw game types (BDL response shapes differ per league)
interface BDLMLBGame {
  home_team_name: string;
  away_team_name: string;
  home_team: { id: number; display_name: string };
  away_team: { id: number; display_name: string };
  home_team_data: { runs: number };
  away_team_data: { runs: number };
  status: string;
  date: string;
}

interface BDLNBAGame {
  home_team: { id: number; full_name: string };
  visitor_team: { id: number; full_name: string };
  home_team_score: number;
  visitor_team_score: number;
  status: string;
  date: string;
}

interface BDLNFLGame {
  home_team: { id: number; full_name: string };
  visitor_team: { id: number; full_name: string };
  home_team_score: number;
  visitor_team_score: number;
  status: string;
  date: string;
  week?: number;
}

interface BDLNHLGame {
  home_team: { id: number; full_name: string };
  away_team: { id: number; full_name: string };
  home_score: number;
  away_score: number;
  status: string;
  date: string;
}

interface BDLStandingsEntry {
  team: { full_name: string };
  wins: number;
  losses: number;
  games_back?: string;
  win_pct?: string;
  streak?: string;
  ot_losses?: number;
}

interface BDLTeamRaw {
  id: number;
  // BDL field names diverge per league (D-08): MLB uses display_name, others use full_name.
  // Tolerate either field on the type level; the per-league reader in fetchTeams picks the right one.
  display_name?: string;
  full_name?: string;
}

/** Normalized team list entry returned by fetchTeams. id is BDL team_id as STRING (D-05). */
export interface TeamListEntry {
  id: string;
  name: string;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function isFinalStatus(league: League, status: string): boolean {
  // MLB uses "STATUS_FINAL"; NBA/NFL/NHL use "Final"
  return league === "mlb" ? status === "STATUS_FINAL" : status === "Final";
}

function computeResult(
  configuredTeamName: string,
  homeTeam: string,
  homeScore: number,
  awayScore: number,
): "W" | "L" | "T" | null {
  if (homeScore === awayScore) return "T";
  const isHome = configuredTeamName === homeTeam;
  const homeWon = homeScore > awayScore;
  if (isHome) return homeWon ? "W" : "L";
  return homeWon ? "L" : "W";
}

// ── Normalization functions ────────────────────────────────────────────────────

function normalizeMLBGame(raw: BDLMLBGame, configuredTeamName: string): GameScore {
  return {
    homeTeam: raw.home_team_name,
    awayTeam: raw.away_team_name,
    homeScore: raw.home_team_data.runs,
    awayScore: raw.away_team_data.runs,
    result: computeResult(configuredTeamName, raw.home_team_name, raw.home_team_data.runs, raw.away_team_data.runs),
    gameType: "regular",
    gameDate: raw.date,
  };
}

function normalizeNFLGame(raw: BDLNFLGame, configuredTeamName: string): GameScore {
  return {
    homeTeam: raw.home_team.full_name,
    awayTeam: raw.visitor_team.full_name,
    homeScore: raw.home_team_score,
    awayScore: raw.visitor_team_score,
    result: computeResult(configuredTeamName, raw.home_team.full_name, raw.home_team_score, raw.visitor_team_score),
    gameType: "regular",
    gameDate: raw.date,
  };
}

function normalizeNBAGame(raw: BDLNBAGame, configuredTeamName: string): GameScore {
  // NBA uses visitor_team (not away_team)
  return {
    homeTeam: raw.home_team.full_name,
    awayTeam: raw.visitor_team.full_name,
    homeScore: raw.home_team_score,
    awayScore: raw.visitor_team_score,
    result: computeResult(configuredTeamName, raw.home_team.full_name, raw.home_team_score, raw.visitor_team_score),
    gameType: "regular",
    gameDate: raw.date,
  };
}

function normalizeNHLGame(raw: BDLNHLGame, configuredTeamName: string): GameScore {
  // NHL uses home_score/away_score (NOT home_team_score/visitor_team_score)
  return {
    homeTeam: raw.home_team.full_name,
    awayTeam: raw.away_team.full_name,
    homeScore: raw.home_score,
    awayScore: raw.away_score,
    result: computeResult(configuredTeamName, raw.home_team.full_name, raw.home_score, raw.away_score),
    gameType: "regular",
    gameDate: raw.date,
  };
}

function normalizeStandings(rawList: BDLStandingsEntry[]): StandingsEntry[] {
  return rawList.map((raw, index) => ({
    team: raw.team.full_name,
    wins: raw.wins,
    losses: raw.losses,
    gamesBack: raw.games_back ?? "—",
    winPct: raw.win_pct ?? "0.000",
    streak: raw.streak ?? "—",
    rank: index + 1,
  }));
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createSportsService(deps: SportsServiceDeps = {}): {
  fetchLeague: (league: League, opts?: { teamId?: string; standingsOnly?: boolean }) => Promise<LeagueResult>;
  fetchAllLeagues: (selections?: SportsSelections) => Promise<SportsResponse>;
  clearCache: () => void;
  fetchTeams: (league: League) => Promise<TeamListEntry[]>;
} {
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const FETCH_TIMEOUT_MS = deps._timeoutMsOverride ?? 10_000;
  const cache = new Map<string, CacheEntry<LeagueResult>>();
  // Teams cache (Phase 116 D-07): 24h TTL, global (shared across users), keyed by league.
  const teamsCache = new Map<League, CacheEntry<TeamListEntry[]>>();

  function getCachedLeague(league: League): LeagueResult | null {
    const key = `league:${league}`;
    const entry = cache.get(key);
    if (entry && isFresh(entry)) return entry.data;
    return null;
  }

  function setCachedLeague(league: League, data: LeagueResult): void {
    cache.set(`league:${league}`, { data, fetchedAt: Date.now() });
  }

  function getTeamId(league: League): string {
    if (deps.teamIds?.[league]) return deps.teamIds[league];
    const envKey = `SPORTS_${league.toUpperCase()}_TEAM_ID`;
    return process.env[envKey] ?? "";
  }

  function getYesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function getToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function getTomorrow(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  async function fetchJSON<T>(url: string): Promise<T> {
    // Authorization: raw key only — NOT "Bearer <key>" (balldontlie.io requirement)
    const apiKey = process.env["BALLDONTLIE_API_KEY"] ?? "";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: { Authorization: apiKey },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      // AbortController abort surfaces as DOMException name="AbortError" OR Error name="AbortError" depending on runtime
      if (err instanceof Error && (err.name === "AbortError" || (err as Error & { code?: string }).code === "ABORT_ERR")) {
        throw new UpstreamError({ kind: "timeout", cause: err });
      }
      // Network/DNS/socket failure
      throw new UpstreamError({ kind: "server-error", cause: err });
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      // Log URL and status only — never log the API key value (T-73-01)
      // T-73-01: This log line is the ONLY place provider name + URL appears in code paths reachable from a failure.
      // The thrown UpstreamError below uses a generic message.
      console.log(`BDL fetch failed: ${url} → ${res.status}`);

      // Classify by status code (D-04, D-01).
      if (res.status === 401 || res.status === 403) {
        throw new UpstreamError({ kind: "auth" });
      }
      if (res.status === 429) {
        // D-02 / D-15: parse Retry-After header. BDL returns seconds (numeric string).
        // T-2 mitigation: sanitize to numeric-only — reject non-integer values to prevent header injection downstream.
        const raw = res.headers.get("Retry-After");
        const parsed = raw !== null ? parseInt(raw, 10) : NaN;
        const retryAfter = Number.isFinite(parsed) && parsed > 0 && parsed <= 86_400 ? parsed : undefined;
        throw new UpstreamError({ kind: "rate-limited", retryAfter });
      }
      // 4xx (other) and 5xx both classify as server-error.
      throw new UpstreamError({ kind: "server-error" });
    }
    return res.json() as Promise<T>;
  }

  async function fetchLeagueMLB(opts: { teamId?: string; standingsOnly?: boolean } = {}): Promise<LeagueResult> {
    // D-13 legacy fallback: opts.teamId from selections (Plan 04 prod path), else getTeamId() env-var (test fixtures).
    const teamId = opts.teamId ?? getTeamId("mlb");
    const yesterday = getYesterday();
    const today = getToday();
    const tomorrow = getTomorrow();

    // D-16 standings-only: enabled league with no favorite team — skip recent/upcoming game fetches.
    if (opts.standingsOnly) {
      try {
        const res = await fetchJSON<{ data: BDLStandingsEntry[] }>(`${BASE_URLS.mlb}/standings?season=2026`);
        return {
          status: "ok",
          data: {
            recentGame: null,
            upcomingGame: null,
            standings: normalizeStandings(res.data ?? []),
          },
        };
      } catch (err) {
        // Phase 116.1 D-10: UpstreamError must propagate (route layer maps to 502; brief-assembly renders placeholder).
        // Non-Upstream errors keep the existing fallback shape for backward compat.
        if (err instanceof UpstreamError) throw err;
        return { status: "error", error: err instanceof Error ? err.message : String(err) };
      }
    }

    // Phase 116.1 D-11 / WR-01: percent-encode teamId before inserting into URL — defense-in-depth
    // against a corrupt favoriteTeams[league] value (e.g. "116&season=2027") injecting query params.
    // For valid numeric teamIds the encoding is a no-op ("116" → "116").
    const encodedTeamId = encodeURIComponent(teamId);
    const recentUrl = `${BASE_URLS.mlb}/games?dates[]=${yesterday}&team_ids[]=${encodedTeamId}&per_page=5`;
    const upcomingUrl = `${BASE_URLS.mlb}/games?dates[]=${today}&dates[]=${tomorrow}&team_ids[]=${encodedTeamId}&per_page=5`;
    const standingsUrl = `${BASE_URLS.mlb}/standings?season=2026`;

    const [gamesRes, upcomingRes, standingsRes] = await Promise.allSettled([
      fetchJSON<{ data: BDLMLBGame[] }>(recentUrl),
      fetchJSON<{ data: BDLMLBGame[] }>(upcomingUrl),
      fetchJSON<{ data: BDLStandingsEntry[] }>(standingsUrl),
    ]);

    const games = gamesRes.status === "fulfilled" ? gamesRes.value.data : [];
    const upcoming = upcomingRes.status === "fulfilled" ? upcomingRes.value.data : [];
    const standingsData = standingsRes.status === "fulfilled" ? standingsRes.value.data : [];

    if (games.length === 0 && upcoming.length === 0 && standingsData.length === 0) {
      if (gamesRes.status === "rejected") throw gamesRes.reason;
      return { status: "off_season" };
    }

    const teamIdNum = parseInt(teamId, 10);
    const firstGame = games[0] ?? upcoming[0];
    const configuredTeamEntry = firstGame
      ? (firstGame.home_team.id === teamIdNum ? firstGame.home_team_name : firstGame.away_team_name)
      : standingsData[0]?.team?.full_name ?? "";

    const finalGames = games.filter((g) => isFinalStatus("mlb", g.status));
    const recentGame = finalGames.length > 0
      ? normalizeMLBGame(finalGames[finalGames.length - 1], configuredTeamEntry)
      : null;

    const nonFinal = upcoming.filter((g) => !isFinalStatus("mlb", g.status));
    const nextGame = nonFinal[0];
    const upcomingGame: UpcomingGame | null = nextGame
      ? {
          homeTeam: nextGame.home_team_name,
          awayTeam: nextGame.away_team_name,
          isHome: nextGame.home_team.id === teamIdNum,
          venue: "",
          gameType: "Regular Season",
          gameDate: nextGame.date.slice(0, 10),
        }
      : null;

    const standings = normalizeStandings(standingsData);

    return {
      status: "ok",
      data: {
        recentGame,
        upcomingGame,
        standings,
      },
    };
  }

  async function fetchLeagueNFL(opts: { teamId?: string; standingsOnly?: boolean } = {}): Promise<LeagueResult> {
    // D-13 legacy fallback: opts.teamId from selections (Plan 04 prod path), else getTeamId() env-var (test fixtures).
    const teamId = opts.teamId ?? getTeamId("nfl");
    const yesterday = getYesterday();
    const today = getToday();
    const tomorrow = getTomorrow();

    // D-16 standings-only: enabled league with no favorite team — skip recent/upcoming game fetches.
    if (opts.standingsOnly) {
      try {
        const res = await fetchJSON<{ data: BDLStandingsEntry[] }>(`${BASE_URLS.nfl}/standings?season=2026`);
        return {
          status: "ok",
          data: {
            recentGame: null,
            upcomingGame: null,
            standings: normalizeStandings(res.data ?? []),
          },
        };
      } catch (err) {
        // Phase 116.1 D-10: UpstreamError must propagate (route layer maps to 502; brief-assembly renders placeholder).
        // Non-Upstream errors keep the existing fallback shape for backward compat.
        if (err instanceof UpstreamError) throw err;
        return { status: "error", error: err instanceof Error ? err.message : String(err) };
      }
    }

    // Phase 116.1 D-11 / WR-01: percent-encode teamId before inserting into URL — defense-in-depth
    // against a corrupt favoriteTeams[league] value (e.g. "13&season=2027") injecting query params.
    // For valid numeric teamIds the encoding is a no-op ("13" → "13").
    const encodedTeamId = encodeURIComponent(teamId);
    const recentUrl = `${BASE_URLS.nfl}/games?dates[]=${yesterday}&team_ids[]=${encodedTeamId}&per_page=5`;
    const upcomingUrl = `${BASE_URLS.nfl}/games?dates[]=${today}&dates[]=${tomorrow}&team_ids[]=${encodedTeamId}&per_page=5`;
    const standingsUrl = `${BASE_URLS.nfl}/standings?season=2026`;

    const [gamesRes, upcomingRes, standingsRes] = await Promise.allSettled([
      fetchJSON<{ data: BDLNFLGame[] }>(recentUrl),
      fetchJSON<{ data: BDLNFLGame[] }>(upcomingUrl),
      fetchJSON<{ data: BDLStandingsEntry[] }>(standingsUrl),
    ]);

    const games = gamesRes.status === "fulfilled" ? gamesRes.value.data : [];
    const upcoming = upcomingRes.status === "fulfilled" ? upcomingRes.value.data : [];
    const standingsData = standingsRes.status === "fulfilled" ? standingsRes.value.data : [];

    if (games.length === 0 && upcoming.length === 0 && standingsData.length === 0) {
      if (gamesRes.status === "rejected") throw gamesRes.reason;
      return { status: "off_season" };
    }

    const nflTeamId = parseInt(teamId, 10);
    const nflFirst = games[0] ?? upcoming[0];
    const configuredTeamEntry = nflFirst
      ? (nflFirst.home_team.id === nflTeamId ? nflFirst.home_team.full_name : nflFirst.visitor_team.full_name)
      : standingsData[0]?.team?.full_name ?? "";

    const finalGames = games.filter((g) => isFinalStatus("nfl", g.status));
    const recentGame = finalGames.length > 0
      ? normalizeNFLGame(finalGames[finalGames.length - 1], configuredTeamEntry)
      : null;

    const nonFinal = upcoming.filter((g) => !isFinalStatus("nfl", g.status));
    const nextGame = nonFinal[0];
    const upcomingGame: UpcomingGame | null = nextGame
      ? {
          homeTeam: nextGame.home_team.full_name,
          awayTeam: nextGame.visitor_team.full_name,
          isHome: nextGame.home_team.id === nflTeamId,
          venue: "",
          gameType: nextGame.week ? `Week ${nextGame.week}` : "Regular Season",
          gameDate: nextGame.date.slice(0, 10),
        }
      : null;

    const standings = normalizeStandings(standingsData);

    return {
      status: "ok",
      data: {
        recentGame,
        upcomingGame,
        standings,
      },
    };
  }

  async function fetchLeagueNBA(opts: { teamId?: string; standingsOnly?: boolean } = {}): Promise<LeagueResult> {
    // D-13 legacy fallback: opts.teamId from selections (Plan 04 prod path), else getTeamId() env-var (test fixtures).
    const teamId = opts.teamId ?? getTeamId("nba");
    const yesterday = getYesterday();
    const today = getToday();
    const tomorrow = getTomorrow();

    // D-16 standings-only: enabled league with no favorite team — skip recent/upcoming game fetches.
    if (opts.standingsOnly) {
      try {
        const res = await fetchJSON<{ data: BDLStandingsEntry[] }>(`${BASE_URLS.nba}/standings?season=2026`);
        return {
          status: "ok",
          data: {
            recentGame: null,
            upcomingGame: null,
            standings: normalizeStandings(res.data ?? []),
          },
        };
      } catch (err) {
        // Phase 116.1 D-10: UpstreamError must propagate (route layer maps to 502; brief-assembly renders placeholder).
        // Non-Upstream errors keep the existing fallback shape for backward compat.
        if (err instanceof UpstreamError) throw err;
        return { status: "error", error: err instanceof Error ? err.message : String(err) };
      }
    }

    // Phase 116.1 D-11 / WR-01: percent-encode teamId before inserting into URL — defense-in-depth
    // against a corrupt favoriteTeams[league] value injecting query params.
    // For valid numeric teamIds the encoding is a no-op ("10" → "10").
    const encodedTeamId = encodeURIComponent(teamId);
    const recentUrl = `${BASE_URLS.nba}/games?dates[]=${yesterday}&team_ids[]=${encodedTeamId}&per_page=5`;
    const upcomingUrl = `${BASE_URLS.nba}/games?dates[]=${today}&dates[]=${tomorrow}&team_ids[]=${encodedTeamId}&per_page=5`;
    const standingsUrl = `${BASE_URLS.nba}/standings?season=2026`;

    const [gamesRes, upcomingRes, standingsRes] = await Promise.allSettled([
      fetchJSON<{ data: BDLNBAGame[] }>(recentUrl),
      fetchJSON<{ data: BDLNBAGame[] }>(upcomingUrl),
      fetchJSON<{ data: BDLStandingsEntry[] }>(standingsUrl),
    ]);

    const games = gamesRes.status === "fulfilled" ? gamesRes.value.data : [];
    const upcoming = upcomingRes.status === "fulfilled" ? upcomingRes.value.data : [];
    const standingsData = standingsRes.status === "fulfilled" ? standingsRes.value.data : [];

    if (games.length === 0 && upcoming.length === 0 && standingsData.length === 0) {
      if (gamesRes.status === "rejected") throw gamesRes.reason;
      return { status: "off_season" };
    }

    const nbaTeamId = parseInt(teamId, 10);
    const nbaFirst = games[0] ?? upcoming[0];
    const configuredTeamEntry = nbaFirst
      ? (nbaFirst.home_team.id === nbaTeamId ? nbaFirst.home_team.full_name : nbaFirst.visitor_team.full_name)
      : standingsData[0]?.team?.full_name ?? "";

    const finalGames = games.filter((g) => isFinalStatus("nba", g.status));
    const recentGame = finalGames.length > 0
      ? normalizeNBAGame(finalGames[finalGames.length - 1], configuredTeamEntry)
      : null;

    const nonFinal = upcoming.filter((g) => !isFinalStatus("nba", g.status));
    const nextGame = nonFinal[0];
    const upcomingGame: UpcomingGame | null = nextGame
      ? {
          homeTeam: nextGame.home_team.full_name,
          awayTeam: nextGame.visitor_team.full_name,
          isHome: nextGame.home_team.id === nbaTeamId,
          venue: "",
          gameType: "Regular Season",
          gameDate: nextGame.date.slice(0, 10),
        }
      : null;

    const standings = normalizeStandings(standingsData);

    return {
      status: "ok",
      data: {
        recentGame,
        upcomingGame,
        standings,
      },
    };
  }

  async function fetchLeagueNHL(opts: { teamId?: string; standingsOnly?: boolean } = {}): Promise<LeagueResult> {
    // D-13 legacy fallback: opts.teamId from selections (Plan 04 prod path), else getTeamId() env-var (test fixtures).
    const teamId = opts.teamId ?? getTeamId("nhl");
    const yesterday = getYesterday();
    const today = getToday();
    const tomorrow = getTomorrow();

    // D-16 standings-only: enabled league with no favorite team — skip recent/upcoming game fetches.
    if (opts.standingsOnly) {
      try {
        const res = await fetchJSON<{ data: BDLStandingsEntry[] }>(`${BASE_URLS.nhl}/standings?season=2026`);
        return {
          status: "ok",
          data: {
            recentGame: null,
            upcomingGame: null,
            standings: normalizeStandings(res.data ?? []),
          },
        };
      } catch (err) {
        // Phase 116.1 D-10: UpstreamError must propagate (route layer maps to 502; brief-assembly renders placeholder).
        // Non-Upstream errors keep the existing fallback shape for backward compat.
        if (err instanceof UpstreamError) throw err;
        return { status: "error", error: err instanceof Error ? err.message : String(err) };
      }
    }

    // Phase 116.1 D-11 / WR-01: percent-encode teamId before inserting into URL — defense-in-depth
    // against a corrupt favoriteTeams[league] value injecting query params.
    // For valid numeric teamIds the encoding is a no-op ("10" → "10").
    const encodedTeamId = encodeURIComponent(teamId);
    const recentUrl = `${BASE_URLS.nhl}/games?dates[]=${yesterday}&team_ids[]=${encodedTeamId}&per_page=5`;
    const upcomingUrl = `${BASE_URLS.nhl}/games?dates[]=${today}&dates[]=${tomorrow}&team_ids[]=${encodedTeamId}&per_page=5`;
    const standingsUrl = `${BASE_URLS.nhl}/standings?season=2026`;

    const [gamesRes, upcomingRes, standingsRes] = await Promise.allSettled([
      fetchJSON<{ data: BDLNHLGame[] }>(recentUrl),
      fetchJSON<{ data: BDLNHLGame[] }>(upcomingUrl),
      fetchJSON<{ data: BDLStandingsEntry[] }>(standingsUrl),
    ]);

    const games = gamesRes.status === "fulfilled" ? gamesRes.value.data : [];
    const upcoming = upcomingRes.status === "fulfilled" ? upcomingRes.value.data : [];
    const standingsData = standingsRes.status === "fulfilled" ? standingsRes.value.data : [];

    if (games.length === 0 && upcoming.length === 0 && standingsData.length === 0) {
      if (gamesRes.status === "rejected") throw gamesRes.reason;
      return { status: "off_season" };
    }

    const nhlTeamId = parseInt(teamId, 10);
    const nhlFirst = games[0] ?? upcoming[0];
    const configuredTeamEntry = nhlFirst
      ? (nhlFirst.home_team.id === nhlTeamId ? nhlFirst.home_team.full_name : nhlFirst.away_team.full_name)
      : standingsData[0]?.team?.full_name ?? "";

    const finalGames = games.filter((g) => isFinalStatus("nhl", g.status));
    const recentGame = finalGames.length > 0
      ? normalizeNHLGame(finalGames[finalGames.length - 1], configuredTeamEntry)
      : null;

    const nonFinal = upcoming.filter((g) => !isFinalStatus("nhl", g.status));
    const nextGame = nonFinal[0];
    const upcomingGame: UpcomingGame | null = nextGame
      ? {
          homeTeam: nextGame.home_team.full_name,
          awayTeam: nextGame.away_team.full_name,
          isHome: nextGame.home_team.id === nhlTeamId,
          venue: "",
          gameType: "Regular Season",
          gameDate: nextGame.date.slice(0, 10),
        }
      : null;

    const standings = normalizeStandings(standingsData);

    return {
      status: "ok",
      data: {
        recentGame,
        upcomingGame,
        standings,
      },
    };
  }

  /**
   * Fetch the team roster for a league from BDL /teams, normalizing the per-league
   * field name divergence (D-08): MLB uses display_name; NFL/NBA/NHL use full_name.
   * Returns alphabetically-sorted [{ id, name }] with id as STRING (D-05).
   * Cached globally for 24 hours (D-07) — rosters rarely change.
   */
  async function fetchTeams(league: League): Promise<TeamListEntry[]> {
    const cached = teamsCache.get(league);
    if (cached && isFresh(cached, TEAMS_CACHE_TTL_MS)) {
      return cached.data;
    }
    const url = `${BASE_URLS[league]}/teams`;
    const res = await fetchJSON<{ data: BDLTeamRaw[] }>(url);
    const useDisplayName = league === "mlb";
    const teams: TeamListEntry[] = (res.data ?? []).map((raw) => ({
      id: String(raw.id),
      name: useDisplayName ? (raw.display_name ?? "") : (raw.full_name ?? ""),
    }));
    teams.sort((a, b) => a.name.localeCompare(b.name));
    teamsCache.set(league, { data: teams, fetchedAt: Date.now() });
    return teams;
  }

  async function fetchLeague(
    league: League,
    opts: { teamId?: string; standingsOnly?: boolean } = {},
  ): Promise<LeagueResult> {
    // Cache check first — only for full-fetch paths. Standings-only requests bypass the cache to
    // avoid contamination: the cache key is `league:${league}` and selections do NOT enter the key,
    // so a standings-only result must NOT be served to a later full-fetch request and vice versa.
    if (!opts.standingsOnly) {
      const cached = getCachedLeague(league);
      if (cached) return cached;
    }

    let result: LeagueResult;
    try {
      switch (league) {
        case "mlb":
          result = await fetchLeagueMLB(opts);
          break;
        case "nfl":
          result = await fetchLeagueNFL(opts);
          break;
        case "nba":
          result = await fetchLeagueNBA(opts);
          break;
        case "nhl":
          result = await fetchLeagueNHL(opts);
          break;
      }
    } catch (err) {
      result = {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Don't cache standings-only results — different request shape, same cache key would mix content.
    if (!opts.standingsOnly) {
      setCachedLeague(league, result);
    }
    return result;
  }

  /**
   * Fetch all four leagues' data, respecting per-user picker selections.
   *
   * @param selections — when provided (Plan 04 prod path), only enabledLeagues
   *                     are fetched; non-enabled leagues return { status: 'disabled' }
   *                     with zero HTTP calls (D-15, D-17).
   *                     When undefined (D-13 legacy test path), all four leagues
   *                     are fetched using getTeamId() env-var fallback —
   *                     preserves sports-service.test.ts:7-10 fixtures.
   *
   * Within each enabled league:
   *   - With favoriteTeams[league] set: full fetch (recent + upcoming + standings) using that team_id.
   *   - With favoriteTeams[league] undefined: standings-only path (D-16) — recentGame and upcomingGame are null.
   *
   * Response shape stays stable: { fetchedAt, partial, leagues: { mlb, nfl, nba, nhl } }
   * with all four keys ALWAYS present.
   */
  async function fetchAllLeagues(selections?: SportsSelections): Promise<SportsResponse> {
    // D-17: short-circuit when no leagues are enabled — zero outbound calls.
    if (selections && selections.enabledLeagues.length === 0) {
      return {
        fetchedAt: new Date().toISOString(),
        partial: false,
        leagues: {
          mlb: { status: "disabled" },
          nfl: { status: "disabled" },
          nba: { status: "disabled" },
          nhl: { status: "disabled" },
        },
      };
    }

    function planLeague(league: League): { teamId?: string; standingsOnly?: boolean } | "disabled" {
      // D-13: no selections arg → legacy path, all leagues enabled with env-var teamIds.
      if (!selections) return { teamId: undefined, standingsOnly: false };
      // D-15: not in enabledLeagues → disabled, no fetch. Note: only the four hard-coded
      // league literals reach this function (T-116-03-01 — corrupted league strings can never
      // be in enabledLeagues for one of the four because we iterate the literals, not the array).
      if (!selections.enabledLeagues.includes(league)) return "disabled";
      const teamId = selections.favoriteTeams[league];
      // D-16: enabled but no favorite team → standings-only.
      if (!teamId) return { teamId: undefined, standingsOnly: true };
      // Full fetch with selected team.
      return { teamId, standingsOnly: false };
    }

    async function fetchOrDisabled(league: League): Promise<LeagueResult> {
      const plan = planLeague(league);
      if (plan === "disabled") return { status: "disabled" };
      return fetchLeague(league, plan);
    }

    const [mlbResult, nflResult, nbaResult, nhlResult] = await Promise.allSettled([
      fetchOrDisabled("mlb"),
      fetchOrDisabled("nfl"),
      fetchOrDisabled("nba"),
      fetchOrDisabled("nhl"),
    ]);

    function settledToResult(r: PromiseSettledResult<LeagueResult>): LeagueResult {
      if (r.status === "fulfilled") return r.value;
      return { status: "error", error: String(r.reason) };
    }

    const leagues = {
      mlb: settledToResult(mlbResult),
      nfl: settledToResult(nflResult),
      nba: settledToResult(nbaResult),
      nhl: settledToResult(nhlResult),
    };

    // 'partial' is true when ANY league is in error/off_season state.
    // 'disabled' is NOT a partial signal — it's an intentional opt-out.
    const partial = Object.values(leagues).some(
      (l) => l.status !== "ok" && l.status !== "disabled",
    );

    return {
      fetchedAt: new Date().toISOString(),
      partial,
      leagues,
    };
  }

  function clearCache(): void {
    cache.clear();
    teamsCache.clear();
  }

  return { fetchLeague, fetchAllLeagues, clearCache, fetchTeams };
}
