// Phase 129 Plan 03 — popup-helpers.test.ts
// Tests for extractCaseNumber helper shared between popup.js and content-script.js.
//
// NOTE ON REGEX CORRECTION:
// REQUIREMENTS.md specifies /^CS\d{7}$/ (anchored whole-string match).
// This is empirically WRONG — real Polaris browser tab titles are compound strings
// like "CS1234567 - Printer not working" (sessionTabTitle format).
// Anchored match would return null on all real Polaris pages.
//
// The correct approach is extraction: /\bCS\d{7}\b/
// Source: RESEARCH.md Probe 6 + ServiceNow Community evidence on sessionTabTitle.
// The 129-06 UAT runbook Scenario 4 confirms or corrects this against the operator's
// live Polaris instance. A regex correction is < 10 LOC if needed.
//
// LOCATION NOTE (Phase 129 Plan 07 / GAP-129-A):
// Relocated from `vigil-extension/__tests__/` (which Chrome's unpacked-extension load
// rejects because folder names starting with `_` are reserved by the extension system)
// to this sibling directory at the repo root. The import path below was updated to
// reach back to vigil-extension/popup-helpers.js from the new location.
//
// Runner: npx tsx --test "vigil-extension-tests/popup-helpers.test.ts" (from repo root)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { extractCaseNumber } = require('../vigil-extension/popup-helpers.js')

// --- Compound title (real Polaris shape) ---
test('extractCaseNumber: compound title with dash separator returns CS#', () => {
  assert.equal(extractCaseNumber('CS1234567 - Printer not working'), 'CS1234567')
})

// --- Bare title (rare but possible on some SN configurations) ---
test('extractCaseNumber: bare CS# title returns CS#', () => {
  assert.equal(extractCaseNumber('CS0353598'), 'CS0353598')
})

// --- Pipe-separated compound title ---
test('extractCaseNumber: pipe-separated compound title returns CS#', () => {
  assert.equal(extractCaseNumber('CS0353598 | Customer Name'), 'CS0353598')
})

// --- Non-matching title ---
test('extractCaseNumber: title with no CS# returns null', () => {
  assert.equal(extractCaseNumber('ServiceNow Home'), null)
})

// --- Too-few digits (3, not 7) — regex requires exactly 7 digits ---
test('extractCaseNumber: 3-digit CS prefix returns null (requires exactly 7 digits)', () => {
  assert.equal(extractCaseNumber('CS123 - bare'), null)
})

// --- Eight-digit string — /\bCS\d{7}\b/ matches the first 7-digit segment ---
// The word boundary \b stops at 8 digits because CS12345678 has no word boundary
// after 7 digits. This behavior is documented as-is; if undesired, use /\bCS\d{7}(?!\d)\b/.
// Current acceptance per plan: pinned to document actual regex behavior.
test('extractCaseNumber: 8-digit CS# — word boundary behavior documented', () => {
  // /\bCS\d{7}\b/ does NOT match CS12345678 (8 digits) because \b after 7 digits
  // falls mid-digit (no boundary between \d and \d). Returns null.
  assert.equal(extractCaseNumber('CS12345678 - eight digits'), null)
})

// --- Empty string ---
test('extractCaseNumber: empty string returns null', () => {
  assert.equal(extractCaseNumber(''), null)
})

// --- Null input (no throw on non-string) ---
test('extractCaseNumber: null input returns null without throwing', () => {
  assert.doesNotThrow(() => {
    const result = extractCaseNumber(null)
    assert.equal(result, null)
  })
})
