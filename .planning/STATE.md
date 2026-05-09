---
gsd_state_version: 1.0
milestone: v3.8
milestone_name: Claude Code Companion
status: executing
stopped_at: Phase 123 Plan 01 complete
last_updated: "2026-05-09T18:36:27Z"
last_activity: 2026-05-09 -- Phase 123 Plan 01 complete (CLI scaffold + swift-argument-parser)
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 23
  completed_plans: 19
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06 — v3.8 milestone started)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 123 — vigil-watch-shell-launchd-integration-cli-surface-24h-soak

## Current Position

Phase: 123 (vigil-watch-shell-launchd-integration-cli-surface-24h-soak) — EXECUTING
Plan: 2 of 5 (Plan 01 complete; Plan 02 next — Wave 1 also includes Plan 02 in parallel)
Status: Executing Phase 123
Last activity: 2026-05-09 -- Phase 123 Plan 01 complete (CLI scaffold + swift-argument-parser)

Progress: [████████▌░] 83%

## v3.8 Phase Table

| Phase | Goal | Requirements | UI |
|-------|------|--------------|----|
| 120. Day-1 JSONL schema verification + detection-strategy lock | Confirm assumed JSONL schema vs reality before any production-mapping code; select fallback path if needed | VERIFY-01 | no |
| 121. Agent-events API foundation + cross-user isolation lock | POST /v1/agent-events + GET /v1/agent-sessions with W-01/W-02-style isolation test | AGENT-API-01, AGENT-API-02 | no |
| 122. vigil-watch core (watcher + parser + emitter + config) | FSEvents watcher, JSONL parser with persisted offsets, retry/backoff emitter, watch.toml config | AGENT-WATCH-01, 02, 03, 06 | no |
| 123. vigil-watch shell — launchd + CLI surface + 24h soak | install/uninstall/run/tail/test/status subcommands + 24h unattended run < 30MB RSS | AGENT-WATCH-04, 05, 07 | no |
| 124. G2 Companion HUD + WebSocket fan-out + launch-source/home-overflow polish | 3-line HUD with tap interactions + agent-event WebSocket fan-out + G2-POLISH-06/07 ride-alongs | AGENT-API-03, AGENT-HUD-01, 02, G2-POLISH-06, 07 | yes |
| 125. Quiet mode + remaining polish riders + plugin v0.3.0 ship + portfolio demo | DND honored on HUD + swipe-out-of-list + device-status debounce + vigil.ehpk v0.3.0 to Even Hub + 60s demo | AGENT-HUD-03, G2-POLISH-05, 08, G2-PLUGIN-01, AGENT-DEMO-01 | yes |

## Performance Metrics

**Velocity:**

- Total plans completed: ~272 through v3.7 (19 milestones, ~21 days)

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0–v3.4 | 1-102 | ~211 | ~18 days |
| v3.5 | 103-107 (+107.1/107.2/107.3) | 33 | shipped 2026-05-05 |
| v3.6 | 108-114 | 27 | shipped 2026-04-26 |
| v3.7 | 115-119 (+116.1) | 22 | shipped 2026-05-06 |
| v3.8 | 120-125 | TBD | started 2026-05-06, roadmap 2026-05-06 |
| Phase 122 P01 | 15min | 3 tasks | 4 files |
| Phase 122 P04 | 4min | 3 tasks | 3 files |
| Phase 122 P05 | 8min | 2 tasks | 2 files |
| Phase 122 P06 | 3min | 2 tasks | 3 files |
| Phase 122 P07 | 8min | 2 tasks | 2 files |
| Phase 122 P08 | 8min | 3 tasks | 3 files |
| Phase 122 P09 | 5min | 5 tasks (of 6; 9.6 pending) | 5 files |
| Phase 123 P01 | 5min | 2 tasks | 10 files (8 created, 1 modified, 1 deleted) |

## Deferred Items

Carried forward from v3.7 milestone close (2026-05-06):

| Category | Item | Status | Note |
|----------|------|--------|------|
| seed | SEED-003-tighten-dmarc-to-quarantine | dormant | `p=none` accepted as steady-state DMARC posture; routine `trig_01RZLcj1jpxvDQAwnFmUG9d9` preserved with three documented re-activation conditions |
| seed | SEED-005-g2-swipe-out-of-list-broken-on-hardware | active in v3.8 | Folded into v3.8 Phase 125 as G2-POLISH-05 |
| seed | SEED-006-g2-glasses-menu-launch-source-handling | active in v3.8 | Folded into v3.8 Phase 124 as G2-POLISH-06 (co-located with HUD entry-point wiring) |
| seed | SEED-007-g2-home-body-overflow-210px | active in v3.8 | Folded into v3.8 Phase 124 as G2-POLISH-07 (co-located with HUD layout work) |
| seed | SEED-008-g2-device-status-event-spam-debounce | active in v3.8 | Folded into v3.8 Phase 125 as G2-POLISH-08 |
| seed | SEED-009-g2-local-storage-last-viewed-screen | dormant | → v3.9 candidate |
| seed | SEED-010-g2-voice-capture-via-audio-pcm | dormant | → v3.9 milestone-anchor candidate |
| ops_followup | Rotate Railway Postgres password | pending | `.planning/todos/pending/2026-05-01-rotate-railway-postgres-password.md` — defense-in-depth |
| uat | Phase 116 / 116.1 (HUMAN-UAT.md) | partial | Sports picker shipped to prod and in daily use since 2026-04-29 |
| verification | Phase 116 / 116.1 (VERIFICATION.md) | human_needed | Functional verification implicit via prod usage |

## Accumulated Context

### Roadmap Evolution

- v3.7 closed 2026-05-06 — Phase 119 DMARC ramp redirected to deferral via operator amendment after auto-eval routine returned DEFERRED on 0/3 conditions; `p=none` accepted as steady-state DMARC posture
- v3.8 started 2026-05-06 — anchor: `vigil-watch` macOS daemon + agent-events API + G2 Companion HUD with 4 G2 polish riders folded in
- v3.8 ROADMAP.md landed 2026-05-06 — 6 phases (120-125), 20/20 requirements mapped (1 verification gate, 2 server, 4 daemon-core, 3 daemon-shell, 5 HUD+WS+polish, 5 ship+polish+demo)
- Phase 120 is a load-bearing verification gate — three documented fallback paths (notification observation / VS Code extension / process inspection) if JSONL schema diverges from spec assumption; downstream Phase 122/123 goals shift accordingly if a fallback is selected

### Decisions

All decisions logged in PROJECT.md Key Decisions table. Phase-specific decisions logged in their respective `phases/<N>/<N>-CONTEXT.md` files (preserved in archive `.planning/milestones/v3.7-phases/` after v3.7 close).

Recent (v3.8 in-flight):

- [Phase 122 / Plan 00]: Sources/VigilWatch/VigilWatch.swift placeholder enum required — SPM build fails if a target directory contains only non-Swift files
- [Phase 122 / Plan 00]: non_spec_lines.jsonl built from head -1 of 7 non-spec-type source excerpts; exactly 7 lines representing all known skip-type JSONL line types
- [Phase 122 / Plan 00]: Zero external dependencies in Package.swift confirmed; swift-argument-parser deferred to Plan 09/Phase 123 per CONTEXT.md

- [Phase 121 / Plan 01]: drizzle-kit auto-generated SQL replaced entirely — auto-diff included previously applied migrations (0016 + 0017) due to snapshot state; hand-crafted SQL per plan spec is the correct approach
- [Phase 121 / Plan 01]: Partial unique index composite scope (user_id, client_event_id) is load-bearing for cross-user dedup isolation — single-column would silently cross-contaminate users (D-D2 block 3)
- [Phase 121 / Plan 02]: DISTINCT ON via db.execute(sql...) raw query — drizzle-orm@0.45.2 has no first-class DISTINCT ON helper; CTE query composes with composite index from Plan 01
- [Phase 121 / Plan 02]: { error, message } two-field error shape adopted — new Phase 121 convention; agent-events.ts is the canonical reference going forward
- [Phase 121 / Plan 03]: T12 mass-assignment test asserts both 400 status AND captured===null — both conditions required to fully lock the defense (status alone wouldn't verify dep was never called)
- [Phase 121 / Plan 03]: Drift-detector pair (DRIFT/T1 + DRIFT/T2) locks 5 event values in source TS AND migration SQL — one test per file; DRIFT/T2 also locks the partial unique index predicate (D-D2 block 3)
- [Phase 121 / Plan 04]: Block 1 asserts both 400 status (KNOWN_FIELDS guard) AND DB cross-check (no userB row) — two-layer regression detection; if guard drops but route-level fix holds, only first assertion fails
- [Phase 121 / Plan 04]: Block 2 uses direct DB insert for userB's seed — pins GET-side filtering independently of POST-side guards (cross-contamination of correctness proofs avoided)
- [Phase 121 / Plan 04]: Block 3 shared client_event_id is the only test that can detect regression from composite partial unique to single-column unique index
- [Phase 121 / Plan 02]: agentEvents$Route internal name + re-export as agentEvents — avoids collision with schema import, matches index.ts app.route() mount pattern
- [Phase 121 / Plan 01]: Plans 02/03/04 should adopt manual typeof validation (not zod) — zod is not installed in vigil-core; Pattern Map discrepancy #2 confirms this
- [Phase 121 / Plan 05]: Drizzle onConflictDoNothing with partial unique index requires WHERE predicate — PostgreSQL 42P10 without it; fix: add `where: sql\`col IS NOT NULL\`` matching partial index predicate
- [Phase 121 / Plan 05]: TS 5.9 strict narrowing: assert.ok() on closure-assigned T|null variable → 'never'; fix: explicit cast `(x as T)` preserves semantics without runtime change
- [Phase 120 / Plan 01]: Verbatim section headers as a cross-plan contract — Plan 120.03's acceptance criteria reference exact strings (`# vigil-watch`, `## Day-1 JSONL Schema Verification`, `### Verdict`, etc.), so README structure was locked before content authoring begins
- [Phase 120 / Plan 01]: Secret-hygiene `.gitignore` block committed BEFORE any verification log can be written — `/verification-log/` rule preempts T-120-01 (Plan 120.02 cannot accidentally land raw user JSONL on a public repo)
- [Phase 120 / Plan 01]: LICENSE seeded by GitHub with display-name-only `Copyright (c) 2026 Jameson Morrill` accepted as-is per threat-register T-120-02 disposition (matches vigil-core posture; no PII risk)

Recent (v3.7 closeout):

- [Phase 119]: Operator-amendment closure pattern for plans whose execution gate is structurally unsatisfiable at current product scale — alternative to forcing synthetic conditions or silently abandoning
- [Phase 117]: D-08 unified 429 + countdown copy locked verbatim across VerifyEmailPage / ResetPasswordPage / SettingsPage
- [Phase 117]: Drift-detector tests via fs.readFileSync + regex preferred over runtime-introspection for policy constants
- [Phase 116]: Discriminated-union API response types over throw-on-non-200 for endpoints with structured non-error states
- [Phase 116]: Optimistic toggle + lastSavedRef rollback contract pattern locked across calendar (115) and sports (116) pickers
- [Phase ?]: [Phase 122 / Plan 01]: D-01 known-vector pinned live — sha256(2072cbce-...|1024|needs_input|v1) → 39830cfa-218a-9bed-5804-49bd450dd210; XCTAssertEqual uncommented in HashIDTests
- [Phase ?]: [Phase 122 / Plan 01]: VigilWatch.swift placeholder dropped in separate chore commit — Plan 00 stub superseded by EventTypes.swift + HashID.swift
- [Phase ?]: [Phase 122 / Plan 01]: DriftDetectorTests uses XCTSkip (not XCTFail) when VIGIL_CORE_PATH absent — CI graceful skip, monorepo real fail on drift
- [Phase 122 / Plan 02]: Phase 120 level-shift corrections honored verbatim — tool_use/tool_result are inner $.message.content[].type discriminators, NOT top-level $.type values
- [Phase 122 / Plan 02]: is_error:true is the single-field discriminator for task_failed — no secondary type or subtype needed; toolResultErrors captures the tool_use_id
- [Phase 122 / Plan 02]: nil on JSON parse failure (offset NOT advanced) vs nonSpec on known skip type (offset IS advanced) — two distinct return semantics for caller
- [Phase 122 / Plan 03]: isArrayClosed() depth-tracking required — simple contains("]") breaks on regex character classes like [✓✔] inside quoted TOML array elements
- [Phase 122 / Plan 03]: defaultTOMLBody uses \\\\b in Swift source (→ \\b in file → \b after TOMLParser.unquote) — backslash round-trip verified by testFirstRunCreatesDefaultsAtTempPath
- [Phase 122 / Plan 03]: ConfigLoader.load(path:env:) injectable parameters — test isolation without ~/.config/ pollution or real VIGIL_API_KEY leaking into tests
- [Phase 122 / Plan 04]: HTTPClient protocol + DefaultHTTPClient adapter — testable URLSession abstraction; StubHTTPClient in tests returns scripted responses without any network I/O
- [Phase 122 / Plan 04]: sleepFn injected as (Duration) async throws -> Void — tests pass { _ in } to eliminate Task.sleep latency; all 15 EmitterTests run instantaneously
- [Phase 122 / Plan 04]: NDJSON double-emit — post_status=0 on enqueue, re-emit with actual HTTP status after postOnce(); tail consumers track event lifecycle end-to-end
- [Phase 122 / Plan 04]: Requeue at BACK on 6-attempt exhaustion — other events get a turn; prevents one stuck event from blocking queue (per CONTEXT.md "fresh attempt sweep")
- [Phase 122 / Plan 04]: T-122-01 closed by construction — maskBearer() applied to all stderr paths; apiKey only flows to Authorization header in postOnce(), never to log functions
- [Phase 122 / Plan 05]: Raw pattern stored in Compiled.raw (without (?i)) — dedupe key matches watch.toml and offsets.json; no encoding/decoding mismatch across restart
- [Phase 122 / Plan 05]: (?-prefix opt-out check via hasPrefix("(?") — preserves (?-i), (?s), (?m) and any future inline flag without parsing flag group syntax
- [Phase 122 / Plan 05]: scanForFirstTimeMatches returns [Compiled] not [Bool] — caller gets raw pattern for recordEmission and message field in one pass; no second lookup needed
- [Phase 122 / Plan 05]: T-122-03 closed by construction — bad patterns produce logWarn and are skipped; daemon continues with remaining valid patterns
- [Phase 122 / Plan 06]: MilestoneRecord.CodingKeys added (bug fix) — auto-synthesis produced camelCase; D-09 requires snake_case (first_match_offset, emitted_at)
- [Phase 122 / Plan 06]: F_FULLFSYNC error intentionally ignored — durability hardener not correctness gate; atomic rename guarantees consistency regardless
- [Phase 122 / Plan 06]: removeItem before moveItem — FileManager.moveItem raises NSError if target exists; pre-remove replicates rename(2) semantics
- [Phase 122 / Plan 06]: GC newest-record-drives-cutoff — session with one stale + one recent record is kept; session eviction only when ALL records are older than 24h
- [Phase 122]: Two-method SessionState API: process(line:) fires task_failed immediately; evaluate(now:config:) fires timer-based events (needs_input, task_complete, heartbeat) via 1Hz tick loop
- [Phase 122]: sessionHadError never resets within session (Pitfall 3): taskCompleteEmittedAt set even when suppressed by precedence to prevent re-evaluation on every 1Hz tick
- [Phase 122 / Plan 08]: useInMemoryPartial guard: anchorOffset = currentOffset - partial.count underflows when currentOffset=0 and partial>0 (first tick, no lines yet); guard prevents UInt64 underflow; disk re-read at offset 0 covers the partial bytes
- [Phase 122 / Plan 08]: FSEventBridge + WatcherActor separation: bridge owns C lifecycle (FSEventStreamRef, Unmanaged, DispatchQueue); actor owns read/parse/dispatch logic; no actor state in C callback
- [Phase 122 / Plan 08]: Non-spec lines dispatched to lineHandler: Plan 09 needs all line types for SessionState.latestLineTimestamp update; caller gates on lineType
- [Phase 122 / Plan 09]: resolvedHost captured at Daemon.init — EmitterActor.config is private; host constant for process lifetime avoids (await emitter).config anti-pattern
- [Phase 122 / Plan 09]: lineHandler calls session.process() for ALL line types (not just .user/.assistant) to update latestLineTimestamp for silence detection; milestone scan gated on lineType == .assistant
- [Phase 122 / Plan 09]: SIGTERM/SIGINT via DispatchSource.makeSignalSource — signal(SIG, SIG_IGN) first so GCD takes over; both signals drain with 5s deadline and exit(0)
- [Phase 122 / Plan 09]: nonisolated(unsafe) DispatchSource globals — written once at startup (main thread before RunLoop.main.run()); reads only inside GCD handler closures (single-writer safe)
- [Phase 122 / Plan 09]: XCTAssertEqual with await: capture actor value first — await in XCTest autoclosure not supported in Swift 6

- [Phase 123 / Plan 01]: main.swift → VigilWatchCLI.swift forced rename for `@main` compatibility — Swift compiler rule disallows `@main` in files literally named main.swift (top-level-code rule). Filename change is mechanical; structural pattern (`@main` AsyncParsableCommand parent + 6 subcommands + defaultSubcommand: Run.self) preserved verbatim
- [Phase 123 / Plan 01]: swift-argument-parser pinned `from: "1.6.0"` (SemVer minor flex), drift detector locks the source-pin string ("1.6.0") not the resolved version (1.7.1) — future SPM resolves of new minor releases don't break the test
- [Phase 123 / Plan 01]: Stub failure shape standardized — FileHandle.standardError.write + throw ExitCode.failure across all 6 subcommands; stderr message references the downstream plan that owns each body (Run/Tail/Test → 123-03; Install/Uninstall/Status → 123-04). Loud-fail in dev > silent no-op
- [Phase 123 / Plan 01]: AsyncParsableCommand vs ParsableCommand split per subcommand — Run/Test/Install/Uninstall need async (Task/await), Tail/Status are synchronous; per RESEARCH.md §"Pattern 1"
- [Phase 123 / Plan 01]: Pre-existing failing test (StateStoreTests.testRecordMilestoneRoundTrip) tracked in deferred-items.md — out-of-scope for Plan 01 (StateStore is Phase 122 milestone-record persistence, unrelated to swift-argument-parser/main.swift work). Baseline 110 passing → after P01 111 passing (+1 PackageTests); failing test count unchanged at 1

### Pending Todos

Captured for v3.8 execution (already in REQUIREMENTS.md):

- Day-1 JSONL schema verification (load-bearing gate) → VERIFY-01 / Phase 120
- vigil-watch daemon + launchd + CLI → AGENT-WATCH-01..07 / Phases 122–123
- Agent-events API + WebSocket fan-out → AGENT-API-01..03 / Phases 121, 124
- G2 Companion HUD + Quiet mode → AGENT-HUD-01..03 / Phases 124–125
- 4 G2 polish riders from v3.5 hardware UAT → G2-POLISH-05..08 / Phases 124–125
- vigil.ehpk v0.3.0 resubmit + 60s portfolio demo → G2-PLUGIN-01, AGENT-DEMO-01 / Phase 125

Ops follow-ups (defense-in-depth, not milestone-blocking):

- Rotate Railway Postgres password (Phase 118 Observation #4) → `.planning/todos/pending/2026-05-01-rotate-railway-postgres-password.md`

### Blockers/Concerns

**Carried into v3.8 (still-blocked from prior milestones):**

- ServiceNow API token still blocks Phase 80 (from v3.1)
- Phase 85 (iOS Shortcut) held — Shortcuts.app bugs
- Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated
- vigil-core npm test suite hang: integration tests import index.js which spawns generate-scheduler + gmail-workorders setInterval loops at module load. Workaround: run individual files via `npx tsx --test <file>`

**Active for v3.8:**

- Phase 120 verification is load-bearing — if JSONL schema diverges from the spec's assumed mapping, downstream Phase 122 / 123 goals shift. Three fallback paths documented (notification observation / VS Code extension / process inspection), each with its own implementation profile
- Even Hub plugin store-review status — v0.2.0 still in review at v3.8 start. If approval lands during this build, retest plugin behavior on whatever the store-published version is before v0.3.0 resubmit

### Memory drift flagged

- `reference_macbook_pro.md` still says 'vigilcore unloaded by design'; as of 2026-04-21 Plan 107.1-04 retired the daemon on BOTH machines.

## Session Continuity

Last session: 2026-05-09T18:36:27Z
Stopped at: Phase 123 Plan 01 complete (CLI scaffold + swift-argument-parser dep)
Resume file: .planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-01-SUMMARY.md
Next action: Execute Phase 123 Plan 02 (RuntimeStateWriter actor + EmitterActor.currentSnapshot + Daemon 1Hz tick wiring) — Wave 1 plan, runs independently of Plan 01. Plans 03 and 04 (Wave 2) depend on BOTH Plan 01 and Plan 02 completing.
