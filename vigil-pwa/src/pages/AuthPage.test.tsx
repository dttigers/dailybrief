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
