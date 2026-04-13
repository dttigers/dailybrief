// STUB — RED phase: exports types and factory signature but throws "not implemented"
// Replace in GREEN phase with full implementation.

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
  teamIds?: Record<"mlb" | "nfl" | "nba" | "nhl", string>;
}

export function createSportsService(_deps?: SportsServiceDeps): {
  fetchLeague: (league: "mlb" | "nfl" | "nba" | "nhl") => Promise<LeagueResult>;
  fetchAllLeagues: () => Promise<SportsResponse>;
  clearCache: () => void;
} {
  return {
    fetchLeague: (_league) => {
      throw new Error("not implemented");
    },
    fetchAllLeagues: () => {
      throw new Error("not implemented");
    },
    clearCache: () => {
      throw new Error("not implemented");
    },
  };
}
