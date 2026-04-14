import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getGoogleStatus, disconnectGoogle, redirectToGoogleAuth } from './client'

describe('api/client Google methods', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.setItem('vigil_api_key', 'test-key')
  })

  afterEach(() => {
    localStorage.removeItem('vigil_api_key')
  })

  it('getGoogleStatus returns null on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    )
    expect(await getGoogleStatus()).toBeNull()
  })

  it('getGoogleStatus returns parsed body on 200', async () => {
    const body = { calendar: 'connected', gmail: 'needs_auth' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    expect(await getGoogleStatus()).toEqual(body)
  })

  it('getGoogleStatus throws on 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
    )
    await expect(getGoogleStatus()).rejects.toThrow(/500/)
  })

  it('disconnectGoogle calls DELETE /v1/google/tokens with bearer auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await disconnectGoogle()
    const call = fetchMock.mock.calls[0]
    expect(String(call[0])).toMatch(/\/v1\/google\/tokens$/)
    expect(call[1]?.method).toBe('DELETE')
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('redirectToGoogleAuth sets window.location.href to /v1/auth/google', () => {
    const original = window.location
    // @ts-expect-error jsdom test override
    delete window.location
    // @ts-expect-error jsdom test override
    window.location = { href: '' } as Location
    redirectToGoogleAuth()
    expect(window.location.href).toMatch(/\/v1\/auth\/google$/)
    // @ts-expect-error restore
    window.location = original
  })
})
