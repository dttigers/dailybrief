---
phase: 129-lifecycle-restore-servicenow-popup
plan: "05"
subsystem: vigil-safari-extension
tags: [safari-extension, lockstep, parity, drift-detector, wkwebextension, mv3, servicenow]

dependency_graph:
  requires:
    - vigil-extension/manifest.json (Plan 129-03: Chrome source of truth)
    - vigil-extension/background.js (Plan 129-03: Chrome service worker)
    - vigil-extension/content-script.js (Plan 129-03: Chrome content script)
    - vigil-extension/popup-helpers.js (Plan 129-03: Chrome shared helper)
    - vigil-extension/popup.html (Plan 129-03: Chrome SVCNOW form)
    - vigil-extension/popup.css (Plan 129-03: Chrome brand styles)
    - vigil-extension/popup.js (Plan 129-03: Chrome popup logic)
  provides:
    - vigil-safari-extension/Vigil Capture Extension/Resources/manifest.json (byte-identical Safari MV3 manifest)
    - vigil-safari-extension/Vigil Capture Extension/Resources/background.js (byte-identical Safari service worker)
    - vigil-safari-extension/Vigil Capture Extension/Resources/content-script.js (byte-identical Safari content script)
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup-helpers.js (byte-identical Safari helper)
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.html (byte-identical Safari SVCNOW form)
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.css (byte-identical Safari brand styles)
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.js (byte-identical Safari popup logic)
    - vigil-extension/__tests__/parity.test.ts (drift-detector: 11 tests asserting Chrome/Safari equivalence)
  affects:
    - vigil-safari-extension (Xcode project — operator must verify new files are in Copy Bundle Resources build phase)

tech_stack:
  added: []
  patterns:
    - Phase 114 EXT-02 lock-step parity pattern (byte-identical Chrome/Safari port in same commit)
    - Node:test drift-detector with readFileSync (parity.test.ts — 11 assertions)
    - Structured manifest comparison (set-equality on permissions/host_permissions arrays)
    - Byte-equality assertion for 6 source files via assert.equal(chromeFile, safariFile)

key_files:
  created:
    - vigil-safari-extension/Vigil Capture Extension/Resources/background.js
    - vigil-safari-extension/Vigil Capture Extension/Resources/content-script.js
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup-helpers.js
    - vigil-extension/__tests__/parity.test.ts
  modified:
    - vigil-safari-extension/Vigil Capture Extension/Resources/manifest.json (v1.0.0 → v1.1.0; tabs perm, SN host, service_worker, content_scripts)
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.html (Phase 84 UI → SVCNOW form)
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.css (Phase 84 styles → SVCNOW brand-compliant)
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.js (Phase 84 logic → SVCNOW submission logic)

decisions:
  - Byte-identical lock-step with Chrome-side lockstep comment text preserved verbatim on Safari side — both sides point to the same lockstep relationship description (operators reading either source see the same Phase 129 D-13 reference)
  - No Xcode project file changes attempted — adding new JS files to an Xcode project from a Linux dev box is unsupported; operator must add background.js, content-script.js, popup-helpers.js to the Xcode Copy Bundle Resources build phase at UAT time (surfaced as 129-06 UAT step)
  - Parity test uses assert.equal() (not deepEqual) for source files — single string comparison is sufficient and gives clearest diff output on failure
  - content_scripts[0].js load-order uses deepEqual (not sort) — order matters for Checker BLOCKER 5 load-order contract (popup-helpers.js before content-script.js)

metrics:
  duration: "~15 minutes"
  completed: "2026-05-15T18:41:55Z"
  tasks_completed: 2
  files_changed: 8
---

# Phase 129 Plan 05: Safari Extension Lock-Step Port Summary

Safari extension lock-step port: 7 Chrome files byte-identically copied to `vigil-safari-extension/Vigil Capture Extension/Resources/` plus a parity drift-detector test (11 cases) that fails CI if any Chrome/Safari file pair diverges — enforcing the Phase 114 EXT-02 invariant for SVCNOW-05.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Copy Chrome → Safari for all 7 source files | ab99acd | `manifest.json`, `background.js`, `content-script.js`, `popup-helpers.js`, `popup.html`, `popup.css`, `popup.js` (all in Safari Resources/) |
| 2 | Author parity drift-detector test | 17604a1 | `vigil-extension/__tests__/parity.test.ts` |

## Verification Results

- `diff -q` all 7 Chrome/Safari file pairs: NO DIFFERENCES (byte-identical) — PASS
- `cd vigil-extension && npx tsx --test "__tests__/parity.test.ts"`: 11/11 pass — PASS
- Sanity check: stray newline appended to Safari `popup.html` caused test to fail → file restored — PASS (CI gate works)
- Safari `manifest.json` parses as valid JSON — PASS
- Safari `manifest.json` includes `tabs` in permissions — PASS
- Safari `manifest.json` includes `*://*.service-now.com/*` in host_permissions — PASS
- Safari `manifest.json` has `background.service_worker = "background.js"` — PASS
- Safari `manifest.json` has `content_scripts[0].js = ["popup-helpers.js", "content-script.js"]` — PASS
- Safari `popup.html` loads `popup-helpers.js` BEFORE `popup.js` — PASS

## Deviations from Plan

None — plan executed exactly as written. One operator-action note documented (not a deviation):

**Xcode Copy Bundle Resources — operator action required at UAT:**
Per the plan's documented caveat, three new files (`background.js`, `content-script.js`, `popup-helpers.js`) were added to the Safari Resources directory. These files are NOT automatically added to the Xcode project's Copy Bundle Resources build phase when created from a Linux dev box. Operator must open `vigil-safari-extension/Vigil Capture Extension.xcodeproj` in Xcode on macOS and manually add these three new files to the Copy Bundle Resources build phase, then rebuild. This is documented as a UAT step for plan 129-06.

## Known Stubs

None.

## Threat Flags

None — all new surface (Safari extension file additions) was in the plan's threat model (T-129-19: mitigated by parity drift-detector; T-129-21: mitigated by byte-identical port of same textContent-only popup.js).

## Xcode UAT Note

Before plan 129-06 operator UAT, the operator must:
1. Open `vigil-safari-extension/Vigil Capture Extension.xcodeproj` in Xcode on macOS.
2. Add `background.js`, `content-script.js`, and `popup-helpers.js` to the project's Copy Bundle Resources build phase.
3. Run `xcodebuild clean build` to rebuild the Safari extension.
4. Load the extension in Safari and verify the SVCNOW popup renders correctly on a `*.service-now.com/*` page.

If Safari UAT in 129-06 surfaces a `chrome.action.disable()` incompatibility (RESEARCH Assumption A2), apply the one-line shim (`globalThis.browser?.action ?? chrome.action`) and re-enforce parity in a follow-up — do NOT pre-emptively diverge.

## Self-Check: PASSED

- `vigil-safari-extension/Vigil Capture Extension/Resources/manifest.json`: EXISTS, byte-identical to Chrome
- `vigil-safari-extension/Vigil Capture Extension/Resources/background.js`: EXISTS, byte-identical to Chrome
- `vigil-safari-extension/Vigil Capture Extension/Resources/content-script.js`: EXISTS, byte-identical to Chrome
- `vigil-safari-extension/Vigil Capture Extension/Resources/popup-helpers.js`: EXISTS, byte-identical to Chrome
- `vigil-safari-extension/Vigil Capture Extension/Resources/popup.html`: EXISTS, byte-identical to Chrome
- `vigil-safari-extension/Vigil Capture Extension/Resources/popup.css`: EXISTS, byte-identical to Chrome
- `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js`: EXISTS, byte-identical to Chrome
- `vigil-extension/__tests__/parity.test.ts`: EXISTS
- Commit ab99acd (Task 1 — Safari 7-file port): EXISTS
- Commit 17604a1 (Task 2 — parity drift-detector): EXISTS
- Parity test 11/11 pass: VERIFIED
- All 7 diff -q pairs clean: VERIFIED
