import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { GoogleStatusProvider, useGoogleStatus } from './GoogleStatusContext'

const wrapper = ({ children }: { children: ReactNode }) => (
  <GoogleStatusProvider>{children}</GoogleStatusProvider>
)

describe('useGoogleStatus (via GoogleStatusContext)', () => {
  beforeEach(() => {
    // Every test stubs its own fetch mock; reset between tests.
    vi.unstubAllGlobals()
    // WR-03: rely on setup.ts's memorySessionStorage shim (installed on both
    // globalThis and window) rather than stubbing a local Map-backed surface
    // that leaks across suites. Seed the JWT directly on the shared shim.
    sessionStorage.setItem('vigil_jwt', 'test-key')
  })
  afterEach(() => {
    // WR-03: remove the JWT so tests exercising the unauthenticated path in
    // other suites (client.test.ts, etc.) don't inherit an auth token.
    sessionStorage.removeItem('vigil_jwt')
  })

  it('returns status=null when api returns 404 (disconnected)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    )
    const { result } = renderHook(() => useGoogleStatus(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.status).toBeNull()
    expect(result.current.error).toBeNull() // 404 is NOT an error
  })

  it('refetch() triggers another fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ calendar: 'connected', gmail: 'connected' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useGoogleStatus(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.status).toBeNull()
    act(() => result.current.refetch())
    await waitFor(() =>
      expect(result.current.status).toEqual({
        calendar: 'connected',
        gmail: 'connected',
      }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('500 sets error, does not populate status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
    )
    const { result } = renderHook(() => useGoogleStatus(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toMatch(/500/)
    expect(result.current.status).toBeNull()
  })

  it('throws when used outside the provider', () => {
    // renderHook without wrapper — hook should throw the developer-error guard.
    // React logs the thrown error to console in test output; silence it.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useGoogleStatus())).toThrow(
      /useGoogleStatus must be used within GoogleStatusProvider/,
    )
    consoleError.mockRestore()
  })
})
