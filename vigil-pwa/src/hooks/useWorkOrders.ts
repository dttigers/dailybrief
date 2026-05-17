import { useCallback, useEffect, useState } from 'react'
import { getWorkOrders, prioritizeWorkOrders, unarchiveWorkOrder, deleteArchivedWorkOrders, vigilFetch, type WorkOrderApiResponse } from '../api/client'

// Phase 129.1-05 (WO-MANUAL-01/02) — payload shape for manual-create + commit
// edits. Mirrors CreateWorkOrderModal's ManualCreateInput; copied here to keep
// the hook decoupled from any single modal component (commit edits use the
// same 11-field whitelist).
export interface ManualCreateInput {
  caseNumber: string
  store: string
  shortDescription: string
  trade: string
  location: string
  equipment: string
  priority: string
  contact: string
  notes: string
  maintenanceProblem: string
  department: string
}

export type WorkOrderFilter = 'active' | 'archived' | 'all'

export interface SortedWorkOrder extends WorkOrderApiResponse {
  priorityRank: number | null
}

export function useWorkOrders(filter: WorkOrderFilter = 'active') {
  const [workOrders, setWorkOrders] = useState<SortedWorkOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchTick, setFetchTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    getWorkOrders(filter)
      .then(async (res) => {
        if (cancelled) return

        const allOrders = res.data

        // Only run AI prioritization for active filter
        if (filter === 'active') {
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
        } else {
          // Archived or All — no prioritization, just assign null ranks
          const result: SortedWorkOrder[] = allOrders.map((wo) => ({
            ...wo,
            priorityRank: null,
          }))
          if (!cancelled) {
            setWorkOrders(result)
          }
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
  }, [filter, fetchTick])

  // Auto-refresh: visibility change and 30s polling
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setFetchTick((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    const poll = setInterval(() => setFetchTick((n) => n + 1), 30_000)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(poll)
    }
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

  const unarchive = useCallback(async (caseNumber: string) => {
    try {
      await unarchiveWorkOrder(caseNumber)
      setFetchTick((n) => n + 1)
    } catch (e) {
      console.error('Failed to unarchive work order:', e)
    }
  }, [])

  const deleteAllArchived = useCallback(async () => {
    try {
      await deleteArchivedWorkOrders()
      setFetchTick((n) => n + 1)
    } catch (e) {
      console.error('Failed to delete archived work orders:', e)
    }
  }, [])

  // Phase 129.1-05 / WO-MANUAL-01 — manual-create flow.
  // Generates clientCaptureId via crypto.randomUUID(); POSTs to existing
  // /v1/work-orders/sync (sanitizer extended in plan 129.1-01 to cover the
  // 12 fields). On success, bumps fetchTick to trigger a refetch.
  const createWorkOrder = useCallback(async (input: ManualCreateInput) => {
    const clientCaptureId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `cc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await vigilFetch('/v1/work-orders/sync', {
      method: 'POST',
      body: JSON.stringify({
        workOrders: [
          {
            ...input,
            state: 'open',
            clientCaptureId,
          },
        ],
      }),
    })
    if (!res.ok) {
      throw new Error(`Failed to create work order: ${res.status}`)
    }
    setFetchTick((n) => n + 1)
  }, [])

  // Phase 129.1-05 / WO-MANUAL-02 — review-modal Commit button.
  // Sends operator edits as Partial<ManualCreateInput> body to the new
  // POST /v1/work-orders/:caseNumber/commit route (server applies edits +
  // transitions state pending_review → open). On success, refetches.
  const commitDraft = useCallback(
    async (caseNumber: string, edits: Partial<ManualCreateInput>) => {
      const res = await vigilFetch(
        `/v1/work-orders/${encodeURIComponent(caseNumber)}/commit`,
        {
          method: 'POST',
          body: JSON.stringify(edits),
        },
      )
      if (!res.ok) {
        throw new Error(`Failed to commit work order: ${res.status}`)
      }
      setFetchTick((n) => n + 1)
    },
    [],
  )

  // Phase 129.1-05 / WO-MANUAL-02 — review-modal Discard button.
  // Hard-deletes the pending_review draft via DELETE /v1/work-orders/:caseNumber.
  const discardDraft = useCallback(async (caseNumber: string) => {
    const res = await vigilFetch(
      `/v1/work-orders/${encodeURIComponent(caseNumber)}`,
      {
        method: 'DELETE',
      },
    )
    if (!res.ok) {
      throw new Error(`Failed to discard work order: ${res.status}`)
    }
    setFetchTick((n) => n + 1)
  }, [])

  return {
    workOrders,
    isLoading,
    error,
    updateLocalStatus,
    unarchive,
    deleteAllArchived,
    createWorkOrder,
    commitDraft,
    discardDraft,
  }
}
