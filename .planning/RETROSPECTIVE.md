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

## Milestone: v3.7 — Source Pickers, Verify-Email UX & Closeout Cleanup

**Shipped:** 2026-05-06 (started 2026-04-27 — 9 active days)
**Phases:** 6 (115, 116, 116.1, 117, 118, 119) | **Plans:** 22

### What Was Built

- **Calendar source picker** (Phase 115): `PUT /v1/calendar/selections` with single-sourced array validation + per-user Drizzle `oauth_tokens.calendar_selections` jsonb write; PWA Calendars subsection inside the Google Account card with debounced 400ms save, optimistic toggle + rollback toast, and the four documented branches (loading / ok / needs_reauth-hidden / error-with-retry). Empty selection preserved as the all-calendars fallback contract. POLISH-01 ride-along: `whitespace-pre-line` Tailwind utility on ThoughtRow display-mode `<p>` so multi-line thought captures render with line breaks.
- **Sports source picker** (Phase 116): Per-user sports preferences persisted to `app_settings` (jsonb, key='sports_selections') with bearer-gated GET/PUT `/v1/sports/selections` endpoints; 24h global in-memory cache for `/v1/sports/teams/:league` with per-league name normalization; brief-assembly threads selections via `getUserSportsSelections`, structurally drops `disabled` leagues via existing `status !== 'ok'` filter; PWA SettingsPage Sports section with per-league checkbox + indented team radio list.
- **Sports route + PWA error-class differentiation** (Phase 116.1, INSERTED 2026-04-29): Typed `UpstreamError` class with structured `kind` enum, 10s `AbortController` timeout, 4-bucket BDL classification, sports routes catch `instanceof UpstreamError` → HTTP 502 + structured body; PWA `classifyFetchError` helper exported, SettingsPage renders distinct copy + live countdown per error bucket. Closes the local-env-gap symptom (BDL 401 → opaque PWA error) surfaced during Phase 116 HUMAN-UAT.
- **Auth-email rate-limit UX hardening** (Phase 117): vigil-core route caps raised across 4 auth-email endpoints (per-IP `5 → 20`, resend-verification per-userId `3 → 5`); forgot-password split into `RATE_LIMIT_MAX_IP` (20) + `RATE_LIMIT_MAX_EMAIL` (5); 4 source-file drift detectors via `fs.readFileSync` regex; PWA `classifyFetchError` extended with 5th `rate-limited` bucket; D-08 unified UX (heading + body + live mm:ss countdown) wired into VerifyEmailPage, ResetPasswordPage, and SettingsPage resend.
- **Production test-user cleanup** (Phase 118, OPS-01): Idempotent `cleanup-test-users.ts` (350 lines, 14-table single-tx with pre-flight email assertion gate + DryRunRollback custom error class). Live execution against Railway prod via `railway run --service Postgres + DATABASE_PUBLIC_URL` remap. 22 rows deleted across 14 tables; smoke confirmed seed user untouched. Two-artifact ops audit pattern (`118-RUN-LOG.txt` + `118-RUNBOOK.md`) locked.
- **DMARC posture decision** (Phase 119, OPS-02): Auto-eval routine `trig_01RZLcj1jpxvDQAwnFmUG9d9` fired 2026-05-06 and returned DEFERRED on 0/3 conditions — 8-day rua silence (2026-04-29 → 2026-05-05) is a structural scale signal. Operator amendment (commit b33a55a) accepts `p=none` as steady-state DMARC posture and documents three explicit re-activation conditions (volume materializes / spoofing observed / compliance requirement). Cloudflare DNS untouched.
- **Six v3.8 G2 plugin improvement seeds planted** (2026-05-05/06): SEED-005 through SEED-010 capturing UAT-evidenced gaps from v3.5 hardware UAT (swipe-out-of-list nav broken on hardware, glasses-menu launch unhandled, home body 210px overflow, device-status event spam) plus forward-looking ideas (local-storage state persistence, voice capture via SDK audioControl + audioEvent PCM stream — flagged as v3.9 milestone-anchor candidate).

### What Worked

- **Wholesale-PUT with optimistic toggle + lastSavedRef rollback** for picker UIs locked across Phase 115 calendar + Phase 116 sports — same pattern, two ships, near-zero rework. Server-confirmed value as source of truth + 400ms debounce + rollback toast on failure is the right shape for any toggle persistence.
- **Single-source validation in service.setX(...) + route catches throw → 400** locked across Phases 115 + 116 + 117. Same rules apply to any future direct caller; tests exercise the service, not the route.
- **Hardware UAT mid-milestone unblocked v3.5 close in parallel** (2026-05-05 G2 glasses arrived 8 days early; vigil.ehpk submitted to Even Hub; v3.5 closed 2026-05-06 alongside v3.7). Pre-staged runbook from v3.5 paid off — single-evening close from "glasses in hand" to "submitted."
- **Operator amendment closure for structurally unsatisfiable execution gates** (Phase 119) preserves the routine + monitoring + re-arm path while releasing the milestone-close deadline. Beats forcing synthetic conditions or silently abandoning. New pattern, captured in PROJECT.md Key Decisions.
- **Phase 116.1 inserted mid-milestone** (URGENT — gap closure for opaque "Couldn't load teams." surfaced during 116 HUMAN-UAT after local `BALLDONTLIE_API_KEY` env-gap exposed missing route try/catch). Insert workflow handled cleanly; phase landed in 1 day with 4 plans.
- **Drift-detector tests via `fs.readFileSync` + regex** (Phase 117 AUTH-13) chosen over runtime-introspection — survives bundler/minifier transforms, source file is the single source of truth for policy review.

### What Was Inefficient

- **Phase 116 HUMAN-UAT carried over to v3.7 close as `partial`** — 6 pending scenarios; sports picker shipped to Railway prod 2026-04-29 and in daily use. Functional verification implicit but formal `/gsd-verify-work` ceremony not run. Same pattern with Phase 116.1 (2 pending scenarios). Both acknowledged in STATE.md Deferred Items at v3.7 close. Pattern: when a phase ships to prod and is in active daily use without regression reports, the "human UAT ceremony" is sometimes deferred indefinitely. Worth deciding upfront whether HUMAN-UAT.md is a ship-blocker or a monitoring-window before authoring the file.
- **DMARC ramp gate as designed was structurally unsatisfiable at current product scale** — the 8-day rua silence wasn't a transient signal; it reflected vigilhub.io's pre-growth volume. ~3 days of waiting for the routine to fire produced exactly the answer that was implicit in the routine schedule itself. Lesson: when a gate is volume-dependent, do a back-of-envelope volume estimate during phase planning, not after the routine has already burned its first firing window.
- **Phase 118 PIPESTATUS scoping bug** — bash `tee'd` pipeline silently dropped exit code; safe silent-re-run impossible post-cleanup. Inferred from TRANSACTION COMMITTED banner + all-zero AFTER SELECTs, but the inference path was nonzero overhead and required documenting an "Option A annotation" in the SUMMARY. Lesson: avoid bash + tee + ts-node pipelines for ops scripts where exit-code accuracy matters; structured logging from inside the script is more reliable.
- **`reference_macbook_pro.md` memory drift flagged but not corrected** during v3.7 — STATE.md noted the drift since 2026-04-21; it carried through this milestone. Pattern: drift-flagged memory entries need an explicit fix queue, not just acknowledgment.

### Patterns Established

- **Operator amendment closure** for plans whose execution gate is structurally unsatisfiable at current product scale. Includes: operator-decision quoted block, state table (preserved vs released), three re-activation conditions, "what this does NOT do" section. Captures structured deferral instead of silent abandonment. (v3.7 Phase 119 — first use)
- **Two-artifact ops audit pattern** (`{phase}-RUN-LOG.txt` machine-readable + `{phase}-RUNBOOK.md` human-readable). Locked across v3.7 Phase 118 + 119. Separates verbatim stdout (reproducibility) from checklist + before/after table + rollback notes (reviewability).
- **Discriminated-union API helpers** for endpoints with structured non-error states (e.g. `selectedCalendarIds`). PWA helper returns tagged union; callers branch on `.status` instead of throw + try/catch ladder. (v3.7 Phase 115)
- **D-08 unified 429 copy** (heading "Too many attempts" + body "Try again in {Xm Ys}.") locked verbatim across VerifyEmailPage + ResetPasswordPage + SettingsPage resend. Inline single-line variant for SettingsPage where heading hierarchy is structurally inappropriate.
- **`countdownTimerRef` + useEffect cleanup-only pattern** for live mm:ss countdowns (Phase 117 mirrors Phase 116.1 SettingsPage WR-02). Per-component timer ref, cleared on unmount, no shared global timer state.

### Key Lessons

- **Volume-dependent gates need volume estimates upfront.** If your trigger is "≥7 days of rua reports" and you're at single-user scale, you're not waiting for the gate to pass — you're waiting for growth that hasn't happened. Estimate the volume floor during phase planning, not after the gate has fired with no input.
- **Operator amendments are not abandonments.** When a plan's execution gate is structurally unsatisfiable, the right move is a structured deferral with re-activation conditions, not forcing synthetic conditions or silently abandoning. Preserves the runbook, monitoring, and re-arm path; releases the milestone-close deadline.
- **Picker UI patterns generalize.** Calendar picker (Phase 115) and Sports picker (Phase 116) shipped near-identically because the optimistic-toggle + debounced-PUT + lastSavedRef-rollback pattern is the right shape for any toggle persistence. If you have a third picker coming (notebook source picker? feed source picker?), the third one will be even faster than the second.
- **Mid-milestone hardware UAT can unblock prior milestones.** v3.7 wasn't supposed to close v3.5, but the G2 glasses arriving 8 days early during v3.7 work meant v3.5 closed alongside v3.7. Don't artificially serialize milestones if a parallel unblocker arrives.

### Cost Observations

- **9 active days for 22 plans across 6 phases** — slower than v3.4 (~24h for 4 phases / 15 plans) but appropriate for v3.7's mix of UI work (pickers + auth-email UX) + ops (test-user cleanup) + structural decisions (DMARC posture). The picker phases (115 + 116) carried the bulk of the velocity; Phase 119's amendment + summary pathway took ~30 min total once the routine returned DEFERRED.
- **Phase 116.1 mid-milestone insert** (4 plans in 1 day) showed the insert workflow scales — the gap was identified during 116 HUMAN-UAT, scoped + planned + executed + closed inside the same calendar day with no scope creep.
- **DMARC routine ROI** — `trig_01RZLcj1jpxvDQAwnFmUG9d9` ran the boring monitoring work (Gmail rua aggregate report scanning) so the operator didn't have to. Even though it returned DEFERRED, the structured evaluation + checkpoint file + auto-commit was worth orders of magnitude more than the 5 minutes it would have taken to manually scan Gmail. Pattern worth repeating for any "wait until conditions are right" milestone gate.

---

## Milestone: v3.8 — Claude Code Companion

**Shipped:** 2026-05-11
**Phases:** 7 (120-126; Phase 126 was a mid-milestone insert added 2026-05-11) | **Plans:** 54 | **Timeline:** 2026-05-07 → 2026-05-11 (5 days)
**Requirements:** 28/28 satisfied (20 original + 8 AUTH-126 added mid-milestone)
**Git:** 200 commits, 245 files changed (+64,890 / −284 LOC)

### What Was Built

- **`vigil-watch` Swift daemon** (Phases 122-123) — observes `~/.claude/projects/` via FSEventStream, parses 5 Vigil event types per detection rules locked in Phase 120's empirical schema verification, posts to Vigil Core with retry/backoff + 100-event offline queue; 24h SOAK PASSED at 7220 KB max RSS (24% of 30 MB budget). 6-subcommand CLI (`run`/`tail`/`test`/`install`/`uninstall`/`status`), launchd round-trip with mode 0600 plists + `<true/>` self-closing booleans + xmlEscape on api key (T-123-01/02/03 mitigations).
- **Per-userId agent-events API** (Phase 121) — `POST /v1/agent-events` (idempotent via composite partial unique on `(user_id, client_event_id)`) + `GET /v1/agent-sessions` (sliding 24h, DISTINCT ON CTE) + `GET /v1/agent-stream` SSE fan-out (Phase 124) via `Map<userId, EventEmitter>` bus with `setMaxListeners(50)` reconnect-storm headroom + auto-cleanup. Three W-01/W-02-style isolation lock blocks in `cross-user-isolation.test.ts`.
- **G2 Companion HUD** (Phase 124, plugin v0.3.0 in Phase 125) — 3-line glanceable layout (label / state / last event), context-sensitive DOUBLE_CLICK (banner-ack → cycle-session → home; narrowed from three-tap spec after empirical hardware proof, single-tap + long-press deferred to SEED-011). Hand-rolled fetch + ReadableStream + TextDecoder SSE shim (~150 LOC, full control over backoff + Last-Event-ID + bearer hygiene).
- **Quiet mode + plugin v0.3.0 ship** (Phase 125) — `users.quiet_mode` column gates SSE fan-out; PWA toggle UI; G2-POLISH-05/06/07/08 polish riders folded in; `vigil.ehpk` v0.3.0 packed at 30564 bytes + resubmitted to Even Hub; 60s portfolio demo recorded.
- **Wide-release auth hardening** (Phase 126, mid-milestone insert) — Cloudflare Turnstile + per-IP rate-limit (5/hr) on `POST /auth/register` + email-verify gate on `/v1/*` (with 24h grace) + Sentry sink (server + PWA) + locked-enum `ERROR_CODE_MAP` killing the "Invalid email or password" collapse class + Termly privacy/terms pages + Anthropic $500/mo spend cap + `VIGIL_ALLOWED_EMAILS="*"` sentinel kill-switch. SECURITY 46/46 threats closed; UAT 8 passed / 0 issues.

### What Worked

- **Day-1 empirical verification gate before production code** — Phase 120 mined 184 corpus JSONL files + ran a scripted Claude Code VS Code session BEFORE any vigil-watch parsing code. Verdict `spec-correct-and-proceed` came back binary; the planned fallback paths (notification observation / VS Code extension / process inspection) stayed untouched. Removed a load-bearing assumption risk on day 1 for one day of work.
- **Per-phase ROADMAP-locked detection rules** — Phase 120 D-01..D-10 + Phase 122 detection rules were pinned in CONTEXT before any test was authored. Phase 122 unit tests (NSRegularExpression milestone matcher, per-session timer state machine, EmitterActor backoff schedule, parser drift detector) were drift detectors against the ROADMAP-locked rules — not duplications of the implementation.
- **Mid-milestone insert pattern (Phase 126)** — A 2026-05-11 family-signup error triage exposed hard blockers to wide-release. Rather than punt to v3.9 and ship v3.8 in "family-allowlist" mode, the insert closed the gaps in a single phase (11 plans, 5 waves) and shipped same-day. The roadmap absorbed the insert without re-shaping prior phases.
- **Hardware-truth-first capability narrowing** — Phase 124 D-08 narrowed the three-tap spec (single/double/long) to "context-sensitive DOUBLE_CLICK overload" after live G2 hardware testing showed CLICK_EVENT + LONG_PRESS_EVENT aren't reliably plumbed. SEED-011 preserves the deferred variants. Pattern: don't ship a promise the hardware can't honor.
- **Risk-accept + plist-pin pattern for operator gates** — Phase 123 SC #3 (post-reboot resume) needed a Mac reboot. Operator declined reboot for verification only. Closure: risk-accepted with RunAtLoad+KeepAlive `<true/>` grep-pinned in installed plist + PlistTemplateTests drift-detecting both keys against the source template. Lets a milestone close cleanly without forcing wallclock physical actions.

### What Was Inefficient

- **R-123-01 `RunLoop.main.run()` daemon-exit regression** — Phase 123 Plan 03 lifted `RunLoop.main.run()` verbatim from Phase 122's `main.swift` into `func run() async throws`. `AsyncParsableCommand` executes on the cooperative pool, not the main thread, so `RunLoop.main.run()` returns immediately — daemon exited clean (exit 0), launchd KeepAlive cycled spawn-scheduled indefinitely, sampler CSV stopped after ~35 min. RunSubcommandTests instantiated `Run` and called `.parse([...])` but never `.run()` (which would block forever), so the regression was invisible to in-process tests. Lost ~6h of soak window. Coverage gap: spawn `.build/release/vigil-watch run` as `Process()`, sleep 5s, assert `Process.isRunning == true`. Pattern queued for follow-up phase.
- **vigil-watch silent-but-running bug** — Daemon passed liveness checks (RSS, uptime, PID stability) for 28h+ while emitting zero events. FSEvent pipeline silently died at bootstrap exit due to (a) Swift release-mode lifetime collapse of FSEventStream local + (b) UnsafeBitCast UB in FSEventBridge. Pattern: liveness is not functionality. Phase 123 Plan 05's operator runbook was extended with step 4.5 + 6.5 (synthetic JSONL append + 10s event-emission probe) BEFORE and AFTER the 24h window to catch this class of regression in future soaks.
- **STATE.md `stopped_at` drift** — `stopped_at` field said "Mid-execute 126-06 — no commit yet, no 126-06-SUMMARY.md" long after Plan 126-06 shipped and 126-SUMMARY existed. STATE.md frontmatter doesn't auto-update on commit; needs explicit touch at plan-close. Surfaced during /gsd-progress integrity audit; corrected at milestone close.
- **Audit-uat staleness** — The 24h soak passed on 2026-05-10, but `123-VERIFICATION.md` carried `status: human_needed` and the operator todo stayed in `pending/` for ~24h until back-fill on 2026-05-11. `audit-uat` and `gsd-progress` correctly surfaced this as verification debt, but the gap was operator-driven (no auto-detection of "soak window has data, run gate, update verification"). Could be automated with a routine that polls `~/Library/Logs/Vigil/soak-$(date).csv` size + age and fires `soak-check.sh` once a full 24h CSV exists.

### Patterns Established

- **Day-1 verification gate** — when downstream phases assume an external system's contract, verify-first as Phase 0. Empirical proof drives a binary `spec-correct-and-proceed` vs `select-fallback-path` decision before any dependent code lands.
- **Operator-driven wallclock checkpoints exempt from `skip_checkpoints: true`** — `mode: yolo` auto-skips confirmation gates only; checkpoints whose payload requires real-world wallclock time (24h soak, Mac reboot, dashboard action) stay as pending operator todos. Phase 123 soak + Phase 126 spend cap both used this pattern.
- **Liveness ≠ functionality probe** — soak/longevity checks (RSS, uptime, PID stability) must be paired with end-to-end functional probes (synthetic input → expected output within Ns) at soak start AND soak end. RSS-only-passes is a load-bearing gap pattern.
- **`withCheckedContinuation` for top-level Swift daemon lifetime in AsyncParsableCommand** — `RunLoop.main.run()` is a no-op off the main thread. Use `await withCheckedContinuation { _ in }` to suspend the Task forever; signal handlers + FSEvents run on independent queues.
- **Hand-roll over polyfill when runtime is constrained** — G2 plugin runtime lacks `EventSource`; hand-rolling fetch + ReadableStream + TextDecoder (~150 LOC, 13 unit tests) was better than vendoring a ~10KB polyfill for full control over backoff + bearer hygiene + Last-Event-ID + keepalive handling.
- **Hardware-truth-first capability narrowing** — when live hardware testing diverges from the SDK's documented capability surface, narrow the milestone promise to what the hardware actually honors and create a SEED-* for the deferred variants.
- **Mid-milestone insert for shipping-blocker phases** — when a real-world signal proves a hard blocker for "the next thing the milestone unlocks," fold it in instead of deferring.
- **Locked-enum API error UX mapping** — server attaches `code: "INVALID_TOKEN_SUBJECT"` etc on every 4xx/5xx; PWA renders specific copy via a frozen lookup table. Adding a new error path requires only a server `code` + PWA table entry. Kills the "Invalid email or password" collapse class structurally.
- **Risk-accepted closure for physical-host-bound SC items** — when an operator declines a physical action (e.g., Mac reboot) and the underlying behavior is OS-guaranteed + grep-pinned in installed config + drift-detected in tests, mark `deferred / risk-accepted` rather than blocking milestone close.

### Key Lessons

- **Drift detectors are worth their weight 10x over** — Phase 122-126 added drift detectors at every layer (Package.swift pin, plist template, milestone matcher source-line regex, rate-limit constant, locked enum keys). Saved a day-of debugging during Phase 123's R-123-01 regression because structural drift was still caught even when runtime regressions were invisible.
- **The audit-uat output is the milestone-close compass** — `gsd-sdk query audit-uat` returning `total_items: 0` is the actual gate for "the milestone is verifiably done." Use it before `/gsd-complete-milestone`, not after. Today's session caught the stale Phase 123 verification debt before close — turned a closure-time scramble into a controlled back-fill.
- **Operator todos with verbatim runbooks are commit-grade artifacts** — Phase 123 Plan 05's 114-line operator todo file (8-step procedure + closeout flow + failure-path decision tree + back-fill template) was the canonical record. When the operator ran the gate 2 days later, every step was reproducible from the file alone.
- **`/gsd-progress` integrity audit catches what surface progress hides** — the standard report said "Phase 126 SHIPPED, verification debt 1 file." The deeper read on the verification debt revealed the back-fill was 95% there — soak CSV + script were both already on disk. Surface progress reports are not the same as truth-state audits.

### Cost Observations

- **Model mix:** ~70% sonnet (autonomous-plan execution), ~25% opus (planning + verification + close-out), ~5% haiku (CLI scripts)
- **Sessions:** ~25 across 5 days; biggest single session was Phase 122 (10 plans, ~2h)
- **Notable:** Wave-based parallel execution in Phase 122 (3 waves) and Phase 124 (4 waves) compressed wall-clock time but didn't reduce token spend — each plan still ran serially under its agent. Real efficiency came from yolo-mode autonomous execution where viable; checkpoints only at human-decision boundaries.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Timeline | Phases | Key Change |
|-----------|----------|--------|------------|
| v3.2 | ~2 days | 8 | Shared utility pattern; cache-first hooks; lazy archive |
| v3.4 | ~24h | 4 | Wave-0 TDD scaffolds; decision-ID grep guards; runbook-first deploy |
| v3.5 | ~4 active days + 13d paused | 8 | Pre-staged hardware-UAT runbook; evenhub-simulator screenshot path; per-phase SECURITY.md selectivity |
| v3.7 | ~9 active days | 6 | Operator-amendment closure pattern; two-artifact ops audit; picker UI pattern reuse across phases |

### Top Lessons (Verified Across Milestones)

1. Pure utility modules with zero deps and injectable params maximize reuse and testability
2. Server-side data ownership simplifies clients — move computation to the API, not the browser
3. Fix commits should reference REQ-IDs for audit traceability
4. Wave-0 test scaffolds (fail-by-default via real imports) front-load the bug surface before production code is written
5. Decision IDs become cheap regression tests when the invariant is grep-enforceable
6. Normalize at all read sites, not just write sites — test fixtures must mirror production normalization exactly
7. Operator amendments beat forced execution when a gate is structurally unsatisfiable at current scale (v3.7) — preserves the runbook + re-arm path
8. Pre-staged runbooks for external-delivery gates (hardware, gates, third-party) (v3.5 + v3.7) — every minute pre-staged pays back 10× during execution
9. Picker UI patterns generalize across phases (v3.7) — optimistic toggle + debounced PUT + lastSavedRef rollback is one shape that fits all toggle persistence
