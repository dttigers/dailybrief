// Sports service — balldontlie.io API integration
// Supports MLB, NFL, NBA, NHL with injectable fetch for testability.
// In-memory cache with 5-min TTL prevents redundant API calls (critical on free tier: 5 req/min).
// Security: BALLDONTLIE_API_KEY is NEVER logged or included in any response body.

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
  status: "ok" | "error" | "off_season";
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
  fetchLeague: (league: League) => Promise<LeagueResult>;
  fetchAllLeagues: () => Promise<SportsResponse>;
  clearCache: () => void;
  fetchTeams: (league: League) => Promise<TeamListEntry[]>;
} {
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
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
    const res = await fetchFn(url, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) {
      // Log URL and status only — never log the API key value (T-73-01)
      throw new Error(`BDL fetch failed: ${url} → ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async function fetchLeagueMLB(): Promise<LeagueResult> {
    const teamId = getTeamId("mlb");
    const yesterday = getYesterday();
    const today = getToday();
    const tomorrow = getTomorrow();
    const recentUrl = `${BASE_URLS.mlb}/games?dates[]=${yesterday}&team_ids[]=${teamId}&per_page=5`;
    const upcomingUrl = `${BASE_URLS.mlb}/games?dates[]=${today}&dates[]=${tomorrow}&team_ids[]=${teamId}&per_page=5`;
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

    const teamIdNum = parseInt(getTeamId("mlb"), 10);
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

  async function fetchLeagueNFL(): Promise<LeagueResult> {
    const teamId = getTeamId("nfl");
    const yesterday = getYesterday();
    const today = getToday();
    const tomorrow = getTomorrow();
    const recentUrl = `${BASE_URLS.nfl}/games?dates[]=${yesterday}&team_ids[]=${teamId}&per_page=5`;
    const upcomingUrl = `${BASE_URLS.nfl}/games?dates[]=${today}&dates[]=${tomorrow}&team_ids[]=${teamId}&per_page=5`;
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

    const nflTeamId = parseInt(getTeamId("nfl"), 10);
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

  async function fetchLeagueNBA(): Promise<LeagueResult> {
    const teamId = getTeamId("nba");
    const yesterday = getYesterday();
    const today = getToday();
    const tomorrow = getTomorrow();
    const recentUrl = `${BASE_URLS.nba}/games?dates[]=${yesterday}&team_ids[]=${teamId}&per_page=5`;
    const upcomingUrl = `${BASE_URLS.nba}/games?dates[]=${today}&dates[]=${tomorrow}&team_ids[]=${teamId}&per_page=5`;
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

    const nbaTeamId = parseInt(getTeamId("nba"), 10);
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

  async function fetchLeagueNHL(): Promise<LeagueResult> {
    const teamId = getTeamId("nhl");
    const yesterday = getYesterday();
    const today = getToday();
    const tomorrow = getTomorrow();
    const recentUrl = `${BASE_URLS.nhl}/games?dates[]=${yesterday}&team_ids[]=${teamId}&per_page=5`;
    const upcomingUrl = `${BASE_URLS.nhl}/games?dates[]=${today}&dates[]=${tomorrow}&team_ids[]=${teamId}&per_page=5`;
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

    const nhlTeamId = parseInt(getTeamId("nhl"), 10);
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

  async function fetchLeague(league: League): Promise<LeagueResult> {
    // Cache check first
    const cached = getCachedLeague(league);
    if (cached) return cached;

    let result: LeagueResult;
    try {
      switch (league) {
        case "mlb":
          result = await fetchLeagueMLB();
          break;
        case "nfl":
          result = await fetchLeagueNFL();
          break;
        case "nba":
          result = await fetchLeagueNBA();
          break;
        case "nhl":
          result = await fetchLeagueNHL();
          break;
      }
    } catch (err) {
      result = {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    setCachedLeague(league, result);
    return result;
  }

  async function fetchAllLeagues(): Promise<SportsResponse> {
    const [mlbResult, nflResult, nbaResult, nhlResult] = await Promise.allSettled([
      fetchLeague("mlb"),
      fetchLeague("nfl"),
      fetchLeague("nba"),
      fetchLeague("nhl"),
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

    const partial = Object.values(leagues).some((l) => l.status !== "ok");

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
