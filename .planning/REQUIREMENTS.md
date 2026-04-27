# Requirements: Vigil v3.7 — Source Pickers, Verify-Email UX & Closeout Cleanup

**Defined:** 2026-04-27
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

**Milestone goal:** Give users explicit control over which calendars and sports leagues/teams feed their daily brief from PWA Settings, harden the auth-email flows' rate-limit + error-state UX (verify-email AND forgot-password), and close out three v3.6 leftovers (DMARC quarantine ramp, prod test-user cleanup, ThoughtRow polish).

## v1 Requirements

### Settings — Data Source Pickers

- [x] **CAL-01**: User can pick which Google calendars feed the brief from PWA Settings — multi-select list rendered from `GET /v1/calendar/calendars`, persisted per-user via existing `calendarSelections` array on `oauth_tokens`, respected by `fetchTodaysEvents(userId)` so unselected calendars no longer contribute events. Empty selection continues to fall back to "all calendars" (current behavior).
- [ ] **SPORTS-01**: User can pick which sports leagues + favorite teams to track from PWA Settings — multi-select league toggle (MLB / NFL / NBA / NHL) and per-league team picker, persisted per-user via new storage (column or table), respected by sports-service so unselected leagues are skipped and team-specific data uses the user's pick instead of hardcoded `teamIds`. Brief PDF only renders selected leagues.

### Auth Email UX Hardening (D-13/D-21 friction across both flows)

- [ ] **AUTH-12**: 429 (rate-limited) responses from `POST /v1/auth/verify-email`, `POST /v1/auth/resend-verification`, `POST /v1/auth/forgot-password`, and `POST /v1/auth/reset-password` render distinct PWA copy with a Retry-After countdown ("Too many attempts — try again in N minutes") instead of the D-21 single-bucket "This link is no longer valid". Server continues to return Retry-After header (already present in Phase 112/113 implementations); change is PWA-side error-bucket split + new copy.
- [ ] **AUTH-13**: Rate-limit policy tuning across `verify-email` + `resend-verification` + `forgot-password` + `reset-password` — raise the 5/hr per-IP cap to a more legitimate-user-tolerant value AND/OR add a per-userId axis (where a userId is identifiable, e.g. `resend-verification` uses bearerAuth so already has userId; `forgot-password` only knows email, but per-email is a similar axis). Final per-endpoint policy chosen during phase planning; security goal preserved (brute-force protection intact, enumeration-safety unchanged).

### Production Hygiene

- [ ] **OPS-01**: Test users `upper@case.com` (id=3) and `test+phase104@local.test` (id=44) — and any cascaded children (oauth_tokens, password_reset_tokens, work_order_statuses, brief_pdfs, briefs, thoughts, etc.) — deleted from Railway prod. One-shot DB hygiene operation with documented runbook + before/after row counts.
- [ ] **OPS-02**: SEED-003 DMARC ramp `p=none → p=quarantine` on `vigilhub.io` Cloudflare DNS, gated on the auto-eval routine that fires 2026-05-06 (≥7 days clean aggregate reports + ≥3 days verify-email production volume). Phase implementation lands the runbook + ramp action; ramp action only fires after gate passes.

### PWA Polish

- [x] **POLISH-01**: `whitespace-pre-line` applied to `vigil-pwa/src/components/ThoughtRow.tsx:399` so multi-line thought captures preserve line breaks in the row view (today they collapse to a single line).

## v2 Requirements

Deferred to a future milestone. Tracked here so they don't get lost.

### Auth Email UX

- **SEED-004**: Token rotation copy differentiation in verify-email error UX — when a newer resend has invalidated this token, render "This link was replaced by a newer email" (with link to request a fresh one), distinct from time-expired and 429 buckets. v3.7 covers the rate-limit axis (AUTH-12); the rotation axis is deferred.

### Capture / Importers

- **WO-IMPORTER-DISABLE**: Disable or stub the gmail-workorders importer setInterval tick. Currently runs every 5 min as dead weight while ServiceNow API remains blocked on IT token. Defer until whichever milestone unblocks ServiceNow API (then either replace with API or remove entirely).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native iOS/Android app for source pickers | PWA Settings covers cross-platform access; native mobile only if PWA proves insufficient |
| Per-source brief preview ("here's what your brief looks like with these calendars selected") | Out of scope for v3.7 — adds significant complexity; defer until pickers ship and user signals demand |
| Apply same 429/error-state pattern to login (`POST /v1/auth/login`) and register (`POST /v1/auth/register`) | These flows have different threat models (enumeration safety dominates); v3.7 deliberately scoped to email-token flows only (verify-email + forgot-password). Revisit per-endpoint if needed |
| DMARC `p=quarantine → p=reject` final ramp | Two-step ramp (`none → quarantine → reject`) is industry standard; v3.7 only does the first step. Final `reject` ramp deferred to v3.8+ after ≥30 days clean quarantine telemetry |
| Sports picker that auto-detects favorite teams from existing brief history | Manual picker is sufficient; auto-detection is over-engineering for solo-dev tool |
| Calendar picker that supports nested sub-calendars or shared calendars from other Google accounts | Single-account model preserved (v3.0 decision); only the user's connected Google account is filterable |

## Traceability

Populated 2026-04-27 by gsd-roadmapper during ROADMAP.md creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAL-01 | Phase 115 | Complete |
| POLISH-01 | Phase 115 | Complete |
| SPORTS-01 | Phase 116 | Pending |
| AUTH-12 | Phase 117 | Pending |
| AUTH-13 | Phase 117 | Pending |
| OPS-01 | Phase 118 | Pending |
| OPS-02 | Phase 119 | Pending |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7 ✓
- Unmapped: 0

---
*Requirements defined: 2026-04-27*
*Last updated: 2026-04-27 after milestone-discuss confirmation*
