// vigil-pwa/src/lib/sentry-redact.ts
// Phase 127 GUARD-01.5 — Browser-side Sentry `beforeSend` redactor.
//
// Structural twin of vigil-core/src/lib/sentry.ts `redactSentryEvent`. Both
// runtimes (Node + Browser) must scrub the same 14-key denylist before any
// Sentry event hits the SaaS — vigil-pwa is a separate workspace and the
// Browser SDK (`@sentry/react`) is the last in-runtime scrub point on the PWA
// side.
//
// SOURCE OF TRUTH: BLOCKED_PROPERTY_NAMES is imported from
// ../analytics/posthog (mirroring the vigil-core D-14 export exception —
// exported for tests and to make the rule grep-visible). The denylist is
// duplicated across the vigil-core ↔ vigil-pwa workspace boundary on purpose;
// cross-workspace TS imports break Vite path resolution and workspace
// isolation. Parity is enforced at CI time by:
//   1. src/__tests__/denylist-parity.test.ts (Vitest, HARD-FAILS on
//      cross-workspace read failure with a named-error path to the sibling
//      CI script — T-127-01-C closure tightened: NO size-only fallback)
//   2. scripts/denylist-parity-ci.mjs (sibling node script run via
//      `pnpm denylist-parity:ci`; same diff, exit 1 on mismatch)
//
// REGISTRATION FORM: in main.tsx the hook MUST be registered as a function
// reference, NOT an inline arrow. The drift detector at
// src/__tests__/sentry-init.test.ts greps for the literal
// `beforeSend: redactSentryEvent` token in main.tsx — symmetric to the Node
// side's Rail 2 source-grep (T-127-01-D upgraded from accept → mitigate).
//
// Defensive shape (RESEARCH §Pitfall 3 — verbatim from the Node version):
//   1. null event passes through unchanged.
//   2. Whole body wrapped in try/catch — on internal throw, returns the
//      ORIGINAL event reference (never undefined). Better to ship a
//      non-redacted event than to lose it entirely: a beforeSend hook that
//      returns undefined silently DROPS the event from Sentry.
//   3. Inner bag walker is type-guarded — primitive contexts (e.g.
//      `event.contexts.os = "darwin"`) early-return instead of throwing.

import type { ErrorEvent, EventHint } from '@sentry/react'
import { BLOCKED_PROPERTY_NAMES } from '../analytics/posthog'

export function redactSentryEvent(
  event: ErrorEvent | null,
  _hint?: EventHint,
): ErrorEvent | null {
  if (event === null || event === undefined) return event
  try {
    const stripFromBag = (bag: unknown): void => {
      if (typeof bag !== 'object' || bag === null) return
      const rec = bag as Record<string, unknown>
      for (const k of Object.keys(rec)) {
        if (BLOCKED_PROPERTY_NAMES.has(k)) {
          delete rec[k]
        }
      }
    }

    // event.extra
    stripFromBag((event as { extra?: unknown }).extra)

    // event.contexts — each named context bag
    const contexts = (event as { contexts?: unknown }).contexts
    if (typeof contexts === 'object' && contexts !== null) {
      for (const ctxName of Object.keys(contexts as Record<string, unknown>)) {
        stripFromBag((contexts as Record<string, unknown>)[ctxName])
      }
    }

    // event.breadcrumbs[].data
    const crumbs = (event as { breadcrumbs?: unknown }).breadcrumbs
    if (Array.isArray(crumbs)) {
      for (const bc of crumbs) {
        if (typeof bc === 'object' && bc !== null) {
          stripFromBag((bc as { data?: unknown }).data)
        }
      }
    }

    return event
  } catch {
    // Internal throw (rogue getter, exotic proxy, etc.) — return the
    // original event reference unchanged. NEVER return undefined: a
    // beforeSend hook that returns undefined silently drops the event
    // (RESEARCH §Pitfall 3 — "better to ship non-redacted than nothing").
    return event
  }
}
