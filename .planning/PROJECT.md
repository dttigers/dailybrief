# Jarvis — Personal AI Life Assistant

## What This Is

A native macOS app that acts as a central nervous system for capturing, organizing, and surfacing thoughts, tasks, and life data. Designed specifically for an ADHD brain — frictionless voice/text capture feeds into an AI layer (Claude) that automatically categorizes and routes everything. A dashboard provides a single place to review, search, and manage it all, while a daily printed PDF brief serves as the physical anchor for a traveler's notebook system.

## Core Value

Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

## Requirements

### Validated

- ✓ Daily PDF brief generation with work orders, todos, sports, affirmation — existing
- ✓ Gmail/ServiceNow work order extraction via IMAP — existing
- ✓ MLB game scores, standings, upcoming schedule — existing
- ✓ Apple Reminders integration — existing
- ✓ Claude AI affirmation generation — existing
- ✓ System printing via lpr — existing
- ✓ Menu bar monitor app — existing
- ✓ LaunchAgent scheduling — existing
- ✓ Work order completion tracking — existing

### Active

- [ ] Central macOS dashboard app (SwiftUI) — single pane of glass for all personal data
- [ ] Frictionless thought capture — voice recorder integration, text input, photo/scan
- [ ] AI triage layer — Claude categorizes captured thoughts (task, therapy, idea, reflection, project note) and routes them automatically
- [ ] Thought review and organization — inbox-style UI to process, tag, search, and manage captured thoughts
- [ ] Configurable data sources — settings UI to pick sports teams, toggle sources, manage integrations (replaces hand-edited JSON config)
- [ ] Evolved daily brief — incorporates captured thoughts, unprocessed items, pattern surfacing ("you've mentioned X three times this week")
- [ ] Pattern recognition — surface recurring themes, especially for therapy prep ("questions and thoughts for therapist" bucket)
- [ ] Search across everything — full-text search across all captured thoughts, tasks, notes, and brief history

### Out of Scope

- iOS/mobile app — pocket voice recorder handles mobile capture; revisit later
- Real-time voice assistant — this is capture-and-review, not conversational
- Replacing the physical notebook — digital complements the traveler's notebook, doesn't replace it
- Multi-user support — this is a personal tool for one person
- Cloud sync/hosting — local macOS app with local data

## Context

- User recently diagnosed with ADHD; core motivation is compensating for working memory challenges
- Physical system already in place: traveler's notebook with 3 inserts (thoughts/feelings, daily briefs, coding projects)
- DailyBrief CLI and menu bar monitor already exist and work — this project evolves them into something larger
- Biggest friction point is capturing thoughts when hands are busy (driving, walking) — pocket voice recorder solves hardware side
- Thoughts come in many forms: therapy questions, project ideas, tasks, reflections, random reminders — system must handle all types
- Apple ecosystem commitment — macOS is primary platform
- Current config is hand-edited JSON; dashboard should make this user-friendly

## Constraints

- **Platform**: macOS 14+ (Sonoma), Swift 6.2, SwiftUI
- **AI Provider**: Anthropic Claude API (already integrated)
- **Build System**: Swift Package Manager (existing setup)
- **Data Storage**: Local file-based (no cloud dependency, no database server)
- **Voice Capture**: External pocket recorder device → audio files → transcription pipeline (hardware TBD)
- **Physical Output**: Daily PDF must remain printable and glueable into traveler's notebook

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Native macOS app (not web) | User is all-Apple; deeper system integration; DailyBrief already Swift/SwiftUI | — Pending |
| Pocket voice recorder for mobile capture | Phone is too much friction while driving; one-button press solves ADHD capture barrier | — Pending |
| Claude for AI categorization | Already integrated for affirmations; natural language understanding for thought triage | — Pending |
| Local-first data storage | Privacy (therapy notes, personal thoughts); no cloud dependency; simplicity | — Pending |
| Keep Apple Reminders integration | May eventually be replaced by internal task system, but keep for now | — Pending |

---
*Last updated: 2026-03-31 after initialization*
