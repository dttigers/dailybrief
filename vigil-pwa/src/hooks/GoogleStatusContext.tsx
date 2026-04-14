import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getGoogleStatus, type GoogleStatus } from '../api/client'

interface GoogleStatusContextValue {
  status: GoogleStatus | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

const GoogleStatusContext = createContext<GoogleStatusContextValue | undefined>(undefined)

/**
 * Provider that fetches `/v1/google/status` once on mount and shares the
 * result with every descendant via {@link useGoogleStatus}. Mount this around
 * the authenticated Layout ONLY — the AuthPage branch must NOT fetch Google
 * status (no bearer token yet, and nothing renders the data).
 *
 * `status === null` means the API returned 404 (no token stored → disconnected).
 * `error !== null` means a 500/network failure happened — distinct from the
 * disconnected state so UI can show "couldn't reach server" vs "not connected".
 */
export function GoogleStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    getGoogleStatus()
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refetchCount])

  const refetch = useCallback(() => setRefetchCount((n) => n + 1), [])

  return (
    <GoogleStatusContext.Provider value={{ status, isLoading, error, refetch }}>
      {children}
    </GoogleStatusContext.Provider>
  )
}

/**
 * Access the shared Google OAuth status. Throws if used outside the
 * {@link GoogleStatusProvider} tree — this guards against the Layout gear icon
 * and SettingsPage silently no-opping when the provider is mis-placed.
 */
export function useGoogleStatus(): GoogleStatusContextValue {
  const ctx = useContext(GoogleStatusContext)
  if (!ctx) throw new Error('useGoogleStatus must be used within GoogleStatusProvider')
  return ctx
}
