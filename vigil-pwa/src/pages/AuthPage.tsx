import { useState } from 'react'
import { useNavigate } from 'react-router'
import { storeKey } from '../api/client'

interface AuthPageProps {
  onAuthSuccess?: (userId: string, email: string) => void
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? (import.meta.env.DEV ? '' : 'https://api.vigilhub.io')

const GENERIC_ERROR = 'Invalid email or password. Please try again.'

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function toggleMode() {
    setMode((m) => (m === 'login' ? 'signup' : 'login'))
    setError(null)
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
          setError(GENERIC_ERROR)
          return
        }
        const { token, user } = (await res.json()) as { token: string; user: { id: number; email: string } }
        storeKey(token)
        onAuthSuccess?.(String(user.id), user.email)
        navigate('/')
      } else {
        // Signup: two-step (register does NOT return a JWT — verified in RESEARCH.md)
        const regRes = await fetch(`${API_BASE}/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        })
        if (!regRes.ok) {
          setError(GENERIC_ERROR)
          return
        }
        // Auto-login after successful registration (D-04)
        const loginRes = await fetch(`${API_BASE}/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        })
        if (!loginRes.ok) {
          setError(GENERIC_ERROR)
          return
        }
        const { token, user } = (await loginRes.json()) as { token: string; user: { id: number; email: string } }
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
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
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
      </div>
    </div>
  )
}
