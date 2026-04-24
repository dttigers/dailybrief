import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getGoogleStatus, disconnectGoogle, redirectToGoogleAuth, getPrintSchedule, setPrintSchedule, signOut, vigilFetch } from './client'

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

// ── Phase 110 (AUTH-09 D-19): global 'Session expired' handler ─────────────
//
// Test framework: vitest (confirmed by client.test.ts:1). Patterns mirror the
// existing tests above: vi.stubGlobal for fetch + window.location, with
// vi.restoreAllMocks() in beforeEach for cleanup (matches line 6).

describe("vigilFetch — D-19 'Session expired' handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.setItem('vigil_jwt', 'test-jwt')
  })

  afterEach(() => {
    sessionStorage.removeItem('vigil_jwt')
  })

  it("triggers signOut + navigation when 401 body is { error: 'Session expired' }", async () => {
    const signoutSpy = vi.fn()
    window.addEventListener('vigil:signout', signoutSpy)

    // Use vi.stubGlobal for both fetch and location — matches existing pattern
    // at lines 15-19 (fetch); auto-cleaned by vi.restoreAllMocks() in beforeEach.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 }),
      ),
    )
    vi.stubGlobal('location', { href: '' })

    const res = await vigilFetch('/v1/some-authenticated-route')

    // Sign-out event fired
    expect(signoutSpy).toHaveBeenCalledTimes(1)
    // Storage cleared by signOut()
    expect(sessionStorage.getItem('vigil_jwt')).toBeNull()
    // Navigation forced
    expect(window.location.href).toBe('/auth')
    // Original response still readable by caller
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Session expired')

    window.removeEventListener('vigil:signout', signoutSpy)
  })

  it("does NOT trigger signOut for 401 with a DIFFERENT body ('Invalid credentials')", async () => {
    const signoutSpy = vi.fn()
    window.addEventListener('vigil:signout', signoutSpy)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 }),
      ),
    )
    vi.stubGlobal('location', { href: '' })

    const res = await vigilFetch('/v1/auth/change-password', { method: 'POST' })

    expect(signoutSpy).toHaveBeenCalledTimes(0)
    // Storage NOT cleared
    expect(sessionStorage.getItem('vigil_jwt')).toBe('test-jwt')
    // No navigation
    expect(window.location.href).toBe('')
    // Caller can still read body
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid credentials')

    window.removeEventListener('vigil:signout', signoutSpy)
  })

  it("does NOT throw on a non-JSON 401 body", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('<html>401 Unauthorized</html>', {
          status: 401,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    vi.stubGlobal('location', { href: '' })

    // Must not throw
    const res = await vigilFetch('/v1/some-route')
    expect(res.status).toBe(401)
    // Storage NOT cleared (body did not match)
    expect(sessionStorage.getItem('vigil_jwt')).toBe('test-jwt')
  })

  it("passes through 200 responses unchanged", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    )

    const res = await vigilFetch('/v1/some-route')
    expect(res.status).toBe(200)
    expect(sessionStorage.getItem('vigil_jwt')).toBe('test-jwt')
  })
})
