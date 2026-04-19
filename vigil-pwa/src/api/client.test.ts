import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getGoogleStatus, disconnectGoogle, redirectToGoogleAuth, getPrintSchedule, setPrintSchedule, signOut } from './client'

describe('api/client Google methods', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.setItem('vigil_jwt', 'test-key')
  })

  afterEach(() => {
    sessionStorage.removeItem('vigil_jwt')
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

describe('api/client PrintSchedule methods', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.setItem('vigil_jwt', 'test-key')
  })

  afterEach(() => {
    sessionStorage.removeItem('vigil_jwt')
  })

  it('getPrintSchedule returns parsed PrintSchedule on 200', async () => {
    const body = { hour: 6, minute: 0, enabled: true }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const result = await getPrintSchedule()
    expect(result).toEqual(body)
  })

  it('getPrintSchedule throws on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('error', { status: 500 })),
    )
    await expect(getPrintSchedule()).rejects.toThrow(/500/)
  })

  it('getPrintSchedule calls GET /v1/settings/print-schedule with bearer auth', async () => {
    const body = { hour: 7, minute: 30, enabled: false }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await getPrintSchedule()
    const call = fetchMock.mock.calls[0]
    expect(String(call[0])).toMatch(/\/v1\/settings\/print-schedule$/)
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('setPrintSchedule calls PUT /v1/settings/print-schedule with correct body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await setPrintSchedule({ hour: 7, minute: 30, enabled: true })
    const call = fetchMock.mock.calls[0]
    expect(String(call[0])).toMatch(/\/v1\/settings\/print-schedule$/)
    expect(call[1]?.method).toBe('PUT')
    expect(JSON.parse(call[1]?.body as string)).toEqual({ hour: 7, minute: 30, enabled: true })
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('setPrintSchedule throws on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('error', { status: 400 })),
    )
    await expect(setPrintSchedule({ hour: 7, minute: 30, enabled: true })).rejects.toThrow(/400/)
  })
})

describe('api/client signOut', () => {
  beforeEach(() => {
    sessionStorage.setItem('vigil_jwt', 'test-jwt')
    localStorage.setItem('vigil_api_key', 'legacy-key')
  })

  afterEach(() => {
    sessionStorage.removeItem('vigil_jwt')
    localStorage.removeItem('vigil_api_key')
  })

  it('clears sessionStorage JWT and legacy localStorage key', () => {
    expect(sessionStorage.getItem('vigil_jwt')).toBe('test-jwt')
    expect(localStorage.getItem('vigil_api_key')).toBe('legacy-key')
    signOut()
    expect(sessionStorage.getItem('vigil_jwt')).toBeNull()
    expect(localStorage.getItem('vigil_api_key')).toBeNull()
  })

  it('dispatches a vigil:signout CustomEvent on window', () => {
    const listener = vi.fn()
    window.addEventListener('vigil:signout', listener)
    try {
      signOut()
      expect(listener).toHaveBeenCalledTimes(1)
      const event = listener.mock.calls[0][0] as Event
      expect(event.type).toBe('vigil:signout')
    } finally {
      window.removeEventListener('vigil:signout', listener)
    }
  })

  it('fires the event after clearing storage (listener sees cleared state)', () => {
    let jwtDuringEvent: string | null = 'not-yet-observed'
    const listener = () => {
      jwtDuringEvent = sessionStorage.getItem('vigil_jwt')
    }
    window.addEventListener('vigil:signout', listener)
    try {
      signOut()
      expect(jwtDuringEvent).toBeNull()
    } finally {
      window.removeEventListener('vigil:signout', listener)
    }
  })
})
