// Phase 116 SPORTS-01 — unit tests for sports-preferences-service.
// Covers: getUserSelections (empty default + persisted), setUserSelections
// (happy path + validation rules), and the validateSportsSelections helper.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSportsPreferencesService,
  validateSportsSelections,
  EMPTY_SELECTIONS,
  MAX_ENABLED_LEAGUES,
  type SportsPreferencesServiceDeps,
  type SportsSelections,
} from "./sports-preferences-service.js";

function makeDeps(initial: SportsSelections | null = null): {
  deps: SportsPreferencesServiceDeps;
  selectCalls: number[];
  upsertCalls: Array<{ userId: number; value: SportsSelections }>;
} {
  const selectCalls: number[] = [];
  const upsertCalls: Array<{ userId: number; value: SportsSelections }> = [];
  const deps: SportsPreferencesServiceDeps = {
    dbSelectFn: async (userId) => { selectCalls.push(userId); return initial; },
    dbUpsertFn: async (userId, value) => { upsertCalls.push({ userId, value }); },
  };
  return { deps, selectCalls, upsertCalls };
}

test("SPORTS-01-prefs-get-empty-default: getUserSelections returns empty default when no row exists", async () => {
  const { deps, selectCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  const result = await service.getUserSelections(1);
  assert.deepEqual(result, { enabledLeagues: [], favoriteTeams: {} });
  assert.deepEqual(selectCalls, [1]);
});

test("SPORTS-01-prefs-get-existing: getUserSelections returns the persisted value", async () => {
  const stored: SportsSelections = { enabledLeagues: ["mlb", "nba"], favoriteTeams: { mlb: "116", nba: "10" } };
  const { deps } = makeDeps(stored);
  const service = createSportsPreferencesService(deps);
  const result = await service.getUserSelections(1);
  assert.deepEqual(result, stored);
});

test("SPORTS-01-prefs-set-empty-default: setUserSelections accepts the empty default", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  await service.setUserSelections(1, { enabledLeagues: [], favoriteTeams: {} });
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].userId, 1);
  assert.deepEqual(upsertCalls[0].value, { enabledLeagues: [], favoriteTeams: {} });
});

test("SPORTS-01-prefs-set-full: setUserSelections accepts 4 leagues + 4 teams", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  const value: SportsSelections = {
    enabledLeagues: ["mlb", "nfl", "nba", "nhl"],
    favoriteTeams: { mlb: "116", nfl: "13", nba: "10", nhl: "10" },
  };
  await service.setUserSelections(1, value);
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0].value, value);
});

test("SPORTS-01-prefs-set-validates-non-array-leagues: rejects non-array enabledLeagues", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  await assert.rejects(
    () => service.setUserSelections(1, { enabledLeagues: "mlb" as unknown as ["mlb"], favoriteTeams: {} }),
    /enabledLeagues must be an array/,
  );
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-prefs-set-validates-unknown-league: rejects unknown league key", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  await assert.rejects(
    () => service.setUserSelections(1, { enabledLeagues: ["soccer"] as unknown as ["mlb"], favoriteTeams: {} }),
    /Unknown league/,
  );
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-prefs-set-validates-cap: rejects more than 4 enabled leagues", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  await assert.rejects(
    () => service.setUserSelections(1, {
      enabledLeagues: ["mlb", "nfl", "nba", "nhl", "soccer"] as unknown as ["mlb"],
      favoriteTeams: {},
    }),
    new RegExp(`exceeds cap of ${MAX_ENABLED_LEAGUES}`),
  );
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-prefs-set-validates-non-string-team: rejects numeric favoriteTeams.mlb", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  await assert.rejects(
    () => service.setUserSelections(1, {
      enabledLeagues: ["mlb"],
      favoriteTeams: { mlb: 116 as unknown as string },
    }),
    /favoriteTeams\.mlb must be a string/,
  );
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-prefs-set-validates-unknown-favorite-key: rejects favoriteTeams.soccer", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  await assert.rejects(
    () => service.setUserSelections(1, {
      enabledLeagues: ["mlb"],
      favoriteTeams: { soccer: "1" } as unknown as SportsSelections["favoriteTeams"],
    }),
    /Unknown favoriteTeams key: soccer/,
  );
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-prefs-set-preserves-disabled-team: favoriteTeams entry for league NOT in enabledLeagues is allowed (D-24)", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  const value: SportsSelections = {
    enabledLeagues: ["mlb"],
    favoriteTeams: { mlb: "116", nfl: "13" },  // nfl NOT enabled, but team kept
  };
  await service.setUserSelections(1, value);
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0].value, value);
});

test("SPORTS-01-prefs-set-idempotent: two identical PUTs both succeed", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  const value: SportsSelections = { enabledLeagues: ["mlb"], favoriteTeams: { mlb: "116" } };
  await service.setUserSelections(1, value);
  await service.setUserSelections(1, value);
  assert.equal(upsertCalls.length, 2);
  assert.deepEqual(upsertCalls[0].value, value);
  assert.deepEqual(upsertCalls[1].value, value);
});

test("SPORTS-01-prefs-set-validates-not-object: rejects null", async () => {
  const { deps, upsertCalls } = makeDeps(null);
  const service = createSportsPreferencesService(deps);
  await assert.rejects(
    () => service.setUserSelections(1, null as unknown as SportsSelections),
    /selections must be an object/,
  );
  assert.equal(upsertCalls.length, 0);
});

test("SPORTS-01-prefs-validate-rejects-extra-keys: validateSportsSelections rejects mass-assigned top-level keys", () => {
  assert.throws(
    () => validateSportsSelections({
      enabledLeagues: [],
      favoriteTeams: {},
      isAdmin: true,  // mass-assignment attempt
    } as unknown),
    /Unknown top-level key: isAdmin/,
  );
});

test("SPORTS-01-prefs-EMPTY_SELECTIONS-shape: exported constant matches D-10 default", () => {
  assert.deepEqual(EMPTY_SELECTIONS, { enabledLeagues: [], favoriteTeams: {} });
});
