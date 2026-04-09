---
phase: 60-smart-photo-upload-dashboard-ux
verified: 2026-04-09T23:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
requirements:
  - id: PHOTO-05
    status: satisfied
    evidence: "Tests 3 and 4 passed — lined→gridded and gridded→lined overrides both work against running backend"
  - id: PHOTO-06
    status: satisfied
    evidence: "Test 5 passed — yellow uncertainty banner fires on blank-page low-confidence, user default pre-selected, Settings persists via UserDefaults (Test 0)"
---

# Phase 60: Smart Photo Upload Dashboard UX Verification Report

**Phase Goal:** When uploading a photo from the Mac dashboard, the user sees the detected paper type, can override it before committing, and is visibly told when detection was uncertain so the fallback default is not silent.

**Verified:** 2026-04-09
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After uploading a photo from the dashboard, the user sees the detected paper type before thoughts are committed | VERIFIED | `PhotoPreviewSheet.swift` renders `payload.detectedPaperType` + confidence badge; `DashboardViewModel.processPhotoFile` calls `?preview=true` first (line 1294-1297), presents sheet via `presentPreviewAndWait` (line 1350), awaits continuation before commit. Test 1 + Test 2 PASSED live against running vigil-core. |
| 2 | User can force paper type to lined or gridded and the resulting thoughts match forced mode (split vs single) | VERIFIED | `overridePhotoPreview(to:)` (DashboardViewModel:1428) refetches with `forcePaperType`; backend `applyForcePaperType` (process-photo.ts:171) collapses via `\n\n` join or splits via `splitGriddedBlobToLined`. Tests 3 and 4 PASSED — both override directions work end-to-end. Heuristic split held up, no escape hatch needed. |
| 3 | When Vigil Core reports low confidence, dashboard visibly surfaces uncertainty (banner/badge) and pre-selects user-configured default paper type | VERIFIED | `PhotoPreviewSheet.uncertaintyBanner` (line 126) rendered when `payload.showUncertaintyBanner` true; `DashboardViewModel` checks `initial.confidence < 0.5` (line 1306) and refetches with `userDefaultPaperTypeProvider()` as `forcePaperType` (line 1316), setting `userDefaultPaperType` on the payload (line 1331). Test 5 PASSED — blank notebook page triggered yellow banner + lined pre-select. |
| 4 | User-configured default paper type is persisted in Settings and drives the low-confidence fallback | VERIFIED | `SettingsViewModel.photoUploadDefaultPaperType` (line 99) round-trips to UserDefaults key `vigil.photoUpload.defaultPaperType` (line 98, 102-103, 160-162); loaded before `loadConfig()` per memory `project_settings_wipes_apikey.md`. `SettingsView.swift` renders picker in Photo Upload section (line 94-96). DashboardViewModel reads via narrow closure `userDefaultPaperTypeProvider` (line 222). Test 0 PASSED — setting persists across Settings close/reopen. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/routes/process-photo.ts` | preview mode + forcePaperType + 413 guard + generic 502 | VERIFIED | Contains `isPreview` check (line 258, strict `=== "true"`), `applyForcePaperType` export (line 171), `splitGriddedBlobToLined` (line 209), `MAX_IMAGE_B64_CHARS` 7MB guard (line 283), generic `"AI processing failed"` 502 (line 354). 38/38 tests passing per 60-01-SUMMARY. |
| `Sources/DailyBriefMonitor/Dashboard/PhotoPreviewSheet.swift` | Segmented picker + confidence badge + uncertainty banner + thoughts list + Commit/Cancel | VERIFIED | 7729 bytes on disk. `uncertaintyBanner` (line 126), `Picker` (line 141), `confidence: %.2f` badge (line 156), `ScrollView` for thoughts (line 163), Cancel unconditional (line 196), Commit disabled via onCommit closure (line 199). |
| `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` | Preview state machine + async continuation + batch loop | VERIFIED | 63786 bytes. `photoPreviewState` @Published (line 183), `photoPreviewContinuation` CheckedContinuation (line 189), `processPhotoFile` returns Bool (line 1266, line 792 gates auto-delete), `presentPreviewAndWait` (line 1360), `commitPhotoPreview` (line 1374), `cancelPhotoPreview` (line 1418), `overridePhotoPreview` (line 1428), `mapPhotoError` with 401/404/429 cases (line 1481). |
| `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift` | photoUploadDefaultPaperType with UserDefaults round-trip | VERIFIED | 14361 bytes. Key declared (line 98), property with didSet persistence (line 99-103), loaded at init before config (line 160-162). |
| `Sources/DailyBriefMonitor/Settings/SettingsView.swift` | Photo Upload section in AI tab | VERIFIED | Section "Photo Upload" (line 94) with Picker bound to `$viewModel.photoUploadDefaultPaperType` (line 96). |
| `Tests/DailyBriefMonitorTests/DashboardViewModelPhotoPreviewTests.swift` | 8 ViewModel state-machine tests | VERIFIED | 19127 bytes. T1 lined happy path, T2 commit no override, T3 override lined→gridded, T4 cancel, T5-T8 per 60-02-SUMMARY. 8/8 passing. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| DashboardView | DashboardViewModel.photoPreviewState | `.sheet(item:)` | WIRED | Per 60-02-SUMMARY, OS-dismiss routed to cancelPhotoPreview |
| DashboardViewModel.processPhotoFile | vigil-core `/v1/process-photo?preview=true` | APIImageDescriptionService.processPhoto(preview:true) | WIRED | Line 1294-1297 calls with preview=true, forcePaperType=nil; line 1350 awaits continuation before commit call |
| PhotoPreviewSheet onOverride | DashboardViewModel.overridePhotoPreview | closure injection | WIRED | overridePhotoPreview (line 1428) refetches preview with new forcePaperType, updates payload (line 1459) |
| SettingsViewModel.photoUploadDefaultPaperType | DashboardViewModel low-confidence fallback | userDefaultPaperTypeProvider closure | WIRED | Narrow closure captured at init (line 246), invoked at line 1309, applied as forcePaperType at line 1316, surfaced on payload at line 1331 |
| SettingsViewModel.photoUploadDefaultPaperType | UserDefaults | didSet + init load | WIRED | didSet writes rawValue (line 101-104); init reads before loadConfig (line 160-162) |
| PhotoPreviewSheet.uncertaintyBanner | payload.showUncertaintyBanner | conditional rendering | WIRED | Banner renders when showUncertaintyBanner true; set by DashboardViewModel when confidence < 0.5 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| PhotoPreviewSheet | payload.thoughts | Backend `/v1/process-photo?preview=true` via APIImageDescriptionService | Yes (Claude vision pipeline verified in Phase 59 + Tests 1-5 live) | FLOWING |
| PhotoPreviewSheet | payload.confidence | Backend response field | Yes (Test 5 showed low confidence on blank page) | FLOWING |
| PhotoPreviewSheet | payload.showUncertaintyBanner | Computed from initial.confidence < 0.5 | Yes (Test 5 yellow banner verified live) | FLOWING |
| SettingsView picker | viewModel.photoUploadDefaultPaperType | UserDefaults round-trip | Yes (Test 0 persistence verified live) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend preview mode returns 200 with unsaved thoughts | `npm test` in vigil-core (RT-12..RT-20) | 38/38 pass per 60-01-SUMMARY verification section | PASS |
| ViewModel state machine transitions | `swift test --filter DashboardViewModelPhotoPreviewTests` | 8/8 pass per 60-02-SUMMARY | PASS |
| Live end-to-end against running vigil-core | Human-verify Tests 0-8 on 2026-04-09 | 7 PASS + 1 HALF-PASS (Test 6 photo-specific Claude 400, not a Phase 60 bug) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PHOTO-05 | 60-02-PLAN | User can override the detected paper type before the thoughts are committed (force "lined" or "gridded") | SATISFIED | Tests 3 + 4 PASSED live (both override directions). `overridePhotoPreview` (DashboardViewModel:1428) + `applyForcePaperType` backend (process-photo.ts:171). |
| PHOTO-06 | 60-02-PLAN | If paper type can't be confidently detected, system falls back to user-configurable default and surfaces uncertainty in UI | SATISFIED | Test 5 PASSED live — yellow banner + user default pre-selected on blank-page low-confidence. Settings persistence verified Test 0. |

No orphaned requirements — ROADMAP.md rows for PHOTO-05 and PHOTO-06 both claim Phase 60 and both are completed in 60-02-PLAN `requirements-completed:`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| DashboardViewModel.swift | N/A | `category: null` on photo import (triage loop removed) | Info | Documented known regression in 60-02-SUMMARY §Deviations — intentional, not a goal failure. Re-triage UI remains usable. |
| Package.swift | N/A | First Swift test target — no prior test baseline | Info | First-time setup, documented. |

60-REVIEW reported 0 critical, 3 warning, 5 info — all warnings are polish items (picker visual snap-back, 413 off-by-one in error string, defensive nil-photoAPI guards). None block the phase goal.

### Human Verification Required

None. All 4 success criteria were already physically tested on 2026-04-09 against the running vigil-core backend (Railway Postgres + Anthropic). 7/8 human-verify tests passed outright; Test 6's half-pass was isolated and confirmed as a photo-specific Claude rejection (not a Phase 60 regression), not a gap in the dashboard UX implementation.

### Gaps Summary

No gaps. Phase 60 achieves its goal end-to-end:

- Preview-before-commit flow is implemented, wired, and live-tested
- Paper-type override works both directions (lined↔gridded) against real backend
- Low-confidence path surfaces a yellow banner and pre-selects the user's configured default
- Default paper type persists across Settings close/reopen via UserDefaults
- Both PHOTO-05 and PHOTO-06 closed with live evidence
- Mid-checkpoint fixes (Cancel disable, error mapping, auto-delete data-loss) were discovered and resolved during human-verify and are committed
- 38/38 backend tests + 8/8 SwiftUI ViewModel tests green
- 60-REVIEW returned 0 critical issues

Phase 60 is ready to proceed to Phase 61 (folder watcher).

---

*Verified: 2026-04-09*
*Verifier: Claude (gsd-verifier)*
