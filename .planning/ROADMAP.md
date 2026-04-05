# Roadmap: Vigil — Ambient AI Life Assistant

## Overview

An ambient AI life assistant built for ADHD brains. Captures thoughts, tasks, and life data with zero friction, organizes everything automatically, and surfaces what matters at the right moment. Started as a macOS personal tool (Jarvis), now evolving into a cross-platform system with smart glasses integration.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-04-02)
- ✅ **v1.1 Always On** — Phases 8-13 (shipped 2026-04-03)
- ✅ **v1.2 Daily Driver** — Phases 14-18 (shipped 2026-04-03)
- ✅ **v1.3 Stability & Smarts** — Phases 19-23 (shipped 2026-04-04)
- ✅ **v1.4 Intelligence & Organization** — Phases 24-28 (shipped 2026-04-04, early close)
- ✅ **v2.0 Vigil Platform** — Phases 29-36 (shipped 2026-04-04)
- 🚧 **v2.1 Server Deployment** — Phases 37-44 (in progress)

## Completed Milestones

- ✅ [v1.0 MVP](milestones/v1.0-ROADMAP.md) (Phases 1-7) — SHIPPED 2026-04-02
- ✅ [v1.1 Always On](milestones/v1.1-ROADMAP.md) (Phases 8-13) — SHIPPED 2026-04-03
- ✅ [v1.2 Daily Driver](milestones/v1.2-ROADMAP.md) (Phases 14-18) — SHIPPED 2026-04-03
- ✅ [v1.3 Stability & Smarts](milestones/v1.3-ROADMAP.md) (Phases 19-23) — SHIPPED 2026-04-04
- ✅ [v1.4 Intelligence & Organization](milestones/v1.4-ROADMAP.md) (Phases 24-28) — SHIPPED 2026-04-04 (early close)
- ✅ [v2.0 Vigil Platform](milestones/v2.0-ROADMAP.md) (Phases 29-36) — SHIPPED 2026-04-04

### 🚧 v2.1 Server Deployment (In Progress)

**Milestone Goal:** Deploy Vigil Core API to a production server with PostgreSQL, authentication, and HTTPS — enabling the G2 glasses and future mobile clients to connect from anywhere.

#### Phase 37: PostgreSQL Migration

**Goal**: Replace better-sqlite3 with PostgreSQL via Drizzle ORM; define schema, migrations, and update all route queries
**Depends on**: v2.0 complete
**Research**: Likely (Drizzle ORM + PostgreSQL new to project)
**Research topics**: Drizzle ORM setup with Hono, PostgreSQL schema patterns, migration workflow
**Plans**: 4 plans in 3 waves

Plans:
- [x] 37-01: Drizzle Schema & Database Setup (Wave 1) — completed 2026-04-05
- [x] 37-02: Thoughts CRUD + FTS Route Migration (Wave 2, parallel) — completed 2026-04-05
- [x] 37-03: Tags, Links & Bulk Route Migration (Wave 2, parallel) — completed 2026-04-05
- [x] 37-04: Summary, Brief & Final Cleanup (Wave 3) — completed 2026-04-05

#### Phase 38: API Key Authentication

**Goal**: Add bearer token auth middleware, API key generation/validation, protect all endpoints
**Depends on**: Phase 37
**Research**: Unlikely (established patterns)
**Plans**: TBD

Plans:
- [ ] 38-01: API Key Auth — Schema, Middleware & Route Protection (Wave 1)

#### Phase 39: Railway Deployment

**Goal**: Deploy Vigil Core to Railway with managed Postgres addon, environment config, health checks, and CI/CD via GitHub
**Depends on**: Phase 38
**Research**: Likely (first deployment, Railway platform config)
**Research topics**: Railway Node.js deployment, Postgres addon, environment variables, build config
**Plans**: TBD

Plans:
- [x] 39-01: Dockerfile & Migration Script (Wave 1) — completed 2026-04-05
- [x] 39-02: Railway Deploy, API Key & Verification (Wave 2) — completed 2026-04-05

#### Phase 40: Data Migration

**Goal**: Export existing SQLite thoughts and seed into production PostgreSQL database
**Depends on**: Phase 39
**Research**: Unlikely (one-time migration script)
**Plans**: TBD

Plans:
- [ ] 40-01: TBD

#### Phase 41: G2 Plugin Production URL

**Goal**: Make API URL configurable in G2 plugin, build and pack .ehpk for Even Hub distribution
**Depends on**: Phase 39
**Research**: Unlikely (internal config change)
**Plans**: TBD

Plans:
- [ ] 41-01: TBD

#### Phase 42: Mac App Server Migration

**Goal**: Point Mac app vigil.useAPI config at production server URL, validate all API paths end-to-end
**Depends on**: Phase 39
**Research**: Unlikely (config toggle already exists)
**Plans**: TBD

Plans:
- [ ] 42-01: TBD

#### Phase 43: HTTPS & Domain

**Goal**: Configure custom domain, SSL certificates, and CORS for production client access
**Depends on**: Phase 39
**Research**: Likely (domain + Railway custom domain setup)
**Research topics**: Railway custom domains, SSL provisioning, CORS configuration for G2/Mac clients
**Plans**: TBD

Plans:
- [ ] 43-01: TBD

#### Phase 44: Integration Testing & Hardening

**Goal**: End-to-end validation across all 3 clients (Mac app, G2 glasses, API), error handling, rate limiting
**Depends on**: Phases 41, 42, 43
**Research**: Unlikely (internal patterns)
**Plans**: TBD

Plans:
- [ ] 44-01: TBD

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

<details>
<summary>✅ v2.0 Vigil Platform (Phases 29-36) — SHIPPED 2026-04-04</summary>

- [x] Phase 29: Vigil Core API — Foundation (2/2 plans) — completed 2026-04-04
- [x] Phase 30: Vigil Core API — Full Endpoints (3/3 plans) — completed 2026-04-04
- [x] Phase 31: Vigil Core API — AI Integration (4/4 plans) — completed 2026-04-04
- [x] Phase 32: Even G2 Plugin — Scaffold + Home (2/2 plans) — completed 2026-04-04
- [x] Phase 33: Even G2 Plugin — Screens + Nav (3/3 plans) — completed 2026-04-04
- [x] Phase 34: Mac App Migration — First Services (4/4 plans) — completed 2026-04-04
- [x] Phase 35: Mac App Migration — AI Services (3/3 plans) — completed 2026-04-04
- [x] Phase 36: Integration & Polish (1/1 plan) — completed 2026-04-04

**Reference docs:** `.planning/references/vigil-architecture.pdf`, `.planning/references/vigil-evenhub-plan.pdf`

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
| 32. Even G2 Plugin — Scaffold + Home | v2.0 | 2/2 | Complete | 2026-04-04 |
| 33. Even G2 Plugin — Screens + Nav | v2.0 | 3/3 | Complete | 2026-04-04 |
| 34. Mac App Migration — First Services | v2.0 | 4/4 | Complete | 2026-04-04 |
| 35. Mac App Migration — AI Services | v2.0 | 3/3 | Complete | 2026-04-04 |
| 36. Integration & Polish | v2.0 | 1/1 | Complete | 2026-04-04 |
| 37. PostgreSQL Migration | v2.1 | 4/4 | Complete | 2026-04-05 |
| 38. API Key Authentication | v2.1 | 0/? | Not started | - |
| 39. Railway Deployment | v2.1 | 2/2 | Complete | 2026-04-05 |
| 40. Data Migration | v2.1 | 0/? | Not started | - |
| 41. G2 Plugin Production URL | v2.1 | 0/? | Not started | - |
| 42. Mac App Server Migration | v2.1 | 0/? | Not started | - |
| 43. HTTPS & Domain | v2.1 | 0/? | Not started | - |
| 44. Integration Testing & Hardening | v2.1 | 0/? | Not started | - |
