# Requirements: Vigil v3.5 — Observability, G2 Resubmit & Capture Repair

**Defined:** 2026-04-19
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

**Milestone Goal:** Fix the capture pipeline, unblock G2 store approval, and land analytics/error tracking so we stop debugging blind — plus close the multi-user loop with a real login UI.

## v3.5 Requirements

### Capture Repair

Capture pipeline regressions discovered in daily use after v3.4 shipped. Both bugs silently drop thoughts — highest-priority fix.

- [ ] **CAP-01**: HEIC photos dropped into the Mac watched folder (iCloud path) are triaged instead of silently ignored
- [ ] **CAP-02**: Photos uploaded through the API are AI-triaged automatically — the category field is populated on the returned thought, not left null

### G2 Store Resubmit

Rejection feedback from Even Realities store review must be fully addressed before resubmit — partial fixes trigger full re-rejection cycle. All three items ship together.

- [ ] **G2-01**: Plugin screenshots regenerated at correct resolution using the current Even simulator (v0.6.2+)
- [ ] **G2-02**: Double-tap gesture on home screen triggers a visible exit confirmation dialogue with a short timeout window, per Even Hub page-lifecycle guidelines
- [ ] **G2-03**: WebView content renders brand-compliant UI (colors, typography, spacing) following the Even Realities public software design guidelines — never blank

### Analytics & Observability

PostHog Cloud integration (free tier sufficient at current scale). Unified vendor for error tracking + product events + API metrics.

- [ ] **ANLY-01**: Server-side and PWA exceptions are automatically captured in PostHog (stack traces, request context, userId when available)
- [ ] **ANLY-02**: Product events emit for the capture funnel (thought captured, triage completed, brief generated, photo uploaded, chat sent) with userId attached
- [ ] **ANLY-03**: API middleware records per-route metrics (status code, latency, route name) for every authenticated request
- [ ] **ANLY-04**: Authenticated users are identified to PostHog via `posthog.identify(userId)` on login so all events attribute to the right person

### Authentication UI

Closes the v3.4 multi-user loop. Backend endpoints (`POST /v1/auth/register`, `POST /v1/auth/login`, JWT) already shipped.

- [ ] **AUTH-06**: PWA visitor can sign up with email + password and is logged in on success (JWT stored, subsequent API calls authenticated)
- [ ] **AUTH-07**: PWA visitor can log in with existing email + password and is redirected to the dashboard
- [ ] **AUTH-08**: PWA shows authenticated user's email in the header/settings area via a `GET /v1/me` endpoint

### Extension Persistence

Safari extension disables on every Mac restart — breaking daily URL capture workflow.

- [ ] **EXT-01**: Safari extension remains enabled after a Mac reboot without the user manually re-enabling it in Safari settings

## Deferred to v3.6

Tracked but not in the v3.5 roadmap.

### Authentication

- **AUTH-09**: User can change password from PWA profile page
- **AUTH-10**: User can request forgot-password email link
- **AUTH-11**: User can verify email address after signup

### Multi-user tech debt

- **W-01**: `work_order_statuses` table gains userId column with migration
- **W-02**: Cross-user isolation test covers `GET /v1/brief/:date` PDF bytes path
- **SCHED-01**: Scheduler fans out per-user (brief generation, prioritization cache) instead of hard-scoping to seed user

### Blocked

- **IOS-01**: iOS Shortcut quick-capture — blocked by Shortcuts.app bugs
- **WO-01**: ServiceNow API work order source — blocked on IT token

## Out of Scope

Explicitly excluded from v3.5 with reasoning.

| Feature | Reason |
|---------|--------|
| PostHog self-hosting | Cloud free tier covers 1M events + 100k exceptions/month; self-hosting adds ops burden without benefit at current scale |
| Sentry integration | PostHog exception autocapture covers all error tracking; two vendors would be redundant |
| PostHog feature flags | No rollout decisions needed in v3.5; defer to when the need is real |
| PostHog session recording | Privacy risk on a personal-thoughts/therapy app; defer until allowlist/blocklist strategy is designed |
| Mac Swift PostHog SDK | Server-side posthog-node captures Mac-originated events by userId; Swift SDK adds a 3rd integration with little marginal value |
| Refresh token rotation | v3.4 stateless JWT is fine; rotation adds complexity without a current threat model |
| Passkeys / magic link auth | Email + password is sufficient baseline; passkeys are a nice-to-have, not a v3.5 blocker |
| Safari App Store submission | Scope of submission process (provisioning, App Review) is its own milestone; Login-Item persistence is the pragmatic v3.5 fix |
| G2 hardware physical retest | Device arrives ~2026-04-24 mid-milestone; simulator-verified submission is the critical path, hardware testing adds confidence but does not gate resubmit |
| Non-iCloud folder watcher rewrite | Existing DispatchSource path works for local folders; don't break what isn't broken while fixing iCloud |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAP-01 | Phase 103 | Pending |
| CAP-02 | Phase 103 | Pending |
| ANLY-01 | Phase 103 + Phase 104 | Pending |
| AUTH-08 | Phase 103 | Pending |
| AUTH-06 | Phase 104 | Pending |
| AUTH-07 | Phase 104 | Pending |
| ANLY-02 | Phase 105 | Pending |
| ANLY-03 | Phase 105 | Pending |
| ANLY-04 | Phase 105 | Pending |
| G2-01 | Phase 106 | Pending |
| G2-02 | Phase 106 | Pending |
| G2-03 | Phase 106 | Pending |
| EXT-01 | Phase 107 | Pending |

**Coverage:**
- v3.5 requirements: 13 total
- Mapped to phases: 13 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-19*
*Last updated: 2026-04-19 — traceability completed by roadmapper*
