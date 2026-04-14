import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    // Node 24+ ships a native localStorage that shadows jsdom's per-window
    // storage. Stub it with a simple Map so `getStoredKey()` returns a key
    // without needing a backing file.
    const store = new Map<string, string>([['vigil_api_key', 'test-key']])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
      key: () => null,
      length: store.size,
    })
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
