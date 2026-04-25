import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import AuthPage from './AuthPage'

function renderAuth(onAuthSuccess = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/auth']}>
      <AuthPage onAuthSuccess={onAuthSuccess} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('AuthPage — Login mode (default)', () => {
  it('renders email and password fields in login mode', () => {
    renderAuth()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows mode toggle link "Don\'t have an account? Sign up"', () => {
    renderAuth()
    expect(screen.getByText(/don't have an account/i)).toBeInTheDocument()
  })

  it('stores JWT in sessionStorage and calls onAuthSuccess on successful login', async () => {
    const user = userEvent.setup()
    const onAuthSuccess = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ token: 'jwt-token', user: { id: 1, email: 'test@example.com' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    renderAuth(onAuthSuccess)
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(sessionStorage.getItem('vigil_jwt')).toBe('jwt-token'))
    expect(onAuthSuccess).toHaveBeenCalled()
  })

  it('shows generic error for any 4xx response — no user enumeration', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    )
    renderAuth()
    await user.type(screen.getByLabelText(/email/i), 'bad@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByText('Invalid email or password. Please try again.')).toBeInTheDocument(),
    )
  })
})

describe('AuthPage — Signup mode', () => {
  it('switches to signup mode via toggle link', async () => {
    const user = userEvent.setup()
    renderAuth()
    await user.click(screen.getByText(/don't have an account/i))
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument()
  })

  it('calls register then login (two-step), stores JWT, calls onAuthSuccess', async () => {
    const user = userEvent.setup()
    const onAuthSuccess = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, email: 'new@example.com' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: 'new-jwt', user: { id: 1, email: 'new@example.com' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    renderAuth(onAuthSuccess)
    await user.click(screen.getByText(/don't have an account/i))
    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign up/i }))
    await waitFor(() => expect(sessionStorage.getItem('vigil_jwt')).toBe('new-jwt'))
    expect(onAuthSuccess).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows generic error on 4xx from register — no user enumeration', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Conflict', { status: 409 })),
    )
    renderAuth()
    await user.click(screen.getByText(/don't have an account/i))
    await user.type(screen.getByLabelText(/email/i), 'dup@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign up/i }))
    await waitFor(() =>
      expect(screen.getByText('Invalid email or password. Please try again.')).toBeInTheDocument(),
    )
  })
})

describe('AuthPage — Session-expired banner (AUTH-09 D-19)', () => {
  it('shows banner when URL has ?reason=session_expired', () => {
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: { ...original, search: '?reason=session_expired' },
      writable: true,
    })
    try {
      renderAuth()
      expect(screen.getByRole('status')).toHaveTextContent(/session expired/i)
    } finally {
      Object.defineProperty(window, 'location', { value: original, writable: true })
    }
  })

  it('does NOT show banner when URL has no reason param', () => {
    renderAuth()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('AuthPage — Password-reset banner (AUTH-10 D-19)', () => {
  it('shows banner when URL has ?reason=password_reset', () => {
    // Mirror the session_expired test's pattern (this file already uses
    // Object.defineProperty; new tests follow file convention for consistency).
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: { ...original, search: '?reason=password_reset' },
      writable: true,
    })
    try {
      renderAuth()
      expect(screen.getByRole('status')).toHaveTextContent(/password reset successfully/i)
    } finally {
      Object.defineProperty(window, 'location', { value: original, writable: true })
    }
  })
})

describe('AuthPage — Forgot password link (AUTH-10 D-14)', () => {
  it('renders "Forgot password?" link in login mode pointing to /auth/forgot', () => {
    renderAuth()
    const link = screen.getByRole('link', { name: /forgot password/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/auth/forgot')
  })

  it('hides "Forgot password?" link in signup mode', async () => {
    const user = userEvent.setup()
    renderAuth()
    await user.click(screen.getByText(/don't have an account/i))
    expect(screen.queryByRole('link', { name: /forgot password/i })).not.toBeInTheDocument()
  })
})
