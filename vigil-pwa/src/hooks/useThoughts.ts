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
    // D-04: Server-side excludeDone defaults to true.
    // Tasks tab overrides: 'done' uses taskStatus=done, 'all' uses excludeDone=false.
    const taskStatusParam = category === 'task'
      ? filters?.taskStatusFilter === 'done' ? 'done' : undefined
      : undefined
    const excludeDoneParam = category === 'task' && filters?.taskStatusFilter === 'all'
      ? false
      : undefined
    getThoughts({
      category: category ?? undefined,
      q: searchQuery || undefined,
      source: filters?.source,
      after: filters?.after,
      before: filters?.before,
      favoritesOnly: filters?.favoritesOnly,
      taskStatus: taskStatusParam,
      excludeDone: excludeDoneParam,
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

  // Auto-refresh with edit-aware pause gate (Phase 100 / EDIT-01, D-01 D-02 D-06 D-08)
  useEffect(() => {
    // D-02: Set of thought ids currently being edited; gate refresh on size > 0
    const activeEdits = new Set<number>()
    let pollId: ReturnType<typeof setInterval> | null = null

    const startPoll = () => {
      if (pollId !== null) return
      pollId = setInterval(() => {
        if (activeEdits.size === 0) refetch()
      }, 30_000)
    }
    const stopPoll = () => {
      if (pollId !== null) {
        clearInterval(pollId)
        pollId = null
      }
    }

    const handleVisibility = () => {
      // D-06: visibilitychange is ALSO gated on active edits
      if (document.visibilityState === 'visible' && activeEdits.size === 0) {
        refetch()
      }
    }
    const handleCreated = () => {
      // D-06: vigil:thought-created is ALSO gated on active edits
      if (activeEdits.size === 0) refetch()
    }
    const handleEditStarted = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail?.id
      if (typeof id !== 'number') return
      activeEdits.add(id)
      // D-09: clearInterval during pause; restart on resume so resumed interval
      // is a full 30s from the resume moment (not a leftover partial tick)
      stopPoll()
    }
    const handleEditEnded = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail?.id
      if (typeof id !== 'number') return
      const hadEntry = activeEdits.delete(id)
      // D-08: only the N→0 transition (last edit ending) triggers catch-up + restart.
      // Stray end without matching start (hadEntry=false) is a no-op.
      if (hadEntry && activeEdits.size === 0) {
        refetch()
        startPoll()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('vigil:thought-created', handleCreated)
    window.addEventListener('vigil:edit-started', handleEditStarted)
    window.addEventListener('vigil:edit-ended', handleEditEnded)
    startPoll()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('vigil:thought-created', handleCreated)
      window.removeEventListener('vigil:edit-started', handleEditStarted)
      window.removeEventListener('vigil:edit-ended', handleEditEnded)
      stopPoll()
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
