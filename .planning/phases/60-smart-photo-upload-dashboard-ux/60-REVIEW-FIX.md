---
phase: 60-smart-photo-upload-dashboard-ux
fixed_at: 2026-04-10T00:00:00Z
review_path: .planning/phases/60-smart-photo-upload-dashboard-ux/60-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 60: Code Review Fix Report

**Fixed at:** 2026-04-10
**Source review:** .planning/phases/60-smart-photo-upload-dashboard-ux/60-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Picker visual flicker during override refetch

**Files modified:** `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift`
**Commit:** 22e8d8b
**Applied fix:** Moved `payload.currentForcePaperType = newType` before the async refetch call in `overridePhotoPreview(to:)`, storing the previous value in `previousType`. The picker now stays visually on the new segment while the network call runs. On error, the picker position reverts to `previousType` before cancelling.

### WR-02: 413 error message says "5 MB" but guard was ~5.25 MB

**Files modified:** `vigil-core/src/routes/process-photo.ts`, `vigil-core/src/routes/process-photo.test.ts`
**Commit:** d91c4a1
**Applied fix:** Changed `MAX_IMAGE_B64_CHARS` from `7 * 1024 * 1024` to `Math.ceil((5 * 1024 * 1024) * 4 / 3)`, which is the exact base64 encoding of 5 MB raw bytes. Updated the accompanying comment block and aligned the test (RT-20) to use the same formula.

### WR-03: photoAPI nil guard silently returns with continuation suspended

**Files modified:** `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift`
**Commit:** e9bf165
**Applied fix:** Split the combined guard in both `commitPhotoPreview()` and `overridePhotoPreview(to:)` so the state-enum check is a separate guard from the `let photoAPI` check. When `photoAPI` is nil, the new branch sets `photoPreviewState = nil` and calls `resumePreviewWaiter(with: .cancelled)` before returning, preventing the batch loop from hanging.

---

_Fixed: 2026-04-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
