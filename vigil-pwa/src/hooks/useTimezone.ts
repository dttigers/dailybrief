import { useEffect, useState } from 'react'
import { vigilFetch } from '../api/client'

const DEFAULT_TZ = 'America/New_York'

/**
 * Fetches GET /settings/timezone once on mount. Returns { tz, isLoading, error }.
 * Defaults tz to 'America/New_York' (server default) during load or on error.
 *
 * D-15: Fetch-once semantics — no refetch on focus, mutation, or tz change.
 * Timezone change in Settings takes effect on next navigation/reload only.
 */
export function useTimezone(): { tz: string; isLoading: boolean; error: string | null } {
  const [tz, setTz] = useState<string>(DEFAULT_TZ)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    vigilFetch('/v1/settings/timezone')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch timezone: ${res.status}`)
        return res.json()
      })
      .then((data: { timezone: string }) => {
        if (!cancelled) setTz(data.timezone || DEFAULT_TZ)
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
  }, [])

  return { tz, isLoading, error }
}
