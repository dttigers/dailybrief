---
phase: 71-brief-history-photo-upload
plan: "02"
subsystem: vigil-pwa
tags: [photo-upload, state-machine, react-hook, tailwind, mobile-camera]
dependency_graph:
  requires: []
  provides: [PhotoUploadPage, usePhotoUpload]
  affects: [vigil-pwa/src/App.tsx, vigil-pwa/src/components/Layout.tsx]
tech_stack:
  added: []
  patterns: [FileReader base64 conversion, state-machine hook, vigilFetch POST with JSON body]
key_files:
  created:
    - vigil-pwa/src/hooks/usePhotoUpload.ts
    - vigil-pwa/src/pages/PhotoUploadPage.tsx
  modified:
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/App.tsx
decisions:
  - Auto-trigger preview() in render cycle via ref guard rather than separate useEffect, avoiding hook order complexity
  - Paper type override toggle uses local state (forcePaperType) separate from hook, applied at commit time
  - capture="environment" on file input prompts rear camera on mobile devices
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12T21:24:43Z"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 4
---

# Phase 71 Plan 02: Photo Upload PWA Page Summary

Photo upload page with FileReader → base64 → preview/commit flow using usePhotoUpload state-machine hook, wired into nav and routes. PWA build verified clean.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | usePhotoUpload hook and PhotoUploadPage | 760cc5a | vigil-pwa/src/hooks/usePhotoUpload.ts, vigil-pwa/src/pages/PhotoUploadPage.tsx |
| 2 | Wire Upload tab into nav and routes, build verify | 495d357 | vigil-pwa/src/components/Layout.tsx, vigil-pwa/src/App.tsx |

## Task 3: Checkpoint — Pending Human Verification

**Status:** checkpoint:human-verify — awaiting user sign-off

**What to verify:**
1. Open the app (app.vigilhub.io or local dev server)
2. Confirm "History" and "Upload" tabs appear in the navigation bar
3. Click "Upload" — confirm the file picker / drop zone appears with camera icon
4. Select a photo of handwritten notes — confirm loading spinner shows "Analyzing photo..."
5. Confirm preview shows paper type badge (e.g., "Lined 87% confidence"), thought list, and Save/Cancel buttons
6. Confirm paper type override toggle (Lined / Gridded) is present
7. Click "Save Thoughts" — confirm success message shows thought count
8. Navigate to Thoughts tab — confirm new photo-sourced thoughts appear

**Resume signal:** Type "approved" or describe issues to continue.

## What Was Built

### usePhotoUpload Hook (`vigil-pwa/src/hooks/usePhotoUpload.ts`)

State machine with phases: `idle | selecting | previewing | committing | done | error`

- `selectFile(file)`: validates type (JPEG/PNG/GIF/WebP) and size (5MB max — T-71-03), reads as base64 via FileReader, stores full data URL for thumbnail
- `preview()`: POST `/v1/process-photo?preview=true` with `{ image, mediaType }`, stores `{ paperType, confidence, thoughts }` in `previewResult`
- `commit(forcePaperType?)`: POST `/v1/process-photo` with optional `forcePaperType` override, transitions to `done` on success
- `reset()`: clears all state back to `idle`
- Returns `imagePreviewUrl` (full data URL) for `<img>` thumbnail display

### PhotoUploadPage (`vigil-pwa/src/pages/PhotoUploadPage.tsx`)

- **Idle**: Dashed drop zone with camera icon, `<input type="file" capture="environment">` for mobile camera
- **Analyzing**: Loading spinner with "Analyzing photo..." text + thumbnail
- **Preview result**: Photo thumbnail, paper type badge with confidence %, thought cards, Lined/Gridded override toggle, Save/Cancel buttons
- **Committing**: Spinner with "Saving thoughts..." overlaid on preview
- **Done**: Green success panel with thought count and "Upload Another" button
- **Error**: Red error panel with message and "Try Again" button

### Nav + Routes

- `Layout.tsx`: Added `{ label: 'Upload', to: '/upload' }` after History entry
- `App.tsx`: Added `<Route path="/upload" element={<PhotoUploadPage />} />` in authenticated routes

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-71-03 (DoS — oversized upload) | Client-side 5MB guard in `selectFile()` before FileReader, server enforces with 413 |
| T-71-04 (Tampering — invalid mediaType) | Client validates against `VALID_MEDIA_TYPES` allowlist before sending; server also validates |

## Deviations from Plan

None — plan executed exactly as written. The "auto-trigger preview" pattern (using a `useRef` guard in render rather than `useEffect`) is an implementation detail not specified in the plan, chosen to keep the page free of effect complexity.

## Known Stubs

None — all states are fully wired to real API calls. No placeholder data.

## Self-Check

- [x] `vigil-pwa/src/hooks/usePhotoUpload.ts` — created
- [x] `vigil-pwa/src/pages/PhotoUploadPage.tsx` — created
- [x] `vigil-pwa/src/components/Layout.tsx` — Upload tab added
- [x] `vigil-pwa/src/App.tsx` — /upload route added
- [x] Commit 760cc5a exists (Task 1)
- [x] Commit 495d357 exists (Task 2)
- [x] `npm run build` passes: 54 modules, 287 kB JS, no errors

## Self-Check: PASSED
