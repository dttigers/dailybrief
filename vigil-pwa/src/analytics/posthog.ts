import posthog, { type PostHog } from 'posthog-js'

// ── Phase 103 D-04 carryforward — PostHog property-name denylist ─────────────
// Mirrors vigil-core/src/analytics/posthog.ts:32. Duplicated (NOT imported)
// across the workspace boundary by design — cross-workspace TS imports break
// Vite path resolution + workspace isolation. The Phase 127 GUARD-01 parity
// drift detector (src/__tests__/denylist-parity.test.ts) reads BOTH posthog.ts
// source files at test time and HARD-FAILS if the two Sets ever diverge.
// Sibling CI script: `pnpm denylist-parity:ci` runs the same diff.
//
// D-14 export exception (preserved from Phase 103): "Exported for tests and to
// make the rule grep-visible." The same exception covers the Browser-side
// Sentry redactor at src/lib/sentry-redact.ts which imports this Set.
export const BLOCKED_PROPERTY_NAMES = new Set<string>([
  // ── LOCKED as of Phase 103 D-04 ──
  'content',
  'body',
  'text',
  'message',
  'description',
  'title',
  'note',
  'transcript',
  // ── Phase 127 GUARD-01 EXTENSION — audio PCM denylist (D-01.5) ──
  'audioPcm',
  'audio_pcm',
  'pcm',
  'audio',
  'audioBuffer',
  'audio_buffer',
])

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined

export const ph: PostHog | null = key
  ? posthog.init(key, {
      api_host: 'https://us.i.posthog.com',
      capture_pageview: false, // D-16: no automatic pageviews (product events = Phase 105)
      autocapture: false, // D-12 discretion: manual capture only
      persistence: 'memory', // Pitfall 1: prevents all localStorage writes from posthog-js
    }) ?? null
  : null

export function captureException(
  err: unknown,
  context: Record<string, string | boolean | number | undefined> = {},
): void {
  const error = err instanceof Error ? err : new Error(String(err))
  ph?.captureException(error, context)
}

// WR-02: guard against repeat identify calls (StrictMode double-mount, /v1/me +
// handleAuthSuccess racing for the same session, HMR re-evaluation). posthog-js
// treats $identify as idempotent for the same distinct_id, but avoiding the
// duplicate call keeps debug traces clean and protects against future refactors.
let lastIdentifiedId: string | null = null
export function identifyUser(userId: string, email: string): void {
  if (lastIdentifiedId === userId) return
  lastIdentifiedId = userId
  ph?.identify(userId, { email })
}
