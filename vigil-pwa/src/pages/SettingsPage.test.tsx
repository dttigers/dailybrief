import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import SettingsPage from './SettingsPage'
import { GoogleStatusProvider } from '../hooks/GoogleStatusContext'

function renderPage({
  initialEntries = ['/settings'],
  fetchImpl,
}: {
  initialEntries?: string[]
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url, init) => fetchImpl(String(url), init as RequestInit | undefined)),
  )
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <GoogleStatusProvider>
        <SettingsPage />
      </GoogleStatusProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.setItem('vigil_api_key', 'test-key')
  // Spy on replaceState so callback tests can assert it fires exactly once
  window.history.replaceState = vi.fn() as unknown as typeof window.history.replaceState
})

describe('SettingsPage', () => {
  describe('empty', () => {
    it('renders Connect Google button when status is null (404)', async () => {
      renderPage({ fetchImpl: async () => new Response(null, { status: 404 }) })
      expect(await screen.findByRole('button', { name: /connect google/i })).toBeInTheDocument()
      expect(screen.getByText(/Calendar read, Gmail read/i)).toBeInTheDocument()
    })
  })

  describe('connected', () => {
    it('renders both scope rows as connected when calendar+gmail both connected', async () => {
      renderPage({
        fetchImpl: async () =>
          new Response(JSON.stringify({ calendar: 'connected', gmail: 'connected' }), { status: 200 }),
      })
      await screen.findByTestId('scope-dot-calendar')
      expect(screen.getByTestId('scope-dot-calendar').getAttribute('aria-label')).toMatch(/connected/i)
      expect(screen.getByTestId('scope-dot-gmail').getAttribute('aria-label')).toMatch(/connected/i)
    })
  })

  describe('scope gap', () => {
    it('renders Re-connect button on Gmail row when gmail=needs_auth', async () => {
      renderPage({
        fetchImpl: async () =>
          new Response(JSON.stringify({ calendar: 'connected', gmail: 'needs_auth' }), { status: 200 }),
      })
      await screen.findByTestId('scope-dot-gmail')
      const reconnects = await screen.findAllByRole('button', { name: /re-connect/i })
      expect(reconnects.length).toBe(1)
    })
  })

  describe('disconnect', () => {
    it('inline confirm: Disconnect → Confirm calls disconnectGoogle()', async () => {
      const calls: string[] = []
      renderPage({
        fetchImpl: async (url, init) => {
          calls.push(`${init?.method ?? 'GET'} ${url}`)
          if (String(url).includes('/v1/google/tokens')) {
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
          }
          return new Response(JSON.stringify({ calendar: 'connected', gmail: 'connected' }), { status: 200 })
        },
      })
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: /^disconnect$/i }))
      await user.click(await screen.findByRole('button', { name: /^confirm$/i }))
      await waitFor(() =>
        expect(calls.some((c) => c.startsWith('DELETE') && c.includes('/v1/google/tokens'))).toBe(true),
      )
    })
  })

  describe('callback', () => {
    it('shows success banner and strips URL when ?google_connected=true', async () => {
      renderPage({
        initialEntries: ['/settings?google_connected=true'],
        fetchImpl: async () =>
          new Response(JSON.stringify({ calendar: 'connected', gmail: 'connected' }), { status: 200 }),
      })
      expect(await screen.findByText(/Google account connected/i)).toBeInTheDocument()
      expect(window.history.replaceState).toHaveBeenCalled()
    })

    it('shows error banner with decoded message when ?google_error=invalid_state', async () => {
      renderPage({
        initialEntries: ['/settings?google_error=invalid_state'],
        fetchImpl: async () => new Response(null, { status: 404 }),
      })
      expect(await screen.findByText(/invalid_state/i)).toBeInTheDocument()
    })
  })
})
