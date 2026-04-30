import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// vi.hoisted ensures these spies are available in vi.mock factory functions,
// which are hoisted to the top of the module by vitest's transform.
const { navigateSpy, vigilFetchSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  vigilFetchSpy: vi.fn(),
}))

// Mock useNavigate — must be registered before importing VerifyEmailPage.
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => navigateSpy }
})

// Mock vigilFetch — used to verify it is NEVER called from VerifyEmailPage.
// The page uses raw fetch(), not vigilFetch(), per UI-SPEC §Notes-3.
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, vigilFetch: vigilFetchSpy }
})

// Imported AFTER the mocks are registered above.
import VerifyEmailPage from './VerifyEmailPage'
import { API_BASE } from '../api/client'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <VerifyEmailPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  navigateSpy.mockReset()
  vigilFetchSpy.mockReset()
  vi.stubGlobal('fetch', vi.fn())
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VerifyEmailPage (AUTH-11)', () => {
  // ── Apple Mail prefetch defense ──────────────────────────────────────────
  it('AUTH-11-P-MOUNT-NO-FETCH: does NOT call fetch on mount with a valid token', async () => {
    renderAt('/auth/verify?token=abc123')
    // Wait a tick to catch any stray useEffect-triggered fetch.
    await new Promise((r) => setTimeout(r, 30))
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(vigilFetchSpy).not.toHaveBeenCalled()
  })

  // ── Idle state copy (token present, pre-click) ───────────────────────────
  it('AUTH-11-P-IDLE-RENDERS-COPY: renders idle copy when token present', () => {
    renderAt('/auth/verify?token=abc123')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Verify your email')
    expect(
      screen.getByText('Click the button below to confirm your email address.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  // ── Missing token state ──────────────────────────────────────────────────
  it('AUTH-11-P-MISSING-TOKEN: renders missing-token copy when ?token absent', async () => {
    renderAt('/auth/verify')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'This verification link is malformed',
    )
    expect(
      screen.getByText('Please use the button in the email we sent you.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to app' })).toHaveAttribute('href', '/')
    // Still no fetch on mount even for missing-token state.
    await new Promise((r) => setTimeout(r, 30))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  // ── Confirm → 200 success swap in place ─────────────────────────────────
  it('AUTH-11-P2-CONFIRM-200: 200 → swaps in-place to success state (no redirect)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Email verified')
    })
    expect(screen.getByText('You can close this tab, or')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to app' })).toHaveAttribute('href', '/')
    // Exactly one fetch, correct URL + method + body.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe(`${API_BASE}/v1/auth/verify-email`)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({ token: 'abc123' })
    // No navigation triggered (in-place swap).
    expect(navigateSpy).not.toHaveBeenCalled()
  })

  // ── Confirm → 400 generic error (single-bucket) ──────────────────────────
  it('AUTH-11-P2-CONFIRM-400: 400 → single-bucket error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid or expired token' }),
      }),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'This link is no longer valid',
      )
    })
    expect(
      screen.getByText('Verification links expire after 24 hours and can only be used once.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to app' })).toHaveAttribute('href', '/')
  })

  // ── Confirm → 500 collapses to same single-bucket error ─────────────────
  it('AUTH-11-P2-CONFIRM-500: 5xx → same single-bucket error (D-21 collapse)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'This link is no longer valid',
      )
    })
    expect(
      screen.getByText('Verification links expire after 24 hours and can only be used once.'),
    ).toBeInTheDocument()
  })

  // ── Network error collapses to same single-bucket error ──────────────────
  it('AUTH-11-P2-CONFIRM-NETWORK: network error → same single-bucket error (D-21 collapse)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'This link is no longer valid',
      )
    })
  })

  // ── vigilFetch is NEVER called (raw fetch only) ───────────────────────────
  it('AUTH-11-P2-RAW-FETCH: vigilFetch is never called — page uses raw fetch() only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Email verified')
    })
    expect(vigilFetchSpy).not.toHaveBeenCalled()
  })

  // ── "Request a new link" → /settings when logged in ──────────────────────
  it('AUTH-11-P-LOGIN-DEST-LOGGED-IN: error state + JWT present → navigates to /settings', async () => {
    sessionStorage.setItem('vigil_jwt', 'test-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid or expired token' }),
      }),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Request a new link' }))
    expect(navigateSpy).toHaveBeenCalledWith('/settings')
  })

  // ── "Request a new link" → /auth when logged out ─────────────────────────
  it('AUTH-11-P-LOGIN-DEST-LOGGED-OUT: error state + no JWT → navigates to /auth', async () => {
    // sessionStorage is already clear (beforeEach).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid or expired token' }),
      }),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Request a new link' }))
    expect(navigateSpy).toHaveBeenCalledWith('/auth')
  })

  // ── No useEffect anywhere in VerifyEmailPage ─────────────────────────────
  // This is enforced statically via acceptance grep:
  //   grep -c useEffect vigil-pwa/src/pages/VerifyEmailPage.tsx → 0
  // The test below provides a runtime complement: after mount, fetch was NOT called.
  it('AUTH-11-P-USES-USE-MEMO: token is parsed via useMemo at render — no useEffect fetch', async () => {
    // By extension of AUTH-11-P-MOUNT-NO-FETCH, this confirms the no-useEffect
    // contract. Any useEffect that reads the token and fires fetch would have been
    // caught already. This test is a labeled alias for clarity.
    renderAt('/auth/verify?token=uniquetoken42')
    await new Promise((r) => setTimeout(r, 50))
    expect(globalThis.fetch).not.toHaveBeenCalled()
    // And the idle UI is rendered (token was parsed at render time via useMemo).
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Verify your email')
  })

  // ── Phase 117 (AUTH-12) — rate-limited bucket tests ─────────────────────

  it('AUTH-12-VEP-01-429-RENDERS-COUNTDOWN: 429 + Retry-After: 120 renders rate-limited UX with mm:ss', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
        }),
      ),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Too many attempts')
    })
    // Body shows initial countdown — 2m 0s (120 seconds).
    expect(screen.getByText(/Try again in 2m 0s\./)).toBeInTheDocument()
    // Confirm button is disabled while countdown active.
    const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    // Legacy "This link is no longer valid" copy is NOT rendered.
    expect(screen.queryByText(/This link is no longer valid/)).toBeNull()
  })

  it('AUTH-12-VEP-02-COUNTDOWN-TICKS: countdown ticks down each second and re-enables Confirm at zero', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '3', 'Content-Type': 'application/json' },
          }),
        ),
      )
      renderAt('/auth/verify?token=abc123')
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
      // Wait for the rate-limited UX to render (post-fetch).
      await waitFor(() => {
        expect(screen.getByText(/Try again in 0m 3s\./)).toBeInTheDocument()
      })
      // Tick 1s → 0m 2s
      await vi.advanceTimersByTimeAsync(1000)
      expect(screen.getByText(/Try again in 0m 2s\./)).toBeInTheDocument()
      // Tick another 1s → 0m 1s
      await vi.advanceTimersByTimeAsync(1000)
      expect(screen.getByText(/Try again in 0m 1s\./)).toBeInTheDocument()
      // Tick the final second → countdown clears AND state returns to idle.
      await vi.advanceTimersByTimeAsync(1000)
      await waitFor(() => {
        // Idle UX returns: 'Verify your email' heading, Confirm enabled, rate-limited copy gone.
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Verify your email')
      })
      const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement
      expect(confirm.disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('AUTH-12-VEP-03-NO-RETRYAFTER-FALLBACK: 429 with no Retry-After renders rate-limited copy WITHOUT countdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }, // no Retry-After
        }),
      ),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Too many attempts')
    })
    // No mm:ss countdown — generic fallback copy.
    expect(screen.queryByText(/\d+m \d+s/)).toBeNull()
    // Confirm button NOT disabled (no countdown to wait on).
    const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
  })

  it('AUTH-12-VEP-04-400-RENDERS-LEGACY-ERROR: 400 renders existing "This link is no longer valid" UX (D-21 preserved)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    renderAt('/auth/verify?token=abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/This link is no longer valid/)
    })
    // Rate-limited copy NOT rendered for 400 — D-21 single-bucket preserved for non-429.
    expect(screen.queryByText(/Too many attempts/)).toBeNull()
  })

  it('AUTH-12-VEP-05-CLEANUP-ON-UNMOUNT: unmounting mid-countdown does not warn about setState-after-unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
          }),
        ),
      )
      const { unmount } = renderAt('/auth/verify?token=abc123')
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
      await waitFor(() => {
        expect(screen.getByText(/Try again in 2m 0s\./)).toBeInTheDocument()
      })
      // Unmount mid-countdown.
      unmount()
      // Advance fake timers past where ticks would have fired post-unmount.
      await vi.advanceTimersByTimeAsync(5000)
      // No setState-after-unmount warnings should have been logged.
      const setStateWarnings = errorSpy.mock.calls.filter((call) =>
        String(call[0] ?? '').match(/state update on an unmounted|act\(\)/i),
      )
      expect(setStateWarnings.length).toBe(0)
    } finally {
      errorSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})
