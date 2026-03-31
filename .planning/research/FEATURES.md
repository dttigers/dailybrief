# FEATURES.md — Personal AI Life Assistant (Jarvis)
## Feature Research: PKM / Second Brain / ADHD Productivity Tools

**Research Date:** 2026-03-31
**Scope:** 2024–2026 landscape of PKM tools, ADHD productivity research, AI assistants, journaling analytics, voice capture, and daily brief systems.

---

## 1. Table Stakes

Features users expect in any tool of this category. Absence is a dealbreaker; presence is not a differentiator.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Text-based capture | Universal baseline for any notes/thoughts tool | Low | Must be near-instant; no required fields before save |
| Search (full-text) | Expected in every notes app since Evernote (2008) | Medium | SQLite FTS5 is viable for local-first; hybrid vector+FTS emerging standard |
| Tagging / categorization | Every PKM tool has it | Low–Medium | Manual tagging adds friction for ADHD; auto-categorization is the upgrade path |
| Data persistence / no data loss | Non-negotiable | Low | Local SQLite + backup strategy required |
| Timestamp on entries | Expected for any journal/note tool | Low | Creation + modification timestamps |
| Dark mode / readable UI | macOS users expect it | Low | System appearance binding acceptable |
| Responsive, low-latency capture | ADHD users abandon slow apps immediately | Medium | Capture UI must open in < 1 second |
| Export / data portability | Local-first tools must own their data | Medium | Markdown or JSON export minimum |
| Keyboard shortcuts | Power users on macOS demand them | Low | Menu bar access, capture shortcut essential |
| Stable, crash-free operation | Fundamental trust requirement | Medium | Especially critical when capturing fleeting thoughts |

---

## 2. Differentiators

Features that, if executed well, create genuine competitive advantage for Jarvis specifically.

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| AI auto-triage (task / therapy / idea / reflection / project) | Eliminates categorization burden; directly compensates for ADHD executive dysfunction | High | Claude API call on save; user can override; 5 categories is manageable scope |
| Frictionless voice capture with Whisper transcription | 4x faster than typing; key for ADHD brain dumps; no friction = thoughts don't get lost | High | Local Whisper model or API; must handle filler words gracefully |
| Daily printed PDF brief (traveler's notebook format) | Analog-digital bridge is rare; physical artifact creates "today's context" without screen dependence | High | Already built; evolve to include patterns, therapy prep, today's priorities |
| Therapy prep bucket ("questions for therapist") | No mainstream tool targets this use case; directly addresses ADHD + therapy workflow | Medium | A named category/bucket that aggregates to PDF section; Grow Therapy pioneered between-session AI journaling as proof-of-concept |
| Pattern recognition over time | Surfaces what an ADHD brain forgets — recurring themes, mood trends, productive periods | Very High | Requires sufficient data volume; v2+ territory; Rosebud/Mindsera do this in journaling space |
| AI-generated daily affirmations / contextual encouragement | Emotional regulation support; ADHD users have high rejection sensitivity; dopamine through encouragement | Medium | Already built; evolve with context-awareness (reference recent entries) |
| Configurable data source integrations | Aggregates life context (Gmail, ServiceNow, MLB, Reminders) into one brief | High | Already built for some; extensibility architecture needed |
| Morning brief as "working memory offload" | Single artifact answers "what matters today" — replaces the mental load of remembering | High | Core thesis of Jarvis; Readwise daily digest is closest analogue |
| Photo capture + AI description | Thoughts don't always start as words; receipts, whiteboard photos, UI screenshots | High | Requires multimodal Claude call; v1.x territory |
| Reflection prompts / AI follow-up questions | Deepens journaling value; Mindsera/Reflection.app do this; rare in productivity tools | Medium | Post-capture prompt: "What made this feel urgent?" |
| Cross-entry insight surfacing ("you've mentioned this 3 times") | Surfaces patterns proactively; compensates for ADHD forgetting | Very High | Requires embedding/vector search layer; v2+ |
| Body-doubling / focus session timer integration | ADHD research shows body-doubling is highly effective for task initiation | High | Out of scope for core; possible v2+ integration |

---

## 3. Anti-Features

Features that seem desirable but are actively harmful for this use case.

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Complex tagging systems with required fields | "Organization" feeling | Every required field before save = thought abandoned; Goblin Tools founder explicitly calls this out | Auto-categorization with override; no required fields ever |
| Nested folder hierarchies | Familiar from Finder/Notion | ADHD brains don't maintain folder systems; "out of sight, out of mind" kills it | Flat structure + powerful search + AI surfacing |
| Notification-heavy reminders | "I'll remember if the app reminds me" | ADHD brains already struggle with notification overload; more = worse signal-to-noise | Pull-based review (morning brief) rather than push-based interruptions |
| Gamification / streaks | Engagement / habit formation | ADHD brains miss streaks → shame spiral → app abandonment | Celebrate captures, not streaks; no punishment for gaps |
| Social / sharing features | Seeming like a "real app" | Single-user personal tool; collaboration surface = security risk + complexity cost | Explicit non-goal |
| Sync to cloud as primary storage | "Access everywhere" | Defeats local-first privacy promise; complexity increases; single-user has no true need | iCloud or local-network backup as optional secondary |
| Plugin / extension marketplace | Power-user flexibility | Maintenance burden; ADHD users get lost in plugin rabbit holes (see: Obsidian "vault tinkering" trap) | Opinionated defaults; few well-chosen integrations |
| Pomodoro / strict time-blocking | Productivity orthodoxy | ADHD brains have irregular energy; rigid time blocks create failure moments | Flexible scheduling with time estimates, not hard blocks |
| AI therapy / emotional support chatbot | Seems helpful | Scope creep into clinical territory; liability and trust risk; cheapens tool | Therapy prep bucket + prompts; explicitly not therapy |
| Version history / note diffing | PKM power feature | Overkill for single-user journal; adds complexity with near-zero ADHD benefit | Timestamps + archiving of superseded thoughts |

---

## 4. Feature Dependencies

```
CORE CAPTURE LAYER
├── Text capture (instant, no required fields)
│   └── AI Triage Layer [depends: Claude API]
│       ├── Category assignment (task/therapy/idea/reflection/project)
│       ├── Urgency signal
│       └── Reflection prompt generation
├── Voice capture [depends: Whisper transcription]
│   └── → Text capture pipeline (same AI triage after transcription)
└── Photo capture [depends: multimodal Claude] (v1.x)
    └── → AI description → Text capture pipeline

STORAGE LAYER
└── SQLite local DB [FTS5 enabled]
    ├── Full-text search [depends: FTS5 index]
    ├── Pattern analysis [depends: sufficient data volume, v2+]
    └── Vector embeddings [depends: local embedding model or API, v2+]

REVIEW / OUTPUT LAYER
├── Central Dashboard [depends: Storage layer]
│   ├── Category-filtered views
│   ├── Full-text search UI
│   └── Edit / re-triage entries
├── Daily PDF Brief [depends: Storage layer + data source integrations]
│   ├── Today's tasks (from triage)
│   ├── Therapy prep section (from "therapy" bucket)
│   ├── Affirmation (Claude API)
│   ├── Reminders / work orders / sports data (existing integrations)
│   └── Pattern notes [depends: v2+ pattern engine]
└── Therapy Prep Export [depends: Storage layer, therapy category]

DATA SOURCE INTEGRATIONS [mostly independent of each other]
├── Gmail work orders (existing)
├── ServiceNow (existing)
├── Apple Reminders (existing)
├── MLB sports data (existing)
└── Future: Weather, Calendar, Health/HRV (v1.x+)

SCHEDULING
└── LaunchAgent (existing)
    ├── Daily brief generation
    └── Future: nightly pattern analysis job (v2+)
```

---

## 5. MVP Definition

### v1.0 — MVP ("Jarvis Thinks")

Core thesis: **frictionless capture + AI triage + daily brief that synthesizes everything.**

Must-haves:
- [ ] Menu bar icon → instant capture popover (text, < 1 second to open)
- [ ] Voice capture with Whisper transcription in capture UI
- [ ] AI triage on every capture: category (5 types), brief reflection prompt
- [ ] Central dashboard: list all captures, filter by category, full-text search
- [ ] Edit / re-triage any entry from dashboard
- [ ] Daily PDF brief: tasks section, therapy-prep section, affirmations, existing integrations
- [ ] Therapy prep bucket: dedicated section in dashboard + PDF
- [ ] SQLite local DB with FTS5 (full-text search)

Non-goals for v1.0:
- Photo capture
- Pattern recognition / analytics
- Vector/semantic search
- Plugins, sharing, cloud sync

### v1.x — "Jarvis Remembers"

Deepen the core loops after real usage data:
- [ ] Photo capture → AI description → triage pipeline
- [ ] Reflection prompts that reference prior entries ("3 weeks ago you wrote…")
- [ ] Configurable data source on/off switches in dashboard
- [ ] Weekly digest / pattern summary (simple: most common categories, recurring keywords)
- [ ] Health/HRV or Calendar integration as additional brief context
- [ ] Export entries as Markdown or JSON
- [ ] Improved PDF brief: patterns section, contextual affirmations

### v2+ — "Jarvis Understands"

Requires significant data volume and infrastructure investment:
- [ ] Semantic / vector search (hybrid with FTS5)
- [ ] True pattern recognition: mood trends, productivity rhythms, recurring themes
- [ ] Automated therapy prep report (surfaces all therapy entries since last session)
- [ ] Contextual nudges: proactive surfacing of relevant past entries
- [ ] Body-doubling / focus session integration
- [ ] Possible: Whisper running fully local (no API cost)

---

## 6. Feature Prioritization Matrix

Scoring: Impact (1–5) × Feasibility (1–5) = Priority Score. Higher = build sooner.

| Feature | ADHD Impact | Build Feasibility | Priority Score | Target Version |
|---|---|---|---|---|
| Instant text capture (< 1s) | 5 | 5 | 25 | v1.0 |
| AI auto-triage (category) | 5 | 4 | 20 | v1.0 |
| Full-text search | 4 | 5 | 20 | v1.0 |
| Central dashboard | 4 | 4 | 16 | v1.0 |
| Therapy prep bucket | 5 | 4 | 20 | v1.0 |
| Voice capture + Whisper | 5 | 3 | 15 | v1.0 |
| Daily PDF brief (existing, evolve) | 4 | 5 | 20 | v1.0 |
| Category-filtered views | 3 | 5 | 15 | v1.0 |
| Reflection prompts (AI) | 3 | 4 | 12 | v1.x |
| Photo capture | 3 | 3 | 9 | v1.x |
| Weekly pattern summary | 4 | 3 | 12 | v1.x |
| Health/Calendar integration | 3 | 3 | 9 | v1.x |
| Semantic/vector search | 3 | 2 | 6 | v2+ |
| Full pattern analytics | 4 | 1 | 4 | v2+ |
| Contextual proactive nudges | 4 | 2 | 8 | v2+ |

---

## 7. Competitor Feature Analysis

| Tool | Target User | Capture UX | AI Layer | Search | Analog Output | ADHD-Aware | Local-First |
|---|---|---|---|---|---|---|---|
| **Obsidian** | PKM power users | Good (quick capture plugin) | Plugins only | Full-text + graph | No | No (highly complex) | Yes |
| **Notion** | Teams / students | Medium (many fields) | Notion AI (GPT/Claude) | Full-text | No | No | No (cloud) |
| **Logseq** | Researchers / developers | Good (daily notes default) | Limited | Full-text + graph | No | Moderate | Yes |
| **Capacities** | Knowledge workers | Good (object-based) | Some | Full-text | No | Moderate | Partial |
| **Mem** | Individuals | Very good (zero setup) | AI-native organization | Semantic + FTS | No | Moderate | No (cloud) |
| **Reflect** | Clean-desk users | Good | ChatGPT integrated | Full-text | No | Moderate | No (cloud) |
| **Tana** | Power users | Medium (supertags complex) | AI tagging / summarization | FTS | No | Low | No |
| **Tiimo** | ADHD / neurodivergent | Daily planning focused | AI co-planner | No | No | High | No |
| **Goblin Tools** | ADHD (task breakdown) | Minimal (web tools) | Task decomposition AI | No | No | High | No |
| **Readwise** | Readers / learners | Highlight-focused | AI summaries | Full-text | No | Low | No |
| **Mindsera / Reflection.app** | Mental health / journaling | Text + prompts | Mood / pattern analysis | Limited | No | Moderate | No |
| **Wispr Flow** | Voice-first users | Voice only | Cleanup/grammar AI | No | No | Moderate | No |
| **Jarvis (this project)** | ADHD single user | Text + voice + photo | Triage + affirmations | FTS (→ semantic v2) | **Yes (PDF)** | **Core purpose** | **Yes** |

**Key gaps Jarvis fills that no competitor does simultaneously:**
1. ADHD-first design + local-first + analog output (PDF brief)
2. Therapy prep as a first-class bucket
3. Full life-context aggregation (work orders, sports, reminders) into one printed artifact
4. Single-user, no account required, no cloud dependency

---

## 8. ADHD-Specific Design Principles

Derived from 2024–2025 research. These should be treated as non-negotiable constraints.

1. **Zero required fields.** A thought must be saveable with a single keystroke. Goblin Tools, ADHD research, and practitioner interviews all confirm: every required field = abandoned thought.
2. **Reduce choices at capture time.** The AI does categorization; the user just captures. Decisions = cognitive load = friction = failure.
3. **"Out of sight, out of mind" is a bug.** The daily brief is the antidote — it surfaces what exists without requiring the user to remember to check.
4. **No shame mechanics.** No streaks, no "you haven't captured in X days," no badges. ADHD → shame spiral → abandonment.
5. **Time blindness compensation.** Timestamps on everything; "you captured this 3 weeks ago" surfacing; brief shows day's context even when internal clock is unreliable.
6. **Working memory offload is the core product.** Every feature should be evaluated: does this reduce the user's need to hold things in their head?
7. **Capture must be faster than thinking about capturing.** If the user thinks "should I open Jarvis for this?" the moment is already lost. Menu bar popover, global shortcut, always available.
8. **Body over mind.** Voice and photo capture exist because ADHD thoughts arrive in non-text form — while walking, while cooking, while staring at a whiteboard.

---

## 9. Sources

**Confidence levels: HIGH = direct feature documentation or peer-reviewed research; MEDIUM = credible publication/analysis; LOW = community/anecdote.**

| Source | Relevance | Confidence |
|---|---|---|
| [Capacities vs Obsidian vs Notion vs Logseq: 2025 Feature Comparison](https://medium.com/@ann_p/capacities-vs-obsidian-vs-notion-vs-logseq-2025-feature-comparison-72bff05e496c) | PKM feature landscape | MEDIUM |
| [Obsidian vs Logseq vs Notion: PKM Systems Compared 2026](https://dasroot.net/posts/2026/03/obsidian-logseq-notion-pkm-systems-compared-2026/) | PKM architecture comparison | MEDIUM |
| [Second Brain AI Apps: Best 10 in 2026](https://blog.saner.ai/10-best-second-brain-ai-apps/) | AI second brain feature survey | MEDIUM |
| [Top ADHD Productivity Tools for Focus & Consistency in 2025](https://tracka.ai/blog/adhd-productivity-tools/) | ADHD tool features | MEDIUM |
| [Best ADHD Productivity Tools for 2025 - Fluidwave](https://fluidwave.com/blog/productivity-tools-for-adhd) | ADHD tool comparison | MEDIUM |
| [Best ADHD Apps - Tiimo 2025 resource](https://www.tiimoapp.com/resource-hub/best-adhd-apps-2025) | Tiimo/ADHD-first design principles | HIGH |
| [Task Initiation Tactics for ADHD Adults - Tiimo](https://www.tiimoapp.com/resource-hub/task-initiation-adhd) | ADHD task initiation research | HIGH |
| [Most ADHD Productivity Apps Are Making Your ADHD Worse - Medium](https://medium.com/@theclearlens/why-most-adhd-productivity-apps-fail-diogenes-38a154e8a426) | Anti-features analysis | MEDIUM |
| [Every Productivity App Failed My ADHD Brain - Medium](https://medium.com/startup-insider-edge/every-productivity-app-failed-my-adhd-brain-so-i-built-my-own-2a71ec7db721) | ADHD user experience | MEDIUM |
| [ADHD Productivity: The Three-Layer Framework - 10000Hours](https://blog.make10000hours.com/post/adhd-productivity-apps) | ADHD stack design | MEDIUM |
| [Notion AI vs Mem 2025 - Aloa](https://aloa.co/ai/comparisons/ai-note-taker-comparison/notion-ai-vs-mem) | AI note-taking features | HIGH |
| [Mem AI: Your Personal Knowledge Engine in 2025](https://skywork.ai/skypage/en/Mem-AI-Your-Personal-Knowledge-Engine-in-2025/1976181401534394368) | Mem feature details | MEDIUM |
| [Test-Driving Second Brain Apps: Obsidian, Tana, Mem - Forte Labs](https://fortelabs.com/blog/test-driving-a-new-generation-of-second-brain-apps-obsidian-tana-and-mem/) | Independent PKM analysis | HIGH |
| [Second Brain Strategies for ADHD Users - Medium](https://medium.com/@theo-james/second-brain-strategies-for-adhd-users-that-actually-stick-83a785290a08) | ADHD second brain strategies | MEDIUM |
| [How Wispr Flow helps ADHD - WisprFlow](https://wisprflow.ai/post/how-wispr-flow-can-help-individuals-with-adhd) | Voice capture + ADHD | MEDIUM |
| [Whisper Memos App](https://whispermemos.com/) | Voice capture workflows | HIGH |
| [Best Journaling App 2025 - Rosebud](https://www.rosebud.app/blog/best-journaling-app-2025-review) | Journaling analytics features | MEDIUM |
| [9 Best AI Journaling Apps in 2026 - MyLifeNote](https://blog.mylifenote.ai/the-8-best-ai-journaling-apps-in-2026/) | AI journaling feature survey | MEDIUM |
| [Grow Therapy AI Journaling - Fierce Healthcare](https://www.fiercehealthcare.com/digital-health/grow-therapy-rolls-out-ai-powered-journaling-support-engagement-between-sessions) | Therapy prep + AI journaling | HIGH |
| [Daily Digest - Readwise Docs](https://docs.readwise.io/reader/docs/faqs/daily-digest) | Daily digest UX pattern | HIGH |
| [Tana PKM features - Otio](https://otio.ai/blog/tana-pkm) | Object-based PKM + AI tagging | MEDIUM |
| [Why Traditional Productivity Tools Don't Work for ADHD - Medium](https://medium.com/@theo-james/why-traditional-productivity-tools-dont-work-for-adhd-brains-7a415cf39bab) | ADHD cognition mismatches | MEDIUM |
| [Executive Function and ADHD - Josi Health](https://josihealth.com/executive-function-adhd/) | Executive function research | HIGH |
| [Executive function in neurodevelopmental conditions - Nature](https://www.nature.com/articles/s41562-024-02000-9) | Peer-reviewed EF research | HIGH |
| [SQLite Hybrid FTS + Vector Search - Alex Garcia](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) | Technical: FTS+vector search | HIGH |
| [My Hybrid Productivity Method - The Sweet Setup](https://thesweetsetup.com/hybrid-productivity-method-digital-analog/) | Analog-digital workflow | MEDIUM |
| [Mindsera - AI Journal for Mental Wellbeing](https://www.mindsera.com) | Mental health AI journaling features | MEDIUM |
