---
phase: 86-split-brief-schedule
verified: 2026-04-15T00:00:00Z
status: human_needed
score: 7/7 roadmap success criteria verified by code evidence
overrides_applied: 0
human_verification:
  - test: "Menubar staleness path — run Print Now with no brief for today on server"
    expected: "Menu opens; 'Last run' row shows 'No brief today' with orange exclamation-triangle icon; 'Next brief: <time>' row still visible; no print job queued (lpstat -o shows no new job)"
    why_human: "Visual rendering, icon tint, SwiftUI-observed copy — cannot verify via grep that the rendered UI matches the design"
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
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (merged from ROADMAP Success Criteria + PLAN frontmatter)

| #   | Truth (source)                                                                                      | Status     | Evidence                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SC-1: Server cron fires daily at user-configured time in user's TZ and generates brief to storage   | ✓ VERIFIED | `generate-scheduler.ts` has Intl.DateTimeFormat TZ-aware matching, reads user_timezone + generate_schedule; SCH-01..SCH-08 pass (8/8); wired via `createGenerateScheduler` in `index.ts:137`; `start()` called at line 147 |
| 2   | SC-2: PWA Settings has two schedule cards — Auto-generate (server) + Auto-print (Mac)               | ✓ VERIFIED | `SettingsPage.tsx` renders ScheduleCard twice (Auto-generate / Auto-print); backing endpoints `/v1/settings/generate-schedule` + `/v1/settings/print-schedule` live; 16 settings tests pass (PS + GS + TZ) |
| 3   | SC-3: Mac CLI pulls latest brief from API and lpr-prints on its own schedule                        | ✓ VERIFIED | `DailyBrief.swift:76` calls `getRawData` against `/v1/brief/<today>` with local-TZ date; PrintService.printPDF invoked on success; no `/v1/brief/generate` POST remains (0 matches) |
| 4   | SC-4: CLI staleness — 404 → menubar shows "No brief" and skips print (no yesterday reprint)         | ✓ VERIFIED | `DailyBrief.swift:80-83`: `catch let VigilAPIError.httpError(statusCode, _) where statusCode == 404 { throw ExitCode(rawValue: 2) }`; StatusChecker `isStale == lastExitCode == 2`; MenuBarView renders "No brief today" copy + orange tint |
| 5   | SC-5: 7-day retention — storage keeps last 7 briefs, older ones purged                              | ✓ VERIFIED | generate-scheduler.ts has `retentionDays` (default 7), `selectExpiredBriefsFn`/`deleteExpiredBriefsFn`, and `unlinkFn` wired to `fs.promises.unlink`; SCH-05 test asserts unlink + DELETE paths |
| 6   | SC-6: Manual "Generate Now" button in PWA still works for off-schedule briefs                       | ✓ VERIFIED | No changes to `BriefHistoryPage` or `POST /v1/brief/generate` endpoint (D-16 preserved); `grep generateBrief` in SettingsPage returns nothing; scope-boundary confirmed in SUMMARY |
| 7   | SC-7: `dailybrief doctor` passes with new schedule source (reads print schedule from API)           | ✓ VERIFIED | Doctor Check 6 extended to serial sweep of `[print-schedule, generate-schedule, timezone]` with single PASS/FAIL label; old `scheduleReachable`/`scheduleUrlStr` gone (0 matches) |

**Score:** 7/7 roadmap SCs verified by code evidence. All plan-frontmatter truths also PASS (see per-plan below).

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
| `Sources/DailyBriefMonitor/StatusChecker.swift`       | ✓              | ✓ (isStale, didFailNonStale, lastExitCode == 2) | ✓ (consumed by MenuBarView) | ✓ VERIFIED |
| `Sources/DailyBriefMonitor/MenuBarView.swift`         | ✓              | ✓ (10 hits — No brief today, Print failed, statusIcon, statusLine, checker.isStale) | ✓ (AppKit menubar root view) | ✓ VERIFIED |

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
| MenuBarView status row | StatusChecker.lastExitCode | observed via checker.isStale/didFailNonStale | ✓ WIRED | Both computed vars used in statusIcon + statusLine |
| Doctor Check 6 | GET /v1/settings/{print-schedule, generate-schedule, timezone} | sequential Bearer-auth URLRequest | ✓ WIRED | Loop over 3-element path array; single printCheck label |

### Data-Flow Trace (Level 4)

| Artifact | Data Source | Status |
| -------- | ----------- | ------ |
| SettingsPage ScheduleCards | Real fetch via `getGenerateSchedule`/`getPrintSchedule` backed by drizzle select from app_settings | ✓ FLOWING |
| SettingsPage Timezone picker | Real fetch via `getTimezone`; defaults handled server-side | ✓ FLOWING |
| MenuBarView status | `StatusChecker.lastExitCode` set by real Process.terminationStatus after CLI run | ✓ FLOWING |
| generate-scheduler assemble output | `createBriefAssemblyService` with real db + AI client in index.ts | ✓ FLOWING |
| DailyBrief CLI PDF bytes | Real HTTP GET response body written to disk | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Settings endpoints unit tests | `npx tsx --test src/routes/settings.test.ts` | 16 pass / 0 fail | ✓ PASS |
| Generate scheduler unit tests | `npx tsx --test src/services/generate-scheduler.test.ts` | 8 pass / 0 fail | ✓ PASS |
| DailyBrief build | `swift build --product DailyBrief` | success (per SUMMARY 04, 05) | ? SKIP (not re-run in this verification; SUMMARY + commits attest) |
| DailyBriefMonitor build | `swift build --product DailyBriefMonitor` | success (per SUMMARY 05) | ? SKIP (not re-run) |
| PWA build | `npm run build` in vigil-pwa | success per SUMMARY 03 (311KB gz 92KB) | ? SKIP (not re-run) |
| vigil-core TS check | `npx tsc --noEmit` | clean per SUMMARIES 01, 02 | ? SKIP (not re-run) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SC-1 | 86-02 | Server cron fires daily in user's TZ | ✓ SATISFIED | generate-scheduler tick loop + Intl.DateTimeFormat + SCH-08 TZ test |
| SC-2 | 86-01, 86-03 | PWA has Auto-generate + Auto-print cards | ✓ SATISFIED | Two ScheduleCard usages in SettingsPage, endpoints live |
| SC-3 | 86-04 | Mac CLI pulls + lpr on its own schedule | ✓ SATISFIED | Generate.run() GET flow + PrintService.printPDF |
| SC-4 | 86-04, 86-05 | Staleness → menubar "No brief", skips print | ✓ SATISFIED | Exit code 2 + isStale computed var + MenuBarView orange copy |
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

None of the REVIEW findings block Phase 86 goal achievement. Plan 05 human-verify checkpoint was auto-approved in yolo mode — hence the items in `human_verification` below.

### Human Verification Required

Plan 86-05 included a blocking `checkpoint:human-verify` task (Task 3) that was auto-skipped under `parallelization.skip_checkpoints: true`. The physical menubar + doctor verification is deferred to the user's install-and-run workflow. The items in frontmatter `human_verification` cover:

1. **Menubar staleness path** — verify orange "No brief today" renders on exit code 2
2. **Menubar success path** — PDF + print + green checkmark end-to-end
3. **Doctor Check 6 live run** — PASS(3/3) and FAIL-with-path behaviors on real API
4. **Server cron smoke** — schedule → wait 90s → brief row appears → retention sweep log
5. **PWA Settings UI render** — two cards + timezone picker + autofill visible and laid out correctly
6. **DST boundary** — no double-fire on fall-back, no ghost fire on spring-forward missing hour

### Gaps Summary

No blocking gaps. All 7 roadmap success criteria have concrete code evidence. All 11 required artifacts exist, are substantive, and are wired. All declared key-links verified via grep. Unit tests for the two testable subsystems (vigil-core settings + scheduler) run green (16 + 8 = 24 tests, 0 failures). The remaining verification surface (Swift builds, PWA build, menubar visual, live API smoke, doctor live run) is covered by the SUMMARY self-checks and commit history; the human-verification items surface the UX/visual/live-integration checks that cannot be asserted from source.

The phase goal — decouple generation (server-owned) from printing (Mac-owned), with observable staleness and no local render — is fully realized in the codebase. Status is `human_needed` because Plan 05 explicitly declared a blocking human checkpoint that was bypassed, not because any truth is unverified in source.

---

_Verified: 2026-04-15T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
