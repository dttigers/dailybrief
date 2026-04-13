import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('api/client Google methods', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('getGoogleStatus returns null on 404', async () => {
    expect.fail('Plan 03: getGoogleStatus not yet exported')
  })

  it('getGoogleStatus throws on 500', async () => {
    expect.fail('Plan 03: getGoogleStatus error path not yet implemented')
  })

  it('disconnectGoogle calls DELETE /v1/google/tokens with bearer auth', async () => {
    expect.fail('Plan 03: disconnectGoogle not yet exported')
  })

  it('redirectToGoogleAuth sets window.location.href to API_BASE + /v1/auth/google', () => {
    expect.fail('Plan 03: redirectToGoogleAuth not yet exported')
  })
})
