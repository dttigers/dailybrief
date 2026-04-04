# Roadmap: Jarvis — Personal AI Life Assistant

## Overview

Transform the existing DailyBrief CLI and menu bar monitor into a full personal AI life assistant. Starting with a shared core library and local data layer, we build frictionless text capture, AI-powered triage, a central dashboard, voice/image capture, an evolved daily brief, and Google Calendar integration — delivering a system where every thought is captured with zero friction and organized automatically.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-04-02)
- ✅ **v1.1 Always On** — Phases 8-13 (shipped 2026-04-03)
- ✅ **v1.2 Daily Driver** — Phases 14-18 (shipped 2026-04-03)
- ✅ **v1.3 Stability & Smarts** — Phases 19-23 (shipped 2026-04-04)
- 🚧 **v1.4 Intelligence & Organization** — Phases 24-32 (in progress)

## Completed Milestones

- ✅ [v1.0 MVP](milestones/v1.0-ROADMAP.md) (Phases 1-7) — SHIPPED 2026-04-02
- ✅ [v1.1 Always On](milestones/v1.1-ROADMAP.md) (Phases 8-13) — SHIPPED 2026-04-03
- ✅ [v1.2 Daily Driver](milestones/v1.2-ROADMAP.md) (Phases 14-18) — SHIPPED 2026-04-03
- ✅ [v1.3 Stability & Smarts](milestones/v1.3-ROADMAP.md) (Phases 19-23) — SHIPPED 2026-04-04

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

<details>
<summary>✅ v1.2 Daily Driver (Phases 14-18) — SHIPPED 2026-04-03</summary>

**Milestone Goal:** Make Jarvis reliable and practical for daily use — batch workflows, task tracking, multi-sport coverage, and stability.

#### Phase 14: LaunchAgent Fix & Folder Cleanup ✅

**Goal**: Debug and fix LaunchAgent exit code -4 for reliable auto-start. Add auto-delete of watched folder files after successful processing.
**Depends on**: Previous milestone complete
**Completed**: 2026-04-03

Plans:
- [x] 14-01: Fix LaunchAgent plist + install script + diagnostic logging
- [x] 14-02: Auto-delete watched folder files after processing

#### Phase 15: Multi-File Upload ✅

**Goal**: Batch import multiple photos and audio files from the dashboard toolbar via file picker or drag & drop. Process all selected files and create thoughts for each.
**Depends on**: Phase 14
**Completed**: 2026-04-03

Plans:
- [x] 15-01: Multi-file upload from dashboard toolbar

#### Phase 16: Task Status Workflow ✅

**Goal**: Add status tracking to tasks and work orders. Support open → in progress → done workflow with UI controls to change status.
**Depends on**: Phase 15
**Completed**: 2026-04-03

Plans:
- [x] 16-01: Thought TaskStatus model + DB migration + ThoughtStore + CloudKit sync
- [x] 16-02: WorkOrder 3-state CompletionStore + CLI commands
- [x] 16-03: Dashboard UI status controls + filtering
- [x] 16-04: PDF status rendering for tasks and work orders

#### Phase 17: Multi-Sport Support ✅

**Goal**: Extend sports settings beyond MLB to include NFL, NBA, and NHL. Add team data models for each league with team name pickers in settings. Update PDF brief sports section to show all configured sports.
**Depends on**: Phase 16
**Completed**: 2026-04-03

Plans:
- [x] 17-01: Team data models (NFL, NBA, NHL) + multi-sport AppConfig
- [x] 17-02: ESPNSportsService + DailyBriefData wiring
- [x] 17-03: Multi-sport Settings UI with per-league toggles/pickers
- [x] 17-04: Multi-sport PDF rendering on Page 2

#### Phase 18: Polish & Integration ✅

**Goal**: Tie everything together — edge cases, refinement, cross-feature integration testing, UX polish.
**Depends on**: Phase 17
**Completed**: 2026-04-03

Plans:
- [x] 18-01: Email/IMAP config rename + backward-compatible migration
- [x] 18-02: Shared ImageConversion utility + cross-feature audit
- [x] 18-03: Final build verification + v1.2 milestone closure

</details>

<details>
<summary>✅ v1.3 Stability & Smarts (Phases 19-23) — SHIPPED 2026-04-04</summary>

**Milestone Goal:** Fix daily-use bugs for reliability, then add manual triage, AI work order prioritization, and IMAP work email integration.

#### Phase 19: Bug Fixes ✅

**Goal**: Fix config startup error, duplicate thoughts in dashboard, audio upload triage, and settings tab resizing
**Depends on**: Previous milestone complete
**Completed**: 2026-04-04

Plans:
- [x] 19-01: Fix duplicate thoughts in FTS5 search + folder watcher triage persistence
- [x] 19-02: Fix config startup error + settings window sizing

#### Phase 20: Folder Watcher & Manual Triage ✅

**Goal**: Verify folder watcher and auto-delete work correctly. Add UI button to manually re-run AI triage on any thought.
**Depends on**: Phase 19
**Completed**: 2026-04-04

Plans:
- [x] 20-01: Manual re-triage button on dashboard thought rows
- [x] 20-02: Folder watcher diagnostic logging & end-to-end verification

#### Phase 21: AI Work Order Prioritization ✅

**Goal**: Use Claude AI to analyze work orders and recommend priority/urgency ranking
**Depends on**: Phase 20
**Completed**: 2026-04-04

Plans:
- [x] 21-01: WorkOrderPrioritizer actor + AI priority sort in PDF

#### Phase 22: IMAP Work Email ✅

**Goal**: Test and implement direct IMAP access for work email as alternative to Gmail API
**Depends on**: Phase 21
**Completed**: 2026-04-04 (checkpoint deferred — Azure AD admin consent pending)

Plans:
- [x] 22-01: OAuth2 IMAP backend (config + XOAUTH2 + device code CLI)
- [x] 22-02: Settings UI auth type picker + work email verification (checkpoint deferred)

#### Phase 23: Polish & Integration ✅

**Goal**: Final build verification and v1.3 milestone closure
**Depends on**: Phase 22
**Completed**: 2026-04-04

Plans:
- [x] 23-01: Final build verification + v1.3 milestone closure

</details>

### 🚧 v1.4 Intelligence & Organization (In Progress)

**Milestone Goal:** Make the dashboard a power tool for organizing thoughts, add AI-powered therapy intelligence that classifies thoughts as self-learnable vs therapist-worthy, enable export and brief history, and surface insights in the daily PDF.

#### Phase 24: Thought Editing

**Goal**: Inline edit thought content from dashboard with undo support
**Depends on**: Previous milestone complete
**Research**: Unlikely (internal SwiftUI patterns)
**Plans**: TBD

Plans:
- [x] 24-01: Inline editing with undo + expand/collapse

#### Phase 25: Bulk Actions & Filtering

**Goal**: Multi-select thoughts with bulk delete/retriage/recategorize, plus source/date/category search filters
**Depends on**: Phase 24
**Research**: Unlikely (internal patterns)
**Completed**: 2026-04-04

Plans:
- [x] 25-01: Multi-Select & Bulk Actions
- [x] 25-02: Source & Date Filters

#### Phase 26: Therapy Intelligence ✅

**Goal**: AI classifies therapy-category thoughts into self-learnable (can work on independently) vs bring-to-therapist (needs professional guidance)
**Depends on**: Phase 25
**Completed**: 2026-04-04

Plans:
- [x] 26-01: Model, Storage & Classification Service
- [x] 26-02: Triage Wiring & Dashboard UI

#### Phase 27: Therapy Prep & Patterns

**Goal**: Pattern recognition across therapy thoughts over time, therapy prep export for sessions, AI-generated session summary
**Depends on**: Phase 26
**Research**: Likely (pattern recognition prompt engineering, therapy prep best practices)
**Research topics**: Cross-thought pattern detection prompts; therapy session prep format; recurring theme identification
**Plans**: TBD

Plans:
- [ ] 27-01: Core Services (TherapyPatternService + TherapyPrepService + models + ThoughtStore queries)
- [ ] 27-02: PDF Integration (DailyBriefData wiring + PageThreeRenderer therapy prep section)
- [ ] 27-03: Dashboard Therapy Prep UI (TherapyPrepView + generate + copy export)

#### Phase 28: Tags & Organization

**Goal**: Manual user-defined tags, favorites/pinning, thought-to-thought linking
**Depends on**: Phase 27
**Research**: Unlikely (DB migration + SwiftUI patterns)
**Plans**: TBD

Plans:
- [ ] 28-01: TBD

#### Phase 29: Export System

**Goal**: Export thoughts as Markdown, JSON, or CSV with date range and category filtering
**Depends on**: Phase 28
**Research**: Unlikely (standard file generation)
**Plans**: TBD

Plans:
- [ ] 29-01: TBD

#### Phase 30: Brief History

**Goal**: Browse and reprint past daily briefs, brief archive storage with date picker
**Depends on**: Phase 29
**Research**: Unlikely (file storage patterns)
**Plans**: TBD

Plans:
- [ ] 30-01: TBD

#### Phase 31: Brief Enhancements

**Goal**: Surface top insights in PDF, add capture metrics, improve layout with therapy intelligence indicators
**Depends on**: Phase 30
**Research**: Unlikely (extends existing PDF renderer)
**Plans**: TBD

Plans:
- [ ] 31-01: TBD

#### Phase 32: Polish & Integration

**Goal**: Cross-feature testing, UX refinement, edge cases, final build verification
**Depends on**: Phase 31
**Research**: Unlikely (internal work)
**Plans**: TBD

Plans:
- [ ] 32-01: TBD

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
| 14. LaunchAgent Fix & Folder Cleanup | v1.2 | 2/2 | Complete | 2026-04-03 |
| 15. Multi-File Upload | v1.2 | 1/1 | Complete | 2026-04-03 |
| 16. Task Status Workflow | v1.2 | 4/4 | Complete | 2026-04-03 |
| 17. Multi-Sport Support | v1.2 | 4/4 | Complete | 2026-04-03 |
| 18. Polish & Integration | v1.2 | 3/3 | Complete | 2026-04-03 |
| 19. Bug Fixes | v1.3 | 2/2 | Complete | 2026-04-04 |
| 20. Folder Watcher & Manual Triage | v1.3 | 2/2 | Complete | 2026-04-04 |
| 21. AI Work Order Prioritization | v1.3 | 1/1 | Complete | 2026-04-04 |
| 22. IMAP Work Email | v1.3 | 2/2 | Complete* | 2026-04-04 |
| 23. Polish & Integration | v1.3 | 1/1 | Complete | 2026-04-04 |
| 24. Thought Editing | v1.4 | 1/1 | Complete | 2026-04-04 |
| 25. Bulk Actions & Filtering | v1.4 | 2/2 | Complete | 2026-04-04 |
| 26. Therapy Intelligence | v1.4 | 2/2 | Complete | 2026-04-04 |
| 27. Therapy Prep & Patterns | v1.4 | 0/? | Not started | - |
| 28. Tags & Organization | v1.4 | 0/? | Not started | - |
| 29. Export System | v1.4 | 0/? | Not started | - |
| 30. Brief History | v1.4 | 0/? | Not started | - |
| 31. Brief Enhancements | v1.4 | 0/? | Not started | - |
| 32. Polish & Integration | v1.4 | 0/? | Not started | - |
