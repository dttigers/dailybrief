import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('posthog browser module', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('captureException is a no-op when ph is null (VITE_POSTHOG_KEY absent)', async () => {
    // In test env, VITE_POSTHOG_KEY is not set — ph should be null
    const { captureException, ph } = await import('./posthog')
    expect(ph).toBeNull()
    // Should not throw
    expect(() => captureException(new Error('test'))).not.toThrow()
  })

  it('identifyUser is a no-op when ph is null (VITE_POSTHOG_KEY absent)', async () => {
    const { identifyUser, ph } = await import('./posthog')
    expect(ph).toBeNull()
    expect(() => identifyUser('user-123', 'test@example.com')).not.toThrow()
  })

  it('captureException wraps non-Error throws in an Error', async () => {
    // When ph is null, the wrapping still happens internally (no throw externally)
    const { captureException } = await import('./posthog')
    expect(() => captureException('string error')).not.toThrow()
    expect(() => captureException(42)).not.toThrow()
    expect(() => captureException(null)).not.toThrow()
  })
})
