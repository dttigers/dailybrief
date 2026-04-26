import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
  sessionStorage.setItem('vigil_jwt', 'test-key')
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

  // ── Phase 113 (AUTH-11) verify-email banner tests ────────────────────────
  //
  // These tests use a fetchImpl that routes per URL so we can return specific
  // responses for /v1/auth/me vs /v1/me vs /v1/google/status etc.
  // The banner condition is meData?.emailVerifiedAt === null — rendered when
  // /v1/auth/me returns { ..., emailVerifiedAt: null }.
  describe('verify-email banner (AUTH-11)', () => {
    // Helper: render SettingsPage with controllable /v1/auth/me response.
    function renderWithMeData(authMeResponse: Response | 'pending') {
      let resolvePending: (r: Response) => void
      const pendingPromise = new Promise<Response>((resolve) => {
        resolvePending = resolve
      })

      renderPage({
        fetchImpl: async (url) => {
          if (url.includes('/v1/auth/me')) {
            if (authMeResponse === 'pending') return pendingPromise
            return authMeResponse
          }
          if (url.includes('/v1/me')) {
            return new Response(
              JSON.stringify({ userId: '1', email: 'u@x.io' }),
              { status: 200 },
            )
          }
          if (url.includes('/v1/auth/resend-verification')) {
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
          }
          // Default: 404 for /v1/google/status (not connected)
          return new Response(null, { status: 404 })
        },
      })
      return { resolvePending: resolvePending! }
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('AUTH-11-B-VISIBLE-WHEN-UNVERIFIED: banner renders when emailVerifiedAt is null', async () => {
      renderWithMeData(
        new Response(
          JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
          { status: 200 },
        ),
      )
      const banner = await screen.findByRole('alert', { hidden: false })
      // The verify banner (not the Google OAuth banner) — check text
      await waitFor(() => {
        expect(
          screen.getByText(/Verify your email — we sent a link to u@x\.io\. Click it to confirm\./),
        ).toBeInTheDocument()
      })
      expect(banner).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument()
    })

    it('AUTH-11-B-HIDDEN-WHEN-VERIFIED: banner absent when emailVerifiedAt is non-null', async () => {
      renderWithMeData(
        new Response(
          JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: '2026-04-25T12:00:00.000Z' }),
          { status: 200 },
        ),
      )
      // Wait for /v1/auth/me to resolve (no banner should appear)
      await waitFor(() => {
        expect(screen.queryByText(/Verify your email/)).not.toBeInTheDocument()
      })
    })

    it('AUTH-11-B-HIDDEN-WHEN-FETCH-PENDING: no banner flash while /me is in flight (D-28)', () => {
      // /v1/auth/me never resolves — banner must stay absent
      renderWithMeData('pending')
      // Immediately after render (synchronous) — no banner
      expect(screen.queryByText(/Verify your email/)).not.toBeInTheDocument()
    })

    it('AUTH-11-B-NO-DISMISS-CONTROL: no × close button inside verify banner', async () => {
      renderWithMeData(
        new Response(
          JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
          { status: 200 },
        ),
      )
      await screen.findByText(/Verify your email/)
      // The banner div (role=alert for our verify banner) must have no dismiss button.
      // The Google OAuth banner (also role=alert) is not present here (404 → not connected).
      const banners = screen.queryAllByRole('alert')
      // Find the verify banner specifically
      const verifyBanner = banners.find((el) => el.textContent?.includes('Verify your email'))
      expect(verifyBanner).toBeDefined()
      // Check no × dismiss control inside it
      const dismissButtons = verifyBanner!.querySelectorAll('button[aria-label="Dismiss"], button[aria-label="×"]')
      expect(dismissButtons.length).toBe(0)
      // Also check no × text button as child of the banner
      const allButtons = verifyBanner!.querySelectorAll('button')
      const hasX = Array.from(allButtons).some((b) => b.textContent?.trim() === '×')
      expect(hasX).toBe(false)
    })

    it('AUTH-11-B2-RESEND-IDLE-LABEL: Resend button initial label is exactly "Resend"', async () => {
      renderWithMeData(
        new Response(
          JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
          { status: 200 },
        ),
      )
      await screen.findByText(/Verify your email/)
      expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument()
    })

    it('AUTH-11-B2-RESEND-SENDING: Resend click → "Sending…" label + aria-disabled', async () => {
      let resolveResend: (r: Response) => void
      const resendPending = new Promise<Response>((resolve) => { resolveResend = resolve })

      renderPage({
        fetchImpl: async (url) => {
          if (url.includes('/v1/auth/me')) {
            return new Response(
              JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
              { status: 200 },
            )
          }
          if (url.includes('/v1/me')) {
            return new Response(JSON.stringify({ userId: '1', email: 'u@x.io' }), { status: 200 })
          }
          if (url.includes('/v1/auth/resend-verification')) {
            return resendPending
          }
          return new Response(null, { status: 404 })
        },
      })

      await screen.findByRole('button', { name: 'Resend' })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Resend' }))

      await waitFor(() => {
        expect(screen.getByText('Sending…')).toBeInTheDocument()
      })
      // Button should be disabled during send
      const sendingBtn = screen.getByText('Sending…').closest('button')
      expect(sendingBtn).toBeTruthy()
      expect(sendingBtn!.getAttribute('aria-disabled')).toBe('true')

      // Clean up — resolve the pending promise
      resolveResend!(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    })

    it('AUTH-11-B2-RESEND-SENT-200: 200 → "Sent! Check your inbox." for 10s then returns to "Resend"', async () => {
      // Capture the setTimeout callback so we can invoke it directly without waiting 10s.
      let capturedCallback: (() => void) | null = null
      const originalSetTimeout = window.setTimeout.bind(window)
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
      // Cast to any to avoid vitest's strict NormalizedPrecedure type constraint
      // on mockImplementation — the runtime behavior is correct.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(setTimeoutSpy.mockImplementation as any)(function (cb: TimerHandler, delay?: number, ...args: unknown[]) {
        if (delay === 10_000) {
          capturedCallback = cb as () => void
          return 9999
        }
        return originalSetTimeout(cb, delay, ...args)
      })

      renderPage({
        fetchImpl: async (url) => {
          if (url.includes('/v1/auth/me')) {
            return new Response(
              JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
              { status: 200 },
            )
          }
          if (url.includes('/v1/me')) {
            return new Response(JSON.stringify({ userId: '1', email: 'u@x.io' }), { status: 200 })
          }
          if (url.includes('/v1/auth/resend-verification')) {
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
          }
          return new Response(null, { status: 404 })
        },
      })

      await screen.findByRole('button', { name: 'Resend' })

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Resend' }))

      // Confirm "Sent!" state.
      await waitFor(() => {
        expect(screen.getByText('Sent! Check your inbox.')).toBeInTheDocument()
      })

      // Manually fire the captured 10s callback (simulates the timer expiry).
      expect(capturedCallback).not.toBeNull()
      act(() => { capturedCallback!() })

      // Should return to idle "Resend" button.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument()
      })
    })

    it('AUTH-11-B2-RESEND-RATE-LIMITED: 429 → inline rate-limit error, button hidden', async () => {
      renderPage({
        fetchImpl: async (url) => {
          if (url.includes('/v1/auth/me')) {
            return new Response(
              JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
              { status: 200 },
            )
          }
          if (url.includes('/v1/me')) {
            return new Response(JSON.stringify({ userId: '1', email: 'u@x.io' }), { status: 200 })
          }
          if (url.includes('/v1/auth/resend-verification')) {
            return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })
          }
          return new Response(null, { status: 404 })
        },
      })

      await screen.findByRole('button', { name: 'Resend' })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Resend' }))

      await waitFor(() => {
        expect(
          screen.getByText("You've requested too many. Try again later."),
        ).toBeInTheDocument()
      })
      // Button should be gone in rate-limited state
      expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument()
    })

    it('AUTH-11-B2-RESEND-NETWORK-ERROR: network error → "Could not send. Try again." + button re-enables', async () => {
      renderPage({
        fetchImpl: async (url) => {
          if (url.includes('/v1/auth/me')) {
            return new Response(
              JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
              { status: 200 },
            )
          }
          if (url.includes('/v1/me')) {
            return new Response(JSON.stringify({ userId: '1', email: 'u@x.io' }), { status: 200 })
          }
          if (url.includes('/v1/auth/resend-verification')) {
            throw new TypeError('Network error')
          }
          return new Response(null, { status: 404 })
        },
      })

      await screen.findByRole('button', { name: 'Resend' })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Resend' }))

      await waitFor(() => {
        expect(screen.getByText('Could not send. Try again.')).toBeInTheDocument()
      })
      // Button re-enables (re-appears as "Resend")
      expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument()
    })

    it('AUTH-11-B2-RESEND-5XX: 5xx → same error UX as network error', async () => {
      renderPage({
        fetchImpl: async (url) => {
          if (url.includes('/v1/auth/me')) {
            return new Response(
              JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
              { status: 200 },
            )
          }
          if (url.includes('/v1/me')) {
            return new Response(JSON.stringify({ userId: '1', email: 'u@x.io' }), { status: 200 })
          }
          if (url.includes('/v1/auth/resend-verification')) {
            return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
          }
          return new Response(null, { status: 404 })
        },
      })

      await screen.findByRole('button', { name: 'Resend' })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Resend' }))

      await waitFor(() => {
        expect(screen.getByText('Could not send. Try again.')).toBeInTheDocument()
      })
      // Button re-enables
      expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument()
    })

    it('AUTH-11-B-NEW-ME-CALL: both /v1/auth/me and /v1/me are called on mount', async () => {
      const calledUrls: string[] = []

      renderPage({
        fetchImpl: async (url) => {
          calledUrls.push(url)
          if (url.includes('/v1/auth/me')) {
            return new Response(
              JSON.stringify({ id: 1, email: 'u@x.io', emailVerifiedAt: null }),
              { status: 200 },
            )
          }
          if (url.includes('/v1/me')) {
            return new Response(JSON.stringify({ userId: '1', email: 'u@x.io' }), { status: 200 })
          }
          return new Response(null, { status: 404 })
        },
      })

      await screen.findByText(/Verify your email/)

      await waitFor(() => {
        expect(calledUrls.some((u) => u.includes('/v1/auth/me'))).toBe(true)
        expect(calledUrls.some((u) => u.includes('/v1/me') && !u.includes('/v1/auth/me'))).toBe(true)
      })
    })
  })
})
