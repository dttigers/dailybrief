# Project Research Summary

**Project:** Jarvis — Personal AI Life Assistant
**Domain:** Personal productivity / ADHD life management — native macOS app
**Researched:** 2026-03-31
**Confidence:** HIGH

## Executive Summary

Jarvis sits at the intersection of three established domains — personal knowledge management (PKM), ADHD-specific productivity tools, and AI-powered assistants — but no existing product combines all three with a local-first, analog-output design. The research validates that the core thesis (frictionless capture + AI triage + printed daily brief) addresses a real gap. Competitors like Mem do AI-native capture, Tiimo does ADHD-awareness, and Readwise does daily digests — but none combine all of these with local-first privacy and a physical notebook bridge.

The recommended approach is a native macOS app using Swift 6.2/SwiftUI with MVVM + actor-isolated services, GRDB (SQLite + FTS5) for local persistence, WhisperKit for on-device transcription, and the SwiftAnthropic SDK for Claude API calls. The architecture extracts all business logic into a shared `JarvisCore` library so the existing CLI, menu bar monitor, and new dashboard app all share one codebase.

The single biggest risk is the **productivity tool paradox** — the tool becoming its own source of cognitive load. For an ADHD user, this is lethal. Every design decision must be filtered through: "does this require daily maintenance from the user?" If yes, automate it or cut it.

## Key Findings

### Recommended Stack

Swift 6.2 with `@Observable` + async/await replaces the need for Combine or any reactive framework. GRDB.swift 7.10+ provides SQLite with FTS5 full-text search — chosen over SwiftData due to SwiftData's lack of FTS5, immature migrations, and performance issues. SwiftAnthropic 2.1.8+ is the Claude API client (Swift 6 compatible, streaming support). WhisperKit 0.17+ handles on-device transcription via CoreML.

**Core technologies:**
- **Swift 6.2 + SwiftUI (macOS 14+):** `@Observable` macro, strict concurrency with "Approachable Concurrency" reducing false positives
- **GRDB.swift 7.10+:** SQLite ORM with FTS5 full-text search, async/await native, battle-tested
- **SwiftAnthropic 2.1.8+:** Claude API client — streaming, tool use, prompt caching
- **WhisperKit 0.17+:** On-device Whisper transcription, Apple Silicon optimized, ~100-500MB models
- **PDFKit + CoreGraphics:** Keep existing PDF pipeline, extend for evolved brief
- **LaunchAgent (launchd):** Background scheduling (BGTaskScheduler doesn't work on native macOS)

### Expected Features

**Must have (table stakes):**
- Instant text capture (< 1s to open, zero required fields)
- Full-text search across all captured thoughts
- Data persistence with timestamps
- Dark mode, keyboard shortcuts, stable operation
- Export / data portability

**Should have (competitive differentiators):**
- AI auto-triage on save (5 categories: task, therapy, idea, reflection, project)
- Voice capture with Whisper transcription
- Daily printed PDF brief with therapy prep section
- Therapy prep bucket as first-class category
- Configurable data source integrations in UI

**Defer (v2+):**
- Semantic/vector search
- Full pattern recognition and mood analytics
- Contextual proactive nudges
- Body-doubling / focus session integration

**Critical anti-features to avoid:**
- Required fields before saving (kills ADHD capture)
- Streak/gamification mechanics (shame spiral on missed days)
- Nested folder hierarchies (ADHD brains don't maintain them)
- Push notification overload
- AI therapy chatbot scope creep

### Architecture Approach

Extract all business logic into a `JarvisCore` shared library target. CLI, GUI, and menu bar monitor become thin executable wrappers importing it. Use MVVM with `@Observable` ViewModels (not TCA — overkill for solo dev). Services are actor-isolated with async interfaces. The pipeline flows: Capture → Triage (Claude API) → Store (GRDB/SQLite) → Surface (Dashboard + PDF + Search).

**Major components:**
1. **CaptureService** (actor) — voice/text/photo input, transcription pipeline
2. **TriageService** (actor) — Claude API classification with confidence scores
3. **ThoughtStore** (actor) — GRDB-backed CRUD with FTS5 search
4. **DataSourceManager** (actor facade) — coordinates Gmail, ServiceNow, MLB, Reminders
5. **BriefGenerator** — PDF generation for daily brief (existing, evolved)
6. **DashboardViewModel** (@Observable) — drives SwiftUI dashboard state

### Critical Pitfalls

1. **Productivity Tool Paradox** — tool becomes more work than it saves. Bake "zero daily maintenance" into architecture. The PDF brief should deliver 80% of value without opening the app.
2. **AI Trust Death Spiral** — miscategorizations erode trust → user manually reviews everything → defeats purpose. Use confidence scores, two-bucket system (auto-routed vs needs-triage), keep categories to 5-7 max.
3. **Voice Pipeline Fragility** — multiple silent failure points from mic wake-up lag to 50% WER in noise. Store original audio alongside transcriptions, show capture confirmations, build a "pending transcription" queue.
4. **SwiftData Migration Corruption** — avoided by choosing GRDB/SQLite instead.
5. **ADHD UX Anti-Patterns** — never show unprocessed item counts (guilt spiral), never require daily "review" sessions, design for "3 good weeks, 1 bad week" usage patterns.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — Shared Core Library + Data Layer
**Rationale:** Architecture research shows extracting JarvisCore is the prerequisite for everything else. Current code is CLI-only; dashboard and evolved features need shared services.
**Delivers:** JarvisCore SPM target with models, GRDB storage, config, existing services migrated
**Addresses:** Data persistence, search foundation (FTS5)
**Avoids:** Pitfall P1 (paradox) by establishing clean architecture from the start

### Phase 2: Capture + AI Triage
**Rationale:** Capture is the core value prop. Features research shows < 1s text capture and AI auto-triage are the two highest-priority items. Must work before dashboard makes sense.
**Delivers:** Text capture (menu bar popover + global hotkey), Claude API triage with confidence scores, thought storage
**Addresses:** AI auto-triage, instant capture, therapy prep bucket
**Avoids:** Pitfall P2 (trust spiral) by designing confidence UX upfront

### Phase 3: Dashboard App
**Rationale:** Dashboard is the "single pane of glass" — but it needs data to display. Capture + triage must be flowing first.
**Delivers:** SwiftUI dashboard with category views, search, thought management, settings
**Addresses:** Central dashboard, full-text search, configurable data sources
**Avoids:** Pitfall P6 (ADHD UX) by designing against guilt/shame patterns

### Phase 4: Voice Capture Pipeline
**Rationale:** Voice is high-value but high-complexity. Text capture proves the triage pipeline first; voice adds transcription layer on top.
**Delivers:** In-app voice recording, WhisperKit transcription, audio file storage alongside transcripts
**Addresses:** Frictionless voice capture, pocket recorder file import
**Avoids:** Pitfall P3 (voice fragility) by building on proven text pipeline

### Phase 5: Evolved Daily Brief
**Rationale:** Existing brief works but doesn't incorporate captured thoughts. With capture + dashboard in place, the brief can synthesize everything.
**Delivers:** PDF brief with therapy prep section, captured thought summaries, pattern hints
**Addresses:** Evolved daily brief, therapy prep export
**Avoids:** Pitfall P10 (PDF edge cases) by building incrementally on existing generator

### Phase 6: Pattern Recognition (v2+)
**Rationale:** Requires substantial data volume from real usage. Defer until capture is flowing.
**Delivers:** Recurring theme detection, weekly summaries, "you mentioned X three times" alerts
**Addresses:** Pattern recognition, cross-entry insights
**Avoids:** Premature optimization — needs real data to be useful

### Phase Ordering Rationale

- **Foundation first** because every other phase depends on shared services and data layer
- **Capture before dashboard** because a dashboard with nothing in it is useless; capture proves the core loop
- **Text before voice** because text capture is lower complexity and validates the triage pipeline
- **Brief last (among core phases)** because it synthesizes everything — needs all data sources flowing
- **Patterns deferred** because they need weeks/months of real captured data to be meaningful

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Capture + Triage):** Claude API prompt engineering for categorization accuracy; need to test/iterate on category definitions
- **Phase 4 (Voice):** WhisperKit model selection and performance characteristics on target hardware; pocket recorder file format compatibility

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented SPM multi-target pattern; GRDB has extensive docs
- **Phase 3 (Dashboard):** Standard SwiftUI MVVM; no novel patterns needed
- **Phase 5 (Evolved Brief):** Extension of existing working code

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified with official docs; GRDB chosen with clear rationale over SwiftData |
| Features | HIGH | 27 sources analyzed; clear MVP scope; ADHD-specific research validates design decisions |
| Architecture | HIGH | Standard patterns (MVVM + actors); SPM multi-target is well-documented; no novel architecture needed |
| Pitfalls | HIGH | 10 critical pitfalls identified from post-mortems and community discussions; actionable prevention strategies |

**Overall confidence:** HIGH

### Gaps to Address

- **WhisperKit model selection:** Need to benchmark tiny vs base vs small models on target Mac hardware during Phase 4 planning
- **Claude API categorization prompts:** Need to iterate on prompt engineering for 5-category triage; test with real thought examples
- **Pocket recorder integration:** Hardware TBD; file format and transfer mechanism need research when Phase 4 is planned
- **SwiftAnthropic SDK:** Verify it handles the existing API usage patterns (affirmations, etc.) before migrating from current implementation

## Sources

### Primary (HIGH confidence)
- Apple Developer Documentation — Swift 6.2, SwiftUI, @Observable, Speech framework
- GRDB.swift official documentation — SQLite, FTS5, async/await patterns
- SwiftAnthropic GitHub repository — Swift 6 compatibility, API coverage
- WhisperKit GitHub repository — CoreML integration, model performance
- ADHD productivity research — executive function compensation strategies

### Secondary (MEDIUM confidence)
- Competitor analysis (Obsidian, Notion, Mem, Tiimo, Goblin Tools, Readwise)
- Community discussions on PKM tool design and ADHD UX
- SwiftUI macOS development experience reports (2024-2025)

### Tertiary (LOW confidence)
- Pattern recognition implementation details — sparse documentation for single-user local systems
- Pocket voice recorder ecosystem — hardware-dependent, needs hands-on testing

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
