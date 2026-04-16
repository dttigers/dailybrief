import { useCallback, useState } from 'react'
import { generateInsights as apiGenerateInsights, type Insight } from '../api/client'

export function useInsights(): {
  insights: Insight[]
  isLoading: boolean
  error: string | null
  generate: () => Promise<void>
} {
  const [insights, setInsights] = useState<Insight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await apiGenerateInsights()
      setInsights(response.insights)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { insights, isLoading, error, generate }
}
