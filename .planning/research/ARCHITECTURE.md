# Architecture Research

**Domain:** Server-side PDF generation integration — vigil-core v3.0
**Researched:** 2026-04-12
**Confidence:** HIGH (derived from direct codebase inspection, not inference)

## Standard Architecture

### System Overview — Current State (v2.5)

```
┌─────────────────────── Clients ────────────────────────────────────┐
│  Mac CLI (Swift)      PWA (React/Vite)     G2 Plugin (Vite/SDK)   │
│  - CoreGraphics PDF   - app.vigilhub.io    - Even G2 glasses       │
│  - lpr printing       - thoughts/WO/chat   - work orders display   │
│  - ESPN/Calendar      - brief history      - affirmations          │
│  - IMAP email         - photo upload                               │
└────────────────────────────┬───────────────────────────────────────┘
                             │ HTTPS bearer token
┌────────────────────────────▼───────────────────────────────────────┐
│                    vigil-core (Hono/Node.js)                        │
│  Routes: /v1/brief, /v1/briefs, /v1/thoughts, /v1/work-orders,     │
│          /v1/insights, /v1/therapy*, /v1/affirmation, /v1/chat,    │
│          /v1/export, /v1/process-photo, /v1/process-audio ...      │
├────────────────────────────────────────────────────────────────────┤
│  Services: Anthropic Claude AI client, file-system affirmation     │
│            cache, work-order prioritizer                           │
├────────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Railway)                                              │
│  Tables: thoughts, projects, api_keys, briefs, thought_links,      │
│          chat_sessions, work_orders, work_order_statuses           │
└────────────────────────────────────────────────────────────────────┘
```

### System Overview — Target State (v3.0)

```
┌─────────────────────── Clients ────────────────────────────────────┐
│  Mac CLI (Swift)      PWA (React/Vite)     G2 Plugin (unchanged)  │
│  - THIN: fetch PDF    - Generate button    - unchanged             │
│  - lpr print only     - Preview (iframe)                          │
│                       - Download PDF                              │
│                       - Print from browser                        │
└────────────────────────────┬───────────────────────────────────────┘
                             │ HTTPS bearer token
┌────────────────────────────▼───────────────────────────────────────┐
│                    vigil-core (Hono/Node.js)                        │
│                                                                    │
│  NEW ROUTES:                                                       │
│  /v1/sports/:sport    — ESPN proxy (scoreboard + standings)        │
│  /v1/calendar/events  — Google Calendar OAuth + event fetch        │
│  /v1/calendar/auth    — OAuth2 PKCE init + callback               │
│  /v1/brief/generate   — Orchestrator: pulls all data, returns PDF  │
│                                                                    │
│  MODIFIED ROUTES:                                                  │
│  /v1/briefs (POST)    — now also stores PDF binary (or S3 key)    │
│  /v1/briefs/:date     — now returns PDF download URL              │
│                                                                    │
│  NEW SERVICES:                                                     │
│  ESPNProxyService     — mirrors Swift ESPNSportsService logic      │
│  GoogleCalendarService — OAuth token storage + refresh + fetch     │
│  PDFRenderService     — HTML template → Puppeteer → PDF binary     │
│  BriefAssemblyService — orchestrates all data sources              │
│  EmailDeliveryService — nodemailer/Resend, PDF attachment          │
│                                                                    │
│  EXISTING (unchanged):                                             │
│  Affirmation, Insights, Therapy, Thoughts, WorkOrders ...         │
├────────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Railway) — schema additions:                          │
│  oauth_tokens table   — Google OAuth refresh tokens per user       │
│  briefs.pdf_data      — bytea column OR cloud storage key          │
└────────────────────────────────────────────────────────────────────┘

External APIs called by vigil-core (new):
  site.api.espn.com     — scoreboards, standings (currently called by Mac CLI)
  apis.v2.espn.com      — standings endpoint
  googleapis.com        — Calendar API (currently called by Mac CLI Swift service)
  Resend / SMTP         — email delivery (optional)
```

## Recommended Project Structure

Changes are additive within the existing `vigil-core/src/` layout:

```
vigil-core/src/
├── routes/
│   ├── brief.ts              # EXISTING: /v1/brief (summary stats) — unchanged
│   ├── brief-generate.ts     # NEW: /v1/brief/generate — orchestrator route
│   ├── brief-history.ts      # MODIFIED: add pdf_data/download URL support
│   ├── sports.ts             # NEW: /v1/sports/:sport — ESPN proxy
│   ├── calendar.ts           # NEW: /v1/calendar/events + /v1/calendar/auth
│   └── ... (all other routes unchanged)
├── services/
│   ├── espn-proxy.ts         # NEW: ESPN API client (port of ESPNSportsService.swift)
│   ├── google-calendar.ts    # NEW: OAuth2 + Calendar API client
│   ├── brief-assembly.ts     # NEW: orchestrates all data into BriefData struct
│   ├── pdf-render.ts         # NEW: Puppeteer/html-pdf-node, HTML template → binary
│   └── email-delivery.ts     # NEW: nodemailer/Resend, scheduled send
├── templates/
│   └── brief/
│       ├── page1.html        # Work orders, tasks, notes layout
│       ├── page2.html        # Sports, affirmation layout
│       ├── page3.html        # Thoughts, insights, therapy layout
│       └── styles.css        # A5 page sizing, traveler's notebook dims
├── db/
│   ├── schema.ts             # MODIFIED: add oauth_tokens table; modify briefs
│   └── ... (unchanged)
└── index.ts                  # MODIFIED: register new routes
```

## Component Responsibilities

| Component | Responsibility | New vs Modified |
|-----------|----------------|-----------------|
| `routes/sports.ts` | HTTP endpoint — accepts sport+team params, calls ESPNProxyService, returns JSON | NEW |
| `routes/calendar.ts` | HTTP endpoints — OAuth flow init/callback, event fetch for date range | NEW |
| `routes/brief-generate.ts` | HTTP endpoint — triggers BriefAssemblyService, streams or returns PDF binary | NEW |
| `services/espn-proxy.ts` | Fetches scoreboard + standings from ESPN public API; caches per-day per-team | NEW |
| `services/google-calendar.ts` | Stores/refreshes OAuth tokens from DB; fetches calendar events via googleapis | NEW |
| `services/brief-assembly.ts` | Fan-out: calls all data services concurrently, collects results, calls PDFRenderService | NEW |
| `services/pdf-render.ts` | Renders HTML templates with brief data via Puppeteer, returns PDF Buffer | NEW |
| `services/email-delivery.ts` | Sends PDF binary as email attachment on schedule or on-demand | NEW |
| `db/schema.ts` | Adds `oauth_tokens` table; adds `pdf_data bytea` or `pdf_url text` to `briefs` | MODIFIED |
| `routes/brief-history.ts` | Adds GET /briefs/:date/pdf endpoint to serve stored PDF | MODIFIED |
| `routes/brief.ts` | Existing summary stats — no change | UNCHANGED |

## Architectural Patterns

### Pattern 1: Fan-Out Orchestrator with Settled Promises

The brief assembly mirrors what `DailyBrief.swift` does today with Swift concurrency. In Node, use `Promise.allSettled` so that failure of one data source (sports API down, calendar 401) does not abort the whole brief.

**What:** BriefAssemblyService fires all data fetches concurrently. Each result is either a value or a null fallback — never a thrown error that aborts siblings.

**When to use:** Any endpoint that aggregates N independent external calls where partial success is acceptable.

**Example:**
```typescript
async function assembleBriefData(config: BriefConfig): Promise<BriefData> {
  const [sports, calendar, thoughts, affirmation, workOrders] =
    await Promise.allSettled([
      espnProxy.fetchSports(config.sports),
      googleCalendar.fetchTodayEvents(config.userId),
      db.query.thoughts.findMany({ ... }),
      callAffirmation(config),
      db.query.workOrders.findMany({ ... }),
    ]);

  return {
    sports: sports.status === 'fulfilled' ? sports.value : null,
    calendar: calendar.status === 'fulfilled' ? calendar.value : [],
    // ...
  };
}
```

### Pattern 2: Per-Day In-Memory Cache for External APIs

ESPN and affirmation both need daily caching. Affirmation already uses a file-system cache keyed on YYYY-MM-DD. ESPN should use the same approach or a simple in-memory Map with date-keyed entries, since Railway has ephemeral storage.

**What:** A module-level Map keyed on `"${sport}-${teamId}-${date}"` holds ESPN results for the day. On Railway restarts the cache clears — acceptable since ESPN data is cheap to re-fetch.

**When to use:** Any external API call that is idempotent per calendar day and where Railway's 30s timeout makes repeated fan-out risky.

**Trade-offs:** In-memory means each dyno has its own cache; fine for single-instance Railway deployment. If scale-out ever happens, move to Redis.

**Example:**
```typescript
const cache = new Map<string, { data: SportResult; fetchedAt: Date }>();

function cacheKey(sport: string, teamId: number, date: string) {
  return `${sport}-${teamId}-${date}`;
}

async function fetchWithCache(sport: string, teamId: number): Promise<SportResult> {
  const today = new Date().toISOString().slice(0, 10);
  const key = cacheKey(sport, teamId, today);
  const hit = cache.get(key);
  if (hit) return hit.data;
  const data = await fetchFromESPN(sport, teamId);
  cache.set(key, { data, fetchedAt: new Date() });
  return data;
}
```

### Pattern 3: PDF as Binary Response with Storage Fallback

The `/v1/brief/generate` endpoint returns `Content-Type: application/pdf` with the binary directly. The same binary is stored in the `briefs` table for retrieval via `/v1/briefs/:date/pdf`.

**What:** Generate once, respond immediately with binary, write to DB asynchronously (fire-and-forget after response sent, or synchronously before responding — synchronous is simpler and safe within the 30s timeout for a typical brief).

**When to use:** Any generated asset the client needs immediately AND that other clients need to retrieve later.

**Storage decision:** Store PDF as `bytea` in PostgreSQL (Railway). Typical brief PDF is ~200-400KB. Railway PostgreSQL handles this fine. S3/R2 is premature at single-user scale.

**Trade-offs:** bytea means PDFs travel through Railway's DB connection — fine for single user, revisit at 100+ users.

### Pattern 4: Google OAuth Token Storage in DB

The existing GoogleCalendarService in Swift reads tokens from a local JSON file (`~/.config/dailybrief/google_calendar_tokens.json`). On the server, tokens must be stored in the `oauth_tokens` table, keyed by user identifier (use the API key hash as user ID for now — single-user system).

**What:** `oauth_tokens` table stores `{ user_key, provider, access_token, refresh_token, expires_at }`. GoogleCalendarService checks expiry, auto-refreshes via the Google token endpoint, updates DB.

**When to use:** Any OAuth2 resource server pattern where the server acts on behalf of a user.

**Migration path:** The existing Mac CLI reads tokens from disk. For the transition period, a one-time migration endpoint (`POST /v1/calendar/migrate-token`) can accept the local token JSON and store it in the DB. After that, the Mac CLI drops its local GoogleCalendarService entirely.

## Data Flow

### Brief Generation Request Flow

```
POST /v1/brief/generate
    │
    ▼
BriefAssemblyService.assemble()
    │
    ├─── Promise.allSettled([
    │       ESPNProxyService.fetchSports(mlb, nfl, nba, nhl)   ← ESPN public API
    │       GoogleCalendarService.fetchTodayEvents(userId)       ← googleapis.com
    │       db.thoughts (open tasks, recent, unprocessed)        ← PostgreSQL
    │       POST /v1/affirmation (internal call OR direct fn)    ← Claude API
    │       db.workOrders (open WOs + statuses)                  ← PostgreSQL
    │       POST /v1/insights (optional)                         ← Claude API
    │    ])
    │
    ▼
BriefData struct assembled (nulls for failed sources)
    │
    ▼
PDFRenderService.render(briefData)
    │  (Puppeteer renders HTML template → PDF Buffer)
    │
    ├─── Response: binary PDF (Content-Type: application/pdf)
    │
    └─── db.briefs upsert (date, summary JSON, pdf_data bytea, counts)
```

### Mac CLI Thin Client Flow (post-migration)

```
Mac CLI ./dailybrief generate
    │
    ├── POST /v1/brief/generate (bearer token)
    │       ← receives PDF binary
    │
    ├── writes PDF to ~/Documents/DailyBrief/daily_sheet_YYYY-MM-DD.pdf
    │
    └── lpr -P <printer> <outputPath>
```

### Google Calendar OAuth Flow

```
1. PWA: GET /v1/calendar/auth → redirect to Google OAuth consent page
2. Google: callback → GET /v1/calendar/callback?code=...
3. vigil-core: exchanges code for tokens
4. vigil-core: stores { access_token, refresh_token, expires_at } in oauth_tokens table
5. Future requests: GoogleCalendarService checks expires_at, auto-refreshes if needed
```

## New Routes — Specification

| Method | Path | Returns | Notes |
|--------|------|---------|-------|
| GET | `/v1/sports/:sport` | JSON SportData | `sport` = mlb/nfl/nba/nhl; query params: `teamId`, `date` |
| GET | `/v1/calendar/events` | JSON CalendarEvent[] | query params: `date` (YYYY-MM-DD) |
| GET | `/v1/calendar/auth` | 302 redirect | Starts Google OAuth2 PKCE flow |
| GET | `/v1/calendar/callback` | HTML success page | OAuth2 callback, stores tokens |
| POST | `/v1/brief/generate` | application/pdf binary | Body: `{ date, config }` — triggers full assembly |
| GET | `/v1/briefs/:date/pdf` | application/pdf binary | Returns stored PDF for past date |

## New Database Schema

### `oauth_tokens` table (new)

```typescript
export const oauthTokens = pgTable("oauth_tokens", {
  id: serial("id").primaryKey(),
  userKey: text("user_key").notNull(),          // SHA-256 of bearer token (user ID)
  provider: text("provider").notNull(),          // "google_calendar"
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_oauth_tokens_user_provider").on(table.userKey, table.provider),
]);
```

### `briefs` table modification

Add `pdf_data` column (bytea — stores raw PDF binary):

```typescript
// In existing briefs table:
pdfData: customType<{ data: Buffer }>({ ... }) // or use text for S3 key
```

The existing `pdf_filename` column remains (backward compat for Mac CLI uploads).

## Build Order — Dependencies Drive Sequence

The dependency graph determines safe build order:

```
1. ESPNProxyService + /v1/sports/:sport
   └─ No internal dependencies. Unblocks BriefAssembly for sports data.

2. GoogleCalendarService + oauth_tokens table + /v1/calendar/*
   └─ Requires schema migration. Unblocks BriefAssembly for calendar data.
      (Can be built in parallel with ESPN if developers split work)

3. HTML/CSS Brief Templates (page1, page2, page3)
   └─ No code dependencies. Design artifact. Unblocks PDFRenderService.

4. PDFRenderService (Puppeteer integration)
   └─ Requires templates from step 3. Core risk item — validate Puppeteer
      on Railway early (it needs --no-sandbox in container environments).

5. BriefAssemblyService
   └─ Requires: ESPNProxyService (1), GoogleCalendarService (2),
      PDFRenderService (4). Calls existing DB routes for thoughts/WOs.

6. /v1/brief/generate route
   └─ Requires BriefAssemblyService (5). This is the integration point.

7. briefs table pdf_data column + /v1/briefs/:date/pdf endpoint
   └─ Requires PDF binary to exist (6). Schema migration + route addition.

8. PWA brief generation UI
   └─ Requires /v1/brief/generate (6) and /v1/briefs/:date/pdf (7).

9. Mac CLI thin client refactor
   └─ Requires /v1/brief/generate to be stable (6). Replace CoreGraphics
      PDF generation with API call + lpr.

10. Email delivery service (optional)
    └─ Requires brief binary storage (7). Lowest priority, no blockers.
```

**Critical path:** 1 → 4 (Puppeteer on Railway) → 5 → 6. Everything else branches from 6.

**Puppeteer on Railway is the highest-risk step.** Validate it in isolation (step 4) before investing in the full orchestrator.

## Integration Points

### New External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| ESPN public API | Direct HTTP (no key required) | Same endpoints as Mac CLI Swift code. Rate limit unknown — daily cache mitigates risk. |
| Google Calendar API | OAuth2 with token refresh | Store tokens in `oauth_tokens` table. Use `googleapis` npm package (official). |
| Puppeteer | Subprocess (headless Chrome) | Requires `--no-sandbox` on Railway. Add `puppeteer` to dependencies. Memory ~200MB per render — acceptable for single-user. |
| Resend / nodemailer | SMTP or Resend API | For email delivery. Use `RESEND_API_KEY` env var. Resend preferred over raw SMTP (deliverability). |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| BriefAssemblyService ↔ existing AI routes | Direct function import (not HTTP self-call) | Calling `/v1/affirmation` via HTTP from within the server is wasteful. Extract affirmation logic to a shared function and call it directly. |
| BriefAssemblyService ↔ DB | Drizzle ORM (existing pattern) | Fetch thoughts, work orders, statuses directly — same pattern as all other routes. |
| /v1/brief/generate ↔ BriefAssemblyService | Direct async call | Route handler calls service, awaits PDF buffer, streams response. |
| Mac CLI ↔ vigil-core | Existing bearer token HTTPS | No change to auth model. CLI drops all local data fetching logic. |

### Modified Client Boundaries

| Client | Before v3.0 | After v3.0 |
|--------|-------------|------------|
| Mac CLI | Fetches ESPN, Calendar, IMAP, generates PDF locally | Calls `POST /v1/brief/generate`, writes binary, calls `lpr` |
| PWA | Shows brief history (metadata only) | Adds generate/preview/download UI; iframe preview of PDF |
| G2 Plugin | Unchanged | Unchanged |

## Anti-Patterns

### Anti-Pattern 1: Self-HTTP for Internal Service Calls

**What people do:** BriefAssemblyService calls `fetch("http://localhost:3001/v1/affirmation")` to reuse the affirmation route.

**Why it's wrong:** Adds HTTP overhead, hits rate limiter, bypasses TypeScript type safety, fails under test without a live server.

**Do this instead:** Extract the affirmation generation logic into `services/affirmation.ts` as a plain async function. Both the route handler and BriefAssemblyService import and call it directly.

### Anti-Pattern 2: Synchronous PDF Rendering Blocking the Event Loop

**What people do:** Use a synchronous PDF library (jsPDF, PDFKit) inline in the route handler, blocking Node's event loop for the render duration.

**Why it's wrong:** Puppeteer is async and process-based; sync PDF libraries that block the loop make the server unresponsive during generation. Even async libraries should be awaited cleanly.

**Do this instead:** Always `await` Puppeteer's `page.pdf()`. Keep the route handler thin — delegate to `PDFRenderService.render()` which manages the browser instance lifecycle.

### Anti-Pattern 3: One Puppeteer Browser Instance Per Request

**What people do:** Launch a new Chromium process on every `POST /v1/brief/generate`.

**Why it's wrong:** Chromium startup is ~1-2 seconds and ~100MB memory. At even low concurrency this exhausts Railway's memory.

**Do this instead:** Use a singleton browser instance, launched once at server startup, with a `newPage()` / `page.close()` per request. Add startup health check to verify Puppeteer launched successfully.

### Anti-Pattern 4: Storing OAuth Tokens in Config Files on Railway

**What people do:** Read Google OAuth tokens from `~/.config/dailybrief/google_calendar_tokens.json` (the existing Mac pattern) on the server.

**Why it's wrong:** Railway file system is ephemeral — tokens vanish on every deploy.

**Do this instead:** Store tokens in the `oauth_tokens` PostgreSQL table. The Mac CLI's `GoogleCalendarService.swift` token file is only valid on the Mac. The server needs its own token storage.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user (current) | Singleton Puppeteer browser, in-memory ESPN cache, bytea PDF storage in Postgres — all fine |
| 10 users | ESPN cache needs coordination (still fine with in-memory per-dyno); PDF storage in bytea starts accumulating (~400KB × 365 days × 10 users = ~1.5GB/year — manageable) |
| 100+ users | Move PDF storage to S3/R2; add Redis for shared ESPN cache; Puppeteer pool (2-3 instances); separate PDF worker dyno |

For v3.0, single-user architecture is correct. Do not over-engineer.

## Sources

- Direct inspection: `vigil-core/src/routes/`, `vigil-core/src/db/schema.ts`, `vigil-core/src/index.ts`
- Direct inspection: `Sources/DailyBrief/DailyBrief.swift` (current orchestration logic)
- Direct inspection: `Sources/DailyBrief/Services/ESPNSportsService.swift` (ESPN API endpoints)
- Direct inspection: `Sources/DailyBrief/PDF/PDFGenerator.swift` (3-page layout, CoreGraphics)
- Project context: `.planning/PROJECT.md` (v3.0 goals, constraints, key decisions)

---
*Architecture research for: vigil-core v3.0 Server-Side PDF integration*
*Researched: 2026-04-12*
