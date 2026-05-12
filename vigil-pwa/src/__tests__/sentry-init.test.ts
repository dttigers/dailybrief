// ── Phase 127 GUARD-01.5 — PWA Sentry init drift detector ────────────────────
// Source-greps vigil-pwa/src/main.tsx for the literal
// `beforeSend: redactSentryEvent` registration in the Sentry.init body.
// Symmetric to vigil-core/src/__tests__/audio-log-redaction.test.ts Rail 2
// (which pins the same on the Node side).
//
// Fails CI if a future commit removes `beforeSend: redactSentryEvent` from
// main.tsx OR if the import of redactSentryEvent disappears. This upgrades
// T-127-01-D from `accept` → `mitigate` per checker feedback.
//
// Run: cd vigil-pwa && pnpm test src/__tests__/sentry-init.test.ts
// -----------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// __tests__ → src → main.tsx (sibling of src/)
const mainPath = path.join(here, '..', 'main.tsx')

describe('main.tsx Sentry init pin — GUARD-01.5 / T-127-01-D', () => {
  it('GUARD-127-PWA-SENTRY-INIT-BEFORESEND: main.tsx registers beforeSend: redactSentryEvent and imports it', () => {
    const src = fs.readFileSync(mainPath, 'utf8')

    // Two literal greps — both required.
    const hasBeforeSend = src.includes('beforeSend: redactSentryEvent')
    const hasImport = src.includes('import { redactSentryEvent }')

    expect(
      hasBeforeSend && hasImport,
      'vigil-pwa/src/main.tsx must register beforeSend: redactSentryEvent in Sentry.init — GUARD-01.5 / T-127-01-D mitigation',
    ).toBe(true)
  })
})
