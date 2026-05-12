// ── Phase 127 GUARD-01.5 — Browser-side Sentry redactor unit tests ─────────────
// Symmetric to vigil-core/src/lib/sentry.test.ts. The PWA Sentry runtime
// (`@sentry/react`) needs the same `beforeSend` scrubber as vigil-core so audio
// PCM property names cannot leak via the Browser SDK either.
//
// Vitest (NOT node:test) per the PWA convention — see api-error-codes.test.ts.
//
// Defensive shape (RESEARCH §Pitfall 3 — mirrored from the Node version):
//   1. null event passes through unchanged.
//   2. Whole body wrapped in try/catch — on internal throw, returns the ORIGINAL
//      event reference (never undefined). Better to ship non-redacted than to
//      silently drop the event (beforeSend returning undefined drops it).
//   3. Inner bag walker is type-guarded — primitive contexts (e.g.
//      `event.contexts.os = "darwin"`) early-return instead of throwing.
//
// Run: cd vigil-pwa && pnpm test src/lib/sentry-redact.test.ts
// -----------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'

// Note: Browser SDK import — NOT @sentry/node. Validates the import path lands.
import { redactSentryEvent } from './sentry-redact'

describe('redactSentryEvent — GUARD-01.5 / D-01.5 (Browser side)', () => {
  it('GUARD-127-PWA-SENTRY-EXTRAS-STRIP: deletes audioPcm from event.extra, preserves benign keys', () => {
    const event = { extra: { audioPcm: 'secret-pcm-bytes', ok: 1 } } as unknown as Parameters<typeof redactSentryEvent>[0]
    const result = redactSentryEvent(event)
    const extra = (result as { extra?: Record<string, unknown> }).extra
    expect(extra?.audioPcm).toBeUndefined()
    expect(extra?.ok).toBe(1)
  })

  it('GUARD-127-PWA-SENTRY-PRIMITIVE-CONTEXT-NO-THROW: handles event.contexts.<name>=primitive without throwing', () => {
    const event = { contexts: { os: 'primitive-string-not-object' } } as unknown as Parameters<typeof redactSentryEvent>[0]
    expect(() => redactSentryEvent(event)).not.toThrow()
  })

  it('GUARD-127-PWA-SENTRY-BREADCRUMB-STRIP: deletes pcm from breadcrumbs[].data', () => {
    const event = {
      breadcrumbs: [{ data: { pcm: 'secret-bytes', kept: 'fine' } }],
    } as unknown as Parameters<typeof redactSentryEvent>[0]
    const result = redactSentryEvent(event)
    const bc = (result as { breadcrumbs?: Array<{ data?: Record<string, unknown> }> }).breadcrumbs
    expect(bc?.[0]?.data?.pcm).toBeUndefined()
    expect(bc?.[0]?.data?.kept).toBe('fine')
  })

  it('GUARD-127-PWA-SENTRY-NULL-EVENT: passes null through unchanged', () => {
    // beforeSend with null is theoretical for Browser SDK but defensive shape
    // says null-tolerant — mirrors the Node version verbatim.
    const result = redactSentryEvent(null as unknown as Parameters<typeof redactSentryEvent>[0])
    expect(result).toBeNull()
  })

  it('GUARD-127-PWA-SENTRY-GETTER-THROW-DEFENSE: returns original event reference if an internal getter throws', () => {
    // Pitfall-3 defensive shape: redactSentryEvent MUST NOT return undefined on
    // internal throw — that would silently drop the event from Sentry.
    const event = {} as { extra?: unknown }
    Object.defineProperty(event, 'extra', {
      get: () => {
        throw new Error('rogue getter')
      },
    })
    const result = redactSentryEvent(event as Parameters<typeof redactSentryEvent>[0])
    expect(result).toBe(event)
  })
})
