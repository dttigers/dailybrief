import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import SettingsPage from './SettingsPage'
import { GoogleStatusProvider } from '../hooks/GoogleStatusContext'
import { ToastProvider } from '../hooks/useToast'
import ToastHost from '../components/ToastHost'

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
        <ToastProvider>
          <SettingsPage />
          <ToastHost />
        </ToastProvider>
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

  // ── Phase 115 (CAL-01) Calendar source picker tests ─────────────────────
  describe('calendar source picker (CAL-01)', () => {
    function makeFetchImpl(opts: {
      googleStatus?: object | null
      calendarList?: object
      putResponse?: { status: number; body?: object }
      authMe?: object
    }) {
      let listCallCount = 0
      const putCalls: Array<{ url: string; body: unknown }> = []
      const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
        const u = String(url)
        if (u.includes('/v1/google/status')) {
          return new Response(
            JSON.stringify(opts.googleStatus ?? { calendar: 'connected', gmail: 'connected' }),
            { status: 200 },
          )
        }
        if (u.includes('/v1/calendar/list')) {
          listCallCount++
          return new Response(
            JSON.stringify(opts.calendarList ?? { status: 'ok', calendars: [], selectedCalendarIds: [] }),
            { status: 200 },
          )
        }
        if (u.includes('/v1/calendar/selections')) {
          putCalls.push({
            url: u,
            body: init?.body ? JSON.parse(init.body as string) : null,
          })
          return new Response(
            JSON.stringify(opts.putResponse?.body ?? { ok: true }),
            { status: opts.putResponse?.status ?? 200 },
          )
        }
        if (u.includes('/v1/auth/me')) {
          return new Response(
            JSON.stringify(
              opts.authMe ?? { id: 1, email: 'a@b.com', emailVerifiedAt: '2026-01-01' },
            ),
            { status: 200 },
          )
        }
        if (u.includes('/v1/me')) {
          return new Response(
            JSON.stringify({ userId: '1', email: 'a@b.com' }),
            { status: 200 },
          )
        }
        // Schedules and timezone — silent success
        return new Response(
          JSON.stringify({ hour: 4, minute: 0, enabled: true }),
          { status: 200 },
        )
      }
      return {
        fetchImpl,
        getListCallCount: () => listCallCount,
        getPutCalls: () => putCalls,
      }
    }

    it('CAL-01-picker-render: renders calendar names from GET /v1/calendar/list', async () => {
      const { fetchImpl } = makeFetchImpl({
        calendarList: {
          status: 'ok',
          calendars: [
            { id: 'primary@gmail.com', name: 'Personal', color: '#4285f4', primary: true },
            { id: 'work@company.com', name: 'Work', color: '#0b8043', primary: false },
          ],
          selectedCalendarIds: [],
        },
      })
      renderPage({ fetchImpl })
      expect(await screen.findByTestId('calendars-subsection')).toBeInTheDocument()
      expect(await screen.findByText('Personal')).toBeInTheDocument()
      expect(await screen.findByText('Work')).toBeInTheDocument()
      expect(screen.getByText('PRIMARY')).toBeInTheDocument()
    })

    it('CAL-01-picker-toggle-saves: toggling a checkbox PUTs /v1/calendar/selections after 400ms debounce', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { fetchImpl, getPutCalls } = makeFetchImpl({
          calendarList: {
            status: 'ok',
            calendars: [
              { id: 'primary@gmail.com', name: 'Personal', color: '#4285f4', primary: true },
            ],
            selectedCalendarIds: [],
          },
        })
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage({ fetchImpl })
        const cb = await screen.findByTestId('calendar-checkbox-primary@gmail.com')
        await user.click(cb)
        // Before 400ms: no PUT
        expect(getPutCalls().length).toBe(0)
        // Advance past debounce
        await act(async () => {
          vi.advanceTimersByTime(450)
        })
        await waitFor(() => expect(getPutCalls().length).toBe(1))
        expect(getPutCalls()[0].body).toEqual({ selectedCalendarIds: ['primary@gmail.com'] })
      } finally {
        vi.useRealTimers()
      }
    })

    it('CAL-01-picker-hidden-on-needs-reauth: subsection is absent when GET /v1/calendar/list returns needs_reauth', async () => {
      const { fetchImpl } = makeFetchImpl({
        calendarList: { status: 'needs_reauth' },
      })
      renderPage({ fetchImpl })
      // Wait for page to settle (other fetches resolve)
      await screen.findByText(/Google$/i).catch(() => {})
      // Allow the calendar fetch effect to run
      await new Promise((r) => setTimeout(r, 0))
      await waitFor(() =>
        expect(screen.queryByTestId('calendars-subsection')).not.toBeInTheDocument(),
      )
    })

    it('CAL-01-picker-error-retry: error response renders Retry button that re-fetches', async () => {
      const { fetchImpl, getListCallCount } = makeFetchImpl({
        calendarList: { status: 'error', error: 'Google API down' },
      })
      const user = userEvent.setup()
      renderPage({ fetchImpl })
      expect(await screen.findByText(/Google API down/i)).toBeInTheDocument()
      const retry = await screen.findByRole('button', { name: /retry/i })
      const before = getListCallCount()
      await user.click(retry)
      await waitFor(() => expect(getListCallCount()).toBeGreaterThan(before))
    })

    it('CAL-01-picker-empty-helper: helper copy renders when no calendars are selected', async () => {
      const { fetchImpl } = makeFetchImpl({
        calendarList: {
          status: 'ok',
          calendars: [
            { id: 'primary@gmail.com', name: 'Personal', color: '#4285f4', primary: true },
          ],
          selectedCalendarIds: [],
        },
      })
      renderPage({ fetchImpl })
      expect(
        await screen.findByText(/No calendars selected — brief includes all of them\./),
      ).toBeInTheDocument()
    })

    // ── Phase 115 CR-01 gap-closure regression tests ──

    it('CR-01-reload-preservation-checked-from-server: checkboxes start CHECKED when GET /v1/calendar/list returns a non-empty selectedCalendarIds', async () => {
      const { fetchImpl } = makeFetchImpl({
        calendarList: {
          status: 'ok',
          calendars: [
            { id: 'primary@gmail.com', name: 'Personal', color: '#4285f4', primary: true },
            { id: 'work@company.com', name: 'Work', color: '#0b8043', primary: false },
            { id: 'side@gmail.com', name: 'Side Project', color: '#f4b400', primary: false },
          ],
          selectedCalendarIds: ['primary@gmail.com', 'work@company.com'],
        },
      })
      renderPage({ fetchImpl })
      // Wait for the picker to mount + hydrate.
      const cbPrimary = await screen.findByTestId('calendar-checkbox-primary@gmail.com') as HTMLInputElement
      const cbWork = await screen.findByTestId('calendar-checkbox-work@company.com') as HTMLInputElement
      const cbSide = await screen.findByTestId('calendar-checkbox-side@gmail.com') as HTMLInputElement
      // Hydration assertion — these MUST be checked because the server said so.
      expect(cbPrimary.checked).toBe(true)
      expect(cbWork.checked).toBe(true)
      // The unselected one stays unchecked.
      expect(cbSide.checked).toBe(false)
    })

    it('CR-01-multi-selection-toggle-preserves-others: toggling one calendar in a multi-selection PUTs the FULL updated array (not just the toggled id)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { fetchImpl, getPutCalls } = makeFetchImpl({
          calendarList: {
            status: 'ok',
            calendars: [
              { id: 'cal-a', name: 'Cal A', color: '#4285f4', primary: true },
              { id: 'cal-b', name: 'Cal B', color: '#0b8043', primary: false },
              { id: 'cal-c', name: 'Cal C', color: '#f4b400', primary: false },
            ],
            selectedCalendarIds: ['cal-a', 'cal-b', 'cal-c'],
          },
        })
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage({ fetchImpl })
        // Wait for hydration: confirm cal-b is checked before we toggle it off.
        const cbB = await screen.findByTestId('calendar-checkbox-cal-b') as HTMLInputElement
        expect(cbB.checked).toBe(true)
        // Toggle cal-b off.
        await user.click(cbB)
        // Advance past the 400ms debounce.
        await act(async () => { vi.advanceTimersByTime(450) })
        await waitFor(() => expect(getPutCalls().length).toBe(1))
        // The PUT body MUST be the full updated array preserving a + c, NOT [] + nothing.
        expect(getPutCalls()[0].body).toEqual({ selectedCalendarIds: ['cal-a', 'cal-c'] })
      } finally {
        vi.useRealTimers()
      }
    })
  })

  // ── Phase 116 SPORTS-01 picker tests ──
  describe('sports source picker (SPORTS-01)', () => {
    function makeSportsFetchImpl(opts: {
      googleStatus?: object | null
      sportsSelections?: { enabledLeagues: Array<'mlb'|'nfl'|'nba'|'nhl'>; favoriteTeams: Record<string, string> }
      // Phase 116.1 D-13: errorBody allows driving structured 502 responses; teamsThrowFor simulates network bucket (fetch throws, no Response)
      teamsByLeague?: Partial<Record<'mlb'|'nfl'|'nba'|'nhl', Array<{ id: string, name: string }> | { errorStatus: number; errorBody?: object }>>
      teamsThrowFor?: Array<'mlb'|'nfl'|'nba'|'nhl'>
      putResponse?: { status: number; body?: object }
      authMe?: object
    }) {
      const putCalls: Array<{ url: string; body: unknown }> = []
      // Track per-league GET-teams call counts for retry tests.
      const teamsCallCounts: Record<string, number> = {}

      const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
        const u = String(url)
        if (u.includes('/v1/google/status')) {
          return new Response(JSON.stringify(opts.googleStatus ?? { calendar: 'connected', gmail: 'connected' }), { status: 200 })
        }
        if (u.includes('/v1/calendar/list')) {
          // Phase 115 picker is also on this page — return needs_reauth so its subsection doesn't render
          // (avoids interference; calendar tests have their own coverage).
          return new Response(JSON.stringify({ status: 'needs_reauth' }), { status: 200 })
        }
        if (u.includes('/v1/sports/selections')) {
          if (init?.method === 'PUT') {
            putCalls.push({ url: u, body: init.body ? JSON.parse(init.body as string) : null })
            const body = opts.putResponse?.body ?? { ok: true }
            return new Response(JSON.stringify(body), { status: opts.putResponse?.status ?? 200 })
          }
          const sel = opts.sportsSelections ?? { enabledLeagues: [], favoriteTeams: {} }
          return new Response(JSON.stringify(sel), { status: 200 })
        }
        if (u.includes('/v1/sports/teams/')) {
          const match = u.match(/\/v1\/sports\/teams\/(mlb|nfl|nba|nhl)/)
          const league = match ? match[1] as 'mlb'|'nfl'|'nba'|'nhl' : null
          if (!league) return new Response(JSON.stringify({ error: 'unknown' }), { status: 400 })
          // Phase 116.1 D-13: simulate network bucket — fetchImpl throws for these leagues
          if (opts.teamsThrowFor?.includes(league)) {
            throw new TypeError('Failed to fetch')  // simulates browser fetch rejection (DNS / offline / CORS)
          }
          teamsCallCounts[league] = (teamsCallCounts[league] ?? 0) + 1
          const stub = opts.teamsByLeague?.[league]
          if (!stub) return new Response(JSON.stringify({ teams: [] }), { status: 200 })
          if ('errorStatus' in stub) {
            // Use call count to flip from error to success on retry: errorStatus on first call, 200 on subsequent.
            if (teamsCallCounts[league] === 1) {
              // Phase 116.1: errorBody allows driving structured 502 response bodies
              const body = stub.errorBody ?? { error: 'down' }
              return new Response(JSON.stringify(body), { status: stub.errorStatus })
            }
            return new Response(JSON.stringify({ teams: [{ id: '116', name: 'Detroit Tigers' }] }), { status: 200 })
          }
          return new Response(JSON.stringify({ teams: stub }), { status: 200 })
        }
        if (u.includes('/v1/auth/me')) {
          return new Response(JSON.stringify(opts.authMe ?? { id: 1, email: 'a@b.com', emailVerifiedAt: '2026-01-01' }), { status: 200 })
        }
        if (u.includes('/v1/me')) {
          return new Response(JSON.stringify({ userId: '1', email: 'a@b.com' }), { status: 200 })
        }
        // schedules + timezone — silent success
        return new Response(JSON.stringify({ hour: 4, minute: 0, enabled: true }), { status: 200 })
      }
      return { fetchImpl, getPutCalls: () => putCalls, getTeamsCallCounts: () => teamsCallCounts }
    }

    it('SPORTS-01-picker-render-empty: renders 4 unchecked league checkboxes + empty-leagues helper', async () => {
      const { fetchImpl } = makeSportsFetchImpl({})
      renderPage({ fetchImpl })
      expect(await screen.findByTestId('sports-section')).toBeInTheDocument()
      const cbMlb = await screen.findByTestId('sports-checkbox-mlb') as HTMLInputElement
      const cbNfl = await screen.findByTestId('sports-checkbox-nfl') as HTMLInputElement
      const cbNba = await screen.findByTestId('sports-checkbox-nba') as HTMLInputElement
      const cbNhl = await screen.findByTestId('sports-checkbox-nhl') as HTMLInputElement
      expect(cbMlb.checked).toBe(false)
      expect(cbNfl.checked).toBe(false)
      expect(cbNba.checked).toBe(false)
      expect(cbNhl.checked).toBe(false)
      expect(await screen.findByText(/No leagues selected — sports section will be omitted from your brief\./)).toBeInTheDocument()
    })

    it('SPORTS-01-picker-league-toggle-saves: clicking MLB checkbox triggers lazy team fetch + debounced PUT', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { fetchImpl, getPutCalls, getTeamsCallCounts } = makeSportsFetchImpl({
          sportsSelections: { enabledLeagues: [], favoriteTeams: {} },
          teamsByLeague: { mlb: [{ id: '116', name: 'Detroit Tigers' }] },
        })
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage({ fetchImpl })
        const cb = await screen.findByTestId('sports-checkbox-mlb')
        await user.click(cb)
        // Lazy fetch fired immediately on enable (no debounce on the GET).
        await waitFor(() => expect(getTeamsCallCounts().mlb ?? 0).toBeGreaterThanOrEqual(1))
        // PUT not yet (still in debounce window).
        expect(getPutCalls().length).toBe(0)
        await act(async () => { vi.advanceTimersByTime(450) })
        await waitFor(() => expect(getPutCalls().length).toBe(1))
        expect(getPutCalls()[0].body).toEqual({ enabledLeagues: ['mlb'], favoriteTeams: {} })
      } finally {
        vi.useRealTimers()
      }
    })

    it('SPORTS-01-picker-team-select-saves: clicking a team radio PUTs favoriteTeams update', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { fetchImpl, getPutCalls } = makeSportsFetchImpl({
          sportsSelections: { enabledLeagues: ['mlb'], favoriteTeams: {} },
          teamsByLeague: {
            mlb: [{ id: '116', name: 'Detroit Tigers' }, { id: '5', name: 'Cleveland Guardians' }],
          },
        })
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage({ fetchImpl })
        const radio = await screen.findByTestId('sports-radio-mlb-116') as HTMLInputElement
        await user.click(radio)
        await act(async () => { vi.advanceTimersByTime(450) })
        await waitFor(() => expect(getPutCalls().length).toBe(1))
        expect(getPutCalls()[0].body).toEqual({ enabledLeagues: ['mlb'], favoriteTeams: { mlb: '116' } })
      } finally {
        vi.useRealTimers()
      }
    })

    it('SPORTS-01-picker-mount-prefetches-teams-D23: NFL team list fetched on mount when enabledLeagues includes nfl', async () => {
      const { fetchImpl, getTeamsCallCounts } = makeSportsFetchImpl({
        sportsSelections: { enabledLeagues: ['nfl'], favoriteTeams: {} },
        teamsByLeague: { nfl: [{ id: '13', name: 'Detroit Lions' }] },
      })
      renderPage({ fetchImpl })
      // Wait for the NFL team radio to appear — implies the lazy mount-time fetch resolved.
      await screen.findByTestId('sports-radio-nfl-13')
      expect(getTeamsCallCounts().nfl).toBeGreaterThanOrEqual(1)
    })

    it('SPORTS-01-picker-empty-leagues-helper: helper visible when enabledLeagues is empty after fetch', async () => {
      const { fetchImpl } = makeSportsFetchImpl({
        sportsSelections: { enabledLeagues: [], favoriteTeams: {} },
      })
      renderPage({ fetchImpl })
      expect(await screen.findByText(/No leagues selected — sports section will be omitted from your brief\./)).toBeInTheDocument()
    })

    it('SPORTS-01-picker-no-team-helper: standings-only helper shown when league enabled but no team selected', async () => {
      const { fetchImpl } = makeSportsFetchImpl({
        sportsSelections: { enabledLeagues: ['mlb'], favoriteTeams: {} },
        teamsByLeague: { mlb: [{ id: '116', name: 'Detroit Tigers' }] },
      })
      renderPage({ fetchImpl })
      // Wait for the radios to render first (proves lazy fetch resolved).
      await screen.findByTestId('sports-radio-mlb-116')
      expect(await screen.findByText(/No favorite team selected — standings only\./)).toBeInTheDocument()
    })

    it('SPORTS-01-picker-team-list-error-retry: error response renders Retry; click triggers second fetch', async () => {
      const { fetchImpl, getTeamsCallCounts } = makeSportsFetchImpl({
        sportsSelections: { enabledLeagues: ['mlb'], favoriteTeams: {} },
        teamsByLeague: { mlb: { errorStatus: 500 } },
      })
      const user = userEvent.setup()
      renderPage({ fetchImpl })
      // Phase 116.1 D-14: errorStatus: 500 now classifies as 'server' bucket → new copy.
      await waitFor(() => expect(screen.getByText('Sports settings unavailable. Try again.')).toBeInTheDocument())
      const retry = await screen.findByTestId('sports-retry-mlb')
      const before = getTeamsCallCounts().mlb ?? 0
      await user.click(retry)
      await waitFor(() => expect(getTeamsCallCounts().mlb ?? 0).toBeGreaterThan(before))
    })

    it('SPORTS-01-picker-rollback-on-put-failure-D21: PUT 500 rolls back state + fires error toast', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { fetchImpl } = makeSportsFetchImpl({
          sportsSelections: { enabledLeagues: ['mlb'], favoriteTeams: { mlb: '116' } },
          teamsByLeague: { mlb: [{ id: '116', name: 'Detroit Tigers' }] },
          putResponse: { status: 500, body: { error: 'down' } },
        })
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage({ fetchImpl })
        const cb = await screen.findByTestId('sports-checkbox-mlb') as HTMLInputElement
        // Confirm initial state is checked (matches server-saved value).
        await waitFor(() => expect(cb.checked).toBe(true))
        // Toggle off.
        await user.click(cb)
        // Optimistic: instantly unchecked.
        expect(cb.checked).toBe(false)
        // Advance debounce → PUT fails → rollback.
        await act(async () => { vi.advanceTimersByTime(450) })
        await waitFor(() => expect(cb.checked).toBe(true))  // rolled back
        expect(await screen.findByText(/Couldn't save sports settings — try again\./)).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('SPORTS-01-picker-disable-preserves-team-D24: toggling league OFF keeps favoriteTeams in PUT body', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { fetchImpl, getPutCalls } = makeSportsFetchImpl({
          sportsSelections: { enabledLeagues: ['mlb'], favoriteTeams: { mlb: '116' } },
          teamsByLeague: { mlb: [{ id: '116', name: 'Detroit Tigers' }] },
        })
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage({ fetchImpl })
        const cb = await screen.findByTestId('sports-checkbox-mlb')
        await user.click(cb)  // disable MLB
        await act(async () => { vi.advanceTimersByTime(450) })
        await waitFor(() => expect(getPutCalls().length).toBe(1))
        // D-24: favoriteTeams preserved even though league disabled.
        expect(getPutCalls()[0].body).toEqual({ enabledLeagues: [], favoriteTeams: { mlb: '116' } })
      } finally {
        vi.useRealTimers()
      }
    })

    it('SPORTS-01b-pwa-upstream-bucket-with-countdown: 502 + retryAfter renders upstream copy + live countdown + disabled Retry', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const { fetchImpl } = makeSportsFetchImpl({
          sportsSelections: { enabledLeagues: [], favoriteTeams: {} },
          teamsByLeague: {
            mlb: { errorStatus: 502, errorBody: { error: 'Upstream sports provider unavailable', retryAfter: 5 } },
          },
        })
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage({ fetchImpl })
        const cb = await screen.findByTestId('sports-checkbox-mlb')
        await user.click(cb)
        // Wait for the error state to land.
        await waitFor(() =>
          expect(screen.getByText('Sports data temporarily unavailable.')).toBeInTheDocument()
        )
        // Countdown renders with starting value (5 seconds → "0:05"), Retry disabled.
        await waitFor(() =>
          expect(screen.getByTestId('sports-countdown-mlb')).toHaveTextContent(/Try again in 0:0[345]/)
        )
        expect(screen.getByTestId('sports-retry-mlb')).toBeDisabled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('SPORTS-01b-pwa-upstream-bucket-no-countdown: 502 without retryAfter renders upstream copy + enabled Retry + no countdown', async () => {
      const { fetchImpl } = makeSportsFetchImpl({
        sportsSelections: { enabledLeagues: [], favoriteTeams: {} },
        teamsByLeague: {
          mlb: { errorStatus: 502, errorBody: { error: 'Upstream sports provider unavailable' } },
        },
      })
      const user = userEvent.setup()
      renderPage({ fetchImpl })
      const cb = await screen.findByTestId('sports-checkbox-mlb')
      await user.click(cb)
      await waitFor(() =>
        expect(screen.getByText('Sports data temporarily unavailable.')).toBeInTheDocument()
      )
      expect(screen.queryByTestId('sports-countdown-mlb')).toBeNull()
      expect(screen.getByTestId('sports-retry-mlb')).not.toBeDisabled()
    })

    it('SPORTS-01b-pwa-server-bucket: 500 renders server copy + no countdown + enabled Retry', async () => {
      const { fetchImpl } = makeSportsFetchImpl({
        sportsSelections: { enabledLeagues: [], favoriteTeams: {} },
        teamsByLeague: { mlb: { errorStatus: 500 } },
      })
      const user = userEvent.setup()
      renderPage({ fetchImpl })
      const cb = await screen.findByTestId('sports-checkbox-mlb')
      await user.click(cb)
      await waitFor(() =>
        expect(screen.getByText('Sports settings unavailable. Try again.')).toBeInTheDocument()
      )
      expect(screen.queryByTestId('sports-countdown-mlb')).toBeNull()
      expect(screen.getByTestId('sports-retry-mlb')).not.toBeDisabled()
    })

    it('SPORTS-01b-pwa-network-bucket: fetch throws renders network copy + no countdown', async () => {
      const { fetchImpl } = makeSportsFetchImpl({
        sportsSelections: { enabledLeagues: [], favoriteTeams: {} },
        teamsThrowFor: ['mlb'],
      })
      const user = userEvent.setup()
      renderPage({ fetchImpl })
      const cb = await screen.findByTestId('sports-checkbox-mlb')
      await user.click(cb)
      await waitFor(() =>
        expect(screen.getByText('No network connection.')).toBeInTheDocument()
      )
      expect(screen.queryByTestId('sports-countdown-mlb')).toBeNull()
      expect(screen.getByTestId('sports-retry-mlb')).not.toBeDisabled()
    })
  })
})
