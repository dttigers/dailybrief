# Roadmap: Jarvis — Personal AI Life Assistant

## Overview

Transform the existing DailyBrief CLI and menu bar monitor into a full personal AI life assistant. Starting with a shared core library and local data layer, we build frictionless text capture, AI-powered triage, a central dashboard, voice/image capture, an evolved daily brief, and Google Calendar integration — delivering a system where every thought is captured with zero friction and organized automatically.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-04-02)
- ✅ **v1.1 Always On** — Phases 8-13 (shipped 2026-04-03)

## Completed Milestones

- ✅ [v1.0 MVP](milestones/v1.0-ROADMAP.md) (Phases 1-7) — SHIPPED 2026-04-02
- ✅ [v1.1 Always On](milestones/v1.1-ROADMAP.md) (Phases 8-13) — SHIPPED 2026-04-03

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

<details>
<summary>✅ v1.1 Always On (Phases 8-13) — SHIPPED 2026-04-03</summary>

**Milestone Goal:** Transform Jarvis from a terminal-launched tool into an always-running background assistant with smarter AI features and multi-Mac sync.

#### Phase 8: Launch Agent ✅

**Goal**: Convert from terminal-dependent CLI to macOS Launch Agent. Auto-start at login, run silently in background, menu bar icon always present.
**Depends on**: Previous milestone complete
**Completed**: 2026-04-02

Plans:
- [x] 08-01: Install script & binary discovery
- [x] 08-02: Built-in brief scheduler
- [x] 08-03: Consolidate & verify

#### Phase 9: Folder Watching ✅

**Goal**: Monitor dedicated folders for new audio and photo files. Auto-transcribe audio and process images daily. Files dropped into watched folders get ingested as captured thoughts.
**Depends on**: Phase 8
**Completed**: 2026-04-02

Plans:
- [x] 09-01: FolderWatcherService + Config
- [x] 09-02: App lifecycle wiring + Settings UI

#### Phase 10: Sports UI + Daily Brief ✅

**Goal**: Replace raw numeric team/sport IDs in settings with team name picker. Improve daily brief content, formatting, and add new sections.
**Depends on**: Phase 9
**Completed**: 2026-04-03

Plans:
- [x] 10-01: MLBTeamData model + team name picker in Settings
- [x] 10-02: Dynamic PDF sports section with config-driven names

#### Phase 11: Smart Suggestions ✅

**Goal**: AI proactively surfaces insights — pattern recognition, action prompts, and thought connections built incrementally.
**Depends on**: Phase 10
**Completed**: 2026-04-03

Plans:
- [x] 11-01: InsightService actor + Insight model + InsightsConfig

#### Phase 12: Cloud Sync ✅

**Goal**: Research best sync approach (CloudKit vs Supabase vs other), then implement database sync across multiple Macs.
**Depends on**: Phase 11
**Completed**: 2026-04-03

Plans:
- [x] 12-01: Sync metadata fields + database migration
- [x] 12-02: CloudKit infrastructure + record mapping
- [x] 12-03: SyncService actor (push/pull/conflict resolution)
- [x] 12-04: App lifecycle wiring + Settings UI

#### Phase 13: Polish & Integration ✅

**Goal**: Tie everything together — edge cases, refinement, cross-feature integration testing, UX polish.
**Depends on**: Phase 12
**Completed**: 2026-04-03

Plans:
- [x] 13-01: InsightService wired into dashboard + settings UI
- [x] 13-02: Insights integrated into daily brief PDF
- [x] 13-03: Event-driven sync triggers + HEIC/TIFF support
- [x] 13-04: Final build verification + project state update

</details>

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
| 9. Folder Watching | v1.1 | 2/2 | Complete | 2026-04-02 |
| 10. Sports UI + Daily Brief | v1.1 | 2/2 | Complete | 2026-04-03 |
| 11. Smart Suggestions | v1.1 | 1/1 | Complete | 2026-04-03 |
| 12. Cloud Sync | v1.1 | 4/4 | Complete | 2026-04-03 |
| 13. Polish & Integration | v1.1 | 4/4 | Complete | 2026-04-03 |
