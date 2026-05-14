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

## Download

**Latest:** [Vigil-2.4.dmg](https://github.com/dttigers/dailybrief/releases/latest)

**Requirements:** macOS 13.0 (Ventura) or later · Apple Silicon or Intel · ~50 MB disk

### Install

1. Download the `.dmg` and double-click to mount it.
2. Drag **Vigil** into your `/Applications` folder.
3. Open **Vigil** from Applications (or Spotlight). It runs as a menu bar app — look for the icon in your top-right.
4. Grant permissions when prompted:
   - **Calendar** — for daily brief generation
   - **Speech Recognition** — for voice note transcription from watched folders
5. On first launch, Safari Settings will open automatically. Enable **Vigil Capture** under Extensions to capture web content directly into Vigil.

### What gets installed

| Component | Where |
|---|---|
| Menu bar app | `/Applications/Vigil.app` |
| Login item | Auto-starts on login via LaunchAgent |
| Safari extension | Embedded in the app — enable in Safari Settings |
| Logs | `~/Library/Logs/DailyBrief/` |

### Verifying the install

Vigil is signed with an Apple Developer ID and notarized by Apple. To verify:

```bash
spctl --assess --type execute -v /Applications/Vigil.app
# expected: accepted, source=Notarized Developer ID
```

### Uninstall

```bash
launchctl bootout gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor
rm -rf /Applications/Vigil.app
rm ~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist
rm -rf ~/Library/Logs/DailyBrief
defaults delete com.jamesonmorrill.dailybriefmonitor
```

> Building from source? See [Setup → Mac App](#mac-app) below.

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

## Local Dev Quickstart (macOS)

Local-only development (vigil-core + vigil-pwa) with no prod DB access required.

```bash
# One-time per machine
brew install postgresql@16
brew services start postgresql@16
bash scripts/dev-setup.sh
# Fill in vigil-core/.env — especially ANTHROPIC_API_KEY (see RUNBOOK → Local Development for the Anthropic dev workspace setup)

# Daily
npm run dev
```

See [vigil-core/RUNBOOK.md](vigil-core/RUNBOOK.md) → "Local Development" for the full workflow, daemon-retirement notes, and secret-drift policy updates. Dependencies: Homebrew, Node 20+, macOS 15+.

Note: Mac apps, Safari extension, and the G2 plugin all continue to hit `api.vigilhub.io` — only `vigil-core` + `vigil-pwa` use the local stack (Phase 107.1 D-15).

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
