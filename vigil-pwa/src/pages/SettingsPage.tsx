import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { useGoogleStatus } from '../hooks/useGoogleStatus'
import {
  disconnectGoogle,
  redirectToGoogleAuth,
  getPrintSchedule,
  setPrintSchedule,
  getGenerateSchedule,
  setGenerateSchedule,
  getTimezone,
  setTimezone,
  vigilFetch,
  signOut,
  storeKey,
} from '../api/client'
import { ScheduleCard } from '../components/ScheduleCard'

type Banner = { kind: 'success' | 'error'; text: string } | null

// WR-03: map raw google_error codes to fixed user-visible strings.
// Unknown codes get a generic fallback — prevents UI phishing via crafted redirect params.
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'Connection attempt expired. Please try again.',
  no_refresh_token: 'Google did not issue a refresh token. Revoke access at myaccount.google.com and retry.',
  server_error: 'Server error during connection. Please try again.',
  access_denied: 'Access was denied.',
  no_code: 'Connection attempt failed. Please try again.',
}

/**
 * Google integration Settings page (Phase 81) + Phase 86 schedule split.
 *
 * Renders:
 *   - Google card (connect / disconnect / per-scope re-connect)
 *   - Auto-generate ScheduleCard (server cron — /v1/settings/generate-schedule)
 *   - Auto-print ScheduleCard (Mac CLI — /v1/settings/print-schedule)
 *   - Timezone picker (IANA, Intl.DateTimeFormat autofill — D-10)
 *
 * Also handles the OAuth callback query params (`?google_connected=true` /
 * `?google_error=...`) exactly once on mount — surfaces a banner and strips the
 * query string via `history.replaceState` so a reload does not replay the toast
 * (D-11, Pitfall 4).
 *
 * Security: `google_error` is rendered as React text (auto-escaped) — no
 * `dangerouslySetInnerHTML` and no `window.confirm()` anywhere (T-81-15).
 * Timezone text is also rendered via React (T-86-12); invalid IANA rejected
 * server-side (T-86-11).
 */
export default function SettingsPage() {
  const { status, isLoading, error, refetch } = useGoogleStatus()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [banner, setBanner] = useState<Banner>(null)
  const [confirming, setConfirming] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [timezone, setTimezoneState] = useState<string>('America/New_York')
  const [timezoneLoading, setTimezoneLoading] = useState(true)
  const [timezoneSaving, setTimezoneSaving] = useState(false)
  // D-06 / D-07: Vigil Account section state — email from GET /v1/me
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [accountLoading, setAccountLoading] = useState(true)

  // Phase 110 (AUTH-09 D-15..D-18): change-password form state
  const [cpExpanded, setCpExpanded] = useState(false)
  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpShowCurrent, setCpShowCurrent] = useState(false)
  const [cpShowNew, setCpShowNew] = useState(false)
  const [cpInlineMsg, setCpInlineMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [cpSubmitting, setCpSubmitting] = useState(false)

  // D-07: fetch authenticated user email for Vigil Account section.
  // Silent on failure — no error banner; absence renders empty string.
  useEffect(() => {
    vigilFetch('/v1/me')
      .then((r) => {
        if (!r.ok) {
          setAccountLoading(false)
          return undefined
        }
        return r.json()
      })
      .then((data?: { userId: string; email: string }) => {
        if (data?.email) setAccountEmail(data.email)
        setAccountLoading(false)
      })
      .catch(() => {
        setAccountLoading(false)
      })
  }, [])

  // D-11 + Pitfall 4: read callback params ONCE on mount, then strip the URL.
  useEffect(() => {
    const connected = searchParams.get('google_connected')
    const err = searchParams.get('google_error')
    if (!connected && !err) return
    if (connected === 'true') {
      setBanner({ kind: 'success', text: 'Google account connected' })
      refetch()
    } else if (err) {
      // WR-03: look up the raw code in the allowlist; unknown codes get a generic message.
      // This prevents a crafted OAuth redirect from showing arbitrary text in the banner.
      const text = GOOGLE_ERROR_MESSAGES[err] ?? 'Connection failed. Please try again.'
      setBanner({ kind: 'error', text })
    }
    window.history.replaceState({}, '', window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // D-10: Load timezone from server; if server returns default + browser has a
  // more specific value, prefill browser's IANA zone. User must still click Save
  // to persist — we only seed the input.
  useEffect(() => {
    getTimezone()
      .then((tz) => {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (tz === 'America/New_York' && browserTz && browserTz !== tz) {
          setTimezoneState(browserTz)
        } else {
          setTimezoneState(tz)
        }
      })
      .catch(() => {
        /* keep default */
      })
      .finally(() => setTimezoneLoading(false))
  }, [])

  // D-12: banner auto-dismisses after 5s (no toast library dep).
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 5000)
    return () => clearTimeout(t)
  }, [banner])

  const dismissBanner = useCallback(() => setBanner(null), [])

  const handleConnect = useCallback(() => {
    // D-08: full-page redirect, NOT a popup (iOS standalone PWA).
    redirectToGoogleAuth()
  }, [])

  const handleStartConfirm = useCallback(() => setConfirming(true), [])
  const handleCancelConfirm = useCallback(() => setConfirming(false), [])

  const handleConfirmDisconnect = useCallback(async () => {
    setDisconnecting(true)
    try {
      await disconnectGoogle()
      setConfirming(false)
      refetch()
      setBanner({ kind: 'success', text: 'Google account disconnected' })
    } catch (e) {
      setBanner({ kind: 'error', text: `Disconnect failed: ${(e as Error).message}` })
    } finally {
      setDisconnecting(false)
    }
  }, [refetch])

  const onScheduleSaved = useCallback((msg: string) => setBanner({ kind: 'success', text: msg }), [])
  const onScheduleError = useCallback((msg: string) => setBanner({ kind: 'error', text: msg }), [])

  // Phase 110 (AUTH-09 D-17/D-18): submit change-password.
  // On 200: storeKey BEFORE any other fetch (D-17 critical ordering), show
  // success, clear inputs, collapse after 2s. On 401: inline "Current
  // password is incorrect" (D-18 case 1). On 400: surface server error
  // verbatim (D-18 case 2). Otherwise: generic message (D-18 case 3).
  const handleChangePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setCpSubmitting(true)
    setCpInlineMsg(null)
    try {
      const res = await vigilFetch('/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew }),
      })
      if (res.status === 200) {
        const body = (await res.json()) as { token: string; user: { id: number; email: string } }
        // CONTEXT D-17 references sessionStorage['vigil_token']; live code's
        // canonical key is 'vigil_jwt' via storeKey() (api/client.ts:1).
        // D-17 critical ordering: write new JWT to sessionStorage BEFORE any
        // other authenticated fetch fires. The setState calls below do not
        // fire network requests, so calling storeKey first preserves it.
        storeKey(body.token)
        setCpInlineMsg({ kind: 'success', text: 'Password changed' })
        setCpCurrent('')
        setCpNew('')
        // Collapse the form after 2s.
        setTimeout(() => {
          setCpExpanded(false)
          setCpInlineMsg(null)
        }, 2000)
        return
      }
      if (res.status === 401) {
        // D-18 case 1: 401 from /v1/auth/change-password specifically means
        // wrong current password (the endpoint is post-auth — caller is past
        // bearerAuth, so 401 here cannot mean token-invalid). The global 401
        // handler (client.ts vigilFetch) does NOT trigger because the
        // response body is 'Invalid credentials', NOT 'Session expired' —
        // body discriminator, not path discriminator.
        setCpInlineMsg({ kind: 'error', text: 'Current password is incorrect' })
        return
      }
      if (res.status === 400) {
        // D-18 case 2: surface server error verbatim — covers length
        // validation ("Password must be 12-128 characters") and same-as-current
        // ("New password must differ from current"). Both are user-actionable.
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setCpInlineMsg({ kind: 'error', text: body.error ?? 'Invalid request' })
        return
      }
      // D-18 case 3: 500 / network / anything else.
      setCpInlineMsg({ kind: 'error', text: 'Something went wrong. Try again.' })
    } catch {
      setCpInlineMsg({ kind: 'error', text: 'Something went wrong. Try again.' })
    } finally {
      setCpSubmitting(false)
    }
  }, [cpCurrent, cpNew])

  const handleCpCancel = useCallback(() => {
    setCpExpanded(false)
    setCpCurrent('')
    setCpNew('')
    setCpInlineMsg(null)
    setCpShowCurrent(false)
    setCpShowNew(false)
  }, [])

  const handleTimezoneSave = async () => {
    setTimezoneSaving(true)
    try {
      await setTimezone(timezone)
      setBanner({ kind: 'success', text: 'Timezone saved' })
    } catch (e) {
      setBanner({ kind: 'error', text: `Failed to save timezone: ${(e as Error).message}` })
    } finally {
      setTimezoneSaving(false)
    }
  }

  // State matrix (D-04, D-05)
  const isEmpty = !isLoading && !error && status === null
  const isConnected =
    status !== null && status.calendar === 'connected' && status.gmail === 'connected'
  const hasScopeGap =
    status !== null && (status.calendar === 'needs_auth' || status.gmail === 'needs_auth')

  const tzOptions: string[] =
    typeof (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf ===
    'function'
      ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
          'timeZone',
        )
      : [
          'America/New_York',
          'America/Chicago',
          'America/Denver',
          'America/Los_Angeles',
          'Europe/London',
          'Europe/Paris',
          'Asia/Tokyo',
          'Australia/Sydney',
          'UTC',
        ]

  return (
    <div className="p-4 max-w-2xl mx-auto text-gray-50">
      {banner && (
        <div
          role="alert"
          className={`mb-4 p-3 rounded flex items-start justify-between ${
            banner.kind === 'success'
              ? 'bg-teal-900/40 border border-teal-600/40 text-teal-50'
              : 'bg-red-900/40 border border-red-600/40 text-red-50'
          }`}
        >
          <span>{banner.text}</span>
          <button
            onClick={dismissBanner}
            aria-label="Dismiss"
            className="ml-3 text-sm opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      <h1 className="text-2xl font-medium mb-4">Settings</h1>

      {/* D-06: Vigil Account — first card in Settings content, shows
          authenticated user's email from GET /v1/me + Sign out button.
          Phase 110 (AUTH-09 D-15..D-18): inline expandable Change Password
          form. Mirrors Google card inline-confirm UX (lines 247-273 below). */}
      <section className="bg-gray-900 border border-gray-900/40 rounded-lg p-5 mb-4">
        <h2 className="text-lg font-medium">Vigil Account</h2>
        {accountLoading ? (
          <p className="text-gray-400 text-sm mt-2">Loading…</p>
        ) : (
          <p className="text-gray-400 text-sm mt-2">{accountEmail ?? ''}</p>
        )}

        {/* Phase 110 D-15: expandable change-password block, INSIDE the section. */}
        {!cpExpanded && (
          <button
            type="button"
            onClick={() => setCpExpanded(true)}
            className="mt-3 mr-3 text-sm text-teal-400 hover:text-teal-300"
          >
            Change password
          </button>
        )}

        <button
          type="button"
          onClick={() => { signOut(); navigate('/auth') }}
          className="mt-3 text-sm text-red-400 hover:text-red-300"
        >
          Sign out
        </button>

        {cpExpanded && (
          <form onSubmit={handleChangePasswordSubmit} className="mt-4 border-t border-gray-900/40 pt-4 space-y-3">
            {/* D-16: Current password field with show/hide toggle. */}
            <div>
              <label htmlFor="cp-current" className="block text-xs text-gray-400 mb-1">Current password</label>
              <div className="flex">
                <input
                  id="cp-current"
                  type={cpShowCurrent ? 'text' : 'password'}
                  value={cpCurrent}
                  onChange={(e) => setCpCurrent(e.target.value)}
                  autoComplete="current-password"
                  className="flex-1 px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded-l text-white placeholder-gray-400 focus:outline-none focus:border-teal-600"
                  disabled={cpSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setCpShowCurrent((v) => !v)}
                  aria-label={cpShowCurrent ? 'Hide password' : 'Show password'}
                  className="px-3 bg-gray-900/80 border border-l-0 border-gray-400/30 rounded-r text-gray-400 hover:text-gray-200"
                >
                  {cpShowCurrent ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* D-16: New password field with show/hide toggle.
                NOTE: NO confirm-password field per D-16 + REQUIREMENTS.md
                Out-of-Scope ("CXL data: 56% conversion hit"). */}
            <div>
              <label htmlFor="cp-new" className="block text-xs text-gray-400 mb-1">New password</label>
              <div className="flex">
                <input
                  id="cp-new"
                  type={cpShowNew ? 'text' : 'password'}
                  value={cpNew}
                  onChange={(e) => setCpNew(e.target.value)}
                  autoComplete="new-password"
                  className="flex-1 px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded-l text-white placeholder-gray-400 focus:outline-none focus:border-teal-600"
                  disabled={cpSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setCpShowNew((v) => !v)}
                  aria-label={cpShowNew ? 'Hide password' : 'Show password'}
                  className="px-3 bg-gray-900/80 border border-l-0 border-gray-400/30 rounded-r text-gray-400 hover:text-gray-200"
                >
                  {cpShowNew ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {cpInlineMsg && (
              <p className={`text-sm ${cpInlineMsg.kind === 'success' ? 'text-teal-400' : 'text-red-400'}`}>
                {cpInlineMsg.text}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={cpSubmitting || !cpCurrent || !cpNew}
                className="px-3 py-1 bg-teal-600 hover:bg-teal-500 rounded text-white text-sm disabled:opacity-50"
              >
                {cpSubmitting ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCpCancel}
                disabled={cpSubmitting}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="bg-gray-900 border border-gray-900/40 rounded-lg p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium">Google</h2>
            {isEmpty && <p className="text-gray-400 text-sm">Not connected</p>}
            {isConnected && (
              <p className="text-gray-400 text-sm">{status?.email ?? 'Google account'}</p>
            )}
            {hasScopeGap && (
              <p className="text-gray-400 text-sm">
                {status?.email ?? 'Google account'} — needs re-authorization
              </p>
            )}
          </div>
          {(isConnected || hasScopeGap) && !confirming && (
            <button
              onClick={handleStartConfirm}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Disconnect
            </button>
          )}
          {(isConnected || hasScopeGap) && confirming && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Confirm disconnect?</span>
              <button
                onClick={handleConfirmDisconnect}
                disabled={disconnecting}
                className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded disabled:opacity-50"
              >
                {disconnecting ? '…' : 'Confirm'}
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={disconnecting}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {isLoading && <p className="text-gray-400 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm">Error loading status: {error}</p>}

        {isEmpty && (
          <>
            <p className="text-xs text-gray-500 mb-3">Scopes: Calendar read, Gmail read</p>
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded text-white"
            >
              Connect Google
            </button>
          </>
        )}

        {status !== null && (
          <div className="mt-4 space-y-2 border-t border-gray-900/40 pt-4">
            <ScopeRow label="Calendar" state={status.calendar} onReconnect={handleConnect} />
            <ScopeRow label="Gmail" state={status.gmail} onReconnect={handleConnect} />
          </div>
        )}
      </section>

      <ScheduleCard
        title="Auto-generate"
        subtitle="Server generates your brief daily at this time"
        loadFn={getGenerateSchedule}
        saveFn={setGenerateSchedule}
        defaultSchedule={{ hour: 4, minute: 0, enabled: true }}
        onSaved={onScheduleSaved}
        onError={onScheduleError}
      />

      <ScheduleCard
        title="Auto-print"
        subtitle="Mac prints the latest brief at this time (macOS only)"
        loadFn={getPrintSchedule}
        saveFn={setPrintSchedule}
        defaultSchedule={{ hour: 6, minute: 0, enabled: true }}
        onSaved={onScheduleSaved}
        onError={onScheduleError}
      />

      <section className="bg-gray-900 border border-gray-900/40 rounded-lg p-5 mt-4">
        <h2 className="text-lg font-medium">Timezone</h2>
        <p className="text-xs text-gray-500 mb-4">
          IANA timezone used for scheduling (e.g. America/New_York)
        </p>
        {timezoneLoading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-300 w-24">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezoneState(e.target.value)}
                list="tz-list"
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 flex-1"
                placeholder="America/New_York"
              />
              <datalist id="tz-list">
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>
            <button
              onClick={handleTimezoneSave}
              disabled={timezoneSaving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded text-white text-sm disabled:opacity-50"
            >
              {timezoneSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function ScopeRow({
  label,
  state,
  onReconnect,
}: {
  label: string
  state: 'connected' | 'needs_auth'
  onReconnect: () => void
}) {
  const isOk = state === 'connected'
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          data-testid={`scope-dot-${label.toLowerCase()}`}
          className={`w-2 h-2 rounded-full ${isOk ? 'bg-teal-500' : 'bg-red-500'}`}
          aria-label={isOk ? `${label} connected` : `${label} needs re-authorization`}
        />
        <span className="text-sm">{label}</span>
        <span className="text-xs text-gray-500">
          {isOk ? 'connected' : 'needs re-authorization'}
        </span>
      </div>
      {!isOk && (
        <button
          onClick={onReconnect}
          className="text-xs text-teal-400 hover:text-teal-300"
        >
          Re-connect
        </button>
      )}
    </div>
  )
}
