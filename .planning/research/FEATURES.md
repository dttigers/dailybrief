# Feature Research

**Domain:** Gmail PWA integration + CLI restructure for ambient AI assistant (Vigil v3.1)
**Researched:** 2026-04-13
**Confidence:** HIGH (existing platform context well-understood; Gmail API patterns verified via official docs)

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Google OAuth connect/disconnect in Settings | Every modern app with Google integration has an Integrations settings page; users expect a dedicated toggle, not buried config | MEDIUM | OAuth infrastructure exists from Phase 74 (Calendar). Add gmail.readonly scope. Settings/Integrations page is new UI work. |
| Inbox message list with sender, subject, snippet, date | Standard Gmail-like inbox view; anything less feels broken | MEDIUM | users.messages.list with pageToken pagination. Show 20-50 per page. Must handle label filtering (INBOX). |
| Thread reading (expand full conversation) | Email apps always show full thread context, not just latest message | MEDIUM | users.threads.get. Decode base64 MIME parts. Display as conversation stack. |
| Gmail search by keyword/sender/date | Gmail's own search is the mental model; users expect it to work identically | MEDIUM | q parameter supports Gmail advanced search syntax (from:, after:, before:, subject:). Pass through to API. |
| Token refresh handled transparently | OAuth sessions expire; users should never be prompted to re-auth unexpectedly | LOW | Refresh token flow already exists for Calendar — reuse exact pattern. |
| CLI `capture` sends thought and confirms | Quick capture from terminal is the primary use case; confirmation output expected | LOW | POST /v1/thoughts, print returned ID + category. Support piped input (`echo "thought" \| vigil capture`). |
| CLI `doctor` reports pass/fail per check | Users expect a clean checklist output, not a wall of text | LOW | Standard pattern (Expo, Ghost CLI, Salesforce CLI all use this). Print checkmark/X per check with remediation hint. |
| CLI `setup` as proper subcommand | Subcommand > flag; `--setup` flag is non-standard and undiscoverable | LOW | Replace `--setup` flag. `vigil setup` runs interactive configuration. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Work order auto-detection from Gmail | Eliminates manual triage of IT/ops emails; the existing IMAP WO extraction moves to a richer, OAuth-authenticated source | HIGH | Heuristics: subject keywords (work order, WO-XXXX, ticket, incident, request), sender domain allowlist, body patterns. Claude AI classification as fallback. Flag to user before ingesting. |
| Gmail source tagged on WO records | Unified work order view regardless of source (IMAP vs Gmail API vs ServiceNow future) | MEDIUM | Existing WO data model accepts source field. Tag new entries with source: gmail. No schema change required. |
| CLI `triage` batch re-processes uncategorized | ADHD user generates many thoughts; some escape first-pass triage; batch re-triage surfaces buried items | MEDIUM | GET /v1/thoughts?category=uncategorized, POST /v1/thoughts/:id/triage in sequence. Show progress line per thought. |
| CLI `doctor` checks Railway sync state | Verifies that local config and server are aligned, not just that env vars exist | MEDIUM | Ping /v1/health, compare bearer token fingerprint, check LaunchAgent plist, verify ANTHROPIC_API_KEY validity with a lightweight probe. |
| Incremental auth — request gmail.readonly only when user opens Gmail section | Least-privilege UX; Google recommends incremental scopes; users trust narrow permissions more | LOW | Trigger consent flow on first Gmail page visit if scope not already granted. Show what the scope covers before redirecting. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Gmail polling loop (fetch every N seconds) | "Real-time" inbox updates feel dynamic | Exhausts Gmail API quota (250 units/user/second; list = 5 units). Creates rate-limiting errors at low user count. | On-demand fetch on page load + manual refresh button. Push (Pub/Sub watch) is future if needed. |
| Full mailbox sync / offline inbox cache | Power users want Gmail offline | Scope creep — requires local DB schema for emails, sync conflict resolution, storage management. This is a work order extractor, not a mail client. | Read-only fetch on demand. Cache thread content in memory for current session only. |
| Send email from PWA | Symmetry with inbox reading | Requires gmail.send or gmail.modify scope — triggers Google's sensitive scope verification process (OAuth app review, privacy policy, security assessment). Adds months of delay. | Read-only (gmail.readonly) only for v3.1. Write capabilities deferred. |
| Mark as read / label management from PWA | Users want to "process" email in Vigil | Requires gmail.modify scope (same sensitive review issue). Vigil is a capture/brief tool, not a mail client. | Show read/unread state. Let user act in Gmail itself. |
| Replace IMAP work order extraction immediately | Gmail OAuth seems cleaner | IMAP extraction already works and is actively used. Migration risk is high mid-milestone. | Additive: Gmail source feeds WOs alongside IMAP. Retire IMAP only after Gmail source is validated over several days. |
| CLI interactive TUI for triage | Rich terminal UI is appealing | Commander.js is not a TUI framework; adding Ink/Blessed adds a dependency for a single command. Solo dev maintenance burden. | Simple list output + confirmation prompts. Enough for ADHD quick-triage workflow. |

---

## Feature Dependencies

```
[Google OAuth in PWA Settings]
    └──required by──> [Gmail inbox reading in PWA]
    └──required by──> [Gmail search in PWA]
    └──required by──> [Work order extraction from Gmail]

[Gmail API service in vigil-core]
    └──required by──> [Gmail inbox reading in PWA]
    └──required by──> [Gmail search in PWA]
    └──required by──> [Work order extraction from Gmail]
                           └──requires──> [Gmail inbox reading]

[CLI capture command]
    └──depends on──> [vigil-core POST /v1/thoughts] (already exists)

[CLI triage command]
    └──depends on──> [vigil-core GET /v1/thoughts + POST /v1/thoughts/:id/triage] (already exists)

[CLI doctor command]
    └──depends on──> [vigil-core GET /v1/health] (already exists)

[CLI setup subcommand]
    └──replaces──> [--setup flag] (retire after)

[Retire CLI complete/uncomplete/list-completed]
    └──safe after──> [PWA work order management] (already shipped in v2.5)
```

### Dependency Notes

- **OAuth before inbox reading:** The Gmail API routes in vigil-core need an access token. The OAuth connect flow (Settings/Integrations page) must be built and tokens stored before any Gmail data can be fetched. Calendar OAuth from Phase 74 established the token storage pattern — reuse it with an added scope.
- **Gmail API service before PWA views:** All three Gmail PWA features (inbox, search, WO extraction) call the same server-side service. Build the service layer once and expose multiple routes.
- **CLI commands are independent:** capture, triage, doctor, and setup are all independent commander commands. They can be developed and shipped in any order within the milestone.
- **Retiring complete/uncomplete:** These CLI commands are only safe to remove because PWA work order management shipped in v2.5. Users have a GUI path. The dependency is already satisfied.

---

## MVP Definition

This is a subsequent milestone on a production platform. "MVP" means: what must ship for v3.1 to be considered complete per the milestone goal.

### Ship for v3.1

- [ ] Google OAuth connect/disconnect in PWA Settings/Integrations page — gateway to all Gmail features
- [ ] Gmail API service in vigil-core with gmail.readonly scope — single server-side integration point
- [ ] Gmail inbox reading in PWA (list + thread view) — primary Gmail surface
- [ ] Gmail search in PWA — keyword, sender, date query passthrough
- [ ] Work order extraction from Gmail — heuristic detection + Claude classification, feed into WO system
- [ ] CLI `capture` command — POST thought from terminal
- [ ] CLI `triage` command — batch re-triage uncategorized
- [ ] CLI `doctor` command — env check, API key validation, plist check, Railway ping
- [ ] CLI `setup` subcommand — replaces --setup flag
- [ ] Retire CLI complete/uncomplete/list-completed

### After v3.1 Validation (v3.2+)

- [ ] Gmail Pub/Sub push notifications — trigger brief re-generation on new WO email (add only if polling proves insufficient)
- [ ] Email delivery of daily brief as PDF attachment — was deferred from v3.0; Gmail OAuth makes SMTP auth available
- [ ] Work order source unification UI — show IMAP vs Gmail source per WO, allow user to disable IMAP once Gmail is trusted
- [ ] ServiceNow API integration — unblocked only when IT provides token (external dependency, not addressable in v3.1)

### Future (v4+)

- [ ] Gmail write access (reply, archive, label) — requires Google sensitive scope verification process
- [ ] Full offline inbox cache — requires email storage schema, significant scope expansion
- [ ] Android XR native Gmail — PWA first; native only if spatial features needed

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Google OAuth in PWA Settings | HIGH (unlocks all Gmail) | MEDIUM | P1 |
| Gmail API server service | HIGH (foundation) | MEDIUM | P1 |
| Gmail inbox list + thread read | HIGH | MEDIUM | P1 |
| Work order extraction from Gmail | HIGH (daily operational value) | HIGH | P1 |
| Gmail search | MEDIUM | LOW (q passthrough) | P1 |
| CLI `capture` command | HIGH (ADHD core workflow) | LOW | P1 |
| CLI `doctor` command | HIGH (reduces support load on solo dev) | LOW | P1 |
| CLI `setup` subcommand | MEDIUM | LOW | P1 |
| CLI `triage` command | MEDIUM | LOW | P1 |
| Retire CLI WO commands | LOW (cleanup) | LOW | P1 (required by spec) |
| Gmail Pub/Sub push | LOW (polling sufficient at 1-user scale) | HIGH | P3 |
| Email delivery of brief | MEDIUM | MEDIUM | P2 |

**Priority key:**
- P1: Must have for v3.1 launch
- P2: Should have, add in v3.2
- P3: Nice to have, future consideration

---

## Existing Platform Dependencies

This milestone is additive to existing infrastructure. Key dependencies already satisfied:

| Existing Capability | How v3.1 Depends On It |
|---------------------|------------------------|
| Google OAuth token storage + refresh (Phase 74, Calendar) | Reuse token schema, add gmail.readonly to existing scope set |
| vigil-core POST /v1/thoughts | CLI `capture` calls this directly |
| vigil-core thought triage endpoint | CLI `triage` calls this |
| vigil-core GET /v1/health | CLI `doctor` pings this |
| PWA Settings page (existing) | Add Integrations tab; don't rebuild settings from scratch |
| Work order data model in PostgreSQL | Gmail WO extraction writes to same table with source: gmail |
| PWA Work Order management (v2.5) | Enables safe retirement of CLI complete/uncomplete/list-completed |
| Commander.js in Mac CLI | All new CLI commands follow same commander pattern |

---

## Sources

- [Gmail API scopes — Google Developers](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail search/filter query syntax — Google Developers](https://developers.google.com/workspace/gmail/api/guides/filtering)
- [users.threads.list reference — Google Developers](https://developers.google.com/gmail/api/reference/rest/v1/users.threads/list)
- [OAuth 2.0 for Google APIs — Google Developers](https://developers.google.com/identity/protocols/oauth2)
- [Disconnecting OAuth accounts — Google Developers](https://developers.google.com/identity/sign-in/web/disconnect)
- [Salesforce CLI doctor command pattern](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_doctor_commands_unified.htm)
- [Expo doctor — environment diagnostics pattern](https://docs.expo.dev/develop/tools/)
- [CLI Guidelines — clig.dev](https://clig.dev/)
- [Node.js Gmail API integration — Fullstack Labs](https://www.fullstack.com/labs/resources/blog/accessing-mailbox-using-the-gmail-api-and-node-js)

---
*Feature research for: Vigil v3.1 Gmail & CLI Evolution*
*Researched: 2026-04-13*
