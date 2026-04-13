# Pitfalls Research

**Domain:** Gmail API integration, Google OAuth scope expansion, PWA OAuth UI, work order email detection, CLI restructure — v3.1 Gmail & CLI Evolution
**Researched:** 2026-04-13
**Confidence:** HIGH (Google OAuth scope behavior — official docs verified), HIGH (Gmail API quota — official docs verified), MEDIUM (PWA OAuth patterns — multiple community sources), MEDIUM (CLI backward compat — commander.js docs), MEDIUM (work order detection — pattern analysis)

---

## Critical Pitfalls

### Pitfall 1: gmail.readonly Is a Restricted Scope — Not Sensitive

**What goes wrong:**
Developers add `gmail.readonly` to an existing verified OAuth app's consent screen, assume it's a "sensitive" scope (like Calendar), and ship — then Google's unverified-app warning screen blocks all users. The scope `https://www.googleapis.com/auth/gmail.readonly` is a **restricted** scope, a tier above sensitive, requiring either a formal security assessment (CASA audit) or qualification under the personal-use exception.

**Why it happens:**
`gmail.readonly` sounds low-risk (read-only, not write), but Google categorizes all Gmail scopes as restricted because mail access exposes the full content of private communications. Calendar scopes (`calendar.readonly`, `calendar.events`) are sensitive, not restricted — so developers assume Gmail is the same tier.

**How to avoid:**
This app qualifies for the **personal-use exception**: the only Google account using it is the owner's, and Vigil is a single-user tool. Confirm in the Cloud Console that the OAuth consent screen's user type is "External" (already done) but only the owner's account is ever used. Do NOT add test users that are strangers — keep the app in "Testing" state or keep the user list to yourself. No CASA audit is needed under the personal-use exception. Document this explicitly in the code so future contributors don't accidentally "open up" registration.

**Warning signs:**
- User sees "Google hasn't verified this app" warning screen when authorizing
- Authorization fails with a 100-user cap hit
- Cloud Console shows `gmail.readonly` with a red warning rather than yellow

**Phase to address:** Gmail OAuth server phase (phase adding `gmail.readonly` scope to vigil-core)

---

### Pitfall 2: Existing Calendar Token Lacks Gmail Scope — Silent Failure at Runtime

**What goes wrong:**
The Phase 74 refresh token stored in PostgreSQL was issued with only `calendar.readonly` scope. When the Gmail service calls `gmail.users.messages.list` using the same token, the API returns `403 insufficientPermissions`. Since the server silently refreshes access tokens from the stored refresh token, there is no consent UI — the user is never prompted to add Gmail permission, and the feature just silently fails or returns a misleading error.

**Why it happens:**
Google access tokens are scoped to whatever was granted at authorization time. A refresh token only produces access tokens for the scopes that were granted. The token does not gain new scopes automatically when you add them to the OAuth consent screen configuration.

**How to avoid:**
Design the Google OAuth flow to detect scope gaps. On the server, after the user connects Google, check the scopes present in the stored token against required scopes for each feature. If `gmail.readonly` is absent, expose a `scopeStatus` field in the integrations API response (e.g., `{ calendar: 'connected', gmail: 'needs_auth' }`). The PWA integrations page reads this and shows a "Connect Gmail" button that re-initiates the OAuth flow with the full combined scope list. Use `include_granted_scopes=true` in the new authorization URL so Google accumulates (not replaces) the scopes.

**Warning signs:**
- Gmail API returns 403 even though the user just connected Google
- User connects and sees calendar events but no Gmail data
- Server logs show `401 invalid_grant` or `403 insufficientPermissions` on Gmail API calls

**Phase to address:** Gmail OAuth server phase; must be handled before Gmail service reads any messages

---

### Pitfall 3: prompt: 'consent' Issues a New Refresh Token on Every Re-Auth — Old One Still Valid

**What goes wrong:**
The existing OAuth flow uses `prompt: 'consent'` to guarantee a refresh token is returned. When a user re-authorizes to add Gmail scope, a brand-new refresh token is issued and stored, but the old Calendar refresh token is now a second live token for the same user-app combination. Google silently invalidates the oldest token when a user accumulates more than ~50 refresh tokens for a client. In a multi-reconnect scenario (user disconnects and reconnects repeatedly), old tokens pile up.

**Why it happens:**
`prompt: 'consent'` forces the consent screen and always returns a new refresh token, even when the user already has a valid one. This is necessary to guarantee token return, but it creates a new token rather than updating the existing one.

**How to avoid:**
On re-auth to add scopes, detect whether a valid token already exists. If yes, build the authorization URL with `include_granted_scopes=true` and omit `prompt: 'consent'` — Google will return a new refresh token only if needed, otherwise just the new access token. After successful re-auth, overwrite the stored token row rather than inserting a new one. Log the event. Do not allow the database to accumulate multiple token rows per user.

**Warning signs:**
- Multiple rows in the `google_tokens` table for the same user
- Intermittent 401 errors on Calendar after the user re-authenticated for Gmail
- `invalid_grant` errors months after a seemingly successful re-auth

**Phase to address:** Gmail OAuth server phase

---

### Pitfall 4: In-Memory OAuth Nonce Is Lost During Railway Deploys

**What goes wrong:**
The existing Calendar OAuth uses an in-memory Map to store the CSRF state nonce with a 5-minute TTL. Railway performs zero-downtime deploys by spinning up a new container before tearing down the old one. If the user starts the OAuth flow against the old container and the callback arrives at the new container, the nonce is not found, the state check fails, and the user sees an authentication error — even though they completed consent successfully.

**Why it happens:**
In-memory state is container-local. Railway's deploy process does not provide session affinity (sticky routing) by default, so the callback request may hit a different container instance than the one that issued the nonce. Even without a rolling deploy, a redeploy during a user's OAuth flow (common in development) blows away the nonce.

**How to avoid:**
Move OAuth nonce storage from in-memory Map to the existing PostgreSQL database with a short-lived TTL column (5 minutes), or use a signed, short-lived JWT as the state parameter (the signature proves origin, so no server-side lookup is needed). The JWT approach requires no new schema: encode `{ nonce, userId, exp }` signed with `GOOGLE_OAUTH_STATE_SECRET`, verify the signature and expiry on callback. This is stateless and survives any number of Railway deploys.

**Warning signs:**
- OAuth callback fails with "state mismatch" error immediately after a Railway deploy
- Works consistently in local dev but fails occasionally in production
- Error rate on `/v1/auth/google/callback` spikes around deploy times

**Phase to address:** Gmail OAuth server phase — fix before shipping any OAuth flow to production

---

### Pitfall 5: messages.list Returns Only IDs — N+1 Quota Burn for Any Inbox View

**What goes wrong:**
`gmail.users.messages.list` returns only `{id, threadId}` per message. To display a useful inbox (subject, sender, snippet, date), the server must call `messages.get` for each message — a classic N+1 pattern. For a page of 20 messages, that is 1 list call + 20 get calls = 21 API calls, consuming at least 105 quota units per page load. Inbox pages that auto-refresh or poll will burn through the 250 quota-units-per-second per-user limit quickly.

**Why it happens:**
Gmail's API design separates listing (cheap, indexed) from fetching (expensive, full message). Many tutorials show the N+1 pattern without noting its quota cost. Developers implement it for simplicity and discover the quota problem in production.

**How to avoid:**
Use the `format: 'metadata'` parameter on `messages.get` with `metadataHeaders: ['Subject', 'From', 'Date']` to fetch only the fields needed for the inbox list view — this avoids downloading the full message body for every row. Use Gmail's **batch API** to send up to 100 `messages.get` calls in a single HTTP request (the batch counts as N requests quota-wise but reduces latency significantly). For the work order detection use case, only fetch full body (`format: 'full'`) for messages that pass a first-pass subject-line filter.

**Warning signs:**
- API returns 429 quota exceeded errors under normal browsing
- Server response time for inbox list exceeds 3 seconds
- Cloud Console quota dashboard shows spikes proportional to inbox page size

**Phase to address:** Gmail server API phase (inbox routes); Gmail search phase

---

### Pitfall 6: OAuth Popup Flow Breaks on iOS PWA Installed to Home Screen

**What goes wrong:**
The recommended Google OAuth pattern for SPAs/PWAs — opening a popup window with the Google consent URL and using `window.postMessage` to communicate the auth result back to the parent — does not work when the PWA is installed to the iOS home screen (standalone mode). iOS Safari in standalone mode blocks `window.open()` entirely or fails to relay `postMessage` across the popup boundary, leaving the OAuth flow stranded.

**Why it happens:**
iOS PWA standalone mode runs in a separate browser process with stricter security policies. `window.open()` in standalone mode opens a new tab in Safari, not a popup in the PWA's process. The `window.opener` reference is null, so `postMessage` never reaches the PWA.

**How to avoid:**
For iOS PWA compatibility, use a full-page redirect flow rather than a popup: store pre-auth state (current route, pending action) in `sessionStorage`, redirect the top-level window to the Google auth URL, and on callback redirect back to the PWA with the auth code in the URL hash or query string. The server exchanges the code for tokens as usual. This is less visually seamless but works universally. Detect `navigator.standalone` and choose the appropriate flow at runtime.

**Warning signs:**
- OAuth works in browser but fails after "Add to Home Screen"
- Console shows `window.open() failed` or popup appears in Safari instead of the PWA
- Auth callback URL opens in Safari, not the PWA

**Phase to address:** PWA OAuth settings UI phase

---

### Pitfall 7: Work Order Regex Has High False Positive Rate on Normal Email

**What goes wrong:**
Simple regex patterns like `/WO[-#]?\d{4,}/i` or `/work order/i` match order confirmation emails from retailers ("Your order #12345"), calendar invites with agenda items, and notification emails from project management tools. The WO extractor floods the work order list with noise, destroying trust in the feature.

**Why it happens:**
Work order numbers follow patterns that overlap with many other business document identifiers. Regex matching on subject lines alone has no context awareness — it cannot distinguish an IT work order from an Amazon order confirmation.

**How to avoid:**
Layer the detection: first filter by sender domain/email (must be from known work-order-issuing systems — in Vigil's case, the IT ticketing domain). Then check the subject for WO indicators. Only fall back to body scanning if the sender passes the filter. For the MVP, hardcode the known sender domain(s) in the config rather than trying to be generic. Use Claude for ambiguous cases — pass the email subject + sender + first 200 characters of body to Claude with the question "Is this an IT work order? Reply with YES or NO and the work order number if yes." This provides the context that regex cannot.

**Warning signs:**
- Work order list fills with Amazon/eBay/Slack notifications after first sync
- User manually deletes false-positive work orders repeatedly
- WO detection confidence drops below 50% on real inbox

**Phase to address:** Work order email detection phase

---

### Pitfall 8: CLI Restructure Silently Breaks LaunchAgent and Scripts Without Warning

**What goes wrong:**
The LaunchAgent plist (`com.jamesonmorrill.dailybrief`) currently calls the CLI with specific flags like `--brief` or similar arguments. Renaming or retiring CLI commands as part of the v3.1 restructure without updating the plist causes silent failures: the brief stops printing in the morning, but there is no error notification because LaunchAgent just exits with a non-zero code that nobody reads.

**Why it happens:**
CLI users (human or automated) have muscle memory and scripts they don't think to update. The LaunchAgent runs headlessly at 4am — there is no interactive console to show an error. By the time the user notices the brief hasn't been printing, it's been a week.

**How to avoid:**
Before removing any argument or command, add a shim that prints a clear deprecation message and exits with code 1: e.g., `vigil --setup` should print `"--setup is deprecated. Use: vigil setup"` then call the new subcommand. Audit the LaunchAgent plist, cron entries, and any shell scripts that invoke the CLI before retiring arguments. Update them in the same phase as the deprecation. Add an integration test that invokes all launchd-relevant CLI paths and asserts exit 0.

**Warning signs:**
- Morning brief stops appearing after CLI restructure
- `launchctl list | grep dailybrief` shows a nonzero last-exit-code
- User reports the brief hasn't printed in N days

**Phase to address:** CLI capture/triage/doctor phase; CLI retire work order commands phase

---

### Pitfall 9: Google OAuth Consent Screen Re-Verification Blocks Production While Pending

**What goes wrong:**
When `gmail.readonly` (a restricted scope) is added to an existing Production-mode OAuth consent screen, Google requires the app to be re-submitted for verification before the new scope is available to users. During the review period (days to weeks), users attempting to authorize Gmail see the "unverified app" warning. If the Calendar auth flow also now requests `gmail.readonly`, existing Calendar users who re-auth are blocked too.

**Why it happens:**
Adding any restricted scope to an existing verified app triggers re-verification. The review queue is not instant, and Google does not provide a "grandfathered" transition window.

**How to avoid:**
Use incremental authorization: keep the initial Google authorization URL requesting only `calendar.readonly` (or whatever the existing verified scope is). Add a separate "Connect Gmail" button in the integrations UI that triggers a second authorization with `gmail.readonly` and `include_granted_scopes=true`. This way, the Gmail auth only runs through the unverified-app warning during the review period — Calendar users are unaffected. Submit the re-verification request at the start of the phase so review can complete before the Gmail feature is widely used. Given Vigil is a personal app, the personal-use exception means verification is never strictly required as long as the app user count stays at 1.

**Warning signs:**
- After adding `gmail.readonly` to the consent screen, Calendar users see the warning on next auth
- `invalid_scope` errors when requesting Gmail on an app still pending review

**Phase to address:** Gmail OAuth server phase — decide exception vs. re-verify before writing any OAuth route code

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store raw OAuth tokens in DB without versioning the encryption key | Simpler schema | Cannot rotate AES key without decrypting all rows first | Never — add a `key_version` column from the start |
| Inline work order detection regex in route handler | Fast to write | Untestable, hard to tune without re-deploying | Never — extract to a `WorkOrderDetector` class with unit tests |
| Re-use same PostgreSQL token row for both Calendar and Gmail | One row = simple | Scope list stored as a string becomes a parsing problem; adding scopes requires schema awareness | Acceptable if the column is `scopes TEXT[]` (Postgres array), not a comma-delimited string |
| Poll Gmail inbox every N minutes for new work orders | No webhook setup | Quota burns continuously; detection latency grows with poll interval | Only if Gmail push notifications (Pub/Sub) are deferred to a future phase |
| Keep `--setup` flag working via shim indefinitely | No user disruption | CLI codebase accumulates dead-weight shim code | Acceptable for one milestone, then remove in the next major CLI cleanup |
| Skip full-body fetch and rely only on subject for WO detection | Cheaper quota | Misses WOs from ticketing systems that put the WO number in the body, not the subject | Acceptable for MVP if sender-domain filter is applied first |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gmail API `messages.list` | Iterating nextPageToken until null without a page cap, consuming all quota | Set `maxResults: 50` and stop at 2 pages for inbox list; use `q:` filter for targeted queries |
| Google OAuth token refresh | Calling the refresh endpoint on every request because you don't cache the expiry | Store `access_token_expires_at` in the DB row; only refresh when within 60 seconds of expiry |
| Google OAuth `prompt: 'consent'` | Using it on every auth (forces new refresh token every time user connects) | Only use on first-time connect or when scopes are being expanded; use `prompt: 'select_account'` or omit for silent re-auth |
| `include_granted_scopes` | Omitting it when requesting an additional scope, getting only the new scope on the new token | Always include `include_granted_scopes=true` when doing incremental authorization |
| Gmail search query `q:` parameter | Using raw user input without sanitizing operator syntax, causing 400 errors | Validate/escape special operators; wrap free-text in quotes |
| PWA `window.open` for OAuth popup | Unconditionally using popup; fails on iOS standalone | Check `navigator.standalone` and `window.open` capability; fall back to redirect flow |
| Commander.js command aliases | Adding alias but forgetting to register it before the `.action()` call | Register `.alias('old-name')` immediately after `.command('new-name')`, before any options or actions |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching full message body for all messages during work order scan | Inbox sync takes 30+ seconds; quota 429 on first scan | Two-pass: list + subject filter → only fetch body for candidates | >20 messages in inbox |
| Fetching all message IDs without pagination limit for initial sync | Memory spike on first load; server timeout | Cap at 100 messages maximum; implement cursor-based pagination | >100 messages in inbox |
| Parallel `messages.get` without concurrency limit | Rate limit 429 on per-user-per-second limit (250 units/s) | Use `p-limit` or similar to cap concurrent Gmail API calls at 10 | >50 messages per batch |
| Running full work-order scan on every inbox load | Redundant Claude API calls; high latency UI | Cache scan results with a `last_scanned_at` timestamp; re-scan only new messages | On every page reload if not cached |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing raw (unencrypted) refresh tokens in PostgreSQL | If DB is compromised, attacker has persistent Google access for all users | Already using AES-256-GCM — ensure the IV is unique per-row and stored alongside the ciphertext, not hardcoded |
| Returning the full token object to the PWA in the `/v1/auth/google/callback` redirect | Token exposed in browser history, logs, and referrer headers | Never send token material to the browser; store server-side and return only a `{ connected: true, scopes: [...] }` status |
| Trusting `redirect_uri` parameter from the client request | Open redirect attack allows attacker to capture auth codes | Hardcode the allowed redirect URIs in the server; reject any `redirect_uri` not matching exactly |
| Logging `Authorization` headers when debugging Gmail API errors | Refresh token captured in Railway log drain | Redact the `Authorization` header in all server-side API call logs; use `[REDACTED]` |
| Exposing the full Gmail message body in the Vigil API response without sanitization | XSS via malicious HTML email rendered in PWA | Strip HTML from message body before returning; or return plaintext-only content |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing raw Google error messages when OAuth fails | "invalid_grant" and "access_denied" are meaningless to users | Map known error codes to plain-English messages; "Google authorization expired — reconnect in Settings" |
| Requiring user to re-authorize every time they visit the integrations page | Friction; makes the connection feel unreliable | Show persistent "Connected as user@gmail.com" status; only show re-auth button when the token is actually invalid |
| Auto-importing all emails as work orders on first sync | Inbox floods the WO list with irrelevant items | Show a preview of detected WOs before importing; require explicit "Import" confirmation on first sync |
| No loading state while Gmail inbox list loads | User thinks the app is broken during 2-5 second API round-trip | Show skeleton rows immediately; stream results progressively if possible |
| Retiring CLI `complete` command without telling users what to use instead | Users type a command they used yesterday and get "command not found" | Print a deprecation message with the alternative: "Use the PWA dashboard at app.vigilhub.io to complete work orders" |
| OAuth connection state lost on PWA refresh because it's only in React state | User connects, refreshes, sees "Not connected" | Persist connection status in the API (`GET /v1/auth/google/status`) and load on mount |

---

## "Looks Done But Isn't" Checklist

- [ ] **Gmail OAuth connect flow:** Often missing the scope-gap detection — verify that an existing Calendar token correctly shows Gmail as "needs_auth" rather than silently failing at the Gmail API call
- [ ] **Token refresh on 401:** Often missing the retry-after-refresh logic — verify that a 401 from Gmail API triggers a token refresh and retries the original request once
- [ ] **OAuth nonce migration:** Often left as in-memory Map — verify the nonce is stored in PostgreSQL (or signed JWT) before any deploy to production
- [ ] **PWA OAuth on iOS standalone:** Often tested only in browser — verify the connect flow works when the PWA is installed to the iOS home screen via "Add to Home Screen"
- [ ] **LaunchAgent plist updated:** Often forgotten when renaming CLI commands — verify `launchctl list com.jamesonmorrill.dailybrief` exits 0 after CLI restructure
- [ ] **Work order false positive test:** Often skipped — verify that a sample Amazon order confirmation email is NOT imported as a work order
- [ ] **Disconnect flow removes token from DB:** Often missing — verify `DELETE /v1/auth/google` actually clears the encrypted token row and revokes the token with Google's revoke endpoint
- [ ] **CLI shim exits with code 0:** Often shims exit 1 (error) — verify deprecated flag shims print the deprecation message and still perform the underlying action, not just error out

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Deployed with unverified gmail.readonly scope, users see warning screen | LOW (single-user app) | Confirm personal-use exception applies; document it; no action needed beyond not adding other users |
| Old Calendar refresh token stopped working after re-auth added Gmail scope | LOW | Force re-auth: set token row to null, PWA shows "reconnect" prompt, user re-authorizes |
| In-memory nonce lost during deploy, users get state-mismatch errors | MEDIUM | Immediate: deploy the JWT-state fix; temporary: document "if OAuth fails, retry once" in error UI |
| N+1 quota exhaustion hits 429 in production | MEDIUM | Add `p-limit` concurrency cap and `metadata`-format optimization; deploy; quota resets at midnight |
| LaunchAgent silent failure after CLI restructure | LOW | Check plist args, update to new command name, `launchctl unload && launchctl load` the plist |
| Work order list flooded with false positives | LOW | Add sender-domain allowlist in config; trigger re-scan; bulk-delete existing false positives via API |
| AES key rotation needed after key exposure | HIGH | Requires reading all tokens, decrypting with old key, re-encrypting with new key; add `key_version` column upfront to enable this |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| gmail.readonly restricted scope / personal-use exception | Gmail OAuth server phase (first phase of milestone) | Confirm personal-use exception before writing any OAuth route; document in code comments |
| Existing Calendar token missing Gmail scope | Gmail OAuth server phase | Integration test: request `/v1/auth/google/status` with a Calendar-only token; assert `gmail: 'needs_auth'` |
| prompt: 'consent' refresh token accumulation | Gmail OAuth server phase | Assert: only one token row per user in `google_tokens` table after multiple re-auths |
| In-memory OAuth nonce lost on deploy | Gmail OAuth server phase | Chaos test: start OAuth flow, redeploy server mid-flow, verify callback succeeds |
| Gmail N+1 quota burn | Gmail server API routes phase | Load test: list 50 messages; assert total API calls ≤ 3 (1 list + 1 batch get + 1 buffer) |
| OAuth popup broken on iOS standalone PWA | PWA OAuth settings UI phase | Manual test on iPhone with PWA installed to home screen |
| Work order false positive regex | Work order extraction phase | Unit test suite with 20 sample emails (10 real WOs, 10 false-positive candidates) |
| CLI restructure breaks LaunchAgent | CLI capture/triage/doctor phase | After CLI restructure, run `launchctl start com.jamesonmorrill.dailybrief` and verify exit 0 |
| Consent screen re-verification blocks production | Gmail OAuth server phase (decision point before code) | Decide exception vs. re-verify; record decision in phase plan |

---

## Sources

- [Gmail API — Choose Scopes (restricted scope classification)](https://developers.google.com/workspace/gmail/api/auth/scopes) — HIGH confidence
- [Restricted Scope Verification (personal-use exception)](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) — HIGH confidence
- [Gmail API — Usage Limits (quota units per method)](https://developers.google.com/workspace/gmail/api/reference/quota) — HIGH confidence
- [Gmail API — List Messages (N+1 pattern documentation)](https://developers.google.com/workspace/gmail/api/guides/list-messages) — HIGH confidence
- [Gmail API — Batch Requests](https://developers.google.com/gmail/api/guides/batch) — HIGH confidence
- [Google OAuth — Web Server Applications (incremental auth, include_granted_scopes)](https://developers.google.com/identity/protocols/oauth2/web-server) — HIGH confidence
- [Google OAuth — Best Practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices) — HIGH confidence
- [OAuth 2.0 Changes to Approved App (re-verification on scope addition)](https://support.google.com/cloud/answer/13464018) — HIGH confidence
- [Debugging OAuth: missing scopes on refresh tokens (scope mismatch issue)](https://www.jmwhite.co.uk/blog/debugging-oauth-the-mysterious-case-of-missing-scopes-on-refresh-tokens) — MEDIUM confidence
- [Five annoying issues with Google OAuth Scope Verification (gmass.co)](https://www.gmass.co/blog/five-annoying-issues-google-oauth-scope-verification/) — MEDIUM confidence
- [OAuth Incremental Authorization is Useless (gmass.co — prompt:consent behavior)](https://www.gmass.co/blog/oauth-incremental-authorization-is-useless/) — MEDIUM confidence
- [Progressive Web Apps with OAuth — popup pitfall on iOS](https://medium.com/@jonnykalambay/progressive-web-apps-with-oauth-dont-repeat-my-mistake-16a4063ce113) — MEDIUM confidence
- [PWA OAuth popup pattern — how major apps implement it](https://dev.to/dinkydani21/how-we-use-a-popup-for-google-and-outlook-oauth-oci) — MEDIUM confidence
- [Concurrency with OAuth token refreshes (nango.dev)](https://nango.dev/blog/concurrency-with-oauth-token-refreshes) — MEDIUM confidence
- [Commander.js alias and deprecated features documentation](https://github.com/tj/commander.js/blob/master/docs/deprecated.md) — HIGH confidence
- [Auth0 — Best practices for storing access tokens in the browser](https://curity.medium.com/best-practices-for-storing-access-tokens-in-the-browser-6b3d515d9814) — MEDIUM confidence

---
*Pitfalls research for: Gmail API integration, PWA OAuth UI, work order detection, CLI restructure — Vigil v3.1*
*Researched: 2026-04-13*
