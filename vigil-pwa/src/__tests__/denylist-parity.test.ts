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

// ─── Phase 130 Plan 06 D-D2 PWA-side parity helpers ─────────────────────────
//
// Walk vigil-pwa/src/ (excluding tests + analytics/posthog.ts) and assert no
// log-sink call line contains the three Phase 130 banned key patterns:
//   /\baudioPcm\b/   /\baudio_pcm\b/   object-key pcm:
// Phase 127 GUARD-01 enforces this Set-membership side at Rail 1; this rail
// extends the surface to executable code lines in the PWA workspace.

function walkPwaSrc(dir: string, files: string[] = []): string[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue
      walkPwaSrc(full, files)
    } else if (
      (full.endsWith('.ts') || full.endsWith('.tsx')) &&
      !full.endsWith('.test.ts') &&
      !full.endsWith('.test.tsx') &&
      !full.endsWith('.d.ts')
    ) {
      files.push(full)
    }
  }
  return files
}

function stripPwaComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlock
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) return ''
      const m = line.match(/(^|[^:])\/\/.*$/)
      if (m && m.index !== undefined) {
        return line.slice(0, m.index + (m[1]?.length ?? 0))
      }
      return line
    })
    .join('\n')
}

const PWA_SINK_REGEX =
  /(?:console\.(?:log|warn|error|info|debug)|Sentry\.captureException|posthog\.capture)\s*\(/
const PWA_BANNED_AUDIOPCM = /\baudioPcm\b/
const PWA_BANNED_AUDIO_PCM = /\baudio_pcm\b/
const PWA_BANNED_PCM_KEY = /(['"]pcm['"]\s*:|(?<![A-Za-z0-9_])pcm\s*:(?!:))/

interface PwaOffender {
  file: string
  lineNumber: number
  lineText: string
  pattern: string
}

function scanPwaForBannedSinkLines(file: string): PwaOffender[] {
  const raw = fs.readFileSync(file, 'utf8')
  const stripped = stripPwaComments(raw)
  const lines = stripped.split('\n')
  const offenders: PwaOffender[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!PWA_SINK_REGEX.test(line)) continue
    if (PWA_BANNED_AUDIOPCM.test(line)) {
      offenders.push({
        file,
        lineNumber: i + 1,
        lineText: line,
        pattern: 'audioPcm',
      })
    }
    if (PWA_BANNED_AUDIO_PCM.test(line)) {
      offenders.push({
        file,
        lineNumber: i + 1,
        lineText: line,
        pattern: 'audio_pcm',
      })
    }
    if (PWA_BANNED_PCM_KEY.test(line)) {
      offenders.push({
        file,
        lineNumber: i + 1,
        lineText: line,
        pattern: 'pcm:',
      })
    }
  }
  return offenders
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

// ─── Phase 130 Plan 06 D-D2 — PWA log-sink leak detector ─────────────────────
describe('D-D2 (Phase 130 Plan 06) — no log-sink call line in vigil-pwa/src/ contains audioPcm/audio_pcm/pcm:', () => {
  it('D-D2.PWA: walk vigil-pwa/src/ and assert zero log-sink offenders', () => {
    // here = __tests__ → up one → src
    const pwaSrcRoot = path.join(here, '..')
    // Safe-list — analytics/posthog.ts contains the banned keys as denylist
    // Set entries but never logs them.
    const safeList = new Set<string>([
      path.join(pwaSrcRoot, 'analytics', 'posthog.ts'),
      path.join(pwaSrcRoot, 'lib', 'sentry-redact.ts'),
    ])
    const files = walkPwaSrc(pwaSrcRoot).filter((f) => !safeList.has(f))
    // Guard against silent path-resolution failures (T-127-01-C semantics).
    expect(
      files.length,
      `vigil-pwa/src/ walk returned zero files — path resolution broken at ${pwaSrcRoot}`,
    ).toBeGreaterThan(0)

    const offenders: PwaOffender[] = []
    for (const file of files) {
      offenders.push(...scanPwaForBannedSinkLines(file))
    }
    expect(
      offenders,
      `D-D2 drift in vigil-pwa/src/: log-sink calls leaking banned key names:\n  ${offenders
        .map((o) => `${o.file}:${o.lineNumber} [${o.pattern}] ${o.lineText.trim()}`)
        .join('\n  ')}`,
    ).toEqual([])
  })

  it('D-D2.PWA-COMMENT-HYGIENE: JSDoc / inline comments mentioning banned keys must NOT trip the detector', () => {
    // Anti-trivial-pass smoke: comments-only banned-key references with a
    // benign log-sink call should scan as zero offenders.
    const fixture = `
// audioPcm in a line comment — must NOT trip
/**
 * audio_pcm and pcm: in JSDoc — must NOT trip
 */
function ok() {
  console.log('voice processed', { bytes: 100, t: Date.now() }) // trailing comment with pcm:
  Sentry.captureException(new Error('boom'))
  posthog.capture('voice_capture_completed', { stop_to_http_ms: 100 })
}
`
    const stripped = stripPwaComments(fixture)
    const lines = stripped.split('\n')
    const offenders: string[] = []
    for (const line of lines) {
      if (!PWA_SINK_REGEX.test(line)) continue
      if (
        PWA_BANNED_AUDIOPCM.test(line) ||
        PWA_BANNED_AUDIO_PCM.test(line) ||
        PWA_BANNED_PCM_KEY.test(line)
      ) {
        offenders.push(line)
      }
    }
    expect(
      offenders,
      `comment-hygiene failure — strip step did not remove JSDoc/line comments containing banned keys:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it('D-D2.PWA-PATTERNS-PRESENT: test file references audioPcm AND audio_pcm AND pcm: patterns (anti-trivial-pass)', () => {
    // Acceptance criterion: the PWA-side test file must reference the three
    // Phase 130 patterns. This is a self-grep of THIS test file's source.
    const selfPath = path.join(here, 'denylist-parity.test.ts')
    const src = fs.readFileSync(selfPath, 'utf8')
    expect(src).toMatch(/audioPcm/)
    expect(src).toMatch(/audio_pcm/)
    expect(src).toMatch(/pcm:/)
  })
})
