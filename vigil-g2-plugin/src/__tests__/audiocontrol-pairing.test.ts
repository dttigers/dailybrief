// Phase 130 Plan 06 — D-D3 audioControl pairing parity drift detector.
//
// Walks `vigil-g2-plugin/src/` recursively and counts occurrences of
// `safeAudioControl(true,` and `safeAudioControl(false,` as literal substrings
// across all NON-test `.ts` files. The two counts MUST be equal — an orphan
// `(true,` call without a matching `(false,` is the exact bug class that
// Phase 127 GUARD-02 cleanup hooks paper over but should never need to.
//
// Source: 130-06-PLAN.md D-D3 + 130-CONTEXT.md D-D3 + 130-PATTERNS.md lines
// 821-838.
//
// Comment hygiene (CRITICAL — Plan 06 Task 3 "Grep gate hygiene" rule):
// naive `grep -c` is forbidden because JSDoc / inline-comment prose about
// `safeAudioControl(true,` would self-trip the detector. Block comments and
// line comments are stripped BEFORE counting.
//
// Excluded paths:
//   - any path containing `/__tests__/` or ending `.test.ts` (test files
//     legitimately reference the literal call form to assert behavior)
//   - `vigil-g2-plugin/src/lib/audio-session-guard.ts` itself — the wrapper
//     implementation; its 4 cleanup hooks call `bridge.audioControl(false)`
//     not `safeAudioControl(false,`, so it contributes zero counts. The
//     exclusion is documented so future readers understand the asymmetry.
//
// Today (Plan 04 voice.ts is well-formed): the START path has one
// `safeAudioControl(true,` and the STOP path has one `safeAudioControl(false,`.
// All other callers route through voice.ts. Counts: 1 === 1.
//
// Run: cd vigil-g2-plugin && npx tsx --test src/__tests__/audiocontrol-pairing.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

// here = vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts
// pluginSrcRoot = vigil-g2-plugin/src/
const here = path.dirname(url.fileURLToPath(import.meta.url))
const PLUGIN_SRC_ROOT = path.join(here, '..')

// ─── Walk + comment-strip helpers ────────────────────────────────────────────

function walkPluginSrc(dir: string, files: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      // Skip nested __tests__ directories outright — test files legitimately
      // contain the literal call shape and would inflate counts asymmetrically.
      if (entry === '__tests__') continue
      walkPluginSrc(full, files)
    } else if (
      full.endsWith('.ts') &&
      !full.endsWith('.test.ts') &&
      !full.endsWith('.d.ts')
    ) {
      files.push(full)
    }
  }
  return files
}

/**
 * Strip block comments (`/* … * /`) and single-line `//` comments so JSDoc
 * prose about `safeAudioControl(true, …)` does not inflate counts.
 */
function stripComments(src: string): string {
  // Strip block comments first (greedy across lines).
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Strip line comments. Preserve line count by emitting empty strings for
  // pure-comment lines so line numbers stay aligned for offender reporting.
  return noBlock
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) return ''
      // Strip trailing `//` comments. Be careful with strings — a naive
      // split('//') would mangle `'http://…'`. Conservative: find `//` NOT
      // preceded by `:` (rules out `://`).
      const m = line.match(/(^|[^:])\/\/.*$/)
      if (m && m.index !== undefined) {
        return line.slice(0, m.index + (m[1]?.length ?? 0))
      }
      return line
    })
    .join('\n')
}

// ─── Counting helper ─────────────────────────────────────────────────────────
//
// Count literal substring occurrences (NOT regex — the call form is fixed:
// `safeAudioControl(true,` / `safeAudioControl(false,`). The trailing comma is
// part of the literal because we are counting CALLS specifically — function
// declarations and type signatures use a different shape.

interface FileCounts {
  file: string
  trueCount: number
  falseCount: number
  trueLines: number[]
  falseLines: number[]
}

function countLiteralOccurrences(src: string, needle: string): { count: number; lineNumbers: number[] } {
  const lines = src.split('\n')
  let count = 0
  const lineNumbers: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let idx = 0
    let lineCount = 0
    while ((idx = line.indexOf(needle, idx)) !== -1) {
      lineCount++
      idx += needle.length
    }
    if (lineCount > 0) {
      count += lineCount
      lineNumbers.push(i + 1)
    }
  }
  return { count, lineNumbers }
}

function countCallsInFile(file: string): FileCounts {
  const raw = readFileSync(file, 'utf8')
  const stripped = stripComments(raw)
  const t = countLiteralOccurrences(stripped, 'safeAudioControl(true,')
  const f = countLiteralOccurrences(stripped, 'safeAudioControl(false,')
  return {
    file,
    trueCount: t.count,
    falseCount: f.count,
    trueLines: t.lineNumbers,
    falseLines: f.lineNumbers,
  }
}

// ─── Excluded paths ──────────────────────────────────────────────────────────

const EXCLUDED_FILES = new Set<string>([
  // The audio-session-guard.ts wrapper itself — its 4 cleanup hooks reference
  // `bridge.audioControl(false)` not `safeAudioControl(false,`, so the file
  // contributes zero counts. Exclusion is documented in CONTEXT D-D3.
  path.join(PLUGIN_SRC_ROOT, 'lib', 'audio-session-guard.ts'),
])

// ─── Tests ───────────────────────────────────────────────────────────────────

test('D-D3: safeAudioControl(true,…) count === safeAudioControl(false,…) count across vigil-g2-plugin/src/', () => {
  const files = walkPluginSrc(PLUGIN_SRC_ROOT).filter((f) => !EXCLUDED_FILES.has(f))
  assert.ok(
    files.length > 0,
    `walk returned zero non-test .ts files — path resolution broken at ${PLUGIN_SRC_ROOT}`,
  )

  const perFile: FileCounts[] = []
  let totalTrue = 0
  let totalFalse = 0
  for (const file of files) {
    const counts = countCallsInFile(file)
    if (counts.trueCount > 0 || counts.falseCount > 0) {
      perFile.push(counts)
      totalTrue += counts.trueCount
      totalFalse += counts.falseCount
    }
  }

  // Build a useful failure message naming the offending file(s) when imbalanced.
  if (totalTrue !== totalFalse) {
    const offenderLines = perFile
      .filter((c) => c.trueCount !== c.falseCount)
      .map(
        (c) =>
          `  ${path.relative(PLUGIN_SRC_ROOT, c.file)}: true=${c.trueCount} (lines ${c.trueLines.join(', ') || 'none'}) vs false=${c.falseCount} (lines ${c.falseLines.join(', ') || 'none'})`,
      )
    const breakdownLines = perFile.map(
      (c) =>
        `  ${path.relative(PLUGIN_SRC_ROOT, c.file)}: true=${c.trueCount}, false=${c.falseCount}`,
    )
    assert.equal(
      totalTrue,
      totalFalse,
      [
        `D-D3 drift: safeAudioControl(true,…) count (${totalTrue}) !== safeAudioControl(false,…) count (${totalFalse}).`,
        '',
        'Unbalanced files (true count != false count within the same file):',
        offenderLines.length > 0 ? offenderLines.join('\n') : '  (none — imbalance is global, not local; check that every START path has a matching STOP path)',
        '',
        'Full breakdown:',
        breakdownLines.join('\n'),
      ].join('\n'),
    )
  }

  // Anti-trivial-pass: counts must be > 0, otherwise the test would pass on
  // an empty source tree (e.g. all callers accidentally deleted).
  assert.ok(
    totalTrue >= 1,
    'D-D3 anti-trivial-pass: total safeAudioControl(true,…) count is 0 — the plugin must have at least one mic-START path',
  )
})

test('D-D3 comment hygiene: JSDoc / inline comments containing safeAudioControl(true,…) MUST NOT inflate the count', () => {
  // Anti-trivial-pass: a synthetic source with the call form ONLY inside
  // comments must scan as zero counts. Without this, someone could weaken
  // stripComments() and the parity assertion would still trivially pass on
  // imbalanced real code.
  const fixture = `
// safeAudioControl(true, bridge) — mentioned in a line comment, must NOT count
/**
 * START path: safeAudioControl(true, bridge)
 * STOP  path: safeAudioControl(false, bridge)
 * Both mentions are JSDoc prose — must NOT count.
 */
function ok() {
  // safeAudioControl(true, bridge) — inline line comment, must NOT count
  return 0
}
`
  const stripped = stripComments(fixture)
  const t = countLiteralOccurrences(stripped, 'safeAudioControl(true,')
  const f = countLiteralOccurrences(stripped, 'safeAudioControl(false,')
  assert.equal(
    t.count,
    0,
    `comment hygiene failure — stripComments did not remove comment-only safeAudioControl(true,…) (found ${t.count})`,
  )
  assert.equal(
    f.count,
    0,
    `comment hygiene failure — stripComments did not remove comment-only safeAudioControl(false,…) (found ${f.count})`,
  )
})

test('D-D3 excluded paths: audio-session-guard.ts is excluded from the count', () => {
  // Defensive — if the exclusion regresses, surface explicitly. The wrapper
  // file uses bridge.audioControl(true/false) (without `safe` prefix), so a
  // missing exclusion would NOT change today's counts. But preserving the
  // assertion documents the intent for future refactors.
  const guardPath = path.join(PLUGIN_SRC_ROOT, 'lib', 'audio-session-guard.ts')
  assert.ok(
    EXCLUDED_FILES.has(guardPath),
    `audio-session-guard.ts must be in EXCLUDED_FILES — wrapper implementation is exempt from caller pairing`,
  )
})

test('D-D3 imbalance message: failure mode prints offender file(s) AND both counts', () => {
  // Self-test of the failure message shape — we synthesize the imbalance
  // detection logic against a fixture and assert the message format. This
  // way, when a REAL imbalance occurs in CI, developers see useful output.
  const fakePerFile: FileCounts[] = [
    {
      file: '/fake/screens/voice.ts',
      trueCount: 2,
      falseCount: 1,
      trueLines: [10, 20],
      falseLines: [30],
    },
  ]
  const offenderLines = fakePerFile
    .filter((c) => c.trueCount !== c.falseCount)
    .map(
      (c) =>
        `  ${path.relative('/fake', c.file)}: true=${c.trueCount} (lines ${c.trueLines.join(', ')}) vs false=${c.falseCount} (lines ${c.falseLines.join(', ')})`,
    )
  assert.equal(offenderLines.length, 1)
  assert.match(offenderLines[0], /voice\.ts: true=2.*vs false=1/)
})
