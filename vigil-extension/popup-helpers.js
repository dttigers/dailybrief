'use strict'
// Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/popup-helpers.js — Phase 129 (D-13)
//
// Shared helper: extractCaseNumber(title)
// Consumed by:
//   1. popup.js — loaded via <script src="popup-helpers.js"> BEFORE <script src="popup.js">
//   2. content-script.js — loaded via manifest content_scripts[0].js at index 0
//      BEFORE content-script.js at index 1 (load-order contract: Checker BLOCKER 5)
//
// REGEX NOTE: REQUIREMENTS.md uses /^CS\d{7}$/ (whole-string anchor).
// This is empirically wrong — real Polaris tab titles are compound strings like
// "CS1234567 - Printer not working" (sessionTabTitle format, per RESEARCH Probe 6).
// Corrected extraction regex: /\bCS\d{7}\b/ (word-boundary, not anchored).
// Risk is bounded: a regex correction is < 10 LOC; 129-06 UAT Scenario 4 confirms
// or corrects this against the operator's live Polaris instance.

/**
 * Extract a ServiceNow case number (CS followed by exactly 7 digits) from a page title.
 * Handles compound Polaris titles like "CS1234567 - Printer not working".
 *
 * @param {string|null} title - The document.title string (or null/undefined on non-string input).
 * @returns {string|null} The extracted case number (e.g. "CS1234567"), or null if not found.
 */
function extractCaseNumber(title) {
  if (typeof title !== 'string') return null
  const match = title.match(/\bCS\d{7}\b/)
  return match ? match[0] : null
}

// CommonJS export guard for Node.js/tsx --test runner.
// Chrome content_scripts and <script> tag loading expose top-level function
// declarations as globals on the isolated-world scope — no additional export needed
// for browser contexts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractCaseNumber }
}
