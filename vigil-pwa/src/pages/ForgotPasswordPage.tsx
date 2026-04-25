import { useState } from 'react'
import { Link } from 'react-router'
import { API_BASE } from '../api/client'

/**
 * Phase 112 (AUTH-10) — Forgot Password Page (Surface 2 per UI-SPEC).
 *
 * Two-state component:
 *   1. submitted=false → renders the email-entry form
 *   2. submitted=true  → replaces form with the "Check your inbox" success block
 *
 * Calls POST /v1/auth/forgot-password with body { email } using bare fetch
 * (this route is unauthenticated — no Authorization header needed; vigilFetch
 * is reserved for authenticated routes per UI-SPEC §Surface-2).
 *
 * D-03 enumeration safety: the success state renders identically regardless of
 * whether the email exists in the DB. The PWA does NOT branch on response body
 * content — only on HTTP status.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      if (res.ok) {
        // D-03 enumeration safety — same success path regardless of body.
        setSubmitted(true)
      } else {
        // 429 rate limit OR 5xx server error fold into one user-visible
        // message; the server already collapses these to enum-safe shapes.
        setError('Something went wrong. Please try again in a moment.')
      }
    } catch {
      setError('Something went wrong. Please try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
          <h1 className="text-2xl font-medium text-white mb-6">Check your inbox</h1>
          <p className="text-sm text-gray-300 mb-6">
            If your account exists, a reset link has been sent. The link expires in 1 hour.
          </p>
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
        <h1 className="text-2xl font-medium text-white mb-6">Reset your password</h1>
        <p className="text-sm text-gray-400 mb-4">
          Enter your email address and we'll send you a link to reset your password.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-gray-400 mb-2" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded text-white placeholder-gray-400 focus:outline-none focus:border-teal-600"
            disabled={submitting}
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="w-full mt-4 py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send reset link'}
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
