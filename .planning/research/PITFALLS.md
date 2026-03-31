# Pitfalls Research — Jarvis Personal AI Life Assistant

Research date: 2026-03-31
Scope: Critical mistakes in building capture-and-organize productivity tools, with focus on ADHD UX, macOS/SwiftUI development, AI integration, local-first architecture, and voice capture workflows.

---

## Critical Pitfalls

### P1: The Productivity Tool Paradox — Your Tool Becomes the Job

**What goes wrong**: The system you built to reduce cognitive load becomes its own source of cognitive load. You spend more time maintaining, configuring, and fiddling with the tool than it saves you. For an ADHD brain, the tool becomes a new hyperfocus trap — endlessly tweaking categories, reorganizing data, refining prompts — while actual tasks pile up.

**Why it happens**: Developers building personal tools conflate building the tool with using the tool. The Jevons Paradox applies: when capture becomes frictionless, you capture everything, creating an overwhelming inbox. Each new feature adds configuration surface area. The tool grows from "capture and organize" to "capture, organize, review, tag, search, pattern-match, brief-generate, integrate" — each step adding friction the tool was supposed to eliminate.

**How to avoid**:
- Set a hard rule: the daily interaction with Jarvis (not building it) should take under 5 minutes
- Measure "time spent in tool" vs "value delivered" weekly during development
- Default to auto-categorization with no user intervention required — manual review should be optional
- Kill features that require daily maintenance from the user
- The daily PDF brief is the output — if someone could get 80% of the value just from the printed page, the tool is working

**Warning signs**:
- You open the dashboard more than twice a day
- You have uncategorized items piling up because review feels like work
- You spend time re-categorizing things the AI already categorized
- You add a "settings" or "preferences" screen before the core capture flow works

**Phase to address**: Phase 1 (Architecture) — bake "zero daily maintenance" into core design decisions

**Sources**:
- [The AI Productivity Paradox (Fortune)](https://fortune.com/2026/03/10/ai-productivity-workers-workday-efficiency/) — Confidence: HIGH
- [The Developer Productivity Paradox (Pullflow)](https://pullflow.com/blog/developer-productivity-paradox-more-tools-less-flow) — Confidence: HIGH
- [Are you building a second brain or just performing productivity? (Medium)](https://medium.com/blog/are-you-building-a-second-brain-or-just-performing-productivity-6f521825d4cf) — Confidence: MEDIUM

---

### P2: AI Categorization Creates a Trust Death Spiral

**What goes wrong**: Claude miscategorizes a therapy thought as a task, or buries an important idea in "reflections." The user notices, loses trust, and starts manually reviewing everything the AI did — which defeats the entire purpose. Alternatively, the user never notices the miscategorization and important items silently disappear.

**Why it happens**: LLM categorization is probabilistic, not deterministic. Thoughts are ambiguous — "I should talk to Dr. Chen about my sleep" could be a task, a therapy note, or a health observation. Without feedback loops, the AI never improves for this specific user's mental model. Without surfacing confidence levels, the user has no way to know which categorizations to trust.

**How to avoid**:
- Show confidence scores on categorization (high/medium/low) — only surface low-confidence items for review
- Use a "two-bucket" system: auto-routed (high confidence) and "needs triage" (low confidence)
- Let users correct categorizations and feed corrections back into prompt context
- Keep a "recent AI decisions" log so users can spot-check without reviewing everything
- Start with fewer categories (5-7 max) — more categories = more ambiguity = more errors
- Use structured prompts with explicit category definitions and examples

**Warning signs**:
- User stops trusting auto-categorization and reviews everything manually
- Important items found in wrong categories weeks later
- Category count grows beyond 7-8
- Users create duplicate categories with overlapping meanings

**Phase to address**: Phase 2 (AI Integration) — design the categorization UX before building the AI pipeline

**Sources**:
- [Latency vs. Accuracy for LLM Apps (DEV Community)](https://dev.to/gervaisamoah/latency-vs-accuracy-for-llm-apps-how-to-choose-and-how-a-memory-layer-lets-you-win-both-d6g) — Confidence: HIGH
- [AI Runtime Quality (V2 Solutions)](https://www.v2solutions.com/blogs/ai-runtime-quality/) — Confidence: MEDIUM

---

### P3: Voice Capture Pipeline Is Fragile End-to-End

**What goes wrong**: The pocket recorder captures audio, but the transcription pipeline fails silently — Bluetooth mic clips the first words, background noise corrupts recognition, the file sits in a folder unprocessed, or transcription errors make the content useless. The user thinks they captured a thought but it never made it into the system.

**Why it happens**: Voice capture has multiple failure points: hardware (mic quality, battery), transfer (file format, naming, folder watching), transcription (accuracy, latency, language model), and ingestion (parsing transcribed text into structured data). Each link in the chain can fail independently and silently. Bluetooth microphones need 0.5-2 seconds to wake up, clipping initial words. Word error rates can reach 50% in noisy environments.

**How to avoid**:
- Build an explicit "capture confirmation" — after transcription, show the user what was captured (notification or dashboard indicator)
- Use Apple's on-device Speech framework first (no network dependency), fall back to Whisper/cloud for accuracy
- Handle the "first words clipped" problem by adding a brief recording buffer before transcription starts
- Implement a "pending transcription" queue visible in the dashboard so nothing silently fails
- Test with real-world audio: car noise, walking, wind, mumbling
- Store original audio files alongside transcriptions so users can re-listen if transcription is wrong

**Warning signs**:
- User captures a thought but can't find it later
- Transcription accuracy below 85% in typical capture environments
- Audio files accumulate in folders without being processed
- User stops using voice capture because they don't trust it

**Phase to address**: Phase 2 (Voice Pipeline) — prototype with real recordings before building UI

**Sources**:
- [Speech to Text Accuracy (SkyScribe)](https://www.sky-scribe.com/en/blog/speech-to-text-accuracy-why-transcripts-fail-today) — Confidence: HIGH
- [Missing first words in transcriptions (WisprFlow)](https://docs.wisprflow.ai/articles/3566082841-fix-missing-first-words-in-transcriptions) — Confidence: HIGH
- [Apple Speech Framework Documentation](https://developer.apple.com/documentation/speech) — Confidence: HIGH
- [WhisperKit for on-device transcription](https://github.com/argmaxinc/WhisperKit) — Confidence: HIGH

---

### P4: SwiftUI Menu Bar App Memory Leaks Compound Over Time

**What goes wrong**: The menu bar monitor app (which runs 24/7) slowly leaks memory. SwiftUI views used in NSMenuItem are never released when menus are rebuilt. Memory climbs 30-50MB per menu open/close cycle. After running for days, the app consumes hundreds of MB or crashes.

**Why it happens**: SwiftUI has a documented bug where views used as custom views in NSMenuItem are never released when calling `NSMenu.removeAllItems()`. The SwiftUI rendering pipeline allocates full infrastructure for MenuBarExtra whether needed or not. State changes trigger memory allocations that are never reclaimed on macOS.

**How to avoid**:
- Use AppKit (not SwiftUI) for the menu bar component specifically — the memory savings for a 24/7 process are significant
- If using SwiftUI, avoid rebuilding menu views on every state change — use static menu items with dynamic labels
- Profile memory with Instruments regularly during development, not just at the end
- Set a memory budget (e.g., <50MB after 24 hours) and test against it
- Consider using `NSStatusItem` directly with AppKit `NSMenu` for the menu bar, reserving SwiftUI for the dashboard window

**Warning signs**:
- Menu bar app memory usage grows over time in Activity Monitor
- App becomes sluggish after running for several hours
- CPU usage spikes when opening/closing the menu
- Toolbar or menu content causes layout thrashing

**Phase to address**: Phase 1 (Architecture) — decide AppKit vs SwiftUI for menu bar component before building

**Sources**:
- [SwiftUI NSMenuItem memory leak (GitHub)](https://github.com/feedback-assistant/reports/issues/84) — Confidence: HIGH
- [Memory Leak & Slow Down in SwiftUI for macOS (Apple Forums)](https://developer.apple.com/forums/thread/677969) — Confidence: HIGH
- [A 13MB Cursor Monitor: AppKit approach (DEV Community)](https://dev.to/woojinahn/a-13mb-cursor-monitor-appkit-undocumented-apis-zero-dependencies-1k72) — Confidence: MEDIUM

---

### P5: SwiftData/Core Data Migration Corrupts User Data

**What goes wrong**: A schema change during development (adding a field, changing a relationship) silently corrupts the local database. SwiftData randomly reorders array elements. Non-optional transformable values prevent all migrations from succeeding. The app crashes on launch after an update, and the user's captured thoughts are gone.

**Why it happens**: SwiftData doesn't support non-nullable foreign keys, causing nullable relationships that corrupt data on load. It fails to record element order in arrays, using random integers as uniquing keys. Migration can exceed watchdog thresholds on large databases, causing force-termination and corruption. WAL (Write-Ahead Log) files may not sync to main database if the app is killed during migration.

**How to avoid**:
- Use raw SQLite (via GRDB or SQLite.swift) instead of SwiftData for a personal tool — you get full control over schema, migration, and ordering
- If using SwiftData, never use non-optional transformable values
- Implement automatic database backups before any migration
- Store data in a human-readable format (JSON files) as a secondary backup
- Test migration with a production-sized database, not empty test data
- Add a "data export" feature early so the user can always recover their data

**Warning signs**:
- Array/list ordering changes randomly between app launches
- Crashes during or after schema migrations
- Data appears in the app but relationships are broken (nil where they shouldn't be)
- Migration takes noticeably long on real data volumes

**Phase to address**: Phase 1 (Architecture) — choose storage technology before writing any data layer code

**Sources**:
- [SwiftData Pitfalls (Wade Tregaskis)](https://wadetregaskis.com/swiftdata-pitfalls/) — Confidence: HIGH
- [Core Data Migration Incident Analysis (Fat Bob Man)](https://fatbobman.com/en/posts/core-data-migration-incident-analysis/) — Confidence: HIGH
- [SwiftData tables disappearing (Apple Forums)](https://developer.apple.com/forums/thread/761158) — Confidence: MEDIUM

---

### P6: ADHD UX Anti-Patterns — The App Demands Executive Function It's Designed to Compensate For

**What goes wrong**: The app requires the user to make decisions, process inboxes, configure settings, or maintain organizational habits — the exact executive function deficits that ADHD impairs. The "thought review" inbox becomes a source of guilt and avoidance. Configuration screens overwhelm with options. The app punishes inconsistent use instead of accommodating it.

**Why it happens**: Most productivity apps are designed by and for neurotypical brains that can maintain habits, process queues regularly, and tolerate configuration overhead. ADHD brains need activation cues, micro-starts, low-friction entry points, and forgiveness for inconsistent use. Dense interfaces, long task lists, and mandatory review steps trigger avoidance.

**How to avoid**:
- Zero-step capture: voice → transcription → auto-categorized → done. No required review step.
- The daily PDF brief IS the review mechanism — it surfaces what matters without requiring the user to open an app
- Never show a count of "unprocessed items" — this creates guilt and avoidance
- Design for "3 good weeks, 1 bad week" usage patterns — the system should not punish gaps
- Use color-coded visual scanning instead of text-heavy lists
- Limit visible options to 3-5 per screen
- Auto-archive stale items instead of letting them pile up
- Provide "quick wins" — show something useful immediately on launch, don't require setup first

**Warning signs**:
- User avoids opening the app because of accumulated unprocessed items
- Configuration takes more than 2 minutes
- The dashboard shows numbers that create anxiety (unread counts, overdue items)
- The app requires daily "processing" sessions to stay useful

**Phase to address**: Every phase — ADHD-friendly UX is a constraint, not a feature

**Sources**:
- [Software Accessibility for ADHD Users (UX Collective)](https://uxdesign.cc/software-accessibility-for-users-with-attention-deficit-disorder-adhd-f32226e6037c) — Confidence: HIGH
- [Designing for the Neurodivergent (Akhilesh Sabharwal)](https://asabharwal.com/designing-for-the-neurodivergent/) — Confidence: HIGH
- [UX Design for ADHD (Medium/Bootcamp)](https://medium.com/design-bootcamp/ux-design-for-adhd-when-focus-becomes-a-challenge-afe160804d94) — Confidence: MEDIUM
- [ADHD Productivity Blueprint (Super Productivity)](https://super-productivity.com/guides/adhd-productivity/) — Confidence: MEDIUM

---

### P7: Feature Creep Disguised as "Just One More Integration"

**What goes wrong**: The project grows from "capture and organize thoughts" to "capture, organize, integrate Gmail, integrate ServiceNow, track MLB scores, pull Apple Reminders, generate PDFs, pattern-match therapy topics, search everything, and provide a settings UI." Each integration adds maintenance burden, error surface area, and development time. The core capture experience never gets polished because energy goes to integrations.

**Why it happens**: For ADHD developers especially, new integrations are more exciting than polishing existing features. Each integration feels small ("it's just an API call") but brings OAuth tokens, error handling, rate limits, schema changes, and ongoing maintenance. The existing CLI already has these integrations, creating pressure to port them all immediately.

**How to avoid**:
- Phase integrations strictly: capture → organize → brief → THEN integrations
- Each integration must justify itself: "Does this serve the daily brief or the capture workflow?"
- Keep existing CLI running for integrations that already work — don't rebuild what works
- Set a rule: no new integration until the previous one has run stable for 2 weeks
- Track time spent maintaining each integration — kill ones with bad ROI
- MLB and ServiceNow are read-only data pulls; treat them as plugins, not core architecture

**Warning signs**:
- You're excited about adding a new integration but haven't used capture in a week
- More than 30% of development time goes to integration maintenance
- The app has 5+ data sources but capture still feels rough
- You're writing OAuth token refresh logic instead of working on the core experience

**Phase to address**: Phase 1 (Architecture) — design a plugin/module boundary so integrations are isolated

**Sources**:
- [Common Mistakes of Building a Productivity Tool (DEV Community)](https://dev.to/devslovecoffee/common-mistakes-of-building-a-productivity-tool-52a0) — Confidence: HIGH
- [Honest startup journey: How to fail productivity app launch (Medium)](https://medium.com/3outcomes/3outcomes-app-startup-honest-journey-prologue-2517c8804f9) — Confidence: MEDIUM

---

### P8: Claude API Costs and Rate Limits Surprise You

**What goes wrong**: Every captured thought triggers a Claude API call for categorization. At 50 thoughts/day, costs accumulate. Rate limits at Tier 1 (50 RPM) cause failures during batch processing. The daily brief generation hits token limits with large context windows. A bug in the prompt causes a retry loop that burns through your monthly budget in hours.

**Why it happens**: LLM API costs are per-token and per-request, making them easy to underestimate. Categorization prompts include system prompts + category definitions + the thought text + few-shot examples — each call may use 1000+ tokens. Batch processing (morning brief generation) concentrates API calls in a short window, hitting rate limits. No spending caps exist by default on most API tiers.

**How to avoid**:
- Batch categorization: collect thoughts and categorize in groups of 5-10 per API call, not individually
- Use Haiku ($1/$5 per MTok) for categorization, reserve Opus/Sonnet for brief generation and pattern recognition
- Implement local caching: don't re-categorize already-categorized items
- Set up Anthropic's spend alerts and hard monthly budget caps
- Use the Batch API (50% discount) for non-time-sensitive categorization
- Implement exponential backoff with jitter for rate limit errors
- Add a circuit breaker: if 3 consecutive API calls fail, queue items for later processing instead of retrying

**Warning signs**:
- Monthly API costs exceed $20 for a personal tool
- API calls fail during morning brief generation (peak usage time)
- Retry loops in logs
- Categorization latency exceeds 3 seconds consistently

**Phase to address**: Phase 2 (AI Integration) — establish cost model and rate limit strategy before writing API code

**Sources**:
- [Claude API Rate Limits Documentation](https://platform.claude.com/docs/en/api/rate-limits) — Confidence: HIGH
- [Claude API Pricing 2026 (MetaCTO)](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration) — Confidence: HIGH
- [How to Reduce LLM Cost and Latency (Maxim)](https://www.getmaxim.ai/articles/how-to-reduce-llm-cost-and-latency-a-practical-guide-for-production-ai/) — Confidence: MEDIUM

---

### P9: Gmail OAuth2 Tokens Expire Silently and Break the Daily Brief

**What goes wrong**: The daily brief fails to generate because Gmail OAuth2 tokens expired. In "Testing" mode, Google revokes refresh tokens after 7 days. In production, tokens expire if unused for 6 months, or if the user changes their password. The failure is silent — no brief prints, no notification, and the user doesn't know until they miss something important.

**Why it happens**: Google's OAuth2 has multiple expiration paths: access tokens expire hourly, refresh tokens expire after 7 days in testing mode, 6 months of inactivity in production, or immediately on password change. Personal projects often stay in "Testing" publishing status indefinitely, hitting the 7-day expiration. Token refresh logic is easy to get wrong — the refresh token is only returned on the first authorization, and developers often don't store it properly.

**How to avoid**:
- Move the Google Cloud project to "Production" publishing status (requires verification but avoids 7-day expiration)
- Implement token health checks before each use — proactively refresh, don't wait for failure
- Store refresh tokens securely in macOS Keychain, not in config files
- Add explicit error notification when token refresh fails — surface it in the menu bar app
- Consider using IMAP with app-specific passwords instead of OAuth2 for a personal single-user tool (simpler, no token expiration)
- Implement a "last successful Gmail sync" indicator in the dashboard

**Warning signs**:
- Brief generation fails every Monday morning (7-day token cycle in testing mode)
- Gmail section of brief is silently empty
- "Login Required" or "invalid_grant" errors in logs
- Multiple refresh tokens accumulated (Google limits to 100 per client)

**Phase to address**: Phase 1 (existing CLI hardening) — fix token management before building the dashboard

**Sources**:
- [Google OAuth invalid_grant explained (Nango)](https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked) — Confidence: HIGH
- [Google OAuth 2.0 Access Token and Refresh Token Explained (Medium)](https://medium.com/starthinker/google-oauth-2-0-access-token-and-refresh-token-explained-cccf2fc0a6d9) — Confidence: HIGH
- [Gmail OAuth2 Token Expiration in Node.js (Latenode)](https://community.latenode.com/t/handling-oauth2-token-expiration-in-node-js-gmail-api-resolving-login-required-error/8337) — Confidence: MEDIUM

---

### P10: PDF Generation Breaks Silently on Edge Cases

**What goes wrong**: The daily brief PDF renders incorrectly — content overflows a single infinitely-long page, fonts render blurry without embedding, Dark Mode colors leak into the printed output, or special characters (emoji, Unicode) break layout. The user glues a broken brief into their notebook and misses critical information.

**Why it happens**: PDF generation via Core Graphics or print operations has many silent failure modes. Dark Mode views render with inverted colors unless explicitly set to Light Mode. Fonts not embedded in the PDF look correct on screen but render as boxes on print. Content pagination requires manual page break logic — without it, everything renders on one giant page. Variable content length (many thoughts one day, few the next) makes fixed layouts fragile.

**How to avoid**:
- Always render PDF from a Light Mode view (set explicitly, don't rely on system setting)
- Embed fonts in the PDF, especially if using custom typography
- Implement explicit pagination with page break logic — test with 0 items, 5 items, 50 items
- Validate PDF output by printing it, not just viewing on screen
- Set maximum content limits per section — truncate with "and N more..." rather than overflowing
- Use a PDF library like TPPDF for structured page layout instead of raw Core Graphics
- Test with Unicode content: emoji, accented characters, CJK characters

**Warning signs**:
- PDF looks different on screen vs. printed
- Content runs off the page or is cut off
- Fonts look fuzzy or appear as rectangles when printed
- Brief layout breaks when a section has zero items or unusually many items

**Phase to address**: Phase 1 (existing CLI hardening) — audit current PDF generation for these issues

**Sources**:
- [Printing without tears in Dark Mode (Eclectic Light)](https://eclecticlight.co/2019/04/19/printing-without-tears-in-dark-mode-and-exporting-to-pdf/) — Confidence: HIGH
- [Creating PDFs on macOS without UIKit (Swift Forums)](https://forums.swift.org/t/creating-pdfs-on-macos-without-uikit/54968) — Confidence: MEDIUM
- [TPPDF library (GitHub)](https://github.com/techprimate/TPPDF) — Confidence: MEDIUM

---

## Technical Debt Patterns

| Pattern | What Accumulates | When It Bites | Prevention |
|---------|-----------------|---------------|------------|
| Hardcoded category names | Category strings scattered across AI prompts, UI code, data models, PDF templates | When you want to add/rename a category — requires changes in 4+ places | Single source of truth: define categories in one config, reference everywhere |
| Stringly-typed data | Thoughts stored as raw strings with category/tag strings | When you need to query, filter, or aggregate — string matching is fragile | Define typed enums for categories, structured data models from day 1 |
| God object config | One JSON config file holds teams, API keys, paths, display preferences | Config grows to 200+ lines; one typo breaks everything | Split config into domain-specific files: integrations.json, display.json, etc. |
| No data versioning | Local data files have no schema version number | When data format changes — old files can't be read, migration is impossible | Add a version field to every data file from the start |
| Synchronous API calls | Claude API calls block the main thread during categorization | UI freezes during thought capture — exactly when responsiveness matters most | Async/await from day 1; never block the main thread for network calls |
| Accumulated test data | Development thoughts/items mixed with real data during testing | Can't distinguish real captured thoughts from test garbage | Use separate data directories for dev vs. production from the start |

---

## Integration Gotchas

| Integration | Gotcha | Impact | Mitigation |
|-------------|--------|--------|------------|
| Gmail (IMAP/OAuth2) | OAuth2 refresh tokens expire after 7 days in testing mode; 6 months if unused in production | Brief generation fails silently; work orders missing | Move to Production status; use IMAP with app passwords as fallback; health check tokens proactively |
| ServiceNow | API table structures change with each upgrade (2x/year); custom fields may not be in API responses | Work order extraction breaks after ServiceNow upgrades | Version-lock API calls; use ServiceNow's versioned REST API; test after each company upgrade |
| MLB (statsapi.mlb.com) | Unofficial/undocumented API — no stability guarantees; endpoints change without notice; rate limit is ~6 req/min | Scores/standings section disappears from brief | Cache aggressively (scores change slowly); implement graceful degradation (brief generates without sports); consider a paid API for reliability |
| Apple Reminders | EventKit API requires explicit permission; reminder database is opaque; sync timing with iCloud is unpredictable | Reminders appear stale or missing in brief | Fetch reminders fresh each brief generation; handle permission revocation gracefully; show "last synced" timestamp |
| Claude API | Rate limits vary by tier (50 RPM at Tier 1); token costs accumulate; model versions deprecate | Categorization fails during peak usage; unexpected bills; prompts break on model changes | Batch requests; use cheapest model for categorization; pin model versions; set spend caps |
| macOS Printing (lpr) | Printer may be offline, out of paper, or have changed default; lpr returns success before print completes | Brief "generated" but never actually printed | Verify printer status before sending; add notification for print failures; keep PDF copy as fallback |

---

## Performance Traps

| Trap | Symptom | Root Cause | Fix |
|------|---------|------------|-----|
| Menu bar app memory creep | Memory usage grows from 30MB to 300MB+ over days | SwiftUI views in NSMenuItem never released; rendering pipeline overhead | Use AppKit for menu bar component; avoid rebuilding views on state changes |
| Thought search gets slow | Full-text search takes 2+ seconds with 1000+ items | Linear scan through JSON files; no indexing | Use SQLite FTS5 (full-text search) from the start; index on creation |
| Brief generation blocks UI | Dashboard freezes for 5-10 seconds during morning brief generation | Synchronous API calls + PDF rendering on main thread | Move all brief generation to background thread; show progress indicator |
| Voice transcription latency | 3-5 second delay between finishing speaking and seeing transcription | Network round-trip for cloud transcription; large audio file processing | Use on-device Speech framework for immediate feedback; process in streaming mode |
| Dashboard launch time | App takes 3+ seconds to launch | Loading all historical data at startup; initializing all integrations | Lazy load data; initialize integrations on-demand; show skeleton UI immediately |
| PDF file size bloat | Daily PDFs grow to 5MB+ each | Uncompressed images; embedded full-resolution graphics; unoptimized fonts | Compress images before embedding; use vector graphics where possible; subset fonts |

---

## Security Mistakes

| Mistake | Risk | Likelihood | Prevention |
|---------|------|------------|------------|
| API keys in config files committed to git | Keys exposed in repository history; anyone with repo access gets API access | HIGH — already using JSON config | Store keys in macOS Keychain; use .gitignore for any config with secrets; audit git history |
| Therapy notes sent to Claude API unencrypted | Sensitive mental health data traverses network to Anthropic servers | HIGH — core feature requires this | Accept this trade-off explicitly; use minimum necessary context in prompts; consider on-device categorization for sensitive categories |
| OAuth tokens stored in plaintext files | Token theft gives access to Gmail, ServiceNow | MEDIUM | Use macOS Keychain for all tokens; set restrictive file permissions |
| No data encryption at rest | Anyone with macOS access can read all captured thoughts, therapy notes | MEDIUM — single-user local app | Use FileProtection or encrypted SQLite; at minimum, store in user's Library directory |
| Debug logging includes sensitive content | Log files contain full thought text, API responses with personal data | MEDIUM | Implement log levels; never log full thought content in production; redact sensitive fields |
| No backup strategy | Disk failure or corruption loses all captured thoughts | MEDIUM | Automatic daily backup to a second location; Time Machine is not enough for database files |

---

## UX Pitfalls

| Pitfall | ADHD Impact | Better Approach |
|---------|-------------|----------------|
| Inbox with unprocessed item count | Creates guilt spiral; user avoids app entirely | Auto-process everything; show "recently captured" instead of "unprocessed" |
| Complex configuration screen | Decision paralysis; user never finishes setup | Sensible defaults that work immediately; progressive disclosure of settings |
| Text-heavy lists without visual hierarchy | Scanning fatigue; important items lost in noise | Color-coded categories; card-based layout; limit visible items to 5-7 |
| Requiring daily "review" sessions | Breaks down after 3 good days; creates shame when skipped | The PDF brief IS the review; no action required from user |
| Punishing gaps in usage (stale dates, overdue markers) | Triggers avoidance; "I'm behind" feeling | Auto-archive stale items; never show "overdue"; use relative time ("recently") |
| Multiple navigation levels (tabs, sub-tabs, sections) | Working memory overload; user forgets where they are | Flat navigation; maximum 2 levels; persistent breadcrumb |
| Auto-play sounds or animations | Sensory overwhelm; breaks focus | All animations optional; no sounds by default; respect Reduce Motion setting |
| Dense information layout | Visual overwhelm; nothing stands out | Generous whitespace; limit content density; use progressive disclosure |
| Requiring precise input (date pickers, dropdowns) | Fine motor + decision overhead | Natural language input; smart defaults; "today" / "this week" instead of date pickers |
| Notifications that require action | Notification fatigue; becomes noise | Informational only ("Brief printed"); never require response |

---

## "Looks Done But Isn't" Checklist

- [ ] **Voice capture works in quiet room** — but have you tested in a car, walking outside, with background TV, while cooking?
- [ ] **AI categorization works on your test data** — but have you tested with ambiguous thoughts, single-word captures, profanity, multiple languages, very long stream-of-consciousness entries?
- [ ] **PDF renders correctly on screen** — but have you printed it? On the actual printer you use? At the size that fits in the traveler's notebook?
- [ ] **Dashboard loads fast with 10 items** — but what about 500? 2000? 10000 items accumulated over a year?
- [ ] **OAuth tokens work today** — but will they work in 8 days? After a password change? After the Google Cloud project sits idle for 3 months?
- [ ] **Brief generates at 6am via LaunchAgent** — but does it work if the Mac was asleep? If it was just rebooted? If the network is down? If the printer is off?
- [ ] **App runs fine for 10 minutes** — but does the menu bar component leak memory over 3 days of continuous running?
- [ ] **Schema migration works on a fresh database** — but does it work on a database with 6 months of real data and 3 prior migrations?
- [ ] **Search finds exact matches** — but does it find "therapy" when the user typed "therapist"? Does it handle typos?
- [ ] **Settings UI saves preferences** — but does it validate input? What happens with empty fields? Special characters in team names?
- [ ] **Claude API works with your current prompt** — but what happens when Anthropic deprecates the model version you're using?
- [ ] **Data export works** — but can you actually reimport it? Is the export format documented?

---

## Recovery Strategies

| Failure Scenario | Detection | Recovery | Prevention |
|-----------------|-----------|----------|------------|
| Database corruption after migration | App crashes on launch; data queries return nil | Restore from automatic pre-migration backup | Always backup before migration; test migration on copy first |
| OAuth token expired | API call returns 401/403; brief section empty | Re-run OAuth flow; notify user via menu bar | Proactive token refresh; health checks before use |
| Claude API outage | Categorization calls timeout or return 5xx | Queue items for later processing; generate brief without AI sections | Circuit breaker pattern; graceful degradation; offline-capable brief |
| Printer offline during brief generation | lpr returns error or succeeds but nothing prints | Store PDF locally; retry on next printer detection; notify user | Check printer status before sending; keep PDF archive |
| Voice transcription garbage output | Transcribed text is nonsensical | Store original audio; let user manually transcribe from recording | Confidence threshold; flag low-quality transcriptions for review |
| MLB API endpoint changes | HTTP errors or unexpected response format | Fall back to cached data; generate brief without sports section | Cache last known good data; decouple sports from brief generation |
| Disk full | Write operations fail; database corruption possible | Alert user; purge old audio files and PDF archives | Monitor disk space; implement retention policies; compress old data |
| macOS upgrade breaks app | App won't launch; deprecated APIs cause crashes | Keep last working binary; test on beta OS releases | Follow Apple deprecation notices; don't use private APIs |

---

## Pitfall-to-Phase Mapping

| Phase | Critical Pitfalls | Must Address Before Moving On |
|-------|-------------------|-------------------------------|
| **Phase 0: Existing CLI Hardening** | P9 (OAuth tokens), P10 (PDF edge cases) | Fix silent failures in current system; add error notifications; audit token management |
| **Phase 1: Architecture & Foundation** | P1 (Productivity paradox), P4 (Menu bar memory), P5 (Data storage), P7 (Feature creep) | Choose storage technology; decide AppKit vs SwiftUI for menu bar; define plugin boundaries; set "zero maintenance" design constraint |
| **Phase 2: Voice Capture & AI** | P2 (AI trust), P3 (Voice pipeline), P8 (API costs) | Prototype voice-to-text with real audio; design categorization UX with confidence levels; establish cost model and rate limit strategy |
| **Phase 3: Dashboard UI** | P6 (ADHD UX), P1 (Productivity paradox) | Test with ADHD-specific scenarios; validate "zero required maintenance" principle; no inbox guilt patterns |
| **Phase 4: Integrations & Polish** | P7 (Feature creep), P9 (OAuth), integration gotchas | Each integration is isolated; graceful degradation if any integration fails; no integration breaks core capture/brief flow |
| **Ongoing** | P1 (Productivity paradox), P6 (ADHD UX) | Weekly check: "Am I spending more time building than using?" If yes, stop and ship what works |

---

*Research compiled from web sources, developer forums, Apple documentation, and community discussions. Confidence levels reflect source authority and recency.*
