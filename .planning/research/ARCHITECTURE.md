# Architecture Research

**Domain:** Gmail OAuth + PWA Settings + CLI restructure on existing Vigil platform
**Researched:** 2026-04-13
**Confidence:** HIGH (based on direct codebase inspection)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                │
├──────────────┬──────────────────────┬───────────────────────────────┤
│  Mac CLI     │   vigil-pwa          │   Even G2 Plugin              │
│  (Swift/SPM) │   (React 19 / RR7)   │   (Vite + Hub SDK)            │
│              │                      │                               │
│  DailyBrief  │  App.tsx Routes:     │   3-screen ambient display    │
│  (commands)  │   /         Thoughts │                               │
│  VigilAPI    │   /work-orders       │                               │
│  Client      │   /projects          │                               │
│  (actor)     │   /chat              │                               │
│              │   /insights          │                               │
│              │   /therapy           │                               │
│              │   /history           │                               │
│              │   /upload            │                               │
│              │   [/settings NEW]    │                               │
│              │   [/gmail NEW]       │                               │
└──────┬───────┴──────────┬───────────┴───────────────────────────────┘
       │ Bearer auth       │ Bearer auth
       │ (vk_ prefix)      │ (localStorage key)
       ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  vigil-core  (Hono / Node.js)                       │
│                  api.vigilhub.io  /  Railway                        │
├─────────────────────────────────────────────────────────────────────┤
│  Middleware: CORS → secureHeaders → timeout(30s) → rateLimiter      │
│  Auth skip: /v1/health, /v1/auth/google*                            │
│  Auth required: all other /v1/* routes                              │
├─────────────────────────────────────────────────────────────────────┤
│  Existing Routes (src/routes/)                                      │
│  thoughts, projects, work-orders, work-order-status                 │
│  triage, affirmation, insights, therapy, chat, chat-sessions        │
│  brief, brief-generate, brief-history                               │
│  calendar, calendar-auth  ← REUSE for Gmail                        │
│  sports, export, bulk, tags, links, describe-image                  │
│  process-photo, process-audio, health, summary                      │
│                                                                     │
│  NEW Routes:                                                        │
│  gmail (src/routes/gmail.ts)                                        │
│  gmail-extract (src/routes/gmail-extract.ts)  ← WO extraction      │
├─────────────────────────────────────────────────────────────────────┤
│  Services (src/services/)                                           │
│  calendar-service.ts  ← REUSE token management                     │
│  gmail-service.ts     ← NEW, mirrors calendar-service pattern      │
├─────────────────────────────────────────────────────────────────────┤
│  DB (Drizzle ORM / PostgreSQL)                                      │
│  oauthTokens  ← single row provider='google', add gmail.readonly   │
│  workOrders   ← existing table, Gmail extraction feeds here        │
│  workOrderStatuses ← unchanged                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `calendar-auth.ts` | OAuth2 browser redirect flow, CSRF nonce, token storage | Existing — reuse for Gmail scope |
| `calendar-service.ts` | Token refresh, getValidAccessToken(), Google API fetch | Existing — pattern to copy |
| `gmail-service.ts` | Gmail API calls: list messages, get thread, search, WO extraction | NEW |
| `gmail.ts` (route) | REST endpoints: GET /gmail/messages, GET /gmail/thread/:id, GET /gmail/search | NEW |
| `gmail-extract.ts` (route) | POST /gmail/extract-work-orders — Claude-powered WO detection | NEW |
| `SettingsPage.tsx` | OAuth connect/disconnect UI, integration status | NEW PWA page |
| `GmailPage.tsx` | Inbox list, thread view, search | NEW PWA page |
| `DailyBrief.Capture` | CLI `capture` subcommand — POST thought, trigger triage | NEW Swift subcommand |
| `DailyBrief.Triage` | CLI `triage` subcommand — batch re-triage uncategorized | NEW Swift subcommand |
| `DailyBrief.Doctor` | CLI `doctor` subcommand — API key/env/plist/Railway health check | NEW Swift subcommand |
| `DailyBrief.Setup` | Promoted from `--setup` flag to proper subcommand | MODIFIED |

## Recommended Project Structure

### vigil-core additions

```
vigil-core/src/
├── routes/
│   ├── calendar-auth.ts       # MODIFIED — add gmail.readonly to scope array
│   ├── calendar.ts            # existing — no changes
│   ├── gmail.ts               # NEW — list/thread/search endpoints
│   └── gmail-extract.ts       # NEW — work order extraction endpoint
├── services/
│   ├── calendar-service.ts    # existing — pattern reference
│   └── gmail-service.ts       # NEW — mirrors calendar-service DI factory pattern
└── index.ts                   # MODIFIED — register gmail routes
```

### vigil-pwa additions

```
vigil-pwa/src/
├── pages/
│   ├── SettingsPage.tsx       # NEW — /settings route, Google connect/disconnect
│   └── GmailPage.tsx          # NEW — /gmail route, inbox + search + thread view
├── api/
│   └── client.ts              # MODIFIED — add gmail API functions, google status check
├── components/
│   ├── Layout.tsx             # MODIFIED — add Settings and Gmail tabs
│   └── GmailMessageRow.tsx    # NEW — message list item component
└── App.tsx                    # MODIFIED — add /settings and /gmail routes
```

### Mac CLI additions

```
Sources/DailyBrief/
└── DailyBrief.swift           # MODIFIED — add Capture/Triage/Doctor/Setup subcommands;
                               #            remove Complete/Uncomplete/ListCompleted
```

## Architectural Patterns

### Pattern 1: DI Factory Service (existing, replicate for Gmail)

**What:** Services expose a factory function `createXxxService(deps?)` that accepts injectable dependencies for testing, plus a production singleton `export const xxxService = createXxxService()`.

**When to use:** Any new service that calls external APIs (Google, etc.) — enables unit testing without real HTTP calls.

**Example** (from calendar-service.ts, apply identically to gmail-service.ts):
```typescript
export function createGmailService(deps?: GmailServiceDeps): {
  listMessages: (query?: string, maxResults?: number) => Promise<GmailMessagesResponse>;
  getThread: (threadId: string) => Promise<GmailThreadResponse>;
  searchMessages: (params: GmailSearchParams) => Promise<GmailMessagesResponse>;
} {
  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
  // getValidAccessToken() — copy logic from calendar-service, same oauthTokens row
  return { listMessages, getThread, searchMessages };
}

export const gmailService = createGmailService();
```

### Pattern 2: OAuth Scope Extension (no new table row)

**What:** The existing `oauthTokens` table stores one row per provider (`provider='google'`). Adding `gmail.readonly` scope means adding it to the `generateAuthUrl` scope array in `calendar-auth.ts`. The stored tokens then cover both Calendar and Gmail. No schema migration required.

**When to use:** Only when both Calendar and Gmail are scoped under the same Google OAuth app credentials (same `GOOGLE_CLIENT_ID`). This is the correct approach here since both use the same Google account.

**Implementation:**
```typescript
// calendar-auth.ts — add gmail.readonly to scope array
const url = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",  // ADD
  ],
  state: stateNonce,
});
```

**Critical:** Existing users who already authorized Calendar-only will need to re-authorize because the scope set changed. The PWA Settings page must handle `needs_reauth` from Gmail calls gracefully and prompt re-connect.

### Pattern 3: OAuth Status Check Endpoint

**What:** PWA needs to know if Google is connected before showing Gmail UI. Add `GET /v1/google/status` that returns `{ connected: boolean }` by checking `oauthTokens` table without making a live Google API call. Keep it bearer-protected — the PWA user is already authenticated with their Vigil bearer key; Google OAuth status is a separate concern.

**Example:**
```typescript
router.get("/google/status", async (c) => {
  const rows = await db.select().from(oauthTokens)
    .where(eq(oauthTokens.provider, "google")).limit(1);
  return c.json({
    connected: rows.length > 0,
    expiresAt: rows[0]?.expiresAt ?? null,
  });
});
```

### Pattern 4: New CLI Subcommand (Swift ArgumentParser)

**What:** Add struct inside `DailyBrief` extension, register in `CommandConfiguration.subcommands`. All new commands use `VigilAPIClient` via `DailyBrief.makeAPIClient(config:)`. Every command takes `@Option var configPath: String?` for consistency with existing subcommands.

**Example structure** for `capture`:
```swift
extension DailyBrief {
    struct Capture: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Capture a thought and trigger AI triage."
        )
        @Argument(help: "Thought text to capture")
        var content: [String]

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            let config = try ConfigLoader.load(from: configPath)
            let apiClient = try DailyBrief.makeAPIClient(config: config)
            let text = content.joined(separator: " ")
            // POST /v1/thoughts then POST /v1/triage
        }
    }
}
```

The `subcommands` array in `CommandConfiguration` must be updated to include `Capture.self`, `Triage.self`, `Doctor.self`, `Setup.self` and remove `Complete.self`, `Uncomplete.self`, `ListCompleted.self`.

### Pattern 5: Work Order Extraction from Gmail

**What:** A dedicated `POST /v1/gmail/extract-work-orders` endpoint fetches recent Gmail messages matching a subject filter, passes content to Claude, returns structured work order candidates, then the PWA prompts user confirmation before calling the existing `POST /v1/work-orders/sync` to upsert.

**Design rationale:** Uses Claude AI (same pattern as triage/insights routes) rather than regex parsing, since WO emails vary by sender. Returns candidates for user confirmation before upsert — avoids silent data corruption. Two-step: extract, then confirm-and-sync.

## Data Flow

### Gmail OAuth Connect Flow

```
PWA /settings
    | click "Connect Google"
    | navigate to GET /v1/auth/google
vigil-core calendar-auth.ts
    | generateAuthUrl (calendar + gmail.readonly scopes)
    | redirect to accounts.google.com
Google OAuth consent screen
    | user approves
    | redirect to GET /v1/auth/google/callback?code=...
vigil-core calendar-auth.ts
    | exchange code for tokens
    | encryptToken(refresh_token)
    | upsert into oauthTokens WHERE provider='google'
    | redirect to $PWA_URL
PWA /settings (re-mounts on return)
    | calls GET /v1/google/status to confirm connected state
    | updates UI: "Connected"
```

### Gmail Inbox Flow (PWA)

```
PWA /gmail
    | GET /v1/gmail/messages?maxResults=50
vigil-core gmail.ts route
    | gmailService.listMessages()
gmail-service.ts
    | getValidAccessToken()  -- token refresh transparent
    | GET https://gmail.googleapis.com/gmail/v1/users/me/messages
    | return normalized list
    | { status: "ok", messages: [...] }
        or { status: "needs_reauth" }  -- PWA shows re-connect prompt
PWA renders message list
    | click message -> GET /v1/gmail/thread/:threadId
    | render thread
```

### Work Order Extraction Flow

```
PWA Gmail page -> "Extract Work Orders" button
    | POST /v1/gmail/extract-work-orders { query: "work order assigned", maxResults: 20 }
vigil-core gmail-extract.ts
    | gmailService.searchMessages(query)
    | fetch full message bodies
    | Claude prompt: "Identify work order fields from these emails"
    | return { candidates: [ { caseNumber, store, ... } ] }
PWA shows candidates for user review
    | user confirms -> POST /v1/work-orders/sync { workOrders: [...] }
vigil-core work-orders.ts (existing)
    | upsert into workOrders table
    | { synced: N }
```

### CLI Capture Flow

```
$ dailybrief capture "remember to check the server logs"
DailyBrief.Capture
    | ConfigLoader.load()
    | VigilAPIClient.post("/v1/thoughts", { content, source: "cli" })
vigil-core thoughts.ts (existing)
    | insert into thoughts table
    | return { id, content, ... }
DailyBrief.Capture
    | VigilAPIClient.post("/v1/triage", { content })
vigil-core triage.ts (existing)
    | Claude categorizes -> { category, confidence }
    | VigilAPIClient.put("/v1/thoughts/:id", { category, confidence })
    | print "Captured: [task] 'remember...' (confidence: 0.91)"
```

### CLI Doctor Flow

```
$ dailybrief doctor
DailyBrief.Doctor
    | Check config file exists + parseable
    | Check apiKey non-empty, matches vk_ prefix
    | GET /v1/health -> check 200
    | GET /v1/summary -> check 200 (validates bearer auth)
    | Check LaunchAgent plist exists at ~/Library/LaunchAgents/
    | Check plist API key matches config
    | Print table: PASS/FAIL per check
```

## Integration Points

### New vs Existing Components

| Component | New or Modified | Integration Point |
|-----------|----------------|-------------------|
| `calendar-auth.ts` | MODIFIED — add `gmail.readonly` to scope | Single line change to scope array |
| `gmail-service.ts` | NEW | Copy `getValidAccessToken()` logic from calendar-service; queries same `oauthTokens` row |
| `gmail.ts` route | NEW | Registered in `index.ts` same as `calendar.ts`; behind bearer auth |
| `gmail-extract.ts` route | NEW | Calls gmail-service + Claude AI service; results confirmed by user then POST to existing `/work-orders/sync` |
| `index.ts` | MODIFIED — register gmail routes | Two `app.route()` calls after existing calendar routes |
| `SettingsPage.tsx` | NEW | Calls `GET /v1/google/status`, redirects browser to `/v1/auth/google` |
| `GmailPage.tsx` | NEW | Calls `/v1/gmail/messages`, `/v1/gmail/thread/:id`, `/v1/gmail/search` |
| `client.ts` | MODIFIED | Add Gmail API functions, google status check function |
| `App.tsx` | MODIFIED | Add `/settings` and `/gmail` routes |
| `Layout.tsx` | MODIFIED | Add Settings and Gmail nav tabs |
| `DailyBrief.swift` | MODIFIED | Add Capture/Triage/Doctor/Setup subcommands; remove Complete/Uncomplete/ListCompleted |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Gmail API v1 | REST via node fetch in gmail-service.ts | Base URL: `https://gmail.googleapis.com/gmail/v1/users/me/` — bearer token from oauthTokens |
| Google OAuth 2.0 | Existing calendar-auth.ts redirect flow | Scope addition only; same client ID/secret/redirect URI env vars |
| Claude AI | Existing AI service pattern in vigil-core | Used for WO extraction — pass email body, return structured fields |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| gmail-service ↔ oauthTokens | Drizzle ORM select/update, same as calendar-service | Shares the single `provider='google'` row — both calendar and gmail use same token |
| gmail-extract ↔ work-orders/sync | Two separate HTTP roundtrips from PWA | Keeps extraction and sync decoupled; user confirmation in between |
| SettingsPage ↔ calendar-auth | Browser redirect (not fetch) to `/v1/auth/google` | Google returns to `$PWA_URL` — Settings page reads `?calendar_error=` query param on mount to detect failures |
| CLI Capture ↔ thoughts+triage | Sequential VigilAPIClient calls | POST thought first, get ID, then POST triage, then PUT update with category |
| CLI Doctor ↔ LaunchAgent plist | FileManager local filesystem reads | No API call for plist check; reads `~/Library/LaunchAgents/` directly |

## Scaling Considerations

This is a single-user system. Scaling is not a concern for v3.1. Gmail API quota (1 billion units/day personal) is not a concern at this usage level.

## Anti-Patterns

### Anti-Pattern 1: Creating a Second `oauthTokens` Row for Gmail

**What people do:** Add a second row `provider='gmail'` with separate tokens for Gmail vs Calendar.

**Why it's wrong:** Google issues a single OAuth token set per user authorization. The access token covers all scopes granted during consent. Two rows means two separate Google auth flows, two refresh cycles, and they will diverge when one is revoked.

**Do this instead:** Store one row `provider='google'`. Add `gmail.readonly` to the scope array in `calendar-auth.ts`. Both calendar-service and gmail-service call `getValidAccessToken()` using the same row.

### Anti-Pattern 2: Fetching Full Gmail Message Bodies in the List Endpoint

**What people do:** List messages and immediately fetch full body for each item in the list response.

**Why it's wrong:** Gmail list API returns IDs + snippet only. Fetching full body per message = N+1 requests, slow, API quota waste.

**Do this instead:** List endpoint returns IDs + snippet + metadata (subject, from, date). Full body fetch only on thread/message click.

### Anti-Pattern 3: Auto-Syncing Work Orders from Gmail on Every List Load

**What people do:** Every call to `GET /v1/gmail/messages` also runs WO extraction and syncs automatically.

**Why it's wrong:** Silent data mutation is dangerous. WO extraction uses Claude and is slow (~2-3s). User should explicitly trigger extraction and confirm candidates before they land in work orders.

**Do this instead:** WO extraction is an explicit user action on the Gmail page. Separate endpoint `POST /v1/gmail/extract-work-orders`. Returns candidates for review. User confirms before sync.

### Anti-Pattern 4: Removing Old CLI Subcommands Before New Ones Are Built

**What people do:** Remove `Complete`, `Uncomplete`, `ListCompleted` first, breaking the compiled binary, then add new subcommands.

**Why it's wrong:** The CLI binary may be in use between deployment steps. Removing commands before replacements exist = broken tool during the transition window.

**Do this instead:** Add `Capture`, `Triage`, `Doctor`, `Setup` first. Remove `Complete`, `Uncomplete`, `ListCompleted` in the same commit. Single atomic change.

### Anti-Pattern 5: Putting the OAuth Redirect Target in the PWA

**What people do:** Make the OAuth callback go to a PWA route like `/settings/callback` and handle token exchange in the browser.

**Why it's wrong:** Token exchange (code → tokens) must happen server-side so client secrets are never exposed. The existing `calendar-auth.ts` callback correctly handles exchange on the server and redirects to PWA root on completion.

**Do this instead:** Keep the callback in `calendar-auth.ts`. PWA Settings page detects return by checking `GET /v1/google/status` after mount, or reading `?calendar_error=` query param that the server appends on failure.

## Build Order

Based on component dependencies:

1. **Gmail OAuth scope extension** (calendar-auth.ts) — Must land first. No Gmail API calls work until tokens include `gmail.readonly`. Requires user re-authorization.

2. **gmail-service.ts** — Server-side service using existing token infrastructure. Independently testable.

3. **Gmail routes (gmail.ts) + google/status endpoint** — List/thread/search endpoints. Register in `index.ts`. Deploy to Railway.

4. **PWA: Settings page + client.ts google status functions** — Google connect/disconnect UI. Validates the OAuth flow end-to-end before Gmail inbox is built.

5. **PWA: Gmail page + inbox/search UI** — Depends on gmail routes (step 3) and Settings OAuth state (step 4).

6. **gmail-extract.ts + WO extraction** — Depends on gmail-service (step 2). Can be built after inbox UI is working.

7. **CLI: Capture + Triage subcommands** — Fully independent of Gmail. Can be built in parallel with any of steps 2-6.

8. **CLI: Doctor subcommand** — Independent. Build alongside capture/triage.

9. **CLI: Setup promotion + old command removal** — Final cleanup. Remove `Complete`, `Uncomplete`, `ListCompleted` only after new commands are confirmed working.

## Sources

- Direct inspection of `vigil-core/src/routes/calendar-auth.ts` — OAuth flow, CSRF nonce, token upsert
- Direct inspection of `vigil-core/src/services/calendar-service.ts` — token management, DI factory pattern
- Direct inspection of `vigil-core/src/db/schema.ts` — oauthTokens table structure
- Direct inspection of `vigil-core/src/utils/token-crypto.ts` — AES-256-GCM token encryption
- Direct inspection of `vigil-core/src/index.ts` — middleware stack, auth bypass rules, route registration
- Direct inspection of `vigil-pwa/src/App.tsx`, `Layout.tsx` — routing and nav tab structure
- Direct inspection of `vigil-pwa/src/api/client.ts` — API client patterns, bearer auth
- Direct inspection of `Sources/DailyBrief/DailyBrief.swift` — CLI subcommand structure, existing subcommands
- Direct inspection of `Sources/JarvisCore/Services/VigilAPIClient.swift` — Swift API client actor

---
*Architecture research for: Vigil v3.1 Gmail & CLI Evolution*
*Researched: 2026-04-13*
