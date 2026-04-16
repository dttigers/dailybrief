import { useCallback, useState } from 'react'
import { generateInsights as apiGenerateInsights, getThoughts, type Insight } from '../api/client'

export function useInsights(): {
  insights: Insight[]
  isLoading: boolean
  error: string | null
  generate: (days?: number) => Promise<void>
} {
  const [insights, setInsights] = useState<Insight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (days = 7) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getThoughts({ limit: 200, window: 'all' })
      const thoughts = result.data.map((t) => ({
        id: t.id,
        content: t.content,
        category: t.category ?? 'uncategorized',
        createdAt: t.createdAt,
      }))

      if (thoughts.length < 3) {
        setError('Need at least 3 thoughts for insights')
        return
      }

      const response = await apiGenerateInsights(thoughts, days)
      setInsights(response.insights)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { insights, isLoading, error, generate }
}
