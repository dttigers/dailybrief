# Requirements: Vigil v3.1 — Gmail & CLI Evolution

**Defined:** 2026-04-13
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

## v3.1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### OAuth

- [ ] **OAUTH-01**: User can connect their Google account from a PWA Settings page (grants gmail.readonly + calendar.readonly scopes)
- [ ] **OAUTH-02**: User can disconnect their Google account from the PWA Settings page
- [ ] **OAUTH-03**: PWA displays Google connection status (connected, needs re-auth, disconnected)
- [ ] **OAUTH-04**: Server uses signed JWT state parameter for OAuth CSRF protection (replaces in-memory nonce)

### Gmail Work Orders

- [ ] **GWO-01**: Server fetches work order emails from Gmail API using configurable sender/subject patterns
- [ ] **GWO-02**: Extracted work orders are stored in the existing workOrders table
- [ ] **GWO-03**: Work order extraction runs on-demand via API endpoint (PWA trigger or scheduled)

### CLI

- [ ] **CLI-04**: User can capture a thought from the terminal via `dailybrief capture "text"` with optional --category, --no-triage, --source flags
- [ ] **CLI-05**: User can batch re-triage uncategorized thoughts via `dailybrief triage` with --limit and --force flags
- [ ] **CLI-06**: User can check environment health via `dailybrief doctor` (API keys, env vars, plist, Railway sync)
- [ ] **CLI-07**: `--setup` flag promoted to `dailybrief setup` subcommand
- [ ] **CLI-08**: `complete`, `uncomplete`, `list-completed` commands removed (dashboard-only)

## Future Requirements

- Gmail inbox reading — list messages, read threads in PWA
- Gmail search — search by keyword, sender, date range in PWA
- Email delivery — optional scheduled brief delivery as PDF attachment (deferred from v3.0)
- IMAP retirement — retire Mac CLI EmailService after Gmail WO extraction is validated

## Out of Scope

- Gmail send/reply — triggers Google sensitive scope review process
- Gmail label management / mark-as-read — write operations require gmail.modify scope
- Real-time Gmail push notifications — Pub/Sub integration, unnecessary for on-demand WO extraction
- IMAP retirement in this milestone — Gmail runs alongside IMAP for validation first

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OAUTH-01 | — | Pending |
| OAUTH-02 | — | Pending |
| OAUTH-03 | — | Pending |
| OAUTH-04 | — | Pending |
| GWO-01 | — | Pending |
| GWO-02 | — | Pending |
| GWO-03 | — | Pending |
| CLI-04 | — | Pending |
| CLI-05 | — | Pending |
| CLI-06 | — | Pending |
| CLI-07 | — | Pending |
| CLI-08 | — | Pending |
