import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { API_BASE } from '../api/client'

/**
 * Phase 112 (AUTH-10) — Reset Password Page (Surface 3 per UI-SPEC).
 *
 * Reads `?token=...` from the URL at mount. Three visual states:
 *   1. Token missing at mount  → render invalid-token UX (D-20) immediately
 *   2. Token present, form     → user enters new password and submits
 *   3. Submit returns 400      → unmount form, render invalid-token UX (D-20)
 *
 * On 200 success: navigate('/auth?reason=password_reset') — the AuthPage's
 * banner reader matches this exact reason string (UI-SPEC §Notes-3 — load-
 * bearing). Do NOT change the string.
 *
 * **CRITICAL — D-18 / orchestrator constraint #7:** This component does NOT
 * call any API on mount. The token is parsed from the URL but only POSTed
 * when the user submits the form. This is defense-in-depth against email
 * pre-fetch (Apple Mail / Outlook) that would otherwise burn the token
 * before the user clicks. Phase 111 disabled link tracking at the Resend
 * domain level (first defense layer); this form-submit gate is the second.
 *
 * **D-20 single-bucket UX:** Invalid / expired / used / missing token all
 * render the same error UX. We deliberately hide which sub-bucket fired —
 * that's the security feature, not a bug.
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token'), [searchParams])
  const navigate = useNavigate()

  const [newPw, setNewPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tokenInvalid, setTokenInvalid] = useState<boolean>(!token)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) {
      // Defensive — if we got here, tokenInvalid is already true and the
      // form should not be visible. Belt-and-suspenders.
      setTokenInvalid(true)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: newPw }),
      })
      if (res.status === 200) {
        // Load-bearing string contract — AuthPage's readPasswordResetFlag()
        // tests for `?reason=password_reset` exactly. Do NOT rename.
        navigate('/auth?reason=password_reset')
        return
      }
      if (res.status === 400) {
        // D-20: invalid OR expired OR used → single-bucket UX. No inline
        // error here — the form unmounts and the error block takes over.
        setTokenInvalid(true)
        return
      }
      if (res.status === 429) {
        setError('Too many attempts. Please try again in a moment.')
        return
      }
      // 5xx and any other unexpected status fall here.
      setError('Something went wrong. Try again.')
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (tokenInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
          {/* D-20 verbatim — UI-SPEC §Surface-3 §State-2 */}
          <h1 className="text-2xl font-medium text-white mb-4">This link is no longer valid</h1>
          <p className="text-sm text-gray-300 mb-6">
            Reset links expire after 1 hour and can only be used once.
          </p>
          <button
            type="button"
            onClick={() => navigate('/auth/forgot')}
            className="w-full py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium"
          >
            Request a new link
          </button>
          <div className="mt-4 text-center">
            <Link to="/auth" className="text-sm text-gray-400 hover:text-gray-200">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
        <h1 className="text-2xl font-medium text-white mb-6">Set a new password</h1>
        <p className="text-sm text-gray-400 mb-4">
          Choose a new password for your Vigil account.
        </p>
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="rp-new" className="block text-sm text-gray-400 mb-2">
              New password
            </label>
            <div className="flex">
              <input
                id="rp-new"
                type={showPw ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                className="flex-1 px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded-l text-white placeholder-gray-400 focus:outline-none focus:border-teal-600"
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="px-3 bg-gray-900/80 border border-l-0 border-gray-400/30 rounded-r text-gray-400 hover:text-gray-200"
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting || newPw.length < 12}
            className="w-full mt-4 py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50"
          >
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link to="/auth" className="text-sm text-gray-400 hover:text-gray-200">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
