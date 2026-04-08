# Requirements: Vigil — Ambient AI Life Assistant

**Defined:** 2026-03-31 (v1.0) — currently scoped: v2.3 Projects & Precision (2026-04-07)
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

## v2.3 Requirements — Projects & Precision

Active milestone. Each maps to roadmap phases 51+.

### DEV — Developer / Update Flow

- [ ] **DEV-01**: User can rebuild and reinstall DailyBrief CLI and DailyBriefMonitor binaries via a single menu bar action, with no terminal interaction
- [ ] **DEV-02**: The update action reloads the DailyBriefMonitor LaunchAgent so the new binary takes effect immediately after install
- [ ] **DEV-03**: User sees inline status feedback in the menu bar (in-progress, success, or error with reason) for each update attempt
- [ ] **DEV-04**: Update action is idempotent — safe to click repeatedly; reports a no-op when no source changes are present

### PROJ — Projects as First-Class Entities

- [ ] **PROJ-01**: User can create a named personal project from the dashboard
- [ ] **PROJ-02**: Each project has its own dashboard view showing only the thoughts assigned to it
- [ ] **PROJ-03**: User can manually assign any thought to a project (or leave it unassigned) from the dashboard
- [ ] **PROJ-04**: User can move a thought between projects or unassign it
- [ ] **PROJ-05**: Each project has an optional status (active / archived / done) that filters dashboard views
- [ ] **PROJ-06**: Thoughts currently sitting in the generic "project" triage category remain accessible and can be retroactively assigned to named projects
- [ ] **PROJ-07**: Projects persist in Vigil Core PostgreSQL with full CRUD API endpoints under `/projects`

### PHOTO — Smart Photo Upload

- [ ] **PHOTO-01**: System detects whether an uploaded photo is lined paper or gridded paper before extracting content
- [ ] **PHOTO-02**: Lined-paper photos are split into multiple separate thoughts, one per distinct line/bullet/paragraph
- [ ] **PHOTO-03**: Gridded-paper photos are kept as a single thought, eligible for assignment to a project
- [ ] **PHOTO-04**: Both modes produce verbatim transcriptions of the actual handwriting — no third-person paraphrase, no editorial summary
- [ ] **PHOTO-05**: User can override the detected paper type before the thoughts are committed (force "lined" or "gridded")
- [ ] **PHOTO-06**: If paper type can't be confidently detected, system falls back to a user-configurable default and surfaces the uncertainty in the UI

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Capture

- [x] **CAPT-01**: User can capture a thought via menu bar popover in under 1 second with zero required fields
- [x] **CAPT-02**: User can trigger capture from anywhere via global keyboard shortcut
- [x] **CAPT-03**: User can record voice and have it transcribed on-device via WhisperKit
- [x] **CAPT-04**: User can capture a photo/image and receive an AI-generated text description via multimodal Claude
- [x] **CAPT-05**: All captured entries have automatic creation and modification timestamps

### AI Triage

- [x] **TRIAGE-01**: Every captured thought is auto-categorized by Claude into one of 5 types (task, therapy, idea, reflection, project)
- [x] **TRIAGE-02**: Each categorization displays a confidence score so the user can gauge accuracy
- [x] **TRIAGE-03**: User can override the AI-assigned category on any entry

### Storage & Search

- [x] **STORE-01**: All data persists locally in SQLite via GRDB with no data loss
- [x] **STORE-02**: User can full-text search across all captured thoughts via FTS5

### Dashboard

- [x] **DASH-01**: User can view all captured entries in a central SwiftUI dashboard
- [x] **DASH-02**: User can configure data source integrations via settings UI (toggle sources, select teams, manage connections)

### Daily Brief

- [x] **BRIEF-01**: Daily PDF brief incorporates captured thoughts, unprocessed items, and today's priorities
- [x] **BRIEF-02**: AI affirmations reference recent captured entries for contextual encouragement

### Integrations

- [x] **INTEG-01**: User can pull events from selected Google Calendars into the daily brief and dashboard

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### AI Triage

- **TRIAGE-04**: AI generates reflection prompts after capture ("What made this feel urgent?")

### Storage & Search

- [x] **STORE-03**: User can export entries as Markdown or JSON
- **STORE-04**: Semantic/vector search (hybrid with FTS5)

### Dashboard

- **DASH-03**: User can filter entries by category (task/therapy/idea/reflection/project)
- **DASH-04**: User can edit text and re-triage entries from the dashboard

### Daily Brief

- **BRIEF-03**: Dedicated therapy prep section aggregating therapy-category entries

### Pattern Recognition

- **PATTERN-01**: Weekly summary of most common categories and recurring keywords
- **PATTERN-02**: Cross-entry insight surfacing ("you've mentioned X 3 times this week")
- **PATTERN-03**: Mood/theme trend analysis over time

### Integrations

- **INTEG-02**: Weather data in daily brief
- **INTEG-03**: Health/HRV data integration

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Streaks / gamification | ADHD shame spiral on missed days |
| Nested folder hierarchies | ADHD brains don't maintain them; flat + search instead |
| Push notification overload | Worsens ADHD signal-to-noise; pull-based (brief) instead |
| AI therapy chatbot | Scope creep into clinical territory; liability risk |
| Plugin/extension marketplace | Maintenance burden; ADHD "tinkering trap" |
| Social/sharing features | Single-user personal tool |
| Cloud sync as primary storage | Defeats local-first privacy promise |
| Mobile app | Pocket voice recorder handles mobile capture |
| Real-time voice assistant | Capture-and-review, not conversational |
| Multi-user support | Personal tool for one person |

## Traceability

Which phases cover which requirements. Updated by create-roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STORE-01 | Phase 1 | Complete |
| STORE-02 | Phase 1 | Complete |
| CAPT-01 | Phase 2 | Complete |
| CAPT-02 | Phase 2 | Complete |
| CAPT-05 | Phase 2 | Complete |
| TRIAGE-01 | Phase 3 | Complete |
| TRIAGE-02 | Phase 3 | Complete |
| TRIAGE-03 | Phase 3 | Complete |
| DASH-01 | Phase 4 | Complete |
| DASH-02 | Phase 4 | Complete |
| CAPT-03 | Phase 5 | Complete |
| CAPT-04 | Phase 5 | Complete |
| BRIEF-01 | Phase 6 | Complete |
| BRIEF-02 | Phase 6 | Complete |
| INTEG-01 | Phase 7 | Complete |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-04-03 — all v1 requirements complete*
