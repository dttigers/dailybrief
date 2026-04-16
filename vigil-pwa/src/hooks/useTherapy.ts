import { useCallback, useEffect, useState } from 'react'
import {
  getTherapyPatterns as apiGetTherapyPatterns,
  generateTherapyPrep as apiGenerateTherapyPrep,
  getTherapyPatternsCache,
  getTherapyPrepCache,
  type TherapyPattern,
  type TherapyPrep,
} from '../api/client'

export function useTherapy(): {
  patterns: TherapyPattern[]
  prep: TherapyPrep | null
  isLoadingPatterns: boolean
  isLoadingPrep: boolean
  isCachedPatterns: boolean
  isCachedPrep: boolean
  patternsGeneratedAt: string | null
  prepGeneratedAt: string | null
  error: string | null
  analyzePatterns: () => Promise<void>
  generatePrep: () => Promise<void>
  regeneratePatterns: () => Promise<void>
  regeneratePrep: () => Promise<void>
} {
  const [patterns, setPatterns] = useState<TherapyPattern[]>([])
  const [prep, setPrep] = useState<TherapyPrep | null>(null)
  const [isLoadingPatterns, setIsLoadingPatterns] = useState(false)
  const [isLoadingPrep, setIsLoadingPrep] = useState(false)
  const [isCachedPatterns, setIsCachedPatterns] = useState(false)
  const [isCachedPrep, setIsCachedPrep] = useState(false)
  const [patternsGeneratedAt, setPatternsGeneratedAt] = useState<string | null>(null)
  const [prepGeneratedAt, setPrepGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // D-07: On mount, check cache for both patterns and prep
  useEffect(() => {
    let cancelled = false

    // Check patterns cache
    setIsLoadingPatterns(true)
    getTherapyPatternsCache()
      .then((cached) => {
        if (cancelled) return
        if (cached) {
          setPatterns(cached.patterns)
          setIsCachedPatterns(true)
          setPatternsGeneratedAt(cached.generatedAt)
        }
        // If no cache, don't auto-generate patterns (user clicks Analyze Patterns)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoadingPatterns(false) })

    // Check prep cache
    setIsLoadingPrep(true)
    getTherapyPrepCache()
      .then((cached) => {
        if (cancelled) return
        if (cached) {
          const { cached: _, generatedAt, ...prepData } = cached
          setPrep(prepData)
          setIsCachedPrep(true)
          setPrepGeneratedAt(generatedAt)
        }
        // If no cache, don't auto-generate prep (user clicks Generate Prep)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoadingPrep(false) })

    return () => { cancelled = true }
  }, [])

  const analyzePatterns = useCallback(async () => {
    setIsLoadingPatterns(true)
    setError(null)
    try {
      const response = await apiGetTherapyPatterns()
      setPatterns(response.patterns)
      setIsCachedPatterns(false)
      setPatternsGeneratedAt(response.generatedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze therapy patterns')
    } finally {
      setIsLoadingPatterns(false)
    }
  }, [])

  const generatePrep = useCallback(async () => {
    setIsLoadingPrep(true)
    setError(null)
    try {
      const response = await apiGenerateTherapyPrep()
      const { cached: _, generatedAt, ...prepData } = response
      setPrep(prepData)
      setIsCachedPrep(false)
      setPrepGeneratedAt(generatedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate therapy prep')
    } finally {
      setIsLoadingPrep(false)
    }
  }, [])

  // D-05: Clear results on regenerate so spinner shows
  const regeneratePatterns = useCallback(async () => {
    setPatterns([])
    setIsCachedPatterns(false)
    setIsLoadingPatterns(true)
    setError(null)
    try {
      const response = await apiGetTherapyPatterns()
      setPatterns(response.patterns)
      setIsCachedPatterns(false)
      setPatternsGeneratedAt(response.generatedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze therapy patterns')
    } finally {
      setIsLoadingPatterns(false)
    }
  }, [])

  const regeneratePrep = useCallback(async () => {
    setPrep(null)
    setIsCachedPrep(false)
    setIsLoadingPrep(true)
    setError(null)
    try {
      const response = await apiGenerateTherapyPrep()
      const { cached: _, generatedAt, ...prepData } = response
      setPrep(prepData)
      setIsCachedPrep(false)
      setPrepGeneratedAt(generatedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate therapy prep')
    } finally {
      setIsLoadingPrep(false)
    }
  }, [])

  return {
    patterns,
    prep,
    isLoadingPatterns,
    isLoadingPrep,
    isCachedPatterns,
    isCachedPrep,
    patternsGeneratedAt,
    prepGeneratedAt,
    error,
    analyzePatterns,
    generatePrep,
    regeneratePatterns,
    regeneratePrep,
  }
}
