import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { useGoogleStatus } from '../hooks/useGoogleStatus'
import { disconnectGoogle, redirectToGoogleAuth } from '../api/client'

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
 * Google integration Settings page (Phase 81).
 *
 * Renders a single "Google" card covering four states:
 *   - EMPTY (status === null): Connect Google button + scope fine-print (D-05).
 *   - CONNECTED (both scopes connected): account row + inline Disconnect (D-04, D-06).
 *   - SCOPE GAP (one scope needs_auth): per-row Re-connect on failing scope (D-04, D-09).
 *   - LOADING / ERROR: lightweight inline state.
 *
 * Also handles the OAuth callback query params (`?google_connected=true` /
 * `?google_error=...`) exactly once on mount — surfaces a banner and strips the
 * query string via `history.replaceState` so a reload does not replay the toast
 * (D-11, Pitfall 4).
 *
 * Security: `google_error` is rendered as React text (auto-escaped) — no
 * `dangerouslySetInnerHTML` and no `window.confirm()` anywhere (T-81-15).
 */
export default function SettingsPage() {
  const { status, isLoading, error, refetch } = useGoogleStatus()
  const [searchParams] = useSearchParams()
  const [banner, setBanner] = useState<Banner>(null)
  const [confirming, setConfirming] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

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

  // State matrix (D-04, D-05)
  const isEmpty = !isLoading && !error && status === null
  const isConnected =
    status !== null && status.calendar === 'connected' && status.gmail === 'connected'
  const hasScopeGap =
    status !== null && (status.calendar === 'needs_auth' || status.gmail === 'needs_auth')

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
