# Project Research Summary

**Project:** Vigil v3.1 — Gmail & CLI Evolution
**Domain:** Gmail OAuth integration, PWA Settings/Integrations UI, CLI subcommand restructure
**Researched:** 2026-04-13
**Confidence:** HIGH

## Executive Summary

Vigil v3.1 is an additive milestone on a deployed single-user ambient AI platform. The core insight from all four research streams is the same: almost nothing needs to be invented. The Gmail API is already available in the installed `googleapis@171.4.0` package, the OAuth token storage and refresh machinery exists from Phase 74 (Calendar), the PWA redirect-back pattern is already in use, and all new CLI commands follow the exact same `AsyncParsableCommand` pattern as existing commands. The primary work is connecting existing infrastructure to new surface area — not building new infrastructure.

The recommended approach is to build in strict dependency order: Gmail OAuth scope extension first (the single change to `calendar-auth.ts` that unlocks all Gmail API calls), then the server-side `gmail-service.ts` (mirroring `calendar-service.ts` exactly), then PWA Settings and Gmail pages, then work order extraction. CLI commands are fully independent of the Gmail track and can be built in parallel at any point. The milestone reduces to four coherent work streams with clear sequencing.

The dominant risks are not technical complexity but operational hazards: the `gmail.readonly` scope is Google's "restricted" tier (not "sensitive" like Calendar), so the app must remain in Testing/personal-use state to avoid a CASA security audit. The existing Calendar OAuth refresh token stored in PostgreSQL will fail with `403 insufficientPermissions` on any Gmail API call until the user re-authorizes with the expanded scope set — the PWA must detect and handle this gracefully. The in-memory OAuth nonce must be moved to PostgreSQL or a signed JWT before any production deploy to survive Railway rolling restarts. These three pitfalls are all addressable in the first phase of the milestone.

## Key Findings

### Recommended Stack

Zero new packages are required anywhere in the stack. `googleapis@171.4.0` (already installed for Calendar) provides `google.gmail('v1')` directly. `google-auth-library@10.6.2` handles token refresh identically to the Calendar pattern. `swift-argument-parser@1.7.1` already supports `AsyncParsableCommand` subcommands for all new CLI commands. The PWA uses React Router 7's `useSearchParams` (already installed) for OAuth callback handling.

The only meaningful scope change to `calendar-auth.ts` is appending `https://www.googleapis.com/auth/gmail.readonly` to the existing scopes array. Because the `oauthTokens` table already has a single `provider='google'` row, Calendar and Gmail share the same encrypted refresh token — no schema migration.

**Core technologies:**
- `googleapis@171.4.0` (already installed): Gmail API client via `google.gmail('v1')` — same import as `google.calendar('v3')`
- `google-auth-library@10.6.2` (already installed): OAuth2Client token refresh — identical to calendar-service.ts pattern
- `swift-argument-parser@1.7.1` (already installed): CLI subcommands — `AsyncParsableCommand` structs registered in `CommandConfiguration.subcommands`
- React Router 7 `useSearchParams` (already installed): PWA OAuth callback query param reading
- Drizzle ORM `oauthTokens` table (already exists): single row `provider='google'` holds combined Calendar+Gmail refresh token

### Expected Features

**Must have (table stakes) — ship in v3.1:**
- Google OAuth connect/disconnect in PWA Settings/Integrations page — gateway to all Gmail features
- Gmail API service in vigil-core (`gmail-service.ts`) with `gmail.readonly` scope
- Gmail inbox list with sender, subject, snippet, date + thread view
- Gmail search (keyword/sender/date via `q:` parameter passthrough)
- Work order auto-detection from Gmail (heuristic + Claude classification, user confirmation before import)
- CLI `capture` command — POST thought from terminal with triage
- CLI `triage` command — batch re-triage uncategorized thoughts
- CLI `doctor` command — env check, API key validation, plist check, Railway ping
- CLI `setup` subcommand — promotes `--setup` flag to proper subcommand
- Retire CLI `complete`, `uncomplete`, `list-completed` (PWA covers these since v2.5)

**Should have (competitive) — ship in v3.2:**
- Email delivery of daily brief as PDF attachment (Gmail OAuth makes SMTP auth available)
- Work order source unification UI (IMAP vs Gmail source per WO)

**Defer (v4+):**
- Gmail write access (reply, archive, label) — triggers Google sensitive scope review process
- Full offline inbox cache — requires email storage schema, significant scope expansion
- Gmail Pub/Sub push notifications — not needed at 1-user scale

### Architecture Approach

The architecture is strictly additive. Two new routes (`gmail.ts`, `gmail-extract.ts`) and one new service (`gmail-service.ts`) are added to vigil-core, mirroring the existing calendar pattern. Two new PWA pages (`SettingsPage.tsx`, `GmailPage.tsx`) and three new Swift subcommands (`Capture`, `Triage`, `Doctor`) follow existing patterns exactly. The `oauthTokens` table requires no schema change — both Calendar and Gmail read the same `provider='google'` row.

**Major components:**
1. `calendar-auth.ts` (MODIFIED) — scope array expanded to include `gmail.readonly`; this single change enables the entire Gmail track
2. `gmail-service.ts` (NEW) — mirrors `calendar-service.ts` DI factory pattern; exposes `listMessages`, `getThread`, `searchMessages`
3. `gmail.ts` route + `gmail-extract.ts` route (NEW) — REST endpoints registered in `index.ts` behind bearer auth
4. `SettingsPage.tsx` (NEW) — OAuth connect/disconnect UI; reads `GET /v1/google/status` on mount
5. `GmailPage.tsx` (NEW) — inbox list + thread view + search + "Extract Work Orders" trigger
6. `DailyBrief.swift` (MODIFIED) — add `Capture`, `Triage`, `Doctor`, `Setup` subcommands; remove `Complete`, `Uncomplete`, `ListCompleted`

### Critical Pitfalls

1. **`gmail.readonly` is a restricted scope, not sensitive** — Vigil qualifies for the personal-use exception (single owner account, app stays in Testing state). Never add test users who are not the owner. Document this explicitly in `calendar-auth.ts`. No CASA audit required.

2. **Existing Calendar token silently fails for Gmail with 403** — The Phase 74 refresh token was issued for `calendar.readonly` only. Gmail API calls will return `403 insufficientPermissions`. Server must expose a `scopeStatus` field (e.g., `{ calendar: 'connected', gmail: 'needs_auth' }`) and the PWA must show a re-connect prompt rather than silently failing.

3. **In-memory OAuth nonce lost on Railway rolling deploys** — The current `calendar-auth.ts` stores the CSRF state nonce in an in-memory Map. Railway zero-downtime deploys spin up a new container before tearing down the old one. Fix: use a signed short-lived JWT as the state parameter (no DB schema change required; encodes `{ nonce, exp }` signed with `GOOGLE_OAUTH_STATE_SECRET`).

4. **N+1 quota burn on Gmail inbox list** — `messages.list` returns IDs only; fetching full message per row = 21+ API calls per page load. Fix: use `format: 'metadata'` with `metadataHeaders: ['Subject', 'From', 'Date']` for the list view; only fetch `format: 'full'` on thread click or for WO extraction candidates.

5. **CLI restructure silently breaks LaunchAgent** — The `com.jamesonmorrill.dailybrief` plist runs headlessly at 4am. Renamed or removed CLI arguments cause silent exit-1 failures. Fix: audit the plist and any shell scripts invoking the CLI before removing any argument; update them in the same atomic commit as the command removal.

## Implications for Roadmap

Based on the dependency graph from FEATURES.md and the build order from ARCHITECTURE.md, the milestone maps cleanly to 4 phases, with the CLI track parallelizable against phases 2-4.

### Phase 1: Gmail OAuth Server Foundation
**Rationale:** All Gmail API calls require a valid token with `gmail.readonly` scope. This is the single blocker for everything else in the Gmail track. The in-memory nonce pitfall must also be fixed here before any production deploy.
**Delivers:** `calendar-auth.ts` scope expansion, JWT-based OAuth nonce, `GET /v1/google/status` endpoint, scope-gap detection returning `{ calendar: 'connected', gmail: 'needs_auth' }`
**Addresses:** Google OAuth connect feature (P1 gating feature)
**Avoids:** Pitfalls 1 (restricted scope decision), 2 (scope-gap silent failure), 3 (nonce lost on deploy), 9 (consent screen re-verification)

### Phase 2: Gmail Server Service and API Routes
**Rationale:** PWA cannot display any Gmail data until server routes exist. `gmail-service.ts` is the single integration point for all three Gmail PWA features.
**Delivers:** `gmail-service.ts` (list, thread, search), `gmail.ts` route, `gmail-extract.ts` route with Claude-powered WO candidate extraction; routes deployed to Railway
**Addresses:** Gmail inbox reading, Gmail search, work order extraction (all P1)
**Avoids:** Pitfall 4 (N+1 quota: use `format: 'metadata'` for list, `format: 'full'` only for candidates)

### Phase 3: PWA Settings + Gmail UI
**Rationale:** With OAuth and server routes in place, the PWA surfaces can be built against real endpoints. Settings page validates the full OAuth flow end-to-end before the Gmail inbox is built.
**Delivers:** `SettingsPage.tsx` (OAuth connect/disconnect, scope status display), `GmailPage.tsx` (inbox list + thread view + search + "Extract Work Orders" button with candidate confirmation), `Layout.tsx` nav tabs, `App.tsx` routes
**Addresses:** OAuth connect/disconnect UI, Gmail inbox reading in PWA, Gmail search, work order extraction UI confirmation step (all P1)
**Avoids:** Pitfall 6 (iOS standalone OAuth popup — use full-page redirect, detect `navigator.standalone`)

### Phase 4: CLI Restructure and Cleanup
**Rationale:** CLI commands are fully independent of the Gmail track. Grouping all CLI changes in one phase ensures the LaunchAgent plist is updated atomically alongside command changes.
**Delivers:** `Capture`, `Triage`, `Doctor`, `Setup` subcommands in `DailyBrief.swift`; retirement of `Complete`, `Uncomplete`, `ListCompleted` and `EmailAuth`; LaunchAgent plist verified; `vigil doctor` checks plist and Railway health
**Addresses:** CLI capture, triage, doctor, setup (all P1), CLI retire work order commands (P1)
**Avoids:** Pitfall 5 (CLI restructure breaks LaunchAgent — audit plist in same commit as command removal), Pitfall 8 (add shim for deprecated `--setup` flag)

### Phase Ordering Rationale

- Phase 1 must be first: no Gmail API call succeeds without an authorized token. The nonce fix must land before any OAuth flow is attempted in production.
- Phase 2 depends on Phase 1 tokens but is otherwise independent of the PWA. Deploying server routes to Railway before the PWA pages exist is correct — routes can be tested via curl.
- Phase 3 depends on Phase 2 routes being live. Build Settings OAuth connect first, verify the full OAuth round-trip, then build the Gmail inbox page.
- Phase 4 (CLI) is fully independent and can begin in parallel with Phase 2. Scheduling it last keeps focus, but a parallel track is viable if capacity allows.

### Research Flags

Phases with well-documented patterns (skip deeper research):
- **Phase 2 (Gmail service):** `calendar-service.ts` is the exact template. Copy, rename, adjust. No new patterns.
- **Phase 4 (CLI):** `AsyncParsableCommand` pattern already used for all existing subcommands. No new patterns.

Phases that may benefit from implementation-time verification:
- **Phase 1 (OAuth nonce):** Confirm that `jsonwebtoken` is already in vigil-core or that `node:crypto` HMAC is sufficient before writing the JWT signing implementation.
- **Phase 3 (iOS standalone OAuth):** The `navigator.standalone` detection and full-page redirect fallback should be tested on a real iOS device. Emulators do not reproduce the behavior.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Live codebase audited directly; npm registry versions verified; zero new packages required |
| Features | HIGH | Platform context well-understood; Gmail API feature set maps 1:1 to existing Calendar patterns |
| Architecture | HIGH | Based on direct file inspection of all modified files; patterns are explicitly reusable |
| Pitfalls | HIGH (OAuth), MEDIUM (WO detection, iOS PWA) | Google OAuth behavior from official docs; iOS standalone OAuth and WO false-positive rate from community sources |

**Overall confidence:** HIGH

### Gaps to Address

- **JWT signing key for OAuth nonce:** Confirm whether `GOOGLE_OAUTH_STATE_SECRET` env var is already set in Railway or needs to be added during Phase 1. If absent, provision it before deploying Phase 1.
- **WO sender domain allowlist:** The work order extraction feature requires a known IT ticketing sender domain configured server-side. This value is not in the codebase — must be provided before Phase 2 WO extraction ships.
- **iOS PWA OAuth testing:** Requires manual testing on a real iOS device. If unavailable during Phase 3, defer iOS validation to a post-merge verification step.
- **`jsonwebtoken` availability in vigil-core:** Confirm whether it is already installed (possible as a transitive dep) or whether `node:crypto` HMAC suffices before writing the JWT state implementation in Phase 1.

## Sources

### Primary (HIGH confidence)
- Vigil codebase (live audit) — `vigil-core/package.json`, `calendar-auth.ts`, `calendar-service.ts`, `db/schema.ts`, `token-crypto.ts`, `index.ts`, `vigil-pwa/App.tsx`, `Layout.tsx`, `api/client.ts`, `DailyBrief.swift`, `VigilAPIClient.swift`
- [Gmail API scopes — Google Developers](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Restricted Scope Verification — personal-use exception](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Gmail API quota units per method](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Gmail API batch requests](https://developers.google.com/gmail/api/guides/batch)
- [Google OAuth incremental auth / include_granted_scopes](https://developers.google.com/identity/protocols/oauth2/web-server)

### Secondary (MEDIUM confidence)
- [PWA OAuth popup iOS standalone failure](https://medium.com/@jonnykalambay/progressive-web-apps-with-oauth-dont-repeat-my-mistake-16a4063ce113)
- [OAuth refresh token scope mismatch debugging](https://www.jmwhite.co.uk/blog/debugging-oauth-the-mysterious-case-of-missing-scopes-on-refresh-tokens)
- [OAuth incremental authorization — prompt:consent behavior](https://www.gmass.co/blog/oauth-incremental-authorization-is-useless/)
- [CLI Guidelines — clig.dev](https://clig.dev/)

---
*Research completed: 2026-04-13*
*Ready for roadmap: yes*
