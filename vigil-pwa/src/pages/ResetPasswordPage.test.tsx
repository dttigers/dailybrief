import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// Mock useNavigate so tests can assert on navigation calls.
// This mock must be registered BEFORE importing ResetPasswordPage so the page
// picks up the mocked hook at import time.
const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Imported AFTER the mock is registered (above).
import ResetPasswordPage from './ResetPasswordPage'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders invalid-token UX when ?token is missing at mount (D-18)', () => {
    renderAt('/auth/reset')
    expect(
      screen.getByRole('heading', { name: /this link is no longer valid/i }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
  })

  it('renders form when ?token=abc is present', () => {
    renderAt('/auth/reset?token=abc-test-token-xyz')
    expect(
      screen.getByRole('heading', { name: /set a new password/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
  })

  it('does NOT call fetch on mount (D-18 form-submit gate; Apple Mail pre-fetch defense)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderAt('/auth/reset?token=abc-test-token-xyz')
    // Wait a tick to catch any stray useEffect-triggered fetch.
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submit happy path (200) navigates to /auth?reason=password_reset (load-bearing string)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ ok: true, message: 'Password reset successful. You can now log in.' }),
      }),
    )
    renderAt('/auth/reset?token=abc-test-token-xyz')
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'ValidNewPass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth?reason=password_reset')
    })
  })

  it('submit returns 400 → renders invalid-token UX (D-20 single-bucket; no form)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ error: 'Invalid or expired token' }),
      }),
    )
    renderAt('/auth/reset?token=abc-test-token-xyz')
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'ValidNewPass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /this link is no longer valid/i }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
  })

  it('AUTH-12-RPP-01-429-RENDERS-COUNTDOWN: 429 + Retry-After: 120 renders rate-limited UX with mm:ss (form unmounts)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
        }),
      ),
    )
    renderAt('/auth/reset?token=abc-test-token-xyz')
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'ValidNewPass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Too many attempts')
    })
    expect(screen.getByText(/Try again in 2m 0s\./)).toBeInTheDocument()
    // Form unmounted — password input gone.
    expect(screen.queryByLabelText(/new password/i)).toBeNull()
    // Legacy "This link is no longer valid" not rendered.
    expect(screen.queryByText(/This link is no longer valid/)).toBeNull()
  })

  it('AUTH-12-RPP-02-COUNTDOWN-TICKS: countdown ticks down each second and form returns at zero', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '3', 'Content-Type': 'application/json' },
          }),
        ),
      )
      renderAt('/auth/reset?token=abc-test-token-xyz')
      fireEvent.change(screen.getByLabelText(/new password/i), {
        target: { value: 'ValidNewPass123!' },
      })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
      await waitFor(() => {
        expect(screen.getByText(/Try again in 0m 3s\./)).toBeInTheDocument()
      })
      // Tick 1s → 0m 2s
      await act(async () => { vi.advanceTimersByTime(1000) })
      expect(screen.getByText(/Try again in 0m 2s\./)).toBeInTheDocument()
      // Tick 1s → 0m 1s
      await act(async () => { vi.advanceTimersByTime(1000) })
      expect(screen.getByText(/Try again in 0m 1s\./)).toBeInTheDocument()
      // Tick the final second → form returns.
      await act(async () => { vi.advanceTimersByTime(1000) })
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Set a new password/i)
      })
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('AUTH-12-RPP-03-NO-RETRYAFTER-FALLBACK: 429 with no Retry-After renders rate-limited copy WITHOUT countdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }, // no Retry-After
        }),
      ),
    )
    renderAt('/auth/reset?token=abc-test-token-xyz')
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'ValidNewPass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Too many attempts')
    })
    // No mm:ss countdown.
    expect(screen.queryByText(/\d+m \d+s/)).toBeNull()
  })

  it('AUTH-12-RPP-04-400-RENDERS-LEGACY-INVALID-TOKEN: 400 renders existing tokenInvalid UX (D-20 preserved)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    renderAt('/auth/reset?token=abc-test-token-xyz')
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'ValidNewPass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/This link is no longer valid/)
    })
    expect(screen.queryByText(/Too many attempts/)).toBeNull()
  })

  it('AUTH-12-RPP-05-CLEANUP-ON-UNMOUNT: unmounting mid-countdown does not warn about setState-after-unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
          }),
        ),
      )
      const { unmount } = renderAt('/auth/reset?token=abc-test-token-xyz')
      fireEvent.change(screen.getByLabelText(/new password/i), {
        target: { value: 'ValidNewPass123!' },
      })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
      await waitFor(() => {
        expect(screen.getByText(/Try again in 2m 0s\./)).toBeInTheDocument()
      })
      unmount()
      await act(async () => { vi.advanceTimersByTime(5000) })
      const setStateWarnings = errorSpy.mock.calls.filter((call) =>
        String(call[0] ?? '').match(/state update on an unmounted|act\(\)/i),
      )
      expect(setStateWarnings.length).toBe(0)
    } finally {
      errorSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('AUTH-12-RPP-06-PASSWORD-PRESERVED-ACROSS-429-IDLE: typed password is preserved across rate_limited → idle transition', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '1', 'Content-Type': 'application/json' },
          }),
        ),
      )
      renderAt('/auth/reset?token=abc-test-token-xyz')
      fireEvent.change(screen.getByLabelText(/new password/i), {
        target: { value: 'PreservedPass123!' },
      })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
      await waitFor(() => {
        expect(screen.getByText(/Try again in 0m 1s\./)).toBeInTheDocument()
      })
      // Tick the final second → form returns.
      await act(async () => { vi.advanceTimersByTime(1000) })
      await waitFor(() => {
        expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
      })
      // Typed password preserved across rate_limited → idle transition.
      const input = screen.getByLabelText(/new password/i) as HTMLInputElement
      expect(input.value).toBe('PreservedPass123!')
    } finally {
      vi.useRealTimers()
    }
  })

  it('show/hide eye-toggle flips input type between password and text', () => {
    renderAt('/auth/reset?token=abc-test-token-xyz')
    const input = screen.getByLabelText(/new password/i) as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: /show password/i }))
    expect(input.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: /hide password/i }))
    expect(input.type).toBe('password')
  })
})
