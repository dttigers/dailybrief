import { useCallback, useEffect, useState } from 'react'
import { generateInsights as apiGenerateInsights, getInsightsCache, type Insight } from '../api/client'

export function useInsights(): {
  insights: Insight[]
  isLoading: boolean
  isCached: boolean
  generatedAt: string | null
  error: string | null
  generate: () => Promise<void>
  regenerate: () => Promise<void>
} {
  const [insights, setInsights] = useState<Insight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCached, setIsCached] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // D-07: On mount, check cache first. If no cache, auto-generate.
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getInsightsCache()
      .then((cached) => {
        if (cancelled) return
        if (cached) {
          setInsights(cached.insights)
          setIsCached(true)
          setGeneratedAt(cached.generatedAt)
          setIsLoading(false)
        } else {
          // No cache — auto-generate (same as current first-visit behavior)
          return apiGenerateInsights().then((res) => {
            if (cancelled) return
            setInsights(res.insights)
            setIsCached(false)
            setGeneratedAt(res.generatedAt)
          })
        }
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load insights')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const generate = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiGenerateInsights()
      setInsights(response.insights)
      setIsCached(false)
      setGeneratedAt(response.generatedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // D-05: On regenerate, clear results first so spinner shows
  const regenerate = useCallback(async () => {
    setInsights([])
    setIsCached(false)
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiGenerateInsights()
      setInsights(response.insights)
      setIsCached(false)
      setGeneratedAt(response.generatedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { insights, isLoading, isCached, generatedAt, error, generate, regenerate }
}
