# Requirements: Jarvis — Personal AI Life Assistant

**Defined:** 2026-03-31
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Capture

- [x] **CAPT-01**: User can capture a thought via menu bar popover in under 1 second with zero required fields
- [x] **CAPT-02**: User can trigger capture from anywhere via global keyboard shortcut
- [ ] **CAPT-03**: User can record voice and have it transcribed on-device via WhisperKit
- [ ] **CAPT-04**: User can capture a photo/image and receive an AI-generated text description via multimodal Claude
- [x] **CAPT-05**: All captured entries have automatic creation and modification timestamps

### AI Triage

- [x] **TRIAGE-01**: Every captured thought is auto-categorized by Claude into one of 5 types (task, therapy, idea, reflection, project)
- [x] **TRIAGE-02**: Each categorization displays a confidence score so the user can gauge accuracy
- [x] **TRIAGE-03**: User can override the AI-assigned category on any entry

### Storage & Search

- [ ] **STORE-01**: All data persists locally in SQLite via GRDB with no data loss
- [ ] **STORE-02**: User can full-text search across all captured thoughts via FTS5

### Dashboard

- [x] **DASH-01**: User can view all captured entries in a central SwiftUI dashboard
- [x] **DASH-02**: User can configure data source integrations via settings UI (toggle sources, select teams, manage connections)

### Daily Brief

- [ ] **BRIEF-01**: Daily PDF brief incorporates captured thoughts, unprocessed items, and today's priorities
- [ ] **BRIEF-02**: AI affirmations reference recent captured entries for contextual encouragement

### Integrations

- [ ] **INTEG-01**: User can pull events from selected Google Calendars into the daily brief and dashboard

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### AI Triage

- **TRIAGE-04**: AI generates reflection prompts after capture ("What made this feel urgent?")

### Storage & Search

- **STORE-03**: User can export entries as Markdown or JSON
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
| CAPT-03 | Phase 5 | Pending |
| CAPT-04 | Phase 5 | Pending |
| BRIEF-01 | Phase 6 | Pending |
| BRIEF-02 | Phase 6 | Pending |
| INTEG-01 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after roadmap creation*
