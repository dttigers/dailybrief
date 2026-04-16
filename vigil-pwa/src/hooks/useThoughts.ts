import { useCallback, useEffect, useState } from 'react'
import { getThoughts, type ThoughtApiResponse } from '../api/client'

export interface ThoughtFilters {
  source?: string
  after?: string
  before?: string
  favoritesOnly?: boolean
}

export function useThoughts(category: string | null, searchQuery: string, filters?: ThoughtFilters) {
  const [thoughts, setThoughts] = useState<ThoughtApiResponse[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchTick, setFetchTick] = useState(0)

  // Stringify filters to use as a stable dependency value
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    getThoughts({
      category: category ?? undefined,
      q: searchQuery || undefined,
      source: filters?.source,
      after: filters?.after,
      before: filters?.before,
      favoritesOnly: filters?.favoritesOnly,
      limit: 50,
    })
      .then((res) => {
        if (!cancelled) {
          // Hide done tasks in the task tab (open + inProgress only)
          const filtered = category === 'task'
            ? res.data.filter((t) => t.taskStatus !== 'done')
            : res.data
          setThoughts(filtered)
          setTotal(category === 'task' ? filtered.length : res.total)
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, searchQuery, fetchTick, filtersKey])

  const updateLocal = useCallback((id: number, patch: Partial<ThoughtApiResponse>) => {
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const prependThought = useCallback((thought: ThoughtApiResponse) => {
    setThoughts((prev) => [thought, ...prev])
    setTotal((prev) => prev + 1)
  }, [])

  const refetch = useCallback(() => {
    setFetchTick((n) => n + 1)
  }, [])

  // Auto-refresh when PWA returns to foreground
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refetch()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refetch])

  const removeMany = useCallback((ids: Set<number>) => {
    setThoughts((prev) => prev.filter((t) => !ids.has(t.id)))
    setTotal((prev) => prev - ids.size)
  }, [])

  const updateMany = useCallback((ids: Set<number>, patch: Partial<ThoughtApiResponse>) => {
    setThoughts((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, ...patch } : t)))
  }, [])

  return { thoughts, total, isLoading, error, updateLocal, prependThought, refetch, removeMany, updateMany }
}
