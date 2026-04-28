// Sports preferences service — per-user picker selections persisted to app_settings (key='sports_selections').
// Phase 116 SPORTS-01: backs the GET/PUT /v1/sports/selections endpoints in routes/sports.ts.
// Storage: existing app_settings table (composite PK userId+key, value jsonb) — NO migration (D-01).
// Validation single-sourced here per D-04a (route catches throw and maps to 400).
// Per-user scoping per D-04b: userId is always passed in by the route (from c.get("userId")).

import { db } from "../db/connection.js";
import { appSettings } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

// ── Types (D-02 jsonb shape; D-05 favoriteTeams.<league> stores BDL team_id as string) ──

export type League = "mlb" | "nfl" | "nba" | "nhl";

export const VALID_LEAGUES: readonly League[] = ["mlb", "nfl", "nba", "nhl"] as const;

export interface SportsSelections {
  enabledLeagues: League[];
  favoriteTeams: {
    mlb?: string;
    nfl?: string;
    nba?: string;
    nhl?: string;
  };
}

export const EMPTY_SELECTIONS: SportsSelections = { enabledLeagues: [], favoriteTeams: {} };

export const SPORTS_SELECTIONS_KEY = "sports_selections" as const;

// Cap = league count (4). Max-1 favorite team per league is enforced structurally
// by the favoriteTeams object shape (Record<League, string?>) — duplicate-league
// entries are impossible.
export const MAX_ENABLED_LEAGUES = 4;

// ── DI interface ──

export interface SportsPreferencesServiceDeps {
  /** Returns the existing row's `value` cast to SportsSelections, or null if no row exists. */
  dbSelectFn?: (userId: number) => Promise<SportsSelections | null>;
  /** Upserts the row (insert with onConflictDoUpdate by composite PK). */
  dbUpsertFn?: (userId: number, value: SportsSelections) => Promise<void>;
}

// ── Validation (T-116-01-02 / T-116-01-03 / T-116-01-05 mitigation) ──

export function validateSportsSelections(input: unknown): asserts input is SportsSelections {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("selections must be an object");
  }
  const obj = input as Record<string, unknown>;

  // enabledLeagues: array of valid league keys, length <= 4
  const enabled = obj["enabledLeagues"];
  if (!Array.isArray(enabled)) {
    throw new Error("enabledLeagues must be an array");
  }
  if (enabled.length > MAX_ENABLED_LEAGUES) {
    throw new Error(`enabledLeagues exceeds cap of ${MAX_ENABLED_LEAGUES}`);
  }
  for (const key of enabled) {
    if (typeof key !== "string" || !VALID_LEAGUES.includes(key as League)) {
      throw new Error(`Unknown league key in enabledLeagues: ${String(key)}`);
    }
  }

  // favoriteTeams: object whose keys are valid league keys and whose values are strings.
  // Per D-24 a favoriteTeams entry is allowed even if its league is NOT in enabledLeagues
  // (preservation rule — disabling a league must not clear its team).
  const fav = obj["favoriteTeams"];
  if (!fav || typeof fav !== "object" || Array.isArray(fav)) {
    throw new Error("favoriteTeams must be an object");
  }
  for (const [key, val] of Object.entries(fav as Record<string, unknown>)) {
    if (!VALID_LEAGUES.includes(key as League)) {
      throw new Error(`Unknown favoriteTeams key: ${key}`);
    }
    if (typeof val !== "string") {
      throw new Error(`favoriteTeams.${key} must be a string`);
    }
  }

  // Mass-assignment defense (T-116-01-05): reject any extra top-level keys.
  const allowedKeys = new Set(["enabledLeagues", "favoriteTeams"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown top-level key: ${key}`);
    }
  }
}

// ── Factory ──

export function createSportsPreferencesService(deps?: SportsPreferencesServiceDeps): {
  getUserSelections: (userId: number) => Promise<SportsSelections>;
  setUserSelections: (userId: number, selections: SportsSelections) => Promise<void>;
} {
  async function dbSelect(userId: number): Promise<SportsSelections | null> {
    if (deps?.dbSelectFn) return deps.dbSelectFn(userId);
    if (!db) return null;
    const rows = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(and(eq(appSettings.userId, userId), eq(appSettings.key, SPORTS_SELECTIONS_KEY)))
      .limit(1);
    if (rows.length === 0) return null;
    return rows[0].value as SportsSelections;
  }

  async function dbUpsert(userId: number, value: SportsSelections): Promise<void> {
    if (deps?.dbUpsertFn) return deps.dbUpsertFn(userId, value);
    if (!db) return;
    await db
      .insert(appSettings)
      .values({ userId, key: SPORTS_SELECTIONS_KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [appSettings.userId, appSettings.key],
        set: { value, updatedAt: new Date() },
      });
  }

  async function getUserSelections(userId: number): Promise<SportsSelections> {
    const row = await dbSelect(userId);
    if (!row) return { enabledLeagues: [], favoriteTeams: {} };
    // Defensive read: validate the persisted shape on read so a corrupt row
    // doesn't crash downstream consumers. If invalid, return empty default
    // (the user can re-pick from Settings — D-10 + D-11 fallback).
    try {
      validateSportsSelections(row);
      return row;
    } catch {
      return { enabledLeagues: [], favoriteTeams: {} };
    }
  }

  async function setUserSelections(userId: number, selections: SportsSelections): Promise<void> {
    validateSportsSelections(selections);
    await dbUpsert(userId, selections);
  }

  return { getUserSelections, setUserSelections };
}
