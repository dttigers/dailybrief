# Stack Research

**Domain:** Gmail API integration, PWA OAuth UI, CLI subcommand restructure
**Researched:** 2026-04-13
**Confidence:** HIGH (versions verified via live npm registry; existing codebase audited directly)

## Context: What Already Exists

This milestone adds on top of a complete, deployed stack. Key existing capabilities that v3.1 builds on:

- `googleapis@171.4.0` — already in `vigil-core/package.json` (installed for Calendar)
- `google-auth-library@10.6.2` — already installed (transitive dep of googleapis)
- `oauthTokens` Drizzle table — already exists with `provider` unique index, AES-256-GCM encrypted refresh tokens
- `/v1/auth/google` and `/v1/auth/google/callback` routes — already exist in `calendar-auth.ts` with state nonce, CSRF protection, DB upsert pattern
- `PWA_URL` env var + redirect-to-PWA-with-query-params pattern — already established
- `swift-argument-parser@1.7.1` — already in Package.resolved
- `VigilAPIClient` actor — already has `get<T>`, `post<T>`, `patch<T>` generics for CLI→API calls

---

## New Dependencies Required

### Server (vigil-core)

**Zero new npm packages required.**

Gmail API access uses `google.gmail('v1')` from the already-installed `googleapis@171.4.0`. The Gmail API is part of the same googleapis umbrella package used for Calendar. No separate install.

| What's Needed | How It's Provided | Notes |
|---------------|-------------------|-------|
| Gmail API client | `googleapis@171.4.0` (already installed) | `google.gmail({ version: 'v1', auth: oauth2Client })` — same pattern as `google.calendar('v3')` |
| OAuth token storage | `oauthTokens` Drizzle table (already exists) | Reuse `provider: 'google'` row; same encrypted refresh token. Calendar and Gmail share one token row. |
| Token refresh | `google-auth-library@10.6.2` (already installed) | `OAuth2Client.setCredentials({ refresh_token })` + `tokens` event listener — identical to calendar-service.ts pattern |
| gmail.readonly scope | Add to existing OAuth consent URL | Append `'https://www.googleapis.com/auth/gmail.readonly'` to the scopes array in `calendar-auth.ts` |

**Why no new package:** `googleapis@171.4.0` is a monorepo that includes all Google APIs. It is 200MB unpacked on disk but already present. The standalone `@googleapis/gmail@16.1.1` (1.1MB) would be cleaner for a greenfield project, but adding it alongside the already-present `googleapis` creates two packages providing the same API surface — a confusion hazard. Use what's already there.

### PWA (vigil-pwa)

**Zero new npm packages required.**

The PWA Settings/Integrations page uses the same redirect-to-server pattern already established for Calendar OAuth. The server initiates the Google consent flow; the PWA just provides a "Connect Google Account" button that navigates to `/v1/auth/google`. The callback redirects back to the PWA with `?calendar_connected=true` or `?calendar_error=...` query params, which the PWA reads via the browser's native `URLSearchParams` (already used in `api/client.ts`).

| What's Needed | How It's Provided | Notes |
|---------------|-------------------|-------|
| OAuth connect button | Link/navigate to `${apiBase}/v1/auth/google` | Server handles all Google redirect logic |
| OAuth callback handling | `useSearchParams` from React Router 7 (already installed) | Read `?calendar_connected` / `?calendar_error` from URL on return to `/settings` |
| Gmail message display | Fetch from new server endpoints via existing `api/client.ts` | No new HTTP lib needed |
| Markdown / rich text | None — email text displayed as plain text or preformatted | No renderer lib needed |
| New route: `/settings` | React Router 7 `<Route>` in `App.tsx` | Add `SettingsPage` component, add route |

### CLI (Swift / DailyBrief)

**Zero new Swift packages required.**

All three new commands (`capture`, `triage`, `doctor`) are `AsyncParsableCommand` subcommands using the already-present `swift-argument-parser@1.7.1`. API calls use `VigilAPIClient` (already exists in JarvisCore). System health checks in `doctor` use `Foundation.ProcessInfo`, `FileManager`, and `URLSession` — all stdlib.

| What's Needed | How It's Provided | Notes |
|---------------|-------------------|-------|
| `capture` subcommand | `AsyncParsableCommand` + `VigilAPIClient.post(path: "/thoughts", body:)` | VigilAPIClient already has typed POST |
| `triage` subcommand | `AsyncParsableCommand` + `VigilAPIClient.get(path: "/thoughts?category=null")` then `POST /triage` per item | Two existing endpoints, no new work |
| `doctor` subcommand | `Foundation.ProcessInfo.processInfo.environment` + `FileManager.default.fileExists` + `URLSession` health ping | Pure stdlib; reads env, plist path, pings `/v1/health` |
| `setup` subcommand (promotion from flag) | Rename existing `--setup` flag logic to `Setup: AsyncParsableCommand`, add `Setup.self` to `subcommands` array | Pattern already used for `Generate`, `History`, `Export`, etc. |
| Retire `Complete`, `Uncomplete`, `ListCompleted`, `EmailAuth` | Remove from `subcommands` array in `CommandConfiguration` | Delete the four `struct` implementations in `DailyBrief.swift` |

---

## Scope Additions to Existing OAuth Flow

The Calendar OAuth route currently requests only `calendar.readonly` scope. Gmail requires adding `gmail.readonly`. Because Google OAuth2 grants are per-consent, the user must re-authorize to add the new scope.

**Approach:** Expand the scope array in `calendar-auth.ts` to request both scopes in one consent:

```typescript
scope: [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
],
```

This means one OAuth flow grants both Calendar and Gmail access. The existing `oauthTokens` table row (provider: 'google') stores the combined refresh token. The Gmail service reads from the same row as the Calendar service.

**Re-auth trigger:** If the stored token was granted for calendar-only, a Gmail API call will fail with a 403 `insufficientPermissions`. The Gmail service should check for this and return `{ status: "needs_reauth" }` — matching the pattern already in `calendar-service.ts`.

---

## Gmail Service Pattern (Server)

Mirror `calendar-service.ts` exactly:

```typescript
// gmail-service.ts skeleton
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { db } from "../db/connection.js";
import { oauthTokens } from "../db/schema.js";
import { decryptToken } from "../utils/token-crypto.js";

export type GmailListResponse =
  | { status: "ok"; messages: GmailMessage[]; nextPageToken: string | null }
  | { status: "needs_reauth" }
  | { status: "error"; error: string };

// Load refresh token from DB, set credentials, return gmail client
async function makeGmailClient(): Promise<gmail_v1.Gmail | null> { ... }

// List inbox messages (label: INBOX, max 20 by default)
export async function listMessages(query?: string): Promise<GmailListResponse> { ... }

// Get full message/thread by ID
export async function getMessage(id: string): Promise<GmailMessageResponse> { ... }
```

**Key Gmail API calls used:**
- `gmail.users.messages.list({ userId: 'me', labelIds: ['INBOX'], maxResults: 20, q: searchQuery })`
- `gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })`
- `gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })`

Message body is base64url-encoded in `parts[].body.data`. Decode with `Buffer.from(data, 'base64url').toString('utf-8')`.

---

## New API Routes Required (Server)

| Route | Purpose | Service |
|-------|---------|---------|
| `GET /v1/gmail/messages` | List inbox messages, optional `?q=` search param | gmail-service.ts |
| `GET /v1/gmail/messages/:id` | Get full message body | gmail-service.ts |
| `GET /v1/gmail/threads/:id` | Get full thread | gmail-service.ts |
| `GET /v1/gmail/status` | Returns `connected\|needs_reauth\|not_connected` | gmail-service.ts |
| `POST /v1/gmail/extract-work-orders` | Scan recent messages for WO patterns, insert into work_orders | gmail-service.ts + work-order extractor |

No new auth routes needed — `/v1/auth/google` already exists. The scope expansion is the only change to that file.

---

## CLI Command Specification

### `vigil capture <text>`

```
USAGE: vigil capture <thought>

ARGUMENTS:
  <thought>   The thought to capture (quote multi-word text)

OPTIONS:
  --source <source>   Source type: text (default), voice, image
```

Maps to: `POST /v1/thoughts` with `{ content, source: "text" }`. Server triggers AI triage asynchronously. Print captured thought ID on success.

### `vigil triage`

```
USAGE: vigil triage [--limit <n>] [--dry-run]

OPTIONS:
  --limit <n>   Max thoughts to triage (default: 50)
  --dry-run     Show what would be triaged without calling AI
```

Maps to: `GET /v1/thoughts?category=null&limit=N` to fetch uncategorized thoughts, then `POST /v1/triage` per thought. Prints count on completion.

### `vigil doctor`

```
USAGE: vigil doctor

Checks:
  [ ] Config file exists and is valid JSON
  [ ] apiKey and apiBaseUrl are set
  [ ] API is reachable (GET /v1/health)
  [ ] ANTHROPIC_API_KEY present on server (via /v1/health response body)
  [ ] LaunchAgent plist exists at ~/Library/LaunchAgents/com.jamesonmorrill.dailybrief.plist
  [ ] LaunchAgent is loaded (runs: launchctl list | grep dailybrief)
```

No API client changes needed — `VigilAPIClient.get(path: "/v1/health")` already works. LaunchAgent check uses `Process` (Foundation) to run `launchctl list`.

### `vigil setup` (promote from `--setup` flag)

Existing `createTemplateConfig()` logic moves from `Generate.run()` into `Setup.run()`. `Generate` loses the `--setup` flag.

---

## Retirement Plan for Existing CLI Commands

| Command | Action | Rationale |
|---------|--------|-----------|
| `complete <cn>` | Delete | Dashboard-only; CLI work order management was never the primary UX |
| `uncomplete <cn>` | Delete | Same |
| `list-completed` | Delete | Same |
| `email-auth` | Delete | ServiceNow blocked; IMAP auth is server-side now |

Remove the four `struct` types from `DailyBrief.swift` and their `self` references from `CommandConfiguration.subcommands`.

---

## Installation

No new packages are required. All capabilities are covered by existing dependencies.

```bash
# vigil-core — no new installs
# vigil-pwa — no new installs
# Swift/CLI — no new packages
```

---

## Alternatives Considered

| Recommendation | Alternative | Why Not |
|----------------|-------------|---------|
| Use existing `googleapis@171.4.0` for Gmail | Add `@googleapis/gmail@16.1.1` (standalone) | Already installed. Adding both creates API surface duplication. Solo-user tool, install size is not a constraint. |
| Expand scopes in existing auth route | New `/v1/auth/gmail` route | One consent > two consents. Single `oauthTokens` row per user is simpler. Matches Google's recommended "request all scopes at once" guidance. |
| `needs_reauth` status pattern (match Calendar) | Throw 401 from Gmail route | PWA already handles `needs_reauth` JSON from calendar. Consistent error surface. |
| Swift ArgumentParser subcommand for `doctor` | Shell script `vigil-doctor.sh` | Existing `scripts/dailybrief-doctor.sh` partially covers this, but CLI subcommand is discoverable (`vigil help`), uses typed config loading, and can ping the API with auth. Shell script has no access to the encrypted config. |
| Remove work order CLI commands entirely | Move to `--deprecated` flag | Users are the solo developer — deprecation warnings for one person are noise. Clean removal is better. |

## What NOT to Add

| Avoid | Why | Notes |
|-------|-----|-------|
| `imapflow` / `node-imap` for Gmail | Gmail API (OAuth) is the correct server-side approach; IMAP for Gmail requires "less secure apps" or App Passwords, which Google is phasing out | Use `googleapis` gmail.readonly |
| `passport` / `passport-google-oauth20` | Only needed for session-based multi-user auth. Vigil is single-user with bearer tokens. The existing manual OAuth flow is simpler and already proven. | Keep current `google-auth-library` OAuth2Client pattern |
| `react-query` / `@tanstack/query` | PWA currently manages async state with `useState` + `useEffect` + direct fetch. The Gmail inbox page is one new page — adding a data-fetching library for one feature over-engineers it. | Extend existing `api/client.ts` pattern |
| `dompurify` or HTML sanitizer | Gmail message bodies will be displayed as plain text or `<pre>` — NOT rendered as HTML. Rendering untrusted HTML from emails requires a sanitizer and iframe sandboxing. That's a separate, deeper feature. | Display text/plain part only |
| `googleapis/gmail` scope `modify` or `compose` | We need read-only. Requesting excess scopes is a security and consent UX problem. | Use `gmail.readonly` only |

## Version Compatibility

| Package | Version in Use | Status |
|---------|---------------|--------|
| `googleapis` | 171.4.0 | Already installed; Gmail v1 API available via `google.gmail('v1')` |
| `google-auth-library` | 10.6.2 | Already installed; current stable |
| `swift-argument-parser` | 1.7.1 (Package.resolved) | Current stable; supports `AsyncParsableCommand`, subcommand sections, aliases |
| React Router | 7.14.0 | `useSearchParams` hook available for OAuth callback query params |

## Sources

- npm registry (live) — `googleapis@171.4.0` (200MB unpacked), `@googleapis/gmail@16.1.1` (1.1MB unpacked) — size comparison verified directly
- `google-auth-library@10.6.2` — current stable confirmed via `npm show`
- [Gmail API Node.js reference — google.gmail v1](https://googleapis.dev/nodejs/googleapis/latest/gmail/classes/Gmail.html) — HIGH confidence (official Google API docs)
- [Google OAuth2 scopes: gmail.readonly](https://developers.google.com/gmail/api/auth/scopes) — HIGH confidence (official)
- Vigil codebase audit (live) — `vigil-core/package.json`, `src/routes/calendar-auth.ts`, `src/services/calendar-service.ts`, `src/db/schema.ts`, `Package.resolved`, `vigil-pwa/package.json`, `Sources/DailyBrief/DailyBrief.swift` — HIGH confidence (source of truth)

---
*Stack research for: Vigil v3.1 Gmail & CLI Evolution additions*
*Researched: 2026-04-13*
