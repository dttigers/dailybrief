import { useCallback, useState } from 'react'
import {
  getTherapyPatterns as apiGetTherapyPatterns,
  generateTherapyPrep as apiGenerateTherapyPrep,
  type TherapyPattern,
  type TherapyPrep,
} from '../api/client'

export function useTherapy(): {
  patterns: TherapyPattern[]
  prep: TherapyPrep | null
  isLoadingPatterns: boolean
  isLoadingPrep: boolean
  error: string | null
  analyzePatterns: () => Promise<void>
  generatePrep: () => Promise<void>
} {
  const [patterns, setPatterns] = useState<TherapyPattern[]>([])
  const [prep, setPrep] = useState<TherapyPrep | null>(null)
  const [isLoadingPatterns, setIsLoadingPatterns] = useState(false)
  const [isLoadingPrep, setIsLoadingPrep] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyzePatterns = useCallback(async () => {
    setIsLoadingPatterns(true)
    setError(null)

    try {
      const response = await apiGetTherapyPatterns()
      setPatterns(response.patterns)
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
      setPrep(response)
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
    error,
    analyzePatterns,
    generatePrep,
  }
}
