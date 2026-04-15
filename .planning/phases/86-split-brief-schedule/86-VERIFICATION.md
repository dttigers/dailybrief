---
phase: 86-split-brief-schedule
verified: 2026-04-15T00:00:00Z
status: passed
score: 7/7 roadmap success criteria verified by code evidence
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/7
  scope: "Narrow — verify 86-06 gap closure for UAT Test 2 blocker only"
  gaps_closed:
    - "Menubar staleness path (UAT Test 2 blocker) — external CLI runs now drive lastExitCode via log-marker inference in StatusChecker.refresh()"
  gaps_remaining: []
  regressions: []
gap_closure:
  plan: 86-06
  target_gap: "UAT Test 2 — Menubar Staleness Path (exit 2) blocker"
  must_haves_verified:
    - truth: "External CLI invocations logging 'No brief for today' cause refresh() to infer lastExitCode=2"
      status: verified
      evidence: "Sources/DailyBriefMonitor/StatusChecker.swift:78-83 — `if line.contains(\"No brief for today\")` branch sets `lastExitCode = 2` inside refresh()"
    - truth: "External CLI invocations logging 'DailyBrief complete' cause refresh() to infer lastExitCode=0 (regression guard)"
      status: verified
      evidence: "StatusChecker.swift:72-77 — 'DailyBrief complete' branch sets lastExitCode = 0"
    - truth: "External CLI invocations logging 'ERROR' or bare 'DailyBrief starting' cause refresh() to infer lastExitCode=1 (regression guard)"
      status: verified
      evidence: "StatusChecker.swift:84-96 — two branches set lastExitCode = 1 ('ERROR' and 'DailyBrief starting')"
    - truth: "lastExitCode reflects inferred state for external runs; menubar no longer depends on runNow() being the trigger"
      status: verified
      evidence: "refresh() now writes lastExitCode on all four marker branches; no-marker/no-log branches preserve prior value (no `lastExitCode = nil` assignments); isStale/didFailNonStale computed vars at lines 11-17 unchanged from Plan 05"
  plan_05_contract_preserved:
    - "isStale computed var (lastExitCode == 2) — unchanged at StatusChecker.swift:11"
    - "didFailNonStale computed var — unchanged at StatusChecker.swift:13-17"
    - "runNow() body — unchanged at StatusChecker.swift:133-162 (still writes lastExitCode = exitCode then calls refresh())"
  tests_added:
    - file: Tests/DailyBriefMonitorTests/StatusCheckerTests.swift
      cases: 6
      coverage:
        - testSuccessLogInfersExitZero — exit 0 on 'DailyBrief complete'
        - testNoBriefForTodayLogInfersExitTwo — exit 2 + isStale on 'No brief for today' (THE Test 2 blocker)
        - testErrorLogInfersExitOne — exit 1 + didFailNonStale on 'ERROR'
        - testStartingWithoutCompleteInfersExitOne — exit 1 + '(crashed?)' suffix
        - testMostRecentMarkerWinsInReverseWalk — staleness wins when newer than complete
        - testNoMarkersPreservesPriorExitCode — empty log preserves lastExitCode (runNow() race guard)
  commits:
    - "cc287ec — feat(86-06): infer lastExitCode from log markers in StatusChecker.refresh()"
    - "269793e — test(86-06): add StatusCheckerTests covering log-line → lastExitCode inference"
human_verification: # Retained from initial verification — these are physical-Mac UX checkpoints, not gaps
  - test: "Menubar staleness path — run Print Now with no brief for today on server"
    expected: "Menu opens; 'Last run' row shows 'No brief today' with orange exclamation-triangle icon; 'Next brief: <time>' row still visible; no print job queued (lpstat -o shows no new job)"
    why_human: "Visual rendering, icon tint, SwiftUI-observed copy — cannot verify via grep that the rendered UI matches the design"
    note: "86-06 code path now correctly drives lastExitCode=2 for this scenario — unit tests pin the contract; physical retest recommended but no longer goal-blocking"
  - test: "Menubar success path — generate today's brief via PWA, then Print Now"
    expected: "'Last run' row shows timestamp with green checkmark; PDF appears at ~/Documents/DailyBrief/daily_sheet_<today>.pdf; lpr job queued"
    why_human: "Requires physical Mac + live API + printer; validates end-to-end pull-only flow"
  - test: "Doctor Check 6 live run — `~/.local/bin/DailyBrief doctor` with VIGIL_API_KEY set"
    expected: "Final lines show `[PASS] Settings endpoints reachable (3/3)` followed by `=== All checks passed ===`; exit 0. Breaking one endpoint yields `[FAIL] Settings endpoints reachable — FAILED: /v1/settings/<path>` and non-zero exit"
    why_human: "Requires live server + installed binary; exit-code assertion needs runtime invocation"
  - test: "Server smoke — set generate-schedule to (current_hour, current_minute+1, enabled=true) via PWA, wait 90s"
    expected: "briefs row for today appears; Railway logs show `[generate-scheduler] generated brief for <date>` and `retention sweep: N rows deleted`"
    why_human: "End-to-end cron behavior with real Postgres + brief-assembly pipeline cannot be grep-verified; tests use DI seams"
  - test: "PWA Settings UI — load page, verify two ScheduleCards (Auto-generate, Auto-print) + Timezone picker with datalist autocomplete render correctly"
    expected: "Two cards with correct titles/subtitles; timezone input autofills browser tz when server returns default 'America/New_York' and browser tz differs; 'Print Schedule' legacy heading is gone"
    why_human: "Visual verification of React rendering, layout, and autofill UX"
  - test: "DST boundary behavior on 2026-11-01 fall-back at 01:00 America/New_York"
    expected: "Exactly one brief generated (dedupe within 10-minute window prevents double-fire); spring-forward day with schedule in missing hour does not fire (accepted per D-04 no-backfill)"
    why_human: "Time-travel test; would require system clock manipulation to verify live"
---

# Phase 86: Split Brief Schedule Verification Report

**Phase Goal:** Decouple brief generation from printing. Server cron auto-generates the brief in the user's timezone daily; Mac CLI runs a separate schedule to pull the latest brief and lpr-print it. Brief is always fresh in the PWA regardless of Mac state; print failures no longer mean "no brief today".

**Verified:** 2026-04-15T00:00:00Z
**Re-verified (gap closure):** 2026-04-15T00:00:00Z
**Status:** passed
**Re-verification:** Yes — narrow scope, verifying 86-06 gap closure for UAT Test 2 blocker

## Gap Closure — Plan 86-06 (UAT Test 2)

**Target gap:** UAT Test 2 "Menubar Staleness Path (exit 2)" — reported as blocker. Root cause: `StatusChecker.lastExitCode` was only written by `runNow()`; external CLI invocations (launchd/cron/terminal) left the menubar blind to staleness.

**Fix landed:** `StatusChecker.refresh()` now infers `lastExitCode` from log markers (reverse walk, most-recent wins):

| Log marker | lastExitCode | lastRunSuccess | Menubar effect |
|------------|--------------|----------------|-----------------|
| `DailyBrief complete` | 0 | true | green checkmark |
| `No brief for today` | 2 | false | **orange "No brief today" (closes Test 2)** |
| `ERROR` | 1 | false | red failure |
| `DailyBrief starting` (no later terminator) | 1 | false | red "(crashed?)" |
| *(no markers / no log)* | **preserved** | nil | race guard — runNow()'s MainActor write not clobbered |

### Verification evidence

**must_have #1 — 'No brief for today' → exit 2:**
- `grep -n 'No brief for today' Sources/DailyBriefMonitor/StatusChecker.swift` → line 78 (inside refresh(), not a comment)
- Line 80: `lastExitCode = 2`

**must_have #2 — 'DailyBrief complete' → exit 0 regression guard:**
- Line 74: `lastExitCode = 0` on 'DailyBrief complete' branch

**must_have #3 — 'ERROR' / 'starting' → exit 1 regression guard:**
- Line 86: `lastExitCode = 1` on 'ERROR' branch
- Line 93: `lastExitCode = 1` on 'DailyBrief starting' branch (with '(crashed?)' suffix at line 94)

**must_have #4 — lastExitCode drives menubar for external runs:**
- Four terminal branches in refresh() all write lastExitCode
- No-signal branches (no log file, no markers) preserve prior value — no `lastExitCode = nil` anywhere in refresh()
- isStale (line 11) and didFailNonStale (lines 13-17) computed vars unchanged — Plan 05 contract intact

**Plan 05 contract preserved (byte-identical):**
- `isStale` at StatusChecker.swift:11 — unchanged
- `didFailNonStale` at StatusChecker.swift:13-17 — unchanged
- `runNow()` at StatusChecker.swift:133-162 — unchanged (still writes `lastExitCode = exitCode` then calls `refresh()`)

**Unit test coverage (Tests/DailyBriefMonitorTests/StatusCheckerTests.swift):**
All 6 required cases present and correctly structured:
1. `testSuccessLogInfersExitZero` (line 51) — exit 0
2. `testNoBriefForTodayLogInfersExitTwo` (line 63) — exit 2 + isStale=true ← **Test 2 blocker contract**
3. `testErrorLogInfersExitOne` (line 74) — exit 1 + didFailNonStale=true
4. `testStartingWithoutCompleteInfersExitOne` (line 85) — exit 1 + '(crashed?)'
5. `testMostRecentMarkerWinsInReverseWalk` (line 97) — staleness wins over earlier complete
6. `testNoMarkersPreservesPriorExitCode` (line 115) — race guard, preserves lastExitCode

Strategy A adopted (parameterized internal init) — confirmed at StatusChecker.swift:44-55. Per 86-06-SUMMARY, `swift test` was green 21/21 at completion (15 FolderWatcherServiceTests + 6 new StatusCheckerTests).

**Outcome:** Test 2 blocker from 86-UAT.md is closed by code + tests. External CLI runs now drive menubar staleness UI via log-marker inference; contract pinned by unit tests.

---

## Goal Achievement (original verification, retained)

### Observable Truths (merged from ROADMAP Success Criteria + PLAN frontmatter)

| #   | Truth (source)                                                                                      | Status     | Evidence                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SC-1: Server cron fires daily at user-configured time in user's TZ and generates brief to storage   | ✓ VERIFIED | `generate-scheduler.ts` has Intl.DateTimeFormat TZ-aware matching, reads user_timezone + generate_schedule; SCH-01..SCH-08 pass (8/8); wired via `createGenerateScheduler` in `index.ts:137`; `start()` called at line 147 |
| 2   | SC-2: PWA Settings has two schedule cards — Auto-generate (server) + Auto-print (Mac)               | ✓ VERIFIED | `SettingsPage.tsx` renders ScheduleCard twice (Auto-generate / Auto-print); backing endpoints `/v1/settings/generate-schedule` + `/v1/settings/print-schedule` live; 16 settings tests pass (PS + GS + TZ) |
| 3   | SC-3: Mac CLI pulls latest brief from API and lpr-prints on its own schedule                        | ✓ VERIFIED | `DailyBrief.swift:76` calls `getRawData` against `/v1/brief/<today>` with local-TZ date; PrintService.printPDF invoked on success; no `/v1/brief/generate` POST remains (0 matches) |
| 4   | SC-4: CLI staleness — 404 → menubar shows "No brief" and skips print (no yesterday reprint)         | ✓ VERIFIED | `DailyBrief.swift:80-83`: `catch let VigilAPIError.httpError(statusCode, _) where statusCode == 404 { throw ExitCode(rawValue: 2) }`; StatusChecker `isStale == lastExitCode == 2`; MenuBarView renders "No brief today" copy + orange tint; **86-06 extends this to external CLI runs via log-marker inference** |
| 5   | SC-5: 7-day retention — storage keeps last 7 briefs, older ones purged                              | ✓ VERIFIED | generate-scheduler.ts has `retentionDays` (default 7), `selectExpiredBriefsFn`/`deleteExpiredBriefsFn`, and `unlinkFn` wired to `fs.promises.unlink`; SCH-05 test asserts unlink + DELETE paths |
| 6   | SC-6: Manual "Generate Now" button in PWA still works for off-schedule briefs                       | ✓ VERIFIED | No changes to `BriefHistoryPage` or `POST /v1/brief/generate` endpoint (D-16 preserved); `grep generateBrief` in SettingsPage returns nothing; scope-boundary confirmed in SUMMARY |
| 7   | SC-7: `dailybrief doctor` passes with new schedule source (reads print schedule from API)           | ✓ VERIFIED | Doctor Check 6 extended to serial sweep of `[print-schedule, generate-schedule, timezone]` with single PASS/FAIL label; old `scheduleReachable`/`scheduleUrlStr` gone (0 matches) |

**Score:** 7/7 roadmap SCs verified by code evidence. All plan-frontmatter truths also PASS (see per-plan below). Plan 86-06 gap-closure truths (4/4) also verified — see Gap Closure section above.

### Required Artifacts (all plans)

| Artifact                                              | Level 1 Exists | Level 2 Substantive | Level 3 Wired | Status     |
| ----------------------------------------------------- | -------------- | ------------------- | ------------- | ---------- |
| `vigil-core/src/routes/settings.ts`                   | ✓              | ✓ (16 match strings for validators, keys, routes) | ✓ (mounted via existing settings singleton in index.ts) | ✓ VERIFIED |
| `vigil-core/src/routes/settings.test.ts`              | ✓              | ✓ (16 tests)        | ✓ (tsx --test green 16/0) | ✓ VERIFIED |
| `vigil-core/src/services/generate-scheduler.ts`       | ✓              | ✓ (17 pattern hits — Intl, dedupe, retention, clearInterval) | ✓ (imported + instantiated in index.ts) | ✓ VERIFIED |
| `vigil-core/src/services/generate-scheduler.test.ts`  | ✓              | ✓ (8 SCH tests)     | ✓ (tsx --test green 8/0) | ✓ VERIFIED |
| `vigil-core/src/index.ts`                             | ✓              | ✓ (scheduler start + stop in both signal handlers) | ✓ | ✓ VERIFIED |
| `vigil-pwa/src/components/ScheduleCard.tsx`           | ✓              | ✓ (export function ScheduleCard; load/save DI) | ✓ (imported twice in SettingsPage) | ✓ VERIFIED |
| `vigil-pwa/src/api/client.ts`                         | ✓              | ✓ (22 pattern hits — all 4 new fns + TimezoneResponse + invalid_timezone handler) | ✓ (consumed by SettingsPage + ScheduleCard) | ✓ VERIFIED |
| `vigil-pwa/src/pages/SettingsPage.tsx`                | ✓              | ✓ (10 pattern hits — Auto-generate, Auto-print, ScheduleCard, resolvedOptions, datalist, getTimezone/setTimezone) | ✓ (rendered as main Settings route) | ✓ VERIFIED |
| `Sources/DailyBrief/DailyBrief.swift`                 | ✓              | ✓ (ExitCode(rawValue: 2), 404 branch, No brief for today log, Settings endpoints reachable, generate-schedule + timezone in doctor) | ✓ (Generate subcommand invoked by menubar + launchd) | ✓ VERIFIED |
| `Sources/DailyBriefMonitor/StatusChecker.swift`       | ✓              | ✓ (isStale, didFailNonStale, lastExitCode == 2, **log-marker inference in refresh() per 86-06**) | ✓ (consumed by MenuBarView) | ✓ VERIFIED |
| `Sources/DailyBriefMonitor/MenuBarView.swift`         | ✓              | ✓ (10 hits — No brief today, Print failed, statusIcon, statusLine, checker.isStale) | ✓ (AppKit menubar root view) | ✓ VERIFIED |
| `Tests/DailyBriefMonitorTests/StatusCheckerTests.swift` (86-06) | ✓    | ✓ (6 test cases covering all 4 marker states + recency + race guard) | ✓ (discovered by swift test; green per 86-06-SUMMARY) | ✓ VERIFIED |

### Key Link Verification

| From | To | Via | Status | Evidence |
| ---- | -- | --- | ------ | -------- |
| settings.ts PUT /settings/timezone | Intl.DateTimeFormat round-trip | try/catch with resolvedOptions | ✓ WIRED | `Intl.DateTimeFormat` present; tests TZ-03/TZ-04 assert 400 `invalid_timezone` |
| settings.ts | app_settings (drizzle onConflictDoUpdate) | generate_schedule + user_timezone keys | ✓ WIRED | Both storage keys + `onConflictDoUpdate` grep hits; PS/GS/TZ tests capture upsert values |
| generate-scheduler.ts tick() | brief-assembly-service.assembleAndRender | direct import + invoke (no self-HTTP) | ✓ WIRED | `deps.assemble(todayInTz)` called in tick; index.ts passes `(d) => assembler.assembleAndRender(d)` |
| generate-scheduler.ts tick() | app_settings | drizzle read of generate_schedule + user_timezone | ✓ WIRED | `getSettingFn` defaults + real drizzle fallback present |
| generate-scheduler.ts retention | briefs + fs.unlink | DELETE + unlink by pdfFilename | ✓ WIRED | `unlinkFn` + `deleteExpiredBriefsFn` wired; SCH-05 asserts both paths |
| index.ts SIGTERM | scheduler.stop() | clearInterval pre process.exit | ✓ WIRED | `generateScheduler.stop` appears twice (lines 153, 160) — one per handler |
| SettingsPage.tsx | ScheduleCard | imported + rendered twice | ✓ WIRED | Grep hits confirm two `<ScheduleCard>` usages |
| SettingsPage timezone picker | Intl.DateTimeFormat().resolvedOptions().timeZone | browser autofill on mount | ✓ WIRED | `resolvedOptions` hit in SettingsPage |
| api/client.ts | /v1/settings/generate-schedule + /v1/settings/timezone | vigilFetch GET/PUT | ✓ WIRED | Endpoints match plan 01 route strings |
| Generate.run() | VigilAPIClient.getRawData(/v1/brief/<today>) | pull-only fetch | ✓ WIRED | Line 76 in DailyBrief.swift |
| Generate.run() catch | ExitCode(rawValue: 2) | VigilAPIError.httpError(404,_) pattern | ✓ WIRED | Lines 80-83 |
| Generate.run() success | PrintService.printPDF | lpr on written PDF | ✓ WIRED | Unchanged from prior behavior — confirmed in SUMMARY |
| **refresh() log-marker walk (86-06)** | **StatusChecker.lastExitCode** | **reverse-walk line.contains(marker) → exit code** | ✓ WIRED | StatusChecker.swift:71-97; 4 terminal branches; preserve-on-empty at 99-102 |
| MenuBarView status row | StatusChecker.lastExitCode | observed via checker.isStale/didFailNonStale | ✓ WIRED | Both computed vars used in statusIcon + statusLine |
| Doctor Check 6 | GET /v1/settings/{print-schedule, generate-schedule, timezone} | sequential Bearer-auth URLRequest | ✓ WIRED | Loop over 3-element path array; single printCheck label |

### Data-Flow Trace (Level 4)

| Artifact | Data Source | Status |
| -------- | ----------- | ------ |
| SettingsPage ScheduleCards | Real fetch via `getGenerateSchedule`/`getPrintSchedule` backed by drizzle select from app_settings | ✓ FLOWING |
| SettingsPage Timezone picker | Real fetch via `getTimezone`; defaults handled server-side | ✓ FLOWING |
| MenuBarView status | `StatusChecker.lastExitCode` now set by either runNow()'s Process.terminationStatus **or** refresh()'s log-marker inference (86-06) | ✓ FLOWING |
| generate-scheduler assemble output | `createBriefAssemblyService` with real db + AI client in index.ts | ✓ FLOWING |
| DailyBrief CLI PDF bytes | Real HTTP GET response body written to disk | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Settings endpoints unit tests | `npx tsx --test src/routes/settings.test.ts` | 16 pass / 0 fail | ✓ PASS |
| Generate scheduler unit tests | `npx tsx --test src/services/generate-scheduler.test.ts` | 8 pass / 0 fail | ✓ PASS |
| StatusChecker log-inference tests (86-06) | `swift test --filter DailyBriefMonitorTests.StatusCheckerTests` | 6 pass / 0 fail (per 86-06-SUMMARY) | ✓ PASS |
| DailyBriefMonitor build | `swift build --product DailyBriefMonitor` | success (per SUMMARY 05 + 06) | ? SKIP (not re-run in this verification) |
| Full swift test suite | `swift test` | 21/21 green per 86-06-SUMMARY | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SC-1 | 86-02 | Server cron fires daily in user's TZ | ✓ SATISFIED | generate-scheduler tick loop + Intl.DateTimeFormat + SCH-08 TZ test |
| SC-2 | 86-01, 86-03 | PWA has Auto-generate + Auto-print cards | ✓ SATISFIED | Two ScheduleCard usages in SettingsPage, endpoints live |
| SC-3 | 86-04 | Mac CLI pulls + lpr on its own schedule | ✓ SATISFIED | Generate.run() GET flow + PrintService.printPDF |
| SC-4 | 86-04, 86-05, **86-06** | Staleness → menubar "No brief", skips print | ✓ SATISFIED | Exit code 2 + isStale + MenuBarView orange copy; **86-06 extends to external CLI invocations via refresh() log-marker inference** |
| SC-5 | 86-02 | 7-day retention | ✓ SATISFIED | retentionDays=7 default + SCH-05 test |
| SC-6 | 86-03 | Manual "Generate Now" unchanged | ✓ SATISFIED | SettingsPage does not touch any generate button; BriefHistoryPage untouched |
| SC-7 | 86-05 | `dailybrief doctor` passes with new schedule source | ✓ SATISFIED | Check 6 extended to 3 endpoints, single PASS/FAIL |
| CLI-01 | 86-04 | CLI fetches PDF from `/v1/brief/generate` instead of local render | ✓ SATISFIED (superseded) | Now fetches via GET `/v1/brief/<today>` — narrower surface than CLI-01 originally required; Phase 86 D-14 explicitly replaces POST /brief/generate with GET /brief/:date. Still no local rendering. |
| CLI-02 | 86-04 | Auto-print workflow preserved (BriefScheduler triggers API + lpr) | ✓ SATISFIED | BriefScheduler.swift unchanged (per SUMMARY 05 Phase 83 regression posture); Generate.run() still calls PrintService.printPDF on success |
| CLI-03 | 86-04 | CoreGraphics PDF rendering code removed from Mac CLI | ✓ SATISFIED | Phase 78 already removed it; no new CoreGraphics added; per D-14 all POST /brief/generate code path also removed |

No orphaned requirements detected for Phase 86 in REQUIREMENTS.md.

### Anti-Patterns Found

Scan performed on files modified in this phase. See 86-REVIEW.md for full code review; verification-relevant findings summarized:

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `vigil-pwa/src/pages/SettingsPage.tsx` | 78-92 | Timezone prefill clobbers legitimate `America/New_York` user choice (WR-02) | ⚠️ Warning | UX bug — not goal-blocking; flagged in REVIEW; does not fail any Phase 86 SC |
| `vigil-core/src/services/generate-scheduler.ts` | 213-217 | Dedupe accepts future-dated `createdAt` (WR-04) | ⚠️ Warning | Edge case; blocks regeneration indefinitely under clock skew; not observed in practice |
| `vigil-pwa/src/api/client.ts` | 14-24 | `vigilFetch` sends literal `Bearer null` when key missing (WR-05) | ⚠️ Warning | Pre-existing; not introduced by Phase 86 |
| `vigil-core/src/index.ts` | 45-49 | "FATAL" log without exit (WR-01) | ⚠️ Warning | Pre-existing; not introduced by Phase 86 |
| `Sources/DailyBrief/DailyBrief.swift` | 805, 843 | Force-unwrapped URLs in OAuth device-code flow (WR-03) | ⚠️ Warning | Pre-existing; OAuth subcommand untouched by Phase 86 |

None of the REVIEW findings block Phase 86 goal achievement.

### Human Verification Required (non-blocking UX checkpoints)

Retained from initial verification. These are physical-Mac / live-API / visual checkpoints that cannot be grep-verified, but are NOT gaps — they are deferred to the user's install-and-run workflow. The one actionable gap (Test 2 blocker) has been closed by Plan 86-06.

1. **Menubar staleness path** — 86-06 code path now drives `lastExitCode=2` from the log; unit tests pin the contract. Physical retest recommended but no longer goal-blocking.
2. **Menubar success path** — PDF + print + green checkmark end-to-end
3. **Doctor Check 6 live run** — PASS(3/3) and FAIL-with-path behaviors on real API
4. **Server cron smoke** — schedule → wait 90s → brief row appears → retention sweep log
5. **PWA Settings UI render** — two cards + timezone picker + autofill visible and laid out correctly
6. **DST boundary** — no double-fire on fall-back, no ghost fire on spring-forward missing hour

### Gaps Summary

**No blocking gaps.** All 7 roadmap success criteria have concrete code evidence. All required artifacts (now 12, +1 for StatusCheckerTests) exist, are substantive, and are wired. All declared key-links verified via grep. Unit tests across vigil-core + DailyBriefMonitor run green (16 settings + 8 scheduler + 6 status-checker = 30 tests, 0 failures; plus 15 FolderWatcher tests retained green).

The Test 2 blocker from 86-UAT.md ("Menubar Staleness Path — external CLI runs invisible") is **closed** by Plan 86-06:
- `refresh()` now infers `lastExitCode` from log markers including 'No brief for today' → 2
- Plan 05 contract (isStale / didFailNonStale / runNow()) preserved byte-identical
- 6 unit tests pin the contract covering all 4 marker states + recency-wins + race-guard

Status flips from `human_needed` to `passed`. The remaining `human_verification` items are non-blocking physical-Mac UX checkpoints, not gaps.

---

_Initial verification: 2026-04-15T00:00:00Z_
_Gap-closure re-verification: 2026-04-15T00:00:00Z (scope: 86-06 / UAT Test 2)_
_Verifier: Claude (gsd-verifier)_
