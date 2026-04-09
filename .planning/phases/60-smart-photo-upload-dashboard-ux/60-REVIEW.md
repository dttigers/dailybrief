---
phase: 60-smart-photo-upload-dashboard-ux
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - vigil-core/src/routes/process-photo.ts
  - vigil-core/src/routes/process-photo.test.ts
  - vigil-core/scripts/smoke-test.ts
  - Sources/DailyBriefMonitor/Dashboard/PhotoPreviewSheet.swift
  - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
  - Sources/DailyBriefMonitor/Dashboard/DashboardView.swift
  - Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift
  - Sources/DailyBriefMonitor/Settings/SettingsView.swift
  - Sources/JarvisCore/Services/APIAIServices.swift
  - Sources/JarvisCore/Services/VigilAPIClient.swift
  - Tests/DailyBriefMonitorTests/DashboardViewModelPhotoPreviewTests.swift
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 60: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 60 ships the smart-photo-upload backend patch (Plan 60-01) and the
dashboard preview-first UX (Plan 60-02). Both halves are well-structured and
test-covered. The key invariants hold:

- **Preview mode never inserts to DB** — verified by RT-12, RT-13, RT-14, RT-19
  (dbInsertFn captured, assertion on `dbCalled === false`).
- **forcePaperType transforms both directions correctly** — Case A (gridded
  collapse), Case B (lined split via splitGriddedBlobToLined), Case C (restamp)
  are exhaustively tested via RT-15, RT-16, RT-17, RT-18.
- **413 payload guard runs before Claude** — RT-20 asserts `claudeCalled === false`.
- **WR-01 fix is in place** — RT-8 asserts raw SDK error text does not leak to the
  502 body.
- **Data-loss guard works** — `processPhotoFile` returns Bool, outer loop uses
  `continue` to skip auto-delete on non-commit outcomes (lines 792-799).
- **CheckedContinuation plumbing is safe** — `resumePreviewWaiter` reads, nils,
  then resumes, so a double-resume re-entry from a racing handler is a no-op.
- **No sticky override across photos** — asserted by T7 (fresh payload per file,
  `currentForcePaperType` rebuilt from the new detectedType).
- **Settings UserDefaults round-trip works** — `photoUploadDefaultPaperType`
  didSet writes, init reads before loadConfig (defends against ConfigLoader
  failure path, matches the project_settings_wipes_apikey.md lesson).
- **mapPhotoError covers 400/401/404/413/429/500/502/503 + URLError.timedOut +
  ImageDescriptionError** — D-08 mapping is complete for every status the route
  can emit.

Three warning-level concerns are documented below. None block ship; all are
edge cases that are either cosmetic (picker flicker) or not reachable under
the current contract (impossible-state guard). Five info items cover dead
code, minor UX polish, and documentation gaps.

## Warnings

### WR-01: Picker visual flicker during override refetch

**File:** `Sources/DailyBriefMonitor/Dashboard/PhotoPreviewSheet.swift:141-151`

**Issue:** The segmented `Picker` uses a custom `Binding` whose `get` returns
`payload.currentForcePaperType`. When the user taps the other segment, the
`set` closure fires `onOverride(newValue)`, which dispatches an async
`overridePhotoPreview(to:)` call. That method sets `isBusy = true` and
awaits a refetch *before* updating `currentForcePaperType`. During the await
window (potentially 1-3 seconds of real network time), SwiftUI will re-read
the binding's `get`, see the OLD value, and snap the picker visually back to
the previous segment even though the user just tapped the new one. Once the
refetch completes and the payload is reassigned, the picker jumps to the new
value. The picker IS disabled during this window (`.disabled(payload.isBusy)`)
so the user can't re-tap, but the visual snap-back is confusing.

**Fix:** Update `payload.currentForcePaperType` to the new value BEFORE the
await, alongside `isBusy = true`, so the picker stays visually on the new
segment while the refetch runs. On error, revert in the catch block.

```swift
func overridePhotoPreview(to newType: PaperType) async {
    guard case .awaitingUserDecision(var payload) = photoPreviewState,
          payload.currentForcePaperType != newType,
          let photoAPI else { return }

    let previousType = payload.currentForcePaperType
    payload.isBusy = true
    payload.currentForcePaperType = newType   // commit the picker position up front
    photoPreviewState = .awaitingUserDecision(payload)
    // … existing refetch …
    // on error, revert:
    //   payload.currentForcePaperType = previousType
}
```

### WR-02: 413 error message says "5 MB" but the guard is 7 MB base64 chars

**File:** `vigil-core/src/routes/process-photo.ts:283-289`

**Issue:** `MAX_IMAGE_B64_CHARS = 7 * 1024 * 1024` (7 MB of base64 chars, which
is about 5.25 MB of raw bytes). The error body says `"image exceeds maximum
size (5 MB)"`. The "5 MB" is a rough stand-in for the raw-byte equivalent, and
the comment explains the math, but a client that hits this with a 6 MB raw
file will get a confusing "5 MB" error when the server actually accepted
payloads up to ~5.25 MB. Worse, a user-facing banner then says "Photo too
large — try a smaller file (5 MB max)" in `mapPhotoError`, so the user has no
way to know what size is actually accepted.

**Fix:** Either tighten the guard to exactly 5 MB of base64 (≈ 3.75 MB raw)
and keep the "5 MB" text, or update the error body (and the banner string in
`DashboardViewModel.swift:1491`) to match the actual limit. Recommended:
tighten the guard because Anthropic's real limit is a raw-byte cap, and base64
bookkeeping in the error string is hard to explain.

```ts
// Option A: make the guard match the message
const MAX_IMAGE_B64_CHARS = Math.floor((5 * 1024 * 1024) * 4 / 3); // ~5 MB raw
```

### WR-03: `photoAPI` nil guard inside commit/override returns silently with continuation still suspended

**File:** `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift:1374-1376, 1428-1431`

**Issue:** Both `commitPhotoPreview()` and `overridePhotoPreview(to:)` start
with:

```swift
guard case .awaitingUserDecision(var payload) = photoPreviewState,
      let photoAPI else { return }
```

If `photoAPI` is nil at this point, the method returns silently without
calling `resumePreviewWaiter`. The caller — `processPhotoFile` — is already
suspended on `presentPreviewAndWait`, so the batch loop would hang until the
user hits Cancel.

In practice this is unreachable today: `processPhotoFile` at line 1267 already
early-returns when `photoAPI == nil`, and `photoAPI` is an immutable `let`,
so if it was non-nil when the loop started it will still be non-nil here.
That is what keeps this from being a Critical. But the two guards invite a
future refactor to quietly break the invariant — if someone ever makes
`photoAPI` mutable, a silent hang becomes real.

**Fix:** Make the guards split so the nil-`photoAPI` branch resumes the waiter
defensively. The cost is one extra line; the benefit is that the state
machine can never deadlock on this path.

```swift
func commitPhotoPreview() async {
    guard case .awaitingUserDecision(var payload) = photoPreviewState else { return }
    guard let photoAPI else {
        photoPreviewState = nil
        resumePreviewWaiter(with: .cancelled)
        return
    }
    // …
}
```

Apply the same pattern to `overridePhotoPreview(to:)`.

## Info

### IN-01: `ProcessPhotoError.unsupportedMediaType` is declared but never thrown

**File:** `Sources/JarvisCore/Services/APIAIServices.swift:180`

**Issue:** The case is handled in `mapPhotoError` (line 1484) and is useful
for future callers, but nothing in `APIImageDescriptionService.processPhoto`
or `processPhotoFile` actually throws it. File extensions fall back to `.jpeg`
in `APIImageDescriptionService.mediaType(for:)` (line 438), so unsupported
extensions silently get misclassified rather than rejected.

**Fix:** Either remove the case (+ the `mapPhotoError` branch), or throw it
from `mediaType(for:)` when the extension isn't one of the supported four.
Preference: throw — silent misclassification of a `.heic` as `.jpeg` would
produce a confusing 400 from the server rather than a clean client-side error.

### IN-02: Smoke-test accepts 502 as a pass for preview mode

**File:** `vigil-core/scripts/smoke-test.ts:337-341`

**Issue:** The preview check accepts `200` OR `502` as a pass and only fails
on `201`. A real 502 (Anthropic down, key misconfigured, model removed) would
mask the fact that preview mode hasn't actually been exercised. The comment
explains the tradeoff (TINY_PNG may make Claude choke), which is reasonable,
but it means this smoke path never positively verifies preview-mode behavior
against the live backend — it only verifies the NEGATIVE invariant ("does not
return 201").

**Fix:** Send a real photo (checked-in fixture, not the 1x1 PNG) for the
preview check, so a 200 is guaranteed and the smoke test can assert
`json.thoughts[0].id === null` as the actual preview shape check. Alternative:
log a WARN when the 502 fallback triggers so you notice when smoke is
silently degrading.

### IN-03: `processPhotoFile` reads the file twice (preview + commit)

**File:** `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift:1273-1285, 1387-1395`

**Issue:** The raw bytes are read once in `processPhotoFile` for the initial
preview, then read again in `commitPhotoPreview` (and again in
`overridePhotoPreview`). If the source file is rotated, replaced, or moved
by the user between preview and commit — e.g. they opened the image in
Preview.app, rotated it, and saved — the commit will send different bytes
than the preview, so the user could commit a different set of thoughts than
the ones they saw. Also wastes I/O on large files.

**Fix:** Cache the `(imageData, mediaType)` on `PhotoPreviewPayload` (or on a
companion dict keyed by payload.id) so commit/override reuse the same bytes
the preview was built from. Avoids the replace-during-await race and
halves file I/O for the common case.

### IN-04: `SettingsViewModel.loadConfig` doesn't round-trip `photoUploadDefaultPaperType`

**File:** `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift:165-231`

**Issue:** By design, `photoUploadDefaultPaperType` is UserDefaults-only and
never flows through `AppConfig`. But `loadConfig()` is called on every
Settings-tab open and after `save()`, which means if someone ever adds a
`photoUploadDefaultPaperType` field to `AppConfig` in the future and forgets
to update `loadConfig`/`save` together, the UserDefaults value will silently
override the config value. Not a bug today — more of a "comment + assertion
so the next contributor can't miss it" nit.

**Fix:** Add a comment to `loadConfig()` right after the existing fields,
explicitly noting "photoUploadDefaultPaperType is intentionally NOT loaded
here — see init() for the UserDefaults read."

### IN-05: `mapPhotoError` URLError branch collapses two distinct failures into one message

**File:** `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift:1498-1506`

**Issue:** `.timedOut`, `.cannotConnectToHost`, and `.notConnectedToInternet`
all map to `"Request timed out"`. A user with no internet will see "Request
timed out" even though the real cause is `.notConnectedToInternet`. Not a
correctness bug, but the error text is actively misleading.

**Fix:** Split the mapping:

```swift
if urlErr.code == .timedOut { return "Request timed out" }
if urlErr.code == .notConnectedToInternet { return "No internet connection" }
if urlErr.code == .cannotConnectToHost { return "Couldn't reach Vigil Core — check Base URL in Settings" }
```

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
