import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('submit returns 429 → inline error banner, form stays mounted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 429,
        ok: false,
        json: async () => ({ error: 'Too many requests' }),
      }),
    )
    renderAt('/auth/reset?token=abc-test-token-xyz')
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'ValidNewPass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many attempts/i)
    })
    // Form still rendered.
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
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
