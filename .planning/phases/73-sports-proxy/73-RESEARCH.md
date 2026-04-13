# Phase 73: Sports Proxy - Research

**Researched:** 2026-04-12
**Domain:** balldontlie.io API integration, Hono route pattern, in-memory caching, graceful degradation
**Confidence:** HIGH

## Summary

Phase 73 adds a `/v1/sports` aggregate endpoint (plus `/v1/sports/:league` per-league endpoints) to vigil-core. The server fetches live scores, standings, and upcoming games for MLB, NFL, NBA, and NHL from balldontlie.io, caches results in memory to avoid redundant calls during brief generation, and returns partial-success responses when a league's API is unavailable or off-season.

balldontlie.io provides all four leagues under a single API key with consistent `Authorization: <key>` header auth. Each league has its own base URL (`/nba/v1`, `/nfl/v1`, `/mlb/v1`, `/nhl/v1` under `api.balldontlie.io`). The response shapes are slightly different per league but the data model the planner needs to produce is uniform — a canonical server-side shape with `recentGame`, `standings`, and `upcomingGame` per league.

The vigil-core codebase is clean TypeScript (ESM, `NodeNext` modules, Hono). Node 25 is installed — native `fetch` is available with no additional dependencies. The existing affirmation route demonstrates the accepted pattern for file-based caching; for this phase in-memory caching is appropriate since the TTL is short and the process is persistent on Railway. The dependency-injection factory pattern established in `work-order-status.ts` should be followed so the route is unit-testable without live HTTP calls.

**Primary recommendation:** Build a `SportsService` class (or module) with four per-league fetcher functions and a shared in-memory `Map` cache keyed by `league:dataType:date`. Expose it through a Hono route file that returns the canonical aggregate shape and per-league subsets. Register the routes in `index.ts` following the existing pattern.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use balldontlie.io as the single API source for all 4 leagues (MLB, NFL, NBA, NHL). Do NOT use ESPN or MLB Stats API — those are legacy Mac-only paths.
- **D-02:** API key is already available — store as environment variable on Railway alongside existing secrets.
- **D-04:** Expose both an aggregate endpoint (`/v1/sports`) and per-league endpoints (`/v1/sports/:league`). The aggregate endpoint is the primary consumer path for brief generation — it returns all leagues in one call with per-league status flags for partial success. Per-league endpoints fall out naturally from clean internal separation.
- **D-05:** Store team preferences in server-side config (environment variables). This is a single-user system — no need for DB-backed user preferences or query param threading.

### Claude's Discretion
- Response shape design (D-03) — optimize for brief generation and PWA consumption
- Cache TTL values and key design
- Internal code organization (service layer, types, etc.)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPORT-01 | Server can fetch MLB scores, standings, and upcoming games via balldontlie.io API | MLB base URL `https://api.balldontlie.io/mlb/v1`, endpoints `/games`, `/standings` verified |
| SPORT-02 | Server can fetch NFL scores, standings, and upcoming games via balldontlie.io API | NFL base URL `https://api.balldontlie.io/nfl/v1`, endpoints `/games`, `/standings` verified |
| SPORT-03 | Server can fetch NBA scores, standings, and upcoming games via balldontlie.io API | NBA base URL `https://api.balldontlie.io/v1`, endpoints `/games`, `/standings` verified |
| SPORT-04 | Server can fetch NHL scores, standings, and upcoming games via balldontlie.io API | NHL base URL `https://api.balldontlie.io/nhl/v1`, endpoints `/games`, `/standings` verified |
| SPORT-05 | Sports data is cached in-memory to avoid redundant API calls during brief generation | In-memory Map cache with TTL; affirmation route's file-cache pattern is the precedent |
| SPORT-06 | Brief generates successfully with partial sports data when a league is off-season or API is unavailable | `Promise.allSettled` fan-out pattern; per-league `status` flag in aggregate response |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.7.0 (already installed) | Route handler | Canonical vigil-core framework |
| Node native `fetch` | Node 25 built-in | HTTP calls to balldontlie.io | No extra dependency; Node 25 confirmed on dev machine |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` + `node:assert` | built-in | Unit tests | Follows established `work-order-status.test.ts` pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| native fetch | `undici` / `axios` | No benefit — Node 25 native fetch is stable and already available |
| in-memory Map cache | Redis / DB cache | Redis not installed/required; in-memory is correct for single-process, short TTL sports data |
| in-memory Map cache | File cache (like affirmation) | File cache survives restarts but sports data goes stale in minutes anyway; in-memory is simpler |

**Installation:** No new packages required. All dependencies are already present in `vigil-core/package.json`.

---

## balldontlie.io API Reference

### Authentication

All four leagues use the same pattern: `[VERIFIED: docs.balldontlie.io, nfl/mlb/nhl.balldontlie.io]`

```
Authorization: <BALLDONTLIE_API_KEY>
```

(Note: NOT `Bearer <key>` — just the raw key value in the Authorization header.)

### Base URLs Per League

| League | Base URL |
|--------|----------|
| NBA | `https://api.balldontlie.io/v1` |
| NFL | `https://api.balldontlie.io/nfl/v1` |
| MLB | `https://api.balldontlie.io/mlb/v1` |
| NHL | `https://api.balldontlie.io/nhl/v1` |

### Games Endpoints

All four leagues expose `GET /games` with these common query params:
- `dates[]` — filter by date (YYYY-MM-DD)
- `seasons[]` — filter by season year
- `team_ids[]` — filter to a specific team
- `per_page` — max 100

**Yesterday's game query:** `GET /games?dates[]=YYYY-MM-DD&team_ids[]=<id>`

**Upcoming games query:** Use date filters for today + next 7 days, filter out completed games by checking `status` field.

### Standings Endpoints

All four leagues expose `GET /standings?season=<year>`.

### Response Shape Differences

| League | Score Fields | Status Field | Notable |
|--------|-------------|--------------|---------|
| NBA | `home_team_score`, `visitor_team_score` | `"Final"` string | Uses `visitor_team` not `away_team` |
| NFL | `home_team_score`, `visitor_team_score` | `"Final"` string | Has `week` field |
| MLB | `home_team_data.runs`, `away_team_data.runs` | `"STATUS_FINAL"` | `home_team_name`/`away_team_name` strings (not objects) |
| NHL | `home_score`, `away_score` | `"OFF"` string (game off/done) | Has `ot_losses` in standings |

### Rate Limits

- Free tier: 5 requests/minute `[VERIFIED: docs.balldontlie.io]`
- ALL-STAR: 60 req/min
- GOAT: 600 req/min

**Implication for caching:** Even on the free tier, a single brief generation run (4 leagues x 3 data types = ~12 requests) hits the rate limit ceiling. **In-memory caching is not optional — it is required** to avoid 429 errors on the free tier.

---

## Architecture Patterns

### Recommended Project Structure

```
vigil-core/src/
├── routes/
│   └── sports.ts          # Hono route file (aggregate + per-league)
├── services/
│   └── sports-service.ts  # Fetcher + in-memory cache + types
```

Two files: the route (thin handler) and the service (data fetching, caching, types). This mirrors what the brief generator will eventually import from — the service is the reusable unit.

### Pattern 1: Dependency-Injection Factory for Testability

Established in `work-order-status.ts`. The sports service should accept an injectable fetch function so tests can stub HTTP calls without live API access.

```typescript
// Source: work-order-status.ts pattern in vigil-core
export interface SportsServiceDeps {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}

export function createSportsService(deps: SportsServiceDeps = {}) {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  // ...
}
```

### Pattern 2: In-Memory Cache with TTL

The affirmation route uses file-based caching keyed by date. For sports data, in-memory is correct — data is valid for minutes, not days.

```typescript
// Canonical cache structure
interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // Date.now()
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isFresh(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}
```

Cache key design: `"nba:games:2026-04-12"`, `"nba:standings:2026"`, etc.

### Pattern 3: Promise.allSettled Fan-Out (SPORT-06)

The aggregate endpoint fans out to all four leagues concurrently. Each league result is either fulfilled or rejected independently. This is the same pattern BRIEF-02 will use for the full brief.

```typescript
// Source: CONTEXT.md D-04 decision + Node standard library
const [mlb, nfl, nba, nhl] = await Promise.allSettled([
  fetchLeagueData("mlb"),
  fetchLeagueData("nfl"),
  fetchLeagueData("nba"),
  fetchLeagueData("nhl"),
]);

function settledToResult<T>(result: PromiseSettledResult<T>): LeagueResult<T> {
  if (result.status === "fulfilled") {
    return { status: "ok", data: result.value };
  }
  return { status: "error", error: String(result.reason) };
}
```

### Canonical Response Shape (D-03 — Claude's Discretion)

Optimized for brief generation (Phase 75 PDF, specifically Page 2) and future PWA consumers. Reference: existing Swift `GameScore`, `StandingsEntry`, `UpcomingGame` models.

```typescript
// Top-level aggregate response
interface SportsResponse {
  fetchedAt: string;           // ISO timestamp
  partial: boolean;            // true if any league failed
  leagues: {
    mlb: LeagueResult;
    nfl: LeagueResult;
    nba: LeagueResult;
    nhl: LeagueResult;
  };
}

interface LeagueResult {
  status: "ok" | "error" | "off_season";
  error?: string;
  data?: LeagueData;
}

interface LeagueData {
  recentGame: GameScore | null;     // yesterday's game for configured team
  upcomingGame: UpcomingGame | null; // next game within 7 days
  standings: StandingsEntry[];      // division standings
}

// Leaf types (matches Swift model shape)
interface GameScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  result: "W" | "L" | "T" | null;  // null if upcoming/in-progress
  gameType: string;
  gameDate: string;  // ISO date
}

interface StandingsEntry {
  team: string;
  wins: number;
  losses: number;
  gamesBack: string;
  winPct: string;
  streak: string;
  rank: number;
}

interface UpcomingGame {
  homeTeam: string;
  awayTeam: string;
  isHome: boolean;
  venue: string;
  gameType: string;
  gameDate: string;  // ISO timestamp
}
```

### Pattern 4: Hono Route Registration

Follows `index.ts` pattern exactly:

```typescript
// vigil-core/src/routes/sports.ts
import { Hono } from "hono";
export const sports = new Hono();
sports.get("/sports", ...);       // aggregate
sports.get("/sports/:league", ...); // per-league

// vigil-core/src/index.ts — add alongside other protected routes
import { sports } from "./routes/sports.js";
app.route("/v1", sports);
```

### Anti-Patterns to Avoid

- **Making 12 live API calls per brief generation run:** Brief generator may call `/v1/sports` and then the summary route fetches sports again — without caching, this blows the free tier rate limit immediately.
- **Missing the MLB status string difference:** MLB uses `"STATUS_FINAL"` while NBA/NFL use `"Final"`. Off-by-one on status detection means recent game detection breaks for MLB.
- **NHL standings `ot_losses` omission:** NHL standings have OT losses — the `streak` field should show points for NHL (as the existing Swift service does), not win/loss streak.
- **Treating off-season as an error:** When `standings` returns empty array or `games` returns no results, return `status: "off_season"` not `status: "error"`. The planner must distinguish these in SPORT-06 handling.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client | Custom fetch wrapper with retries/timeout | Native `fetch` with `AbortController` (30s timeout already set at Hono middleware level) | CORS/timeout already handled at Hono level; one-off sports fetches don't need retry logic |
| Rate limiting | Custom rate limiter for balldontlie.io calls | In-memory cache (reduces calls to 0 after first fetch) | Cache solves the problem; a separate rate limiter adds complexity with no benefit |
| Date handling | Custom date math library | `new Date().toISOString().slice(0, 10)` | All date needs are trivial: today's date as YYYY-MM-DD and ISO timestamp formatting |

---

## Common Pitfalls

### Pitfall 1: MLB Status String Is Different
**What goes wrong:** Code checks `game.status === "Final"` for all leagues. MLB returns `"STATUS_FINAL"` — the recent-game detection silently returns null for MLB even when a game was played.
**Why it happens:** balldontlie.io inconsistency across their own APIs.
**How to avoid:** Per-league status normalization in the fetcher. Define a `isFinalStatus(league, status)` helper: `league === "mlb" ? status === "STATUS_FINAL" : status === "Final"`.
**Warning signs:** MLB `recentGame` is always null even during the season.

### Pitfall 2: Free Tier Rate Limit (5 req/min)
**What goes wrong:** A brief generation run triggers `/v1/sports` without cache, which makes 12 sequential or concurrent requests (4 leagues x 3 endpoints). The second or third request returns 429. The aggregate endpoint returns partial errors for all leagues.
**Why it happens:** 5 req/min free tier is very tight; 12 requests in a single request cycle exceeds it easily.
**How to avoid:** Cache must be populated before brief generation, or the TTL must be long enough that back-to-back calls within a session are cache hits. Recommended: 5-minute TTL means the first call of the day hits the API, subsequent calls within 5 min are cache hits.
**Warning signs:** Intermittent 429 errors in Railway logs on brief generation days.

### Pitfall 3: Off-Season = Empty Array, Not Error
**What goes wrong:** `standings` returns `{ data: [] }` during off-season. Code interprets this as an error and sets `status: "error"`. Brief generator falls back to empty sports section even though the API call succeeded.
**Why it happens:** Empty array is a valid success response meaning "no data for this season yet."
**How to avoid:** Check `data.length === 0` after a successful API call and return `status: "off_season"` instead of `status: "error"`. Only set `status: "error"` on network failure or non-2xx response.
**Warning signs:** All sports show as `error` at season start/end instead of `off_season`.

### Pitfall 4: Team ID Environment Variables Not Set
**What goes wrong:** `SPORTS_MLB_TEAM_ID` (or equivalent) is undefined. The games query is sent without `team_ids[]`, returning all games. The "recent game" logic picks the wrong team or returns null.
**Why it happens:** New env vars added for phase but not set on Railway before deployment.
**How to avoid:** Validate required env vars at startup with a clear warning log. Fail fast with a 503 if team IDs are missing rather than silently returning wrong data.
**Warning signs:** `recentGame` shows a random team's game, not the configured team.

### Pitfall 5: NHL Has `home_score`/`away_score` Not `home_team_score`/`visitor_team_score`
**What goes wrong:** Code uses a single score field name for all leagues. NHL breaks silently — scores always show as 0.
**Why it happens:** balldontlie.io uses different field names across leagues (NFL/NBA use `home_team_score`, NHL uses `home_score`).
**How to avoid:** Per-league response normalization in the fetcher. Each league has its own mapping function.
**Warning signs:** NHL scores are always 0–0.

---

## Code Examples

### League Fetch Function Template

```typescript
// Source: balldontlie.io docs (verified 2026-04-12) + vigil-core pattern
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY ?? "";

async function fetchNBAGames(teamId: number, date: string): Promise<BDLNBAGame[]> {
  const url = `https://api.balldontlie.io/v1/games?dates[]=${date}&team_ids[]=${teamId}&per_page=5`;
  const res = await fetch(url, {
    headers: { Authorization: BALLDONTLIE_API_KEY },
  });
  if (!res.ok) throw new Error(`BDL NBA games: ${res.status}`);
  const json = await res.json() as { data: BDLNBAGame[] };
  return json.data;
}
```

### Cache Check Pattern

```typescript
// Source: pattern inferred from vigil-core affirmation.ts + standard TypeScript
function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && isFresh(entry)) return entry.data;
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}
```

### Aggregate Endpoint with Promise.allSettled

```typescript
// Source: CONTEXT.md D-04, Node docs
sports.get("/sports", async (c) => {
  const [mlb, nfl, nba, nhl] = await Promise.allSettled([
    fetchLeague("mlb"),
    fetchLeague("nfl"),
    fetchLeague("nba"),
    fetchLeague("nhl"),
  ]);

  const leagues = {
    mlb: settledToResult(mlb),
    nfl: settledToResult(nfl),
    nba: settledToResult(nba),
    nhl: settledToResult(nhl),
  };

  const partial = Object.values(leagues).some((l) => l.status !== "ok");

  return c.json({ fetchedAt: new Date().toISOString(), partial, leagues });
});
```

### Per-League Route

```typescript
// Source: vigil-core Hono pattern
sports.get("/sports/:league", async (c) => {
  const league = c.req.param("league");
  const valid = ["mlb", "nfl", "nba", "nhl"] as const;
  if (!valid.includes(league as (typeof valid)[number])) {
    return c.json({ error: "Unknown league. Valid: mlb, nfl, nba, nhl" }, 400);
  }
  const result = await fetchLeague(league as (typeof valid)[number]);
  return c.json(result);
});
```

---

## Environment Variables Required

These must be set on Railway before deployment (alongside existing secrets):

| Env Var | Purpose | Example |
|---------|---------|---------|
| `BALLDONTLIE_API_KEY` | Auth for all 4 leagues | `abc123...` |
| `SPORTS_MLB_TEAM_ID` | balldontlie.io team ID for MLB team | `116` (Tigers) |
| `SPORTS_NFL_TEAM_ID` | balldontlie.io team ID for NFL team | `13` (Lions) |
| `SPORTS_NBA_TEAM_ID` | balldontlie.io team ID for NBA team | TBD — user configures |
| `SPORTS_NHL_TEAM_ID` | balldontlie.io team ID for NHL team | TBD — user configures |

**Note on team IDs:** balldontlie.io team IDs are NOT the same as ESPN or MLB Stats API team IDs. IDs must be verified via `GET /teams` on each league's API before setting env vars. This should be a Wave 0 task (lookup and document team IDs before writing code that depends on them). `[ASSUMED]` — team IDs are per-league internal IDs; specific values for user's teams require a live API call to confirm.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ESPN public API (undocumented) | balldontlie.io (documented, authenticated) | v3.0 planning decision | Must use new API key, new endpoint shapes |
| MLB Stats API (`statsapi.mlb.com`) | balldontlie.io MLB | v3.0 planning decision | Single API key covers all leagues |

**Deprecated/outdated:**
- `ESPNSportsService.swift` — ESPN-based, Mac CLI only. Reference for data shape only; do not port the ESPN endpoint URLs.
- `SportsService.swift` — MLB Stats API, Mac CLI only. Reference for data shape only; do not port the `statsapi.mlb.com` endpoint URLs.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (native fetch) | HTTP calls to balldontlie.io | Yes | 25.2.1 | — |
| balldontlie.io API | SPORT-01 through SPORT-04 | Assumed (key held by user) | — | Return `status: "error"` per league |
| Railway deployment | SPORT-04 success criterion (deployed + reachable) | Yes (existing vigil-core deploy) | — | — |

**Missing dependencies with no fallback:**
- `BALLDONTLIE_API_KEY` environment variable — blocks all four SPORT requirements. Must be set on Railway before deployment.
- Team ID env vars (`SPORTS_*_TEAM_ID`) — blocks team-specific game/standings queries. Must be set before deployment.

**Missing dependencies with fallback:**
- balldontlie.io API unavailability (network) — falls back to `status: "error"` per-league; aggregate endpoint still returns 200 with `partial: true`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert` (built-in) |
| Config file | none — runs via `tsx --test "src/**/*.test.ts"` |
| Quick run command | `cd vigil-core && npm test -- --test-name-pattern "SPORT"` |
| Full suite command | `cd vigil-core && npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPORT-01 | MLB fetcher returns normalized `LeagueData` shape | unit (stub fetch) | `npm test -- --test-name-pattern "SPORT-01"` | No — Wave 0 |
| SPORT-02 | NFL fetcher returns normalized `LeagueData` shape | unit (stub fetch) | `npm test -- --test-name-pattern "SPORT-02"` | No — Wave 0 |
| SPORT-03 | NBA fetcher returns normalized `LeagueData` shape | unit (stub fetch) | `npm test -- --test-name-pattern "SPORT-03"` | No — Wave 0 |
| SPORT-04 | NHL fetcher returns normalized `LeagueData` shape | unit (stub fetch) | `npm test -- --test-name-pattern "SPORT-04"` | No — Wave 0 |
| SPORT-05 | Second call within TTL returns cached data (fetchFn called only once) | unit | `npm test -- --test-name-pattern "SPORT-05"` | No — Wave 0 |
| SPORT-06 | One league rejection → aggregate still returns other leagues + `partial: true` | unit | `npm test -- --test-name-pattern "SPORT-06"` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --test-name-pattern "SPORT"`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vigil-core/src/routes/sports.test.ts` — covers SPORT-01 through SPORT-06
- [ ] `vigil-core/src/services/sports-service.ts` — must export `createSportsService` factory with injectable `fetchFn`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (no new auth flows) | Existing bearer token middleware covers the endpoint |
| V3 Session Management | No | — |
| V4 Access Control | Yes | Bearer auth middleware already registered for all `/v1/*` routes |
| V5 Input Validation | Yes | Validate `league` param in `/sports/:league` against allowlist |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage in logs | Information Disclosure | Never log `BALLDONTLIE_API_KEY`; log only request URL and status code |
| Unvalidated path param (`/sports/:league`) | Tampering | Allowlist check: only `mlb`, `nfl`, `nba`, `nhl` accepted; return 400 otherwise |
| Downstream API key forwarded to client | Information Disclosure | API key is used server-side only; never included in vigil-core response body |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | balldontlie.io team IDs must be looked up via `GET /teams` — they are not shared with ESPN/MLB Stats API IDs | Environment Variables Required | Env vars set with wrong IDs → wrong team's data silently returned |
| A2 | User's preferred teams for NBA and NHL are not yet determined — must be configured before deployment | Environment Variables Required | Missing team IDs → empty game results for those leagues |
| A3 | Free tier is sufficient for the brief generation use case given in-memory caching | Standard Stack | If user is on free tier and cache misses occur simultaneously, 429 errors will produce partial sports data |

---

## Open Questions (RESOLVED)

1. **Which NBA and NHL teams does the user follow?** — RESOLVED: Team IDs are configured via `SPORTS_NBA_TEAM_ID` / `SPORTS_NHL_TEAM_ID` env vars. User locates correct IDs via `GET /teams` before Railway deploy (documented in Plan 02 user_setup section).

2. **What balldontlie.io plan tier is in use?** — RESOLVED: 5-minute cache TTL is safe at any tier. No plan changes required.

---

## Sources

### Primary (HIGH confidence)
- `https://docs.balldontlie.io` — NBA API: base URL, `/games`, `/standings`, auth header, rate limits, response shapes
- `https://nfl.balldontlie.io` — NFL API: base URL, `/games`, `/standings`, auth header, response shapes
- `https://mlb.balldontlie.io` — MLB API: base URL, `/games`, `/standings`, auth header, response shapes, `STATUS_FINAL` status string
- `https://nhl.balldontlie.io` — NHL API: base URL, `/games`, `/standings`, auth header, `home_score`/`away_score` fields, `ot_losses`
- `vigil-core/src/routes/health.ts` — Canonical Hono route export pattern
- `vigil-core/src/index.ts` — Route registration pattern, bearer auth middleware placement
- `vigil-core/src/routes/work-order-status.ts` — Dependency injection factory pattern for testability
- `vigil-core/src/routes/affirmation.ts` — In-service caching pattern (file-based; in-memory is analogous)
- `vigil-core/package.json` — Confirmed: hono ^4.7.0, no fetch polyfill needed
- `vigil-core/tsconfig.json` — Confirmed: ESM NodeNext, strict mode, ES2022 target

### Secondary (MEDIUM confidence)
- `https://www.balldontlie.io/docs/` — Confirmed all four leagues present; league-specific docs are authoritative source
- `node --version` output (25.2.1) — Confirmed native fetch available

### Tertiary (LOW confidence)
- A1, A2, A3 in Assumptions Log — team IDs and tier details not verifiable without user input

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed via package.json, Node version, official BDL docs
- Architecture: HIGH — follows established vigil-core patterns verified in codebase
- balldontlie.io API shapes: HIGH — verified against live docs for all four leagues
- Pitfalls: HIGH — field name differences verified against API docs; rate limit verified
- Team IDs: LOW — specific numeric IDs require a live `GET /teams` call

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (balldontlie.io API is stable; rate limits could change on free tier)
