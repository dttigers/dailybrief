// ── Phase 127 GUARD-01 — Cross-workspace denylist parity drift detector ───────
// Reads BOTH vigil-pwa/src/analytics/posthog.ts AND
// vigil-core/src/analytics/posthog.ts at test time via `fs.readFileSync`,
// extracts the BLOCKED_PROPERTY_NAMES Set membership via regex, and asserts
// the two Sets are identical (size + content, sorted comparison).
//
// HARD-FAIL on cross-workspace read failure (T-127-01-C closure tightened —
// NO size-only degraded fallback). If the relative path from this test file to
// vigil-core/src/analytics/posthog.ts cannot resolve (monorepo layout
// changed, vigil-core renamed, etc.), the test FAILS with a named-error
// message pointing the developer at the sibling CI script
// `pnpm denylist-parity:ci`.
//
// Symmetric protection at CI: scripts/denylist-parity-ci.mjs runs the same
// diff with the same hard-fail semantics. If a future commit accidentally
// deletes this test file, the npm script still trips on drift.
//
// Run: cd vigil-pwa && pnpm test src/__tests__/denylist-parity.test.ts
// -----------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// __tests__ → src → vigil-pwa → repo-root → vigil-core/src/analytics/posthog.ts
const pwaPath = path.join(here, '..', 'analytics', 'posthog.ts')
const corePath = path.join(here, '..', '..', '..', 'vigil-core', 'src', 'analytics', 'posthog.ts')

function readOrThrow(absPath: string, label: 'pwa' | 'core'): string {
  try {
    return fs.readFileSync(absPath, 'utf8')
  } catch (err) {
    if (label === 'pwa') {
      throw new Error(
        `vigil-pwa/src/analytics/posthog.ts missing — denylist test cannot run; check this workspace's file layout. Tried: ${absPath}. Underlying: ${(err as Error).message}`,
      )
    }
    // Cross-workspace read failure → hard fail with sibling-script path.
    throw new Error(
      `monorepo layout broke parity test — fix the relative path or ship a sibling CI script (pnpm denylist-parity:ci). Tried: ${absPath}. Underlying: ${(err as Error).message}`,
    )
  }
}

// Extract the literal Set entries from the BLOCKED_PROPERTY_NAMES Set
// definition specifically. vigil-core's posthog.ts has a SECOND
// `new Set<string>([` block (SENSITIVE_ROUTES) higher in the file, so a
// naive `indexOf('new Set<string>([')` would grab the wrong one. Anchor on
// the BLOCKED_PROPERTY_NAMES identifier first, then walk forward to the
// `new Set<string>([` literal.
function extractBlockedNames(src: string): string[] {
  const anchorIdx = src.indexOf('BLOCKED_PROPERTY_NAMES')
  if (anchorIdx === -1) {
    throw new Error(
      'BLOCKED_PROPERTY_NAMES identifier not found — extraction regex must be updated',
    )
  }
  const setStartIdx = src.indexOf('new Set<string>([', anchorIdx)
  if (setStartIdx === -1) {
    throw new Error(
      'BLOCKED_PROPERTY_NAMES `new Set<string>([` literal not found after identifier — extraction regex must be updated',
    )
  }
  const closeIdx = src.indexOf('])', setStartIdx)
  if (closeIdx === -1) {
    throw new Error('matching `])` for BLOCKED_PROPERTY_NAMES new Set<string>([ not found')
  }
  const slice = src.slice(setStartIdx, closeIdx)
  const matches = slice.match(/['"]([^'"]+)['"]/g) ?? []
  return matches.map((m) => m.slice(1, -1)).sort()
}

describe('denylist parity — vigil-core ↔ vigil-pwa (GUARD-01 / T-127-01-C)', () => {
  it('GUARD-127-PARITY-SETS-EQUAL: BLOCKED_PROPERTY_NAMES Sets identical across workspaces', () => {
    const pwaSrc = readOrThrow(pwaPath, 'pwa')
    const coreSrc = readOrThrow(corePath, 'core')

    const pwaKeys = extractBlockedNames(pwaSrc)
    const coreKeys = extractBlockedNames(coreSrc)

    // Custom error message names the diff so failures are debuggable.
    const onlyInPwa = pwaKeys.filter((k) => !coreKeys.includes(k))
    const onlyInCore = coreKeys.filter((k) => !pwaKeys.includes(k))
    const diffMsg =
      onlyInPwa.length || onlyInCore.length
        ? `\n  only in vigil-pwa: ${JSON.stringify(onlyInPwa)}\n  only in vigil-core: ${JSON.stringify(onlyInCore)}`
        : ''

    expect(
      pwaKeys,
      `denylist parity broken — vigil-core and vigil-pwa BLOCKED_PROPERTY_NAMES drifted${diffMsg}`,
    ).toEqual(coreKeys)
  })

  it('GUARD-127-PARITY-SMOKE-AUDIOPCM: both source files contain literal "audioPcm" (anti-trivial-pass smoke)', () => {
    // Guarantees the test isn't passing trivially against two empty arrays —
    // both files MUST contain the Phase 127 audio extension key.
    const pwaSrc = readOrThrow(pwaPath, 'pwa')
    const coreSrc = readOrThrow(corePath, 'core')
    expect(pwaSrc).toMatch(/['"]audioPcm['"]/)
    expect(coreSrc).toMatch(/['"]audioPcm['"]/)
  })
})
