import { useCallback, useEffect, useState } from 'react'
import { getWorkOrders, prioritizeWorkOrders, type WorkOrderApiResponse } from '../api/client'

export interface SortedWorkOrder extends WorkOrderApiResponse {
  priorityRank: number | null
}

export function useWorkOrders() {
  const [workOrders, setWorkOrders] = useState<SortedWorkOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchTick, setFetchTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    getWorkOrders()
      .then(async (res) => {
        if (cancelled) return

        const allOrders = res.data
        const nonDone = allOrders.filter((wo) => wo.status !== 'done')
        const done = allOrders.filter((wo) => wo.status === 'done')

        // Attempt AI prioritization; fall back gracefully on failure
        let prioritizedCaseNumbers: string[] = []
        try {
          const priorityRes = await prioritizeWorkOrders(nonDone)
          prioritizedCaseNumbers = priorityRes.prioritizedCaseNumbers
        } catch {
          // Fallback: display in original order — no priority ranks
        }

        // Sort non-done: prioritized first (in rank order), unprioritized after
        const priorityIndex = new Map(
          prioritizedCaseNumbers.map((cn, i) => [cn, i]),
        )

        const sortedNonDone = [...nonDone].sort((a, b) => {
          const ai = priorityIndex.has(a.caseNumber) ? priorityIndex.get(a.caseNumber)! : Infinity
          const bi = priorityIndex.has(b.caseNumber) ? priorityIndex.get(b.caseNumber)! : Infinity
          return ai - bi
        })

        // Assign 1-based ranks only for items that appear in the priority list
        const ranked: SortedWorkOrder[] = sortedNonDone.map((wo) => ({
          ...wo,
          priorityRank: priorityIndex.has(wo.caseNumber)
            ? priorityIndex.get(wo.caseNumber)! + 1
            : null,
        }))

        const doneRanked: SortedWorkOrder[] = done.map((wo) => ({
          ...wo,
          priorityRank: null,
        }))

        if (!cancelled) {
          setWorkOrders([...ranked, ...doneRanked])
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
  }, [fetchTick])

  // Auto-refresh when PWA returns to foreground
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setFetchTick((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const updateLocalStatus = useCallback((caseNumber: string, status: string) => {
    setWorkOrders((prev) => {
      const updated = prev.map((wo) =>
        wo.caseNumber === caseNumber ? { ...wo, status } : wo,
      )
      // Re-sort: done items sink to the bottom, non-done retain their rank order
      const nonDone = updated.filter((wo) => wo.status !== 'done')
      const done = updated.filter((wo) => wo.status === 'done')
      return [...nonDone, ...done]
    })
  }, [])

  return { workOrders, isLoading, error, updateLocalStatus }
}
