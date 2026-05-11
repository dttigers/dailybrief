import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { storeKey, API_BASE } from '../api/client'
import { resolveApiError } from '../lib/api-error-codes'
import TurnstileWidget from '../components/TurnstileWidget'

interface AuthPageProps {
  onAuthSuccess?: (userId: string, email: string) => void
}

const GENERIC_ERROR = 'Invalid email or password. Please try again.'

function readSessionExpiredFlag(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('reason') === 'session_expired'
}

// Phase 112 (AUTH-10 D-19) — mirror sessionExpired pattern verbatim. The reason
// string `password_reset` is a load-bearing exact-match contract with
// ResetPasswordPage's success-path navigate (UI-SPEC §Notes-3). Do NOT rename.
function readPasswordResetFlag(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('reason') === 'password_reset'
}

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState<boolean>(readSessionExpiredFlag)
  const [passwordReset, setPasswordReset] = useState<boolean>(readPasswordResetFlag)
  const navigate = useNavigate()

  function toggleMode() {
    setMode((m) => (m === 'login' ? 'signup' : 'login'))
    setError(null)
    setSessionExpired(false)
    setPasswordReset(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'login') {
        const res = await fetch(`${API_BASE}/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string; code?: string }
          const ux = resolveApiError(body, GENERIC_ERROR)
          setError(ux.message)
          return
        }
        // Phase 113 (AUTH-11 D-26) — login response now includes emailVerifiedAt
        // (ISO string or null). PWA does not store it here; SettingsPage refetches
        // via /v1/auth/me on mount. Type is widened so future consumers can read
        // the field without a TS regression. Backwards-compatible: existing
        // destructure { token, user: { id, email } } continues to work.
        const { token, user } = (await res.json()) as {
          token: string
          user: { id: number; email: string; emailVerifiedAt: string | null }
        }
        storeKey(token)
        onAuthSuccess?.(String(user.id), user.email)
        navigate('/')
      } else {
        // Signup: two-step (register does NOT return a JWT — verified in RESEARCH.md)
        const regRes = await fetch(`${API_BASE}/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password, turnstileToken }),
        })
        if (!regRes.ok) {
          const body = await regRes.json().catch(() => ({})) as { error?: string; code?: string }
          const ux = resolveApiError(body, GENERIC_ERROR)
          setError(ux.message)
          return
        }
        // Auto-login after successful registration (D-04)
        const loginRes = await fetch(`${API_BASE}/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        })
        if (!loginRes.ok) {
          const body = await loginRes.json().catch(() => ({})) as { error?: string; code?: string }
          const ux = resolveApiError(body, GENERIC_ERROR)
          setError(ux.message)
          return
        }
        // Phase 113 (AUTH-11 D-26) — same shape change for the post-register
        // auto-login. Newly-registered user always has emailVerifiedAt: null
        // here (the verify email is sent by Plan 02's register handler in
        // background; user must click the link to flip the column). Settings
        // banner will render on first /settings visit until verify completes.
        const { token, user } = (await loginRes.json()) as {
          token: string
          user: { id: number; email: string; emailVerifiedAt: string | null }
        }
        storeKey(token)
        onAuthSuccess?.(String(user.id), user.email)
        navigate('/')
      }
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setLoading(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
        <h1 className="text-2xl font-medium text-white mb-6">
          {isLogin ? 'Sign in to Vigil' : 'Create your account'}
        </h1>
        {sessionExpired && (
          <div
            role="status"
            className="mb-4 rounded border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-sm text-teal-200"
          >
            Your session expired. Please sign in again.
          </div>
        )}
        {/* Phase 112 (AUTH-10 D-19) — success banner after password reset. Same
            Tailwind classes as sessionExpired (UI-SPEC §1b mirrors verbatim). */}
        {passwordReset && (
          <div
            role="status"
            className="mb-4 rounded border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-sm text-teal-200"
          >
            Password reset successfully. Please sign in with your new password.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-gray-400 mb-2" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete={isLogin ? 'email' : 'email'}
            className="w-full px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded text-white placeholder-gray-400 focus:outline-none focus:border-teal-600"
            disabled={loading}
          />
          <label className="block text-sm text-gray-400 mb-2 mt-4" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            className="w-full px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded text-white placeholder-gray-400 focus:outline-none focus:border-teal-600"
            disabled={loading}
          />
          {/* AUTH-126-02 / D-01 — Turnstile captcha widget, signup mode only.
              Login mode does NOT render Turnstile (Open-Q-3 — login captcha deferred).
              Submit button is disabled until token is non-null. */}
          {!isLogin && (
            <TurnstileWidget onToken={setTurnstileToken} />
          )}
          {/* Phase 112 (AUTH-10 D-14) — Forgot password? link, login mode only.
              Hidden in signup mode (recovery is irrelevant for not-yet-existing
              accounts per UI-SPEC §Surface-1a visibility rules). */}
          {isLogin && (
            <div className="mt-2 flex justify-end">
              <Link
                to="/auth/forgot"
                className="text-sm text-teal-400 hover:text-teal-300"
              >
                Forgot password?
              </Link>
            </div>
          )}
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || (!isLogin && !turnstileToken)}
            className="w-full mt-4 py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50"
          >
            {isLogin
              ? (loading ? 'Signing in…' : 'Sign In')
              : (loading ? 'Creating account…' : 'Sign Up')}
          </button>
        </form>
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={toggleMode}
            className="text-sm text-gray-400 hover:text-gray-200"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
        {/* AUTH-126-06 — Legal footer links (Plan 08 shipped the pages themselves).
            Link from 'react-router' v7 (single-package namespace).
            The existing line-2 import covers Link; no new import needed. */}
        <div className="mt-4 text-center text-xs text-gray-500">
          <Link to="/legal/privacy" className="hover:text-gray-300">Privacy</Link>
          {' · '}
          <Link to="/legal/terms" className="hover:text-gray-300">Terms</Link>
        </div>
      </div>
    </div>
  )
}
