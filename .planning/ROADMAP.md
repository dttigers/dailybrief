# Roadmap: Jarvis — Personal AI Life Assistant

## Overview

Transform the existing DailyBrief CLI and menu bar monitor into a full personal AI life assistant. Starting with a shared core library and local data layer, we build frictionless text capture, AI-powered triage, a central dashboard, voice/image capture, an evolved daily brief, and Google Calendar integration — delivering a system where every thought is captured with zero friction and organized automatically.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-04-02)
- 🚧 **v1.1 Always On** — Phases 8-13 (in progress)

## Completed Milestones

- ✅ [v1.0 MVP](milestones/v1.0-ROADMAP.md) (Phases 1-7) — SHIPPED 2026-04-02

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-04-02</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-03-31
- [x] Phase 2: Text Capture (2/2 plans) — completed 2026-04-01
- [x] Phase 3: AI Triage (2/2 plans) — completed 2026-04-01
- [x] Phase 4: Dashboard (2/2 plans) — completed 2026-04-01
- [x] Phase 5: Voice & Image Capture (3/3 plans) — completed 2026-04-01
- [x] Phase 6: Evolved Daily Brief (2/2 plans) — completed 2026-04-02
- [x] Phase 7: Google Calendar (3/3 plans) — completed 2026-04-02

</details>

### 🚧 v1.1 Always On (In Progress)

**Milestone Goal:** Transform Jarvis from a terminal-launched tool into an always-running background assistant with smarter AI features and multi-Mac sync.

#### Phase 8: Launch Agent ✅

**Goal**: Convert from terminal-dependent CLI to macOS Launch Agent. Auto-start at login, run silently in background, menu bar icon always present.
**Depends on**: Previous milestone complete
**Completed**: 2026-04-02

Plans:
- [x] 08-01: Install script & binary discovery
- [x] 08-02: Built-in brief scheduler
- [x] 08-03: Consolidate & verify

#### Phase 9: Folder Watching

**Goal**: Monitor dedicated folders for new audio and photo files. Auto-transcribe audio and process images daily. Files dropped into watched folders get ingested as captured thoughts.
**Depends on**: Phase 8
**Research**: Unlikely (FSEvents/DispatchSource in macOS SDK, established patterns)
**Plans**: TBD

Plans:
- [ ] 09-01: TBD (run /gsd:plan-phase 9 to break down)

#### Phase 10: Sports UI + Daily Brief

**Goal**: Replace raw numeric team/sport IDs in settings with team name picker. Improve daily brief content, formatting, and add new sections.
**Depends on**: Phase 9
**Research**: Unlikely (internal UI patterns, existing brief infrastructure)
**Plans**: TBD

Plans:
- [ ] 10-01: TBD (run /gsd:plan-phase 10 to break down)

#### Phase 11: Smart Suggestions

**Goal**: AI proactively surfaces insights — pattern recognition, action prompts, and thought connections built incrementally.
**Depends on**: Phase 10
**Research**: Unlikely (Claude API already integrated, internal patterns)
**Plans**: TBD

Plans:
- [ ] 11-01: TBD (run /gsd:plan-phase 11 to break down)

#### Phase 12: Cloud Sync

**Goal**: Research best sync approach (CloudKit vs Supabase vs other), then implement database sync across multiple Macs.
**Depends on**: Phase 11
**Research**: Likely (CloudKit vs Supabase evaluation, conflict resolution strategies, GRDB sync patterns)
**Research topics**: CloudKit + GRDB integration, Supabase Swift SDK, offline-first sync, conflict resolution
**Plans**: TBD

Plans:
- [ ] 12-01: TBD (run /gsd:plan-phase 12 to break down)

#### Phase 13: Polish & Integration

**Goal**: Tie everything together — edge cases, refinement, cross-feature integration testing, UX polish.
**Depends on**: Phase 12
**Research**: Unlikely (internal refinement)
**Plans**: TBD

Plans:
- [ ] 13-01: TBD (run /gsd:plan-phase 13 to break down)

## Domain Expertise

None

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-31 |
| 2. Text Capture | v1.0 | 2/2 | Complete | 2026-04-01 |
| 3. AI Triage | v1.0 | 2/2 | Complete | 2026-04-01 |
| 4. Dashboard | v1.0 | 2/2 | Complete | 2026-04-01 |
| 5. Voice & Image Capture | v1.0 | 3/3 | Complete | 2026-04-01 |
| 6. Evolved Daily Brief | v1.0 | 2/2 | Complete | 2026-04-02 |
| 7. Google Calendar | v1.0 | 3/3 | Complete | 2026-04-02 |
| 8. Launch Agent | v1.1 | 3/3 | Complete | 2026-04-02 |
| 9. Folder Watching | v1.1 | 0/? | Not started | - |
| 10. Sports UI + Daily Brief | v1.1 | 0/? | Not started | - |
| 11. Smart Suggestions | v1.1 | 0/? | Not started | - |
| 12. Cloud Sync | v1.1 | 0/? | Not started | - |
| 13. Polish & Integration | v1.1 | 0/? | Not started | - |
