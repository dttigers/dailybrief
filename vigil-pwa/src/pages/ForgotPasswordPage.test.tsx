import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ForgotPasswordPage from './ForgotPasswordPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/forgot']}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders form initially with heading + email input', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('submits with lowercased+trimmed email and shows success state on 200', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, message: 'If your account exists, a reset link has been sent.' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    renderPage()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: '  TEST@example.COM  ' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /check your inbox/i })).toBeInTheDocument()
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const init = fetchSpy.mock.calls[0][1]
    const body = JSON.parse(init.body as string)
    expect(body.email).toBe('test@example.com')

    // D-16 verbatim
    expect(
      screen.getByText(/If your account exists, a reset link has been sent\. The link expires in 1 hour\./),
    ).toBeInTheDocument()
  })

  it('shows error banner on 429 and keeps form rendered', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchSpy)

    renderPage()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Something went wrong/i)
    })
    expect(screen.queryByRole('heading', { name: /check your inbox/i })).not.toBeInTheDocument()
  })

  it('shows error banner when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    renderPage()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Something went wrong/i)
    })
  })
})
