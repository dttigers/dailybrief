# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v3.2 — Freshness & Capture Parity

**Shipped:** 2026-04-16
**Phases:** 8 | **Plans:** 14 | **Timeline:** ~2 days (2026-04-15 to 2026-04-16)

### What Was Built
- Wed-anchored weekly rollover with shared date-window helper (reused by 4 subsystems)
- 7-day analysis scope for Insights, Therapy patterns, and Therapy session prep
- Server-side AI cache (ai_cache table) with Regenerate UI and Chat auto-resume
- Tasks tab Open/Done/All filter with localStorage-first + server-synced persistence
- Work order auto-archive with lazy evaluation on GET, filter tabs, unarchive, bulk-clear
- Brief PDF restructured: de-duplicated Tasks, Affirmation on Page 1, 7-day thought scope
- Browser extension rewritten from URL-only to full quick-capture with triage feedback
- iOS PWA standalone OAuth verified on real device

### What Worked
- **Shared utility pattern**: date-window.ts landed in Phase 88 and was reused cleanly by Phases 89, 93, and the PWA — zero duplication across 4 consumers
- **Server-side data ownership**: Moving Insights/Therapy analysis to server-side DB queries (Phase 89) eliminated client-side thought shipping and simplified hooks dramatically
- **Cache-first hooks**: The upsert + GET cache pattern made revisits instant and Regenerate straightforward
- **Parallel-safe phase design**: Phases 91, 92, 94 ran independently of the 88→89→90→93 chain with no conflicts
- **Incremental brief fixes**: Several brief improvements (sports injection, blank page removal, affirmation relocation) landed in fix commits before the formal Phase 93, keeping the brief usable throughout development

### What Was Inefficient
- **Gmail work order debugging**: Multiple fix commits (7d77260 through 2d20432) debugging Gmail message parsing — nested multipart MIME and ServiceNow email format weren't anticipated
- **Brief PDF pre-phase fixes**: BRIEF-01/02/03 requirements were satisfied by fix commits (696a8a7, 0380c8e) before Phase 93 formally started, creating a traceability gap where the audit couldn't cleanly attribute the work
- **Human-verify checkpoints skipped**: Phases 91-94 missing VERIFICATION.md; Phase 94 Task 2 (Chrome/Safari manual test) never completed — low risk but pattern of skipping verification gates
- **Test harness gap persists**: RO-01..05 integration tests still skipped with test.skip; no shared test-DB in vigil-core after 3 milestones of accumulating test debt

### Patterns Established
- **Date-window helper as shared utility**: Pure function with injectable `now` param and zero deps — template for future cross-subsystem utilities
- **Lazy evaluation on GET**: Work order auto-archive runs during read, not on a cron — simpler than background jobs for low-volume data
- **localStorage-first with server sync**: Snappy UX pattern (filter tabs, timezone) where local storage provides instant state and server persists across devices
- **Cache-first with Regenerate**: AI-generated content cached server-side; stale-while-revalidate UX with explicit Regenerate button instead of auto-refresh

### Key Lessons
1. **Fix commits before formal phases blur traceability** — if a requirement gets satisfied "early" in a fix, explicitly reference the REQ-ID in the commit message so audits can trace it
2. **Gmail/email parsing needs upfront format investigation** — the nested MIME debugging spiral could have been avoided by fetching one real email and inspecting its structure before writing the parser
3. **Human-verify checkpoints need enforcement** — 5/8 phases skipped verification, making the audit flag items that are almost certainly fine but technically unverified. Consider making verification a gate rather than optional
4. **Pure utility modules with injectable params are the highest-leverage pattern** — date-window.ts was trivially testable (13 unit tests) and reusable because it has zero imports and accepts optional `now`

### Cost Observations
- Model mix: Primarily opus for execution, sonnet for planning
- 133 commits across 44 source files
- +2,591 / -557 lines of code (net +2,034)
- Notable: 8 phases in ~2 days is consistent with prior velocity (~1 phase per 3-4 hours)

---

## Milestone: v3.4 — Multi-User Foundation & PWA Polish

**Shipped:** 2026-04-18
**Phases:** 4 (99-102) | **Plans:** 15 | **Timeline:** ~24h (2026-04-17 17:01 → 2026-04-18 17:33)

### What Was Built
- Brief history survives Railway redeploys — brief_pdfs BYTEA table + structured 404 (`brief_not_found` vs `brief_pdf_not_stored`) drives branched PWA UX with Regenerate (Phase 99)
- Edit-refresh pause gate — window event bus `vigil:edit-started/ended` with Set-based refcount pauses 30s poll + visibilitychange + vigil:thought-created during active edits, fires single catch-up on last-end (Phase 100)
- Context menu on every thought row — right-click + long-press, 7 actions (delete/move/edit/re-triage/add-to-project/etc), deferred-commit delete with single-slot toast undo, D-19 interlock preserves Phase 100 pause gate (Phase 101)
- Multi-user backend — users table + argon2id + HS256 JWT + bearerAuth three-path dispatcher + userId FKs on 11 tables + per-user scoping across 20 routes + 4 services; Google OAuth state-JWT carries userId; vk_ backcompat preserved (Phase 102)
- Live Railway deploy verified via 5/5 go/no-go curls on api.vigilhub.io; production Gmail importer firing on real data with seed userId

### What Worked
- **Wave-0 TDD discipline**: 108+ failing test scaffolds landed before any production code across Phases 101 + 102. Cross-user-isolation suite runs against live Railway DB — caught regressions that pure-mock tests would miss.
- **Decision IDs as grep guards**: D-19 interlock (ContextMenu must not touch setIsEditing or dispatch vigil:edit-started) became grep-enforceable; verification could be automated ("grep returns 0 matches = D-19 holds").
- **Single authoritative edit-entry path**: ThoughtRow.handleContentClick became the sole setIsEditing pathway; ContextMenu Edit menuitem routes through it rather than inlining. Prevented the pause-gate bypass that would otherwise regress Phase 100.
- **Expand-contract migrations without scaling to 0**: Phase 102 Plan 01 applied multi-user migration on live production DB (137 active thoughts, 508 total) with single replica — nullable ADD → backfill → SET NOT NULL held the race window closed at current scale.
- **Three-token-class discipline**: argon2id (passwords) + HS256 JWT (sessions) + SHA256 vk_ (API keys) each in a separate module. bearerAuth three-path dispatcher routes cleanly; no interaction bugs.
- **Runbook before deploy**: 102-RUNBOOK.md + vigil-core/RUNBOOK.md landed before the first Railway push; deploy-day was mechanical, not diagnostic.

### What Was Inefficient
- **Paste-artifact whitespace bug (6380c6c)**: `.trim()` missing from VIGIL_SEED_USER_EMAIL read sites at 3 service call sites. Found in-flight during Plan 05 rather than Plan 04's audit. Integration test still uses only `.toLowerCase()` (I-04) — production/test drift.
- **Phase 101 WR-01..04 advisory findings**: ContextMenu keydown deps rebind on every arrow keystroke; handleRetriage lacks try/catch; handleMoveToCategory revert-on-error has an edge case when prev===undefined. All deferred but should have been caught in review before merge.
- **VALIDATION.md paperwork gap**: Phases 99/100/102 have no VALIDATION.md; 101 has draft frontmatter never flipped. Coverage is actually substantial (340+ automated cases) but the audit trail is uneven because several phases used in-SUMMARY test inventories.
- **Single-dev-machine Docker-build skip**: Phase 102 Plan 02 couldn't run `docker build` locally (no Docker on dev machine), substituted with package-lock.json musl-entry check. Real validation deferred to Railway deploy (Plan 05). Worked out but was a risk.
- **work_order_statuses table shipped without userId column (W-01)**: Integration check caught it; accepted as tech debt at v3.4 scope (single real user). Becomes an integrity issue when second user onboards.

### Patterns Established
- **Wave-0 test scaffolds as executable specs**: Fail-by-default via real imports (not stubs) so module-resolution failure IS the RED signal. 70+ cases pin decision IDs and requirement IDs before a line of production code.
- **Window CustomEvent as cross-hook contract**: `vigil:edit-started/ended` is a dispatch contract between ThoughtRow (producer) and useThoughts (consumer) — no shared state, no prop drilling. Cleanly extensible (ContextMenu now a third participant without modifying either).
- **Deferred-commit + single-slot toast**: Delete hides the row immediately, commits on toast expiry, fires previous onExpire synchronously when replaced. Undo = toast action. Replaces the "confirm dialog" pattern for destructive actions.
- **Seed-user claim-flow (D-11)**: Placeholder password hash on seed user rows means first register-with-seed-email succeeds with 201 and overwrites the placeholder. Preserves zero-downtime migration path for existing vk_ clients.
- **State-JWT for OAuth callbacks**: Google OAuth state param carries `{nonce, userId}` signed with JWT_SECRET. Public callback can upsert oauth_tokens with verified caller identity without authenticating the callback itself.

### Key Lessons
1. **Normalize at all read sites, not just write sites** — VIGIL_SEED_USER_EMAIL got `.toLowerCase()` originally; the `.trim()` fix had to be applied at 3 scheduler call sites + migrate-102-seed. Harmonize test fixtures with production normalization (I-04 gap).
2. **Decision IDs earn their keep when they become grep guards** — D-19 went from a discussion-log entry to a concrete regression test by being grep-enforceable. Worth the ID overhead when the invariant is cross-cutting.
3. **Runbooks eliminate deploy-day improvisation** — 102-RUNBOOK.md's go/no-go curl checklist turned the live production cutover into 5 mechanical commands. No "what do we run next" thinking under pressure.
4. **Integration tests must mirror production normalization exactly** — the W-02 gap (GET /v1/brief/:date not in isolation suite) and I-04 (test-side `.toLowerCase()` only) both trace to test-vs-prod drift. Add a drift-detection lint or shared normalization helper.
5. **"Backend-only" phases still need a UI-consumer checklist** — Phase 102 was pure server-side but downstream AUTH-06 (PWA login UI) carries every client-side assumption. Capture the client-facing surface explicitly, not implicitly.

### Cost Observations
- Model mix: Opus primary for execution, Sonnet for planning/research, Haiku for file ops
- 56 commits across 131 source files
- +27,410 / -645 lines of code (net +26,765; ~60% of LOC is Phase 102 migrations + tests)
- Notable: 4 phases in ~24 wall hours is the highest single-day velocity of the project (v3.3 shipped 3 phases in ~1 day). The Wave-0 scaffold approach front-loaded ~2 hours of test-writing per phase but eliminated the back-and-forth debugging cycles that usually stretch phases into multi-day affairs.

---

## Milestone: v3.5 — Observability, G2 Resubmit & Capture Repair

**Shipped:** 2026-05-05 (active 4 days + paused 13 days waiting on hardware + 1 evening UAT/ship)
**Phases:** 8 (103, 104, 105, 106, 107, 107.1, 107.2, 107.3) | **Plans:** 33

### What Was Built

- **Server + browser observability** (Phases 103-105): `posthog-node@^5.29.2` singleton with redaction + autocapture + sealed wrapper API, posthog-js init in PWA with ErrorBoundary, 5 capture-funnel events + per-route api_request middleware, BLOCKED_PROPERTY_NAMES guard preventing user-content leakage into events, server-side `identifyUser` in /v1/me. PostHog Cloud now receiving events from prod (debugging blind problem solved).
- **HEIC capture pipeline fixed** (Phase 103): heic-convert sync triage replaced sharp; photos dropped into iCloud watched folder now produce thoughts with non-empty content.
- **PWA email/password auth** (Phase 104): generic identical error copy on wrong-email/wrong-password (no enumeration), sessionStorage JWT (NOT localStorage), Settings Vigil Account section.
- **G2 store resubmit** (Phase 106): vigil.ehpk packed at 27,256 bytes and submitted to Even Hub. Atomic gate (G2-01 screenshots + G2-02 host exit dialog + G2-03 unified header/border/fallback) all verified on physical hardware in single evening session.
- **Safari extension persistence** (Phase 107): SMAppService.mainApp.register() + LSUIElement window suppression + persistence pill UI.
- **Local dev environment + cross-machine Tailscale access** (Phases 107.1-107.3): Postgres + hot-reload via `npm run dev` at repo root, retired the conflicting vigilcore launchd daemon on both dev machines, Tailscale magic DNS for cross-machine access without 0.0.0.0 exposure, prod bind default fixed (was causing 502s on api.vigilhub.io).

### What Worked

- **Pre-staging the runbook before hardware arrival** (`.planning/v3.5-G2-HARDWARE-UAT-RUNBOOK.md` authored 2026-05-02 before glasses landed 2026-05-05). When the hardware showed up 8 days early, "delivery day was execution, not design." Single-evening close from "glasses in hand" to "submitted to Even Hub" in ~2 hours.
- **Atomic gate pattern** (`check-verified.mjs` + 24h staleness) for the G2 ship blocker. Forced UAT discipline; the negative test (40h backdate → exit 1) verified the gate fail-closes as designed.
- **`evenhub-simulator` capture path** turned out to be the unblocker (it didn't exist when HARDWARE-BLOCKED.md was authored 2026-04-20; it became available between then and 2026-05-05). Native 576×288 PNGs straight from the simulator window's 📸 button — no cropping or downscaling.
- **Web Inspector USB attach during hardware UAT** — surfaced the actual SDK validator behavior (containerName 16-char limit) in real-time, allowing same-session patch + retest. Without the inspector, we'd have shipped a non-rendering plugin.

### What Was Inefficient

- **Phase 107.2 prod-probe didn't test proxy reachability**, causing a full 502 on api.vigilhub.io when 107.2-01 shipped because the local "prod probe" boots `NODE_ENV=production` on localhost — Railway's proxy can't reach a container bound to 127.0.0.1. ~30 min of production downtime until VIGIL_BIND_HOST=0.0.0.0 was set. Fixed by Phase 107.3 (emergency insert) adding an external HTTP probe against `https://api.vigilhub.io/v1/health` to the verify harness. Lesson: "prod probe" must mean external network, not localhost in NODE_ENV=production.
- **Phase 45's simulator-only validation hid the SDK validator strictness**. The `containerName ≤16 chars` SDK constraint was documented in the SDK README all along but the older simulator was lenient. Hardware UAT discovered + fixed in same session — but if we'd shipped to Even Hub without the hardware retest, we'd have had a 4/5 partial pack that didn't render on glasses.
- **iPhone canvas assumption in v3.5 hardware UAT runbook** ("PNG written to vigil-g2-plugin/store-assets/01-work-orders.png" implied iPhone-side capture). Turns out iPhone Even app is launcher-only — plugin runs on glasses LED display directly. Took ~30 min of confusion + a screenshot of an empty iPhone screen to realize this. Pivot to evenhub-simulator was clean once identified, but the runbook's screenshot-mechanism step was a gap.

### Patterns Established

- **Hardware UAT runbook supersedes RESEARCH simulator-only assumptions** — on-arrival, re-test container constraints (containerName length, glyph rendering) before assuming code-as-built will pass.
- **Pre-stage runbooks before hardware/external delivery** (DMARC, glasses, etc.) — every minute of pre-staging during the wait pays off 10× during execution.
- **`evenhub-simulator` is the canonical screenshot path** for G2 plugin work going forward (not iPhone canvas, not glasses-LED photography). HARDWARE-DIVERGENCE.md captures this for future phases.
- **Per-phase SECURITY.md is selective, not universal** — your project pattern is to run /gsd-secure-phase only on phases with significant security surface (auth, secrets, T8 leak classes). Phase 106 fit because of the T8-leak-1/T8-leak-2 surface area (VITE_SCREENSHOT_MODE production-mode + evenhub credentials).
- **Atomic ship gates** for store-listing-style submissions: a single check-verified.mjs gate that fail-closes the entire pack pipeline keeps "partial submission" structurally impossible.

### Key Lessons

- When a milestone is gated on external delivery (hardware, third-party gate, etc.), pre-staging the runbook is **not optional** — it's the difference between "deliver day execution" and "deliver day design under pressure."
- The 16-char containerName limit fits a class of bugs: **documented constraints that the dev surface (simulator/mock) fails to enforce**. Future SDK integrations: re-read the README on hardware day before assuming code-as-built will pass.
- v3.5's 13-day pause didn't feel like wasted time because the v3.6 + v3.7 milestones progressed in parallel. The "pause" only applied to the G2 ship gate, not to forward motion. Pattern worth repeating when a milestone has a single hardware blocker.

### Cost Observations

- Single-evening hardware UAT + ship cycle (~2 hours including debugging): produced 5 commits (71973e3, 47cf9c7, 7157896, 49ea883, f4988e6) covering source patches, store assets, UAT, SUMMARY for plan 05, and 16-threat security audit.
- Active execution timeline (excluding 13-day hardware pause): ~4 days for 33 plans across 8 phases — strong velocity helped by Wave-0 RED scaffolds + decision-ID grep guards established in v3.4.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Timeline | Phases | Key Change |
|-----------|----------|--------|------------|
| v3.2 | ~2 days | 8 | Shared utility pattern; cache-first hooks; lazy archive |
| v3.4 | ~24h | 4 | Wave-0 TDD scaffolds; decision-ID grep guards; runbook-first deploy |
| v3.5 | ~4 active days + 13d paused | 8 | Pre-staged hardware-UAT runbook; evenhub-simulator screenshot path; per-phase SECURITY.md selectivity |

### Top Lessons (Verified Across Milestones)

1. Pure utility modules with zero deps and injectable params maximize reuse and testability
2. Server-side data ownership simplifies clients — move computation to the API, not the browser
3. Fix commits should reference REQ-IDs for audit traceability
4. Wave-0 test scaffolds (fail-by-default via real imports) front-load the bug surface before production code is written
5. Decision IDs become cheap regression tests when the invariant is grep-enforceable
6. Normalize at all read sites, not just write sites — test fixtures must mirror production normalization exactly
