---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: Multi-User Completion, Auth UX & Safari Parity
status: executing
stopped_at: Completed 114-03-PLAN.md (verbatim Chrome → Safari port of popup.js)
last_updated: "2026-04-26T16:21:57.040Z"
last_activity: 2026-04-26
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 22
  completed_plans: 21
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 114 — safari-extension-quick-capture-parity

## Current Position

Phase: 114 (safari-extension-quick-capture-parity) — EXECUTING
Plan: 5 of 5
Status: Ready to execute
Last activity: 2026-04-26

```
Phase 108 [          ] 0%   work_order_statuses userId Scoping + Isolation Test
Phase 109 [          ] 0%   Per-User Scheduler Fan-Out
Phase 110 [          ] 0%   Change Password + password_changed_at Gate
Phase 111 [          ] 0%   Transactional Email Infrastructure (Resend + DNS)
Phase 112 [          ] 0%   Forgot-Password Email Flow
Phase 113 [          ] 0%   Verify Email on Signup
Phase 114 [          ] 0%   Safari Extension Quick-Capture Parity

v3.6 overall [          ] 0/7 phases complete
```

## Performance Metrics

**Velocity:**

- Total plans completed: ~211 (through v3.4) + 34 (v3.5 not-yet-shipped) = ~245
- Total execution time: ~18 days
- Average duration: ~5 min per plan

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0–v3.4 | 1-102 | ~211 | ~18 days |
| v3.5 | 103-107 (+107.1/107.2/107.3) | 34 | paused pre-ship (G2 hardware UAT) |
| v3.6 | 108-114 | TBD | In progress (started 2026-04-22) |
| Phase 108 P01 | 25 | 4 tasks | 5 files |
| Phase 108 P02 | 4 | 3 tasks | 4 files |
| Phase 108 P03 | 12 | 1 tasks | 1 files |
| Phase 109 P01 | 12min | 3 tasks | 2 files |
| Phase 109 P02 | 18min | 2 tasks | 2 files |
| Phase 109 P3 | 11min | 4 tasks | 8 files |
| Phase 110 P01 | 5min | 3 tasks | 5 files |
| Phase 110 P02 | 13min | 3 tasks | 7 files |
| Phase 110 P03 | 5min | 2 tasks | 3 files |
| Phase 112 P03 | 9min | 3 tasks | 3 files |
| Phase 112 P04 | 7 | 4 tasks | 7 files |
| Phase 113 P01 | 8min | 4 tasks | 3 files |
| Phase 113 P02 | 7min | 3 tasks | 5 files |
| Phase 113 P03 | 499 | 3 tasks | 5 files |
| Phase 113 P04 | 704 | 3 tasks | 6 files |
| Phase 113 P05 | 7min | 2 tasks | 3 files |
| Phase 114 P00 | 4min | 3 tasks | 5 files |
| Phase 114 P01 | 8min | 3 tasks | 2 files |
| Phase 114 P02 | 2min | 2 tasks | 2 files |
| Phase 114 P03 | 2min | 1 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- Phase 107.1 inserted after Phase 107: local dev environment with Postgres and hot-reload stack (URGENT)
- Phase 107.2 inserted after Phase 107: cross-machine Tailscale dev access with secure bind and CORS (URGENT)
- Phase 107.3 inserted after Phase 107 (2026-04-22): prod bind default + install.sh silent-fail + doctor stale-drift cleanup — three paper-cuts surfaced during fresh MacBook Pro bootstrap; 107.2 prod bind caused live api.vigilhub.io 502 outage, fixed via Railway `VIGIL_BIND_HOST=0.0.0.0` env var
- v3.5 paused 2026-04-22 at 34/34 plans complete, waiting on G2 physical hardware UAT (device delivery unknown). v3.6 started same day with multi-user debt + auth UX + Safari parity.
- v3.6 roadmap created 2026-04-23: 7 phases (108-114), 8 requirements fully mapped. W-01 + W-02 merged into Phase 108 (W-02 is a single test addition in the same isolation test file). Phase ordering respects EMAIL-01 → AUTH-10 → AUTH-11 dependency chain and ensures password_changed_at gate (AUTH-09 / Phase 110) exists before AUTH-10 / Phase 112 can update it.

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

**v3.5 key decisions (retained for reference — v3.5 pre-ship):**

- PostHog: separate API keys per environment; all `capture()` via `trackEvent()` wrapper with null-guard; property allowlist (enums/booleans/numbers); `shutdown()` on SIGTERM/SIGINT
- JWT storage: sessionStorage (not localStorage) — XSS tradeoff acceptable for single-user private app
- AUTH-06 login error: single generic message for all 4xx — no user enumeration
- G2 resubmit: all three items (G2-01/02/03) gated together — no partial submission
- Phase 107.3 bind detection: `RAILWAY_SERVICE_ID` presence check (not `NODE_ENV`, not nonexistent `RAILWAY_ENVIRONMENT`); Phase 107.2 security bias (127.0.0.1 default) preserved for non-Railway envs

**v3.6 key decisions (roadmap phase):**

- W-01 + W-02 merged into Phase 108: W-02 is a single it() block in cross-user-isolation.test.ts; it belongs in the same phase as W-01 because both live in the same test file and W-01's migration is the prerequisite for W-02's test to be meaningful
- SCHED-01 stays as standalone Phase 109 (not merged with W-01): scheduler refactor touches generate-scheduler.ts + prioritize.ts + their test files — enough scope to warrant its own phase
- AUTH-09 is Phase 110, not Phase 108: no hard dependency on multi-user scoping; Wave 1 parallelizable; assigned own phase because password_changed_at gate is a cross-cutting security foundation that Phase 112 (AUTH-10) depends on
- EMAIL-01 is Phase 111: DNS propagation is non-deterministic; isolating it as a standalone phase lets DNS work start and propagate while Phases 108-110 execute
- AUTH-10 and AUTH-11 are separate phases (112, 113): blast radius containment; AUTH-11 reuses password_reset_tokens (type column) created in AUTH-10's migration — sequential ordering is required
- EXT-02 is Phase 114 (last): fully independent of server/PWA work; scheduled last as a clean cap to the milestone; can be executed on MacBook Pro in parallel with any server phase if desired
- [Phase 108]: Hand-added 0014 to _journal.json: drizzle migrator requires SQL files to be in journal; hand-written migrations bypass drizzle-kit generate which normally auto-updates it
- [Phase 108]: seed-work-order-statuses.ts fixed to look up seed user by email and include userId in inserts — required by NOT NULL constraint added in Plan 01
- [Phase 108]: W-02: used date 2099-12-28 (D-13), single 404-only scenario (D-14), briefPdfs lazily imported inside it() body matching aiCache pattern
- [Phase 109]: Plan 01: scheduler fan-out removes seedUserId hard-scope; default getAllUsersFn closes over deps.db; per-user try/catch uses continue (never return); SCH-09 regression guards SC#1/SC#2/SC#4
- [Phase 109]: Plan 02: /prioritize cache filename scoped to userId (wo-priority-${userId}-${today}-${hash}.json); getCacheKey userId-first positional; no runtime 401 guard (D-09 — global bearerAuth dispatcher) and no startup sweep of pre-migration files (D-10)
- [Phase 109]: Plan 03: calendar-service userId-required + atomic two-site wiring (9054a5d); first time calendar events reach brief PDF from either path — D-11 makes fetchTodaysEvents/fetchCalendarList require userId (TypeScript build is the forcing function); D-12 commits index.ts + routes/brief-generate.ts wiring atomically; D-13 rewrites TODO(AUTH-06+) in-place (dropped in calendar-service, retained + DEFERRED marker in gmail-workorder-service). Human-verify Path B confirmed graceful degradation: HTTP 200, 19KB PDF, no "No calendar service" log, no stack traces. Path A deferred to post-v3.6 production smoke-test (no local OAuth row on fresh 107.1 dev DB).
- [Phase 110]: Plan 01: D-03 backfill pinned — password_changed_at = created_at EXACTLY (verified via COUNT(*) WHERE != created_at = 0); zero existing JWTs invalidated by deploy
- [Phase 110]: Plan 01: drizzle-kit 0015 SQL draft discarded (re-embedded Phase 108 migration due to missing 0014_snapshot); hand-authored 3-statement 5-step template per D-02
- [Phase 110]: Plan 01: Rule 3 auto-fix bumped 0015 when=1777267200000 to exceed Phase 108 0014 when=1777180800000 — drizzle-kit migrate orders by when not idx, silently skips out-of-order entries
- [Phase 110]: Plan 01: Rule 3 auto-fix repaired 0013_snapshot.json duplicate id (Phase 107.1 drift) with fresh UUID; prevId repointed to actual 0012 id — unblocked drizzle-kit generate
- [Phase 110]: Plan 02: CONTEXT §specifics line 135 wording bug reconciled in CP-GATE-02 — strict-less-than gate means iat == floor(passwordChangedAt/1000) PASSES; test description + comment pin actual live-code semantics
- [Phase 110]: Plan 02: CP-GATE-04 reframed as 'vk_ unaffected by gate REJECTION' (passwordChangedAt 1y future still 200); 'no DB read on Path 1' claim anchored in code (gate SELECT inside if looksLikeJwt block), not provable by test
- [Phase 110]: Plan 02: Rule 3 cascade — Plan 01 NOT NULL column forced 4-site passwordChangedAt fix (register insert, claim-flow update, isolation-test seeds A+B, middleware happy-path test). Claim-flow now bumps passwordChangedAt + updatedAt defensively
- [Phase 110]: Plan 02: D-14 ordering (await db.update BEFORE await signToken) pinned by CP-CHG-06 — asserts iat >= floor(passwordChangedAt/1000) plus follow-up authenticated request that would 401 if reordered
- [Phase 110]: Plan 03: D-17 ordering preserved — storeKey(body.token) executes BEFORE any setState or setTimeout; React setState does not fire fetches so execution order is sufficient. Inline comment pins CONTEXT 'vigil_token' typo vs live-code 'vigil_jwt' via storeKey() (api/client.ts:1).
- [Phase 110]: Plan 03: D-19 body discriminator (not path filter) — any 401 with { error: 'Session expired' } triggers signOut+navigate; 'Invalid credentials' from change-password's wrong-current 401 passes through unchanged. res.clone() keeps caller's body consumable.
- [Phase 110]: Plan 03: Emoji eye-icon toggles (👁/🙈) used instead of adding lucide-react/react-icons dep — zero-dep, aria-label accessible. D-16 'no confirm-password field' satisfied by show/hide toggle.
- [Phase 110]: Plan 03: Pre-existing SettingsPage.test.tsx:104 WR-03 assertion failure (unrelated — asserts raw 'invalid_state' code but WR-03 allowlist maps to friendly text) logged to deferred-items.md. Not caused by this plan — confirmed via git stash + test on prior commit.
- [Phase 112]: Plan 03: D-11 ordering pinned via Drizzle Proxy mock-DB pattern (counts update() calls; #1→real DB, #2→throws synchronously). Cleaner than manual fluent-object mock; Reflect.get propagates select/insert/delete unchanged.
- [Phase 112]: Plan 03: Retry-After header floors at 1s — Math.max(1, Math.ceil(...)) so the header never returns 0 even at the bucket boundary (some HTTP clients treat 0 as retry-immediately or skip).
- [Phase 112]: Plan 03: Test-runner post-suite hang carries forward from Plan 02 — postgres-js connection pool keeps tsx alive after the suite reports green; force-kill needed. All 12 ✔ marks render; no test failures.
- [Phase 112]: Plan 04: ResetPasswordPage uses useMemo(searchParams.get('token')) at mount with NO useEffect — D-18 form-submit gate enforced at code level, not just behavior. 'does NOT call fetch on mount' test pins it for regression detection.
- [Phase 112]: Plan 04: Mirrored existing AuthPage.test.tsx Object.defineProperty(window,'location') pattern for the new password_reset banner test — file consistency over Phase 110 anti-pattern flag. Replacing all session_expired tests is out of scope.
- [Phase 112]: Plan 04: Added describe block 'Forgot password link (AUTH-10 D-14)' with 2 visibility tests (login mode shows, signup hides) beyond the plan's behavior block — D-14 visibility rule pinned at test level for cheap regression insurance.
- [Phase 113]: 0017 migration when=1777440000000 (> 0016's 1777353600000): drizzle-kit orders by when not idx; monotonic invariant enforced via node -e check
- [Phase 113]: emailVerifiedAt nullable (no .notNull(), no default): NULL is the unverified sentinel; 0017 backfill sets all 117 pre-existing users to created_at (SC#4 grandfathering)
- [Phase 113]: issueEmailVerifyToken() kept inline in auth.ts (not extracted to shared tokenIssue.ts): only 2 call sites in this plan; extraction deferred until Plan 03 adds a 3rd site
- [Phase 113]: .catch() fire-and-forget used (not queueMicrotask): consistent with Phase 112 forgot-password.ts:221-223; RESEARCH Open Q1 confirmed this choice
- [Phase 113]: auth-me.ts created as separate file (not extending me.ts): incompatible response shapes at incompatible paths; App.tsx PostHog identify preserved
- [Phase 113]: tokenIssue.ts NOT extracted: 3 call sites across 2 files — deferred per CONTEXT Claude's Discretion; inline duplication is 4 lines
- [Phase 113]: verifyEmail mount BEFORE bearerAuth dispatcher (ve=128 < disp=143); resendVerification AFTER (rv=200 > disp=143) — awk ORDER OK confirmed
- [Phase 113]: vi.hoisted() required for vitest mock factories that reference external spy variables — plain const declarations cause ReferenceError when hoisted
- [Phase 113]: setTimeout spy capture pattern (not vi.useFakeTimers) for 10s Resend timer test — fake timers intercept waitFor internals and deadlock; spy callback capture avoids the issue
- [Phase 113]: Cleanup DELETE in finally block for idempotent smoke re-runs: insertedTokenId scoped outside try so orphan rows never accumulate on ECONNREFUSED or mid-run failures
- [Phase 114]: [Phase 114]: Plan 00: verify-phase-114.sh encodes D-15 (codesign --verify --deep --strict) + D-16 (xcodebuild clean build) with negative grep guard preventing spctl --assess re-introduction; --static / --runtime / --full mode dispatcher mirrors verify-phase-107.sh shape
- [Phase 114]: [Phase 114]: Plan 00: D-02 lockstep header lands at line 2 in popup.html (after DOCTYPE — Pitfall 6 quirks-mode mitigation) and popup.js (after 'use strict';); line 1 in popup.css; Plans 02/03 mirror with reversed ../../../ relative path
- [Phase 114]: [Phase 114]: Plan 00: 114-HUMAN-UAT.md replaces 113's deploy/deploy_time frontmatter fields with rebuild_sha/rebuild_time (local extension rebuild, not Railway); ship-with-uat-pending status (D-12); SC#3 row populated by Plan 01 SUMMARY, SC#5 row attested post-Plan-04 rebuild
- [Phase 114]: Plan 01: D-04 PASS — Safari WebKit fires metaKey:true on popup keydown for Cmd+Enter (verbatim console: code:Enter, ctrlKey:false, key:Enter, metaKey:true). Probe added (9f4f475) and reverted (559c010); net-zero diff. Plans 02/03/04 unblocked.
- [Phase 114]: Plan 02: D-11 byte-for-byte CSS parity verified via diff (lines 161-196 empty diff between Chrome popup.css and Safari popup.css); D-02 header at line 2 of popup.html (DOCTYPE preserved as line 1 — Pitfall 6); D-07 enforced — no checked attribute on include-url
- [Phase 114]: Plan 03: Verbatim Chrome → Safari port of popup.js — 6 edits applied atomically (D-02 header line 2, DOM refs +successText/+includeUrlCheckbox, URL pre-fill removed and replaced with empty-init+focus+Cmd+Enter handler, URL-append with verbatim D-06 format on submit, finalContent in POST body, triage poll loop replacing static setTimeout). 166→205 newlines matches Chrome popup.js exactly. node --check SYNTAX OK. verify-phase-114.sh --static all 5 gates PASS. Plan acceptance grep 'cat.charAt(0).toUpperCase()' is defective (variable is updated.category, not cat) — verbatim Chrome behavior preserved at line 171.

### Pending Todos

None — ready to plan Phase 108.

### Blockers/Concerns

**Carried into v3.6 (still-blocked from prior milestones):**

- ServiceNow API token still blocks Phase 80 (from v3.1)
- Phase 85 (iOS Shortcut) held — Shortcuts.app bugs
- G2 physical hardware retest pending device delivery (unknown date) — blocks v3.5 ship, NOT v3.6 execution
- Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated; blocks any plan needing to run live migrations against a freshly-set-up local dev DB

**Active for v3.6:**

- DNS propagation for vigilhub.io DKIM/SPF/DMARC (Phase 111) is variable — start DNS config early, do not block Phase 112 planning on propagation completion
- Safari Cmd+Enter keyboard priority: must be empirically tested as step 1 of Phase 114 before any implementation — if swallowed, fallback UX must be designed upfront
- Pre-existing npm test suite hang in vigil-core: src/integration/cross-user-isolation.test.ts imports ../index.js which spawns generate-scheduler (60s) + gmail-workorders (5m) setInterval loops at module load, keeping the tsx child process alive after the final assertion. Individual test files run fine via npx tsx --test <file>. Fix candidate: gate scheduler start-up in index.ts on NODE_ENV !== test, or split into buildApp() + bootstrap entrypoint.

### Memory drift flagged

- `reference_macbook_pro.md` still says 'vigilcore unloaded by design'; as of 2026-04-21 Plan 107.1-04 retired the daemon on BOTH machines (MacBook Pro was actually running, PID 740). Preserved plist in 107.1-daemon-retirement.md.

## Session Continuity

Last session: 2026-04-26T16:21:47.754Z
Stopped at: Completed 114-03-PLAN.md (verbatim Chrome → Safari port of popup.js)
Resume file: None
Next action: /gsd-plan-phase 108
