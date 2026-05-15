---
phase: 129-lifecycle-restore-servicenow-popup
plan: "03"
subsystem: vigil-extension
tags: [chrome-extension, mv3, service-worker, servicenow, popup, ui, tdd]

dependency_graph:
  requires:
    - vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql (Plan 129-01: client_capture_id column)
  provides:
    - vigil-extension/popup-helpers.js (extractCaseNumber shared helper)
    - vigil-extension/__tests__/popup-helpers.test.ts (TDD test suite)
    - vigil-extension/background.js (MV3 service worker: D-01 action enable/disable)
    - vigil-extension/content-script.js (SVCNOW-02 MutationObserver drift detection)
    - vigil-extension/manifest.json (v1.1.0: tabs permission, SN host, service_worker, content_scripts with load-order contract)
    - vigil-extension/popup.html (SVCNOW form replacing Phase 84 UI)
    - vigil-extension/popup.css (Vigil-brand-compliant SVCNOW form styles)
    - vigil-extension/popup.js (CS# extraction + crypto.randomUUID clientCaptureId + D-03/D-04 + TITLE_DRIFT)
  affects:
    - vigil-safari-extension (Plan 129-05 lock-step port of all new files per D-13)
    - vigil-core/src/routes/work-orders.ts (Plan 129-04 wires clientCaptureId server-side dedup)

tech_stack:
  added: []
  patterns:
    - MV3 service worker (tabs.onUpdated + tabs.onActivated action enable/disable)
    - MV3 content_scripts load-order contract (popup-helpers.js at index 0 before content-script.js at index 1)
    - MutationObserver on document.title for CS# drift detection
    - TDD with node:test + tsx --test for plain-JS extension helper
    - CommonJS export guard for browser global / Node.js CJS dual usage

key_files:
  created:
    - vigil-extension/__tests__/popup-helpers.test.ts
    - vigil-extension/popup-helpers.js
    - vigil-extension/background.js
    - vigil-extension/content-script.js
  modified:
    - vigil-extension/manifest.json (bumped to 1.1.0; added tabs + SN host permission + service_worker + content_scripts)
    - vigil-extension/popup.html (REPLACED: SVCNOW form)
    - vigil-extension/popup.css (REPLACED: SVCNOW brand-compliant styles)
    - vigil-extension/popup.js (REPLACED: SVCNOW submission logic)

decisions:
  - Extraction regex /\bCS\d{7}\b/ (word-boundary) over REQUIREMENTS.md anchored /^CS\d{7}$/ — empirically wrong for compound Polaris titles (RESEARCH Probe 6); 129-06 UAT Scenario 4 confirms or corrects
  - popup-helpers.js as shared module with CommonJS export guard — supports tsx --test import AND Chrome global scope usage; avoids code duplication between popup.js and content-script.js
  - manifest content_scripts[0].js load order: popup-helpers.js at index 0, content-script.js at index 1 — prevents SVCNOW-02 silent no-op (Checker BLOCKER 5)
  - Fire-and-forget chrome.runtime.sendMessage from content-script.js (no await) — observer callback cannot be async; message delivery is best-effort which is acceptable for drift banner UX
  - window.close() ONLY inside res.ok branch (D-03); non-200 and network errors both stay in D-04 inline-error path
  - shortDescription field name (NOT description) per RESEARCH Probe 4 / Pitfall 5 — REQUIREMENTS.md field name was wrong

metrics:
  duration: "~25 minutes"
  completed: "2026-05-15T18:45:00Z"
  tasks_completed: 3
  files_changed: 8
---

# Phase 129 Plan 03: Chrome Extension SVCNOW Popup Summary

SVCNOW Chrome extension: Phase 84 capture-the-page popup replaced with ServiceNow-only assisted-capture form (CS# extraction, description + priority, crypto.randomUUID clientCaptureId, D-03 close-on-200, D-04 inline-error, MutationObserver drift banner) backed by an MV3 service worker (D-01 action enable/disable per SN tab) and content script (SVCNOW-02 title drift detection), with strict popup-helpers.js→content-script.js load-order enforced in manifest.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1a (RED) | Author popup-helpers.test.ts (failing) | ab5252f | `__tests__/popup-helpers.test.ts` |
| 1b (GREEN) | Implement popup-helpers.js extractCaseNumber | cb52108 | `popup-helpers.js` |
| 2 | Update manifest.json + author background.js + content-script.js | 0d41d1e | `manifest.json`, `background.js`, `content-script.js` |
| 3 | Replace popup.html + popup.css + popup.js with SVCNOW form | 15cf3fd | `popup.html`, `popup.css`, `popup.js` |

## Verification Results

- `npx tsx --test "__tests__/popup-helpers.test.ts"`: 8/8 pass (extractCaseNumber compound/bare/pipe/no-match/3-digit/8-digit-boundary/empty/null cases)
- Manifest load-order assertion: `content_scripts[0].js` equals exactly `["popup-helpers.js", "content-script.js"]` (length 2, indices pinned) — PASS
- `manifest.json` parses cleanly; `background.service_worker === "background.js"` — PASS
- `manifest.json` permissions: `["activeTab", "storage", "tabs"]` — PASS
- `manifest.json` host_permissions: `["https://api.vigilhub.io/*", "*://*.service-now.com/*"]` — PASS
- `background.js` contains `SN_PATTERN`, `tabs.onUpdated.addListener`, `tabs.onActivated.addListener`, `chrome.action.enable`, `chrome.action.disable` — PASS
- `content-script.js` contains `MutationObserver`, `TITLE_DRIFT`, `chrome.runtime.sendMessage` — PASS
- `content-script.js` does NOT define `extractCaseNumber` (global from popup-helpers.js) — PASS
- `popup.html` has all required IDs: case-number-header, description-input, priority-select, send-btn, send-error, drift-banner — PASS
- `popup.html` textarea has `maxlength="2000"` and `autofocus` — PASS
- `popup.html` priority options: Low, Medium (selected), High, Critical — PASS
- `popup.html` loads popup-helpers.js BEFORE popup.js — PASS
- No Phase 84 markers (title-input, content-input, thoughts-view) — PASS
- `popup.css` body width 320px, `.case-number` font-size 28px (>= 24px per SVCNOW-03) — PASS
- `popup.css` contains `#1D9E75` (primary) and `#E5534B` (error) — PASS
- `popup.js` first line is `'use strict'` — PASS
- `popup.js` contains `shortDescription` (1 occurrence, in POST body) — PASS
- `popup.js` contains `crypto.randomUUID()` (1 occurrence) — PASS
- `popup.js` contains `chrome.runtime.onMessage` and `TITLE_DRIFT` — PASS
- `popup.js` `window.close()` only inside `res.ok` branch — PASS
- `popup.js` POST URL `/v1/work-orders/sync` — PASS
- Task 1 regression check after Task 3: 8/8 tests still pass — PASS

## Deviations from Plan

None — plan executed exactly as written. Threat mitigations from the plan's threat model were applied during implementation:

- **T-129-09 (XSS):** `popup.js` uses `textContent` (not `innerHTML`) when setting `#case-number-header` — verified in code review.
- **T-129-11 (mass-assignment):** POST body contains only the 4 allowlisted fields: `caseNumber`, `shortDescription`, `priority`, `clientCaptureId`.
- **T-129-12 (scope creep):** host_permissions limited to `https://api.vigilhub.io/*` + `*://*.service-now.com/*` only.
- **T-129-19 (load-order regression):** Manifest deepEquals assertion (`js.length===2 && js[0]==='popup-helpers.js' && js[1]==='content-script.js'`) enforced and verified.

## Known Stubs

None — all acceptance criteria are met. The one tracked assumption is:

- **SVCNOW-01 regex assumption (A1):** Regex `/\bCS\d{7}\b/` is used unconditionally. The operator's specific Polaris instance title format is not empirically confirmed (no live SN page access during planning). 129-06 UAT Scenario 4 will confirm or produce a one-line corrected regex as a follow-up. This is documented as a bounded risk (< 10 LOC fix; no architectural impact).

## Threat Flags

None — all new endpoints, auth paths, and host permissions were in the plan's threat model and mitigated.

## TDD Gate Compliance

- RED gate: `test(129-03)` commit ab5252f — failing test for extractCaseNumber (MODULE_NOT_FOUND) — PASS
- GREEN gate: `feat(129-03)` commit cb52108 — 8/8 tests pass — PASS
- REFACTOR gate: Not needed — implementation was clean on first pass.

## Self-Check: PASSED

- `vigil-extension/__tests__/popup-helpers.test.ts`: EXISTS
- `vigil-extension/popup-helpers.js`: EXISTS
- `vigil-extension/background.js`: EXISTS
- `vigil-extension/content-script.js`: EXISTS
- Commit ab5252f (test RED): EXISTS
- Commit cb52108 (feat GREEN): EXISTS
- Commit 0d41d1e (feat manifest+background+content-script): EXISTS
- Commit 15cf3fd (feat popup.html/css/js): EXISTS
- `popup-helpers.js` exports `extractCaseNumber`: VERIFIED
- `manifest.json content_scripts[0].js` deepEquals `["popup-helpers.js", "content-script.js"]`: VERIFIED
