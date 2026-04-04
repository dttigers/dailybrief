# Roadmap: Vigil — Ambient AI Life Assistant

## Overview

An ambient AI life assistant built for ADHD brains. Captures thoughts, tasks, and life data with zero friction, organizes everything automatically, and surfaces what matters at the right moment. Started as a macOS personal tool (Jarvis), now evolving into a cross-platform system with smart glasses integration.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-04-02)
- ✅ **v1.1 Always On** — Phases 8-13 (shipped 2026-04-03)
- ✅ **v1.2 Daily Driver** — Phases 14-18 (shipped 2026-04-03)
- ✅ **v1.3 Stability & Smarts** — Phases 19-23 (shipped 2026-04-04)
- ✅ **v1.4 Intelligence & Organization** — Phases 24-28 (shipped 2026-04-04, early close)
- 🚧 **v2.0 Vigil Platform** — Phases 29-36 (in progress)

## Completed Milestones

- ✅ [v1.0 MVP](milestones/v1.0-ROADMAP.md) (Phases 1-7) — SHIPPED 2026-04-02
- ✅ [v1.1 Always On](milestones/v1.1-ROADMAP.md) (Phases 8-13) — SHIPPED 2026-04-03
- ✅ [v1.2 Daily Driver](milestones/v1.2-ROADMAP.md) (Phases 14-18) — SHIPPED 2026-04-03
- ✅ [v1.3 Stability & Smarts](milestones/v1.3-ROADMAP.md) (Phases 19-23) — SHIPPED 2026-04-04
- ✅ [v1.4 Intelligence & Organization](milestones/v1.4-ROADMAP.md) (Phases 24-28) — SHIPPED 2026-04-04 (early close)

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

- [x] Phase 8: Launch Agent (3/3 plans) — completed 2026-04-02
- [x] Phase 9: Folder Watching (2/2 plans) — completed 2026-04-02
- [x] Phase 10: Sports UI + Daily Brief (2/2 plans) — completed 2026-04-03
- [x] Phase 11: Smart Suggestions (1/1 plans) — completed 2026-04-03
- [x] Phase 12: Cloud Sync (4/4 plans) — completed 2026-04-03
- [x] Phase 13: Polish & Integration (4/4 plans) — completed 2026-04-03

</details>

<details>
<summary>✅ v1.2 Daily Driver (Phases 14-18) — SHIPPED 2026-04-03</summary>

- [x] Phase 14: LaunchAgent Fix & Folder Cleanup (2/2 plans) — completed 2026-04-03
- [x] Phase 15: Multi-File Upload (1/1 plans) — completed 2026-04-03
- [x] Phase 16: Task Status Workflow (4/4 plans) — completed 2026-04-03
- [x] Phase 17: Multi-Sport Support (4/4 plans) — completed 2026-04-03
- [x] Phase 18: Polish & Integration (3/3 plans) — completed 2026-04-03

</details>

<details>
<summary>✅ v1.3 Stability & Smarts (Phases 19-23) — SHIPPED 2026-04-04</summary>

- [x] Phase 19: Bug Fixes (2/2 plans) — completed 2026-04-04
- [x] Phase 20: Folder Watcher & Manual Triage (2/2 plans) — completed 2026-04-04
- [x] Phase 21: AI Work Order Prioritization (1/1 plans) — completed 2026-04-04
- [x] Phase 22: IMAP Work Email (2/2 plans) — completed 2026-04-04
- [x] Phase 23: Polish & Integration (1/1 plans) — completed 2026-04-04

</details>

<details>
<summary>✅ v1.4 Intelligence & Organization (Phases 24-28) — SHIPPED 2026-04-04 (early close)</summary>

- [x] Phase 24: Thought Editing (1/1 plans) — completed 2026-04-04
- [x] Phase 25: Bulk Actions & Filtering (2/2 plans) — completed 2026-04-04
- [x] Phase 26: Therapy Intelligence (2/2 plans) — completed 2026-04-04
- [x] Phase 27: Therapy Prep & Patterns (3/3 plans) — completed 2026-04-04
- [x] Phase 28: Tags & Organization (3/3 plans) — completed 2026-04-04

Deferred: Phases 29-32 (Export System, Brief History, Brief Enhancements, Polish)

</details>

### 🚧 v2.0 Vigil Platform (In Progress)

**Milestone Goal:** Extract intelligence into a platform-agnostic API (Vigil Core), build first external client (Even G2 smart glasses), and migrate the Mac app to be a thin client.

**Constraints:**
- Mac app must remain functional throughout migration — never break what works
- Vigil Core runs on localhost only for v2.0 (no server deployment, no auth)
- Even G2 display: 576x288, 4-bit greyscale, max 8 containers/page, no CSS/DOM
- Phone and Mac must be on same Wi-Fi for glasses to reach API
- API versioned from day one (/v1/ prefix on all routes)

**Reference docs:** `.planning/references/vigil-architecture.pdf`, `.planning/references/vigil-evenhub-plan.pdf`

#### Phase 29: Vigil Core API — Foundation

**Goal**: Project setup (Node.js + Express/Hono, better-sqlite3), DB access to existing Jarvis SQLite, health + summary endpoints
**Depends on**: Previous milestone complete
**Research**: Unlikely (established patterns)
**Plans**: 2

Plans:
- [x] 29-01: Project scaffold + Hono server + health endpoint
- [x] 29-02: Database connection + summary endpoint

#### Phase 30: Vigil Core API — Full Endpoints ✓

**Goal**: Thoughts CRUD, work orders, reminders, brief, insights — full /v1/ REST API surface
**Depends on**: Phase 29
**Research**: Unlikely (CRUD endpoints, standard patterns)
**Plans**: 3

Plans:
- [x] 30-01: Thoughts CRUD + search (DB read-write upgrade, FTS5)
- [x] 30-02: Tags, favorites, bidirectional thought links
- [x] 30-03: Brief aggregation + bulk operations

#### Phase 31: Vigil Core API — AI Integration ✓

**Goal**: Port Claude API calls from Swift to Node.js — triage, prioritization, affirmation, insights generation
**Depends on**: Phase 30
**Plans**: 4

Plans:
- [x] 31-01: Anthropic SDK client + triage endpoint
- [x] 31-02: Affirmation + insights endpoints
- [x] 31-03: Therapy endpoints (classify, patterns, prep)
- [x] 31-04: Prioritize + describe-image endpoints

#### Phase 32: Even G2 Plugin — Scaffold + Home Screen

**Goal**: Vite + TypeScript Even Hub plugin project, SDK init, simulator setup, home screen with mock data
**Depends on**: Phase 29 (needs running API)
**Research**: Likely (Even Hub SDK — new integration)
**Research topics**: @evenrealities/even_hub_sdk API, simulator usage, plugin packaging, display constraints
**Plans**: TBD

Plans:
- [ ] 32-01: TBD

#### Phase 33: Even G2 Plugin — All Screens + Navigation

**Goal**: Work orders, reminders, affirmation screens; temple touchpad + R1 ring navigation; real API data with 60s refresh
**Depends on**: Phase 32
**Research**: Likely (continued Even Hub SDK — navigation patterns, multi-screen)
**Research topics**: Even Hub screen transitions, touchpad/ring event handling, data refresh patterns
**Plans**: TBD

Plans:
- [ ] 33-01: TBD

#### Phase 34: Mac App Migration — First Services

**Goal**: Redirect simplest Mac app services to call Vigil Core API instead of computing locally; verify feature parity
**Depends on**: Phase 30
**Research**: Unlikely (internal refactor — redirecting Swift URLSession calls)
**Plans**: TBD

Plans:
- [ ] 34-01: TBD

#### Phase 35: Mac App Migration — AI Services

**Goal**: Redirect triage, prioritization, and insights from local Claude calls to Vigil Core API
**Depends on**: Phase 31, Phase 34
**Research**: Unlikely (same migration pattern as Phase 34)
**Plans**: TBD

Plans:
- [ ] 35-01: TBD

#### Phase 36: Integration & Polish

**Goal**: End-to-end testing across all clients, LaunchAgent for API server auto-start, packaging G2 plugin for Even Hub submission
**Depends on**: Phase 33, Phase 35
**Research**: Unlikely (testing and packaging — established patterns)
**Plans**: TBD

Plans:
- [ ] 36-01: TBD

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
| 27. Therapy Prep & Patterns | v1.4 | 3/3 | Complete | 2026-04-04 |
| 28. Tags & Organization | v1.4 | 3/3 | Complete | 2026-04-04 |
| 29. Vigil Core API — Foundation | v2.0 | 2/2 | Complete | 2026-04-04 |
| 30. Vigil Core API — Full Endpoints | v2.0 | 3/3 | Complete | 2026-04-04 |
| 31. Vigil Core API — AI Integration | v2.0 | 4/4 | Complete | 2026-04-04 |
| 32. Even G2 Plugin — Scaffold + Home | v2.0 | 0/? | Not started | - |
| 33. Even G2 Plugin — Screens + Nav | v2.0 | 0/? | Not started | - |
| 34. Mac App Migration — First Services | v2.0 | 0/? | Not started | - |
| 35. Mac App Migration — AI Services | v2.0 | 0/? | Not started | - |
| 36. Integration & Polish | v2.0 | 0/? | Not started | - |
