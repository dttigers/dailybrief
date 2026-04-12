import { useState } from 'react'
import { useNavigate } from 'react-router'
import { validateApiKey, storeKey } from '../api/client'

interface AuthPageProps {
  onAuthSuccess?: () => void
}

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      setError('Please enter your API key.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const valid = await validateApiKey(trimmedKey)
      if (valid) {
        storeKey(trimmedKey)
        onAuthSuccess?.()
        navigate('/')
      } else {
        setError('Invalid API key — please check and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="bg-slate-900 rounded-lg p-8 w-full max-w-md mx-4">
        <h1 className="text-2xl font-bold text-white mb-6">Sign in to Vigil</h1>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-400 mb-2" htmlFor="apiKey">
            Vigil API Key
          </label>
          <input
            id="apiKey"
            type="password"
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={loading}
          />
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
