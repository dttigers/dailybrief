# Phase 73: Sports Proxy - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side proxy endpoint in vigil-core that fetches live scores, standings, and schedules for MLB, NFL, NBA, and NHL from balldontlie.io, with in-memory caching and graceful fallback when a league is off-season or the API is unavailable.

</domain>

<decisions>
## Implementation Decisions

### API Source
- **D-01:** Use balldontlie.io as the single API source for all 4 leagues (MLB, NFL, NBA, NHL). Do NOT use ESPN or MLB Stats API — those are legacy Mac-only paths.
- **D-02:** API key is already available — store as environment variable on Railway alongside existing secrets.

### Response Shape
- **D-03:** Claude's discretion. Design a response shape that serves both the brief generator (Phase 75) and future PWA consumers. Consider the existing Swift models (`GameScore`, `StandingsEntry`, `UpcomingGame`) as reference but optimize for the server-side use case.

### Route Design
- **D-04:** Expose both an aggregate endpoint (`/v1/sports`) and per-league endpoints (`/v1/sports/:league`). The aggregate endpoint is the primary consumer path for brief generation — it returns all leagues in one call with per-league status flags for partial success. Per-league endpoints fall out naturally from clean internal separation.

### Team Configuration
- **D-05:** Store team preferences in server-side config (environment variables). This is a single-user system — no need for DB-backed user preferences or query param threading. Brief generator calls `/v1/sports` and the server already knows the teams.

### Claude's Discretion
- Response shape design (D-03) — optimize for brief generation and PWA consumption
- Cache TTL values and key design
- Internal code organization (service layer, types, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Sports Implementation (reference only — not to replicate)
- `Sources/DailyBrief/Services/ESPNSportsService.swift` — Current ESPN-based fetching for NFL/NBA/NHL (shows data shape expectations)
- `Sources/DailyBrief/Services/SportsService.swift` — Current MLB Stats API fetching (shows game score, standings, upcoming game patterns)

### vigil-core Patterns
- `vigil-core/src/routes/health.ts` — Canonical route file pattern (Hono, export style)
- `vigil-core/src/routes/` — All existing routes for consistency reference

### Requirements
- `.planning/REQUIREMENTS.md` — SPORT-01 through SPORT-06 define acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- vigil-core Hono route pattern — all routes export a `new Hono()` instance with handlers
- Existing Swift sports models define the data consumers expect: `GameScore` (homeTeam, awayTeam, scores, result, venue, gameType), `StandingsEntry` (team, wins, losses, GB, streak), `UpcomingGame` (teams, venue, gameType, date/time)

### Established Patterns
- Routes are flat files in `vigil-core/src/routes/`, one per domain
- Bearer token auth middleware on all API routes
- JSON responses with consistent structure

### Integration Points
- New route file(s) in `vigil-core/src/routes/`
- Register routes in the main Hono app
- Environment variables for balldontlie.io API key and team IDs on Railway

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 73-sports-proxy*
*Context gathered: 2026-04-12*
