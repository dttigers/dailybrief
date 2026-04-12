import { useCallback, useEffect, useState } from 'react'
import { getThoughts, type ThoughtApiResponse } from '../api/client'

export function useThoughts(category: string | null, searchQuery: string) {
  const [thoughts, setThoughts] = useState<ThoughtApiResponse[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchTick, setFetchTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    getThoughts({
      category: category ?? undefined,
      q: searchQuery || undefined,
      limit: 50,
    })
      .then((res) => {
        if (!cancelled) {
          setThoughts(res.data)
          setTotal(res.total)
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
  }, [category, searchQuery, fetchTick])

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

  const removeMany = useCallback((ids: Set<number>) => {
    setThoughts((prev) => prev.filter((t) => !ids.has(t.id)))
    setTotal((prev) => prev - ids.size)
  }, [])

  const updateMany = useCallback((ids: Set<number>, patch: Partial<ThoughtApiResponse>) => {
    setThoughts((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, ...patch } : t)))
  }, [])

  return { thoughts, total, isLoading, error, updateLocal, prependThought, refetch, removeMany, updateMany }
}
