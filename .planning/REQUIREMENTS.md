# Requirements: Vigil v3.0 — Server-Side PDF

**Defined:** 2026-04-12
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

## v3.0 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Sports Proxy

- [ ] **SPORT-01**: Server can fetch MLB scores, standings, and upcoming games via balldontlie.io API
- [ ] **SPORT-02**: Server can fetch NFL scores, standings, and upcoming games via balldontlie.io API
- [ ] **SPORT-03**: Server can fetch NBA scores, standings, and upcoming games via balldontlie.io API
- [ ] **SPORT-04**: Server can fetch NHL scores, standings, and upcoming games via balldontlie.io API
- [ ] **SPORT-05**: Sports data is cached in-memory to avoid redundant API calls during brief generation
- [ ] **SPORT-06**: Brief generates successfully with partial sports data when a league is off-season or API is unavailable

### Google Calendar

- [ ] **CAL-01**: User can authorize Google Calendar access via OAuth flow initiated from PWA
- [ ] **CAL-02**: Server stores OAuth tokens encrypted in PostgreSQL with auto-refresh
- [ ] **CAL-03**: Server can fetch today's calendar events for brief generation

### PDF Generation

- [ ] **PDF-01**: Server renders a 3-page daily brief PDF matching current CoreGraphics layout via PDFKit
- [ ] **PDF-02**: PDF supports configurable paper size (letter, half-letter, A5, notebook, custom)
- [ ] **PDF-03**: PDF supports configurable margins, font scale, and section toggles
- [ ] **PDF-04**: Page 1 contains work orders (status checkboxes, AI priority), Vigil task thoughts, calendar events, notes
- [ ] **PDF-05**: Page 2 contains sports scores/standings (all configured leagues), affirmation, notes
- [ ] **PDF-06**: Page 3+ contains captured thoughts, paginated AI insights, therapy prep

### Brief Assembly

- [ ] **BRIEF-01**: `/v1/brief/generate` endpoint orchestrates all data sources and returns PDF binary
- [ ] **BRIEF-02**: Brief generation uses `Promise.allSettled` — partial failures don't abort the brief
- [ ] **BRIEF-03**: Generated PDFs are saved server-side with storage_key for later retrieval
- [ ] **BRIEF-04**: User can retrieve past brief PDFs via API

### PWA Brief UI

- [ ] **PWA-01**: User can generate a daily brief from the PWA via a generate button
- [ ] **PWA-02**: User can preview the generated PDF inline in the PWA
- [ ] **PWA-03**: User can download the generated PDF from the PWA

### Mac CLI Thin Client

- [x] **CLI-01**: Mac CLI fetches PDF from `/v1/brief/generate` instead of rendering locally
- [x] **CLI-02**: Mac CLI auto-print workflow preserved — BriefScheduler triggers API call + `lpr`
- [ ] **CLI-03**: CoreGraphics PDF rendering code removed from Mac CLI

## Future Requirements

Deferred to v3.1+. Tracked but not in current roadmap.

### Email Delivery

- **EMAIL-01**: User receives daily brief as PDF email attachment on schedule
- **EMAIL-02**: User can configure email delivery schedule and recipient from PWA
- **EMAIL-03**: Email sent via Resend with SPF/DKIM/DMARC configured for vigilhub.io

### Calendar UX

- **CAL-F01**: User can re-authorize Google Calendar from PWA settings when tokens expire

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Puppeteer/Chromium PDF rendering | Disqualified — documented Railway launch failures (pthread/D-Bus errors) |
| Apple Reminders integration | Dropped — Vigil task thoughts replace todo section |
| PDF bytea storage in PostgreSQL | Research shows storage_key + external storage is correct approach |
| Email delivery | P2 — add after core generation is proven in production |
| Real-time brief preview on setting changes | Anti-feature — unnecessary complexity for once-daily generation |
| ESPN API | Replaced by balldontlie.io — documented, authenticated, covers all 4 leagues |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPORT-01 | Phase 73 | Pending |
| SPORT-02 | Phase 73 | Pending |
| SPORT-03 | Phase 73 | Pending |
| SPORT-04 | Phase 73 | Pending |
| SPORT-05 | Phase 73 | Pending |
| SPORT-06 | Phase 73 | Pending |
| CAL-01 | Phase 74 | Pending |
| CAL-02 | Phase 74 | Pending |
| CAL-03 | Phase 74 | Pending |
| PDF-01 | Phase 75 | Pending |
| PDF-02 | Phase 75 | Pending |
| PDF-03 | Phase 75 | Pending |
| PDF-04 | Phase 75 | Pending |
| PDF-05 | Phase 75 | Pending |
| PDF-06 | Phase 75 | Pending |
| BRIEF-01 | Phase 76 | Pending |
| BRIEF-02 | Phase 76 | Pending |
| BRIEF-03 | Phase 76 | Pending |
| BRIEF-04 | Phase 76 | Pending |
| PWA-01 | Phase 77 | Pending |
| PWA-02 | Phase 77 | Pending |
| PWA-03 | Phase 77 | Pending |
| CLI-01 | Phase 78 | Complete |
| CLI-02 | Phase 78 | Complete |
| CLI-03 | Phase 78 | Pending |

**Coverage:**
- v3.0 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 — traceability updated after roadmap creation*
