import { useState, useMemo, useRef, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { API_BASE, classifyFetchError } from '../api/client'

/**
 * Phase 113 (AUTH-11) — Verify Email Page (UI-SPEC Component 1).
 *
 * Reads `?token=...` from the URL at mount via useSearchParams. FOUR
 * terminal visual states (UI-SPEC State Diagrams):
 *   1. MISSING_TOKEN — no ?token in URL  → render malformed-link UX
 *   2. IDLE          — token present     → "Verify your email" + Confirm button
 *   3. SUCCESS       — POST returned 200 → "Email verified" + "Go to app"
 *   4. ERROR         — 400/5xx/network   → single-bucket "This link is no longer valid"
 *
 * **CRITICAL — D-19 prefetch-safe gate:** This component does NOT call any
 * API on mount. The token is parsed from the URL but ONLY POSTed when the
 * user clicks Confirm. Apple Mail Privacy Protection (iOS 15.4+/macOS 12.3+)
 * silently fetches every link in an email through Apple's edge proxy with a
 * generic browser UA — a useEffect-fired POST would burn the token before
 * the human ever sees the email. Resend's link tracking is disabled at the
 * domain level (Phase 111 first defense layer); this Confirm gate is the
 * second.
 *
 * **Do NOT add a useEffect that triggers fetch.** A regression test
 * (AUTH-11-P-MOUNT-NO-FETCH) asserts global.fetch is NOT called on mount.
 * Acceptance grep: `grep -c useEffect vigil-pwa/src/pages/VerifyEmailPage.tsx`
 * must return 0.
 *
 * **D-21 single-bucket UX:** 400 (invalid/expired/used) AND 5xx AND network
 * errors all collapse to the same error UX. Deliberately hides which sub-
 * bucket fired — that's the security feature, not a bug.
 *
 * **Raw fetch() — not vigilFetch():** The /v1/auth/verify-email endpoint is
 * unauthenticated (bypass-listed in bearerAuth — Plan 02 Task 3). Using
 * vigilFetch could inject a stale bearer token AND trigger the 401-redirect
 * handler on unexpected errors. UI-SPEC §Notes-3 — load-bearing choice.
 * Acceptance grep: `grep -c "vigilFetch" vigil-pwa/src/pages/VerifyEmailPage.tsx`
 * must return 0.
 */
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token'), [searchParams])
  const navigate = useNavigate()

  // Phase 117 (AUTH-12 D-10/D-11): added 'rate_limited' state. The existing
  // 'error' state continues to handle 4xx-non-429, 5xx, and network failures
  // (D-21 single-bucket preserved). Only 429 routes into 'rate_limited'.
  type VerifyState = 'idle' | 'loading' | 'success' | 'error' | 'missing_token' | 'rate_limited'

  // Initialize directly from the URL — no useEffect transition. If token
  // is null/empty at mount, the terminal MISSING_TOKEN state renders
  // immediately with no further interaction possible.
  const [state, setState] = useState<VerifyState>(
    token && token.length > 0 ? 'idle' : 'missing_token',
  )

  // Phase 117 (AUTH-12 D-06): Retry-After countdown for rate_limited state.
  // Mirrors the Phase 116.1 SettingsPage per-league countdown pattern: state
  // holds seconds remaining (or null when no countdown active); ref holds
  // setInterval ID so we can clearInterval on tick-to-zero AND on unmount.
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)

  // Phase 117 (AUTH-12 D-06): clear countdown timer on unmount to avoid
  // setState-after-unmount warning. Mirrors SettingsPage WR-02 pattern.
  // NOTE: This useEffect ONLY returns a cleanup function — it never fires
  // a fetch. AUTH-11-P-MOUNT-NO-FETCH (Apple Mail prefetch defense) is
  // structurally preserved.
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }
  }, [])

  async function handleConfirm() {
    if (!token) return
    setState('loading')
    try {
      // Raw fetch (NOT vigilFetch) — UI-SPEC §Notes-3.
      const res = await fetch(`${API_BASE}/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        setState('success')
        return
      }
      // Phase 117 (AUTH-12 D-10/D-11): classify the error.
      // 429 → rate_limited bucket with countdown. Everything else (400/5xx/...)
      // collapses to the legacy 'error' state (D-21 single-bucket preserved).
      if (res.status === 429) {
        const errorClass = await classifyFetchError(res)
        if (errorClass.kind === 'rate-limited') {
          setState('rate_limited')
          // D-06: kick off countdown if retryAfter present. If undefined, the
          // rate_limited state still renders but without the mm:ss countdown
          // (the user can re-click Confirm immediately — server will 429 again
          // until the per-IP window passes; UX is graceful, not pathological).
          if (errorClass.retryAfter !== undefined) {
            const seconds = errorClass.retryAfter
            setRetryCountdown(seconds)
            // Clear any in-flight timer (defensive — should not happen since
            // handleConfirm is gated by 'idle' but we don't enforce).
            if (countdownTimerRef.current !== null) {
              window.clearInterval(countdownTimerRef.current)
            }
            const timerId = window.setInterval(() => {
              setRetryCountdown((cur) => {
                if (cur === null || cur <= 1) {
                  // Hit zero — clear timer + return to idle so user can retry.
                  if (countdownTimerRef.current !== null) {
                    window.clearInterval(countdownTimerRef.current)
                    countdownTimerRef.current = null
                  }
                  setState('idle')
                  return null
                }
                return cur - 1
              })
            }, 1000)
            countdownTimerRef.current = timerId
          }
          return
        }
        // 429 but classifier returned non-rate-limited (theoretically impossible
        // with Plan 02's classifier — defensive fallthrough): D-21 single-bucket.
      }
      // D-21 single-bucket: 400 / 5xx / non-429 all collapse here.
      setState('error')
    } catch {
      // Network error — same single-bucket as 4xx/5xx.
      setState('error')
    }
  }

  function handleRequestNewLink() {
    // UI-SPEC §Notes-5: runtime check at click time so it stays accurate
    // if the session expires between page mount and button click.
    const isLoggedIn = sessionStorage.getItem('vigil_jwt') !== null
    navigate(isLoggedIn ? '/settings' : '/auth')
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (state === 'missing_token') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
          <h1 className="text-2xl font-medium text-white mb-4">
            This verification link is malformed
          </h1>
          <p className="text-sm text-gray-300 mb-6">
            Please use the button in the email we sent you.
          </p>
          <Link
            to="/"
            className="block w-full py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium text-center focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            Back to app
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
          <h1 className="text-2xl font-medium text-white mb-4">Email verified</h1>
          <p className="text-sm text-gray-300 mb-6">You can close this tab, or</p>
          <Link
            to="/"
            className="text-sm text-teal-400 hover:text-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            Go to app
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'rate_limited') {
    // Phase 117 (AUTH-12 D-08): unified rate-limited copy across 3 PWA pages.
    // Substantive content "Too many attempts — try again in {Xm Ys}." is split
    // across heading + body for visual hierarchy per Claude's Discretion in
    // CONTEXT.md. Plans 04 and 05 must use the SAME heading+body split for
    // D-08/D-09 unification.
    const minutes = retryCountdown !== null ? Math.floor(retryCountdown / 60) : 0
    const seconds = retryCountdown !== null ? retryCountdown % 60 : 0
    const hasCountdown = retryCountdown !== null && retryCountdown > 0
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
          <h1 className="text-2xl font-medium text-white mb-4">
            Too many attempts
          </h1>
          <p className="text-sm text-gray-300 mb-6" aria-live="polite">
            {hasCountdown
              ? `Try again in ${minutes}m ${seconds}s.`
              : 'Try again later.'}
          </p>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={hasCountdown}
            aria-disabled={hasCountdown}
            className="w-full py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            Confirm
          </button>
          <div className="mt-4 text-center">
            <Link to="/" className="text-sm text-gray-400 hover:text-gray-200">
              Back to app
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
          <h1 className="text-2xl font-medium text-white mb-4">
            This link is no longer valid
          </h1>
          <p className="text-sm text-gray-300 mb-6">
            Verification links expire after 24 hours and can only be used once.
          </p>
          <button
            type="button"
            onClick={handleRequestNewLink}
            className="w-full py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            Request a new link
          </button>
          <div className="mt-4 text-center">
            <Link to="/" className="text-sm text-gray-400 hover:text-gray-200">
              Back to app
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 'idle' | 'loading' — Confirm button is the only interactive element.
  const loading = state === 'loading'
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
        <h1 className="text-2xl font-medium text-white mb-6">Verify your email</h1>
        <p className="text-sm text-gray-400 mb-4">
          Click the button below to confirm your email address.
        </p>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          aria-disabled={loading}
          className="w-full py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          {loading ? 'Confirming…' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}
