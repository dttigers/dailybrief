# Vigil — Ambient AI Life Assistant

An ambient AI life assistant built for ADHD brains. Captures thoughts, tasks, and life data with zero friction, organizes everything automatically, and surfaces what matters at the right moment.

## What It Does

- **Frictionless capture** — Text, voice, and photo capture from menu bar hotkey, watched folders, or the web dashboard
- **AI triage** — Claude automatically categorizes every thought (task, idea, reflection, therapy, project) with confidence scores
- **Smart photo upload** — Photograph handwritten notes; AI detects paper type (lined/gridded), transcribes verbatim, and splits into individual thoughts
- **Work order tracking** — Pulls work orders from email (IMAP), AI-prioritizes them, tracks completion status across all clients
- **Therapy intelligence** — Classifies thoughts as self-learnable vs bring-to-therapist, generates session prep and pattern analysis
- **Daily PDF brief** — Printed summary with work orders, todos, sports scores, calendar events, AI insights, and an affirmation
- **Projects** — Named projects with thought assignment, status tracking, and per-project views

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Vigil Core API                        │
│           Node.js / Hono / Drizzle / PostgreSQL          │
│                  Railway (production)                     │
│                                                          │
│  20+ REST endpoints: thoughts, projects, triage,         │
│  process-photo, chat, insights, therapy, work orders,    │
│  briefs, export, prioritize                              │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + Bearer Auth
          ┌────────────┼────────────┬──────────────┐
          │            │            │              │
   ┌──────┴──────┐ ┌──┴───┐ ┌─────┴─────┐ ┌──────┴──────┐
   │  Mac App    │ │ PWA  │ │ G2 Plugin │ │    CLI      │
   │  (Swift)    │ │(React)│ │  (Vite)   │ │  (Swift)    │
   │             │ │      │ │           │ │             │
   │ Menu bar    │ │ Full │ │ Even G2   │ │ DailyBrief  │
   │ Folder watch│ │ dash │ │ smart     │ │ PDF brief   │
   │ Hotkey      │ │ board│ │ glasses   │ │ Work orders │
   │ capture     │ │      │ │           │ │ Export      │
   └─────────────┘ └──────┘ └───────────┘ └─────────────┘
```

**Four client surfaces, one API:**

| Client | Tech | Purpose |
|--------|------|---------|
| **Mac App** (DailyBriefMonitor) | Swift 6 / SwiftUI / SPM | Menu bar, folder watcher, hotkey capture, LaunchAgent |
| **PWA** (app.vigilhub.io) | React / Vite / Tailwind | Full dashboard — thoughts, work orders, projects, chat, insights, therapy, briefs, photo upload |
| **G2 Plugin** | Vite / TypeScript / Even Hub SDK | Smart glasses ambient display |
| **CLI** (DailyBrief) | Swift / ArgumentParser | PDF brief generation, work order management, export |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Node.js, Hono, TypeScript |
| Database | PostgreSQL (Railway), Drizzle ORM |
| AI | Anthropic Claude API (triage, insights, therapy, chat, photo OCR) |
| Mac App | Swift 6.2, SwiftUI, Swift Package Manager |
| PWA | React 19, Vite 8, Tailwind CSS v4, vite-plugin-pwa |
| G2 Plugin | Vite, TypeScript, Even Hub SDK |
| Hosting | Railway (API + DB), Vercel (PWA) |
| Auth | Bearer token (SHA-256 hashed, `vk_` prefix) |

## Setup

### Prerequisites

- Node.js 20+
- Swift 6.0+ (macOS)
- PostgreSQL (or Railway account)
- Anthropic API key

### Vigil Core API

```bash
cd vigil-core
cp .env.example .env  # Add DATABASE_URL, ANTHROPIC_API_KEY, VIGIL_API_KEY
npm install
npx tsx src/db/migrate.ts
npm run dev            # http://localhost:3001
```

### Mac App

```bash
# Requires Apple Developer ID certificate for code signing
./scripts/install.sh   # Builds, signs, installs, starts LaunchAgent
```

### PWA

```bash
cd vigil-pwa
npm install --legacy-peer-deps
npm run dev            # http://localhost:5173
```

### Bootstrap (fresh machine)

```bash
./scripts/bootstrap.sh  # Full setup via 1Password CLI
./scripts/dailybrief-doctor.sh  # Check for config drift
```

## Project History

Built in ~2 weeks across 11 milestones and 72 phases:

| Version | Name | What shipped |
|---------|------|-------------|
| v1.0 | MVP | Thought capture, AI triage, dashboard, voice/image, calendar |
| v1.1 | Always On | LaunchAgent, folder watching, sports, insights, CloudKit sync |
| v1.2 | Daily Driver | Multi-file upload, task status, multi-sport, IMAP email |
| v1.3 | Stability & Smarts | Bug fixes, manual re-triage, AI work order priority, OAuth2 IMAP |
| v1.4 | Intelligence & Org | Inline edit, bulk actions, therapy intelligence, tags/favorites |
| v2.0 | Vigil Platform | Vigil Core API, Even G2 plugin, Mac app migration |
| v2.1 | Server Deployment | PostgreSQL, Railway, bearer auth, data migration, API hardening |
| v2.2 | Polish & Power | Brief history, export, configurable PDF, AI chat, code path cleanup |
| v2.3 | Projects & Precision | Projects CRUD, push-on-complete, bootstrap + drift doctor |
| v2.4 | Capture Without Friction | Code signing, smart photo upload, folder watch feeder, .app bundle |
| v2.5 | Dashboard Everywhere | PWA with full dashboard parity, work order API, cross-platform access |

## License

Private project. Not open source.
