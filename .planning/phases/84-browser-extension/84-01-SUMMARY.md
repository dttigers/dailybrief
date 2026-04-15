---
phase: 84-browser-extension
plan: 01
subsystem: ui
tags: [chrome-extension, manifest-v3, vanilla-js, chrome-storage, vigil-api]

requires:
  - phase: vigil-core
    provides: POST /v1/thoughts and GET /v1/summary endpoints with Bearer auth
provides:
  - Vigil Capture Chrome extension (MV3) at vigil-extension/
  - Inline first-run API key setup with validation against /v1/summary
  - Active tab title+URL pre-fill into capture textarea
  - POST to /v1/thoughts with source="text"
affects: [84-02-safari, cross-platform-clients, onboarding]

tech-stack:
  added: [chrome-extension-mv3]
  patterns: [vanilla-js-no-build, chrome.storage.local-for-credentials, hidden-attribute-view-switching]

key-files:
  created:
    - vigil-extension/manifest.json
    - vigil-extension/popup.html
    - vigil-extension/popup.css
    - vigil-extension/popup.js
    - vigil-extension/icons/icon16.png
    - vigil-extension/icons/icon48.png
    - vigil-extension/icons/icon128.png
  modified: []

key-decisions:
  - "activeTab permission (not tabs) avoids 'Read browsing history' warning"
  - "chrome.storage.local (not sync) keeps credentials off Google servers"
  - "Key validation uses /v1/summary since /v1/health returns 200 without auth"
  - "Inline setup view (not options page) — simpler for single-setting extension"
  - "Content format: title\\nurl\\n\\n{user note} — cursor lands at end for quick note-adding"
  - "Auto-close popup 1.5s after 201 success"

patterns-established:
  - "No-build extension: vigil-extension/ loads directly via Load unpacked"
  - "Two-view popup via hidden attribute — no framework, pure DOM"
  - "Icons generated via Pillow (teal square + white V) — reproducible, no binary asset handling"

requirements-completed: []

duration: ~10min
completed: 2026-04-14
---

# Phase 84 / Plan 01: Vigil Capture Chrome Extension

**Manifest V3 popup-only Chrome extension with inline API key setup, active-tab pre-fill, and one-click capture to https://api.vigilhub.io/v1/thoughts.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-04-14
- **Tasks:** 3 (2 auto + 1 human checkpoint)
- **Files created:** 7

## Accomplishments
- Working MV3 Chrome extension that captures active tab to Vigil in two clicks
- Inline first-run setup with live key validation against `/v1/summary`
- Dark theme matching Vigil brand (#2C2C2A bg, #1D9E75 teal)
- Settings gear to re-enter API key without manual storage clear
- Verified end-to-end in Chrome: load unpacked, key setup, capture success, error states, storage reset

## Task Commits

1. **Task 1: manifest + popup HTML/CSS + icons** — `5507ba2` (feat)
2. **Task 2: popup.js logic** — `1788d97` (feat)
3. **Task 3: human checkpoint** — verified manually in Chrome, user approved

## Files Created/Modified
- `vigil-extension/manifest.json` — MV3 manifest (activeTab, storage, host_permissions)
- `vigil-extension/popup.html` — setup + capture views via hidden attribute
- `vigil-extension/popup.css` — dark theme matching Vigil brand
- `vigil-extension/popup.js` — storage, tab query, validation, capture, view switching
- `vigil-extension/icons/icon{16,48,128}.png` — teal 'V' icons generated via Pillow

## Decisions Made
None beyond what the plan specified — followed plan exactly.

## Deviations from Plan
None — plan executed as written. Pre-existing partial `vigil-extension/` with matching `manifest.json` was detected and preserved (no redundant overwrite).

## Issues Encountered
- Plan's verify script grep `api.vigilhub.io/v1/thoughts` fails because popup.js constructs URL as `${API_BASE}/v1/thoughts` (API_BASE declared separately). Functional behavior is correct; the verify script has a literal-match bug. Not fixed — does not affect runtime.
- User confusion on Task 3 step 9: reloading extension does NOT clear `chrome.storage.local` (by design). Clarified: must run `chrome.storage.local.clear()` via Inspect popup DevTools. User then verified successfully.

## User Setup Required
None — API key is entered inline on first popup open.

## Next Phase Readiness
- Ready for Plan 84-02: Safari Web Extension conversion via `xcrun safari-web-extension-converter`
- Source layout (`vigil-extension/`) matches what the converter expects

---
*Phase: 84-browser-extension*
*Completed: 2026-04-14*
