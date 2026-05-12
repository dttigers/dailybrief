#!/usr/bin/env node
// vigil-pwa/scripts/denylist-parity-ci.mjs
// ── Phase 127 GUARD-01 — Cross-workspace denylist parity CI script ───────────
//
// Sibling node script that runs the SAME diff as
// src/__tests__/denylist-parity.test.ts at CI time. Wired into
// `pnpm denylist-parity:ci` (and chained into the `test` script) so a future
// commit that accidentally deletes the Vitest file does NOT silently disable
// drift detection. (T-127-01-C closure — defense in depth.)
//
// Exits 0 on parity, 1 on drift OR cross-workspace read failure (NO
// degraded fallback). Prints a diff-formatted error on mismatch.
//
// Run: pnpm denylist-parity:ci (or `node scripts/denylist-parity-ci.mjs` from
// the vigil-pwa workspace root).
// -----------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// scripts → vigil-pwa-root → repo-root → vigil-core/src/analytics/posthog.ts
const pwaPath = path.join(here, '..', 'src', 'analytics', 'posthog.ts')
const corePath = path.join(here, '..', '..', 'vigil-core', 'src', 'analytics', 'posthog.ts')

function readOrFail(absPath, label) {
  try {
    return fs.readFileSync(absPath, 'utf8')
  } catch (err) {
    if (label === 'pwa') {
      console.error(
        `FAIL: vigil-pwa/src/analytics/posthog.ts missing — denylist parity check cannot run; check this workspace's file layout. Tried: ${absPath}. Underlying: ${err.message}`,
      )
    } else {
      console.error(
        `FAIL: monorepo layout broke parity test — fix the relative path or ship a sibling CI script (pnpm denylist-parity:ci). Tried: ${absPath}. Underlying: ${err.message}`,
      )
    }
    process.exit(1)
  }
}

function extractBlockedNames(src) {
  const anchorIdx = src.indexOf('BLOCKED_PROPERTY_NAMES')
  if (anchorIdx === -1) {
    console.error('FAIL: BLOCKED_PROPERTY_NAMES identifier not found — extraction regex must be updated')
    process.exit(1)
  }
  const setStartIdx = src.indexOf('new Set<string>([', anchorIdx)
  if (setStartIdx === -1) {
    console.error('FAIL: BLOCKED_PROPERTY_NAMES `new Set<string>([` literal not found after identifier')
    process.exit(1)
  }
  const closeIdx = src.indexOf('])', setStartIdx)
  if (closeIdx === -1) {
    console.error('FAIL: matching `])` for BLOCKED_PROPERTY_NAMES new Set<string>([ not found')
    process.exit(1)
  }
  const slice = src.slice(setStartIdx, closeIdx)
  const matches = slice.match(/['"]([^'"]+)['"]/g) ?? []
  return matches.map((m) => m.slice(1, -1)).sort()
}

const pwaSrc = readOrFail(pwaPath, 'pwa')
const coreSrc = readOrFail(corePath, 'core')

const pwaKeys = extractBlockedNames(pwaSrc)
const coreKeys = extractBlockedNames(coreSrc)

const onlyInPwa = pwaKeys.filter((k) => !coreKeys.includes(k))
const onlyInCore = coreKeys.filter((k) => !pwaKeys.includes(k))

if (onlyInPwa.length === 0 && onlyInCore.length === 0 && pwaKeys.length === coreKeys.length) {
  console.log(`OK: denylist parity verified — ${pwaKeys.length} keys identical across vigil-core and vigil-pwa`)
  process.exit(0)
}

console.error('FAIL: denylist parity broken — vigil-core and vigil-pwa BLOCKED_PROPERTY_NAMES drifted')
for (const k of onlyInPwa) console.error(`  +pwa-only: ${k}`)
for (const k of onlyInCore) console.error(`  -core-only: ${k}`)
process.exit(1)
