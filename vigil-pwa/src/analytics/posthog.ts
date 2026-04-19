import posthog, { type PostHog } from 'posthog-js'

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
