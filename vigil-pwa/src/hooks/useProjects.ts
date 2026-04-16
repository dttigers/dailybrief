import { useCallback, useEffect, useState } from 'react'
import { getProjects, getThoughts, updateThought, type ProjectApiResponse, type ThoughtApiResponse } from '../api/client'

export function useProjects() {
  const [projects, setProjects] = useState<ProjectApiResponse[]>([])
  const [projectThoughts, setProjectThoughts] = useState<Record<number, ThoughtApiResponse[]>>({})
  const [unassignedThoughts, setUnassignedThoughts] = useState<ThoughtApiResponse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchTick, setFetchTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    async function fetchAll() {
      // Fetch projects first
      const projectList = await getProjects()
      if (cancelled) return

      // Fetch thoughts for all projects in parallel plus unassigned thoughts
      const [thoughtsByProject, unassigned] = await Promise.all([
        Promise.all(
          projectList.map((p) =>
            getThoughts({ projectId: p.id, limit: 200, window: 'all' }).then((res) => ({
              projectId: p.id,
              thoughts: res.data,
            })),
          ),
        ),
        getThoughts({ unassigned: true, limit: 200, window: 'all' }).then((res) => res.data),
      ])
      if (cancelled) return

      const thoughtsMap: Record<number, ThoughtApiResponse[]> = {}
      for (const entry of thoughtsByProject) {
        thoughtsMap[entry.projectId] = entry.thoughts
      }

      setProjects(projectList)
      setProjectThoughts(thoughtsMap)
      setUnassignedThoughts(unassigned)
    }

    fetchAll()
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

  const refetch = useCallback(() => {
    setFetchTick((n) => n + 1)
  }, [])

  const assignThought = useCallback(
    async (thoughtId: number, projectId: number) => {
      await updateThought(thoughtId, { projectId })
      refetch()
    },
    [refetch],
  )

  const unassignThought = useCallback(
    async (thoughtId: number) => {
      await updateThought(thoughtId, { projectId: null })
      refetch()
    },
    [refetch],
  )

  return {
    projects,
    projectThoughts,
    unassignedThoughts,
    isLoading,
    error,
    refetch,
    assignThought,
    unassignThought,
  }
}
