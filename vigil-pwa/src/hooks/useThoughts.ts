import { useCallback, useEffect, useState } from 'react'
import { getThoughts, type ThoughtApiResponse } from '../api/client'
import type { TaskStatusFilter } from '../components/StatusFilterTabs'

export interface ThoughtFilters {
  source?: string
  after?: string
  before?: string
  favoritesOnly?: boolean
  taskStatusFilter?: TaskStatusFilter
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
          // Apply dynamic task status filter (replaces hardcoded done filter)
          const filtered = category === 'task'
            ? filters?.taskStatusFilter === 'done'
              ? res.data.filter((t) => t.taskStatus === 'done')
              : filters?.taskStatusFilter === 'all'
                ? res.data
                : res.data.filter((t) => t.taskStatus !== 'done') // 'open' or default: open + inProgress
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

  // Auto-refresh when PWA returns to foreground or a thought is created externally
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    const handleCreated = () => refetch()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('vigil:thought-created', handleCreated)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('vigil:thought-created', handleCreated)
    }
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
