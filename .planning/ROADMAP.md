# Roadmap: Jarvis — Personal AI Life Assistant

## Overview

Transform the existing DailyBrief CLI and menu bar monitor into a full personal AI life assistant. Starting with a shared core library and local data layer, we build frictionless text capture, AI-powered triage, a central dashboard, voice/image capture, an evolved daily brief, and Google Calendar integration — delivering a system where every thought is captured with zero friction and organized automatically.

## Domain Expertise

None

## Phases

- [x] **Phase 1: Foundation** - Shared JarvisCore library + GRDB data layer
- [ ] **Phase 2: Text Capture** - Menu bar popover with global hotkey for instant thought capture
- [ ] **Phase 3: AI Triage** - Claude-powered auto-categorization with confidence scores
- [ ] **Phase 4: Dashboard** - Central SwiftUI dashboard + settings UI
- [ ] **Phase 5: Voice & Image Capture** - WhisperKit transcription + multimodal photo capture
- [ ] **Phase 6: Evolved Daily Brief** - Captured thoughts and contextual affirmations in PDF
- [ ] **Phase 7: Google Calendar** - Pull calendar events into brief and dashboard

## Phase Details

### Phase 1: Foundation
**Goal**: Extract shared JarvisCore SPM library with data models, GRDB/SQLite storage with FTS5 search, and config management — so CLI, menu bar, and dashboard all share one codebase
**Depends on**: Nothing (first phase)
**Requirements**: STORE-01, STORE-02
**Research**: Unlikely (GRDB well-documented, SPM multi-target is standard pattern)
**Plans**: TBD

Plans:
- [x] 01-01: SPM multi-target setup + JarvisCore library scaffold
- [x] 01-02: GRDB schema, models, ThoughtStore actor with FTS5 search
- [x] 01-03: Migrate existing CLI services into JarvisCore

### Phase 2: Text Capture
**Goal**: Instant text capture via menu bar popover (< 1s) with global keyboard shortcut and automatic timestamps — proving the core capture loop
**Depends on**: Phase 1
**Requirements**: CAPT-01, CAPT-02, CAPT-05
**Research**: Unlikely (SwiftUI popover + global hotkey are established macOS patterns)
**Plans**: TBD

Plans:
- [x] 02-01: Menu bar popover UI + CaptureService actor
- [x] 02-02: Global keyboard shortcut + timestamp automation

### Phase 3: AI Triage
**Goal**: Every captured thought is auto-categorized by Claude into task/therapy/idea/reflection/project with confidence scores, and users can override
**Depends on**: Phase 2
**Requirements**: TRIAGE-01, TRIAGE-02, TRIAGE-03
**Research**: Likely (Claude API prompt engineering for categorization accuracy)
**Research topics**: Optimal prompt structure for 5-category triage, confidence score calibration, SwiftAnthropic SDK integration patterns
**Plans**: TBD

Plans:
- [ ] 03-01: TriageService actor + Claude API integration with SwiftAnthropic
- [ ] 03-02: Confidence score UX + category override flow

### Phase 4: Dashboard
**Goal**: Central SwiftUI dashboard displaying all captured entries with search, and settings UI for configuring data source integrations
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02
**Research**: Unlikely (standard SwiftUI MVVM, no novel patterns)
**Plans**: TBD

Plans:
- [ ] 04-01: Dashboard window with entry list, category views, and FTS5 search
- [ ] 04-02: Settings UI for data source configuration

### Phase 5: Voice & Image Capture
**Goal**: In-app voice recording with WhisperKit on-device transcription and photo/image capture with AI-generated descriptions via multimodal Claude
**Depends on**: Phase 3
**Requirements**: CAPT-03, CAPT-04
**Research**: Likely (WhisperKit model selection, multimodal Claude for image descriptions)
**Research topics**: WhisperKit model size vs accuracy tradeoffs on Apple Silicon, pocket recorder file format compatibility, multimodal Claude API for image-to-text
**Plans**: TBD

Plans:
- [ ] 05-01: Voice recording + WhisperKit transcription pipeline
- [ ] 05-02: Photo/image capture + multimodal Claude description

### Phase 6: Evolved Daily Brief
**Goal**: Daily PDF brief incorporates captured thoughts, unprocessed items, today's priorities, and AI affirmations that reference recent entries
**Depends on**: Phase 4
**Requirements**: BRIEF-01, BRIEF-02
**Research**: Unlikely (extension of existing working PDF pipeline)
**Plans**: TBD

Plans:
- [ ] 06-01: Integrate captured thoughts + unprocessed items into PDF brief
- [ ] 06-02: Contextual AI affirmations referencing recent entries

### Phase 7: Google Calendar
**Goal**: Pull events from selected Google Calendars into the daily brief and dashboard
**Depends on**: Phase 6
**Requirements**: INTEG-01
**Research**: Likely (Google Calendar API, OAuth2 flow for macOS)
**Research topics**: Google Calendar API v3 REST vs Swift client library, OAuth2 for native macOS apps, event data model mapping
**Plans**: TBD

Plans:
- [ ] 07-01: Google Calendar OAuth2 + event fetching + brief/dashboard integration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-03-31 |
| 2. Text Capture | 2/2 | Complete | 2026-04-01 |
| 3. AI Triage | 0/2 | Not started | - |
| 4. Dashboard | 0/2 | Not started | - |
| 5. Voice & Image Capture | 0/2 | Not started | - |
| 6. Evolved Daily Brief | 0/2 | Not started | - |
| 7. Google Calendar | 0/1 | Not started | - |
