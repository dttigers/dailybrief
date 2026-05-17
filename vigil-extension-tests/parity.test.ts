// Phase 129.1 revert (file 129.1-02-PLAN.md). Manifest + popup-only surface; SVCNOW-specific files removed.
// 6 assertions: 2 manifest set-equality (permissions, host_permissions), 3 byte-equality (popup.html/css/js),
// 1 absence-test (background.js, content-script.js, popup-helpers.js absent on both sides).
//
// Lock-step rule (Phase 114 D-02, preserved across Phase 129.1 revert): every Chrome edit
// that changes user-facing behavior MUST be mirrored to Safari in the same commit. The
// popup.{html,css,js} byte-equality assertions enforce this at CI time.
//
// The absence-test pins the Phase 129.1 revert outcome: SVCNOW-only files (background.js,
// content-script.js, popup-helpers.js) must NOT reappear on either side. If a future plan
// reintroduces background/content scripts for legitimate reasons, that plan must update
// this absence-test (and ideally the manifest set-equality assertions) in the same commit.
//
// Runner: npx tsx --test "vigil-extension-tests/parity.test.ts" (from repo root)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Chrome source files (source of truth — Phase 84 + 94 + 114-00 capture-UX baseline)
const chromeDir = resolve(__dirname, '../vigil-extension')
const safariDir = resolve(__dirname, '../vigil-safari-extension/Vigil Capture Extension/Resources')

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

// ── Manifest field tests (structured set-equality) ──────────────────────────

test('EXT-revert: Chrome + Safari manifest permissions arrays match (set equality)', () => {
  const chromePerm = [...chromeManifest.permissions].sort()
  const safariPerm = [...safariManifest.permissions].sort()
  assert.deepEqual(chromePerm, safariPerm)
})

test('EXT-revert: Chrome + Safari manifest host_permissions match', () => {
  const chromeHost = [...chromeManifest.host_permissions].sort()
  const safariHost = [...safariManifest.host_permissions].sort()
  assert.deepEqual(chromeHost, safariHost)
})

// ── Source file byte-equality tests ─────────────────────────────────────────

test('EXT-revert: Chrome + Safari popup.html are byte-identical', () => {
  assert.equal(chromePopupHtml, safariPopupHtml)
})

test('EXT-revert: Chrome + Safari popup.css are byte-identical', () => {
  assert.equal(chromePopupCss, safariPopupCss)
})

test('EXT-revert: Chrome + Safari popup.js are byte-identical', () => {
  assert.equal(chromePopupJs, safariPopupJs)
})

// ── Absence-test: SVCNOW-only files must NOT reappear on either side ────────

test('EXT-revert: SVCNOW-only files (background.js, content-script.js, popup-helpers.js) absent on both sides', () => {
  const svcnowOnlyFiles = ['background.js', 'content-script.js', 'popup-helpers.js']
  for (const f of svcnowOnlyFiles) {
    assert.equal(existsSync(resolve(chromeDir, f)), false, `Chrome should not contain ${f}`)
    assert.equal(existsSync(resolve(safariDir, f)), false, `Safari should not contain ${f}`)
  }
})
