// Phase 129 Plan 05 — parity.test.ts
// Drift-detector: asserts Chrome and Safari extension file sets are equivalent.
//
// POLICY: Strict byte-equality for all 6 source files (popup.html, popup.css, popup.js,
// popup-helpers.js, background.js, content-script.js). Manifest comparison uses structured
// field checks (set-equality on permissions/host_permissions + exact content_scripts match).
//
// This policy enforces the Phase 114 EXT-02 invariant and SVCNOW-05 D-13 lock-step rule:
// every Chrome edit that changes the user-facing behavior MUST be mirrored to Safari in
// the same commit. This test fails CI if any Chrome ↔ Safari file pair diverges.
//
// FUTURE EXCEPTION PATH (RESEARCH Assumption A2):
// Safari WKWebExtension polyfills chrome.* APIs, but `chrome.action.disable()` may differ
// subtly. If 129-06 operator UAT surfaces a Safari incompatibility, a one-line shim
// (`globalThis.browser?.action ?? chrome.action`) is the documented fallback. At that point,
// the byte-equality assertions for the affected file(s) must be relaxed to a structured
// behavioral equivalence check. The manifest + non-affected files remain byte-equal.
// Do NOT pre-emptively add the shim — D-13 strict lock-step is the policy until UAT proves
// otherwise.
//
// Runner: npx tsx --test "__tests__/parity.test.ts" (from vigil-extension/ directory)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Chrome source files (source of truth — authored in 129-03)
const chromeDir = resolve(__dirname, '..')
const safariDir = resolve(__dirname, '../../vigil-safari-extension/Vigil Capture Extension/Resources')

// Manifests (parsed for structured comparison)
const chromeManifest = JSON.parse(readFileSync(resolve(chromeDir, 'manifest.json'), 'utf-8'))
const safariManifest = JSON.parse(readFileSync(resolve(safariDir, 'manifest.json'), 'utf-8'))

// Source files (byte-string comparison)
const chromePopupHtml = readFileSync(resolve(chromeDir, 'popup.html'), 'utf-8')
const safariPopupHtml = readFileSync(resolve(safariDir, 'popup.html'), 'utf-8')

const chromePopupCss = readFileSync(resolve(chromeDir, 'popup.css'), 'utf-8')
const safariPopupCss = readFileSync(resolve(safariDir, 'popup.css'), 'utf-8')

const chromePopupJs = readFileSync(resolve(chromeDir, 'popup.js'), 'utf-8')
const safariPopupJs = readFileSync(resolve(safariDir, 'popup.js'), 'utf-8')

const chromePopupHelpers = readFileSync(resolve(chromeDir, 'popup-helpers.js'), 'utf-8')
const safariPopupHelpers = readFileSync(resolve(safariDir, 'popup-helpers.js'), 'utf-8')

const chromeBackground = readFileSync(resolve(chromeDir, 'background.js'), 'utf-8')
const safariBackground = readFileSync(resolve(safariDir, 'background.js'), 'utf-8')

const chromeContentScript = readFileSync(resolve(chromeDir, 'content-script.js'), 'utf-8')
const safariContentScript = readFileSync(resolve(safariDir, 'content-script.js'), 'utf-8')

// ── Manifest field tests (structured set-equality) ──────────────────────────

test('SVCNOW-05: Chrome + Safari manifest permissions arrays match (set equality)', () => {
  const chromePerm = [...chromeManifest.permissions].sort()
  const safariPerm = [...safariManifest.permissions].sort()
  assert.deepEqual(chromePerm, safariPerm)
})

test('SVCNOW-05: Chrome + Safari manifest host_permissions match', () => {
  const chromeHost = [...chromeManifest.host_permissions].sort()
  const safariHost = [...safariManifest.host_permissions].sort()
  assert.deepEqual(chromeHost, safariHost)
})

test('SVCNOW-05: Chrome + Safari manifest background.service_worker matches', () => {
  assert.equal(chromeManifest.background.service_worker, safariManifest.background.service_worker)
})

test('SVCNOW-05: Chrome + Safari manifest content_scripts[0].matches match', () => {
  const chromeMatches = [...chromeManifest.content_scripts[0].matches].sort()
  const safariMatches = [...safariManifest.content_scripts[0].matches].sort()
  assert.deepEqual(chromeMatches, safariMatches)
})

test('SVCNOW-05: Chrome + Safari manifest content_scripts[0].js array matches in order', () => {
  // Order is load-order contract (Checker BLOCKER 5): popup-helpers.js BEFORE content-script.js.
  // Safari must honor the same load order — deepEqual not sort (order matters here).
  assert.deepEqual(chromeManifest.content_scripts[0].js, safariManifest.content_scripts[0].js)
})

// ── Source file byte-equality tests ─────────────────────────────────────────

test('SVCNOW-05: Chrome + Safari popup.html are byte-identical', () => {
  assert.equal(chromePopupHtml, safariPopupHtml)
})

test('SVCNOW-05: Chrome + Safari popup.css are byte-identical', () => {
  assert.equal(chromePopupCss, safariPopupCss)
})

test('SVCNOW-05: Chrome + Safari popup.js are byte-identical', () => {
  assert.equal(chromePopupJs, safariPopupJs)
})

test('SVCNOW-05: Chrome + Safari popup-helpers.js are byte-identical', () => {
  assert.equal(chromePopupHelpers, safariPopupHelpers)
})

test('SVCNOW-05: Chrome + Safari background.js are byte-identical', () => {
  assert.equal(chromeBackground, safariBackground)
})

test('SVCNOW-05: Chrome + Safari content-script.js are byte-identical', () => {
  assert.equal(chromeContentScript, safariContentScript)
})
