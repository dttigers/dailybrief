import { useCallback, useState } from 'react'
import {
  getThoughts,
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
  therapyThoughtCount: number
  analyzePatterns: () => Promise<void>
  generatePrep: () => Promise<void>
} {
  const [patterns, setPatterns] = useState<TherapyPattern[]>([])
  const [prep, setPrep] = useState<TherapyPrep | null>(null)
  const [isLoadingPatterns, setIsLoadingPatterns] = useState(false)
  const [isLoadingPrep, setIsLoadingPrep] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [therapyThoughtCount, setTherapyThoughtCount] = useState(0)

  const analyzePatterns = useCallback(async () => {
    setIsLoadingPatterns(true)
    setError(null)

    try {
      const result = await getThoughts({ limit: 200, window: 'all' })
      const therapyThoughts = result.data.filter((t) => t.therapyClassification !== null)

      setTherapyThoughtCount(therapyThoughts.length)

      if (therapyThoughts.length < 5) {
        setError('Need at least 5 therapy-classified thoughts for pattern analysis')
        return
      }

      const mapped = therapyThoughts.map((t) => ({
        id: t.id,
        content: t.content,
        therapyClassification: t.therapyClassification!,
        createdAt: t.createdAt,
      }))

      const response = await apiGetTherapyPatterns(mapped)
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
      const result = await getThoughts({ limit: 200, window: 'all' })
      const bringToTherapistThoughts = result.data.filter(
        (t) => t.therapyClassification === 'bringToTherapist',
      )

      if (bringToTherapistThoughts.length === 0) {
        setError("No thoughts classified as 'bring to therapist' found")
        return
      }

      const mapped = bringToTherapistThoughts.map((t) => ({
        id: t.id,
        content: t.content,
        createdAt: t.createdAt,
      }))

      const patternSummaries =
        patterns.length > 0
          ? patterns.map((p) => ({
              theme: p.theme,
              trend: p.trend,
              confidence: p.confidence,
              description: p.description,
            }))
          : undefined

      const response = await apiGenerateTherapyPrep(mapped, patternSummaries)
      setPrep(response)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate therapy prep')
    } finally {
      setIsLoadingPrep(false)
    }
  }, [patterns])

  return {
    patterns,
    prep,
    isLoadingPatterns,
    isLoadingPrep,
    error,
    therapyThoughtCount,
    analyzePatterns,
    generatePrep,
  }
}
